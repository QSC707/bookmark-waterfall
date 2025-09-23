// ==================================================================
// --- 全局状态变量 ---
// ==================================================================

let isHoverEnabled = true; // 是否启用悬停打开文件夹功能
let isDragging = false; // 是否正在拖拽项目
let suppressHover = false; // 临时禁止悬停事件
let draggedItem = null; // 当前被拖拽的元素
let dragOverTimeout = null; // 拖拽悬停计时器
let previewWindowId = null; // 预览窗口的ID
let currentlyHoveredItem = null; // 当前鼠标悬停的元素
let selectedItems = new Set(); // 选中的项目ID集合
let lastClickedId = null; // 最后一次点击的项目ID（用于Shift多选）


// ==================================================================
// --- 核心功能函数 ---
// ==================================================================

// --- 辅助工具函数 ---

/**
 * 函数防抖
 * @param {Function} func - 需要防抖的函数
 * @param {number} wait - 延迟时间 (ms)
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 显示一个短暂的消息提示 (Toast)
 * @param {string} message - 要显示的消息
 * @param {number} [duration=2000] - 显示时长 (ms)
 */
function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = 'toast show';
        setTimeout(() => {
            toast.className = 'toast';
        }, duration);
    }
}

/**
 * 净化文本，防止XSS攻击
 * @param {string} text - 需要净化的文本
 * @returns {string} 净化后的HTML字符串
 */
function sanitizeText(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 获取网站图标 (favicon) 的URL
 * @param {string} url - 网站的URL
 * @returns {string} 图标的URL
 */
function getIconUrl(url) {
    return `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
}

/**
 * 验证字符串是否为有效的URL
 * @param {string} string - 需要验证的字符串
 * @returns {boolean} 是否有效
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}


// --- 多选相关函数 ---

/**
 * 清除所有选中项
 */
function clearSelection() {
    selectedItems.clear();
    document.querySelectorAll('.bookmark-item.selected').forEach(el => el.classList.remove('selected'));
    lastClickedId = null;
}

/**
 * 切换单个项目的选中状态
 * @param {HTMLElement} item - 书签项目元素
 */
function toggleSelection(item) {
    const id = item.dataset.id;
    if (selectedItems.has(id)) {
        selectedItems.delete(id);
        item.classList.remove('selected');
    } else {
        selectedItems.add(id);
        item.classList.add('selected');
    }
    lastClickedId = id;
}

/**
 * 按住Shift键进行范围选择
 * @param {string} startId - 起始项目ID
 * @param {string} endId - 结束项目ID
 * @param {HTMLElement} column - 所在的列元素
 */
function selectRange(startId, endId, column) {
    const items = Array.from(column.querySelectorAll('.bookmark-item'));
    const startIndex = items.findIndex(i => i.dataset.id === startId);
    const endIndex = items.findIndex(i => i.dataset.id === endId);
    if (startIndex === -1 || endIndex === -1) return;

    const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
    for (let i = min; i <= max; i++) {
        const item = items[i];
        if (!selectedItems.has(item.dataset.id)) {
            selectedItems.add(item.dataset.id);
            item.classList.add('selected');
        }
    }
}


// --- 书签渲染与刷新 ---

/**
 * 主函数：获取并显示所有书签
 * @param {chrome.bookmarks.BookmarkTreeNode[]} bookmarks - 书签树节点数组
 */
function displayBookmarks(bookmarks) {
    const bookmarkContainer = document.getElementById('bookmarkContainer');
    const header = document.querySelector('.page-header');
    bookmarkContainer.innerHTML = '';

    // 移除旧的书签栏
    const oldTopBar = header.querySelector('.bookmark-column[data-level="0"]');
    if (oldTopBar) oldTopBar.remove();

    // 渲染书签栏
    const bookmarksBar = bookmarks[0] && bookmarks[0].children[0];
    if (bookmarksBar) {
        renderBookmarks(bookmarksBar.children, header, 0);
    }
}

/**
 * 渲染一列书签
 * @param {chrome.bookmarks.BookmarkTreeNode[]} bookmarks - 要渲染的书签数组
 * @param {HTMLElement} parentElement - 父级容器元素
 * @param {number} level - 当前列的层级
 */
function renderBookmarks(bookmarks, parentElement, level) {
    let column;
    if (level === 0) {
        // 第0级（书签栏）直接添加到header
        const header = document.querySelector('.page-header');
        column = document.createElement('div');
        column.className = 'bookmark-column';
        column.dataset.level = level;
        header.appendChild(column);
    } else {
        // 其他层级添加到主容器
        const container = document.getElementById('bookmarkContainer');
        // 移除所有当前或更深层级的列
        const nextColumns = container.querySelectorAll(`.bookmark-column`);
        nextColumns.forEach(col => {
            if (parseInt(col.dataset.level) >= level) col.remove();
        });
        column = document.createElement('div');
        column.className = 'bookmark-column';
        column.dataset.level = level;
        container.appendChild(column);
    }

    // 添加拖拽事件监听
    column.addEventListener('dragover', handleColumnDragOver);
    column.addEventListener('dragleave', handleColumnDragLeave);
    column.addEventListener('drop', handleColumnDrop);

    // 使用 DocumentFragment 提高性能
    const fragment = document.createDocumentFragment();
    bookmarks.forEach((bookmark, index) => {
        const item = createBookmarkItem(bookmark, index);
        fragment.appendChild(item);
    });

    // 如果文件夹为空，显示提示信息
    if (bookmarks.length === 0 && level > 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-folder-message';
        emptyMsg.textContent = '这个文件夹是空的';
        column.appendChild(emptyMsg);
    }

    column.appendChild(fragment);
}

/**
 * 创建单个书签或文件夹的DOM元素
 * @param {chrome.bookmarks.BookmarkTreeNode} bookmark - 书签节点对象
 * @param {number} index - 在当前列表中的索引
 * @returns {HTMLElement} 创建好的元素
 */
function createBookmarkItem(bookmark, index) {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.dataset.id = bookmark.id;
    item.dataset.url = bookmark.url || '';
    item.dataset.index = index;
    item.dataset.parentId = bookmark.parentId;
    item.draggable = true;

    const icon = document.createElement('img');
    icon.className = 'bookmark-icon';
    const isFolder = !bookmark.url;
    icon.src = isFolder ? '/img/folder_icon.svg' : getIconUrl(bookmark.url);
    icon.onerror = () => icon.src = '/img/folder_icon.svg'; // 图标加载失败时使用文件夹图标

    const title = document.createElement('span');
    title.textContent = sanitizeText(bookmark.title || 'No Title');
    title.className = 'bookmark-title';

    item.appendChild(icon);
    item.appendChild(title);

    if (isFolder) {
        item.classList.add('is-folder');
    }

    // --- 事件监听 ---
    item.addEventListener('mouseenter', () => currentlyHoveredItem = item);
    item.addEventListener('mouseleave', () => currentlyHoveredItem = null);

    // 鼠标按下：处理多选逻辑
    item.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // 只响应左键

        if (e.metaKey || e.ctrlKey) { // Cmd/Ctrl键多选
            e.preventDefault();
            toggleSelection(item);
        } else if (e.shiftKey) { // Shift键范围选择
            e.preventDefault();
            if (lastClickedId) {
                selectRange(lastClickedId, item.dataset.id, item.parentElement);
            } else {
                clearSelection();
                toggleSelection(item);
            }
        } else {
            // 普通单击，如果未选中则先清空其他再选中当前
            if (!selectedItems.has(item.dataset.id)) {
                clearSelection();
                toggleSelection(item);
            }
        }
    });


    // 这是最终的、正确的 click 事件监听器，请用它替换
    item.addEventListener('click', (e) => {
        // 仅在没有修饰键且选中项不多于1个时执行默认单击行为
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && selectedItems.size <= 1) {
            if (!isFolder) {
                // --- 这是针对书签链接的最终逻辑 ---

                // 1. 清除任何之前的选中项
                clearSelection();

                // 2. 选中当前点击的项，使其获得虚线高亮
                toggleSelection(item);

                // 3. 在新标签页打开链接
                window.open(bookmark.url, '_blank');

            } else {
                // 点击文件夹时，行为不变
                handleFolderClick(item, bookmark.id);
            }
        } else if (isFolder && selectedItems.size > 1) {
            // 多选时点击文件夹的行为，也不变
            e.preventDefault();
            clearSelection();
            toggleSelection(item);
            handleFolderClick(item, bookmark.id);
        }
    });

    /**
     * 处理文件夹点击事件（打开/关闭）
     * @param {HTMLElement} folderItem - 被点击的文件夹元素
     * @param {string} bookmarkId - 书签ID
     */


    // 文件夹悬停打开逻辑
    if (isFolder) {
        let hoverTimeout;
        item.addEventListener('mouseenter', () => {
            if (!isHoverEnabled || isDragging || suppressHover || document.body.dataset.contextMenuOpen) return;
            clearTimeout(hoverTimeout);
            hoverTimeout = setTimeout(() => {
                // 拖拽或多选时，不触发悬停打开
                if (isDragging || selectedItems.size > 1) return;
                const currentHighlighted = item.parentElement.querySelector('.bookmark-item.highlighted');
                // 如果悬停的不是当前已打开的文件夹，则打开它
                if (item !== currentHighlighted) {
                    handleFolderClick(item, bookmark.id);
                }
            }, 500); // 悬停500ms后触发
        });
        item.addEventListener('mouseleave', () => clearTimeout(hoverTimeout));
    }

    // 拖拽事件
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragleave', handleDragLeave);

    return item;
}

function handleFolderClick(folderItem, bookmarkId) {
    clearSelection();
    const isHighlighted = folderItem.classList.contains('highlighted');
    // ...
    const level = parseInt(folderItem.closest('.bookmark-column').dataset.level, 10);

    // 移除同级其他文件夹的高亮
    folderItem.parentElement.querySelectorAll('.bookmark-item.highlighted').forEach(i => i.classList.remove('highlighted'));

    if (!isHighlighted) {
        // 打开文件夹
        folderItem.classList.add('highlighted');
        chrome.bookmarks.getChildren(bookmarkId, (freshChildren) => {
            renderBookmarks(freshChildren, document.getElementById('bookmarkContainer'), level + 1);
        });
    } else {
        // 关闭文件夹（移除后续所有列）
        const container = document.getElementById('bookmarkContainer');
        const nextColumns = container.querySelectorAll(`.bookmark-column`);
        nextColumns.forEach(col => {
            if (parseInt(col.dataset.level) > level) col.remove();
        });
    }
}


// --- 拖拽逻辑 ---

/**
 * 开始拖拽
 * @param {DragEvent} e
 */
function handleDragStart(e) {
    isDragging = true;
    draggedItem = e.target.closest('.bookmark-item');

    // 如果拖拽的不是已选中的项目，则清空选择并选中当前项
    if (!selectedItems.has(draggedItem.dataset.id)) {
        clearSelection();
        toggleSelection(draggedItem);
    }

    const idsToDrag = Array.from(selectedItems);
    e.dataTransfer.setData('application/json', JSON.stringify(idsToDrag));
    e.dataTransfer.effectAllowed = 'move';

    // 使用 queueMicrotask 确保在下一帧应用拖拽样式
    queueMicrotask(() => {
        idsToDrag.forEach(id => {
            const el = document.querySelector(`.bookmark-item[data-id="${id}"]`);
            if (el) el.classList.add('dragging');
        });
    });

    e.stopPropagation();
}

/**
 * 拖拽结束
 * @param {DragEvent} e
 */
function handleDragEnd(e) {
    isDragging = false;
    clearTimeout(dragOverTimeout);
    // 清空所有选中状态，恢复悬停功能
    clearSelection();
    // 清理所有拖拽相关的样式
    document.querySelectorAll('.bookmark-item.dragging').forEach(el => el.classList.remove('dragging'));
    draggedItem = null;
    document.querySelectorAll('.bookmark-item, .bookmark-column').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter', 'column-drag-over');
    });
}


/**
 * 在项目上拖拽悬停
 * @param {DragEvent} e
 */
// 这是修复后的新代码，请用它替换上面的旧代码
function handleDragOver(e) {
    e.preventDefault();
    const targetItem = e.target.closest('.bookmark-item');
    if (!targetItem) return;

    // 错误修复：不再使用 JSON.parse。直接检查全局的 selectedItems 集合。
    // 这可以防止 "Unexpected end of JSON input" 错误，并让函数继续执行。
    if (selectedItems.has(targetItem.dataset.id)) {
        return;
    }

    // 清理同级其他项目的悬停样式
    targetItem.parentElement.querySelectorAll('.bookmark-item').forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
    });

    const rect = targetItem.getBoundingClientRect();
    const level = targetItem.closest('.bookmark-column').dataset.level;
    const isFolder = targetItem.classList.contains('is-folder');

    if (level == '0') {
        if (e.clientX < rect.left + rect.width / 2) {
            targetItem.classList.add('drag-over-before');
        } else {
            targetItem.classList.add('drag-over-after');
        }
    } else {
        const y = e.clientY - rect.top;
        if (isFolder) {
            if (y < rect.height * 0.25) {
                targetItem.classList.add('drag-over-top');
            } else if (y > rect.height * 0.75) {
                targetItem.classList.add('drag-over-bottom');
            } else {
                // 只保留添加“进入文件夹”高亮效果，移除自动打开功能
                targetItem.classList.add('drag-enter');
            }
        } else {
            if (y < rect.height / 2) {
                targetItem.classList.add('drag-over-top');
            } else {
                targetItem.classList.add('drag-over-bottom');
            }
        }
    }
}

/**
 * 拖拽离开项目
 * @param {DragEvent} e
 */
function handleDragLeave(e) {
    clearTimeout(dragOverTimeout);
    const targetItem = e.target.closest('.bookmark-item');
    if (targetItem) {
        targetItem.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
    }
}


/**
 * 在项目上释放
 * @param {DragEvent} e
 */
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(dragOverTimeout);

    const idsToMove = JSON.parse(e.dataTransfer.getData('application/json'));
    if (!idsToMove || idsToMove.length === 0) return;

    const dropTarget = e.target.closest('.bookmark-item');
    if (!dropTarget || idsToMove.includes(dropTarget.dataset.id)) return;

    let destination = {};
    const classes = dropTarget.classList;

    if (classes.contains('drag-enter')) { // 放入文件夹
        destination.parentId = dropTarget.dataset.id;
        destination.index = 0; // 放到最前面
    } else { // 移动到项目前后
        destination.parentId = dropTarget.dataset.parentId;
        let newIndex = parseInt(dropTarget.dataset.index, 10);
        if (classes.contains('drag-over-after') || classes.contains('drag-over-bottom')) {
            newIndex++;
        }
        destination.index = newIndex;
    }

    idsToMove.forEach(id => {
        chrome.bookmarks.move(id, destination);
    });
    showToast(`移动了 ${idsToMove.length} 个项目`);
}


/**
 * 在列空白处拖拽悬停
 * @param {DragEvent} e
 */
function handleColumnDragOver(e) {
    e.preventDefault();
    if (e.target.classList.contains('bookmark-column')) {
        e.target.classList.add('column-drag-over');
    }
}

/**
 * 拖拽离开列空白处
 * @param {DragEvent} e
 */
function handleColumnDragLeave(e) {
    if (e.target.classList.contains('bookmark-column')) {
        e.target.classList.remove('column-drag-over');
    }
}

/**
 * 在列空白处释放
 * @param {DragEvent} e
 */
function handleColumnDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const idsToMove = JSON.parse(e.dataTransfer.getData('application/json'));
    if (!idsToMove || idsToMove.length === 0) return;

    const column = e.target.closest('.bookmark-column');
    column.classList.remove('column-drag-over');

    let parentId = null;
    const level = parseInt(column.dataset.level, 10);

    if (level === 0) { // 书签栏
        parentId = '1';
    } else { // 其他列，父ID是前一列高亮的项目
        const prevColumn = document.querySelector(`.bookmark-column[data-level="${level - 1}"]`);
        if (prevColumn) {
            parentId = prevColumn.querySelector('.bookmark-item.highlighted')?.dataset.id;
        }
    }

    if (parentId) {
        idsToMove.forEach(id => {
            if (id) chrome.bookmarks.move(id, { parentId: parentId, index: 0 }); // 移动到文件夹顶部
        });
        showToast(`移动了 ${idsToMove.length} 个项目`);
    }
}


// --- 右键菜单 ---

/**
 * 显示自定义右键菜单
 * @param {MouseEvent} e - 事件对象
 * @param {HTMLElement} bookmarkElement - 右键点击的书签元素
 * @param {HTMLElement} column - 右键点击的列元素
 */

/************************************************************/
/* --- 新增：隐藏右键菜单的函数 --- */
/************************************************************/
function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu.style.display === 'block') {
        contextMenu.style.display = 'none';
        delete document.body.dataset.contextMenuOpen;
    }
}

function showContextMenu(e, bookmarkElement, column) {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.innerHTML = '';
    const ul = document.createElement('ul');
    let menuHtml = '';

    const rightClickedId = bookmarkElement?.dataset.id;
    if (rightClickedId && !selectedItems.has(rightClickedId)) {
        // 如果右键点击了未选中的项目，则清空选择并选中该项
        clearSelection();
        toggleSelection(bookmarkElement);
    } else if (!rightClickedId) {
        // 如果右键点击了空白处，清空所有选择
        clearSelection();
    }

    const selectionSize = selectedItems.size;
    const hasBookmarkInSelection = Array.from(selectedItems).some(id => !document.querySelector(`.bookmark-item[data-id="${id}"]`)?.classList.contains('is-folder'));

    // --- 根据选中项生成菜单 ---
    if (selectionSize > 0) {
        if (selectionSize > 1) { // 多选菜单
            if (hasBookmarkInSelection) {
                menuHtml += `<li id="open"><img src="/img/open_all.svg" class="menu-icon">打开全部 (${selectionSize})</li>`;
                menuHtml += `<li id="openNew"><img src="/img/open_new.svg" class="menu-icon">新窗口打开全部 (${selectionSize})</li>`;
                menuHtml += `<li id="openIncognito"><img src="/img/open_new.svg" class="menu-icon">隐身模式打开全部 (${selectionSize})</li>`;
                menuHtml += `<hr>`;
            }
        } else { // 单选菜单
            const isFolder = bookmarkElement.classList.contains('is-folder');
            if (isFolder) {
                menuHtml += `<li id="openAll"><img src="/img/open_all.svg" class="menu-icon">打开文件夹内所有书签</li><hr>`;
            } else {
                menuHtml += `<li id="open"><img src="/img/open.svg" class="menu-icon">新标签打开</li>`;
                menuHtml += `<li id="openNew"><img src="/img/open_new.svg" class="menu-icon">新窗口打开</li>`;
                menuHtml += `<li id="openIncognito"><img src="/img/open_new.svg" class="menu-icon">在隐身模式中打开</li>`;
                menuHtml += `<hr>`;
            }
        }

        if (selectionSize === 1 && !bookmarkElement.classList.contains('is-folder')) {
            menuHtml += `<li id="editUrl"><img src="/img/edit.svg" class="menu-icon">修改网址</li>`;
        }
        if (selectionSize === 1) {
            menuHtml += `<li id="rename"><img src="/img/rename.svg" class="menu-icon">重命名</li>`;
        }
        menuHtml += `<li id="move"><img src="/img/move.svg" class="menu-icon">移动${selectionSize > 1 ? ` (${selectionSize})` : ''}到...</li>`;
        if (selectionSize === 1 && !bookmarkElement.classList.contains('is-folder')) {
            menuHtml += `<li id="copyUrl"><img src="/img/copy.svg" class="menu-icon">复制网址</li>`;
        }
        menuHtml += `<hr>`;
        menuHtml += `<li id="delete"><img src="/img/delete.svg" class="menu-icon">删除${selectionSize > 1 ? ` (${selectionSize})` : ''}</li>`;
    }

    // --- 在列上右键的菜单 ---
    if (column) {
        if (menuHtml !== '') menuHtml += `<hr>`;
        menuHtml += `<li id="newFolder"><img src="/img/folder.svg" class="menu-icon">新建文件夹</li><hr>`;
        menuHtml += `<li id="sortAlphaAsc"><img src="/img/sort_asc.svg" class="menu-icon">排序：由 A 到 Z</li>`;
        menuHtml += `<li id="sortAlphaDesc"><img src="/img/sort_desc.svg" class="menu-icon">排序：由 Z 到 A</li>`;
        menuHtml += `<li id="sortDateNew"><img src="/img/sort_asc.svg" class="menu-icon">排序：从新到旧</li>`;
        menuHtml += `<li id="sortDateOld"><img src="/img/sort_desc.svg" class="menu-icon">排序：从旧到新</li>`;
        menuHtml += `<li id="sortVisit"><img src="/img/sort_asc.svg" class="menu-icon">排序：按上次打开</li>`;
    }

    ul.innerHTML = menuHtml;
    contextMenu.appendChild(ul);
    contextMenu.style.display = 'block';

    // --- 定位菜单，防止超出屏幕 ---
    const { innerWidth: winWidth, innerHeight: winHeight } = window;
    const { offsetWidth: menuWidth, offsetHeight: menuHeight } = contextMenu;
    let left = e.clientX,
        top = e.clientY;
    if (left + menuWidth > winWidth) left = winWidth - menuWidth - 5;
    if (top + menuHeight > winHeight) top = winHeight - menuHeight - 5;
    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;

    // 存储关联的元素，供后续操作使用
    contextMenu.relatedTarget = bookmarkElement;
    contextMenu.relatedColumn = column;
    document.body.dataset.contextMenuOpen = 'true';
}


/**
 * 处理右键菜单的点击动作
 * @param {string} action - 动作ID
 * @param {HTMLElement} element - 关联的书签元素
 */
function handleContextMenuAction(action, element) {
    const selectionSize = selectedItems.size;
    const selectedIds = Array.from(selectedItems);

    // --- 排序逻辑 ---
    if (action.startsWith('sort')) {
        const column = document.getElementById('contextMenu').relatedColumn;
        if (!column) return;
        let parentId;
        if (element && element.classList.contains('is-folder')) {
            parentId = element.dataset.id;
        } else if (element) {
            parentId = element.dataset.parentId;
        } else {
            const level = parseInt(column.dataset.level, 10);
            if (level === 0) parentId = '1';
            else parentId = document.querySelector(`.bookmark-column[data-level="${level - 1}"] .bookmark-item.highlighted`)?.dataset.id;
        }
        if (parentId) handleSortBookmarks(parentId, action);
        return;
    }

    // --- 其他动作 ---
    switch (action) {
        case 'open':
            selectedIds.forEach(id => {
                const item = document.querySelector(`.bookmark-item[data-id="${id}"]`);
                if (item && item.dataset.url) chrome.tabs.create({ url: item.dataset.url });
            });
            break;
        case 'openNew':
            selectedIds.forEach(id => {
                const item = document.querySelector(`.bookmark-item[data-id="${id}"]`);
                if (item && item.dataset.url) chrome.windows.create({ url: item.dataset.url });
            });
            break;
        case 'openIncognito':
            selectedIds.forEach(id => {
                const item = document.querySelector(`.bookmark-item[data-id="${id}"]`);
                if (item && item.dataset.url) chrome.windows.create({ url: item.dataset.url, incognito: true });
            });
            break;
        case 'delete':
            showConfirmDialog(`删除 ${selectionSize} 个项目`, `确定要删除这 ${selectionSize} 个选中的项目吗?`, () => {
                selectedIds.forEach(id => {
                    const item = document.querySelector(`.bookmark-item[data-id="${id}"]`);
                    if (!item) return;
                    const isFolder = item.classList.contains('is-folder');
                    const promise = isFolder ? chrome.bookmarks.removeTree(id) : chrome.bookmarks.remove(id);
                    promise.catch(err => console.error('删除失败:', err));
                });
            });
            break;
        case 'move':
            showMoveDialog(element, selectedIds);
            break;
        case 'copyUrl':
            if (element) navigator.clipboard.writeText(element.dataset.url).then(() => showToast('网址已复制'));
            break;
        case 'rename':
            if (element) showEditDialog('重命名', element.querySelector('.bookmark-title').textContent, null, (newName) => {
                if (newName) chrome.bookmarks.update(element.dataset.id, { title: newName });
            });
            break;
        case 'editUrl':
            if (element) showEditDialog('修改网址', element.dataset.url, isValidUrl, (newUrl) => {
                if (newUrl) chrome.bookmarks.update(element.dataset.id, { url: newUrl });
            });
            break;
        case 'newFolder':
            {
                const column = document.getElementById('contextMenu').relatedColumn;
                if (!column) return;
                let parentId;
                if (element && element.classList.contains('is-folder')) {
                    parentId = element.dataset.id;
                } else if (element) {
                    parentId = element.dataset.parentId;
                } else {
                    const level = parseInt(column.dataset.level, 10);
                    if (level === 0) parentId = '1';
                    else parentId = document.querySelector(`.bookmark-column[data-level="${level - 1}"] .bookmark-item.highlighted`)?.dataset.id;
                }
                if (parentId) showEditDialog('新建文件夹', '', null, (name) => {
                    if (name) chrome.bookmarks.create({ parentId, title: name, index: 0 });
                });
                break;
            }
    }
}


/**
 * 对指定文件夹内的书签进行排序
 * @param {string} parentId - 父文件夹ID
 * @param {string} sortType - 排序类型 ('sortDateNew', 'sortAlphaAsc', etc.)
 */
async function handleSortBookmarks(parentId, sortType) {
    chrome.bookmarks.getChildren(parentId, async (children) => {
        if (!children || children.length < 2) return;
        showToast('正在排序...');
        let sortedChildren;
        switch (sortType) {
            case 'sortDateNew':
                sortedChildren = children.sort((a, b) => b.dateAdded - a.dateAdded);
                break;
            case 'sortDateOld':
                sortedChildren = children.sort((a, b) => a.dateAdded - b.dateAdded);
                break;
            case 'sortAlphaAsc':
                sortedChildren = children.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'sortAlphaDesc':
                sortedChildren = children.sort((a, b) => b.title.localeCompare(a.title));
                break;
            case 'sortVisit':
                const promises = children.map(child => new Promise(resolve => {
                    if (!child.url) {
                        resolve({ ...child, lastVisitTime: 0 });
                        return;
                    }
                    chrome.history.getVisits({ url: child.url }, (visits) => {
                        const lastVisitTime = visits.length > 0 ? visits[visits.length - 1].visitTime : 0;
                        resolve({ ...child, lastVisitTime });
                    });
                }));
                const childrenWithVisitData = await Promise.all(promises);
                sortedChildren = childrenWithVisitData.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
                break;
            default:
                return;
        }

        // 依次移动书签到新的位置
        for (let i = 0; i < sortedChildren.length; i++) {
            await new Promise(resolve => chrome.bookmarks.move(sortedChildren[i].id, { parentId: parentId, index: i }, resolve));
        }

        // 刷新视图
        const parentFolderItem = document.querySelector(`.bookmark-item.highlighted[data-id="${parentId}"]`);
        if (parentFolderItem) {
            handleFolderClick(parentFolderItem, parentId); // 重新打开文件夹以刷新
        } else if (parentId === '1') {
            chrome.bookmarks.getTree(displayBookmarks); // 如果是根目录，则刷新整个书签栏
        }
        showToast('排序完成');
    });
}


// --- 弹窗对话框 (Dialogs) ---

/**
 * 显示编辑/新建对话框
 * @param {string} title - 对话框标题
 * @param {string} initialValue - 输入框初始值
 * @param {Function | null} validator - 验证函数
 * @param {Function} callback - 确认后的回调函数
 */
function showEditDialog(title, initialValue, validator, callback) {
    const dialog = document.getElementById('editDialog'),
        titleEl = document.getElementById('editDialogTitle'),
        inputEl = document.getElementById('editDialogInput'),
        errorEl = document.getElementById('editDialogError'),
        cancelBtn = document.getElementById('cancelEdit'),
        confirmBtn = document.getElementById('confirmEdit');

    titleEl.textContent = title;
    inputEl.value = initialValue || '';
    errorEl.textContent = '';
    dialog.style.display = 'flex';
    inputEl.focus();
    inputEl.select();

    const close = () => {
        dialog.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        inputEl.onkeydown = null;
    };

    const confirm = () => {
        const newValue = inputEl.value.trim();
        if (validator && !validator(newValue)) {
            errorEl.textContent = '请输入有效的网址';
            return;
        }
        if (!newValue && (title.includes('重命名') || title.includes('新建'))) {
            errorEl.textContent = '名称不能为空';
            return;
        }
        callback(newValue);
        close();
    };

    cancelBtn.onclick = close;
    confirmBtn.onclick = confirm;
    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') confirm();
        if (e.key === 'Escape') close();
    };
}

/**
 * 显示确认对话框
 * @param {string} title - 标题
 * @param {string} message - 确认信息
 * @param {Function} callback - 确认后的回调
 */
function showConfirmDialog(title, message, callback) {
    const dialog = document.getElementById('confirmDialog'),
        titleEl = document.getElementById('confirmDialogTitle'),
        messageEl = document.getElementById('confirmDialogMessage'),
        cancelBtn = document.getElementById('cancelConfirm'),
        confirmBtn = document.getElementById('confirmConfirm');

    titleEl.textContent = title;
    messageEl.textContent = message;
    dialog.style.display = 'flex';
    confirmBtn.focus();

    const close = () => {
        dialog.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    const confirm = () => {
        callback();
        close();
    };

    cancelBtn.onclick = close;
    confirmBtn.onclick = confirm;
}


/**
 * 显示移动到...对话框
 * @param {HTMLElement} bookmarkElement - 被移动的书签元素
 * @param {string[]} idsToMove - 所有要移动的书签ID数组
 */
function showMoveDialog(bookmarkElement, idsToMove) {
    const dialog = document.getElementById('moveDialog'),
        treeContainer = document.getElementById('bookmarkTree'),
        confirmBtn = document.getElementById('confirmMove'),
        cancelBtn = document.getElementById('cancelMove');

    let selectedFolderId = null;
    let disabledFolderIds = new Set(idsToMove); // 不能移动到自身或其子文件夹

    const close = () => {
        dialog.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        treeContainer.innerHTML = '';
    };

    const renderTree = (nodes, parentElement, level) => {
        nodes.forEach(node => {
            if (node.url) return; // 只显示文件夹

            const item = document.createElement('div');
            item.className = 'bookmark-tree-item';
            item.dataset.id = node.id;
            if (disabledFolderIds.has(node.id)) {
                item.classList.add('is-disabled');
            }

            const content = document.createElement('div');
            content.className = 'folder-content';
            content.style.paddingLeft = `${level * 20}px`;

            const expandIcon = document.createElement('span');
            expandIcon.className = 'expand-icon';

            const folderIcon = document.createElement('img');
            folderIcon.src = '/img/folder_icon.svg';
            folderIcon.className = 'folder-icon';

            const title = document.createElement('span');
            title.textContent = node.title || (node.id === '1' ? '书签栏' : '其他书签');
            title.className = 'folder-title';

            content.append(expandIcon, folderIcon, title);
            item.appendChild(content);

            const subFolderContainer = document.createElement('div');
            subFolderContainer.className = 'sub-folder is-hidden';
            item.appendChild(subFolderContainer);

            if (node.children && node.children.some(child => !child.url)) {
                renderTree(node.children, subFolderContainer, level + 1);
            }

            content.onclick = () => {
                if (item.classList.contains('is-disabled')) return;
                document.querySelectorAll('.bookmark-tree-item.selected').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                selectedFolderId = node.id;
                confirmBtn.disabled = false;
            };

            parentElement.appendChild(item);
        });
    };

    dialog.style.display = 'flex';
    confirmBtn.disabled = true;

    chrome.bookmarks.getTree(tree => {
        const topLevelFolders = tree[0]?.children;
        if (!topLevelFolders) return;
        treeContainer.innerHTML = '';
        renderTree(topLevelFolders, treeContainer, 0);

        // 为有子文件夹的项添加展开/折叠功能
        treeContainer.querySelectorAll('.bookmark-tree-item').forEach(item => {
            const sub = item.querySelector('.sub-folder'),
                icon = item.querySelector('.expand-icon');
            if (sub && sub.hasChildNodes()) {
                icon.textContent = '▶';
                icon.onclick = (e) => {
                    e.stopPropagation();
                    sub.classList.toggle('is-hidden');
                    icon.classList.toggle('expanded');
                };
            }
        });
    });

    confirmBtn.onclick = () => {
        if (selectedFolderId) {
            idsToMove.forEach(id => {
                if (id !== selectedFolderId) { // 防止移动到自身
                    chrome.bookmarks.move(id, { parentId: selectedFolderId, index: 0 });
                }
            });
        }
        close();
    };

    cancelBtn.onclick = close;
}


// --- Chrome API 事件监听与处理 ---

/**
 * 根据父ID查找对应的列元素
 * @param {string} parentId
 * @returns {HTMLElement | null}
 */
function findColumnForParentId(parentId) {
    if (parentId === '1') return document.querySelector('.bookmark-column[data-level="0"]');

    const parentItem = document.querySelector(`.bookmark-item[data-id="${parentId}"]`);
    if (parentItem && parentItem.classList.contains('highlighted')) {
        const level = parseInt(parentItem.closest('.bookmark-column').dataset.level, 10);
        return document.querySelector(`.bookmark-column[data-level="${level + 1}"]`);
    }
    return null;
}

/**
 * 重新计算列中所有项目的索引
 * @param {HTMLElement} column
 */
function reindexColumnItems(column) {
    if (!column) return;
    for (let i = 0; i < column.children.length; i++) {
        column.children[i].dataset.index = i;
    }
}

function handleBookmarkCreated(id, bookmark) {
    const parentColumn = findColumnForParentId(bookmark.parentId);
    if (parentColumn) {
        const newItem = createBookmarkItem(bookmark, bookmark.index);
        parentColumn.insertBefore(newItem, parentColumn.children[bookmark.index]);
        reindexColumnItems(parentColumn);
    }
    displayRecentBookmarks(); // 刷新最近添加
}

function handleBookmarkRemoved(id, removeInfo) {
    const itemToRemove = document.querySelector(`.bookmark-item[data-id="${id}"]`);
    if (itemToRemove) {
        const parentColumn = itemToRemove.parentElement;
        if (itemToRemove.classList.contains('highlighted')) {
            // 如果删除的是一个已打开的文件夹，则关闭它
            const level = parseInt(parentColumn.dataset.level, 10);
            document.querySelectorAll('.bookmark-column').forEach(col => {
                if (parseInt(col.dataset.level, 10) > level) col.remove();
            });
        }
        itemToRemove.remove();
        reindexColumnItems(parentColumn);
    }
    displayRecentBookmarks(); // 刷新最近添加
}

function handleBookmarkChanged(id, changeInfo) {
    document.querySelectorAll(`.bookmark-item[data-id="${id}"]`).forEach(item => {
        if (changeInfo.title) {
            item.querySelector('.bookmark-title').textContent = sanitizeText(changeInfo.title);
        }
        if (changeInfo.url) {
            item.dataset.url = changeInfo.url;
            item.querySelector('.bookmark-icon').src = getIconUrl(changeInfo.url);
        }
    });
}

function handleBookmarkMoved(id, moveInfo) {
    // 从旧位置移除
    const itemToMove = document.querySelector(`.bookmark-item[data-id="${id}"]`);
    if (itemToMove) {
        const oldParentColumn = itemToMove.parentElement;
        itemToMove.remove();
        reindexColumnItems(oldParentColumn);
    }

    // 在新位置添加
    const newParentColumn = findColumnForParentId(moveInfo.parentId);
    if (newParentColumn) {
        chrome.bookmarks.get(id, (bookmarks) => {
            if (bookmarks && bookmarks[0]) {
                const newItem = createBookmarkItem(bookmarks[0], moveInfo.index);
                newParentColumn.insertBefore(newItem, newParentColumn.children[moveInfo.index]);
                reindexColumnItems(newParentColumn);
            }
        });
    }
}


// --- 侧边栏模块 (Modules) ---

/**
 * 显示最近添加的书签
 */
function displayRecentBookmarks() {
    const container = document.querySelector('#recentBookmarksModule .module-content');
    if (!container) return;
    chrome.bookmarks.getRecent(15, (items) => {
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            if (!item.url) return;
            const li = document.createElement('li'),
                a = document.createElement('a');
            a.href = item.url;
            a.target = '_blank';
            a.title = sanitizeText(item.title);

            const icon = document.createElement('img');
            icon.className = 'module-icon';
            icon.src = getIconUrl(item.url);

            const title = document.createElement('span');
            title.className = 'module-title';
            title.textContent = sanitizeText(item.title);

            a.append(icon, title);
            li.appendChild(a);

            a.addEventListener('mouseenter', () => currentlyHoveredItem = a);
            a.addEventListener('mouseleave', () => currentlyHoveredItem = null);

            fragment.appendChild(li);
        });
        container.appendChild(fragment);
    });
}

/**
 * 显示最常访问的网站
 */
function displayTopSites() {
    const container = document.getElementById('topSitesContent');
    if (!container) return;
    chrome.topSites.get((items) => {
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        items.slice(0, 15).forEach(item => {
            const a = document.createElement('a');
            a.className = 'top-site-item';
            a.href = item.url;
            a.target = '_blank';
            a.title = sanitizeText(item.title);

            const icon = document.createElement('img');
            icon.className = 'top-site-icon';
            icon.src = getIconUrl(item.url);

            const title = document.createElement('span');
            title.className = 'top-site-title';
            title.textContent = sanitizeText(item.title);

            a.append(icon, title);

            a.addEventListener('mouseenter', () => currentlyHoveredItem = a);
            a.addEventListener('mouseleave', () => currentlyHoveredItem = null);

            fragment.appendChild(a);
        });
        container.appendChild(fragment);
    });
}


// --- 其他功能 ---

/**
 * 空格键预览功能
 * @param {KeyboardEvent} e
 */
function handleSpacebarPreview(e) {
    if (e.code !== 'Space' || !currentlyHoveredItem || e.target.tagName === 'INPUT' || e.target.isContentEditable) {
        return;
    }
    e.preventDefault();
    const url = currentlyHoveredItem.dataset.url || currentlyHoveredItem.href;
    if (url) {
        openPreviewWindow(url);
    }
}

/**
 * 打开或更新预览窗口
 * @param {string} url
 */
function openPreviewWindow(url) {
    if (previewWindowId !== null) {
        chrome.windows.get(previewWindowId, {}, (win) => {
            if (chrome.runtime.lastError) { // 窗口已被关闭
                previewWindowId = null;
                createSizedPreviewWindow(url);
            } else { // 窗口存在，更新URL
                chrome.tabs.query({ windowId: previewWindowId, active: true }, (tabs) => {
                    if (tabs.length > 0) {
                        chrome.tabs.update(tabs[0].id, { url: url, active: true });
                        chrome.windows.update(previewWindowId, { focused: true });
                    }
                });
            }
        });
    } else {
        createSizedPreviewWindow(url);
    }
}

/**
 * 创建一个尺寸合适的预览窗口
 * @param {string} url
 */
function createSizedPreviewWindow(url) {
    chrome.windows.getCurrent({}, (current) => {
        const w = Math.round(current.width * 0.8),
            h = Math.round(current.height * 0.9),
            t = current.top + Math.round((current.height - h) * 0.5),
            l = current.left + Math.round((current.width - w) * 0.5);
        chrome.windows.create({
            url,
            type: 'popup',
            width: w,
            height: h,
            top: t,
            left: l
        }, (win) => previewWindowId = win.id);
    });
}

// ==================================================================
// --- DOMContentLoaded: 页面加载完成后的初始化 ---
// ==================================================================

document.addEventListener('DOMContentLoaded', function () {
    // --- 获取元素 ---
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const themeOptionsContainer = settingsPanel.querySelector('.theme-options');
    const hoverToggle = document.getElementById('hover-toggle-switch');
    const verticalModules = document.querySelector('.vertical-modules');
    const toggleVerticalBtn = document.getElementById('sidebar-toggle-btn');
    const contextMenu = document.getElementById('contextMenu');

       /************************************************************/
    /* --- 新增：用于隐藏菜单的全局事件监听 --- */
    /************************************************************/
    // 页面滚动时隐藏菜单 (true 表示在捕获阶段执行，更可靠)
    window.addEventListener('scroll', hideContextMenu, true);
    // 调整窗口大小时隐藏菜单
    window.addEventListener('resize', hideContextMenu);
    // 按下 ESC 键时隐藏菜单
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
        }
    });


    // --- 设置功能 ---
    const updateThemeButtons = (active) => {
        themeOptionsContainer.querySelectorAll('.theme-option').forEach(btn => btn.classList.toggle('active', btn.dataset.themeValue === active));
    };

    const applyTheme = (theme) => {
        const root = document.documentElement;
        if (theme === 'system') {
            root.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        } else {
            root.setAttribute('data-theme', theme);
        }
        localStorage.setItem('theme', theme);
        updateThemeButtons(theme);
    };

    // 初始化主题
    applyTheme(localStorage.getItem('theme') || 'system');

    // 初始化悬停开关
    hoverToggle.checked = localStorage.getItem('hoverToOpenEnabled') !== 'false';
    isHoverEnabled = hoverToggle.checked;
    hoverToggle.addEventListener('change', (e) => {
        isHoverEnabled = e.target.checked;
        localStorage.setItem('hoverToOpenEnabled', isHoverEnabled);
        showToast(`悬停打开功能已${isHoverEnabled ? '开启' : '关闭'}`);
    });

    // 设置按钮点击事件
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.toggle('visible');
    });

    // 主题切换按钮点击事件
    themeOptionsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.theme-option')) {
            applyTheme(e.target.dataset.themeValue);
        }
    });

    // 监听系统颜色模式变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem('theme') === 'system') {
            applyTheme('system');
        }
    });


    // --- 侧边栏模块显隐逻辑 ---
    let isModuleVisible = false,
        hoverTimeout;
    const showModules = () => {
        if (!isModuleVisible) {
            verticalModules.style.display = 'flex';
            isModuleVisible = true;
        }
    };
    const hideModules = () => {
        if (isModuleVisible) {
            verticalModules.style.display = 'none';
            isModuleVisible = false;
        }
    };

    toggleVerticalBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isModuleVisible ? hideModules() : showModules();
    });

    toggleVerticalBtn.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(showModules, 500);
    });
    toggleVerticalBtn.addEventListener('mouseleave', () => clearTimeout(hoverTimeout));
    verticalModules.addEventListener('mouseenter', () => clearTimeout(hoverTimeout)); // 进入模块区域时取消隐藏计时


// ... 位于 DOMContentLoaded 内部 ...
    // --- 全局点击事件处理 ---
    document.addEventListener('click', (e) => {
        // 检查点击事件是否发生在任何不应清除高亮的“活动区域”之外
        const isClickOutsideActiveAreas = !e.target.closest('.bookmark-item') &&
                                          !e.target.closest('.context-menu') &&
                                          !e.target.closest('.move-dialog-content') &&
                                          !e.target.closest('.edit-dialog-content');

        if (isClickOutsideActiveAreas) {
            clearSelection();
        }

        // --- 以下是其他保持不变的逻辑 ---

        // 点击设置面板和按钮之外的区域，关闭设置面板
        if (settingsPanel.classList.contains('visible') && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.classList.remove('visible');
        }

        // 点击菜单之外的区域，关闭右键菜单
        if (!contextMenu.contains(e.target)) {
            hideContextMenu();
        }
        
        // 点击侧边栏和按钮之外的区域，关闭侧边栏
        if (isModuleVisible && !verticalModules.contains(e.target) && !toggleVerticalBtn.contains(e.target)) {
            hideModules();
        }
    });

    // --- 全局右键菜单 ---
    document.body.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.bookmark-item');
        const column = e.target.closest('.bookmark-column');
        if (!item && !column) return; // 必须在书签或列上右键
        e.preventDefault();
        showContextMenu(e, item, column);
    });

    // 右键菜单点击事件
    contextMenu.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li && li.id) {
            handleContextMenuAction(li.id, contextMenu.relatedTarget);
            hideContextMenu(); // <<< --- 添加这一行
        }
    });


    // --- 初始化加载 & Chrome API 监听 ---
    chrome.bookmarks.getTree(displayBookmarks);
    displayRecentBookmarks();
    displayTopSites();

    chrome.bookmarks.onCreated.addListener(handleBookmarkCreated);
    chrome.bookmarks.onRemoved.addListener(handleBookmarkRemoved);
    chrome.bookmarks.onChanged.addListener(handleBookmarkChanged);
    chrome.bookmarks.onMoved.addListener(handleBookmarkMoved);

    document.addEventListener('keydown', handleSpacebarPreview);
    chrome.windows.onRemoved.addListener((id) => {
        if (id === previewWindowId) {
            previewWindowId = null; // 预览窗口关闭后重置ID
        }
    });
});
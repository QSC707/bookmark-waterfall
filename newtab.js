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
let allBookmarksFlat = []; // 用于存储扁平化的书签列表，便于快速搜索和筛选


// ==================================================================
// --- 核心功能函数 ---
// ==================================================================

// --- 辅助工具函数 ---

/**
 * 格式化日期时间戳
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的字符串 e.g., "2023-10-27"
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * [新增] 格式化日期+时间戳
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的字符串 e.g., "2023-10-27 15:30"
 */
function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 获取书签的完整路径 (修复版)
 * @param {string} bookmarkId - 书签ID
 * @returns {Promise<string>} 文件夹路径字符串
 */
function getBookmarkPath(bookmarkId) {
    return new Promise(resolve => {
        let path = [];
        const buildPath = (id) => {
            // 当找到根节点'0'时，停止递归
            if (!id || id === '0') {
                resolve(path.reverse().join(' / '));
                return;
            }
            chrome.bookmarks.get(id, (nodes) => {
                if (nodes && nodes[0]) {
                    const node = nodes[0];
                    // 为根目录下的文件夹提供明确的名称
                    let title = node.title;
                    if (node.parentId === '0') {
                        if (node.id === '1') title = '书签栏';
                        else if (node.id === '2') title = '其他书签';
                    }
                    if (title) { // 只有非空的标题才加入路径
                        path.push(title);
                    }
                    buildPath(node.parentId);
                } else {
                    // 如果节点获取失败，则返回当前已构建的路径
                    resolve(path.reverse().join(' / '));
                }
            });
        };

        // 从书签的父级开始构建路径，因为书签本身不是路径的一部分
        chrome.bookmarks.get(bookmarkId, (nodes) => {
            if (nodes && nodes[0]) {
                buildPath(nodes[0].parentId);
            } else {
                resolve(''); // 书签不存在则返回空路径
            }
        });
    });
}

/**
 * 递归获取所有书签并扁平化处理
 * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes - 书签节点
 * @param {Array} flatList - 结果数组
 */
function flattenBookmarks(nodes, flatList) {
    for (const node of nodes) {
        if (node.url) { // 是书签
            flatList.push(node);
        }
        if (node.children) { // 是文件夹
            flattenBookmarks(node.children, flatList);
        }
    }
}


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
    // 【修改】确保能清除主区域和侧边栏的所有选中样式
    document.querySelectorAll('.bookmark-item.selected, .vertical-modules a.selected').forEach(el => el.classList.remove('selected'));
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
        setTimeout(() => {
            container.scrollTo(container.scrollWidth, 0);
        }, 0);
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
    item.dataset.title = bookmark.title || 'No Title'; // <<< 新增
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
        // 如果按下了任何修饰键(Ctrl/Cmd/Shift)，说明用户意图是多选，而不是打开。
        // 所以我们直接返回，不做任何事，把选择逻辑完全交给 mousedown 事件处理。
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
            return;
        }

        // --- 如果是普通的、无修饰的单击 ---
        if (!isFolder) {
            // 对于书签链接：
            // 此时 mousedown 事件已经处理好了高亮，我们只需要执行“打开”这个动作。
            window.open(bookmark.url, '_blank');
        } else {
            // 对于文件夹：
            // 单击文件夹就是为了打开它，这个行为保持不变。
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
    // 【错误修复】重新添加这行被遗漏的变量定义
    const isModuleItem = bookmarkElement?.closest('.vertical-modules');

    // --- 这是唯一的、正确的逻辑 ---
    if (rightClickedId && !selectedItems.has(rightClickedId)) {
        // 如果右键点击了一个“未被选中”的项目 (无论它在哪里)
        // 1. 清除所有旧的选中状态
        clearSelection();
        // 2. 选中这个新项目 (这会给它加上高亮样式)
        toggleSelection(bookmarkElement);
    } else if (!rightClickedId) {
        // 如果右键点击的是空白区域，则清除所有选择
        clearSelection();
    }

    const selectionSize = selectedItems.size;
    const hasBookmarkInSelection = Array.from(selectedItems).some(id => {
        const item = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);
        return item && !item.classList.contains('is-folder');
    });

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
            const isFolder = bookmarkElement && bookmarkElement.classList.contains('is-folder');
            if (isFolder) {
                menuHtml += `<li id="openAll"><img src="/img/open_all.svg" class="menu-icon">打开文件夹内所有书签</li><hr>`;
            } else {
                menuHtml += `<li id="open"><img src="/img/open.svg" class="menu-icon">新标签打开</li>`;
                menuHtml += `<li id="openNew"><img src="/img/open_new.svg" class="menu-icon">新窗口打开</li>`;
                menuHtml += `<li id="openIncognito"><img src="/img/open_new.svg" class="menu-icon">在隐身模式中打开</li>`;
                menuHtml += `<hr>`;
            }
        }

        if (selectionSize === 1 && bookmarkElement && !bookmarkElement.classList.contains('is-folder')) {
            menuHtml += `<li id="editUrl"><img src="/img/edit.svg" class="menu-icon">修改网址</li>`;
        }
        if (selectionSize === 1) {
            menuHtml += `<li id="rename"><img src="/img/rename.svg" class="menu-icon">重命名</li>`;
        }
        menuHtml += `<li id="move"><img src="/img/move.svg" class="menu-icon">移动${selectionSize > 1 ? ` (${selectionSize})` : ''}到...</li>`;
        if (selectionSize === 1 && bookmarkElement && !bookmarkElement.classList.contains('is-folder')) {
            menuHtml += `<li id="copyUrl"><img src="/img/copy.svg" class="menu-icon">复制网址</li>`;
        }
        if (selectionSize === 1) {
            menuHtml += `<li id="properties"><img src="/img/rename.svg" class="menu-icon">属性</li>`; // 暂时复用图标
        }
        menuHtml += `<hr>`;
        menuHtml += `<li id="delete"><img src="/img/delete.svg" class="menu-icon">删除${selectionSize > 1 ? ` (${selectionSize})` : ''}</li>`;
    }

    // --- 在列上右键的菜单 ---
    if (column && !isModuleItem) { // 【错误修复】现在 isModuleItem 已经被定义，这里不再报错
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
 * 处理右键菜单的点击动作 (最终修复版)
 * @param {string} action - 动作ID
 * @param {HTMLElement} element - 关联的书签元素
 */
function handleContextMenuAction(action, element) {
    const selectionSize = selectedItems.size;
    const selectedIds = Array.from(selectedItems);

    // --- 排序逻辑 (保持不变) ---
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

    // --- 其他动作 (核心改造部分) ---
    switch (action) {
        case 'open':
        case 'openNew':
        case 'openIncognito':
            selectedIds.forEach(id => {
                // 使用通用选择器，可以同时找到主区域和侧边栏的书签
                const item = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);
                if (item && item.dataset.url) {
                    if (action === 'open') chrome.tabs.create({ url: item.dataset.url });
                    else if (action === 'openNew') chrome.windows.create({ url: item.dataset.url });
                    else if (action === 'openIncognito') chrome.windows.create({ url: item.dataset.url, incognito: true });
                }
            });
            break;
        case 'delete':
            showConfirmDialog(`删除 ${selectionSize} 个项目`, `确定要删除这 ${selectionSize} 个选中的项目吗?`, () => {
                selectedIds.forEach(id => {
                    const item = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);
                    if (!item) return;
                    // .is-folder 只存在于主区域的文件夹上
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
            // element 是右键点击的那个元素，它的 dataset 总是可用的
            if (element && element.dataset.url) {
                navigator.clipboard.writeText(element.dataset.url).then(() => showToast('网址已复制'));
            }
            break;
        case 'rename':
            // 从 element.dataset 中获取标题，实现了通用
            if (element && element.dataset.title) {
                showEditDialog('重命名', element.dataset.title, null, (newName) => {
                    if (newName) chrome.bookmarks.update(element.dataset.id, { title: newName });
                });
            }
            break;
        case 'editUrl':
            if (element && element.dataset.url) {
                showEditDialog('修改网址', element.dataset.url, isValidUrl, (newUrl) => {
                    if (newUrl && newUrl !== element.dataset.url) {
                        chrome.bookmarks.update(element.dataset.id, { url: newUrl });
                    }
                });
            }
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
        case 'properties':
            showPropertiesDialog(element);
            break;
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

        // --- 排序逻辑 (保持不变) ---
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

        // --- 移动书签到新位置 (保持不变) ---
        for (let i = 0; i < sortedChildren.length; i++) {
            // 防止移动自身到同一位置，这会引发API错误
            if (sortedChildren[i].index !== i) {
                await new Promise(resolve => chrome.bookmarks.move(sortedChildren[i].id, { parentId: parentId, index: i }, resolve));
            }
        }

        // --- 【这是全新的、正确的刷新逻辑】 ---
        // 1. 重新获取刚刚排序完成的、最新的子元素列表
        chrome.bookmarks.getChildren(parentId, (freshlySortedChildren) => {
            if (parentId === '1') {
                // 如果是书签栏，直接刷新整个应用
                chrome.bookmarks.getTree(displayBookmarks);
            } else {
                // 2. 找到代表父文件夹的那个 DOM 元素
                const parentFolderItem = document.querySelector(`.bookmark-item.highlighted[data-id="${parentId}"]`);
                if (parentFolderItem) {
                    // 3. 获取父文件夹所在的层级
                    const level = parseInt(parentFolderItem.closest('.bookmark-column').dataset.level, 10);
                    // 4. 直接调用 renderBookmarks 重新渲染下一列，而不是模拟点击
                    renderBookmarks(freshlySortedChildren, document.getElementById('bookmarkContainer'), level + 1);
                }
            }
            showToast('排序完成');
        });
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


// --- 【新增代码：显示属性对话框的函数】 ---
async function showPropertiesDialog(element) {
    if (!element) return;

    const dialog = document.getElementById('propertiesDialog'),
        bodyEl = document.getElementById('propertiesDialogBody'),
        closeBtn = document.getElementById('closeProperties');

    const bookmarkId = element.dataset.id;
    if (!bookmarkId) return;

    // 1. 获取书签的详细信息
    const [bookmarkDetails] = await new Promise(resolve => chrome.bookmarks.get(bookmarkId, resolve));
    const bookmarkPath = await getBookmarkPath(bookmarkId);

    // 2. 准备要显示的数据
    const properties = [
        { label: '名称', value: bookmarkDetails.title },
        { label: '网址 (URL)', value: bookmarkDetails.url || 'N/A (这是一个文件夹)' },
        { label: '路径', value: bookmarkPath || '根目录' },
        { label: '添加时间', value: formatDateTime(bookmarkDetails.dateAdded) },
        { label: 'ID', value: bookmarkDetails.id }
    ];

    // 3. 构建 HTML 内容
    bodyEl.innerHTML = properties.map(prop => `
        <div class="prop-item">
            <span class="prop-label">${prop.label}</span>
            <span class="prop-value">${sanitizeText(prop.value)}</span>
        </div>
    `).join('');


    // 4. 显示对话框并绑定关闭事件
    dialog.style.display = 'flex';
    closeBtn.focus();

    const close = () => {
        dialog.style.display = 'none';
        closeBtn.onclick = null;
    };

    closeBtn.onclick = close;
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
async function displayRecentBookmarks() {
    const container = document.querySelector('#recentBookmarksModule .module-content');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const quickFiltersContainer = document.getElementById('quickFilters');
    if (!container || !startDateInput || !endDateInput || !quickFiltersContainer) return;

    // --- 辅助函数：格式化日期 (保持不变) ---
    const getRelativeDateString = (date) => {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        today.setHours(0, 0, 0, 0);
        yesterday.setHours(0, 0, 0, 0);
        const checkDate = new Date(date.getTime());
        checkDate.setHours(0, 0, 0, 0);
        if (checkDate.getTime() === today.getTime()) return '今天';
        if (checkDate.getTime() === yesterday.getTime()) return '昨天';
        return formatDate(date.getTime());
    };

    // --- 渲染函数 (核心修改部分) ---
    const renderList = async () => {
        const startTime = new Date(startDateInput.value).getTime();
        const endTime = new Date(endDateInput.value).getTime() + (24 * 60 * 60 * 1000 - 1);
        container.innerHTML = '';

        const filteredBookmarks = allBookmarksFlat
            .filter(bm => bm.dateAdded >= startTime && bm.dateAdded <= endTime && bm.url)
            .sort((a, b) => b.dateAdded - a.dateAdded);

        if (filteredBookmarks.length === 0) {
            container.innerHTML = '<div class="empty-folder-message" style="padding: 10px;">该时段无书签</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        let lastDateString = '';

        for (const item of filteredBookmarks) {
            const currentDate = new Date(item.dateAdded);
            const currentDateString = getRelativeDateString(currentDate);

            if (currentDateString !== lastDateString) {
                // 只创建一个简单的 DIV 即可
                const dateHeader = document.createElement('div');
                dateHeader.className = 'timeline-date-header';
                dateHeader.textContent = currentDateString;
                fragment.appendChild(dateHeader);
                lastDateString = currentDateString;
            }

            const a = document.createElement('a');
            a.href = item.url;
            a.target = '_blank';
            a.title = `${sanitizeText(item.title)}\nURL: ${item.url}`;
            a.dataset.id = item.id;
            a.dataset.url = item.url;
            a.dataset.parentId = item.parentId;
            a.dataset.title = item.title;

            // --- V3: 全新的、更合理的 HTML 结构 ---
            const icon = document.createElement('img');
            icon.className = 'module-icon';
            icon.src = getIconUrl(item.url);

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'bookmark-content-wrapper';

            const title = document.createElement('span');
            title.className = 'module-title';
            title.textContent = sanitizeText(item.title);

            const metaInfo = document.createElement('div');
            metaInfo.className = 'bookmark-meta-info';

            // --- 新增：创建一个容器来包裹路径和URL ---
            const pathUrlWrapper = document.createElement('div');
            pathUrlWrapper.className = 'bookmark-path-url-wrapper';

            const pathSpan = document.createElement('span');
            pathSpan.className = 'bookmark-item-path';
            pathSpan.textContent = await getBookmarkPath(item.id); // 显示文件夹路径

            // --- 新增：创建用于显示URL的元素 ---
            const urlSpan = document.createElement('span');
            urlSpan.className = 'bookmark-item-url';
            urlSpan.textContent = item.url.replace(/^https?:\/\//, '').replace(/^www\./, ''); // 显示净化后的URL

            pathUrlWrapper.append(urlSpan, pathSpan); // <<< 【修改这里】先放网址，后放路径

            const dateSpan = document.createElement('span');
            dateSpan.className = 'bookmark-item-date';
            dateSpan.textContent = formatDateTime(item.dateAdded);


            // --- 修改：将包装器和日期放入 metaInfo ---
            metaInfo.append(pathUrlWrapper, dateSpan);
            contentWrapper.append(title, metaInfo);
            a.append(icon, contentWrapper);
            // --- 结构定义结束 ---

            a.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, a, a.closest('.vertical-modules'));
            });
            a.addEventListener('mouseenter', () => currentlyHoveredItem = a);
            a.addEventListener('mouseleave', () => currentlyHoveredItem = null);

            // --- 【这是新增的、最关键的代码】 ---
            // 添加 mousedown 事件来处理单击高亮
            a.addEventListener('mousedown', (e) => {
                // 只响应鼠标左键
                if (e.button !== 0) return;

                // 如果按住了 Ctrl/Cmd 或 Shift 键，则阻止链接默认的打开行为
                if (e.metaKey || e.ctrlKey || e.shiftKey) {
                    e.preventDefault();
                }

                // 核心逻辑：如果当前项未被选中，则清空其他所有选择，然后选中当前项
                if (!selectedItems.has(a.dataset.id)) {
                    clearSelection();
                    toggleSelection(a);
                }
            });

            fragment.appendChild(a);
        }
        container.appendChild(fragment);
    };

    // --- 初始化和事件绑定 (保持不变) ---
    const setDateRange = (days) => {
        const today = new Date();
        const endDate = new Date(today);
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - (days - 1));
        endDateInput.value = endDate.toISOString().split('T')[0];
        startDateInput.value = startDate.toISOString().split('T')[0];
        renderList();
    };
    if (!startDateInput.dataset.initialized) {
        endDateInput.addEventListener('change', renderList);
        startDateInput.addEventListener('change', renderList);
        quickFiltersContainer.addEventListener('click', (e) => {
            if (e.target.matches('.filter-btn')) {
                quickFiltersContainer.querySelector('.filter-btn.active')?.classList.remove('active');
                e.target.classList.add('active');
                const days = parseInt(e.target.dataset.days, 10);
                if (days === 1) {
                    const todayStr = new Date().toISOString().split('T')[0];
                    startDateInput.value = todayStr;
                    endDateInput.value = todayStr;
                    renderList();
                } else {
                    setDateRange(days);
                }
            }
        });
        setDateRange(30);
        startDateInput.dataset.initialized = 'true';
    } else {
        renderList();
    }
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
// --- DOMContentLoaded: 页面加载完成后的初始化 (最终修正版) ---
// ==================================================================

document.addEventListener('DOMContentLoaded', function () {
    // --- 1. 获取所有需要的元素 ---
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const themeOptionsContainer = settingsPanel.querySelector('.theme-options');
    const hoverToggle = document.getElementById('hover-toggle-switch');
    const verticalModules = document.querySelector('.vertical-modules');
    const toggleVerticalBtn = document.getElementById('sidebar-toggle-btn');
    const contextMenu = document.getElementById('contextMenu');
    const pageOverlay = document.getElementById('pageOverlay');

    // --- 2. 定义核心功能函数 (模块显隐等) ---

    /************************************************************/
    /* --- V2: 居中浮动窗口显隐逻辑 --- */
    /************************************************************/
    let isModuleVisible = false;

    const showModules = () => {
        if (!isModuleVisible) {
            pageOverlay.style.display = 'block';
            verticalModules.classList.add('visible');
            isModuleVisible = true;
        }
    };

    const hideModules = () => {
        if (isModuleVisible) {
            pageOverlay.style.display = 'none';
            verticalModules.classList.remove('visible');
            isModuleVisible = false;
        }
    };


    // --- 3. 绑定所有事件监听器 ---

    /************************************************************/
    /* --- 全局通用事件监听 --- */
    /************************************************************/
    // 隐藏右键菜单的全局事件
    window.addEventListener('scroll', hideContextMenu, true);
    window.addEventListener('resize', hideContextMenu);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
            hideModules(); // 按下Esc键也关闭模块窗口
        }
    });


    /************************************************************/
    /* --- 设置面板相关 --- */
    /************************************************************/
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
    applyTheme(localStorage.getItem('theme') || 'system'); // 初始化主题
    hoverToggle.checked = localStorage.getItem('hoverToOpenEnabled') !== 'false';
    isHoverEnabled = hoverToggle.checked;
    hoverToggle.addEventListener('change', (e) => {
        isHoverEnabled = e.target.checked;
        localStorage.setItem('hoverToOpenEnabled', isHoverEnabled);
        showToast(`悬停打开功能已${isHoverEnabled ? '开启' : '关闭'}`);
    });
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.toggle('visible');
    });
    themeOptionsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.theme-option')) applyTheme(e.target.dataset.themeValue);
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem('theme') === 'system') applyTheme('system');
    });


    /************************************************************/
    /* --- 浮动窗口（原侧边栏）相关 --- */
    /************************************************************/
    let hoverTimeout;
    toggleVerticalBtn.addEventListener('click', (e) => { e.stopPropagation(); isModuleVisible ? hideModules() : showModules(); });
    toggleVerticalBtn.addEventListener('mouseenter', () => { clearTimeout(hoverTimeout); hoverTimeout = setTimeout(showModules, 500); });
    toggleVerticalBtn.addEventListener('mouseleave', () => clearTimeout(hoverTimeout));
    verticalModules.addEventListener('mouseenter', () => clearTimeout(hoverTimeout));


    /************************************************************/
    /* --- 全局点击事件处理 --- */
    /************************************************************/
    document.addEventListener('click', (e) => {
        // 1. 点击外部区域清除选择
        const isClickOutsideActiveAreas = !e.target.closest('.bookmark-item') &&
            !e.target.closest('.context-menu') &&
            !e.target.closest('.move-dialog-content') &&
            !e.target.closest('.edit-dialog-content') &&
            !e.target.closest('.vertical-modules a');
        if (isClickOutsideActiveAreas) {
            clearSelection();
        }

        // 2. 点击外部关闭设置面板
        if (settingsPanel.classList.contains('visible') && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.classList.remove('visible');
        }

        // 3. 点击外部关闭右键菜单
        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
        }

        // 4. 【修改】点击外部关闭浮动窗口 (核心修复)
        const isClickOnDialog = e.target.closest('.move-dialog') ||
            e.target.closest('.edit-dialog') ||
            e.target.closest('.confirm-dialog');
        // 如果模块可见，并且点击位置不在模块、开关按钮、右键菜单、任何对话框之中，则关闭模块
        if (isModuleVisible && !verticalModules.contains(e.target) && !toggleVerticalBtn.contains(e.target) && !e.target.closest('.context-menu') && !isClickOnDialog) {
            hideModules();
        }
    });

    /************************************************************/
    /* --- 全局右键菜单处理 --- */
    /************************************************************/
    document.body.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.bookmark-item, .vertical-modules a');
        const column = e.target.closest('.bookmark-column');
        if (!item && !column) return;
        e.preventDefault();
        showContextMenu(e, item, column);
    });

    contextMenu.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li && li.id) {
            handleContextMenuAction(li.id, contextMenu.relatedTarget);
            hideContextMenu();
        }
    });

    // --- 4. 初始化应用 & 绑定 Chrome API 监听 ---

    const initializeApp = (bookmarks) => {
        allBookmarksFlat = [];
        flattenBookmarks(bookmarks[0].children, allBookmarksFlat);
        displayBookmarks(bookmarks);
        displayRecentBookmarks();
        displayTopSites();
    };

    const refreshAllData = () => {
        setTimeout(() => {
            chrome.bookmarks.getTree(bookmarks => {
                allBookmarksFlat = [];
                flattenBookmarks(bookmarks[0].children, allBookmarksFlat);
                displayRecentBookmarks();
            });
        }, 250);
    };

    // 首次加载
    chrome.bookmarks.getTree(initializeApp);

    // 监听书签变化
    chrome.bookmarks.onCreated.addListener((id, bookmark) => {
        handleBookmarkCreated(id, bookmark);
        refreshAllData();
    });
    chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
        handleBookmarkRemoved(id, removeInfo);
        refreshAllData();
    });
    chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
        handleBookmarkChanged(id, changeInfo);
        refreshAllData();
    });
    chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
        handleBookmarkMoved(id, moveInfo);
        refreshAllData();
    });

    // 其他监听
    document.addEventListener('keydown', handleSpacebarPreview);
    chrome.windows.onRemoved.addListener((id) => {
        if (id === previewWindowId) {
            previewWindowId = null;
        }
    });
});
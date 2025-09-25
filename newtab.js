// ==================================================================
// --- 全局常量 ---
// ==================================================================
const CONSTANTS = {
    BOOKMARKS_BAR_ID: '1',
    OTHER_BOOKMARKS_ID: '2',
    ROOT_ID: '0',
    SORT_TYPES: {
        ALPHA_ASC: 'sortAlphaAsc',
        ALPHA_DESC: 'sortAlphaDesc',
        DATE_NEW: 'sortDateNew',
        DATE_OLD: 'sortDateOld',
        VISIT: 'sortVisit'
    },
    STORAGE_KEYS: {
        THEME: 'theme',
        HOVER_ENABLED: 'hoverToOpenEnabled', // <-- 这里之前缺少了逗号
        HOVER_DELAY: 'hoverDelay'
    }
};

// ==================================================================
// --- 全局状态变量 ---
// ==================================================================

let isHoverEnabled = true;
let isDragging = false;
let suppressHover = false;
let draggedItem = null;
let dragOverTimeout = null;
let previewWindowId = null;
let currentlyHoveredItem = null;
let selectedItems = new Set();
let lastClickedId = null;
let allBookmarksFlat = [];
let historyWindowId = null;

// --- 新增：智能悬停状态变量 (简化版) ---
let hoverIntent = {
    timer: null,      // 全局唯一的计时器
    target: null      // 当前悬停的目标元素
};

// ==================================================================
// --- 核心修复：将 Lazy Loader 移至全局作用域 ---
// ==================================================================

const lazyLoadObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            // 保留 data-src 以便 onerror 使用
            observer.unobserve(img);
        }
    });
}, { rootMargin: '0px 0px 200px 0px' }); // 预加载视口下方200px内的图片

function observeLazyImages(container) {
    container.querySelectorAll('img[data-src]').forEach(img => {
        lazyLoadObserver.observe(img);
    });
}


// ==================================================================
// --- 核心功能函数 ---
// ==================================================================

// --- 辅助工具函数 ---
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function getBookmarkPath(bookmarkId) {
    return new Promise(resolve => {
        let path = [];
        const buildPath = (id) => {
            if (!id || id === CONSTANTS.ROOT_ID) {
                resolve(path.reverse().join(' / '));
                return;
            }
            chrome.bookmarks.get(id, (nodes) => {
                if (nodes && nodes[0]) {
                    const node = nodes[0];
                    let title = node.title;
                    if (node.parentId === CONSTANTS.ROOT_ID) {
                        if (node.id === CONSTANTS.BOOKMARKS_BAR_ID) title = '书签栏';
                        else if (node.id === CONSTANTS.OTHER_BOOKMARKS_ID) title = '其他书签';
                    }
                    if (title) {
                        path.push(title);
                    }
                    buildPath(node.parentId);
                } else {
                    resolve(path.reverse().join(' / '));
                }
            });
        };
        chrome.bookmarks.get(bookmarkId, (nodes) => {
            if (nodes && nodes[0]) {
                buildPath(nodes[0].parentId);
            } else {
                resolve('');
            }
        });
    });
}

function flattenBookmarks(nodes, flatList) {
    for (const node of nodes) {
        if (node.url) {
            flatList.push(node);
        }
        if (node.children) {
            flattenBookmarks(node.children, flatList);
        }
    }
}

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

function sanitizeText(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getIconUrl(url) {
    return `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// --- 多选相关函数 ---
function clearSelection() {
    selectedItems.clear();
    document.querySelectorAll('.bookmark-item.selected, .vertical-modules a.selected').forEach(el => el.classList.remove('selected'));
    lastClickedId = null;
}

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
function displayBookmarks(bookmarks) {
    const bookmarkContainer = document.getElementById('bookmarkContainer');
    const header = document.querySelector('.page-header');
    bookmarkContainer.innerHTML = '';

    const oldTopBar = header.querySelector('.bookmark-column[data-level="0"]');
    if (oldTopBar) oldTopBar.remove();

    const bookmarksBar = bookmarks[0] && bookmarks[0].children[0];
    if (bookmarksBar) {
        renderBookmarks(bookmarksBar.children, header, 0);
    }
}

// --- [新增] 只刷新书签栏的专用函数 ---
function refreshBookmarksBar() {
    // 1. 获取书签栏的父容器
    const header = document.querySelector('.page-header');
    if (!header) return;

    // 2. 获取最新的书签栏内容
    chrome.bookmarks.getChildren(CONSTANTS.BOOKMARKS_BAR_ID, (bookmarksBarItems) => {
        // 3. 移除旧的书签栏DOM
        const oldTopBar = header.querySelector('.bookmark-column[data-level="0"]');
        if (oldTopBar) oldTopBar.remove();

        // 4. 使用我们现有的 renderBookmarks 函数，只在 header 中渲染 level 0 的内容
        renderBookmarks(bookmarksBarItems, header, 0);
    });
}

function renderBookmarks(bookmarks, parentElement, level) {
    let column;
    const container = document.getElementById('bookmarkContainer');
    const fragment = document.createDocumentFragment();

    bookmarks.forEach((bookmark, index) => {
        const item = createBookmarkItem(bookmark, index);
        fragment.appendChild(item);
    });

    if (level === 0) {
        const header = document.querySelector('.page-header');
        column = document.createElement('div');
        column.className = 'bookmark-column';
        column.dataset.level = level;
        header.appendChild(column);

        column.appendChild(fragment);
        observeLazyImages(column);

    } else {
        const nextColumns = container.querySelectorAll(`.bookmark-column`);
        nextColumns.forEach(col => {
            if (parseInt(col.dataset.level) >= level) col.remove();
        });
        column = document.createElement('div');
        column.className = 'bookmark-column';
        column.dataset.level = level;
        container.appendChild(column);

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'column-content-wrapper';
        column.appendChild(contentWrapper);

        if (bookmarks.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-folder-message';
            emptyMsg.textContent = '这个文件夹是空的';
            contentWrapper.appendChild(emptyMsg);
        }

        contentWrapper.appendChild(fragment);
        observeLazyImages(contentWrapper);

        makeColumnResizable(column);
    }

    column.addEventListener('dragover', handleColumnDragOver);
    column.addEventListener('dragleave', handleColumnDragLeave);
    column.addEventListener('drop', handleColumnDrop);

    setTimeout(() => {
        if (container.contains(column)) {
            adjustColumnWidths(container);
            requestAnimationFrame(() => {
                if (level > 0) {
                    container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
                }
            });
        }
    }, 0);
}

function createBookmarkItem(bookmark, index) {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.dataset.id = bookmark.id;
    item.dataset.url = bookmark.url || '';
    item.dataset.index = index;
    item.dataset.parentId = bookmark.parentId;
    item.dataset.title = bookmark.title || 'No Title';
    item.draggable = true;

    const icon = document.createElement('img');
    icon.className = 'bookmark-icon';
    const isFolder = !bookmark.url;
    if (isFolder) {
        icon.src = '/img/folder_icon.svg';
    } else {
        icon.src = '';
        icon.dataset.src = getIconUrl(bookmark.url);
    }
    icon.onerror = () => icon.src = '/img/folder_icon.svg';

    const title = document.createElement('span');
    title.textContent = sanitizeText(bookmark.title || 'No Title');
    title.className = 'bookmark-title';

    item.appendChild(icon);
    item.appendChild(title);

    if (isFolder) {
        item.classList.add('is-folder');
    }

    if (bookmark.url && bookmark.url.includes('github.com')) {
        item.classList.add('is-github-link');
    }

    // --- [清理后] 的事件监听 ---
    item.addEventListener('mouseenter', () => currentlyHoveredItem = item);
    item.addEventListener('mouseleave', () => currentlyHoveredItem = null);

    item.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            toggleSelection(item);
        } else if (e.shiftKey) {
            e.preventDefault();
            if (lastClickedId) {
                selectRange(lastClickedId, item.dataset.id, item.parentElement);
            } else {
                clearSelection();
                toggleSelection(item);
            }
        } else {
            if (!selectedItems.has(item.dataset.id)) {
                clearSelection();
                toggleSelection(item);
            }
        }
    });

    item.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
            return;
        }
        if (!isFolder) {
            window.open(bookmark.url, '_blank');
        } else {
            handleFolderClick(item, bookmark.id);
        }
    });

    // --- 应用最终版的悬停逻辑 ---
    if (isFolder) {
        item.addEventListener('mouseenter', () => {
            startHoverIntent(item);
        });
        item.addEventListener('mouseleave', () => {
            clearHoverIntent();
        });
    }

    // --- 拖放事件监听器 ---
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
    const level = parseInt(folderItem.closest('.bookmark-column').dataset.level, 10);

    folderItem.parentElement.querySelectorAll('.bookmark-item.highlighted').forEach(i => i.classList.remove('highlighted'));

    if (!isHighlighted) {
        folderItem.classList.add('highlighted');
        chrome.bookmarks.getChildren(bookmarkId, (freshChildren) => {
            renderBookmarks(freshChildren, document.getElementById('bookmarkContainer'), level + 1);
        });
    } else {
        const container = document.getElementById('bookmarkContainer');
        const nextColumns = container.querySelectorAll(`.bookmark-column`);
        nextColumns.forEach(col => {
            if (parseInt(col.dataset.level) > level) col.remove();
        });
    }
}

// --- [最终版] 智能悬停核心函数 ---

/**
 * 为指定元素启动一个悬停意图。
 * @param {HTMLElement} item - 目标文件夹元素
 */
function startHoverIntent(item) {
    clearTimeout(hoverIntent.timer);

    if (!isHoverEnabled || isDragging || suppressHover || document.body.dataset.contextMenuOpen || selectedItems.size > 1) {
        return;
    }

    hoverIntent.target = item;

    // [核心修改] 从 localStorage 读取延迟，如果不存在则默认为 500
    const delay = parseInt(localStorage.getItem(CONSTANTS.STORAGE_KEYS.HOVER_DELAY) || '500', 10);

    hoverIntent.timer = setTimeout(() => {
        if (hoverIntent.target === item) {
            const currentHighlighted = item.parentElement.querySelector('.bookmark-item.highlighted');
            if (item !== currentHighlighted) {
                handleFolderClick(item, item.dataset.id);
            }
        }
    }, delay);
}

/**
 * 取消一个可能正在等待的悬停意图。
 */
function clearHoverIntent() {
    // 无论如何，都清除计时器和目标
    clearTimeout(hoverIntent.timer);
    hoverIntent.target = null;
}

function makeColumnResizable(column) {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    column.appendChild(handle);

    const overlay = document.querySelector('.resizing-overlay');
    const indicator = document.querySelector('.resize-indicator');
    const container = document.getElementById('bookmarkContainer');

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = column.offsetWidth;

        const containerRect = container.getBoundingClientRect();
        indicator.style.top = `${containerRect.top}px`;
        indicator.style.height = `${containerRect.height}px`;
        indicator.style.left = `${e.clientX}px`;

        document.body.classList.add('is-resizing');
        overlay.style.display = 'block';

        const handleMouseMove = (moveEvent) => {
            indicator.style.left = `${moveEvent.clientX}px`;
        };

        const handleMouseUp = (moveEvent) => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            document.body.classList.remove('is-resizing');
            overlay.style.display = 'none';

            const finalX = moveEvent.clientX;
            const deltaX = finalX - startX;
            let newWidth = startWidth + deltaX;

            if (newWidth < 180) {
                newWidth = 180;
            }

            column.style.width = `${newWidth}px`;
            column.dataset.userResized = 'true';

            adjustColumnWidths(container);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });
}

function adjustColumnWidths(container) {
    const columns = Array.from(container.querySelectorAll('.bookmark-column'));
    if (columns.length === 0) return;

    const gap = parseInt(window.getComputedStyle(container).gap) || 20;
    const containerWidth = container.clientWidth;
    const DEFAULT_COL_WIDTH = 280;

    columns.forEach(col => {
        if (!col.dataset.userResized) {
            col.style.width = '';
        }
    });

    const totalWidth = columns.reduce((sum, col) => sum + col.offsetWidth, 0) + (columns.length - 1) * gap;

    if (totalWidth > containerWidth) {
        const overflow = totalWidth - containerWidth;
        const columnsToShrink = columns.slice(0, -1);
        let totalShrinkableWidth = columnsToShrink.reduce((sum, col) => sum + col.offsetWidth, 0);

        if (columnsToShrink.length > 0) {
            for (const col of columnsToShrink) {
                const proportion = col.offsetWidth / totalShrinkableWidth;
                const shrinkAmount = overflow * proportion;
                const newWidth = col.offsetWidth - shrinkAmount;
                col.style.width = `${Math.max(180, newWidth)}px`;
            }
        }
    } else {
        const availableSpace = containerWidth - totalWidth;
        const columnsToEnlarge = columns.filter(col => col.offsetWidth < DEFAULT_COL_WIDTH);
        if (columnsToEnlarge.length > 0) {
            let totalEnlargePotential = columnsToEnlarge.reduce((sum, col) => sum + (DEFAULT_COL_WIDTH - col.offsetWidth), 0);
            if (totalEnlargePotential > 0) {
                for (const col of columnsToEnlarge) {
                    const potential = DEFAULT_COL_WIDTH - col.offsetWidth;
                    const proportion = potential / totalEnlargePotential;
                    const enlargeAmount = availableSpace * proportion;
                    const newWidth = col.offsetWidth + enlargeAmount;
                    col.style.width = `${Math.min(DEFAULT_COL_WIDTH, newWidth)}px`;
                }
            }
        }
    }
}

// --- 拖拽逻辑 ---
function handleDragStart(e) {
    isDragging = true;
    draggedItem = e.target.closest('.bookmark-item');

    if (!selectedItems.has(draggedItem.dataset.id)) {
        clearSelection();
        toggleSelection(draggedItem);
    }

    const idsToDrag = Array.from(selectedItems);
    e.dataTransfer.setData('application/json', JSON.stringify(idsToDrag));
    e.dataTransfer.effectAllowed = 'move';

    queueMicrotask(() => {
        idsToDrag.forEach(id => {
            const el = document.querySelector(`.bookmark-item[data-id="${id}"]`);
            if (el) el.classList.add('dragging');
        });
    });

    e.stopPropagation();
}

function handleDragEnd(e) {
    isDragging = false;
    // 核心修复：立即激活悬停抑制标志
    suppressHover = true;

    // 在短暂延迟后，重新启用悬停功能。
    // 这就创建了一个“冷却期”，防止刚刚拖放的目标文件夹被意外打开。
    setTimeout(() => {
        suppressHover = false;
    }, 300); // 300毫秒的冷却时间，足够用户移开鼠标

    clearTimeout(dragOverTimeout);
    // 清空所有选中状态
    clearSelection();
    // 清理所有拖拽相关的样式
    document.querySelectorAll('.bookmark-item.dragging').forEach(el => el.classList.remove('dragging'));
    draggedItem = null;
    document.querySelectorAll('.bookmark-item, .bookmark-column').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter', 'column-drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    const targetItem = e.target.closest('.bookmark-item');
    if (!targetItem) return;

    if (selectedItems.has(targetItem.dataset.id)) {
        return;
    }

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

function handleDragLeave(e) {
    clearTimeout(dragOverTimeout);
    const targetItem = e.target.closest('.bookmark-item');
    if (targetItem) {
        targetItem.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
    }
}

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

    if (classes.contains('drag-enter')) {
        destination.parentId = dropTarget.dataset.id;
        destination.index = 0;
    } else {
        destination.parentId = dropTarget.dataset.parentId;
        let newIndex = parseInt(dropTarget.dataset.index, 10);
        if (classes.contains('drag-over-after') || classes.contains('drag-over-bottom')) {
            newIndex++;
        }
        destination.index = newIndex;
    }

    idsToMove.forEach(id => {
        chrome.bookmarks.move(id, destination).catch(err => {
            console.error(`移动书签 ${id} 失败:`, err);
            showToast('移动失败，目标可能无效');
        });
    });
    showToast(`移动了 ${idsToMove.length} 个项目`);
}

function handleColumnDragOver(e) {
    e.preventDefault();
    if (e.target.classList.contains('bookmark-column')) {
        e.target.classList.add('column-drag-over');
    }
}

function handleColumnDragLeave(e) {
    if (e.target.classList.contains('bookmark-column')) {
        e.target.classList.remove('column-drag-over');
    }
}

function handleColumnDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const idsToMove = JSON.parse(e.dataTransfer.getData('application/json'));
    if (!idsToMove || idsToMove.length === 0) return;

    const column = e.target.closest('.bookmark-column');
    column.classList.remove('column-drag-over');

    let parentId = null;
    const level = parseInt(column.dataset.level, 10);

    if (level === 0) {
        parentId = CONSTANTS.BOOKMARKS_BAR_ID;
    } else {
        const prevColumn = document.querySelector(`.bookmark-column[data-level="${level - 1}"]`);
        if (prevColumn) {
            parentId = prevColumn.querySelector('.bookmark-item.highlighted')?.dataset.id;
        }
    }

    if (parentId) {
        idsToMove.forEach(id => {
            if (id) {
                chrome.bookmarks.move(id, { parentId: parentId, index: 0 })
                    .catch(err => {
                        console.error(`移动书签 ${id} 失败:`, err);
                        showToast('部分项目移动失败');
                    });
            }
        });
        showToast(`移动了 ${idsToMove.length} 个项目`);
    }
}

// --- 右键菜单 ---
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
    const isModuleItem = bookmarkElement?.closest('.vertical-modules');

    if (rightClickedId && !selectedItems.has(rightClickedId)) {
        clearSelection();
        toggleSelection(bookmarkElement);
    } else if (!rightClickedId) {
        clearSelection();
    }

    const selectionSize = selectedItems.size;
    const hasBookmarkInSelection = Array.from(selectedItems).some(id => {
        const item = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);
        return item && !item.classList.contains('is-folder');
    });

    if (selectionSize > 0) {
        if (selectionSize > 1) {
            if (hasBookmarkInSelection) {
                menuHtml += `<li id="open"><img src="/img/open_all.svg" class="menu-icon">打开全部 (${selectionSize})</li>`;
                menuHtml += `<li id="openNew"><img src="/img/open_new.svg" class="menu-icon">新窗口打开全部 (${selectionSize})</li>`;
                menuHtml += `<li id="openIncognito"><img src="/img/open_new.svg" class="menu-icon">隐身模式打开全部 (${selectionSize})</li>`;
                menuHtml += `<hr>`;
            }
        } else {
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
            menuHtml += `<li id="properties"><img src="/img/rename.svg" class="menu-icon">属性</li>`;
        }
        menuHtml += `<hr>`;
        menuHtml += `<li id="delete"><img src="/img/delete.svg" class="menu-icon">删除${selectionSize > 1 ? ` (${selectionSize})` : ''}</li>`;
    }

    if (column && !isModuleItem) {
        if (menuHtml !== '') menuHtml += `<hr>`;
        menuHtml += `<li id="newFolder"><img src="/img/folder.svg" class="menu-icon">新建文件夹</li><hr>`;
        menuHtml += `<li id="${CONSTANTS.SORT_TYPES.ALPHA_ASC}"><img src="/img/sort_asc.svg" class="menu-icon">排序：由 A 到 Z</li>`;
        menuHtml += `<li id="${CONSTANTS.SORT_TYPES.ALPHA_DESC}"><img src="/img/sort_desc.svg" class="menu-icon">排序：由 Z 到 A</li>`;
        menuHtml += `<li id="${CONSTANTS.SORT_TYPES.DATE_NEW}"><img src="/img/sort_asc.svg" class="menu-icon">排序：从新到旧</li>`;
        menuHtml += `<li id="${CONSTANTS.SORT_TYPES.DATE_OLD}"><img src="/img/sort_desc.svg" class="menu-icon">排序：从旧到新</li>`;
        menuHtml += `<li id="${CONSTANTS.SORT_TYPES.VISIT}"><img src="/img/sort_asc.svg" class="menu-icon">排序：按上次打开</li>`;
    }

    ul.innerHTML = menuHtml;
    contextMenu.appendChild(ul);
    contextMenu.style.display = 'block';

    const { innerWidth: winWidth, innerHeight: winHeight } = window;
    const { offsetWidth: menuWidth, offsetHeight: menuHeight } = contextMenu;
    let left = e.clientX,
        top = e.clientY;
    if (left + menuWidth > winWidth) left = winWidth - menuWidth - 5;
    if (top + menuHeight > winHeight) top = winHeight - menuHeight - 5;
    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;

    contextMenu.relatedTarget = bookmarkElement;
    contextMenu.relatedColumn = column;
    document.body.dataset.contextMenuOpen = 'true';
}

function handleContextMenuAction(action, element) {
    const selectionSize = selectedItems.size;
    const selectedIds = Array.from(selectedItems);

    if (Object.values(CONSTANTS.SORT_TYPES).includes(action)) {
        const column = document.getElementById('contextMenu').relatedColumn;
        if (!column) return;
        let parentId;
        if (element && element.classList.contains('is-folder')) {
            parentId = element.dataset.id;
        } else if (element) {
            parentId = element.dataset.parentId;
        } else {
            const level = parseInt(column.dataset.level, 10);
            if (level === 0) parentId = CONSTANTS.BOOKMARKS_BAR_ID;
            else parentId = document.querySelector(`.bookmark-column[data-level="${level - 1}"] .bookmark-item.highlighted`)?.dataset.id;
        }
        if (parentId) handleSortBookmarks(parentId, action);
        return;
    }

    switch (action) {
        case 'open':
        case 'openNew':
        case 'openIncognito':
            selectedIds.forEach(id => {
                const item = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);
                if (item && item.dataset.url) {
                    if (action === 'open') window.open(item.dataset.url, '_blank');
                    else if (action === 'openNew') chrome.windows.create({ url: item.dataset.url });
                    else if (action === 'openIncognito') chrome.windows.create({ url: item.dataset.url, incognito: true });
                }
            });
            break;
        case 'openAll':
            if (element && element.dataset.id) {
                chrome.bookmarks.getChildren(element.dataset.id, (children) => {
                    children.forEach(child => {
                        if (child.url) {
                            window.open(child.url, '_blank');
                        }
                    });
                });
            }
            break;
        case 'delete':
            showConfirmDialog(`删除 ${selectionSize} 个项目`, `确定要删除这 ${selectionSize} 个选中的项目吗?`, () => {
                selectedIds.forEach(id => {
                    const item = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);
                    if (!item) return;
                    const isFolder = item.classList.contains('is-folder');
                    const promise = isFolder ? chrome.bookmarks.removeTree(id) : chrome.bookmarks.remove(id);
                    promise.catch(err => {
                        console.error(`删除项目 ${id} 失败:`, err);
                        showToast(`项目 "${item.dataset.title}" 删除失败`);
                    });
                });
            });
            break;
        case 'move':
            showMoveDialog(element, selectedIds);
            break;
        case 'copyUrl':
            if (element && element.dataset.url) {
                navigator.clipboard.writeText(element.dataset.url).then(() => showToast('网址已复制'));
            }
            break;
        case 'rename':
            if (element && element.dataset.title) {
                showEditDialog('重命名', element.dataset.title, null, (newName) => {
                    if (newName) {
                        chrome.bookmarks.update(element.dataset.id, { title: newName })
                            .catch(err => {
                                console.error('重命名失败:', err);
                                showToast('重命名失败');
                            });
                    }
                });
            }
            break;
        case 'editUrl':
            if (element && element.dataset.url) {
                showEditDialog('修改网址', element.dataset.url, isValidUrl, (newUrl) => {
                    if (newUrl && newUrl !== element.dataset.url) {
                        chrome.bookmarks.update(element.dataset.id, { url: newUrl })
                            .catch(err => {
                                console.error('修改网址失败:', err);
                                showToast('修改网址失败');
                            });
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
                    if (level === 0) parentId = CONSTANTS.BOOKMARKS_BAR_ID;
                    else parentId = document.querySelector(`.bookmark-column[data-level="${level - 1}"] .bookmark-item.highlighted`)?.dataset.id;
                }
                if (parentId) showEditDialog('新建文件夹', '', null, (name) => {
                    if (name) {
                        chrome.bookmarks.create({ parentId, title: name, index: 0 })
                            .catch(err => {
                                console.error('新建文件夹失败:', err);
                                showToast('新建文件夹失败');
                            });
                    }
                });
                break;
            }
        case 'properties':
            showPropertiesDialog(element);
            break;
    }
}

async function handleSortBookmarks(parentId, sortType) {
    chrome.bookmarks.getChildren(parentId, async (children) => {
        if (!children || children.length < 2) return;
        showToast('正在排序...');
        let sortedChildren;

        switch (sortType) {
            case CONSTANTS.SORT_TYPES.DATE_NEW:
                sortedChildren = children.sort((a, b) => b.dateAdded - a.dateAdded);
                break;
            case CONSTANTS.SORT_TYPES.DATE_OLD:
                sortedChildren = children.sort((a, b) => a.dateAdded - b.dateAdded);
                break;
            case CONSTANTS.SORT_TYPES.ALPHA_ASC:
                sortedChildren = children.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case CONSTANTS.SORT_TYPES.ALPHA_DESC:
                sortedChildren = children.sort((a, b) => b.title.localeCompare(a.title));
                break;
            case CONSTANTS.SORT_TYPES.VISIT:
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

        for (let i = 0; i < sortedChildren.length; i++) {
            if (sortedChildren[i].index !== i) {
                await new Promise(resolve => chrome.bookmarks.move(sortedChildren[i].id, { parentId: parentId, index: i }, resolve));
            }
        }

        refreshAllData();
        showToast('排序完成');
    });
}

// --- 弹窗对话框 (Dialogs) ---
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

function showMoveDialog(bookmarkElement, idsToMove) {
    const dialog = document.getElementById('moveDialog'),
        treeContainer = document.getElementById('bookmarkTree'),
        confirmBtn = document.getElementById('confirmMove'),
        cancelBtn = document.getElementById('cancelMove');

    let selectedFolderId = null;
    let disabledFolderIds = new Set(idsToMove);

    const close = () => {
        dialog.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        treeContainer.innerHTML = '';
    };

    const renderTree = (nodes, parentElement, level) => {
        nodes.forEach(node => {
            if (node.url) return;

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
            title.textContent = node.title || (node.id === CONSTANTS.BOOKMARKS_BAR_ID ? '书签栏' : '其他书签');
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
                if (id !== selectedFolderId) {
                    chrome.bookmarks.move(id, { parentId: selectedFolderId, index: 0 })
                        .catch(err => {
                            console.error(`从对话框移动书签 ${id} 失败:`, err);
                            showToast('部分项目移动失败');
                        });
                }
            });
        }
        close();
    };

    cancelBtn.onclick = close;
}

async function showPropertiesDialog(element) {
    if (!element) return;

    const dialog = document.getElementById('propertiesDialog'),
        bodyEl = document.getElementById('propertiesDialogBody'),
        closeBtn = document.getElementById('closeProperties');

    const bookmarkId = element.dataset.id;
    if (!bookmarkId) return;

    const [bookmarkDetails] = await new Promise(resolve => chrome.bookmarks.get(bookmarkId, resolve));
    const bookmarkPath = await getBookmarkPath(bookmarkId);

    const properties = [
        { label: '名称', value: bookmarkDetails.title },
        { label: '网址 (URL)', value: bookmarkDetails.url || 'N/A (这是一个文件夹)' },
        { label: '路径', value: bookmarkPath || '根目录' },
        { label: '添加时间', value: formatDateTime(bookmarkDetails.dateAdded) },
        { label: 'ID', value: bookmarkDetails.id }
    ];

    bodyEl.innerHTML = properties.map(prop => `
        <div class="prop-item">
            <span class="prop-label">${prop.label}</span>
            <span class="prop-value">${sanitizeText(prop.value)}</span>
        </div>
    `).join('');

    dialog.style.display = 'flex';
    closeBtn.focus();

    const close = () => {
        dialog.style.display = 'none';
        closeBtn.onclick = null;
    };

    closeBtn.onclick = close;
}

// --- Chrome API 事件监听与处理 ---
function findColumnForParentId(parentId) {
    if (parentId === CONSTANTS.BOOKMARKS_BAR_ID) return document.querySelector('.bookmark-column[data-level="0"]');

    const parentItem = document.querySelector(`.bookmark-item[data-id="${parentId}"]`);
    if (parentItem && parentItem.classList.contains('highlighted')) {
        const level = parseInt(parentItem.closest('.bookmark-column').dataset.level, 10);
        return document.querySelector(`.bookmark-column[data-level="${level + 1}"]`);
    }
    return null;
}

function reindexColumnItems(column) {
    if (!column) return;
    // 核心修改：确保我们只选择直接子元素
    const items = column.children;
    for (let i = 0; i < items.length; i++) {
        if (items[i].classList.contains('bookmark-item')) {
            items[i].dataset.index = i;
        }
    }
}

// --- [修复后] 的 handleBookmarkCreated 函数 ---
function handleBookmarkCreated(id, bookmark) {
    const parentColumn = findColumnForParentId(bookmark.parentId);
    if (parentColumn) {
        const newItem = createBookmarkItem(bookmark, bookmark.index);
        const wrapper = parentColumn.querySelector('.column-content-wrapper') || parentColumn;
        wrapper.insertBefore(newItem, wrapper.children[bookmark.index]);

        // --- 新增修复代码 ---
        observeLazyImages(newItem); // 观察新创建的这个书签项

        reindexColumnItems(wrapper);
    }
    displayRecentBookmarks(); // 刷新最近添加
}

function handleBookmarkRemoved(id, removeInfo) {
    const itemToRemove = document.querySelector(`.bookmark-item[data-id="${id}"]`);
    if (itemToRemove) {
        const column = itemToRemove.closest('.bookmark-column');
        if (itemToRemove.classList.contains('highlighted')) {
            const level = parseInt(column.dataset.level, 10);
            document.querySelectorAll('.bookmark-column').forEach(col => {
                if (parseInt(col.dataset.level, 10) > level) col.remove();
            });
        }
        const parentWrapper = itemToRemove.parentElement;
        itemToRemove.remove();
        reindexColumnItems(parentWrapper);
    }
    displayRecentBookmarks();
}

// --- [最终修复版] handleBookmarkChanged 函数 ---
function handleBookmarkChanged(id, changeInfo) {
    // 首先，更新内存中的数据，这对于后续的筛选很重要
    const bookmarkInData = allBookmarksFlat.find(bm => bm.id === id);
    if (bookmarkInData) {
        Object.assign(bookmarkInData, changeInfo);
    }

    // 然后，更新界面上所有匹配的元素
    document.querySelectorAll(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`).forEach(item => {
        if (changeInfo.title) {
            item.dataset.title = changeInfo.title;
            const titleEl = item.querySelector('.bookmark-title') || item.querySelector('.module-title');
            if (titleEl) titleEl.textContent = sanitizeText(changeInfo.title);
        }
        if (changeInfo.url) {
            item.dataset.url = changeInfo.url;
            const iconEl = item.querySelector('.bookmark-icon') || item.querySelector('.module-icon');
            if (iconEl) {
                // 核心修复：不再清空 src，而是直接更新 data-src 并重新观察
                // 这样可以避免不必要的闪烁
                const newIconUrl = getIconUrl(changeInfo.url);
                iconEl.dataset.src = newIconUrl;
                lazyLoadObserver.observe(iconEl);
            }
        }
    });
}

// --- 侧边栏模块 (Modules) ---
async function displayRecentBookmarks() {
    const container = document.querySelector('#recentBookmarksModule .module-content');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const quickFiltersContainer = document.getElementById('quickFilters');
    if (!container || !startDateInput || !endDateInput || !quickFiltersContainer) return;

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

            const icon = document.createElement('img');
            icon.className = 'module-icon';
            icon.src = '';
            icon.dataset.src = getIconUrl(item.url);

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'bookmark-content-wrapper';

            const title = document.createElement('span');
            title.className = 'module-title';
            title.textContent = sanitizeText(item.title);

            const metaInfo = document.createElement('div');
            metaInfo.className = 'bookmark-meta-info';

            const pathUrlWrapper = document.createElement('div');
            pathUrlWrapper.className = 'bookmark-path-url-wrapper';

            const pathSpan = document.createElement('span');
            pathSpan.className = 'bookmark-item-path';
            pathSpan.textContent = await getBookmarkPath(item.id);

            const urlSpan = document.createElement('span');
            urlSpan.className = 'bookmark-item-url';
            urlSpan.textContent = item.url.replace(/^https?:\/\//, '').replace(/^www\./, '');

            pathUrlWrapper.append(urlSpan, pathSpan);

            const dateSpan = document.createElement('span');
            dateSpan.className = 'bookmark-item-date';
            dateSpan.textContent = formatDateTime(item.dateAdded);

            metaInfo.append(pathUrlWrapper, dateSpan);
            contentWrapper.append(title, metaInfo);
            a.append(icon, contentWrapper);

            a.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, a, a.closest('.vertical-modules'));
            });
            a.addEventListener('mouseenter', () => currentlyHoveredItem = a);
            a.addEventListener('mouseleave', () => currentlyHoveredItem = null);

            a.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                if (e.metaKey || e.ctrlKey || e.shiftKey) {
                    e.preventDefault();
                }
                if (!selectedItems.has(a.dataset.id)) {
                    clearSelection();
                    toggleSelection(a);
                }
            });

            fragment.appendChild(a);
        }
        container.appendChild(fragment);
        observeLazyImages(container);
    };

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

function displayTopSites() {
    const container = document.getElementById('topSitesContent');
    if (!container) return;
    chrome.topSites.get((items) => {
        container.innerHTML = '';

        if (!items || items.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-folder-message';
            emptyMsg.textContent = '暂无常访问网站';
            emptyMsg.style.padding = '16px';
            container.appendChild(emptyMsg);
            return;
        }

        const fragment = document.createDocumentFragment();
        items.slice(0, 15).forEach(item => {
            const a = document.createElement('a');
            a.className = 'top-site-item';
            a.href = item.url;
            a.target = '_blank';
            a.title = sanitizeText(item.title);

            const icon = document.createElement('img');
            icon.className = 'top-site-icon';
            icon.src = '';
            icon.dataset.src = getIconUrl(item.url);

            const title = document.createElement('span');
            title.className = 'top-site-title';
            title.textContent = sanitizeText(item.title);

            a.append(icon, title);

            a.addEventListener('mouseenter', () => currentlyHoveredItem = a);
            a.addEventListener('mouseleave', () => currentlyHoveredItem = null);

            fragment.appendChild(a);
        });
        container.appendChild(fragment);
        observeLazyImages(container);
    });
}

// --- 其他功能 ---
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

function openPreviewWindow(url) {
    if (previewWindowId !== null) {
        chrome.windows.get(previewWindowId, {}, (win) => {
            if (chrome.runtime.lastError) {
                previewWindowId = null;
                createSizedPreviewWindow(url);
            } else {
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
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const themeOptionsContainer = settingsPanel.querySelector('.theme-options');
    const hoverToggle = document.getElementById('hover-toggle-switch');
    const verticalModules = document.querySelector('.vertical-modules');
    const toggleVerticalBtn = document.getElementById('sidebar-toggle-btn');
    const contextMenu = document.getElementById('contextMenu');
    const pageOverlay = document.getElementById('pageOverlay');
    const hoverDelaySettingItem = document.getElementById('hover-delay-setting-item');
    const hoverDelayInput = document.getElementById('hover-delay-input');
    const historyBtn = document.getElementById('history-btn');
    // ▼▼▼ 删除从这里开始的所有代码 ▼▼▼
    const topSitesBar = document.getElementById('topSitesBar');
    let topSitesHoverTimeout;

    topSitesBar.addEventListener('mouseenter', () => {
        clearTimeout(topSitesHoverTimeout);
        topSitesHoverTimeout = setTimeout(() => {
            topSitesBar.classList.add('expanded');
        }, 250);
    });

    topSitesBar.addEventListener('mouseleave', () => {
        clearTimeout(topSitesHoverTimeout);
        topSitesBar.classList.remove('expanded');
    });
    // ▲▲▲ 删除到这里结束 ▲▲▲
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

    historyBtn.addEventListener('click', () => {
        if (historyWindowId !== null) {
            chrome.windows.get(historyWindowId, {}, (win) => {
                if (chrome.runtime.lastError) {
                    historyWindowId = null;
                    createNewHistoryWindow();
                } else {
                    chrome.windows.update(historyWindowId, { focused: true });
                }
            });
        } else {
            createNewHistoryWindow();
        }
    });

    function createNewHistoryWindow() {
        chrome.windows.getCurrent({}, (currentWindow) => {
            const minWidth = 970;
            const maxWidth = 1200;
            const idealWidth = Math.round(currentWindow.width * 0.7);
            const width = Math.min(maxWidth, Math.max(minWidth, idealWidth));
            const height = Math.round(currentWindow.height * 0.8);
            const top = currentWindow.top + Math.round((currentWindow.height - height) * 0.5);
            const left = currentWindow.left + Math.round((currentWindow.width - width) * 0.5);

            chrome.windows.create({
                url: 'chrome://history',
                type: 'popup',
                width: width,
                height: height,
                top: top,
                left: left
            }, (win) => {
                historyWindowId = win.id;
            });
        });
    }

    window.addEventListener('scroll', hideContextMenu, true);
    window.addEventListener('resize', hideContextMenu);

    const bookmarkContainer = document.getElementById('bookmarkContainer');
    const debouncedAdjust = debounce(() => {
        adjustColumnWidths(bookmarkContainer);
    }, 100);
    const resizeObserver = new ResizeObserver(entries => {
        debouncedAdjust();
    });
    resizeObserver.observe(bookmarkContainer);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
            hideModules();
        }
    });

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
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.THEME, theme);
        updateThemeButtons(theme);
    };
    applyTheme(localStorage.getItem(CONSTANTS.STORAGE_KEYS.THEME) || 'system');
    hoverToggle.checked = localStorage.getItem(CONSTANTS.STORAGE_KEYS.HOVER_ENABLED) !== 'false';
    isHoverEnabled = hoverToggle.checked;

    // --- [最终版] 悬停功能设置的完整逻辑 ---

    // 初始化总开关的状态
    hoverToggle.checked = localStorage.getItem(CONSTANTS.STORAGE_KEYS.HOVER_ENABLED) !== 'false';
    isHoverEnabled = hoverToggle.checked;

    // 初始化延迟输入框的值
    const savedDelay = localStorage.getItem(CONSTANTS.STORAGE_KEYS.HOVER_DELAY) || '500';
    hoverDelayInput.value = savedDelay;

    // 根据总开关的初始状态，决定是否显示和启用延迟输入框
    const setDelayInputState = (enabled) => {
        hoverDelaySettingItem.style.opacity = enabled ? '1' : '0.4';
        hoverDelaySettingItem.style.pointerEvents = enabled ? 'auto' : 'none';
    };
    setDelayInputState(isHoverEnabled);

    // 监听总开关的变化
    hoverToggle.addEventListener('change', (e) => {
        isHoverEnabled = e.target.checked;
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.HOVER_ENABLED, isHoverEnabled);
        showToast(`悬停打开功能已${isHoverEnabled ? '开启' : '关闭'}`);
        setDelayInputState(isHoverEnabled); // 联动更新延迟输入框的状态
    });

    // 监听延迟输入框的变化
    hoverDelayInput.addEventListener('change', () => {
        let newDelay = parseInt(hoverDelayInput.value, 10);

        // 输入验证：确保值在合理范围内 (200ms - 2000ms)
        if (isNaN(newDelay) || newDelay < 200) {
            newDelay = 200;
        } else if (newDelay > 2000) {
            newDelay = 2000;
        }

        hoverDelayInput.value = newDelay; // 将修正后的值写回输入框
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.HOVER_DELAY, newDelay);
        showToast('悬停延迟已保存');
    });

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.toggle('visible');
    });
    themeOptionsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.theme-option')) applyTheme(e.target.dataset.themeValue);
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem(CONSTANTS.STORAGE_KEYS.THEME) === 'system') applyTheme('system');
    });

    let hoverTimeout;
    toggleVerticalBtn.addEventListener('click', (e) => { e.stopPropagation(); isModuleVisible ? hideModules() : showModules(); });
    toggleVerticalBtn.addEventListener('mouseenter', () => { clearTimeout(hoverTimeout); hoverTimeout = setTimeout(showModules, 500); });
    toggleVerticalBtn.addEventListener('mouseleave', () => clearTimeout(hoverTimeout));
    verticalModules.addEventListener('mouseenter', () => clearTimeout(hoverTimeout));

    document.addEventListener('click', (e) => {
        const isClickOutsideActiveAreas = !e.target.closest('.bookmark-item') &&
            !e.target.closest('.context-menu') &&
            !e.target.closest('.move-dialog-content') &&
            !e.target.closest('.edit-dialog-content') &&
            !e.target.closest('.vertical-modules a');
        if (isClickOutsideActiveAreas) {
            clearSelection();
        }

        if (settingsPanel.classList.contains('visible') && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.classList.remove('visible');
        }

        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
        }

        const isClickOnDialog = e.target.closest('.move-dialog') ||
            e.target.closest('.edit-dialog') ||
            e.target.closest('.confirm-dialog');
        if (isModuleVisible && !verticalModules.contains(e.target) && !toggleVerticalBtn.contains(e.target) && !e.target.closest('.context-menu') && !isClickOnDialog) {
            hideModules();
        }
    });

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

    const initializeApp = (bookmarks) => {
        allBookmarksFlat = [];
        flattenBookmarks(bookmarks[0].children, allBookmarksFlat);
        displayBookmarks(bookmarks);
        displayRecentBookmarks();
        displayTopSites();
        observeLazyImages(document.body);
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

    chrome.bookmarks.getTree(initializeApp);

    chrome.bookmarks.onCreated.addListener((id, bookmark) => {
        handleBookmarkCreated(id, bookmark);
        refreshAllData();
    });
    chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
        handleBookmarkRemoved(id, removeInfo);
        refreshAllData();
    });
    chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
        handleBookmarkChanged(id, changeInfo); // <-- 只保留这一行
    });
    chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
        const { parentId, oldParentId } = moveInfo;
        const movedItemElement = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);

        if (movedItemElement) {
            movedItemElement.remove();
        } else {
            const oldParentItem = document.querySelector(`.bookmark-item.highlighted[data-id="${oldParentId}"]`);
            if (oldParentItem) {
                const wasHighlighted = oldParentItem.classList.contains('highlighted');
                handleFolderClick(oldParentItem, oldParentId);
                if (wasHighlighted) {
                    setTimeout(() => handleFolderClick(oldParentItem, oldParentId), 50);
                }
            }
        }

        const newParentItem = document.querySelector(`.bookmark-item.highlighted[data-id="${parentId}"]`);

        if (newParentItem) {
            chrome.bookmarks.getChildren(parentId, (freshChildren) => {
                const movedItemInfo = freshChildren.find(child => child.id === id);
                if (movedItemInfo) {
                    const newItemElement = createBookmarkItem(movedItemInfo, movedItemInfo.index);
                    const level = parseInt(newParentItem.closest('.bookmark-column').dataset.level, 10);
                    const targetColumn = document.querySelector(`.bookmark-column[data-level="${level + 1}"]`);
                    const contentWrapper = targetColumn ? targetColumn.querySelector('.column-content-wrapper') : null;

                    if (contentWrapper) {
                        contentWrapper.insertBefore(newItemElement, contentWrapper.children[movedItemInfo.index] || null);
                        // --- 新增修复代码 ---
                        observeLazyImages(newItemElement); // 观察这个新插入的元素
                        reindexColumnItems(contentWrapper);
                    }
                }
            });
        }

        // 如果移动涉及到了书签栏，则只调用专用函数刷新书签栏
        if (parentId === CONSTANTS.BOOKMARKS_BAR_ID || oldParentId === CONSTANTS.BOOKMARKS_BAR_ID) {
            refreshBookmarksBar();
        }

        refreshAllData();
    });

    chrome.windows.onRemoved.addListener((id) => {
        if (id === historyWindowId) {
            historyWindowId = null;
        }
        if (id === previewWindowId) {
            previewWindowId = null;
        }
    });

    document.addEventListener('keydown', handleSpacebarPreview);
});
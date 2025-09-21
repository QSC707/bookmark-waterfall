// ==================================================================
// --- 全局状态变量 ---
// 将所有需要在不同函数间共享的状态开关放在最顶部，确保它们最先被创建。
// ==================================================================
let isHoverEnabled = true;
let isDragging = false;
let suppressHover = false;
let draggedItem = null;
let hoveredBookmark = null;
let previewWindow = null;
let modulesLoaded = false;
let topBarDraggedItem = null;
let isResizing = false;
let currentResizer = null;
let startX = 0;
let startWidth = 0;

const WINDOW_SETTINGS = {
    widthRatio: 0.8,
    heightRatio: 0.8,
    minWidth: 800,
    minHeight: 600
};

// ==================================================================
// --- 核心功能函数 ---
// 将所有主要的功能函数定义在这里，使其可以在任何地方被调用。
// ==================================================================

// --- 辅助工具函数 ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = 'toast show';
        setTimeout(() => { toast.className = 'toast'; }, duration);
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
    try { new URL(string); return true; } catch (_) { return false; }
}

// --- 书签渲染与刷新 (带状态恢复) ---
function refreshBookmarks() {
    const openFolders = [];
    const scrollPositions = new Map();
    const bookmarkContainer = document.getElementById('bookmarkContainer');

    document.querySelectorAll('.bookmark-column').forEach((column, index) => {
        const highlightedItem = column.querySelector('.bookmark-item.highlighted');
        if (column.scrollTop > 0) {
            scrollPositions.set(index, column.scrollTop);
        }
        if (highlightedItem) {
            openFolders.push({
                id: highlightedItem.dataset.id,
                level: parseInt(column.dataset.level)
            });
        }
    });

    chrome.bookmarks.getTree((bookmarks) => {
        const bookmarksBar = bookmarks[0] && bookmarks[0].children[0];
        if (bookmarksBar && bookmarkContainer) {
            bookmarkContainer.innerHTML = '';
            renderBookmarks(bookmarksBar.children, bookmarkContainer, 0);

            // 异步恢复打开的文件夹
            const restorePromises = openFolders.map(folder => {
                return new Promise(resolve => {
                    const folderItem = bookmarkContainer.querySelector(`.bookmark-column[data-level="${folder.level}"] [data-id="${folder.id}"]`);
                    if (folderItem && !folderItem.classList.contains('highlighted')) {
                        folderItem.click();
                    }
                    // 使用setTimeout确保渲染有机会完成
                    setTimeout(resolve, 0);
                });
            });

            // 全部恢复后再恢复滚动位置
            Promise.all(restorePromises).then(() => {
                requestAnimationFrame(() => {
                    document.querySelectorAll('.bookmark-column').forEach((column, index) => {
                        const savedScrollTop = scrollPositions.get(index);
                        if (typeof savedScrollTop === 'number') {
                            column.scrollTop = savedScrollTop;
                        }
                    });
                });
            });
        }
    });
}


function displayBookmarks(bookmarks) {
    const bookmarkContainer = document.getElementById('bookmarkContainer');
    if (!bookmarkContainer) return;
    bookmarkContainer.innerHTML = '';
    const bookmarksBar = bookmarks[0] && bookmarks[0].children[0];
    if (bookmarksBar) {
        renderBookmarks(bookmarksBar.children, bookmarkContainer, 0);
    }
}

function renderBookmarks(bookmarks, parentElement, level) {
    let column = parentElement.querySelector(`.bookmark-column[data-level="${level}"]`);
    let currentlyHighlighted = null;

    if (!column) {
        column = document.createElement('div');
        column.className = 'bookmark-column';
        column.dataset.level = level;
        parentElement.appendChild(column);

        if (level > 0) {
            column.addEventListener('dragover', handleDragOver);
            column.addEventListener('drop', handleDrop);
            column.addEventListener('dragleave', (e) => {
                if (e.target === column) column.classList.remove('drag-over-column');
            });
        }
    } else {
        currentlyHighlighted = column.querySelector('.bookmark-item.highlighted');
        column.innerHTML = '';
    }
    
    [...parentElement.querySelectorAll('.bookmark-column')].filter(c => parseInt(c.dataset.level) > level).forEach(c => c.remove());

    const fragment = document.createDocumentFragment();
    bookmarks.forEach(bookmark => {
        const item = document.createElement('div');
        item.className = 'bookmark-item';
        item.dataset.id = bookmark.id;
        item.dataset.url = bookmark.url || '';
        item.dataset.index = bookmark.index;
        item.dataset.parentId = bookmark.parentId;

        const icon = document.createElement('img');
        icon.className = 'bookmark-icon';
        icon.src = bookmark.children ? '/img/folder_icon.svg' : getIconUrl(bookmark.url);
        icon.onerror = () => icon.src = '/img/folder_icon.svg';

        const title = document.createElement('span');
        title.textContent = sanitizeText(bookmark.title || 'No Title');
        title.className = 'bookmark-title';

        item.appendChild(icon);
        item.appendChild(title);
        fragment.appendChild(item);
        
        if (bookmark.url) {
            item.addEventListener('click', () => window.open(bookmark.url, '_blank'));
        } else if (bookmark.children) {
            let hoverTimeout;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHighlighted = item.classList.contains('highlighted');
                parentElement.querySelectorAll(`.bookmark-column[data-level="${level}"] .highlighted`).forEach(i => i.classList.remove('highlighted'));
                if (!isHighlighted) {
                    item.classList.add('highlighted');
                    renderBookmarks(bookmark.children, parentElement, level + 1);
                } else {
                    [...parentElement.querySelectorAll('.bookmark-column')].filter(c => parseInt(c.dataset.level) > level).forEach(c => c.remove());
                }
            });

            item.addEventListener('mouseenter', () => {
                if (!isHoverEnabled || isDragging || suppressHover || document.body.dataset.contextMenuOpen) return;
                clearTimeout(hoverTimeout);
                hoverTimeout = setTimeout(() => {
                    if (isDragging) return;
                    const currentHighlighted = parentElement.querySelector(`.bookmark-column[data-level="${level}"] .highlighted`);
                    if (item !== currentHighlighted) item.click();
                }, 500);
            });
            item.addEventListener('mouseleave', () => clearTimeout(hoverTimeout));
        }

        // 恢复顶部栏的拖拽逻辑
        if (level === 0) {
            item.draggable = true;
            item.addEventListener('dragstart', handleTopBarDragStart);
            item.addEventListener('dragend', handleTopBarDragEnd);
            item.addEventListener('dragover', handleTopBarDragOver);
            item.addEventListener('drop', handleTopBarDrop);
        } else {
            item.draggable = true;
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragend', handleDragEnd);
        }
    });
    column.appendChild(fragment);
}


// --- 拖拽功能 (Drag & Drop) ---
// 1. 多列视图拖拽
function handleDragStart(e) {
    isDragging = true;
    e.stopPropagation();
    draggedItem = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', draggedItem.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd() {
    isDragging = false;
    if (draggedItem) draggedItem.classList.remove('dragging');
    document.querySelectorAll('.drag-enter, .drag-over-column, .drag-over-top, .drag-over-bottom').forEach(el => {
        el.classList.remove('drag-enter', 'drag-over-column', 'drag-over-top', 'drag-over-bottom');
    });
    draggedItem = null;
}

function handleDragOver(e) {
    e.preventDefault();
    if (!draggedItem) return;
    const targetItem = e.target.closest('.bookmark-item');
    const targetColumn = e.target.closest('.bookmark-column');
    const sourceColumn = draggedItem.closest('.bookmark-column');
    document.querySelectorAll('.drag-enter, .drag-over-column, .drag-over-top, .drag-over-bottom').forEach(el => {
        el.classList.remove('drag-enter', 'drag-over-column', 'drag-over-top', 'drag-over-bottom');
    });
    if (!targetColumn) return;

    if (targetColumn !== sourceColumn) {
        const isTargetFolder = targetItem && !targetItem.dataset.url && targetItem !== draggedItem;
        if (isTargetFolder) targetItem.classList.add('drag-enter');
        else targetColumn.classList.add('drag-over-column');
    } else if (targetItem && targetItem !== draggedItem) {
        const rect = targetItem.getBoundingClientRect();
        const isTargetFolder = !targetItem.dataset.url;
        if (isTargetFolder) {
            const deadZone = rect.height * 0.25;
            if (e.clientY < rect.top + deadZone) targetItem.classList.add('drag-over-top');
            else if (e.clientY > rect.bottom - deadZone) targetItem.classList.add('drag-over-bottom');
            else targetItem.classList.add('drag-enter');
        } else {
            const midY = rect.top + rect.height / 2;
            targetItem.classList.toggle('drag-over-top', e.clientY < midY);
            targetItem.classList.toggle('drag-over-bottom', e.clientY >= midY);
        }
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem) return;
    const draggedId = draggedItem.dataset.id;
    const targetItem = e.target.closest('.bookmark-item');
    const targetColumn = e.target.closest('.bookmark-column');
    const isMoveInto = targetItem?.classList.contains('drag-enter');
    const isSort = targetItem?.classList.contains('drag-over-top') || targetItem?.classList.contains('drag-over-bottom');
    const isMoveToColumn = targetColumn?.classList.contains('drag-over-column');
    const onMoveSuccess = () => {
        suppressHover = true;
        setTimeout(() => { suppressHover = false; }, 100);
        if (chrome.runtime.lastError) showToast('移动失败: ' + chrome.runtime.lastError.message);
        else { showToast('书签已移动'); refreshBookmarks(); }
    };
    if (isMoveInto) {
        chrome.bookmarks.move(draggedId, { parentId: targetItem.dataset.id }, onMoveSuccess);
    } else if (isSort) {
        const targetIndex = parseInt(targetItem.dataset.index);
        const newIndex = targetItem.classList.contains('drag-over-top') ? targetIndex : targetIndex + 1;
        chrome.bookmarks.move(draggedId, { index: newIndex }, () => {
            if (chrome.runtime.lastError) showToast('排序失败: ' + chrome.runtime.lastError.message);
            else refreshBookmarks();
        });
    } else if (isMoveToColumn) {
        const prevColumn = targetColumn.previousElementSibling;
        const parentFolderItem = prevColumn?.querySelector('.bookmark-item.highlighted');
        if (parentFolderItem) chrome.bookmarks.move(draggedId, { parentId: parentFolderItem.dataset.id }, onMoveSuccess);
    }
    handleDragEnd();
}

// 2. 顶部栏拖拽
function handleTopBarDragStart(e) {
    draggedItem = null;
    isDragging = true;
    topBarDraggedItem = e.target;
    e.dataTransfer.setData('text/plain', topBarDraggedItem.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    queueMicrotask(() => topBarDraggedItem.classList.add('dragging'));
}

function handleTopBarDragEnd() {
    isDragging = false;
    if (topBarDraggedItem) topBarDraggedItem.classList.remove('dragging');
    document.querySelectorAll('.drag-indicator').forEach(indicator => indicator.remove());
    topBarDraggedItem = null;
}

function handleTopBarDragOver(e) {
    e.preventDefault();
    const targetItem = e.target.closest('.bookmark-item');
    if (!topBarDraggedItem || !targetItem || targetItem === topBarDraggedItem) {
        document.querySelectorAll('.drag-indicator').forEach(indicator => indicator.remove());
        return;
    }
    const rect = targetItem.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    let indicator = document.getElementById('top-bar-drag-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'top-bar-drag-indicator';
        indicator.className = 'drag-indicator';
        document.body.appendChild(indicator);
    }
    indicator.style.left = e.clientX < midX ? `${rect.left}px` : `${rect.right}px`;
    indicator.style.top = `${rect.top}px`;
    indicator.style.height = `${rect.height}px`;
    targetItem.dataset.dropPosition = e.clientX < midX ? 'before' : 'after';
}

function handleTopBarDrop(e) {
    e.preventDefault();
    const targetItem = e.target.closest('.bookmark-item');
    if (!topBarDraggedItem || !targetItem || !targetItem.dataset.dropPosition) {
        handleTopBarDragEnd();
        return;
    }
    const targetIndex = parseInt(targetItem.dataset.index);
    const newIndex = targetItem.dataset.dropPosition === 'before' ? targetIndex : targetIndex + 1;
    delete targetItem.dataset.dropPosition;
    const draggedId = topBarDraggedItem.dataset.id;
    if (draggedId && typeof newIndex === 'number') {
        chrome.bookmarks.move(draggedId, { index: newIndex }, (result) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
                showToast('排序失败，请重试');
            }
            refreshBookmarks();
        });
    }
    handleTopBarDragEnd();
}


// --- 对话框 & 右键菜单 ---
function showContextMenu(e, bookmarkElement, column) {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.innerHTML = '';
    const ul = document.createElement('ul');
    const isFolder = bookmarkElement && !bookmarkElement.dataset.url;
    if (bookmarkElement) {
        ul.innerHTML = isFolder ?
            `<li id="openAll"><img src="/img/open_all.svg" class="menu-icon">打开所有</li>
             <li id="rename"><img src="/img/rename.svg" class="menu-icon">重命名</li>
             <hr>
             <li id="move"><img src="/img/move.svg" class="menu-icon">移动到...</li>
             <li id="delete"><img src="/img/delete.svg" class="menu-icon">删除</li>` :
            `<li id="open"><img src="/img/open.svg" class="menu-icon">新标签打开</li>
             <li id="openNew"><img src="/img/open_new.svg" class="menu-icon">新窗口打开</li>
             <hr>
             <li id="editUrl"><img src="/img/edit.svg" class="menu-icon">修改网址</li>
             <li id="rename"><img src="/img/rename.svg" class="menu-icon">重命名</li>
             <li id="move"><img src="/img/move.svg" class="menu-icon">移动到...</li>
             <hr>
             <li id="copyUrl"><img src="/img/copy.svg" class="menu-icon">复制网址</li>
             <li id="delete"><img src="/img/delete.svg" class="menu-icon">删除</li>`;
    } else {
        ul.innerHTML = `<li id="newFolder"><img src="/img/folder.svg" class="menu-icon">新建文件夹</li>`;
    }
    contextMenu.appendChild(ul);
    contextMenu.style.display = 'block';
    const rect = contextMenu.getBoundingClientRect();
    contextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - rect.width)}px`;
    contextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - rect.height)}px`;
    contextMenu.relatedTarget = bookmarkElement;
    contextMenu.relatedColumn = column;
    document.body.dataset.contextMenuOpen = 'true';
}

function handleContextMenuAction(action, element) {
    const id = element?.dataset.id;
    const url = element?.dataset.url;
    const isFolder = element && !url;
    const title = element?.querySelector('.bookmark-title').textContent;

    switch (action) {
        case 'open': chrome.tabs.create({ url }); break;
        case 'openNew': chrome.windows.create({ url }); break;
        case 'copyUrl': navigator.clipboard.writeText(url).then(() => showToast('网址已复制')); break;
        case 'openAll':
            if (isFolder) chrome.bookmarks.getChildren(id, children => children.forEach(child => { if (child.url) chrome.tabs.create({ url: child.url }); }));
            break;
        case 'rename':
            showEditDialog('重命名', title, null, (newName) => {
                if(newName) chrome.bookmarks.update(id, { title: newName }, refreshBookmarks);
            });
            break;
        case 'editUrl':
            showEditDialog('修改网址', url, isValidUrl, (newUrl) => {
                if(newUrl) chrome.bookmarks.update(id, { url: newUrl }, refreshBookmarks);
            });
            break;
        case 'delete':
            showConfirmDialog(`删除 ${isFolder ? '文件夹' : '书签'}`, `确定要删除 "${title}" 吗?`, () => {
                const promise = isFolder ? chrome.bookmarks.removeTree(id) : chrome.bookmarks.remove(id);
                promise.then(refreshBookmarks).catch(err => showToast('删除失败: ' + err.message));
            });
            break;
        case 'move': showMoveDialog(element); break;
        case 'newFolder':
            const column = document.getElementById('contextMenu').relatedColumn;
            const prevColumn = column?.previousElementSibling;
            const parentId = prevColumn?.querySelector('.highlighted')?.dataset.id || '1';
            showEditDialog('新建文件夹', '', null, (name) => {
                if(name) chrome.bookmarks.create({ parentId, title: name }, refreshBookmarks);
            });
            break;
    }
}

function showEditDialog(title, value, validator, onConfirm) {
    const dialog = document.getElementById('editDialog');
    const titleEl = document.getElementById('editDialogTitle');
    const input = document.getElementById('editDialogInput');
    const error = document.getElementById('editDialogError');
    const confirmBtn = document.getElementById('confirmEdit');
    const cancelBtn = document.getElementById('cancelEdit');
    
    titleEl.textContent = title;
    input.value = value;
    error.textContent = '';
    dialog.style.display = 'flex';
    input.focus();
    input.select();

    const close = () => {
        dialog.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
    };
    
    confirmBtn.onclick = () => {
        if (validator && !validator(input.value)) {
            error.textContent = '输入内容无效';
            return;
        }
        onConfirm(input.value);
        close();
    };
    cancelBtn.onclick = close;
}

function showConfirmDialog(title, message, onConfirm) {
    const dialog = document.getElementById('confirmDialog');
    const titleEl = document.getElementById('confirmDialogTitle');
    const messageEl = document.getElementById('confirmDialogMessage');
    const confirmBtn = document.getElementById('confirmConfirm');
    const cancelBtn = document.getElementById('cancelConfirm');

    titleEl.textContent = title;
    messageEl.textContent = message;
    dialog.style.display = 'flex';

    const close = () => {
        dialog.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => { onConfirm(); close(); };
    cancelBtn.onclick = close;
}

function showMoveDialog(bookmarkElement) {
    const dialog = document.getElementById('moveDialog');
    const treeContainer = document.getElementById('bookmarkTree');
    const confirmBtn = document.getElementById('confirmMove');
    const cancelBtn = document.getElementById('cancelMove');
    let selectedFolderId = null;

    const close = () => {
        dialog.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    const renderTree = (nodes, parentElement, level) => {
        const ul = document.createElement('ul');
        if (level > 0) ul.style.paddingLeft = '20px';
        
        nodes.forEach(node => {
            if (node.children) {
                const li = document.createElement('li');
                li.textContent = node.title;
                li.dataset.id = node.id;
                li.style.cursor = 'pointer';
                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('#bookmarkTree .selected').forEach(el => el.classList.remove('selected'));
                    li.classList.add('selected');
                    selectedFolderId = node.id;
                });
                ul.appendChild(li);
                if (node.children.some(child => child.children)) {
                    renderTree(node.children, li, level + 1);
                }
            }
        });
        parentElement.appendChild(ul);
    };

    chrome.bookmarks.getTree(tree => {
        treeContainer.innerHTML = '';
        renderTree(tree, treeContainer, 0);
    });

    dialog.style.display = 'flex';
    confirmBtn.onclick = () => {
        if (selectedFolderId && selectedFolderId !== bookmarkElement.dataset.id) {
            chrome.bookmarks.move(bookmarkElement.dataset.id, { parentId: selectedFolderId }, refreshBookmarks);
        }
        close();
    };
    cancelBtn.onclick = close;
}


// ==================================================================
// --- 页面加载后执行的初始化代码 ---
// ==================================================================
document.addEventListener('DOMContentLoaded', function () {
    const bookmarkContainer = document.getElementById('bookmarkContainer');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const themeOptionsContainer = settingsPanel.querySelector('.theme-options');
    const hoverToggle = document.getElementById('hover-toggle-switch');
    const verticalModules = document.querySelector('.vertical-modules');
    const toggleVerticalBtn = document.getElementById('sidebar-toggle-btn');
    const contextMenu = document.getElementById('contextMenu');

    // ---- 初始化设置面板 ----
    const updateThemeButtons = (activeTheme) => themeOptionsContainer.querySelectorAll('.theme-option').forEach(btn => btn.classList.toggle('active', btn.dataset.themeValue === activeTheme));
    const applyTheme = (theme) => {
        const root = document.documentElement;
        if (theme === 'system') root.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        else root.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        updateThemeButtons(theme);
    };
    applyTheme(localStorage.getItem('theme') || 'system');
    hoverToggle.checked = localStorage.getItem('hoverToOpenEnabled') !== 'false';
    isHoverEnabled = hoverToggle.checked;
    hoverToggle.addEventListener('change', (e) => {
        isHoverEnabled = e.target.checked;
        localStorage.setItem('hoverToOpenEnabled', isHoverEnabled);
        showToast(`悬停打开功能已${isHoverEnabled ? '开启' : '关闭'}`);
    });
    settingsBtn.addEventListener('click', (e) => { e.stopPropagation(); settingsPanel.classList.toggle('visible'); });
    themeOptionsContainer.addEventListener('click', (e) => { if (e.target.matches('.theme-option')) applyTheme(e.target.dataset.themeValue); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (localStorage.getItem('theme') === 'system') applyTheme('system'); });

    // ---- 初始化侧边栏 ----
    let isModuleVisible = false;
    let hoverTimeout;
    const showModules = () => { if (!isModuleVisible) { verticalModules.style.display = 'flex'; isModuleVisible = true; } };
    const hideModules = () => { if (isModuleVisible) { verticalModules.style.display = 'none'; isModuleVisible = false; } };
    toggleVerticalBtn.addEventListener('click', (e) => { e.stopPropagation(); isModuleVisible ? hideModules() : showModules(); });
    toggleVerticalBtn.addEventListener('mouseenter', () => { clearTimeout(hoverTimeout); hoverTimeout = setTimeout(showModules, 500); });
    toggleVerticalBtn.addEventListener('mouseleave', () => clearTimeout(hoverTimeout));
    verticalModules.addEventListener('mouseenter', () => clearTimeout(hoverTimeout));

    // ---- 初始化通用点击事件 ----
    document.addEventListener('click', (e) => {
        if (settingsPanel.classList.contains('visible') && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) settingsPanel.classList.remove('visible');
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
            delete document.body.dataset.contextMenuOpen;
        }
        if (isModuleVisible && !verticalModules.contains(e.target) && !toggleVerticalBtn.contains(e.target)) hideModules();
    });

    // ---- 初始化右键菜单 ----
    bookmarkContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const item = e.target.closest('.bookmark-item');
        const column = e.target.closest('.bookmark-column');
        if (!item && !column) return;
        document.querySelectorAll('.bookmark-item.highlgg').forEach(i => i.classList.remove('highlgg'));
        if (item) item.classList.add('highlgg');
        showContextMenu(e, item, column);
    });
    contextMenu.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li) {
            const action = li.id;
            const relatedTarget = contextMenu.relatedTarget;
            if (action && relatedTarget) handleContextMenuAction(action, relatedTarget);
        }
    });

    // ---- 初始加载书签 ----
    chrome.bookmarks.getTree(displayBookmarks);
});
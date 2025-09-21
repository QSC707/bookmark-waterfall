// ==================================================================
// --- 全局状态变量 ---
// ==================================================================
let isHoverEnabled = true;
let isDragging = false;
let suppressHover = false;
let draggedItem = null;
let dragOverTimeout = null;

// ==================================================================
// --- 核心功能函数 ---
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

// --- 书签渲染与刷新 ---

function displayBookmarks(bookmarks) {
    const bookmarkContainer = document.getElementById('bookmarkContainer');
    const header = document.querySelector('.page-header');
    
    bookmarkContainer.innerHTML = '';
    const oldTopBar = header.querySelector('.bookmark-column[data-level="0"]');
    if(oldTopBar) oldTopBar.remove();

    const bookmarksBar = bookmarks[0] && bookmarks[0].children[0];
    if (bookmarksBar) {
        renderBookmarks(bookmarksBar.children, header, 0); 
    }
}

function renderBookmarks(bookmarks, parentElement, level) {
    let column;
    if (level === 0) {
        const header = document.querySelector('.page-header');
        column = document.createElement('div');
        column.className = 'bookmark-column';
        column.dataset.level = level;
        header.appendChild(column);
    } else {
        const container = document.getElementById('bookmarkContainer');
        const nextColumns = container.querySelectorAll(`.bookmark-column`);
        nextColumns.forEach(col => {
            if(parseInt(col.dataset.level) >= level) col.remove();
        });

        column = document.createElement('div');
        column.className = 'bookmark-column';
        column.dataset.level = level;
        container.appendChild(column);
    }

    column.addEventListener('dragover', handleColumnDragOver);
    column.addEventListener('dragleave', handleColumnDragLeave);
    column.addEventListener('drop', handleColumnDrop);
    
    const fragment = document.createDocumentFragment();
    bookmarks.forEach((bookmark, index) => {
        const item = createBookmarkItem(bookmark, index);
        fragment.appendChild(item);
    });

    // 为空的文件夹视图添加提示
    if (bookmarks.length === 0 && level > 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-folder-message';
        emptyMsg.textContent = '这个文件夹是空的';
        column.appendChild(emptyMsg);
    }

    column.appendChild(fragment);
}

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
    icon.onerror = () => icon.src = '/img/folder_icon.svg';
    
    const title = document.createElement('span');
    title.textContent = sanitizeText(bookmark.title || 'No Title');
    title.className = 'bookmark-title';
    
    item.appendChild(icon);
    item.appendChild(title);

    if (bookmark.url) {
        item.addEventListener('click', () => window.open(bookmark.url, '_blank'));
    } else { 
        let hoverTimeout;
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHighlighted = item.classList.contains('highlighted');
            const level = parseInt(item.closest('.bookmark-column').dataset.level, 10);
            
            item.parentElement.querySelectorAll('.bookmark-item.highlighted').forEach(i => i.classList.remove('highlighted'));

            if (!isHighlighted) {
                item.classList.add('highlighted');
                chrome.bookmarks.getChildren(bookmark.id, (freshChildren) => {
                    renderBookmarks(freshChildren, document.getElementById('bookmarkContainer'), level + 1);
                });
            } else {
                const container = document.getElementById('bookmarkContainer');
                const nextColumns = container.querySelectorAll(`.bookmark-column`);
                nextColumns.forEach(col => {
                    if(parseInt(col.dataset.level) > level) col.remove();
                });
            }
        });
        item.addEventListener('mouseenter', () => {
            if (!isHoverEnabled || isDragging || suppressHover || document.body.dataset.contextMenuOpen) return;
            clearTimeout(hoverTimeout);
            hoverTimeout = setTimeout(() => {
                if (isDragging) return;
                const currentHighlighted = item.parentElement.querySelector('.bookmark-item.highlighted');
                if (item !== currentHighlighted) item.click();
            }, 500);
        });
        item.addEventListener('mouseleave', () => clearTimeout(hoverTimeout));
    }

    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragleave', handleDragLeave);

    return item;
}


// --- 统一、简单、原生的拖动逻辑 ---

function handleDragStart(e) {
    isDragging = true;
    draggedItem = e.target.closest('.bookmark-item');
    e.dataTransfer.setData('text/plain', draggedItem.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    queueMicrotask(() => {
        if (draggedItem) draggedItem.classList.add('dragging');
    });
    e.stopPropagation();
}

function handleDragOver(e) {
    e.preventDefault();
    const targetItem = e.target.closest('.bookmark-item');
    if (!targetItem || targetItem === draggedItem) return;

    clearTimeout(dragOverTimeout);
    
    const container = targetItem.parentElement;
    container.querySelectorAll('.bookmark-item').forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
    });

    const rect = targetItem.getBoundingClientRect();
    const level = container.dataset.level;
    const isFolder = !targetItem.dataset.url;

    if (level === '0') {
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
                if (!targetItem.classList.contains('highlighted')) {
                    dragOverTimeout = setTimeout(() => targetItem.click(), 600);
                }
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

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(dragOverTimeout);
    if (!draggedItem) return;

    const draggedId = draggedItem.dataset.id;
    const dropTarget = e.target.closest('.bookmark-item');
    if (!dropTarget || dropTarget === draggedItem) return;

    let destination = {};
    const classes = dropTarget.classList;

    if (classes.contains('drag-enter')) {
        destination.parentId = dropTarget.dataset.id;
    } else {
        destination.parentId = dropTarget.dataset.parentId;
        let newIndex = parseInt(dropTarget.dataset.index, 10);
        if (classes.contains('drag-over-after') || classes.contains('drag-over-bottom')) {
            newIndex++;
        }
        destination.index = newIndex;
    }
    
    chrome.bookmarks.move(draggedId, destination, () => showToast('移动成功'));
}

function handleDragLeave(e) {
    clearTimeout(dragOverTimeout);
    const targetItem = e.target.closest('.bookmark-item');
    if (targetItem) {
        targetItem.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
    }
}

function handleDragEnd(e) {
    isDragging = false;
    clearTimeout(dragOverTimeout);
    if (draggedItem) {
        draggedItem.classList.remove('dragging');
    }
    document.querySelectorAll('.bookmark-item, .bookmark-column').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter', 'column-drag-over');
    });
    draggedItem = null;
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
    if (!draggedItem) return;

    const column = e.target.closest('.bookmark-column');
    column.classList.remove('column-drag-over');

    const level = parseInt(column.dataset.level, 10);
    let parentId = null;

    if (level === 0) {
        parentId = '1';
    } else {
        const prevColumn = document.querySelector(`.bookmark-column[data-level="${level - 1}"]`);
        if (prevColumn) {
            parentId = prevColumn.querySelector('.bookmark-item.highlighted')?.dataset.id;
        }
    }

    if (parentId && draggedItem.dataset.parentId !== parentId) {
        chrome.bookmarks.move(draggedItem.dataset.id, { parentId: parentId });
    }
}


// --- 对话框 & 右键菜单 ---
function showContextMenu(e, bookmarkElement, column) {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.innerHTML = '';
    const ul = document.createElement('ul');
    const isFolder = bookmarkElement && !bookmarkElement.dataset.url;
    if (bookmarkElement) {
        ul.innerHTML = isFolder ?
            `<li id="openAll"><img src="/img/open_all.svg" class="menu-icon">打开所有</li><li id="rename"><img src="/img/rename.svg" class="menu-icon">重命名</li><hr><li id="move"><img src="/img/move.svg" class="menu-icon">移动到...</li><li id="delete"><img src="/img/delete.svg" class="menu-icon">删除</li>` :
            `<li id="open"><img src="/img/open.svg" class="menu-icon">新标签打开</li><li id="openNew"><img src="/img/open_new.svg" class="menu-icon">新窗口打开</li><hr><li id="editUrl"><img src="/img/edit.svg" class="menu-icon">修改网址</li><li id="rename"><img src="/img/rename.svg" class="menu-icon">重命名</li><li id="move"><img src="/img/move.svg" class="menu-icon">移动到...</li><hr><li id="copyUrl"><img src="/img/copy.svg" class="menu-icon">复制网址</li><li id="delete"><img src="/img/delete.svg" class="menu-icon">删除</li>`;
    } else {
        ul.innerHTML = `<li id="newFolder"><img src="/img/folder.svg" class="menu-icon">新建文件夹</li>`;
    }
    contextMenu.appendChild(ul);
    contextMenu.style.display = 'block';

    const { innerWidth: winWidth, innerHeight: winHeight } = window;
    const { offsetWidth: menuWidth, offsetHeight: menuHeight } = contextMenu;
    
    let left = e.clientX;
    let top = e.clientY;

    if (left + menuWidth > winWidth) left = winWidth - menuWidth - 5;
    if (top + menuHeight > winHeight) top = winHeight - menuHeight - 5;

    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;
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
                if(newName) chrome.bookmarks.update(id, { title: newName });
            });
            break;
        case 'editUrl':
            showEditDialog('修改网址', url, isValidUrl, (newUrl) => {
                if(newUrl) chrome.bookmarks.update(id, { url: newUrl });
            });
            break;
        case 'delete':
            showConfirmDialog(`删除 ${isFolder ? '文件夹' : '书签'}`, `确定要删除 "${title}" 吗?`, () => {
                const promise = isFolder ? chrome.bookmarks.removeTree(id) : chrome.bookmarks.remove(id);
                promise.catch(err => showToast('删除失败: ' + err.message));
            });
            break;
        case 'move': showMoveDialog(element); break;
        case 'newFolder':
            const column = document.getElementById('contextMenu').relatedColumn;
            let parentId = '1'; 
            if (column) {
                const level = parseInt(column.dataset.level, 10);
                 if (level > 0) {
                     const prevColumn = document.querySelector(`.bookmark-column[data-level="${level - 1}"]`);
                     if(prevColumn) parentId = prevColumn.querySelector('.bookmark-item.highlighted')?.dataset.id || '1';
                }
            }
            showEditDialog('新建文件夹', '', null, (name) => {
                if(name) chrome.bookmarks.create({ parentId, title: name });
            });
            break;
    }
}

function showMoveDialog(bookmarkElement) {
    const dialog = document.getElementById('moveDialog');
    const treeContainer = document.getElementById('bookmarkTree');
    const confirmBtn = document.getElementById('confirmMove');
    const cancelBtn = document.getElementById('cancelMove');
    
    let selectedFolderId = null;
    const bookmarkToMoveId = bookmarkElement.dataset.id;
    const currentParentId = bookmarkElement.dataset.parentId;
    const isFolderBeingMoved = !bookmarkElement.dataset.url;
    let disabledFolderIds = new Set();

    const close = () => {
        dialog.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        treeContainer.innerHTML = '';
        // 关键：移除事件监听器以防止内存泄漏
        treeContainer.removeEventListener('transitionend', handleTransitionEnd);
    };

    const renderTree = (nodes, parentElement, level) => {
        nodes.forEach(node => {
            if (node.url) return; 

            const item = document.createElement('div');
            item.className = 'bookmark-tree-item';
            item.dataset.id = node.id;
            
            if (node.id === currentParentId) item.classList.add('is-current-parent');
            if (disabledFolderIds.has(node.id)) item.classList.add('is-disabled');
            
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

            content.appendChild(expandIcon);
            content.appendChild(folderIcon);
            content.appendChild(title);
            item.appendChild(content);

            const subFolderContainer = document.createElement('div');
            subFolderContainer.className = 'sub-folder';
            item.appendChild(subFolderContainer);

            if (node.children && node.children.some(child => !child.url)) {
                renderTree(node.children, subFolderContainer, level + 1);
            }
            
            content.onclick = () => {
                if (item.classList.contains('is-disabled')) return; 
                document.querySelectorAll('.bookmark-tree-item.selected').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                selectedFolderId = node.id;
                confirmBtn.disabled = (selectedFolderId === currentParentId);
            };

            parentElement.appendChild(item);
        });
    };
    
    // 这是我们唯一的、集中的动画结束处理器
    const handleTransitionEnd = (e) => {
        // 确保事件是由 .sub-folder 的 max-height 动画触发的
        if (e.target.classList.contains('sub-folder') && e.propertyName === 'max-height') {
            const subFolderContainer = e.target;
            
            // 无论是展开还是折叠动画结束，都向上更新父容器
            let parent = subFolderContainer.parentElement.closest('.sub-folder');
            while (parent) {
                // 只更新那些处于展开状态的父容器
                if (parent.style.maxHeight !== '0px') {
                    parent.style.maxHeight = `${parent.scrollHeight}px`;
                }
                parent = parent.parentElement.closest('.sub-folder');
            }
        }
    };

    const processAndRenderTree = (tree) => {
        const topLevelFolders = tree[0]?.children;
        if (!topLevelFolders) return;
        treeContainer.innerHTML = '';

        renderTree(topLevelFolders, treeContainer, 0);

        // --- 最终优化：使用事件委托 ---
        // 在最外层容器上只绑定一个监听器
        treeContainer.addEventListener('transitionend', handleTransitionEnd);

        // 所有的点击事件处理器现在都变得极其简单
        treeContainer.querySelectorAll('.bookmark-tree-item').forEach(item => {
            const subFolderContainer = item.querySelector('.sub-folder');
            const expandIcon = item.querySelector('.expand-icon');

            if (subFolderContainer && subFolderContainer.hasChildNodes()) {
                expandIcon.textContent = '▶';
                
                expandIcon.onclick = (e) => {
                    e.stopPropagation();
                    const isExpanded = expandIcon.classList.contains('expanded');
                    
                    // 只负责改变自己的状态，不关心任何父级
                    if (isExpanded) {
                        subFolderContainer.style.maxHeight = '0px';
                    } else {
                        subFolderContainer.style.maxHeight = `${subFolderContainer.scrollHeight}px`;
                    }
                    expandIcon.classList.toggle('expanded');
                };
            }
        });
    };

    dialog.style.display = 'flex';
    confirmBtn.disabled = true;

    chrome.bookmarks.getTree(tree => {
        if (isFolderBeingMoved) {
            chrome.bookmarks.getSubTree(bookmarkToMoveId, (subTree) => {
                const flatten = (nodes) => {
                    nodes.forEach(node => {
                        disabledFolderIds.add(node.id);
                        if (node.children) flatten(node.children);
                    });
                };
                flatten(subTree);
                processAndRenderTree(tree);
            });
        } else {
             processAndRenderTree(tree);
        }
    });

    confirmBtn.onclick = () => {
        if (selectedFolderId && selectedFolderId !== currentParentId) {
            chrome.bookmarks.move(bookmarkToMoveId, { parentId: selectedFolderId });
        }
        close();
    };

    cancelBtn.onclick = close;
}
// ==================================================================
// --- 事件驱动的DOM更新 ---
// ==================================================================

function findColumnForParentId(parentId) {
    if (parentId === '1') { // 恢复使用 '1' 作为书签栏的ID
        return document.querySelector('.bookmark-column[data-level="0"]');
    }
    const parentItem = document.querySelector(`.bookmark-item[data-id="${parentId}"]`);
    if (parentItem && parentItem.classList.contains('highlighted')) {
        const level = parseInt(parentItem.closest('.bookmark-column').dataset.level, 10);
        return document.querySelector(`.bookmark-column[data-level="${level + 1}"]`);
    }
    return null;
}

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
        const refNode = parentColumn.children[bookmark.index];
        parentColumn.insertBefore(newItem, refNode);
        reindexColumnItems(parentColumn);
    }
}

function handleBookmarkRemoved(id, removeInfo) {
    const itemToRemove = document.querySelector(`.bookmark-item[data-id="${id}"]`);
    if (itemToRemove) {
        const parentColumn = itemToRemove.parentElement;
        const wasHighlighted = itemToRemove.classList.contains('highlighted');

        if (wasHighlighted) {
            const level = parseInt(parentColumn.dataset.level, 10);
            document.querySelectorAll('.bookmark-column').forEach(col => {
                if (parseInt(col.dataset.level, 10) > level) col.remove();
            });
        }
        
        itemToRemove.remove();
        reindexColumnItems(parentColumn);
    }
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
    const itemToMove = document.querySelector(`.bookmark-item[data-id="${id}"]`);
    
    if (itemToMove) {
        const oldParentColumn = itemToMove.parentElement;
        itemToMove.remove();
        reindexColumnItems(oldParentColumn);
    }

    const newParentColumn = findColumnForParentId(moveInfo.parentId);
    if (newParentColumn) {
        chrome.bookmarks.get(id, (bookmarks) => {
            if (bookmarks && bookmarks[0]) {
                const newItem = createBookmarkItem(bookmarks[0], moveInfo.index);
                const refNode = newParentColumn.children[moveInfo.index];
                newParentColumn.insertBefore(newItem, refNode);
                reindexColumnItems(newParentColumn);
            }
        });
    }
}

function handleBookmarkReordered(id, reorderInfo) {
    const parentColumn = findColumnForParentId(id);
    if (!parentColumn) return;

    const fragment = document.createDocumentFragment();
    const childrenMap = new Map();
    
    for (const child of parentColumn.children) {
        childrenMap.set(child.dataset.id, child);
    }
    
    reorderInfo.childIds.forEach((childId) => {
        const childNode = childrenMap.get(childId);
        if (childNode) fragment.appendChild(childNode);
    });
    
    parentColumn.appendChild(fragment);
    reindexColumnItems(parentColumn);
}


// ==================================================================
// --- 页面加载后执行的初始化代码 ---
// ==================================================================
document.addEventListener('DOMContentLoaded', function () {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const themeOptionsContainer = settingsPanel.querySelector('.theme-options');
    const hoverToggle = document.getElementById('hover-toggle-switch');
    const verticalModules = document.querySelector('.vertical-modules');
    const toggleVerticalBtn = document.getElementById('sidebar-toggle-btn');
    const contextMenu = document.getElementById('contextMenu');

    // --- 设置面板逻辑 ---
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

    // --- 侧边栏逻辑 ---
    let isModuleVisible = false;
    let hoverTimeout;
    const showModules = () => { if (!isModuleVisible) { verticalModules.style.display = 'flex'; isModuleVisible = true; } };
    const hideModules = () => { if (isModuleVisible) { verticalModules.style.display = 'none'; isModuleVisible = false; } };
    toggleVerticalBtn.addEventListener('click', (e) => { e.stopPropagation(); isModuleVisible ? hideModules() : showModules(); });
    toggleVerticalBtn.addEventListener('mouseenter', () => { clearTimeout(hoverTimeout); hoverTimeout = setTimeout(showModules, 500); });
    toggleVerticalBtn.addEventListener('mouseleave', () => clearTimeout(hoverTimeout));
    verticalModules.addEventListener('mouseenter', () => clearTimeout(hoverTimeout));

    // --- 全局点击事件，用于关闭菜单等 ---
    document.addEventListener('click', (e) => {
        if (settingsPanel.classList.contains('visible') && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) settingsPanel.classList.remove('visible');
        if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
            delete document.body.dataset.contextMenuOpen;
        }
        if (isModuleVisible && !verticalModules.contains(e.target) && !toggleVerticalBtn.contains(e.target)) hideModules();
    });
    
    // --- 右键菜单事件绑定 ---
    document.body.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.bookmark-item');
        const column = e.target.closest('.bookmark-column');

        if (!item && !column) return;
        
        e.preventDefault();
        
        document.querySelectorAll('.bookmark-item.highlgg').forEach(i => i.classList.remove('highlgg'));
        if (item) item.classList.add('highlgg');

        showContextMenu(e, item, column);
    });

    contextMenu.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li && li.id) {
            const action = li.id;
            const relatedTarget = contextMenu.relatedTarget;
            handleContextMenuAction(action, relatedTarget);
        }
    });

    // --- 初始加载 ---
    chrome.bookmarks.getTree(displayBookmarks);

    // --- 添加事件监听 ---
    chrome.bookmarks.onCreated.addListener(handleBookmarkCreated);
    chrome.bookmarks.onRemoved.addListener(handleBookmarkRemoved);
    chrome.bookmarks.onChanged.addListener(handleBookmarkChanged);
    chrome.bookmarks.onMoved.addListener(handleBookmarkMoved);
    chrome.bookmarks.onChildrenReordered.addListener(handleBookmarkReordered);
});
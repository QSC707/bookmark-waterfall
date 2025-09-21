// ==================================================================
// --- 全局状态变量 ---
// ==================================================================
let isHoverEnabled = true;
let isDragging = false;
let suppressHover = false;
let draggedItem = null;

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

/**
 * 核心函数：无损刷新UI
 * 1. 记录当前所有打开的文件夹和滚动位置。
 * 2. 重新从API获取书签树并完全重绘。
 * 3. 恢复之前记录的状态。
 */
function refreshUI() {
    const openFolders = [];
    const scrollPositions = new Map();

    // 1. 记录状态
    document.querySelectorAll('.bookmark-column').forEach((column) => {
        const level = parseInt(column.dataset.level, 10);
        const highlightedItem = column.querySelector('.bookmark-item.highlighted');
        if (highlightedItem) {
            openFolders.push(highlightedItem.dataset.id);
        }
        if (column.scrollTop > 0) {
            scrollPositions.set(`col-${level}`, column.scrollTop);
        }
        if (level === 0 && column.scrollLeft > 0) {
            scrollPositions.set('top-bar', column.scrollLeft);
        }
    });

    // 2. 重新获取数据并重绘
    chrome.bookmarks.getTree((bookmarks) => {
        const bookmarkContainer = document.getElementById('bookmarkContainer');
        const header = document.querySelector('.page-header');
        
        // 清理旧内容
        bookmarkContainer.innerHTML = '';
        const oldTopBar = header.querySelector('.bookmark-column[data-level="0"]');
        if(oldTopBar) oldTopBar.remove();

        const bookmarksBar = bookmarks[0] && bookmarks[0].children[0];
        if (bookmarksBar) {
            renderBookmarks(bookmarksBar.children, header, 0); // 初始渲染
        }

        // 3. 恢复状态
        // 使用 requestAnimationFrame 确保在DOM更新后执行
        requestAnimationFrame(() => {
            let promise = Promise.resolve();
            openFolders.forEach(folderId => {
                promise = promise.then(() => {
                    return new Promise(resolve => {
                        const folderItem = document.querySelector(`.bookmark-item[data-id="${folderId}"]`);
                        if (folderItem && !folderItem.classList.contains('highlighted')) {
                            folderItem.click();
                            // 点击后需要极短的延迟让下一列渲染出来
                            setTimeout(resolve, 10); 
                        } else {
                            resolve();
                        }
                    });
                });
            });

            // 所有文件夹都点开后，恢复滚动条位置
            promise.then(() => {
                requestAnimationFrame(() => {
                     scrollPositions.forEach((pos, key) => {
                        if (key === 'top-bar') {
                            const topBar = document.querySelector('.bookmark-column[data-level="0"]');
                            if (topBar) topBar.scrollLeft = pos;
                        } else {
                            const level = key.replace('col-', '');
                            const column = document.querySelector(`.bookmark-column[data-level="${level}"]`);
                            if (column) column.scrollTop = pos;
                        }
                    });
                });
            });
        });
    });
}


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
    
    const fragment = document.createDocumentFragment();
    bookmarks.forEach((bookmark, index) => {
        const item = document.createElement('div');
        item.className = 'bookmark-item';
        item.dataset.id = bookmark.id;
        item.dataset.url = bookmark.url || '';
        item.dataset.index = index;
        item.dataset.parentId = bookmark.parentId;
        item.draggable = true;

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
                
                item.parentElement.querySelectorAll('.bookmark-item.highlighted').forEach(i => i.classList.remove('highlighted'));

                if (!isHighlighted) {
                    item.classList.add('highlighted');
                    renderBookmarks(bookmark.children, document.getElementById('bookmarkContainer'), level + 1);
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
    });
    column.appendChild(fragment);
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

    const container = targetItem.parentElement;
    container.querySelectorAll('.bookmark-item').forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
    });

    const level = container.dataset.level;
    
    if (level === '0') {
        const rect = targetItem.getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
            targetItem.classList.add('drag-over-before');
        } else {
            targetItem.classList.add('drag-over-after');
        }
    } else {
        const isFolder = !targetItem.dataset.url;
        if (isFolder) {
            targetItem.classList.add('drag-enter');
        } else {
            const rect = targetItem.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) {
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
    if (!draggedItem) return;

    const draggedId = draggedItem.dataset.id;
    const dropTarget = e.target.closest('.bookmark-item');
    if (!dropTarget || dropTarget === draggedItem) return;

    let newIndex = parseInt(dropTarget.dataset.index, 10);
    const level = dropTarget.parentElement.dataset.level;

    const onMoveSuccess = () => {
        showToast('移动成功');
        // 核心修正：调用无损刷新
        refreshUI();
    };
    
    if (level === '0') {
        if (dropTarget.classList.contains('drag-over-after')) newIndex++;
        chrome.bookmarks.move(draggedId, { index: newIndex }, onMoveSuccess);
    } else {
        if (dropTarget.classList.contains('drag-enter')) {
            chrome.bookmarks.move(draggedId, { parentId: dropTarget.dataset.id }, onMoveSuccess);
        } else {
            if (dropTarget.classList.contains('drag-over-bottom')) newIndex++;
            chrome.bookmarks.move(draggedId, { index: newIndex }, onMoveSuccess);
        }
    }
}

function handleDragLeave(e) {
    const targetItem = e.target.closest('.bookmark-item');
    if (targetItem) {
        targetItem.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
    }
}

function handleDragEnd(e) {
    isDragging = false;
    if (draggedItem) {
        draggedItem.classList.remove('dragging');
    }
    document.querySelectorAll('.bookmark-item').forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
    });
    draggedItem = null;
    // 拖动结束后不再需要刷新，因为 onMoveSuccess 会处理
}


// --- 对话框 & 右键菜单 (无改动) ---
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
                if(newName) chrome.bookmarks.update(id, { title: newName }, () => refreshUI());
            });
            break;
        case 'editUrl':
            showEditDialog('修改网址', url, isValidUrl, (newUrl) => {
                if(newUrl) chrome.bookmarks.update(id, { url: newUrl }, () => refreshUI());
            });
            break;
        case 'delete':
            showConfirmDialog(`删除 ${isFolder ? '文件夹' : '书签'}`, `确定要删除 "${title}" 吗?`, () => {
                const promise = isFolder ? chrome.bookmarks.removeTree(id) : chrome.bookmarks.remove(id);
                promise.then(() => refreshUI()).catch(err => showToast('删除失败: ' + err.message));
            });
            break;
        case 'move': showMoveDialog(element); break;
        case 'newFolder':
            const column = document.getElementById('contextMenu').relatedColumn;
            let parentId = '1'; // 默认为书签栏
            if (column) {
                if (column.dataset.level > 0) {
                     const prevColumn = column.previousElementSibling;
                     if(prevColumn) parentId = prevColumn.querySelector('.highlighted')?.dataset.id || '1';
                }
            }
            showEditDialog('新建文件夹', '', null, (name) => {
                if(name) chrome.bookmarks.create({ parentId, title: name }, () => refreshUI());
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

    const close = () => { dialog.style.display = 'none'; confirmBtn.onclick = null; cancelBtn.onclick = null; };
    
    confirmBtn.onclick = () => {
        if (validator && !validator(input.value)) { error.textContent = '输入内容无效'; return; }
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

    const close = () => { dialog.style.display = 'none'; confirmBtn.onclick = null; cancelBtn.onclick = null; };

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
        treeContainer.innerHTML = '';
    };

    const renderTree = (nodes, parentElement, level) => {
        nodes.forEach(node => {
            if (node.children) {
                const item = document.createElement('div');
                item.className = 'bookmark-tree-item';
                item.dataset.id = node.id;
                
                const content = document.createElement('div');
                content.className = 'folder-content';
                content.style.paddingLeft = `${level * 20}px`;

                const expandIcon = document.createElement('span');
                expandIcon.className = 'expand-icon';
                if (node.children.some(child => child.children)) {
                    expandIcon.textContent = '▶';
                    expandIcon.onclick = (e) => {
                        e.stopPropagation();
                        const subFolder = item.querySelector('.sub-folder');
                        if (subFolder) {
                            const isExpanded = subFolder.style.height !== '0px';
                            subFolder.style.height = isExpanded ? '0px' : `${subFolder.scrollHeight}px`;
                            expandIcon.textContent = isExpanded ? '▶' : '▼';
                        }
                    };
                }

                const folderIcon = document.createElement('img');
                folderIcon.src = '/img/folder_icon.svg';
                folderIcon.className = 'folder-icon';

                const title = document.createElement('span');
                title.textContent = node.title;
                title.className = 'folder-title';

                content.appendChild(expandIcon);
                content.appendChild(folderIcon);
                content.appendChild(title);
                item.appendChild(content);

                content.onclick = () => {
                    document.querySelectorAll('.bookmark-tree-item.selected').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                    selectedFolderId = node.id;
                };

                if (node.children.some(child => child.children)) {
                    const subFolder = document.createElement('div');
                    subFolder.className = 'sub-folder';
                    subFolder.style.height = '0px';
                    renderTree(node.children, subFolder, level + 1);
                    item.appendChild(subFolder);
                }
                parentElement.appendChild(item);
            }
        });
    };

    chrome.bookmarks.getTree(tree => {
        treeContainer.innerHTML = '<div class="loading">加载中...</div>';
        try {
            const bookmarksBar = tree[0]?.children?.[0]?.children;
            if (bookmarksBar) {
                treeContainer.innerHTML = '';
                renderTree(bookmarksBar, treeContainer, 0);
            } else {
                 treeContainer.innerHTML = '<div class="loading error">无法加载书签</div>';
            }
        } catch (error) {
            treeContainer.innerHTML = `<div class="loading error">加载失败: ${error.message}</div>`;
        }
    });

    dialog.style.display = 'flex';
    confirmBtn.onclick = () => {
        if (selectedFolderId && selectedFolderId !== bookmarkElement.dataset.id) {
            chrome.bookmarks.move(bookmarkElement.dataset.id, { parentId: selectedFolderId }, () => {
                refreshUI(); // 使用无损刷新
                showToast('移动成功');
            });
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

    let isModuleVisible = false;
    let hoverTimeout;
    const showModules = () => { if (!isModuleVisible) { verticalModules.style.display = 'flex'; isModuleVisible = true; } };
    const hideModules = () => { if (isModuleVisible) { verticalModules.style.display = 'none'; isModuleVisible = false; } };
    toggleVerticalBtn.addEventListener('click', (e) => { e.stopPropagation(); isModuleVisible ? hideModules() : showModules(); });
    toggleVerticalBtn.addEventListener('mouseenter', () => { clearTimeout(hoverTimeout); hoverTimeout = setTimeout(showModules, 500); });
    toggleVerticalBtn.addEventListener('mouseleave', () => clearTimeout(hoverTimeout));
    verticalModules.addEventListener('mouseenter', () => clearTimeout(hoverTimeout));

    document.addEventListener('click', (e) => {
        if (settingsPanel.classList.contains('visible') && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) settingsPanel.classList.remove('visible');
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
            delete document.body.dataset.contextMenuOpen;
        }
        if (isModuleVisible && !verticalModules.contains(e.target) && !toggleVerticalBtn.contains(e.target)) hideModules();
    });
    
    // 为动态内容区域的父级添加 contextmenu 事件监听
    document.body.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.bookmark-item');
        if (!item) return;

        const column = item.closest('.bookmark-column');
        if (!column) return;
        
        e.preventDefault();
        document.querySelectorAll('.bookmark-item.highlgg').forEach(i => i.classList.remove('highlgg'));
        item.classList.add('highlgg');
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

    // 初始加载
    chrome.bookmarks.getTree(displayBookmarks);
});
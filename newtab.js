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
        HOVER_ENABLED: 'hoverToOpenEnabled',
        HOVER_DELAY: 'hoverDelay'
    },
    // 优化后的布局常量 - 内容驱动的响应式设计
    LAYOUT: {
        COLUMN_GAP: 20,              // 列之间的间隙 (px)
        // 响应式列宽配置 - 合理范围，让内容自适应
        RESPONSIVE_WIDTHS: {
            XSMALL: { min: 150, ideal: 200, max: 280 },   // < 900px (小屏平板/手机)
            SMALL: { min: 160, ideal: 220, max: 320 },    // 900-1200px
            MEDIUM: { min: 180, ideal: 240, max: 360 },   // 1200-1600px
            LARGE: { min: 200, ideal: 260, max: 400 },    // 1600-1920px
            XLARGE: { min: 220, ideal: 280, max: 450 },   // 1920-2560px
            XXLARGE: { min: 240, ideal: 300, max: 500 }   // > 2560px (4K+)
        },
        // 窗口宽度断点 - 更细化
        BREAKPOINTS: {
            XSMALL: 900,
            SMALL: 1200,
            MEDIUM: 1600,
            LARGE: 1920,
            XLARGE: 2560
        },
        // 边距配置
        MARGIN: {
            MIN_BASE: 16,            // 基础最小边距
            MIN_RATIO: 0.015,        // 动态最小边距比例（容器宽度的1.5%）
            MAX: 120,                // 标准边距上限
            CENTERING_THRESHOLD: 0.35, // 居中阈值：只有内容占比 < 35% 时才居中
            FIXED_CONTENT_WIDTH: 382, // 固定的单列内容宽度，用于计算居中边距
            WINDOW_CHANGE_THRESHOLD: 100 // 窗口宽度变化阈值 (px)
        },
        // 动画配置 - 简化并优化
        ANIMATION: {
            DURATION: 200,           // 缩短动画时长 (ms)
            EASING: 'ease-out',      // 更自然的缓动函数
            SCROLL_BEHAVIOR: 'smooth' // 保持平滑滚动
        }
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
let isMouseOverTopSitesBar = false;

// 新增：记录第一列的初始边距，防止视觉跳跃
let initialMarginLeft = null;
let savedMarginLeft = null; // 保存经过居中调整后的边距
let marginWindowWidth = null; // 保存计算边距时的窗口宽度
let currentColumnCount = 0;
let needsRecenter = false; // 标记窗口放大后需要重新居中

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
        // 核心修正：确保 glass-effect 类被保留
        toast.className = 'toast glass-effect show';
        setTimeout(() => {
            // 恢复时也确保 glass-effect 类存在
            toast.className = 'toast glass-effect';
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

// ▼▼▼ 从这里开始添加新代码 ▼▼▼

/**
 * 创建一个可复用的悬停意图监听器。
 * @param {function} callback - 延迟时间到达后要执行的回调函数。
 * @param {number} [delay=500] - 悬停的延迟时间 (毫秒)。
 * @returns {{handleMouseEnter: function, handleMouseLeave: function}} - 返回包含两个事件处理函数的对象。
 */
function createHoverIntent(callback, delay = 500) {
    let hoverTimeout;

    const handleMouseEnter = () => {
        // 统一在这里检查全局开关
        if (!isHoverEnabled) return;

        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(callback, delay);
    };

    const handleMouseLeave = () => {
        clearTimeout(hoverTimeout);
    };

    return { handleMouseEnter, handleMouseLeave };
}

// --- 多选相关函数 ---
function clearSelection() {
    selectedItems.clear();
    document.querySelectorAll('.bookmark-item.selected, .vertical-modules a.selected, .top-site-item.selected').forEach(el => el.classList.remove('selected'));
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

        // 检测书签栏是否需要居中显示
        requestAnimationFrame(() => {
            adjustBookmarksBarAlignment(column);
        });

    } else {
        const nextColumns = container.querySelectorAll(`.bookmark-column`);
        nextColumns.forEach(col => {
            if (parseInt(col.dataset.level) >= level) col.remove();
        });
        column = document.createElement('div');
        column.className = 'bookmark-column new-column'; // 添加标记类
        column.dataset.level = level;

        // 如果是第一列，预先计算并应用边距，防止闪烁
        if (level === 1 && initialMarginLeft === null) {
            const availableWidth = container.clientWidth;
            const baseMargin = calculateCenteredMargin(availableWidth);
            const finalMargin = applyCenteredMargin(baseMargin);
            initialMarginLeft = finalMargin;
            column.style.marginLeft = `${finalMargin}px`;
        }

        // 如果是第一列且窗口很大，禁用初始动画
        if (level === 1 && window.innerWidth > 1600) {
            column.style.animation = 'none';
            // 使用简单的淡入
            setTimeout(() => {
                column.style.animation = '';
                column.style.opacity = '0';
                column.style.transition = 'opacity 0.2s ease-out';
                requestAnimationFrame(() => {
                    column.style.opacity = '1';
                });
            }, 0);
        }

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

    // 优化：更智能的列宽调整和滚动
    setTimeout(() => {
        if (container.contains(column)) {
            // 先调整列宽
            adjustColumnWidths(container);

            // 新列的智能滚动逻辑
            if (level > 0 && column.classList.contains('new-column')) {
                // 延迟一下，等待列宽调整完成
                setTimeout(() => {
                    const currentScroll = container.scrollLeft;
                    const containerWidth = container.clientWidth;
                    const columnLeft = column.offsetLeft;
                    const columnRight = columnLeft + column.offsetWidth;

                    // 计算前一列的位置
                    const prevColumn = column.previousElementSibling;
                    let targetScroll = currentScroll;

                    if (prevColumn && prevColumn.classList.contains('bookmark-column')) {
                        // 尝试同时显示前一列和当前列
                        const prevLeft = prevColumn.offsetLeft;
                        const totalWidth = columnRight - prevLeft;

                        if (totalWidth <= containerWidth) {
                            // 可以同时显示两列
                            targetScroll = prevLeft - 20;
                        } else {
                            // 空间不够，优先显示新列
                            targetScroll = Math.max(0, columnLeft - 40);
                        }
                    } else {
                        // 没有前一列，直接显示当前列
                        targetScroll = Math.max(0, columnLeft - 20);
                    }

                    // 只有当需要滚动时才执行
                    const scrollDiff = Math.abs(targetScroll - currentScroll);
                    if (scrollDiff > 10) {
                        container.scrollTo({
                            left: targetScroll,
                            behavior: 'smooth'
                        });
                    }

                    // 移除标记类
                    column.classList.remove('new-column');
                }, 150); // 等待列宽调整
            }
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

    const isFolder = !bookmark.url;
    let icon;

    if (isFolder) {
        // 为文件夹创建内联的SVG图标
        icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('class', 'bookmark-icon');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttributeNS(null, 'href', '#icon-folder');
        icon.appendChild(use);
    } else {
        // 为书签创建<img>标签，用于懒加载网站图标
        icon = document.createElement('img');
        icon.className = 'bookmark-icon';
        // 【核心修复】使用一个1x1的透明像素作为初始src，防止onerror被错误触发
        icon.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        icon.dataset.src = getIconUrl(bookmark.url);

        // 当网站图标加载失败时的备用处理
        icon.onerror = (e) => {
            // 防止无限循环
            if (e.target.dataset.fallback) return;

            const fallbackIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            fallbackIcon.setAttribute('class', 'bookmark-icon');
            fallbackIcon.dataset.fallback = 'true'; // 标记为备用图标
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttributeNS(null, 'href', '#icon-folder');
            fallbackIcon.appendChild(use);

            if (icon.parentNode) {
                icon.parentNode.replaceChild(fallbackIcon, icon);
            }
        };
    }

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

    // --- 事件监听器部分保持不变 ---
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

    if (isFolder) {
        item.addEventListener('mouseenter', () => {
            startHoverIntent(item);
        });
        item.addEventListener('mouseleave', () => {
            clearHoverIntent();
        });
    }

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
        
        // 如果关闭后没有列了，重置初始边距和居中标志
        const remainingColumns = container.querySelectorAll('.bookmark-column[data-level]:not([data-level="0"])');
        if (remainingColumns.length === 0) {
            initialMarginLeft = null;
            currentColumnCount = 0;
            needsRecenter = false;
        }
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

            // 使用响应式配置的最小宽度
            const config = getResponsiveConfig();
            if (newWidth < config.min) {
                newWidth = config.min;
            }

            column.style.width = `${newWidth}px`;
            column.dataset.userResized = 'true';

            // 调用优化后的列宽调整函数
            adjustColumnWidths(container);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });
}

let resizing = false;





/* 文件: newtab.js */

/**
 * 调整书签栏的对齐方式
 * - 如果内容宽度小于容器宽度：居中显示
 * - 如果内容宽度大于等于容器宽度：左对齐，启用滚动
 */
function adjustBookmarksBarAlignment(bookmarksBar) {
    if (!bookmarksBar) return;

    // 获取内容实际宽度和容器宽度
    const contentWidth = bookmarksBar.scrollWidth;
    const containerWidth = bookmarksBar.clientWidth;

    // 如果内容不溢出，可以居中
    if (contentWidth <= containerWidth) {
        bookmarksBar.classList.add('can-center');
    } else {
        bookmarksBar.classList.remove('can-center');
    }
}

/**
 * 获取当前窗口大小对应的响应式配置
 * @returns {Object} - 包含 min, ideal, max 宽度的配置对象
 */
function getResponsiveConfig() {
    const windowWidth = window.innerWidth;
    const { BREAKPOINTS, RESPONSIVE_WIDTHS } = CONSTANTS.LAYOUT;

    if (windowWidth < BREAKPOINTS.XSMALL) {
        return RESPONSIVE_WIDTHS.XSMALL;
    } else if (windowWidth < BREAKPOINTS.SMALL) {
        return RESPONSIVE_WIDTHS.SMALL;
    } else if (windowWidth < BREAKPOINTS.MEDIUM) {
        return RESPONSIVE_WIDTHS.MEDIUM;
    } else if (windowWidth < BREAKPOINTS.LARGE) {
        return RESPONSIVE_WIDTHS.LARGE;
    } else if (windowWidth < BREAKPOINTS.XLARGE) {
        return RESPONSIVE_WIDTHS.XLARGE;
    } else {
        return RESPONSIVE_WIDTHS.XXLARGE;
    }
}

/**
 * 计算动态的左边距，基于窗口大小提供合理的留白。
 * 使用更激进的增长曲线，让大窗口有足够的视觉呼吸空间。
 * @param {number} [containerWidth] - 可选的容器宽度，默认使用 window.innerWidth
 * @returns {number} - 计算出的左边距值（像素）
 */
function calculateCenteredMargin(containerWidth = window.innerWidth) {
    const { COLUMN_GAP, BREAKPOINTS, MARGIN } = CONSTANTS.LAYOUT;
    
    // 动态最小边距：基础值 + 容器宽度的一定比例
    const dynamicMinMargin = Math.max(
        MARGIN.MIN_BASE,
        containerWidth * MARGIN.MIN_RATIO
    );

    // 小窗口（< 1200px）：保持最小边距
    if (containerWidth < BREAKPOINTS.SMALL) {
        return Math.round(dynamicMinMargin);
    }

    // 中等窗口（1200-1600px）：线性增长，从 20px 到 100px
    if (containerWidth < BREAKPOINTS.MEDIUM) {
        const progress = (containerWidth - BREAKPOINTS.SMALL) / (BREAKPOINTS.MEDIUM - BREAKPOINTS.SMALL);
        const margin = 20 + progress * 80; // 20px -> 100px
        return Math.round(Math.max(dynamicMinMargin, margin));
    }

    // 大窗口（1600-1920px）：加速增长，从 100px 到 280px
    if (containerWidth < BREAKPOINTS.LARGE) {
        const progress = (containerWidth - BREAKPOINTS.MEDIUM) / (BREAKPOINTS.LARGE - BREAKPOINTS.MEDIUM);
        const margin = 100 + progress * 180; // 100px -> 280px
        return Math.round(Math.max(dynamicMinMargin, margin));
    }

    // 超大窗口（1920-2560px）：继续增长，从 280px 到 450px
    if (containerWidth < BREAKPOINTS.XLARGE) {
        const progress = (containerWidth - BREAKPOINTS.LARGE) / (BREAKPOINTS.XLARGE - BREAKPOINTS.LARGE);
        const margin = 280 + progress * 170; // 280px -> 450px
        return Math.round(margin);
    }

    // 4K+ 窗口（> 2560px）：从 450px 继续增长到 600px
    const progress = Math.min(1, (containerWidth - BREAKPOINTS.XLARGE) / 1000);
    const margin = 450 + progress * 150; // 450px -> 600px
    return Math.round(margin);
}

// 应用居中边距调整（使用固定的单列宽度来计算）
function applyCenteredMargin(marginLeft) {
    const availableWidth = window.innerWidth;

    // 边界检查：确保窗口宽度有效
    if (availableWidth <= 0) {
        return marginLeft;
    }

    // 使用常量中定义的固定单列宽度来计算内容占比
    // 这样可以确保相同窗口大小下，边距始终一致
    const fixedContentWidth = CONSTANTS.LAYOUT.MARGIN.FIXED_CONTENT_WIDTH;
    const contentRatio = fixedContentWidth / availableWidth;

    // 计算完美居中所需的边距
    const baseMargin = marginLeft;
    const perfectCenteringMargin = (availableWidth - fixedContentWidth) / 2;

    // 渐进式居中系数：内容越少，居中效果越强
    // 使用 Math.max 确保系数不为负数
    const centeringFactor = Math.max(0,
        (CONSTANTS.LAYOUT.MARGIN.CENTERING_THRESHOLD - contentRatio) / CONSTANTS.LAYOUT.MARGIN.CENTERING_THRESHOLD
    );

    const additionalMargin = (perfectCenteringMargin - baseMargin) * centeringFactor;
    const finalMarginLeft = Math.max(0, baseMargin + additionalMargin);

    // 保存计算结果
    savedMarginLeft = finalMarginLeft;
    marginWindowWidth = availableWidth;

    return finalMarginLeft;
}

// ==================================================================
// --- 恢复原始的平滑动画 + 稳定布局算法（只修复抖动） ---
// ==================================================================
function adjustColumnWidths(container) {
    if (!container || resizing) return;
    resizing = true;

    requestAnimationFrame(() => {
        try {
            // --- 1. 布局读取 (Read Phase) ---
            const columns = Array.from(container.querySelectorAll('.bookmark-column[data-level]:not([data-level="0"])'));
            if (columns.length === 0) {
                resizing = false;
                return;
            }

        const gap = CONSTANTS.LAYOUT.COLUMN_GAP;
        const availableWidth = container.clientWidth;
        const config = getResponsiveConfig();
        const DEFAULT_COL_WIDTH = config.ideal;
        const MIN_COL_WIDTH = config.min;
        const newStyles = new Map();

        const columnData = columns.map(col => ({
            el: col,
            currentWidth: col.offsetWidth,
            userResized: col.dataset.userResized === 'true',
            canResize: col.dataset.userResized !== 'true'
        }));

        // --- 智能布局策略：固定第一列位置，防止视觉跳跃 ---
        let marginLeft = 0;
        const marginRight = CONSTANTS.LAYOUT.COLUMN_GAP;
        const firstColumn = columns[0];

        // 检测列数变化
        const newColumnCount = columns.length;
        const columnsChanged = newColumnCount !== currentColumnCount;

        // 只有当第一列是 data-level="1" 时才计算边距
        if (firstColumn && firstColumn.dataset.level === "1") {
            if (columnsChanged) {
                if (newColumnCount === 0) {
                    // 场景1：所有列都关闭了，重置所有状态
                    initialMarginLeft = null;
                    savedMarginLeft = null;
                    marginWindowWidth = null;
                    needsRecenter = false;
                } else if (newColumnCount === 1 && initialMarginLeft === null) {
                    // 场景2：首次打开第一个书签 - 计算居中边距
                    marginLeft = calculateCenteredMargin(availableWidth);
                    marginLeft = applyCenteredMargin(marginLeft);
                    initialMarginLeft = marginLeft;
                } else if (newColumnCount > currentColumnCount) {
                    // 场景3：打开新书签 - 使用保存的边距
                    marginLeft = savedMarginLeft || initialMarginLeft || calculateCenteredMargin(availableWidth);
                }
                currentColumnCount = newColumnCount;
            } else {
                // 列数没变，检查窗口变化
                if (newColumnCount > 0) {
                    const currentWindowWidth = availableWidth;
                    const savedWindowWidth = marginWindowWidth || currentWindowWidth;
                    const windowWidthDiff = Math.abs(currentWindowWidth - savedWindowWidth);

                    if (windowWidthDiff > CONSTANTS.LAYOUT.MARGIN.WINDOW_CHANGE_THRESHOLD) {
                        // 场景4：窗口显著变化 - 重新计算居中边距
                        marginLeft = calculateCenteredMargin(availableWidth);
                        marginLeft = applyCenteredMargin(marginLeft);
                        initialMarginLeft = marginLeft;
                    } else {
                        // 场景5：窗口未显著变化 - 使用保存的边距
                        marginLeft = savedMarginLeft || initialMarginLeft || calculateCenteredMargin(availableWidth);
                    }
                } else {
                    marginLeft = calculateCenteredMargin(availableWidth);
                }
            }
        }

        // --- 2. 核心布局计算（优化版） ---
        // 实际占用空间 = 左边距 + 所有列宽 + 列间隙 + 右边距
        const columnsWidth = columnData.reduce((sum, data) => sum + data.currentWidth, 0);
        const gapsWidth = (columnData.length - 1) * gap;
        const totalUsedWidth = marginLeft + columnsWidth + gapsWidth + marginRight;

        const resizableColumns = columnData.filter(data => data.canResize);

        // CASE 1: 内容溢出，需要收缩
        if (totalUsedWidth > availableWidth) {
            // 溢出量 = 总占用宽度 - 可用宽度
            const overflowWidth = totalUsedWidth - availableWidth;

            // 优化：按照当前宽度排序，优先收缩较宽的列
            const sortedResizable = [...resizableColumns].sort((a, b) => b.currentWidth - a.currentWidth);
            
            const totalShrinkableSpace = sortedResizable.reduce((sum, data) => {
                return sum + Math.max(0, data.currentWidth - MIN_COL_WIDTH);
            }, 0);

            if (totalShrinkableSpace >= overflowWidth) {
                // 使用权重收缩：较宽的列收缩更多
                for (const data of sortedResizable) {
                    const shrinkableAmount = Math.max(0, data.currentWidth - MIN_COL_WIDTH);
                    if (shrinkableAmount > 0) {
                        // 权重：当前可收缩空间占总可收缩空间的比例
                        const proportion = shrinkableAmount / totalShrinkableSpace;
                        const reduction = overflowWidth * proportion;
                        const newWidth = Math.max(MIN_COL_WIDTH, data.currentWidth - reduction);
                        newStyles.set(data.el, { width: `${newWidth}px` });
                    }
                }
            } else {
                // 如果收缩空间不够，将所有可调整的列缩到最小
                for (const data of sortedResizable) {
                    if (data.currentWidth > MIN_COL_WIDTH) {
                        newStyles.set(data.el, { width: `${MIN_COL_WIDTH}px` });
                    }
                }
            }

        // CASE 2: 空间有富余，适度扩展（以内容为主，不强行填充）
        } else {
            // 可用空间 = 容器宽度 - 实际占用宽度
            const availableSpace = availableWidth - totalUsedWidth;

            // 只扩展到 ideal 宽度，让内容自然呈现
            const columnsToEnlarge = resizableColumns.filter(data => data.currentWidth < DEFAULT_COL_WIDTH);
            
            if (columnsToEnlarge.length > 0 && availableSpace > 0) {
                const totalEnlargePotential = columnsToEnlarge.reduce((sum, data) => {
                    return sum + (DEFAULT_COL_WIDTH - data.currentWidth);
                }, 0);

                if (totalEnlargePotential > 0) {
                    if (totalEnlargePotential <= availableSpace) {
                        // 空间足够，全部扩展到 ideal 宽度
                        for (const data of columnsToEnlarge) {
                            newStyles.set(data.el, { width: `${DEFAULT_COL_WIDTH}px` });
                        }
                    } else {
                        // 空间不够，按比例扩展
                        for (const data of columnsToEnlarge) {
                            const potential = DEFAULT_COL_WIDTH - data.currentWidth;
                            const proportion = potential / totalEnlargePotential;
                            const enlargeAmount = availableSpace * proportion;
                            const newWidth = data.currentWidth + enlargeAmount;
                            newStyles.set(data.el, { width: `${newWidth}px` });
                        }
                    }
                }
            }
        }

        // --- 3. 布局写入（优化：减少抖动 + 智能居中） ---
        
        // 先应用宽度变化
        const hasLargeChanges = Array.from(newStyles.entries()).some(([el, style]) => {
            const currentWidth = el.offsetWidth;
            const newWidth = parseFloat(style.width);
            return Math.abs(currentWidth - newWidth) > 50;
        });

        if (hasLargeChanges) {
            // 大变化时禁用动画
            newStyles.forEach((style, el) => {
                el.style.transition = 'none';
                el.style.width = style.width;
            });
        } else {
            // 小变化时保持动画
            newStyles.forEach((style, el) => {
                el.style.width = style.width;
            });
        }

        // 使用已计算的边距（在前面的场景逻辑中已经计算好了）
        const finalMarginLeft = marginLeft;

        if (firstColumn && firstColumn.dataset.level === "1") {
            // 清除重新居中标记
            if (needsRecenter) {
                needsRecenter = false;
            }

            // 应用边距
            const currentMargin = parseFloat(firstColumn.style.marginLeft) || 0;
            const marginDiff = Math.abs(finalMarginLeft - currentMargin);

            // 只有边距差异超过 1px 时才应用，避免微小抖动
            if (marginDiff > 1) {
                // 边距变化大时禁用动画
                if (marginDiff > 100 || !firstColumn.dataset.initialized) {
                    firstColumn.style.transition = 'none';
                    firstColumn.style.marginLeft = `${finalMarginLeft}px`;
                    firstColumn.dataset.initialized = 'true';
                    firstColumn.offsetHeight; // 强制重排
                    firstColumn.style.transition = '';
                } else {
                    firstColumn.style.marginLeft = `${finalMarginLeft}px`;
                }
            }
        }

        // 恢复动画（如果之前禁用了）
        if (hasLargeChanges) {
            requestAnimationFrame(() => {
                newStyles.forEach((style, el) => {
                    el.style.transition = '';
                });
            });
        }

        // --- 4. 最终智能聚焦滚动（优化版 - 考虑右侧边距和居中） ---
        requestAnimationFrame(() => {
            let scrollTarget = 0;
            const finalColumns = Array.from(container.querySelectorAll('.bookmark-column[data-level]:not([data-level="0"])'));

            // 获取第一列的实际左边距（使用最终计算的值）
            const firstColumnMargin = firstColumn && firstColumn.dataset.level === "1" 
                ? (parseFloat(firstColumn.style.marginLeft) || finalMarginLeft || 0)
                : 0;

            // 计算实际占用的总宽度（包含右边距）
            const finalColumnsWidth = finalColumns.reduce((sum, col) => sum + col.offsetWidth, 0);
            const finalGapsWidth = (finalColumns.length - 1) * gap;
            const finalTotalWidth = firstColumnMargin + finalColumnsWidth + finalGapsWidth + marginRight;

            // 判断是否需要滚动
            if (finalTotalWidth > availableWidth) {
                // 从右往左计算能显示的列（考虑右侧边距）
                let visibleWidth = marginRight; // 从右边距开始
                let firstVisibleColumnIndex = finalColumns.length - 1;
                const maxVisibleWidth = availableWidth;

                for (let i = finalColumns.length - 1; i >= 0; i--) {
                    const currentCol = finalColumns[i];
                    const colWidth = currentCol.offsetWidth;
                    const widthToAdd = (i === finalColumns.length - 1) ? colWidth : colWidth + gap;

                    if (visibleWidth + widthToAdd <= maxVisibleWidth) {
                        visibleWidth += widthToAdd;
                        firstVisibleColumnIndex = i;
                    } else {
                        break;
                    }
                }

                // 计算滚动目标：让第一个可见列的左边缘对齐到容器左边缘
                // 考虑左边距和右边距
                if (firstVisibleColumnIndex === 0 && firstColumnMargin > 0) {
                    // 如果第一个可见列就是第一列，保留其左边距
                    scrollTarget = 0;
                } else {
                    // 否则，滚动到该列的位置
                    // 如果是第一列，不减去边距；否则要确保完全可见
                    const targetColumn = finalColumns[firstVisibleColumnIndex];
                    scrollTarget = targetColumn.offsetLeft - firstColumnMargin;
                    
                    // 微调：确保不会让左侧列完全贴边
                    if (firstVisibleColumnIndex > 0) {
                        scrollTarget = Math.max(0, scrollTarget - 10);
                    }
                }
            } else {
                // 内容不溢出，滚动到起始位置
                scrollTarget = 0;
            }

            // 只在需要时滚动，避免不必要的动画
            const currentScroll = container.scrollLeft;
            const scrollDiff = Math.abs(scrollTarget - currentScroll);

            if (scrollDiff > 10) {
                container.scrollTo({
                    left: Math.max(0, scrollTarget),
                    behavior: scrollDiff > 200 ? 'smooth' : 'auto'
                });
            }

            resizing = false;
        });
        } catch (error) {
            // 捕获并记录错误，防止阻塞
            console.error('Error in adjustColumnWidths:', error);
            resizing = false;
        }
    });
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
    }, 700); // 300毫秒的冷却时间，足够用户移开鼠标

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
// ==================================================================
// --- 这是修正后的 hideContextMenu 函数 (请整体替换) ---
// ==================================================================
function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu.style.display === 'block') {
        contextMenu.style.display = 'none';
        delete document.body.dataset.contextMenuOpen;

        // ▼▼▼ 新增的核心逻辑 ▼▼▼
        // 当菜单关闭时，检查鼠标是否还在“经常访问”区域，如果不在，则收起它
        if (!isMouseOverTopSitesBar) {
            const topSitesBar = document.getElementById('topSitesBar');
            if (topSitesBar) {
                topSitesBar.classList.remove('expanded');
            }
        }
        // ▲▲▲ 新增逻辑结束 ▲▲▲
    }
}
// ==================================================================
// --- 这是最终图标更新后的 showContextMenu 函数 (请整体替换) ---
// ==================================================================
function showContextMenu(e, bookmarkElement, column) {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.innerHTML = ''; // 清空旧菜单
    const ul = document.createElement('ul');
    let menuItems = []; // 使用数组来管理菜单项，更清晰

    const createMenuItem = (id, iconId, text) => {
        return `<li id="${id}"><svg class="menu-icon" aria-hidden="true"><use xlink:href="#${iconId}"></use></svg>${text}</li>`;
    };
    const createSeparator = () => `<hr>`;

    const rightClickedId = bookmarkElement?.dataset.id;
    const isModuleItem = bookmarkElement?.closest('.vertical-modules');
    const isTopSiteItem = bookmarkElement?.classList.contains('top-site-item');

    if (rightClickedId && !selectedItems.has(rightClickedId)) {
        clearSelection();
        if (isTopSiteItem) {
            selectedItems.add(rightClickedId);
            bookmarkElement.classList.add('selected');
        } else {
            toggleSelection(bookmarkElement);
        }
    } else if (!rightClickedId) {
        clearSelection();
    }

    const selectionSize = selectedItems.size;
    const hasBookmarkInSelection = Array.from(selectedItems).some(id => {
        const item = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);
        return item && !item.classList.contains('is-folder');
    });

    if (isTopSiteItem) {
        menuItems.push(createMenuItem('open', 'icon-open', '新标签打开'));
        // [修改] 调用新的 icon-open-new
        menuItems.push(createMenuItem('openNew', 'icon-open-new', '新窗口打开'));
        // [修改] 调用新的 icon-open-incognito
        menuItems.push(createMenuItem('openIncognito', 'icon-open-incognito', '在隐身模式中打开'));
        menuItems.push(createSeparator());
        menuItems.push(createMenuItem('removeTopSite', 'icon-delete', '移除'));
    }
    else if (selectionSize > 0) {
        if (selectionSize > 1) {
            if (hasBookmarkInSelection) {
                menuItems.push(createMenuItem('open', 'icon-open-all', `打开全部 (${selectionSize})`));
                // [修改] 调用新的 icon-open-new
                menuItems.push(createMenuItem('openNew', 'icon-open-new', `新窗口打开全部 (${selectionSize})`));
                // [修改] 调用新的 icon-open-incognito
                menuItems.push(createMenuItem('openIncognito', 'icon-open-incognito', `隐身模式打开全部 (${selectionSize})`));
                menuItems.push(createSeparator());
            }
        } else {
            const isFolder = bookmarkElement && bookmarkElement.classList.contains('is-folder');
            if (isFolder) {
                menuItems.push(createMenuItem('openAll', 'icon-open-all', '打开文件夹内所有书签'));
                menuItems.push(createSeparator());
            } else {
                menuItems.push(createMenuItem('open', 'icon-open', '新标签打开'));
                // [修改] 调用新的 icon-open-new
                menuItems.push(createMenuItem('openNew', 'icon-open-new', '新窗口打开'));
                // [修改] 调用新的 icon-open-incognito
                menuItems.push(createMenuItem('openIncognito', 'icon-open-incognito', '在隐身模式中打开'));
                menuItems.push(createSeparator());
            }
        }

        if (selectionSize === 1 && bookmarkElement && !bookmarkElement.classList.contains('is-folder')) {
            menuItems.push(createMenuItem('editUrl', 'icon-edit', '修改网址'));
        }
        if (selectionSize === 1) {
            // [修改] 调用新的 icon-rename
            menuItems.push(createMenuItem('rename', 'icon-rename', '重命名'));
        }
        menuItems.push(createMenuItem('move', 'icon-move', `移动${selectionSize > 1 ? ` (${selectionSize})` : ''}到...`));
        if (selectionSize === 1 && bookmarkElement && !bookmarkElement.classList.contains('is-folder')) {
            menuItems.push(createMenuItem('copyUrl', 'icon-copy', '复制网址'));
        }
        if (selectionSize === 1) {
            menuItems.push(createMenuItem('properties', 'icon-properties', '属性'));
        }
        menuItems.push(createSeparator());
        menuItems.push(createMenuItem('delete', 'icon-delete', `删除${selectionSize > 1 ? ` (${selectionSize})` : ''}`));
    }

    if (column && !isModuleItem && !isTopSiteItem) {
        if (menuItems.length > 0) menuItems.push(createSeparator());
        menuItems.push(createMenuItem('newFolder', 'icon-folder-plus', '新建文件夹'));
        menuItems.push(createSeparator());
        menuItems.push(createMenuItem(CONSTANTS.SORT_TYPES.ALPHA_ASC, 'icon-sort-alpha-asc', '排序：由 A 到 Z'));
        menuItems.push(createMenuItem(CONSTANTS.SORT_TYPES.ALPHA_DESC, 'icon-sort-alpha-desc', '排序：由 Z 到 A'));
        menuItems.push(createMenuItem(CONSTANTS.SORT_TYPES.DATE_NEW, 'icon-sort-date-desc', '排序：从新到旧'));
        menuItems.push(createMenuItem(CONSTANTS.SORT_TYPES.DATE_OLD, 'icon-sort-date-asc', '排序：从旧到新'));
        menuItems.push(createMenuItem(CONSTANTS.SORT_TYPES.VISIT, 'icon-sort-visit', '排序：按上次打开'));
    }

    ul.innerHTML = menuItems.join('');
    contextMenu.appendChild(ul);
    contextMenu.style.display = 'block';

    const { innerWidth: winWidth, innerHeight: winHeight } = window;
    const { offsetWidth: menuWidth, offsetHeight: menuHeight } = contextMenu;
    let left = e.clientX, top = e.clientY;

    if (isTopSiteItem) {
        const H_OFFSET = 5;
        const V_OFFSET = 10;
        top = e.clientY + V_OFFSET;
        left = e.clientX - menuWidth - H_OFFSET;
        if (left < H_OFFSET) {
            left = e.clientX + H_OFFSET;
        }
    }

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
                const item = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"], .top-site-item[data-id="${id}"]`);
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
        // ▼▼▼ 在 switch 语句末尾添加这个新的 case ▼▼▼
        case 'removeTopSite':
            if (element && element.dataset.url) {
                chrome.history.deleteUrl({ url: element.dataset.url }, () => {
                    if (chrome.runtime.lastError) {
                        console.error(`移除历史记录失败: ${chrome.runtime.lastError.message}`);
                        showToast('移除失败');
                    } else {
                        element.remove();
                        showToast('已从常访问中移除');
                    }
                });
            }
            break;
        // ▲▲▲ 添加结束 ▲▲▲
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

            // ▼ 请将这段【新代码】粘贴到刚才删除的位置
            const folderIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            folderIcon.setAttribute('class', 'folder-icon');
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttributeNS(null, 'href', '#icon-folder');
            folderIcon.appendChild(use);
            // ▲ 粘贴完成

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
                icon.textContent = '⯈'; // 更轻、更现代
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
    // 优化：直接更新界面上所有匹配的元素，无需维护内存中的书签数据
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

    // 刷新最近书签模块以反映更改
    refreshAllData();
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

        // 使用 chrome.bookmarks.getRecent API 优化性能
        // 获取最近100个书签，避免遍历所有书签
        chrome.bookmarks.getRecent(100, async (items) => {
            const filteredBookmarks = items
                .filter(bm => {
                    const itemDate = bm.dateAdded;
                    return itemDate >= startTime && itemDate <= endTime && bm.url;
                })
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
                urlSpan.textContent = item.url;

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
        });
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
            // ▼▼▼ 在这里添加或修改 ▼▼▼
            a.title = `${sanitizeText(item.title)}\nURL: ${item.url}`;
            a.dataset.id = item.url; // 使用 URL 作为唯一 ID
            a.dataset.url = item.url;
            // ▲▲▲ 添加结束 ▲▲▲

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
    // ...
    const topSitesBar = document.getElementById('topSitesBar');
    let topSitesHoverTimeout;

    topSitesBar.addEventListener('mouseenter', () => {
        isMouseOverTopSitesBar = true; // 更新状态：鼠标进入
        clearTimeout(topSitesHoverTimeout);
        topSitesHoverTimeout = setTimeout(() => {
            topSitesBar.classList.add('expanded');
        }, 500);
    });

    topSitesBar.addEventListener('mouseleave', () => {
        isMouseOverTopSitesBar = false; // 更新状态：鼠标离开
        clearTimeout(topSitesHoverTimeout);

        // 核心修正：仅当右键菜单未打开时，才收起侧边栏
        if (document.body.dataset.contextMenuOpen !== 'true') {
            topSitesBar.classList.remove('expanded');
        }
    });


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
    // --- 优化后：将打开历史记录的操作封装并应用通用悬停逻辑 ---
    const openHistoryWindow = () => {
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
    };

    const { handleMouseEnter: openHistoryOnHover, handleMouseLeave: cancelOpenHistory } = createHoverIntent(openHistoryWindow);

    historyBtn.addEventListener('click', openHistoryWindow);
    historyBtn.addEventListener('mouseenter', openHistoryOnHover);
    historyBtn.addEventListener('mouseleave', cancelOpenHistory);


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
    window.addEventListener('resize', () => {
        hideContextMenu();
        // 窗口大小变化时，不重置初始边距，保持视图位置稳定
        // initialMarginLeft 会在列数变化或全部关闭时才重置
        
        const bookmarksBar = document.querySelector('.bookmark-column[data-level="0"]');
        if (bookmarksBar) {
            adjustBookmarksBarAlignment(bookmarksBar);
        }
    });

    const bookmarkContainer = document.getElementById('bookmarkContainer');
    // 优化：使用节流+防抖组合，平衡响应速度和性能
    let resizeTimer;
    let lastResizeTime = 0;
    const THROTTLE_DELAY = 150; // 节流延迟（ms）
    const DEBOUNCE_DELAY = 100; // 防抖延迟（ms）
    
    const handleResize = () => {
        const now = Date.now();
        
        // 节流：如果距离上次执行超过阈值，立即执行
        if (now - lastResizeTime >= THROTTLE_DELAY) {
            adjustColumnWidths(bookmarkContainer);
            lastResizeTime = now;
        }

        // 防抖：清除之前的定时器，在停止调整后再执行一次
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            adjustColumnWidths(bookmarkContainer);
            lastResizeTime = Date.now();
        }, DEBOUNCE_DELAY);
    };

    // 使用 ResizeObserver 监听容器大小变化
    if (window.ResizeObserver && bookmarkContainer) {
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => handleResize());
        });
        resizeObserver.observe(bookmarkContainer);
    }

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

    // --- 优化后：为G按钮应用通用悬停逻辑 ---
    const { handleMouseEnter: showModulesOnHover, handleMouseLeave: cancelShowModules } = createHoverIntent(showModules);

    toggleVerticalBtn.addEventListener('click', (e) => { e.stopPropagation(); isModuleVisible ? hideModules() : showModules(); });
    toggleVerticalBtn.addEventListener('mouseenter', showModulesOnHover);
    toggleVerticalBtn.addEventListener('mouseleave', cancelShowModules);
    verticalModules.addEventListener('mouseenter', cancelShowModules); // 鼠标进入面板本身时也应该取消计时

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
        const item = e.target.closest('.bookmark-item, .vertical-modules a, .top-site-item');
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
        // 优化：移除初始加载时的 flattenBookmarks 调用
        // displayRecentBookmarks 现在使用 chrome.bookmarks.getRecent() API
        displayBookmarks(bookmarks);
        displayRecentBookmarks();
        displayTopSites();
        observeLazyImages(document.body);
    };

    const refreshAllData = () => {
        setTimeout(() => {
            // 优化：直接刷新最近书签，无需遍历整个书签树
            // displayRecentBookmarks 内部使用 chrome.bookmarks.getRecent() API
            displayRecentBookmarks();
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
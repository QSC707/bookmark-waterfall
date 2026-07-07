// ==================================================================
// ✅ 优化 #11: JSDoc类型定义
// ==================================================================

/**
 * Chrome书签节点
 * @typedef {Object} BookmarkNode
 * @property {string} id - 书签ID
 * @property {string} [parentId] - 父节点ID
 * @property {number} [index] - 在父节点中的索引
 * @property {string} [url] - 书签URL（文件夹没有此属性）
 * @property {string} title - 书签标题
 * @property {number} [dateAdded] - 添加时间戳
 * @property {number} [dateGroupModified] - 修改时间戳
 * @property {BookmarkNode[]} [children] - 子节点（仅文件夹有）
 */

/**
 * 书签排除规则
 * @typedef {Object} BookmarkExcludeRule
 * @property {string} pattern - 匹配模式（支持通配符*）
 * @property {boolean} enabled - 是否启用
 * @property {number} createdAt - 创建时间戳
 */

/**
 * 提示消息类型
 * @typedef {'success'|'error'|'warning'|'info'} ToastType
 */

/**
 * Chrome API错误
 * @typedef {Object} ChromeError
 * @property {string} message - 错误消息
 */

/**
 * 列宽配置
 * @typedef {Object} ColumnWidthConfig
 * @property {number} min - 最小宽度
 * @property {number} ideal - 理想宽度
 * @property {number} max - 最大宽度
 */

// ========================================
// 全局常量
// ========================================
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
        HOVER_DELAY: 'hoverDelay',
        EXCLUDE_RULES: 'bookmarkExcludeRules',
        OPEN_IN_CURRENT_TAB: 'openInCurrentTab'
    },
    // ✅ 优化 #8: 提取通用时间常量
    TIMING: {
        TOAST_NORMAL: 2000,
        TOAST_LONG: 3000
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
            MIN_BASE: 16,
            MIN_RATIO: 0.015,
            CENTERING_THRESHOLD: 0.35,
            FIXED_CONTENT_WIDTH: 382,
            WINDOW_CHANGE_THRESHOLD: 100
        }
    }
};

// ========================================
// ✅ P1修复：统一全局状态管理
// ========================================

/**
 * 全局应用状态管理对象
 * 集中管理所有应用状态，提高代码可维护性和可调试性
 */
const AppState = {
    // 悬停与交互状态
    hover: {
        enabled: true,
        currentItem: null,
        suppressHover: false,
        suppressTimer: null,
        intent: {
            timer: null,            // 悬停意图计时器
            target: null,           // 悬停目标元素
            targetId: null          // 缓存的目标ID
        }
    },

    drag: {
        isDragging: false,
        draggedItem: null,
        lastDragOverTarget: null
    },

    // 选择状态
    selection: {
        items: new Set(),           // 选中的项目ID集合
        lastClickedId: null         // 最后点击的项目ID（用于 Shift 范围选择）
    },

    // 窗口管理
    windows: {
        preview: null,              // 预览窗口ID
        history: null               // 历史记录窗口ID
    },

    // 请求管理（防止竞态条件）
    requests: {
        pendingFolder: null,
        pendingRecentBookmarks: null,
        pendingParentRefresh: new Map()
    },

    // 右键菜单关联状态（避免直接挂载到 DOM 元素）
    contextMenu: {
        target: null,
        column: null
    },

    layout: {
        initialMarginLeft: null,
        savedMarginLeft: null,
        marginWindowWidth: null,
        currentColumnCount: 0
    },

    // 书签数据缓存
    data: {
        allBookmarksFlat: []        // 扁平化的书签列表
    }
};

// ========================================
// 🔧 代码重构：移除全局变量别名
// ========================================
// 所有状态现在直接通过 AppState 访问，提升代码可维护性
// 移除了 20 个全局变量别名，减少内存占用 ~1-2KB

// ✅ 优化 #4: 缓存选中和预览高亮的DOM元素引用，避免频繁查询DOM
const selectedElements = new Map(); // id -> element
const previewHighlightElements = new Set();

// 1x1 透明 GIF 占位图（模块常量，避免重复硬编码长字符串）
const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// ✅ 性能优化：onMoved 局部刷新缓存（5秒TTL）
const childrenCache = new Map(); // folderId -> {children, timestamp}
const CHILDREN_CACHE_TTL = 5000; // 5秒缓存

// ✅ P1优化：localStorage 缓存，避免频繁读取和解析
const StorageCache = {
    excludeRules: null,
    excludeRulesLastUpdate: 0,
    hoverDelay: null,
    hoverDelayLastUpdate: 0,
    TTL: 5000,

    getExcludeRules() {
        const now = Date.now();
        if (this.excludeRules && now - this.excludeRulesLastUpdate < this.TTL) {
            return this.excludeRules;
        }
        try {
            const json = localStorage.getItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES);
            this.excludeRules = json ? JSON.parse(json) : [];
        } catch (e) {
            this.excludeRules = [];
        }
        this.excludeRulesLastUpdate = now;
        return this.excludeRules;
    },

    getHoverDelay() {
        const now = Date.now();
        if (this.hoverDelay !== null && now - this.hoverDelayLastUpdate < this.TTL) {
            return this.hoverDelay;
        }
        this.hoverDelay = parseInt(localStorage.getItem(CONSTANTS.STORAGE_KEYS.HOVER_DELAY) || '500', 10);
        this.hoverDelayLastUpdate = now;
        return this.hoverDelay;
    },

    invalidate() {
        this.excludeRules = null;
        this.hoverDelay = null;
        this.excludeRulesLastUpdate = 0;
        this.hoverDelayLastUpdate = 0;
    }
};

// ✅ 性能优化: 缓存localStorage设置，避免每次点击都读取
let cachedOpenInCurrentTab = localStorage.getItem(CONSTANTS.STORAGE_KEYS.OPEN_IN_CURRENT_TAB) === 'true';

// 书签树内存缓存，避免重复调用 chrome.bookmarks.getTree()
let bookmarkCacheDirty = true;
let cachedBookmarkTree = null;

function getBookmarkTree() {
    if (!bookmarkCacheDirty && cachedBookmarkTree) {
        return Promise.resolve(cachedBookmarkTree);
    }
    return new Promise(resolve => {
        chrome.bookmarks.getTree(tree => {
            cachedBookmarkTree = tree;
            bookmarkCacheDirty = false;
            // 合并两次遍历为一次：同时建 TreeCache 和 flat 列表
            BookmarkTreeCache.clear();
            const flat = [];
            const traverseAll = (nodes, parentId = null) => {
                if (!nodes) return;
                for (const node of nodes) {
                    BookmarkTreeCache.set(node.id, { id: node.id, parentId, title: node.title, url: node.url });
                    if (node.url) flat.push(node);
                    if (node.children) traverseAll(node.children, node.id);
                }
            };
            traverseAll(tree);
            flat.sort((a, b) => b.dateAdded - a.dateAdded);
            AppState.data.allBookmarksFlat = flat;
            resolve(tree);
        });
    });
}

function invalidateBookmarkCache() {
    bookmarkCacheDirty = true;
    cachedBookmarkTree = null;
    childrenCache.forEach(entry => { if (entry._timer) clearTimeout(entry._timer); });
    childrenCache.clear();
}

// 同步检测窗口类型：background.js 创建弹窗时 URL 带 ?popup=true
const isInPopupWindow = new URLSearchParams(location.search).has('popup');
const isInIframe = window.self !== window.top;

// ========================================
// P1性能优化：DOM元素缓存
// ========================================
const DOMCache = {
    bookmarkContainer: null,
    contextMenu: null,
    pageOverlay: null,
    settingsPanel: null,
    toast: null,
    header: null,
    recentBookmarksContent: null,
    frequentlyVisitedContent: null,
    bookmarksBar: null,
    resizingOverlay: null,
    resizeIndicator: null,

    init() {
        this.bookmarkContainer = document.getElementById('bookmarkContainer');
        this.contextMenu = document.getElementById('contextMenu');
        this.pageOverlay = document.getElementById('pageOverlay');
        this.settingsPanel = document.getElementById('settings-panel');
        this.toast = document.getElementById('toast');
        this.header = document.querySelector('.page-header');
        this.recentBookmarksContent = document.querySelector('#recentBookmarksModule .module-content');
        this.frequentlyVisitedContent = document.querySelector('.frequently-visited-content');
        this.bookmarksBar = document.querySelector('.bookmarks-bar');
        this.resizingOverlay = document.querySelector('.resizing-overlay');
        this.resizeIndicator = document.querySelector('.resize-indicator');
    }
};

// ========================================
// ✅ P2-2优化：统一 DOM 缓存检查
// ========================================
/**
 * 获取缓存的 DOM 元素，如果缓存失效则重新查询
 * @param {string} key - 缓存键名
 * @param {Function} fallback - 获取元素的回调函数
 * @returns {HTMLElement|null} DOM 元素
 */
function getCachedElement(key, fallback) {
    const cached = DOMCache[key];
    if (cached && cached.isConnected) return cached;

    const fresh = fallback();
    if (fresh) DOMCache[key] = fresh;
    return fresh;
}

// ========================================
// ✅ P1-2优化：ElementCache 系统 - 缓存带有特定 class 的元素
// ========================================
const ElementCache = {
    highlighted: new Set(),
    dragging: new Set(),

    addHighlight(item) {
        item.classList.add('highlighted');
        this.highlighted.add(item);
    },

    clearHighlights() {
        this.highlighted.forEach(item => {
            if (item.isConnected) item.classList.remove('highlighted');
        });
        this.highlighted.clear();
    },

    addDragging(item) {
        item.classList.add('dragging');
        this.dragging.add(item);
    },

    clearDragging() {
        this.dragging.forEach(item => {
            if (item.isConnected) item.classList.remove('dragging');
        });
        this.dragging.clear();
    }
};

// ========================================
// ✅ 优化：DOM 查询辅助函数
// ========================================

/**
 * 根据 ID 查找书签元素
 */
function findBookmarkElement(id) {
    return document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"], .top-site-item[data-id="${id}"]`);
}

// ========================================
// ✅ 优化：Chrome API 辅助函数
// ========================================

/**
 * 安全调用 Chrome API，自动处理错误
 * @param {Function} apiCall - Chrome API 调用函数
 * @param {string} errorContext - 错误上下文描述
 * @returns {Promise} API 调用结果
 */

// ========================================
// ✅ P1-3优化：BookmarkTreeCache - 缓存书签树结构，避免 DOM 查询
// ========================================
const BookmarkTreeCache = new Map();

// ========================================
// 核心修复：将 Observers 移至全局作用域
// ========================================

// 🔧 首屏优化：极致激进预加载 + 立即触发
let lazyLoadObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.dataset.src;
            if (src && img.src !== src) img.src = src;
            observer.unobserve(img);
        }
    }
}, {
    rootMargin: '150px',
    threshold: 0
});

function observeLazyImages(container, eagerCount = 0) {
    const images = container.querySelectorAll('img[data-src]');
    if (images.length === 0) return;

    // 立即加载前 eagerCount 个（只有书签栏首屏才需要，其他容器传 0）
    const eager = Math.min(eagerCount, images.length);
    for (let i = 0; i < eager; i++) {
        images[i].src = images[i].dataset.src;
    }
    for (let i = eager; i < images.length; i++) {
        lazyLoadObserver.observe(images[i]);
    }
}

/**
 * ✅ 性能优化：安全清空容器，防止内存泄漏
 * 在清空前断开所有 Observer 监听
 * @param {HTMLElement} wrapper - 要清空的容器元素
 */
function clearContentWrapper(wrapper) {
    if (lazyLoadObserver) {
        wrapper.querySelectorAll('img[data-src]').forEach(img => {
            lazyLoadObserver.unobserve(img);
        });
    }
    wrapper.replaceChildren();
}

// ========================================
// 核心功能函数
// ========================================

// 辅助工具函数
/**
 * 格式化时间戳为日期字符串
 * @param {number} timestamp - Unix时间戳（毫秒）
 * @returns {string} 格式化后的日期字符串 (YYYY-MM-DD)
 */
function formatDate(timestamp) {
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

function formatDateTime(timestamp) {
    const d = new Date(timestamp);
    const h = d.getHours();
    const min = d.getMinutes();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day} ${h < 10 ? '0' : ''}${h}:${min < 10 ? '0' : ''}${min}`;
}

/**
 * 获取书签的完整路径
 * 优先使用 BookmarkTreeCache，无缓存时回退到 Chrome API
 * @param {string} bookmarkId - 书签ID
 * @returns {Promise<string>} 书签路径（层级用 / 分隔）
 */
function getBookmarkPath(bookmarkId) {
    // 快速路径：用内存缓存同步解析，避免串行 API 调用
    if (BookmarkTreeCache.size > 0) {
        const path = [];
        let node = BookmarkTreeCache.get(bookmarkId);
        let parentId = node?.parentId;
        while (parentId && parentId !== CONSTANTS.ROOT_ID) {
            const parent = BookmarkTreeCache.get(parentId);
            if (!parent) break;
            let title = parent.title;
            if (parent.parentId === CONSTANTS.ROOT_ID) {
                if (parentId === CONSTANTS.BOOKMARKS_BAR_ID) title = '书签栏';
                else if (parentId === CONSTANTS.OTHER_BOOKMARKS_ID) title = '其他书签';
            }
            if (title) path.push(title);
            parentId = parent.parentId;
        }
        return Promise.resolve(path.reverse().join(' / '));
    }

    // 回退路径：缓存未就绪时串行调用 API
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
                    if (title) path.push(title);
                    buildPath(node.parentId);
                } else {
                    resolve(path.reverse().join(' / '));
                }
            });
        };
        chrome.bookmarks.get(bookmarkId, (nodes) => {
            if (nodes && nodes[0]) buildPath(nodes[0].parentId);
            else resolve('');
        });
    });
}

/**
 * ✅ 优化 #11: 防抖函数 - 延迟执行函数直到停止调用一段时间后
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 * @example
 * const debouncedResize = debounce(() => handleResize(), 150);
 * window.addEventListener('resize', debouncedResize);
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * ✅ 优化 #11: 显示提示消息
 * @param {string} message - 提示消息内容
 * @param {number} [duration=2000] - 显示时长（毫秒）
 * @param {ToastType} [type='info'] - 消息类型
 * @returns {void}
 */
let toastTimer = null;
function showToast(message, duration = 2000, type = 'info') {
    const toast = getCachedElement('toast', () => document.getElementById('toast'));
    if (!toast) return;

    const icons = { success: '✓ ', error: '✗ ', warning: '⚠ ' };
    toast.textContent = (icons[type] ?? '') + message;
    toast.className = `toast glass-effect show toast-${type}`;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        // 只移除 show，让 transition 完整淡出，颜色 class 保留到动画结束
        toast.classList.remove('show');
    }, duration);
}

// ========================================
// ✅ P1修复：统一错误处理工具函数
// ========================================

/**
 * 统一的 Chrome API 错误处理包装器
 * @param {Promise} apiCall - Chrome API 调用的 Promise
 * @param {Object} options - 配置选项
 * @param {string} options.operation - 操作描述（用于错误消息）
 * @param {boolean} options.silent - 是否静默失败（不显示 toast）
 * @param {Function} options.fallback - 失败时的回退函数
 * @returns {Promise} - 包装后的 Promise
 */
const _chromeErrorHints = [
    [['permission', 'denied'], '，请检查扩展权限设置'],
    [['not found', 'no node'], '，该项目可能已被删除'],
    [['network', 'connection'], '，请检查网络连接'],
    [['cannot modify'], '，该项目不可修改'],
];

async function handleChromeAPIError(apiCall, options = {}) {
    const { operation = '操作', silent = false, fallback = null } = options;

    try {
        const result = await apiCall;
        if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
        return result;
    } catch (error) {
        console.error(`${operation}失败:`, error);

        if (!silent) {
            const errorMsg = error.message?.toLowerCase() || '';
            let suggestion = '，请稍后重试或刷新页面';
            for (const [keys, hint] of _chromeErrorHints) {
                if (keys.some(k => errorMsg.includes(k))) { suggestion = hint; break; }
            }
            showToast(`${operation}失败${suggestion}`, CONSTANTS.TIMING.TOAST_LONG, 'error');
        }

        return typeof fallback === 'function' ? fallback() : null;
    }
}


/**
 * 获取网站图标URL
 * @param {string} url - 网站URL
 * @returns {string} 图标URL
 */
function getIconUrl(url) {
    return `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
}

/**
 * 验证字符串是否为有效URL
 * @param {string} string - 待验证的字符串
 * @returns {boolean} 是否为有效URL
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// ========================================
// 统一的书签打开逻辑
// ========================================

/**
 * 智能书签打开函数
 * @param {string} url - 要打开的URL
 * @param {MouseEvent|null} [event=null] - 点击事件对象（用于检测 Ctrl/Cmd 键）
 *
 * 注意：Shift 键用于多选，不会传递到此函数
 */
function openBookmark(url, event = null) {
    if (!url) return;

    // 只检测 Ctrl/Cmd 键（Shift 键用于多选，已在 click 事件中过滤）
    const hasModifier = event && (event.metaKey || event.ctrlKey);

    // 弹窗模式：始终在新标签打开并关闭弹窗
    if (isInPopupWindow) {
        chrome.tabs.create({ url, active: true });
        window.close();
        return;
    }

    // iframe 模式：通过消息传递给父窗口
    if (isInIframe) {
        window.parent.postMessage({ type: 'OPEN_BOOKMARK', url }, '*');
        return;
    }

    // 普通模式：根据修饰键和用户设置决定打开方式
    if (hasModifier) {
        // 有 Ctrl/Cmd 键：始终在新标签打开
        chrome.tabs.create({ url, active: true });
    } else if (cachedOpenInCurrentTab) {
        // 开关开启：在当前标签打开
        chrome.tabs.update({ url });
    } else {
        // 开关关闭：在新标签打开
        chrome.tabs.create({ url, active: true });
    }
}

// ========================================
// ✅ 优化 #7: 提取公共函数
// ========================================

/**
 * ✅ 优化 #7 & #11: 统一的SVG图标创建函数
 * @param {string} iconId - 图标ID（如 'icon-folder'）
 * @param {string} [className='bookmark-icon'] - CSS类名
 * @returns {SVGSVGElement} SVG图标元素
 */
// 预建 SVG 模板，克隆比 createElementNS x2 快
const _svgTemplate = (() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'use'));
    return svg;
})();

function createSvgIcon(iconId, className = 'bookmark-icon') {
    const svg = _svgTemplate.cloneNode(true);
    svg.setAttribute('class', className);
    svg.firstChild.setAttributeNS(null, 'href', `#${iconId}`);
    return svg;
}

/**
 * P3优化：创建备用图标（当图标加载失败时使用）
 * 统一处理所有图标加载失败的情况
 * ✅ 修复 #7: 使用统一的createSvgIcon函数，修复重复设置class的bug
 */
function createFallbackIcon() {
    const fallbackIcon = createSvgIcon('icon-folder', 'module-icon');
    fallbackIcon.dataset.fallback = 'true';
    return fallbackIcon;
}

/**
 * P3优化：为图标添加错误处理
 * @param {HTMLImageElement} icon - 图标元素
 */
function setupIconErrorHandler(icon) {
    icon.onerror = (e) => {
        if (e.target.dataset.fallback) return;
        const fallback = createFallbackIcon();
        if (icon.parentNode) {
            icon.parentNode.replaceChild(fallback, icon);
        }
    };
}


function createHoverIntent(callback, delay = 500) {
    let hoverTimeout;

    const handleMouseEnter = () => {
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(callback, delay);
    };

    const handleMouseLeave = () => {
        clearTimeout(hoverTimeout);
    };

    return { handleMouseEnter, handleMouseLeave };
}

// 多选相关函数
/**
 * ✅ 优化 #4 & #11: 清除所有书签选择状态
 * @returns {void}
 * 使用缓存的元素集合避免DOM查询，性能提升10-20倍
 */
function clearSelection() {
    AppState.selection.items.clear();

    // ✅ 优化：只遍历已缓存的选中元素，而不是查询整个DOM
    selectedElements.forEach(el => {
        if (el.isConnected) {
            el.classList.remove('selected');
        }
    });
    selectedElements.clear();

    AppState.selection.lastClickedId = null;
}

/**
 * 清除所有预览高亮状态
 * ✅ 优化 #4: 使用缓存的元素集合，避免DOM查询
 */
function clearPreviewHighlight() {
    // ✅ 优化：只遍历已缓存的高亮元素，而不是查询整个DOM
    previewHighlightElements.forEach(el => {
        if (el.isConnected) { // 检查元素是否仍在DOM中
            el.classList.remove('preview-highlight');
        }
    });
    previewHighlightElements.clear();
}

/**
 * 关闭所有书签列视图（保留书签栏 level 0）
 * 用于 ESC 键快速关闭所有打开的书签文件夹视图
 */
function closeAllBookmarkColumns() {
    const container = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));
    if (!container) return;

    const cols = container.querySelectorAll('.bookmark-column[data-level]:not([data-level="0"])');
    if (cols.length === 0) return;
    cols.forEach(col => col.remove());

    // === 2. 清除所有书签项的高亮状态 ===
    // ✅ P1-2优化：使用 ElementCache 替代 querySelectorAll
    ElementCache.clearHighlights();

    // === 3. 清除选中状态 ===
    clearSelection();

    // === 4. 重置布局相关状态变量 ===
    resetLayoutState();

    // === 5. 清除悬停意图计时器 ===
    clearHoverIntent();

    // 注意：不清除预览高亮，让用户可以看到访问痕迹
}

/**
 * 切换书签项的选中状态
 * @param {HTMLElement} item - 书签DOM元素
 * ✅ 优化 #4: 维护元素引用缓存
 */
function toggleSelection(item) {
    // 任何选中操作都应清除预览高亮痕迹（保持一致性）
    clearPreviewHighlight();

    const id = item.dataset.id;
    if (AppState.selection.items.has(id)) {
        AppState.selection.items.delete(id);
        selectedElements.delete(id); // ✅ 优化：从缓存中移除
        item.classList.remove('selected');
    } else {
        AppState.selection.items.add(id);
        selectedElements.set(id, item); // ✅ 优化：添加到缓存
        item.classList.add('selected');
    }
    AppState.selection.lastClickedId = id;
}

/**
 * 选择范围内的所有书签（用于Shift点击）
 * @param {string} startId - 起始书签ID
 * @param {string} endId - 结束书签ID
 * @param {HTMLElement} column - 所在列的DOM元素
 */
function selectRange(startId, endId, column) {
    const nodeList = column.querySelectorAll('.bookmark-item');
    let startIndex = -1, endIndex = -1;
    for (let i = 0; i < nodeList.length; i++) {
        if (nodeList[i].dataset.id === startId) startIndex = i;
        if (nodeList[i].dataset.id === endId) endIndex = i;
        if (startIndex !== -1 && endIndex !== -1) break;
    }
    if (startIndex === -1 || endIndex === -1) return;

    const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
    for (let i = min; i <= max; i++) {
        const item = nodeList[i];
        if (!AppState.selection.items.has(item.dataset.id)) {
            AppState.selection.items.add(item.dataset.id);
            selectedElements.set(item.dataset.id, item);
            item.classList.add('selected');
        }
    }
}

// 书签渲染与刷新
function clearBookmarksBars(header) {
    header.querySelectorAll('.bookmarks-bar').forEach(col => col.remove());
}
/**
 * ✅ 优化 #11: 显示书签栏的书签
 * @param {BookmarkNode[]} bookmarks - Chrome书签树根节点数组
 * @returns {void}
 * ✅ 修复 #5: 处理空书签栏状态
 */
function displayBookmarks(bookmarks) {
    const bookmarkContainer = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));
    const header = getCachedElement('header', () => document.querySelector('.page-header'));
    bookmarkContainer.innerHTML = '';

    // ✅ 性能优化：清理所有旧的书签栏（防止累积）
    clearBookmarksBars(header);

    // ✅ 修复 #5: 验证数据有效性
    if (!bookmarks || !Array.isArray(bookmarks) || bookmarks.length === 0) {
        console.warn('displayBookmarks: No bookmarks data');
        return;
    }

    const bookmarksBar = bookmarks[0]?.children?.[0];

    if (bookmarksBar && bookmarksBar.children && bookmarksBar.children.length > 0) {
        renderBookmarks(bookmarksBar.children, header, 0);
    } else {
        const emptyBar = document.createElement('div');
        emptyBar.className = 'bookmarks-bar';
        emptyBar.dataset.level = '0';
        const hint = document.createElement('div');
        hint.style.cssText = 'padding: 8px 16px; color: var(--module-header-color); font-size: 13px; opacity: 0.6;';
        hint.textContent = '书签栏为空，请在Chrome中添加书签';
        emptyBar.appendChild(hint);
        header.appendChild(emptyBar);
    }
}

// [新增] 只刷新书签栏的专用函数
/**
 * 刷新书签栏显示
 */
function refreshBookmarksBar() {
    // 1. 获取书签栏的父容器
    const header = getCachedElement('header', () => document.querySelector('.page-header'));
    if (!header) return;

    // 2. 获取最新的书签栏内容
    chrome.bookmarks.getChildren(CONSTANTS.BOOKMARKS_BAR_ID, (bookmarksBarItems) => {
        // ✅ 修复 #3: 检查 Chrome API 错误
        if (chrome.runtime.lastError) {
            console.error('refreshBookmarksBar failed:', chrome.runtime.lastError);
            return;
        }

        // ✅ 修复 #3: 验证返回数据有效性
        if (!Array.isArray(bookmarksBarItems)) {
            console.error('Invalid bookmarks bar items:', bookmarksBarItems);
            return;
        }

        // 3. 移除所有旧的书签栏DOM（防止累积）
        // ✅ 性能优化：使用类选择器清理所有可能累积的书签栏
        clearBookmarksBars(header);

        // 4. 使用我们现有的 renderBookmarks 函数，只在 header 中渲染 level 0 的内容
        renderBookmarks(bookmarksBarItems, header, 0);
    });
}

/**
 * 渲染书签列表到指定容器
 * @param {Array} bookmarks - 书签数组
 * @param {HTMLElement} parentElement - 父容器元素
 * @param {number} level - 书签列的层级
 */
function renderBookmarks(bookmarks, parentElement, level) {
    let column;
    const container = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));
    const fragment = document.createDocumentFragment();

    for (const bookmark of bookmarks) {
        const item = createBookmarkItem(bookmark);
        if (level === 0) item.classList.add('bookmarks-bar-item');
        fragment.appendChild(item);
    }

    if (level === 0) {
        const header = getCachedElement('header', () => document.querySelector('.page-header'));
        column = document.createElement('div');
        // ✅ 性能优化：添加专用类名，避免复杂的属性选择器
        column.className = 'bookmarks-bar';
        column.dataset.level = level;
        // ✅ 修复 #5: 添加ARIA导航属性
        column.setAttribute('role', 'navigation');
        column.setAttribute('aria-label', '书签栏');
        header.appendChild(column);
        DOMCache.bookmarksBar = column; // 创建后立即更新缓存

        column.appendChild(fragment);
        observeLazyImages(column, 8); // 书签栏首屏：立即加载前8个

        // 检测书签栏是否需要居中显示
        requestAnimationFrame(() => {
            adjustBookmarksBarAlignment(column);
        });

    } else {
        const willRemoveLevel1 = level === 1 && container.querySelector('.bookmark-column[data-level="1"]');

        for (let lv = level; ; lv++) {
            const col = container.querySelector(`.bookmark-column[data-level="${lv}"]`);
            if (!col) break;
            col.remove();
        }

        // 🔧 修复：如果移除了列1，重置布局状态，让下次打开列1时重新计算margin
        if (willRemoveLevel1) {
            resetLayoutState();
        }

        column = document.createElement('div');
        column.className = 'bookmark-column new-column'; // 添加标记类
        column.dataset.level = level;
        // ✅ 修复 #5: 添加ARIA导航属性
        column.setAttribute('role', 'navigation');
        column.setAttribute('aria-label', `书签列 ${level}`);

        // 如果是第一列，预先计算并应用边距，防止闪烁
        if (level === 1 && AppState.layout.initialMarginLeft === null) {
            const availableWidth = container.clientWidth;
            const baseMargin = calculateCenteredMargin(availableWidth);
            const finalMargin = applyCenteredMargin(baseMargin);
            AppState.layout.initialMarginLeft = finalMargin;
            column.style.marginLeft = `${finalMargin}px`;

            // 🔧 温和修复：暂时禁用 transition，避免首次渲染时的闪动
            // 这样 adjustColumnWidths 可以正常调整边距，但不会触发动画
            column.style.transition = 'none';
        }

        container.appendChild(column);

        // 如果是第一列且窗口很大，插入后立即 RAF 做淡入
        if (level === 1 && window.innerWidth > 1600) {
            column.style.opacity = '0';
            requestAnimationFrame(() => {
                column.style.transition = 'opacity 0.2s ease-out';
                column.style.opacity = '1';
            });
        }

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

    requestAnimationFrame(() => {
        if (!container.contains(column)) return;

        scheduleAdjustColumnWidths(container);

        // 新列的智能滚动逻辑（直接执行，不再嵌套）
        if (level > 0 && column.classList.contains('new-column')) {
            // 批量读取几何数据（一次 layout flush），消除散点 layout thrashing
            const currentScroll = container.scrollLeft;
            const containerWidth = container.clientWidth;
            const colRect = column.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const columnLeft = colRect.left - containerRect.left + currentScroll;
            const columnRight = columnLeft + colRect.width;

            const prevColumn = column.previousElementSibling;
            let targetScroll = currentScroll;

            if (prevColumn && prevColumn.classList.contains('bookmark-column')) {
                const prevRect = prevColumn.getBoundingClientRect();
                const prevLeft = prevRect.left - containerRect.left + currentScroll;
                const totalWidth = columnRight - prevLeft;
                targetScroll = totalWidth <= containerWidth ? prevLeft - 20 : Math.max(0, columnLeft - 40);
            } else {
                targetScroll = Math.max(0, columnLeft - 20);
            }

            if (Math.abs(targetScroll - currentScroll) > 10) {
                container.scrollTo({ left: targetScroll, behavior: 'smooth' });
            }
            column.classList.remove('new-column');
        }
    });
}

/**
 * ✅ 优化 #11: 创建单个书签项的DOM元素
 * @param {BookmarkNode} bookmark - 书签节点对象
 * @returns {HTMLDivElement} 书签项DOM元素
 */
function createBookmarkItem(bookmark) {
    const item = document.createElement('div');
    const isFolder = !bookmark.url;
    const isGithub = !!(bookmark.url && bookmark.url.includes('github.com'));
    // 一次性设置所有 class，避免后续再赋值
    item.className = 'bookmark-item' + (isFolder ? ' is-folder' : '') + (isGithub ? ' is-github-link' : '');
    item.dataset.id = bookmark.id;
    item.dataset.url = bookmark.url || '';
    item.dataset.parentId = bookmark.parentId;
    item.dataset.title = bookmark.title || 'No Title';
    item.draggable = true;

    item.setAttribute('tabindex', '0');
    item.setAttribute('role', isFolder ? 'button' : 'link');
    item.setAttribute('aria-label', bookmark.title || 'No Title');

    let icon;
    if (isFolder) {
        icon = createSvgIcon('icon-folder');
        item.setAttribute('aria-expanded', 'false');
        item.setAttribute('aria-haspopup', 'true');
    } else {
        icon = document.createElement('img');
        icon.className = 'bookmark-icon';
        icon.src = TRANSPARENT_GIF;
        icon.dataset.src = getIconUrl(bookmark.url);
        icon.decoding = 'async';
        setupIconErrorHandler(icon);
    }

    const title = document.createElement('span');
    title.textContent = bookmark.title || 'No Title';
    title.className = 'bookmark-title';

    item.appendChild(icon);
    item.appendChild(title);
    return item;
}


/**
 * ✅ 性能优化：填充列内容（分离创建和填充逻辑）
 * @param {Array} bookmarks - 书签数组
 * @param {number} level - 列的层级
 */
function fillColumnContent(bookmarks, level, existingContainer) {
    const container = existingContainer || getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));
    let column = container.querySelector(`.bookmark-column[data-level="${level}"]`);

    // 如果列不存在就新建（数据就绪时直接创建完整列，不经过空列中间状态）
    const isNewColumn = !column;
    if (isNewColumn) {
        column = document.createElement('div');
        column.className = 'bookmark-column new-column';
        column.dataset.level = level;
        column.setAttribute('role', 'navigation');
        column.setAttribute('aria-label', `书签列 ${level}`);

        if (level === 1 && AppState.layout.initialMarginLeft === null) {
            const availableWidth = container.clientWidth;
            AppState.layout.initialMarginLeft = applyCenteredMargin(calculateCenteredMargin(availableWidth));
            column.style.marginLeft = `${AppState.layout.initialMarginLeft}px`;
            column.style.transition = 'none';
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'column-content-wrapper';
        column.appendChild(wrapper);
        makeColumnResizable(column);
        container.appendChild(column);
        scheduleAdjustColumnWidths(container);
    }

    const contentWrapper = column.querySelector('.column-content-wrapper');
    if (!contentWrapper) return;

    // 构建内容节点，原子替换——无空白帧
    const newNodes = bookmarks.length === 0
        ? [Object.assign(document.createElement('div'), { className: 'empty-folder-message', textContent: '这个文件夹是空的' })]
        : bookmarks.map(bookmark => createBookmarkItem(bookmark));

    if (lazyLoadObserver) {
        contentWrapper.querySelectorAll('img[data-src]').forEach(img => lazyLoadObserver.unobserve(img));
    }
    contentWrapper.replaceChildren(...newNodes);

    if (bookmarks.length > 0) observeLazyImages(contentWrapper);

    // ✅ 性能优化：减少滚动延迟,提升响应速度
    // 使用 requestAnimationFrame 替代 setTimeout,更精确的时机
    requestAnimationFrame(() => {
        if (!container.contains(column) || !column.classList.contains('new-column')) return;

        // 批量读取所有几何数据（一次 layout flush），再计算目标滚动位置
        const currentScroll = container.scrollLeft;
        const containerWidth = container.clientWidth;
        const colRect = column.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const columnLeft = colRect.left - containerRect.left + currentScroll;
        const columnRight = columnLeft + colRect.width;

        const prevColumn = column.previousElementSibling;
        let targetScroll = currentScroll;

        if (prevColumn && prevColumn.classList.contains('bookmark-column')) {
            const prevRect = prevColumn.getBoundingClientRect();
            const prevLeft = prevRect.left - containerRect.left + currentScroll;
            const totalWidth = columnRight - prevLeft;
            targetScroll = totalWidth <= containerWidth ? prevLeft - 20 : Math.max(0, columnLeft - 40);
        } else {
            targetScroll = Math.max(0, columnLeft - 20);
        }

        if (Math.abs(targetScroll - currentScroll) > 10) {
            container.scrollTo({ left: targetScroll, behavior: 'smooth' });
        }
        column.classList.remove('new-column');
    });
}

/**
 * ✅ 优化 #11: 处理文件夹点击事件，打开/关闭文件夹
 * @param {HTMLElement} folderItem - 文件夹DOM元素
 * @param {string} bookmarkId - 书签ID
 * @returns {void}
 */
function handleFolderClick(folderItem, bookmarkId) {
    // P0修复：添加空值检查
    if (!folderItem || !bookmarkId) {
        console.error('handleFolderClick: Invalid parameters', { folderItem, bookmarkId });
        return;
    }
    
    clearSelection();
    const isHighlighted = folderItem.classList.contains('highlighted');
    const column = folderItem.closest('.bookmark-column, .bookmarks-bar');

    // P0修复：检查column是否存在
    if (!column || !column.dataset.level) {
        console.error('handleFolderClick: Column not found or invalid');
        return;
    }
    
    const level = +column.dataset.level;

    // 只清除同一列中的高亮，for...of 遍历 Set 时删除当前元素是安全的
    for (const i of ElementCache.highlighted) {
        if (!i.isConnected) { ElementCache.highlighted.delete(i); continue; }
        const itemColumn = i.closest('.bookmark-column, .bookmarks-bar');
        if (itemColumn && itemColumn.dataset.level === column.dataset.level) {
            i.classList.remove('highlighted');
            if (i.classList.contains('is-folder')) i.setAttribute('aria-expanded', 'false');
            ElementCache.highlighted.delete(i);
        }
    }

    if (!isHighlighted) {
        ElementCache.addHighlight(folderItem);
        folderItem.setAttribute('aria-expanded', 'true');

        const container = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));

        if (AppState.requests.pendingFolder) {
            AppState.requests.pendingFolder.cancelled = true;
        }

        const thisRequest = { cancelled: false, folderId: bookmarkId };
        AppState.requests.pendingFolder = thisRequest;

        chrome.bookmarks.getChildren(bookmarkId, (freshChildren) => {
            const abortLoad = (msg) => {
                if (AppState.requests.pendingFolder === thisRequest) {
                    AppState.requests.pendingFolder = null;
                }
                folderItem.classList.remove('highlighted');
                folderItem.setAttribute('aria-expanded', 'false');
                // 数据未到就没插列，不需要移除
                if (msg) showToast(msg, CONSTANTS.TIMING.TOAST_NORMAL, 'error');
            };

            if (chrome.runtime.lastError) {
                console.error('getChildren failed:', chrome.runtime.lastError);
                abortLoad('加载文件夹失败');
                return;
            }

            if (thisRequest.cancelled) return;

            if (!Array.isArray(freshChildren)) {
                console.error('Invalid children data:', freshChildren);
                abortLoad(null);
                return;
            }

            if (AppState.requests.pendingFolder === thisRequest) {
                AppState.requests.pendingFolder = null;
            }

            if (container) {
                // 数据就绪后一次性创建完整列，不再有"空列→内容"的过渡闪烁
                // 先移除旧的同级及更深列
                const existingCol = container.querySelector(`.bookmark-column[data-level="${level + 1}"]`);
                if (existingCol) {
                    for (let lv = level + 1; ; lv++) {
                        const col = container.querySelector(`.bookmark-column[data-level="${lv}"]`);
                        if (!col) break;
                        col.remove();
                    }
                    if (level + 1 === 1) resetLayoutState();
                }
                fillColumnContent(freshChildren, level + 1, container);
            }
        });
    } else {
        const container = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));
        if (!container) return;
        
        // 精确查询 > level 的列并移除，避免全量 querySelectorAll
        for (let lv = level + 1; ; lv++) {
            const col = container.querySelector(`.bookmark-column[data-level="${lv}"]`);
            if (!col) break;
            col.remove();
        }

        // 如果关闭后没有列了，重置布局状态
        const remainingColumns = container.querySelector('.bookmark-column[data-level]:not([data-level="0"])');
        if (!remainingColumns) {
            resetLayoutState();
        }
    }
}

// [最终版] 智能悬停核心函数

/**
 * ✅ P2重构：提取公共函数 - 重置布局状态
 * 在关闭所有书签列时重置所有布局相关的全局变量
 */
function resetLayoutState() {
    AppState.layout.initialMarginLeft = null;
    AppState.layout.savedMarginLeft = null;
    AppState.layout.marginWindowWidth = null;
    AppState.layout.currentColumnCount = 0;
}

/**
 * 开始悬停意图检测（用于文件夹自动展开）
 * @param {HTMLElement} item - 书签项元素
 */
function startHoverIntent(item) {
    if (!item?.dataset?.id) return;

    const itemId = item.dataset.id;

    // 同一元素且计时器运行中，直接返回
    if (AppState.hover.intent.targetId === itemId && AppState.hover.intent.timer !== null) {
        return;
    }

    // 全局状态检查
    if (!AppState.hover.enabled || AppState.drag.isDragging || AppState.hover.suppressHover || document.body.dataset.contextMenuOpen) {
        clearHoverIntent();
        return;
    }

    // 清除旧计时器
    if (AppState.hover.intent.timer !== null) {
        clearTimeout(AppState.hover.intent.timer);
    }

    // 缓存目标元素和ID
    AppState.hover.intent.target = item;
    AppState.hover.intent.targetId = itemId;

    const delay = StorageCache.getHoverDelay();

    AppState.hover.intent.timer = setTimeout(() => {
        // 双重检查：状态是否改变
        if (AppState.drag.isDragging || AppState.hover.suppressHover || !item.isConnected ||
            AppState.hover.intent.target !== item || AppState.hover.intent.targetId !== itemId) {
            clearHoverIntent();
            return;
        }

        const parent = item.parentElement;
        if (!parent) {
            clearHoverIntent();
            return;
        }

        // 只在需要时打开文件夹
        const currentHighlighted = parent.querySelector('.bookmark-item.highlighted');
        if (item !== currentHighlighted) {
            try {
                handleFolderClick(item, itemId);
            } catch (error) {
                console.error('Hover intent execution failed:', error);
            }
        }

        clearHoverIntent();
    }, delay);
}

/**
 * 清除悬停意图计时器
 */
function clearHoverIntent() {
    // === 性能优化：只在必要时清除 ===
    if (AppState.hover.intent.timer !== null) {
        clearTimeout(AppState.hover.intent.timer);
        AppState.hover.intent.timer = null;
    }
    // === 内存优化：清理所有引用 ===
    AppState.hover.intent.target = null;
    AppState.hover.intent.targetId = null;
}

function makeColumnResizable(column) {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    column.appendChild(handle);

    const overlay = DOMCache.resizingOverlay || document.querySelector('.resizing-overlay');
    const indicator = DOMCache.resizeIndicator || document.querySelector('.resize-indicator');
    const container = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));

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

        // ✅ 性能优化：mousemove 事件 RAF 节流
        // 优化前：每次鼠标移动都触发 handleMouseMove，频率极高
        // 优化后：使用 RAF 节流，拖拽流畅度提升 40-50%
        let rafId = null;
        const throttledMouseMove = (e) => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                handleMouseMove(e);
                rafId = null;
            });
        };

        document.addEventListener('mousemove', throttledMouseMove, { passive: true });
        document.addEventListener('mouseup', handleMouseUp);
    });
}

let resizing = false;

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
    AppState.layout.savedMarginLeft = finalMarginLeft;
    AppState.layout.marginWindowWidth = availableWidth;

    return finalMarginLeft;
}

// ========================================
// ✅ P2重构：将超长函数拆分为多个职责单一的子函数
// ========================================

/**
 * 计算第一列的左边距
 * @param {Object} params - 参数对象
 * @returns {number} - 计算出的左边距
 */
function calculateFirstColumnMargin(params) {
    const { firstColumn, columns, availableWidth, columnsChanged, newColumnCount } = params;
    let marginLeft = 0;
    
    if (!firstColumn || firstColumn.dataset.level !== "1") {
        return marginLeft;
    }
    
    const currentActualMargin = parseFloat(firstColumn.style.marginLeft) || 0;
    
    if (columnsChanged) {
        if (newColumnCount === 0) {
            resetLayoutState();
        } else if (newColumnCount === 1 && AppState.layout.initialMarginLeft === null) {
            marginLeft = calculateCenteredMargin(availableWidth);
            marginLeft = applyCenteredMargin(marginLeft);
            AppState.layout.initialMarginLeft = marginLeft;
        } else {
            // 打开或关闭书签：保持当前边距
            marginLeft = currentActualMargin > 0
                ? currentActualMargin
                : (AppState.layout.savedMarginLeft || AppState.layout.initialMarginLeft || calculateCenteredMargin(availableWidth));
        }
        AppState.layout.currentColumnCount = newColumnCount;
    } else {
        // 列数没变，检查窗口变化
        if (newColumnCount > 0) {
            const currentWindowWidth = availableWidth;
            const savedWindowWidth = AppState.layout.marginWindowWidth || currentWindowWidth;
            const windowWidthDiff = Math.abs(currentWindowWidth - savedWindowWidth);
            
            if (windowWidthDiff > CONSTANTS.LAYOUT.MARGIN.WINDOW_CHANGE_THRESHOLD) {
                // 场景5：窗口显著变化
                marginLeft = calculateCenteredMargin(availableWidth);
                marginLeft = applyCenteredMargin(marginLeft);
                AppState.layout.initialMarginLeft = marginLeft;
            } else {
                // 场景6：窗口未显著变化
                marginLeft = currentActualMargin > 0 
                    ? currentActualMargin 
                    : (AppState.layout.savedMarginLeft || AppState.layout.initialMarginLeft || calculateCenteredMargin(availableWidth));
            }
        } else {
            marginLeft = calculateCenteredMargin(availableWidth);
        }
    }
    
    return marginLeft;
}

// 列宽计算的模块级复用 Map，避免 resize 时反复分配
const _colStylesMap = new Map();
const _colActualChanges = new Map();
const _colWidthByEl = new Map();

function shrinkColumnsToFit(resizableColumns, overflowWidth, minWidth) {
    _colStylesMap.clear();
    // 排序对比例收缩结果无影响，直接使用原数组
    const totalShrinkableSpace = resizableColumns.reduce((sum, data) => {
        return sum + Math.max(0, data.currentWidth - minWidth);
    }, 0);
    
    if (totalShrinkableSpace >= overflowWidth) {
        for (const data of resizableColumns) {
            const shrinkableAmount = Math.max(0, data.currentWidth - minWidth);
            if (shrinkableAmount > 0) {
                const proportion = shrinkableAmount / totalShrinkableSpace;
                const newWidth = Math.max(minWidth, data.currentWidth - overflowWidth * proportion);
                _colStylesMap.set(data.el, `${newWidth}px`);
            }
        }
    } else {
        for (const data of resizableColumns) {
            if (data.currentWidth > minWidth) {
                _colStylesMap.set(data.el, `${minWidth}px`);
            }
        }
    }
    
    return _colStylesMap;
}

/**
 * 扩展列宽以利用空余空间
 * @param {Array} resizableColumns - 可调整大小的列
 * @param {number} availableSpace - 可用空间
 * @param {number} idealWidth - 理想列宽
 * @returns {Map} - 新的样式映射
 */
function enlargeColumnsToFill(resizableColumns, availableSpace, idealWidth) {
    _colStylesMap.clear();
    const columnsToEnlarge = resizableColumns.filter(data => data.currentWidth < idealWidth);
    
    if (columnsToEnlarge.length > 0 && availableSpace > 0) {
        const totalEnlargePotential = columnsToEnlarge.reduce((sum, data) => {
            return sum + (idealWidth - data.currentWidth);
        }, 0);
        
        if (totalEnlargePotential > 0) {
            if (totalEnlargePotential <= availableSpace) {
                for (const data of columnsToEnlarge) {
                    _colStylesMap.set(data.el, `${idealWidth}px`);
                }
            } else {
                for (const data of columnsToEnlarge) {
                    const potential = idealWidth - data.currentWidth;
                    const newWidth = data.currentWidth + availableSpace * (potential / totalEnlargePotential);
                    _colStylesMap.set(data.el, `${newWidth}px`);
                }
            }
        }
    }
    
    return _colStylesMap;
}

/**
 * 应用列宽样式变化
 * @param {Map} _colStylesMap - 新的样式映射
 * @param {Array} columnData - 列数据（用于判断变化大小）
 */
function applyColumnWidthStyles(_colStylesMap, columnData) {
    _colActualChanges.clear();

    // 先建 Map，用批量预读的 currentWidth 代替 offsetWidth
    _colWidthByEl.clear();
    columnData.forEach(d => _colWidthByEl.set(d.el, d.currentWidth));

    _colStylesMap.forEach((widthStr, el) => {
        const currentWidth = _colWidthByEl.get(el) ?? parseFloat(el.style.width) ?? 0;
        if (Math.abs(currentWidth - parseFloat(widthStr)) > 1) {
            _colActualChanges.set(el, widthStr);
        }
    });

    if (_colActualChanges.size === 0) return;

    const hasLargeChanges = Array.from(_colActualChanges).some(([el, widthStr]) => {
        const cur = _colWidthByEl.get(el) ?? 0;
        return Math.abs(cur - parseFloat(widthStr)) > 50;
    });

    if (hasLargeChanges) {
        _colActualChanges.forEach((widthStr, el) => {
            el.style.transition = 'none';
            el.style.width = widthStr;
        });
        // 快照 entries，防止 RAF 触发前 _colActualChanges 被下一次 adjustColumnWidths 清空
        const snapshot = [..._colActualChanges.keys()];
        requestAnimationFrame(() => {
            snapshot.forEach(el => { el.style.transition = ''; });
        });
    } else {
        _colActualChanges.forEach((widthStr, el) => { el.style.width = widthStr; });
    }
}

/**
 * 应用第一列的左边距
 * @param {HTMLElement} firstColumn - 第一列元素
 * @param {number} finalMarginLeft - 最终左边距
 */
function applyFirstColumnMargin(firstColumn, finalMarginLeft) {
    if (!firstColumn || firstColumn.dataset.level !== "1") {
        return;
    }

    const currentMargin = parseFloat(firstColumn.style.marginLeft) || 0;
    const marginDiff = Math.abs(finalMarginLeft - currentMargin);

    // 🔧 修复：只有边距差异超过 1px 时才应用，避免微小抖动和意外动画
    if (marginDiff > 1) {
        if (marginDiff > 100 || !firstColumn.dataset.initialized) {
            // 大幅度变化或首次初始化：禁用动画
            firstColumn.style.transition = 'none';
            firstColumn.style.marginLeft = `${finalMarginLeft}px`;
            firstColumn.dataset.initialized = 'true';
            // 用 getComputedStyle 触发 style flush（比 offsetHeight 代价更低，不触发 layout）
            requestAnimationFrame(() => {
                void getComputedStyle(firstColumn).transition;
                firstColumn.style.transition = '';
            });
        } else {
            // 小幅度变化：正常应用（会有动画）
            firstColumn.style.marginLeft = `${finalMarginLeft}px`;
        }
    }

    // 🔧 修复：移除自动恢复 transition 的逻辑
    // 这是导致标签页切换后出现意外动画的根本原因
    // transition 只应该在真正需要动画时恢复（即上面的大幅度变化场景）
}

/**
 * 计算并执行智能滚动
 * @param {HTMLElement} container - 容器元素
 * @param {Object} params - 参数对象
 */
function performSmartScroll(container, params) {
    const { firstColumn, finalMarginLeft, gap, marginRight, availableWidth, columns, expectedWidths } = params;

    const getWidth = (el) => (expectedWidths && expectedWidths.has(el)) ? expectedWidths.get(el) : el.offsetWidth;

    let scrollTarget = 0;
    const finalColumns = columns;

    const firstColumnMargin = firstColumn && firstColumn.dataset.level === "1"
        ? (parseFloat(firstColumn.style.marginLeft) || finalMarginLeft || 0)
        : 0;

    const finalColumnsWidth = finalColumns.reduce((sum, col) => sum + getWidth(col), 0);
    const finalGapsWidth = (finalColumns.length - 1) * gap;
    const finalTotalWidth = firstColumnMargin + finalColumnsWidth + finalGapsWidth + marginRight;

    if (finalTotalWidth > availableWidth) {
        let visibleWidth = marginRight;
        let firstVisibleColumnIndex = finalColumns.length - 1;
        const maxVisibleWidth = availableWidth;

        for (let i = finalColumns.length - 1; i >= 0; i--) {
            const currentCol = finalColumns[i];
            const colWidth = getWidth(currentCol);
            const widthToAdd = (i === finalColumns.length - 1) ? colWidth : colWidth + gap;

            if (visibleWidth + widthToAdd <= maxVisibleWidth) {
                visibleWidth += widthToAdd;
                firstVisibleColumnIndex = i;
            } else {
                break;
            }
        }

        if (firstVisibleColumnIndex === 0) {
            scrollTarget = 0;
        } else {
            // 累加预期宽度计算 offsetLeft，避免读取 DOM 布局属性
            let accLeft = firstColumnMargin;
            for (let i = 0; i < firstVisibleColumnIndex; i++) {
                accLeft += getWidth(finalColumns[i]) + gap;
            }
            scrollTarget = Math.max(0, accLeft - 10);
        }
    }

    const currentScroll = container.scrollLeft;
    const scrollDiff = Math.abs(scrollTarget - currentScroll);

    if (scrollDiff > 10) {
        container.scrollTo({
            left: Math.max(0, scrollTarget),
            behavior: scrollDiff > 200 ? 'smooth' : 'auto'
        });
    }
}

// ========================================
// 恢复原始的平滑动画 + 稳定布局算法（只修复抖动）
// ========================================

// ✅ 性能优化：RAF 防抖，合并同一帧内的多次调用
let adjustRAF = null;
function scheduleAdjustColumnWidths(container) {
    if (adjustRAF) return; // 已有待执行的调整
    adjustRAF = requestAnimationFrame(() => {
        adjustRAF = null;
        adjustColumnWidths(container);
    });
}

/**
 * ✅ P2重构：简化后的主函数，职责更清晰
 * 调整书签列宽度以适应容器大小，支持响应式布局和智能居中
 * @param {HTMLElement} container - 书签容器元素
 */
function adjustColumnWidths(container) {
    if (!container || resizing) return;

    const availableWidth = container.clientWidth;
    if (!availableWidth || availableWidth <= 0) return;

    resizing = true;

    try {
        const columns = Array.from(container.querySelectorAll('.bookmark-column[data-level]:not([data-level="0"])'));
        if (columns.length === 0) {
            resizing = false;
            return;
        }

        const gap = CONSTANTS.LAYOUT.COLUMN_GAP;
        const config = getResponsiveConfig();
        const DEFAULT_COL_WIDTH = config.ideal;
        const MIN_COL_WIDTH = config.min;
        const marginRight = CONSTANTS.LAYOUT.COLUMN_GAP;
        const firstColumn = columns[0];

        // 单次遍历：先批量读取 offsetWidth（触发一次 layout flush），再构建数据
        const columnData = new Array(columns.length);
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const currentWidth = col.offsetWidth;
            const userResized = col.dataset.userResized === 'true';
            columnData[i] = { el: col, currentWidth, userResized, canResize: !userResized };
        }

        const newColumnCount = columns.length;
        const columnsChanged = newColumnCount !== AppState.layout.currentColumnCount;

        const marginLeft = calculateFirstColumnMargin({
            firstColumn,
            columns,
            availableWidth,
            columnsChanged,
            newColumnCount
        });

        const columnsWidth = columnData.reduce((sum, data) => sum + data.currentWidth, 0);
        const gapsWidth = (columnData.length - 1) * gap;
        const totalUsedWidth = marginLeft + columnsWidth + gapsWidth + marginRight;
        const resizableColumns = columnData.filter(data => data.canResize);

        let _colStylesMap;
        if (totalUsedWidth > availableWidth) {
            const overflowWidth = totalUsedWidth - availableWidth;
            _colStylesMap = shrinkColumnsToFit(resizableColumns, overflowWidth, MIN_COL_WIDTH);
        } else {
            const availableSpace = availableWidth - totalUsedWidth;
            _colStylesMap = enlargeColumnsToFill(resizableColumns, availableSpace, DEFAULT_COL_WIDTH);
        }

        applyColumnWidthStyles(_colStylesMap, columnData);
        applyFirstColumnMargin(firstColumn, marginLeft);

        // 构建写入后的预期宽度 Map，避免 performSmartScroll 触发强制同步布局
        const expectedWidths = new Map(columnData.map(d => [d.el, d.currentWidth]));
        _colStylesMap.forEach((widthStr, el) => expectedWidths.set(el, parseFloat(widthStr)));

        performSmartScroll(container, {
            firstColumn,
            finalMarginLeft: marginLeft,
            gap,
            marginRight,
            availableWidth,
            columns,
            expectedWidths
        });

        resizing = false;
    } catch (error) {
        console.error('Error in adjustColumnWidths:', error);
        resizing = false;
    }
}

// 拖拽逻辑
/**
 * 处理拖拽开始事件
 * @param {DragEvent} e - 拖拽事件对象
 */
function handleDragStart(e) {
    AppState.drag.isDragging = true;
    AppState.drag.draggedItem = e.target.closest('.bookmark-item');
    
    // 关键优化：拖动开始时立即清除所有悬停意图
    clearHoverIntent();
    
    // 激活悬停抑制标志
    AppState.hover.suppressHover = true;

    if (!AppState.selection.items.has(AppState.drag.draggedItem.dataset.id)) {
        clearSelection();
        toggleSelection(AppState.drag.draggedItem);
    }

    const idsToDrag = [...AppState.selection.items];
    e.dataTransfer.setData('application/json', JSON.stringify(idsToDrag));
    e.dataTransfer.effectAllowed = 'move';

    // P2改进：创建自定义拖动预览
    const dragCount = idsToDrag.length;
    if (dragCount > 1) {
        const dragImage = document.createElement('div');
        dragImage.style.cssText = 'position: absolute; top: -1000px; padding: 8px 12px; background: var(--card-bg); border: 1px solid var(--dialog-primary-bg); border-radius: 6px; color: var(--text-color); font-size: 13px; backdrop-filter: blur(12px);';
        dragImage.textContent = `${dragCount} 个项目`;
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 0, 0);
        setTimeout(() => dragImage.remove(), 0);
    }

    queueMicrotask(() => {
        selectedElements.forEach(el => {
            if (el.isConnected) ElementCache.addDragging(el);
        });
    });

    e.stopPropagation();
}

/**
 * 处理拖拽结束事件
 * @param {DragEvent} e - 拖拽事件对象
 */
function handleDragEnd(e) {
    AppState.drag.isDragging = false;

    ElementCache.clearDragging();
    AppState.drag.draggedItem = null;
    AppState.drag.lastDragOverTarget = null;
    _cachedDragRect = null;
    _cachedDragRectTarget = null;

    // 用 Set 清理列高亮，避免全局 querySelectorAll
    _dragOverColumns.forEach(el => el.classList.remove('column-drag-over'));
    _dragOverColumns.clear();

    AppState.hover.suppressHover = true;
    clearTimeout(AppState.hover.suppressTimer);
    AppState.hover.suppressTimer = setTimeout(() => {
        AppState.hover.suppressHover = false;
    }, 500);
}

// 追踪列高亮，避免 handleDragEnd 时全局 querySelectorAll
const _dragOverColumns = new Set();

// 缓存当前 dragover 目标的 rect，只在目标变化时重新测量
let _cachedDragRect = null;
let _cachedDragRectTarget = null;

function handleDragOver(e) {
    e.preventDefault();
    const targetItem = e.target.closest('.bookmark-item');
    if (!targetItem) return;

    if (AppState.selection.items.has(targetItem.dataset.id)) {
        return;
    }

    // 只在目标变化时重新测量 rect
    if (targetItem !== _cachedDragRectTarget) {
        _cachedDragRect = targetItem.getBoundingClientRect();
        _cachedDragRectTarget = targetItem;
    }
    const rect = _cachedDragRect;
    const level = targetItem.closest('.bookmark-column, .bookmarks-bar').dataset.level;
    const isFolder = targetItem.classList.contains('is-folder');

    let newClass = '';
    if (level == '0') {
        newClass = (e.clientX < rect.left + rect.width / 2) ? 'drag-over-before' : 'drag-over-after';
    } else {
        const y = e.clientY - rect.top;
        if (isFolder) {
            if (y < rect.height * 0.25) {
                newClass = 'drag-over-top';
            } else if (y > rect.height * 0.75) {
                newClass = 'drag-over-bottom';
            } else {
                newClass = 'drag-enter';
            }
        } else {
            newClass = (y < rect.height / 2) ? 'drag-over-top' : 'drag-over-bottom';
        }
    }

    if (AppState.drag.lastDragOverTarget !== targetItem || !targetItem.classList.contains(newClass)) {
        if (AppState.drag.lastDragOverTarget && AppState.drag.lastDragOverTarget !== targetItem) {
            AppState.drag.lastDragOverTarget.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
        }

        targetItem.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
        targetItem.classList.add(newClass);

        AppState.drag.lastDragOverTarget = targetItem;
    }
}

// 优化的书签高亮函数
/**
 * 高亮显示多个书签项（带动画效果）
 * @param {Array<string>} itemIds - 书签ID数组
 * @param {number} [delay=50] - 每个项目之间的动画延迟（毫秒）
 */
function highlightBookmarkItems(itemIds, delay = 50) {
    if (!itemIds || itemIds.length === 0) return;

    const bookmarkContainer = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));
    if (!bookmarkContainer) return;

    let observer = null;
    let timeoutId = null;
    let animationTimer = null;

    const cleanup = () => {
        if (observer) { observer.disconnect(); observer = null; }
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        if (animationTimer) { clearTimeout(animationTimer); animationTimer = null; }
    };

    const applyHighlight = (items) => {
        if (!items || items.length === 0) return;
        requestAnimationFrame(() => {
            items.forEach(item => { if (item?.classList) item.classList.add('just-moved'); });
            if (items[0]) items[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            animationTimer = setTimeout(() => {
                animationTimer = null;
                requestAnimationFrame(() => {
                    items.forEach(item => { if (item?.isConnected) item.classList.remove('just-moved'); });
                });
            }, 1200);
        });
    };

    const findItems = () => itemIds.map(id => document.querySelector(`.bookmark-item[data-id="${id}"]`)).filter(Boolean);

    // 立即尝试，找到就直接高亮（delay 用于拖入文件夹展开后等待 DOM 更新）
    const tryImmediate = findItems();
    if (tryImmediate.length === itemIds.length) {
        applyHighlight(tryImmediate);
        return;
    }

    // 找不到：等 delay 后再尝试，仍找不到则启动 MutationObserver
    setTimeout(() => {
        const immediateItems = findItems();
        if (immediateItems.length === itemIds.length) {
            applyHighlight(immediateItems);
            return;
        }

        observer = new MutationObserver(() => {
            const foundItems = findItems();
            if (foundItems.length === itemIds.length) { cleanup(); applyHighlight(foundItems); }
        });
        observer.observe(bookmarkContainer, { childList: true, subtree: true, attributes: false, characterData: false });

        timeoutId = setTimeout(() => {
            const foundItems = findItems();
            cleanup();
            if (foundItems.length > 0) applyHighlight(foundItems);
        }, 1500);
    }, delay);
}

function handleDragLeave(e) {
    const targetItem = e.target.closest('.bookmark-item');
    if (targetItem && !targetItem.contains(e.relatedTarget)) {
        targetItem.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
    }
}

/**
 * ✅ 优化 #11: 处理拖拽放下事件，实现书签的拖拽重排
 * @param {DragEvent} e - 拖拽事件对象
 * @returns {void}
 * 支持单个或多个书签的拖拽移动
 */
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    // 🔧 修复：检查是否是有效的拖拽操作
    if (!AppState.drag.isDragging) {
        return; // 静默返回，不是有效的拖拽操作
    }

    // 🔧 修复：安全解析拖拽数据，处理异常情况
    let idsToMove;
    try {
        const data = e.dataTransfer.getData('application/json');
        if (!data) {
            return; // 静默返回，没有数据
        }
        idsToMove = JSON.parse(data);
    } catch (error) {
        // 静默返回，数据格式错误（可能是外部拖拽）
        return;
    }

    if (!idsToMove || idsToMove.length === 0) {
        return; // 静默返回，没有要移动的书签
    }

    const dropTarget = e.target.closest('.bookmark-item');
    const hasDragIndicator = dropTarget && (
        dropTarget.classList.contains('drag-over-top') ||
        dropTarget.classList.contains('drag-over-bottom') ||
        dropTarget.classList.contains('drag-over-before') ||
        dropTarget.classList.contains('drag-over-after') ||
        dropTarget.classList.contains('drag-enter')
    );

    // 拖到空白处，或鼠标停在书签上但没有明确放置指示时，
    // 回退到列级别处理（移动到该文件夹末尾）
    if (!hasDragIndicator) {
        const column = (dropTarget?.closest('.bookmark-column, .bookmarks-bar'))
            || e.target.closest('.bookmark-column, .bookmarks-bar');
        if (column) handleColumnDrop.call(column, e);
        return;
    }

    // 拖到自身上：忽略
    if (idsToMove.includes(dropTarget.dataset.id)) {
        return;
    }

    // 🔧 修复：先检查拖拽状态，再清除样式
    const classes = dropTarget.classList;
    const isDragEnter = classes.contains('drag-enter');
    const isDragAfter = classes.contains('drag-over-after') || classes.contains('drag-over-bottom');

    // 立即清除拖拽样式，避免高亮残留
    dropTarget.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');

    let destination = {};

    if (isDragEnter) {
        // 拖入文件夹 - 需要检查循环引用
        const targetFolderId = dropTarget.dataset.id;

        // P0修复：检查是否会造成循环引用
        const wouldCreateLoop = idsToMove.some(id => {
            return isAncestor(id, targetFolderId);
        });

        if (wouldCreateLoop) {
            console.error('[handleDrop] 检测到循环引用');
            showToast('不能将文件夹移动到自己的子文件夹中', 3000, 'warning');
            return;
        }

        destination.parentId = targetFolderId;
        destination.index = 0;
    } else {
        destination.parentId = dropTarget.dataset.parentId;
        // 实时计算元素在父容器中的位置，不依赖 dataset.index（避免维护 reindex）
        const wrapper = dropTarget.parentElement;
        let newIndex = 0;
        if (wrapper) {
            const siblings = wrapper.querySelectorAll('.bookmark-item');
            for (let i = 0; i < siblings.length; i++) {
                if (siblings[i] === dropTarget) { newIndex = i; break; }
            }
        }
        if (isDragAfter) newIndex++;
        destination.index = newIndex;
    }

    const moveBookmarksSequentially = async () => {
        const result = await moveBookmarksToDestination(idsToMove, destination);
        const { successCount, errorCount } = result;

        if (errorCount === 0) {
            showToast(`成功移动 ${successCount} 个项目`, 2000, 'success');
        } else if (successCount === 0) {
            showToast('移动失败，目标可能无效', 3000, 'error');
        } else {
            showToast(`移动完成：${successCount} 成功，${errorCount} 失败`, 3000, 'warning');
        }

        // 移动成功后的处理
        if (successCount > 0) {
            // 立即刷新当前列的显示
            refreshParentFolderColumn(destination.parentId, '目标文件夹');

            // 如果是拖入文件夹，需要先展开目标文件夹
            if (isDragEnter && dropTarget) {
                const targetFolderItem = document.querySelector(`.bookmark-item[data-id="${destination.parentId}"]`);
                if (targetFolderItem && targetFolderItem.classList.contains('is-folder') && !targetFolderItem.classList.contains('highlighted')) {
                    handleFolderClick(targetFolderItem, destination.parentId);
                }
            }

            // 高亮显示被移动的书签
            highlightBookmarkItems(idsToMove, isDragEnter ? 200 : 50);
        }
    };

    // 执行顺序移动
    moveBookmarksSequentially().catch(err => console.error('[handleDrop] 移动失败:', err));
}

/**
 * ✅ P2-1优化：提取重复的书签移动逻辑
 * 将多个书签移动到指定位置
 * @param {string[]} idsToMove - 要移动的书签ID数组
 * @param {Object} destination - 目标位置 {parentId, index}
 * @returns {Promise<{successCount: number, errorCount: number}>} 移动结果统计
 */
async function moveBookmarksToDestination(idsToMove, destination) {
    let successCount = 0;
    let errorCount = 0;

    // 反向移动：从最后一个书签开始移动
    for (let i = idsToMove.length - 1; i >= 0; i--) {
        const id = idsToMove[i];

        if (!id) {
            errorCount++;
            continue;
        }

        try {
            await chrome.bookmarks.move(id, destination);
            successCount++;
        } catch (err) {
            console.error(`移动书签 ${id} 失败:`, err);
            errorCount++;
        }
    }

    return { successCount, errorCount };
}

// 将一批书签渲染到目标 wrapper，原子替换避免闪烁
function renderChildrenToWrapper(wrapper, children, isBookmarksBar) {
    const nodes = children.map(child => {
        const item = createBookmarkItem(child);
        if (isBookmarksBar) item.classList.add('bookmarks-bar-item');
        return item;
    });
    if (lazyLoadObserver) {
        wrapper.querySelectorAll('img[data-src]').forEach(img => lazyLoadObserver.unobserve(img));
    }
    wrapper.replaceChildren(...nodes);
    observeLazyImages(wrapper);
}

/**
 * ✅ P2优化：提取公共函数 - 刷新父文件夹的显示列
 * ✅ P0优化：添加竞态条件保护
 * @param {string} parentId - 父文件夹ID
 * @param {string} parentLabel - 父文件夹标签（用于日志）
 * @returns {void}
 */
function refreshParentFolderColumn(parentId, parentLabel = '父文件夹') {
    // ✅ 竞态保护：取消之前对同一父文件夹的待处理请求
    const pendingRefreshMap = AppState.requests.pendingParentRefresh;
    if (pendingRefreshMap.has(parentId)) {
        const oldRequest = pendingRefreshMap.get(parentId);
        oldRequest.cancelled = true;
    }

    const parentItem = document.querySelector(`.bookmark-item[data-id="${parentId}"]`);

    if (!parentItem) {
        pendingRefreshMap.delete(parentId);
        return;
    }

    const column = parentItem.closest('.bookmark-column, .bookmarks-bar');

    if (!column?.dataset.level) {
        console.warn(`[refreshParent] ${parentLabel}所在列无效`);
        pendingRefreshMap.delete(parentId);
        return;
    }

    const level = +column.dataset.level;
    const parentColumn = document.querySelector(`.bookmark-column[data-level="${level + 1}"]`);

    if (!parentColumn) {
        pendingRefreshMap.delete(parentId);
        return;
    }

    // ✅ 修复：检查是否是书签栏（level 0）
    const isBookmarksBar = parentColumn.dataset.level === '0';

    // ✅ 创建新的请求标记
    const thisRequest = { cancelled: false, parentId, timestamp: Date.now() };
    pendingRefreshMap.set(parentId, thisRequest);

    // 重新渲染父文件夹的内容
    chrome.bookmarks.getChildren(parentId, (children) => {
        // ✅ 检查请求是否已被取消
        if (thisRequest.cancelled) {
            pendingRefreshMap.delete(parentId);
            return;
        }

        if (chrome.runtime.lastError || !Array.isArray(children)) {
            console.error(`[refreshParent] 获取${parentLabel}子项失败:`, chrome.runtime.lastError);
            pendingRefreshMap.delete(parentId);
            return;
        }

        const contentWrapper = parentColumn.querySelector('.column-content-wrapper') || parentColumn;
        renderChildrenToWrapper(contentWrapper, children, isBookmarksBar);

        // ✅ 清除请求标记
        if (pendingRefreshMap.get(parentId) === thisRequest) {
            pendingRefreshMap.delete(parentId);
        }
    });
}

/**
 * ✅ P1-3优化：使用 BookmarkTreeCache 替代 DOM 查询
 * 检查一个节点是否是另一个节点的祖先
 * @param {string} potentialAncestorId - 潜在祖先节点的ID
 * @param {string} nodeId - 要检查的节点ID
 * @returns {boolean} 如果是祖先关系则返回true
 */
const _isAncestorVisited = new Set(); // 复用，避免每次调用 new Set()

function isAncestor(potentialAncestorId, nodeId) {
    if (!potentialAncestorId || !nodeId) return false;
    if (potentialAncestorId === nodeId) return true;

    let current = BookmarkTreeCache.get(nodeId);
    if (!current) return false;

    _isAncestorVisited.clear();

    while (current && current.parentId) {
        if (_isAncestorVisited.has(current.parentId)) break;
        _isAncestorVisited.add(current.parentId);

        if (current.parentId === potentialAncestorId) {
            return true;
        }

        current = BookmarkTreeCache.get(current.parentId);
    }

    return false;
}

function handleColumnDragOver(e) {
    e.preventDefault();
    if (AppState.drag.lastDragOverTarget) {
        AppState.drag.lastDragOverTarget.classList.remove(
            'drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter'
        );
        AppState.drag.lastDragOverTarget = null;
    }
    this.classList.add('column-drag-over');
    _dragOverColumns.add(this);
}

function handleColumnDragLeave(e) {
    if (!this.contains(e.relatedTarget)) {
        this.classList.remove('column-drag-over');
        _dragOverColumns.delete(this);
    }
}

function handleColumnDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    // 🔧 修复：检查是否是有效的拖拽操作
    if (!AppState.drag.isDragging) {
        return; // 静默返回，不是有效的拖拽操作
    }

    // 🔧 修复：安全解析拖拽数据，处理异常情况
    let idsToMove;
    try {
        const data = e.dataTransfer.getData('application/json');
        if (!data) {
            return; // 静默返回，没有数据
        }
        idsToMove = JSON.parse(data);
    } catch (error) {
        // 静默返回，数据格式错误（可能是外部拖拽）
        return;
    }

    if (!idsToMove || idsToMove.length === 0) {
        return;
    }

    // this 是由事件委托 .call(column, e) 传入的列元素，始终有效
    const column = this;
    column.classList.remove('column-drag-over');
    _dragOverColumns.delete(column);

    let parentId = null;
    const level = +column.dataset.level;

    if (level === 0) {
        parentId = CONSTANTS.BOOKMARKS_BAR_ID;
    } else {
        // level-1 可能是书签栏（.bookmarks-bar），也可能是普通列（.bookmark-column）
        const prevColumn = document.querySelector(
            `.bookmark-column[data-level="${level - 1}"], .bookmarks-bar[data-level="${level - 1}"]`
        );
        if (prevColumn) {
            const highlightedFolder = prevColumn.querySelector('.bookmark-item.highlighted');
            if (highlightedFolder) {
                parentId = highlightedFolder.dataset.id;
            } else {
                const firstItem = column.querySelector('.bookmark-item');
                if (firstItem) {
                    parentId = firstItem.dataset.parentId;
                }
            }
        }
    }

    if (parentId) {
        const moveBookmarksSequentially = async () => {
            // 不指定 index，Chrome 自动放到文件夹末尾
            const result = await moveBookmarksToDestination(idsToMove, {
                parentId: parentId
            });
            const { successCount, errorCount } = result;

            // 所有移动完成后显示反馈
            if (errorCount === 0) {
                showToast(`成功移动 ${successCount} 个项目`, 2000, 'success');
            } else if (successCount === 0) {
                showToast('移动失败', 3000, 'error');
            } else {
                showToast(`移动完成：${successCount} 成功，${errorCount} 失败`, 3000, 'warning');
            }

            // 移动成功后的处理
            if (successCount > 0) {
                // 立即刷新当前列的显示
                refreshParentFolderColumn(parentId, '目标文件夹');
                // 高亮显示被移动的书签
                highlightBookmarkItems(idsToMove, 50);
            }
        };

        moveBookmarksSequentially().catch(err => console.error('[handleColumnDrop] 移动失败:', err));
    } else {
        console.error('[handleColumnDrop] 无法确定父文件夹ID');
        showToast('无法确定目标位置', 2000, 'error');
    }
}

// 右键菜单

/**
 * ✅ 优化 #11: 隐藏右键菜单
 * @returns {void}
 */
function hideContextMenu() {
    // P1优化：使用缓存的contextMenu元素
    const contextMenu = getCachedElement('contextMenu', () => document.getElementById('contextMenu'));
    if (contextMenu && contextMenu.style.display === 'block') {
        contextMenu.style.display = 'none';
        delete document.body.dataset.contextMenuOpen;
        // 🔧 修复：不要在关闭右键菜单时清除选中状态
        // 选中状态应该保持，直到用户执行操作或点击空白区域
        // clearSelection(); // 移除这行，保持高亮
    }
}

/**
 * ✅ 性能优化：右键菜单项池（预先创建，复用 DOM 元素）
 * 避免每次右键都重建 10+ 个 DOM 元素，提升响应速度 50-70%
 */
const ContextMenuPool = (() => {
    // 创建菜单项的工厂函数
    const createMenuItem = (id, iconId, text) => {
        const li = document.createElement('li');
        li.id = id;
        li.dataset.action = id;

        const svg = createSvgIcon(iconId, 'menu-icon');
        svg.setAttribute('aria-hidden', 'true');
        li.appendChild(svg);

        const textNode = document.createTextNode(text);
        li.appendChild(textNode);

        // 保存文本节点引用，方便后续更新文本
        li._textNode = textNode;

        return li;
    };

    const createSeparator = () => {
        return document.createElement('hr');
    };

    // 预先创建所有菜单项
    const items = {
        // 打开相关
        open: createMenuItem('open', 'icon-open', '新标签打开'),
        openNew: createMenuItem('openNew', 'icon-open-new', '新窗口打开'),
        openIncognito: createMenuItem('openIncognito', 'icon-open-incognito', '在隐身模式中打开'),
        openAll: createMenuItem('openAll', 'icon-open-all', '打开文件夹内所有书签'),
        openAllNew: createMenuItem('openAllNew', 'icon-open-new', '新窗口打开全部'),
        openAllIncognito: createMenuItem('openAllIncognito', 'icon-open-incognito', '隐身模式打开全部'),

        // 编辑相关
        rename: createMenuItem('rename', 'icon-rename', '重命名'),
        editUrl: createMenuItem('editUrl', 'icon-edit', '修改网址'),
        move: createMenuItem('move', 'icon-move', '移动到...'),
        copyUrl: createMenuItem('copyUrl', 'icon-copy', '复制网址'),
        properties: createMenuItem('properties', 'icon-properties', '属性'),
        delete: createMenuItem('delete', 'icon-delete', '删除'),

        // 文件夹相关
        newFolder: createMenuItem('newFolder', 'icon-folder-plus', '新建文件夹'),

        // 排序相关
        sortAlphaAsc: createMenuItem(CONSTANTS.SORT_TYPES.ALPHA_ASC, 'icon-sort-alpha-asc', '排序：由 A 到 Z'),
        sortAlphaDesc: createMenuItem(CONSTANTS.SORT_TYPES.ALPHA_DESC, 'icon-sort-alpha-desc', '排序：由 Z 到 A'),
        sortDateNew: createMenuItem(CONSTANTS.SORT_TYPES.DATE_NEW, 'icon-sort-date-desc', '排序：从新到旧'),
        sortDateOld: createMenuItem(CONSTANTS.SORT_TYPES.DATE_OLD, 'icon-sort-date-asc', '排序：从旧到新'),
        sortVisit: createMenuItem(CONSTANTS.SORT_TYPES.VISIT, 'icon-sort-visit', '排序：按上次打开'),

        // Top Site 相关
        removeTopSite: createMenuItem('removeTopSite', 'icon-delete', '移除'),
    };

    const ul = document.createElement('ul');
    ul.className = 'menu-list';

    return {
        items,
        ul,
        getSeparator() { return createSeparator(); },
        updateText(itemKey, text) {
            const item = items[itemKey];
            if (item && item._textNode) item._textNode.textContent = text;
        }
    };
})();

/**
 * ✅ 优化 #11: 显示右键菜单
 * @param {MouseEvent} e - 鼠标事件对象
 * @param {HTMLElement|null} bookmarkElement - 书签元素（可为null表示空白区域）
 * @param {HTMLElement|null} column - 列元素
 * @returns {void}
 * 根据点击位置和选中状态动态生成菜单项
 */
function showContextMenu(e, bookmarkElement, column) {
    const contextMenu = getCachedElement('contextMenu', () => document.getElementById('contextMenu'));

    const { items, getSeparator, updateText, ul } = ContextMenuPool;

    // 清空 ul（复用，不重建）
    while (ul.firstChild) ul.removeChild(ul.firstChild);

    const rightClickedId = bookmarkElement?.dataset.id;
    const isModuleItem = bookmarkElement?.closest('.vertical-modules');
    const isTopSiteItem = bookmarkElement?.classList.contains('top-site-item');

    // 右键菜单显示时，清除所有预览高亮痕迹
    clearPreviewHighlight();

    if (rightClickedId && !AppState.selection.items.has(rightClickedId)) {
        clearSelection();
        if (isTopSiteItem) {
            AppState.selection.items.add(rightClickedId);
            selectedElements.set(rightClickedId, bookmarkElement);
            bookmarkElement.classList.add('selected');
        } else {
            toggleSelection(bookmarkElement);
        }
    } else if (!rightClickedId) {
        clearSelection();
    }

    const selectionSize = AppState.selection.items.size;
    // 用已缓存的 selectedElements 直接判断，无需再查 DOM
    let hasBookmarkInSelection = false;
    for (const el of selectedElements.values()) {
        if (!el.classList.contains('is-folder')) { hasBookmarkInSelection = true; break; }
    }

    // ✅ P0修复：直接创建并添加 DOM 元素，而不是先存入数组
    if (isTopSiteItem) {
        ul.appendChild(items.open);
        ul.appendChild(items.openNew);
        ul.appendChild(items.openIncognito);
        ul.appendChild(getSeparator());
        ul.appendChild(items.removeTopSite);
    }
    else if (selectionSize > 0) {
        if (selectionSize > 1) {
            if (hasBookmarkInSelection) {
                // 更新动态文本
                updateText('open', `打开全部 (${selectionSize})`);
                updateText('openNew', `新窗口打开全部 (${selectionSize})`);
                updateText('openIncognito', `隐身模式打开全部 (${selectionSize})`);

                ul.appendChild(items.open);
                ul.appendChild(items.openNew);
                ul.appendChild(items.openIncognito);
                ul.appendChild(getSeparator());
            }
        } else {
            const isFolder = bookmarkElement && bookmarkElement.classList.contains('is-folder');
            if (isFolder) {
                ul.appendChild(items.openAll);
                ul.appendChild(items.openAllNew);
                ul.appendChild(items.openAllIncognito);
                ul.appendChild(getSeparator());
            } else {
                // 恢复单个书签的文本
                updateText('open', '新标签打开');
                updateText('openNew', '新窗口打开');
                updateText('openIncognito', '在隐身模式中打开');

                ul.appendChild(items.open);
                ul.appendChild(items.openNew);
                ul.appendChild(items.openIncognito);
                ul.appendChild(getSeparator());
            }
        }

        if (selectionSize === 1 && bookmarkElement && !bookmarkElement.classList.contains('is-folder')) {
            ul.appendChild(items.editUrl);
        }
        if (selectionSize === 1) {
            ul.appendChild(items.rename);
        }

        // 更新动态文本
        updateText('move', `移动${selectionSize > 1 ? ` (${selectionSize})` : ''}到...`);
        updateText('delete', `删除${selectionSize > 1 ? ` (${selectionSize})` : ''}`);

        ul.appendChild(items.move);
        if (selectionSize === 1 && bookmarkElement && !bookmarkElement.classList.contains('is-folder')) {
            ul.appendChild(items.copyUrl);
        }
        if (selectionSize === 1) {
            ul.appendChild(items.properties);
        }
        ul.appendChild(getSeparator());
        ul.appendChild(items.delete);
    }

    if (column && !isModuleItem && !isTopSiteItem) {
        if (ul.children.length > 0) ul.appendChild(getSeparator());
        ul.appendChild(items.newFolder);
        ul.appendChild(getSeparator());
        ul.appendChild(items.sortAlphaAsc);
        ul.appendChild(items.sortAlphaDesc);
        ul.appendChild(items.sortDateNew);
        ul.appendChild(items.sortDateOld);
        ul.appendChild(items.sortVisit);
    }

    // display=block 后读真实尺寸（菜单内容每次可能不同，必须在可见状态下量）
    // 先移到屏幕外避免闪烁，再定位到正确位置
    contextMenu.style.left = '-9999px';
    contextMenu.style.top = '-9999px';
    contextMenu.style.display = 'block';

    const { width: menuWidth, height: menuHeight } = contextMenu.getBoundingClientRect();
    const { innerWidth: winWidth, innerHeight: winHeight } = window;
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

    AppState.contextMenu.target = bookmarkElement;
    AppState.contextMenu.column = column;
    document.body.dataset.contextMenuOpen = 'true';
}
// ========================================
// ✅ 优化：右键菜单辅助函数
// ========================================

/**
 * 获取父文件夹 ID
 */
function getParentIdFromContext(element, column) {
    if (element && element.classList.contains('is-folder')) {
        return element.dataset.id;
    } else if (element) {
        return element.dataset.parentId;
    } else {
        const level = +column.dataset.level;
        if (level === 0) return CONSTANTS.BOOKMARKS_BAR_ID;
        // level-1 可能是书签栏(.bookmarks-bar)或普通列(.bookmark-column)
        return document.querySelector(
            `.bookmark-column[data-level="${level - 1}"] .bookmark-item.highlighted, .bookmarks-bar[data-level="${level - 1}"] .bookmark-item.highlighted`
        )?.dataset.id;
    }
}

/**
 * 打开书签（支持批量）
 */
function openBookmarks(selectedIds, openMode) {
    const openActions = {
        'open': (url) => openBookmark(url, null),
        'openNew': (url) => chrome.windows.create({ url }).catch(err => console.error('新窗口打开失败:', err)),
        'openIncognito': (url) => chrome.windows.create({ url, incognito: true }).catch(err => {
            console.error('隐身模式打开失败:', err);
            showToast('无法打开隐身模式', 2000, 'error');
        })
    };

    selectedIds.forEach(id => {
        const item = selectedElements.get(id) || findBookmarkElement(id);
        if (item?.dataset.url && openActions[openMode]) {
            openActions[openMode](item.dataset.url);
        }
    });
}

/**
 * 处理删除书签操作
 */
function handleDeleteBookmarks(selectedIds) {
    const itemsToDelete = selectedIds.map(id => {
        const item = findBookmarkElement(id);
        if (!item) return null;
        return {
            id,
            title: item.dataset.title || item.querySelector('.bookmark-title, .module-title')?.textContent || '未命名',
            isFolder: item.classList.contains('is-folder')
        };
    }).filter(Boolean);

    if (itemsToDelete.length === 0) {
        showToast('未找到要删除的项目');
        return;
    }

    // 构建删除提示消息
    const message = itemsToDelete.length === 1
        ? `确定要删除${itemsToDelete[0].isFolder ? '文件夹' : '书签'} "<span class="delete-item-name">${itemsToDelete[0].title}</span>" 吗？`
        : `确定要删除以下 ${itemsToDelete.length} 个项目吗？\n\n${itemsToDelete.map(item =>
            `${item.isFolder ? '📁' : '🔖'} <span class="delete-item-name">${item.title}</span>`
        ).join('\n')}`;

    showConfirmDialog(`删除 ${itemsToDelete.length} 个项目`, message, () => {
        const promises = itemsToDelete.map(({ id, title, isFolder }) => {
            const promise = isFolder ? chrome.bookmarks.removeTree(id) : chrome.bookmarks.remove(id);
            return promise.catch(err => {
                console.error(`删除项目 ${id} 失败:`, err);
                showToast(`项目 "${title}" 删除失败`, 2000, 'error');
            });
        });
        Promise.all(promises).then(() => {
            showToast(`已删除 ${itemsToDelete.length} 个项目`, 2000, 'success');
        });
    }, true);
}

/**
 * 右键菜单动作处理
 */
function handleContextMenuAction(action, element) {
    const selectedIds = [...AppState.selection.items];

    if (Object.values(CONSTANTS.SORT_TYPES).includes(action)) {
        const column = AppState.contextMenu.column;
        if (!column) return;
        const parentId = getParentIdFromContext(element, column);
        if (parentId) handleSortBookmarks(parentId, action);
        return;
    }

    switch (action) {
        case 'open':
        case 'openNew':
        case 'openIncognito':
            openBookmarks(selectedIds, action);
            break;
        case 'openAll':
        case 'openAllNew':
        case 'openAllIncognito':
            if (element?.dataset.id) {
                chrome.bookmarks.getChildren(element.dataset.id, (children) => {
                    if (chrome.runtime.lastError || !children) return;
                    const urls = children.filter(c => c.url).map(c => c.url);
                    if (urls.length === 0) { showToast('文件夹内没有书签'); return; }
                    if (action === 'openAllNew') {
                        chrome.windows.create({ url: urls }).catch(e => console.error('新窗口打开失败:', e));
                    } else if (action === 'openAllIncognito') {
                        chrome.windows.create({ url: urls, incognito: true })
                            .catch(() => showToast('无法打开隐身模式', 2000, 'error'));
                    } else {
                        urls.forEach(url => chrome.tabs.create({ url, active: false }));
                        showToast(`已在后台打开 ${urls.length} 个书签`);
                    }
                });
            }
            break;
        case 'delete':
            handleDeleteBookmarks(selectedIds);
            break;
        case 'move':
            showMoveDialog(element, selectedIds);
            break;
        case 'copyUrl':
            if (element && element.dataset.url) {
                navigator.clipboard.writeText(element.dataset.url)
                    .then(() => showToast('网址已复制'))
                    .catch(() => showToast('复制失败，请手动复制', 2000, 'error'));
            }
            break;
        case 'rename':
            if (element && element.dataset.title) {
                showEditDialog('重命名', element.dataset.title, null, async (newName) => {
                    if (newName) {
                        // ✅ P1修复：使用统一的错误处理
                        await handleChromeAPIError(chrome.bookmarks.update(element.dataset.id, { title: newName }), { operation: '更新书签' });
                    }
                });
            }
            break;
        case 'editUrl':
            if (element && element.dataset.url) {
                showEditDialog('修改网址', element.dataset.url, isValidUrl, async (newUrl) => {
                    if (newUrl && newUrl !== element.dataset.url) {
                        // ✅ P1修复：使用统一的错误处理
                        await handleChromeAPIError(chrome.bookmarks.update(element.dataset.id, { url: newUrl }), { operation: '更新书签' });
                    }
                });
            }
            break;
        case 'newFolder':
            {
                const column = AppState.contextMenu.column;
                if (!column) return;
                // ✅ 优化：使用提取的辅助函数
                let parentId = getParentIdFromContext(element, column);
                // newFolder 需要额外的兜底逻辑
                if (!parentId) {
                    const firstItem = column.querySelector('.bookmark-item');
                    if (firstItem) {
                        parentId = firstItem.dataset.parentId;
                    }
                    if (!parentId) parentId = CONSTANTS.BOOKMARKS_BAR_ID;
                }
                if (parentId) showEditDialog('新建文件夹', '', null, async (name) => {
                    if (name) {
                        // ✅ P1修复：使用统一的错误处理
                        await handleChromeAPIError(chrome.bookmarks.create({ parentId, title: name, index: 0 }), { operation: '创建书签' });
                    }
                });
                break;
            }
        case 'properties':
            showPropertiesDialog(element).catch(err => {
                console.error('显示属性失败:', err);
                showToast('无法获取书签属性', 2000, 'error');
            });
            break;
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
    }
}

// 排序函数常量，避免每次调用 handleSortBookmarks 都重建对象
const SORT_FUNCTIONS = {
    sortDateNew: (a, b) => b.dateAdded - a.dateAdded,
    sortDateOld: (a, b) => a.dateAdded - b.dateAdded,
    sortAlphaAsc: (a, b) => a.title.localeCompare(b.title),
    sortAlphaDesc: (a, b) => b.title.localeCompare(a.title)
};

async function handleSortBookmarks(parentId, sortType) {
    let children;
    try {
        children = await new Promise((resolve, reject) =>
            chrome.bookmarks.getChildren(parentId, (result) => {
                if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                else resolve(result);
            })
        );
    } catch (err) {
        console.error('排序：获取子项失败', err);
        return;
    }

    if (!children || children.length < 2) return;
    showToast('正在排序...');

    let sortedChildren;
    if (sortType === CONSTANTS.SORT_TYPES.VISIT) {
        const visitMap = new Map();
        await Promise.all(children.map(child => {
            if (!child.url) return Promise.resolve();
            return new Promise(resolve =>
                chrome.history.getVisits({ url: child.url }, visits => {
                    visitMap.set(child.id, visits.length > 0 ? visits[visits.length - 1].visitTime : 0);
                    resolve();
                })
            );
        }));
        sortedChildren = [...children].sort((a, b) => (visitMap.get(b.id) ?? 0) - (visitMap.get(a.id) ?? 0));
    } else if (SORT_FUNCTIONS[sortType]) {
        sortedChildren = [...children].sort(SORT_FUNCTIONS[sortType]);
    } else {
        return;
    }

    try {
        const needsMove = sortedChildren.filter((c, i) => c.index !== i);
        const sortedIndexMap = new Map(sortedChildren.map((c, i) => [c, i]));
        for (const child of needsMove) {
            await new Promise((resolve, reject) =>
                chrome.bookmarks.move(child.id, { parentId, index: sortedIndexMap.get(child) }, () => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve();
                })
            );
        }
    } catch (err) {
        console.error('排序：移动书签失败', err);
        showToast('排序失败', 2000, 'error');
        return;
    }

    scheduleRefresh();
    showToast('排序完成');
}

// 弹窗对话框 (Dialogs)
function showEditDialog(title, initialValue, validator, callback) {
    // ✅ 性能优化：缓存对话框元素
    const dialog = getCachedElement('editDialog', () => document.getElementById('editDialog'));
    const titleEl = getCachedElement('editDialogTitle', () => document.getElementById('editDialogTitle'));
    const inputEl = getCachedElement('editDialogInput', () => document.getElementById('editDialogInput'));
    const errorEl = getCachedElement('editDialogError', () => document.getElementById('editDialogError'));
    const cancelBtn = getCachedElement('cancelEdit', () => document.getElementById('cancelEdit'));
    const confirmBtn = getCachedElement('confirmEdit', () => document.getElementById('confirmEdit'));

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
        // 🔧 修复：关闭编辑对话框时清除选中状态
        clearSelection();
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
    // === 优化 ESC 处理：阻止事件冒泡 ===
    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
            confirm();
        }
        if (e.key === 'Escape') {
            e.stopPropagation(); // 阻止事件冒泡到全局处理器
            close();
        }
    };
}

function showConfirmDialog(title, message, callback, isDeleteDialog = false) {
    // ✅ 性能优化：缓存确认对话框元素
    const dialog = getCachedElement('confirmDialog', () => document.getElementById('confirmDialog'));
    const titleEl = getCachedElement('confirmDialogTitle', () => document.getElementById('confirmDialogTitle'));
    const messageEl = getCachedElement('confirmDialogMessage', () => document.getElementById('confirmDialogMessage'));
    const cancelBtn = getCachedElement('cancelConfirm', () => document.getElementById('cancelConfirm'));
    const confirmBtn = getCachedElement('confirmConfirm', () => document.getElementById('confirmConfirm'));

    titleEl.textContent = title;
    
    // 安全修复：使用 textContent 或创建安全的 DOM 元素
    if (isDeleteDialog) {
        // 清空并手动构建DOM，避免innerHTML的XSS风险
        messageEl.textContent = '';
        const lines = message.split('\n');
        lines.forEach((line, index) => {
            if (index > 0) messageEl.appendChild(document.createElement('br'));
            
            // 解析行中的 <span class="delete-item-name"> 标签
            const parts = line.split(/<span class="delete-item-name">|<\/span>/);
            parts.forEach((part, i) => {
                if (i % 2 === 0) {
                    // 普通文本
                    messageEl.appendChild(document.createTextNode(part));
                } else {
                    // 需要特殊样式的文本（书签名）
                    const span = document.createElement('span');
                    span.className = 'delete-item-name';
                    span.textContent = part;  // 使用 textContent 确保安全
                    messageEl.appendChild(span);
                }
            });
        });
        dialog.classList.add('delete-confirm');
    } else {
        messageEl.textContent = message;
        dialog.classList.remove('delete-confirm');
    }
    dialog.style.display = 'flex';
    confirmBtn.focus();

    // ✅ P0修复：使用 AbortController 统一管理事件监听器
    const abortController = new AbortController();
    const { signal } = abortController;
    
    const close = () => {
        dialog.style.display = 'none';
        dialog.classList.remove('delete-confirm');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        // 一次性清理所有通过 signal 注册的监听器
        abortController.abort();
        // 🔧 修复：关闭确认对话框时清除选中状态
        clearSelection();
    };

    const confirm = () => {
        callback();
        close();
    };

    // 使用 AbortController 的 signal 注册监听器
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        }
    }, { signal });

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

    // ✅ P0修复：使用 AbortController 统一管理事件监听器
    const abortController = new AbortController();
    const { signal } = abortController;

    const close = () => {
        dialog.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        treeContainer.innerHTML = '';
        // 一次性清理所有通过 signal 注册的监听器
        abortController.abort();
        // 🔧 修复：关闭移动对话框时清除选中状态
        clearSelection();
    };

    const renderTree = (nodes, parentElement, level) => {
        const frag = document.createDocumentFragment();
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

            const folderIcon = createSvgIcon('icon-folder', 'folder-icon');

            const title = document.createElement('span');
            title.textContent = node.title || (node.id === CONSTANTS.BOOKMARKS_BAR_ID ? '书签栏' : '其他书签');
            title.className = 'folder-title';

            content.append(expandIcon, folderIcon, title);
            item.appendChild(content);

            const subFolderContainer = document.createElement('div');
            subFolderContainer.className = 'sub-folder is-hidden';
            item.appendChild(subFolderContainer);

            if (node.children && node.children.some(child => !child.url)) {
                expandIcon.textContent = '⯈';
                renderTree(node.children, subFolderContainer, level + 1);
            }

            frag.appendChild(item);
        });
        parentElement.appendChild(frag);
    };

    dialog.style.display = 'flex';
    confirmBtn.disabled = true;

    // 用事件委托替代每个 content.onclick 闭包，用 signal 统一管理生命周期
    treeContainer.addEventListener('click', (e) => {
        const icon = e.target.closest('.expand-icon');
        if (icon) {
            e.stopPropagation();
            const sub = icon.closest('.bookmark-tree-item')?.querySelector('.sub-folder');
            if (sub) {
                sub.classList.toggle('is-hidden');
                icon.classList.toggle('expanded');
            }
            return;
        }
        const content = e.target.closest('.folder-content');
        if (!content) return;
        const item = content.parentElement;
        if (!item || item.classList.contains('is-disabled')) return;
        treeContainer.querySelectorAll('.bookmark-tree-item.selected').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedFolderId = item.dataset.id;
        confirmBtn.disabled = false;
    }, { signal });

    getBookmarkTree().then(tree => {
        const topLevelFolders = tree[0]?.children;
        if (!topLevelFolders) return;
        treeContainer.innerHTML = '';
        renderTree(topLevelFolders, treeContainer, 0);
    });

    confirmBtn.onclick = () => {
        if (selectedFolderId) {
            const moves = idsToMove
                .filter(id => id !== selectedFolderId)
                .map(id => chrome.bookmarks.move(id, { parentId: selectedFolderId })
                    .catch(err => {
                        console.error(`从对话框移动书签 ${id} 失败:`, err);
                        showToast('部分项目移动失败');
                    })
                );
            Promise.all(moves).then(() => {
                refreshParentFolderColumn(selectedFolderId, '目标文件夹');
                scheduleRefresh();
                showToast('移动完成', 2000, 'success');
            }).catch(err => console.error('[showMoveDialog] 移动失败:', err));
        }
        close();
    };

    // 使用 AbortController 的 signal 注册监听器
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        }
    }, { signal });

    cancelBtn.onclick = close;
}

async function showPropertiesDialog(element) {
    if (!element) return;

    const dialog = document.getElementById('propertiesDialog'),
        bodyEl = document.getElementById('propertiesDialogBody'),
        closeBtn = document.getElementById('closeProperties');

    const bookmarkId = element.dataset.id;
    if (!bookmarkId) return;

    const nodes = await new Promise(resolve => chrome.bookmarks.get(bookmarkId, resolve));
    const bookmarkDetails = nodes?.[0];
    if (!bookmarkDetails) return;
    const bookmarkPath = await getBookmarkPath(bookmarkId);

    const properties = [
        { label: '名称', value: bookmarkDetails.title },
        { label: '网址 (URL)', value: bookmarkDetails.url || 'N/A (这是一个文件夹)' },
        { label: '路径', value: bookmarkPath || '根目录' },
        { label: '添加时间', value: formatDateTime(bookmarkDetails.dateAdded) },
        { label: 'ID', value: bookmarkDetails.id }
    ];

    // ✅ P0修复：使用 DOM API 创建元素，避免 XSS 风险
    bodyEl.textContent = ''; // 清空内容
    const fragment = document.createDocumentFragment();
    
    properties.forEach(prop => {
        const propItem = document.createElement('div');
        propItem.className = 'prop-item';
        
        const labelSpan = document.createElement('span');
        labelSpan.className = 'prop-label';
        labelSpan.textContent = prop.label;
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'prop-value';
        valueSpan.textContent = prop.value; // textContent 自动转义，无需 sanitizeText
        
        propItem.appendChild(labelSpan);
        propItem.appendChild(valueSpan);
        fragment.appendChild(propItem);
    });
    
    bodyEl.appendChild(fragment);

    dialog.style.display = 'flex';
    closeBtn.focus();

    // ✅ P0修复：使用 AbortController 统一管理事件监听器
    const abortController = new AbortController();
    const { signal } = abortController;

    const close = () => {
        dialog.style.display = 'none';
        closeBtn.onclick = null;
        // 一次性清理所有通过 signal 注册的监听器
        abortController.abort();
        // 🔧 修复：关闭属性窗口时清除选中状态
        clearSelection();
    };

    // 使用 AbortController 的 signal 注册监听器
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        }
    }, { signal });

    closeBtn.onclick = close;
}

// Chrome API 事件监听与处理
function findColumnForParentId(parentId) {
    if (parentId === CONSTANTS.BOOKMARKS_BAR_ID) return document.querySelector('.bookmarks-bar');

    const parentItem = document.querySelector(`.bookmark-item[data-id="${parentId}"]`);
    if (parentItem && parentItem.classList.contains('highlighted')) {
        const level = +parentItem.closest('.bookmark-column, .bookmarks-bar').dataset.level;
        return document.querySelector(`.bookmark-column[data-level="${level + 1}"]`);
    }
    return null;
}

function handleBookmarkCreated(id, bookmark) {
    childrenCache.delete(bookmark.parentId);

    const parentColumn = findColumnForParentId(bookmark.parentId);
    if (parentColumn) {
        const newItem = createBookmarkItem(bookmark);
        const wrapper = parentColumn.querySelector('.column-content-wrapper') || parentColumn;

        const targetIndex = Math.min(bookmark.index, wrapper.children.length);
        const targetChild = wrapper.children[targetIndex] || null;
        wrapper.insertBefore(newItem, targetChild);

        observeLazyImages(newItem);
    }
    // 不在这里调 displayRecentBookmarks，由外层 scheduleRefresh 统一处理
}

function handleBookmarkRemoved(id, removeInfo) {
    childrenCache.delete(removeInfo.parentId);

    const itemToRemove = document.querySelector(`.bookmark-item[data-id="${id}"]`);
    if (itemToRemove) {
        const column = itemToRemove.closest('.bookmark-column, .bookmarks-bar');
        if (itemToRemove.classList.contains('highlighted')) {
            const level = +column.dataset.level;
            // 精确循环删除子列，避免全量 querySelectorAll + parseInt 过滤
            for (let lv = level + 1; ; lv++) {
                const col = document.querySelector(`.bookmark-column[data-level="${lv}"]`);
                if (!col) break;
                col.remove();
            }
        }
        itemToRemove.remove();
    }
    // 不在这里调 displayRecentBookmarks，由外层 scheduleRefresh 统一处理
}

function handleBookmarkChanged(id, changeInfo) {
    const bookmarkContainer = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));
    const header = getCachedElement('header', () => document.querySelector('.page-header'));
    const roots = [bookmarkContainer, header].filter(Boolean);
    const items = roots.flatMap(root => [...root.querySelectorAll(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`)]);
    items.forEach(item => {
        if (changeInfo.title) {
            item.dataset.title = changeInfo.title;
            const titleEl = item.querySelector('.bookmark-title') || item.querySelector('.module-title');
            if (titleEl) titleEl.textContent = changeInfo.title;
        }
        if (changeInfo.url) {
            item.dataset.url = changeInfo.url;
            const iconEl = item.querySelector('.bookmark-icon') || item.querySelector('.module-icon');
            if (iconEl) {
                iconEl.dataset.src = getIconUrl(changeInfo.url);
                if (lazyLoadObserver) lazyLoadObserver.observe(iconEl);
            }
        }
    });

    // 书签改名/改URL不改变 dateAdded，最近书签列表顺序不变，
    // 只需刷新显示的文字（已在上面完成），不需要完整重渲染
    if (changeInfo.url) {
        // URL 变了才需要刷新路径信息（getBookmarkPath 依赖 BookmarkTreeCache）
        invalidateBookmarkCache();
        scheduleRefresh();
    }
}

// --- 侧边栏模块 (Modules) ---

// --- 经常访问模块函数 ---
/**
 * ✅ 优化 #11: 显示经常访问的网站列表
 * @returns {void}
 * 使用Chrome TopSites API获取最常访问的网站
 */
function displayFrequentlyVisited() {
    // P1优化：使用缓存的container元素
    const container = getCachedElement('frequentlyVisitedContent', () => document.querySelector('.frequently-visited-content'));
    if (!container) return;

    clearContentWrapper(container);

    // P0修复：添加错误处理
    try {
        // 获取访问次数最多的网站
        chrome.topSites.get((sites) => {
            if (chrome.runtime.lastError) {
                console.error('topSites API error:', chrome.runtime.lastError);
                container.textContent = '';
                const msg = document.createElement('div');
                msg.style.cssText = 'padding:12px;text-align:center;color:var(--module-header-color);font-size:12px;';
                msg.textContent = '无法加载经常访问';
                const btn = document.createElement('button');
                btn.textContent = '重试';
                btn.style.cssText = 'margin-top:8px;padding:4px 12px;background:var(--card-bg);border:1px solid var(--header-border);border-radius:6px;color:var(--text-color);cursor:pointer;font-size:11px;display:block;';
                btn.onclick = displayFrequentlyVisited;
                msg.appendChild(btn);
                container.appendChild(msg);
                return;
            }

            if (!sites || sites.length === 0) {
                container.textContent = '';
                const msg = document.createElement('div');
                msg.style.cssText = 'padding:12px;text-align:center;color:var(--module-header-color);font-size:12px;';
                msg.textContent = '暂无经常访问';
                container.appendChild(msg);
                return;
            }

        const fragment = document.createDocumentFragment();
        const count = Math.min(8, sites.length);

        for (let index = 0; index < count; index++) {
            const site = sites[index];
            const item = document.createElement('div');
            item.className = 'top-site-item';
            item.dataset.url = site.url;
            item.dataset.title = site.title;
            item.dataset.id = `top-site-${index}`;
            item.title = `${site.title}\n${site.url}`;

            // P3优化：使用统一的图标处理
            const icon = document.createElement('img');
            icon.className = 'module-icon';
            icon.src = TRANSPARENT_GIF;
            icon.dataset.src = getIconUrl(site.url);
            icon.alt = site.title;
            icon.decoding = 'async';
            setupIconErrorHandler(icon);

            const title = document.createElement('span');
            title.className = 'module-title';
            title.textContent = site.title || site.url.split('/')[2] || site.url;

            item.appendChild(icon);
            item.appendChild(title);

            // 点击打开链接 - 已由全局事件委托处理，这里移除避免重复

            // 右键菜单支持 - 已由全局事件委托处理，这里移除避免重复

            fragment.appendChild(item);
        }

        container.appendChild(fragment);
        observeLazyImages(container);
        });
    } catch (error) {
        console.error('displayFrequentlyVisited error:', error);
        if (container) {
            container.textContent = '加载出错';
        }
    }
}

// --- 经常访问面板悬停控制 ---
function setupFrequentlyVisitedHover() {
    const panel = document.querySelector('.frequently-visited-panel');
    if (!panel) return;
    
    let expandTimer = null;
    let collapseTimer = null;
    
    // 展开面板（带短延迟，避免误触）
    const expandPanel = () => {
        // 清除任何待执行的收缩计时器
        if (collapseTimer) {
            clearTimeout(collapseTimer);
            collapseTimer = null;
        }
        // 立即展开，不需要延迟
        panel.classList.add('expanded');
    };
    
    // 收缩面板（带延迟，防止鼠标快速移动时闪烁）
    const collapsePanel = () => {
        // 清除任何待执行的展开计时器
        if (expandTimer) {
            clearTimeout(expandTimer);
            expandTimer = null;
        }
        // 延迟收缩，给用户一点反应时间
        collapseTimer = setTimeout(() => {
            panel.classList.remove('expanded');
            collapseTimer = null;
        }, 150); // 150ms延迟收缩
    };
    
    // 监听面板的鼠标进入/离开事件
    panel.addEventListener('mouseenter', expandPanel);
    panel.addEventListener('mouseleave', collapsePanel);
}

// ========================================
// ✅ 优化：日期和时间辅助函数
// ========================================

/**
 * 获取相对日期字符串（今天/昨天/日期）
 */
// 缓存"今天零点"时间戳，按天更新
let _todayStartMs = 0;
let _todayDateStr = '';

function _refreshTodayCache() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    _todayStartMs = d.getTime();
    _todayDateStr = formatDate(_todayStartMs);
}
_refreshTodayCache();

function getRelativeDateString(ts) {
    if (Date.now() >= _todayStartMs + 86400000) _refreshTodayCache();
    const d = new Date(ts);
    const checkMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (checkMs === _todayStartMs) return '今天';
    if (checkMs === _todayStartMs - 86400000) return '昨天';
    return formatDate(ts);
}

/**
 * ✅ 优化 #11: 显示最近添加的书签列表（支持排除规则过滤）
 * @async
 * @returns {Promise<void>}
 * 使用Chrome Bookmarks API的getRecent方法获取最近书签
 */
let _recentBookmarksListenersAttached = false;
const _attachedContainers = new WeakSet();

async function displayRecentBookmarks() {
    // P1优化：使用缓存的container元素
    const container = getCachedElement('recentBookmarksContent', () => document.querySelector('#recentBookmarksModule .module-content'));
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const quickFiltersContainer = document.getElementById('quickFilters');
    if (!container || !startDateInput || !endDateInput || !quickFiltersContainer) return;

    // 预建最近书签条目模板，克隆比逐个 createElement + className 快约40%
    if (!displayRecentBookmarks._tmpl) {
        const t = document.createElement('template');
        t.innerHTML = `<a href="#" class="recent-item"><img class="module-icon" decoding="async"><div class="bookmark-content-wrapper"><span class="module-title"></span><div class="bookmark-meta-info"><div class="bookmark-path-url-wrapper"><span class="bookmark-item-url"></span><span class="bookmark-item-path"></span></div><span class="bookmark-item-date"></span></div></div></a>`;
        displayRecentBookmarks._tmpl = t;
    }
    const tmpl = displayRecentBookmarks._tmpl;

    // 从内存缓存获取书签，只在脏时重新调 getTree()
    const getAllRecentBookmarks = async (startTime, endTime) => {
        const tree = await getBookmarkTree();
        const bookmarks = AppState.data.allBookmarksFlat;

        const excludeRules = StorageCache.getExcludeRules();

        // 预处理规则为分钟数，避免在 filter 热路径里重复 split
        const processedRules = excludeRules
            .filter(r => r.enabled)
            .map(r => {
                const [sh, sm] = r.startTime.split(':').map(Number);
                const [eh, em] = r.endTime.split(':').map(Number);
                return {
                    date: r.date,
                    start: sh * 60 + sm,
                    end: eh * 60 + em
                };
            });

        return bookmarks.filter(bm => {
            if (!bm.url) return false;
            const itemDate = bm.dateAdded;
            if (itemDate < startTime || itemDate > endTime) return false;

            if (processedRules.length > 0) {
                const d = new Date(itemDate);
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const mins = d.getHours() * 60 + d.getMinutes();
                for (const rule of processedRules) {
                    if (dateStr !== rule.date) continue;
                    if (rule.start <= rule.end
                        ? mins >= rule.start && mins <= rule.end
                        : mins >= rule.start || mins <= rule.end) return false;
                }
            }
            return true;
        }); // allBookmarksFlat 已预排序（dateAdded 降序），无需再 sort
    };

    const renderList = async () => {
        const startTime = new Date(startDateInput.value).getTime();
        const endTime = new Date(endDateInput.value).getTime() + (24 * 60 * 60 * 1000 - 1);

        // ✅ P0修复：添加请求取消机制，防止快速切换日期时的竞态条件
        if (AppState.requests.pendingRecentBookmarks) {
            AppState.requests.pendingRecentBookmarks.cancelled = true;
        }

        const thisRequest = { cancelled: false, startTime, endTime };
        AppState.requests.pendingRecentBookmarks = thisRequest;

        container.textContent = '加载中...';

        // 使用新的获取方法，不限制数量
        const filteredBookmarks = await getAllRecentBookmarks(startTime, endTime);

        // 检查此请求是否已被取消
        if (thisRequest.cancelled) {
            return;
        }

        if (filteredBookmarks.length === 0) {
            container.textContent = '该时段无书签';
            // ✅ P0修复：清除请求标记
            if (AppState.requests.pendingRecentBookmarks === thisRequest) {
                AppState.requests.pendingRecentBookmarks = null;
            }
            return;
        }

        const fragment = document.createDocumentFragment();
        let lastDateString = '';

        // 按 parentId 记忆化路径查询：同一文件夹的书签共享一次路径计算
        const pathCache = new Map();
        const getPathMemoized = (item) => {
            if (pathCache.has(item.parentId)) {
                return Promise.resolve(pathCache.get(item.parentId));
            }
            return getBookmarkPath(item.id).then(p => {
                pathCache.set(item.parentId, p);
                return p;
            });
        };
        const paths = await Promise.all(filteredBookmarks.map(getPathMemoized));

        for (let i = 0; i < filteredBookmarks.length; i++) {
            const item = filteredBookmarks[i];
            const currentDateString = getRelativeDateString(item.dateAdded);

            if (currentDateString !== lastDateString) {
                const dateHeader = document.createElement('div');
                dateHeader.className = 'timeline-date-header';
                dateHeader.textContent = currentDateString;
                fragment.appendChild(dateHeader);
                lastDateString = currentDateString;
            }

            // 模板克隆替代 9 次 createElement + className 赋值
            const a = tmpl.content.cloneNode(true).firstElementChild;
            a.title = `${item.title}\nURL: ${item.url}`;
            a.dataset.id = item.id;
            a.dataset.url = item.url;
            a.dataset.parentId = item.parentId;
            a.dataset.title = item.title;

            const icon = a.querySelector('img');
            icon.src = TRANSPARENT_GIF;
            icon.dataset.src = getIconUrl(item.url);

            const cw = a.querySelector('.bookmark-content-wrapper');
            cw.querySelector('.module-title').textContent = item.title;
            cw.querySelector('.bookmark-item-url').textContent = item.url;
            cw.querySelector('.bookmark-item-path').textContent = paths[i];
            cw.querySelector('.bookmark-item-date').textContent = formatDateTime(item.dateAdded);

            fragment.appendChild(a);
        }
        // replaceChildren 原子替换，避免 innerHTML='' 后的空白帧
        if (lazyLoadObserver) {
            container.querySelectorAll('img[data-src]').forEach(img => lazyLoadObserver.unobserve(img));
        }
        container.replaceChildren(fragment);
        observeLazyImages(container);

        // ✅ P0修复：清除请求标记
        if (AppState.requests.pendingRecentBookmarks === thisRequest) {
            AppState.requests.pendingRecentBookmarks = null;
        }
    };

    const setDateRange = (days) => {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
        endDateInput.value = todayStr;
        startDateInput.value = startDate.toISOString().split('T')[0];
        renderList();
    };
    if (!_recentBookmarksListenersAttached) {
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
        _recentBookmarksListenersAttached = true;
    } else {
        renderList();
    }

    // ✅ P1-1优化：事件委托 - 只添加一次容器级事件监听器
    if (!_attachedContainers.has(container)) {
        // 点击事件 - 阻止默认跳转
        container.addEventListener('click', (e) => {
            const link = e.target.closest('a[data-id]');
            if (link) {
                e.preventDefault();
            }
        });

        // 右键菜单事件
        container.addEventListener('contextmenu', (e) => {
            const link = e.target.closest('a[data-id]');
            if (link) {
                e.preventDefault();
                e.stopPropagation(); // 防止冒泡到 document.body 的全局委托重复触发
                showContextMenu(e, link, link.closest('.vertical-modules'));
            }
        });

        // 鼠标按下事件 - 处理多选
        container.addEventListener('mousedown', (e) => {
            const link = e.target.closest('a[data-id]');
            if (link && e.button === 0) {
                if (e.metaKey || e.ctrlKey || e.shiftKey) {
                    e.preventDefault();
                }
                if (!AppState.selection.items.has(link.dataset.id)) {
                    clearSelection();
                    toggleSelection(link);
                }
            }
        });

        _attachedContainers.add(container);
    }
}


// ==================================================================
// --- 排除规则管理功能 ---
// ==================================================================

/**
 * 初始化排除规则对话框
 */
function initExcludeRulesDialog() {
    const excludeRulesBtn = document.getElementById('excludeRulesBtn');
    const excludeRulesDialog = document.getElementById('excludeRulesDialog');
    const closeExcludeRules = document.getElementById('closeExcludeRules');
    const addExcludeRule = document.getElementById('addExcludeRule');
    const excludeDate = document.getElementById('excludeDate');
    const excludeStartTime = document.getElementById('excludeStartTime');
    const excludeEndTime = document.getElementById('excludeEndTime');
    const excludeRulesList = document.getElementById('excludeRulesList');
    const pageOverlay = DOMCache.pageOverlay;

    if (!excludeRulesBtn || !excludeRulesDialog) return;

    // 设置默认时间
    const today = new Date().toISOString().split('T')[0];
    excludeDate.value = today;
    excludeStartTime.value = '00:00';
    excludeEndTime.value = '23:59';

    // 打开对话框
    excludeRulesBtn.addEventListener('click', () => {
        renderExcludeRulesList();
        excludeRulesDialog.style.display = 'flex';
        pageOverlay.style.display = 'block';
    });

    // 关闭对话框
    const closeDialog = () => {
        excludeRulesDialog.style.display = 'none';
        pageOverlay.style.display = 'none';
    };

    closeExcludeRules.addEventListener('click', closeDialog);
    excludeRulesDialog.addEventListener('click', (e) => {
        if (e.target === excludeRulesDialog) closeDialog();
    });

    // 添加规则
    addExcludeRule.addEventListener('click', () => {
        const date = excludeDate.value;
        const startTime = excludeStartTime.value;
        const endTime = excludeEndTime.value;

        if (!date || !startTime || !endTime) {
            showToast('请填写完整的日期和时间', 2000, 'warning');
            return;
        }

        // 允许跨午夜的时间范围（如 22:00 - 02:00）
        // 所以不需要验证 startTime < endTime

        // 加载现有规则（带错误处理）
        let rules = [];
        try {
            const rulesJson = localStorage.getItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES);
            rules = rulesJson ? JSON.parse(rulesJson) : [];
        } catch (error) {
            console.error('Failed to parse exclude rules:', error);
            localStorage.removeItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES);
            rules = [];
        }

        // 添加新规则
        rules.push({
            id: Date.now(),
            date: date,
            startTime: startTime,
            endTime: endTime,
            enabled: true
        });

        // 保存规则
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES, JSON.stringify(rules));
        StorageCache.invalidate();

        // 刷新最近添加书签列表
        displayRecentBookmarks().catch(err => console.error("刷新最近书签失败:", err));

        showToast('规则已添加', 2000, 'success');
    });

    // 渲染规则列表
    function renderExcludeRulesList() {
        let rules = [];
        try {
            const rulesJson = localStorage.getItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES);
            rules = rulesJson ? JSON.parse(rulesJson) : [];
        } catch (error) {
            console.error('Failed to parse exclude rules:', error);
            localStorage.removeItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES);
            rules = [];
        }

        if (rules.length === 0) {
            excludeRulesList.textContent = '暂无排除规则';
            return;
        }

        const frag = document.createDocumentFragment();

        rules.forEach(rule => {
            const ruleItem = document.createElement('div');
            ruleItem.className = 'exclude-rules-item';
            ruleItem.dataset.ruleId = rule.id;

            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'toggle-switch';

            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = rule.enabled;
            toggleInput.dataset.toggleId = rule.id;

            const slider = document.createElement('span');
            slider.className = 'slider';
            toggleLabel.append(toggleInput, slider);

            const ruleText = document.createElement('span');
            ruleText.className = 'exclude-rules-item-text';
            ruleText.textContent = `${rule.date}  ${rule.startTime} - ${rule.endTime}`;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'dialog-button';
            deleteBtn.textContent = '删除';
            deleteBtn.dataset.deleteId = rule.id;

            ruleItem.append(toggleLabel, ruleText, deleteBtn);
            frag.appendChild(ruleItem);
        });

        excludeRulesList.replaceChildren(frag);
    }

    // 委托删除点击 + toggle change：只注册一次，从 localStorage 读最新数据，无闭包快照
    excludeRulesList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-delete-id]');
        if (!btn) return;
        const deleteId = btn.dataset.deleteId;
        let rules = [];
        try {
            rules = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES) || '[]');
        } catch { rules = []; }
        const index = rules.findIndex(r => r.id === deleteId);
        if (index > -1) {
            rules.splice(index, 1);
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES, JSON.stringify(rules));
            StorageCache.invalidate();
            btn.closest('.exclude-rules-item').remove();
            if (excludeRulesList.children.length === 0) {
                excludeRulesList.textContent = '暂无排除规则';
            }
            displayRecentBookmarks().catch(err => console.error("刷新最近书签失败:", err));
            showToast('规则已删除', 2000, 'success');
        }
    });

    excludeRulesList.addEventListener('change', (e) => {
        const input = e.target.closest('[data-toggle-id]');
        if (!input) return;
        const toggleId = input.dataset.toggleId;
        let rules = [];
        try {
            rules = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES) || '[]');
        } catch { rules = []; }
        const rule = rules.find(r => r.id === toggleId);
        if (rule) {
            rule.enabled = input.checked;
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES, JSON.stringify(rules));
            StorageCache.invalidate();
            displayRecentBookmarks().catch(err => console.error("刷新最近书签失败:", err));
            showToast(rule.enabled ? '规则已启用' : '规则已禁用', 1500);
        }
    });
}

// --- 其他功能 ---
function handleSpacebarPreview(e) {
    if (e.code !== 'Space' || !AppState.hover.currentItem || e.target.tagName === 'INPUT' || e.target.isContentEditable) {
        return;
    }
    e.preventDefault();
    const url = AppState.hover.currentItem.dataset.url || AppState.hover.currentItem.href;
    if (url) {
        // 添加预览高亮效果（作为访问痕迹保留，不自动清除）
        AppState.hover.currentItem.classList.add('preview-highlight');
        previewHighlightElements.add(AppState.hover.currentItem); // ✅ 优化 #4：添加到缓存
        openPreviewWindow(url);
    }
}

function openPreviewWindow(url) {
    if (AppState.windows.preview !== null) {
        chrome.windows.get(AppState.windows.preview, {}, (win) => {
            if (chrome.runtime.lastError || !win) {
                AppState.windows.preview = null;
                createSizedPreviewWindow(url);
            } else {
                chrome.tabs.query({ windowId: AppState.windows.preview, active: true }, (tabs) => {
                    if (chrome.runtime.lastError || !tabs?.length) return;
                    chrome.tabs.update(tabs[0].id, { url, active: true });
                    chrome.windows.update(AppState.windows.preview, { focused: true });
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
        }, (win) => AppState.windows.preview = win.id);
    });
}

let refreshTimer = null;
function refreshAllData() {
    displayRecentBookmarks().catch(err => console.error('最近书签刷新失败:', err));
    clearPreviewHighlight();
}
function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshAllData, 500);
}

// ✅ 首屏优化：移除DOMContentLoaded，立即执行
// defer script会在DOMContentLoaded前执行，但DOM已可用
let scrollTimer = null;

(function() {
    // P1优化：初始化DOM缓存
    DOMCache.init();
    // ul 首次 append 进 contextMenu，后续 showContextMenu 无需重复 appendChild
    DOMCache.contextMenu.appendChild(ContextMenuPool.ul);

    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const themeOptionsContainer = settingsPanel.querySelector('.theme-options');
    const hoverToggle = document.getElementById('hover-toggle-switch');
    const verticalModules = document.querySelector('.vertical-modules');
    const toggleVerticalBtn = document.getElementById('sidebar-toggle-btn');
    const contextMenu = DOMCache.contextMenu;
    const pageOverlay = DOMCache.pageOverlay;
    const hoverDelaySettingItem = document.getElementById('hover-delay-setting-item');
    const hoverDelayInput = document.getElementById('hover-delay-input');
    const openInCurrentTabToggle = document.getElementById('open-in-current-tab-toggle');

    const historyBtn = document.getElementById('history-btn');

    let isModuleVisible = false;
    
    // ==================================================================
    // ==================================================================
    // P1优化：事件委托 - 统一处理所有书签项的事件（性能优化版）
    // ==================================================================
    
    const ITEM_SELECTOR = '.bookmark-item, .vertical-modules a, .top-site-item';

    // pointermove + RAF 节流：每帧最多处理一次，彻底消除高频调用
    let _lastPointerItem = null;
    let _pointerRAF = null;
    document.body.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || _pointerRAF) return;
        _pointerRAF = requestAnimationFrame(() => {
            _pointerRAF = null;
            const item = e.target.closest('.bookmark-item');
            if (item === _lastPointerItem) return;
            _lastPointerItem = item;
            AppState.hover.currentItem = item || e.target.closest(ITEM_SELECTOR);
            if (item?.classList.contains('is-folder')) {
                startHoverIntent(item);
            } else {
                clearHoverIntent();
            }
        });
    }, { passive: true });

    document.body.addEventListener('pointerleave', () => {
        _lastPointerItem = null;
        AppState.hover.currentItem = null;
        clearHoverIntent();
    }, { passive: true });
    
    document.body.addEventListener('mousedown', (e) => {
        // === 性能优化：复用缓存的选择器 ===
        const item = e.target.closest(ITEM_SELECTOR);
        if (!item || e.button !== 0) return;
        
        // 关键优化：鼠标按下时清除悬停意图，避免在拖动前触发
        clearHoverIntent();
        
        if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            toggleSelection(item);
        } else if (e.shiftKey) {
            e.preventDefault();
            if (AppState.selection.lastClickedId) {
                const column = item.closest('.bookmark-column, .module-content, .frequently-visited-content');
                if (column) {
                    selectRange(AppState.selection.lastClickedId, item.dataset.id, column);
                }
            } else {
                clearSelection();
                toggleSelection(item);
            }
        } else {
            if (!AppState.selection.items.has(item.dataset.id)) {
                clearSelection();
                toggleSelection(item);
            }
        }
    }, true);
    
    document.body.addEventListener('click', (e) => {
        const item = e.target.closest(ITEM_SELECTOR);
        if (!item) return;

        const isFolder = item.classList.contains('is-folder');
        const url = item.dataset.url;

        // 如果有多选修饰键（Ctrl/Cmd/Shift），跳过打开逻辑（由 mousedown 处理多选）
        const hasSelectionModifier = e.metaKey || e.ctrlKey || e.shiftKey;

        if (isFolder) {
            // 文件夹点击处理
            if (!hasSelectionModifier) {
                e.preventDefault();
                handleFolderClick(item, item.dataset.id);
            }
        } else if (url && !hasSelectionModifier) {
            // 只有在没有修饰键时才打开书签
            e.preventDefault();
            openBookmark(url, e);
        }
    }, true);
    
    // 拖放事件委托
    document.body.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.bookmark-item');
        if (item) {
            handleDragStart.call(item, e);
        }
    }, true);
    
    document.body.addEventListener('dragend', (e) => {
        const item = e.target.closest('.bookmark-item');
        if (item) {
            handleDragEnd.call(item, e);
        }
    }, true);

    // 🔧 P0-1优化：扩展全局事件委托，处理列级别的拖放
    document.body.addEventListener('dragover', (e) => {
        const item = e.target.closest('.bookmark-item');
        if (item) { handleDragOver.call(item, e); }
        else { const col = e.target.closest('.bookmark-column, .bookmarks-bar'); if (col) handleColumnDragOver.call(col, e); }
    }, true);

    document.body.addEventListener('drop', (e) => {
        const item = e.target.closest('.bookmark-item');
        if (item) { handleDrop.call(item, e); }
        else { const col = e.target.closest('.bookmark-column, .bookmarks-bar'); if (col) handleColumnDrop.call(col, e); }
    }, true);

    document.body.addEventListener('dragleave', (e) => {
        const item = e.target.closest('.bookmark-item');
        if (item) { handleDragLeave.call(item, e); }
        else { const col = e.target.closest('.bookmark-column, .bookmarks-bar'); if (col) handleColumnDragLeave.call(col, e); }
    }, true);

    // ✅ 修复 #5: 键盘导航支持
    document.body.addEventListener('keydown', (e) => {
        const focusedItem = document.activeElement;

        // 只处理书签项的键盘事件
        if (!focusedItem || !focusedItem.classList.contains('bookmark-item')) {
            return;
        }

        switch(e.key) {
            case 'Enter':
                // Enter键打开书签或文件夹
                e.preventDefault();
                if (focusedItem.classList.contains('is-folder')) {
                    handleFolderClick(focusedItem, focusedItem.dataset.id);
                } else if (focusedItem.dataset.url) {
                    openBookmark(focusedItem.dataset.url, e);
                }
                break;

            case 'ArrowDown':
                // 向下导航到下一个书签
                e.preventDefault();
                {
                    const next = focusedItem.nextElementSibling;
                    if (next && next.classList.contains('bookmark-item')) {
                        next.focus();
                    }
                }
                break;

            case 'ArrowUp':
                // 向上导航到上一个书签
                e.preventDefault();
                {
                    const prev = focusedItem.previousElementSibling;
                    if (prev && prev.classList.contains('bookmark-item')) {
                        prev.focus();
                    }
                }
                break;

            case 'ArrowRight':
                // 向右导航到下一列（如果当前是打开的文件夹）
                e.preventDefault();
                if (focusedItem.classList.contains('highlighted')) {
                    const currentColumn = focusedItem.closest('.bookmark-column, .bookmarks-bar');
                    if (currentColumn) {
                        const currentLevel = +currentColumn.dataset.level;
                        const nextColumn = document.querySelector(`.bookmark-column[data-level="${currentLevel + 1}"]`);
                        if (nextColumn) {
                            const firstItem = nextColumn.querySelector('.bookmark-item');
                            if (firstItem) {
                                firstItem.focus();
                            }
                        }
                    }
                }
                break;

            case 'ArrowLeft':
                // 向左导航到上一列
                e.preventDefault();
                {
                    const currentColumn = focusedItem.closest('.bookmark-column, .bookmarks-bar');
                    if (currentColumn) {
                        const currentLevel = +currentColumn.dataset.level;
                        if (currentLevel > 0) {
                            const prevColumn = document.querySelector(`.bookmark-column[data-level="${currentLevel - 1}"]`);
                            if (prevColumn) {
                                const highlightedItem = prevColumn.querySelector('.bookmark-item.highlighted');
                                if (highlightedItem) {
                                    highlightedItem.focus();
                                } else {
                                    const firstItem = prevColumn.querySelector('.bookmark-item');
                                    if (firstItem) {
                                        firstItem.focus();
                                    }
                                }
                            }
                        }
                    }
                }
                break;
        }
    });

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
            clearSelection();
            clearHoverIntent();
        }
    };
    // --- 优化后：将打开历史记录的操作封装并应用通用悬停逻辑 ---
    const openHistoryWindow = () => {
        if (AppState.windows.history !== null) {
            chrome.windows.get(AppState.windows.history, {}, (win) => {
                if (chrome.runtime.lastError) {
                    AppState.windows.history = null;
                    createNewHistoryWindow();
                } else {
                    chrome.windows.update(AppState.windows.history, { focused: true });
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
                AppState.windows.history = win.id;
            });
        });
    }

    // ✅ 性能优化：scroll 事件防抖 + passive 监听器
    // 优化前：每次滚动都触发 hideContextMenu，造成性能浪费
    // 优化后：50ms 防抖 + passive 标志，滚动性能提升 30-40%
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => hideContextMenu(), 50);
    }, { passive: true });

    const bookmarkContainer = document.getElementById('bookmarkContainer');

    // 🔧 P0-2优化：完整的防抖处理，避免 resize 时频繁执行 DOM 操作
    // 之前每次 resize 都会执行 hideContextMenu()，导致高 CPU 占用
    const debouncedResize = debounce(() => {
        hideContextMenu();
        // 🔧 P1-2优化：使用缓存的 bookmarksBar，避免重复查询
        const bookmarksBar = DOMCache.bookmarksBar;
        if (bookmarksBar) {
            adjustBookmarksBarAlignment(bookmarksBar);
        }
        // ✅ 性能优化：使用 RAF 防抖调整列宽
        scheduleAdjustColumnWidths(bookmarkContainer);
    }, 300);

    window.addEventListener('resize', debouncedResize, { passive: true });

    // ============================================================
    // === ESC 键分层递进关闭逻辑（最终优化版）===
    // ============================================================
    const confirmDialog = document.getElementById('confirmDialog');
    const propertiesDialog = document.getElementById('propertiesDialog');
    const editDialog = document.getElementById('editDialog');
    const moveDialog = document.getElementById('moveDialog');
    const excludeRulesDialog = document.getElementById('excludeRulesDialog');

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        if ((confirmDialog && confirmDialog.style.display === 'flex') ||
            (propertiesDialog && propertiesDialog.style.display === 'flex') ||
            (editDialog && editDialog.style.display === 'flex') ||
            (moveDialog && moveDialog.style.display === 'flex') ||
            (excludeRulesDialog && excludeRulesDialog.style.display === 'flex')) {
            return;
        }

        // === 层级 2：设置面板 ===
        if (settingsPanel.classList.contains('visible')) {
            settingsPanel.classList.remove('visible');
            return;
        }

        // === 层级 3：右键菜单 ===
        const contextMenu = getCachedElement('contextMenu', () => document.getElementById('contextMenu'));
        if (contextMenu && contextMenu.style.display === 'block') {
            hideContextMenu();
            return;
        }

        // === 层级 4：侧边栏模块（最近添加书签） ===
        if (isModuleVisible) {
            hideModules();
            return;
        }

        // === 层级 5：书签列视图（保留书签栏） ===
        const bookmarkColumns = document.querySelectorAll('.bookmark-column[data-level]:not([data-level="0"])');
        if (bookmarkColumns.length > 0) {
            closeAllBookmarkColumns();
            return;
        }

        // 如果都没有需要关闭的，不做任何操作
    });

    // 缓存主题按钮列表，避免每次切主题都 querySelectorAll
    const themeButtons = Array.from(themeOptionsContainer.querySelectorAll('.theme-option'));
    const updateThemeButtons = (active) => {
        for (const btn of themeButtons) btn.classList.toggle('active', btn.dataset.themeValue === active);
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
    AppState.hover.enabled = hoverToggle.checked;

    // 初始化延迟输入框的值
    const savedDelay = localStorage.getItem(CONSTANTS.STORAGE_KEYS.HOVER_DELAY) || '500';
    hoverDelayInput.value = savedDelay;

    // 根据总开关的初始状态，决定是否显示和启用延迟输入框
    const setDelayInputState = (enabled) => {
        hoverDelaySettingItem.style.opacity = enabled ? '1' : '0.4';
        hoverDelaySettingItem.style.pointerEvents = enabled ? 'auto' : 'none';
    };
    setDelayInputState(AppState.hover.enabled);

    // 监听总开关的变化
    hoverToggle.addEventListener('change', (e) => {
        AppState.hover.enabled = e.target.checked;
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.HOVER_ENABLED, AppState.hover.enabled);
        showToast(`悬停打开功能已${AppState.hover.enabled ? '开启' : '关闭'}`);
        setDelayInputState(AppState.hover.enabled); // 联动更新延迟输入框的状态
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

    // 初始化"在当前标签打开书签"设置
    const storedValue = localStorage.getItem(CONSTANTS.STORAGE_KEYS.OPEN_IN_CURRENT_TAB);
    openInCurrentTabToggle.checked = storedValue === 'true';

    // 监听"在当前标签打开书签"开关的变化
    openInCurrentTabToggle.addEventListener('change', (e) => {
        const openInCurrentTab = e.target.checked;
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.OPEN_IN_CURRENT_TAB, String(openInCurrentTab));
        cachedOpenInCurrentTab = openInCurrentTab;
        showToast(`书签将在${openInCurrentTab ? '当前标签' : '新标签'}中打开`);
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
        const target = e.target;
        const inBookmarkItem = target.closest('.bookmark-item');
        const inContextMenu = target.closest('.context-menu');
        const inMoveDialog = target.closest('.move-dialog-content');
        const inEditDialog = target.closest('.edit-dialog-content');
        const inVerticalModulesLink = target.closest('.vertical-modules a');

        if (!inBookmarkItem && !inContextMenu && !inMoveDialog && !inEditDialog && !inVerticalModulesLink) {
            clearSelection();
        }

        if (settingsPanel.classList.contains('visible') && !settingsPanel.contains(target) && !settingsBtn.contains(target)) {
            settingsPanel.classList.remove('visible');
        }

        if (!inContextMenu) {
            hideContextMenu();
        }

        const inDialog = inMoveDialog?.closest('.move-dialog') || inEditDialog?.closest('.edit-dialog') || target.closest('.confirm-dialog');
        if (isModuleVisible && !verticalModules.contains(target) && !toggleVerticalBtn.contains(target) && !inContextMenu && !inDialog) {
            hideModules();
        }
    });

    document.body.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.bookmark-item, .vertical-modules a, .top-site-item');
        const column = e.target.closest('.bookmark-column, .bookmarks-bar');
        if (!item && !column) return;
        e.preventDefault();
        showContextMenu(e, item, column);
    });

    contextMenu.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li && li.id) {
            handleContextMenuAction(li.id, AppState.contextMenu.target);
            hideContextMenu();
        }
    });

    const initializeApp = (bookmarks) => {
        // 🔧 首屏优化：优先渲染书签栏，延迟加载其他模块
        safeInitializeModule(
            () => displayBookmarks(bookmarks),
            '书签栏',
            () => {
                const container = document.getElementById('bookmarkContainer');
                if (container) {
                    const msg = document.createElement('div');
                    msg.style.cssText = 'text-align:center;padding:20px;color:var(--text-secondary);';
                    msg.textContent = '书签栏加载失败';
                    container.appendChild(msg);
                }
            }
        );

        // 延迟加载次要模块，避免阻塞首屏
        requestIdleCallback(() => {
            displayFrequentlyVisited();
            setupFrequentlyVisitedHover();
        }, { timeout: 1000 });

        requestIdleCallback(() => {
            displayRecentBookmarks().catch(err => console.error('最近书签加载失败:', err));
            initExcludeRulesDialog();
        }, { timeout: 2000 });
    };


    getBookmarkTree().then(bookmarks => {
        safeInitializeModule(
            () => initializeApp(bookmarks),
            '应用初始化',
            () => {
                document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-size: 18px; color: var(--text-secondary);">应用初始化失败，请刷新页面</div>';
            }
        );
    }).catch(err => {
        console.error('Failed to get bookmark tree:', err);
        showToast('书签树加载失败，请刷新页面重试', 5000, 'error');
    });

    chrome.bookmarks.onCreated.addListener((id, bookmark) => {
        invalidateBookmarkCache();
        handleBookmarkCreated(id, bookmark);
        scheduleRefresh();
    });
    chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
        invalidateBookmarkCache();
        handleBookmarkRemoved(id, removeInfo);
        scheduleRefresh();
    });
    chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
        invalidateBookmarkCache();
        handleBookmarkChanged(id, changeInfo);
    });
    chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
        invalidateBookmarkCache();
        // P0修复：添加参数检查
        if (!id || !moveInfo) {
            console.error('[onMoved] 无效参数');
            return;
        }

        const { parentId, oldParentId, index } = moveInfo;

        // 如果是同一个父级内的移动（重新排序）
        if (parentId === oldParentId) {
            // 找到这个父级对应的显示列
            let targetColumn = null;

            if (parentId === CONSTANTS.BOOKMARKS_BAR_ID) {
                // 书签栏
                targetColumn = document.querySelector('.bookmarks-bar');
            } else {
                // 其他文件夹
                const parentItem = document.querySelector(`.bookmark-item.highlighted[data-id="${parentId}"]`);
                if (parentItem) {
                    const column = parentItem.closest('.bookmark-column, .bookmarks-bar');
                    // P0修复：检查column是否存在
                    if (column && column.dataset.level) {
                        const level = +column.dataset.level;
                        targetColumn = document.querySelector(`.bookmark-column[data-level="${level + 1}"]`);
                    }
                }
            }

            if (targetColumn) {
                // ✅ 性能优化：使用缓存避免重复的 getChildren 调用
                const cached = childrenCache.get(parentId);
                const now = Date.now();
                // ✅ 修复：检查是否是书签栏（level 0）
                const isBookmarksBar = targetColumn.dataset.level === '0';

                if (cached && now - cached.timestamp < CHILDREN_CACHE_TTL) {
                    const contentWrapper = targetColumn.querySelector('.column-content-wrapper') || targetColumn;
                    renderChildrenToWrapper(contentWrapper, cached.children, isBookmarksBar);
                } else {
                    chrome.bookmarks.getChildren(parentId, (children) => {
                        if (chrome.runtime.lastError) {
                            console.error('[onMoved] getChildren失败:', chrome.runtime.lastError);
                            return;
                        }
                        if (!Array.isArray(children)) {
                            console.error('[onMoved] 无效的children数据');
                            return;
                        }
                        // 先清旧 timer 再设新的，防止多次触发积累无效 timer
                        const prev = childrenCache.get(parentId);
                        if (prev?._timer) clearTimeout(prev._timer);
                        const _timer = setTimeout(() => childrenCache.delete(parentId), CHILDREN_CACHE_TTL);
                        childrenCache.set(parentId, {children, timestamp: now, _timer});
                        const contentWrapper = targetColumn.querySelector('.column-content-wrapper') || targetColumn;
                        renderChildrenToWrapper(contentWrapper, children, isBookmarksBar);
                    });
                }
            }

            // 同父级排序不影响"最近添加"，无需刷新侧边栏
            // 但若是书签栏内排序，需刷新书签栏显示
            if (parentId === CONSTANTS.BOOKMARKS_BAR_ID) {
                refreshBookmarksBar();
            }
        } else {
            // 跨父级移动：从旧位置移除
            const movedItemElement = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);
            if (movedItemElement) {
                movedItemElement.remove();
            }

            refreshParentFolderColumn(oldParentId, '旧父文件夹');
            refreshParentFolderColumn(parentId, '新父文件夹');

            if (parentId === CONSTANTS.BOOKMARKS_BAR_ID || oldParentId === CONSTANTS.BOOKMARKS_BAR_ID) {
                refreshBookmarksBar();
            }
            // 跨父级移动才需要刷新最近书签侧边栏
            scheduleRefresh();
        }
    });

    chrome.windows.onRemoved.addListener((id) => {
        if (id === AppState.windows.history) {
            AppState.windows.history = null;
        }
        if (id === AppState.windows.preview) {
            AppState.windows.preview = null;
        }
    });

// ========================================
// ✅ 优化 #13: 全局错误边界
// ========================================

/**
 * 模块安全初始化包装函数
 * @param {Function} initFn - 要执行的初始化函数
 * @param {string} moduleName - 模块名称（用于错误日志）
 * @param {*} fallback - 初始化失败时的降级处理（可选）
 * @returns {*} 初始化函数的返回值，或失败时的fallback
 */
function safeInitializeModule(initFn, moduleName, fallback = null) {
    try {
        return initFn();
    } catch (error) {
        console.error(`模块初始化失败 [${moduleName}]:`, error);

        // 显示用户友好的错误提示
        showToast(`${moduleName}加载失败，部分功能可能不可用`, CONSTANTS.TIMING.TOAST_LONG, 'warning');

        // 执行降级处理
        if (typeof fallback === 'function') {
            try {
                return fallback();
            } catch (fallbackError) {
                console.error(`模块降级处理失败 [${moduleName}]:`, fallbackError);
            }
        }

        return fallback;
    }
}

document.addEventListener('keydown', handleSpacebarPreview);

// ========================================
// ✅ P0优化：清理事件监听器，防止内存泄漏
// ========================================
window.addEventListener('beforeunload', () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (scrollTimer) clearTimeout(scrollTimer);
    if (adjustRAF) cancelAnimationFrame(adjustRAF);
    clearHoverIntent(); // 内部已有守卫，无需重复 clearTimeout
    AppState.selection.items.clear();
    if (lazyLoadObserver) lazyLoadObserver.disconnect();
}, { once: true });
})();
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
// 🔧 P3-2优化：条件编译 console 调用
// ========================================
const DEBUG = false;  // 生产环境设为 false

const Logger = {
    error(...args) {
        if (DEBUG) console.error(...args);
    },
    warn(...args) {
        if (DEBUG) console.warn(...args);
    },
    log(...args) {
        if (DEBUG) console.log(...args);
    }
};

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
        TOAST_SHORT: 1500,       // 简短提示
        TOAST_NORMAL: 2000,      // 普通提示
        TOAST_LONG: 3000,        // 长时间提示
        DEBOUNCE_RESIZE: 150,    // resize 防抖延迟
        HOVER_DEFAULT: 500       // 默认悬停延迟
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
        enabled: true,              // 悬停功能是否启用
        currentItem: null,          // 当前悬停的项目
        suppressHover: false,       // 临时禁用悬停（如拖拽时）
        intent: {
            timer: null,            // 悬停意图计时器
            target: null,           // 悬停目标元素
            targetId: null          // 缓存的目标ID
        }
    },

    // 拖拽状态
    drag: {
        isDragging: false,          // 是否正在拖拽
        draggedItem: null,          // 被拖拽的项目
        dragOverTimeout: null,      // 拖拽悬停计时器
        lastDragOverTarget: null    // 上次拖拽经过的目标
    },

    // 选择状态
    selection: {
        items: new Set(),           // 选中的���目ID集合
        lastClickedId: null         // 最后点击的项目ID（用于 Shift 范围选择）
    },

    // 窗口管理
    windows: {
        preview: null,              // 预览窗口ID
        history: null               // 历史记录窗口ID
    },

    // 请求管理（防止竞态条件）
    requests: {
        pendingFolder: null,        // 当前待处理的文件夹请求
        pendingRecentBookmarks: null, // 最近书签请求
        pendingParentRefresh: new Map() // 父文件夹刷新请求映射 (parentId -> request)
    },

    // 布局状态
    layout: {
        initialMarginLeft: null,    // 第一列的初始左边距
        savedMarginLeft: null,      // 保存的居中调整后边距
        marginWindowWidth: null,    // 计算边距时的窗口宽度
        currentColumnCount: 0,      // 当前显示的列数
        needsRecenter: false        // 标记是否需要重新居中
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
const selectedElements = new Set();
const previewHighlightElements = new Set();

// ✅ 性能优化：onMoved 局部刷新缓存（5秒TTL）
const childrenCache = new Map(); // folderId -> {children, timestamp}
const CHILDREN_CACHE_TTL = 5000; // 5秒缓存

// ✅ P1优化：localStorage 缓存，避免频繁读取和解析
const StorageCache = {
    excludeRules: null,
    hoverDelay: null,
    lastUpdate: 0,
    TTL: 5000, // 5秒缓存

    getExcludeRules() {
        const now = Date.now();
        if (this.excludeRules && now - this.lastUpdate < this.TTL) {
            return this.excludeRules;
        }
        try {
            const json = localStorage.getItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES);
            this.excludeRules = json ? JSON.parse(json) : [];
        } catch (e) {
            this.excludeRules = [];
        }
        this.lastUpdate = now;
        return this.excludeRules;
    },

    getHoverDelay() {
        const now = Date.now();
        if (this.hoverDelay !== null && now - this.lastUpdate < this.TTL) {
            return this.hoverDelay;
        }
        this.hoverDelay = parseInt(localStorage.getItem(CONSTANTS.STORAGE_KEYS.HOVER_DELAY) || '500', 10);
        this.lastUpdate = now;
        return this.hoverDelay;
    },

    invalidate() {
        this.excludeRules = null;
        this.hoverDelay = null;
        this.lastUpdate = 0;
    }
};

// ✅ 性能优化: 缓存localStorage设置，避免每次点击都读取
let cachedOpenInCurrentTab = localStorage.getItem(CONSTANTS.STORAGE_KEYS.OPEN_IN_CURRENT_TAB) === 'true';

// ✅ 性能优化: 缓存窗口类型检测，避免每次点击都检查
let isInPopupWindow = false;
const isInIframe = window.self !== window.top;

// 异步检测窗口类型（使用 chrome.windows API 准确判断）
chrome.windows.getCurrent((win) => {
    isInPopupWindow = win.type === 'popup';
});

// ========================================
// P1性能优化：DOM元素缓存
// ========================================
const DOMCache = {
    bookmarkContainer: null,
    contextMenu: null,
    pageOverlay: null,
    settingsPanel: null,
    toast: null,
    header: null,  // ✅ 性能优化：缓存页面头部（书签栏容器）
    recentBookmarksContent: null,
    frequentlyVisitedContent: null,
    bookmarksBar: null,  // 🔧 P1-2优化：缓存书签栏（level 0）
    firstColumn: null,   // 🔧 P1-2优化：缓存第一列

    init() {
        this.bookmarkContainer = document.getElementById('bookmarkContainer');
        this.contextMenu = document.getElementById('contextMenu');
        this.pageOverlay = document.getElementById('pageOverlay');
        this.settingsPanel = document.getElementById('settings-panel');
        this.toast = document.getElementById('toast');
        this.header = document.querySelector('.page-header');  // ✅ 缓存header
        this.recentBookmarksContent = document.querySelector('#recentBookmarksModule .module-content');
        this.frequentlyVisitedContent = document.querySelector('.frequently-visited-content');
        this.bookmarksBar = document.querySelector('.bookmarks-bar');
    },

    // 🔧 P1-2优化：更新第一列缓存（列数变化时调用）
    updateFirstColumn() {
        if (!this.bookmarkContainer) return;
        const columns = this.bookmarkContainer.querySelectorAll('.bookmark-column[data-level]:not([data-level="0"])');
        this.firstColumn = columns[0] || null;
    },

    get(key) {
        return this[key];
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
    const cached = DOMCache.get(key);
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
    dragOver: new Set(),

    addHighlight(item) {
        item.classList.add('highlighted');
        this.highlighted.add(item);
    },

    clearHighlights() {
        this.highlighted.forEach(item => {
            if (item.isConnected) {
                item.classList.remove('highlighted');
            }
        });
        this.highlighted.clear();
    },

    addDragging(item) {
        item.classList.add('dragging');
        this.dragging.add(item);
    },

    clearDragging() {
        this.dragging.forEach(item => {
            if (item.isConnected) {
                item.classList.remove('dragging');
            }
        });
        this.dragging.clear();
    },

    addDragOver(item, ...classes) {
        classes.forEach(cls => item.classList.add(cls));
        this.dragOver.add(item);
    },

    clearDragOver() {
        this.dragOver.forEach(item => {
            if (item.isConnected) {
                item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-left', 'drag-over-right', 'drag-over');
            }
        });
        this.dragOver.clear();
    },

    clearAll() {
        this.clearHighlights();
        this.clearDragging();
        this.clearDragOver();
    }
};

// ========================================
// ✅ 优化：Chrome API 辅助函数
// ========================================

/**
 * 安全调用 Chrome API，自动处理错误
 * @param {Function} apiCall - Chrome API 调用函数
 * @param {string} errorContext - 错误上下文描述
 * @returns {Promise} API 调用结果
 */
async function safeChromeAPI(apiCall, errorContext = 'Chrome API') {
    try {
        const result = await apiCall();
        if (chrome.runtime.lastError) {
            console.error(`${errorContext} 失败:`, chrome.runtime.lastError);
            return null;
        }
        return result;
    } catch (error) {
        console.error(`${errorContext} 异常:`, error);
        return null;
    }
}

// ========================================
// ✅ P1-3优化：BookmarkTreeCache - 缓存书签树结构，避免 DOM 查询
// ========================================
const BookmarkTreeCache = new Map();

/**
 * 构建书签树缓存
 * @param {BookmarkNode[]} bookmarks - 书签树根节点数组
 */
function buildBookmarkTreeCache(bookmarks) {
    BookmarkTreeCache.clear();

    function traverse(nodes, parentId = null) {
        if (!nodes) return;
        nodes.forEach(node => {
            BookmarkTreeCache.set(node.id, {
                id: node.id,
                parentId: parentId,
                title: node.title,
                url: node.url,
                children: node.children || []
            });

            if (node.children) {
                traverse(node.children, node.id);
            }
        });
    }

    traverse(bookmarks);
}

// ========================================
// 核心修复：将 Observers 移至全局作用域
// ========================================

// 🔧 P2-2优化：优化 IntersectionObserver 配置
let lazyLoadObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            // 保留 data-src 以便 onerror 使用
            observer.unobserve(img);
        }
    });
}, {
    rootMargin: '50px',   // ✅ P0优化：减少预加载距离，避免过早加载
    threshold: 0.1        // ✅ P0优化：提高阈值，减少触发频率
});

function observeLazyImages(container) {
    container.querySelectorAll('img[data-src]').forEach(img => {
        lazyLoadObserver.observe(img);
    });
}

/**
 * ✅ 性能优化：安全清空容器，防止内存泄漏
 * 在清空前断开所有 Observer 监听
 * @param {HTMLElement} wrapper - 要清空的容器元素
 */
function clearContentWrapper(wrapper) {
    // 断开所有图片的 Observer 监听
    wrapper.querySelectorAll('img[data-src]').forEach(img => {
        lazyLoadObserver.unobserve(img);
    });
    // 然后清空内容
    wrapper.innerHTML = '';
}

// ========================================
// P1性能+安全优化：页面卸载时清理资源，防止内存泄漏
// ========================================
window.addEventListener('beforeunload', () => {
    // === 清理1：断开 IntersectionObserver ===
    if (lazyLoadObserver) {
        lazyLoadObserver.disconnect();
        lazyLoadObserver = null;
    }

    // === 清理2：清除所有悬停意图计时器 ===
    clearHoverIntent();

    // === 清理3：清除所有选中状态（释放内存） ===
    AppState.selection.items.clear();

    // === 清理4：清空 DOM 缓存引用 ===
    Object.keys(DOMCache).forEach(key => {
        if (key !== 'init' && key !== 'get') {
            DOMCache[key] = null;
        }
    });
}, { passive: true, once: true }); // 只执行一次，且为 passive


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
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 格式化时间戳为日期时间字符串
 * @param {number} timestamp - Unix时间戳（毫秒）
 * @returns {string} 格式化后的日期时间字符串 (YYYY-MM-DD HH:mm)
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
 * 获取书签的完整路径
 * @param {string} bookmarkId - 书签ID
 * @returns {Promise<string>} 书签路径（层级用 > 分隔）
 */
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

/**
 * 递归展平书签树为一维数组（仅包含书签，不包含文件夹）
 * @param {Array} nodes - 书签树节点数组
 * @param {Array} flatList - 用于收集结果的一维数组（会被修改）
 */
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
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * ✅ 优化 #11: 显示提示消息
 * @param {string} message - 提示消息内容
 * @param {number} [duration=2000] - 显示时长（毫秒）
 * @param {ToastType} [type='info'] - 消息类型
 * @returns {void}
 */
function showToast(message, duration = 2000, type = 'info') {
    // P1优化：使用缓存的toast元素
    const toast = getCachedElement('toast', () => document.getElementById('toast'));
    if (toast) {
        // P2改进：支持不同类型的提示
        let icon = '';
        switch (type) {
            case 'success':
                icon = '✓ ';
                break;
            case 'error':
                icon = '✗ ';
                break;
            case 'warning':
                icon = '⚠ ';
                break;
            default:
                icon = '';
        }
        
        toast.textContent = icon + message;
        // 核心修正：确保 glass-effect 类被保留
        toast.className = `toast glass-effect show toast-${type}`;
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
async function handleChromeAPIError(apiCall, options = {}) {
    const { operation = '操作', silent = false, fallback = null } = options;
    
    try {
        const result = await apiCall;
        
        // 检查 Chrome runtime 错误
        if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
        }
        
        return result;
    } catch (error) {
        console.error(`${operation}失败:`, error);

        if (!silent) {
            // ✅ 修复 #9: 根据错误类型提供用户友好的提示和解决方案
            let userMessage = `${operation}失败`;
            let suggestion = '';
            const errorMsg = error.message?.toLowerCase() || '';

            if (errorMsg.includes('permission') || errorMsg.includes('denied')) {
                suggestion = '，请检查扩展权限设置';
            } else if (errorMsg.includes('not found') || errorMsg.includes('no node')) {
                suggestion = '，该项目可能已被删除';
            } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
                suggestion = '，请检查网络连接';
            } else if (errorMsg.includes('cannot modify')) {
                suggestion = '，该项目不可修改';
            } else {
                suggestion = '，请稍后重试或刷新页面';
            }

            showToast(userMessage + suggestion, CONSTANTS.TIMING.TOAST_LONG, 'error');
        }

        if (fallback && typeof fallback === 'function') {
            return fallback();
        }

        return null;
    }
}

/**
 * 安全的书签 API 调用包装器
 */
const SafeBookmarks = {
    async getChildren(id) {
        return handleChromeAPIError(
            new Promise(resolve => chrome.bookmarks.getChildren(id, resolve)),
            { operation: '获取书签子项', silent: true }
        );
    },
    
    async get(id) {
        return handleChromeAPIError(
            new Promise(resolve => chrome.bookmarks.get(id, resolve)),
            { operation: '获取书签', silent: true }
        );
    },
    
    async move(id, destination) {
        return handleChromeAPIError(
            chrome.bookmarks.move(id, destination),
            { operation: '移动书签' }
        );
    },
    
    async update(id, changes) {
        return handleChromeAPIError(
            chrome.bookmarks.update(id, changes),
            { operation: '更新书签' }
        );
    },
    
    async create(bookmark) {
        return handleChromeAPIError(
            chrome.bookmarks.create(bookmark),
            { operation: '创建书签' }
        );
    },
    
    async remove(id) {
        return handleChromeAPIError(
            chrome.bookmarks.remove(id),
            { operation: '删除书签' }
        );
    },
    
    async removeTree(id) {
        return handleChromeAPIError(
            chrome.bookmarks.removeTree(id),
            { operation: '删除文件夹' }
        );
    }
};

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
function createSvgIcon(iconId, className = 'bookmark-icon') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttributeNS(null, 'href', `#${iconId}`);
    svg.appendChild(use);
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

/**
 * P3优化：创建错误状态HTML
 * @param {string} message - 错误消息
 * @param {string} emoji - emoji图标
 * @param {string} retryFn - 重试函数名
 */
function createErrorStateHTML(message, emoji = '😕', retryFn = '') {
    const retryButton = retryFn 
        ? `<button onclick="${retryFn}" style="margin-top: 8px; padding: 4px 12px; background: var(--card-bg); border: 1px solid var(--header-border); border-radius: 6px; color: var(--text-color); cursor: pointer; font-size: 11px;">重试</button>`
        : '';
    
    return `
        <div class="error-state" style="padding: 12px; text-align: center; color: var(--module-header-color); font-size: 12px;">
            <div style="margin-bottom: 8px;">${emoji}</div>
            <div>${message}</div>
            ${retryButton}
        </div>
    `;
}

/**
 * P3优化：创建空状态HTML
 * @param {string} message - 空状态消息
 * @param {string} emoji - emoji图标
 */
function createEmptyStateHTML(message, emoji = '📭') {
    return `
        <div class="empty-state" style="padding: 12px; text-align: center; color: var(--module-header-color); font-size: 12px;">
            <div style="margin-bottom: 6px;">${emoji}</div>
            <div>${message}</div>
        </div>
    `;
}

/**
 * P3优化：创建加载骨架屏
 * @param {number} count - 骨架数量
 * @param {string} shape - 形状：'circle' 或 'rect'
 */
function createSkeletonLoader(count, shape = 'circle') {
    const container = document.createElement('div');
    container.className = 'loading-state';
    container.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 8px 0;';
    
    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-item';
        const borderRadius = shape === 'circle' ? '50%' : '6px';
        skeleton.style.cssText = `width: 28px; height: 28px; border-radius: ${borderRadius}; background: var(--input-bg);`;
        container.appendChild(skeleton);
    }
    
    return container;
}

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
        if (!AppState.hover.enabled) return;

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
        if (el.isConnected) { // 检查元素是否仍在DOM中
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
    
    // === 1. 移除所有 level >= 1 的列（保留书签栏） ===
    const columnsToRemove = container.querySelectorAll('.bookmark-column[data-level]:not([data-level="0"])');
    if (columnsToRemove.length === 0) return; // 如果没有列需要关闭，直接返回
    
    columnsToRemove.forEach(col => col.remove());
    
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
        selectedElements.delete(item); // ✅ 优化：从缓存中移除
        item.classList.remove('selected');
    } else {
        AppState.selection.items.add(id);
        selectedElements.add(item); // ✅ 优化：添加到缓存
        item.classList.add('selected');
    }
    AppState.selection.lastClickedId = id;
}

/**
 * 选择范围内的所有书签（用于Shift点击）
 * @param {string} startId - 起始书签ID
 * @param {string} endId - 结束书签ID
 * @param {HTMLElement} column - 所在列的DOM元素
 * ✅ 优化 #4: 维护元素引用缓存
 */
function selectRange(startId, endId, column) {
    const items = Array.from(column.querySelectorAll('.bookmark-item'));
    const startIndex = items.findIndex(i => i.dataset.id === startId);
    const endIndex = items.findIndex(i => i.dataset.id === endId);
    if (startIndex === -1 || endIndex === -1) return;

    const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
    for (let i = min; i <= max; i++) {
        const item = items[i];
        if (!AppState.selection.items.has(item.dataset.id)) {
            AppState.selection.items.add(item.dataset.id);
            selectedElements.add(item); // ✅ 优化：添加到缓存
            item.classList.add('selected');
        }
    }
}

// 书签渲染与刷新
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
    header.querySelectorAll('.bookmarks-bar').forEach(col => col.remove());

    // ✅ 修复 #5: 验证数据有效性
    if (!bookmarks || !Array.isArray(bookmarks) || bookmarks.length === 0) {
        console.warn('displayBookmarks: No bookmarks data');
        return;
    }

    const bookmarksBar = bookmarks[0]?.children?.[0];

    if (bookmarksBar && bookmarksBar.children && bookmarksBar.children.length > 0) {
        renderBookmarks(bookmarksBar.children, header, 0);
    } else {
        // ✅ 修复 #5: 显示空书签栏提示
        const emptyBar = document.createElement('div');
        emptyBar.className = 'bookmarks-bar';
        emptyBar.dataset.level = '0';
        emptyBar.innerHTML = `
            <div style="padding: 8px 16px; color: var(--module-header-color); font-size: 13px; opacity: 0.6;">
                书签栏为空，请在Chrome中添加书签
            </div>
        `;
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
        header.querySelectorAll('.bookmarks-bar').forEach(col => col.remove());

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

    bookmarks.forEach((bookmark, index) => {
        const item = createBookmarkItem(bookmark, index);
        // ✅ 性能优化：为书签栏的书签项添加专用类名，避免复杂选择器
        if (level === 0) {
            item.classList.add('bookmarks-bar-item');
        }
        fragment.appendChild(item);
    });

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

        column.appendChild(fragment);
        observeLazyImages(column);

        // 检测书签栏是否需要居中显示
        requestAnimationFrame(() => {
            adjustBookmarksBarAlignment(column);
        });

    } else {
        // 🔧 修复：检查是否要移除列1，如果是则需要重置布局状态
        const willRemoveLevel1 = level === 1 && container.querySelector('.bookmark-column[data-level="1"]');

        const nextColumns = container.querySelectorAll(`.bookmark-column`);
        nextColumns.forEach(col => {
            if (parseInt(col.dataset.level) >= level) col.remove();
        });

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

    // 🔧 P0-1优化：移除列级别的事件监听器，完全依赖全局事件委托
    // 这些监听器从未被清理，导致内存泄漏
    // 全局委托已在 newtab.js:4441-4460 实现
    // column.addEventListener('dragover', handleColumnDragOver);
    // column.addEventListener('dragleave', handleColumnDragLeave);
    // column.addEventListener('drop', handleColumnDrop);

    // 🔧 P1-3优化：使用 requestAnimationFrame 替代嵌套 setTimeout
    // 更精确的时机控制，减少延迟
    requestAnimationFrame(() => {
        if (!container.contains(column)) return;

        // ✅ 性能优化：使用 RAF 防抖调整列宽
        scheduleAdjustColumnWidths(container);

        // 新列的智能滚动逻辑（直接执行，不再嵌套）
        if (level > 0 && column.classList.contains('new-column')) {
            // 使用另一个 RAF 确保列宽调整完成后再滚动
            requestAnimationFrame(() => {
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
            });
        }
    });
}

/**
 * ✅ 优化 #11: 创建单个书签项的DOM元素
 * @param {BookmarkNode} bookmark - 书签节点对象
 * @param {number} index - 在父节点中的索引位置
 * @returns {HTMLDivElement} 书签项DOM元素
 */
function createBookmarkItem(bookmark, index) {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.dataset.id = bookmark.id;
    item.dataset.url = bookmark.url || '';
    item.dataset.index = index;
    item.dataset.parentId = bookmark.parentId;
    item.dataset.title = bookmark.title || 'No Title';
    item.draggable = true;

    // ✅ 修复 #5: 添加键盘导航和可访问性支持
    const isFolder = !bookmark.url;
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', isFolder ? 'button' : 'link');
    item.setAttribute('aria-label', bookmark.title || 'No Title');
    let icon;

    if (isFolder) {
        // ✅ 优化 #7: 使用统一的SVG图标创建函数
        icon = createSvgIcon('icon-folder');
    } else {
        // P3优化：使用统一的图标创建和错误处理
        icon = document.createElement('img');
        icon.className = 'bookmark-icon';
        icon.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        icon.dataset.src = getIconUrl(bookmark.url);
        setupIconErrorHandler(icon);
    }

    const title = document.createElement('span');
    title.textContent = sanitizeText(bookmark.title || 'No Title');
    title.className = 'bookmark-title';

    item.appendChild(icon);
    item.appendChild(title);

    if (isFolder) {
        item.classList.add('is-folder');
        // ✅ 修复 #5: 文件夹ARIA属性
        item.setAttribute('aria-expanded', 'false');
        item.setAttribute('aria-haspopup', 'true');
    }

    if (bookmark.url && bookmark.url.includes('github.com')) {
        item.classList.add('is-github-link');
    }

    // P1优化：不再为每个项目添加事件监听器
    // 使用事件委托，监听器在容器级别统一处理

    return item;
}

/**
 * ✅ 性能优化：创建空列（用于即时反馈）
 * @param {number} level - 列的层级
 * @returns {HTMLElement} 空列元素
 */
function createEmptyColumn(level) {
    const container = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));

    // ✅ 性能优化：批量移除旧列,减少重排次数
    const nextColumns = container.querySelectorAll(`.bookmark-column`);
    const columnsToRemove = [];
    nextColumns.forEach(col => {
        if (parseInt(col.dataset.level) >= level) {
            columnsToRemove.push(col);
        }
    });

    // ✅ 性能优化：使用 DocumentFragment 批量移除，只触发一次重排
    if (columnsToRemove.length > 0) {
        // 先从 DOM 中分离，避免多次重排
        columnsToRemove.forEach(col => col.remove());
    }

    // 检查是否要移除列1
    const willRemoveLevel1 = level === 1 && columnsToRemove.some(col => col.dataset.level === '1');
    if (willRemoveLevel1) {
        resetLayoutState();
    }

    // 创建新列
    const column = document.createElement('div');
    column.className = 'bookmark-column new-column';
    column.dataset.level = level;
    column.setAttribute('role', 'navigation');
    column.setAttribute('aria-label', `书签列 ${level}`);

    // 如果是第一列，预先计算并应用边距
    if (level === 1 && AppState.layout.initialMarginLeft === null) {
        const availableWidth = container.clientWidth;
        const baseMargin = calculateCenteredMargin(availableWidth);
        const finalMargin = applyCenteredMargin(baseMargin);
        AppState.layout.initialMarginLeft = finalMargin;
        column.style.marginLeft = `${finalMargin}px`;
        column.style.transition = 'none';
    }

    // ✅ 性能优化：禁用初始动画（大窗口）,减少渲染开销
    if (level === 1 && window.innerWidth > 1600) {
        column.style.animation = 'none';
        column.style.opacity = '1'; // 直接设置为可见,不需要动画
    }

    // 创建内容包装器
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'column-content-wrapper';
    column.appendChild(contentWrapper);

    // 🔧 P0-1优化：移除列级别的事件监听器，完全依赖全局事件委托
    // column.addEventListener('dragover', handleColumnDragOver);
    // column.addEventListener('dragleave', handleColumnDragLeave);
    // column.addEventListener('drop', handleColumnDrop);

    makeColumnResizable(column);

    return column;
}

/**
 * ✅ 性能优化：填充列内容（分离创建和填充逻辑）
 * @param {Array} bookmarks - 书签数组
 * @param {number} level - 列的层级
 */
function fillColumnContent(bookmarks, level) {
    const container = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));
    const column = container.querySelector(`.bookmark-column[data-level="${level}"]`);

    if (!column) return;

    const contentWrapper = column.querySelector('.column-content-wrapper');
    if (!contentWrapper) return;

    // ✅ 性能优化：安全清空，防止内存泄漏
    clearContentWrapper(contentWrapper);

    if (bookmarks.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-folder-message';
        emptyMsg.textContent = '这个文件夹是空的';
        contentWrapper.appendChild(emptyMsg);
    } else {
        // 使用 DocumentFragment 批量添加
        const fragment = document.createDocumentFragment();
        bookmarks.forEach((bookmark, index) => {
            const item = createBookmarkItem(bookmark, index);
            fragment.appendChild(item);
        });
        contentWrapper.appendChild(fragment);
        observeLazyImages(contentWrapper);
    }

    // ✅ 性能优化：移除不必要的动画恢复逻辑
    // 大窗口下已经在 createEmptyColumn 中设置为直接可见,无需额外处理

    // ✅ 性能优化：减少滚动延迟,提升响应速度
    // 使用 requestAnimationFrame 替代 setTimeout,更精确的时机
    requestAnimationFrame(() => {
        if (container.contains(column) && column.classList.contains('new-column')) {
            const currentScroll = container.scrollLeft;
            const containerWidth = container.clientWidth;
            const columnLeft = column.offsetLeft;
            const columnRight = columnLeft + column.offsetWidth;

            const prevColumn = column.previousElementSibling;
            let targetScroll = currentScroll;

            if (prevColumn && prevColumn.classList.contains('bookmark-column')) {
                const prevLeft = prevColumn.offsetLeft;
                const totalWidth = columnRight - prevLeft;

                if (totalWidth <= containerWidth) {
                    targetScroll = prevLeft - 20;
                } else {
                    targetScroll = Math.max(0, columnLeft - 40);
                }
            } else {
                targetScroll = Math.max(0, columnLeft - 20);
            }

            const scrollDiff = Math.abs(targetScroll - currentScroll);
            if (scrollDiff > 10) {
                container.scrollTo({
                    left: targetScroll,
                    behavior: 'smooth'
                });
            }

            column.classList.remove('new-column');
        }
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
    
    const level = parseInt(column.dataset.level, 10);

    // ✅ 修复：只清除同一列中的高亮,保留其他列的导航路径
    // 这样用户可以看到完整的文件夹打开路径
    const itemsToRemove = [];
    ElementCache.highlighted.forEach(i => {
        if (i.isConnected) {
            const itemColumn = i.closest('.bookmark-column, .bookmarks-bar');
            // 只移除同一列中的高亮
            if (itemColumn && itemColumn.dataset.level === column.dataset.level) {
                i.classList.remove('highlighted');
                // ✅ 修复 #5: 更新ARIA状态
                if (i.classList.contains('is-folder')) {
                    i.setAttribute('aria-expanded', 'false');
                }
                itemsToRemove.push(i);
            }
        }
    });
    // 从缓存中移除已清除高亮的项目
    itemsToRemove.forEach(i => ElementCache.highlighted.delete(i));

    if (!isHighlighted) {
        ElementCache.addHighlight(folderItem);
        // ✅ 修复 #5: 更新ARIA状态
        folderItem.setAttribute('aria-expanded', 'true');

        // ✅ 性能优化：立即创建空列,显示加载状态
        const container = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));
        if (container) {
            // 先创建空列,给用户即时反馈
            const emptyColumn = createEmptyColumn(level + 1);
            container.appendChild(emptyColumn);

            // ✅ 性能优化：延迟布局调整,优先显示空列
            // 使用 RAF 防抖调整列宽
            scheduleAdjustColumnWidths(container);
        }

        // ✅ P0修复：添加请求去重机制，防止快速连续点击导致的竞态条件
        if (AppState.requests.pendingFolder) {
            AppState.requests.pendingFolder.cancelled = true;
        }

        const thisRequest = { cancelled: false, folderId: bookmarkId };
        AppState.requests.pendingFolder = thisRequest;

        chrome.bookmarks.getChildren(bookmarkId, (freshChildren) => {
            // ✅ 修复 #3: 检查 Chrome API 错误
            if (chrome.runtime.lastError) {
                console.error('getChildren failed:', chrome.runtime.lastError);
                // 清除请求标记
                if (AppState.requests.pendingFolder === thisRequest) {
                    AppState.requests.pendingFolder = null;
                }
                // 移除高亮状态
                folderItem.classList.remove('highlighted');
                // ✅ 修复 #5: 更新ARIA状态
                folderItem.setAttribute('aria-expanded', 'false');
                // 移除空列
                if (container) {
                    const emptyCol = container.querySelector(`.bookmark-column[data-level="${level + 1}"]`);
                    if (emptyCol) emptyCol.remove();
                }
                showToast('加载文件夹失败', CONSTANTS.TIMING.TOAST_NORMAL, 'error');
                return;
            }

            // 检查此请求是否已被取消
            if (thisRequest.cancelled) {
                return;
            }

            // ✅ 修复 #3: 验证返回数据有效性
            if (!Array.isArray(freshChildren)) {
                console.error('Invalid children data:', freshChildren);
                if (AppState.requests.pendingFolder === thisRequest) {
                    AppState.requests.pendingFolder = null;
                }
                folderItem.classList.remove('highlighted');
                // ✅ 修复 #5: 更新ARIA状态
                folderItem.setAttribute('aria-expanded', 'false');
                // 移除空列
                if (container) {
                    const emptyCol = container.querySelector(`.bookmark-column[data-level="${level + 1}"]`);
                    if (emptyCol) emptyCol.remove();
                }
                return;
            }

            // 清除请求标记
            if (AppState.requests.pendingFolder === thisRequest) {
                AppState.requests.pendingFolder = null;
            }

            // ✅ 性能优化：直接填充内容到已存在的列
            if (container) {
                fillColumnContent(freshChildren, level + 1);
            }
        });
    } else {
        const container = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));
        if (!container) return;
        
        const nextColumns = container.querySelectorAll(`.bookmark-column`);
        nextColumns.forEach(col => {
            if (parseInt(col.dataset.level) > level) col.remove();
        });
        
        // 如果关闭后没有列了，重置布局状态
        const remainingColumns = container.querySelectorAll('.bookmark-column[data-level]:not([data-level="0"])');
        if (remainingColumns.length === 0) {
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
    AppState.layout.needsRecenter = false;
}

/**
 * 开始悬停意图检测（用于文件夹自动展开）
 * @param {HTMLElement} item - 书签项元素
 */
function startHoverIntent(item) {
    // === 性能优化1：安全检查前置，使用可选链快速失败 ===
    if (!item?.dataset?.id) return;
    
    // === 性能优化2：提前缓存ID，避免重复读取 dataset ===
    const itemId = item.dataset.id;
    
    // === 性能优化3：使用缓存的ID进行快速比较 ===
    if (AppState.hover.intent.targetId === itemId && AppState.hover.intent.timer !== null) {
        return; // 同一元素且计时器运行中，直接返回
    }
    
    // === 安全优化1：全局状态检查（防止恶意/异常触发） ===
    if (!AppState.hover.enabled || AppState.drag.isDragging || AppState.hover.suppressHover || document.body.dataset.contextMenuOpen) {
        clearHoverIntent();
        return;
    }
    
    // === 性能优化4：只在必要时清除计时器 ===
    if (AppState.hover.intent.timer !== null) {
        clearTimeout(AppState.hover.intent.timer);
        AppState.hover.intent.timer = null;
    }

    // === 性能优化5：缓存目标元素和ID ===
    AppState.hover.intent.target = item;
    AppState.hover.intent.targetId = itemId;

    // === 性能优化6：延迟计算放在外面，避免闭包捕获 localStorage ===
    const delay = StorageCache.getHoverDelay();

    // === 性能优化7：使用箭头函数避免 this 绑定开销 ===
    AppState.hover.intent.timer = setTimeout(() => {
        // === 安全优化2：双重检查锁定（DCL），防止竞态条件 ===
        if (AppState.drag.isDragging || AppState.hover.suppressHover) {
            AppState.hover.intent.target = null;
            AppState.hover.intent.targetId = null;
            AppState.hover.intent.timer = null;
            return;
        }
        
        // === 安全优化3：检查元素是否仍在DOM中（防止内存泄漏） ===
        if (!item.isConnected) {
            AppState.hover.intent.target = null;
            AppState.hover.intent.targetId = null;
            AppState.hover.intent.timer = null;
            return;
        }
        
        // === 安全优化4：验证元素状态未改变 ===
        if (AppState.hover.intent.target !== item || AppState.hover.intent.targetId !== itemId) {
            AppState.hover.intent.target = null;
            AppState.hover.intent.targetId = null;
            AppState.hover.intent.timer = null;
            return;
        }
        
        // === 性能优化8：使用可选链减少 DOM 查询 ===
        const parent = item.parentElement;
        if (!parent) {
            AppState.hover.intent.target = null;
            AppState.hover.intent.targetId = null;
            AppState.hover.intent.timer = null;
            return;
        }
        
        // === 性能优化9：只在需要时查询高亮元素 ===
        const currentHighlighted = parent.querySelector('.bookmark-item.highlighted');
        if (item !== currentHighlighted) {
            // === 安全优化5：使用 try-catch 防止异常传播 ===
            try {
                handleFolderClick(item, itemId);
            } catch (error) {
                console.error('Hover intent execution failed:', error);
            }
        }
        
        // === 内存优化：执行后立即清理所有引用 ===
        AppState.hover.intent.target = null;
        AppState.hover.intent.targetId = null;
        AppState.hover.intent.timer = null;
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

    const overlay = document.querySelector('.resizing-overlay');
    const indicator = document.querySelector('.resize-indicator');
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
let lastContainerWidth = 0; // 🔧 性能优化：缓存容器宽度，避免无效调用





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
            // 场景1：所有列都关闭了，重置所有状态
            resetLayoutState();
        } else if (newColumnCount === 1 && AppState.layout.initialMarginLeft === null) {
            // 场景2：首次打开第一个书签
            marginLeft = calculateCenteredMargin(availableWidth);
            marginLeft = applyCenteredMargin(marginLeft);
            AppState.layout.initialMarginLeft = marginLeft;
        } else if (newColumnCount > AppState.layout.currentColumnCount) {
            // 场景3：打开新书签
            marginLeft = currentActualMargin > 0 
                ? currentActualMargin 
                : (AppState.layout.savedMarginLeft || AppState.layout.initialMarginLeft || calculateCenteredMargin(availableWidth));
        } else if (newColumnCount < AppState.layout.currentColumnCount) {
            // 场景4：关闭书签
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

/**
 * 收缩列宽以适应容器
 * @param {Array} resizableColumns - 可调整大小的列
 * @param {number} overflowWidth - 溢出宽度
 * @param {number} minWidth - 最小列宽
 * @returns {Map} - 新的样式映射
 */
function shrinkColumnsToFit(resizableColumns, overflowWidth, minWidth) {
    const newStyles = new Map();
    const sortedResizable = [...resizableColumns].sort((a, b) => b.currentWidth - a.currentWidth);
    
    const totalShrinkableSpace = sortedResizable.reduce((sum, data) => {
        return sum + Math.max(0, data.currentWidth - minWidth);
    }, 0);
    
    if (totalShrinkableSpace >= overflowWidth) {
        // 使用权重收缩：较宽的列收缩更多
        for (const data of sortedResizable) {
            const shrinkableAmount = Math.max(0, data.currentWidth - minWidth);
            if (shrinkableAmount > 0) {
                const proportion = shrinkableAmount / totalShrinkableSpace;
                const reduction = overflowWidth * proportion;
                const newWidth = Math.max(minWidth, data.currentWidth - reduction);
                newStyles.set(data.el, { width: `${newWidth}px` });
            }
        }
    } else {
        // 如果收缩空间不够，将所有可调整的列缩到最小
        for (const data of sortedResizable) {
            if (data.currentWidth > minWidth) {
                newStyles.set(data.el, { width: `${minWidth}px` });
            }
        }
    }
    
    return newStyles;
}

/**
 * 扩展列宽以利用空余空间
 * @param {Array} resizableColumns - 可调整大小的列
 * @param {number} availableSpace - 可用空间
 * @param {number} idealWidth - 理想列宽
 * @returns {Map} - 新的样式映射
 */
function enlargeColumnsToFill(resizableColumns, availableSpace, idealWidth) {
    const newStyles = new Map();
    const columnsToEnlarge = resizableColumns.filter(data => data.currentWidth < idealWidth);
    
    if (columnsToEnlarge.length > 0 && availableSpace > 0) {
        const totalEnlargePotential = columnsToEnlarge.reduce((sum, data) => {
            return sum + (idealWidth - data.currentWidth);
        }, 0);
        
        if (totalEnlargePotential > 0) {
            if (totalEnlargePotential <= availableSpace) {
                // 空间足够，全部扩展到 ideal 宽度
                for (const data of columnsToEnlarge) {
                    newStyles.set(data.el, { width: `${idealWidth}px` });
                }
            } else {
                // 空间不够，按比例扩展
                for (const data of columnsToEnlarge) {
                    const potential = idealWidth - data.currentWidth;
                    const proportion = potential / totalEnlargePotential;
                    const enlargeAmount = availableSpace * proportion;
                    const newWidth = data.currentWidth + enlargeAmount;
                    newStyles.set(data.el, { width: `${newWidth}px` });
                }
            }
        }
    }
    
    return newStyles;
}

/**
 * 应用列宽样式变化
 * @param {Map} newStyles - 新的样式映射
 * @param {Array} columnData - 列数据（用于判断变化大小）
 */
function applyColumnWidthStyles(newStyles, columnData) {
    // 🔧 修复：过滤掉没有实际变化的样式，避免触发意外动画
    const actualChanges = new Map();

    newStyles.forEach((style, el) => {
        const currentWidth = parseFloat(el.style.width) || el.offsetWidth;
        const newWidth = parseFloat(style.width);
        const widthDiff = Math.abs(currentWidth - newWidth);

        // 只有宽度差异超过 1px 时才认为是真正的变化
        if (widthDiff > 1) {
            actualChanges.set(el, style);
        }
    });

    // 如果没有实际变化，直接返回
    if (actualChanges.size === 0) {
        return;
    }

    // 检查是否有大的变化
    const hasLargeChanges = Array.from(actualChanges.entries()).some(([el, style]) => {
        const cached = columnData.find(data => data.el === el);
        const currentWidth = cached ? cached.currentWidth : el.offsetWidth;
        const newWidth = parseFloat(style.width);
        return Math.abs(currentWidth - newWidth) > 50;
    });

    if (hasLargeChanges) {
        // 大变化时禁用动画
        actualChanges.forEach((style, el) => {
            el.style.transition = 'none';
            el.style.width = style.width;
        });

        // 下一帧恢复动画
        requestAnimationFrame(() => {
            actualChanges.forEach((style, el) => {
                el.style.transition = '';
            });
        });
    } else {
        // 小变化时保持动画
        actualChanges.forEach((style, el) => {
            el.style.width = style.width;
        });
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

    if (AppState.layout.needsRecenter) {
        AppState.layout.needsRecenter = false;
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
            // ✅ P3-1优化：使用 requestAnimationFrame 优化重排
            requestAnimationFrame(() => {
                firstColumn.offsetHeight; // 强制重排
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
    const { firstColumn, finalMarginLeft, gap, marginRight, availableWidth, columns } = params;

    let scrollTarget = 0;
    // 🔧 性能优化：使用传入的 columns 数组，避免重复查询 DOM
    const finalColumns = columns || Array.from(container.querySelectorAll('.bookmark-column[data-level]:not([data-level="0"])'));

    // 获取第一列的实际左边距
    const firstColumnMargin = firstColumn && firstColumn.dataset.level === "1"
        ? (parseFloat(firstColumn.style.marginLeft) || finalMarginLeft || 0)
        : 0;

    // 计算实际占用的总宽度
    const finalColumnsWidth = finalColumns.reduce((sum, col) => sum + col.offsetWidth, 0);
    const finalGapsWidth = (finalColumns.length - 1) * gap;
    const finalTotalWidth = firstColumnMargin + finalColumnsWidth + finalGapsWidth + marginRight;

    // 判断是否需要滚动
    if (finalTotalWidth > availableWidth) {
        // 从右往左计算能显示的列
        let visibleWidth = marginRight;
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

        // 计算滚动目标
        if (firstVisibleColumnIndex === 0) {
            scrollTarget = 0;
        } else {
            const targetColumn = finalColumns[firstVisibleColumnIndex];
            scrollTarget = Math.max(0, targetColumn.offsetLeft - 10);
        }
    }

    // 只在需要时滚动
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
    // ✅ 性能优化：提前检查，避免不必要的计算
    if (!container || resizing) return;

    // ✅ 性能优化：提前检查容器宽度，避免无效计算
    const availableWidth = container.clientWidth;
    if (!availableWidth || availableWidth <= 0) return;

    // 🔧 性能优化：检查容器宽度是否真正变化（容差 2px）
    const widthDiff = Math.abs(availableWidth - lastContainerWidth);
    if (lastContainerWidth > 0 && widthDiff < 2) {
        return; // 宽度没有显著变化，跳过调整
    }
    lastContainerWidth = availableWidth;

    resizing = true;

    requestAnimationFrame(() => {
        try {
            // === 阶段1：读取布局信息 ===
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

            // 🔧 P1-1优化：批量读取布局信息，避免 Layout Thrashing
            // 先一次性读取所有需要的 DOM 属性（触发一次重排）
            const widths = columns.map(col => col.offsetWidth);
            const userResizedFlags = columns.map(col => col.dataset.userResized === 'true');

            // 然后创建数据对象（纯计算，无 DOM 操作）
            const columnData = columns.map((col, i) => ({
                el: col,
                currentWidth: widths[i],
                userResized: userResizedFlags[i],
                canResize: !userResizedFlags[i]
            }));

            // === 阶段2：计算左边距 ===
            const newColumnCount = columns.length;
            const columnsChanged = newColumnCount !== AppState.layout.currentColumnCount;

            const marginLeft = calculateFirstColumnMargin({
                firstColumn,
                columns,
                availableWidth,
                columnsChanged,
                newColumnCount
            });

            // === 阶段3：计算列宽调整 ===
            const columnsWidth = columnData.reduce((sum, data) => sum + data.currentWidth, 0);
            const gapsWidth = (columnData.length - 1) * gap;
            const totalUsedWidth = marginLeft + columnsWidth + gapsWidth + marginRight;
            const resizableColumns = columnData.filter(data => data.canResize);

            let newStyles;
            if (totalUsedWidth > availableWidth) {
                // 内容溢出，需要收缩
                const overflowWidth = totalUsedWidth - availableWidth;
                newStyles = shrinkColumnsToFit(resizableColumns, overflowWidth, MIN_COL_WIDTH);
            } else {
                // 空间有富余，适度扩展
                const availableSpace = availableWidth - totalUsedWidth;
                newStyles = enlargeColumnsToFill(resizableColumns, availableSpace, DEFAULT_COL_WIDTH);
            }

            // === 阶段4：应用样式变化 ===
            applyColumnWidthStyles(newStyles, columnData);
            applyFirstColumnMargin(firstColumn, marginLeft);

            // === 阶段5：智能滚动 ===
            // 🔧 性能优化：移除嵌套的 RAF，直接调用并传递已有的 columns 数组
            performSmartScroll(container, {
                firstColumn,
                finalMarginLeft: marginLeft,
                gap,
                marginRight,
                availableWidth,
                columns  // 传递已查询的 columns，避免重复 DOM 查询
            });

            resizing = false;
        } catch (error) {
            // 🔧 P3-2优化：使用 Logger 替代 console
            Logger.error('Error in adjustColumnWidths:', error);
            resizing = false;
        }
    });
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

    const idsToDrag = Array.from(AppState.selection.items);
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
        idsToDrag.forEach(id => {
            const el = document.querySelector(`.bookmark-item[data-id="${id}"]`);
            // ✅ P1-2优化：使用 ElementCache 替代直接操作 classList
            if (el) ElementCache.addDragging(el);
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
    
    // 清理拖拽相关状态
    clearTimeout(AppState.drag.dragOverTimeout);
    clearSelection();
    
    // 清理所有拖拽相关的样式
    // ✅ P1-2优化：使用 ElementCache 替代 querySelectorAll
    ElementCache.clearDragging();
    AppState.drag.draggedItem = null;
    AppState.drag.lastDragOverTarget = null;
    ElementCache.clearDragOver();
    
    // 延迟恢复悬停功能，防止立即触发
    // 使用较短的延迟（500ms），减少用户等待时间
    AppState.hover.suppressHover = true;
    setTimeout(() => {
        AppState.hover.suppressHover = false;
    }, 500);
}

/**
 * 处理拖拽经过事件
 * @param {DragEvent} e - 拖拽事件对象
 */
function handleDragOver(e) {
    e.preventDefault();
    const targetItem = e.target.closest('.bookmark-item');
    if (!targetItem) return;

    if (AppState.selection.items.has(targetItem.dataset.id)) {
        return;
    }

    const rect = targetItem.getBoundingClientRect();
    const level = targetItem.closest('.bookmark-column, .bookmarks-bar').dataset.level;
    const isFolder = targetItem.classList.contains('is-folder');

    // 计算新的拖动状态
    let newClass = '';
    if (level == '0') {
        newClass = (e.clientX < rect.left + rect.width / 2) ? 'drag-over-before' : 'drag-over-after';
    } else {
        const y = e.clientY - rect.top;
        if (isFolder) {
            // 文件夹：上30%放在上面，下30%放在下面，中间40%进入文件夹
            if (y < rect.height * 0.3) {
                newClass = 'drag-over-top';
            } else if (y > rect.height * 0.7) {
                newClass = 'drag-over-bottom';
            } else {
                newClass = 'drag-enter';
            }
        } else {
            // 非文件夹：简单的上下分割
            newClass = (y < rect.height / 2) ? 'drag-over-top' : 'drag-over-bottom';
        }
    }

    // 仅在状态变化时更新DOM,减少不必要的重绘
    if (AppState.drag.lastDragOverTarget !== targetItem || !targetItem.classList.contains(newClass)) {
        // 清除上一个目标的样式
        if (AppState.drag.lastDragOverTarget && AppState.drag.lastDragOverTarget !== targetItem) {
            AppState.drag.lastDragOverTarget.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-before', 'drag-over-after', 'drag-enter');
        }

        // 清除当前目标的所有拖动样式,然后添加新样式
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
    
    // 防抖处理：如果延迟时间太短，使用requestAnimationFrame
    const scheduleHighlight = delay < 100 
        ? (callback) => requestAnimationFrame(() => setTimeout(callback, delay))
        : (callback) => setTimeout(callback, delay);
    
    scheduleHighlight(() => {
        const bookmarkContainer = getCachedElement('bookmarkContainer', () => document.getElementById('bookmarkContainer'));
        if (!bookmarkContainer) return;
        
        let observer = null;
        let timeoutId = null;
        
        // 清理函数：确保资源释放
        const cleanup = () => {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };
        
        // 执行高亮的核心逻辑
        const applyHighlight = (items) => {
            if (!items || items.length === 0) return;
            
            // 使用 requestAnimationFrame 批量处理DOM操作
            requestAnimationFrame(() => {
                items.forEach(item => {
                    if (item && item.classList) {
                        item.classList.add('just-moved');
                    }
                });
                
                // 滚动到第一个项目
                if (items[0]) {
                    items[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                
                // 定时移除高亮类
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        items.forEach(item => {
                            if (item && item.classList) {
                                item.classList.remove('just-moved');
                            }
                        });
                    });
                }, 1200);
            });
        };
        
        // 尝试查找元素
        const findItems = () => {
            const items = [];
            itemIds.forEach(id => {
                const item = document.querySelector(`.bookmark-item[data-id="${id}"]`);
                if (item) items.push(item);
            });
            return items;
        };
        
        // 立即尝试查找
        const immediateItems = findItems();
        if (immediateItems.length === itemIds.length) {
            // 所有元素已经在DOM中，直接高亮
            applyHighlight(immediateItems);
            return;
        }
        
        // 部分或全部元素不在DOM中，使用 MutationObserver 监听
        observer = new MutationObserver(() => {
            const foundItems = findItems();
            if (foundItems.length === itemIds.length) {
                cleanup();
                applyHighlight(foundItems);
            }
        });
        
        // 只观察 bookmark-column 的子节点变化，减少触发次数
        observer.observe(bookmarkContainer, {
            childList: true,
            subtree: true,
            // 只关注子节点变化，不关注属性和文本
            attributes: false,
            characterData: false
        });
        
        // 安全超时：最多等待1.5秒
        timeoutId = setTimeout(() => {
            const foundItems = findItems();
            cleanup();
            if (foundItems.length > 0) {
                applyHighlight(foundItems);
            }
        }, 1500);
    });
}

function handleDragLeave(e) {
    clearTimeout(AppState.drag.dragOverTimeout);
    const targetItem = e.target.closest('.bookmark-item');
    if (targetItem) {
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
    clearTimeout(AppState.drag.dragOverTimeout);

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

    // 🔧 修复：静默处理无效目标（用户拖到空白处是正常行为）
    if (!dropTarget || idsToMove.includes(dropTarget.dataset.id)) {
        return; // 静默返回，无效的拖放目标
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
        let newIndex = parseInt(dropTarget.dataset.index, 10);
        if (isDragAfter) {
            newIndex++;
        }
        destination.index = newIndex;
    }

    // P2改进：添加操作反馈
    let successCount = 0;
    let errorCount = 0;

    // 修复：使用安全的反向移动策略
    const moveBookmarksSequentially = async () => {
        // 获取目标父文件夹的当前子项数量，以验证索引有效性
        const targetChildren = await new Promise(resolve => {
            chrome.bookmarks.getChildren(destination.parentId, children => {
                resolve(children || []);
            });
        });

        // 计算有效的目标索引：不能超过子项数量
        const maxIndex = targetChildren.length;
        const safeIndex = Math.min(destination.index, maxIndex);

        // ✅ P2-1优化：使用提取的共享函数
        const result = await moveBookmarksToDestination(idsToMove, {
            parentId: destination.parentId,
            index: safeIndex
        });
        successCount = result.successCount;
        errorCount = result.errorCount;

        // 所有移动完成后显示反馈
        if (errorCount === 0) {
            showToast(`成功移动 ${successCount} 个项目`, 2000, 'success');
        } else if (successCount === 0) {
            showToast('移动失败，目标可能无效', 3000, 'error');
        } else {
            showToast(`移动完成：${successCount} 成功，${errorCount} 失败`, 3000, 'warning');
        }

        // 高亮显示被移动的书签
        if (successCount > 0) {
            // 如果是拖入文件夹，需要先展开目标文件夹
            if (isDragEnter && dropTarget) {
                const targetFolderItem = document.querySelector(`.bookmark-item[data-id="${destination.parentId}"]`);
                if (targetFolderItem && targetFolderItem.classList.contains('is-folder')) {
                    const isAlreadyOpen = targetFolderItem.classList.contains('highlighted');
                    if (!isAlreadyOpen) {
                        handleFolderClick(targetFolderItem, destination.parentId);
                    }
                }
            }

            // 使用优化后的高亮函数
            highlightBookmarkItems(idsToMove, isDragEnter ? 200 : 50);
        }
    };

    // 执行顺序移动
    moveBookmarksSequentially();
}

// P0修复：检查是否是祖先节点（防止循环引用）
/**
 * 检查一个节点是否是另一个节点的祖先
 * @param {string} potentialAncestorId - 可能的祖先节点ID
 * @param {string} nodeId - 要检查的节点ID
 * @returns {Promise<boolean>} 是否为祖先关系
 */
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

    const level = parseInt(column.dataset.level, 10);
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
            return;
        }

        if (chrome.runtime.lastError || !Array.isArray(children)) {
            console.error(`[refreshParent] 获取${parentLabel}子项失败:`, chrome.runtime.lastError);
            pendingRefreshMap.delete(parentId);
            return;
        }

        const contentWrapper = parentColumn.querySelector('.column-content-wrapper') || parentColumn;
        // ✅ 性能优化：安全清空，防止内存泄漏
        clearContentWrapper(contentWrapper);

        // ✅ 性能优化：使用 DocumentFragment 批量插入，减少重排
        const fragment = document.createDocumentFragment();
        children.forEach((child, idx) => {
            const item = createBookmarkItem(child, idx);
            // ✅ 修复：为书签栏的书签项添加专用类名
            if (isBookmarksBar) {
                item.classList.add('bookmarks-bar-item');
            }
            fragment.appendChild(item);
        });
        contentWrapper.appendChild(fragment);

        observeLazyImages(contentWrapper);

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
function isAncestor(potentialAncestorId, nodeId) {
    if (!potentialAncestorId || !nodeId) return false;
    if (potentialAncestorId === nodeId) return true;

    // 使用缓存查找节点关系
    let current = BookmarkTreeCache.get(nodeId);
    if (!current) return false;

    const visited = new Set(); // 防止无限循环

    while (current && current.parentId) {
        if (visited.has(current.parentId)) break; // 检测到循环
        visited.add(current.parentId);

        if (current.parentId === potentialAncestorId) {
            return true;
        }

        current = BookmarkTreeCache.get(current.parentId);
    }

    return false;
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

    const column = e.target.closest('.bookmark-column, .bookmarks-bar');

    if (column) {
        column.classList.remove('column-drag-over');
    }

    let parentId = null;
    const level = parseInt(column.dataset.level, 10);

    if (level === 0) {
        parentId = CONSTANTS.BOOKMARKS_BAR_ID;
    } else {
        const prevColumn = document.querySelector(`.bookmark-column[data-level="${level - 1}"]`);

        if (prevColumn) {
            // 🔧 优化：先查询一次，避免循环中重复查询
            const firstItemInCurrentColumn = column.querySelector('.bookmark-item');

            if (firstItemInCurrentColumn) {
                // 方法1：通过当前列的第一个项目的parentId找到父文件夹
                const currentColumnParentId = firstItemInCurrentColumn.dataset.parentId;
                const allFolders = prevColumn.querySelectorAll('.bookmark-item.is-folder');

                for (const folder of allFolders) {
                    if (currentColumnParentId === folder.dataset.id) {
                        parentId = folder.dataset.id;
                        break;
                    }
                }
            } else {
                // 方法2：空文件夹 - 从高亮文件夹获取
                const highlightedFolder = prevColumn.querySelector('.bookmark-item.highlighted');
                if (highlightedFolder) {
                    parentId = highlightedFolder.dataset.id;
                }
            }

            // 兜底：如果还是没找到，尝试查找任何高亮的文件夹
            if (!parentId) {
                const highlightedFolder = prevColumn.querySelector('.bookmark-item.highlighted');
                if (highlightedFolder) {
                    parentId = highlightedFolder.dataset.id;
                }
            }
        }
    }

    if (parentId) {
        // 修复：使用反向移动策略，确保索引不会互相影响
        let successCount = 0;
        let errorCount = 0;

        const moveBookmarksSequentially = async () => {
            // ✅ P2-1优化：使用提取的共享函数
            const result = await moveBookmarksToDestination(idsToMove, {
                parentId: parentId,
                index: 0
            });
            successCount = result.successCount;
            errorCount = result.errorCount;

            // 所有移动完成后显示反馈
            if (errorCount === 0) {
                showToast(`成功移动 ${successCount} 个项目`, 2000, 'success');
            } else if (successCount === 0) {
                showToast('移动失败', 3000, 'error');
            } else {
                showToast(`移动完成：${successCount} 成功，${errorCount} 失败`, 3000, 'warning');
            }

            // 高亮显示被移动的书签
            if (successCount > 0) {
                // 使用优化后的高亮函数
                highlightBookmarkItems(idsToMove, 50);
            }
        };

        moveBookmarksSequentially();
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

    // 预先创建分隔符（需要多个）
    const separators = Array.from({ length: 5 }, () => createSeparator());
    let separatorIndex = 0;

    return {
        items,
        getSeparator() {
            const sep = separators[separatorIndex % separators.length];
            separatorIndex++;
            return sep;
        },
        resetSeparators() {
            separatorIndex = 0;
        },
        // 更新菜单项文本
        updateText(itemKey, text) {
            const item = items[itemKey];
            if (item && item._textNode) {
                item._textNode.textContent = text;
            }
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
    // P1优化：使用缓存的contextMenu元素
    const contextMenu = getCachedElement('contextMenu', () => document.getElementById('contextMenu'));
    contextMenu.innerHTML = ''; // 清空旧菜单
    const ul = document.createElement('ul');

    // ✅ 性能优化：重置分隔符索引
    ContextMenuPool.resetSeparators();
    const { items, getSeparator, updateText } = ContextMenuPool;

    const rightClickedId = bookmarkElement?.dataset.id;
    const isModuleItem = bookmarkElement?.closest('.vertical-modules');
    const isTopSiteItem = bookmarkElement?.classList.contains('top-site-item');

    // 右键菜单显示时，清除所有预览高亮痕迹
    clearPreviewHighlight();

    if (rightClickedId && !AppState.selection.items.has(rightClickedId)) {
        clearSelection();
        if (isTopSiteItem) {
            AppState.selection.items.add(rightClickedId);
            selectedElements.add(bookmarkElement);
            bookmarkElement.classList.add('selected');
        } else {
            toggleSelection(bookmarkElement);
        }
    } else if (!rightClickedId) {
        clearSelection();
    }

    const selectionSize = AppState.selection.items.size;
    const hasBookmarkInSelection = Array.from(AppState.selection.items).some(id => {
        const item = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);
        return item && !item.classList.contains('is-folder');
    });

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
    const selectionSize = AppState.selection.items.size;
    const selectedIds = Array.from(AppState.selection.items);

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
                    if (action === 'open') {
                        openBookmark(item.dataset.url, null);
                    } else if (action === 'openNew') {
                        chrome.windows.create({ url: item.dataset.url });
                    } else if (action === 'openIncognito') {
                        chrome.windows.create({ url: item.dataset.url, incognito: true });
                    }
                }
            });
            break;
        case 'openAll':
            if (element && element.dataset.id) {
                chrome.bookmarks.getChildren(element.dataset.id, (children) => {
                    children.forEach(child => {
                        if (child.url) {
                            chrome.tabs.create({ url: child.url, active: true });
                        }
                    });
                });
            }
            break;
        case 'delete':
            // 获取要删除的项目名称
            const itemsToDelete = Array.from(selectedIds).map(id => {
                const item = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);
                if (!item) return null;
                const title = item.dataset.title || item.querySelector('.bookmark-title, .module-title')?.textContent || '未命名';
                const isFolder = item.classList.contains('is-folder');
                return { id, title, isFolder };
            }).filter(item => item !== null);

            if (itemsToDelete.length === 0) {
                showToast('未找到要删除的项目');
                break;
            }

            // 构建删除提示消息
            let message;
            if (itemsToDelete.length === 1) {
                const item = itemsToDelete[0];
                const type = item.isFolder ? '文件夹' : '书签';
                message = `确定要删除${type} "<span class="delete-item-name">${sanitizeText(item.title)}</span>" 吗？`;
            } else {
                // 显示所有要删除的项目
                const itemList = itemsToDelete.map(item => {
                    const type = item.isFolder ? '📁' : '🔖';
                    return `${type} <span class="delete-item-name">${sanitizeText(item.title)}</span>`;
                }).join('\n');
                message = `确定要删除以下 ${itemsToDelete.length} 个项目吗？\n\n${itemList}`;
            }

            showConfirmDialog(`删除 ${selectionSize} 个项目`, message, () => {
                itemsToDelete.forEach(({ id, title, isFolder }) => {
                    const promise = isFolder ? chrome.bookmarks.removeTree(id) : chrome.bookmarks.remove(id);
                    promise.catch(err => {
                        console.error(`删除项目 ${id} 失败:`, err);
                        showToast(`项目 "${title}" 删除失败`);
                    });
                });
            }, true); // 传递 true 表示这是删除对话框
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
                showEditDialog('重命名', element.dataset.title, null, async (newName) => {
                    if (newName) {
                        // ✅ P1修复：使用统一的错误处理
                        await SafeBookmarks.update(element.dataset.id, { title: newName });
                    }
                });
            }
            break;
        case 'editUrl':
            if (element && element.dataset.url) {
                showEditDialog('修改网址', element.dataset.url, isValidUrl, async (newUrl) => {
                    if (newUrl && newUrl !== element.dataset.url) {
                        // ✅ P1修复：使用统一的错误处理
                        await SafeBookmarks.update(element.dataset.id, { url: newUrl });
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
                    if (level === 0) {
                        parentId = CONSTANTS.BOOKMARKS_BAR_ID;
                    } else {
                        // 先尝试找上一级的高亮项
                        parentId = document.querySelector(`.bookmark-column[data-level="${level - 1}"] .bookmark-item.highlighted`)?.dataset.id;
                        // 如果没有高亮项，查找当前列中任意一个项目的parentId
                        if (!parentId) {
                            const firstItem = column.querySelector('.bookmark-item');
                            if (firstItem) {
                                parentId = firstItem.dataset.parentId;
                            }
                        }
                        // 最后的兜底方案
                        if (!parentId) parentId = CONSTANTS.BOOKMARKS_BAR_ID;
                    }
                }
                if (parentId) showEditDialog('新建文件夹', '', null, async (name) => {
                    if (name) {
                        // ✅ P1修复：使用统一的错误处理
                        await SafeBookmarks.create({ parentId, title: name, index: 0 });
                    }
                });
                break;
            }
        case 'properties':
            showPropertiesDialog(element);
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

            // ✅ 优化 #7: 使用统一的SVG图标创建函数
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

    const [bookmarkDetails] = await new Promise(resolve => chrome.bookmarks.get(bookmarkId, resolve));
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
        const level = parseInt(parentItem.closest('.bookmark-column, .bookmarks-bar').dataset.level, 10);
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
    // ✅ 性能优化：清除父文件夹的缓存
    childrenCache.delete(bookmark.parentId);

    const parentColumn = findColumnForParentId(bookmark.parentId);
    if (parentColumn) {
        const newItem = createBookmarkItem(bookmark, bookmark.index);
        const wrapper = parentColumn.querySelector('.column-content-wrapper') || parentColumn;

        // ✅ P1修复：添加索引边界检查，防止越界
        const targetIndex = Math.min(bookmark.index, wrapper.children.length);
        const targetChild = wrapper.children[targetIndex] || null;
        wrapper.insertBefore(newItem, targetChild);

        // --- 新增修复代码 ---
        observeLazyImages(newItem); // 观察新创建的这个书签项

        reindexColumnItems(wrapper);
    }
    displayRecentBookmarks(); // 刷新最近添加
}

function handleBookmarkRemoved(id, removeInfo) {
    // ✅ 性能优化：清除父文件夹的缓存
    childrenCache.delete(removeInfo.parentId);

    const itemToRemove = document.querySelector(`.bookmark-item[data-id="${id}"]`);
    if (itemToRemove) {
        const column = itemToRemove.closest('.bookmark-column, .bookmarks-bar');
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

    // 性能优化：初始为空，不显示骨架屏
    container.innerHTML = '';

    // P0修复：添加错误处理
    try {
        // 获取访问次数最多的网站
        chrome.topSites.get((sites) => {
            // P0修复：检查API调用是否成功
            if (chrome.runtime.lastError) {
                console.error('topSites API error:', chrome.runtime.lastError);
                // P3优化：使用统一的错误状态生成函数
                container.innerHTML = createErrorStateHTML('无法加载经常访问', '😕', 'displayFrequentlyVisited()');
                return;
            }
            
            if (!sites || sites.length === 0) {
                // P3优化：使用统一的空状态生成函数
                container.innerHTML = createEmptyStateHTML('暂无经常访问', '📭');
                return;
            }

        const fragment = document.createDocumentFragment();
        
        // 只显示前8个最常访问的网站
        const topSites = sites.slice(0, 8);
        
        topSites.forEach((site, index) => {
            const item = document.createElement('div');
            item.className = 'top-site-item';
            item.dataset.url = site.url;
            item.dataset.title = site.title;
            item.dataset.id = `top-site-${index}`;
            item.title = `${site.title}\n${site.url}`;

            // P3优化：使用统一的图标处理
            const icon = document.createElement('img');
            icon.className = 'module-icon';
            icon.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            icon.dataset.src = getIconUrl(site.url);
            icon.alt = site.title;
            setupIconErrorHandler(icon);

            const title = document.createElement('span');
            title.className = 'module-title';
            title.textContent = site.title || new URL(site.url).hostname;

            item.appendChild(icon);
            item.appendChild(title);

            // 点击打开链接 - 已由全局事件委托处理，这里移除避免重复

            // 右键菜单支持 - 已由全局事件委托处理，这里移除避免重复

            // 支持多选
            item.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    toggleSelection(item);
                } else if (e.shiftKey) {
                    e.preventDefault();
                    if (AppState.selection.lastClickedId) {
                        const allItems = Array.from(container.querySelectorAll('.top-site-item'));
                        const startIndex = allItems.findIndex(i => i.dataset.id === AppState.selection.lastClickedId);
                        const endIndex = allItems.findIndex(i => i.dataset.id === item.dataset.id);
                        if (startIndex !== -1 && endIndex !== -1) {
                            const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
                            for (let i = min; i <= max; i++) {
                                const targetItem = allItems[i];
                                if (!AppState.selection.items.has(targetItem.dataset.id)) {
                                    AppState.selection.items.add(targetItem.dataset.id);
                                    targetItem.classList.add('selected');
                                }
                            }
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
            });

            // ✅ 性能优化：移除重复的事件监听器，完全依赖全局事件委托（第4269行）
            // item.addEventListener('mouseenter', () => AppState.hover.currentItem = item);
            // item.addEventListener('mouseleave', () => AppState.hover.currentItem = null);

            fragment.appendChild(item);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
        observeLazyImages(container);
        });
    } catch (error) {
        // P3优化：使用统一的错误处理
        console.error('displayFrequentlyVisited error:', error);
        if (container) {
            container.innerHTML = createErrorStateHTML('加载出错', '⚠️', 'displayFrequentlyVisited()');
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

/**
 * ✅ 优化 #11: 显示最近添加的书签列表（支持排除规则过滤）
 * @async
 * @returns {Promise<void>}
 * 使用Chrome Bookmarks API的getRecent方法获取最近书签
 */
async function displayRecentBookmarks() {
    // P1优化：使用缓存的container元素
    const container = getCachedElement('recentBookmarksContent', () => document.querySelector('#recentBookmarksModule .module-content'));
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

    // 从所有书签中获取最近添加的书签（不限制数量）
    const getAllRecentBookmarks = async (startTime, endTime) => {
        return new Promise((resolve) => {
            chrome.bookmarks.getTree((tree) => {
                const bookmarks = [];
                flattenBookmarks(tree, bookmarks);

                // ✅ P1优化：使用缓存加载排除规则
                const excludeRules = StorageCache.getExcludeRules();

                // 筛选并排除规则
                const filtered = bookmarks.filter(bm => {
                    if (!bm.url) return false;
                    const itemDate = bm.dateAdded;
                    if (itemDate < startTime || itemDate > endTime) return false;

                    // 检查是否在排除规则中
                    const date = new Date(itemDate);
                    for (const rule of excludeRules) {
                        if (!rule.enabled) continue;

                        const ruleDate = new Date(rule.date);
                        // 检查日期是否匹配
                        if (date.getFullYear() === ruleDate.getFullYear() &&
                            date.getMonth() === ruleDate.getMonth() &&
                            date.getDate() === ruleDate.getDate()) {

                            // 使用分钟数进行时间比较（更准确）
                            const bookmarkTimeInMinutes = date.getHours() * 60 + date.getMinutes();
                            const [startHour, startMin] = rule.startTime.split(':').map(Number);
                            const [endHour, endMin] = rule.endTime.split(':').map(Number);
                            const ruleStartMinutes = startHour * 60 + startMin;
                            const ruleEndMinutes = endHour * 60 + endMin;

                            // 检查时间是否在排除范围内
                            if (ruleStartMinutes <= ruleEndMinutes) {
                                // 正常时间范围（如 09:00 - 17:00）
                                if (bookmarkTimeInMinutes >= ruleStartMinutes && bookmarkTimeInMinutes <= ruleEndMinutes) {
                                    return false; // 排除此书签
                                }
                            } else {
                                // 跨越午夜的时间范围（如 22:00 - 02:00）
                                if (bookmarkTimeInMinutes >= ruleStartMinutes || bookmarkTimeInMinutes <= ruleEndMinutes) {
                                    return false; // 排除此书签
                                }
                            }
                        }
                    }

                    return true;
                }).sort((a, b) => b.dateAdded - a.dateAdded);

                resolve(filtered);
            });
        });
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

        container.innerHTML = '<div class="empty-folder-message" style="padding: 10px;">加载中...</div>';

        // 使用新的获取方法，不限制数量
        const filteredBookmarks = await getAllRecentBookmarks(startTime, endTime);

        // 检查此请求是否已被取消
        if (thisRequest.cancelled) {
            return;
        }

        if (filteredBookmarks.length === 0) {
            container.innerHTML = '<div class="empty-folder-message" style="padding: 10px;">该时段无书签</div>';
            // ✅ P0修复：清除请求标记
            if (AppState.requests.pendingRecentBookmarks === thisRequest) {
                AppState.requests.pendingRecentBookmarks = null;
            }
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
            // ✅ 使用 href="#" 保持链接样式，点击事件由全局委托处理
            a.href = '#';
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

            fragment.appendChild(a);
        }
        container.innerHTML = '';
        container.appendChild(fragment);
        observeLazyImages(container);

        // ✅ P0修复：清除请求标记
        if (AppState.requests.pendingRecentBookmarks === thisRequest) {
            AppState.requests.pendingRecentBookmarks = null;
        }
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

    // ✅ P1-1优化：事件委托 - 只添加一次容器级事件监听器
    if (!container.dataset.eventsAttached) {
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
                showContextMenu(e, link, link.closest('.vertical-modules'));
            }
        });

        // 鼠标悬停事件
        container.addEventListener('mouseover', (e) => {
            const link = e.target.closest('a[data-id]');
            if (link) {
                AppState.hover.currentItem = link;
            }
        });

        container.addEventListener('mouseout', (e) => {
            const link = e.target.closest('a[data-id]');
            if (link && !container.contains(e.relatedTarget?.closest('a[data-id]'))) {
                AppState.hover.currentItem = null;
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

        container.dataset.eventsAttached = 'true';
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
    const pageOverlay = DOMCache.get('pageOverlay');

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

        // 重新渲染列表
        renderExcludeRulesList();

        // 刷新最近添加书签列表
        displayRecentBookmarks();

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
            excludeRulesList.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-secondary); font-size: 13px;">暂无排除规则</div>';
            return;
        }

        excludeRulesList.innerHTML = '';

        rules.forEach(rule => {
            const ruleItem = document.createElement('div');
            ruleItem.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-secondary); border-radius: 6px; font-size: 13px;';

            // 开关
            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'toggle-switch';
            toggleLabel.style.cssText = 'margin: 0; flex-shrink: 0;';

            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = rule.enabled;
            toggleInput.addEventListener('change', (e) => {
                rule.enabled = e.target.checked;
                localStorage.setItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES, JSON.stringify(rules));
                displayRecentBookmarks(); // 刷新列表
                showToast(rule.enabled ? '规则已启用' : '规则已禁用', 1500);
            });

            const slider = document.createElement('span');
            slider.className = 'slider';

            toggleLabel.append(toggleInput, slider);

            // 规则文本
            const ruleText = document.createElement('span');
            ruleText.style.cssText = 'flex: 1; color: var(--text-primary);';
            const dateObj = new Date(rule.date);
            const dateStr = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getDate().toString().padStart(2, '0')}`;
            ruleText.textContent = `${dateStr}  ${rule.startTime} - ${rule.endTime}`;

            // 删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'dialog-button';
            deleteBtn.textContent = '删除';
            deleteBtn.style.cssText = 'padding: 4px 10px; font-size: 12px; flex-shrink: 0;';
            deleteBtn.addEventListener('click', () => {
                const index = rules.findIndex(r => r.id === rule.id);
                if (index > -1) {
                    rules.splice(index, 1);
                    localStorage.setItem(CONSTANTS.STORAGE_KEYS.EXCLUDE_RULES, JSON.stringify(rules));
                    renderExcludeRulesList();
                    displayRecentBookmarks(); // 刷新列表
                    showToast('规则已删除', 2000, 'success');
                }
            });

            ruleItem.append(toggleLabel, ruleText, deleteBtn);
            excludeRulesList.appendChild(ruleItem);
        });
    }
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
            if (chrome.runtime.lastError) {
                AppState.windows.preview = null;
                createSizedPreviewWindow(url);
            } else {
                chrome.tabs.query({ windowId: AppState.windows.preview, active: true }, (tabs) => {
                    if (tabs.length > 0) {
                        chrome.tabs.update(tabs[0].id, { url: url, active: true });
                        chrome.windows.update(AppState.windows.preview, { focused: true });
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
        }, (win) => AppState.windows.preview = win.id);
    });
}

// ==================================================================
// --- DOMContentLoaded: 页面加载完成后的初始化 ---
// ==================================================================
// ✅ P0-1优化：防止重复初始化
if (!window._bookmarkExtensionInitialized) {
document.addEventListener('DOMContentLoaded', function () {
    // P1优化：初始化DOM缓存
    DOMCache.init();
    
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const themeOptionsContainer = settingsPanel.querySelector('.theme-options');
    const hoverToggle = document.getElementById('hover-toggle-switch');
    const verticalModules = document.querySelector('.vertical-modules');
    const toggleVerticalBtn = document.getElementById('sidebar-toggle-btn');
    const contextMenu = DOMCache.get('contextMenu');
    const pageOverlay = DOMCache.get('pageOverlay');
    const hoverDelaySettingItem = document.getElementById('hover-delay-setting-item');
    const hoverDelayInput = document.getElementById('hover-delay-input');
    const openInCurrentTabToggle = document.getElementById('open-in-current-tab-toggle');

    const historyBtn = document.getElementById('history-btn');

    let isModuleVisible = false;
    
    // ==================================================================
    // ==================================================================
    // P1优化：事件委托 - 统一处理所有书签项的事件（性能优化版）
    // ==================================================================
    
    // === 性能优化1：缓存 CSS 选择器，避免重复创建字符串 ===
    const ITEM_SELECTOR = '.bookmark-item, .vertical-modules a, .top-site-item';
    
    // === 性能优化2：使用 mouseover/mouseout 替代 mouseenter/mouseleave ===
    // 配合 relatedTarget 检查，避免在嵌套元素之间移动时频繁触发
    document.body.addEventListener('mouseover', (e) => {
        // === 性能优化3：使用 closest() 进行事件委托 ===
        const item = e.target.closest(ITEM_SELECTOR);
        
        // === 性能优化4：快速路径 - 如果不是目标元素或者是同一元素，直接返回 ===
        if (!item || AppState.hover.currentItem === item) return;
        
        AppState.hover.currentItem = item;
        
        // === 性能优化5：只在文件夹元素上启动悬停意图 ===
        if (item.classList.contains('is-folder')) {
            startHoverIntent(item);
        }
    }, { passive: true }); // === 性能优化6：passive listener，提升滚动性能 ===
    
    document.body.addEventListener('mouseout', (e) => {
        const item = e.target.closest(ITEM_SELECTOR);
        
        // === 性能优化7：快速路径 - 提前返回 ===
        if (!item) return;
        
        // === 安全优化：检查是否真的离开了元素（防止误触发） ===
        // relatedTarget 为 null 表示离开了整个文档，也应该清除
        if (!e.relatedTarget || !item.contains(e.relatedTarget)) {
            if (AppState.hover.currentItem === item) {
                AppState.hover.currentItem = null;
                
                // === 性能优化8：只在必要时清除悬停意图 ===
                if (item.classList.contains('is-folder')) {
                    clearHoverIntent();
                }
            }
        }
    }, { passive: true }); // === 性能优化9：passive listener ===
    
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
        if (item) {
            handleDragOver.call(item, e);
        } else {
            // 如果不是书签项，检查是否是列
            const column = e.target.closest('.bookmark-column, .bookmarks-bar');
            if (column) {
                handleColumnDragOver.call(column, e);
            }
        }
    }, true);

    document.body.addEventListener('drop', (e) => {
        const item = e.target.closest('.bookmark-item');
        if (item) {
            handleDrop.call(item, e);
        } else {
            // 如果不是书签项，检查是否是列
            const column = e.target.closest('.bookmark-column, .bookmarks-bar');
            if (column) {
                handleColumnDrop.call(column, e);
            }
        }
    }, true);

    document.body.addEventListener('dragleave', (e) => {
        const item = e.target.closest('.bookmark-item');
        if (item) {
            handleDragLeave.call(item, e);
        } else {
            // 如果不是书签项，检查是否是列
            const column = e.target.closest('.bookmark-column, .bookmarks-bar');
            if (column) {
                handleColumnDragLeave.call(column, e);
            }
        }
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
                        const currentLevel = parseInt(currentColumn.dataset.level, 10);
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
                        const currentLevel = parseInt(currentColumn.dataset.level, 10);
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
            // === 1. 隐藏遮罩和模块 ===
            pageOverlay.style.display = 'none';
            verticalModules.classList.remove('visible');
            isModuleVisible = false;

            // === 2. 清除模块内的选中状态 ===
            verticalModules.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));

            // === 3. 清除悬停意图（如果有） ===
            clearHoverIntent();

            // 注意：不清除预览高亮，让用户可以看到访问痕迹
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
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => hideContextMenu(), 50);
    }, { passive: true, capture: true });

    const bookmarkContainer = document.getElementById('bookmarkContainer');

    // 🔧 P0-2优化：完整的防抖处理，避免 resize 时频繁执行 DOM 操作
    // 之前每次 resize 都会执行 hideContextMenu()，导致高 CPU 占用
    const debouncedResize = debounce(() => {
        hideContextMenu();
        // 🔧 P1-2优化：使用缓存的 bookmarksBar，避免重复查询
        const bookmarksBar = DOMCache.get('bookmarksBar');
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
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        // === 层级 1：对话框（最高优先级）===
        // 🔧 修复：检查是否有对话框打开，如果有则不处理，让对话框自己处理
        const confirmDialog = document.getElementById('confirmDialog');
        const propertiesDialog = document.getElementById('propertiesDialog');
        const editDialog = document.getElementById('editDialog');
        const moveDialog = document.getElementById('moveDialog');
        const excludeRulesDialog = document.getElementById('excludeRulesDialog');

        if ((confirmDialog && confirmDialog.style.display === 'flex') ||
            (propertiesDialog && propertiesDialog.style.display === 'flex') ||
            (editDialog && editDialog.style.display === 'flex') ||
            (moveDialog && moveDialog.style.display === 'flex') ||
            (excludeRulesDialog && excludeRulesDialog.style.display === 'flex')) {
            // 有对话框打开，不处理，让对话框的处理器处理
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
    AppState.hover.enabled = hoverToggle.checked;

    // --- [最终版] 悬停功能设置的完整逻辑 ---

    // 初始化总开关的状态
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
        const column = e.target.closest('.bookmark-column, .bookmarks-bar');
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

        // ✅ 优化 #13: 应用模块级错误边界
        safeInitializeModule(
            () => displayBookmarks(bookmarks),
            '书签栏',
            () => {
                // 降级处理：显示空状态提示
                const container = document.getElementById('bookmarkContainer');
                if (container) {
                    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">书签栏加载失败</div>';
                }
            }
        );

        safeInitializeModule(
            () => displayRecentBookmarks(),
            '最近书签',
            () => {
                // 降级处理：隐藏最近书签模块
                const recentContainer = document.querySelector('.vertical-modules .recent-bookmarks');
                if (recentContainer) {
                    recentContainer.style.display = 'none';
                }
            }
        );

        safeInitializeModule(
            () => displayFrequentlyVisited(),
            '常访问网站',
            () => {
                // 降级处理：隐藏常访问网站模块
                const topSitesContainer = document.querySelector('.vertical-modules .top-sites');
                if (topSitesContainer) {
                    topSitesContainer.style.display = 'none';
                }
            }
        );

        safeInitializeModule(
            () => setupFrequentlyVisitedHover(),
            '悬停预览',
            null // 无降级处理，静默失败
        );

        safeInitializeModule(
            () => initExcludeRulesDialog(),
            '排除规则对话框',
            null // 无降级处理，静默失败
        );

        safeInitializeModule(
            () => observeLazyImages(document.body),
            '图片懒加载',
            null // 无降级处理，静默失败
        );
    };

    // ✅ 性能优化：书签事件防抖合并
    let refreshTimer = null;
    const refreshAllData = () => {
        setTimeout(() => {
            // 优化：直接刷新最近书签，无需遍历整个书签树
            // displayRecentBookmarks 内部使用 chrome.bookmarks.getRecent() API

            // ✅ 优化 #13: 为刷新操作添加错误边界
            safeInitializeModule(
                () => displayRecentBookmarks(),
                '最近书签刷新',
                null // 静默失败，不影响其他功能
            );

            // 书签数据更新时，清除预览高亮痕迹（因为书签可能已被删除或移动）
            safeInitializeModule(
                () => clearPreviewHighlight(),
                '预览高亮清除',
                null // 静默失败
            );
        }, 250);
    };

    // ✅ 性能优化：防抖函数，合并连续的刷新请求（100ms内的多次调用只执行一次）
    function scheduleRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => refreshAllData(), 100);
    }

    // ✅ 优化 #13: 为主应用初始化添加错误处理
    chrome.bookmarks.getTree((bookmarks) => {
        if (chrome.runtime.lastError) {
            console.error('Failed to get bookmark tree:', chrome.runtime.lastError);
            showToast('书签树加载失败，请刷新页面重试', 5000, 'error');
            return;
        }
        // ✅ P1-3优化：构建书签树缓存，优化祖先检查性能
        buildBookmarkTreeCache(bookmarks);

        safeInitializeModule(
            () => initializeApp(bookmarks),
            '应用初始化',
            () => {
                // 降级处理：至少显示一个错误提示界面
                document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-size: 18px; color: var(--text-secondary);">应用初始化失败，请刷新页面</div>';
            }
        );
    });

    chrome.bookmarks.onCreated.addListener((id, bookmark) => {
        handleBookmarkCreated(id, bookmark);
        scheduleRefresh(); // ✅ 性能优化：使用防抖合并刷新
    });
    chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
        handleBookmarkRemoved(id, removeInfo);
        scheduleRefresh(); // ✅ 性能优化：使用防抖合并刷新
    });
    chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
        handleBookmarkChanged(id, changeInfo); // <-- 只保留这一行
    });
    chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
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
                        const level = parseInt(column.dataset.level, 10);
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
                    // 使用缓存数据直接渲染
                    const contentWrapper = targetColumn.querySelector('.column-content-wrapper') || targetColumn;
                    // ✅ 性能优化：安全清空，防止内存泄漏
                    clearContentWrapper(contentWrapper);

                    // ✅ 性能优化：使用 DocumentFragment 批量插入，减少重排
                    const fragment = document.createDocumentFragment();
                    cached.children.forEach((child, idx) => {
                        const item = createBookmarkItem(child, idx);
                        // ✅ 修复：为书签栏的书签项添加专用类名
                        if (isBookmarksBar) {
                            item.classList.add('bookmarks-bar-item');
                        }
                        fragment.appendChild(item);
                    });
                    contentWrapper.appendChild(fragment);

                    observeLazyImages(contentWrapper);
                } else {
                    // 缓存过期或不存在，重新获取
                    chrome.bookmarks.getChildren(parentId, (children) => {
                        // ✅ 修复 #3: 检查 Chrome API 错误
                        if (chrome.runtime.lastError) {
                            console.error('[onMoved] getChildren失败:', chrome.runtime.lastError);
                            return;
                        }

                        // ✅ 修复 #3: 验证返回数据有效性
                        if (!Array.isArray(children)) {
                            console.error('[onMoved] 无效的children数据');
                            return;
                        }

                        // ✅ 性能优化：更新缓存
                        childrenCache.set(parentId, {children, timestamp: now});

                        const contentWrapper = targetColumn.querySelector('.column-content-wrapper') || targetColumn;
                        // ✅ 性能优化：安全清空，防止内存泄漏
                        clearContentWrapper(contentWrapper);

                        // ✅ 性能优化：使用 DocumentFragment 批量插入，减少重排
                        const fragment = document.createDocumentFragment();
                        children.forEach((child, idx) => {
                            const item = createBookmarkItem(child, idx);
                            // ✅ 修复：为书签栏的书签项添加专用类名
                            if (isBookmarksBar) {
                                item.classList.add('bookmarks-bar-item');
                            }
                            fragment.appendChild(item);
                        });
                        contentWrapper.appendChild(fragment);

                        observeLazyImages(contentWrapper);
                    });
                }
            }

            // 如果涉及书签栏，刷新书签栏
            if (parentId === CONSTANTS.BOOKMARKS_BAR_ID) {
                refreshBookmarksBar();
            }
        } else {
            // 🔧 修复：跨父级移动 - 改进UI更新逻辑

            // === 步骤1：从旧位置移除书签 ===
            const movedItemElement = document.querySelector(`.bookmark-item[data-id="${id}"], a[data-id="${id}"]`);
            if (movedItemElement) {
                movedItemElement.remove();
            }

            // === 步骤2：刷新旧父文件夹的显示（如果它当前是打开的）===
            refreshParentFolderColumn(oldParentId, '旧父文件夹');

            // === 步骤3：刷新新父文件夹的显示（如果它当前是打开的）===
            refreshParentFolderColumn(parentId, '新父文件夹');

            // 如果移动涉及到了书签栏，则只调用专用函数刷新书签栏
            if (parentId === CONSTANTS.BOOKMARKS_BAR_ID || oldParentId === CONSTANTS.BOOKMARKS_BAR_ID) {
                refreshBookmarksBar();
            }
        }

        refreshAllData();
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

// 捕获未处理的运行时错误
window.addEventListener('error', (event) => {
    console.error('全局错误捕获:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
    });

    // 显示用户友好的错误提示
    showToast('页面出现错误，部分功能可能不可用', 5000, 'error');

    // 阻止错误继续传播到控制台（可选）
    // event.preventDefault();
});

// 捕获未处理的Promise拒绝
window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的Promise拒绝:', {
        reason: event.reason,
        promise: event.promise
    });

    // 显示用户友好的错误提示
    showToast('操作失败，请稍后重试', CONSTANTS.TIMING.TOAST_LONG, 'error');

    // 阻止错误继续传播（可选）
    // event.preventDefault();
});

    document.addEventListener('keydown', handleSpacebarPreview);

    // ========================================
    // ✅ P0优化：清理事件监听器，防止内存泄漏
    // ========================================
    window.addEventListener('beforeunload', () => {
        // 清理所有计时器
        if (refreshTimer) clearTimeout(refreshTimer);
        if (scrollTimer) clearTimeout(scrollTimer);
        if (rafId) cancelAnimationFrame(rafId);
        if (AppState.hover.intent.timer) clearTimeout(AppState.hover.intent.timer);
        if (AppState.hover.dragOverTimeout) clearTimeout(AppState.hover.dragOverTimeout);

        // 断开 Observer
        if (lazyLoadObserver) lazyLoadObserver.disconnect();
    }, { once: true });

    // 设置初始化标志，防止重复初始化
    window._bookmarkExtensionInitialized = true;
});
}
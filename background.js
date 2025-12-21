// Background service worker - 管理独立书签窗口

let bookmarkWindowId = null;

chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-bookmark-window') {
        toggleBookmarkWindow();
    }
});

async function toggleBookmarkWindow() {
    // 检查窗口是否存在
    if (bookmarkWindowId !== null) {
        try {
            const window = await chrome.windows.get(bookmarkWindowId);
            // 窗口存在，关闭它
            await chrome.windows.remove(bookmarkWindowId);
            bookmarkWindowId = null;
        } catch (error) {
            // 窗口不存在，创建新窗口
            bookmarkWindowId = null;
            await createBookmarkWindow();
        }
    } else {
        // 创建新窗口
        await createBookmarkWindow();
    }
}

async function createBookmarkWindow() {
    // 获取当前聚焦的窗口
    const currentWindow = await chrome.windows.getCurrent();

    // 窗口尺寸
    const width = 1200;
    const height = 800;

    // 计算居中位置
    const left = Math.round(currentWindow.left + (currentWindow.width - width) / 2);
    const top = Math.round(currentWindow.top + (currentWindow.height - height) / 2);

    const window = await chrome.windows.create({
        url: 'newtab.html?popup=true',
        type: 'popup',
        width: width,
        height: height,
        left: left,
        top: top,
        focused: true
    });
    bookmarkWindowId = window.id;
}

// 监听窗口关闭事件
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === bookmarkWindowId) {
        bookmarkWindowId = null;
    }
});

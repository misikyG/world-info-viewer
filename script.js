// 只導入我們絕對需要的核心模組
import { eventSource, event_types } from '../../script.js';

/**
 * 這是我們擴充的初始化函式。
 * 所有的邏輯都應該從這裡開始。
 */
function initialize() {
    console.log('[WI-Viewer] Extension initialized successfully!');
    // 在這裡，我們將逐步加回我們的功能...
}

// 這是整個擴充唯一的入口點。
// 我們監聽 APP_READY 事件，它保證了 SillyTavern 的所有部分都已經載入完畢。
eventSource.on(event_types.APP_READY, () => {
    // 當應用程式準備好後，才執行我們的初始化函式。
    initialize();
});

// 【簡化測試版 v2】
// 根據您提供的檔案位置資訊，重新計算路徑。
import { eventSource } from '../../script.js';

function init() {
    // 加上版本標記，確保我們執行的是新版腳本
    console.log('[Test v2] Simplified World Info Visualizer extension loaded!');

    if (eventSource) {
        console.log('[Test v2] Successfully imported eventSource from script.js!', eventSource);
    } else {
        console.error('[Test v2] Failed to import eventSource. The object is undefined.');
    }
}

// 執行初始化
init();

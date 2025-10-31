// 【簡化測試版 v3】
// 根據伺服器載入擴充的虛擬路徑重新計算，回到我們最初的猜測。
import { eventSource, characters, chat } from '../../../script.js';

function init() {
    // 加上版本標記，確保我們執行的是新版腳本
    console.log('[Test v3] Simplified World Info Visualizer extension loaded!');

    if (eventSource && characters && chat) {
        console.log('[Test v3] SUCCESS! All core modules imported correctly.');
        toastr.success('擴充功能模組載入成功！', '測試成功');
    } else {
        console.error('[Test v3] FAILED to import one or more modules.');
        console.log({ eventSource, characters, chat });
    }
}

// 執行初始化
init();

// 【簡化測試版】
// 只導入一個核心物件來測試路徑是否正確
import { eventSource } from '../../../scripts/script.js';

function init() {
    // 如果這段文字出現在控制台，代表擴充功能的主檔案 (index.js) 已經成功被載入並執行。
    console.log('Simplified World Info Visualizer extension loaded!');

    // 如果 eventSource 不是 undefined，代表 import 成功了！
    if (eventSource) {
        console.log('Successfully imported eventSource from script.js!', eventSource);
    } else {
        console.error('Failed to import eventSource. The object is undefined.');
    }
}

// 執行初始化
init();

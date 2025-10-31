// 根據官方範例，使用正確的四層相對路徑
import { eventSource, event_types } from '../../../../script.js';

// 這段程式碼只會在上面的 import 成功時執行
console.log("World Info Viewer (v4): 核心模組導入成功！擴充已準備就緒。");

// 為了確保萬無一失，我們把事件監聽也加回來測試
try {
    eventSource.on(event_types.WORLD_INFO_ACTIVATED, (entries) => {
        // 注意：在舊版 SillyTavern 中，參數可能不是陣列，所以我們做個檢查
        const data = Array.isArray(entries) ? entries : [entries];
        console.log("[WI-Viewer] 事件: WORLD_INFO_ACTIVATED. 接收到的條目:", data);
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        console.log("[WI-Viewer] 事件: CHARACTER_MESSAGE_RENDERED. 訊息 ID:", messageId);
    });

    console.log("[WI-Viewer] 事件監聽器已成功附加。");

} catch (err) {
    console.error("[WI-Viewer] 附加事件監聽器時發生錯誤:", err);
    // 即使 import 成功，如果 eventSource 不是預期的物件，這裡會報錯
}

// 立即執行的函式，避免汙染全域命名空間
(function () {
    // 為了確保所有需要的模組都已載入，我們稍微延遲一下執行
    // 這是比監聽 APP_READY 更簡單粗暴但有效的做法
    setTimeout(() => {
        try {
            // 從 SillyTavern 的全域物件中獲取需要的函式和變數
            // 這是從範例擴充中學到的、更穩定的方法，避免了複雜的 import 路徑問題
            const eventSource = SillyTavern.getContext().eventSource;
            const event_types = SillyTavern.getContext().event_types;

            // 如果核心物件不存在，就提前終止，避免後續錯誤
            if (!eventSource || !event_types) {
                console.error('[WI-Viewer] 無法獲取核心模組 (eventSource, event_types)。擴充功能無法啟動。');
                return;
            }

            let lastTriggeredWI = null;

            // 監聽 SillyTavern 內建的世界書觸發事件
            // 這是最穩定、最不會出錯的資料獲取方式
            eventSource.on(event_types.WORLD_INFO_ACTIVATED, (activatedEntries) => {
                console.log('[WI-Viewer] 捕獲到世界書觸發事件！');
                lastTriggeredWI = new Set(activatedEntries);
            });

            // 當 AI 回覆被加入 chat 陣列後
            eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
                const chat = SillyTavern.getContext().chat;
                const message = chat[messageId];
                
                // 我們只關心 AI 的訊息
                if (message && !message.is_user && !message.is_system && lastTriggeredWI) {
                    console.log(`[WI-Viewer] 訊息 #${messageId} (AI回覆) 已生成。`);
                    console.log('[WI-Viewer] 關聯的觸發資料是:', lastTriggeredWI);

                    // 為了測試，我們可以直接把資料附加到訊息物件上
                    if (!message.extra) {
                        message.extra = {};
                    }
                    message.extra.triggeredWorldInfo = lastTriggeredWI;
                    
                    // 清空，為下一次生成做準備
                    lastTriggeredWI = null;
                }
            });

            console.log('[WI-Viewer] 擴充功能已成功載入並開始監聽事件。');

        } catch (error) {
            console.error('[WI-Viewer] 擴充功能初始化失敗:', error);
            toastr.error('World Info Viewer 擴充初始化失敗，請檢查控制台日誌。', '擴充錯誤');
        }
    }, 1000); // 延遲1秒執行，確保所有東西都準備好了
})();

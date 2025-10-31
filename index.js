// [修正] 引入 SillyTavern 的核心功能時，使用了正確的變數名稱 event_types
import { eventSource, event_types as eventTypes } from '../../../../script.js';
import {
    renderExtensionTemplateAsync,
    callGenericPopup,
    POPUP_TYPE
} from '../../../extensions.js';

// ------------------------------
// 全域變數和設定
// ------------------------------

// [說明] 這個名稱必須與您的擴充功能資料夾名稱完全一致！
// 假設您的資料夾路徑是 public/extensions/third-party/st-world-info-viewer/
// 那這裡就應該是 "st-world-info-viewer"
const extensionName = "st-world-info-viewer"; 
const messageWorldInfoMap = new Map();

// [說明] 世界書位置的定義，用於分類和顯示 Emoji。
// 參考 world-info.js 中的 world_info_position 物件，這裡可以做得更完整。
const positionInfo = {
    0: { name: "角色設定前", emoji: "🟢", category: "global" },
    1: { name: "角色設定後", emoji: "🔵", category: "character" },
    2: { name: "筆記頂部", emoji: "📝", category: "other" },
    3: { name: "筆記底部", emoji: "📝", category: "other" },
    4: { name: "依深度插入", emoji: "🔗", category: "chat" },
    5: { name: "範例頂部", emoji: "💡", category: "other" },
    6: { name: "範例底部", emoji: "💡", category: "other" },
    7: { name: "通道", emoji: "🔌", category: "other" },
};

// ------------------------------
// 主要邏輯
// ------------------------------

// 步驟一：當世界書被觸發時，記錄相關資訊
// [修正] 使用了正確的事件名稱 eventTypes.WORLD_INFO_ACTIVATED
eventSource.on(eventTypes.WORLD_INFO_ACTIVATED, (activatedEntries) => {
    // 當這個事件觸發時，AI 的訊息還沒送到前端，所以我們無法立即取得 messageId。
    // SillyTavern 的流程是：
    // 1. 組合 Prompt (包含觸發世界書)
    // 2. 發送給 AI -> WORLD_INFO_ACTIVATED 事件在此時觸發
    // 3. AI 回應
    // 4. 前端接收並渲染訊息 -> MESSAGE_RECEIVED, CHARACTER_MESSAGE_RENDERED 等事件觸發
    // 因此，我們需要一個暫存區來存放這次觸發的資料。
    if (!activatedEntries || activatedEntries.length === 0) return;

    const organizedData = organizeWorldInfoData(activatedEntries);
    
    // 使用一個特殊的鍵來暫存這次觸發的資料
    messageWorldInfoMap.set('latest_trigger', organizedData);
    
    console.log(`[${extensionName}] 偵測到 ${activatedEntries.length} 個世界書觸發，已暫存。`);
});

// 步驟二：當AI訊息「開始」接收時，將暫存的資料與 messageId 關聯起來
// [說明] 我們改用 MESSAGE_RECEIVED 事件，這個事件在訊息物件被創建時觸發，比 RENDERED 更早且更可靠。
eventSource.on(eventTypes.MESSAGE_RECEIVED, (messageId, type) => {
    // 檢查是否有暫存的世界書資料
    if (messageWorldInfoMap.has('latest_trigger')) {
        const data = messageWorldInfoMap.get('latest_trigger');
        const msgIdStr = String(messageId);
        
        // 將資料與確切的 messageId 綁定
        messageWorldInfoMap.set(msgIdStr, data);
        
        // 清除暫存資料，避免汙染下一次訊息
        messageWorldInfoMap.delete('latest_trigger');
        
        console.log(`[${extensionName}] MESSAGE_RECEIVED: 已將暫存的世界書資料與訊息 #${msgIdStr} 關聯。`);
    }
});


// 步驟三：當AI訊息完全渲染到畫面上後，才開始加入按鈕
eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    const msgIdStr = String(messageId);

    // 檢查這則訊息是否有對應的世界書觸發紀錄
    if (messageWorldInfoMap.has(msgIdStr)) {
        console.log(`[${extensionName}] CHARACTER_MESSAGE_RENDERED: 訊息 #${msgIdStr} 已渲染，準備加入按鈕。`);
        addViewButtonToMessage(msgIdStr);
    } else {
        console.log(`[${extensionName}] CHARACTER_MESSAGE_RENDERED: 訊息 #${msgIdStr} 已渲染，但沒有世界書資料。`);
    }
});

// ------------------------------
// 輔助函式
// ------------------------------

/**
 * 將原始觸發資料整理成我們需要的格式
 * @param {Array} entries - 原始世界書觸發條目陣列
 * @returns {Object} 整理分類後的資料
 */
function organizeWorldInfoData(entries) {
    const organized = { global: [], character: [], chat: [], other: [] };
    entries.forEach(entry => {
        // [修正] 增加一個預設值，以防 position 是未定義的
        const posInfo = positionInfo[entry.position] || { name: `未知位置 (${entry.position})`, emoji: "❓", category: "other" };
        
        const formattedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 ${entry.uid}`,
            emoji: entry.vectorized ? '🧠' : posInfo.emoji, // 如果是向量觸發，使用特殊 emoji
            position: posInfo.name,
            content: entry.content,
            keys: entry.key && entry.key.length > 0 ? entry.key.join(", ") : "",
            secondaryKeys: entry.keysecondary && entry.keysecondary.length > 0 ? entry.keysecondary.join(", ") : "",
            depth: entry.depth ?? "" // 使用空值合併運算子，更安全
        };

        // 根據您範本的分類邏輯進行分類
        if (formattedEntry.emoji === '🟢') {
            organized.global.push(formattedEntry);
        } else if (formattedEntry.emoji === '🔵') {
            organized.character.push(formattedEntry);
        } else if (formattedEntry.emoji === '🔗' || formattedEntry.emoji === '🧠') {
            organized.chat.push(formattedEntry);
        } else {
            organized.other.push(formattedEntry);
        }
    });
    return organized;
}

/**
 * 為指定的訊息添加「查看世界書」按鈕
 * @param {string} messageId - 訊息的ID
 */
function addViewButtonToMessage(messageId) {
    // 使用 setTimeout 確保 DOM 完全穩定
    setTimeout(() => {
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) {
            console.error(`[${extensionName}] addViewButtonToMessage: 找不到 ID 為 ${messageId} 的訊息元素。`);
            return;
        }

        // 防止重複添加按鈕
        if (messageElement.querySelector(".worldinfo-viewer-btn")) {
            console.log(`[${extensionName}] addViewButtonToMessage: 訊息 #${messageId} 已存在按鈕，跳過。`);
            return;
        }

        const button = document.createElement("div");
        button.className = "worldinfo-viewer-btn mes_button";
        button.innerHTML = '<i class="fa-solid fa-book-open"></i>';
        button.title = "查看此訊息觸發的世界書";
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            showWorldInfoPopup(messageId);
        });

        // 找到 .mes_buttons 容器並將按鈕插入最前面
        const buttonContainer = messageElement.querySelector(".mes_buttons");
        if (buttonContainer) {
            buttonContainer.prepend(button);
            console.log(`[${extensionName}] addViewButtonToMessage: 已成功將按鈕添加到訊息 #${messageId}。`);
        } else {
            console.warn(`[${extensionName}] addViewButtonToMessage: 在訊息 #${messageId} 中找不到 .mes_buttons 容器，無法添加按鈕。`);
        }
    }, 100); // 100ms 延遲通常足夠
}

/**
 * 顯示包含世界書觸發內容的彈窗
 * @param {string} messageId - 訊息的ID
 */
async function showWorldInfoPopup(messageId) {
    const data = messageWorldInfoMap.get(messageId);
    if (!data) {
        toastr.info("此訊息沒有紀錄的世界書觸發資料。");
        return;
    }

    try {
        // [修正] renderExtensionTemplateAsync 的第一個參數是擴充的資料夾名稱，第二個是模板檔名(不含.html)
        const html = await renderExtensionTemplateAsync(extensionName, "popup", data);
        
        callGenericPopup(html, POPUP_TYPE.TEXT, '', { // 第三個參數是標題，我們在模板裡已經有了，所以這裡留空
            wide: true,
            large: true,
            okButton: "關閉",
            allowVerticalScrolling: true
        });
    } catch (error) {
        console.error(`[${extensionName}] 渲染彈窗時發生錯誤:`, error);
        toastr.error("無法渲染世界書彈窗，請檢查主控台日誌。");
    }
}

// ------------------------------
// 擴充初始化
// ------------------------------

jQuery(async () => {
    console.log(`[${extensionName}] 擴充已載入。`);
});

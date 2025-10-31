// [優化] 將來自同一個檔案的 import 合併，並使用 'as' 來避免命名衝突
import { eventSource, event_types as eventTypes, chat } from '../../../../script.js';
import { renderExtensionTemplateAsync } from '../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

// ------------------------------
// 全域常數與設定
// ------------------------------

// [優化] 使用 import.meta.url 動態取得擴充名稱，不再需要手動設定，並且能應對 'third-party' 資料夾
const url = new URL(import.meta.url);
const extensionName = url.pathname.substring(url.pathname.lastIndexOf('extensions/') + 11, url.pathname.lastIndexOf('/'));

// 用於儲存訊息與世界書資料的關聯
const messageWorldInfoMap = new Map();

// 按鈕的 CSS class，定義為常數方便管理
const BUTTON_CLASS = 'worldinfo-viewer-btn';

// 世界書位置的定義
const positionInfo = Object.freeze({
    0: { name: "角色設定前", emoji: "🟢", category: "global" },
    1: { name: "角色設定後", emoji: "🔵", category: "character" },
    2: { name: "筆記頂部", emoji: "📝", category: "other" },
    3: { name: "筆記底部", emoji: "📝", category: "other" },
    4: { name: "依深度插入", emoji: "🔗", category: "chat" },
    5: { name: "範例頂部", emoji: "💡", category: "other" },
    6: { name: "範例底部", emoji: "💡", category: "other" },
    7: { name: "通道", emoji: "🔌", category: "other" },
});

// ------------------------------
// 主要邏輯：事件監聽
// ------------------------------

// 步驟一：當世界書被觸發時，暫存相關資訊
eventSource.on(eventTypes.WORLD_INFO_ACTIVATED, (activatedEntries) => {
    if (!activatedEntries || activatedEntries.length === 0) return;

    const organizedData = organizeWorldInfoData(activatedEntries);
    messageWorldInfoMap.set('latest_trigger', organizedData);
});

// 步驟二：當AI訊息物件被創建時，將暫存的資料與 messageId 關聯起來
eventSource.on(eventTypes.MESSAGE_RECEIVED, (messageId) => {
    if (messageWorldInfoMap.has('latest_trigger')) {
        const data = messageWorldInfoMap.get('latest_trigger');
        messageWorldInfoMap.set(String(messageId), data);
        messageWorldInfoMap.delete('latest_trigger');
    }
});

// 步驟三：當AI訊息完全渲染到畫面上後，加入按鈕
eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    if (messageWorldInfoMap.has(String(messageId))) {
        addViewButtonToMessage(String(messageId));
    }
});

// [新增] 步驟四：當聊天被清空或切換時，清空我們的 Map，防止記憶體洩漏
eventSource.on(eventTypes.CHAT_CLEARED, () => {
    messageWorldInfoMap.clear();
});


// ------------------------------
// 輔助函式
// ------------------------------

/**
 * 將原始的世界書觸發資料整理成分類好的格式。
 * @param {Array} entries - 原始的世界書條目陣列。
 * @returns {Object} 整理好的資料物件。
 */
function organizeWorldInfoData(entries) {
    const organized = { global: [], character: [], chat: [], other: [] };
    entries.forEach(entry => {
        const posInfo = positionInfo[entry.position] || { name: `未知位置 (${entry.position})`, emoji: "❓", category: "other" };
        
        const formattedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 ${entry.uid}`,
            emoji: entry.vectorized ? '🧠' : posInfo.emoji,
            position: posInfo.name,
            content: entry.content,
            keys: entry.key?.join(", ") ?? "",
            secondaryKeys: entry.keysecondary?.join(", ") ?? "",
            depth: entry.depth ?? ""
        };

        // [優化] 使用 posInfo.category 進行分類，更具擴展性
        const category = posInfo.category;
        if (organized[category]) {
            organized[category].push(formattedEntry);
        } else {
            organized.other.push(formattedEntry);
        }
    });
    return organized;
}

/**
 * 在指定的訊息框上新增「查看世界書」按鈕。
 * @param {string} messageId - 訊息的 ID。
 */
function addViewButtonToMessage(messageId) {
    // [優化] 移除 setTimeout，因為 CHARACTER_MESSAGE_RENDERED 事件觸發時，DOM 元素理應已經存在。
    // 如果未來發現有問題，再加回來也不遲，但通常直接操作是更可靠的做法。
    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) {
        console.error(`[${extensionName}] addViewButtonToMessage: 找不到 ID 為 ${messageId} 的訊息元素。`);
        return;
    }

    // 如果按鈕已存在，則不重複添加
    if (messageElement.querySelector(`.${BUTTON_CLASS}`)) {
        return;
    }

    const button = document.createElement("div");
    button.className = `${BUTTON_CLASS} mes_button`;
    button.innerHTML = '<i class="fa-solid fa-book-open"></i>';
    button.title = "查看此訊息觸發的世界書";
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        showWorldInfoPopup(messageId);
    });

    const buttonContainer = messageElement.querySelector(".mes_buttons");
    if (buttonContainer) {
        buttonContainer.prepend(button);
    } else {
        console.warn(`[${extensionName}] addViewButtonToMessage: 在訊息 #${messageId} 中找不到 .mes_buttons 容器。`);
    }
}

/**
 * 顯示包含世界書資訊的彈出視窗。
 * @param {string} messageId - 訊息的 ID。
 */
async function showWorldInfoPopup(messageId) {
    const data = messageWorldInfoMap.get(messageId);
    if (!data) {
        toastr.info("此訊息沒有紀錄的世界書觸發資料。");
        return;
    }

    try {
        // [優化] 將 data 傳遞給模板，讓模板引擎來渲染內容
        const html = await renderExtensionTemplateAsync(extensionName, "popup", data);
        
        // [優化] 使用 callGenericPopup，這是目前推薦的彈窗函式
        callGenericPopup(html, POPUP_TYPE.TEXT, '', {
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

// [優化] 移除 jQuery(async () => { ... }) 包裝，因為 ES 模組本身就是延遲執行的，
// 在現代 SillyTavern 擴充中已不再需要這個。
console.log(`[${extensionName}] 擴充已載入。`);

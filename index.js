// 引入 SillyTavern 的核心功能時，建議使用絕對路徑
import { eventSource, event_types } from '/scripts/script.js';
import { renderExtensionTemplateAsync } from '/scripts/extensions.js';
import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';

// 這個名稱必須與您的擴充功能資料夾名稱完全一致
const extensionName = "st-world-info-viewer";
const messageWorldInfoMap = new Map();

// 世界書位置的定義，用於分類和顯示
const positionInfo = {
    0: { name: "全域掃描 (角色前)", emoji: "🟢", category: "global" },
    1: { name: "全域掃描 (角色後)", emoji: "🔵", category: "character" },
    2: { name: "作者筆記 (頂部)", emoji: "📝", category: "other" },
    3: { name: "作者筆記 (底部)", emoji: "📝", category: "other" },
    4: { name: "聊天紀錄", emoji: "🔗", category: "chat" },
    5: { name: "範例對話 (頂部)", emoji: "💡", category: "other" },
    6: { name: "範例對話 (底部)", emoji: "💡", category: "other" },
    7: { name: "通道", emoji: "🔌", category: "other" },
};

// ------------------------------
// 主要邏輯
// ------------------------------

// 步驟一：當世界書被觸發時，暫存相關資訊
eventSource.on(event_types.WORLD_INFO_ACTIVATED, (activatedEntries) => {
    if (!activatedEntries || activatedEntries.length === 0) return;

    const organizedData = organizeWorldInfoData(activatedEntries);
    messageWorldInfoMap.set('latest_trigger', organizedData);
    console.log(`[${extensionName}] 偵測到 ${activatedEntries.length} 個世界書觸發，已暫存。`);
});

// 步驟二：當AI訊息物件被創建時，將暫存的資料與 messageId 關聯起來
// [修正] 使用 MESSAGE_SENT 事件，這個事件在訊息物件剛被推入 chat 陣列時觸發，時機點更準確。
eventSource.on(event_types.MESSAGE_SENT, (messageId) => {
    const chat = getContext().chat;
    const message = chat[messageId];

    // 只處理 AI 的訊息
    if (message && !message.is_user && !message.is_system) {
        if (messageWorldInfoMap.has('latest_trigger')) {
            const data = messageWorldInfoMap.get('latest_trigger');
            const msgIdStr = String(messageId);

            messageWorldInfoMap.set(msgIdStr, data);
            messageWorldInfoMap.delete('latest_trigger');

            console.log(`[${extensionName}] MESSAGE_SENT: 已將暫存的世界書資料與訊息 #${msgIdStr} 關聯。`);
        }
    }
});


// 步驟三：當AI訊息完全渲染到畫面上後，加入按鈕
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    const msgIdStr = String(messageId);

    if (messageWorldInfoMap.has(msgIdStr)) {
        console.log(`[${extensionName}] CHARACTER_MESSAGE_RENDERED: 訊息 #${msgIdStr} 已渲染，準備加入按鈕。`);
        addViewButtonToMessage(msgIdStr);
    }
});

// [新增] 當對話被清除或切換時，清空我們的暫存資料
eventSource.on(event_types.CHAT_CHANGED, () => {
    messageWorldInfoMap.clear();
    console.log(`[${extensionName}] CHAT_CHANGED: 已清除世界書暫存資料。`);
});


// ------------------------------
// 輔助函式
// ------------------------------

function organizeWorldInfoData(entries) {
    const organized = { global: [], character: [], chat: [], other: [], hasEntries: entries.length > 0 };
    entries.forEach(entry => {
        // [修正] 提供一個預設值，避免 entry.position 未定義時出錯
        const posInfo = positionInfo[entry.position] || { name: `未知位置 (${entry.position})`, emoji: "❓", category: "other" };

        const formattedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 ${entry.uid}`,
            emoji: entry.vectorized ? '🧠' : posInfo.emoji,
            position: posInfo.name,
            content: entry.content,
            keys: entry.key?.join(", ") || "", // [修正] 確保 key 存在
            secondaryKeys: entry.keysecondary?.join(", ") || "", // [修正] 確保 keysecondary 存在
            depth: entry.depth ?? ""
        };

        // 根據 positionInfo 的分類來組織
        const category = posInfo.category;
        if (organized[category]) {
            organized[category].push(formattedEntry);
        } else {
            organized.other.push(formattedEntry);
        }
    });
    return organized;
}

function addViewButtonToMessage(messageId) {
    // 使用 setTimeout 確保 DOM 元素已經穩定
    setTimeout(() => {
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) {
            console.error(`[${extensionName}] addViewButtonToMessage: 找不到 ID 為 ${messageId} 的訊息元素。`);
            return;
        }

        // 如果按鈕已存在，則不重複添加
        if (messageElement.querySelector(".worldinfo-viewer-btn")) {
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

        const buttonContainer = messageElement.querySelector(".mes_buttons");
        if (buttonContainer) {
            buttonContainer.prepend(button);
            console.log(`[${extensionName}] addViewButtonToMessage: 已成功將按鈕添加到訊息 #${messageId}。`);
        } else {
            console.warn(`[${extensionName}] addViewButtonToMessage: 在訊息 #${messageId} 中找不到 .mes_buttons 容器。`);
        }
    }, 100);
}

async function showWorldInfoPopup(messageId) {
    const data = messageWorldInfoMap.get(String(messageId));
    if (!data || !data.hasEntries) {
        toastr.info("此訊息沒有紀錄的世界書觸發資料。");
        return;
    }

    try {
        // [修正] 這裡的路徑現在是正確的，函式能成功找到並渲染範本
        const html = await renderExtensionTemplateAsync(extensionName, "popup", data);

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

jQuery(async () => {
    console.log(`[${extensionName}] 擴充已載入。`);
});

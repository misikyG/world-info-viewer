// [修正] 引入 SillyTavern 的核心功能，並修正相對路徑
import { eventSource, event_types as eventTypes } from '../../../scripts/script.js'; 
import {
    getContext,
    renderExtensionTemplateAsync,
    callGenericPopup,
} from '../../../scripts/extensions.js';
// [修正] 直接從 popup.js 引入 POPUP_TYPE
import { POPUP_TYPE } from '../../../scripts/popup.js'; 

// ------------------------------
// 全域變數和設定
// ------------------------------

// [重要] 這個名稱必須與您的擴充功能資料夾名稱完全一致！
// 例如，如果您的資料夾路徑是 public/extensions/third-party/world-info-viewer/
// 那這裡就應該是 "world-info-viewer"
const extensionName = "world-info-viewer"; 
const messageWorldInfoMap = new Map();

// 世界書位置的定義，用於分類和顯示 Emoji
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

eventSource.on(eventTypes.WORLD_INFO_ACTIVATED, (activatedEntries) => {
    if (!activatedEntries || activatedEntries.length === 0) return;

    const organizedData = organizeWorldInfoData(activatedEntries);
    messageWorldInfoMap.set('latest_trigger', organizedData);
    console.log(`[${extensionName}] 偵測到 ${activatedEntries.length} 個世界書觸發，已暫存。`);
});

eventSource.on(eventTypes.MESSAGE_RECEIVED, (messageId, type) => {
    if (messageWorldInfoMap.has('latest_trigger')) {
        const data = messageWorldInfoMap.get('latest_trigger');
        const msgIdStr = String(messageId);
        
        messageWorldInfoMap.set(msgIdStr, data);
        messageWorldInfoMap.delete('latest_trigger');
        
        console.log(`[${extensionName}] MESSAGE_RECEIVED: 已將暫存的世界書資料與訊息 #${msgIdStr} 關聯。`);
    }
});

eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    const msgIdStr = String(messageId);

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
            keys: entry.key && entry.key.length > 0 ? entry.key.join(", ") : "",
            secondaryKeys: entry.keysecondary && entry.keysecondary.length > 0 ? entry.keysecondary.join(", ") : "",
            depth: entry.depth ?? ""
        };

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

function addViewButtonToMessage(messageId) {
    setTimeout(() => {
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) {
            console.error(`[${extensionName}] addViewButtonToMessage: 找不到 ID 為 ${messageId} 的訊息元素。`);
            return;
        }

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

        const buttonContainer = messageElement.querySelector(".mes_buttons");
        if (buttonContainer) {
            buttonContainer.prepend(button);
            console.log(`[${extensionName}] addViewButtonToMessage: 已成功將按鈕添加到訊息 #${messageId}。`);
        } else {
            console.warn(`[${extensionName}] addViewButtonToMessage: 在訊息 #${messageId} 中找不到 .mes_buttons 容器，無法添加按鈕。`);
        }
    }, 100);
}

async function showWorldInfoPopup(messageId) {
    const data = messageWorldInfoMap.get(messageId);
    if (!data) {
        toastr.info("此訊息沒有紀錄的世界書觸發資料。");
        return;
    }

    try {
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

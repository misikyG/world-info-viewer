import { eventSource, event_types as eventTypes, chat } from '../../../../script.js';
import {
    renderExtensionTemplateAsync
} from '../../../extensions.js';
import {
    callGenericPopup,
    POPUP_TYPE
} from '../../../popup.js';


// ------------------------------
// 全域變數和設定
// ------------------------------

const extensionName = "third-party/world-info-viewer";

let latestTriggeredWorldInfo = null;


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
    if (!activatedEntries || activatedEntries.length === 0) {
        latestTriggeredWorldInfo = null; // 如果沒有觸發，清空暫存
        return;
    }

    const organizedData = organizeWorldInfoData(activatedEntries);
    latestTriggeredWorldInfo = organizedData; // 存到臨時變數
    console.log(`[${extensionName}] 偵測到 ${activatedEntries.length} 個世界書觸發，已暫存。`);
});

eventSource.on(eventTypes.MESSAGE_RECEIVED, (messageId) => {
    if (latestTriggeredWorldInfo && chat[messageId]) {
        if (!chat[messageId].extra) {
            chat[messageId].extra = {};
        }
        chat[messageId].extra.worldInfoViewer = latestTriggeredWorldInfo;

        latestTriggeredWorldInfo = null;

        console.log(`[${extensionName}] MESSAGE_RECEIVED: 已將暫存的世界書資料附加到訊息 #${messageId} 的 extra 屬性中。`);
    }
});

eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    const msgIdStr = String(messageId);
    if (chat[messageId] && chat[messageId].extra && chat[messageId].extra.worldInfoViewer) {
        console.log(`[${extensionName}] CHARACTER_MESSAGE_RENDERED: 訊息 #${msgIdStr} 已渲染，準備加入按鈕。`);
        addViewButtonToMessage(msgIdStr);
    }
});

eventSource.on(eventTypes.CHAT_CHANGED, () => {
    setTimeout(() => {
        document.querySelectorAll('#chat .mes').forEach(messageElement => {
            const mesId = messageElement.getAttribute('mesid');
            if (mesId) {
                const messageData = chat[mesId];
                if (messageData && messageData.extra && messageData.extra.worldInfoViewer) {
                    addViewButtonToMessage(mesId);
                }
            }
        });
        console.log(`[${extensionName}] CHAT_CHANGED: 已為歷史訊息加上世界書按鈕。`);
    }, 500);
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
    setTimeout(() => {
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) {
            console.error(`[${extensionName}] addViewButtonToMessage: 找不到 ID 為 ${messageId} 的訊息元素。`);
            return;
        }

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

        }
    }, 100);
}

async function showWorldInfoPopup(messageId) {
    const data = chat[messageId]?.extra?.worldInfoViewer;
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
    console.log(`[${extensionName}] 擴充已載入並初始化。`);
});

import { eventSource, event_types as eventTypes, chat, selected_world_info, characters, this_chid, world_info, chat_metadata, power_user } from '../../../../script.js';
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

// 插入位置的資訊（維持不變，用於顯示文字）
const positionInfo = {
    0: { name: "角色設定前", emoji: "📝" },
    1: { name: "角色設定後", emoji: "📝" },
    2: { name: "筆記頂部", emoji: "📝" },
    3: { name: "筆記底部", emoji: "📝" },
    4: { name: "依深度插入", emoji: "🔗" },
    5: { name: "範例頂部", emoji: "💡" },
    6: { name: "範例底部", emoji: "💡" },
    7: { name: "通道", emoji: "🔌" },
};

// ------------------------------
// 主要邏輯
// ------------------------------

eventSource.on(eventTypes.WORLD_INFO_ACTIVATED, (activatedEntries) => {
    if (!activatedEntries || activatedEntries.length === 0) {
        latestTriggeredWorldInfo = null;
        return;
    }

    const organizedData = organizeWorldInfoData(activatedEntries);
    latestTriggeredWorldInfo = organizedData;
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

/**
 * @param {import('../../../../world-info.js').WIEntryFieldDefinition[]} entries
 */
function organizeWorldInfoData(entries) {
    // 【修改】增加新的分類
    const organized = { global: [], characterPrimary: [], characterExtra: [], chat: [], persona: [], other: [] };

    // 【修改】獲取當前角色的資訊，以便判斷世界書類型
    const character = characters[this_chid];
    const charFileName = character ? `${character.name}_${character.avatar.replace('.png', '')}` : null;
    const charExtraLoreBooks = charFileName ? world_info.charLore?.find(e => e.name === charFileName)?.extraBooks ?? [] : [];

    entries.forEach(entry => {
        const posInfo = positionInfo[entry.position] || { name: `未知位置 (${entry.position})` };

        // 【修改】核心分類邏輯
        let category = 'other';
        if (selected_world_info.includes(entry.world)) {
            category = 'global';
        } else if (character && character.data?.extensions?.world === entry.world) {
            category = 'characterPrimary';
        } else if (charExtraLoreBooks.includes(entry.world)) {
            category = 'characterExtra';
        } else if (chat_metadata.world_info === entry.world) {
            category = 'chat';
        } else if (power_user.persona_description_lorebook === entry.world) {
            category = 'persona';
        }
        
        // 【修改】Emoji 判定邏輯
        // 順序：恆定 > 向量 > 一般
        const emoji = entry.constant ? '🟢' : (entry.vectorized ? '🔗' : '🔵');

        const formattedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 ${entry.uid}`,
            emoji: emoji,
            position: posInfo.name,
            content: entry.content,
            keys: entry.key && entry.key.length > 0 ? entry.key.join(", ") : "",
            secondaryKeys: entry.keysecondary && entry.keysecondary.length > 0 ? entry.keysecondary.join(", ") : "",
            depth: entry.depth ?? ""
        };

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

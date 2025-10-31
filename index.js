// 【修正點】將 import 拆分成三個，從各自正確的來源導入
import {
    eventSource,
    event_types,
    chat,
} from '../../../../script.js';

import {
    renderExtensionTemplateAsync
} from '../../../extensions.js';

import {
    callGenericPopup,
    POPUP_TYPE
} from '../../../popup.js';


// 透過 import.meta.url 動態取得擴充路徑
const url = new URL(import.meta.url);
const extensionName = url.pathname.substring(url.pathname.lastIndexOf('extensions/') + 11, url.pathname.lastIndexOf('/'));

// 知識書條目位置資訊
const positionInfo = {
    0: { name: "角色設定前", emoji: "📄" },
    1: { name: "角色設定後", emoji: "📄" },
    2: { name: "作者註釋頂部", emoji: "📝" },
    3: { name: "作者註釋底部", emoji: "📝" },
    4: { name: "依深度插入", emoji: "🔗" },
    5: { name: "範例頂部", emoji: "💡" },
    6: { name: "範例底部", emoji: "💡" },
    7: { name: "Outlet", emoji: "➡️" },
};

// 知識書分類
const WI_CATEGORY_KEYS = {
    GLOBAL: 'global',
    CHARACTER: 'character',
    CHAT: 'chat',
    OTHER: 'other',
};

/**
 * 取得條目的狀態 (恆定、向量、關鍵字)
 * @param {object} entry - 知識書條目
 * @returns {{emoji: string, name: string}}
 */
function getEntryStatus(entry) {
    if (entry.constant === true) {
        return { emoji: '🟢', name: '恆定 (Constant)' };
    }
    if (entry.vectorized === true) {
        return { emoji: '🔗', name: '向量 (Vectorized)' };
    }
    return { emoji: '🔵', name: '關鍵字 (Keyword)' };
}

/**
 * 判斷條目屬於哪個分類
 * @param {object} entry - 知識書條目
 * @returns {string} - 分類鍵名 (e.g., 'global', 'character')
 */
function getWICategoryKey(entry) {
    if (entry.scopeToChar === false) {
        return WI_CATEGORY_KEYS.GLOBAL;
    }
    if (entry.position === 4) {
        return WI_CATEGORY_KEYS.CHAT;
    }
    return WI_CATEGORY_KEYS.CHARACTER;
}

/**
 * 處理並分類觸發的知識書資料，使其符合模板需求
 * @param {Array} activatedEntries - 觸發的條目陣列
 * @returns {object} - 符合模板結構的物件
 */
function processWorldInfoData(activatedEntries) {
    const categorized = {
        [WI_CATEGORY_KEYS.GLOBAL]: [],
        [WI_CATEGORY_KEYS.CHARACTER]: [],
        [WI_CATEGORY_KEYS.CHAT]: [],
        [WI_CATEGORY_KEYS.OTHER]: [],
    };

    activatedEntries.forEach(entry => {
        const categoryKey = getWICategoryKey(entry);
        const status = getEntryStatus(entry);
        const posInfo = positionInfo[entry.position] || { name: `未知位置 (${entry.position})`, emoji: '❓' };

        const processedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 #${entry.uid}`,
            emoji: status.emoji,
            statusName: status.name,
            position: posInfo.name,
            content: entry.content,
            keys: entry.key?.join(', ') || null,
            secondaryKeys: entry.keysecondary?.join(', ') || null,
            depth: entry.depth,
        };
        
        if (categorized[categoryKey]) {
            categorized[categoryKey].push(processedEntry);
        } else {
            categorized[WI_CATEGORY_KEYS.OTHER].push(processedEntry);
        }
    });

    return categorized;
}

/**
 * 為指定的訊息框新增世界書查看按鈕
 * @param {string} messageId - 訊息的 ID
 */
function addViewButtonToMessage(messageId) {
    if (!chat[messageId]?.extra?.worldInfoViewer) {
        return;
    }

    const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
    if (!messageElement || messageElement.getAttribute('is_user') === 'true') {
        return;
    }

    const buttonContainer = messageElement.querySelector('.mes_buttons');
    if (!buttonContainer) return;

    const buttonId = `worldinfo-viewer-btn-${messageId}`;
    if (document.getElementById(buttonId)) {
        return;
    }

    const button = document.createElement('div');
    button.id = buttonId;
    button.className = 'mes_button worldinfo-viewer-btn fa-solid fa-earth-asia';
    button.title = '查看此回覆觸發的世界書';

    button.addEventListener('click', (event) => {
        event.stopPropagation();
        showWorldInfoPopup(messageId);
    });

    buttonContainer.prepend(button);
}

/**
 * 顯示世界書資訊的彈出視窗
 * @param {string} messageId - 訊息的 ID
 */
async function showWorldInfoPopup(messageId) {
    const worldInfoData = chat[messageId]?.extra?.worldInfoViewer;
    if (!worldInfoData) {
        toastr.info("此訊息沒有紀錄的世界書觸發資料。");
        return;
    }

    try {
        const popupContent = await renderExtensionTemplateAsync(extensionName, 'popup', worldInfoData);
        callGenericPopup(popupContent, POPUP_TYPE.TEXT, '', {
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

// --- 事件監聽器 ---

let lastActivatedWorldInfo = null;

// 1. 監聽世界書觸發事件，處理並暫存資料
eventSource.on(event_types.WORLD_INFO_ACTIVATED, (data) => {
    if (data && data.entries && data.entries.length > 0) {
        lastActivatedWorldInfo = processWorldInfoData(data.entries);
    } else {
        lastActivatedWorldInfo = null;
    }
});

// 2. AI訊息資料接收後，將暫存的資料綁定到 chat 物件上
eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
    if (lastActivatedWorldInfo && chat[messageId] && !chat[messageId].is_user) {
        if (!chat[messageId].extra) {
            chat[messageId].extra = {};
        }
        chat[messageId].extra.worldInfoViewer = lastActivatedWorldInfo;
        lastActivatedWorldInfo = null;
    }
});

// 3. AI訊息在畫面上渲染完成後，執行新增按鈕的函式
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    addViewButtonToMessage(String(messageId));
});

// 4. 當聊天記錄變更時 (如切換聊天)，為所有歷史訊息補上按鈕
eventSource.on(event_types.CHAT_CHANGED, () => {
    setTimeout(() => {
        document.querySelectorAll('#chat .mes').forEach(messageElement => {
            const mesId = messageElement.getAttribute('mesid');
            if (mesId) {
                addViewButtonToMessage(mesId);
            }
        });
    }, 500);
});

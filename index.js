// 【修正點】從核心檔案導入更多必要的變數
import {
    eventSource,
    event_types,
    chat,
    chat_metadata,
    characters,
    this_chid,
} from '../../../../script.js';

import {
    renderExtensionTemplateAsync
} from '../../../extensions.js';

import {
    callGenericPopup,
    POPUP_TYPE
} from '../../../popup.js';

// 【修正點】從 world-info.js 導入更多必要的變數
import {
    METADATA_KEY,
    selected_world_info,
    world_info, // 儲存了角色額外知識書的設定
} from '../../../world-info.js';
import { getCharaFilename } from '../../../utils.js';


// 透過 import.meta.url 動態取得擴充路徑
const url = new URL(import.meta.url);
const extensionName = url.pathname.substring(url.pathname.lastIndexOf('extensions/') + 11, url.pathname.lastIndexOf('/'));

// 知識書條目位置資訊 (保持不變)
const positionInfo = {
    0: { name: "角色設定前", emoji: "📙" },
    1: { name: "角色設定後", emoji: "📙" },
    2: { name: "作者註釋頂部", emoji: "📝" },
    3: { name: "作者註釋底部", emoji: "📝" },
    4: { name: "依深度插入", emoji: "🔗" },
    5: { name: "範例頂部", emoji: "📄" },
    6: { name: "範例底部", emoji: "📄" },
    7: { name: "Outlet", emoji: "➡️" },
};

// 【修正點】新增更精確的分類
const WI_CATEGORY_KEYS = {
    GLOBAL: 'global',
    CHARACTER_PRIMARY: 'characterPrimary',
    CHARACTER_ADDITIONAL: 'characterAdditional',
    CHAT: 'chat',
    OTHER: 'other',
};

// getEntryStatus 函數 (保持不變，邏輯是正確的)
function getEntryStatus(entry) {
    if (entry.constant === true) {
        return { emoji: '🔵', name: '恆定 (Constant)' };
    }
    if (entry.vectorized === true) {
        return { emoji: '🔗', name: '向量 (Vectorized)' };
    }
    return { emoji: '🟢', name: '關鍵字 (Keyword)' };
}


/**
 * 【修正點】這是本次最關鍵的修改：完全重寫分類邏輯
 * 判斷條目屬於哪個分類
 * @param {object} entry - 知識書條目
 * @returns {string} - 分類鍵名
 */
function getWICategoryKey(entry) {
    const worldName = entry.world;

    // 1. 檢查聊天知識書
    const chatLorebook = chat_metadata[METADATA_KEY];
    if (chatLorebook && worldName === chatLorebook) {
        return WI_CATEGORY_KEYS.CHAT;
    }

    // 2. 檢查角色相關知識書
    const character = characters[this_chid];
    if (character) {
        // 2a. 檢查角色主要知識書
        const primaryLorebook = character.data?.extensions?.world;
        if (primaryLorebook && worldName === primaryLorebook) {
            return WI_CATEGORY_KEYS.CHARACTER_PRIMARY;
        }

        // 2b. 檢查角色額外知識書
        const fileName = getCharaFilename(this_chid);
        const extraCharLore = world_info.charLore?.find((e) => e.name === fileName);
        if (extraCharLore && extraCharLore.extraBooks?.includes(worldName)) {
            return WI_CATEGORY_KEYS.CHARACTER_ADDITIONAL;
        }
    }

    // 3. 檢查全域世界書
    if (selected_world_info && selected_world_info.includes(worldName)) {
        return WI_CATEGORY_KEYS.GLOBAL;
    }

    // 4. 如果都找不到，歸為其他
    return WI_CATEGORY_KEYS.OTHER;
}


/**
 * 【修正點】更新 processWorldInfoData 以使用新的分類
 */
function processWorldInfoData(activatedEntries) {
    const categorized = {
        [WI_CATEGORY_KEYS.GLOBAL]: [],
        [WI_CATEGORY_KEYS.CHARACTER_PRIMARY]: [],
        [WI_CATEGORY_KEYS.CHARACTER_ADDITIONAL]: [],
        [WI_CATEGORY_KEYS.CHAT]: [],
        [WI_CATEGORY_KEYS.OTHER]: [],
    };

    activatedEntries.forEach(entry => {
        // 安全檢查：確保 entry 是有效物件
        if (!entry || typeof entry !== 'object') {
            console.warn('[WI-Viewer] 收到無效的 entry:', entry);
            return;
        }

        const categoryKey = getWICategoryKey(entry);
        const status = getEntryStatus(entry);
        const posInfo = positionInfo[entry.position] || { name: `未知位置 (${entry.position})`, emoji: '❓' };

        const processedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 #${entry.uid}`,
            emoji: status.emoji,
            statusName: status.name, // 這裡賦值
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

// addViewButtonToMessage 函數 (保持不變)
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

// showWorldInfoPopup 函數 (保持不變)
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

/**
 * 【修正點】加入詳細的日誌，幫助我們追蹤第二次失效的問題
 */
eventSource.on(event_types.WORLD_INFO_ACTIVATED, (data) => {
    // 這是為了除錯，請您在遇到問題時打開瀏覽器的開發者控制台(F12)查看
    console.log('[WI-Viewer] 收到 WORLD_INFO_ACTIVATED 事件，資料:', JSON.parse(JSON.stringify(data)));

    if (data && Array.isArray(data) && data.length > 0) {
        lastActivatedWorldInfo = processWorldInfoData(data);
        console.log('[WI-Viewer] 資料處理完畢:', lastActivatedWorldInfo);
    } else {
        lastActivatedWorldInfo = null;
        console.log('[WI-Viewer] 收到空的觸發資料，重設 lastActivatedWorldInfo。');
    }
});

// MESSAGE_RECEIVED, CHARACTER_MESSAGE_RENDERED, CHAT_CHANGED 監聽器 (保持不變)
eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
    if (lastActivatedWorldInfo && chat[messageId] && !chat[messageId].is_user) {
        if (!chat[messageId].extra) {
            chat[messageId].extra = {};
        }
        chat[messageId].extra.worldInfoViewer = lastActivatedWorldInfo;
        lastActivatedWorldInfo = null;
    }
});

eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    addViewButtonToMessage(String(messageId));
});

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


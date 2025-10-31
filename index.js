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
import {
    METADATA_KEY,
    selected_world_info,
    world_info,
} from '../../../world-info.js';
import { getCharaFilename } from '../../../utils.js';


const url = new URL(import.meta.url);
const extensionName = url.pathname.substring(url.pathname.lastIndexOf('extensions/') + 11, url.pathname.lastIndexOf('/'));

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

const selectiveLogicInfo = {
    0: '包含任一 (AND ANY)',
    1: '未完全包含 (NOT ALL)',
    2: '完全不含 (NOT ANY)',
    3: '包含全部 (AND ALL)',
};

const WI_CATEGORY_KEYS = {
    GLOBAL: 'global',
    CHARACTER_PRIMARY: 'characterPrimary',
    CHARACTER_ADDITIONAL: 'characterAdditional',
    CHAT: 'chat',
    OTHER: 'other',
};

function getEntryStatus(entry) {
    if (entry.constant === true) {
        return { emoji: '🔵', name: '恆定 (Constant)' };
    }
    if (entry.vectorized === true) {
        return { emoji: '🔗', name: '向量 (Vectorized)' };
    }
    return { emoji: '🟢', name: '關鍵字 (Keyword)' };
}

function getWICategoryKey(entry) {
    const worldName = entry.world;

    const chatLorebook = chat_metadata[METADATA_KEY];
    if (chatLorebook && worldName === chatLorebook) {
        return WI_CATEGORY_KEYS.CHAT;
    }

    const character = characters[this_chid];
    if (character) {
        const primaryLorebook = character.data?.extensions?.world;
        if (primaryLorebook && worldName === primaryLorebook) {
            return WI_CATEGORY_KEYS.CHARACTER_PRIMARY;
        }

        const fileName = getCharaFilename(this_chid);
        const extraCharLore = world_info.charLore?.find((e) => e.name === fileName);
        if (extraCharLore && extraCharLore.extraBooks?.includes(worldName)) {
            return WI_CATEGORY_KEYS.CHARACTER_ADDITIONAL;
        }
    }

    if (selected_world_info && selected_world_info.includes(worldName)) {
        return WI_CATEGORY_KEYS.GLOBAL;
    }

    return WI_CATEGORY_KEYS.OTHER;
}

function processWorldInfoData(activatedEntries) {
    const categorized = {
        [WI_CATEGORY_KEYS.GLOBAL]: [],
        [WI_CATEGORY_KEYS.CHARACTER_PRIMARY]: [],
        [WI_CATEGORY_KEYS.CHARACTER_ADDITIONAL]: [],
        [WI_CATEGORY_KEYS.CHAT]: [],
        [WI_CATEGORY_KEYS.OTHER]: [],
    };

    activatedEntries.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
            console.warn('[WI-Viewer] 收到無效的 entry:', entry);
            return;
        }

        const categoryKey = getWICategoryKey(entry);
        const status = getEntryStatus(entry);
        const posInfo = positionInfo[entry.position] || { name: `未知位置 (${entry.position})`, emoji: '❓' };
        const hasSecondaryKeys = entry.keysecondary && entry.keysecondary.length > 0;

        const processedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 #${entry.uid}`,
            emoji: status.emoji,
            statusName: status.name,
            position: posInfo.name,
            content: entry.content,
            keys: entry.key?.join(', ') || null,
            secondaryKeys: entry.keysecondary?.join(', ') || null,
            depthText: (entry.depth != null) ? ` / 深度 ${entry.depth}` : '',
            selectiveLogicName: hasSecondaryKeys ? (selectiveLogicInfo[entry.selectiveLogic] || `未知邏輯 (${entry.selectiveLogic})`) : null,
        };

        if (categorized[categoryKey]) {
            categorized[categoryKey].push(processedEntry);
        } else {
            categorized[WI_CATEGORY_KEYS.OTHER].push(processedEntry);
        }
    });

    return categorized;
}

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

eventSource.on(event_types.WORLD_INFO_ACTIVATED, (data) => {
    console.log('[WI-Viewer] 收到 WORLD_INFO_ACTIVATED 事件，資料:', JSON.parse(JSON.stringify(data)));
    if (data && Array.isArray(data) && data.length > 0) {
        lastActivatedWorldInfo = processWorldInfoData(data);
        console.log('[WI-Viewer] 資料處理完畢:', lastActivatedWorldInfo);
    } else {
        lastActivatedWorldInfo = null;
        console.log('[WI-Viewer] 收到空的觸發資料，重設 lastActivatedWorldInfo。');
    }
});

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

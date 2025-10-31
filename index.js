import {
    eventSource,
    event_types,
    chat,
    renderExtensionTemplateAsync,
    callGenericPopup,
    POPUP_TYPE
} from '../../../../script.js';


const extensionName = "third-party/world-info-viewer";
const positionInfo = {
    0: { name: "角色設定前", emoji: "📄", position: "before" },
    1: { name: "角色設定後", emoji: "📄", position: "after" },
    2: { name: "作者註釋頂部", emoji: "📝", position: "ANTop" },
    3: { name: "作者註釋底部", emoji: "📝", position: "ANBottom" },
    4: { name: "依深度插入", emoji: "🔗", position: "atDepth" },
    5: { name: "範例頂部", emoji: "💡", position: "EMTop" },
    6: { name: "範例底部", emoji: "💡", position: "EMBottom" },
    7: { name: "outlet", emoji: "➡️", position: "outlet" },
};

const WI_CATEGORY = {
    GLOBAL: '🌐 全域世界書',
    CHARACTER_PRIMARY: '👤 角色主要知識書',
    CHARACTER_EXTRA: '👤 角色額外知識書',
    CHAT: '🗣️ 角色聊天知識書',
};


function getEntryStatus(entry) {
    if (entry.constant === true) {
        return { emoji: '🟢', name: '恆定 (Constant)' };
    }
    if (entry.vectorized === true) {
        return { emoji: '🔗', name: '向量 (Vectorized)' };
    }
    return { emoji: '🔵', name: '關鍵字 (Keyword)' };
}

function getWICategory(entry) {
    // 依據 scopeToChar 和 position 判斷分類
    if (entry.scopeToChar === false) {
        return WI_CATEGORY.GLOBAL;
    }
    if (entry.position === 4) { // atDepth
        return WI_CATEGORY.CHAT;
    }
    // 預設為角色主要知識書，可再擴充邏輯區分額外知識書
    return WI_CATEGORY.CHARACTER_PRIMARY;
}

function processWorldInfoData(activatedEntries) {
    const categorized = {
        [WI_CATEGORY.GLOBAL]: [],
        [WI_CATEGORY.CHARACTER_PRIMARY]: [],
        [WI_CATEGORY.CHARACTER_EXTRA]: [],
        [WI_CATEGORY.CHAT]: [],
    };

    activatedEntries.forEach(entry => {
        const category = getWICategory(entry);
        const status = getEntryStatus(entry);
        const posInfo = positionInfo[entry.position] || { name: `未知位置 (${entry.position})` };

        categorized[category].push({
            worldName: entry.world,
            entryName: entry.comment || `條目 #${entry.uid}`,
            statusEmoji: status.emoji,
            statusName: status.name,
            positionName: posInfo.name,
            content: entry.content,
            keys: entry.key?.join(', ') || '無',
            secondaryKeys: entry.keysecondary?.join(', ') || '無',
            filter: entry.filter || '無',
        });
    });

    return {
        timestamp: new Date().toLocaleTimeString(),
        categorized: categorized,
    };
}


function addViewButtonToMessage(messageId) {
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
    button.className = 'mes_button worldinfo-viewer-btn';
    button.innerHTML = '🌍';
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


// 監聽世界書觸發事件，並將資料暫存
let lastActivatedWorldInfo = null;
eventSource.on(event_types.WORLD_INFO_ACTIVATED, (data) => {
    if (data && data.entries && data.entries.length > 0) {
        lastActivatedWorldInfo = processWorldInfoData(data.entries);
    } else {
        lastActivatedWorldInfo = null;
    }
});

// AI訊息生成後，將暫存的資料綁定到訊息上
eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
    if (lastActivatedWorldInfo && chat[messageId]) {
        if (!chat[messageId].extra) {
            chat[messageId].extra = {};
        }
        chat[messageId].extra.worldInfoViewer = lastActivatedWorldInfo;
        lastActivatedWorldInfo = null; // 清空暫存
    }
});

// AI訊息渲染完成後，加入按鈕
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    if (chat[messageId]?.extra?.worldInfoViewer) {
        addViewButtonToMessage(String(messageId));
    }
});

// 當聊天記錄變更時(如切換聊天)，為所有歷史訊息補上按鈕
eventSource.on(event_types.CHAT_CHANGED, () => {
    setTimeout(() => {
        document.querySelectorAll('#chat .mes').forEach(messageElement => {
            const mesId = messageElement.getAttribute('mesid');
            if (mesId && chat[mesId]?.extra?.worldInfoViewer) {
                addViewButtonToMessage(mesId);
            }
        });
    }, 500);
});

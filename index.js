import {
    eventSource,
    event_types,
    chat,
    renderExtensionTemplateAsync,
    callGenericPopup,
    POPUP_TYPE
} from '../../../../script.js';

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
    // position 4 (atDepth) 經常與聊天特定知識書相關
    if (entry.position === 4) {
        return WI_CATEGORY_KEYS.CHAT;
    }
    // 其他與角色相關的都歸類到角色
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
        [WI_CATEGORY_KEYS.OTHER]: [], // 保留一個 "其他" 以防萬一
    };

    activatedEntries.forEach(entry => {
        const categoryKey = getWICategoryKey(entry);
        const status = getEntryStatus(entry);
        const posInfo = positionInfo[entry.position] || { name: `未知位置 (${entry.position})`, emoji: '❓' };

        // 建立符合 popup.html 模板的物件
        const processedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 #${entry.uid}`,
            emoji: status.emoji,
            statusName: status.name,
            position: posInfo.name,
            content: entry.content,
            keys: entry.key?.join(', ') || null,
            secondaryKeys: entry.keysecondary?.join(', ') || null,
            depth: entry.depth, // 傳遞深度資訊給模板
        };
        
        // 根據分類鍵放入對應的陣列
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
    // **修正點**: 首先檢查該訊息是否有世界書資料，沒有就直接返回
    if (!chat[messageId]?.extra?.worldInfoViewer) {
        return;
    }

    const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
    // 確保是 AI 訊息
    if (!messageElement || messageElement.getAttribute('is_user') === 'true') {
        return;
    }

    const buttonContainer = messageElement.querySelector('.mes_buttons');
    if (!buttonContainer) return;

    const buttonId = `worldinfo-viewer-btn-${messageId}`;
    if (document.getElementById(buttonId)) {
        return; // 按鈕已存在，不再新增
    }

    const button = document.createElement('div');
    button.id = buttonId;
    button.className = 'mes_button worldinfo-viewer-btn fa-solid fa-earth-asia'; // 使用 Font Awesome 圖示
    button.title = '查看此回覆觸發的世界書';

    button.addEventListener('click', (event) => {
        event.stopPropagation();
        showWorldInfoPopup(messageId);
    });

    // 使用 prepend 將按鈕加到最前面
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
    // 確保是 AI 訊息且有暫存資料
    if (lastActivatedWorldInfo && chat[messageId] && !chat[messageId].is_user) {
        if (!chat[messageId].extra) {
            chat[messageId].extra = {};
        }
        chat[messageId].extra.worldInfoViewer = lastActivatedWorldInfo;
        lastActivatedWorldInfo = null; // 清空暫存，避免污染下一則訊息
    }
});

// 3. AI訊息在畫面上渲染完成後，執行新增按鈕的函式
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    // **修正點**: 不在這裡做 if 判斷，直接呼叫函式
    addViewButtonToMessage(String(messageId));
});

// 4. 當聊天記錄變更時 (如切換聊天)，為所有歷史訊息補上按鈕
eventSource.on(event_types.CHAT_CHANGED, () => {
    // 延遲執行，確保 DOM 都已載入完成
    setTimeout(() => {
        document.querySelectorAll('#chat .mes').forEach(messageElement => {
            const mesId = messageElement.getAttribute('mesid');
            if (mesId) {
                // **修正點**: 不在這裡做 if 判斷，直接呼叫函式
                addViewButtonToMessage(mesId);
            }
        });
    }, 500); // 500ms 是一個比較保險的延遲
});

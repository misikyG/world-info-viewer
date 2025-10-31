import { eventSource, event_types as eventTypes, chat } from '../../../../script.js';
import { renderExtensionTemplateAsync } from '../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

const extensionName = "third-party/world-info-viewer";
let latestTriggeredWorldInfo = null;

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

// 世界書分類常數
const WI_CATEGORY = {
    GLOBAL: '🌐全域世界書',
    CHARACTER_PRIMARY: '👤角色主要知識書',
    CHARACTER_EXTRA: '👤角色額外知識書',
    CHAT: '🗣️角色聊天知識書',
};

// 世界書條目狀態判定函數
function getEntryStatus(entry) {

    if (entry.constant === true) {
        return { emoji: '🔵', name: '恆定', type: 'constant' };
    } else if (entry.vectorized === true) {
        return { emoji: '🔗', name: '向量', type: 'vectorized' };
    } else {
        return { emoji: '🟢', name: '關鍵字', type: 'keyword' };
    }
}

// 世界書分類判定函數
function getWICategory(entry, worldBookName) {
    
    if (entry.scopeToChar === false || entry.scopeToChar === null) {
        return WI_CATEGORY.GLOBAL;
    } else if (entry.scopeToChar === true) {
        
        if (entry.position === 4) { // atDepth
            return WI_CATEGORY.CHAT;
        }
        
        return WI_CATEGORY.CHARACTER_PRIMARY;
    }
    
    return WI_CATEGORY.CHARACTER_PRIMARY;
}

// 主事件監聽器
eventSource.on(eventTypes.WORLD_INFO_ACTIVATED, (activatedData) => {
    console.debug('[WI Viewer] World Info Activated Event:', activatedData);
    
    const entries = activatedData?.entries;
    if (!entries || entries.length === 0) {
        console.debug('[WI Viewer] No entries to process');
        return;
    }

    // 按分類組織條目
    const categorizedEntries = {
        [WI_CATEGORY.GLOBAL]: [],
        [WI_CATEGORY.CHARACTER_PRIMARY]: [],
        [WI_CATEGORY.CHARACTER_EXTRA]: [],
        [WI_CATEGORY.CHAT]: [],
    };

    entries.forEach(entry => {
        const category = getWICategory(entry, activatedData.worldBook);
        const status = getEntryStatus(entry);
        const position = positionInfo[entry.position] || positionInfo[0];
        
        categorizedEntries[category].push({
            ...entry,
            statusEmoji: status.emoji,
            statusName: status.name,
            statusType: status.type,
            positionInfo: position,
            displayName: entry.key?.join(', ') || 'Unknown',
        });
    });

    latestTriggeredWorldInfo = {
        timestamp: new Date().toLocaleTimeString(),
        categorized: categorizedEntries,
        raw: activatedData,
    };

    console.debug('[WI Viewer] Processed World Info:', latestTriggeredWorldInfo);
});

// 生成彈出窗口內容
function generatePopupContent() {
    if (!latestTriggeredWorldInfo) {
        return '<p>尚未捕捉到世界書觸發</p>';
    }

    let html = `<h3>世界書觸發檢視器</h3>`;
    html += `<small style="color: var(--text-color-secondary);">${latestTriggeredWorldInfo.timestamp}</small>`;

    for (const [category, entries] of Object.entries(latestTriggeredWorldInfo.categorized)) {
        if (entries.length === 0) continue;

        html += `
            <div class="wi-category">
                <h4>${category}</h4>
                ${entries.map(entry => `
                    <div class="wi-entry">
                        <div class="wi-entry-header">
                            <span class="wi-emoji">${entry.statusEmoji}</span>
                            <span class="wi-title">${entry.displayName}</span>
                        </div>
                        <div class="wi-entry-info">
                            <p><strong>世界書名：</strong>${latestTriggeredWorldInfo.raw.worldBook}</p>
                            <p><strong>狀態：</strong>${entry.statusName}</p>
                            <p><strong>插入位置：</strong>${entry.positionInfo.emoji} ${entry.positionInfo.name}</p>
                            ${entry.key ? `<p><strong>主鍵字：</strong>${entry.key.join(', ')}</p>` : ''}
                            ${entry.keysecondary?.length ? `<p><strong>副鍵字：</strong>${entry.keysecondary.join(', ')}</p>` : ''}
                            ${entry.filter?.length ? `<p><strong>過濾器：</strong>${entry.filter}</p>` : ''}
                        </div>
                        <div class="wi-entry-content">
                            <strong>內容預覽：</strong>
                            <pre>${entry.content?.substring(0, 200)}${entry.content?.length > 200 ? '...' : ''}</pre>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    return html;
}

// 添加查看按鈕
eventSource.on(eventTypes.MESSAGE_SENT, () => {

    setTimeout(() => {
        const chatMessages = document.querySelectorAll('.mes');
        const lastMessage = chatMessages[chatMessages.length - 1];
        
        if (lastMessage && !lastMessage.querySelector('.worldinfo-viewer-btn')) {
            const button = document.createElement('button');
            button.className = 'worldinfo-viewer-btn';
            button.innerHTML = '🌍';
            button.title = '查看此回覆觸發的世界書';
            button.onclick = (e) => {
                e.stopPropagation();
                const popupContent = generatePopupContent();
                callGenericPopup(popupContent, POPUP_TYPE.TEXT, '', { wide: true, large: true });
            };
            
            const messageActions = lastMessage.querySelector('.mes_actions') || lastMessage;
            messageActions.appendChild(button);
        }
    }, 100);
});

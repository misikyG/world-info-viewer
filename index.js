import { eventSource, event_types } from '../../../scripts/script.js';
import { chat } from '../../../scripts/script.js';
import { selected_world_info, world_info, world_info_position } from '../../../scripts/world-info.js';
import { this_chid, characters } from '../../../scripts/script.js';
import { chat_metadata } from '../../../scripts/script.js';
import { Popup, POPUP_TYPE } from '../../../scripts/popup.js';
import { substituteParams } from '../../../scripts/script.js';

// 用來暫存最近一次生成所觸發的世界書條目
let lastActivatedEntries = [];

/**
 * 判斷世界書的來源
 * @param {object} entry - 單個世界書條目
 * @returns {string} - 來源名稱 (全域, 角色主要, 角色聊天, 等)
 */
function determineWISource(entry) {
    // 1. 檢查是否為全域世界書
    if (selected_world_info.includes(entry.world)) {
        return '全域世界書';
    }

    // 2. 檢查是否為聊天世界書
    if (chat_metadata.world_info === entry.world) {
        return '角色聊天知識書';
    }

    // 3. 檢查是否為角色主要或附加世界書
    if (this_chid !== undefined && characters[this_chid]) {
        const char = characters[this_chid];
        if (char.data?.extensions?.world === entry.world) {
            return '角色主要知識書';
        }
        // 檢查附加世界書
        const charFileName = `${char.avatar.replace('.png', '')}---${char.name}`;
        const extraLore = world_info.charLore?.find(e => e.name === charFileName);
        if (extraLore?.extraBooks?.includes(entry.world)) {
            return '角色附加知識書';
        }
    }

    return '未知來源';
}

/**
 * 根據你的要求，決定條目類型對應的 Emoji
 * @param {object} entry - 單個世界書條目
 * @returns {string} - Emoji
 */
function determineWIEmoji(entry) {
    if (entry.vectorized) {
        return '🔗'; // 向量
    }
    switch (entry.position) {
        case world_info_position.before:
            return '🟢'; // 角色設定前
        case world_info_position.after:
            return '🔵'; // 角色設定後
        default:
            return '📄'; // 其他 (例如 atDepth)
    }
}

/**
 * 將世界書插入位置的數字代碼轉換為可讀文字
 * @param {object} entry - 單個世界書條目
 * @returns {string} - 插入位置的描述
 */
function getPositionText(entry) {
    switch (entry.position) {
        case world_info_position.before: return '角色設定前';
        case world_info_position.after: return '角色設定後';
        case world_info_position.ANTop: return '作者筆記頂部';
        case world_info_position.ANBottom: return '作者筆記底部';
        case world_info_position.atDepth: return `系統/深度 ${entry.depth}`;
        case world_info_position.EMTop: return '範例對話頂部';
        case world_info_position.EMBottom: return '範例對話底部';
        case world_info_position.outlet: return `出口: ${entry.outletName}`;
        default: return '未知';
    }
}

/**
 * 顯示彈出視窗，其中包含觸發的世界書詳細資訊
 * @param {number} messageId - 訊息在 chat 陣列中的索引
 */
async function showWIPopup(messageId) {
    const message = chat[messageId];
    const activatedWI = message?.extra?.activatedWI;

    if (!activatedWI || activatedWI.length === 0) {
        toastr.info('這則訊息沒有觸發任何世界書條目。');
        return;
    }

    let htmlContent = '<div class="world-info-visualizer-popup">';

    for (const entry of activatedWI) {
        const source = determineWISource(entry);
        const emoji = determineWIEmoji(entry);
        const positionText = getPositionText(entry);
        // 將 HTML 特殊字元跳脫，避免 XSS 風險和顯示問題
        const escapeHtml = (unsafe) => {
            return unsafe
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        };

        // 顯示被觸發的關鍵字。這裡需要一個更複雜的邏輯來比對，我們先簡單顯示所有關鍵字
        // SillyTavern 的事件沒有直接提供「哪個」關鍵字被觸發，只提供了整個被觸發的條目。
        // 這裡我們先顯示所有主要和次要關鍵字。
        const primaryKeys = (entry.key || []).join(', ');
        const secondaryKeys = (entry.keysecondary || []).join(', ');

        htmlContent += `
            <div class="entry-block">
                <h3>${escapeHtml(source)}:</h3>
                <p><b>${escapeHtml(entry.world)} - ${escapeHtml(entry.comment || '無標題')} - ${emoji}</b></p>
                <p><b>主關鍵字:</b> ${escapeHtml(primaryKeys)}</p>
                ${secondaryKeys ? `<p><b>過濾器:</b> ${escapeHtml(secondaryKeys)}</p>` : ''}
                <p><b>插入:</b> ${escapeHtml(positionText)}</p>
                <p><b>內容:</b></p>
                <pre><code>${escapeHtml(substituteParams(entry.content))}</code></pre>
            </div>
        `;
    }

    htmlContent += '</div>';

    // 增加一些 CSS 樣式
    htmlContent += `
        <style>
            .world-info-visualizer-popup .entry-block {
                border: 1px solid var(--border-color);
                border-radius: 5px;
                padding: 10px;
                margin-bottom: 10px;
                background-color: var(--background-color);
            }
            .world-info-visualizer-popup h3 {
                margin-top: 0;
                color: var(--text-color-primary);
            }
            .world-info-visualizer-popup p {
                margin: 5px 0;
            }
            .world-info-visualizer-popup pre {
                white-space: pre-wrap;
                word-wrap: break-word;
                background-color: var(--background-dark-color);
                padding: 8px;
                border-radius: 4px;
                max-height: 200px;
                overflow-y: auto;
            }
        </style>
    `;


    const popup = new Popup(htmlContent, POPUP_TYPE.TEXT, null, {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: '關閉',
    });

    await popup.show();
}


/**
 * 在訊息區塊上新增一個按鈕
 * @param {number} messageId - 訊息在 chat 陣列中的索引
 */
function addWIVisualizerButton(messageId) {
    const message = chat[messageId];
    // 只在 AI 回覆且有觸發紀錄時顯示按鈕
    if (message.is_user || message.is_system || !message?.extra?.activatedWI || message.extra.activatedWI.length === 0) {
        return;
    }

    const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
    if (!messageElement) return;

    // 避免重複新增
    if (messageElement.querySelector('.wi-visualizer-btn')) return;

    const buttonsContainer = messageElement.querySelector('.mes_buttons');
    if (buttonsContainer) {
        const btn = document.createElement('div');
        btn.classList.add('wi-visualizer-btn', 'mes_button', 'fa-solid', 'fa-book-open');
        btn.title = '查看觸發的世界書';
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            showWIPopup(messageId);
        });

        // 將按鈕插入到複製按鈕之前
        const copyButton = buttonsContainer.querySelector('.mes_copy');
        if (copyButton) {
            buttonsContainer.insertBefore(btn, copyButton);
        } else {
            buttonsContainer.appendChild(btn);
        }
    }
}


// 初始化擴充功能
function init() {
    // 監聽 `WORLD_INFO_ACTIVATED` 事件，這是最關鍵的一步
    eventSource.on(event_types.WORLD_INFO_ACTIVATED, (activatedEntries) => {
        // 暫存觸發的條目。我們需要深度複製，避免後續操作影響原始資料
        lastActivatedEntries = JSON.parse(JSON.stringify(activatedEntries));
    });

    // 監聽 `CHARACTER_MESSAGE_RENDERED` 事件，這表示一則新訊息已經顯示在畫面上
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        const message = chat[messageId];
        
        // 如果是 AI 的訊息，且我們剛好有暫存的觸發紀錄，就綁定到訊息上
        if (message && !message.is_user && lastActivatedEntries.length > 0) {
            if (!message.extra) {
                message.extra = {};
            }
            message.extra.activatedWI = lastActivatedEntries;
            
            // 綁定後清空暫存，為下一次生成做準備
            lastActivatedEntries = [];
        }

        // 為這則訊息加上我們的按鈕
        addWIVisualizerButton(messageId);
    });

    // 當聊天紀錄被載入或切換時，為所有已存在的訊息加上按鈕
    eventSource.on(event_types.CHAT_CHANGED, () => {
        // 延遲一點執行，確保 DOM 都已渲染完畢
        setTimeout(() => {
            for (let i = 0; i < chat.length; i++) {
                addWIVisualizerButton(i);
            }
        }, 500);
        // 清空暫存，避免污染新的聊天
        lastActivatedEntries = [];
    });
}

// 執行初始化
init();

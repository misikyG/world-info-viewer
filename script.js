import {
    eventSource,
    event_types,
    characters,
    this_chid,
    chat_metadata,
} from '../../script.js';
import {
    selected_world_info,
    getWorldInfoPrompt,
} from '../world-info.js';
import { callGenericPopup, POPUP_TYPE } from '../popup.js';

// 這是一個臨時變數，用來儲存 Generate() 函式中最新一次計算出的世界書觸發結果
let lastTriggeredWI = null;

// 這是一個 Map，用來將觸發結果與特定的訊息 ID 永久關聯起來
// 格式：{ messageId => allActivatedEntries }
const triggeredDataMap = new Map();

/**
 * 格式化觸發的世界書資料，轉換成易於閱讀的 HTML 字串
 * @param {Set<object>} data - 從 allActivatedEntries 來的觸發條目集合
 * @returns {string} - 格式化後的 HTML 字串
 */
function formatWIDataToHtml(data) {
    if (!data || data.size === 0) {
        return '<p>此訊息沒有觸發任何世界書條目。</p>';
    }

    const characterBook = characters[this_chid]?.data?.extensions?.world;
    const chatBook = chat_metadata.world_info;

    let html = '<div class="wi-viewer-popup-content">';

    // 將 Set 轉換為 Array 以便排序
    const sortedEntries = Array.from(data);

    for (const entry of sortedEntries) {
        // 判斷 Emoji
        let emoji = '❔'; // 預設
        if (entry.vectorized) {
            emoji = '🔗'; // 向量
        } else if (selected_world_info.includes(entry.world)) {
            emoji = '🟢'; // 全域
        } else if (entry.world === characterBook) {
            emoji = '🔵'; // 角色主要
        } else if (entry.world === chatBook) {
            emoji = '💬'; // 角色聊天 (自訂一個)
        } else {
            emoji = '📘'; // 其他 (例如角色的次要知識書)
        }

        // 提取並清理資料
        const bookName = entry.world?.replace('.json', '') ?? '未知書本';
        const entryName = entry.comment ?? '未命名條目';
        const keywords = (entry.key ?? []).join(', ');
        const secondaryKeywords = (entry.keysecondary ?? []).join(', ');
        const position = entry.position ?? 0;
        let positionText = '角色設定前';
        switch(position) {
            case 1: positionText = '角色設定後'; break;
            case 4: positionText = `系統/深度 ${entry.depth ?? '未知'}`; break;
            // 其他位置可以根據需要添加
        }

        html += `
            <div class="entry">
                <div class="entry-title">${bookName} - ${entryName} - ${emoji}</div>
                <div>主關鍵字: ${keywords}</div>
                ${secondaryKeywords ? `<div>過濾器: ${secondaryKeywords}</div>` : ''}
                <div>插入: ${positionText}</div>
                <div>內容:</div>
                <pre><code>${entry.content ?? '無內容'}</code></pre>
            </div>
        `;
    }

    html += '</div>';
    return html;
}

// 這是我們擴充功能的核心技巧：猴子補丁 (Monkey Patching)
// 我們將攔截原始的 getWorldInfoPrompt 函式，以便在其執行後捕獲其結果。
const original_getWorldInfoPrompt = getWorldInfoPrompt;

async function patched_getWorldInfoPrompt(...args) {
    // 首先，執行原始的函式並獲取其結果
    const result = await original_getWorldInfoPrompt(...args);

    // 檢查結果是否存在，並包含我們需要的 allActivatedEntries
    if (result && result.allActivatedEntries) {
        // 將觸發結果暫存到我們的全域變數中
        console.log('[WI-Viewer] 捕獲到觸發的世界書:', result.allActivatedEntries);
        lastTriggeredWI = result.allActivatedEntries;
    }

    // 最重要的一步：將原始結果原封不動地返回，確保 SillyTavern 的其他部分能正常運作
    return result;
}

// 使用我們的補丁版本覆蓋原始函式
// 由於 ES6 模組的特性，我們不能直接覆蓋導入的函式。
// 我們需要修改導入它的模組的命名空間。這是一個比較 Hacky 的做法，但對擴充來說是必要的。
// 為了簡化，我們先監聽一個一定會觸發的事件，確保所有模組都已載入。
eventSource.on(event_types.APP_READY, () => {
    // 為了讓猴子補丁生效，我們需要找到誰 import 了 `getWorldInfoPrompt`
    // 在這個案例中是 `script.js` 的 `Generate` 函式。由於我們無法直接修改 `Generate`
    // 最簡單的方式是在 `world-info.js` 模組本身動手腳。
    // 不幸的是，直接覆蓋導入的函式是不可靠的。
    // 最可靠的方式是透過事件來傳遞資料。讓我們改變策略。

    // **新的、更穩定的策略：使用事件**
    // SillyTavern v1.12.0+ 之後的版本提供了一個專門的事件。
    if (event_types.WORLD_INFO_ACTIVATED) {
        eventSource.on(event_types.WORLD_INFO_ACTIVATED, (activatedEntries) => {
            console.log('[WI-Viewer] 透過 WORLD_INFO_ACTIVATED 事件捕獲到觸發的世界書。');
            lastTriggeredWI = new Set(activatedEntries);
        });
    } else {
        // 如果是舊版本，我們需要提示用戶或放棄
        console.warn('[WI-Viewer] 您的 SillyTavern 版本太舊，不支援 WORLD_INFO_ACTIVATED 事件，此擴充功能可能無法運作。');
    }
});


// 當一個新訊息（無論是使用者還是AI）被加入到 chat 陣列時觸發
eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
    // 我們只關心 AI 的回覆，而 AI 回覆時 lastTriggeredWI 才會有值。
    if (lastTriggeredWI) {
        // 將捕獲到的觸發資料與這個新訊息的 ID 關聯起來
        triggeredDataMap.set(messageId, lastTriggeredWI);
        console.log(`[WI-Viewer] 已將觸發資料關聯到訊息 ID: ${messageId}`);

        // 清空臨時變數，為下一次生成做準備
        lastTriggeredWI = null;
    }
});

// 當訊息的 HTML 元素被渲染到聊天視窗後觸發
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    // 檢查這個訊息 ID 是否有關聯的觸發資料
    if (triggeredDataMap.has(messageId)) {
        const triggeredData = triggeredDataMap.get(messageId);

        // 如果有觸發的條目，我們才新增按鈕
        if (triggeredData.size > 0) {
            const messageElement = $(`.mes[mesid="${messageId}"]`);
            const buttonGroup = messageElement.find('.mes_buttons');

            // 避免重複添加按鈕
            if (buttonGroup.find('.wi-viewer-button').length === 0) {
                const buttonHtml = `
                    <div class="wi-viewer-button" title="查看觸發的世界書 (${triggeredData.size} 條)">
                        <i class="fa-solid fa-book-open"></i>
                    </div>
                `;
                buttonGroup.prepend(buttonHtml);
            }
        }
    }
});

// 使用事件委派來處理按鈕點擊，這樣我們就不需要為每個按鈕單獨綁定事件
$('#chat').on('click', '.wi-viewer-button', function () {
    const messageId = $(this).closest('.mes').attr('mesid');
    const triggeredData = triggeredDataMap.get(Number(messageId));

    if (triggeredData) {
        // 格式化資料並顯示彈出視窗
        const htmlContent = formatWIDataToHtml(triggeredData);
        callGenericPopup(htmlContent, POPUP_TYPE.TEXT, '', {
            wide: true,
            large: true,
            okButton: '關閉',
        });
    } else {
        console.warn(`[WI-Viewer] 找不到訊息 ID ${messageId} 的觸發資料。`);
    }
});

// 當聊天被清除時，我們也應該清除我們的 Map，以防記憶體洩漏
eventSource.on(event_types.CHAT_CLEARED, () => {
    triggeredDataMap.clear();
    console.log('[WI-Viewer] 聊天已清除，觸發資料已重設。');
});
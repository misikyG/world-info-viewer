import { getContext } from '../../st-context.js';
import { eventSource, event_types } from '../../script.js';
import { Popup, POPUP_TYPE } from '../../popup.js';
import { world_info_position, world_info_logic } from '../../world-info.js';
import { extension_prompt_roles } from '../../script.js';

// 用來暫時存放最近一次生成所觸發的世界書條目
let lastActivatedEntries = [];

/**
 * 將條目的插入位置枚舉轉換為人類可讀的字串
 * @param {object} entry - 單個世界書條目物件
 * @returns {string} - 格式化後的插入位置字串
 */
function getPositionString(entry) {
    const { position, depth, role } = entry;
    switch (position) {
        case world_info_position.before: return "角色設定前 (Before Definition)";
        case world_info_position.after: return "角色設定後 (After Definition)";
        case world_info_position.ANTop: return "作者備註頂部 (AN Top)";
        case world_info_position.ANBottom: return "作者備註底部 (AN Bottom)";
        case world_info_position.atDepth:
            const roleName = Object.keys(extension_prompt_roles).find(key => extension_prompt_roles[key] === role) || 'SYSTEM';
            return `聊天深度 ${depth} (Role: ${roleName})`;
        case world_info_position.EMTop: return "範例對話頂部 (EM Top)";
        case world_info_position.EMBottom: return "範例對話底部 (EM Bottom)";
        case world_info_position.outlet: return `Outlet: ${entry.outletName || 'N/A'}`;
        default: return "未知 (Unknown)";
    }
}

/**
 * 處理按鈕點擊事件，顯示彈出視窗
 */
function handleViewButtonClick() {
    // 從按鈕的 data 中取出綁定的條目資料
    const entries = $(this).data('entries');

    if (!entries || entries.length === 0) {
        toastr.info("這則訊息沒有觸發任何世界書條目。");
        return;
    }

    // 開始建立彈出視窗的 HTML 內容
    const context = getContext();
    const character = context.characters[context.characterId];
    const charPrimaryBook = character?.data?.extensions?.world;
    const charChatBook = context.chat_metadata?.world_info; // 在新版 ST 中，key 是 'world_info'

    // 1. 分類條目
    const categorized = {
        global: [],
        primary: [],
        chat: [],
        other: [] // 備用分類
    };

    for (const entry of entries) {
        if (entry.world === charPrimaryBook) {
            categorized.primary.push(entry);
        } else if (entry.world === charChatBook) {
            categorized.chat.push(entry);
        } else if (context.world_info_settings?.world_info?.globalSelect?.includes(entry.world)) {
            categorized.global.push(entry);
        } else {
            categorized.other.push(entry);
        }
    }

    // 2. 建立 HTML
    let html = '<div class="wi-viewer-popup">';

    // 輔助函式，用來渲染一個分類的內容
    const renderCategory = (title, entryList) => {
        if (entryList.length === 0) return '';

        let categoryHtml = `<h4 class="wi-category-title">${title}</h4>`;
        for (const entry of entryList) {
            // 決定表情符號
            let emoji = '🟢'; // 預設：由關鍵字觸發
            if (entry.constant) emoji = '🔵'; // 固定啟用
            if (entry.vectorized) emoji = '🔗'; // 向量觸發
            // 注意：'sticky' (黏著) 的狀態可能需要更複雜的邏輯來判斷，這裡暫時簡化

            // 格式化關鍵字
            const primaryKeys = entry.key.join(', ') || '無';
            const secondaryKeys = entry.keysecondary?.join(', ') || '無';
            const logic = Object.keys(world_info_logic).find(key => world_info_logic[key] === entry.selectiveLogic) || 'AND_ANY';

            // 格式化插入位置
            const positionStr = getPositionString(entry);

            // 清理並顯示內容
            const sanitizedContent = DOMPurify.sanitize(entry.content);

            categoryHtml += `
                <div class="wi-entry">
                    <div class="wi-entry-header">${entry.world} - ${entry.comment || '(未命名)'} ${emoji}</div>
                    <div class="wi-entry-details">
                        <strong>主關鍵字:</strong> <code>${primaryKeys}</code><br>
                        <strong>過濾器 (${logic}):</strong> <code>${secondaryKeys}</code><br>
                        <strong>插入:</strong> ${positionStr}
                    </div>
                    <div class="wi-entry-content"><pre>${sanitizedContent}</pre></div>
                </div>
            `;
        }
        return categoryHtml;
    };

    html += renderCategory('全域世界書 (Global)', categorized.global);
    html += renderCategory('角色主要知識書 (Character)', categorized.primary);
    html += renderCategory('角色聊天知識書 (Chat)', categorized.chat);
    html += renderCategory('其他 (Other)', categorized.other);
    html += '</div>';


    // 3. 顯示彈出視窗
    new Popup(html, POPUP_TYPE.TEXT, null, {
        title: "觸發的世界書 (Activated World Info)",
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: "關閉",
    }).show();
}

// 監聽 `WORLD_INFO_ACTIVATED` 事件
// 這個事件在世界書掃描完成後、訊息渲染前觸發
eventSource.on(event_types.WORLD_INFO_ACTIVATED, (entries) => {
    console.log("World Info Viewer: 捕獲到觸發的條目", entries);
    // 暫時儲存這些條目
    lastActivatedEntries = entries;
});

// 監聽 `CHARACTER_MESSAGE_RENDERED` 事件
// 這個事件在 AI 訊息被加到 DOM 之後觸發
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    // 檢查是否有暫存的觸發條目
    if (lastActivatedEntries && lastActivatedEntries.length > 0) {
        const messageElement = $(`#chat .mes[mesid="${messageId}"]`);

        // 確保這是一則 AI 訊息且元素存在
        if (messageElement.length > 0 && messageElement.attr('is_user') === 'false') {
            console.log(`World Info Viewer: 為訊息 #${messageId} 加上按鈕`);

            // 建立按鈕
            const button = $('<div class="wi-viewer-button"><i class="fa-solid fa-book-open"></i></div>');
            button.attr('title', '檢視已觸發的世界書 (View Activated World Info)');

            // 重要：深度複製一份條目資料，因為 lastActivatedEntries 很快會被下一次生成覆蓋
            const entriesForThisMessage = JSON.parse(JSON.stringify(lastActivatedEntries));

            // 將資料綁定到按鈕上，並設定點擊事件
            button.data('entries', entriesForThisMessage);
            button.on('click', handleViewButtonClick);

            // 將按鈕插入到訊息標頭中
            messageElement.find('.mes_header').append(button);
        }
    }

    // 清空暫存，為下一次生成做準備
    lastActivatedEntries = [];
});

// 在擴充載入時打個招呼
console.log("World Info Viewer extension loaded!");
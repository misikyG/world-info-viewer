// [修正] 引入 SillyTavern 的核心功能時，使用了正確的變數名稱 event_types
// 並且從 script.js 引入了全域的 chat 變數，這是存放所有聊天訊息的地方
import { eventSource, event_types as eventTypes, chat } from '../../../../script.js';

// [修正] 分別從 extensions.js 和 popup.js 導入所需的功能
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

// [說明] 這個名稱必須與您的擴充功能資料J夾名稱和 manifest.json 中的設定完全一致！
const extensionName = "st-world-info-viewer";

// [說明] 世界書位置的定義，用於分類和顯示 Emoji。
// [修正] 調整了 positionInfo 的結構，使其更容易使用
const positionInfo = {
    0: { name: "角色設定前", emoji: "🟢", category: "global" },
    1: { name: "角色設定後", emoji: "🔵", category: "character" },
    2: { name: "筆記頂部", emoji: "📝", category: "other" },
    3: { name: "筆記底部", emoji: "📝", category: "other" },
    4.1: { name: "系統提示", emoji: "🔗", category: "chat" }, // 深度插入的細分
    4.2: { name: "JAILBREAK 之後", emoji: "🔗", category: "chat" },
    4.3: { name: "範例之前", emoji: "🔗", category: "chat" },
    4.4: { name: "聊天紀錄中", emoji: "🔗", category: "chat" },
    5: { name: "範例頂部", emoji: "💡", category: "other" },
    6: { name: "範例底部", emoji: "💡", category: "other" },
    7: { name: "通道", emoji: "🔌", category: "other" },
};

// ------------------------------
// 主要邏輯 (已大幅簡化)
// ------------------------------

// [修正] 這是唯一需要的事件監聽器。當一則 AI 訊息在畫面上渲染完成時觸發。
eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    // [說明] SillyTavern 會將觸發的世界書資訊存放在 message.extra.world_info 中
    const message = chat[messageId];

    // [說明] 檢查這則訊息是否真的有觸發世界書
    if (message && message.extra && Array.isArray(message.extra.world_info) && message.extra.world_info.length > 0) {
        console.log(`[${extensionName}] 偵測到訊息 #${messageId} 觸發了 ${message.extra.world_info.length} 個世界書條目。`);
        
        // [說明] 將世界書資料傳遞給函式，準備加入按鈕
        addViewButtonToMessage(messageId, message.extra.world_info);
    }
});


// ------------------------------
// 輔助函式
// ------------------------------

/**
 * [修正] 重新組織資料的函式，現在直接接收世界書條目陣列
 * @param {Array} entries - 來自 message.extra.world_info 的原始資料
 * @returns {object} - 分類整理後的資料，用於渲染 popup
 */
function organizeWorldInfoData(entries) {
    const organized = { global: [], character: [], chat: [] };

    entries.forEach(entry => {
        // [修正] SillyTavern 對於深度插入的位置有更詳細的數字 (如 4.1, 4.2)，這裡做對應
        const posKey = entry.position === 4 ? `4.${entry.scan_depth}` : entry.position;
        const posInfo = positionInfo[posKey] || { name: `未知位置 (${posKey})`, emoji: "❓", category: "other" };

        const formattedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 ${entry.uid}`,
            // [修正] 如果是向量觸發，就在原有的 emoji 後面加上大腦 emoji
            emoji: posInfo.emoji + (entry.vectorized ? '🧠' : ''),
            position: posInfo.name,
            content: entry.content,
            // [說明] 顯示被觸發的關鍵字和過濾器 (如果有)
            keys: entry.matched_keys ? entry.matched_keys.join(", ") : "N/A",
            secondaryKeys: entry.matched_secondary_keys ? entry.matched_secondary_keys.join(", ") : "N/A",
        };

        // [修正] 根據 category 進行分類，而不是 emoji
        switch (posInfo.category) {
            case "global":
                organized.global.push(formattedEntry);
                break;
            case "character":
                organized.character.push(formattedEntry);
                break;
            case "chat":
                organized.chat.push(formattedEntry);
                break;
            default:
                // 其他類型暫時不顯示，但可以根據需要加入 organized.other
                break;
        }
    });
    return organized;
}

/**
 * [修正] 在指定的訊息上加入 "查看世界書" 按鈕
 * @param {string} messageId - 訊息的 ID
 * @param {Array} worldInfoEntries - 這則訊息觸發的世界書原始資料
 */
function addViewButtonToMessage(messageId, worldInfoEntries) {
    // [說明] 使用 setTimeout 是個好習慣，確保 DOM 元素已經完全穩定
    setTimeout(() => {
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) {
            console.error(`[${extensionName}] 找不到 ID 為 ${messageId} 的訊息元素。`);
            return;
        }

        // [說明] 防止重複加入按鈕
        if (messageElement.querySelector(".worldinfo-viewer-btn")) {
            return;
        }

        const button = document.createElement("div");
        button.className = "worldinfo-viewer-btn mes_button"; // 'mes_button' 是 SillyTavern 的標準按鈕樣式
        button.innerHTML = '<i class="fa-solid fa-book-open"></i>';
        button.title = "查看此訊息觸發的世界書";

        // [說明] 按鈕點擊事件
        button.addEventListener("click", (event) => {
            event.stopPropagation(); // 防止觸發其他訊息點擊事件
            // [修正] 在點擊時才整理資料並顯示彈窗
            const organizedData = organizeWorldInfoData(worldInfoEntries);
            showWorldInfoPopup(organizedData);
        });

        const buttonContainer = messageElement.querySelector(".mes_buttons");
        if (buttonContainer) {
            // [說明] prepend 可以讓按鈕顯示在最前面
            buttonContainer.prepend(button);
            console.log(`[${extensionName}] 已成功將按鈕添加到訊息 #${messageId}。`);
        } else {
            // [說明] 這個警告很重要，如果 ST 未來更新了介面，可以從這裡發現問題
            console.warn(`[${extensionName}] 在訊息 #${messageId} 中找不到 .mes_buttons 容器。`);
        }
    }, 100); // 延遲 100 毫秒
}

/**
 * [修正] 顯示世界書資訊的彈窗，現在直接接收整理好的資料
 * @param {object} data - 由 organizeWorldInfoData 整理好的資料
 */
async function showWorldInfoPopup(data) {
    // [說明] 檢查是否有任何資料可以顯示
    if (!data.global.length && !data.character.length && !data.chat.length) {
        toastr.info("沒有可顯示的世界書觸發資料。");
        return;
    }

    try {
        // [說明] 異步渲染 popup 的 HTML 模板，並傳入資料
        const html = await renderExtensionTemplateAsync(extensionName, "popup", data);
        
        // [說明] 呼叫 SillyTavern 的標準彈窗函式
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
    // [說明] 這是擴充功能載入時執行的起點
    console.log(`[${extensionName}] 擴充已載入並開始監聽訊息。`);
});

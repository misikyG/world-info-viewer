// 引入SillyTavern的核心功能
import { eventSource, eventTypes } from '../../../../script.js';
import {
    getContext,
    renderExtensionTemplateAsync,
    callGenericPopup,
    POPUP_TYPE
} from '../../../extensions.js';

// ------------------------------
// 全域變數和設定
// ------------------------------

const extensionName = "WorldInfoViewer";
const messageWorldInfoMap = new Map();

// 世界書位置對應的資訊
const positionInfo = {
    0: { name: "角色設定前", emoji: "🟢", category: "全域世界書" },
    1: { name: "角色設定後", emoji: "🔵", category: "角色主要知識書" },
    4: { name: "深度", emoji: "🔗", category: "角色聊天知識書" },
};

// ------------------------------
// 主要邏輯
// ------------------------------

// 步驟一：當世界書被觸發時，記錄相關資訊
eventSource.on(eventTypes.WORLDINFO_ACTIVATED, (activatedEntries) => {
    if (!activatedEntries || activatedEntries.length === 0) return;

    // 找到這則訊息的DOM元素
    const lastMessage = document.querySelector('#chat .mes:last-child');
    if (!lastMessage) {
        console.warn(`[${extensionName}] WORLDINFO_ACTIVATED: 找不到最後一則訊息。`);
        return;
    }

    const messageId = lastMessage.getAttribute('mesid');
    if (!messageId) {
        console.warn(`[${extensionName}] WORLDINFO_ACTIVATED: 最後一則訊息沒有 'mesid'。`);
        return;
    }

    const organizedData = organizeWorldInfoData(activatedEntries);
    messageWorldInfoMap.set(messageId, organizedData);
    console.log(`[${extensionName}] 已為訊息 #${messageId} 記錄 ${activatedEntries.length} 個世界書觸發。`);
});

// 步驟二：當AI訊息完全渲染到畫面上後，才開始加入按鈕
eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    // 確保傳入的 messageId 是字串格式
    const msgIdStr = String(messageId);

    // 檢查這則訊息是否有對應的世界書觸發紀錄
    if (messageWorldInfoMap.has(msgIdStr)) {
        console.log(`[${extensionName}] CHARACTER_MESSAGE_RENDERED: 訊息 #${msgIdStr} 已渲染，且有世界書資料，準備加入按鈕。`);
        addViewButtonToMessage(msgIdStr);
    }
});

// ------------------------------
// 輔助函式
// ------------------------------

/**
 * 將原始觸發資料整理成我們需要的格式
 * @param {Array} entries - 原始世界書觸發條目陣列
 * @returns {Object} 整理分類後的資料
 */
function organizeWorldInfoData(entries) {
    const organized = { global: [], character: [], chat: [], other: [] };
    entries.forEach(entry => {
        const posInfo = positionInfo[entry.position] || { name: `位置 ${entry.position}`, emoji: "❓", category: "其他" };
        const formattedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 ${entry.uid}`,
            emoji: posInfo.emoji,
            position: posInfo.name,
            content: entry.content,
            keys: entry.key ? entry.key.join(", ") : "",
            secondaryKeys: entry.keysecondary && entry.keysecondary.length > 0 ? entry.keysecondary.join(", ") : "",
            depth: entry.depth || ""
        };

        switch (posInfo.category) {
            case "全域世界書": organized.global.push(formattedEntry); break;
            case "角色主要知識書": organized.character.push(formattedEntry); break;
            case "角色聊天知識書": organized.chat.push(formattedEntry); break;
            default: organized.other.push(formattedEntry); break;
        }
    });
    return organized;
}

/**
 * 為指定的訊息添加「查看世界書」按鈕
 * @param {string} messageId - 訊息的ID
 */
function addViewButtonToMessage(messageId) {
    // 使用 setTimeout 確保 DOM 完全穩定
    setTimeout(() => {
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) {
            console.error(`[${extensionName}] addViewButtonToMessage: 找不到 ID 為 ${messageId} 的訊息元素。`);
            return;
        }

        // 防止重複添加按鈕
        if (messageElement.querySelector(".worldinfo-viewer-btn")) {
            console.log(`[${extensionName}] addViewButtonToMessage: 訊息 #${messageId} 已存在按鈕，跳過。`);
            return;
        }

        // 創建按鈕元素
        const button = document.createElement("div");
        button.className = "worldinfo-viewer-btn mes_button";
        button.innerHTML = '<i class="fa-solid fa-book-open"></i>'; // 使用一個更具體的圖示
        button.title = "查看此訊息觸發的世界書";
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            showWorldInfoPopup(messageId);
        });

        // **關鍵：尋找並附加到正確的位置**
        let buttonContainer = messageElement.querySelector(".mes_buttons");
        if (buttonContainer) {
            console.log(`[${extensionName}] addViewButtonToMessage: 找到 .mes_buttons 容器，將按鈕插入最前方。`);
            buttonContainer.prepend(button);
        } else {
            // **備用方案**：如果找不到 .mes_buttons，就附加到 .mesblock
            console.warn(`[${extensionName}] addViewButtonToMessage: 找不到 .mes_buttons 容器！使用備用方案附加到 .mesblock。`);
            const mesBlock = messageElement.querySelector('.mesblock');
            if (mesBlock) {
                // 為了讓備用方案的樣式好看一點，我們手動加一些樣式
                button.style.position = 'absolute';
                button.style.right = '30px';
                button.style.top = '5px';
                button.style.zIndex = '10';
                mesBlock.style.position = 'relative'; // 確保父元素有定位
                mesBlock.appendChild(button);
            } else {
                console.error(`[${extensionName}] addViewButtonToMessage: 連 .mesblock 都找不到，無法添加按鈕！`);
            }
        }
    }, 200); // 增加延遲以應對複雜的UI渲染
}

/**
 * 顯示包含世界書觸發內容的彈窗
 * @param {string} messageId - 訊息的ID
 */
async function showWorldInfoPopup(messageId) {
    const data = messageWorldInfoMap.get(messageId);
    if (!data) {
        toastr.info("此訊息沒有紀錄的世界書觸發資料。");
        return;
    }

    try {
        // 注意：這裡的模板名稱不需要 'third-party/' 前綴
        const html = await renderExtensionTemplateAsync("worldinfo-viewer", "popup", data);
        callGenericPopup(html, POPUP_TYPE.TEXT, "已觸發的世界書", {
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
    console.log(`[${extensionName}] 擴充已載入 (v3 - 最終穩定版)`);
});

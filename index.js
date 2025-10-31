import { eventSource, event_types } from "../../../script.js";
import { renderExtensionTemplateAsync } from "../../extensions.js";

// 儲存每則訊息觸發的世界書資料
const messageWorldInfoMap = new Map();

// 位置對應的中文名稱和 emoji
const positionInfo = {
    0: { name: "角色設定前", emoji: "🟢", category: "全域世界書" },
    1: { name: "角色設定後", emoji: "🔵", category: "角色主要知識書" },
    2: { name: "AN頂部", emoji: "📝", category: "角色聊天知識書" },
    3: { name: "AN底部", emoji: "📝", category: "角色聊天知識書" },
    4: { name: "深度", emoji: "🔗", category: "角色聊天知識書" },
    5: { name: "範例頂部", emoji: "📖", category: "其他" },
    6: { name: "範例底部", emoji: "📖", category: "其他" },
    7: { name: "插座", emoji: "🔌", category: "其他" }
};

// 根據世界書來源判斷類別
function getCategoryByWorld(worldName, position) {
    // 這裡可以根據實際情況調整判斷邏輯
    const posInfo = positionInfo[position] || { category: "其他" };
    return posInfo.category;
}

// 監聽世界書觸發事件
eventSource.on(event_types.WORLDINFO_ACTIVATED, async (activatedEntries) => {
    if (!activatedEntries || activatedEntries.length === 0) {
        return;
    }

    // 獲取當前訊息的ID（假設是最新的訊息）
    const messageId = getCurrentMessageId();
    
    // 整理觸發的世界書資料
    const organizedData = organizeWorldInfoData(activatedEntries);
    
    // 儲存到 Map 中
    messageWorldInfoMap.set(messageId, organizedData);
    
    // 為訊息添加檢視按鈕
    addViewButtonToMessage(messageId);
});

// 整理世界書資料
function organizeWorldInfoData(entries) {
    const organized = {
        global: [], // 全域世界書
        character: [], // 角色主要知識書
        chat: [], // 角色聊天知識書
        other: [] // 其他
    };

    entries.forEach(entry => {
        const category = getCategoryByWorld(entry.world, entry.position);
        const posInfo = positionInfo[entry.position] || { name: "未知", emoji: "❓" };
        
        const formattedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 ${entry.uid}`,
            emoji: posInfo.emoji,
            position: posInfo.name,
            content: entry.content,
            keys: entry.key ? entry.key.join(", ") : "",
            secondaryKeys: entry.keysecondary && entry.keysecondary.length > 0 
                ? entry.keysecondary.join(", ") 
                : "",
            depth: entry.depth || ""
        };

        // 根據類別分類
        if (category === "全域世界書") {
            organized.global.push(formattedEntry);
        } else if (category === "角色主要知識書") {
            organized.character.push(formattedEntry);
        } else if (category === "角色聊天知識書") {
            organized.chat.push(formattedEntry);
        } else {
            organized.other.push(formattedEntry);
        }
    });

    return organized;
}

// 獲取當前訊息ID
function getCurrentMessageId() {
    // 這裡需要根據實際的 DOM 結構來獲取
    const messages = document.querySelectorAll("#chat .mes");
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        return lastMessage.getAttribute("mesid") || messages.length - 1;
    }
    return Date.now(); // 備用方案
}

// 為訊息添加檢視按鈕
function addViewButtonToMessage(messageId) {
    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) return;

    // 檢查是否已經添加過按鈕
    if (messageElement.querySelector(".worldinfo-viewer-btn")) return;

    // 創建按鈕
    const button = document.createElement("div");
    button.className = "worldinfo-viewer-btn mes_button";
    button.innerHTML = '<i class="fa-solid fa-book"></i>';
    button.title = "查看觸發的世界書";
    
    // 點擊事件
    button.addEventListener("click", () => showWorldInfoPopup(messageId));

    // 將按鈕添加到訊息的按鈕容器中
    const buttonContainer = messageElement.querySelector(".mes_buttons");
    if (buttonContainer) {
        buttonContainer.appendChild(button);
    }
}

// 顯示世界書彈窗
async function showWorldInfoPopup(messageId) {
    const data = messageWorldInfoMap.get(messageId);
    if (!data) {
        toastr.info("此訊息沒有觸發任何世界書");
        return;
    }

    // 使用模板渲染彈窗內容
    const html = await renderExtensionTemplateAsync(
        "third-party/worldinfo-viewer",
        "popup",
        data
    );

    // 使用 SillyTavern 的彈窗系統
    callGenericPopup(html, POPUP_TYPE.TEXT, "", { 
        wide: true, 
        large: true,
        okButton: "關閉",
        allowVerticalScrolling: true
    });
}

// 初始化擴充
jQuery(async () => {
    console.log("世界書觸發檢視器擴充已載入");
    
    // 為已存在的訊息添加按鈕（如果有儲存的資料）
    messageWorldInfoMap.forEach((data, messageId) => {
        addViewButtonToMessage(messageId);
    });
});



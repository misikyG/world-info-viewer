import { eventSource, eventTypes } from "../../../../script.js";
import { 
    getContext,
    renderExtensionTemplateAsync,
    callGenericPopup,
    POPUP_TYPE 
} from "../../../../scripts/extensions.js";

// 儲存每則訊息觸發的世界書資料
const messageWorldInfoMap = new Map();

const positionInfo = {
    0: { name: "角色設定前", emoji: "🟢", category: "全域世界書" },
    1: { name: "角色設定後", emoji: "🔵", category: "角色主要知識書" },
    2: { name: "AN頂部", emoji: "📝", category: "角色聊天知識書" },
    3: { name: "AN底部", emoji: "📝", category: "角色聊天知識書" },
    4: { name: "深度", emoji: "🔗", category: "角色聊天知識書" },
};

// 監聽世界書觸發事件
eventSource.on(eventTypes.WORLDINFO_ACTIVATED, async (activatedEntries) => {
    if (!activatedEntries || activatedEntries.length === 0) {
        return;
    }

    // 獲取當前訊息的ID
    const messageId = getCurrentMessageId();
    
    // 整理觸發的世界書資料
    const organizedData = organizeWorldInfoData(activatedEntries);
    
    // 儲存到 Map 中
    messageWorldInfoMap.set(messageId, organizedData);
    
    // 為訊息添加檢視按鈕
    addViewButtonToMessage(messageId);
});

function organizeWorldInfoData(entries) {
    const organized = {
        global: [],
        character: [],
        chat: [],
        other: []
    };

    entries.forEach(entry => {
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

        const category = posInfo.category;
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

function getCurrentMessageId() {
    const messages = document.querySelectorAll("#chat .mes");
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        return lastMessage.getAttribute("mesid") || messages.length - 1;
    }
    return Date.now();
}

function addViewButtonToMessage(messageId) {
    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) return;

    if (messageElement.querySelector(".worldinfo-viewer-btn")) return;

    const button = document.createElement("div");
    button.className = "worldinfo-viewer-btn mes_button";
    button.innerHTML = '<i class="fa-solid fa-book"></i>';
    button.title = "查看觸發的世界書";
    
    button.addEventListener("click", () => showWorldInfoPopup(messageId));

    const buttonContainer = messageElement.querySelector(".mes_buttons");
    if (buttonContainer) {
        buttonContainer.appendChild(button);
    }
}

async function showWorldInfoPopup(messageId) {
    const data = messageWorldInfoMap.get(messageId);
    if (!data) {
        toastr.info("此訊息沒有觸發任何世界書");
        return;
    }

    const html = await renderExtensionTemplateAsync(
        "third-party/worldinfo-viewer",
        "popup",
        data
    );

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
});

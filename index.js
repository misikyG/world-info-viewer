import { eventSource, eventTypes } from "../../../../script.js";
import {
    getContext,
    renderExtensionTemplateAsync,
    callGenericPopup,
    POPUP_TYPE
} from "../../../extensions.js";

// 儲存每則訊息觸發的世界書資料
const messageWorldInfoMap = new Map();

const positionInfo = {
    0: { name: "角色設定前", emoji: "🟢", category: "全域世界書" },
    1: { name: "角色設定後", emoji: "🔵", category: "角色主要知識書" },
    2: { name: "AN頂部", emoji: "📝", category: "角色聊天知識書" },
    3: { name: "AN底部", emoji: "📝", category: "角色聊天知識書" },
    4: { name: "深度", emoji: "🔗", category: "角色聊天知識書" },
};

// 【第一步】當世界書觸發時，只儲存資料
eventSource.on(eventTypes.WORLDINFO_ACTIVATED, (activatedEntries) => {
    if (!activatedEntries || activatedEntries.length === 0) return;

    // 這裡我們假設最後一則訊息就是觸發源
    const lastMessage = getLastMessage();
    if (!lastMessage) return;

    const messageId = lastMessage.getAttribute('mesid');
    const organizedData = organizeWorldInfoData(activatedEntries);
    messageWorldInfoMap.set(messageId, organizedData);
});

// 【第二步】當訊息渲染完成時，才去檢查並加上按鈕
eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    // 檢查這則渲染好的訊息是否有對應的世界書觸發資料
    if (messageWorldInfoMap.has(String(messageId))) {
        // 時機正好，加上按鈕！
        addViewButtonToMessage(String(messageId));
    }
});


function organizeWorldInfoData(entries) {
    const organized = { global: [], character: [], chat: [], other: [] };

    entries.forEach(entry => {
        const posInfo = positionInfo[entry.position] || { name: "未知", emoji: "❓", category: "其他" };
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

        const category = posInfo.category;
        if (category === "全域世界書") organized.global.push(formattedEntry);
        else if (category === "角色主要知識書") organized.character.push(formattedEntry);
        else if (category === "角色聊天知識書") organized.chat.push(formattedEntry);
        else organized.other.push(formattedEntry);
    });

    return organized;
}

function getLastMessage() {
    const messages = document.querySelectorAll("#chat .mes");
    return messages.length > 0 ? messages[messages.length - 1] : null;
}

function addViewButtonToMessage(messageId) {
    // 延遲一小段時間確保所有按鈕都已就位
    setTimeout(() => {
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) return;

        if (messageElement.querySelector(".worldinfo-viewer-btn")) return;

        const button = document.createElement("div");
        button.className = "worldinfo-viewer-btn mes_button";
        button.innerHTML = '<i class="fa-solid fa-book"></i>';
        button.title = "查看觸發的世界書";

        button.addEventListener("click", () => showWorldInfoPopup(messageId));

        // 找到訊息右側的按鈕容器並插入我們的按鈕
        const buttonContainer = messageElement.querySelector(".mes_buttons");
        if (buttonContainer) {
            buttonContainer.prepend(button); // 使用 prepend 讓它出現在最左邊
        }
    }, 100); // 100毫秒的延遲，增加穩定性
}

async function showWorldInfoPopup(messageId) {
    const data = messageWorldInfoMap.get(messageId);
    if (!data) {
        toastr.info("此訊息沒有觸發任何世界書");
        return;
    }

    const html = await renderExtensionTemplateAsync("worldinfo-viewer", "popup", data);

    callGenericPopup(html, POPUP_TYPE.TEXT, "已觸發的世界書", {
        wide: true,
        large: true,
        okButton: "關閉",
        allowVerticalScrolling: true
    });
}

// 初始化擴充
jQuery(async () => {
    console.log("世界書觸發檢視器擴充已載入 (v2 - 時序修正)");
});

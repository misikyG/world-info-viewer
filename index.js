// [修正] 引入 SillyTavern 的核心功能時，使用了正確的變數名稱
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

// [說明] 這個名稱必須與您的擴充功能資料夾名稱完全一致！
const extensionName = "st-world-info-viewer";
// [修正] 我們不再需要 messageWorldInfoMap，因為資料將直接存儲在 chat 物件中。
// const messageWorldInfoMap = new Map();

// [新增] 用一個臨時變數來儲存最近一次觸發的世界書，直到它被關聯到訊息上。
let latestTriggeredWorldInfo = null;


// [說明] 世界書位置的定義，用於分類和顯示 Emoji。
const positionInfo = {
    0: { name: "角色設定前", emoji: "🟢", category: "global" },
    1: { name: "角色設定後", emoji: "🔵", category: "character" },
    2: { name: "筆記頂部", emoji: "📝", category: "other" },
    3: { name: "筆記底部", emoji: "📝", category: "other" },
    4: { name: "依深度插入", emoji: "🔗", category: "chat" },
    5: { name: "範例頂部", emoji: "💡", category: "other" },
    6: { name: "範例底部", emoji: "💡", category: "other" },
    7: { name: "通道", emoji: "🔌", category: "other" },
};

// ------------------------------
// 主要邏輯
// ------------------------------

// 步驟一：當世界書被觸發時，暫存相關資訊
eventSource.on(eventTypes.WORLD_INFO_ACTIVATED, (activatedEntries) => {
    if (!activatedEntries || activatedEntries.length === 0) {
        latestTriggeredWorldInfo = null; // 如果沒有觸發，清空暫存
        return;
    }

    const organizedData = organizeWorldInfoData(activatedEntries);
    latestTriggeredWorldInfo = organizedData; // 存到臨時變數
    console.log(`[${extensionName}] 偵測到 ${activatedEntries.length} 個世界書觸發，已暫存。`);
});

// 步驟二：當AI訊息物件被創建時，將暫存的資料附加到訊息物件的 extra 屬性中
eventSource.on(eventTypes.MESSAGE_RECEIVED, (messageId) => {
    // 檢查是否有暫存的世界書資料，且目標訊息存在
    if (latestTriggeredWorldInfo && chat[messageId]) {
        // [修正] 將資料直接附加到 chat[messageId].extra 中，使其可以被永久保存
        if (!chat[messageId].extra) {
            chat[messageId].extra = {};
        }
        chat[messageId].extra.worldInfoViewer = latestTriggeredWorldInfo;

        // 清空臨時變數，等待下一次觸發
        latestTriggeredWorldInfo = null;

        console.log(`[${extensionName}] MESSAGE_RECEIVED: 已將暫存的世界書資料附加到訊息 #${messageId} 的 extra 屬性中。`);
    }
});

// 步驟三：當AI訊息完全渲染到畫面上後，加入按鈕 (處理新訊息)
eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    const msgIdStr = String(messageId);
    // [修正] 檢查 chat 物件中是否有我們的資料
    if (chat[messageId] && chat[messageId].extra && chat[messageId].extra.worldInfoViewer) {
        console.log(`[${extensionName}] CHARACTER_MESSAGE_RENDERED: 訊息 #${msgIdStr} 已渲染，準備加入按鈕。`);
        addViewButtonToMessage(msgIdStr);
    }
});

// [新增] 步驟四：當聊天紀錄被載入或切換時，為所有歷史訊息補上按鈕 (處理舊訊息)
eventSource.on(eventTypes.CHAT_CHANGED, () => {
    // 稍微延遲，確保所有訊息都已經被 `printMessages` 渲染到畫面上
    setTimeout(() => {
        document.querySelectorAll('#chat .mes').forEach(messageElement => {
            const mesId = messageElement.getAttribute('mesid');
            if (mesId) {
                const messageData = chat[mesId];
                // 檢查這則歷史訊息是否有儲存的世界書資料
                if (messageData && messageData.extra && messageData.extra.worldInfoViewer) {
                    addViewButtonToMessage(mesId);
                }
            }
        });
        console.log(`[${extensionName}] CHAT_CHANGED: 已為歷史訊息加上世界書按鈕。`);
    }, 500); // 500ms 是一個比較保險的延遲
});


// ------------------------------
// 輔助函式
// ------------------------------

function organizeWorldInfoData(entries) {
    const organized = { global: [], character: [], chat: [], other: [] };
    entries.forEach(entry => {
        const posInfo = positionInfo[entry.position] || { name: `未知位置 (${entry.position})`, emoji: "❓", category: "other" };

        const formattedEntry = {
            worldName: entry.world,
            entryName: entry.comment || `條目 ${entry.uid}`,
            emoji: entry.vectorized ? '🧠' : posInfo.emoji,
            position: posInfo.name,
            content: entry.content,
            keys: entry.key && entry.key.length > 0 ? entry.key.join(", ") : "",
            secondaryKeys: entry.keysecondary && entry.keysecondary.length > 0 ? entry.keysecondary.join(", ") : "",
            depth: entry.depth ?? ""
        };

        // [修正] 根據 category 進行分類，更具擴展性
        const category = posInfo.category;
        if (organized[category]) {
            organized[category].push(formattedEntry);
        } else {
            organized.other.push(formattedEntry); // 備用分類
        }
    });
    return organized;
}

function addViewButtonToMessage(messageId) {
    // 使用 setTimeout 確保 DOM 元素已經準備好
    setTimeout(() => {
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) {
            console.error(`[${extensionName}] addViewButtonToMessage: 找不到 ID 為 ${messageId} 的訊息元素。`);
            return;
        }

        // 如果按鈕已經存在，就不要重複新增
        if (messageElement.querySelector(".worldinfo-viewer-btn")) {
            return;
        }

        // 建立按鈕
        const button = document.createElement("div");
        button.className = "worldinfo-viewer-btn mes_button";
        button.innerHTML = '<i class="fa-solid fa-book-open"></i>';
        button.title = "查看此訊息觸發的世界書";
        
        // 加上點擊事件
        button.addEventListener("click", (event) => {
            event.stopPropagation(); // 防止點擊穿透
            showWorldInfoPopup(messageId);
        });

        // 找到按鈕容器並將按鈕加到最前面
        const buttonContainer = messageElement.querySelector(".mes_buttons");
        if (buttonContainer) {
            buttonContainer.prepend(button);
            console.log(`[${extensionName}] addViewButtonToMessage: 已成功將按鈕添加到訊息 #${messageId}。`);
        } else {
            // 這個警告在某些情況下可能出現，例如訊息還在串流生成中，可以先忽略
            // console.warn(`[${extensionName}] addViewButtonToMessage: 在訊息 #${messageId} 中找不到 .mes_buttons 容器。`);
        }
    }, 100); // 100ms 延遲
}

async function showWorldInfoPopup(messageId) {
    // [修正] 從 chat[messageId].extra 中讀取資料
    const data = chat[messageId]?.extra?.worldInfoViewer;
    if (!data) {
        toastr.info("此訊息沒有紀錄的世界書觸發資料。");
        return;
    }

    try {
        // 渲染 HTML 範本
        const html = await renderExtensionTemplateAsync(extensionName, "popup", data);

        // 使用 callGenericPopup 顯示彈出視窗
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
    console.log(`[${extensionName}] 擴充已載入並初始化。`);
});

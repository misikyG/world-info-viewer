import { eventSource, event_types } from '../../../../script.js';
import { getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

const extensionName = "st-world-info-viewer"; // 必須與資料夾名稱一致
const messageWorldInfoMap = new Map();

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

let lastMessageId = null;

// 步驟一：偵測世界書觸發
eventSource.on(event_types.WORLD_INFO_ACTIVATED, (activatedEntries) => {
  if (!activatedEntries || activatedEntries.length === 0) return;
  
  const organizedData = organizeWorldInfoData(activatedEntries);
  messageWorldInfoMap.set('latest_trigger', organizedData);
  
  console.log(`[${extensionName}] 偵測到 ${activatedEntries.length} 個世界書觸發`);
});

// 步驟二：當訊息被接收時，與世界書資料關聯
eventSource.on(event_types.MESSAGE_RECEIVED, (data) => {
  if (messageWorldInfoMap.has('latest_trigger')) {
    const msgId = data; // 或可能是 data.id，取決於 ST 版本
    const msgIdStr = String(msgId);
    const wiData = messageWorldInfoMap.get('latest_trigger');
    
    messageWorldInfoMap.set(msgIdStr, wiData);
    messageWorldInfoMap.delete('latest_trigger');
    
    lastMessageId = msgIdStr;
    console.log(`[${extensionName}] 關聯世界書至訊息 #${msgIdStr}`);
  }
});

// 步驟三：訊息渲染完成後加入按鈕
eventSource.on(event_types.MESSAGE_RENDERED, () => {
  if (lastMessageId !== null) {
    addViewButtonToMessage(lastMessageId);
    lastMessageId = null;
  }
});

function organizeWorldInfoData(entries) {
  const organized = { global: [], character: [], chat: [], other: [] };
  
  entries.forEach(entry => {
    const posInfo = positionInfo[entry.position] || { 
      name: `未知位置 (${entry.position})`, 
      emoji: "❓", 
      category: "other" 
    };
    
    const formattedEntry = {
      worldName: entry.world || "未命名世界",
      entryName: entry.comment || `條目 ${entry.uid}`,
      emoji: posInfo.emoji,
      position: posInfo.name,
      content: entry.content || "",
      keys: (entry.key && entry.key.length > 0) ? entry.key.join(", ") : "",
      secondaryKeys: (entry.keysecondary && entry.keysecondary.length > 0) ? entry.keysecondary.join(", ") : "",
      depth: entry.depth ?? ""
    };
    
    if (posInfo.category === 'global') {
      organized.global.push(formattedEntry);
    } else if (posInfo.category === 'character') {
      organized.character.push(formattedEntry);
    } else if (posInfo.category === 'chat') {
      organized.chat.push(formattedEntry);
    } else {
      organized.other.push(formattedEntry);
    }
  });
  
  return organized;
}

function addViewButtonToMessage(messageId) {
  setTimeout(() => {
    // 試試看這兩種選擇器
    let messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    
    if (!messageElement) {
      messageElement = document.querySelector(`.mes[data-id="${messageId}"]`);
    }
    
    if (!messageElement) {
      console.warn(`[${extensionName}] 找不到訊息元素 (ID: ${messageId})`);
      return;
    }
    
    // 檢查按鈕是否已存在
    if (messageElement.querySelector(".worldinfo-viewer-btn")) {
      return;
    }
    
    const button = document.createElement("button");
    button.className = "worldinfo-viewer-btn mes_button";
    button.innerHTML = '📖'; // 或使用圖標
    button.title = "查看此訊息觸發的世界書";
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showWorldInfoPopup(messageId);
    });
    
    const buttonContainer = messageElement.querySelector(".mes_buttons");
    if (buttonContainer) {
      buttonContainer.prepend(button);
      console.log(`[${extensionName}] 按鈕已添加到訊息 #${messageId}`);
    } else {
      console.warn(`[${extensionName}] 找不到 .mes_buttons 容器`);
    }
  }, 100);
}

async function showWorldInfoPopup(messageId) {
  const data = messageWorldInfoMap.get(messageId);
  if (!data) {
    console.info("此訊息沒有紀錄的世界書觸發資料");
    return;
  }
  
  try {
    const html = await renderExtensionTemplateAsync(extensionName, "popup", data);
    callGenericPopup(html, POPUP_TYPE.TEXT, '', {
      wide: true,
      large: true,
      okButton: "關閉",
      allowVerticalScrolling: true
    });
  } catch (error) {
    console.error(`[${extensionName}] 渲染彈窗失敗:`, error);
  }
}

// 擴充初始化
console.log(`[${extensionName}] 擴充已載入`);

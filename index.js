import {
  eventSource,
  event_types,
  chat,
  chat_metadata,
  characters,
  this_chid,
} from '../../../../script.js';

import {
  renderExtensionTemplateAsync
} from '../../../extensions.js';

import {
  callGenericPopup,
  POPUP_TYPE
} from '../../../popup.js';

import {
  METADATA_KEY,
  selected_world_info,
  world_info,
} from '../../../world-info.js';

import { getCharaFilename } from '../../../utils.js';

const url = new URL(import.meta.url);
const extensionName = url.pathname.substring(url.pathname.lastIndexOf('extensions/') + 11, url.pathname.lastIndexOf('/'));

// 插入位置對應表
const positionInfo = {
  0: { name: "角色設定前", emoji: "📙", order: 0 },
  1: { name: "角色設定後", emoji: "📙", order: 1 },
  2: { name: "作者註釋頂部", emoji: "📝", order: 2 },
  3: { name: "作者註釋底部", emoji: "📝", order: 3 },
  5: { name: "範例頂部", emoji: "📄", order: 4 },
  6: { name: "範例底部", emoji: "📄", order: 5 },
  4: { name: "依深度插入", emoji: "💉", order: 6 },
  7: { name: "Outlet", emoji: "➡️", order: 7 },
};

// 選擇邏輯對應表
const selectiveLogicInfo = {
  0: '包含任一 (AND ANY)',
  1: '未完全包含 (NOT ALL)',
  2: '完全不含 (NOT ANY)',
  3: '包含全部 (AND ALL)',
};

// 來源分類鍵
const WI_SOURCE_KEYS = {
  GLOBAL: 'global',
  CHARACTER_PRIMARY: 'characterPrimary',
  CHARACTER_ADDITIONAL: 'characterAdditional',
  CHAT: 'chat',
};

// 條目來源類型（用於同深度排序）
const ENTRY_SOURCE_TYPE = {
  ASSISTANT: 3,  // 最優先
  USER: 2,
  SYSTEM: 1,     // 最低優先
};

/**
 * 獲取條目的狀態資訊
 */
function getEntryStatus(entry) {
  if (entry.constant === true) {
    return { emoji: '🔵', name: '恆定 (Constant)' };
  }
  if (entry.vectorized === true) {
    return { emoji: '🔗', name: '向量 (Vectorized)' };
  }
  return { emoji: '🟢', name: '關鍵字 (Keyword)' };
}

/**
 * 確定世界書的來源（全域/角色主要/角色額外/聊天）
 */
function getWISourceKey(entry) {
  const worldName = entry.world;
  const chatLorebook = chat_metadata[METADATA_KEY];

  if (chatLorebook && worldName === chatLorebook) {
    return WI_SOURCE_KEYS.CHAT;
  }

  const character = characters[this_chid];
  if (character) {
    const primaryLorebook = character.data?.extensions?.world;
    if (primaryLorebook && worldName === primaryLorebook) {
      return WI_SOURCE_KEYS.CHARACTER_PRIMARY;
    }

    const fileName = getCharaFilename(this_chid);
    const extraCharLore = world_info.charLore?.find((e) => e.name === fileName);
    if (extraCharLore && extraCharLore.extraBooks?.includes(worldName)) {
      return WI_SOURCE_KEYS.CHARACTER_ADDITIONAL;
    }
  }

  if (selected_world_info && selected_world_info.includes(worldName)) {
    return WI_SOURCE_KEYS.GLOBAL;
  }

  // 移除「OTHER」分類，無效的來源直接返回 null
  return null;
}

/**
 * 來源分類的顯示名稱
 */
function getSourceDisplayName(sourceKey) {
  const sourceNames = {
    [WI_SOURCE_KEYS.GLOBAL]: '全域',
    [WI_SOURCE_KEYS.CHARACTER_PRIMARY]: '角色主要知識',
    [WI_SOURCE_KEYS.CHARACTER_ADDITIONAL]: '角色額外知識',
    [WI_SOURCE_KEYS.CHAT]: '聊天知識',
  };
  return sourceNames[sourceKey] || '未知';
}

/**
 * 獲取條目的來源類型（AI助手/使用者/系統）
 * 用於同深度排序
 */
function getEntrySourceType(entry) {
  if (entry.role === 'assistant' || entry.excludeRoles?.includes('assistant') === false) {
    return ENTRY_SOURCE_TYPE.ASSISTANT;
  }
  if (entry.role === 'user') {
    return ENTRY_SOURCE_TYPE.USER;
  }
  if (entry.role === 'system') {
    return ENTRY_SOURCE_TYPE.SYSTEM;
  }
  return ENTRY_SOURCE_TYPE.ASSISTANT;
}

/**
 * 獲取世界書的順序值
 * 需要從 world_info 中查找該世界書的 order 屬性
 */
function getWorldOrder(worldName) {
  // 在 world_info.lorebookReplace 中查找
  if (world_info.lorebookReplace) {
    const book = world_info.lorebookReplace.find(b => b.name === worldName);
    if (book && typeof book.order === 'number') {
      return book.order;
    }
  }
  
  // 備用查找（如果結構不同）
  if (Array.isArray(world_info) && world_info.find) {
    const book = world_info.find(b => b.name === worldName);
    if (book && typeof book.order === 'number') {
      return book.order;
    }
  }
  
  // 預設為無限大（最後）
  return Infinity;
}

/**
 * 排序比較函數
 * 優先度：
 * 1. 插入位置（固定順序）
 * 2. 世界書順序（小到大）
 * 3. 深度（大到小）- 僅對「依深度插入」
 * 4. 角色類型（AI > 使用者 > 系統） - 僅當深度相同時
 * 5. uid（原始順序）
 */
function compareEntries(entryA, entryB) {
  const posA = entryA.position ?? 4;
  const posB = entryB.position ?? 4;
  
  // 優先度 1：插入位置
  const posOrderA = positionInfo[posA]?.order ?? 999;
  const posOrderB = positionInfo[posB]?.order ?? 999;
  const posDiff = posOrderA - posOrderB;
  if (posDiff !== 0) {
    return posDiff;
  }

  // 優先度 2：世界書順序（數值小的優先）
  const worldOrderA = getWorldOrder(entryA.world);
  const worldOrderB = getWorldOrder(entryB.world);
  const worldOrderDiff = worldOrderA - worldOrderB;
  if (worldOrderDiff !== 0) {
    return worldOrderDiff;
  }

  // 優先度 3：深度排序（大的優先）- 僅對「依深度插入」(位置 4)
  if (posA === 4) {
    const depthDiff = (entryB.depth ?? -Infinity) - (entryA.depth ?? -Infinity);
    if (depthDiff !== 0) {
      return depthDiff;
    }
  }

  // 優先度 4：同深度按角色類型排序（AI > 使用者 > 系統）
  const sourceTypeDiff = getEntrySourceType(entryB) - getEntrySourceType(entryA);
  if (sourceTypeDiff !== 0) {
    return sourceTypeDiff;
  }

  // 優先度 5：相同優先度按 uid 排序
  return (entryA.uid ?? 0) - (entryB.uid ?? 0);
}

/**
 * 處理世界書資料
 * 改革後的結構：按插入位置分組，每組內按世界書順序、深度和角色排序
 */
function processWorldInfoData(activatedEntries) {
  // 過濾無效的來源（移除OTHER分類）
  const validEntries = activatedEntries.filter(entry => {
    if (!entry || typeof entry !== 'object') {
      console.warn('[WI-Viewer] 收到無效的 entry:', entry);
      return false;
    }
    const sourceKey = getWISourceKey(entry);
    if (sourceKey === null) {
      console.warn('[WI-Viewer] 忽略無效來源的 entry:', entry);
      return false;
    }
    return true;
  });

  // 第一步：按插入位置分組
  const byPosition = {};
  
  validEntries.forEach(entry => {
    const position = entry.position ?? 4; // 預設為「依深度插入」
    const posInfo = positionInfo[position] || { name: `未知位置 (${position})`, emoji: '❓', order: 999 };
    const posKey = `pos_${position}`;

    if (!byPosition[posKey]) {
      byPosition[posKey] = {
        position: position,
        positionName: posInfo.name,
        positionEmoji: posInfo.emoji,
        positionOrder: posInfo.order,
        entries: [],
      };
    }

    const status = getEntryStatus(entry);
    const sourceKey = getWISourceKey(entry);
    const hasSecondaryKeys = entry.keysecondary && entry.keysecondary.length > 0;

    const processedEntry = {
      uid: entry.uid,
      worldName: entry.world,
      entryName: entry.comment || `條目 #${entry.uid}`,
      sourceKey: sourceKey,
      sourceName: getSourceDisplayName(sourceKey),
      statusEmoji: status.emoji,
      statusName: status.name,
      content: entry.content,
      keys: entry.key?.join(', ') || null,
      secondaryKeys: hasSecondaryKeys ? entry.keysecondary.join(', ') : null,
      selectiveLogicName: hasSecondaryKeys ? (selectiveLogicInfo[entry.selectiveLogic] ?? `未知邏輯 (${entry.selectiveLogic})`) : null,
      depth: entry.depth ?? null,
      role: entry.role || 'assistant',
      position: position,
      worldOrder: getWorldOrder(entry.world),
    };

    byPosition[posKey].entries.push(processedEntry);
  });

  // 第二步：每個位置內部按世界書順序、深度和角色排序
  Object.values(byPosition).forEach(posGroup => {
    posGroup.entries.sort(compareEntries);
  });

  // 第三步：按位置順序排列
  const sorted = Object.values(byPosition).sort((a, b) => a.positionOrder - b.positionOrder);

  return sorted;
}

/**
 * 為訊息添加查看按鈕
 */
function addViewButtonToMessage(messageId) {
  if (!chat[messageId]?.extra?.worldInfoViewer) {
    return;
  }

  const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
  if (!messageElement || messageElement.getAttribute('is_user') === 'true') {
    return;
  }

  const buttonContainer = messageElement.querySelector('.mes_buttons');
  if (!buttonContainer) return;

  const buttonId = `worldinfo-viewer-btn-${messageId}`;
  if (document.getElementById(buttonId)) {
    return;
  }

  const button = document.createElement('div');
  button.id = buttonId;
  button.className = 'mes_button worldinfo-viewer-btn fa-solid fa-earth-asia';
  button.title = '查看此回覆觸發的世界書';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    showWorldInfoPopup(messageId);
  });

  buttonContainer.prepend(button);
}

/**
 * 顯示世界書彈窗
 */
async function showWorldInfoPopup(messageId) {
  const worldInfoData = chat[messageId]?.extra?.worldInfoViewer;
  if (!worldInfoData) {
    toastr.info("此訊息沒有紀錄的世界書觸發資料。");
    return;
  }

  try {
    const popupContent = await renderExtensionTemplateAsync(extensionName, 'popup', { positions: worldInfoData });
    callGenericPopup(popupContent, POPUP_TYPE.TEXT, '', {
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

// ===== 事件監聽 =====

let lastActivatedWorldInfo = null;

// 監聽世界書觸發事件
eventSource.on(event_types.WORLD_INFO_ACTIVATED, (data) => {
  console.log('[WI-Viewer] 收到 WORLD_INFO_ACTIVATED 事件，資料:', JSON.parse(JSON.stringify(data)));
  
  if (data && Array.isArray(data) && data.length > 0) {
    lastActivatedWorldInfo = processWorldInfoData(data);
    console.log('[WI-Viewer] 資料處理完畢:', lastActivatedWorldInfo);
  } else {
    lastActivatedWorldInfo = null;
    console.log('[WI-Viewer] 收到空的觸發資料，重設 lastActivatedWorldInfo。');
  }
});

// 監聽訊息接收事件，將最後觸發的世界書資料附加到訊息
eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
  if (lastActivatedWorldInfo && chat[messageId] && !chat[messageId].is_user) {
    if (!chat[messageId].extra) {
      chat[messageId].extra = {};
    }
    chat[messageId].extra.worldInfoViewer = lastActivatedWorldInfo;
    lastActivatedWorldInfo = null;
  }
});

// 監聽訊息渲染事件，為新渲染的訊息添加按鈕
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
  addViewButtonToMessage(String(messageId));
});

// 監聽聊天變更事件，為所有現有訊息添加按鈕
eventSource.on(event_types.CHAT_CHANGED, () => {
  setTimeout(() => {
    document.querySelectorAll('#chat .mes').forEach(messageElement => {
      const mesId = messageElement.getAttribute('mesid');
      if (mesId) {
        addViewButtonToMessage(mesId);
      }
    });
  }, 500);
});

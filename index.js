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

// 插入位置對應表（這些都不涉及深度，只由 order 控制）
const positionInfo = {
  0: { name: "角色設定前", emoji: "📙" },
  1: { name: "角色設定後", emoji: "📙" },
  2: { name: "作者註釋頂部", emoji: "📝" },
  3: { name: "作者註釋底部", emoji: "📝" },
  5: { name: "範例頂部", emoji: "📄" },
  6: { name: "範例底部", emoji: "📄" },
  4: { name: "依深度插入", emoji: "💉" },
  7: { name: "Outlet", emoji: "➡️" },
};

// 位置對應的固定排序優先級（用於比較）
const positionOrder = {
  0: 0,  // 角色設定前
  1: 1,  // 角色設定後
  2: 2,  // 作者註釋頂部
  3: 3,  // 作者註釋底部
  5: 4,  // 範例頂部
  6: 5,  // 範例底部
  4: 6,  // 依深度插入（在此位置內還會按 depth 排序）
  7: 7,  // Outlet
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
 * 
 * 優先級規則：
 * 1. 位置類型（固定順序：角色設定前 > ... > 依深度插入 > Outlet）
 * 2. 世界書順序（order 小的優先）
 * 3. 如果位置是「依深度插入」(位置 4)：
 *    3a. 深度（大的優先）
 *    3b. 角色類型（AI > 使用者 > 系統）
 * 4. UID（原始順序）
 */
function compareEntries(entryA, entryB) {
  // 優先級 1：位置類型固定順序
  const posA = entryA.position ?? 4;
  const posB = entryB.position ?? 4;
  const posOrderA = positionOrder[posA] ?? 999;
  const posOrderB = positionOrder[posB] ?? 999;
  const posDiff = posOrderA - posOrderB;
  if (posDiff !== 0) {
    return posDiff;
  }

  // 優先級 2：世界書順序（小的優先）
  const worldOrderA = getWorldOrder(entryA.world);
  const worldOrderB = getWorldOrder(entryB.world);
  const worldOrderDiff = worldOrderA - worldOrderB;
  if (worldOrderDiff !== 0) {
    return worldOrderDiff;
  }

  // 優先級 3：如果都是「依深度插入」才考慮深度
  if (posA === 4 && posB === 4) {
    // 3a：深度排序（大的優先）
    const depthDiff = (entryB.depth ?? -Infinity) - (entryA.depth ?? -Infinity);
    if (depthDiff !== 0) {
      return depthDiff;
    }

    // 3b：同深度按角色類型排序（AI > 使用者 > 系統）
    const sourceTypeDiff = getEntrySourceType(entryB) - getEntrySourceType(entryA);
    if (sourceTypeDiff !== 0) {
      return sourceTypeDiff;
    }
  }

  // 優先級 4：相同優先度按 uid 排序
  return (entryA.uid ?? 0) - (entryB.uid ?? 0);
}

/**
 * 處理世界書資料
 * 結構：所有條目按照優先級排序，按位置類型分組展示
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

  // 先排序所有條目
  validEntries.sort(compareEntries);

  // 然後按位置類型分組
  const byPosition = {};
  
  validEntries.forEach(entry => {
    const position = entry.position ?? 4; // 預設為「依深度插入」
    const posInfo = positionInfo[position] || { name: `未知位置 (${position})`, emoji: '❓' };
    const posKey = `pos_${position}`;

    if (!byPosition[posKey]) {
      byPosition[posKey] = {
        position: position,
        positionName: posInfo.name,
        positionEmoji: posInfo.emoji,
        positionOrder: positionOrder[position] ?? 999,
        entries: [],
      };
    }

    const status = getEntryStatus(entry);
    const sourceKey = getWISourceKey(entry);
    const hasSecondaryKeys = entry.keysecondary && entry.keysecondary.length > 0;

    // 如果位置是「依深度插入」，則顯示深度和角色信息
    const showDepthInfo = position === 4;

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
      depth: showDepthInfo ? (entry.depth ?? null) : null,
      role: showDepthInfo ? (entry.role || 'assistant') : null,
      showDepthInfo: showDepthInfo,
      position: position,
      worldOrder: getWorldOrder(entry.world),
    };

    byPosition[posKey].entries.push(processedEntry);
  });

  // 按位置優先級排列分組
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

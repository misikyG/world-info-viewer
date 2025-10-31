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

// 插入位置對應表 - 位置 0-7，各自代表不同的注入點
// order 欄位用於該分類內部的排序
const positionInfo = {
  0: { name: "角色設定前", emoji: "📙", categoryOrder: 0 },
  1: { name: "角色設定後", emoji: "📙", categoryOrder: 1 },
  2: { name: "作者註釋前", emoji: "📝", categoryOrder: 2 },
  3: { name: "作者註釋後", emoji: "📝", categoryOrder: 3 },
  5: { name: "範例前", emoji: "📄", categoryOrder: 4 },
  6: { name: "範例後", emoji: "📄", categoryOrder: 5 },
  4: { name: "依深度插入", emoji: "💉", categoryOrder: 6, isDepthBased: true },
  7: { name: "Outlet", emoji: "➡️", categoryOrder: 7 },
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

// 角色類型優先級（用於同深度排序）
const ENTRY_ROLE_TYPE = {
  ASSISTANT: 3,
  USER: 2,
  SYSTEM: 1,
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
 * 獲取角色類型的優先級
 */
function getEntryRolePriority(entry) {
  const role = entry.role?.toLowerCase() || 'assistant';
  if (role === 'assistant') {
    return ENTRY_ROLE_TYPE.ASSISTANT;
  }
  if (role === 'user') {
    return ENTRY_ROLE_TYPE.USER;
  }
  if (role === 'system') {
    return ENTRY_ROLE_TYPE.SYSTEM;
  }
  return ENTRY_ROLE_TYPE.ASSISTANT;
}

/**
 * 獲取角色類型的顯示名稱
 */
function getRoleDisplayName(entry) {
  const role = entry.role?.toLowerCase() || 'assistant';
  if (role === 'assistant') {
    return 'AI';
  }
  if (role === 'user') {
    return '使用者';
  }
  if (role === 'system') {
    return '系統';
  }
  return 'AI';
}

/**
 * 處理世界書資料
 */
function processWorldInfoData(activatedEntries) {
  // 過濾無效的條目
  const validEntries = activatedEntries.filter(entry => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const sourceKey = getWISourceKey(entry);
    return sourceKey !== null;
  });

  // 按插入位置分組
  const byPosition = {};
  
  validEntries.forEach(entry => {
    const position = entry.position ?? 4;
    const posInfo = positionInfo[position];
    
    if (!posInfo) {
      console.warn(`[WI-Viewer] 未知位置: ${position}`, entry);
      return;
    }

    const posKey = `pos_${position}`;

    if (!byPosition[posKey]) {
      byPosition[posKey] = {
        position: position,
        positionName: posInfo.name,
        positionEmoji: posInfo.emoji,
        categoryOrder: posInfo.categoryOrder,
        isDepthBased: posInfo.isDepthBased || false,
        entries: [],
      };
    }

    const status = getEntryStatus(entry);
    const sourceKey = getWISourceKey(entry);
    const hasSecondaryKeys = entry.keysecondary && entry.keysecondary.length > 0;

    const processedEntry = {
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
      // 原始資料
      depth: entry.depth ?? null,
      order: entry.order ?? null,
      role: entry.role || 'assistant',
      rolePriority: getEntryRolePriority(entry),
      roleDisplay: getRoleDisplayName(entry),
      // 用於排序
      position: position,
    };

    byPosition[posKey].entries.push(processedEntry);
  });

  // 各分類內部排序
  Object.values(byPosition).forEach(posGroup => {
    if (posGroup.isDepthBased) {
      // 依深度插入：先按 depth 大→小，再按角色優先級
      posGroup.entries.sort((a, b) => {
        // 深度降序（大的優先）
        const depthDiff = (b.depth ?? -Infinity) - (a.depth ?? -Infinity);
        if (depthDiff !== 0) {
          return depthDiff;
        }
        // 同深度，按角色優先級
        return b.rolePriority - a.rolePriority;
      });
    } else {
      // 其他分類：按 order 升序（小的優先）
      posGroup.entries.sort((a, b) => {
        const orderA = a.order ?? Infinity;
        const orderB = b.order ?? Infinity;
        return orderA - orderB;
      });
    }
  });

  // 按分類順序排列
  const sorted = Object.values(byPosition).sort(
    (a, b) => a.categoryOrder - b.categoryOrder
  );

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

eventSource.on(event_types.WORLD_INFO_ACTIVATED, (data) => {
  console.log('[WI-Viewer] WORLD_INFO_ACTIVATED:', data);
  
  if (data && Array.isArray(data) && data.length > 0) {
    lastActivatedWorldInfo = processWorldInfoData(data);
    console.log('[WI-Viewer] 處理完成:', lastActivatedWorldInfo);
  } else {
    lastActivatedWorldInfo = null;
  }
});

eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
  if (lastActivatedWorldInfo && chat[messageId] && !chat[messageId].is_user) {
    if (!chat[messageId].extra) {
      chat[messageId].extra = {};
    }
    chat[messageId].extra.worldInfoViewer = lastActivatedWorldInfo;
    lastActivatedWorldInfo = null;
  }
});

eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
  addViewButtonToMessage(String(messageId));
});

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

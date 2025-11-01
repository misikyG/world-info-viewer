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

// 插入位置對應表（顯示名稱與 emoji）
const positionInfo = {
  0: { name: '角色設定前', emoji: '📙' },
  1: { name: '角色設定後', emoji: '📙' },
  2: { name: '作者註釋頂部', emoji: '📝' },
  3: { name: '作者註釋底部', emoji: '📝' },
  4: { name: '依深度插入', emoji: '💉' },
  5: { name: '範例頂部', emoji: '📄' },
  6: { name: '範例底部', emoji: '📄' },
  7: { name: 'Outlet', emoji: '➡️' },
};

// 顯示分組排序順序（越小越前）
const POSITION_SORT_ORDER = {
  0: 0,  // 角色設定前
  1: 1,  // 角色設定後
  5: 2,  // 範例頂部
  6: 3,  // 範例底部
  2: 4,  // 作者註釋頂部
  3: 5,  // 作者註釋底部
  4: 6,  // 依深度插入
  7: 7,  // Outlet
};

// 主副鍵邏輯文字
const selectiveLogicInfo = {
  0: '包含任一 (AND ANY)',
  1: '未完全包含 (NOT ALL)',
  2: '完全不含 (NOT ANY)',
  3: '包含全部 (AND ALL)',
};

// 世界書來源分類（不包含「其他」）
const WI_SOURCE_KEYS = {
  GLOBAL: 'global',
  CHARACTER_PRIMARY: 'characterPrimary',
  CHARACTER_ADDITIONAL: 'characterAdditional',
  CHAT: 'chat',
};

// 顯示名稱（精簡）
const WI_SOURCE_DISPLAY = {
  [WI_SOURCE_KEYS.GLOBAL]: '全域',
  [WI_SOURCE_KEYS.CHARACTER_PRIMARY]: '主要知識',
  [WI_SOURCE_KEYS.CHARACTER_ADDITIONAL]: '額外知識',
  [WI_SOURCE_KEYS.CHAT]: '聊天知識',
};

// 條目來源類型（排序優先）
const ENTRY_SOURCE_TYPE = {
  ASSISTANT: 3, // 最優
  USER: 2,
  SYSTEM: 1,    // 最低
};

// 角色標籤顯示
function roleDisplayName(role) {
  if (role === 'assistant') return '@AI';
  if (role === 'user') return '@使用者';
  if (role === 'system') return '@系統';
  return '@AI';
}

// 嘗試解析條目觸發的角色類型
function getEntrySourceType(entry) {
  const role = (entry.role || entry.messageRole || '').toLowerCase();
  if (role === 'assistant') return ENTRY_SOURCE_TYPE.ASSISTANT;
  if (role === 'user') return ENTRY_SOURCE_TYPE.USER;
  if (role === 'system') return ENTRY_SOURCE_TYPE.SYSTEM;
  return ENTRY_SOURCE_TYPE.ASSISTANT;
}

// 取得世界書來源（不產生「其他」）
function getWISourceKey(entry) {
  const worldName = entry.world;
  const chatLoreName = chat_metadata?.[METADATA_KEY];

  if (chatLoreName && worldName === chatLoreName) {
    return WI_SOURCE_KEYS.CHAT;
  }

  const character = characters?.[this_chid];
  if (character) {
    const primaryLorebook = character?.data?.extensions?.world;
    if (primaryLorebook && worldName === primaryLorebook) {
      return WI_SOURCE_KEYS.CHARACTER_PRIMARY;
    }

    const fileName = getCharaFilename?.(this_chid);
    const extraCharLore = world_info?.charLore?.find?.((e) => e.name === fileName);
    if (extraCharLore && Array.isArray(extraCharLore.extraBooks) && extraCharLore.extraBooks.includes(worldName)) {
      return WI_SOURCE_KEYS.CHARACTER_ADDITIONAL;
    }
  }

  if (Array.isArray(selected_world_info) && selected_world_info.includes(worldName)) {
    return WI_SOURCE_KEYS.GLOBAL;
  }

  // 無匹配時不回傳「其他」，改回傳 null，顯示時略過來源段
  return null;
}

function getSourceDisplayName(sourceKey) {
  if (!sourceKey) return '';
  return WI_SOURCE_DISPLAY[sourceKey] || '';
}

// 條目狀態
function getEntryStatus(entry) {
  if (entry.constant === true) return { emoji: '🔵', name: '恆定 (Constant)' };
  if (entry.vectorized === true) return { emoji: '🔗', name: '向量 (Vectorized)' };
  return { emoji: '🟢', name: '關鍵字 (Keyword)' };
}

// 深度插入之角色深度標籤
function formatRoleDepthTag(entry) {
  const role = (entry.role || entry.messageRole || 'assistant').toLowerCase();
  const depth = entry.depth ?? null;
  if (depth == null) return '';
  return `${roleDisplayName(role)} 深度 ${depth}`;
}

// 建立世界書 order 快取
const worldOrderCache = new Map();

// 嘗試取得世界書 order（多路徑容錯）
function getWorldOrderByName(worldName) {
  if (!worldName) return Number.MAX_SAFE_INTEGER;
  if (worldOrderCache.has(worldName)) {
    return worldOrderCache.get(worldName);
  }

  let order = Number.MAX_SAFE_INTEGER;

  try {
    // 1) 若 entry 已攜帶
    // 留空，這裡不處理 entry 本身，外層會填入

    // 2) world_info 可能的容器
    const candidates = [
      world_info?.worlds,            // 常見：[{ name, order, ... }]
      world_info?.allWorlds,         // 可能存在
      world_info?.files,             // 可能存在
      world_info?.data,              // 可能存在
      world_info?.all_worlds,        // 其他命名
    ].filter(Boolean);

    for (const list of candidates) {
      if (Array.isArray(list)) {
        const found = list.find((w) => (w?.name || w?.title) === worldName);
        if (found && typeof found.order === 'number') {
          order = found.order;
          break;
        }
      } else if (typeof list === 'object') {
        const w = list[worldName];
        if (w && typeof w.order === 'number') {
          order = w.order;
          break;
        }
      }
    }
  } catch (err) {
    // 忽略，使用預設
  }

  worldOrderCache.set(worldName, order);
  return order;
}

// 顯示群組排序索引
function getPositionSortIndex(position) {
  if (position in POSITION_SORT_ORDER) return POSITION_SORT_ORDER[position];
  return 999; // 未知位置排最後
}

// 依規則排序：深度群組（position === 4）
function compareDepthEntries(a, b) {
  // 深度大者優先
  const depthA = a.depth ?? -Infinity;
  const depthB = b.depth ?? -Infinity;
  if (depthA !== depthB) return depthB - depthA;

  // 同深度：AI > 使用者 > 系統
  const stA = a.sourceType ?? ENTRY_SOURCE_TYPE.ASSISTANT;
  const stB = b.sourceType ?? ENTRY_SOURCE_TYPE.ASSISTANT;
  if (stA !== stB) return stB - stA;

  // 最後以名稱穩定排序
  return String(a.entryName || '').localeCompare(String(b.entryName || ''));
}

// 依規則排序：非深度群組（order 由世界書控制，UID不重要）
function compareOrderEntries(a, b) {
  const oa = (typeof a.worldOrder === 'number') ? a.worldOrder : Number.MAX_SAFE_INTEGER;
  const ob = (typeof b.worldOrder === 'number') ? b.worldOrder : Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;

  // 同 order 時，以世界書名與條目名作穩定排序
  const wn = String(a.worldName || '').localeCompare(String(b.worldName || ''));
  if (wn !== 0) return wn;
  return String(a.entryName || '').localeCompare(String(b.entryName || ''));
}

// 整體處理：分組、加工、排序
function processWorldInfoData(activatedEntries) {
  const byPosition = {};

  activatedEntries.forEach((entryRaw) => {
    if (!entryRaw || typeof entryRaw !== 'object') return;

    const position = (typeof entryRaw.position === 'number') ? entryRaw.position : 4; // 預設深度插入
    const posInfo = positionInfo[position] || { name: `未知位置 (${position})`, emoji: '❓' };
    const posKey = `pos_${position}`;

    if (!byPosition[posKey]) {
      byPosition[posKey] = {
        position,
        positionName: posInfo.name,
        positionEmoji: posInfo.emoji,
        entries: [],
      };
    }

    const status = getEntryStatus(entryRaw);
    const sourceKey = getWISourceKey(entryRaw);
    const sourceName = getSourceDisplayName(sourceKey);

    // 嘗試帶入世界書 order（entry 自帶 > 查表）
    const worldOrder =
      (typeof entryRaw.worldOrder === 'number' ? entryRaw.worldOrder : undefined) ??
      (typeof entryRaw.order === 'number' ? entryRaw.order : undefined) ??
      getWorldOrderByName(entryRaw.world);

    const processedEntry = {
      uid: entryRaw.uid,
      worldName: entryRaw.world,
      entryName: entryRaw.comment || `條目 #${entryRaw.uid}`,
      sourceKey,
      sourceName, // 可能為空（移除「其他」）
      statusEmoji: status.emoji,
      statusName: status.name,
      content: entryRaw.content,
      keys: Array.isArray(entryRaw.key) ? entryRaw.key.join(', ') : (typeof entryRaw.key === 'string' ? entryRaw.key : null),
      secondaryKeys: Array.isArray(entryRaw.keysecondary) ? entryRaw.keysecondary.join(', ') : null,
      selectiveLogicName: Array.isArray(entryRaw.keysecondary)
        ? (selectiveLogicInfo?.[entryRaw.selectiveLogic] ?? `未知邏輯 (${entryRaw.selectiveLogic})`)
        : null,
      depth: entryRaw.depth ?? null,
      role: (entryRaw.role || entryRaw.messageRole || 'assistant'),
      sourceType: getEntrySourceType(entryRaw),
      roleDepthTag: formatRoleDepthTag(entryRaw),
      worldOrder,
    };

    byPosition[posKey].entries.push(processedEntry);
  });

  // 各位置內排序
  Object.values(byPosition).forEach((posGroup) => {
    if (posGroup.position === 4) {
      // 依深度插入
      posGroup.entries.sort(compareDepthEntries);
    } else {
      // 其餘位置只看世界書 order
      posGroup.entries.sort(compareOrderEntries);
    }
  });

  // 移除空組
  const groups = Object.values(byPosition).filter(g => g.entries.length > 0);

  // 按指定位置順序排序
  groups.sort((a, b) => getPositionSortIndex(a.position) - getPositionSortIndex(b.position));

  return groups;
}

// ===== UI：訊息按鈕 =====
function addViewButtonToMessage(messageId) {
  if (!chat?.[messageId]?.extra?.worldInfoViewer) return;

  const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
  if (!messageElement || messageElement.getAttribute('is_user') === 'true') return;

  const buttonContainer = messageElement.querySelector('.mes_buttons');
  if (!buttonContainer) return;

  const buttonId = `worldinfo-viewer-btn-${messageId}`;
  if (document.getElementById(buttonId)) return;

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

// ===== UI：彈窗 =====
async function showWorldInfoPopup(messageId) {
  const worldInfoData = chat?.[messageId]?.extra?.worldInfoViewer;
  if (!worldInfoData) {
    toastr.info('此訊息沒有紀錄的世界書觸發資料。');
    return;
  }

  try {
    const popupContent = await renderExtensionTemplateAsync(extensionName, 'popup', { positions: worldInfoData });
    callGenericPopup(popupContent, POPUP_TYPE.TEXT, '', {
      wide: true,
      large: true,
      okButton: '關閉',
      allowVerticalScrolling: true,
    });
  } catch (error) {
    console.error(`[${extensionName}] 渲染彈窗時發生錯誤:`, error);
    toastr.error('無法渲染世界書彈窗，請檢查主控台日誌。');
  }
}

// ===== 狀態同步 =====
let lastActivatedWorldInfo = null;

eventSource.on(event_types.WORLD_INFO_ACTIVATED, (data) => {
  if (data && Array.isArray(data) && data.length > 0) {
    lastActivatedWorldInfo = processWorldInfoData(data);
  } else {
    lastActivatedWorldInfo = null;
  }
});

eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
  if (lastActivatedWorldInfo && chat?.[messageId] && !chat[messageId].is_user) {
    if (!chat[messageId].extra) chat[messageId].extra = {};
    chat[messageId].extra.worldInfoViewer = lastActivatedWorldInfo;
    lastActivatedWorldInfo = null;
  }
});

eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
  addViewButtonToMessage(String(messageId));
});

eventSource.on(event_types.CHAT_CHANGED, () => {
  setTimeout(() => {
    document.querySelectorAll('#chat .mes').forEach((messageElement) => {
      const mesId = messageElement.getAttribute('mesid');
      if (mesId) addViewButtonToMessage(mesId);
    });
  }, 500);
});

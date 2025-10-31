import { eventSource, event_types } from '../../script.js';

(function () {
    console.log("World Info Viewer: Script loaded. Attaching event listeners...");

    // 監聽世界書觸發事件
    eventSource.on(event_types.WORLD_INFO_ACTIVATED, (...args) => {
        console.log("World Info Viewer: [EVENT] WORLD_INFO_ACTIVATED fired with arguments:", args);
    });

    // 監聽訊息渲染完成事件
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (...args) => {
        console.log("World Info Viewer: [EVENT] CHARACTER_MESSAGE_RENDERED fired with arguments:", args);
    });

    console.log("World Info Viewer: Event listeners attached.");
})();

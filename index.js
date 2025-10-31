<div class="worldinfo-viewer-popup">
    <h3>已觸發的世界書條目</h3>
    <hr>

    {{#if (or global character chat other)}}
        {{#if global}}
        <div class="wi-category">
            <h4><span class="wi-emoji">🌐</span> 全域世界書</h4>
            {{#each global}}
            <div class="wi-entry">
                <div class="wi-entry-header">
                    <span class="wi-emoji">{{emoji}}</span>
                    <span class="wi-title">{{worldName}} / {{entryName}}</span>
                </div>
                <div class="wi-entry-info">
                    <div class="wi-info-item"><strong>狀態：</strong><span>{{statusName}}</span></div>
                    {{#if keys}}
                    <div class="wi-info-item"><strong>主關鍵字：</strong><span>{{keys}}</span></div>
                    {{/if}}
                    {{#if secondaryKeys}}
                    <div class="wi-info-item"><strong>次關鍵字：</strong><span>{{secondaryKeys}}</span></div>
                    {{/if}}
                    <div class="wi-info-item"><strong>插入位置：</strong><span>{{position}}</span></div>
                </div>
                <div class="wi-entry-content">
                    <strong>內容：</strong>
                    <pre>{{content}}</pre>
                </div>
            </div>
            {{/each}}
        </div>
        {{/if}}

        {{#if character}}
        <div class="wi-category">
            <h4><span class="wi-emoji">👤</span> 角色知識書</h4>
            {{#each character}}
            <div class="wi-entry">
                <div class="wi-entry-header">
                    <span class="wi-emoji">{{emoji}}</span>
                    <span class="wi-title">{{worldName}} / {{entryName}}</span>
                </div>
                <div class="wi-entry-info">
                    <div class="wi-info-item"><strong>狀態：</strong><span>{{statusName}}</span></div>
                    {{#if keys}}
                    <div class="wi-info-item"><strong>主關鍵字：</strong><span>{{keys}}</span></div>
                    {{/if}}
                    {{#if secondaryKeys}}
                    <div class="wi-info-item"><strong>次關鍵字：</strong><span>{{secondaryKeys}}</span></div>
                    {{/if}}
                    <div class="wi-info-item"><strong>插入位置：</strong><span>{{position}}</span></div>
                </div>
                <div class="wi-entry-content">
                    <strong>內容：</strong>
                    <pre>{{content}}</pre>
                </div>
            </div>
            {{/each}}
        </div>
        {{/if}}

        {{#if chat}}
        <div class="wi-category">
            <h4><span class="wi-emoji">💬</span> 聊天知識書</h4>
            {{#each chat}}
            <div class="wi-entry">
                <div class="wi-entry-header">
                    <span class="wi-emoji">{{emoji}}</span>
                    <span class="wi-title">{{worldName}} / {{entryName}}</span>
                </div>
                <div class="wi-entry-info">
                    <div class="wi-info-item"><strong>狀態：</strong><span>{{statusName}}</span></div>
                    {{#if keys}}
                    <div class="wi-info-item"><strong>主關鍵字：</strong><span>{{keys}}</span></div>
                    {{/if}}
                    {{#if secondaryKeys}}
                    <div class="wi-info-item"><strong>次關鍵字：</strong><span>{{secondaryKeys}}</span></div>
                    {{/if}}
                    <div class="wi-info-item"><strong>插入位置：</strong><span>{{position}}{{#if depth}} / 深度 {{depth}}{{/if}}</span></div>
                </div>
                <div class="wi-entry-content">
                    <strong>內容：</strong>
                    <pre>{{content}}</pre>
                </div>
            </div>
            {{/each}}
        </div>
        {{/if}}

        {{#if other}}
        <div class="wi-category">
            <h4><span class="wi-emoji">📦</span> 其他</h4>
            {{#each other}}
             <div class="wi-entry">
                <div class="wi-entry-header">
                    <span class="wi-emoji">{{emoji}}</span>
                    <span class="wi-title">{{worldName}} / {{entryName}}</span>
                </div>
                <div class="wi-entry-info">
                     <div class="wi-info-item"><strong>插入位置：</strong><span>{{position}}</span></div>
                </div>
                <div class="wi-entry-content">
                    <strong>內容：</strong>
                    <pre>{{content}}</pre>
                </div>
            </div>
            {{/each}}
        </div>
        {{/if}}

    {{else}}
        <div class="wi-no-entries">
            <p>ℹ️ 沒有偵測到任何觸發的世界書條目。</p>
        </div>
    {{/if}}
</div>

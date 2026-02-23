// ==UserScript==
// @name         全自动AI答题助手 (NBA2K2 OL版)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  自动点击“开始答题”，自动识别题目，调用OpenAI模型回答，支持手动/自动模式
// @author       LuBanQAQ
// @match        https://nba2k2.qq.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // 强力伪装浏览器 User-Agent，确保在页面脚本执行前生效
    try {
        Object.defineProperty(navigator, 'userAgent', {
            get: function () { return 'Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NBA2KOL2/0.3.854.1299 Safari/537.36'; }
        });
        Object.defineProperty(navigator, 'appVersion', {
            get: function () { return '5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NBA2KOL2/0.3.854.1299 Safari/537.36'; }
        });
        Object.defineProperty(navigator, 'platform', {
            get: function () { return 'Win32'; }
        });
    } catch (e) { console.error("UA伪装失败:", e); }

    //Configs
    const AUTO_START_DELAY = 3000; // 检测到可以开始答题后，延迟多久点击 (毫秒)

    // ==========================================
    // 1. 样式与GUI构建
    // ==========================================
    const UI_HTML = `
        <div id="ai-helper-panel" class="ai-panel">
            <div class="panel-header">
                <h3>🏀 NBA2K2 AI助手 v3.0</h3>
                <button id="toggle-btn" class="icon-btn">_</button>
            </div>
            <div class="panel-body">
                <div class="config-group">
                    <label>API Host (推荐 DeepSeek/ChatGPT)</label>
                    <input type="text" id="api-host" placeholder="https://api.openai.com/v1" value="https://api.deepseek.com/v1">
                </div>
                <div class="config-group">
                    <label>API Key</label>
                    <input type="password" id="api-key" placeholder="sk-...">
                </div>
                <div class="config-group">
                    <label>模型 (Model)</label>
                    <input type="text" id="api-model" placeholder="gpt-3.5-turbo" value="deepseek-chat">
                </div>
                <div class="config-group">
                    <label>点击延迟 (毫秒) - 0为极速</label>
                    <input type="number" id="click-delay" placeholder="100" value="100">
                </div>
                <div class="config-group" style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="test-api-btn" class="action-btn" style="background:#0f766e;">📶 测试链接</button>
                    <button id="save-config-btn" class="action-btn">💾 保存配置</button>
                </div>
                
                <div class="control-group">
                    <label class="switch">
                        <input type="checkbox" id="auto-mode" checked>
                        <span class="slider round"></span>
                    </label>
                    <span style="font-size:12px">弹窗出现后自动作答</span>
                    <button id="solve-once-btn" class="action-btn small" style="margin-left:auto">⚡ 解答本题</button>
                </div>

                <div class="control-group" style="border-top:none; padding-top:0; margin-top:0; justify-content: flex-end; gap: 5px;">
 
                    <button id="import-btn" class="action-btn small" style="background:#475569;">📥 导入</button>
                    <button id="export-btn" class="action-btn small" style="background:#475569;">📂 导出</button>
                    <button id="manager-btn" class="action-btn small" style="background:#475569;">📝 编辑题库</button>
                    <input type="file" id="import-file" style="display:none" accept=".json">
                </div>

                <div class="log-window" id="log-window">
                    <div class="log-entry system">等待页面加载...</div>
                </div>
            </div>
        </div>

        <!-- 题库管理器弹窗 -->
        <div id="qa-manager-modal" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); width:600px; max-height:80vh; background:#0f172a; border:1px solid #334155; border-radius:12px; z-index:100000; box-shadow:0 20px 50px rgba(0,0,0,0.8); color:#e2e8f0; font-family:'Segoe UI', sans-serif; flex-direction:column;">
            <div style="padding:15px; background:#1e293b; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center; border-radius:12px 12px 0 0;">
                <h3 style="margin:0; font-size:16px;">📚 题库编辑器</h3>
                <button id="close-manager-btn" style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer;">×</button>
            </div>
            <div style="padding:15px; border-bottom:1px solid #334155;">
                <input type="text" id="qa-search-input" placeholder="🔍 搜索题目关键字..." style="width:100%; padding:8px; background:#1e293b; border:1px solid #334155; color:white; border-radius:6px;">
            </div>
            <div id="qa-list-container" style="flex:1; overflow-y:auto; padding:10px; min-height:300px;">
                <!-- 列表项模板 -->
            </div>
            <div style="padding:10px; background:#1e293b; border-top:1px solid #334155; text-align:right; font-size:12px; color:#64748b; border-radius:0 0 12px 12px;">
                点击条目可编辑答案，右侧按钮删除
            </div>
        </div>

        <style>
            .ai-panel {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 320px;
                background: rgba(15, 23, 42, 0.95);
                color: #e2e8f0;
                border-radius: 12px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.6);
                font-family: 'Segoe UI', system-ui, sans-serif;
                z-index: 99999;
                border: 1px solid #334155;
                backdrop-filter: blur(12px);
                transition: height 0.3s ease;
            }
            .ai-panel.minimized { height: 48px; overflow: hidden; }
            .panel-header {
                padding: 12px 16px;
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                border-radius: 12px 12px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
            }
            .panel-header h3 { margin: 0; font-size: 15px; font-weight: 600; }
            .icon-btn { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; padding: 0; }
            .panel-body { padding: 16px; }
            .config-group { margin-bottom: 12px; }
            .config-group label { display: block; font-size: 11px; color: #94a3b8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
            .config-group input {
                width: 100%; padding: 8px 10px;
                background: #1e293b; border: 1px solid #334155;
                color: #fff; border-radius: 6px; font-size: 13px;
                transition: border-color 0.2s;
            }
            .config-group input:focus { outline: none; border-color: #3b82f6; }
            .control-group { display: flex; align-items: center; gap: 10px; margin: 16px 0; padding-top: 10px; border-top: 1px solid #334155; }
            
            /* Switch */
            .switch { position: relative; display: inline-block; width: 42px; height: 22px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #475569; transition: .3s; border-radius: 22px; }
            .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
            input:checked + .slider { background-color: #22c55e; }
            input:checked + .slider:before { transform: translateX(20px); }

            .action-btn { background: #3b82f6; border: none; padding: 6px 12px; color: white; border-radius: 4px; cursor: pointer; font-size: 12px; transition: background 0.2s; }
            .action-btn:hover { background: #2563eb; }
            .action-btn.small { padding: 4px 8px; font-size: 11px; margin-left: auto; }
            
            .log-window {
                height: 140px;
                overflow-y: auto;
                background: #020617;
                border: 1px solid #1e293b;
                border-radius: 6px;
                padding: 10px;
                font-size: 12px;
                font-family: 'Consolas', monospace;
                line-height: 1.4;
            }
            .log-entry { margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px dashed #1e293b; }
            .log-entry:last-child { border-bottom: none; }
            .log-entry.system { color: #94a3b8; }
            .log-entry.question { color: #60a5fa; }
            .log-entry.answer { color: #4ade80; font-weight: bold; }
            .log-entry.error { color: #f87171; }
            .log-entry.warn { color: #facc15; }
            
            /* 滚动条美化 */
            .log-window::-webkit-scrollbar { width: 6px; }
            .log-window::-webkit-scrollbar-track { background: #020617; }
            .log-window::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }

            /* 管理器样式 */
            .qa-item { padding: 12px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.2s; }
            .qa-item:hover { background: #334155; }
            .qa-item .q-text { flex: 1; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 10px; }
            .qa-item .q-ans { font-size: 12px; color: #4ade80; background: #064e3b; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
            .qa-detail { padding: 12px; background: #0f172a; border-bottom: 1px solid #334155; display: none; }
            .qa-detail input { width: 100%; margin-bottom: 8px; padding: 6px; background: #1e293b; border: 1px solid #475569; color: white; border-radius: 4px; }
            .qa-detail .btn-group { display: flex; justify-content: flex-end; gap: 8px; }
        </style>
    `;

    // 将UI插入页面
    // 优先插入 body，如果没有 body 则插入 html
    const target = document.body || document.documentElement;
    const div = document.createElement('div');
    div.innerHTML = UI_HTML;
    target.appendChild(div);

    // ==========================================
    // 2. 状态管理
    // ==========================================
    const elems = {
        panel: document.getElementById('ai-helper-panel'),
        host: document.getElementById('api-host'),
        key: document.getElementById('api-key'),
        model: document.getElementById('api-model'),
        delay: document.getElementById('click-delay'),
        toggle: document.getElementById('toggle-btn'),
        logs: document.getElementById('log-window'),
        autoMode: document.getElementById('auto-mode'),
        testBtn: document.getElementById('test-api-btn'),
        saveBtn: document.getElementById('save-config-btn'),
        solveBtn: document.getElementById('solve-once-btn'),
        delBtn: document.getElementById('del-cache-btn'),
        importBtn: document.getElementById('import-btn'),
        exportBtn: document.getElementById('export-btn'),
        managerBtn: document.getElementById('manager-btn'),
        importFile: document.getElementById('import-file'), 
        header: document.querySelector('.panel-header'),
        // Manager Elements
        managerModal: document.getElementById('qa-manager-modal'),
        closeManagerBtn: document.getElementById('close-manager-btn'),
        searchManager: document.getElementById('qa-search-input'),
        listManager: document.getElementById('qa-list-container')
    };

    // 记录题库逻辑 (增强版)
    // answerObj: { a: "正确答案文本", o: ["所有选项文本"] }
    const saveToHistory = (question, answerText, optionsList) => {
        const history = GM_getValue('qa_history', []);
        // 标准化题目以便查重
        const cleanQ = question.trim();
        
        // 查找是否已存在记录
        const idx = history.findIndex(h => h.q === cleanQ);
        const record = { 
            q: cleanQ, 
            a: answerText, 
            o: optionsList, 
            t: new Date().toISOString() 
        };

        if (idx !== -1) {
            // 如果存在且答案不同，才覆盖 (如果是修正模式，肯定要覆盖)
            if (history[idx].a !== answerText) {
                history[idx] = record;
                GM_setValue('qa_history', history);
                return "updated";
            }
        } else {
             // 不存在则新增
             history.push(record);
             if (history.length > 500) history.shift();
             GM_setValue('qa_history', history);
             return "new";
        }
        return "exists";
    };
    
    // 修正错题逻辑已移除，由题库管理器统一管理

    // 删除当前题目缓存逻辑
    const deleteCurrentCache = () => {
        if (!lastQuestionText) return;
        const history = GM_getValue('qa_history', []);
        const newHistory = history.filter(h => h.q !== lastQuestionText);
        if (newHistory.length < history.length) {
            GM_setValue('qa_history', newHistory);
            log(`🧹 已删除错题缓存: ${lastQuestionText.substring(0,10)}...`, "system");
            if(elems.delBtn) elems.delBtn.style.display = 'none'; // 删完隐藏
            if(elems.correctionPanel) elems.correctionPanel.style.display = 'none';
        } else {
             log(`⚠️ 本题未在缓存中`, "warn");
        }
    };

    if (elems.delBtn) elems.delBtn.onclick = deleteCurrentCache;

    // --- 题库管理器逻辑 ---
    let currentHistory = []; // 缓存当前列表以提高性能

    const renderManagerList = (filterText = '') => {
        if (!elems.listManager) return;
        currentHistory = GM_getValue('qa_history', []);
        
        let html = '';
        currentHistory.forEach((item, index) => {
            if (filterText && !item.q.includes(filterText) && !item.a.includes(filterText)) return;
            
            // 截断过长文本
            const qShort = item.q.length > 50 ? item.q.substring(0, 50) + '...' : item.q;
            
            html += `
                <div class="qa-block" data-idx="${index}">
                    <div class="qa-item">
                        <div class="q-text" title="${item.q}">${qShort}</div>
                        <div class="q-ans">${item.a}</div>
                        <button class="action-btn small edit-toggle-btn" style="margin-left:8px; background:#475569;">✏️</button>
                    </div>
                    <div class="qa-detail">
                        <label style="font-size:11px; color:#94a3b8;">题目:</label>
                        <textarea class="edit-q" style="width:100%; background:#0f172a; color:#fff; border:1px solid #334155; margin-bottom:5px; font-size:12px;">${item.q}</textarea>
                        
                        <label style="font-size:11px; color:#94a3b8;">答案:</label>
                        <input type="text" class="edit-a" value="${item.a}">
                        
                        <div class="btn-group" style="margin-top:10px;">
                            <button class="action-btn small" style="background:#dc2626;" onclick="this.dispatchEvent(new CustomEvent('del-qa', {bubbles:true, detail:${index}}))">🗑️ 删除</button>
                            <button class="action-btn small" style="background:#16a34a;" onclick="this.dispatchEvent(new CustomEvent('save-qa', {bubbles:true, detail:${index}}))">💾 保存</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        if (html === '') html = '<div style="padding:20px; text-align:center; color:#64748b;">暂无数据</div>';
        elems.listManager.innerHTML = html;
    };

    // 绑定管理器事件
    if (elems.managerBtn && elems.managerModal) {
        elems.managerBtn.onclick = () => {
            elems.managerModal.style.display = 'flex';
            renderManagerList();
        };
        
        if (elems.closeManagerBtn) {
            elems.closeManagerBtn.onclick = () => {
                elems.managerModal.style.display = 'none';
            };
        }
        
        if (elems.searchManager) {
            elems.searchManager.oninput = (e) => {
                renderManagerList(e.target.value.trim());
            };
        }
        
        // 列表点击代理
        elems.listManager.addEventListener('click', (e) => {
            // 展开/折叠
            if (e.target.closest('.qa-item') || e.target.classList.contains('edit-toggle-btn')) {
                const block = e.target.closest('.qa-block');
                const detail = block.querySelector('.qa-detail');
                const isVisible = detail.style.display === 'block';
                // 收起其他所有
                elems.listManager.querySelectorAll('.qa-detail').forEach(d => d.style.display = 'none');
                // 切换当前
                detail.style.display = isVisible ? 'none' : 'block';
            }
        });
        
        // 自定义事件监听 (保存与删除)
        elems.listManager.addEventListener('save-qa', (e) => {
            const index = e.detail;
            const block = elems.listManager.querySelector(`.qa-block[data-idx="${index}"]`);
            if(!block) return;
            
            const newQ = block.querySelector('.edit-q').value.trim();
            const newA = block.querySelector('.edit-a').value.trim();
            
            if (!newQ || !newA) { alert("题目和答案不能为空"); return; }
            
            const history = GM_getValue('qa_history', []);
            if (history[index]) {
                history[index].q = newQ;
                history[index].a = newA;
                history[index].t = new Date().toISOString(); // 更新时间
                GM_setValue('qa_history', history);
                log(`💾 已更新题目: ${newQ.substring(0,10)}...`, "system");
                renderManagerList(elems.searchManager.value); // 刷新
            }
        });
        
        elems.listManager.addEventListener('del-qa', (e) => {
            if(!confirm("确定要删除这条题目吗？")) return;
            const index = e.detail;
            const history = GM_getValue('qa_history', []);
            history.splice(index, 1);
            GM_setValue('qa_history', history);
            log(`🗑️ 已删除题目`, "system");
            renderManagerList(elems.searchManager.value);
        });
    }

    // 导入导出逻辑
    if (elems.importBtn && elems.importFile) {
        elems.importBtn.onclick = () => elems.importFile.click();
        elems.importFile.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const imported = JSON.parse(e.target.result);
                    if (Array.isArray(imported)) {
                        // 覆盖模式：直接全部删除旧数据，使用导入的数据覆盖
                        const map = new Map();
                        // 仅处理导入的数据，不合并旧历史
                        imported.forEach(item => {
                            if (item.q && item.a) {
                                map.set(item.q, item); // 去重：同名题目以后面的为准
                            }
                        });
                        
                        const newHistory = Array.from(map.values());
                        // 如果数据量过大，可能会超出 GM_setValue 限制，这里暂设 2000 条上限
                        if (newHistory.length > 2000) newHistory.length = 2000;
                        
                        GM_setValue('qa_history', newHistory);
                         log(`📥 题库已覆盖: 旧数据已清空，当前共 ${newHistory.length} 条`, "system");
                    } else {
                        log("❌ 格式错误: 需为JSON数组", "error");
                    }
                } catch(err) {
                     log("❌ 读取失败", "error");
                }
                elems.importFile.value = ''; 
            };
            reader.readAsText(file);
        };
    }

    // 导出题库逻辑
    if (elems.exportBtn) {
        elems.exportBtn.onclick = () => {
            const history = GM_getValue('qa_history', []);
            if (history.length === 0) {
                log("📭 题库为空", "warn");
                return;
            }
            const blob = new Blob([JSON.stringify(history, null, 2)], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nba2k_qa_history_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            log(`📂 已导出 ${history.length} 条题目`, "system");
        };
    }

    // 配置持久化
    elems.host.value = GM_getValue('api_host', 'https://api.deepseek.com/v1');
    elems.key.value = GM_getValue('api_key', '');
    elems.model.value = GM_getValue('api_model', 'deepseek-chat');
    elems.delay.value = GM_getValue('click_delay', '100');

    const saveConfig = () => {
        GM_setValue('api_host', elems.host.value);
        GM_setValue('api_key', elems.key.value);
        GM_setValue('api_model', elems.model.value);
        GM_setValue('click_delay', elems.delay.value);
        log("💾 配置已保存", "system");
    };

    // 绑定 API 测试事件
    if (elems.testBtn) {
        elems.testBtn.onclick = async () => {
            const start = Date.now();
            log("📶 正在连接 API 服务器...", "system");
            
            try {
                const responseIndex = await fetchAnswer("这是一条测试消息，请回复数字0", ["选项A", "选项B", "选项C", "选项D"]);
                const duration = Date.now() - start;
                
                if (responseIndex !== null) {
                    log(`✅ 连接成功! 延迟: ${duration}ms`, "answer");
                } else {
                    log(`❌ 连接失败，请检查配置或日志`, "error");
                }
            } catch (e) {
                log(`❌ 测试发生异常: ${e.message}`, "error");
            }
        };
    }

    // 绑定保存按钮事件
    if (elems.saveBtn) {
        elems.saveBtn.onclick = () => {
            saveConfig();
            // 视觉反馈
            const originalText = elems.saveBtn.textContent;
            elems.saveBtn.textContent = "✅ 已保存";
            setTimeout(() => elems.saveBtn.textContent = originalText, 1000);
        };
    }

    // 绑定单题解答事件
    if (elems.solveBtn) {
        elems.solveBtn.onclick = () => {
            if (!isProcessing) {
                log("⚡ 手动触发解答...", "system");
                solveCurrentQuestion(true);
            } else {
                log("⏳ 上一题正在处理中...", "warn");
            }
        };
    }

    // 交互逻辑
    const togglePanel = () => {
        if(elems.panel) {
            elems.panel.classList.toggle('minimized');
            elems.toggle.textContent = elems.panel.classList.contains('minimized') ? '□' : '_';
        }
    };
    if (elems.toggle) elems.toggle.onclick = togglePanel;
    if (elems.header) elems.header.onclick = (e) => { 
        // 只有点击非按钮区域才收缩，避免拖拽误触发
        if((e.target === elems.header || e.target.tagName === 'H3') && !isDragging) togglePanel(); 
    };

    // 拖拽逻辑实现
    let isDragging = false;
    const makeDraggable = (elmnt, handle) => {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        if (handle) {
            handle.onmousedown = dragMouseDown;
        } else {
            elmnt.onmousedown = dragMouseDown;
        }

        function dragMouseDown(e) {
            e = e || window.event;
            // 忽略按钮点击
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            
            e.preventDefault();
            // 获取初始鼠标位置
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            isDragging = false;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            isDragging = true;
            // 计算位移
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            // 设置新位置
            elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
            elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
            // 清除 fixed bottom/right 布局对定位的干扰
            elmnt.style.bottom = 'auto';
            elmnt.style.right = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            setTimeout(() => isDragging = false, 100); // 延迟重置状态防止触发click
        }
    };
    
    // 启用拖拽 (按住标题栏)
    if (elems.panel && elems.header) {
        makeDraggable(elems.panel, elems.header);
        elems.header.style.cursor = "move"; // 更改鼠标样式
    }

    const log = (msg, type = 'system') => {
        if (!elems.logs) return;
        const p = document.createElement('div');
        p.className = `log-entry ${type}`;
        p.innerHTML = `<span style="opacity:0.5">[${new Date().toLocaleTimeString('en-GB')}]</span> ${msg}`;
        elems.logs.appendChild(p);
        elems.logs.scrollTop = elems.logs.scrollHeight;
    };

    // ==========================================
    // 3. AI 逻辑
    // ==========================================
    async function fetchAnswer(question, options) {
        const apiKey = elems.key.value.trim();
        if (!apiKey) {
            log("🚫 未填写 API Key", "error");
            return null;
        }

        const prompt = `
        题目：${question}
        选项：
        ${options.map((opt, i) => `${i}. ${opt}`).join('\n')}

        只回复正确选项的索引数字 (0-3)。不要任何其他文字。
        `;

        log(`🧠 AI正在思考...`, "system");
        
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: `${elems.host.value.replace(/\/+$/, '')}/chat/completions`,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                    "User-Agent": "Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NBA2KOL2/0.3.854.1299 Safari/537.36"
                },
                data: JSON.stringify({
                    model: elems.model.value,
                    messages: [
                        { role: "system", content: "你是一个NBA 2K2OL游戏专家。你必须只输出一个数字作为答案索引。" },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.1,
                    max_tokens: 10 // 稍微放宽限制，防止部分厂商API报错
                }),
                timeout: 5000,
                onload: function(response) {
                   if (response.status !== 200) {
                        log(`❌ API Error: ${response.status} ${response.statusText}`, "error");
                        // 尝试读取错误信息
                        try{
                            const errData = JSON.parse(response.responseText);
                            if(errData.error && errData.error.message) log(`Details: ${errData.error.message}`, "error");
                        }catch(e){}
                        resolve(null);
                        return;
                   }
                    try {
                        const data = JSON.parse(response.responseText);
                        const content = data.choices[0].message.content.trim();
                        const match = content.match(/(\d)/);
                        if (match) {
                            const index = parseInt(match[1]);
                            log(`✅ 命中答案: ${options[index]}`, "answer");
                            resolve(index);
                        } else {
                            log(`⚠️ 无法解析: ${content}`, "error");
                            resolve(null);
                        }
                    } catch (e) {
                        log(`❌ JSON解析失败`, "error");
                        resolve(null);
                    }
                },
                onerror: () => { log(`❌ 网络请求失败`, "error"); resolve(null); },
                ontimeout: () => { log(`❌ 请求超时`, "error"); resolve(null); }
            });
        });
    }

    // ==========================================
    // 4. 业务逻辑核心
    // ==========================================
    let lastQuestionText = "";
    let lastOptions = []; // 记录上一题的选项列表
    let isProcessing = false;
    let hasClickedStart = false; // 本次页面加载是否点过开始
    let failCount = 0; // AI 连续失败计数

    // 核心答题逻辑，可单独调用
    async function solveCurrentQuestion(manual = false) {
        if (isProcessing) return;

        const pop = document.querySelector("#Pop1");
        // 确保弹窗不仅存在，而且是可见的 (检查 display 和 visibility)
        // 增加检查: offsetHeight > 0 确保真的渲染出来了
        const isVisible = pop && pop.style.display !== 'none' && pop.style.visibility !== 'hidden' && pop.offsetHeight > 0;
        
        if (!isVisible) {
            failCount = 0; // 认为一次答题会话结束，重置失败计数
            if (manual) log("⚠️ 没有检测到答题弹窗", "warn");
            return; 
        }

        // 提取题目
        const qEl = pop.querySelector(".problem");
        if (!qEl) {
            if(manual) log("⚠️ 未能提取到题目文本", "error");
            return;
        }
        const currentQText = qEl.innerHTML.replace(/<[^>]+>/g, "").trim(); // 去除HTML标签取纯文本
        
        // 【关键修复】过滤掉页面默认的占位题目
        if (currentQText.includes("科比·布莱特") && currentQText.includes("最高")) {
             // 这是页面HTML里写死的默认占位题，不是真题，跳过
             return;
        }
        
        // 防止重复请求同一题 (手动模式除外，想重点就重点)
        if (!manual && currentQText === lastQuestionText) return;

        // 提取并检查选项状态
        const optEls = Array.from(pop.querySelectorAll(".option"));
        const options = optEls.map(el => el.innerText.trim());
        const isAnswered = optEls.some(el => el.classList.contains("selected") || el.classList.contains("disabled"));
        
        if (isAnswered) {
             if(manual) log("⚠️ 该题已作答", "warn");
             // 如果已经答了，更新一下lastQuestionText以免下一轮进不来
             lastQuestionText = currentQText;
             lastOptions = options;
             return;
        }

        // 开始处理
        isProcessing = true;
        
        lastQuestionText = currentQText;
        lastOptions = options;

        // 显示修正面板按钮
        if (elems.delBtn) elems.delBtn.style.display = 'inline-block';
        if (elems.correctionPanel) elems.correctionPanel.style.display = 'flex';
        
        log(`❓ 题目: ${currentQText.substring(0, 15)}...`, "question");

        let answerIndex = null;
        let isFromCache = false;
        
        
        // 1. 尝试本地题库缓存 (极速秒答核心)
        try {
            // 工具函数：去除选项前缀 (如 "A. ", "1. ", "A ") 和非核心字符，提取核心内容
            const getCoreText = (str) => {
                let s = String(str).trim();
                // 去除开头的 A-D 或 数字 加 标点/空格 的前缀
                // 例如: "A. 乔丹" -> "乔丹", "1. 1998" -> "1998"
                s = s.replace(/^[A-Z0-9]+[\.\:、\s]\s*/i, ""); 
                // 去除所有非汉字字母数字的符号，忽略大小写
                return s.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").toLowerCase();
            };

            const history = GM_getValue('qa_history', []);
            
            // 增强版题目匹配：先精确，后模糊
            let cache = history.find(h => h.q === currentQText);
            if (!cache) {
                const normCurrentQ = getCoreText(currentQText); // 题目也可以用这个逻辑简化
                cache = history.find(h => getCoreText(h.q) === normCurrentQ);
            }

            if (cache) {
                const cachedAnswerText = cache.a;
                // 策略1：精确全文本匹配 (最快，由之前的完全一样产生)
                let cachedIndex = options.findIndex(opt => opt === cachedAnswerText);
                
                // 策略2：去除前缀+归一化核心内容匹配 (解决 "A. 乔丹" 变成 "B. 乔丹" 的问题)
                if (cachedIndex === -1) {
                    const coreCachedAns = getCoreText(cachedAnswerText);
                    cachedIndex = options.findIndex(opt => getCoreText(opt) === coreCachedAns);
                }

                // 策略3：核心内容包含匹配 (兜底)
                if (cachedIndex === -1) {
                    const coreCachedAns = getCoreText(cachedAnswerText);
                    if (coreCachedAns.length > 1) { // 防止只有一个字符时误判
                        cachedIndex = options.findIndex(opt => {
                             const coreOpt = getCoreText(opt);
                             return coreOpt.includes(coreCachedAns) || coreCachedAns.includes(coreOpt);
                        });
                    }
                }

                if (cachedIndex !== -1) {
                    log(`🚀 本地命中: ${cachedAnswerText} (匹配选项: ${options[cachedIndex]})`, "answer");
                    answerIndex = cachedIndex;
                    isFromCache = true;
                }
            }
        } catch(e) { console.error(e); }

        // 2. 如果本地没有，再请求 AI
        if (answerIndex === null) {
            
            // 检查是否连续失败过多
            if (failCount > 3) {
                 log("⚠️ AI 连续失败超限，强制选 A", "warn");
                 answerIndex = 0;
            } else {
                 answerIndex = await fetchAnswer(currentQText, options);
                 if (answerIndex === null) {
                     failCount++; // 增加失败计数
                 } else {
                     failCount = 0; // 成功则重置
                 }
            }
        } else {
             failCount = 0; // 缓存命中也算成功
        }

        // 执行操作
        if (answerIndex !== null && answerIndex >= 0 && answerIndex < optEls.length) {
            
            // 记录题目到本地 (如果不是来自缓存，则记录)
            if (!isFromCache) {
                try {
                    saveToHistory(currentQText, options[answerIndex], options);
                } catch(e) {}
            }

            // 极速模式：读取用户配置，最快0
            const userDelay = parseInt(elems.delay.value) || 0;
            const delay = manual ? 0 : userDelay; 

            const doAction = () => {
                const target = optEls[answerIndex];
                target.click();
                try { target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch(e){}
                isProcessing = false;
            };

            if (delay <= 0) {
                doAction(); // 0延迟时同步直接执行，节省一次事件循环的时间
            } else {
                setTimeout(doAction, delay);
            }
        } else {
            // 保底方案
            if (manual || elems.autoMode.checked) {
                log("⚠️ 无答案/失败，盲选 A", "warn");
                optEls[0].click();
                // 盲选也记录一个临时条目？ 不，盲选很可能是错的，不记录
            }
            isProcessing = false;
        }
    }

    // 主循环：负责自动调用答题
    setInterval(async () => {
        // --- 自动答题模块 ---
        // 只有开启了全自动模式才不断尝试解答
        if (elems.autoMode && elems.autoMode.checked) {
            solveCurrentQuestion();
        }

    }, 30); // 即使0延迟也受限于setInterval精度，提升到33ms (~30FPS) 追求极限
    // 提示: 过于频繁的检测可能会增加CPU占用，但确实会更快一点点

    // 预加载题库到内存 (如果题库巨大，应优化为 Map)

    log("助手已启动，请配置API并点击保存", "system");

})();
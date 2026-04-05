const STYLES = `
#harness-root {
  position: fixed; top: 0; right: 0; width: 320px; height: 100vh;
  z-index: 99999; pointer-events: none;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px; color: #c8c8c8;
}
#harness-root.open { pointer-events: auto; }
#harness-panel {
  display: none; flex-direction: column; width: 100%; height: 100%;
  background: rgba(10, 10, 10, 0.88); border-left: 1px solid #333;
  box-sizing: border-box;
}
#harness-root.open #harness-panel { display: flex; }
#harness-header {
  padding: 8px 10px; border-bottom: 1px solid #333; font-size: 11px;
  color: #666; display: flex; justify-content: space-between;
  align-items: center; flex-shrink: 0;
}
#harness-reload-indicator { display: none; color: #e8a620; font-size: 11px; }
#harness-reload-indicator.active { display: inline; }
#harness-messages { flex: 1; overflow-y: auto; padding: 8px 10px; }
#harness-messages::-webkit-scrollbar { width: 4px; }
#harness-messages::-webkit-scrollbar-thumb { background: #444; }
.harness-msg { margin-bottom: 6px; line-height: 1.4; word-wrap: break-word; }
.harness-msg-user { color: #8bc34a; }
.harness-msg-user::before { content: '> '; color: #666; }
.harness-msg-system { color: #666; font-size: 11px; font-style: italic; }
.harness-msg-ack { color: #555; font-size: 11px; }
.harness-msg-ack::before { content: '  '; }
.harness-msg-response { color: #64b5f6; }
.harness-msg-response::before { content: '< '; color: #666; }
.harness-msg-done { color: #4caf50; }
.harness-msg-done::before { content: '< '; color: #666; }
.harness-msg-error { color: #ef5350; }
.harness-msg-error::before { content: '! '; color: #ef5350; }
.harness-msg-plan { color: #b0bec5; white-space: pre-wrap; border-left: 2px solid #546e7a; padding-left: 8px; margin: 8px 0; }
.harness-msg-progress { color: #888; font-size: 11px; }
#harness-actions { display: none; padding: 8px 10px; border-top: 1px solid #333; flex-shrink: 0; gap: 8px; align-items: center; }
#harness-actions.active { display: flex; }
.harness-btn { background: #333; border: 1px solid #555; color: #c8c8c8; padding: 4px 12px; cursor: pointer; font-family: inherit; font-size: 12px; }
.harness-btn:hover { background: #444; }
.harness-btn-confirm { border-color: #4caf50; color: #4caf50; }
.harness-btn-confirm:hover { background: #1b3a1b; }
#harness-elapsed { font-size: 10px; color: #555; padding: 0 10px; }
#harness-input-row { display: flex; border-top: 1px solid #333; flex-shrink: 0; }
#harness-input {
  flex: 1; background: rgba(0, 0, 0, 0.5); border: none; outline: none;
  color: #c8c8c8; font-family: inherit; font-size: 13px; padding: 8px 10px;
}
#harness-input::placeholder { color: #555; }
#harness-dot {
  position: fixed; top: 6px; right: 6px; width: 8px; height: 8px;
  z-index: 100000; pointer-events: none;
}
#harness-dot.connected { background: #4caf50; }
#harness-dot.reconnecting { background: #ffc107; }
#harness-dot.disconnected { background: #f44336; }
#harness-root.open #harness-dot { display: none; }
`;

export function createOverlay(client, options = {}) {
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);

  const root = document.createElement('div');
  root.id = 'harness-root';
  root.innerHTML = `
    <div id="harness-panel">
      <div id="harness-header">
        <span>DEV HARNESS</span>
        <span id="harness-reload-indicator">RELOADING</span>
      </div>
      <div id="harness-messages"></div>
      <div id="harness-actions">
        <button class="harness-btn harness-btn-confirm" id="harness-confirm">Confirm</button>
        <button class="harness-btn" id="harness-revise">Revise</button>
        <span id="harness-elapsed"></span>
      </div>
      <div id="harness-input-row">
        <input id="harness-input" type="text" placeholder="feedback..." autocomplete="off" />
      </div>
    </div>`;
  document.body.appendChild(root);

  const dot = document.createElement('div');
  dot.id = 'harness-dot';
  dot.className = 'disconnected';
  document.body.appendChild(dot);

  const messages = root.querySelector('#harness-messages');
  const input = root.querySelector('#harness-input');
  const reloadIndicator = root.querySelector('#harness-reload-indicator');
  const actionsRow = root.querySelector('#harness-actions');
  const confirmBtn = root.querySelector('#harness-confirm');
  const reviseBtn = root.querySelector('#harness-revise');
  const elapsedSpan = root.querySelector('#harness-elapsed');
  let isOpen = false;
  let inputMode = 'feedback'; // 'feedback' or 'revise'
  const HISTORY_KEY = '__dev_harness_chat__';

  function saveHistory() {
    try {
      const entries = [];
      messages.querySelectorAll('.harness-msg').forEach((el) => {
        const type = (el.className.match(/harness-msg-(\S+)$/) || [])[1] || 'system';
        if (type !== 'system') entries.push({ text: el.textContent, type });
      });
      // Keep last 50 messages to avoid bloating sessionStorage
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-50)));
    } catch (_) {}
  }

  function restoreHistory() {
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const entries = JSON.parse(raw);
      for (const { text, type } of entries) {
        const el = document.createElement('div');
        el.className = `harness-msg harness-msg-${type}`;
        el.textContent = text;
        messages.appendChild(el);
      }
      messages.scrollTop = messages.scrollHeight;
    } catch (_) {}
  }

  restoreHistory();

  function toggle() {
    isOpen = !isOpen;
    root.className = isOpen ? 'open' : '';
    if (isOpen) input.focus();
  }

  function addMessage(text, type = 'system') {
    const el = document.createElement('div');
    el.className = `harness-msg harness-msg-${type}`;
    el.textContent = text;
    messages.appendChild(el);
    saveHistory();
    messages.scrollTop = messages.scrollHeight;
  }

  function showActions() {
    actionsRow.classList.add('active');
  }

  function hideActions() {
    actionsRow.classList.remove('active');
    elapsedSpan.textContent = '';
  }

  function formatElapsed(seconds) {
    if (seconds < 60) return seconds + 's';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + 'm ' + s + 's';
  }

  function setInputMode(mode) {
    inputMode = mode;
    if (mode === 'revise') {
      input.placeholder = 'revision...';
    } else {
      input.placeholder = 'feedback...';
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') {
      e.preventDefault();
      toggle();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && input.value.trim()) {
      const text = input.value.trim();
      addMessage(text, 'user');
      if (inputMode === 'revise') {
        if (options.onRevise) options.onRevise(text);
        else client.send('revise', { message: text });
        setInputMode('feedback');
      } else {
        if (options.onSend) options.onSend(text);
        else client.send('feedback', { message: text });
      }
      input.value = '';
    }
    e.stopPropagation();
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  input.addEventListener('keypress', (e) => e.stopPropagation());

  // Confirm button
  confirmBtn.addEventListener('click', () => {
    hideActions();
    addMessage('Confirmed. Building...', 'ack');
    if (options.onConfirm) options.onConfirm();
    else client.send('confirm', {});
  });

  // Revise button
  reviseBtn.addEventListener('click', () => {
    hideActions();
    setInputMode('revise');
    input.focus();
    addMessage('Type your revision below.', 'system');
  });

  client.on('status', (status) => {
    dot.className = status;
    if (status === 'connected') addMessage('Connected to dev harness', 'system');
    else if (status === 'disconnected') addMessage('Disconnected', 'system');
  });

  client.on('preparing-reload', () => {
    reloadIndicator.classList.add('active');
    addMessage('Hot reload in progress...', 'system');
  });

  client.on('reload-complete', () => {
    reloadIndicator.classList.remove('active');
  });

  client.on('response', (data) => {
    const status = data.status || 'response';
    addMessage(data.message, status);
  });

  client.on('plan', (data) => {
    addMessage(data.message, 'plan');
    showActions();
  });

  client.on('progress', (data) => {
    addMessage(data.message, 'progress');
  });

  client.on('elapsed', (data) => {
    elapsedSpan.textContent = formatElapsed(data.seconds);
  });

  client.on('done', (data) => {
    hideActions();
    addMessage(data.message, 'done');
    setInputMode('feedback');
  });

  return { addMessage, toggle };
}

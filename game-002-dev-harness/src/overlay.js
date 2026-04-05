const STYLES = `
#harness-root {
  position: fixed; top: 0; right: 0; width: 320px; height: 100vh;
  z-index: 99999; pointer-events: none;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px; color: #c8c8c8;
}
#harness-root.open { pointer-events: auto; }
#harness-root.wide { width: 50%; }
#harness-root.full { width: 100%; }
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
#harness-resize-btn { background: none; border: none; color: #666; cursor: pointer; font-size: 11px; padding: 0 4px; font-family: inherit; }
#harness-resize-btn:hover { color: #aaa; }
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
#harness-knobs { padding: 8px 10px; border-top: 1px solid #333; max-height: 200px; overflow-y: auto; flex-shrink: 0; }
#harness-knobs:empty { display: none; }
.harness-knob { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11px; }
.harness-knob label { flex: 1; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.harness-knob input[type=range] { flex: 2; }
.harness-knob .knob-value { width: 40px; color: #aaa; text-align: right; font-family: inherit; }
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
  color: #c8c8c8; font-family: inherit; font-size: inherit; padding: 8px 10px;
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
        <span>
          <button id="harness-resize-btn" title="Cycle: normal / wide / full">[=]</button>
          <span id="harness-reload-indicator">RELOADING</span>
        </span>
      </div>
      <div id="harness-messages"></div>
      <div id="harness-knobs"></div>
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
  const resizeBtn = root.querySelector('#harness-resize-btn');
  const knobsContainer = root.querySelector('#harness-knobs');
  let isOpen = false;
  let inputMode = 'feedback'; // 'feedback' or 'revise'
  const HISTORY_KEY = '__dev_harness_chat__';
  const OPEN_KEY = '__dev_harness_open__';
  const FONTSIZE_KEY = '__dev_harness_fontsize__';
  const SIZE_KEY = '__dev_harness_size__';
  const KNOBS_KEY = '__dev_harness_knobs__';

  // --- Font size ---
  const FONT_MIN = 10;
  const FONT_MAX = 20;
  let fontSize = 13;
  try {
    const saved = sessionStorage.getItem(FONTSIZE_KEY);
    if (saved) fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, parseInt(saved, 10)));
  } catch (_) {}
  root.style.fontSize = fontSize + 'px';

  function setFontSize(size) {
    fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, size));
    root.style.fontSize = fontSize + 'px';
    try { sessionStorage.setItem(FONTSIZE_KEY, String(fontSize)); } catch (_) {}
  }

  // --- Resize modes ---
  const SIZE_MODES = ['normal', 'wide', 'full'];
  const SIZE_LABELS = { normal: '[=]', wide: '[==]', full: '[===]' };
  let sizeMode = 'normal';
  try {
    const saved = sessionStorage.getItem(SIZE_KEY);
    if (saved && SIZE_MODES.includes(saved)) sizeMode = saved;
  } catch (_) {}

  function applyRootClasses() {
    const classes = [];
    if (isOpen) classes.push('open');
    if (sizeMode !== 'normal') classes.push(sizeMode);
    root.className = classes.join(' ');
  }

  function applySizeMode() {
    applyRootClasses();
    resizeBtn.textContent = SIZE_LABELS[sizeMode];
    try { sessionStorage.setItem(SIZE_KEY, sizeMode); } catch (_) {}
  }

  function cycleSize() {
    const idx = SIZE_MODES.indexOf(sizeMode);
    sizeMode = SIZE_MODES[(idx + 1) % SIZE_MODES.length];
    applySizeMode();
  }

  applySizeMode();
  resizeBtn.addEventListener('click', cycleSize);

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

  function setOpen(open) {
    isOpen = open;
    applyRootClasses();
    if (isOpen) input.focus();
    try { sessionStorage.setItem(OPEN_KEY, isOpen ? '1' : '0'); } catch (_) {}
  }

  function toggle() {
    setOpen(!isOpen);
  }

  // Restore open state from previous session
  try {
    if (sessionStorage.getItem(OPEN_KEY) === '1') {
      setOpen(true);
    }
  } catch (_) {}

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
      return;
    }
    // Font size: Ctrl+= to increase, Ctrl+- to decrease (when overlay is open)
    if (isOpen && e.ctrlKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setFontSize(fontSize + 1);
      } else if (e.key === '-') {
        e.preventDefault();
        setFontSize(fontSize - 1);
      }
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') {
      e.preventDefault();
      return;
    }
    // Let Ctrl shortcuts propagate to document handler (font size, etc.)
    if (e.ctrlKey) return;
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

  // --- Knobs rendering ---
  function renderKnobs(knobs) {
    knobsContainer.innerHTML = '';
    for (const knob of knobs) {
      const row = document.createElement('div');
      row.className = 'harness-knob';

      const label = document.createElement('label');
      label.textContent = knob.name;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = knob.min;
      slider.max = knob.max;
      slider.step = knob.step || 1;
      slider.value = knob.value;

      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'knob-value';
      valueDisplay.textContent = knob.value;

      slider.addEventListener('input', () => {
        const val = Number(slider.value);
        valueDisplay.textContent = val;
        knob.value = val;
        if (knob.callback) knob.callback(val);
        // Persist all knob values
        try {
          const saved = {};
          for (const k of knobs) saved[k.name] = k.value;
          sessionStorage.setItem(KNOBS_KEY, JSON.stringify(saved));
        } catch (_) {}
      });

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valueDisplay);
      knobsContainer.appendChild(row);
    }
  }

  return { addMessage, toggle, renderKnobs };
}

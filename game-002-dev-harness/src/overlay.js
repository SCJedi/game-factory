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
  let isOpen = false;

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
    messages.scrollTop = messages.scrollHeight;
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
      if (options.onSend) options.onSend(text);
      else client.send('feedback', { message: text });
      input.value = '';
    }
    e.stopPropagation();
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  input.addEventListener('keypress', (e) => e.stopPropagation());

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

  return { addMessage, toggle };
}

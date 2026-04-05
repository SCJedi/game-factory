const RECONNECT_BASE = 1000;
const RECONNECT_MAX = 10000;

export function createClient(url = 'ws://localhost:3001') {
  let ws = null;
  let attempt = 0;
  let intentionalClose = false;
  const listeners = {};

  function emit(event, data) {
    const fns = listeners[event];
    if (fns) fns.forEach(fn => fn(data));
  }

  function connect() {
    try {
      ws = new WebSocket(url);
    } catch (_) {
      emit('status', 'disconnected');
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      attempt = 0;
      emit('status', 'connected');
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'force-reload') {
          window.location.reload();
          return;
        }
        emit(msg.type, msg);
      } catch (_) {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      emit('status', 'disconnected');
      if (!intentionalClose) scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires after onerror, reconnect handled there
    };
  }

  function scheduleReconnect() {
    const delay = Math.min(RECONNECT_BASE * Math.pow(2, attempt), RECONNECT_MAX);
    attempt++;
    emit('status', 'reconnecting');
    setTimeout(connect, delay);
  }

  function send(type, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }

  function destroy() {
    intentionalClose = true;
    if (ws) ws.close();
  }

  connect();

  return { send, on, destroy };
}

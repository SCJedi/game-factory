import { createClient } from './client.js';
import { createOverlay } from './overlay.js';
import { snapshotState, restoreState } from './state-snap.js';

export { restoreState } from './state-snap.js';

export function initHarness(phaserGame, options = {}) {
  const harnessPort = window.__HARNESS_PORT__ || 3001;
  const url = options.url || `ws://localhost:${harnessPort}`;
  const client = createClient(url);

  const overlay = createOverlay(client, {
    onSend: (text) => sendFeedback(text),
    onConfirm: () => sendConfirm(),
    onRevise: (text) => sendRevise(text),
  });

  let stateGetter = null;
  let currentScene = null;
  const knobs = [];
  const MAX_KNOBS = 10;
  const KNOBS_KEY = '__dev_harness_knobs__';

  // Track the active scene
  if (phaserGame && phaserGame.scene) {
    phaserGame.scene.scenes.forEach((scene) => {
      scene.events.on('wake', () => { currentScene = scene.scene.key; });
      scene.events.on('start', () => { currentScene = scene.scene.key; });
    });

    // Set initial scene
    if (phaserGame.scene.scenes.length > 0) {
      currentScene = phaserGame.scene.scenes[0].scene.key;
    }
  }

  function registerState(fn) {
    stateGetter = fn;
  }

  // When server says reload is coming, snapshot current state
  client.on('preparing-reload', () => {
    if (stateGetter && currentScene) {
      try {
        const state = stateGetter();
        snapshotState(currentScene, state);
      } catch (_) {
        // state getter failed - skip snapshot
      }
    }
  });

  // Attach state to feedback messages
  const originalSend = client.send;
  client.send = (type, payload) => {
    if (type === 'feedback' && stateGetter) {
      try {
        payload.state = stateGetter();
        payload.scene = currentScene;
      } catch (_) {
        // state getter failed - send without state
      }
    }
    originalSend(type, payload);
  };

  function sendFeedback(message) {
    client.send('feedback', { message });
  }

  function sendConfirm() {
    client.send('confirm', {});
  }

  function sendRevise(message) {
    client.send('revise', { message });
  }

  function registerKnob(name, min, max, currentValue, callback, step) {
    if (knobs.length >= MAX_KNOBS) {
      console.warn('[dev-harness] Max knobs (' + MAX_KNOBS + ') reached, ignoring:', name);
      return;
    }
    // Check for saved value from a previous session
    let value = currentValue;
    try {
      const saved = JSON.parse(sessionStorage.getItem(KNOBS_KEY) || '{}');
      if (saved[name] !== undefined) {
        value = Number(saved[name]);
        // Clamp to valid range
        value = Math.min(max, Math.max(min, value));
        // Apply the saved value immediately
        if (callback) callback(value);
      }
    } catch (_) {}

    knobs.push({ name, min, max, value, callback, step: step || 1 });
    overlay.renderKnobs(knobs);
  }

  function on(event, callback) {
    client.on(event, callback);
  }

  function destroy() {
    client.destroy();
  }

  return {
    registerState,
    registerKnob,
    restoreState,
    send: sendFeedback,
    on,
    destroy,
    overlay,
  };
}

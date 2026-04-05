import { createClient } from './client.js';
import { createOverlay } from './overlay.js';
import { snapshotState, restoreState } from './state-snap.js';

export { restoreState } from './state-snap.js';

export function initHarness(phaserGame, options = {}) {
  const url = options.url || 'ws://localhost:3001';
  const client = createClient(url);

  // sendFeedback is defined after the client.send patch below
  const overlay = createOverlay(client, {
    onSend: (text) => sendFeedback(text),
  });

  let stateGetter = null;
  let currentScene = null;

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

  function on(event, callback) {
    client.on(event, callback);
  }

  function destroy() {
    client.destroy();
  }

  return {
    registerState,
    restoreState,
    send: sendFeedback,
    on,
    destroy,
    overlay,
  };
}

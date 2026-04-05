import { WebSocketServer } from 'ws';
import { mkdirSync, appendFileSync, watchFile, readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { spawn } from 'child_process';
import { createInterface } from 'readline';

export function devHarness(options = {}) {
  const port = options.port || 3001;
  const handler = options.handler || null;
  let wss = null;
  let projectRoot = '';
  let lastResponseSize = 0;
  let handlerProc = null;
  let handlerBusy = false;
  let pendingFeedback = [];
  let elapsedInterval = null;
  let phaseStartTime = null;

  function broadcast(data) {
    if (!wss) return;
    const msg = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(msg);
    });
  }

  function respond(message, status = 'response') {
    const dir = ensureHarnessDir();
    const line = JSON.stringify({ message, status }) + '\n';
    appendFileSync(resolve(dir, 'responses.jsonl'), line, 'utf8');
  }

  function ensureHarnessDir() {
    const dir = resolve(projectRoot, '.harness');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  function writeFeedback(entry) {
    const dir = ensureHarnessDir();
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(resolve(dir, 'feedback.jsonl'), line, 'utf8');
  }

  function watchResponses() {
    const dir = ensureHarnessDir();
    const responsesPath = resolve(dir, 'responses.jsonl');

    if (!existsSync(responsesPath)) {
      writeFileSync(responsesPath, '', 'utf8');
    }
    lastResponseSize = readFileSync(responsesPath, 'utf8').length;

    watchFile(responsesPath, { interval: 500 }, () => {
      try {
        const content = readFileSync(responsesPath, 'utf8');
        if (content.length <= lastResponseSize) return;

        const newContent = content.slice(lastResponseSize);
        lastResponseSize = content.length;

        const lines = newContent.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          const entry = JSON.parse(line);
          broadcast({
            type: 'response',
            message: entry.message || '',
            status: entry.status || 'info',
          });
        }
      } catch (_) {
        // file read or parse error, skip
      }
    });
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    phaseStartTime = Date.now();
    elapsedInterval = setInterval(() => {
      const seconds = Math.floor((Date.now() - phaseStartTime) / 1000);
      broadcast({ type: 'elapsed', seconds });
    }, 5000);
    // Send the first one immediately at 0
    broadcast({ type: 'elapsed', seconds: 0 });
  }

  function stopElapsedTimer() {
    if (elapsedInterval) {
      clearInterval(elapsedInterval);
      elapsedInterval = null;
    }
    phaseStartTime = null;
  }

  function spawnHandler() {
    if (!handler) return null;

    const proc = spawn(handler.cmd, handler.args || [], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, HARNESS_PROJECT: projectRoot },
    });

    const rl = createInterface({ input: proc.stdout });

    rl.on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (_) {
        // Non-JSON output from handler, treat as progress
        broadcast({ type: 'response', message: line, status: 'response' });
        return;
      }

      if (msg.type === 'plan') {
        stopElapsedTimer();
        broadcast({ type: 'plan', message: msg.message });

      } else if (msg.type === 'progress') {
        broadcast({ type: 'progress', message: msg.message });

      } else if (msg.type === 'done') {
        stopElapsedTimer();
        handlerBusy = false;
        respond(msg.message, 'done');
        broadcast({ type: 'done', message: msg.message });
        // Kill the handler process now that the cycle is complete
        killHandler();
        // Trigger controlled page reload
        setTimeout(() => {
          broadcast({ type: 'force-reload' });
        }, 800);
        // Process pending feedback if any
        if (pendingFeedback.length > 0) {
          const next = pendingFeedback.shift();
          runHandler(next);
        }

      } else if (msg.type === 'error') {
        stopElapsedTimer();
        handlerBusy = false;
        broadcast({ type: 'response', message: msg.message, status: 'error' });
        killHandler();
        if (pendingFeedback.length > 0) {
          const next = pendingFeedback.shift();
          runHandler(next);
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        broadcast({ type: 'progress', message: text });
      }
    });

    proc.on('close', (code) => {
      handlerProc = null;
      if (handlerBusy) {
        // Unexpected exit during a session
        stopElapsedTimer();
        handlerBusy = false;
        broadcast({ type: 'response', message: `Handler exited unexpectedly (code ${code}).`, status: 'error' });
        if (pendingFeedback.length > 0) {
          const next = pendingFeedback.shift();
          runHandler(next);
        }
      }
    });

    proc.on('error', (err) => {
      handlerProc = null;
      stopElapsedTimer();
      handlerBusy = false;
      broadcast({ type: 'response', message: `Handler failed to start: ${err.message}`, status: 'error' });
    });

    return proc;
  }

  function killHandler() {
    if (handlerProc) {
      try {
        handlerProc.stdin.end();
        handlerProc.kill();
      } catch (_) {
        // already dead
      }
      handlerProc = null;
    }
  }

  function sendToHandler(obj) {
    if (handlerProc && handlerProc.stdin.writable) {
      handlerProc.stdin.write(JSON.stringify(obj) + '\n');
    }
  }

  function runHandler(entry) {
    if (!handler) return;
    if (handlerBusy) {
      pendingFeedback.push(entry);
      broadcast({
        type: 'response',
        message: 'Queued -- still working on the previous request.',
        status: 'ack',
      });
      return;
    }

    handlerBusy = true;
    broadcast({
      type: 'response',
      message: 'Thinking...',
      status: 'ack',
    });
    startElapsedTimer();

    // Spawn a fresh handler process for this feedback session
    handlerProc = spawnHandler();
    if (!handlerProc) {
      handlerBusy = false;
      stopElapsedTimer();
      return;
    }

    sendToHandler({
      type: 'feedback',
      message: entry.message,
      scene: entry.scene,
      state: entry.state,
      projectRoot,
    });
  }

  function handleConfirm() {
    if (!handlerProc || !handlerBusy) {
      broadcast({ type: 'response', message: 'No active session to confirm.', status: 'error' });
      return;
    }
    broadcast({ type: 'response', message: 'Building...', status: 'ack' });
    startElapsedTimer();
    sendToHandler({ type: 'confirm' });
  }

  function handleRevise(message) {
    if (!handlerProc || !handlerBusy) {
      broadcast({ type: 'response', message: 'No active session to revise.', status: 'error' });
      return;
    }
    broadcast({ type: 'response', message: 'Revising plan...', status: 'ack' });
    startElapsedTimer();
    sendToHandler({ type: 'revise', message });
  }

  return {
    name: 'game-dev-harness',

    configResolved(config) {
      projectRoot = config.root;
    },

    configureServer(server) {
      wss = new WebSocketServer({ port });

      wss.on('connection', (ws) => {
        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'feedback') {
              const entry = {
                timestamp: new Date().toISOString(),
                message: msg.message || '',
                scene: msg.scene || null,
                state: msg.state || null,
              };
              writeFeedback(entry);

              if (handler) {
                runHandler(entry);
              } else {
                broadcast({
                  type: 'response',
                  message: `Received: "${entry.message}"`,
                  status: 'ack',
                });
              }
            } else if (msg.type === 'confirm') {
              handleConfirm();
            } else if (msg.type === 'revise') {
              handleRevise(msg.message || '');
            }
          } catch (_) {
            // ignore malformed messages
          }
        });
      });

      wss.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[dev-harness] Port ${port} in use. Harness WebSocket disabled.`);
          wss = null;
        }
      });

      watchResponses();

      const mode = handler ? `auto (${handler.cmd})` : 'manual';
      console.log(`[dev-harness] WebSocket on port ${port} | mode: ${mode}`);
    },

    handleHotUpdate(ctx) {
      // Ignore harness files
      if (ctx.file.includes('.harness') || ctx.file.includes('responses.jsonl') || ctx.file.includes('feedback.jsonl')) {
        return [];
      }

      // When a handler is active, suppress automatic HMR entirely.
      // The handler's completion triggers the reload instead, so the game
      // stays stable while Claude is working and only refreshes once at the end.
      if (handler && handlerBusy) {
        return [];
      }

      // No handler active - do normal HMR
      broadcast({ type: 'preparing-reload' });
      return undefined;
    },

    buildEnd() {
      killHandler();
      stopElapsedTimer();
      if (wss) {
        wss.close();
      }
    },
  };
}

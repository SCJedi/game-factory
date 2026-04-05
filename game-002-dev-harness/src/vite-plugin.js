import { WebSocketServer } from 'ws';
import { mkdirSync, appendFileSync, watchFile, readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { spawn } from 'child_process';

export function devHarness(options = {}) {
  const port = options.port || 3001;
  const handler = options.handler || null;
  let wss = null;
  let projectRoot = '';
  let lastResponseSize = 0;
  let handlerBusy = false;
  let pendingFeedback = [];

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

  function runHandler(entry) {
    if (!handler) return;
    if (handlerBusy) {
      pendingFeedback.push(entry);
      broadcast({
        type: 'response',
        message: 'Queued - still working on the previous request.',
        status: 'ack',
      });
      return;
    }

    handlerBusy = true;
    broadcast({
      type: 'response',
      message: 'Building...',
      status: 'ack',
    });

    const input = JSON.stringify({
      message: entry.message,
      scene: entry.scene,
      state: entry.state,
      projectRoot,
    });

    const proc = spawn(handler.cmd, handler.args || [], {
      cwd: projectRoot,
      shell: true,
      env: { ...process.env, HARNESS_PROJECT: projectRoot },
    });

    proc.stdin.write(input);
    proc.stdin.end();

    let stdout = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        broadcast({
          type: 'response',
          message: text,
          status: 'response',
        });
      }
    });

    proc.on('close', (code) => {
      handlerBusy = false;

      if (code === 0) {
        const summary = stdout.trim().split('\n').pop() || 'Changes applied.';
        respond(summary, 'done');
        // Trigger a single controlled page reload now that changes are done
        broadcast({
          type: 'response',
          message: 'Reloading game with changes...',
          status: 'ack',
        });
        setTimeout(() => {
          broadcast({ type: 'force-reload' });
        }, 800);
      } else {
        respond(`Handler exited with code ${code}.`, 'error');
      }

      if (pendingFeedback.length > 0) {
        const next = pendingFeedback.shift();
        runHandler(next);
      }
    });
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
      if (wss) {
        wss.close();
      }
    },
  };
}

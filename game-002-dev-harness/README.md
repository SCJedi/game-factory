# Game Dev Harness

In-game feedback overlay for Phaser 3 + Vite games. Connects your browser to an AI handler (or any tool) through a WebSocket bridge, so you can describe changes in plain language and see them applied in real time.

## How It Works

1. You press backtick to open a chat overlay on top of your game.
2. You type feedback ("make the player faster", "add a power-up").
3. The overlay sends your message plus current game state over WebSocket to the Vite plugin.
4. The plugin writes to `.harness/feedback.jsonl` and spawns a handler process (default: Claude CLI).
5. The handler reads the feedback, edits game source files, and writes a response to `.harness/responses.jsonl`.
6. The plugin detects the response, broadcasts it to the overlay, and triggers a page reload.

## Setup (3 steps)

### 1. Install

Add to your game's package.json:
```json
"dependencies": {
  "game-dev-harness": "file:../game-002-dev-harness"
}
```

Then run `npm install`.

### 2. Add the Vite plugin

```js
// vite.config.js
import { defineConfig } from 'vite';
import { devHarness } from 'game-dev-harness';

export default defineConfig({
  plugins: [devHarness({
    handler: {
      cmd: 'node',
      args: ['node_modules/game-dev-harness/src/handlers/claude.js'],
    },
  })],
  server: {
    watch: { ignored: ['**/.harness/**'] }
  }
});
```

The `handler` option is optional. Without it, the harness runs in manual mode - feedback is written to the JSONL file but no handler process is spawned.

### 3. Initialize in your game

```js
// main.js
import Phaser from 'phaser';
import { initHarness, restoreState } from 'game-dev-harness/client';

const game = new Phaser.Game(config);
const harness = initHarness(game);

// Register a state getter so feedback includes game context
harness.registerState(() => ({
  x: player.x,
  y: player.y,
  score: currentScore,
}));

// Optional: restore state after hot reload in your scene's create()
const saved = restoreState('GameScene');
if (saved) {
  player.x = saved.x;
  player.y = saved.y;
}
```

## Overlay Controls

- **Backtick** (`` ` ``) - toggle the overlay panel
- **Enter** - send feedback
- **Status dot** (top-right corner) - green = connected, yellow = reconnecting, red = disconnected

The overlay captures keyboard events with stopPropagation so your game does not receive input while you are typing.

## JSONL Protocol

The harness communicates through two append-only JSONL files in each game's `.harness/` directory. This is the integration point for custom handlers.

### feedback.jsonl (overlay writes, handler reads)

Each line is one feedback entry:

```json
{
  "timestamp": "2026-04-04T15:30:00Z",
  "message": "make the jump higher",
  "scene": "GameScene",
  "state": { "x": 400, "y": 300, "score": 42 }
}
```

### responses.jsonl (handler writes, overlay reads)

Each line is one response:

```json
{ "message": "Jump height increased from 300 to 450.", "status": "done" }
```

### Response Statuses

| Status | Color | Use for |
|--------|-------|---------|
| `ack` | Gray | Acknowledgment, queued messages |
| `response` | Blue | Progress updates, intermediate output |
| `done` | Green | Work complete |
| `error` | Red | Failures |

## Writing a Custom Handler

A handler is any process that:

1. Reads JSON from stdin (contains message, scene, state, projectRoot)
2. Modifies the game source files
3. Writes a summary to stdout
4. Exits with code 0 on success

The Vite plugin spawns the handler with `HARNESS_PROJECT` set in the environment and `cwd` set to the game root.

See `src/handlers/claude.js` for the reference implementation. To use a different LLM, write a handler that sends the feedback to your preferred API and writes the responses.

## CLI Tool

The package includes a CLI for reading and responding to feedback outside the browser:

```bash
npx harness read              # Print unread feedback
npx harness read --all        # Print all feedback
npx harness respond "message" # Send a response (blue)
npx harness done "message"    # Send a completion (green)
npx harness error "message"   # Send an error (red)
npx harness tail              # Watch for new feedback continuously
```

Run these from inside a game directory (where `.harness/` lives).

## Plugin Options

```js
devHarness({
  port: 3001,           // WebSocket port (default: 3001)
  handler: {            // Handler process config (optional)
    cmd: 'node',
    args: ['path/to/handler.js'],
  },
})
```

## License

MIT

# Game Factory

A CLI pipeline for building 2D browser games with AI assistance. Describe a game idea, get a working Phaser 3 project with a live feedback overlay. Playtest in the browser, type feedback into the overlay, and the AI edits your code in real time. Iterate until done.

## Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) - the `claude` command must be available in your PATH

## Quick Start

```bash
cd games/
npm install
npm run new-game
```

Follow the prompts to name your game and set preferences. When it finishes, start the dev server:

```bash
cd game-003-your-name/
npm run dev
```

The game opens in your browser. Press backtick to open the feedback overlay and start talking to Claude.

## The Pipeline

1. `npm run new-game` scaffolds a Phaser 3 + Vite project with the dev harness wired in.
2. Edit `SPEC.md` in the game directory to describe what you want built.
3. Run `npm run dev` to start the dev server.
4. Press backtick (`` ` ``) to open the in-game feedback overlay.
5. Type what you want changed. Claude reads your message, edits the source files, and the browser reloads.
6. Repeat until the game is done.

## Dev Harness

The harness is an npm package at `game-002-dev-harness/`. Every scaffolded game includes it as a dependency.

What it does:

- Adds a chat overlay on top of the game (toggle with backtick)
- Captures game state (position, score, scene) and sends it with your feedback
- Routes feedback through a WebSocket to a handler (default: Claude CLI)
- Claude receives your message plus game context, edits files, and triggers a page reload

See `game-002-dev-harness/README.md` for the full protocol spec and integration guide.

## Harness Protocol (for other LLMs)

The harness uses two JSONL files in each game's `.harness/` directory:

**feedback.jsonl** - the overlay writes player feedback here:
```json
{"timestamp":"2026-04-04T15:30:00Z","message":"make the jump higher","scene":"GameScene","state":{"x":400,"y":300,"score":42}}
```

**responses.jsonl** - your handler writes responses here, and the overlay displays them:
```json
{"message":"Jump height increased from 300 to 450.","status":"done"}
```

Response statuses: `ack` (gray), `response` (blue), `done` (green), `error` (red).

Any tool that reads feedback.jsonl, modifies the game source, and writes to responses.jsonl will work. The Claude handler at `game-002-dev-harness/src/handlers/claude.js` is the reference implementation.

## Commands

```bash
npm run new-game           # Create a new game (interactive wizard)
npm run list               # List all games from HISTORY.md
npm run dev                # Start dev server for the latest game
node factory.js dev NAME   # Start dev server for a specific game
```

## Configuration

`factory-config.json` controls factory behavior:

| Key | Values | Default | Effect |
|-----|--------|---------|--------|
| `planning_mode` | surprise, quick, directed, roundtable | quick | How much planning before building |
| `input_method` | keyboard, touch, both | both | What input code gets scaffolded |
| `show_wizard` | true, false | true | Whether to show the setup wizard on next new-game |
| `template` | phaser-vite | phaser-vite | Project template to use |
| `ship_target` | itch.io | itch.io | Target platform for publishing |
| `prototype_art` | placeholder-only | placeholder-only | Art style during prototyping |

## Directory Structure

```
games/
  factory.js              CLI entry point
  factory-config.json     User preferences
  HISTORY.md              Log of every game created
  LEARNINGS.md            Cross-game knowledge (framework quirks, patterns)
  shared-assets/          Reusable sprites, sounds, fonts across games
  templates/              Project templates (phaser-vite is built into factory.js)
  game-001-pulse-dodge/   Example game - arcade dodger
  game-002-dev-harness/   Dev harness npm package
  game-NNN-your-game/     Your games go here
```

Each game is a standalone Vite + Phaser 3 project:

```
game-NNN-name/
  package.json       Dependencies and scripts
  vite.config.js     Vite config with harness plugin
  index.html         Entry HTML
  SPEC.md            Game design spec
  src/
    main.js          Phaser game init + harness setup
    scenes/
      GameScene.js
      GameOverScene.js
  public/            Static assets
  .harness/          Feedback/response JSONL files (gitignored)
```

## Troubleshooting

**PowerShell vs bash:** All commands use standard npm scripts. Works in PowerShell, CMD, bash, or any terminal.

**Port conflicts:** The game runs on Vite's default port (usually 5173). The harness WebSocket uses port 3001. If 3001 is in use, the harness prints a warning and runs without the live feedback loop. Kill the other process or change the port in `vite.config.js`.

**Claude not found:** Make sure `claude` is in your PATH. Run `claude --version` to verify. Install from https://docs.anthropic.com/en/docs/claude-code.

**HMR triggers too many reloads:** The harness suppresses hot reloads while Claude is working and does one controlled reload when changes are done. If you see cascade reloads, check that `.harness/` is in the `server.watch.ignored` list in `vite.config.js`.

## License

MIT

# Game Factory Learnings

Cross-game knowledge that accumulates as you build. Update after every game with what worked and what broke.

## Mechanics

- Expanding ring obstacles with angular gap detection work well for survival games. Radial + angular collision is more satisfying than rectangle overlap for circular patterns.
- Difficulty ramp via multiple axes (segment count, gap ratio, speed, spawn interval) feels natural. Tune one axis at a time for easier debugging.

## Framework Quirks (Phaser 3 + Vite)

- Phaser 3 + Vite works out of the box. Chunk Phaser separately in vite.config.js (manualChunks) for faster rebuilds.
- Phaser.Scale.FIT + CENTER_BOTH handles responsive sizing with no extra work.
- Touch input: use pointer events directly (pointerdown/move/up) instead of Phaser's built-in touch zones. Simpler and more reliable.
- Vite HMR does full page reloads for Phaser scenes, not hot module replacement. This kills game state and overlay connections.
- Harness files (.harness/) must be excluded from Vite's file watcher or they trigger reload loops. Add to server.watch.ignored in vite.config.js.
- When the auto-handler is active, suppress HMR during the build. Only trigger one reload after the handler finishes. Otherwise every file save causes a cascade of reloads.
- WebSocket connections need shell: false in spawn options on Windows to avoid deprecation warnings.

## Asset Sources

Nothing yet. Game 001 used only procedural drawing (rectangles, arcs, solid fills) and procedural audio (Web Audio API).

## Dev Harness

- The harness is an npm package at game-002-dev-harness. Link it with "game-dev-harness": "file:../game-002-dev-harness" in package.json.
- Protocol: feedback.jsonl (overlay writes) and responses.jsonl (handler writes). Any LLM or tool can plug in by reading/writing those files.
- Response statuses: "ack" (gray), "response" (blue), "done" (green), "error" (red).
- The Claude handler at src/handlers/claude.js sends prompts via stdin to claude --print --dangerously-skip-permissions.
- The overlay is an HTML/CSS DOM layer, not rendered in the Phaser canvas. Toggled with backtick.
- Keyboard input in the overlay must stopPropagation so the game does not receive keypresses while typing.

## Dev Knobs

- For numeric tuning (speed, gravity, spawn rate, etc.), direct slider controls in the overlay are far more efficient than asking the AI to recode values. A registerKnob API lets games expose tunable parameters, and the player adjusts them in real time without any reload. This is the highest-ROI dev harness feature after the chat itself.
- Knob values persist in sessionStorage so they survive hot reloads. On startup, saved values are applied via callbacks before the first frame.
- Cap at 10 knobs per game. More than that means the game needs config categories, not more sliders.

## Reuse and Extraction

- Every system you build (economy, dialogue, scoring, physics tuning) is a candidate for extraction into shared-assets/ or templates/. Break it into modular parts that drop into other games.
- Extraction trigger: "Is this the second time I've built this?" If yes, pull it out. If no, build it inline and move on.
- Don't build dev tooling or abstractions for a game that hasn't proven its core mechanic yet. A game at the "is this fun?" stage doesn't need a level editor.
- Automate cheapest-first. Cost ladder: simple code (free) -> templates/scaffolds (low) -> AI-generated (medium) -> human dev time (high). Only escalate when the cheaper tier can't do the job.
- Track what you've built in HISTORY.md with enough detail that future games can grep for reusable parts.

## Anti-Patterns

- Do not add visual polish during the prototype phase. Boxes and arcs are enough to validate a core mechanic.
- Do not over-scope the spec. One mechanic, one enemy pattern, one win condition is enough for a playable prototype.
- Do not let harness file writes trigger Vite HMR. Exclude .harness/ from the file watcher.
- Do not allow HMR during an active handler build. Suppress it and do one reload at the end.

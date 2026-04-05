import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, 'factory-config.json');
const HISTORY_PATH = resolve(__dirname, 'HISTORY.md');

const loadConfig = () => JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const saveConfig = (c) => writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2) + '\n', 'utf8');
const ask = (rl, q) => new Promise((res) => rl.question(q, res));
const pad = (n) => String(n).padStart(3, '0');
const today = () => new Date().toISOString().slice(0, 10);
const write = (dir, file, content) => writeFileSync(resolve(dir, file), content, 'utf8');

function getNextGameNumber() {
  const nums = readdirSync(__dirname)
    .filter(d => /^game-\d{3}-/.test(d))
    .map(d => parseInt(d.slice(5, 8), 10));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

async function runWizard(rl, config) {
  console.log('\n=== Game Factory Setup ===\n');
  const mode = await ask(rl, 'Planning mode? [surprise/quick/directed/roundtable] (quick): ');
  config.planning_mode = mode.trim() || 'quick';
  const input = await ask(rl, 'Input method? [keyboard/touch/both] (both): ');
  config.input_method = input.trim() || 'both';
  const showNext = await ask(rl, 'Show this wizard next time? [y/n] (y): ');
  config.show_wizard = (showNext.trim().toLowerCase() || 'y') !== 'n';
  saveConfig(config);
  console.log('Config saved.\n');
}

function scaffoldGame(gameDir, name, num, config) {
  for (const d of ['', 'src', 'src/scenes', 'public', '.harness'])
    mkdirSync(resolve(gameDir, d), { recursive: true });

  write(gameDir, '.harness/feedback.jsonl', '');
  write(gameDir, '.harness/responses.jsonl', '');

  write(gameDir, 'package.json', JSON.stringify({
    name, version: '1.0.0', description: '', type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dependencies: { phaser: '^3.80.1', 'game-dev-harness': 'file:../game-002-dev-harness' },
    devDependencies: { vite: '^5.4.0' }
  }, null, 2) + '\n');

  write(gameDir, 'vite.config.js', `import { defineConfig } from 'vite';
import { devHarness } from 'game-dev-harness';

export default defineConfig({
  plugins: [devHarness({
    handler: { cmd: 'node', args: ['node_modules/game-dev-harness/src/handlers/claude.js'] },
  })],
  base: './',
  build: {
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } }
  },
  server: {
    open: true,
    watch: { ignored: ['**/.harness/**'] }
  }
});
`);

  write(gameDir, 'index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <title>${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0f; }
    canvas { display: block; margin: 0 auto; }
  </style>
</head>
<body>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
`);

  write(gameDir, 'src/main.js', `import Phaser from 'phaser';
import { initHarness } from 'game-dev-harness/client';
import { GameScene } from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

const config = {
  type: Phaser.AUTO, width: 800, height: 600, backgroundColor: '#0a0a0f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene, GameOverScene],
  physics: { default: 'arcade', arcade: { debug: false } },
  input: { activePointers: 2 }
};

const game = new Phaser.Game(config);
const harness = initHarness(game);
harness.registerState(() => {
  const scene = game.scene.getScene('GameScene');
  if (!scene || !scene.player) return {};
  return { x: scene.player.x, y: scene.player.y, score: scene.score };
});
window.__harness = harness;
`);

  const touch = config.input_method !== 'keyboard' ? `
    this.touchActive = false;
    this.touchStart = { x: 0, y: 0 };
    this.input.on('pointerdown', (p) => {
      this.touchActive = true;
      this.touchStart.x = p.x; this.touchStart.y = p.y;
    });
    this.input.on('pointermove', (p) => {
      if (!this.touchActive) return;
      const dx = p.x - this.touchStart.x, dy = p.y - this.touchStart.y;
      if (Math.abs(dx) > 10) this.player.x += dx > 0 ? speed : -speed;
      if (Math.abs(dy) > 10) this.player.y += dy > 0 ? speed : -speed;
      this.touchStart.x = p.x; this.touchStart.y = p.y;
    });
    this.input.on('pointerup', () => { this.touchActive = false; });` : '';

  write(gameDir, 'src/scenes/GameScene.js', `import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.score = 0;
    const speed = 4;
    this.player = this.add.rectangle(400, 300, 24, 24, 0x00ff88);
    this.physics.add.existing(this.player);
    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffffff'
    });
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });
${touch}
    this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => { this.score++; this.scoreText.setText('Score: ' + this.score); }
    });
  }

  update() {
    const speed = 4, b = this.player;
    if (this.cursors.left.isDown || this.wasd.left.isDown) b.x -= speed;
    if (this.cursors.right.isDown || this.wasd.right.isDown) b.x += speed;
    if (this.cursors.up.isDown || this.wasd.up.isDown) b.y -= speed;
    if (this.cursors.down.isDown || this.wasd.down.isDown) b.y += speed;
    b.x = Phaser.Math.Clamp(b.x, 12, 788);
    b.y = Phaser.Math.Clamp(b.y, 12, 588);
  }
}
`);

  write(gameDir, 'src/scenes/GameOverScene.js', `import Phaser from 'phaser';

export class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOverScene' }); }
  init(data) { this.finalScore = data.score || 0; }

  create() {
    const cx = this.cameras.main.centerX, cy = this.cameras.main.centerY;
    this.add.text(cx, cy - 80, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '48px', color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(cx, cy, 'Score: ' + this.finalScore, {
      fontFamily: 'monospace', fontSize: '32px', color: '#aaaaaa'
    }).setOrigin(0.5);
    this.add.text(cx, cy + 60, 'Press SPACE or tap to restart', {
      fontFamily: 'monospace', fontSize: '18px', color: '#666666'
    }).setOrigin(0.5);
    this.canRestart = false;
    this.time.delayedCall(400, () => { this.canRestart = true; });
    this.input.keyboard.on('keydown-SPACE', () => { if (this.canRestart) this.scene.start('GameScene'); });
    this.input.on('pointerdown', () => { if (this.canRestart) this.scene.start('GameScene'); });
  }
}
`);

  write(gameDir, 'SPEC.md', `# ${name}\n\nGame #${pad(num)} - Created ${today()}\n
## Core Mechanic\n\n(Describe the core mechanic here)\n
## Controls\n\n- Arrow keys / WASD to move\n- Touch: drag anywhere to move\n
## Win/Lose Condition\n\n(Define when the player wins or loses)\n
## Difficulty Ramp\n\n(How does it get harder over time?)\n`);
}

function appendHistory(num, name) {
  const line = `| ${pad(num)} | ${name} | TBD | ${today()} | Scaffolded | localhost |\n`;
  let content = readFileSync(HISTORY_PATH, 'utf8');
  writeFileSync(HISTORY_PATH, content.trimEnd() + '\n' + line, 'utf8');
}

async function cmdNew() {
  const config = loadConfig();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (config.show_wizard) await runWizard(rl, config);
    const num = getNextGameNumber();
    let name;
    if (config.planning_mode === 'surprise') {
      const pool = ['neon-drift','hex-swarm','void-dash','pixel-rain','star-fall',
        'wave-rider','grid-lock','bit-storm','flare-run','cube-spin'];
      name = pool[Math.floor(Math.random() * pool.length)];
      console.log(`Surprise mode picked: ${name}`);
    } else {
      name = (await ask(rl, 'Game name? (lowercase-with-dashes): ')).trim().toLowerCase().replace(/\s+/g, '-');
      if (!name) { console.error('Name required.'); process.exit(1); }
    }
    const dirName = `game-${pad(num)}-${name}`;
    const gameDir = resolve(__dirname, dirName);
    if (existsSync(gameDir)) { console.error(`Directory ${dirName} already exists.`); process.exit(1); }
    console.log(`\nCreating ${dirName}...`);
    scaffoldGame(gameDir, name, num, config);
    console.log('Running npm install...');
    execSync('npm install', { cwd: gameDir, stdio: 'inherit' });
    appendHistory(num, name);
    console.log(`\nGame ready. Run:\n  cd ${dirName} && npm run dev`);
  } finally { rl.close(); }
}

function cmdList() {
  console.log(readFileSync(HISTORY_PATH, 'utf8'));
}

function cmdDev() {
  const target = process.argv[3];
  let gameDir;
  if (target) {
    const dirs = readdirSync(__dirname).filter(d => /^game-\d{3}-/.test(d) && d.includes(target));
    if (!dirs.length) { console.error(`No game matching "${target}".`); process.exit(1); }
    gameDir = resolve(__dirname, dirs[dirs.length - 1]);
  } else {
    const dirs = readdirSync(__dirname)
      .filter(d => /^game-\d{3}-/.test(d) && d !== 'game-002-dev-harness').sort();
    if (!dirs.length) { console.error('No game directories found.'); process.exit(1); }
    gameDir = resolve(__dirname, dirs[dirs.length - 1]);
  }
  console.log(`Starting dev server in ${gameDir}...`);
  execSync('npx vite', { cwd: gameDir, stdio: 'inherit' });
}

const command = process.argv[2];
switch (command) {
  case 'new': cmdNew(); break;
  case 'list': cmdList(); break;
  case 'dev': cmdDev(); break;
  default:
    console.log('Game Factory - scaffold and run Phaser 3 games with a live AI feedback loop\n');
    console.log('Usage:');
    console.log('  node factory.js new          Create a new game project');
    console.log('  node factory.js list         List all games from HISTORY.md');
    console.log('  node factory.js dev          Start dev server (latest game)');
    console.log('  node factory.js dev <name>   Start dev server for a specific game');
    console.log('');
    console.log('Or use npm scripts:');
    console.log('  npm run new-game');
    console.log('  npm run list');
    console.log('  npm run dev');
}

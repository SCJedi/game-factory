import Phaser from 'phaser';
import { initHarness } from 'game-dev-harness/client';
import { GameScene } from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#0a0a0f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [GameScene, GameOverScene],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false
    }
  },
  input: {
    activePointers: 2
  }
};

const game = new Phaser.Game(config);

const harness = initHarness(game);
harness.registerState(() => {
  const scene = game.scene.getScene('GameScene');
  if (!scene || scene.dead) return {};
  return {
    x: scene.player.x,
    y: scene.player.y,
    score: scene.score,
    gameTime: scene.gameTime,
  };
});

window.__harness = harness;

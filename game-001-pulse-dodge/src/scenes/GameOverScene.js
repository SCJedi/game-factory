import Phaser from 'phaser';
import { AudioManager } from '../audio.js';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data) {
    this.finalScore = data.score || 0;
  }

  create() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    this.add.text(cx, cy - 80, 'GAME OVER', {
      fontFamily: 'monospace',
      fontSize: '48px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(cx, cy, `Score: ${this.finalScore}`, {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#aaaaaa'
    }).setOrigin(0.5);

    this.add.text(cx, cy + 60, 'Press SPACE or tap to restart', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#666666'
    }).setOrigin(0.5);

    this.gameOverAudio = new AudioManager();
    if (this.gameOverAudio.init()) {
      this.gameOverAudio.playGameOver();
    }

    this.canRestart = false;
    this.time.delayedCall(400, () => {
      this.canRestart = true;
    });

    this.input.keyboard.on('keydown-SPACE', () => {
      if (!this.canRestart) return;
      if (this.gameOverAudio) this.gameOverAudio.stop();
      this.scene.start('GameScene');
    });

    this.input.on('pointerdown', () => {
      if (!this.canRestart) return;
      if (this.gameOverAudio) this.gameOverAudio.stop();
      this.scene.start('GameScene');
    });
  }
}

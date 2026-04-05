import Phaser from 'phaser';
import { AudioManager } from '../audio.js';

// Ring segment: an arc obstacle that expands outward
class RingSegment {
  constructor(scene, startAngle, endAngle, radius, color, thickness) {
    this.scene = scene;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.radius = radius;
    this.color = color;
    this.thickness = thickness;
    this.alive = true;
  }
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    const { width, height } = this.cameras.main;
    this.cx = width / 2;
    this.cy = height / 2;

    // Player setup
    this.player = this.add.rectangle(this.cx, this.cy + 150, 16, 16, 0xffffff);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });

    // Touch joystick state
    this.joystick = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };
    this.setupTouchControls();

    // Ring system
    this.rings = [];
    this.ringGraphics = this.add.graphics();
    this.waveTimer = 0;
    this.waveInterval = 2000;  // ms between waves
    this.gameTime = 0;
    this.score = 0;
    this.hue = 0;
    this.playerSpeed = 280;
    this.dead = false;
    this.nearMissCooldown = 0;
    this.lastMilestone = 0;

    // Shield power-up
    this.hasShield = false;
    this.shieldPickup = false;
    this.shieldSpawnTimer = 5000;
    this.shatterParticles = [];

    // Unicorn power-up
    this.unicornPickup = null; // {x, y} when spawned
    this.ridingUnicorn = false;
    this.unicornTimer = 0;
    this.unicornDuration = 5000; // ms the slow effect lasts
    this.unicornSlowFactor = 0.35; // rings move at 35% speed
    this.unicornSpawnTimer = 8000 + Math.random() * 4000;

    // Dad slow power-up
    this.dadSlowPickup = null;
    this.dadSlowed = false;
    this.dadSlowTimer = 0;
    this.dadSlowDuration = 5000;
    this.dadSlowFactor = 0.35;
    this.dadSlowSpawnTimer = 15000 + Math.random() * 5000;

    // Dad chaser
    this.dad = { x: this.cx, y: this.cy };
    this.dadSpeed = 90;
    this.dadTimer = 0;
    this.dadDeathPhase = false;
    this.dadDeathClock = 0;
    this.dadSparkles = [];
    this.dadWobble = 0;
    this.dadBabies = [];
    this.dadBabyTimer = 0;
    this.dadLabel = this.add.text(this.cx, this.cy - 30, 'DAD', {
      fontFamily: 'Impact, monospace',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffcc00'
    }).setOrigin(0.5, 1).setDepth(10);
    this.dadActive = true;
    this.dadGoneTimer = 0;

    // HUD
    this.scoreText = this.add.text(width / 2, 20, 'Score: 0', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#ffffff'
    }).setOrigin(0.5, 0);

    // Audio
    this.audio = new AudioManager();
    this.audio.init();

    // Spawn the first wave immediately
    this.spawnWave();
  }

  setupTouchControls() {
    this.input.on('pointerdown', (pointer) => {
      if (this.dead) return;
      this.joystick.active = true;
      this.joystick.startX = pointer.x;
      this.joystick.startY = pointer.y;
      this.joystick.dx = 0;
      this.joystick.dy = 0;
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.joystick.active || this.dead) return;
      this.joystick.dx = pointer.x - this.joystick.startX;
      this.joystick.dy = pointer.y - this.joystick.startY;
    });

    this.input.on('pointerup', () => {
      this.joystick.active = false;
      this.joystick.dx = 0;
      this.joystick.dy = 0;
    });
  }

  spawnWave() {
    this.audio.playSpawn();

    const elapsed = this.gameTime / 1000;
    const segmentCount = Math.min(12, 4 + Math.floor(elapsed / 8));
    const gapRatio = Math.max(0.15, 0.4 - elapsed * 0.008);
    const speed = Math.min(220, 80 + elapsed * 3.5);
    const thickness = 10;

    // Pick color from shifting hue
    const color = Phaser.Display.Color.HSLToColor(this.hue / 360, 0.8, 0.55).color;

    const totalArc = Math.PI * 2;
    const segmentArc = totalArc / segmentCount;
    const gapArc = segmentArc * gapRatio;
    const solidArc = segmentArc - gapArc;

    // Place one gap near the player so the wave is always dodgeable
    const pdx = this.player.x - this.cx;
    const pdy = this.player.y - this.cy;
    let playerAngle = Math.atan2(pdy, pdx);
    if (playerAngle < 0) playerAngle += totalArc;

    // Pick which gap slot should face the player, then offset the ring so that gap lands there
    const safeSlot = Math.floor(Math.random() * segmentCount);
    const gapCenter = safeSlot * segmentArc + solidArc + gapArc / 2;
    const offset = playerAngle - gapCenter + (Math.random() - 0.5) * gapArc * 0.4;

    for (let i = 0; i < segmentCount; i++) {
      const start = offset + i * segmentArc;
      const end = start + solidArc;
      const segment = new RingSegment(this, start, end, 20, color, thickness);
      segment.speed = speed;
      this.rings.push(segment);
    }
  }

  update(time, delta) {
    if (this.dadDeathPhase) {
      this.dadDeathClock += delta;
      this.updateDadDeath(delta);
      return;
    }

    if (this.dead) return;

    this.gameTime += delta;
    this.score = Math.floor(this.gameTime / 100);
    this.scoreText.setText(`Score: ${this.score}`);

    // Music intensity tracks game state
    const timeIntensity = Math.min(1, this.gameTime / 60000);
    const ringDensity = Math.min(1, this.rings.length / 40);
    this.audio.setIntensity(timeIntensity * 0.6 + ringDensity * 0.4);

    // Score milestone chime every 100 points
    const milestone = Math.floor(this.score / 100);
    if (milestone > this.lastMilestone) {
      this.lastMilestone = milestone;
      this.audio.playMilestone();
    }

    this.nearMissCooldown -= delta;

    // Shield pickup spawning
    this.shieldSpawnTimer -= delta;
    if (this.shieldSpawnTimer <= 0 && !this.shieldPickup && !this.hasShield) {
      this.shieldPickup = true;
      this.shieldSpawnTimer = 10000 + Math.random() * 5000;
    }

    // Shield pickup collection
    if (this.shieldPickup) {
      const sdx = this.player.x - this.cx;
      const sdy = this.player.y - this.cy;
      if (Math.sqrt(sdx * sdx + sdy * sdy) < 30) {
        this.shieldPickup = false;
        this.hasShield = true;
        this.audio.playShieldPickup();
      }
    }

    // Unicorn pickup spawning
    this.unicornSpawnTimer -= delta;
    if (this.unicornSpawnTimer <= 0 && !this.unicornPickup && !this.ridingUnicorn) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 120;
      this.unicornPickup = {
        x: this.cx + Math.cos(angle) * dist,
        y: this.cy + Math.sin(angle) * dist
      };
      this.unicornSpawnTimer = 12000 + Math.random() * 6000;
    }

    // Unicorn pickup collection
    if (this.unicornPickup) {
      const udx = this.player.x - this.unicornPickup.x;
      const udy = this.player.y - this.unicornPickup.y;
      if (Math.sqrt(udx * udx + udy * udy) < 24) {
        this.unicornPickup = null;
        this.ridingUnicorn = true;
        this.unicornTimer = this.unicornDuration;
      }
    }

    // Unicorn ride timer
    if (this.ridingUnicorn) {
      this.unicornTimer -= delta;
      if (this.unicornTimer <= 0) {
        this.ridingUnicorn = false;
      }
    }

    // Dad slow pickup spawning
    this.dadSlowSpawnTimer -= delta;
    if (this.dadSlowSpawnTimer <= 0 && !this.dadSlowPickup && !this.dadSlowed && this.dadActive) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 120;
      this.dadSlowPickup = {
        x: this.cx + Math.cos(angle) * dist,
        y: this.cy + Math.sin(angle) * dist
      };
      this.dadSlowSpawnTimer = 20000 + Math.random() * 10000;
    }

    // Dad slow pickup collection
    if (this.dadSlowPickup) {
      const dsx = this.player.x - this.dadSlowPickup.x;
      const dsy = this.player.y - this.dadSlowPickup.y;
      if (Math.sqrt(dsx * dsx + dsy * dsy) < 24) {
        this.dadSlowPickup = null;
        this.dadSlowed = true;
        this.dadSlowTimer = this.dadSlowDuration;
      }
    }

    // Dad slow timer
    if (this.dadSlowed) {
      this.dadSlowTimer -= delta;
      if (this.dadSlowTimer <= 0) {
        this.dadSlowed = false;
      }
    }

    // Update shatter particles
    this.updateShatterParticles(delta);

    // Shift hue over time
    this.hue = (this.hue + delta * 0.03) % 360;

    // Wave spawning with decreasing interval
    this.waveTimer += delta;
    const minInterval = 600;
    const currentInterval = Math.max(minInterval, this.waveInterval - (this.gameTime / 1000) * 30);
    if (this.waveTimer >= currentInterval) {
      this.waveTimer = 0;
      this.spawnWave();
    }

    // Player movement
    this.movePlayer(delta);

    // Update rings and check collisions
    this.updateRings(delta);

    // Dad return cycle
    if (!this.dadActive) {
      this.dadGoneTimer += delta;
      if (this.dadGoneTimer >= 100000) {
        this.dadActive = true;
        this.dadGoneTimer = 0;
        this.dadTimer = 0;
        this.dad.x = this.cx;
        this.dad.y = this.cy;
        this.dadBabies = [];
        this.dadLabel.setVisible(true);
      }
    }

    // Dad chaser movement (accelerates over time, with slight prediction)
    if (this.dadActive) {
      this.dadWobble += delta * 0.008;
      const chaseProgress = Math.min(1, this.dadTimer / 20000);
      const speedMul = this.dadSlowed ? this.dadSlowFactor : 1;
      const currentDadSpeed = (this.dadSpeed + chaseProgress * 70) * speedMul;
      const dadDx = this.player.x - this.dad.x;
      const dadDy = this.player.y - this.dad.y;
      const dadDist = Math.sqrt(dadDx * dadDx + dadDy * dadDy);
      if (dadDist > 5) {
        const lead = 0.18 + chaseProgress * 0.12;
        const targetX = this.player.x + this.player.body.velocity.x * lead;
        const targetY = this.player.y + this.player.body.velocity.y * lead;
        const ldx = targetX - this.dad.x;
        const ldy = targetY - this.dad.y;
        const ldist = Math.sqrt(ldx * ldx + ldy * ldy);
        this.dad.x += (ldx / ldist) * currentDadSpeed * (delta / 1000);
        this.dad.y += (ldy / ldist) * currentDadSpeed * (delta / 1000);
      }
      const { width, height } = this.cameras.main;
      this.dad.x = Phaser.Math.Clamp(this.dad.x, 24, width - 24);
      this.dad.y = Phaser.Math.Clamp(this.dad.y, 38, height - 24);
      this.dadLabel.setPosition(this.dad.x, this.dad.y - 30);

      // Spawn tiny babies from dad
      this.dadBabyTimer += delta;
      if (this.dadBabyTimer > 600) {
        this.dadBabyTimer = 0;
        const angle = Math.random() * Math.PI * 2;
        this.dadBabies.push({
          x: this.dad.x,
          y: this.dad.y + 10,
          vx: Math.cos(angle) * (30 + Math.random() * 40),
          vy: Math.sin(angle) * (30 + Math.random() * 40) - 20,
          life: 2.0,
          wobble: Math.random() * Math.PI * 2
        });
      }

      if (dadDist < 20) {
        this.startDadDeath();
        return;
      }
      this.dadTimer += delta;
      if (this.dadTimer >= 20000) {
        this.dadActive = false;
        this.dadGoneTimer = 0;
        this.dadLabel.setVisible(false);
        this.dadBabies = [];
      }
    }

    // Update babies
    const bdt = delta / 1000;
    for (let i = this.dadBabies.length - 1; i >= 0; i--) {
      const b = this.dadBabies[i];
      b.x += b.vx * bdt;
      b.y += b.vy * bdt;
      b.vy += 30 * bdt;
      b.wobble += delta * 0.01;
      b.life -= bdt;
      if (b.life <= 0) this.dadBabies.splice(i, 1);
    }

    // Draw rings
    this.drawRings();
  }

  movePlayer(delta) {
    const body = this.player.body;
    let vx = 0;
    let vy = 0;

    // Keyboard
    if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) vx = 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) vy = 1;

    // Touch joystick
    if (this.joystick.active) {
      const deadzone = 10;
      const maxDist = 80;
      const dist = Math.sqrt(this.joystick.dx ** 2 + this.joystick.dy ** 2);
      if (dist > deadzone) {
        const strength = Math.min(dist / maxDist, 1);
        vx = (this.joystick.dx / dist) * strength;
        vy = (this.joystick.dy / dist) * strength;
      }
    }

    // Normalize diagonal movement
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > 0) {
      vx = (vx / mag) * this.playerSpeed;
      vy = (vy / mag) * this.playerSpeed;
    }

    body.setVelocity(vx, vy);
  }

  updateRings(delta) {
    const px = this.player.x;
    const py = this.player.y;
    const playerHalf = 8;
    const maxRadius = Math.max(this.cameras.main.width, this.cameras.main.height);
    let nearMiss = false;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const seg = this.rings[i];
      const speedMul = this.ridingUnicorn ? this.unicornSlowFactor : 1;
      seg.radius += seg.speed * speedMul * (delta / 1000);

      if (seg.radius > maxRadius + 50) {
        this.rings.splice(i, 1);
        continue;
      }

      const dx = px - this.cx;
      const dy = py - this.cy;
      const distToCenter = Math.sqrt(dx * dx + dy * dy);
      const halfThick = seg.thickness / 2;

      if (distToCenter + playerHalf > seg.radius - halfThick &&
          distToCenter - playerHalf < seg.radius + halfThick) {
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += Math.PI * 2;

        let sa = seg.startAngle % (Math.PI * 2);
        let ea = seg.endAngle % (Math.PI * 2);
        if (sa < 0) sa += Math.PI * 2;
        if (ea < 0) ea += Math.PI * 2;

        const playerAngularHalf = distToCenter > 0
          ? Math.atan2(playerHalf, distToCenter)
          : Math.PI;

        if (this.anglesOverlap(angle - playerAngularHalf, angle + playerAngularHalf, sa, ea)) {
          if (this.hasShield) {
            this.shatterSegment(seg, i);
            return;
          }
          this.die();
          return;
        }
        nearMiss = true;
      }
    }

    if (nearMiss && this.nearMissCooldown <= 0) {
      this.audio.playNearMiss();
      this.nearMissCooldown = 300;
    }
  }

  // Check if angular range [a1, a2] overlaps with arc [sa, ea]
  // All angles in radians, handles wrap-around
  anglesOverlap(a1, a2, sa, ea) {
    const TAU = Math.PI * 2;

    // Normalize all to [0, TAU)
    a1 = ((a1 % TAU) + TAU) % TAU;
    a2 = ((a2 % TAU) + TAU) % TAU;
    sa = ((sa % TAU) + TAU) % TAU;
    ea = ((ea % TAU) + TAU) % TAU;

    // If the segment wraps around 0
    if (ea < sa) {
      return this.rangeOverlap(a1, a2, sa, TAU) ||
             this.rangeOverlap(a1, a2, 0, ea);
    }

    // If the player angle wraps around 0
    if (a2 < a1) {
      return this.rangeOverlap(a1, TAU, sa, ea) ||
             this.rangeOverlap(0, a2, sa, ea);
    }

    return this.rangeOverlap(a1, a2, sa, ea);
  }

  rangeOverlap(lo1, hi1, lo2, hi2) {
    return lo1 < hi2 && lo2 < hi1;
  }

  drawRings() {
    this.ringGraphics.clear();

    for (const seg of this.rings) {
      this.ringGraphics.lineStyle(seg.thickness, seg.color, 0.85);
      this.ringGraphics.beginPath();
      this.ringGraphics.arc(this.cx, this.cy, seg.radius, seg.startAngle, seg.endAngle, false);
      this.ringGraphics.strokePath();
    }

    // Shield pickup at center
    if (this.shieldPickup) {
      const pulse = 0.6 + Math.sin(this.gameTime * 0.005) * 0.4;
      this.ringGraphics.fillStyle(0x00ccff, pulse);
      this.ringGraphics.fillCircle(this.cx, this.cy, 12);
      this.ringGraphics.lineStyle(2, 0x00ccff, pulse * 0.5);
      this.ringGraphics.strokeCircle(this.cx, this.cy, 20);
    }

    // Shield aura around player
    if (this.hasShield) {
      const pulse = 0.4 + Math.sin(this.gameTime * 0.008) * 0.2;
      this.ringGraphics.lineStyle(3, 0x00ccff, pulse);
      this.ringGraphics.strokeCircle(this.player.x, this.player.y, 18);
    }

    // Unicorn pickup
    if (this.unicornPickup) {
      const bob = Math.sin(this.gameTime * 0.004) * 4;
      const ux = this.unicornPickup.x;
      const uy = this.unicornPickup.y + bob;
      const pulse = 0.7 + Math.sin(this.gameTime * 0.006) * 0.3;
      // Body
      this.ringGraphics.fillStyle(0xffffff, pulse);
      this.ringGraphics.fillEllipse(ux, uy, 20, 12);
      // Head
      this.ringGraphics.fillStyle(0xffffff, pulse);
      this.ringGraphics.fillCircle(ux + 10, uy - 6, 5);
      // Horn
      this.ringGraphics.lineStyle(2, 0xffdd44, pulse);
      this.ringGraphics.beginPath();
      this.ringGraphics.moveTo(ux + 12, uy - 10);
      this.ringGraphics.lineTo(ux + 14, uy - 18);
      this.ringGraphics.strokePath();
      // Legs
      this.ringGraphics.lineStyle(1.5, 0xffffff, pulse);
      for (const lx of [-5, -2, 2, 5]) {
        this.ringGraphics.beginPath();
        this.ringGraphics.moveTo(ux + lx, uy + 6);
        this.ringGraphics.lineTo(ux + lx, uy + 12);
        this.ringGraphics.strokePath();
      }
      // Mane (pink)
      this.ringGraphics.lineStyle(2, 0xff77cc, pulse);
      this.ringGraphics.beginPath();
      this.ringGraphics.moveTo(ux + 6, uy - 8);
      this.ringGraphics.lineTo(ux + 2, uy - 4);
      this.ringGraphics.lineTo(ux - 2, uy - 7);
      this.ringGraphics.strokePath();
      // Tail
      this.ringGraphics.lineStyle(2, 0xff77cc, pulse);
      this.ringGraphics.beginPath();
      this.ringGraphics.moveTo(ux - 10, uy - 2);
      this.ringGraphics.lineTo(ux - 15, uy - 6);
      this.ringGraphics.lineTo(ux - 13, uy + 1);
      this.ringGraphics.strokePath();
      // Glow
      this.ringGraphics.lineStyle(1, 0xffaaee, pulse * 0.3);
      this.ringGraphics.strokeCircle(ux, uy, 18);
    }

    // Unicorn rider aura
    if (this.ridingUnicorn) {
      const fade = Math.min(1, this.unicornTimer / 1000);
      const pulse = 0.3 + Math.sin(this.gameTime * 0.01) * 0.15;
      // Pony under player
      const px = this.player.x;
      const py = this.player.y;
      this.ringGraphics.fillStyle(0xffffff, fade * 0.8);
      this.ringGraphics.fillEllipse(px, py + 8, 18, 10);
      // Legs running
      const legAnim = Math.sin(this.gameTime * 0.012) * 3;
      this.ringGraphics.lineStyle(1.5, 0xffffff, fade * 0.8);
      for (const lx of [-4, -1, 2, 5]) {
        this.ringGraphics.beginPath();
        this.ringGraphics.moveTo(px + lx, py + 13);
        this.ringGraphics.lineTo(px + lx + (lx < 0 ? legAnim : -legAnim), py + 18);
        this.ringGraphics.strokePath();
      }
      // Horn
      this.ringGraphics.lineStyle(2, 0xffdd44, fade);
      this.ringGraphics.beginPath();
      this.ringGraphics.moveTo(px + 8, py + 2);
      this.ringGraphics.lineTo(px + 10, py - 6);
      this.ringGraphics.strokePath();
      // Sparkle aura
      this.ringGraphics.lineStyle(2, 0xffaaee, pulse * fade);
      this.ringGraphics.strokeCircle(px, py, 22);
    }

    // Dad slow pickup (beer can)
    if (this.dadSlowPickup) {
      const bob = Math.sin(this.gameTime * 0.004) * 3;
      const bx = this.dadSlowPickup.x;
      const by = this.dadSlowPickup.y + bob;
      const pulse = 0.7 + Math.sin(this.gameTime * 0.006) * 0.3;
      this.ringGraphics.fillStyle(0xccaa00, pulse);
      this.ringGraphics.fillRect(bx - 5, by - 8, 10, 16);
      this.ringGraphics.fillStyle(0xaaaaaa, pulse);
      this.ringGraphics.fillRect(bx - 4, by - 10, 8, 3);
      this.ringGraphics.lineStyle(1.5, 0xcccccc, pulse);
      this.ringGraphics.strokeCircle(bx, by - 12, 2);
      this.ringGraphics.lineStyle(1, 0xccaa00, pulse * 0.3);
      this.ringGraphics.strokeCircle(bx, by, 16);
    }

    // Dad slow aura
    if (this.dadSlowed && this.dadActive) {
      const fade = Math.min(1, this.dadSlowTimer / 1000);
      this.ringGraphics.lineStyle(2, 0xccaa00, 0.4 * fade);
      this.ringGraphics.strokeCircle(this.dad.x, this.dad.y, 28);
    }

    // Shatter particles
    for (const p of this.shatterParticles) {
      const alpha = p.life / p.maxLife;
      this.ringGraphics.fillStyle(p.color, alpha);
      this.ringGraphics.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }

    // Draw dad
    if (this.dadActive) this.drawDad();
  }

  shatterSegment(seg, index) {
    this.hasShield = false;
    this.rings.splice(index, 1);
    this.audio.playShieldShatter();

    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const a = seg.startAngle + (seg.endAngle - seg.startAngle) * (i / steps);
      const px = this.cx + Math.cos(a) * seg.radius;
      const py = this.cy + Math.sin(a) * seg.radius;
      const speed = 80 + Math.random() * 120;
      this.shatterParticles.push({
        x: px, y: py,
        vx: Math.cos(a) * speed + (Math.random() - 0.5) * 60,
        vy: Math.sin(a) * speed + (Math.random() - 0.5) * 60,
        life: 0.6,
        maxLife: 0.6,
        color: seg.color,
        size: 3 + Math.random() * 4
      });
    }
  }

  updateShatterParticles(delta) {
    const dt = delta / 1000;
    for (let i = this.shatterParticles.length - 1; i >= 0; i--) {
      const p = this.shatterParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.shatterParticles.splice(i, 1);
      }
    }
  }

  drawDad() {
    const g = this.ringGraphics;
    const x = this.dad.x;
    const y = this.dad.y;
    const wobble = Math.sin(this.dadWobble) * 2;

    // Stubby legs (jeans blue)
    const legKick = Math.sin(this.dadWobble * 2) * 4;
    g.lineStyle(5, 0x334488, 1);
    g.beginPath();
    g.moveTo(x - 6, y + 12);
    g.lineTo(x - 6 + legKick, y + 24);
    g.strokePath();
    g.beginPath();
    g.moveTo(x + 6, y + 12);
    g.lineTo(x + 6 - legKick, y + 24);
    g.strokePath();

    // Big beer belly (white undershirt)
    g.fillStyle(0xffffff, 0.9);
    g.fillEllipse(x, y + 2, 32, 30);

    // Belly flesh poking out bottom
    g.fillStyle(0xffcc99, 0.8);
    g.fillEllipse(x, y + 12, 22, 8);

    // Arms reaching toward player
    const armWave = Math.sin(this.dadWobble * 1.5) * 5;
    g.lineStyle(3, 0xffcc99, 1);
    g.beginPath();
    g.moveTo(x - 16, y - 2);
    g.lineTo(x - 24, y - 8 + armWave);
    g.strokePath();
    g.beginPath();
    g.moveTo(x + 16, y - 2);
    g.lineTo(x + 24, y - 8 - armWave);
    g.strokePath();
    g.fillStyle(0xffcc99, 1);
    g.fillCircle(x - 24, y - 8 + armWave, 3);
    g.fillCircle(x + 24, y - 8 - armWave, 3);

    // Head
    g.fillStyle(0xffcc99, 1);
    g.fillCircle(x + wobble, y - 20, 12);

    // Three sad combover hairs
    g.lineStyle(1.5, 0x664422, 1);
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(x + i * 4 + wobble, y - 31);
      g.lineTo(x + i * 4 + wobble * 2, y - 38);
      g.strokePath();
    }

    // Angry eyebrows
    g.lineStyle(2.5, 0x553300, 1);
    g.beginPath();
    g.moveTo(x - 8 + wobble, y - 25);
    g.lineTo(x - 2 + wobble, y - 23);
    g.strokePath();
    g.beginPath();
    g.moveTo(x + 8 + wobble, y - 25);
    g.lineTo(x + 2 + wobble, y - 23);
    g.strokePath();

    // Eyes that track the player
    const eyeLook = (this.player.x > x) ? 1.5 : -1.5;
    g.fillStyle(0x000000, 1);
    g.fillCircle(x - 4 + wobble + eyeLook, y - 21, 1.5);
    g.fillCircle(x + 4 + wobble + eyeLook, y - 21, 1.5);

    // Big thick mustache
    g.fillStyle(0x553300, 1);
    g.fillEllipse(x + wobble, y - 15, 14, 5);

    // Frown
    g.lineStyle(1.5, 0xcc4444, 1);
    g.beginPath();
    g.arc(x + wobble, y - 10, 4, 0.3, Math.PI - 0.3, true);
    g.strokePath();

    // Draw tiny babies
    for (const b of this.dadBabies) {
      const alpha = Math.min(1, b.life);
      const bw = Math.sin(b.wobble) * 1.5;
      // Head
      g.fillStyle(0xffcc99, alpha);
      g.fillCircle(b.x + bw, b.y - 4, 3);
      // Body
      g.lineStyle(2, 0xffffff, alpha);
      g.beginPath();
      g.moveTo(b.x + bw, b.y - 1);
      g.lineTo(b.x + bw, b.y + 5);
      g.strokePath();
      // Arms
      g.lineStyle(1, 0xffcc99, alpha);
      g.beginPath();
      g.moveTo(b.x + bw - 3, b.y + 1);
      g.lineTo(b.x + bw + 3, b.y + 1);
      g.strokePath();
      // Legs
      g.beginPath();
      g.moveTo(b.x + bw, b.y + 5);
      g.lineTo(b.x + bw - 2, b.y + 8);
      g.strokePath();
      g.beginPath();
      g.moveTo(b.x + bw, b.y + 5);
      g.lineTo(b.x + bw + 2, b.y + 8);
      g.strokePath();
    }
  }

  startDadDeath() {
    this.dadDeathPhase = true;
    this.dadDeathClock = 0;
    this.dead = true;
    this.player.body.setVelocity(0, 0);
    this.dadSparkles = [];

    const { width, height } = this.cameras.main;

    this.cleanText = this.add.text(width + 300, height / 2 - 40, 'CLEAN YOUR ROOM', {
      fontFamily: 'Impact, monospace',
      fontSize: '72px',
      color: '#0088ff',
      fontStyle: 'bold',
      stroke: '#001a33',
      strokeThickness: 6
    }).setOrigin(0.5).setDepth(20);

    this.audio.playDeath();
  }

  updateDadDeath(delta) {
    const t = this.dadDeathClock;
    const { width, height } = this.cameras.main;
    const g = this.ringGraphics;
    g.clear();

    // Slide CLEAN YOUR ROOM in from right
    if (this.cleanText) {
      const targetX = width / 2;
      if (this.cleanText.x > targetX) {
        this.cleanText.x -= delta * 1.5;
        if (this.cleanText.x < targetX) this.cleanText.x = targetX;
      }
      this.cleanText.y = height / 2 - 40 + Math.sin(t * 0.012) * 5;
    }

    // Draw frozen rings dimmed
    for (const seg of this.rings) {
      g.lineStyle(seg.thickness, seg.color, 0.3);
      g.beginPath();
      g.arc(this.cx, this.cy, seg.radius, seg.startAngle, seg.endAngle, false);
      g.strokePath();
    }

    // Dad frozen in place
    this.drawDad();

    // Wagging finger
    if (t > 400) {
      const fx = width / 2;
      const fy = height / 2 + 80;
      const wag = Math.sin(t * 0.01) * 0.4;

      // Wrist
      g.lineStyle(10, 0xffcc99, 1);
      g.beginPath();
      g.moveTo(fx, fy + 50);
      g.lineTo(fx, fy + 16);
      g.strokePath();

      // Palm
      g.fillStyle(0xffcc99, 1);
      g.fillRoundedRect(fx - 16, fy - 4, 32, 32, 5);

      // Curled fingers
      for (let i = -1; i <= 1; i++) {
        g.fillStyle(0xeebb88, 1);
        g.fillCircle(fx + i * 9, fy + 24, 5);
      }

      // Pointing finger that wags
      const tipX = fx + Math.sin(wag) * 35;
      const tipY = fy - 48;
      g.lineStyle(12, 0xffcc99, 1);
      g.beginPath();
      g.moveTo(fx, fy - 4);
      g.lineTo(tipX, tipY);
      g.strokePath();
      g.fillStyle(0xffcc99, 1);
      g.fillCircle(tipX, tipY, 8);
    }

    // Rainbow sparkles rise from bottom
    if (t > 800) {
      const colors = [0xff0000, 0xff7700, 0xffff00, 0x00ff00, 0x0077ff, 0x8800ff, 0xff00ff];
      for (let i = 0; i < 4; i++) {
        this.dadSparkles.push({
          x: Math.random() * width,
          y: height + 10,
          size: 2 + Math.random() * 5,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1.5,
          vy: -60 - Math.random() * 100,
          vx: (Math.random() - 0.5) * 50
        });
      }
    }

    const dt = delta / 1000;
    for (let i = this.dadSparkles.length - 1; i >= 0; i--) {
      const s = this.dadSparkles[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt * 0.4;
      if (s.life <= 0) {
        this.dadSparkles.splice(i, 1);
        continue;
      }
      const twinkle = 0.5 + Math.sin(t * 0.02 + i) * 0.5;
      g.fillStyle(s.color, Math.min(1, s.life));
      g.fillCircle(s.x, s.y, s.size * twinkle);
    }

    if (t > 5000) {
      this.dadDeathPhase = false;
      this.audio.fadeOutMusic(0.3);
      this.time.delayedCall(300, () => {
        this.audio.stop();
        this.scene.start('GameOverScene', { score: this.score });
      });
    }
  }

  die() {
    this.dead = true;
    this.player.body.setVelocity(0, 0);
    this.player.fillColor = 0xff3333;

    this.audio.playDeath();
    this.audio.fadeOutMusic(0.5);

    this.time.delayedCall(600, () => {
      this.audio.stop();
      this.scene.start('GameOverScene', { score: this.score });
    });
  }
}

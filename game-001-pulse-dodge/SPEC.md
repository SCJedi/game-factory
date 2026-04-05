# Pulse Dodge

A minimal arcade survival game built with Phaser 3.

## Concept

You control a small white square on a dark field. Waves of colored rings
pulse outward from the center of the screen in expanding circles. Each ring
has gaps you can slip through. Your job is to survive as long as possible
by weaving between the gaps.

## Mechanics

- **Movement**: WASD or arrow keys on desktop. Virtual joystick on mobile
  (touch and drag anywhere on the left half of the screen).
- **Obstacles**: Rings expand outward from the center at increasing speed.
  Each ring is a segmented circle with gaps. Over time, rings arrive faster
  and gaps shrink.
- **Collision**: One hit kills you. The game ends immediately.
- **Scoring**: Score increases continuously with time survived. Displayed
  top-center during play.
- **Restart**: Press Space or tap the screen on the Game Over screen.

## Visuals

Dark background (#0a0a0f). White player square. Rings shift hue over time
using HSL color cycling, creating a smooth rainbow effect as the game
progresses. No sprites, no images -- geometry only.

## Tech

- Phaser 3 (ES module import)
- Vite dev server and bundler
- No external assets required

import { defineConfig } from 'vite';
import { devHarness } from 'game-dev-harness';

export default defineConfig({
  plugins: [devHarness({
    handler: {
      cmd: 'node',
      args: ['node_modules/game-dev-harness/src/handlers/claude.js'],
    },
  })],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    watch: {
      ignored: ['**/.harness/**']
    }
  }
});

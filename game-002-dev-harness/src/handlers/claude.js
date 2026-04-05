#!/usr/bin/env node

// Claude Code handler for the dev harness.
// Receives feedback as JSON on stdin, sends it to claude CLI via stdin.

import { spawn } from 'child_process';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const feedback = JSON.parse(input);
  const projectRoot = feedback.projectRoot;
  const message = feedback.message;
  const scene = feedback.scene || 'unknown';
  const state = feedback.state ? JSON.stringify(feedback.state) : 'none';

  process.stderr.write('Thinking...\n');

  const prompt = [
    `You are modifying a Phaser 3 browser game in this directory.`,
    `The player is in scene "${scene}" with state: ${state}.`,
    `Player feedback: "${message}"`,
    '',
    'Read the relevant game source files, then make the requested changes.',
    'Be minimal. Only change what was asked for.',
    'No emojis, no em-dashes, no AI-style comments in code.',
    'When done, print a one-line summary of what you changed.',
  ].join('\n');

  // Spawn claude with prompt on stdin. No -p flag, no shell escaping issues.
  const proc = spawn('claude', ['--print', '--dangerously-skip-permissions'], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });

  proc.stdin.write(prompt);
  proc.stdin.end();

  let stdout = '';

  proc.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text && !text.includes('DEP0190') && !text.includes('DeprecationWarning')) {
      process.stderr.write(text + '\n');
    }
  });

  proc.on('close', (code) => {
    if (code === 0) {
      const lines = stdout.trim().split('\n');
      const summary = lines[lines.length - 1] || 'Changes applied.';
      process.stdout.write(summary + '\n');
    } else {
      process.stderr.write(`Claude exited with code ${code}\n`);
      process.exit(code || 1);
    }
  });

  proc.on('error', (err) => {
    process.stderr.write(`Failed to start claude: ${err.message}\n`);
    process.exit(1);
  });
});

#!/usr/bin/env node

// Claude Code handler for the dev harness.
// Long-running process: reads JSON lines on stdin, writes JSON lines on stdout.
// Protocol:
//   stdin:  {"type":"feedback","message":"...","scene":"...","state":{...},"projectRoot":"..."}
//           {"type":"confirm"}
//           {"type":"revise","message":"..."}
//   stdout: {"type":"plan","message":"..."}
//           {"type":"progress","message":"..."}
//           {"type":"done","message":"..."}
//           {"type":"error","message":"..."}

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin });

let projectRoot = '';
let currentScene = '';
let currentState = '';
let currentPlan = '';

function sendLine(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function runClaude(prompt, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', '--dangerously-skip-permissions'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    proc.stdin.write(prompt);
    proc.stdin.end();

    let stdout = '';

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      // Stream partial output as progress
      const trimmed = text.trim();
      if (trimmed) {
        sendLine({ type: 'progress', message: trimmed });
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text && !text.includes('DEP0190') && !text.includes('DeprecationWarning')) {
        sendLine({ type: 'progress', message: text });
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Claude exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start claude: ${err.message}`));
    });
  });
}

function buildPlanPrompt(message, scene, state) {
  return [
    `You are reviewing a Phaser 3 browser game in this directory.`,
    `The player is in scene "${scene}" with state: ${state}.`,
    `Player feedback: "${message}"`,
    '',
    'Read the relevant game source files. Propose what you would change to address the feedback.',
    'List the files you would modify and describe each change clearly.',
    'Do NOT edit any files yet. Just output the plan.',
    'Be minimal. Only propose changes that address the feedback.',
    'No emojis, no em-dashes, no AI-style fluff.',
  ].join('\n');
}

function buildExecutePrompt(plan) {
  return [
    `You are modifying a Phaser 3 browser game in this directory.`,
    '',
    `Execute the following plan. Make all the changes now:`,
    '',
    plan,
    '',
    'Be minimal. Only change what the plan specifies.',
    'No emojis, no em-dashes, no AI-style comments in code.',
    'When done, print a one-line summary of what you changed, then a second line starting with "Test:" describing what to check.',
  ].join('\n');
}

async function handleFeedback(msg) {
  projectRoot = msg.projectRoot || projectRoot;
  currentScene = msg.scene || 'unknown';
  currentState = msg.state ? JSON.stringify(msg.state) : 'none';

  const planPrompt = buildPlanPrompt(msg.message, currentScene, currentState);

  try {
    const planOutput = await runClaude(planPrompt, projectRoot);
    currentPlan = planOutput;
    sendLine({ type: 'plan', message: planOutput });
  } catch (err) {
    sendLine({ type: 'error', message: err.message });
  }
}

async function handleConfirm() {
  if (!currentPlan) {
    sendLine({ type: 'error', message: 'No plan to confirm.' });
    return;
  }

  const execPrompt = buildExecutePrompt(currentPlan);

  try {
    const result = await runClaude(execPrompt, projectRoot);
    const lines = result.split('\n').filter(Boolean);
    // Take the last two meaningful lines as summary
    const summary = lines.slice(-2).join(' ').trim() || 'Changes applied.';
    sendLine({ type: 'done', message: summary });
  } catch (err) {
    sendLine({ type: 'error', message: err.message });
  }

  currentPlan = '';
}

async function handleRevise(msg) {
  const revisePrompt = [
    `You are reviewing a Phaser 3 browser game in this directory.`,
    `The player is in scene "${currentScene}" with state: ${currentState}.`,
    '',
    `You previously proposed this plan:`,
    '',
    currentPlan,
    '',
    `The player wants a revision: "${msg.message}"`,
    '',
    'Revise the plan based on this feedback. Output the full updated plan.',
    'Do NOT edit any files yet. Just output the revised plan.',
    'No emojis, no em-dashes, no AI-style fluff.',
  ].join('\n');

  try {
    const planOutput = await runClaude(revisePrompt, projectRoot);
    currentPlan = planOutput;
    sendLine({ type: 'plan', message: planOutput });
  } catch (err) {
    sendLine({ type: 'error', message: err.message });
  }
}

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (_) {
    sendLine({ type: 'error', message: 'Malformed input.' });
    return;
  }

  if (msg.type === 'feedback') {
    handleFeedback(msg);
  } else if (msg.type === 'confirm') {
    handleConfirm();
  } else if (msg.type === 'revise') {
    handleRevise(msg);
  } else {
    sendLine({ type: 'error', message: `Unknown message type: ${msg.type}` });
  }
});

rl.on('close', () => {
  process.exit(0);
});

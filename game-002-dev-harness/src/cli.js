#!/usr/bin/env node

// Harness CLI - read feedback and send responses from any tool or LLM.
//
// Usage:
//   node cli.js read              Print all unread feedback
//   node cli.js respond "message" Send a response to the overlay
//   node cli.js done "message"    Send a completion response
//   node cli.js tail              Watch for new feedback continuously
//
// The protocol is simple:
//   .harness/feedback.jsonl    Game overlay writes here (one JSON object per line)
//   .harness/responses.jsonl   Your tool writes here, overlay displays it
//
// Response statuses: "response" (blue), "done" (green), "error" (red), "ack" (gray)

import { readFileSync, appendFileSync, writeFileSync, existsSync, watchFile } from 'fs';
import { resolve } from 'path';

const harnessDir = resolve(process.cwd(), '.harness');
const feedbackPath = resolve(harnessDir, 'feedback.jsonl');
const responsesPath = resolve(harnessDir, 'responses.jsonl');
const cursorPath = resolve(harnessDir, '.read-cursor');

function getCursor() {
  if (!existsSync(cursorPath)) return 0;
  return parseInt(readFileSync(cursorPath, 'utf8').trim(), 10) || 0;
}

function setCursor(n) {
  writeFileSync(cursorPath, String(n), 'utf8');
}

function readFeedback(all = false) {
  if (!existsSync(feedbackPath)) {
    console.log('No feedback yet.');
    return;
  }
  const lines = readFileSync(feedbackPath, 'utf8').trim().split('\n').filter(Boolean);
  const cursor = all ? 0 : getCursor();

  if (cursor >= lines.length) {
    console.log('No new feedback.');
    return;
  }

  for (let i = cursor; i < lines.length; i++) {
    const entry = JSON.parse(lines[i]);
    const time = new Date(entry.timestamp).toLocaleTimeString();
    console.log(`[${time}] ${entry.message}`);
    if (entry.scene) console.log(`  scene: ${entry.scene}`);
    if (entry.state && Object.keys(entry.state).length > 0) {
      console.log(`  state: ${JSON.stringify(entry.state)}`);
    }
  }

  setCursor(lines.length);
}

function sendResponse(message, status = 'response') {
  const line = JSON.stringify({ message, status }) + '\n';
  appendFileSync(responsesPath, line, 'utf8');
  console.log(`Sent [${status}]: ${message}`);
}

function tailFeedback() {
  let lastCount = 0;
  if (existsSync(feedbackPath)) {
    lastCount = readFileSync(feedbackPath, 'utf8').trim().split('\n').filter(Boolean).length;
  }
  console.log('Watching for feedback... (Ctrl+C to stop)');

  watchFile(feedbackPath, { interval: 500 }, () => {
    const lines = readFileSync(feedbackPath, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length > lastCount) {
      for (let i = lastCount; i < lines.length; i++) {
        const entry = JSON.parse(lines[i]);
        const time = new Date(entry.timestamp).toLocaleTimeString();
        console.log(`[${time}] ${entry.message}`);
      }
      lastCount = lines.length;
    }
  });
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'read':
    readFeedback(args.includes('--all'));
    break;
  case 'respond':
    sendResponse(args.join(' '), 'response');
    break;
  case 'done':
    sendResponse(args.join(' '), 'done');
    break;
  case 'error':
    sendResponse(args.join(' '), 'error');
    break;
  case 'tail':
    tailFeedback();
    break;
  default:
    console.log('Usage: node cli.js [read|respond|done|error|tail] [message]');
}

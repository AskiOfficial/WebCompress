// Runs real browser media checks using a fresh, disposable headless Edge/Chromium profile.
// No media is uploaded. Only localhost is used by the application and this CDP harness.
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const candidateBrowsers = [
  process.env.WEBCOMPRESS_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

let browserPath = candidateBrowsers.find((p) => {
  try { return existsSync(p); } catch { return false; }
}) || candidateBrowsers[0];

const profile = resolve(tmpdir(), `webcompress-media-check-${Date.now()}`);
const port = 9400 + (process.pid % 1000);
await mkdir(profile, { recursive: true });

// Check if Vite dev server is running on localhost:5173. If not, spawn it.
let viteProcess = null;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isServerUp(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

if (!(await isServerUp('http://127.0.0.1:5173/'))) {
  console.log('Vite server not detected on http://127.0.0.1:5173, starting background preview/dev server...');
  viteProcess = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
    shell: true,
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await isServerUp('http://127.0.0.1:5173/')) {
      console.log('Local Vite server is ready on http://127.0.0.1:5173');
      break;
    }
    await pause(250);
  }
}

const browser = spawn(browserPath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required',
  'about:blank',
], { windowsHide: true, stdio: 'ignore' });

let socket;
const pending = new Map();
let id = 0;
const call = (method, params = {}) => new Promise((res, rej) => {
  const requestId = ++id;
  pending.set(requestId, { resolve: res, reject: rej });
  socket.send(JSON.stringify({ id: requestId, method, params }));
});

try {
  let pages;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      break;
    } catch {
      await pause(100);
    }
  }
  if (!pages) throw new Error('Headless browser did not start.');

  const pageTarget = pages.find((p) => p.type === 'page');
  if (!pageTarget) throw new Error('No page target found in browser.');

  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res) => socket.addEventListener('open', res, { once: true }));

  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const req = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) req?.reject(new Error(message.error.message));
      else req?.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      console.error('BROWSER ERROR', message.params.exceptionDetails);
    } else if (message.method === 'Runtime.consoleAPICalled') {
      const args = message.params.args.map((arg) => arg.value ?? arg.description).join(' ');
      if (!args.includes('table')) console.log(args);
    }
  });

  await call('Runtime.enable');

  const pagesToTest = process.argv.includes('--h265')
    ? ['h265-cpu']
    : process.argv.includes('--media')
    ? ['media-pipeline']
    : ['media-pipeline', 'h265-cpu'];

  for (const page of pagesToTest) {
    console.log(`\n========================================\nRunning browser test: ${page}\n========================================`);
    await call('Page.navigate', { url: `http://127.0.0.1:5173/tests/browser/${page}.html` });

    for (let attempt = 0; attempt < 100; attempt++) {
      const res = await call('Runtime.evaluate', {
        expression: '!!document.querySelector("#run")',
        returnByValue: true,
      });
      if (res.result.value) break;
      await pause(100);
    }

    await call('Runtime.evaluate', { expression: 'document.querySelector("#run").click()' });

    let previous = '';
    for (let attempt = 0; attempt < 600; attempt++) {
      const res = await call('Runtime.evaluate', {
        expression: 'document.querySelector("#log")?.textContent || ""',
        returnByValue: true,
      });
      const log = res.result.value;
      if (log !== previous) {
        console.log(log.slice(previous.length).trimEnd());
        previous = log;
      }
      if (log.includes('FAILED:')) throw new Error(`Browser check failed on ${page}.`);
      if (log.includes('ALL AVAILABLE CHECKS PASSED') || log.includes('ALL H.265 CPU CHECKS PASSED')) {
        console.log(`Browser verification complete for ${page}.`);
        break;
      }
      if (attempt === 599) throw new Error(`Browser checks timed out on ${page}.`);
      await pause(500);
    }
  }

  console.log('\nAll browser test suites passed successfully!');
} finally {
  if (socket?.readyState === WebSocket.OPEN) await call('Browser.close').catch(() => {});
  socket?.close();
  browser.kill();
  if (viteProcess) {
    viteProcess.kill();
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

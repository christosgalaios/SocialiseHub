/**
 * Electron dev launcher — starts API, Vite, then Electron.
 * Run with: npm run dev
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

// 1. Start the Express API server (tsx watch for HMR)
const api = spawn('node', ['node_modules/tsx/dist/cli.mjs', 'watch', 'src/index.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env },
});
children.push(api);

// 2. Start the Vite dev server for the React frontend
const client = spawn('node', ['node_modules/vite/bin/vite.js', 'client'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env },
});
children.push(client);

// 3. Build the Electron code, then launch Electron
//    Wait a couple seconds for API + Vite to be ready
console.log('\n  Building Electron main process...');
const buildElectron = spawn('node', ['node_modules/typescript/bin/tsc', '-p', 'electron/tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
});

buildElectron.on('exit', (code) => {
  if (code !== 0) {
    console.error('  Electron build failed — falling back to web-only mode');
    return;
  }

  console.log('  Waiting for servers to start...\n');
  setTimeout(() => {
    console.log('  Launching Electron...\n');
    const electron = spawn('node', ['node_modules/electron/cli.js', '.'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ELECTRON_DEV: '1' },
    });
    children.push(electron);

    electron.on('exit', () => {
      cleanup();
    });
  }, 3000);
});

function cleanup() {
  for (const child of children) {
    try { child.kill(); } catch { /* ignore */ }
  }
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

api.on('exit', (code) => {
  if (code) console.error(`API exited with code ${code}`);
  cleanup();
});

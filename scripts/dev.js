/**
 * Dev launcher — starts the API server and Vite dev server together.
 * Run with: npm run dev
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const api = spawn('node', ['node_modules/tsx/dist/cli.mjs', 'watch', 'src/index.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env },
});

const client = spawn('node', ['node_modules/vite/bin/vite.js', 'client'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env },
});

function cleanup() {
  api.kill();
  client.kill();
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

api.on('exit', (code) => {
  if (code) console.error(`API exited with code ${code}`);
  client.kill();
  process.exit(code ?? 0);
});

client.on('exit', (code) => {
  if (code) console.error(`Client exited with code ${code}`);
  api.kill();
  process.exit(code ?? 0);
});

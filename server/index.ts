import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import express from 'express';
import lockfile from 'proper-lockfile';
import { Store } from './store.js';
import { Queue } from './queue.js';
import { createApp } from './app.js';

process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be 1024–65535.');
const data = path.resolve(process.env.STUDIO_DATA_DIR || path.join(root, '.data'));
fs.mkdirSync(data, { recursive: true, mode: 0o700 });
// Acquire before opening SQLite or recovering jobs: a second window must not interrupt work.
const release = await lockfile.lock(data, { stale: 10_000, retries: 0 }).catch(() => {
  console.error(
    'This image library is already open in another studio process. Open its browser window or use a different STUDIO_DATA_DIR.',
  );
  process.exit(1);
});
const store = new Store(data);
const queue = new Queue(store);
const app = createApp(store, queue);
const http = createServer(app);
let vite: import('vite').ViteDevServer | undefined;
if (process.argv.includes('--dev')) {
  vite = await (
    await import('vite')
  ).createServer({ root, server: { middlewareMode: true, ws: { server: http } }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  if (!fs.existsSync(path.join(root, 'dist/index.html')))
    throw new Error('Build the studio first with npm run build.');
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*splat}', (_req, res) =>
    res.sendFile(path.join(root, 'dist/index.html'), { dotfiles: 'allow' }),
  );
}
http.on('error', (error) => {
  console.error(`Could not start Imagegen Studio: ${error.message}`);
  process.exit(1);
});
http.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(
    `\n  Imagegen Studio → ${url}\n  Local library   → ${data}\n  Press Ctrl+C to stop.\n`,
  );
  if (process.env.STUDIO_OPEN === '1') {
    if (process.platform === 'darwin') execFile('open', [url]);
    else if (process.platform === 'linux') execFile('xdg-open', [url]);
  }
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  http.close();
  await queue.close();
  await vite?.close();
  store.close();
  await release();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

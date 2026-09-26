import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import { requestSchema } from '../shared/schema.js';
import { Store } from './store.js';
import { Queue } from './queue.js';
import { discover } from './codex.js';
import { importImage } from './images.js';

export function createApp(store: Store, queue: Queue, connection = discover) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(host)) {
      res.status(403).json({ error: 'Localhost access only.' });
      return;
    }
    if (req.headers.origin && req.headers.origin !== `http://${host}`) {
      res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      return;
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['x-studio-request'] !== '1'
    ) {
      res.status(403).json({ error: 'Missing local studio request header.' });
      return;
    }
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
    });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  let cached: Awaited<ReturnType<typeof discover>> | undefined;
  let checkedAt = 0;
  let inFlight: Promise<Awaited<ReturnType<typeof discover>>> | undefined;
  async function health(force = false) {
    if (force || !cached || Date.now() - checkedAt > 15_000) {
      inFlight ||= connection()
        .then((value) => {
          cached = value;
          checkedAt = Date.now();
          return value;
        })
        .finally(() => {
          inFlight = undefined;
        });
      await inFlight;
    }
    return { ...cached!, dataDir: store.dir, queuePaused: queue.paused };
  }
  app.get('/api/health', async (_req, res) => {
    res.json(await health());
  });
  app.post('/api/health/refresh', async (_req, res) => {
    res.json(await health(true));
  });
  app.get('/api/library', (_req, res) => {
    res.json({
      assets: store.assets().slice(0, 1000),
      jobs: store.jobs().slice(0, 200),
      queuePaused: queue.paused,
    });
  });
  app.post('/api/jobs', async (req, res) => {
    const request = requestSchema.parse(req.body);
    const status = await health();
    if (!status.ready) {
      res.status(409).json({ error: status.reason });
      return;
    }
    res.status(202).json({ jobs: queue.add(request) });
  });
  app.post('/api/jobs/:id/cancel', (req, res) => {
    queue.cancel(z.string().uuid().parse(req.params.id));
    res.json({ ok: true });
  });
  app.post('/api/queue', (req, res) => {
    const { paused } = z.object({ paused: z.boolean() }).parse(req.body);
    queue.setPaused(paused);
    res.json({ paused });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 },
  });
  app.post('/api/references', upload.single('image'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Choose a PNG, JPEG, or WebP image.' });
      return;
    }
    try {
      res.status(201).json(
        await importImage(store, req.file.buffer, {
          kind: 'reference',
          name: path.basename(req.file.originalname).slice(0, 120),
        }),
      );
    } catch {
      res
        .status(400)
        .json({ error: 'Use a valid, still PNG, JPEG, or WebP under 20 MB and 40 megapixels.' });
    }
  });
  app.patch('/api/assets/:id', (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const patch = z
      .object({ favorite: z.boolean().optional(), archived: z.boolean().optional() })
      .strict()
      .parse(req.body);
    const asset = store.asset(id);
    if (!asset) {
      res.sendStatus(404);
      return;
    }
    const updated = { ...asset, ...patch };
    store.saveAsset(updated);
    res.json(updated);
  });
  app.get('/api/assets/:id/:variant', (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const variant = z.enum(['image', 'thumb', 'download', 'prompt']).parse(req.params.variant);
    const asset = store.asset(id);
    if (!asset) {
      res.sendStatus(404);
      return;
    }
    if (variant === 'prompt') {
      res.json({
        asset: { id: asset.id, width: asset.width, height: asset.height, format: asset.format },
        request: asset.request || null,
      });
      return;
    }
    const file =
      variant === 'thumb'
        ? path.join(store.dir, 'thumbs', `${id}.webp`)
        : path.join(store.dir, 'assets', path.basename(asset.filename));
    // The private library intentionally lives in .data; only these DB-selected files are served.
    if (variant === 'download') {
      res.download(
        file,
        `imagegen-${id.slice(0, 8)}.${asset.format === 'jpeg' ? 'jpg' : asset.format}`,
        { dotfiles: 'allow' },
      );
      return;
    }
    res.sendFile(file, { dotfiles: 'allow' });
  });
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError)
      res.status(400).json({ error: error.issues.map((i) => i.message).join(' ') });
    else if (error instanceof multer.MulterError)
      res.status(400).json({ error: 'Upload one image at a time, up to 20 MB.' });
    else
      res.status(400).json({ error: error instanceof Error ? error.message : 'Request failed.' });
  };
  app.use(errors);
  return app;
}

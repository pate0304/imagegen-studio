import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import sharp from 'sharp';
import { requestSchema, structuredPrompt } from '../shared/schema.js';
import { Store } from '../server/store.js';
import { Queue } from '../server/queue.js';
import { createApp } from '../server/app.js';
import { imageFiles, importImage } from '../server/images.js';

const binary = fileURLToPath(new URL('./fake-codex.mjs', import.meta.url));
await fs.chmod(binary, 0o755);
const health = async () => ({
  ready: true,
  binary,
  version: 'fixture',
  model: 'inherited',
  provider: 'openai',
  auth: 'ChatGPT',
  skillPath: 'fixture/SKILL.md',
  skillAvailable: true,
  imageFeature: true,
});
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'imagegen-test-'));
  const dir = path.join(temp, '.data');
  const store = new Store(dir);
  const queue = new Queue(store, health);
  const app = createApp(store, queue, health);
  t.after(async () => {
    await queue.close();
    store.close();
    await fs.rm(temp, { recursive: true, force: true });
  });
  return { dir, store, queue, app };
}
async function waitFor(condition: () => boolean, ms = 6000) {
  const until = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > until) throw new Error('Timed out waiting for fixture');
    await new Promise((r) => setTimeout(r, 30));
  }
}

test('edit requests require one explicit target and preserve invariants', () => {
  assert.equal(requestSchema.safeParse({ prompt: 'Edit this scene', mode: 'edit' }).success, false);
  const value = requestSchema.parse({
    prompt: 'Change the light',
    mode: 'edit',
    references: [{ id: 'ba8e9576-5af1-4f86-9b9f-1c4328c8369d', role: 'edit target' }],
    text: 'Exactly "this"',
    transparent: true,
  });
  const brief = structuredPrompt(value);
  assert.match(brief, /preserve everything else/);
  assert.match(brief, /genuinely transparent/);
  assert.match(brief, /Text \(verbatim\)/);
});
test('invalid variation counts and duplicated references are rejected', () => {
  assert.equal(requestSchema.safeParse({ prompt: 'Hello image', variants: 10 }).success, false);
  const ref = { id: 'ba8e9576-5af1-4f86-9b9f-1c4328c8369d', role: 'reference' };
  assert.equal(
    requestSchema.safeParse({ prompt: 'Hello image', references: [ref, ref] }).success,
    false,
  );
});
test('local API rejects foreign origins, DNS rebinding and missing mutation header', async (t) => {
  const { app } = await fixture(t);
  await request(app).get('/api/health').set('Host', 'attacker.test').expect(403);
  await request(app)
    .post('/api/jobs')
    .set('Origin', 'https://attacker.test')
    .set('X-Studio-Request', '1')
    .send({ prompt: 'Hello image' })
    .expect(403);
  await request(app).post('/api/jobs').send({ prompt: 'Hello image' }).expect(403);
  await request(app).get('/api/assets/../../config.toml/image').expect(404);
});
test('uploads are decoded; SVG and disguised non-images are rejected', async (t) => {
  const { app, store } = await fixture(t);
  await request(app)
    .post('/api/references')
    .set('X-Studio-Request', '1')
    .attach('image', Buffer.from('<svg onload="alert(1)"></svg>'), 'file.png')
    .expect(400);
  const bytes = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#f00' } })
    .png()
    .toBuffer();
  const result = await request(app)
    .post('/api/references')
    .set('X-Studio-Request', '1')
    .attach('image', bytes, 'image.png')
    .expect(201);
  assert.equal(result.body.width, 20);
  assert.equal(store.assets().length, 1);
  await request(app)
    .get(`/api/assets/${result.body.id}/image`)
    .expect('Content-Type', /image\/png/)
    .expect(200);
});
test('app-server lifecycle creates an actual validated local asset and records usage', async (t) => {
  const { app, store } = await fixture(t);
  const res = await request(app)
    .post('/api/jobs')
    .set('X-Studio-Request', '1')
    .send({ prompt: 'Fixture image SIMULATE_BASE64' })
    .expect(202);
  const id = res.body.jobs[0].id;
  await waitFor(() => store.job(id)?.status === 'completed' || store.job(id)?.status === 'failed');
  assert.equal(
    store.job(id)?.status,
    'completed',
    store.job(id)?.error || 'The fixture should produce an image.',
  );
  assert.equal(store.assets().length, 1, 'base64 and saved path must deduplicate');
  assert.equal(store.assets()[0].hasAlpha, true);
  assert.equal(store.job(id)?.usage?.input_tokens, 123);
  const asset = store.assets()[0];
  await request(app)
    .patch(`/api/assets/${asset.id}`)
    .set('X-Studio-Request', '1')
    .send({ favorite: true })
    .expect(200);
  assert.equal(store.asset(asset.id)?.favorite, true);
  await request(app)
    .get(`/api/assets/${asset.id}/download`)
    .expect('Content-Disposition', /attachment/)
    .expect(200);
});
test('empty output is a failure, never a placeholder success', async (t) => {
  const { queue, store } = await fixture(t);
  const [job] = queue.add(requestSchema.parse({ prompt: 'SIMULATE_EMPTY image' }));
  await waitFor(() => store.job(job.id)?.status === 'failed');
  assert.match(store.job(job.id)!.error!, /without a successful image/);
  assert.equal(store.assets().length, 0);
  assert.equal(queue.paused, true);
});
test('generation failure pauses remaining variants without retry or extra calls', async (t) => {
  const { queue, store } = await fixture(t);
  const jobs = queue.add(requestSchema.parse({ prompt: 'SIMULATE_FAIL image', variants: 3 }));
  await waitFor(() => store.job(jobs[0].id)?.status === 'failed');
  assert.equal(queue.paused, true);
  assert.equal(store.job(jobs[1].id)?.status, 'queued');
  assert.equal(store.job(jobs[2].id)?.status, 'queued');
});
test('active generation cancellation stops the turn and never imports output', async (t) => {
  const { queue, store } = await fixture(t);
  const [job] = queue.add(requestSchema.parse({ prompt: 'SIMULATE_HANG image' }));
  await waitFor(() => !!store.job(job.id)?.threadId);
  queue.cancel(job.id);
  await queue.close();
  assert.equal(store.job(job.id)?.status, 'cancelled');
  assert.equal(store.assets().length, 0);
});
test('a queued job can be cancelled without spawning Codex', async (t) => {
  const { queue, store } = await fixture(t);
  queue.setPaused(true);
  const [job] = queue.add(requestSchema.parse({ prompt: 'Hello image' }));
  queue.cancel(job.id);
  assert.equal(store.job(job.id)?.status, 'cancelled');
  assert.equal(store.job(job.id)?.threadId, undefined);
});
test('graceful shutdown records running work as interrupted, not failed', async (t) => {
  const { queue, store } = await fixture(t);
  const [job] = queue.add(requestSchema.parse({ prompt: 'SIMULATE_HANG shutdown' }));
  await waitFor(() => !!store.job(job.id)?.threadId);
  await queue.close();
  assert.equal(store.job(job.id)?.status, 'interrupted');
  assert.equal(store.assets().length, 0);
});
test('restart marks in-flight work interrupted and preserves library and pending work', async (t) => {
  const { dir, store, queue } = await fixture(t);
  queue.setPaused(true);
  const [running, pending] = queue.add(requestSchema.parse({ prompt: 'Hello image', variants: 2 }));
  store.saveJob({ ...running, status: 'running' });
  const second = new Store(dir);
  const resumed = new Queue(second, health);
  assert.equal(second.job(running.id)?.status, 'interrupted');
  assert.equal(second.job(pending.id)?.status, 'queued');
  assert.equal(resumed.paused, true);
  await resumed.close();
  second.close();
});
test('image collection skips symlinks outside the job', async (t) => {
  const { dir } = await fixture(t);
  const output = path.join(dir, 'output');
  await fs.mkdir(output);
  const external = path.join(dir, 'not-an-output.png');
  await fs.writeFile(external, 'unrelated');
  await fs.symlink(external, path.join(output, 'escape.png'));
  assert.deepEqual(await imageFiles(output), []);
});
test('missing reference ids and queue overflow fail before execution', async (t) => {
  const { queue } = await fixture(t);
  queue.setPaused(true);
  assert.throws(
    () =>
      queue.add(
        requestSchema.parse({
          prompt: 'Image here',
          references: [{ id: 'ba8e9576-5af1-4f86-9b9f-1c4328c8369d', role: 'reference' }],
        }),
      ),
    /reference image/,
  );
  for (let i = 0; i < 5; i++)
    queue.add(requestSchema.parse({ prompt: 'Queued image', variants: 4 }));
  assert.throws(
    () => queue.add(requestSchema.parse({ prompt: 'Queue overflow' })),
    /Queue is full/,
  );
});

test('manual connection refresh bypasses the cache and requires a local mutation header', async (t) => {
  const { store, queue } = await fixture(t);
  let ready = true;
  let checks = 0;
  const app = createApp(store, queue, async () => {
    checks++;
    return { ...(await health()), ready };
  });
  const first = await request(app).get('/api/health').expect(200);
  assert.equal(first.body.ready, true);
  ready = false;
  const cached = await request(app).get('/api/health').expect(200);
  assert.equal(cached.body.ready, true);
  assert.equal(checks, 1);
  await request(app).post('/api/health/refresh').expect(403);
  const refreshed = await request(app)
    .post('/api/health/refresh')
    .set('X-Studio-Request', '1')
    .send({})
    .expect(200);
  assert.equal(refreshed.body.ready, false);
  assert.equal(checks, 2);
});

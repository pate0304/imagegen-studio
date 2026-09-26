import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Store } from './store.js';
import { CodexAppServer, codexHome, discover, invocationPrompt } from './codex.js';
import { imageFiles, importImage } from './images.js';
import type { GenerationRequest, Job } from '../shared/schema.js';

export class Queue {
  paused = false;
  private active?: {
    id: string;
    client?: CodexAppServer;
    turnId?: string;
    threadId?: string;
    cancel?: () => void;
  };
  private closing = false;
  constructor(
    readonly store: Store,
    readonly getConnection = discover,
  ) {
    for (const job of store.jobs()) {
      if (job.status === 'running') {
        job.status = 'interrupted';
        job.stage = 'Interrupted by a server restart';
        job.finishedAt = new Date().toISOString();
        store.saveJob(job);
      }
      if (job.status === 'queued') this.paused = true;
    }
  }
  add(request: GenerationRequest) {
    if (
      this.store.jobs().filter((j) => j.status === 'queued' || j.status === 'running').length +
        request.variants >
      20
    )
      throw new Error('Queue is full. Wait for a job to finish or cancel one.');
    for (const ref of request.references)
      if (!this.store.asset(ref.id))
        throw new Error('A reference image no longer exists. Please upload it again.');
    const batchId = randomUUID();
    const jobs: Job[] = [];
    this.store.db.transaction(() => {
      for (let i = 1; i <= request.variants; i++) {
        const job: Job = {
          id: randomUUID(),
          batchId,
          variant: i,
          request,
          status: 'queued',
          stage: 'Waiting in queue',
          createdAt: new Date().toISOString(),
          messages: [],
          assetIds: [],
        };
        this.store.saveJob(job);
        jobs.push(job);
      }
    })();
    void this.tick();
    return jobs;
  }
  setPaused(value: boolean) {
    this.paused = value;
    if (!value) void this.tick();
  }
  cancel(id: string) {
    const job = this.store.job(id);
    if (!job || !['queued', 'running'].includes(job.status)) return;
    job.status = 'cancelled';
    job.stage = 'Cancelled';
    job.finishedAt = new Date().toISOString();
    this.store.saveJob(job);
    if (this.active?.id === id) {
      const a = this.active;
      if (a.threadId && a.turnId && a.client)
        void a.client
          .interrupt(a.threadId, a.turnId)
          .catch(() => {})
          .finally(() => a.client?.close());
      a.cancel?.();
      setTimeout(() => a.client?.close(), 1000).unref();
    }
  }
  private update(id: string, patch: Partial<Job>) {
    const job = this.store.job(id)!;
    if (!['cancelled', 'interrupted'].includes(job.status))
      this.store.saveJob({ ...job, ...patch });
  }
  async tick() {
    if (this.active || this.paused || this.closing) return;
    const job = this.store
      .jobs()
      .reverse()
      .find((j) => j.status === 'queued');
    if (!job) return;
    this.active = { id: job.id };
    this.update(job.id, {
      status: 'running',
      stage: 'Connecting to Codex',
      startedAt: new Date().toISOString(),
    });
    try {
      const connection = await this.getConnection();
      if (!connection.ready || !connection.binary)
        throw new Error(connection.reason || 'Codex is not ready.');
      if (this.closing || this.store.job(job.id)?.status === 'cancelled') return;
      const work = path.join(this.store.dir, 'jobs', job.id);
      await fs.mkdir(path.join(work, 'output'), { recursive: true, mode: 0o700 });
      await fs.mkdir(path.join(work, 'inputs'), { recursive: true, mode: 0o700 });
      const references: string[] = [];
      for (const ref of job.request.references) {
        const asset = this.store.asset(ref.id)!;
        const target = path.join(work, 'inputs', asset.filename);
        await fs.copyFile(path.join(this.store.dir, 'assets', asset.filename), target);
        references.push(target);
      }
      if (this.closing || this.store.job(job.id)?.status === 'cancelled') return;
      const client = new CodexAppServer(connection.binary, work);
      this.active.client = client;
      const images: { savedPath?: string; result?: string }[] = [];
      let threadId = '';
      let resolveTurn!: () => void;
      let rejectTurn!: (error: Error) => void;
      const complete = new Promise<void>((resolve, reject) => {
        resolveTurn = resolve;
        rejectTurn = reject;
      });
      // Register the rejection handler before asynchronous initialization.
      void complete.catch(() => {});
      this.active.cancel = () => rejectTurn(new Error('Cancelled'));
      client.on('failure', rejectTurn);
      client.on('notification', ({ method, params: p }) => {
        if (p?.threadId && threadId && p.threadId !== threadId) return;
        if (method === 'item/started' && p.item?.type === 'imageGeneration')
          this.update(job.id, { stage: 'Generating your image' });
        if (method === 'item/completed') {
          const item = p.item;
          if (item?.type === 'imageGeneration') {
            if (item.failure)
              rejectTurn(
                new Error(
                  'Codex image-generation usage limit reached. The queue is paused; try again after your limits reset.',
                ),
              );
            else if (item.status === 'completed') {
              images.push({ savedPath: item.savedPath, result: item.result });
              this.update(job.id, { stage: 'Finishing the image' });
            }
          }
          if (item?.type === 'agentMessage' && typeof item.text === 'string') {
            const messages = [...this.store.job(job.id)!.messages, item.text.slice(0, 1500)].slice(
              -8,
            );
            this.update(job.id, { messages });
          }
        }
        if (method === 'thread/tokenUsage/updated' && p.tokenUsage?.last) {
          const u = p.tokenUsage.last;
          this.update(job.id, {
            usage: {
              input_tokens: u.inputTokens,
              output_tokens: u.outputTokens,
              cached_input_tokens: u.cachedInputTokens,
            },
          });
        }
        if (method === 'turn/completed') {
          if (p.turn?.status === 'completed') resolveTurn();
          else
            rejectTurn(
              new Error(p.turn?.error?.message || `Codex turn ${p.turn?.status || 'failed'}.`),
            );
        }
      });
      const timeout = setTimeout(() => {
        rejectTurn(
          new Error('Generation timed out after 12 minutes. No automatic retry was made.'),
        );
        client.close();
      }, 12 * 60_000);
      try {
        await client.initialize();
        const thread = await client.startThread(work);
        threadId = thread.thread.id;
        this.active.threadId = threadId;
        this.update(job.id, { threadId, stage: 'Preparing the image brief' });
        if (this.closing || this.store.job(job.id)?.status === 'cancelled')
          throw new Error('Cancelled');
        const turn = await client.startTurn(
          threadId,
          invocationPrompt(job.request, references, job.variant),
          references,
        );
        this.active.turnId = turn.turn.id;
        await complete;
        if (this.closing || this.store.job(job.id)?.status === 'cancelled') return;
        if (!images.length)
          throw new Error(
            'Codex finished without a successful image-generation event. No placeholder was saved.',
          );
        this.update(job.id, { stage: 'Saving to your library' });
        const roots = [path.join(work, 'output')];
        if (/^[a-zA-Z0-9_-]{1,100}$/.test(threadId))
          roots.push(path.join(codexHome, 'generated_images', threadId));
        const candidates: Buffer[] = [];
        for (const image of images) {
          if (image.result && /^[A-Za-z0-9+/=\s]+$/.test(image.result) && image.result.length > 100)
            candidates.push(Buffer.from(image.result, 'base64'));
          if (image.savedPath) {
            try {
              const real = await fs.realpath(image.savedPath);
              if (
                roots.some((root) => real.startsWith(root + path.sep)) &&
                (await fs.stat(real)).size <= 40 * 1024 * 1024
              )
                candidates.push(await fs.readFile(real));
            } catch {
              /* collect from workspace below */
            }
          }
        }
        if (!candidates.length)
          for (const root of roots)
            for (const file of await imageFiles(root)) candidates.push(await fs.readFile(file));
        const hashes = new Set<string>();
        const assetIds: string[] = [];
        for (const bytes of candidates) {
          const hash = createHash('sha256').update(bytes).digest('hex');
          if (hashes.has(hash)) continue;
          hashes.add(hash);
          const asset = await importImage(this.store, bytes, {
            kind: 'generated',
            name: job.request.prompt.slice(0, 80),
            jobId: job.id,
            request: job.request,
          });
          assetIds.push(asset.id);
        }
        if (!assetIds.length)
          throw new Error(
            'Codex generated an image but did not return a readable image file. No placeholder was created.',
          );
        this.update(job.id, {
          status: 'completed',
          stage: 'Saved to library',
          assetIds,
          finishedAt: new Date().toISOString(),
        });
      } finally {
        clearTimeout(timeout);
        client.close();
      }
    } catch (error) {
      if (!['cancelled', 'interrupted'].includes(this.store.job(job.id)?.status || '')) {
        this.paused = true;
        this.update(job.id, {
          status: 'failed',
          stage: 'Needs attention',
          error: (error instanceof Error ? error.message : 'Generation failed.').slice(0, 2000),
          finishedAt: new Date().toISOString(),
        });
      }
    } finally {
      this.active = undefined;
      if (!this.closing) setImmediate(() => void this.tick());
    }
  }
  async close() {
    this.closing = true;
    this.paused = true;
    if (this.active) {
      const job = this.store.job(this.active.id);
      if (job?.status === 'running')
        this.store.saveJob({
          ...job,
          status: 'interrupted',
          stage: 'Stopped with the local server',
          finishedAt: new Date().toISOString(),
        });
      this.active.cancel?.();
      this.active.client?.close();
    }
    while (this.active) await new Promise((r) => setTimeout(r, 25));
  }
}

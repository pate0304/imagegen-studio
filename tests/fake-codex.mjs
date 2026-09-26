#!/usr/bin/env node
// Disposable protocol fixture. This never invokes a model or represents a real generated image.
import readline from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('codex-cli 0.158.0-test');
  process.exit(0);
}
if (args[0] === 'login') {
  console.log('Logged in using ChatGPT');
  process.exit(0);
}
if (args[0] === 'features') {
  console.log('image_generation stable false');
  process.exit(0);
}
if (args.includes('--help')) {
  console.log('app-server --listen stdio://');
  process.exit(0);
}
const threadId = 'test-thread-123';
const turnId = 'test-turn-123';
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ id, result });
const notify = (method, params) => send({ method, params: { threadId, ...params } });
readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  const request = JSON.parse(line);
  if (request.method === 'initialize') reply(request.id, { userAgent: 'test-fixture' });
  if (request.method === 'thread/start') {
    if (
      request.params.sandbox !== 'workspace-write' ||
      !request.params.ephemeral ||
      request.params.approvalPolicy !== 'never' ||
      request.params.model
    ) {
      send({ id: request.id, error: { code: -32000, message: 'Unsafe thread configuration' } });
      return;
    }
    reply(request.id, { thread: { id: threadId } });
  }
  if (request.method === 'turn/start') {
    const text = request.params.input.find((i) => i.type === 'text').text;
    if (!request.params.input.some((i) => i.type === 'skill' && i.name === 'imagegen')) {
      send({ id: request.id, error: { code: -32000, message: 'Skill input missing' } });
      return;
    }
    reply(request.id, { turn: { id: turnId, status: 'inProgress' } });
    if (text.includes('SIMULATE_HANG')) return;
    if (text.includes('SIMULATE_FAIL')) {
      notify('turn/completed', {
        turn: { id: turnId, status: 'failed', error: { message: 'Test failure: no credits' } },
      });
      return;
    }
    if (!text.includes('SIMULATE_EMPTY')) {
      notify('item/started', {
        item: { id: 'img-test', type: 'imageGeneration', status: 'inProgress' },
      });
      const bytes = await sharp({
        create: {
          width: 80,
          height: 64,
          channels: 4,
          background: { r: 120, g: 150, b: 90, alpha: 0.7 },
        },
      })
        .png()
        .toBuffer();
      const savedPath = path.join(process.cwd(), 'output', 'fixture.png');
      await fs.writeFile(savedPath, bytes);
      notify('item/completed', {
        item: {
          id: 'img-test',
          type: 'imageGeneration',
          status: 'completed',
          savedPath,
          result: text.includes('SIMULATE_BASE64') ? bytes.toString('base64') : '',
          failure: null,
        },
      });
    }
    notify('item/completed', {
      item: { type: 'agentMessage', text: 'Protocol test fixture complete.' },
    });
    notify('thread/tokenUsage/updated', {
      tokenUsage: { last: { inputTokens: 123, outputTokens: 45, cachedInputTokens: 10 } },
    });
    notify('turn/completed', { turn: { id: turnId, status: 'completed', error: null } });
  }
  if (request.method === 'turn/interrupt') {
    reply(request.id, {});
    notify('turn/completed', { turn: { id: turnId, status: 'interrupted' } });
  }
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Store } from './store.js';
import type { Asset } from '../shared/schema.js';

const formats = new Set(['png', 'jpeg', 'webp']);
export async function importImage(
  store: Store,
  bytes: Buffer,
  info: Pick<Asset, 'kind' | 'name'> & Partial<Pick<Asset, 'jobId' | 'request'>>,
): Promise<Asset> {
  if (bytes.length > 40 * 1024 * 1024) throw new Error('Images must be smaller than 40 MB.');
  const image = sharp(bytes, { limitInputPixels: 40_000_000 });
  const meta = await image.metadata();
  if (
    !meta.format ||
    !formats.has(meta.format) ||
    !meta.width ||
    !meta.height ||
    (meta.pages ?? 1) > 1
  )
    throw new Error('Use a still PNG, JPEG, or WebP image.');
  const id = randomUUID();
  const filename = `${id}.${meta.format === 'jpeg' ? 'jpg' : meta.format}`;
  // Decode a thumbnail before accepting an upload: MIME and extension alone are not validation.
  const thumb = await image
    .rotate()
    .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  await fs.writeFile(path.join(store.dir, 'assets', filename), bytes, { flag: 'wx', mode: 0o600 });
  await fs.writeFile(path.join(store.dir, 'thumbs', `${id}.webp`), thumb, {
    flag: 'wx',
    mode: 0o600,
  });
  const asset: Asset = {
    ...info,
    id,
    filename,
    createdAt: new Date().toISOString(),
    width: meta.width,
    height: meta.height,
    format: meta.format,
    bytes: bytes.length,
    hasAlpha: !!meta.hasAlpha,
    favorite: false,
    archived: false,
  };
  store.saveAsset(asset);
  return asset;
}

export async function imageFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  let actual: string;
  try {
    if ((await fs.lstat(root)).isSymbolicLink()) return [];
    actual = await fs.realpath(root);
  } catch {
    return [];
  }
  async function walk(dir: string, depth: number) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory() && depth < 2) await walk(file, depth + 1);
      else if (e.isFile() && /\.(png|jpe?g|webp)$/i.test(e.name)) {
        const real = await fs.realpath(file);
        if (real.startsWith(actual + path.sep) && (await fs.stat(real)).size <= 40 * 1024 * 1024)
          found.push(real);
      }
      if (found.length >= 12) return;
    }
  }
  await walk(root, 0);
  return found;
}

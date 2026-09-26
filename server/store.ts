import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Asset, Job } from '../shared/schema.js';

export class Store {
  db: Database.Database;
  constructor(readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const name of ['assets', 'thumbs', 'jobs'])
      fs.mkdirSync(path.join(dir, name), { recursive: true, mode: 0o700 });
    this.db = new Database(path.join(dir, 'studio.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL);',
    );
  }
  jobs(): Job[] {
    return (
      this.db.prepare('SELECT data FROM jobs ORDER BY created_at DESC, rowid DESC').all() as {
        data: string;
      }[]
    ).map((x) => JSON.parse(x.data));
  }
  job(id: string): Job | undefined {
    const r = this.db.prepare('SELECT data FROM jobs WHERE id=?').get(id) as
      { data: string } | undefined;
    return r && JSON.parse(r.data);
  }
  saveJob(job: Job) {
    this.db
      .prepare('INSERT INTO jobs VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
      .run(job.id, job.createdAt, JSON.stringify(job));
  }
  assets(): Asset[] {
    return (
      this.db.prepare('SELECT data FROM assets ORDER BY created_at DESC, rowid DESC').all() as {
        data: string;
      }[]
    ).map((x) => JSON.parse(x.data));
  }
  asset(id: string): Asset | undefined {
    const r = this.db.prepare('SELECT data FROM assets WHERE id=?').get(id) as
      { data: string } | undefined;
    return r && JSON.parse(r.data);
  }
  saveAsset(asset: Asset) {
    this.db
      .prepare('INSERT INTO assets VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
      .run(asset.id, asset.createdAt, JSON.stringify(asset));
  }
  close() {
    this.db.close();
  }
}

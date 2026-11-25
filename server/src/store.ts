// 저장 (GDD_v2 6.5). SQLite 는 Node 내장 node:sqlite 를 쓴다(better-sqlite3 의 네이티브 빌드를 피함).
// vitest(vite 5)가 node:sqlite 를 모르므로 createRequire 로 부른다.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BarRecord, TickRecord } from './types.ts';
import { ST_CODE } from './types.ts';

const require_ = createRequire(import.meta.url);
const { DatabaseSync } = require_('node:sqlite') as typeof import('node:sqlite');

const ST_NAME = ['open', 'delayed', 'halted'] as const;
export const RETENTION_SEC = { raw: 7 * 86400, ticks: 30 * 86400, bars: 90 * 86400 };

export class TickStore {
  readonly db: InstanceType<typeof DatabaseSync>;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS raw_ticks (n INTEGER PRIMARY KEY, src TEXT NOT NULL, mids TEXT NOT NULL, vols TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ticks (n INTEGER PRIMARY KEY, ts INTEGER NOT NULL, st INTEGER NOT NULL, src TEXT NOT NULL, p TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bars_60 (n0 INTEGER NOT NULL, market TEXT NOT NULL, o REAL, h REAL, l REAL, c REAL, vol REAL, buy REAL, st INTEGER, PRIMARY KEY (n0, market));
      CREATE TABLE IF NOT EXISTS bars_180 (n0 INTEGER NOT NULL, market TEXT NOT NULL, o REAL, h REAL, l REAL, c REAL, vol REAL, buy REAL, st INTEGER, avg60 REAL, PRIMARY KEY (n0, market));
    `);
  }

  getMeta(k: string): string | null {
    const r = this.db.prepare('SELECT v FROM meta WHERE k = ?').get(k) as { v: string } | undefined;
    return r ? r.v : null;
  }
  setMeta(k: string, v: string): void {
    this.db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run(k, v);
  }

  insertTick(t: TickRecord): void {
    this.db.prepare('INSERT OR REPLACE INTO ticks (n, ts, st, src, p) VALUES (?, ?, ?, ?, ?)').run(t.n, t.ts, ST_CODE[t.st], t.src, JSON.stringify(t.p));
  }
  insertRaw(n: number, src: string, mids: Record<string, number>, vols: Record<string, number>): void {
    this.db.prepare('INSERT OR REPLACE INTO raw_ticks (n, src, mids, vols) VALUES (?, ?, ?, ?)').run(n, src, JSON.stringify(mids), JSON.stringify(vols));
  }
  insertBar(res: 60 | 180, b: BarRecord): void {
    if (res === 60) {
      this.db.prepare('INSERT OR REPLACE INTO bars_60 VALUES (?,?,?,?,?,?,?,?,?)').run(b.n0, b.market, b.o, b.h, b.l, b.c, b.vol, b.buy, b.st);
    } else {
      this.db.prepare('INSERT OR REPLACE INTO bars_180 VALUES (?,?,?,?,?,?,?,?,?,?)').run(b.n0, b.market, b.o, b.h, b.l, b.c, b.vol, b.buy, b.st, b.avg60 ?? null);
    }
  }

  private rowToTick(r: any): TickRecord {
    return { n: r.n, ts: r.ts, st: ST_NAME[r.st], src: r.src, p: JSON.parse(r.p) };
  }
  lastTick(): TickRecord | null {
    const r = this.db.prepare('SELECT * FROM ticks ORDER BY n DESC LIMIT 1').get();
    return r ? this.rowToTick(r) : null;
  }
  ticksBetween(from: number, to: number): TickRecord[] {
    return (this.db.prepare('SELECT * FROM ticks WHERE n BETWEEN ? AND ? ORDER BY n').all(from, to) as any[]).map((r) => this.rowToTick(r));
  }
  recentRaw(limit: number): { n: number; vols: Record<string, number> }[] {
    return (this.db.prepare('SELECT n, vols FROM raw_ticks ORDER BY n DESC LIMIT ?').all(limit) as any[]).map((r) => ({ n: r.n, vols: JSON.parse(r.vols) }));
  }

  /** from..to 구간의 봉. 시간 칸(n0) 수가 maxSlots 를 넘으면 거기까지만 주고 next(다음 n0)를 돌려준다. */
  barsBetween(res: 60 | 180, from: number, to: number, maxSlots = 20000): { bars: BarRecord[]; next?: number } {
    const table = res === 60 ? 'bars_60' : 'bars_180';
    const slots = this.db
      .prepare(`SELECT DISTINCT n0 FROM ${table} WHERE n0 BETWEEN ? AND ? ORDER BY n0 LIMIT ?`)
      .all(from, to, maxSlots + 1) as { n0: number }[];
    let next: number | undefined;
    let last = to;
    if (slots.length > maxSlots) {
      next = slots[maxSlots].n0;
      last = next - 1;
    }
    const rows = this.db.prepare(`SELECT * FROM ${table} WHERE n0 BETWEEN ? AND ? ORDER BY n0, market`).all(from, last) as any[];
    return { bars: rows.map((r) => ({ market: r.market, n0: r.n0, o: r.o, h: r.h, l: r.l, c: r.c, vol: r.vol, buy: r.buy, st: r.st, avg60: r.avg60 ?? undefined })), next };
  }
  /** 가장 최근의 봉 count 칸(시간 단위). 오래된 것부터. */
  recentBars(res: 60 | 180, count: number): BarRecord[] {
    const table = res === 60 ? 'bars_60' : 'bars_180';
    const slots = this.db.prepare(`SELECT DISTINCT n0 FROM ${table} ORDER BY n0 DESC LIMIT ?`).all(count) as { n0: number }[];
    if (!slots.length) return [];
    return this.barsBetween(res, slots[slots.length - 1].n0, slots[0].n0, count).bars;
  }

  prune(nowTs: number, epoch: number): void {
    const nOf = (sec: number) => nowTs - sec - epoch;
    this.db.prepare('DELETE FROM raw_ticks WHERE n < ?').run(nOf(RETENTION_SEC.raw));
    this.db.prepare('DELETE FROM ticks WHERE n < ?').run(nOf(RETENTION_SEC.ticks));
    this.db.prepare('DELETE FROM bars_60 WHERE n0 < ?').run(nOf(RETENTION_SEC.bars));
    this.db.prepare('DELETE FROM bars_180 WHERE n0 < ?').run(nOf(RETENTION_SEC.bars));
  }
  close(): void {
    this.db.close();
  }
}

import { loadMarkets, loadSources } from '../src/config.ts';
import { Pipeline } from '../src/pipeline.ts';
import { TickStore } from '../src/store.ts';
import type { RawEvent, SourceAdapter, SourceId, TickRecord } from '../src/types.ts';
import { fileURLToPath } from 'node:url';

export const sourcesPath = fileURLToPath(new URL('../config/sources.json', import.meta.url));
export const marketsPath = fileURLToPath(new URL('../../data/markets.json', import.meta.url));
export const sources = loadSources(sourcesPath);
export const markets = loadMarkets(marketsPath);
export const T0 = 1_800_000_000_000; // 가짜 시계(ms)
export const EPOCH = 1_799_999_000; // 초

/** 원본(가짜) mid. 일부러 눈에 띄는 값을 써서 새는지 찾을 수 있게 한다. */
export const RAW = { DTC: 123456.789, BTH: 98765.4321, SMS: 5432.1098, MDT: 7777.7777, IDX_XRP: 3141.5926 } as const;

export function makePipe(store = new TickStore(':memory:'), opts: Record<string, unknown> = {}) {
  const ticks: TickRecord[] = [];
  const pipe = new Pipeline({ store, markets, sources, epoch: EPOCH, startedAt: T0, onTick: (t) => ticks.push(t), ...opts });
  return { pipe, store, ticks };
}

/** 한 출처의 모든 키에 mid 를 넣는다. scale 은 출처마다 가격대가 다름을 흉내. */
export function feedMids(pipe: Pipeline, src: SourceId, now: number, mul = 1, scale = 1, keys: string[] = Object.keys(RAW)) {
  for (const k of keys) pipe.ingest(src, { kind: 'mid', key: k, mid: (RAW as any)[k] * scale * mul, ts: now }, now);
}

export class FakeSource implements SourceAdapter {
  id: SourceId;
  cb: (e: RawEvent) => void = () => {};
  started = false;
  constructor(id: SourceId) { this.id = id; }
  start() { this.started = true; }
  stop() { this.started = false; }
  onEvent(cb: (e: RawEvent) => void) { this.cb = cb; }
  mid(key: string, mid: number) { this.cb({ kind: 'mid', key, mid, ts: Date.now() }); }
}

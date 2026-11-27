// 기록 재생 피드. docs/gdd/v2/sim/data/hl_3m.json 같은 3분봉 기록(C1..C5, 로그 가격 × 1e6)을
// 1초 틱 열로 바꿔 흘려 준다. 가격 수준·날짜는 기록에 없다(가상 시작가에서 로그 변화만 얹는다).
// 한 봉 안의 경로: 상승봉 o -> l -> h -> c, 하락봉 o -> h -> l -> c (각 60초, 로그 선형). 기록 끝에서는 처음으로 돌아간다.
import { marketDefs, replayMap } from '../data';
import { flyPrice } from './fly';
import { SIM_FLY_EPOCH } from './simFeed';
import type { Bar, Feed, Tick } from './types';
import type { MarketStatus } from '../types';
import { barsFromTicks } from './simFeed';

export interface Recording {
  source?: string;
  minutes: number;
  coins: Record<string, { o: number[]; h: number[]; l: number[]; c: number[]; v: number[] }>;
}

export const CANDLE_TICKS = 180;

export class ReplayFeed implements Feed {
  n: number;
  st: MarketStatus = 'open';
  private idx = 0;
  private subs = new Set<(t: Tick) => void>();
  readonly length: number;

  constructor(private rec: Recording, startN = 0, startIndex = 0) {
    this.n = startN;
    this.idx = startIndex;
    this.length = rec.minutes * CANDLE_TICKS;
  }

  /** 기록 안 idx 번째 초의 로그 가격(종목 키 C1..). */
  private logAt(key: string, idx: number): number {
    const k = Math.floor(idx / CANDLE_TICKS) % this.rec.minutes;
    const i = idx % CANDLE_TICKS;
    const c = this.rec.coins[key];
    const o = c.o[k], h = c.h[k], l = c.l[k], cl = c.c[k];
    const path = cl >= o ? [o, l, h, cl] : [o, h, l, cl];
    const seg = CANDLE_TICKS / 3;
    const u = (i + 1) / seg; // 0..3
    const s = Math.min(2, Math.max(0, Math.ceil(u - 1e-9) - 1));
    const f = Math.min(1, u - s);
    return path[s] + (path[s + 1] - path[s]) * f;
  }

  private cellsAt(idx: number): Tick['p'] {
    const p: Tick['p'] = {};
    const keys: string[] = replayMap.indexOf;
    const logs: Record<string, number> = {};
    for (const k of keys) logs[k] = this.logAt(k, idx);
    const kk = Math.floor(idx / CANDLE_TICKS) % this.rec.minutes;
    for (const m of marketDefs) {
      let x: number;
      let vol = 1;
      if (m.synthetic) { p[m.id] = [flyPrice(SIM_FLY_EPOCH + idx), 1, 0.5]; continue; }
      if (m.id === 'JQQ') {
        x = keys.reduce((a, k) => a + logs[k], 0) / keys.length;
        vol = keys.reduce((a, k) => a + this.rec.coins[k].v[kk] / 100, 0) / keys.length;
      } else {
        const key = Object.keys(replayMap).find((k) => replayMap[k] === m.id)!;
        x = logs[key];
        vol = this.rec.coins[key].v[kk] / 100;
      }
      p[m.id] = [m.startPrice * Math.exp(x / 1e6), vol, 0.5];
    }
    return p;
  }

  snapshot(): Tick {
    const p: Tick['p'] = {};
    for (const m of marketDefs) p[m.id] = [m.synthetic ? flyPrice(SIM_FLY_EPOCH) : m.startPrice, 1, 0.5];
    return { n: this.n, st: this.st, p };
  }

  next(): Tick {
    this.n += 1;
    const t: Tick = { n: this.n, st: this.st, p: this.cellsAt(this.idx % this.length) };
    this.idx += 1;
    for (const cb of this.subs) cb(t);
    return t;
  }

  subscribe(cb: (t: Tick) => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  /** from..to 틱 구간(이미 흘려 보낸 것이 아니라 기록 위치 기준)의 봉. 이 피드의 틱 번호 n 은 startN + 1 부터. */
  async bars(res: 60 | 180, from: number, to: number): Promise<Bar[]> {
    const ticks: Tick[] = [];
    const base = this.n - this.idx; // idx = n - base
    for (let n = Math.max(from, base + 1); n <= to; n++) {
      ticks.push({ n, st: 'open', p: this.cellsAt((n - base - 1) % this.length) });
    }
    return barsFromTicks(ticks, res, from, to);
  }

  async now() {
    return { n: this.n, st: this.st };
  }
}

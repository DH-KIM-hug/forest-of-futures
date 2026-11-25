// 난수 시세(v1 모델: 상태 전환 + 변동 + 급변 + 평균 회귀). 테스트·서버 없는 개발용.
// 같은 시드면 같은 시세 열이 나온다. 파라미터는 data/markets.json simFeed.
import { marketDefs, simFeedCfg } from '../data';
import { gauss, nextRandom } from '../rng';
import type { Bar, Feed, Tick } from './types';
import type { MarketStatus } from '../types';

type Regime = -1 | 0 | 1;

export class SimFeed implements Feed {
  private h: { rng: number };
  private price: Record<string, number> = {};
  private regime: Record<string, Regime> = {};
  private subs = new Set<(t: Tick) => void>();
  private history: Tick[] = [];
  n: number;
  st: MarketStatus = 'open';

  constructor(seed = 1, startN = 0) {
    this.h = { rng: seed | 0 };
    this.n = startN;
    for (const m of marketDefs) {
      this.price[m.id] = m.startPrice;
      this.regime[m.id] = this.pickRegime();
    }
  }

  private pickRegime(): Regime {
    const w = simFeedCfg.regimeWeights;
    const r = nextRandom(this.h);
    return r < w.up ? 1 : r < w.up + w.down ? -1 : 0;
  }

  /** 1초 진행하고 그 틱을 돌려준다(구독자에게도 보낸다). */
  next(): Tick {
    this.n += 1;
    const p: Tick['p'] = {};
    for (const m of marketDefs) {
      const c = simFeedCfg.params[m.id];
      const sigma = c.sigmaPerTick;
      if (nextRandom(this.h) < c.switchProbPerTick) this.regime[m.id] = this.pickRegime();
      let d = this.regime[m.id] * c.driftSigmaRatio * sigma + sigma * gauss(this.h);
      if (nextRandom(this.h) < c.jump.probPerTick) {
        const size = (c.jump.minSigma + nextRandom(this.h) * (c.jump.maxSigma - c.jump.minSigma)) * sigma;
        d += (nextRandom(this.h) < 0.5 ? -1 : 1) * size;
      }
      const lp = Math.log(this.price[m.id]);
      this.price[m.id] = Math.exp(lp + d - c.meanReversionK * (lp - Math.log(m.startPrice)));
      p[m.id] = [this.price[m.id], 1, 0.5];
    }
    const t: Tick = { n: this.n, st: this.st, p };
    this.history.push(t);
    if (this.history.length > 4000) this.history.shift();
    for (const cb of this.subs) cb(t);
    return t;
  }

  /** 시작 상태(0번 틱)의 가격표. */
  snapshot(): Tick {
    const p: Tick['p'] = {};
    for (const m of marketDefs) p[m.id] = [this.price[m.id], 1, 0.5];
    return { n: this.n, st: this.st, p };
  }

  subscribe(cb: (t: Tick) => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  async bars(res: 60 | 180, from: number, to: number): Promise<Bar[]> {
    return barsFromTicks(this.history, res, from, to);
  }

  async now() {
    return { n: this.n, st: this.st };
  }
}

/** 1초 틱 열에서 봉을 만든다(경계는 res 의 배수). */
export function barsFromTicks(ticks: Tick[], res: number, from: number, to: number): Bar[] {
  const acc = new Map<string, Bar>();
  const out: Bar[] = [];
  const flush = (id: string) => {
    const b = acc.get(id);
    if (b) out.push(b);
    acc.delete(id);
  };
  for (const t of ticks) {
    if (t.n < from || t.n > to) continue;
    const n0 = Math.floor(t.n / res) * res;
    for (const [id, cell] of Object.entries(t.p)) {
      const key = id;
      let b = acc.get(key);
      if (b && b.n0 !== n0) {
        flush(key);
        b = undefined;
      }
      if (!b) {
        b = { market: id, n0, o: cell[0], h: cell[0], l: cell[0], c: cell[0], vol: 0, buy: 0.5, st: t.st };
        acc.set(key, b);
      }
      b.h = Math.max(b.h, cell[0]);
      b.l = Math.min(b.l, cell[0]);
      b.c = cell[0];
      b.vol += cell[1];
      b.buy = cell[2];
    }
  }
  for (const id of [...acc.keys()]) flush(id);
  return out.sort((a, b) => a.n0 - b.n0);
}

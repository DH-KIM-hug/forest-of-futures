// 1초 틱 만들기(서버 pipeline.ts 의 liveTick 중 '주 출처 하나' 부분). 표본·변환·지수·거래량 지수·시장 상태는 서버 코드를 그대로 쓴다.
// 시계(nowMs)는 밖에서 넣는다.
import { Sampler, VolumeNorm } from '../../../server/src/shared';
import { Rebaser } from '../../../server/src/shared';
import { SourceSelector } from '../../../server/src/shared';
import type { RawEvent } from '../../../server/src/shared';
import type { MarketStatus } from '../../engine/types';
import type { Tick } from '../../engine/feed/types';
import { INDEX_ID, INDEX_MEMBERS, VOLUME_KEYS } from './config';

export interface CoreMarket { id: string; startPrice: number }

export class LiveCore {
  readonly sampler = new Sampler();
  readonly vol = new VolumeNorm();
  readonly rebaser: Rebaser;
  readonly selector: SourceSelector;
  status: MarketStatus = 'delayed';
  /** 지금까지 본 마지막 mid(출처 키별). 봉 변환의 가격 배율을 구할 때 쓴다. */
  readonly lastMids: Record<string, number> = {};
  anchored = false;
  lastTick: Tick | null = null;
  private ids: string[];

  constructor(private markets: CoreMarket[], startedAt: number) {
    this.ids = markets.map((m) => m.id);
    const start: Record<string, number> = {};
    for (const m of markets) start[m.id] = m.startPrice;
    this.rebaser = new Rebaser(start, INDEX_ID, { primary: INDEX_MEMBERS, secondary: [] });
    this.selector = new SourceSelector(startedAt);
  }

  ingest(e: RawEvent, nowMs: number): void {
    this.sampler.ingest(e, nowMs);
  }

  /** 한 초가 끝났다: 틱 하나. */
  tick(n: number, nowMs: number): Tick {
    const d = this.sampler.drain();
    Object.assign(this.lastMids, d.mids);
    // 두 번째 출처는 없다(unavailable). 조용하면 5초 뒤 delayed, 60초 뒤 halted.
    const sel = this.selector.update(nowMs, this.sampler, { lastAt: null, unavailable: true }, false);
    const reopening = sel.status === 'open' && this.status !== 'open';
    this.status = sel.status;
    if (reopening) {
      this.rebaser.reanchor(d.mids);
      this.anchored = true;
    }
    const p: Tick['p'] = {};
    if (sel.status === 'open') {
      this.rebaser.step(d.mids, 'primary');
      const vi: Record<string, number> = {};
      const bi: Record<string, number> = {};
      for (const k of VOLUME_KEYS) {
        vi[k] = this.vol.index(k, d.vol[k] ?? 0);
        bi[k] = (d.vol[k] ?? 0) > 0 ? (d.buyVol[k] ?? 0) / d.vol[k] : -1;
      }
      for (const m of this.markets) {
        if (m.id === INDEX_ID) {
          const vs = INDEX_MEMBERS.map((k) => vi[k]).filter((x) => x !== undefined);
          const bs = INDEX_MEMBERS.map((k) => bi[k]).filter((x) => x !== undefined && x >= 0);
          p[m.id] = [this.rebaser.vprice[m.id], vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 1, bs.length ? bs.reduce((a, b) => a + b, 0) / bs.length : 0.5];
        } else {
          p[m.id] = [this.rebaser.vprice[m.id], vi[m.id] ?? 1, bi[m.id] !== undefined && bi[m.id] >= 0 ? bi[m.id] : 0.5];
        }
      }
    } else {
      for (const m of this.markets) p[m.id] = [this.rebaser.vprice[m.id], 0, 0.5];
    }
    const t: Tick = { n, st: sel.status, p };
    this.lastTick = t;
    return t;
  }

  /** 긴 공백을 봉으로 메운 뒤: 가격을 봉의 마지막 값으로 잇고, 앵커를 지금 mid 로 다시 잡는다. */
  adopt(prices: Record<string, number>): void {
    for (const id of this.ids) if (prices[id] !== undefined && prices[id] > 0) this.rebaser.vprice[id] = prices[id];
    this.rebaser.reanchor(this.lastMids);
  }

  /** 시장 id → 가상 가격 / 실제 mid 배율(지수는 해당 없음). */
  scale(marketToKey: Record<string, string>): Record<string, number> {
    const k: Record<string, number> = {};
    for (const [id, key] of Object.entries(marketToKey)) {
      const m = this.lastMids[key];
      if (m > 0) k[id] = this.rebaser.vprice[id] / m;
    }
    return k;
  }
}

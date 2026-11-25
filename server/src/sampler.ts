// 1초 표본 (GDD_v2 6.2): 그 초의 마지막 mid, 체결량 합, 매수 체결 비율. 갱신이 없으면 직전 mid 가 그대로 남는다.
import type { RawEvent } from './types.ts';

export class Sampler {
  private mids: Record<string, number> = {};
  private vol: Record<string, number> = {};
  private buyVol: Record<string, number> = {};
  lastAt: number | null = null; // 마지막 사건의 서버 시각(ms)
  unavailable = false;

  ingest(e: RawEvent, nowMs: number): void {
    this.lastAt = nowMs;
    if (e.kind === 'mid') {
      if (e.mid > 0 && Number.isFinite(e.mid)) this.mids[e.key] = e.mid;
    } else if (e.notional > 0) {
      this.vol[e.key] = (this.vol[e.key] ?? 0) + e.notional;
      if (e.buy) this.buyVol[e.key] = (this.buyVol[e.key] ?? 0) + e.notional;
    }
  }

  /** 한 초가 끝났을 때 읽고 체결량을 비운다. mid 는 남긴다. */
  drain(): { mids: Record<string, number>; vol: Record<string, number>; buyVol: Record<string, number> } {
    const out = { mids: { ...this.mids }, vol: this.vol, buyVol: this.buyVol };
    this.vol = {};
    this.buyVol = {};
    return out;
  }
}

/** 거래량 지수: 초당 체결 금액 / 긴 지수 이동 평균(평소 = 1). 평균이 아직 없으면 1. */
export class VolumeNorm {
  private ema: Record<string, number> = {};
  private count: Record<string, number> = {};
  private halfLifeSec: number;
  constructor(halfLifeSec = 3600) {
    this.halfLifeSec = halfLifeSec;
  }
  seed(key: string, mean: number, n: number): void {
    if (mean > 0) {
      this.ema[key] = mean;
      this.count[key] = n;
    }
  }
  index(key: string, notional: number): number {
    const e = this.ema[key];
    const c = (this.count[key] ?? 0) + 1;
    this.count[key] = c;
    let idx = 1;
    if (e !== undefined && e > 0) idx = Math.min(50, notional / e);
    // 처음에는 단순 평균, 그 뒤에는 지수 이동 평균
    const a = Math.max(1 / c, 1 - Math.pow(0.5, 1 / this.halfLifeSec));
    this.ema[key] = e === undefined ? notional : e + a * (notional - e);
    return e === undefined || e <= 0 ? 1 : idx;
  }
}

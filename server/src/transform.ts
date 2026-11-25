// 변환기 (GDD_v2 6.4): 가상 가격(t) = 가상 가격(t-1) × mid(t) / mid(t-1). 배수 1, 보정 없음.
// 지수: JQQ(t) = JQQ(t-1) × (1 + 구성원 1초 수익률의 평균). 구성원은 현재 출처가 가진 것만.
import type { SourceId } from './types.ts';

export type Mids = Record<string, number | undefined>;

export class Rebaser {
  readonly vprice: Record<string, number> = {};
  private lastMid: Record<string, number> = {};
  private tradable: string[];
  private indexId: string;
  private members: Record<SourceId, string[]>;

  constructor(
    start: Record<string, number>,
    indexId: string,
    members: Record<SourceId, string[]>,
  ) {
    this.indexId = indexId;
    this.members = members;
    Object.assign(this.vprice, start);
    this.tradable = Object.keys(start).filter((k) => k !== indexId);
  }

  /** 앵커를 지금 mid 로 다시 잡는다(출처 전환·정지 해제 뒤: 이어 붙임, 그 사이 움직임은 버린다). */
  reanchor(mids: Mids): void {
    this.lastMid = {};
    for (const [k, v] of Object.entries(mids)) if (v !== undefined && v > 0) this.lastMid[k] = v;
  }

  /** 새 mid 로 한 걸음. 돌려주는 값은 종목별 1초 수익률(비율 − 1, 지수 포함). */
  step(mids: Mids, source: SourceId): Record<string, number> {
    const ret: Record<string, number> = {};
    for (const k of Object.keys(mids)) {
      const m = mids[k];
      if (m === undefined || !(m > 0)) continue;
      const last = this.lastMid[k];
      ret[k] = last === undefined ? 0 : m / last - 1;
      if (last !== undefined && this.vprice[k] !== undefined) this.vprice[k] = this.vprice[k] * (m / last);
      this.lastMid[k] = m;
    }
    const mem = this.members[source].filter((k) => ret[k] !== undefined);
    const avg = mem.length ? mem.reduce((a, k) => a + ret[k], 0) / mem.length : 0;
    this.vprice[this.indexId] = this.vprice[this.indexId] * (1 + avg);
    ret[this.indexId] = avg;
    return ret;
  }

  prices(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const k of [...this.tradable, this.indexId]) o[k] = this.vprice[k];
    return o;
  }
}

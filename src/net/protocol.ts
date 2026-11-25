// 게임 서버 메시지의 모양 (GDD_v2 6.6). 앱이 아는 것은 가상 종목 id 와 가상 가격뿐이다.
import type { Bar, Tick } from '../engine/feed/types';
import type { MarketStatus } from '../engine/types';

export interface AvgCell { vol180: number; range180: number; range300s: number }
export interface HelloMsg {
  t: 'hello'; n: number; ts: number; epoch: number; st: MarketStatus; markets: string[];
  warm: { res: number; bars: Record<string, number[][]> };
  avg: Record<string, AvgCell>;
}
export interface TickMsg { t: 'k'; n: number; ts: number; st: MarketStatus; p: Tick['p'] }
export type ServerMsg = HelloMsg | TickMsg;

export const ST_NAMES: MarketStatus[] = ['open', 'delayed', 'halted'];

export const tickFromMsg = (m: { n: number; st: MarketStatus; p: Tick['p'] }): Tick => ({ n: m.n, st: m.st, p: m.p });

/** `/v1/bars` 응답의 종목별 행 → 엔진의 Bar 열(시간순). */
export function barsFromRows(rows: Record<string, number[][]>): Bar[] {
  const out: Bar[] = [];
  for (const [market, list] of Object.entries(rows)) {
    for (const r of list) out.push({ market, n0: r[0], o: r[1], h: r[2], l: r[3], c: r[4], vol: r[5], buy: r[6], st: ST_NAMES[r[7] ?? 0] });
  }
  return out.sort((a, b) => a.n0 - b.n0);
}

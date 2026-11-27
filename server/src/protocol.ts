// 앱으로 나가는 메시지 (GDD_v2 6.6). 여기서 만든 것만 밖으로 나간다 — 실제 가격·종목 이름·출처 이름이 없다.
import type { BarRecord, Cell, TickRecord } from './types.ts';
import { ST_CODE } from './types.ts';

const r = (x: number) => Number(x.toPrecision(9));
const cell = (c: Cell): Cell => [r(c[0]), Math.round(c[1] * 1000) / 1000, Math.round(c[2] * 1000) / 1000];

export function pricesOf(t: TickRecord, markets: string[]): Record<string, Cell> {
  const p: Record<string, Cell> = {};
  for (const m of markets) if (t.p[m]) p[m] = cell(t.p[m]);
  return p;
}

export function tickMessage(t: TickRecord, markets: string[]) {
  return { t: 'k' as const, n: t.n, ts: t.ts, st: t.st, p: pricesOf(t, markets) };
}

export type BarRow = [number, number, number, number, number, number, number, 0 | 1 | 2];
export const barRow = (b: BarRecord): BarRow => [b.n0, r(b.o), r(b.h), r(b.l), r(b.c), Math.round(b.vol * 1000) / 1000, Math.round(b.buy * 1000) / 1000, b.st];

export function groupBars(bars: BarRecord[], markets: string[]): Record<string, BarRow[]> {
  const out: Record<string, BarRow[]> = {};
  for (const m of markets) out[m] = [];
  for (const b of bars) if (out[b.market]) out[b.market].push(barRow(b));
  return out;
}

export interface HelloInput {
  n: number; ts: number; epoch: number; st: TickRecord['st'];
  markets: string[];
  warm: BarRecord[]; // 정산 봉 최근 480칸
  avg: Record<string, { vol180: number; range180: number; range300s: number }>;
  /** 최근 1분 봉 몇 개(U-55): 앱이 접속하자마자 "지금 출렁이는 곳"을 셈한다 */
  recent?: BarRecord[];
}
/** hello 에 싣는 최근 1분 봉 수 */
export const HELLO_RECENT_1M = 15;
export function helloMessage(h: HelloInput) {
  const bars = groupBars(h.warm, h.markets);
  // hello 의 warm 은 [n0,o,h,l,c,vol,buy] (st 칸 없음)
  const warmBars: Record<string, number[][]> = {};
  for (const m of h.markets) warmBars[m] = bars[m].map((x) => x.slice(0, 7) as number[]);
  const msg = { t: 'hello' as const, n: h.n, ts: h.ts, epoch: h.epoch, st: h.st, markets: h.markets, warm: { res: 180, bars: warmBars }, avg: h.avg };
  if (!h.recent) return msg;
  // min1 은 [n0,o,h,l,c] (끝난 분만, 시간순)
  const rec = groupBars(h.recent, h.markets);
  const min1: Record<string, number[][]> = {};
  for (const m of h.markets) min1[m] = rec[m].map((x) => x.slice(0, 5) as number[]);
  return { ...msg, min1 };
}

export function timeMessage(n: number, ts: number, st: TickRecord['st'], epoch: number) {
  return { n, ts, st, epoch };
}
export { ST_CODE };

import type { EventLogItem, GameState, RunState, Notice, DayTime } from './types';
import { balance } from './data';

export const comma = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const signed = (n: number) => (n >= 0 ? '+' : '-') + comma(Math.abs(n));

export const timeOfDay = (run: RunState): DayTime => (run.settleNo % balance.settlement.dayCycleSettlements) as DayTime;
export const isNight = (run: RunState) => timeOfDay(run) === 3;

/** 속보 띠·말풍선용 알림. 최근 20개만 남긴다. */
export function notify(run: RunState, text: string, kind: Notice['kind'] = 'info', id = ''): void {
  run.notices.push({ id: id || `n${run.tick}:${run.notices.length}`, kind, text, tick: run.tick });
  if (run.notices.length > 20) run.notices.shift();
}

/** 사건 기록(최근 12개). GDD_v2 4.9 */
export function logEvent(run: RunState, kind: string, text: string, amount?: number): void {
  const item: EventLogItem = { kind, at: { tick: run.tick, settleNo: run.settleNo, time: timeOfDay(run) }, text };
  if (amount !== undefined) item.amount = amount;
  run.eventLog.push(item);
  if (run.eventLog.length > 12) run.eventLog.shift();
  if (run.report) run.report.push({ tick: run.tick, kind, text, ...(amount !== undefined ? { amount } : {}) });
}

export function lastLogKinds(run: RunState, n: number): string[] {
  return run.eventLog.slice(-n).map((e) => e.kind);
}
export type { GameState };

/** 좁은 곳용 큰 수 줄임(내림). 9,500 / 1.2만 / 3,400만 / 1.5억 */
export function abbrev(n: number): string {
  const x = Math.floor(n + 1e-9);
  if (x < 10000) return x.toLocaleString('ko-KR');
  const fmt = (v: number, unit: string) => {
    if (v >= 100) return Math.floor(v).toLocaleString('ko-KR') + unit;
    const f = Math.floor(v * 10 + 1e-9) / 10;
    return (Number.isInteger(f) ? String(f) : f.toFixed(1)) + unit;
  };
  return x < 100000000 ? fmt(x / 10000, '만') : fmt(x / 100000000, '억');
}

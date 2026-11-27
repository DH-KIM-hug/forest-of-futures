import type { EventLogItem, GameState, RunState, Notice, DayTime } from './types';
import { balance } from './data';

export const comma = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const signed = (n: number) => (n >= 0 ? '+' : '-') + comma(Math.abs(n));

/** 하루 = dayCycleSettlements 번의 정산, 아침 · 낮 · 저녁 · 밤이 똑같이 나눠 갖는다(U-47: 12번, 셋씩) */
export const timeOfDay = (run: RunState): DayTime => { const c = balance.settlement.dayCycleSettlements; return Math.min(3, Math.floor(((run.settleNo % c) * 4) / c)) as DayTime; };
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

/** 받침에 맞는 조사를 붙인다: josa('쳇바퀴', '이', '가') → '쳇바퀴가', josa('지갑', '이', '가') → '지갑이'. 한글로 끝나지 않으면(숫자 등) 읽는 소리로 가린다. */
export function josa(word: string, withBatchim: string, without: string): string {
  const ch = word.trim().slice(-1);
  let has: boolean;
  if (ch >= '가' && ch <= '힣') has = (ch.charCodeAt(0) - 0xac00) % 28 !== 0;
  else has = '013678'.includes(ch); // 영·일·삼·육·칠·팔 은 받침이 있다
  return word + (has ? withBatchim : without);
}

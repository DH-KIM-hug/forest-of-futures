// 시제품(?proto=1)의 저장(U-55). 새로 고쳐도 생이 이어진다.
//   - 엔진 상태(GameState)는 engine/save.ts 의 migrate 로 읽는다(버전 사슬, 모자란 칸 채우기, 깨진 것 거르기를 그대로 쓴다)
//   - 거기에 화면 쪽 생의 기록(튜토리얼 끝, 등급 도장, 최고의 판 …)과 주문 칸, 시세 출처가 이어 붙일 값(틱 번호, 실제 값)을 한 봉투에 담는다
//   - 주소 값마다 키가 다르다: 장면 건너뛰기(&pdev), 다시 보기(&prologue=1), 치트(&cheat)는 읽지도 쓰지도 않는다. &e2e, &fast, 시세 출처(feed)는 저마다 다른 키
//   - 떠난 동안: 실시간 시세는 거래소의 진짜 1분 봉으로, 연습 시세는 그 시간만큼 돌린 연습 봉으로 엔진 따라잡기(offline.ts catchUp)를 돌린다
import { migrate } from '../../engine/save';
import { barsFromTicks } from '../../engine/feed/simFeed';
import { catchUp } from '../../engine/offline';
import { stepMut } from '../../engine/game';
import type { Tick } from '../../engine/feed/types';
import type { AwayReport, GameState } from '../../engine/types';

export const PROTO_SAVE_VERSION = 1;
export const PROTO_SAVE_BASE = 'fof.proto.save';
export const PROTO_BROKEN_KEY = 'fof.proto.save.broken';
export const SAVE_BROKEN_NOTICE = '지난 기록을 읽지 못해 새 생으로 시작한다.';
export const SAVE_OLD_NOTICE = '지난 기록이 이번 판과 맞지 않아 새 생으로 시작한다.';
/** 연습 시세로 떠난 시간을 메울 때 이보다 길면 끝의 이만큼만 돌린다(초) */
export const SIM_AWAY_CAP = 6 * 3600;
/** 이보다 짧게 비웠으면 보고서 없이 틱을 그대로 돌린다(초) */
export const AWAY_REPORT_MIN = 60;

/** 이 주소에서 쓸 저장 키. null = 저장을 읽지도 쓰지도 않는다 */
export function protoSaveKey(search: string): string | null {
  const q = new URLSearchParams(search);
  if (q.get('pdev') || q.get('prologue') === '1' || q.get('cheat') === '1') return null;
  const feed = q.get('feed') || 'hl';
  return `${PROTO_SAVE_BASE}:${feed}${q.get('fast') === '1' ? ':fast' : ''}${q.get('e2e') === '1' ? ':e2e' : ''}${q.get('lite') === '1' ? ':lite' : ''}`;
}

/** 화면 쪽 생의 기록 중 저장하는 것. 장면, 알림, 터지는 화면 같은 그 순간의 것은 넣지 않는다 */
export const PROTO_KEEP = [
  'tab', 'visited', 'everUnlocked', 'goalIdx', 'everOpened', 'seen', 'cutCount', 'negSettles', 'wins', 'closes',
  'winStreak', 'lossStreak', 'tinyStreak', 'feesLife', 'negRun', 'odSeen', 'loanTaken', 'sentAwayAt', 'tutorial', 'slotOf', 'gen',
  'firstTry', 'frxStamps', 'bestWin', 'bestTrade', 'rankSeen', 'clueAt', 'tradeLife', 'claimWins', 'paidLife',
  'rolled', 'rolledKey', 'rolledTaps', 'claimWinRun', 'claimLossRun', 'claimRunSum',
  'quests', 'rivals',
] as const;
export type ProtoKept = Partial<Record<(typeof PROTO_KEEP)[number], unknown>>;

/** 시세 출처가 이어 붙일 값: 마지막 틱 번호, 그때의 실제 값(실시간 시세만), 그때 쓰던 출처 */
export interface FeedMark { kind: 'hl' | 'sim' | 'server' | 'replay'; n: number; mids: Record<string, number>; /** 연습 시세의 날다람쥐 기준 시각(U-56 ②) */ fly?: number }
export interface ProtoEnvelope {
  v: number;
  /** 저장한 시각(ms) */ at: number;
  feed: FeedMark;
  g: GameState;
  p: ProtoKept;
  trade: Record<string, unknown> | null;
  /** 연습 시세의 지난 몇 분(차트가 새로 고친 뒤에도 비지 않게). 실시간 시세는 거래소에서 다시 받는다 */
  hist?: Record<string, number[]>;
}
/** 차트 기록을 몇 초어치 담는가 */
export const HIST_KEEP = 240;

export function pickProto(P: Record<string, unknown>): ProtoKept {
  const out: ProtoKept = {};
  for (const k of PROTO_KEEP) if (P[k] !== undefined) out[k] = P[k];
  return out;
}

/** 지금 저장해도 되는 순간인가: 첫 생의 튜토리얼(짜 둔 시세, 폰이 울리는 장면)이 끝났고, 고르는 장면이나 문 앞의 추심원이 없다 */
export function canSaveNow(g: GameState, P: { prologue: boolean; tutorial: string; waiting: boolean; forceTrade: boolean; scenes: { choices?: unknown[] }[] }, lifeNo: number): boolean {
  if (P.prologue || P.waiting || P.forceTrade) return false;
  if (lifeNo <= 1 && P.tutorial !== 'done') return false;
  if (!g.run.over && P.scenes.some((s) => s.choices && s.choices.length)) return false;
  return true;
}

export function pack(o: { g: GameState; p: ProtoKept; trade: Record<string, unknown> | null; feed: FeedMark; now: number; hist?: Record<string, number[]> }): string {
  const env: ProtoEnvelope = { v: PROTO_SAVE_VERSION, at: o.now, feed: o.feed, g: { ...o.g, savedAt: o.now }, p: o.p, trade: o.trade };
  if (o.hist) env.hist = Object.fromEntries(Object.entries(o.hist).map(([k, v]) => [k, v.slice(-HIST_KEEP)]));
  return JSON.stringify(env);
}

export type Unpacked = { ok: true; env: ProtoEnvelope } | { ok: false; why: 'none' | 'broken' | 'old' };
/** 봉투를 연다. 버전이 다르면 old, 읽을 수 없으면 broken */
export function unpack(raw: string | null): Unpacked {
  if (raw === null || raw === '') return { ok: false, why: 'none' };
  let x: any;
  try { x = JSON.parse(raw); } catch { return { ok: false, why: 'broken' }; }
  if (!x || typeof x !== 'object' || typeof x.v !== 'number') return { ok: false, why: 'broken' };
  if (x.v !== PROTO_SAVE_VERSION) return { ok: false, why: 'old' };
  const g = migrate(x.g);
  if (!g || !x.p || typeof x.p !== 'object' || !x.feed || typeof x.feed.n !== 'number' || typeof x.at !== 'number') return { ok: false, why: 'broken' };
  const feed: FeedMark = { kind: x.feed.kind ?? 'hl', n: x.feed.n, mids: x.feed.mids && typeof x.feed.mids === 'object' ? x.feed.mids : {} };
  const hist = x.hist && typeof x.hist === 'object' ? Object.fromEntries(Object.entries(x.hist).filter(([, v]) => Array.isArray(v) && (v as unknown[]).every((n) => typeof n === 'number' && n > 0)) as [string, number[]][]) : undefined;
  return { ok: true, env: { v: x.v, at: x.at, feed, g, p: pickProto(x.p), trade: x.trade && typeof x.trade === 'object' ? x.trade : null, hist } };
}

/** 연습 시세로 떠난 시간을 메운다(제자리 수정). next = 연습 시세의 다음 틱. 짧으면 틱을 그대로 돌리고 null, 길면 1분 봉으로 엔진 따라잡기를 돌리고 그 보고서 */
export function simCatchUp(g: GameState, next: () => Tick, awaySec: number): AwayReport | null {
  const sec = Math.floor(Math.max(0, Math.min(awaySec, SIM_AWAY_CAP)));
  if (sec < 1 || g.run.over) return null;
  if (sec < AWAY_REPORT_MIN) {
    for (let i = 0; i < sec && !g.run.over; i++) stepMut(g, { type: 'tick', tick: next() });
    return null;
  }
  const ticks: Tick[] = [];
  for (let i = 0; i < sec; i++) ticks.push(next());
  const from = ticks[0].n, to = ticks[ticks.length - 1].n;
  const bars = barsFromTicks(ticks, 60, from, to).filter((b) => b.n0 >= from);
  g.run.lastSeenTick = from - 1;
  // 끝의 몇 초(꽉 차지 않은 봉)는 마지막 틱 값으로 잇는다
  const r = catchUp(g, bars, Math.floor(awaySec));
  const last = ticks[ticks.length - 1];
  if (!g.run.over) for (const [id, c] of Object.entries(last.p)) g.run.prices[id] = c[0];
  g.run.lastSeenTick = last.n;
  return r;
}

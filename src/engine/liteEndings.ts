// 라이트 모드(?proto=1&lite=1)의 배드 엔딩 40개(data/endings_lite.json, 문서 docs/gdd/LITE_ENDINGS.md).
// 조건 퍼즐이 없다. 죽은 생에서 읽기 쉬운 사실 몇 개를 꼬리표로 뽑고(tags), 엔딩마다 기본 무게 1 + 맞는 꼬리표의 무게를 더해 제비를 뽑는다.
// 이미 본 엔딩은 무게에 seenMul 을 곱한다(새 엔딩이 자주 나오게). 도감은 family.liteBook(생과 저장을 넘어 남는다).
// 라이트가 아닌 생은 이 파일을 지나지 않는다(endings.ts finalizeEnding 의 첫 줄이 run.lite 만 이리 보낸다).
import liteEndingsJson from '../../data/endings_lite.json';
import { lenderLimit, netWorth, totalDebt } from './selectors';
import type { GameState, LenderId, Position } from './types';

export interface LiteEndingDef { id: string; title: string; lines: string[]; w: Record<string, number>; cast: string[]; death?: boolean }
const DATA = liteEndingsJson as unknown as { seenMul: number; endings: LiteEndingDef[] };
export const liteEndings: LiteEndingDef[] = DATA.endings;
export const liteEndingById: Record<string, LiteEndingDef> = Object.fromEntries(liteEndings.map((e) => [e.id, e]));
export const LITE_SEEN_MUL = DATA.seenMul;
export const LITE_ENDING_TOTAL = liteEndings.length;

/** 라이트 생의 시작 순자산(손 0, 코인 빚 30만). 한때 이보다 20만 넘게 올랐으면 peak:high */
export const LITE_START_NW = -300_000;
export const PEAK_HIGH_GAIN = 200_000;
/** 생의 길이(초) 경계: 5분 안 = short, 20분 넘게 = long */
export const LIFE_SHORT_SEC = 300, LIFE_LONG_SEC = 1200;

export type LiteMode = 'liq' | 'locked' | 'overdue';
export interface LiteFacts {
  /** liq = 한도까지 빌린 뒤 몰빵 청산으로 그 자리 파산, locked = 판을 쥔 채 이자를 못 냄, overdue = 연체 한도 */
  mode: LiteMode;
  /** 빌릴 곳이 다 막혔다(만난 대부업체의 남은 한도가 모두 0) */
  maxed: boolean;
  lender: LenderId | null;
  coin: string | null;
  dir: 'long' | 'short' | null;
  lev: 'low' | 'mid' | 'high' | null;
  life: 'short' | 'mid' | 'long';
  clock: 'dawn' | 'morning' | 'day' | 'night';
  peakHigh: boolean;
}

const LENDERS: LenderId[] = ['shark1', 'shark2', 'capital', 'bank'];

export const levBand = (lev: number): 'low' | 'mid' | 'high' => (lev <= 20 ? 'low' : lev >= 100 ? 'high' : 'mid');
export const clockBand = (h: number): LiteFacts['clock'] => (h < 6 ? 'dawn' : h < 12 ? 'morning' : h < 18 ? 'day' : 'night');
export const lifeBand = (sec: number): LiteFacts['life'] => (sec < LIFE_SHORT_SEC ? 'short' : sec > LIFE_LONG_SEC ? 'long' : 'mid');

/** 마지막 판: 열린 판이 있으면 그중 가장 크게 건 것, 없으면 거래 기록의 마지막 줄 */
function lastTrade(g: GameState): { market: string; dir: 1 | -1; lev: number } | null {
  const open = Object.values(g.run.positions) as Position[];
  if (open.length) { const p = open.reduce((a, b) => (b.margin > a.margin ? b : a)); return { market: p.market, dir: p.dir, lev: p.lev }; }
  const log = g.run.tradeLog as { market?: string; dir?: 1 | -1; lev?: number }[];
  for (let i = log.length - 1; i >= 0; i--) { const t = log[i]; if (t?.market && t.dir && t.lev) return { market: t.market, dir: t.dir, lev: t.lev }; }
  return null;
}

/** 죽은 생에서 읽기 쉬운 사실들(파산을 선언한 바로 그 판에서 부른다). now = 기기 시계 */
export function liteFacts(g: GameState, now: Date = new Date()): LiteFacts {
  const run = g.run;
  const b = run.bankruptcy;
  const onTable = Object.values(run.positions).reduce((a, p) => a + p.margin, 0);
  const mode: LiteMode = b?.immediate ? 'liq' : onTable >= 1000 ? 'locked' : 'overdue';
  let lender: LenderId | null = null, most = 0;
  for (const id of LENDERS) if (run.debts[id].principal > most) { most = run.debts[id].principal; lender = id; }
  const met = LENDERS.filter((id) => run.debts[id].principal > 0 || ((run.stats[`borrow.${id}`] as number | undefined) ?? 0) > 0);
  const maxed = met.length > 0 && met.every((id) => lenderLimit(g, id) - run.debts[id].principal <= 0);
  const t = lastTrade(g);
  const peak = Math.max(run.peakNetWorth, netWorth(run));
  return {
    mode, maxed, lender,
    coin: t?.market ?? null, dir: t ? (t.dir === 1 ? 'long' : 'short') : null, lev: t ? levBand(t.lev) : null,
    life: lifeBand(run.tick - run.startTick), clock: clockBand(now.getHours()), peakHigh: peak - LITE_START_NW >= PEAK_HIGH_GAIN,
  };
}

/** 사실 → 꼬리표 목록(엔딩의 w 열쇠와 같은 말) */
export function factTags(f: LiteFacts): string[] {
  const t = [`mode:${f.mode}`, `life:${f.life}`, `clock:${f.clock}`];
  if (f.maxed) t.push('maxed');
  if (f.lender) t.push(`lender:${f.lender}`);
  if (f.coin) t.push(`coin:${f.coin}`);
  if (f.dir) t.push(`dir:${f.dir}`);
  if (f.lev) t.push(`lev:${f.lev}`);
  if (f.peakHigh) t.push('peak:high');
  return t;
}

/** 엔딩 하나의 무게: 1 + 맞는 꼬리표의 무게, 본 적 있으면 × seenMul */
export function liteWeight(e: LiteEndingDef, tags: string[], seen: boolean): number {
  let w = 1;
  for (const k of tags) w += e.w[k] ?? 0;
  return seen ? w * LITE_SEEN_MUL : w;
}

/** 무게대로 하나. r = [0, 1) */
export function pickLite(tags: string[], book: Record<string, unknown>, r: number): LiteEndingDef {
  const ws = liteEndings.map((e) => liteWeight(e, tags, !!book[e.id]));
  const sum = ws.reduce((a, b) => a + b, 0);
  let x = r * sum;
  for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x < 0) return liteEndings[i]; }
  return liteEndings[liteEndings.length - 1];
}

/** 씨앗과 세대와 틱으로 섞은 [0, 1) (같은 판이면 같은 엔딩: 시험이 재현된다) */
export function liteRoll(seed: number, gen: number, tick: number, salt = 0): number {
  let h = (seed ^ 0x9e3779b9) + gen * 0x85ebca6b + tick * 0xc2b2ae35 + salt * 0x27d4eb2f;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface LiteBookEntry { count: number; firstAt: number }
/** 도감에 적는다. 처음이면 true */
export function recordLite(book: Record<string, LiteBookEntry>, id: string, gen: number): boolean {
  const prev = book[id];
  if (prev) { prev.count += 1; return false; }
  book[id] = { count: 1, firstAt: gen };
  return true;
}

/** 라이트 파산의 엔딩을 고른다(사실, 꼬리표, 엔딩). totalDebt 는 카드의 숫자용 */
export function chooseLiteEnding(g: GameState, now: Date = new Date()): { ending: LiteEndingDef; facts: LiteFacts; tags: string[]; debt: number } {
  const facts = liteFacts(g, now);
  const tags = factTags(facts);
  const book = g.family.liteBook ?? {};
  const ending = pickLite(tags, book, liteRoll(g.run.seed, g.family.generation, g.run.tick, now.getMinutes()));
  return { ending, facts, tags, debt: totalDebt(g.run) };
}

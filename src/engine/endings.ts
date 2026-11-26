// 엔딩 판정·선택·미리보기·한 끗 차이·도감 표시·장부 기록(GDD_v2 3.15, 3.16).
import { balance, endingById, endings, heirloomDefs, traitDefs, type EndingDef } from './data';
import { buildSnapshot, type SnapCtx } from './snapshot';
import { forecast } from './settlement';
import { determineCause } from './bankruptcy';
import { netWorth } from './selectors';
import type { GameState, PendingEnding, PayId } from './types';

type Snap = Record<string, any>;

// ── 조건 평가 ───────────────────────────────────────────────────────────
function evalExpr(expr: string, snap: Snap): number | null {
  let v = 1;
  for (const tok of expr.split('*').map((s) => s.trim())) {
    let x: unknown = /^-?\d+(\.\d+)?$/.test(tok) ? Number(tok) : tok === 'tp' ? snap._tpRoe : snap[tok];
    if (typeof x !== 'number') return null;
    v *= x;
  }
  return v;
}
function rhs(val: any, snap: Snap): any {
  return val && typeof val === 'object' && 'expr' in val ? evalExpr(val.expr, snap) : val;
}

export function evalCond(c: [string, string, any], snap: Snap): boolean {
  const [key, op, raw] = c;
  const a = snap[key];
  const b = rhs(raw, snap);
  if (a === null || a === undefined || b === null || b === undefined) return false;
  switch (op) {
    case '=': return typeof a === 'boolean' || typeof b === 'boolean' ? a === b : typeof a === 'number' && typeof b === 'number' ? a === b : String(a) === String(b);
    case '!=': return String(a) !== String(b);
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '<': return a < b;
    case 'has': return Array.isArray(a) && a.includes(b);
    case 'in': {
      if (Array.isArray(b)) {
        // 'grudge' 는 '원한 품은 채권처 집합에 든다'는 뜻
        return b.some((x: string) => (x === 'grudge' ? (snap.grudge as string[]).includes(String(a)) : String(a) === x));
      }
      if (b && typeof b === 'object' && 'min' in b) return typeof a === 'number' && a >= b.min && a <= b.max;
      return false;
    }
  }
  return false;
}
export const evalAll = (e: EndingDef, snap: Snap): boolean => e.conditions.every((c) => evalCond(c, snap));
export const candidatesFor = (snap: Snap, cause: string): EndingDef[] => endings.filter((e) => e.causes.includes(cause) && evalAll(e, snap));

const cmp = (a: EndingDef, b: EndingDef) => b.conditions.length - a.conditions.length || b.rarity - a.rarity || a.no - b.no;
/** 미수집 중 조건 수가 많은 것 -> 희귀도 높은 것 -> 번호 작은 것. 전부 수집했으면 같은 순서로 하나를 다시. */
export function chooseEnding(cands: EndingDef[], collected: Set<string>): { ending: EndingDef; via: 'normal' | 'repeat' } {
  const fresh = cands.filter((e) => !collected.has(e.id)).sort(cmp);
  if (fresh.length) return { ending: fresh[0], via: 'normal' };
  return { ending: [...cands].sort(cmp)[0], via: 'repeat' };
}

/** 1막 시제품(balance.act1, U-38)에 없는 것을 말하는 엔딩인가: 친구·정보·세금·조합·집·대물림은 1막에 없고, 독사·캐피탈은 실제로 빌린 생에만 나온다.
 *  (엔딩 200개는 2막 이후까지의 것이다. 하지 않은 일이 엔딩 문구에 나오지 않게 거른다.) */
const ACT1_NEVER = /친구|단짝|절교|곰 형|토끼|여우|추천인|리딩방|전단지|속보|소문|세무서|세금|증여|조합|은행|금융|부엉이|지점장|담보|LTV|저택|별장|아파트|통나무|오두막에 사는|이사|아버지|할아버지|부모|자식|손주|대물림|가업|가문|세대|유산|3대|월세|텐트|수레|모니터/;
export function act1Coherent(e: EndingDef, g: GameState): boolean {
  if (!(balance as { act1?: unknown }).act1) return true;
  const t = e.title + ' ' + e.line;
  if (ACT1_NEVER.test(t)) return false;
  const st = g.run.stats;
  if (/독사|뒷골목|밤시장/.test(t) && !((st['borrow.shark2'] as number | undefined) ?? 0)) return false;
  if (/캐피탈|족제비/.test(t) && !((st['borrow.capital'] as number | undefined) ?? 0) && g.run.debts.capital.principal <= 0) return false;
  return true;
}

function pick(g: GameState, snap: Snap, cause: string) {
  const collected = new Set(Object.keys(g.family.ledger));
  let cands = candidatesFor(snap, cause).filter((e) => act1Coherent(e, g));
  if (!cands.length) cands = endings.filter((e) => e.causes.includes(cause) && e.base && act1Coherent(e, g));
  if (!cands.length) cands = endings.filter((e) => e.causes.includes(cause) && e.base);
  return { ...chooseEnding(cands, collected), cands };
}

// ── 이대로 가면 / 한 끗 차이 ────────────────────────────────────────────
/** 지금 파산한다고 가정했을 때 고를 엔딩(기록관 등불). 마지막 연체처는 가장 연체가 깊은 곳, 없으면 가장 큰 사채·캐피탈. */
export function previewEnding(g: GameState): { ending: EndingDef; isNew: boolean; cause: string; lantern: boolean } {
  const run = g.run;
  let lender: PayId | null = null;
  let worst = 0;
  for (const id of ['shark2', 'shark1', 'capital', 'bank'] as const) {
    if (run.debts[id].overdue > worst) {
      worst = run.debts[id].overdue;
      lender = id;
    }
  }
  if (!lender && run.upkeepOverdue > 0) lender = 'upkeep';
  if (!lender) lender = run.debts.shark2.principal > 0 ? 'shark2' : run.debts.shark1.principal > 0 ? 'shark1' : run.debts.capital.principal > 0 ? 'capital' : run.debts.bank.principal > 0 ? 'bank' : 'capital';
  const f = forecast(g);
  const ctx = { lastLender: lender, shortfall: Math.max(0, f.interest + f.living) };
  const cause = determineCause(g, ctx);
  const snap = buildSnapshot(g, { cause, ...ctx });
  const { ending } = pick(g, snap, cause);
  const isNew = !g.family.ledger[ending.id];
  return { ending, isNew, cause, lantern: isNew };
}

export const condText = (c: [string, string, any]): string => `${c[0]} ${c[1]} ${typeof c[2] === 'object' && c[2] && 'expr' in c[2] ? c[2].expr : Array.isArray(c[2]) ? c[2].join('|') : c[2] && typeof c[2] === 'object' ? `${c[2].min}..${c[2].max}` : c[2]}`;

/** 조건 하나만 달랐으면 받았을 미수집 엔딩(같은 원인, 최대 2개). */
export function nearMisses(g: GameState, snap: Snap, cause: string, exclude?: string): { id: string; hint: string; missing: string }[] {
  const out: { e: EndingDef; missing: string }[] = [];
  for (const e of endings) {
    if (e.id === exclude || !e.causes.includes(cause) || g.family.ledger[e.id] || !e.conditions.length) continue;
    const failed = e.conditions.filter((c) => !evalCond(c, snap));
    if (failed.length === 1) out.push({ e, missing: condText(failed[0]) });
  }
  out.sort((a, b) => b.e.rarity - a.e.rarity || a.e.no - b.e.no);
  return out.slice(0, 2).map((x) => ({ id: x.e.id, hint: x.e.clue, missing: x.missing }));
}

// ── 도감(기록관) 표시 데이터 ────────────────────────────────────────────
export interface ArchiveEntry {
  id: string;
  no: number;
  collected: boolean;
  title: string; // 미수집은 ???
  causes: string[];
  clue: string;
  clueVisible: boolean;
  conditionsView: string[]; // 가려진 조건은 '?'
  hiddenIndex: number | null;
  unlockedByNeighbor: boolean;
  holders: { gen: number; name: string }[];
  line: string | null;
}
export function neighborsOf(e: EndingDef): EndingDef[] {
  const keys = new Set(e.conditions.map((c) => c[0]));
  return endings.filter((o) => o.id !== e.id && o.causes.some((c) => e.causes.includes(c)) && o.conditions.some((c) => keys.has(c[0])));
}
export function archiveEntry(g: GameState, e: EndingDef): ArchiveEntry {
  const led = g.family.ledger[e.id];
  const collected = !!led;
  const unlocked = e.rarity === 3 && e.hiddenCondIndex !== null ? neighborsOf(e).some((o) => g.family.ledger[o.id]) : true;
  const hide = !collected && e.rarity === 3 && e.hiddenCondIndex !== null && !unlocked;
  return {
    id: e.id, no: e.no, collected, title: collected ? e.title : '???', causes: e.causes, clue: e.clue, clueVisible: !hide,
    conditionsView: e.conditions.map((c, i) => (hide && i === e.hiddenCondIndex ? `${c[0]} ?` : condText(c))),
    hiddenIndex: hide ? e.hiddenCondIndex : null, unlockedByNeighbor: e.rarity === 3 && unlocked,
    holders: led?.holders ?? [], line: collected ? e.line : null,
  };
}

export const fillLine = (line: string, snap: Snap): string => line.replace(/\{(\w+)\}/g, (_, k) => String(snap[k] ?? ''));

// ── 파산 -> 엔딩 확정 ───────────────────────────────────────────────────
export function finalizeEnding(g: GameState, ctx: SnapCtx & { settleNo?: number }): PendingEnding {
  const run = g.run;
  const f = g.family;
  const snap = buildSnapshot(g, ctx);
  const { ending, via } = pick(g, snap, ctx.cause);
  const prev = f.ledger[ending.id];
  const isNew = !prev;
  const lastThree = run.eventLog.slice(-3);
  const misses = nearMisses(g, snap, ctx.cause, ending.id);
  const before = Object.keys(f.ledger).filter((id) => endingById[id].causes.includes(ctx.cause)).length;
  if (!prev) f.ledger[ending.id] = { count: 1, holders: [{ gen: f.generation, name: g.settings.name }], firstAt: f.generation, scenes: lastThree };
  else {
    prev.count += 1;
    prev.holders.push({ gen: f.generation, name: g.settings.name });
  }
  const nth = f.ledger[ending.id].count;
  const after = Object.keys(f.ledger).filter((id) => endingById[id].causes.includes(ctx.cause)).length;
  const nw = Math.max(run.peakNetWorth, netWorth(run));
  f.peakNetWorth = Math.max(f.peakNetWorth, nw);
  f.lineage.push({ gen: f.generation, name: g.settings.name, endedBy: ending.id, branch: run.branch, peak: nw });
  const fs = f.stats;
  const add = (k: string, v: number) => (fs[k] = (fs[k] ?? 0) + v);
  add('bankruptcies', 1);
  if (ctx.cause === 'TIP') add('bankruptcies.TIP', 1);
  for (const c of ['FRIEND', 'SHARK', 'LIQ', 'TIP', 'BANK', 'UPKEEP', 'SEIZE', 'LEGACY']) fs[`sameCause.${c}`] = c === ctx.cause ? (fs[`sameCause.${c}`] ?? 0) + 1 : 0;
  add('liqs', run.stats.liqCount ?? 0);
  add('taps', run.stats.laborTaps ?? 0);
  add('brokenTotal', run.stats.friendsBroken ?? 0);
  fs.maxLoss = Math.max(fs.maxLoss ?? 0, run.stats.maxLossRun ?? 0);
  const trait = traitDefs.find((t) => t.cause === ctx.cause) ?? null;
  const heir = heirloomDefs.find((h) => h.cause === ctx.cause);
  const level = (n: number) => (heir ? heir.thresholds.filter((t: number) => n >= t).length : 0);
  const heirloom = heir && level(after) > level(before) ? `${heir.name} ${level(after)}단계` : null;
  const pending: PendingEnding = {
    id: ending.id, cause: ctx.cause, isNew, via, nth, title: ending.title, line: fillLine(ending.line, snap), lastThree,
    nearMisses: misses, nextGen: { trait: trait?.name ?? null, trace: ending.trace, heirloom },
    collected: Object.keys(f.ledger).length, peakNetWorth: nw, settleNo: run.settleNo, offline: snap.offline === true,
    awayHours: snap.awayHours ?? null, snapshot: snap,
  };
  g.pendingEnding = pending;
  return pending;
}

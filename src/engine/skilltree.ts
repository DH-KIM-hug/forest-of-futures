// 영구 스킬트리: 거래 한 갈래(docs/gdd/SKILLTREE_TRADE.md, DECISIONS_LOG U-35 ④).
// 원칙: 어떤 노드도 시세·청산 공식·이길 확률을 바꾸지 않는다. 바꾸는 것은 비용(수수료), 도구, 망할 때의 모양뿐.
// 가문(family.skill) = 가진 레벨. 생(run.skill) = 그 생이 시작될 때 뜬 사본 — 그 생에 산 노드는 다음 생부터 켜진다.
import { balance, skillById, skillMeta, skillNodes, type SkillNodeDef } from './data';
import { logEvent } from './util';
import type { GameState, Res, RunState } from './types';

type PathId = 'A' | 'B' | 'C';
const no = (code: string, msg: string): Res => ({ ok: false, code, msg });

// ── 값과 효과(순수) ─────────────────────────────────────────────────────
/** 레벨 level → level+1 의 값. 열기(0→1) = openCost, 그 뒤 = ceil(openCost × levelMul^level). */
export function costAt(def: SkillNodeDef, level: number): number {
  return level <= 0 ? def.openCost : Math.ceil(def.openCost * Math.pow(skillMeta.levelMul, level) - 1e-9);
}
/** scaled 노드의 효과 = cap × (1 − decay^레벨). 상한에 다가갈 뿐 닿지 않는다. binary 는 0/1. */
export function effectAt(def: SkillNodeDef, level: number): number {
  if (level <= 0) return 0;
  return def.kind === 'scaled' ? (def.cap ?? 0) * (1 - Math.pow(skillMeta.decay, level)) : 1;
}
/** 켜고 끄는 노드의 숫자 꼬리 = tail.cap × (1 − decay^레벨). 꼬리가 없으면 0. 도구는 Lv1 에서 켜지고, 꼬리만 끝없이 자란다(U-39 ⑨). */
export function tailAt(def: SkillNodeDef, level: number): number {
  if (level <= 0 || !def.tail) return 0;
  return def.tail.cap * (1 - Math.pow(skillMeta.decay, level));
}
export const maxLevelOf = (def: SkillNodeDef): number => def.maxLevel ?? (def.kind === 'binary' && !def.tail ? 1 : Infinity);

// ── 가문: 가진 것 ───────────────────────────────────────────────────────
/** 가문이 가진 레벨(0 = 없음). */
export const nodeLevel = (g: GameState, id: string): number => g.family.skill?.[id] ?? 0;
/** 다음 레벨의 값. 더 올릴 수 없으면 null. */
export function nextCost(g: GameState, id: string): number | null {
  const def = skillById[id];
  if (!def) return null;
  const lv = nodeLevel(g, id);
  return lv >= maxLevelOf(def) ? null : costAt(def, lv);
}
export function canBuy(g: GameState, id: string): { ok: boolean; reason?: string } {
  const def = skillById[id];
  if (!def) return { ok: false, reason: '없는 노드입니다.' };
  const cost = nextCost(g, id);
  if (cost === null) return { ok: false, reason: '더 올릴 수 없습니다.' };
  if (def.requires.length && !def.requires.some((r) => nodeLevel(g, r) > 0)) return { ok: false, reason: '앞 노드를 먼저 열어야 합니다.' };
  if ((g.family.gold ?? 0) < cost) return { ok: false, reason: '황금 도토코인이 모자랍니다.' };
  return { ok: true };
}
/** 황금 도토코인을 내고 레벨 +1. 3단계 노드는 사면 그 길의 고른 것이 된다. */
export function buyNode(g: GameState, id: string): Res {
  const c = canBuy(g, id);
  if (!c.ok) return no('tree', c.reason!);
  const def = skillById[id];
  const cost = nextCost(g, id)!;
  g.family.gold -= cost;
  g.family.skill[id] = nodeLevel(g, id) + 1;
  if (def.pair) g.family.skillPick[def.path as PathId] = id;
  return { ok: true, amount: cost };
}
/** 3단계 둘 중 다음 생에 켤 것을 고른다(가진 것만). */
export function pickNode(g: GameState, id: string): Res {
  const def = skillById[id];
  if (!def || !def.pair) return no('tree', '고를 수 있는 노드가 아닙니다.');
  if (nodeLevel(g, id) <= 0) return no('tree', '아직 열지 않은 노드입니다.');
  g.family.skillPick[def.path as PathId] = id;
  return { ok: true };
}
/** 다음 생에 켜질 레벨: 가진 것에서 3단계의 고르지 않은 쪽을 뺀다. */
export function activeLevels(g: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of skillNodes) {
    const lv = nodeLevel(g, def.id);
    if (lv <= 0) continue;
    if (def.pair) {
      const pick = g.family.skillPick?.[def.path as PathId];
      if (pick ? pick !== def.id : nodeLevel(g, def.pair) > 0 && def.pair < def.id) continue;
    }
    out[def.id] = lv;
  }
  return out;
}

// ── 생: 켜진 것 ─────────────────────────────────────────────────────────
export const hasRun = (run: RunState, id: string): boolean => (run.skill?.[id] ?? 0) > 0;
export const effectRun = (run: RunState, id: string): number => (skillById[id] ? effectAt(skillById[id], run.skill?.[id] ?? 0) : 0);
/** 이번 생의 숫자 꼬리(없으면 0). */
export const tailRun = (run: RunState, id: string): number => (skillById[id] ? tailAt(skillById[id], run.skill?.[id] ?? 0) : 0);
/** 이번 생에 켜져 있는가(가졌고, 3단계라면 고른 쪽). */
export const has = (g: GameState, id: string): boolean => hasRun(g.run, id);
/** 이번 생의 효과 값(없으면 0). */
export const nodeEffect = (g: GameState, id: string): number => effectRun(g.run, id);

/** 새 생이 시작될 때: 가문의 노드를 이 생에 켠다. R = FRX 앱(선물 계좌)이 처음부터 열려 있다. 그 밖에는 아무것도 주지 않는다. */
export function applyBirth(g: GameState): void {
  const run = g.run;
  run.skill = activeLevels(g);
  run.marginCall = null;
  run.dayLossLimit = null;
  if (hasRun(run, 'R') && !run.futures.open) {
    run.futures.open = true;
    run.futures.openedAtSettle = run.settleNo;
    logEvent(run, 'open_account', '손에 익은 앱: 선물 계좌가 처음부터 열려 있다');
  }
}

// ── 효과 ────────────────────────────────────────────────────────────────
export interface FeeCtx { /** 가진 돈을 전부 건다 */ allIn?: boolean; /** 반대 단추로 뒤집어 들어간다 */ flip?: boolean }
/** 거래 수수료율 = 기본 × (1 − A1) × (1 − A4) × (50배 이상이면 1 − B1) × 꼬리들 + C2 보험료. 0 이 되지 않는다.
 *  꼬리(U-39 ⑨): R = 10배 이하 · B3a = 200배 · B4 = 전부 걸기 · A3b = 뒤집어 들어감 · C3b = 하루 한도를 걸어 둔 동안. */
export function feeRateRun(run: RunState, lev: number, ctx: FeeCtx = {}): number {
  let r = balance.trading.feeRate as number;
  r *= 1 - effectRun(run, 'A1');
  r *= 1 - effectRun(run, 'A4');
  if (lev >= (skillMeta.highLev as number)) r *= 1 - effectRun(run, 'B1');
  if (lev <= 10) r *= 1 - tailRun(run, 'R');
  if (lev >= 200) r *= 1 - tailRun(run, 'B3a');
  if (ctx.allIn) r *= 1 - tailRun(run, 'B4');
  if (ctx.flip) r *= 1 - tailRun(run, 'A3b');
  if (run.dayLossLimit !== null && run.dayLossLimit !== undefined) r *= 1 - tailRun(run, 'C3b');
  if (hasRun(run, 'C2')) r += skillMeta.premium.C2 as number;
  return r;
}
export const feeRate = (g: GameState, lev: number, ctx: FeeCtx = {}): number => feeRateRun(g.run, lev, ctx);
/** 나올 때 수수료에 곱하는 값: A2 = 어떤 정리든, C1 = 손절로 나올 때. 0 이 되지 않는다. */
export const exitFeeMul = (run: RunState, kind: 'close' | 'sl' | 'tp' = 'close'): number => (1 - tailRun(run, 'A2')) * (kind === 'sl' ? 1 - tailRun(run, 'C1') : 1);
/** 추가 진입 수수료에 곱하는 값(C3a). */
export const addFeeMul = (run: RunState): number => 1 - tailRun(run, 'C3a');
/** 마진콜 전화로 그 자리에서 빌리는 돈의 금리 할인(B2, %p). */
export const callLoanCut = (run: RunState): number => tailRun(run, 'B2');
/** 압류될 때 쳇바퀴를 구매가의 몇 할로 쳐 주는가(C4 꼬리: 경매가 + 상한 20%p). */
export const seizeRate = (run: RunState): number => (balance.assets.auctionRate as number) + tailRun(run, 'C4');
/** 초봉 차트(A3a)의 긴 창 길이(초): 2분 + 꼬리. */
export const longChartSec = (run: RunState): number => 120 + Math.round(tailRun(run, 'A3a'));

export interface LevCapStep { cap: number; closedTrades?: number; waiver?: boolean }
/** 배율 단계: B1 = 50배가 처음부터, B3a = 200배가 거래 수 없이 확인서만으로. */
export function effectiveLevCapsRun(run: RunState): LevCapStep[] {
  const base = balance.progression.futures.levCaps as LevCapStep[];
  return base.map((c) => {
    if (c.closedTrades === undefined) return c;
    if (c.waiver) return hasRun(run, 'B3a') ? { ...c, closedTrades: 0 } : c;
    return hasRun(run, 'B1') ? { ...c, closedTrades: 0 } : c;
  });
}
export const effectiveLevCaps = (g: GameState): LevCapStep[] => effectiveLevCapsRun(g.run);

/** C1 손절 습관: 새 포지션의 기본 손절(ROE %). 없으면 null. */
export const defaultSl = (g: GameState): number | null => (hasRun(g.run, 'C1') ? (skillMeta.defaultSlRoe as number) : null);

/** C2 비상금 주머니: 강제 청산 때 돌아오는 돈(넣은 증거금 × 효과). B3b 물타기의 꼬리: 나중에 더 넣은 증거금(added)의 일부도 돌아온다. */
export const liqRefund = (run: RunState, margin0: number, added = 0): number =>
  Math.floor(margin0 * effectRun(run, 'C2') + 1e-9) + Math.floor(Math.max(0, Math.min(added, margin0)) * tailRun(run, 'B3b') * (1 - effectRun(run, 'C2')) + 1e-9);

/** C4 장부 정리: 압류가 건드리지 않는 쳇바퀴(엄마의 쳇바퀴). 없으면 null. */
export const exemptWheel = (run: RunState): string | null => (hasRun(run, 'C4') ? (skillMeta.momWheel as string) : null);

/** C3b 하루 한도에 닿았는가. */
export const dayLimitHit = (run: RunState): boolean =>
  hasRun(run, 'C3b') && run.dayLossLimit !== null && run.dayLossLimit !== undefined && (run.stats.dayLoss ?? 0) >= run.dayLossLimit;
/** 하루 손실 한도를 정한다(C3b). null = 끔. */
export function setDayLimit(g: GameState, value: number | null): Res {
  if (!hasRun(g.run, 'C3b')) return no('tree', '하루 한도를 쓸 수 없습니다.');
  if (value !== null && !(value > 0)) return no('value', '한도는 0보다 커야 합니다.');
  g.run.dayLossLimit = value === null ? null : Math.floor(value);
  return { ok: true };
}

// ── 재화 ────────────────────────────────────────────────────────────────
/** 이 생이 받을 황금 실물 도토코인: 오소리에게 갚은 원금 per 마다 1개, 오소리 빚을 다 갚았으면 + clearBonus. 거래 수익은 세지 않는다. */
export function treeAward(run: RunState): number {
  const repaid = (run.stats['repaid.shark1'] as number | undefined) ?? 0;
  const a = skillMeta.award as { per: number; clearBonus: number };
  return Math.floor(repaid / a.per) + (repaid > 0 && run.debts.shark1.principal === 0 ? a.clearBonus : 0);
}
/** 생이 끝났을 때 한 번만 준다(파산해도 갚은 만큼은 남는다). 두 번째 부름은 0. */
export function grantAward(g: GameState): number {
  const run = g.run;
  if (run.stats.goldGranted !== undefined) return 0;
  const n = treeAward(run);
  run.stats.goldGranted = n;
  g.family.gold = (g.family.gold ?? 0) + n;
  g.family.goldEarned = (g.family.goldEarned ?? 0) + n;
  if (g.estate) g.estate.gold = n;
  return n;
}

// ── 화면용 ──────────────────────────────────────────────────────────────
export interface NodeView {
  id: string; path: string; tier: number; name: string; desc: string; kind: 'binary' | 'scaled';
  level: number; cost: number | null; canBuy: boolean; reason: string | null;
  /** 지금 효과와 다음 레벨의 효과(scaled 는 0~cap, binary 는 0/1) */
  effect: number; nextEffect: number | null; cap: number | null;
  /** 켜고 끄는 노드의 숫자 꼬리(지금 · 다음 레벨 · 상한 · 설명). 없으면 null */
  tail: { now: number; next: number | null; cap: number; text: string } | null;
  pair: string | null; picked: boolean;
}
export function treeView(g: GameState): NodeView[] {
  const act = activeLevels(g);
  return skillNodes.map((def) => {
    const level = nodeLevel(g, def.id);
    const cost = nextCost(g, def.id);
    const c = canBuy(g, def.id);
    return {
      id: def.id, path: def.path, tier: def.tier, name: def.name, desc: def.desc, kind: def.kind, level, cost,
      canBuy: c.ok, reason: c.ok ? null : c.reason ?? null, effect: effectAt(def, level), nextEffect: cost === null ? null : effectAt(def, level + 1),
      cap: def.cap ?? null, pair: def.pair ?? null, picked: !def.pair || (act[def.id] ?? 0) > 0,
      tail: def.tail ? { now: tailAt(def, level), next: cost === null ? null : tailAt(def, level + 1), cap: def.tail.cap, text: def.tail.text } : null,
    };
  });
}

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
  // R(손에 익은 앱)은 이제 나무의 첫 가지일 뿐이다(U-46): 1막의 새 생은 튜토리얼이 끝난 자리에서 폰을 쥔 채 눈을 뜨므로(act1Start.ts) 폰을 주는 효과가 겹친다.
  // 1막 밖(2막 이후 데이터)에서는 예전처럼 계좌를 연다
  if (hasRun(run, 'R') && !run.futures.open && !(balance as { act1?: unknown }).act1) {
    run.futures.open = true;
    run.futures.openedAtSettle = run.settleNo;
    logEvent(run, 'open_account', '손에 익은 앱: 선물 계좌가 처음부터 열려 있다');
  }
}

// ── FRX 숲거래소 오픈 기념(U-40) ─────────────────────────────────────────
// 새로 문을 연 거래소라 생마다 처음 n 번의 정산 동안 거래 수수료를 받지 않는다. 끝나면 기본 수수료율이 afterFeeRate 가 되고, 나무의 할인은 거기서부터 붙는다.
// 1막 시제품(balance.act1)에서만 켜진다. 시세·청산 공식은 그대로다(수수료만 다르다).
interface OpeningEvent { freeSettlements: number; afterFeeRate: number }
export const openingEvent = (): OpeningEvent | null =>
  ((balance as { act1?: unknown }).act1 ? ((balance.trading as { openingEvent?: OpeningEvent }).openingEvent ?? null) : null);
/** 수수료 무료가 몇 번의 정산 동안 더 남았는가(이벤트가 없으면 0). 지금 정산 구간도 센다. */
export function feeEventLeft(run: RunState): number {
  const ev = openingEvent();
  return ev ? Math.max(0, ev.freeSettlements - run.settleNo) : 0;
}
/** 나무의 할인을 곱하기 전의 기본 수수료율: 이벤트 중 0, 끝난 뒤 afterFeeRate, 이벤트가 없는 판은 trading.feeRate. */
export function baseFeeRate(run: RunState): number {
  const ev = openingEvent();
  if (!ev) return tierFee(balance.trading.feeRate as number, run.feeTier ?? 0);
  return feeEventLeft(run) > 0 ? 0 : tierFee(ev.afterFeeRate, run.feeTier ?? 0);
}
/** FRX 회원 등급의 수수료 할인(U-56 ③, 사용자 결정): 새싹 위로 한 등급마다 0.001%p, 절반까지(0.01% → 0.005%) */
export const TIER_FEE_STEP = 0.00001;
export function tierFee(base: number, tier: number): number {
  if (base <= 0) return base;
  return Math.max(base / 2, base - Math.max(0, Math.floor(tier)) * TIER_FEE_STEP);
}

// ── 효과 ────────────────────────────────────────────────────────────────
export interface FeeCtx { /** 가진 돈을 전부 건다 */ allIn?: boolean; /** 반대 단추로 뒤집어 들어간다 */ flip?: boolean }
/** 거래 수수료율 = 기본 × (1 − A1) × (1 − A4) × 꼬리들 + C2 보험료. 0 이 되지 않는다.
 *  꼬리(U-39 ⑨): R = 10배 이하 · B4 = 전부 걸기 · A3b = 뒤집어 들어감 · C3b = 하루 한도를 걸어 둔 동안. (U-47: B1 · B3a 는 수수료를 건드리지 않는다 — 한 번 버티기 · 고배율 축하금) */
export function feeRateRun(run: RunState, lev: number, ctx: FeeCtx = {}): number {
  return feeRateLevels(run.skill ?? {}, baseFeeRate(run), lev, { ...ctx, dayLimit: run.dayLossLimit !== null && run.dayLossLimit !== undefined });
}
/** 같은 셈을 노드 레벨만으로(순수): 나무 화면이 "이 노드를 열면 수수료가 얼마가 되는가"를 미리 셈할 때 쓴다(U-42). base = 할인 전의 수수료율 */
export function feeRateLevels(skill: Record<string, number>, base: number, lev: number, ctx: FeeCtx & { dayLimit?: boolean } = {}): number {
  const eff = (id: string) => (skillById[id] ? effectAt(skillById[id], skill[id] ?? 0) : 0);
  const tail = (id: string) => (skillById[id] ? tailAt(skillById[id], skill[id] ?? 0) : 0);
  let r = base;
  r *= 1 - eff('A1');
  r *= 1 - eff('A4');
  if (lev <= 10) r *= 1 - tail('R');
  if (ctx.allIn) r *= 1 - tail('B4');
  if (ctx.flip) r *= 1 - tail('A3b');
  if (ctx.dayLimit) r *= 1 - tail('C3b');
  if ((skill.C2 ?? 0) > 0) r += skillMeta.premium.C2 as number;
  return r;
}
/** 나올 때 수수료에 곱하는 값을 노드 레벨만으로(순수) */
export const exitFeeMulLevels = (skill: Record<string, number>, kind: 'close' | 'sl' | 'tp' = 'close'): number => {
  const tail = (id: string) => (skillById[id] ? tailAt(skillById[id], skill[id] ?? 0) : 0);
  return (1 - tail('A2')) * (kind === 'sl' ? 1 - tail('C1') : 1);
};
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
/** 배율 단계(U-47): 처음부터 50배, 위험 고지 확인서에 발도장을 찍는 순간 200배. 거래 수로 여는 단계는 없다(나무도 배율을 열지 않는다). */
export function effectiveLevCapsRun(run: RunState): LevCapStep[] {
  void run;
  return balance.progression.futures.levCaps as LevCapStep[];
}

// ── B1 한 번 버티기 · B3a 고배율 축하금(U-47) ───────────────────────────
/** B1: 청산가에 처음 닿은 포지션에 오소리가 대신 넣어 주는 돈(넣은 증거금 × 효과). 없으면 0 */
export const holdBuffer = (run: RunState, margin0: number): number => Math.floor(margin0 * effectRun(run, 'B1') + 1e-9);
/** B3a: 100배 이상으로 이긴 판의 축하금(수익 × 꼬리). 없으면 0 */
export function winBonus(run: RunState, lev: number, pnl: number): number {
  if (!hasRun(run, 'B3a') || pnl <= 0 || lev < ((skillMeta as { bonusLev?: number }).bonusLev ?? 100)) return 0;
  return Math.floor(pnl * tailRun(run, 'B3a') + 1e-9);
}
export const effectiveLevCaps = (g: GameState): LevCapStep[] => effectiveLevCapsRun(g.run);

// ── R 고비 보상 · C1 따라가는 손절(U-50: 나무가 판의 손맛을 바꾼다) ─────────────
interface PopMeta { base: number; cap: number; at: number[] }
interface TrailMeta { start: number; gap: number; floor: number }
const popMeta = (): PopMeta => (skillMeta as unknown as { popBonus: PopMeta }).popBonus;
export const trailMeta = (): TrailMeta => (skillMeta as unknown as { trail: TrailMeta }).trail;
/** 고비 보상의 몫(넣은 돈에 곱한다): 뿌리 R 이 켜진 생만. Lv1 = base, 그 뒤 cap 에 다가간다(닿지 않는다). 없으면 0 */
export function popRateAt(lv: number): number {
  if (lv <= 0) return 0;
  const m = popMeta();
  return m.base + m.cap * (1 - Math.pow(skillMeta.decay, lv - 1));
}
export const popBonusRate = (run: RunState): number => popRateAt(run.skill?.R ?? 0);
export const popRateCap = (): number => popMeta().base + popMeta().cap;
export const popBonusAt = (): number[] => popMeta().at;
/** 이 판이 고비 하나를 넘을 때 받는 보상(도토리). 없으면 0 */
export const popBonusAmt = (run: RunState, margin0: number): number => Math.floor(margin0 * popBonusRate(run) + 1e-9);
/** 따라가는 손절(C1): 지금 손절(ROE %), 가장 높았던 ROE, 지금 ROE → 새 손절. 올릴 것이 없으면 null */
export function trailStop(run: RunState, sl: number | null, peak: number, roe: number): number | null {
  if (!hasRun(run, 'C1') || sl === null) return null;
  const t = trailMeta();
  if (peak < t.start) return null;
  const want = Math.min(Math.max(t.floor, Math.floor(peak - t.gap + 1e-6)), Math.floor(roe + 1e-6) - 1);
  return want > sl ? want : null;
}

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

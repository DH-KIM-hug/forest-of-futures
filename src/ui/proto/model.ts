// 시제품 화면의 읽기 모델(순수 함수). 엔진 값을 그대로 읽고 새 규칙은 만들지 않는다.
import { tierDefs, tierById, wheelByCoin } from '../../engine/data';
import { equipGross, equipPower, nextTierCost, tierBlockReason, unitsOfTier } from '../../engine/equipment';
import { futuresGate, wheelStatus } from '../../engine/progression';
import { ceilS } from '../../engine/rng';
import { forecast } from '../../engine/settlement';
import { ownedCoins, totalDebt } from '../../engine/selectors';
import type { CoinId, GameState } from '../../engine/types';

export const WHEEL_COIN: CoinId = 'DTC';
export const MAP_PRICE = 3000;

// ── 목표 사슬 ────────────────────────────────────────────────────────────
export interface Goal { label: string; cur: number; need: number; done: boolean }
export interface GoalFlags { everOpened: boolean }
export const GOAL_COUNT = 6;
export function goalAt(g: GameState, i: number, f: GoalFlags): Goal {
  const run = g.run;
  const mk = (label: string, cur: number, need: number): Goal => ({ label, cur: Math.min(cur, need), need, done: cur >= need });
  const gate = futuresGate(g).conditions[0];
  switch (i) {
    case 0: return mk('줍기 200회 (팻말이 선다)', run.acornTaps, 200);
    case 1: return mk('첫 쳇바퀴 사기', ownedCoins(run).length, 1);
    case 2: return mk('첫 설비 사기', run.equipment.length, 1);
    case 3: return mk('선물 계좌 열기 (누적 채굴)', run.futures.open ? gate.need : gate.current, gate.need);
    case 4: return mk('첫 포지션 열기', f.everOpened || Object.keys(run.positions).length > 0 ? 1 : 0, 1);
    default: return mk('엄마 빚 첫 상환', (run.stats.stamps ?? 0) > 0 ? 1 : 0, 1);
  }
}
/** 지금 목표 번호: 이미 지난 목표는 되돌아가지 않는다. 끝나면 GOAL_COUNT. */
export function currentGoal(g: GameState, from: number, f: GoalFlags): number {
  let i = from;
  while (i < GOAL_COUNT && goalAt(g, i, f).done) i++;
  return i;
}

// ── 생산 줄 ──────────────────────────────────────────────────────────────
export interface Row {
  key: string;
  kind: 'wheel' | 'tier' | 'locked';
  name: string;
  sub: string;
  price: number;
  income: number | null;
  canBuy: boolean;
  maxed?: boolean;
  tier?: string;
  progress: number; // 0..1 (현금 ÷ 값)
}
export const tierIncome = (tier: string, coin: CoinId = WHEEL_COIN): number => {
  const t = tierById[tier];
  const w = wheelByCoin[coin];
  return Math.floor(t.grossPerSettle * w.yieldMul - ceilS(t.grossPerSettle * w.powerMul));
};

export function lotRows(g: GameState): Row[] {
  const run = g.run;
  const rows: Row[] = [];
  const prog = (price: number) => Math.max(0, Math.min(1, run.cash / price));
  const owned = ownedCoins(run);
  const w = wheelByCoin[WHEEL_COIN];
  if (owned.length === 0) {
    const st = wheelStatus(g, WHEEL_COIN);
    if (!st.unlocked) {
      rows.push({ key: 'wheel', kind: 'locked', name: '????', sub: `줍기 ${run.acornTaps}/${st.progress?.need ?? 200}이면 보인다`, price: w.cost, income: null, canBuy: false, progress: Math.min(1, run.acornTaps / (st.progress?.need ?? 200)) });
    } else {
      rows.push({ key: 'wheel', kind: 'wheel', name: w.name, sub: '줍기가 코인으로 바뀐다 · 설비를 달 수 있다', price: w.cost, income: null, canBuy: st.canBuy, progress: prog(w.cost) });
    }
    return rows;
  }
  let highest = -1;
  tierDefs.forEach((t, i) => { if (unitsOfTier(run, t.id) > 0) highest = i; });
  tierDefs.forEach((t, i) => {
    if (i > highest + 2) return;
    const price = nextTierCost(run, t.id);
    if (i === highest + 2) {
      rows.push({ key: t.id, kind: 'locked', name: '????', sub: `다음 설비 · 정산당 +${tierIncome(t.id).toLocaleString('ko-KR')}`, price, income: null, canBuy: false, progress: prog(price) });
      return;
    }
    const n = unitsOfTier(run, t.id);
    const why = tierBlockReason(g, t.id, owned[0]);
    rows.push({
      key: t.id, kind: 'tier', name: t.name, sub: `${n}/3대${why && why !== '현금 부족' ? ' · ' + why : ''}`, price, income: tierIncome(t.id, owned[0]),
      canBuy: why === null, maxed: n >= 3, tier: t.id, progress: prog(price),
    });
  });
  return rows;
}

/** 정산당 순수입(HUD 의 `정산당 +n`). 0단계는 null. */
export function perSettle(g: GameState): number | null {
  if (g.run.equipment.length === 0 && ownedCoins(g.run).length === 0) return null;
  return Math.round(forecast(g).net);
}
export const worldIncomeUnit = (g: GameState): number => g.run.equipment.reduce((a, u) => a + equipGross(g, u) - equipPower(g, u), 0);

export type SquirrelState = '줍는 중' | '달리는 중' | '폰만 보는 중';
export function squirrel(g: GameState, tapping: boolean, nearLiq: boolean): SquirrelState {
  if (nearLiq) return '폰만 보는 중';
  if (tapping) return '줍는 중';
  return ownedCoins(g.run).length > 0 ? '달리는 중' : '줍는 중';
}

export const debtLine = (g: GameState): number => totalDebt(g.run);

/** 청산 임박: 진입 때 청산까지 거리(약 100/배율 %)의 30% 아래로 줄었을 때. 최대 5%. 높은 배율에서 늘 울리지 않게. */
export function isNearLiq(p: { liqDistPct: number; lev: number }): boolean {
  return p.liqDistPct < Math.min(5, 30 / Math.max(1, p.lev));
}

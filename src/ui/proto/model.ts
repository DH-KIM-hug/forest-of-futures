// 시제품 화면의 읽기 모델(순수 함수). 엔진 값을 그대로 읽고 새 규칙은 만들지 않는다.
import { tierById, wheelByCoin, balance, lenderById } from '../../engine/data';
import { isActive, laborWage, nextTierCost, staffedWheelGross, tierBlockReason, tierMaxUnits, tierWage, equipGross, unitsOfTier } from '../../engine/equipment';
import { sellFeeRate } from '../../engine/mining';
import { forecast } from '../../engine/settlement';
import { interestDue, lenderLimit, ownedCoins, totalDebt } from '../../engine/selectors';
import type { CoinId, GameState } from '../../engine/types';
import { HOME_WHEEL_NAME } from './text';

export const WHEEL_COIN: CoinId = 'DTC';
/** 집에 더 놓는 쳇바퀴(엔진 설비 id) */
export const EXTRA_WHEEL = 'wheel2';
/** 몇 번째 생인가(1부터). 엔진의 세대 번호는 2에서 시작한다. */
export const lifeNo = (g: GameState): number => g.family.generation - balance.start.generation + 1;

/** 다음 정산에 걷어 갈 돈: 이자 + 생활비 */
export function claim(g: GameState): { interest: number; living: number; total: number } {
  const f = forecast(g);
  return { interest: Math.round(f.interest), living: Math.round(f.living), total: Math.round(f.interest + f.living) };
}
/** 오소리 사무소에서 한 번 빌리면: 받는 돈, 빌린 뒤 빚과 이자(엔진 값) */
export function officeOffer(g: GameState): { lend: number; ratePct: number; room: number } {
  const l = lenderById.shark1;
  const room = Math.max(0, lenderLimit(g, 'shark1') - g.run.debts.shark1.principal);
  return { lend: Math.min(l.borrowUnit!, room), ratePct: Math.round(l.rate * 100), room };
}

// ── 목표 사슬 ────────────────────────────────────────────────────────────
export interface Goal { label: string; cur: number; need: number; done: boolean }
export interface GoalFlags { everOpened: boolean; waiting: boolean; loanTaken: boolean }
export const GOAL_COUNT = 5;
export function goalAt(g: GameState, i: number, f: GoalFlags): Goal {
  const run = g.run;
  const mk = (label: string, cur: number, need: number, done = cur >= need): Goal => ({ label, cur: Math.min(cur, need), need, done });
  const borrowed = f.loanTaken || (run.stats.sharkBorrowed ?? 0) > 0;
  switch (i) {
    case 0: { const c = claim(g).total; return mk('정산 전에 이자·생활비 벌기', Math.floor(run.cash), c, f.waiting || borrowed || run.settleNo >= 1 || run.cash >= c); }
    case 1: return mk('오소리 사무소에서 빌리기 (지도)', borrowed ? 1 : 0, 1);
    case 2: return mk('알바 햄스터 부르기', staffedCount(g) > 0 || (run.stats.hired ?? 0) > 0 ? 1 : 0, 1);
    case 3: return mk('거래소에서 첫 포지션 열기', f.everOpened || Object.keys(run.positions).length > 0 ? 1 : 0, 1);
    default: return mk('엄마 빚 첫 상환 (지도 → 오소리 사무소)', (run.stats.stamps ?? 0) > 0 ? 1 : 0, 1);
  }
}
/** 지금 목표 번호: 이미 지난 목표는 되돌아가지 않는다. 끝나면 GOAL_COUNT. */
export function currentGoal(g: GameState, from: number, f: GoalFlags): number {
  let i = from;
  while (i < GOAL_COUNT && goalAt(g, i, f).done) i++;
  return i;
}

// ── 집의 쳇바퀴 자리(U-30): 쳇바퀴 = 자산(고정가), 알바 햄스터 = 노동(일당). 자리마다 한 줄 ──────────
export interface Slot {
  key: string;
  /** first = 엄마의 쳇바퀴, wheel = 더 놓은 쳇바퀴, empty = 빈 자리, lost = 첫 쳇바퀴가 실려 간 자리 */
  kind: 'first' | 'wheel' | 'empty' | 'lost';
  uid?: string;
  name: string;
  sub: string;
  staffed: boolean;
  tagged: boolean;
  /** 알바가 돌릴 때 정산마다 남는 돈(판 값 − 일당). 알바가 없으면 null */
  net: number | null;
  action: 'hire' | 'place' | 'rebuy' | null;
  btn: string;
  btnSub: string;
  canAct: boolean;
}
const n = (x: number) => Math.round(x).toLocaleString('ko-KR');
/** 정산당 금액 → 초당(지금 정산 간격 기준: 보통 180초, 빠른 판 20초). 버는 돈은 화면에서 늘 초당으로 보여 준다(U-30). */
export const perSec = (perSettle: number): number => perSettle / balance.settlement.intervalSec;
/** 초당 숫자 표기: 100 미만은 소수 한 자리 */
export const rateTxt = (perSecond: number): string => { const a = Math.abs(perSecond); return a >= 100 ? Math.round(a).toLocaleString('ko-KR') : a.toFixed(1); };
/** 정산당 금액을 `초당 n` 꼴로 */
export const secOf = (perSettle: number): string => rateTxt(perSec(perSettle));
/** 알바 한 마리가 붙은 쳇바퀴의 정산당 숫자: 캐서 판 값, 일당, 남는 돈 */
export function hamsterMath(g: GameState, coin: CoinId = WHEEL_COIN): { sold: number; wage: number; net: number } {
  const sold = Math.floor(staffedWheelGross(coin) * (1 - sellFeeRate(g.run)));
  const wage = laborWage();
  return { sold, wage, net: sold - wage };
}
export const staffedCount = (g: GameState): number =>
  ownedCoins(g.run).filter((c) => g.run.coinWheels[c].staffed).length + g.run.equipment.filter((u) => u.staffed).length;
export const maxWheels = (): number => 1 + tierMaxUnits(EXTRA_WHEEL);

export function slots(g: GameState): Slot[] {
  const run = g.run;
  const out: Slot[] = [];
  const hm = hamsterMath(g);
  const phone = run.futures.open;
  const working = `알바가 캐서 판 값 ${secOf(hm.sold)} − 일당 ${secOf(hm.wage)}`;
  const hireBtn = { action: 'hire' as const, btn: '알바 부르기', btnSub: `일당 ${n(hm.wage)}/정산`, canAct: phone };
  const done = { action: null, btn: '도는 중', btnSub: '알바 1마리', canAct: false };
  const w = run.coinWheels[WHEEL_COIN];
  if (w) {
    out.push({
      key: 'first', kind: 'first', name: HOME_WHEEL_NAME, staffed: !!w.staffed, tagged: !!w.tagBy, net: w.staffed ? hm.net : null,
      sub: w.staffed ? working : phone ? '내가 탭할 때만 돈다 · 알바를 부르면 혼자 돈다' : '내가 탭할 때만 돈다 · 알바를 부를 폰이 없다',
      ...(w.staffed ? done : hireBtn),
    });
  } else {
    const cost = wheelByCoin[WHEEL_COIN].cost;
    out.push({ key: 'first', kind: 'lost', name: '쳇바퀴가 있던 자리', staffed: false, tagged: false, net: null, sub: '실려 갔다. 쳇바퀴가 없으면 캘 수 없다', action: 'rebuy', btn: '다시 사기', btnSub: n(cost), canAct: run.cash >= cost });
  }
  run.equipment.filter((u) => u.tier === EXTRA_WHEEL).forEach((u, i) => {
    out.push({
      key: u.uid, kind: 'wheel', uid: u.uid, name: `${tierById[EXTRA_WHEEL].name} ${i + 1}`, staffed: !!u.staffed, tagged: !!u.tagBy, net: u.staffed ? hm.net : null,
      sub: u.staffed ? working : phone ? '알바가 없으면 안 돈다' : '알바가 없으면 안 돈다 · 부를 폰이 없다',
      ...(u.staffed ? done : hireBtn),
    });
  });
  const left = tierMaxUnits(EXTRA_WHEEL) - unitsOfTier(run, EXTRA_WHEEL);
  if (left > 0 && w) {
    const price = nextTierCost(run, EXTRA_WHEEL);
    const why = tierBlockReason(g, EXTRA_WHEEL, WHEEL_COIN);
    out.push({ key: 'empty', kind: 'empty', name: `빈 자리 ${left}칸`, staffed: false, tagged: false, net: null, sub: `쳇바퀴를 놓고 알바를 부르면 초당 +${secOf(hm.net)}`, action: 'place', btn: '쳇바퀴 놓기', btnSub: n(price), canAct: why === null });
  }
  return out;
}

/** 집 한 줄 요약: 알바들이 정산마다 남기는 돈과 걷어 가는 돈 */
export function homeSummary(g: GameState): { idle: number; claim: number; hamsters: number } {
  const run = g.run;
  const fee = 1 - sellFeeRate(run);
  let sold = 0, wages = 0;
  for (const c of ownedCoins(run)) if (run.coinWheels[c].on && run.coinWheels[c].staffed) { sold += staffedWheelGross(c) * fee; wages += laborWage(); }
  for (const u of run.equipment) if (isActive(run, u)) { sold += equipGross(g, u) * fee; wages += tierWage(u.tier); }
  return { idle: Math.floor(sold - wages), claim: claim(g).total, hamsters: staffedCount(g) };
}

/** 정산당 순수입(HUD 에는 초당으로 바꿔 보여 준다): 알바가 캐는 값 − 일당 − 이자 − 생활비. 탭은 들어가지 않는다. */
export function perSettle(g: GameState): number {
  return Math.round(forecast(g).net);
}

export const debtLine = (g: GameState): number => totalDebt(g.run);
export const interestNow = (g: GameState): number => (['bank', 'capital', 'shark1', 'shark2'] as const).reduce((a, id) => a + interestDue(g, id), 0);

/** 청산 임박: 진입 때 청산까지 거리(약 100/배율 %)의 30% 아래로 줄었을 때. 최대 5%. 높은 배율에서 늘 울리지 않게. */
export function isNearLiq(p: { liqDistPct: number; lev: number }): boolean {
  return p.liqDistPct < Math.min(5, 30 / Math.max(1, p.lev));
}

// ── 튜토리얼 거래(U-31): 오소리 대부가 시키는 첫 거래. 실시간 시세가 아니라 짜 둔 길을 간다 ──────────
/** 거는 돈(증거금)과 배율. 첫 대출에서 이자를 떼고 남은 돈의 일부만 건다. 쳇바퀴·알바는 건드리지 않는다. */
export const TUT = { market: 'DTC' as CoinId, margin: 30000, lev: 10, stepMs: 260, stepPct: 0.75, maxSteps: 24 };
/** 짜 둔 시세의 k 번째 값: 고른 쪽의 반대로만 간다(롱이면 내리고 숏이면 오른다). 살짝 흔들리며 걸음마다 stepPct%. */
export function tutorialPrice(real: number, dir: 1 | -1, k: number): number {
  const wig = k % 3 === 2 ? -0.35 : 0; // 세 걸음에 한 번 살짝 되돌아갔다가 더 간다
  return real * (1 - dir * ((TUT.stepPct * k + wig) / 100));
}

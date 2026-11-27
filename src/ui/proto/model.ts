// 시제품 화면의 읽기 모델(순수 함수). 엔진 값을 그대로 읽고 새 규칙은 만들지 않는다.
import { tierById, wheelByCoin, balance, lenderById } from '../../engine/data';
import { isActive, laborWage, nextTierCost, staffedWheelGross, tierBlockReason, tierMaxUnits, tierWage, equipGross, unitsOfTier } from '../../engine/equipment';
import { sellFeeRate } from '../../engine/mining';
import { forecast } from '../../engine/settlement';
import { fixedInterest, interestDue, lenderLimit, ownedCoins, totalDebt } from '../../engine/selectors';
import type { CoinId, GameState } from '../../engine/types';
import { HOME_WHEEL_NAME } from './text';
import { assignSlots, SLOT_COUNT } from './home';
import type { TipArgs } from './guide';
import { tapValue } from '../../engine/equipment';

export const WHEEL_COIN: CoinId = 'DTC';
/** 집에 더 놓는 쳇바퀴(엔진 설비 id) */
export const EXTRA_WHEEL = 'wheel2';
/** 몇 번째 생인가(1부터). 엔진의 세대 번호는 2에서 시작한다. */
export const lifeNo = (g: GameState): number => g.family.generation - balance.start.generation + 1;

/** 첫 생의 첫 추심원이 오기까지(초). 굴려서는 안 된다는 것을 아는 데 40초면 충분하다 — 한 정산(180초)을 다 굴리게 하지 않는다(U-39 ⑤).
 *  이 시간 동안 아무리 눌러도(초당 12번 × 2) 첫 청구액 5,500 에 못 미친다. 빠른 판과 다음 생, 그 뒤의 정산은 그대로다. */
export const FIRST_VISIT_SEC = 60;
export const firstVisitSec = (interval: number): number => Math.min(interval, FIRST_VISIT_SEC);

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
    case 0: { const c = claim(g).total; return mk('수금 전에 이자와 생활비 모으기', Math.floor(run.cash), c, f.waiting || borrowed || run.settleNo >= 1 || run.cash >= c); }
    case 1: return mk('지도에서 오소리 사무소 가기', borrowed ? 1 : 0, 1);
    case 2: return mk('알바 햄스터 부르기', staffedCount(g) > 0 || (run.stats.hired ?? 0) > 0 ? 1 : 0, 1);
    case 3: return mk('FRX 앱으로 첫 거래', f.everOpened || Object.keys(run.positions).length > 0 ? 1 : 0, 1);
    default: return mk('오소리 장부 첫 상환', (run.stats.stamps ?? 0) > 0 ? 1 : 0, 1);
  }
}
/** 지금 목표 번호: 이미 지난 목표는 되돌아가지 않는다. 끝나면 GOAL_COUNT. */
export function currentGoal(g: GameState, from: number, f: GoalFlags): number {
  let i = from;
  while (i < GOAL_COUNT && goalAt(g, i, f).done) i++;
  return i;
}

// ── 집의 쳇바퀴 자리(U-30·U-34): 쳇바퀴 = 자산(고정가), 알바 햄스터 = 노동(일당). 바닥 자리 여섯 = 아래 판의 칸 여섯 ──────────
/** 판의 한 칸 = 바닥의 한 자리. 칸마다 상태 하나 + 할 일 하나. */
export interface Tile {
  /** 바닥 자리 번호(home.ts WHEEL_SLOTS). 0 = 엄마의 쳇바퀴 */
  slot: number;
  /** run = 알바가 돌린다, idle = 쳇바퀴만 서 있다, empty = 빈 자리, lost = 엄마의 쳇바퀴가 실려 간 자리 */
  state: 'run' | 'idle' | 'empty' | 'lost';
  uid?: string;
  name: string;
  tagged: boolean;
  /** 알바가 돌릴 때 정산마다 남는 돈(판 값 − 일당). 알바가 없으면 null */
  net: number | null;
  /** 상태 한 줄(단추가 없을 때 보인다): "초당 +25.9", 잠겼으면 짧은 까닭 */
  text: string;
  /** 지금은 할 수 없는 칸(흐리게): 폰이 없다, 엄마의 쳇바퀴부터 … */
  locked: boolean;
  action: 'hire' | 'place' | 'rebuy' | null;
  btn: string;
  btnSub: string;
  /** 단추가 켜져 있는가(돈이 모자라면 꺼진 채 보인다) */
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

/** 빈 자리에 쳇바퀴를 놓을 수 없는 까닭을 칸에 들어갈 만큼 짧게(돈이 모자란 것은 까닭이 아니라 꺼진 단추로 보인다) */
const shortWhy = (why: string): string => (/쳇바퀴/.test(why) ? '엄마 쳇바퀴부터' : /집/.test(why) ? '집이 좁다' : '놓을 수 없다');

/** 바닥 자리 여섯의 상태(자리 번호순). prefs = 화면에서 고른 자리(uid → 자리 번호, protoStore.slotOf). */
export function tiles(g: GameState, prefs: Record<string, number> = {}): Tile[] {
  const run = g.run;
  const hm = hamsterMath(g);
  const phone = run.futures.open;
  const running = { state: 'run' as const, net: hm.net, text: `초당 +${secOf(hm.net)}`, locked: false, action: null, btn: '', btnSub: '', canAct: false };
  const idle = () => phone
    ? { state: 'idle' as const, net: null, text: '알바 없음', locked: false, action: 'hire' as const, btn: '알바 부르기', btnSub: `일당 ${n(hm.wage)}`, canAct: true }
    : { state: 'idle' as const, net: null, text: '폰이 없다', locked: true, action: null, btn: '', btnSub: '', canAct: false };
  const out: Tile[] = [];
  const w = run.coinWheels[WHEEL_COIN];
  if (w) out.push({ slot: 0, name: HOME_WHEEL_NAME, tagged: !!w.tagBy, ...(w.staffed ? running : idle()) });
  else {
    const cost = wheelByCoin[WHEEL_COIN].cost;
    out.push({ slot: 0, state: 'lost', name: '실려 간 자리', tagged: false, net: null, text: '쳇바퀴가 실려 갔다', locked: false, action: 'rebuy', btn: '다시 사기', btnSub: n(cost), canAct: run.cash >= cost });
  }
  const extras = run.equipment.filter((u) => u.tier === EXTRA_WHEEL);
  const seat = assignSlots(extras.map((u) => u.uid), prefs);
  const price = nextTierCost(run, EXTRA_WHEEL);
  const why = tierBlockReason(g, EXTRA_WHEEL, WHEEL_COIN);
  const blocked = why !== null && why !== '현금 부족';
  for (let slot = 1; slot < SLOT_COUNT; slot++) {
    const u = extras.find((x) => x.uid === seat[slot]);
    if (u) out.push({ slot, uid: u.uid, name: tierById[EXTRA_WHEEL].name, tagged: !!u.tagBy, ...(u.staffed ? running : idle()) });
    else if (blocked) out.push({ slot, state: 'empty', name: '빈 자리', tagged: false, net: null, text: shortWhy(why!), locked: true, action: null, btn: '', btnSub: '', canAct: false });
    else out.push({ slot, state: 'empty', name: '빈 자리', tagged: false, net: null, text: '빈 자리', locked: false, action: 'place', btn: '놓기', btnSub: n(price), canAct: why === null });
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
/** 고정금리 몫(엄마 빚)의 이자: 금리 인상 사건에도 그대로다 */
export const fixedInterestNow = (g: GameState): number => Math.round((['bank', 'capital', 'shark1', 'shark2'] as const).reduce((a, id) => a + fixedInterest(g, id), 0));
/** 금리가 mult 배가 되면 이자가 얼마가 되는가(지금 사건이 없을 때의 셈): 고정금리 몫은 빼고 곱한다 */
export const interestAfterHike = (g: GameState, mult: number): number => { const fx = fixedInterestNow(g); return Math.round(fx + (interestNow(g) - fx) * mult); };

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

/** 튜토리얼 대사(guide.ts)에 끼우는 숫자. 전부 엔진 값이다. */
export function tipArgs(g: GameState): TipArgs {
  const c = claim(g);
  const coin = g.run.riding ?? ownedCoins(g.run)[0] ?? WHEEL_COIN;
  return {
    tap: Math.round(tapValue(g, coin)), claim: c.total, living: c.living, wage: laborWage(), wheel: nextTierCost(g.run, EXTRA_WHEEL),
    lend: officeOffer(g).lend || (lenderById.shark1.borrowUnit ?? 0), debt: totalDebt(g.run), lev: TUT.lev,
  };
}

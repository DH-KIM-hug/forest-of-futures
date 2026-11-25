// 시제품 화면의 읽기 모델(순수 함수). 엔진 값을 그대로 읽고 새 규칙은 만들지 않는다.
import { tierDefs, tierById, wheelByCoin, balance, trackById } from '../../engine/data';
import { upgradeCost, upgradeLevel, upgradeTargetOk } from '../../engine/upgrades';

const FIRST_WHEEL_TAPS: number = balance.progression.firstWheelUnlockTaps;
import { equipGross, equipPower, nextTierCost, tierBlockReason, unitsOfTier } from '../../engine/equipment';
import { futuresGate, wheelStatus, eduNeeded, mockNeeded } from '../../engine/progression';
import { ceilS } from '../../engine/rng';
import { forecast } from '../../engine/settlement';
import { ownedCoins, totalDebt } from '../../engine/selectors';
import type { CoinId, GameState } from '../../engine/types';

export const WHEEL_COIN: CoinId = 'DTC';
export const TIP_EVERY = 2; // 곰 형이 정산 몇 번마다 말해 주나
/** 곰 형이 공터를 지나가는 누적 채굴 어치(STORY_ACT1 3-1). 이야기 박자라 화면 층에 둔다. */
export const BEAR_MINED = 20000;
/** 몇 번째 생인가(1부터). 엔진의 세대 번호는 2에서 시작한다. */
export const lifeNo = (g: GameState): number => g.family.generation - balance.start.generation + 1;

// ── 계좌 개설 체크리스트(STORY_ACT1 3-2~3-5, U-22). 엔진 조건을 네 줄로 풀어 보여 준다 ──
export interface CheckRow { id: 'mined' | 'edu' | 'mock' | 'deposit'; label: string; cur: number; need: number; ok: boolean; where: string }
export function checklist(g: GameState): CheckRow[] {
  const gate = futuresGate(g);
  const f = g.run.futures;
  const m = gate.conditions[0], d = gate.conditions[1];
  const eN = eduNeeded(g), mN = mockNeeded(g);
  return [
    { id: 'mined', label: '채굴 실적', cur: Math.min(m.current, m.need), need: m.need, ok: m.met, where: '공터에서 쳇바퀴를 돌린다' },
    { id: 'edu', label: '사전 교육', cur: Math.min(f.edu, eN), need: eN, ok: f.edu >= eN, where: '이 앱에서 읽는다' },
    { id: 'mock', label: '모의 거래', cur: f.mock || mN === 0 ? mN : 0, need: mN, ok: f.mock || mN === 0, where: '이 앱에서 해 본다' },
    { id: 'deposit', label: '예탁금 확인', cur: Math.min(d.current, d.need), need: d.need, ok: f.open, where: '지도 → 숲속 캐피탈 창구' },
  ];
}

// ── 목표 사슬 ────────────────────────────────────────────────────────────
export interface Goal { label: string; cur: number; need: number; done: boolean }
export interface GoalFlags { everOpened: boolean }
export const GOAL_COUNT = 7;
export function goalAt(g: GameState, i: number, f: GoalFlags): Goal {
  const run = g.run;
  const mk = (label: string, cur: number, need: number): Goal => ({ label, cur: Math.min(cur, need), need, done: cur >= need });
  switch (i) {
    case 0: return mk(`도토리 줍기 ${FIRST_WHEEL_TAPS}회`, run.stats.signSeen ? FIRST_WHEEL_TAPS : run.acornTaps, FIRST_WHEEL_TAPS);
    case 1: return mk('첫 쳇바퀴 사기', ownedCoins(run).length, 1);
    case 2: return mk('설비 하나 더 들이기', run.equipment.length, 1);
    case 3: return mk('코인 캐기 (누군가 지켜본다)', run.futures.open ? BEAR_MINED : Math.floor(run.minedValue), BEAR_MINED);
    case 4: return mk('선물 계좌 열기 (폰의 체크리스트)', run.futures.open ? 4 : checklist(g).filter((c) => c.ok).length, 4);
    case 5: return mk('첫 포지션 열기', f.everOpened || Object.keys(run.positions).length > 0 ? 1 : 0, 1);
    default: return mk('엄마 빚 첫 상환 (지도 → 오소리 사무소)', (run.stats.stamps ?? 0) > 0 ? 1 : 0, 1);
  }
}
/** 지금 목표 번호: 이미 지난 목표는 되돌아가지 않는다. 끝나면 GOAL_COUNT. */
export function currentGoal(g: GameState, from: number, f: GoalFlags): number {
  let i = from;
  while (i < GOAL_COUNT && goalAt(g, i, f).done) i++;
  return i;
}

// ── 강화 탭: 엔진의 생산 강화(upgrades.json)만 보여 준다 ─────────────────
export interface UpgRow { key: string; track: string; target?: string; name: string; eff: string; quip: string; lv: number; max: number; cost: number | null; canBuy: boolean; icon: string }
const QUIP: Record<string, string> = {
  glove: '족제비 「손이 안 까져야 내일도 줍죠~」',
  shoes: '족제비 「발이 편해야 오래 달려요. 오래요.」',
  oil: '족제비 「삐걱거리면 이웃이 신고해요~」',
  spokes: '족제비 「가만있어도 도는 바퀴! 영구 기관은 아니에요.」',
  power: '족제비 「전기세는 줄어도 이자는 안 줄어요~」',
  tier: '족제비 「교육비는 사장님 부담이에요~」',
  fee: '족제비 「단골이면 조금 덜 떼요. 조금요.」',
};
export function upgRows(g: GameState): UpgRow[] {
  const run = g.run;
  const coin = ownedCoins(run)[0];
  const out: UpgRow[] = [];
  const push = (track: string, target: string | undefined, eff: string, icon: string) => {
    const t = trackById[track];
    if (!upgradeTargetOk(run, track, target)) return;
    const lv = upgradeLevel(run, track, target);
    const cost = upgradeCost(run, track, target);
    const names = t.names as string[] | Record<string, string>;
    const name = Array.isArray(names) ? names[Math.min(names.length - 1, Math.floor((lv / t.maxLevel) * names.length))] : names[target!];
    out.push({ key: track + (target ? ':' + target : ''), track, target, name, eff, quip: QUIP[track] ?? '', lv, max: t.maxLevel, cost, canBuy: cost !== null && run.cash >= cost, icon });
  };
  if (!coin) push('glove', undefined, '도토리 줍기 탭마다 +4%', 'pile');
  if (coin) {
    push('shoes', undefined, '쳇바퀴 달리기 탭마다 +3%', 'wheel');
    push('oil', coin, '설비가 캐는 값 +2%', 'wheel2');
    push('spokes', coin, '혼자 도는 양 정산당 +150', 'wheel');
    push('power', coin, '전기세 −1%', 'generator');
    for (const id of Object.keys(trackById.tier.names as object)) push('tier', id, `${tierById[id].name}가 캐는 값 +2%`, id);
    push('fee', undefined, '코인 팔 때 수수료 −0.03%p', 'capital');
  }
  return out;
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
      rows.push({ key: 'wheel', kind: 'locked', name: '????', sub: `줍기 ${run.acornTaps}/${FIRST_WHEEL_TAPS}회면 팻말이 선다`, price: w.cost, income: null, canBuy: false, progress: Math.min(1, run.acornTaps / FIRST_WHEEL_TAPS) });
    } else {
      rows.push({ key: 'wheel', kind: 'wheel', name: w.name, sub: '줍기가 코인 채굴로 바뀐다 · 캔 코인은 콜드월렛으로', price: w.cost, income: null, canBuy: st.canBuy, progress: prog(w.cost) });
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

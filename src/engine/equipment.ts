// 종목 쳇바퀴 + 공용 설비 사다리(GDD_v2 3.3·3.4).
import { balance, COINS, coinWheelDefs, tierById, tierDefs, wheelByCoin } from './data';
import { ceilS, floorS } from './rng';
import { treeLevel, traitMul } from './legacy';
import { ownedCoins, price, refPrice, stage } from './selectors';
import { resetTierIfEmpty, resetWheelUpgrades, runLevel, tierLevel, wheelLevel } from './upgrades';
import { bump } from './stats';
import { logEvent, notify } from './util';
import type { CoinId, EquipmentUnit, GameState, Res, RunState } from './types';

const A = balance.assets;
const M = balance.mining;

export const unitsOfTier = (run: RunState, tier: string) => run.equipment.filter((u) => u.tier === tier).length;
export const nextTierCost = (run: RunState, tier: string): number => ceilS(tierById[tier].cost * Math.pow(A.costGrowth, unitsOfTier(run, tier)));
const LABOR = (balance as unknown as { labor: { wage: number; grossPerSettle: number } }).labor;
/** 알바가 붙은 종목 쳇바퀴(첫 쳇바퀴 포함)가 정산마다 캐는 값과 일당. 보조 쳇바퀴(wheel2)와 같은 숫자다. */
export const wheelStaffed = (run: RunState, coin: string): boolean => !!run.coinWheels[coin]?.on && !!run.coinWheels[coin]?.staffed;
export const staffedWheelGross = (coin: string): number => LABOR.grossPerSettle * wheelByCoin[coin].yieldMul;
export const laborWage = (): number => LABOR.wage;
export const tierMaxUnits = (tier: string): number => tierById[tier]?.maxUnits ?? A.maxUnits;
/** 일당(정산당). 알바가 필요 없는 설비는 0. */
export const tierWage = (tier: string): number => tierById[tier]?.wage ?? 0;
export const needsStaff = (tier: string): boolean => tierById[tier]?.wage != null;
/** 도는 설비: 켜져 있고, 붙은 종목 쳇바퀴가 켜져 있고, 알바가 필요한 설비면 알바가 있어야 한다. */
export const isActive = (run: RunState, u: EquipmentUnit): boolean => u.on && !!run.coinWheels[u.coin]?.on && (!needsStaff(u.tier) || !!u.staffed);

/** 한 대의 정산당 캐는 값(세대 시작가 기준 도토리어치). */
export function equipGross(g: GameState, u: EquipmentUnit): number {
  const run = g.run;
  const t = tierById[u.tier];
  const w = wheelByCoin[u.coin];
  const oil = 1 + 0.02 * wheelLevel(run, u.coin, 'oil');
  const tierUp = 1 + 0.02 * tierLevel(run, u.tier);
  const craft = 1 + 0.05 * treeLevel(g.family, 'craft');
  return t.grossPerSettle * w.yieldMul * oil * tierUp * craft * traitMul(g, 'equipYieldMul');
}
/** 한 대의 정산당 전기세(도토리, 올림). */
export function equipPower(g: GameState, u: EquipmentUnit): number {
  const t = tierById[u.tier];
  const w = wheelByCoin[u.coin];
  if (t.wage != null) return 0; // 알바가 발로 돌린다: 전기세 대신 일당
  return ceilS(t.grossPerSettle * w.powerMul * (1 - 0.01 * wheelLevel(g.run, u.coin, 'power')));
}
/** 지금 시세로 본 순수입 = 캐는 값 × (지금 가격 ÷ 세대 시작가) − 전기세. 0 이하면 역마진. */
export function equipNetNow(g: GameState, u: EquipmentUnit): number {
  const run = g.run;
  return equipGross(g, u) * (price(run, u.coin) / refPrice(run, u.coin)) - equipPower(g, u);
}
export const isReverseMargin = (g: GameState, u: EquipmentUnit): boolean => equipNetNow(g, u) <= 1e-9;
/** 종목 쳇바퀴가 혼자 도는 양(관성 바퀴): 정산당 150어치 × 단계 × g. 전기세 없음. */
export function spokesGross(g: GameState, coin: string): number {
  return 150 * wheelLevel(g.run, coin, 'spokes') * wheelByCoin[coin].yieldMul;
}
/** 켜진 설비 전체의 기준 초당 순수입 합(달리기 레벨 연동 몫만큼 탭에 들어간다). */
export const baseNetPerSecSum = (run: RunState): number => run.equipment.reduce((a, u) => a + (isActive(run, u) ? tierById[u.tier].netPerSec : 0), 0);

/** 탭 1회 채굴 어치(세대 시작가 기준). 고정값이다: 레벨도 배수도 없다(U-30). 늘리는 길은 쳇바퀴를 더 놓고 알바를 쓰는 것뿐. */
export function tapValue(g: GameState, coin: CoinId): number {
  const base = M.tapBase + M.autoShare * baseNetPerSecSum(g.run);
  return base * wheelByCoin[coin].tapMul * (1 + 0.1 * treeLevel(g.family, 'grip')) * traitMul(g, 'tapMul');
}

/** 켜진 설비의 캐는 값 가운데 가장 큰 종목의 비중(%, 내림)과 그 종목. */
export function mineConcentration(g: GameState): { pct: number; coin: CoinId | null } {
  const per: Partial<Record<CoinId, number>> = {};
  let total = 0;
  for (const u of g.run.equipment) {
    if (!isActive(g.run, u)) continue;
    const v = equipGross(g, u);
    per[u.coin] = (per[u.coin] ?? 0) + v;
    total += v;
  }
  let top: CoinId | null = null;
  for (const c of COINS) if ((per[c] ?? 0) > (top ? per[top]! : 0)) top = c;
  return top ? { pct: floorS((per[top]! / total) * 100), coin: top } : { pct: 0, coin: null };
}

export function ride(g: GameState, coin: CoinId): Res {
  if (!g.run.coinWheels[coin]) return { ok: false, code: 'nowheel', msg: '그 쳇바퀴가 없습니다.' };
  g.run.riding = coin;
  return { ok: true };
}

export function ensureRiding(run: RunState): CoinId | null {
  if (run.riding && run.coinWheels[run.riding]) return run.riding;
  run.riding = ownedCoins(run)[0] ?? null;
  return run.riding;
}

// ── 구매·붙이기·끄기·팔기 ───────────────────────────────────────────────
export function tierBlockReason(g: GameState, tier: string, coin: CoinId): string | null {
  const run = g.run;
  const t = tierById[tier];
  if (!t) return '없는 설비';
  if (ownedCoins(run).length === 0) return '종목 쳇바퀴가 필요합니다';
  if (run.house < t.needHouse) return '내 집이 필요합니다(통나무집 이상)';
  if (!run.coinWheels[coin]) return '그 종목 쳇바퀴가 없습니다';
  const buyable = (A as unknown as { buyable?: string[] }).buyable;
  if (buyable && !buyable.includes(tier)) return '집에 들일 수 없는 설비입니다';
  if (unitsOfTier(run, tier) >= tierMaxUnits(tier)) return '놓을 자리가 없습니다';
  if (run.cash < nextTierCost(run, tier)) return '현금 부족';
  return null;
}

export function buyEquip(g: GameState, tier: string, coin: CoinId, boughtWithLoan = false): Res {
  const run = g.run;
  if (run.over) return { ok: false };
  const why = tierBlockReason(g, tier, coin);
  if (why) return { ok: false, code: 'blocked', msg: why };
  const cost = nextTierCost(run, tier);
  run.cash -= cost;
  run.uidSeq += 1;
  run.equipment.push({ uid: `e${run.uidSeq}`, tier, coin, on: true, cost, tagBy: null, boughtWithLoan, inheritedSign: false, boughtTick: run.tick, ...(needsStaff(tier) ? { staffed: false } : {}) });
  bump(run, 'assetsEver', 1);
  run.stats.maxTierEver = Math.max(run.stats.maxTierEver ?? -1, tierDefs.findIndex((t) => t.id === tier));
  logEvent(run, `buy:${tier}`, `${tierById[tier].name} 구매`, cost);
  notify(run, tierById[tier].seenAs, 'info');
  return { ok: true, amount: cost };
}

/** 쳇바퀴에 알바를 들인다(폰이 있어야 한다). 들이는 값은 없고, 정산마다 일당을 낸다. 일당을 못 주면 그 정산에 나간다(U-30). */
export function hire(g: GameState, uid?: string, coin?: CoinId): Res {
  const run = g.run;
  if (run.over) return { ok: false };
  // 알바는 폰으로 부른다. 폰은 오소리 대부가 돈을 빌려주며 쥐여 준 중고폰(= 선물 계좌가 열린 상태)이다. 그래서 빌리기 전에는 혼자 굴릴 수밖에 없다(U-29).
  if (!run.futures.open) return { ok: false, code: 'nophone', msg: '알바를 부를 폰이 없습니다.' };
  if (coin) {
    const w = run.coinWheels[coin];
    if (!w) return { ok: false, code: 'none', msg: '그 쳇바퀴가 없습니다.' };
    if (w.staffed) return { ok: false, code: 'staffed', msg: '이미 알바가 돌리고 있습니다.' };
    w.staffed = true;
    bump(run, 'hired', 1);
    logEvent(run, 'hire', `알바 햄스터가 ${wheelByCoin[coin].name}에 들어왔다`, LABOR.wage);
    return { ok: true, amount: LABOR.wage };
  }
  const u = run.equipment.find((x) => x.uid === uid);
  if (!u) return { ok: false, code: 'none', msg: '그 쳇바퀴가 없습니다.' };
  if (!needsStaff(u.tier)) return { ok: false, code: 'nostaff', msg: '알바가 필요 없는 설비입니다.' };
  if (u.staffed) return { ok: false, code: 'staffed', msg: '이미 알바가 돌리고 있습니다.' };
  u.staffed = true;
  bump(run, 'hired', 1);
  logEvent(run, 'hire', `알바 햄스터가 ${tierById[u.tier].name}에 들어왔다`, tierWage(u.tier));
  return { ok: true, amount: tierWage(u.tier) };
}

export function moveEquip(g: GameState, uid: string, coin: CoinId): Res {
  const run = g.run;
  const u = run.equipment.find((x) => x.uid === uid);
  if (!u) return { ok: false, code: 'none' };
  if (!run.coinWheels[coin]) return { ok: false, code: 'nowheel', msg: '그 종목 쳇바퀴가 없습니다.' };
  if (u.coin === coin) return { ok: false, code: 'same' };
  const fee = ceilS(u.cost * M.reattachFee);
  if (run.cash < fee) return { ok: false, code: 'cash', msg: '현금 부족' };
  run.cash -= fee;
  u.coin = coin;
  return { ok: true, amount: fee };
}

export function toggleEquip(g: GameState, uid: string, on?: boolean): Res {
  const u = g.run.equipment.find((x) => x.uid === uid);
  if (!u) return { ok: false, code: 'none' };
  u.on = on ?? !u.on;
  return { ok: true };
}
export function toggleWheel(g: GameState, coin: CoinId, on?: boolean): Res {
  const w = g.run.coinWheels[coin];
  if (!w) return { ok: false, code: 'none' };
  w.on = on ?? !w.on;
  return { ok: true };
}
export function setAutoSell(g: GameState, coin: CoinId, on: boolean): Res {
  const w = g.run.coinWheels[coin];
  if (!w) return { ok: false, code: 'none' };
  w.autoSell = on;
  return { ok: true };
}

/** 설비 한 대를 없앤다(압류·공매·판매 공통). 단계가 비면 그 단계 업그레이드도 사라진다. */
export function removeEquip(run: RunState, uid: string): EquipmentUnit | null {
  const i = run.equipment.findIndex((x) => x.uid === uid);
  if (i < 0) return null;
  const [u] = run.equipment.splice(i, 1);
  resetTierIfEmpty(run, u.tier);
  return u;
}
/** 종목 쳇바퀴를 없앤다. 그 종목 업그레이드도 사라진다. */
export function removeWheel(run: RunState, coin: CoinId): void {
  delete run.coinWheels[coin];
  resetWheelUpgrades(run, coin);
  if (run.riding === coin) run.riding = null;
  ensureRiding(run);
}

export function sellEquip(g: GameState, uid: string): Res {
  const run = g.run;
  const u = run.equipment.find((x) => x.uid === uid);
  if (!u) return { ok: false, code: 'none' };
  if (u.tagBy) {
    logEvent(run, 'sell_blocked', `${tierById[u.tier].name}: 딱지가 붙어 팔 수 없음`);
    return { ok: false, code: 'tagged', msg: '딱지가 붙어 있어 팔 수 없습니다.' };
  }
  const got = floorS(u.cost * A.sellRate);
  removeEquip(run, uid);
  run.cash += got;
  logEvent(run, 'sell', `${tierById[u.tier].name} 판매`, got);
  return { ok: true, amount: got };
}

// ── 종목 쳇바퀴 구매·판매 (진행 단계는 progression.ts 의 wheelStatus 가 막는다) ──
export function buyWheel(g: GameState, coin: CoinId, status: { canBuy: boolean; reason: string | null }): Res {
  const run = g.run;
  if (run.over) return { ok: false };
  if (!status.canBuy) return { ok: false, code: 'blocked', msg: status.reason ?? '살 수 없습니다.' };
  const def = wheelByCoin[coin];
  run.cash -= def.cost;
  run.coinWheels[coin] = { on: true, autoSell: false, tagBy: null };
  run.wallet[coin] ??= { qty: 0, locked: 0 };
  if (!run.riding) run.riding = coin;
  logEvent(run, `buy:${def.id}`, `${def.name} 구매`, def.cost);
  notify(run, `${def.name} 가동. 캔 것은 지갑에 쌓입니다.`, 'wire', `wire:wheel:${coin}`);
  return { ok: true, amount: def.cost };
}

export function sellWheel(g: GameState, coin: CoinId): Res {
  const run = g.run;
  const w = run.coinWheels[coin];
  if (!w) return { ok: false, code: 'none' };
  if (w.tagBy) {
    logEvent(run, 'sell_blocked', `${wheelByCoin[coin].name}: 딱지가 붙어 팔 수 없음`);
    return { ok: false, code: 'tagged' };
  }
  if (run.equipment.some((u) => u.coin === coin)) return { ok: false, code: 'attached', msg: '붙은 설비를 먼저 옮기십시오.' };
  const got = floorS(wheelByCoin[coin].cost * A.sellRate);
  removeWheel(run, coin);
  run.cash += got;
  logEvent(run, 'sell', `${wheelByCoin[coin].name} 판매`, got);
  return { ok: true, amount: got };
}

export { tierDefs, coinWheelDefs, runLevel, stage };

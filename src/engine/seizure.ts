// 딱지·가압류·압류 순서(GDD_v2 3.6). 지갑 -> 설비 -> 설비 없는 종목 쳇바퀴.
import { balance, lenderById, tierDefs, tierById, wheelByCoin } from './data';
import { floorS } from './rng';
import { treeLevel } from './legacy';
import { equipGross, equipNetNow, removeEquip, removeWheel } from './equipment';
import { ownedCoins, price, walletValue } from './selectors';
import { addToSet, bump } from './stats';
import { logEvent, notify } from './util';
import type { CoinId, DebtId, EquipmentUnit, GameState, LenderId, RunState } from './types';

type Tagger = LenderId | 'tax';
const PAY = balance.settlement.payOrder as string[];

export function garnishRate(g: GameState): number {
  return Math.max(0, balance.seizure.garnishRate + (treeLevel(g.family, 'exempt') * -3) / 100);
}

/** 어느 곳이든 딱지를 붙인 채권처 목록(납부 순서). 원금이 0이면 딱지는 효력이 없다. */
export function taggingLenders(run: RunState): Tagger[] {
  const s = new Set<string>();
  for (const u of run.equipment) if (u.tagBy) s.add(u.tagBy);
  for (const c of ownedCoins(run)) if (run.coinWheels[c].tagBy) s.add(run.coinWheels[c].tagBy!);
  if (run.walletTagBy) s.add(run.walletTagBy);
  return PAY.filter((id) => s.has(id) && run.debts[id as DebtId]?.principal > 0) as Tagger[];
}

/** 수입 `qty`(코인 수 또는 현금)에서 가압류 몫을 떼어 원금에서 깎고 남은 수량을 돌려준다. coin=null 이면 현금. */
export function applyGarnish(g: GameState, coin: CoinId | null, qty: number): number {
  const run = g.run;
  const list = taggingLenders(run);
  if (!list.length || qty <= 0) return qty;
  const each = garnishRate(g);
  const total = Math.min(1, each * list.length);
  const per = total / list.length;
  const unit = coin ? price(run, coin) : 1;
  for (const id of list) {
    run.garnishAcc[id] = (run.garnishAcc[id] ?? 0) + qty * per * unit;
    const whole = floorS(run.garnishAcc[id]);
    if (whole >= 1) {
      const take = Math.min(whole, run.debts[id as DebtId].principal);
      run.debts[id as DebtId].principal -= take;
      run.garnishAcc[id] -= whole;
      bump(run, 'garnished', take);
    }
  }
  return qty * (1 - total);
}

// ── 가압류 딱지 붙이기 ──────────────────────────────────────────────────
function tierRank(tier: string): number {
  return tierDefs.findIndex((t) => t.id === tier);
}

/** 채권처의 취향대로 설비를 정렬한다(같은 단계면 지금 순수입이 큰 종목 먼저). */
export function orderedEquip(g: GameState, list: EquipmentUnit[], order: 'cheapFirst' | 'expensiveFirst' | 'bankCollateralOnly'): EquipmentUnit[] {
  const dir = order === 'cheapFirst' ? 1 : -1;
  return [...list].sort((a, b) => {
    const d = (tierRank(a.tier) - tierRank(b.tier)) * dir;
    if (d) return d;
    const n = equipNetNow(g, b) - equipNetNow(g, a); // 잘 도는 것부터
    if (Math.abs(n) > 1e-9) return n;
    return a.uid < b.uid ? -1 : 1;
  });
}

export function hasTag(run: RunState, id: string): boolean {
  return run.equipment.some((u) => u.tagBy === id) || ownedCoins(run).some((c) => run.coinWheels[c].tagBy === id) || run.walletTagBy === id;
}

export function removeTags(run: RunState, id: string): void {
  for (const u of run.equipment) if (u.tagBy === id) u.tagBy = null;
  for (const c of ownedCoins(run)) if (run.coinWheels[c].tagBy === id) run.coinWheels[c].tagBy = null;
  if (run.walletTagBy === id) run.walletTagBy = null;
  run.stats.tagBy = (run.stats.tagBy as string[]).filter((x) => x !== id);
}

/** 연체 1회 이상인 채권처가 아직 딱지가 없으면 하나 붙인다. */
export function ensureTag(g: GameState, id: Tagger): void {
  const run = g.run;
  if (hasTag(run, id) || run.debts[id].principal <= 0) return;
  const order = lenderById[id].tagOrder;
  const free = run.equipment.filter((u) => !u.tagBy && (order !== 'bankCollateralOnly' || tierById[u.tier].bankCollateral));
  const pick = orderedEquip(g, free, order)[0];
  let where: string | null = null;
  if (pick) {
    pick.tagBy = id;
    where = tierById[pick.tier].name;
  } else if (order !== 'bankCollateralOnly') {
    const wheel = ownedCoins(run).filter((c) => !run.coinWheels[c].tagBy).sort((a, b) => wheelByCoin[a].cost - wheelByCoin[b].cost)[0];
    if (wheel) {
      run.coinWheels[wheel].tagBy = id;
      where = wheelByCoin[wheel].name;
    } else {
      run.walletTagBy = id;
      where = '지갑';
    }
  }
  if (where) {
    addToSet(run, 'tagBy', id);
    logEvent(run, `tag:${id}`, `${lenderById[id].name}: ${where}에 가압류 딱지`);
    notify(run, `${lenderById[id].name}이(가) ${where}에 가압류 딱지를 붙였습니다. 수입의 ${Math.round(garnishRate(g) * 100)}%가 원금에서 깎입니다.`, 'warn');
  }
}

// ── 압류 ────────────────────────────────────────────────────────────────
/** 마지막 종목 쳇바퀴(와 거기 붙은 가장 낮은 설비)를 지키는 가문 특성 `lastwheel`. */
function protectedItems(g: GameState): { wheel: CoinId | null; equip: string | null } {
  const run = g.run;
  const lv = treeLevel(g.family, 'lastwheel');
  const coins = ownedCoins(run);
  if (lv < 1 || coins.length !== 1) return { wheel: null, equip: null };
  const coin = coins[0];
  let equip: string | null = null;
  if (lv >= 2) {
    const low = run.equipment.filter((u) => u.coin === coin).sort((a, b) => tierRank(a.tier) - tierRank(b.tier))[0];
    equip = low?.uid ?? null;
  }
  return { wheel: coin, equip };
}

export interface SeizeResult {
  what: 'wallet' | 'equipment' | 'wheel';
  id: string;
  value: number;
}

/** 이 채권처의 연체가 한도에 닿았을 때 하나를 가져간다. 가져갈 것이 없으면 null(파산). */
export function seizeFor(g: GameState, lender: DebtId): SeizeResult | null {
  const run = g.run;
  const d = run.debts[lender];
  const cut = (v: number) => Math.min(floorS(v), d.principal);
  // 1. 지갑
  const wv = walletValue(run);
  if (wv >= balance.mining.walletSeizeMin) {
    const off = cut(wv * balance.mining.walletSeizeRate);
    for (const c of ownedCoins(run)) if (run.wallet[c]) run.wallet[c].qty = 0;
    d.principal -= off;
    run.walletTagBy = run.walletTagBy === lender ? null : run.walletTagBy;
    logEvent(run, 'seize:wallet', '지갑 전부가 압류됐다', off);
    return finish('wallet', 'wallet', off);
  }
  // 2. 설비
  const prot = protectedItems(g);
  const own = run.equipment.filter((u) => u.uid !== prot.equip);
  if (own.length) {
    const mine = own.filter((u) => u.tagBy === lender);
    const order = lender === 'tax' ? 'expensiveFirst' : lenderById[lender].tagOrder;
    const pick = (mine.length ? orderedEquip(g, mine, order) : orderedEquip(g, own, order === 'bankCollateralOnly' ? 'expensiveFirst' : order))[0];
    const off = cut(pick.cost * balance.assets.auctionRate);
    removeEquip(run, pick.uid);
    d.principal -= off;
    bump(run, 'assetsSeized', 1);
    addToSet(run, 'seized', pick.inheritedSign ? 'inheritedSign' : pick.tier);
    if (pick.inheritedSign) addToSet(run, 'seized', pick.tier);
    if (pick.boughtWithLoan && run.tick - pick.boughtTick <= balance.trading.fundedByWindowSec) run.stats.seizedBoughtWithLoan = true;
    logEvent(run, `seize:${pick.tier}`, `${tierById[pick.tier].name}이(가) 압류됐다`, off);
    return finish('equipment', pick.uid, off);
  }
  // 3. 설비가 다 떠난 종목 쳇바퀴(싼 것부터)
  const wheels = ownedCoins(run).filter((c) => c !== prot.wheel).sort((a, b) => wheelByCoin[a].cost - wheelByCoin[b].cost);
  if (wheels.length) {
    const coin = wheels[0];
    const off = cut(wheelByCoin[coin].cost * balance.assets.auctionRate);
    removeWheel(run, coin);
    d.principal -= off;
    bump(run, 'assetsSeized', 1);
    addToSet(run, 'seized', wheelByCoin[coin].id);
    logEvent(run, `seize:wheel:${coin}`, `${wheelByCoin[coin].name}이(가) 압류됐다`, off);
    return finish('wheel', coin, off);
  }
  return null;

  function finish(what: SeizeResult['what'], id: string, value: number): SeizeResult {
    run.stats.lastSeizeSettleNo = run.settleNo;
    notify(run, `${lenderById[lender].name}이(가) 압류했습니다. 평가에 업그레이드 값은 포함되지 않습니다.`, 'warn');
    return { what, id, value };
  }
}
export { equipGross };

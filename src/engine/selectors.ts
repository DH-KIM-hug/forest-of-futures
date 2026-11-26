// 파생값(저장하지 않고 계산). GDD_v2 5.3
import { balance, COINS, DEBT_IDS, friendDefs, housePrice, lenderById, tierById, treeById, wheelByCoin, upgradeTracks } from './data';
import { floorS, ceilS } from './rng';
import { treeLevel, traitMul, traitVal } from './legacy';
import type { CoinId, DebtId, EquipmentUnit, GameState, LenderId, RunState } from './types';

export const ownedCoins = (run: RunState): CoinId[] => COINS.filter((c) => run.coinWheels[c]);
export const stage = (run: RunState): 0 | 1 | 2 => (ownedCoins(run).length === 0 ? 0 : run.futures.open ? 2 : 1);
export const price = (run: RunState, coin: string): number => run.prices[coin] ?? run.refPrice[coin];
export const refPrice = (run: RunState, coin: string): number => run.refPrice[coin];

export const walletValueOf = (run: RunState, coin: string): number => (run.wallet[coin]?.qty ?? 0) * price(run, coin);
export const walletValue = (run: RunState): number => COINS.reduce((a, c) => a + walletValueOf(run, c), 0);

export function appraisalMult(run: RunState): number {
  let m = 1;
  for (const e of run.effects) if (e.type === 'appraisalMultiplier') m *= e.multiplier;
  return m;
}
export const houseValue = (run: RunState): number => housePrice[run.house] * appraisalMult(run);

const A = balance.assets;
export const equipAppraisal = (u: EquipmentUnit): number => u.cost * A.appraisalRate;
export const equipAppraisalSum = (run: RunState, bankOnly = false): number =>
  run.equipment.reduce((a, u) => a + (!bankOnly || tierById[u.tier].bankCollateral ? equipAppraisal(u) : 0), 0);
export const wheelAppraisalSum = (run: RunState): number => ownedCoins(run).reduce((a, c) => a + wheelByCoin[c].cost * A.appraisalRate, 0);

export const friendDebtTotal = (run: RunState): number => friendDefs.reduce((a, f) => a + run.friends[f.id].debt, 0);
export const lenderDebtTotal = (run: RunState): number => DEBT_IDS.reduce((a, id) => a + run.debts[id].principal, 0);
export const totalDebt = (run: RunState): number => lenderDebtTotal(run) + friendDebtTotal(run);
export const sharkDebt = (run: RunState): number => run.debts.shark1.principal + run.debts.shark2.principal;

/** 순자산 = 현금 + 지갑 + 포지션 + 설비·쳇바퀴 평가액(구매가의 80%) + 집 평가액 × 0.9 − 총부채. 업그레이드 값은 들어가지 않는다. */
export function netWorth(run: RunState): number {
  const positions = Object.values(run.positions).reduce((a, p) => a + p.margin, 0);
  return (
    run.cash + walletValue(run) + positions + equipAppraisalSum(run) + wheelAppraisalSum(run) +
    houseValue(run) * 0.9 - totalDebt(run)
  );
}

export function lenderLimit(g: GameState, id: LenderId): number {
  const run = g.run;
  const l = lenderById[id];
  const rel = g.family.lenderRelations[id];
  let relMul = 1;
  if (rel === 'tie') relMul = balance.inheritance.tie.limitMul;
  else if (rel === 'grudge') {
    const lv = treeLevel(g.family, 'thickskin');
    const cut = lv > 0 ? treeById.thickskin.effect.levels[lv - 1] : 1 - balance.inheritance.grudge.limitMul;
    relMul = 1 - cut;
  }
  const houseMul = traitMul(g, 'houseLimitMul');
  let lim: number;
  if (id === 'bank') {
    lim = houseValue(run) * (traitVal(g, 'bankLtv') ?? l.ltv!) + equipAppraisalSum(run, true) * A.collateralLtvBank;
  } else if (id === 'capital') {
    lim = l.limitByHouse![run.house] * houseMul + (equipAppraisalSum(run) + wheelAppraisalSum(run)) * A.collateralLtvCapital + walletValue(run) * balance.mining.walletLtvCapital;
  } else {
    lim = l.limitByHouse![run.house] * houseMul;
  }
  return floorS(lim * relMul);
}

/** 마을 사건(금리 인상)이 이자에 곱하는 배수. 고정금리 몫(금리 상한이 붙은 물려받은 빚)에는 붙지 않는다. */
export function eventRateMult(g: GameState): number {
  let m = 1;
  for (const e of g.run.effects) {
    if (e.type !== 'rateMultiplier') continue;
    m *= e.id === 'rate_hike' ? (traitVal(g, 'rateHikeMul') ?? e.multiplier) : e.multiplier;
  }
  return m;
}
/** 가문 특성 '흥정'의 이자 할인(모든 몫에 붙는다) */
export const haggleMult = (g: GameState): number => Math.pow(treeById.haggle.effect.mulPerLevel, treeLevel(g.family, 'haggle'));
export function rateMult(g: GameState): number {
  return eventRateMult(g) * haggleMult(g);
}

/** 이번 정산 이자(올림). 프로모션 대출은 3회 반값, 4~6회 두 배, 이자 유예·면제는 0. */
export function interestDue(g: GameState, id: DebtId): number {
  const run = g.run;
  const d = run.debts[id];
  if (d.principal <= 0 || id === 'tax') return 0;
  if (d.graceLeft > 0 || run.waivePending[id]) return 0;
  const rate = lenderById[id].rate + (g.family.lenderRelations[id] === 'grudge' ? balance.inheritance.grudge.ratePlus : 0);
  let base = d.principal;
  let extra = 0;
  // 따로 정한 금리가 붙는 몫(오소리의 두 번째 대출부터): 그 몫은 그 금리로
  for (const t of d.tranches ?? []) {
    const amt = Math.min(t.amount, base);
    base -= amt;
    extra += amt * (t.rate + (rate - lenderById[id].rate));
  }
  // 승계 몫에만 금리 상한(단순승인 4%)
  const capRate = d.rateCap != null && d.inherited > 0 ? Math.min(rate, d.rateCap) : rate;
  const inh = capRate < rate ? Math.min(d.inherited, base) : 0;
  const inhSave = inh * (rate - capRate);
  const promo = run.promos[id] ?? [];
  const cfg = promoCfg();
  for (const p of promo) {
    const amt = Math.min(p.amount, base);
    base -= amt;
    const f = p.n < cfg.halfSettlements ? cfg.halfMul : p.n < cfg.halfSettlements + cfg.doubleSettlements ? cfg.doubleMul : 1;
    extra += amt * rate * f;
  }
  // 금리 상한이 붙은 물려받은 몫은 고정금리다("어머님 때 이자 그대로"): 금리 인상 사건의 배수를 받지 않는다(U-39 ⑥)
  const fixed = inh * capRate;
  return ceilS(((base * rate + extra - inhSave - fixed) * eventRateMult(g) + fixed) * haggleMult(g));
}
/** 그 채권처 빚 가운데 고정금리(금리 상한이 붙은 물려받은 몫)의 이자. 금리 인상에도 그대로다. */
export function fixedInterest(g: GameState, id: DebtId): number {
  const d = g.run.debts[id];
  if (id === 'tax' || d.principal <= 0 || d.rateCap == null || !(d.inherited > 0)) return 0;
  const rate = lenderById[id].rate + (g.family.lenderRelations[id] === 'grudge' ? balance.inheritance.grudge.ratePlus : 0);
  if (!(d.rateCap < rate)) return 0;
  const repeat = (d.tranches ?? []).reduce((a, t) => a + t.amount, 0);
  return Math.min(d.inherited, Math.max(0, d.principal - repeat)) * d.rateCap * haggleMult(g);
}
import { offerById } from './data';
function promoCfg() {
  return offerById.promo.effect as { halfSettlements: number; doubleSettlements: number; halfMul: number; doubleMul: number };
}

/** 이 채권처에서 지금 새로 빌리면 붙는 금리(정산당). 오소리는 같은 생의 두 번째 대출부터 repeatRate. */
export function nextBorrowRate(g: GameState, id: LenderId): number {
  const l = lenderById[id] as { rate: number; repeatRate?: number };
  return l.repeatRate != null && ((g.run.stats[`borrow.${id}`] as number | undefined) ?? 0) >= 1 ? l.repeatRate : l.rate;
}

export function livingDue(g: GameState): number {
  return ceilS(balance.living.byHouse[g.run.house] * traitMul(g, 'livingMul'));
}

export const isShark2Open = (run: RunState): boolean => run.shark2Open;

export { upgradeTracks };

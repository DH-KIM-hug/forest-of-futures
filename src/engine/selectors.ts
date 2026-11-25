import { balance, houses, housingRules, jobs, lenders, lenderById, friendDefs, T } from './data';
import type { GameState, LenderId, Position, RunState } from './types';
import { floorS } from './rng';

export function appraisalMult(run: RunState): number {
  let m = 1;
  for (const e of run.effects) if (e.type === 'appraisalMultiplier') m *= e.multiplier;
  return m;
}
export function appraisal(run: RunState, stage = run.houseStage): number {
  return floorS(houses[stage].collateralValue * appraisalMult(run));
}
export function rateMult(run: RunState): number {
  let m = 1;
  for (const e of run.effects) if (e.type === 'rateMultiplier') m *= e.multiplier;
  return m;
}
export function friendsDebt(run: RunState): number {
  return friendDefs.reduce((a, f) => a + (run.friends[f.id]?.debt ?? 0), 0);
}
export function lendersDebt(run: RunState): number {
  return run.debts.bank + run.debts.capital + run.debts.shark1 + run.debts.shark2;
}
export function totalDebt(run: RunState): number {
  return lendersDebt(run) + friendsDebt(run);
}
export function posPnl(p: Position, price: number): number {
  return (p.dir * (price - p.entry)) / p.entry * p.notional;
}
export function posRoe(p: Position, price: number): number {
  return (posPnl(p, price) / p.margin) * 100;
}
export function posEquity(p: Position, price: number): number {
  return Math.max(0, p.margin + posPnl(p, price));
}
export function positionsEquity(run: RunState, except?: string): number {
  let a = 0;
  for (const p of Object.values(run.positions)) {
    if (p.market === except) continue;
    a += posEquity(p, run.markets[p.market].price);
  }
  return a;
}
export function houseValueForNetWorth(run: RunState): number {
  return floorS(appraisal(run) * housingRules.sellRate);
}
export function netWorth(run: RunState): number {
  return floorS(run.cash + positionsEquity(run) + houseValueForNetWorth(run) - totalDebt(run));
}
export function liqPrice(p: Position): number {
  const r = T.maintenanceRate;
  return p.dir > 0 ? p.entry * (1 - p.margin / p.notional + r) : p.entry * (1 + p.margin / p.notional - r);
}
export function slPrice(p: Position): number | null {
  return p.slRoe === null ? null : p.entry * (1 + (p.dir * p.slRoe) / 100 / p.lev);
}
export function tpPrice(p: Position): number | null {
  return p.tpRoe === null ? null : p.entry * (1 + (p.dir * p.tpRoe) / 100 / p.lev);
}

export function currentJobId(run: RunState): string {
  let best = jobs[0];
  for (const j of jobs) {
    if (j.unlock.type === 'always') {
      if (j.order >= best.order) best = j;
    } else if (j.unlock.type === 'stat') {
      const v = j.unlock.stat === 'houseStage' ? run.houseStage : Number(run.stats[j.unlock.stat!] ?? 0);
      if (v >= (j.unlock.value ?? 0) && j.order >= best.order) best = j;
    }
  }
  return best.id;
}
export const jobById = (id: string) => jobs.find((j) => j.id === id)!;
export const currentJob = (run: RunState) => jobById(run.jobId);

export function lenderLimit(run: RunState, id: LenderId): number {
  const l = lenderById[id];
  if (l.limitRule === 'ltv') return floorS(housingRules.ltv * appraisal(run));
  return l.limitByHouseStage![run.houseStage];
}
export function interestDue(run: RunState, id: LenderId): number {
  const l = lenderById[id];
  return Math.round(run.debts[id] * l.ratePerSettlement * rateMult(run));
}
export function upkeepDue(run: RunState): number {
  return houses[run.houseStage].upkeepPerSettlement + run.upkeepArrears;
}
export function nextOutflow(run: RunState): number {
  let a = upkeepDue(run);
  for (const l of lenders) a += interestDue(run, l.id);
  return a;
}
export function isShark2Unlocked(run: RunState): boolean {
  return (
    run.shark2Open ||
    run.stats.odTotal >= 1 ||
    totalDebt(run) >= 500000 ||
    run.stats.claimsSold > 0
  );
}
export function refreshLatches(run: RunState): void {
  if (!run.shark2Open && isShark2Unlocked(run)) run.shark2Open = true;
}
export function openPositionCount(run: RunState): number {
  return Object.keys(run.positions).length;
}
export function brokenCount(run: RunState): number {
  return friendDefs.filter((f) => run.friends[f.id]?.broken).length;
}
export const gameNet = (g: GameState) => netWorth(g.run);
export const startCash = balance.start.cash as number;

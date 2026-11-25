import { endingsMeta, friendDefs, housingRules, lenders } from './data';
import { clock } from './clock';
import { appraisal, friendsDebt, lendersDebt, netWorth, positionsEquity, totalDebt } from './selectors';
import type { GameState, RunState, Snapshot } from './types';

const NULLABLE = new Set([
  'lastLev', 'lastDir', 'lastMarket', 'lastHoldSec', 'lastHeldCycles', 'lastMargin', 'lastMarginPct', 'lastViaJump',
  'lastHadSL', 'lastAdds', 'lastNearLiqSec', 'lastTpNearMiss', 'lastEntryAtExtreme', 'lastAgainstTrend', 'lastFlip',
  'lastAfterNewsSec', 'lastNewsFake', 'lastFundedBy', 'lastLiqByFunding', 'lastLoss', 'lastPostLiqTaps',
  'lastMoveDir', 'cyclesSinceMove', 'netWorthAtMove', 'cyclesSinceBankBorrow', 'cyclesSinceShark2Borrow',
]);
const BOOLS = new Set(['contactsSeized', 'termsViewedShark2', 'hedgedEver', 'wasLocalBest']);

/** endings.json meta.stats 의 run 범위 통계를 초기값으로 만든다. */
export function initialRunStats(): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries<any>(endingsMeta.stats)) {
    if (v.scope !== 'run') continue;
    if (NULLABLE.has(k)) out[k] = null;
    else if (BOOLS.has(k)) out[k] = false;
    else if (k === 'brokenFriendIds') out[k] = [];
    else out[k] = 0;
  }
  return out;
}

export interface SnapshotOpts {
  cause: string;
  immediate: boolean;
  causeLender: string | null;
  shortfall: number;
}

export function buildSnapshot(g: GameState, o: SnapshotOpts): Snapshot {
  const run: RunState = g.run;
  const st = run.stats;
  const d = new Date(clock.now());
  const ap = appraisal(run);
  const pe = positionsEquity(run);
  const debts = run.debts;
  const nonzero = [...lenders.map((l) => debts[l.id]), ...friendDefs.map((f) => run.friends[f.id].debt)].filter((x) => x > 0);
  const trusts = friendDefs.map((f) => (run.friends[f.id].broken ? 0 : run.friends[f.id].trust));
  const hasActive = (id: string) => run.effects.some((e) => e.id === id || (id === 'housing_slump' && e.type === 'appraisalMultiplier'));
  const snap: Snapshot = {
    ...st,
    cause: o.cause,
    immediate: o.immediate,
    causeLender: o.causeLender,
    houseStage: run.houseStage,
    cash: run.cash,
    totalDebt: totalDebt(run),
    netWorth: netWorth(run),
    debtBank: debts.bank,
    debtCapital: debts.capital,
    debtShark1: debts.shark1,
    debtShark2: debts.shark2,
    debtSharks: debts.shark1 + debts.shark2,
    debtFriends: friendsDebt(run),
    ltvPct: ap > 0 ? (debts.bank / ap) * 100 : 0,
    housingSlumpActive: hasActive('housing_slump'),
    rateHikeActive: run.effects.some((e) => e.type === 'rateMultiplier'),
    positionsEquity: pe,
    shortfall: o.shortfall,
    equityCoversShortfall: o.shortfall > 0 && pe >= o.shortfall,
    auctionSurplus: Math.floor(ap * housingRules.auctionRate) - debts.bank,
    minNonzeroDebt: nonzero.length ? Math.min(...nonzero) : null,
    creditScore: run.creditScore,
    location: run.view.location,
    localHour: d.getHours(),
    localDay: d.getDate(),
    localWeekday: d.getDay(),
    localMonth: d.getMonth() + 1,
    offline: run.offline,
    stBank: run.streak.bank,
    stUpkeep: run.streak.upkeep,
    trustMin: Math.min(...trusts),
    trustAvg: trusts.reduce((a, b) => a + b, 0) / trusts.length,
    peakNetWorth: run.peakNetWorth,
    liqsThisCycle: st.liqsThisCycle,
    lifeBankruptcies: g.life.lifeBankruptcies,
    lifeCollected: Object.keys(g.encyclopedia).length,
    lifeRuns: g.life.lifeRuns,
    lifeLiqs: g.life.lifeLiqs,
    lifeLaborTaps: g.life.lifeLaborTaps,
    lifeOdTotal: g.life.lifeOdTotal,
    lifeOdShark1: g.life.lifeOdShark1,
    lifeOdShark2: g.life.lifeOdShark2,
    lifeBorrowShark2: g.life.lifeBorrowShark2,
    lifeFriendsBroken: g.life.lifeFriendsBroken,
    lifeLev200Trades: g.life.lifeLev200Trades,
  };
  const prior = g.records.length ? Math.max(...g.records.map((r) => r.peakNetWorth)) : null;
  snap.wasLocalBest = prior !== null && run.peakNetWorth > prior;
  void lendersDebt;
  return snap;
}

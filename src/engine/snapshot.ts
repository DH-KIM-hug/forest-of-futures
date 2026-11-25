// 파산 순간의 통계 스냅샷(GDD_v2 4.10). 엔딩 조건이 읽는 키 전부를 만든다. 값을 알 수 없는 키는 null(숫자 비교는 거짓).
import { balance, COINS, endingsMeta } from './data';
import { equipAppraisalSum, houseValue, netWorth, ownedCoins, sharkDebt, stage, walletValue, walletValueOf, friendDebtTotal } from './selectors';
import { mineConcentration } from './equipment';
import { levCapNow, positionList } from './futures';
import { lastLogKinds } from './util';
import type { GameState, PayId } from './types';

export interface SnapCtx {
  cause: string;
  lastLender: PayId | null;
  shortfall: number;
}
const TIME = balance.settlement.dayLabels as string[];
const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

export function econOf(g: GameState): 'normal' | 'slump' | 'crash' | 'boom' {
  const top = mineConcentration(g).coin;
  if (!top) return 'normal';
  const r = g.run.prices[top] / g.run.refPrice[top] - 1;
  return r <= -0.3 ? 'crash' : r <= -0.1 ? 'slump' : r >= 0.1 ? 'boom' : 'normal';
}

export function buildSnapshot(g: GameState, ctx: SnapCtx): Record<string, any> {
  const run = g.run;
  const st = run.stats;
  const f = g.family;
  const lp = run.lastPos;
  const open = positionList(run);
  const wv = walletValue(run);
  const eq = equipAppraisalSum(run);
  const conc = mineConcentration(g);
  const tops = COINS.map((c) => walletValueOf(run, c));
  const last3 = lastLogKinds(run, 3);
  const alias = new Set(last3);
  for (const k of last3) {
    if (k === 'stamp:shark1' || k === 'stamp:shark2') alias.add('stamp:shark');
    if (k === 'borrow:shark1' || k === 'borrow:shark2') alias.add('borrow:shark');
  }
  const lastKind = lastLogKinds(run, 1)[0] ?? null;
  const cause = ctx.cause;
  const streak = (c: string) => (cause === c ? n(f.stats[`sameCause.${c}`]) + 1 : 0);
  const claim = n(st.lastClaim);
  const holdTicks = open.length ? Math.max(...open.map((p) => run.tick - p.openTick)) : 0;
  const s: Record<string, any> = {
    // 사는 곳·때
    house: run.house, houseInherited: st.houseInherited === true, netWorthAtMove: st.netWorthAtMove ?? null,
    time: TIME[run.settleNo % TIME.length], settleNo: run.settleNo, event: st.event ?? null, econ: econOf(g),
    nightTaps: n(st.nightTaps),
    minSinceFamilyRecord: st.familyRecordTick != null ? (run.tick - st.familyRecordTick) / 60 : null,
    // 빚
    'debt.bank': run.debts.bank.principal, 'debt.capital': run.debts.capital.principal, 'debt.shark1': run.debts.shark1.principal, 'debt.shark2': run.debts.shark2.principal,
    sharkDebt: sharkDebt(run), lastLender: ctx.lastLender,
    lastLenderPrincipal: ctx.lastLender && ctx.lastLender in run.debts ? run.debts[ctx.lastLender as 'bank'].principal : 0,
    'od.shark2': n(st['od.shark2']), odInstitution: n(st.odInstitution), odTotal: n(st.odTotal), 'borrow.shark2': n(st['borrow.shark2']),
    flyerLoans: n(st.flyerLoans), upfrontPaid: n(st.upfrontPaid), capitalizedInterest: n(st.capitalizedInterest),
    interestOnlyStreak: n(st.interestOnlyStreak), rollovers: n(st.rollovers), offerTaken: st.offerTaken ?? [], contacts: st.contacts === true,
    collectionTrustLoss: n(st.collectionTrustLoss), 'termsOpened.shark2': n(st['termsOpened.shark2']), bankRefusals: n(st.bankRefusals),
    'visitsSinceOverdue.bank': st['visitsSinceOverdue.bank'] ?? null,
    refi: n(st.refi), 'refi.friend_to_friend': n(st['refi.friend_to_friend']), 'refi.friend_to_lender': n(st['refi.friend_to_lender']),
    'refi.shark2_to_shark1': n(st['refi.shark2_to_shark1']), stamps: n(st.stamps), 'stamps.shark2': n(st['stamps.shark2']),
    lastStampAmount: st.lastStampAmount ?? null, credit: Math.max(1, 10 - n(st.odTotal)),
    ltv: run.house > 0 && houseValue(run) > 0 ? (run.debts.bank.principal / houseValue(run)) * 100 : null,
    shortfall: ctx.shortfall, shortfallPct: claim > 0 ? (ctx.shortfall / claim) * 100 : null,
    // 마지막 행동
    last: lastKind, last3: [...alias],
    // 설비·지갑
    assetsOwned: run.equipment.length, assetsEver: n(st.assetsEver), tagged: run.equipment.filter((u) => u.tagBy).length,
    tagBy: st.tagBy ?? [], seized: st.seized ?? [], assetsSeized: n(st.assetsSeized),
    seizedBoughtWithLoan: st.seizedBoughtWithLoan === true, garnished: n(st.garnished), forcedSold: n(st.forcedSold),
    walletDrawdown: run.walletPeakValue > 0 ? Math.max(0, ((run.walletPeakValue - wv) / run.walletPeakValue) * 100) : 0,
    walletShare: run.cash + wv + eq > 0 ? (wv / (run.cash + wv + eq)) * 100 : 0,
    walletTopShare: wv > 0 ? (Math.max(...tops) / wv) * 100 : 0,
    mineConcentration: conc.pct, mineTopCoin: conc.coin, wheelsOwned: ownedCoins(run).length,
    laborTaps: n(st.laborTaps), pawned: n(st.pawned), pawnedHeirloomAge: st.pawnedHeirloomAge ?? null, soldForTax: n(st.soldForTax),
    upgradesBought: n(st.upgradesBought),
    // 거래(마지막 포지션)
    lev: lp?.lev ?? null, dir: lp ? (lp.dir === 1 ? 'long' : 'short') : null, holdSettles: lp?.holdSettles ?? null,
    sl: lp?.sl ?? null, tp: lp?.tp ?? null, adds: lp?.adds ?? 0, margin: lp?.margin0 ?? null, marginPct: lp?.marginPct ?? null,
    viaJump: lp?.viaJump === true, viaFunding: lp?.viaFunding === true, fundedBy: lp?.fundedBy ?? null,
    entryAtHigh: lp?.entryAtHigh === true, entryAtLow: lp?.entryAtLow === true, maxRoe: lp?.maxRoe ?? null,
    roeLowMin: lp?.roeLowMin ?? null, posFundingPaid: lp?.fundingPaid ?? null, revengeDir: lp?.revenge?.dir ?? null,
    revengeWithinSettles: lp?.revenge?.within ?? null, posMargin: lp?.margin0 ?? null, _tpRoe: lp?.tpRoe ?? null,
    // 거래(세대)
    trades: n(st.trades), lev200Trades: n(st.lev200Trades), nonLev200Trades: n(st.nonLev200Trades), liqStreak: n(st.liqStreak),
    liqsThisCycle: n(st.liqsThisCycle), flips: n(st.flips), winStreak: n(st.winStreak), marginCalls: n(st.marginCalls),
    fundingPaid: n(st.fundingPaid), lossRecord: st.lossRecord === true, lastLoss: n(st.lastLoss),
    marginLocked: open.reduce((a, p) => a + p.margin, 0), posCount: open.length, hasLong: open.some((p) => p.dir === 1),
    hasShort: open.some((p) => p.dir === -1), openPosLev: open.length ? Math.max(...open.map((p) => p.lev)) : null,
    openPosHoldHours: holdTicks / 3600, watchSec: n(st.watchSec), offline: run.report !== null, awayHours: run.report !== null || st.awayHours != null ? n(st.awayHours) : null,
    acctAgeSettles: run.futures.openedAtSettle !== null ? run.settleNo - run.futures.openedAtSettle : null, levCap: levCapNow(run), stage: stage(run),
    // 정보
    tipSource: lp?.tipSource ?? null, tipAgree: lp?.tipAgree ?? 0, tipWasRight: lp?.tipWasRight === true, tipsIgnored: Math.max(0, n(st.tipsSeen) - n(st.tipTrades)),
    fadedWire: lp?.fadedWire === true, newsAfterEntry: lp?.newsAfterEntry ?? null, tipTrades: n(st.tipTrades), leadroomFollowed: n(st.leadroomFollowed),
    // 친구
    friendsBroken: n(st.friendsBroken), broken: st.broken ?? [], lastBroken: st.lastBroken ?? null, brokenWithinSettles: st.brokenWithinSettles ?? null,
    friendOd: n(st.friendOd), friendDebt: friendDebtTotal(run), friendStamps: n(st.friendStamps), 'friendStamps.raccoon': n(st['friendStamps.raccoon']),
    friendsBorrowed: n(st.friendsBorrowed), friendBorrows: n(st.friendBorrows), borrowedThenTraded: n(st.borrowedThenTraded),
    fundedByFriends: n(st.fundedByFriends), claimsSold: n(st.claimsSold), cashAtBreak: st.cashAtBreak ?? null,
    friendDebtAtBreak: n(st.friendDebtAtBreak), sharkBorrowed: n(st.sharkBorrowed),
    // 세대
    inherit: run.branch, branch: run.branch, parentInherit: st.parentInherit ?? null, parentCause: st.parentCause ?? null,
    grudge: Object.entries(f.lenderRelations).filter(([, v]) => v === 'grudge').map(([k]) => k),
    grudgeCount: Object.values(f.lenderRelations).filter((v) => v === 'grudge').length,
    'inheritedDebt.shark': run.debts.shark1.inherited + run.debts.shark2.inherited, inheritedPaid: n(st.inheritedPaid),
    estateNet: st.estateNet ?? null, han: f.han,
    // 가문
    'fam.bankruptcies': n(f.stats.bankruptcies) + 1, 'fam.bankruptcies.TIP': n(f.stats['bankruptcies.TIP']) + (cause === 'TIP' ? 1 : 0),
    'fam.sameCauseStreak.FRIEND': streak('FRIEND'), 'fam.sameCauseStreak.SHARK': streak('SHARK'), 'fam.simpleStreak': f.pending.simpleStreak,
    'fam.liqs': n(f.stats.liqs) + n(st.liqCount), 'fam.taps': n(f.stats.taps) + n(st.laborTaps), 'fam.collected': Object.keys(f.ledger).length,
    'fam.brokenTotal': n(f.stats.brokenTotal) + n(st.friendsBroken),
  };
  void netWorth;
  return s;
}

/** meta.stats 에 있는데 스냅샷에 없는 키(테스트용). */
export const missingKeys = (snap: Record<string, any>): string[] => Object.keys(endingsMeta.stats).filter((k) => !(k in snap));

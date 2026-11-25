// 파산 확정과 원인 판정(GDD_v2 3.6, 3.15 원인 순서). 엔딩 고르기는 M3.
import { balance, DEBT_IDS } from './data';
import { brokenCount } from './friends';
import { ownedCoins, totalDebt, walletValue } from './selectors';
import { logEvent, notify } from './util';
import { finalizeEnding } from './endings';
import type { GameState, PayId } from './types';

export interface BankruptCtx {
  lastLender: PayId | null;
  shortfall: number;
  immediate?: boolean;
}

/** 원인 8가지 중 위에서부터 처음 맞는 것. */
export function determineCause(g: GameState, ctx: BankruptCtx): string {
  const run = g.run;
  const st = run.stats;
  // 1. 절교 3명
  if (brokenCount(run) >= balance.bankruptcy.friendsBrokenLimit) return 'FRIEND';
  // 2. 청산 직후 즉시 파산이거나, 이번·직전 정산의 거래 실현 손실 >= 마지막 미납액 (M2 가 stats 를 채운다)
  const liqLoss = (st.liqLossCur ?? 0) + (st.liqLossPrev ?? 0);
  if (ctx.immediate || (liqLoss > 0 && liqLoss >= ctx.shortfall)) return (st.liqTipCur ?? st.liqTipPrev) ? 'TIP' : 'LIQ';
  // 3. 마지막 연체처가 세무서이거나 남은 빚의 절반 이상이 승계 빚·세금
  const inherited = DEBT_IDS.reduce((a, id) => a + run.debts[id].inherited, 0) + run.debts.tax.principal;
  const total = totalDebt(run);
  if (ctx.lastLender === 'tax' || (total > 0 && inherited >= total / 2)) return 'LEGACY';
  // 4. 최근 정산 3회 안에 압류가 있었고 압류로 준 정산 수입 >= 마지막 미납액
  const gar = (st.garnishBySettle as number[]).reduce((a, b) => a + b, 0);
  if (run.settleNo - st.lastSeizeSettleNo <= 2 && gar >= ctx.shortfall) return 'SEIZE';
  // 5. 생활비·유지비
  if (ctx.lastLender === 'upkeep') return 'UPKEEP';
  // 6. 조합·캐피탈 -> 제도권, 오소리·독사 -> 사채
  return ctx.lastLender === 'bank' || ctx.lastLender === 'capital' ? 'BANK' : 'SHARK';
}

export function declareBankruptcy(g: GameState, ctx: BankruptCtx): void {
  const run = g.run;
  if (run.over) return;
  const cause = determineCause(g, ctx);
  run.over = true;
  run.stats.shortfall = ctx.shortfall;
  run.stats.lastLender = ctx.lastLender;
  run.bankruptcy = { cause, lastLender: ctx.lastLender, shortfall: ctx.shortfall, tick: run.tick, settleNo: run.settleNo, immediate: !!ctx.immediate, offline: false };
  run.bankruptcy.offline = run.report !== null;
  finalizeEnding(g, { cause, lastLender: ctx.lastLender, shortfall: ctx.shortfall });
  logEvent(run, 'bankrupt', `파산(${cause})`);
  notify(run, '파산', 'warn', 'bankrupt');
}

/** 청산 직후 즉시 파산: 현금 + 지갑 + 다른 포지션 평가액 < 1,000 이고 설비·종목 쳇바퀴 0, 총부채 > 0. 파산이면 true. */
export function checkLiquidationWipeout(g: GameState): boolean {
  const run = g.run;
  if (run.over) return false;
  const eq = run.cash + walletValue(run) + Object.values(run.positions).reduce((a, p) => a + p.margin, 0);
  if (eq < balance.trading.wipeoutBelow && run.equipment.length === 0 && ownedCoins(run).length === 0 && totalDebt(run) > 0) {
    declareBankruptcy(g, { lastLender: null, shortfall: 0, immediate: true });
    return true;
  }
  return false;
}

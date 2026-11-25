import { T, marketById, balance } from './data';
import { ceilS, floorS } from './rng';
import { checkLiquidationWipeout } from './bankruptcy';
import { posPnl, posRoe, liqPrice, slPrice, tpPrice, positionsEquity } from './selectors';
import { say, comma, signed } from './util';
import type { Dir, GameState, Position } from './types';

export interface OpenParams {
  market: string;
  dir: Dir;
  lev: number;
  marginPct?: number; // 현금 대비 %(10/25/50/100)
  margin?: number; // 직접 지정(테스트·고급)
  sl?: number | null; // undefined = 기존 유지(새 포지션은 없음)
  tp?: number | null;
}

export interface Res {
  ok: boolean;
  msg?: string;
  code?: string;
}

export function computeMargin(cash: number, lev: number, pct: number): number {
  const fee = pct >= 100 ? lev * T.feeRate : 0;
  return floorS((cash * pct) / 100 / (1 + fee));
}
export const openFee = (notional: number) => ceilS(notional * T.feeRate);

export function entryPreview(cash: number, price: number, dir: Dir, lev: number, pct: number) {
  const margin = computeMargin(cash, lev, pct);
  const n = margin * lev;
  const fee = openFee(n);
  const liq = dir > 0 ? price * (1 - margin / n + T.maintenanceRate) : price * (1 + margin / n - T.maintenanceRate);
  return { margin, notional: n, fee, liq, liqDistPct: ((liq - price) / price) * 100, ok: margin >= T.minMargin && cash >= margin + fee };
}

export function openPosition(g: GameState, p: OpenParams): Res {
  const run = g.run;
  if (run.over) return { ok: false };
  const mk = run.markets[p.market];
  if (!mk) return { ok: false, msg: '알 수 없는 종목' };
  if (!T.leverageOptions.includes(p.lev)) return { ok: false, msg: '배율을 확인하세요' };
  const existing = run.positions[p.market];
  if (existing) {
    if (existing.dir !== p.dir) return { ok: false, code: 'opposite', msg: '반대 방향은 정리한 뒤에만 가능합니다' };
    if (existing.lev !== p.lev) return { ok: false, code: 'lev', msg: '추가 진입은 기존 배율과 같아야 합니다' };
  }
  const margin = p.margin ?? computeMargin(run.cash, p.lev, p.marginPct ?? T.defaultMarginPct);
  const notional = margin * p.lev;
  const fee = openFee(notional);
  if (margin < T.minMargin || run.cash < margin + fee) return { ok: false, code: 'short', msg: `증거금 부족 (최소 ${comma(T.minMargin)})` };
  const price = mk.price;
  const pctUsed = p.marginPct ?? Math.round((margin / Math.max(1, run.cash)) * 100);
  run.cash -= margin + fee;
  run.cycleEntries += 1;

  if (existing) {
    const n1 = existing.notional;
    existing.entry = (n1 + notional) / (n1 / existing.entry + notional / price);
    existing.margin += margin;
    existing.margin0 += margin;
    existing.notional += notional;
    existing.feesPaid += fee;
    existing.adds += 1;
    if (p.sl !== undefined) existing.slRoe = p.sl;
    if (p.tp !== undefined) existing.tpRoe = p.tp;
    say(run, `추가 진입 ${marketById[p.market].short} ${p.dir > 0 ? '롱' : '숏'} ${p.lev}배`, 'trade');
    return { ok: true };
  }

  const st = run.stats;
  const h = mk.hist;
  const base60 = h[Math.max(0, h.length - 1 - T.trendWindowTicks)];
  const ret60 = price / base60 - 1;
  const win = h.slice(-T.chartWindowTicks);
  const hi = Math.max(...win);
  const lo = Math.min(...win);
  const tol = T.entryExtremeTolerance;
  const extreme: 'high' | 'low' | null = price >= hi * (1 - tol) && hi > lo ? 'high' : price <= lo * (1 + tol) && hi > lo ? 'low' : null;
  const ll = run.lastLiq[p.market];
  const flip = !!ll && ll.loss && run.tick - ll.tick <= T.flipWindowSec && ll.dir === -p.dir;
  const hedged = Object.values(run.positions).some((o) => o.dir === -p.dir);
  const rb = [...run.recentBorrows].reverse().find((b) => run.tick - b.tick <= 60);
  const news = run.lastNews;
  const afterNews = !!news && news.market === p.market && run.tick - news.tick <= 15 && news.headlineDir === p.dir;

  const pos: Position = {
    market: p.market,
    dir: p.dir,
    lev: p.lev,
    margin,
    margin0: margin,
    notional,
    entry: price,
    openTick: run.tick,
    openCycle: run.cycles,
    slRoe: p.sl ?? null,
    tpRoe: p.tp ?? null,
    adds: 0,
    marginPct: pctUsed,
    feesPaid: fee,
    peakRoe: 0,
    nearLiqSec: 0,
    marginCalled: false,
    againstTrend: ret60 !== 0 && Math.sign(ret60) === -p.dir,
    entryExtreme: extreme,
    flip,
    afterNewsSec: afterNews ? run.tick - news!.tick : null,
    newsFake: afterNews ? news!.fake : null,
    fundedBy: rb ? (rb.kind === 'friend' ? 'friend' : rb.src) : null,
  };
  run.positions[p.market] = pos;
  st.trades += 1;
  if (p.lev === 200) {
    st.lev200Trades += 1;
    g.life.lifeLev200Trades += 1;
  }
  if (p.lev <= 5) st.lowLevTrades += 1;
  if (flip) st.flips += 1;
  if (hedged) st.hedgedEver = true;
  if (rb?.kind === 'friend') st.fundedByFriendTrades += 1;
  say(run, `${marketById[p.market].short} ${p.dir > 0 ? '롱' : '숏'} ${p.lev}배 진입`, 'trade');
  return { ok: true };
}

export function setStops(g: GameState, market: string, sl: number | null, tp: number | null): Res {
  const pos = g.run.positions[market];
  if (!pos) return { ok: false };
  pos.slRoe = sl;
  pos.tpRoe = tp;
  return { ok: true };
}

function noteLoss(g: GameState, pos: Position, win: boolean): void {
  if (!win) {
    g.run.lastLiq[pos.market] = { tick: g.run.tick, dir: pos.dir, loss: true };
    if (pos.againstTrend) g.run.stats.againstTrendLosses += 1;
  }
}

/** 지정 가격에 정리. kind: close | tp | sl */
export function settlePosition(g: GameState, pos: Position, price: number, kind: 'close' | 'tp' | 'sl'): number {
  const run = g.run;
  const fee = openFee(pos.notional);
  const pnl = posPnl(pos, price);
  const receive = floorS(Math.max(0, pos.margin + pnl - fee));
  run.cash += receive;
  const realized = receive - pos.margin0 - pos.feesPaid;
  const st = run.stats;
  st.grossPnl += floorS(pnl);
  st.realizedPnl += realized;
  run.cycleRealized += realized;
  delete run.positions[pos.market];
  const win = realized > 0;
  run.winStreak = win ? run.winStreak + 1 : 0;
  st.liqStreak = 0;
  noteLoss(g, pos, win);
  run.tradeFlash = { tick: run.tick, kind, market: pos.market, amount: realized };
  const label = kind === 'tp' ? '익절' : kind === 'sl' ? '손절' : '정리';
  say(run, `${label} ${marketById[pos.market].short} ${signed(realized)}`, 'trade');
  return receive;
}

export function closePosition(g: GameState, market: string): Res {
  const pos = g.run.positions[market];
  if (!pos || g.run.over) return { ok: false };
  settlePosition(g, pos, g.run.markets[market].price, 'close');
  return { ok: true };
}

export function liquidate(g: GameState, pos: Position, price: number, jumped: boolean, byFunding: boolean): void {
  const run = g.run;
  const st = run.stats;
  delete run.positions[pos.market];
  const loss = pos.margin0 + pos.feesPaid;
  st.liqs += 1;
  st.liqStreak += 1;
  st.liqsThisCycle += 1;
  g.life.lifeLiqs += 1;
  st.winStreakBeforeLiq = run.winStreak;
  run.winStreak = 0;
  st.grossPnl -= floorS(pos.margin);
  st.realizedPnl -= loss;
  run.cycleRealized -= loss;
  st.lastLev = pos.lev;
  st.lastDir = pos.dir > 0 ? 'long' : 'short';
  st.lastMarket = pos.market;
  st.lastHoldSec = run.tick - pos.openTick;
  st.lastHeldCycles = run.cycles - pos.openCycle;
  st.lastMargin = pos.margin0;
  st.lastMarginPct = pos.marginPct;
  st.lastViaJump = jumped;
  st.lastHadSL = pos.slRoe !== null;
  st.lastAdds = pos.adds;
  st.lastNearLiqSec = pos.nearLiqSec;
  st.lastTpNearMiss = pos.tpRoe !== null && pos.peakRoe >= pos.tpRoe * 0.9;
  st.lastEntryAtExtreme = pos.entryExtreme;
  st.lastAgainstTrend = pos.againstTrend;
  st.lastFlip = pos.flip;
  st.lastAfterNewsSec = pos.afterNewsSec;
  st.lastNewsFake = pos.newsFake;
  st.lastFundedBy = pos.fundedBy;
  st.lastLiqByFunding = byFunding;
  st.lastLoss = pos.margin0;
  st.lastPostLiqTaps = 0;
  run.postLiq = { tick: run.tick, taps: 0 };
  noteLoss(g, pos, false);
  run.lastLiq[pos.market] = { tick: run.tick, dir: pos.dir, loss: true };
  run.tradeFlash = { tick: run.tick, kind: 'liq', market: pos.market, amount: -loss };
  say(run, `강제 청산 ${marketById[pos.market].short} ${signed(-loss)}`, 'warn');
  void price;
  checkLiquidationWipeout(g);
}

/** 시세가 정해진 뒤 그 종목의 포지션을 판정한다. */
export function processPrice(g: GameState, market: string, price: number, jumped: boolean, prevPrice?: number): void {
  const run = g.run;
  const pos = run.positions[market];
  if (!pos || run.over) return;
  const prev = prevPrice ?? run.markets[market].prev;
  const liq = liqPrice(pos);
  if (pos.dir > 0 ? price <= liq : price >= liq) {
    liquidate(g, pos, price, jumped, false);
    return;
  }
  const sl = slPrice(pos);
  if (sl !== null && (pos.dir > 0 ? price <= sl : price >= sl)) {
    const wasSafe = pos.dir > 0 ? prev > sl : prev < sl;
    settlePosition(g, pos, jumped || !wasSafe ? price : sl, 'sl');
    return;
  }
  const tp = tpPrice(pos);
  if (tp !== null && (pos.dir > 0 ? price >= tp : price <= tp)) {
    const wasSafe = pos.dir > 0 ? prev < tp : prev > tp;
    settlePosition(g, pos, jumped || !wasSafe ? price : tp, 'tp');
    return;
  }
  const roe = posRoe(pos, price);
  if (roe > pos.peakRoe) pos.peakRoe = roe;
  if (roe < T.nearLiqRoe) pos.nearLiqSec += 1;
  if (roe < T.marginCallRoe) {
    if (!pos.marginCalled) {
      pos.marginCalled = true;
      run.stats.marginCalls += 1;
    }
  } else pos.marginCalled = false;
}

/** 정산 2단계: 펀딩비. 파산했으면 true. */
export function applyFunding(g: GameState): boolean {
  const run = g.run;
  for (const pos of Object.values(run.positions)) {
    if (run.over) return true;
    const fee = ceilS(pos.notional * T.fundingRatePerSettlement);
    pos.margin -= fee;
    run.stats.fundingPaid += fee;
    const price = run.markets[pos.market].price;
    if (pos.margin + posPnl(pos, price) <= pos.notional * T.maintenanceRate) {
      liquidate(g, pos, price, false, true);
    }
  }
  return run.over;
}

export const totalPositionsEquity = (g: GameState) => positionsEquity(g.run);
void balance;

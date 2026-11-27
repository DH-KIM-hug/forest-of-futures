// 선물 거래(GDD_v2 3.10): 격리 마진, 수수료, 펀딩비, 청산, 손절·익절, 추가 진입. 봉 단위 처리(processBar)도 여기.
import { balance, marketById, tipsData } from './data';
import { ceilS, floorS } from './rng';
import { fundedByAt, refuse } from './loans';
import { inJump } from './market';
import { checkLiquidationWipeout } from './bankruptcy';
import { bump } from './stats';
import { logEvent, notify, josa } from './util';
import { totalDebt } from './selectors';
import { addFeeMul, dayLimitHit, effectiveLevCapsRun, exitFeeMul, feeEventLeft, feeRateRun, hasRun, liqRefund, openingEvent } from './skilltree';
import type { Bar } from './feed/types';
import type { Dir, GameState, LastPos, Position, Res, RunState } from './types';

const T = balance.trading;

// ── 순수 공식 ───────────────────────────────────────────────────────────
export const pnlOf = (p: Position, price: number): number => (p.dir * (price - p.entry)) / p.entry * p.notional;
export const roePct = (p: Position, price: number): number => (pnlOf(p, price) / p.margin0) * 100;
/** 수수료. rate 를 안 주면 기본 수수료율(스킬트리 없는 값). */
export const entryFee = (notional: number, rate: number = T.feeRate): number => ceilS(notional * rate) + 0; // + 0: 수수료율이 0 일 때 −0 이 나오지 않게
/** 청산가: 롱 진입가 × (1 − 증거금/N + 0.1%), 숏 진입가 × (1 + 증거금/N − 0.1%). 증거금은 펀딩비 차감 뒤 값. */
export function liqPrice(p: Position): number {
  return p.dir === 1 ? p.entry * (1 - p.margin / p.notional + T.maintenanceRate) : p.entry * (1 + p.margin / p.notional - T.maintenanceRate);
}
/** 손절·익절가 = 진입가 × (1 + 방향 × ROE / 배율). ROE 는 %. */
export const stopPrice = (p: Position, roe: number): number => p.entry * (1 + (p.dir * roe) / 100 / p.lev);
/** 100% 선택 시 증거금 = floor(현금 / (1 + 배율 × 0.04%)). */
export function marginFromPct(cash: number, lev: number, pct: number, rate: number = T.feeRate): number {
  if (pct >= 100) return floorS(cash / (1 + lev * rate));
  return floorS((cash * pct) / 100);
}
/** 지금 값에 정리하면 돌려받는 돈. exitMul = 나올 때 수수료에 곱하는 값(스킬트리 A2·C1 의 꼬리, 기본 1). */
export const closeBack = (p: Position, price: number, exitMul = 1): number => floorS(Math.max(0, p.margin + pnlOf(p, price) - exitFee(p, exitMul)));
/** 나올 때 수수료 */
export const exitFee = (p: Position, exitMul = 1): number => entryFee(p.notional, (p.feeRate ?? T.feeRate) * exitMul);

/** 지금 쓸 수 있는 배율 상한: 계좌 개설 직후 10 -> 끝난 거래 3건 50 -> 10건 + 확인서 200. */
export function levCapNow(run: RunState): number {
  const f = run.futures;
  let cap = f.levCap;
  for (const c of effectiveLevCapsRun(run)) {
    if (c.closedTrades !== undefined && f.closedTrades < c.closedTrades) continue;
    if (c.waiver && !f.waiver) continue;
    cap = Math.max(cap, c.cap);
  }
  return cap;
}
export const waiverAvailable = (run: RunState): boolean =>
  run.futures.open && !run.futures.waiver && run.futures.closedTrades >= (effectiveLevCapsRun(run)[2].closedTrades as number);

export const positionList = (run: RunState): Position[] => Object.values(run.positions);
/** 숏 보험: 가진 종목의 숏 명목 / 그 종목 지갑 평가액(%, 내림, 100 상한). */
export function shortInsurance(run: RunState, coin: string): { walletValue: number; shortNotional: number; ratioPct: number } {
  const w = (run.wallet[coin]?.qty ?? 0) * (run.prices[coin] ?? 0);
  const n = run.positions[coin]?.dir === -1 ? run.positions[coin].notional : 0;
  return { walletValue: w, shortNotional: n, ratioPct: w > 0 ? Math.min(100, floorS((n / w) * 100)) : 0 };
}
export const positionsValue = (run: RunState): number => positionList(run).reduce((a, p) => a + p.margin + pnlOf(p, run.prices[p.market]), 0);

// ── 진입 ────────────────────────────────────────────────────────────────
export interface OpenParams {
  market: string;
  dir: Dir;
  lev: number;
  margin?: number;
  marginPct?: number;
  sl?: number | null;
  tp?: number | null;
  /** 반대 단추(A3b)로 방금 정리한 포지션의 반대쪽에 들어간다(같은 틱 · 같은 종목 · 반대 방향일 때만 인정) */
  flip?: boolean;
}

function blockReason(g: GameState, market: string): Res | null {
  const run = g.run;
  if (run.over) return { ok: false };
  if (!run.futures.open) return refuse('locked', '선물 계좌가 없습니다.');
  const def = marketById[market];
  if (!def || !def.tradable) return refuse('market', '거래할 수 없는 종목입니다.');
  if (run.marketStatus !== 'open') return refuse('status', run.marketStatus === 'delayed' ? '시세 지연 중에는 진입할 수 없습니다.' : '시장이 정지되어 있습니다.');
  return null;
}

function tagsFor(g: GameState, p: Position): void {
  const run = g.run;
  const win = tipsData.followWindowSec;
  const near = run.recentTips.filter((t) => run.tick - t.tick <= win && t.market === p.market && t.dir !== 0);
  const same = near.filter((t) => t.dir === p.dir);
  if (same.length) {
    const last = same[same.length - 1];
    p.tipSource = tipSourceName(last.source);
    p.tipAgree = new Set(same.map((t) => t.source)).size;
  }
  if (near.some((t) => t.fact && t.dir === -p.dir)) p.fadedWire = true;
  p.fundedBy = fundedByAt(g);
  if (p.fundedBy === 'friend') bump(run, 'fundedByFriends', 1);
  if (p.fundedBy) bump(run, 'borrowedThenTraded', 1);
}
export const tipSourceName = (s: string): string => (['fox', 'raccoon', 'bear', 'rabbit', 'squirrel'].includes(s) ? `friend:${s}` : s);

function recent5Extreme(run: RunState, market: string, price: number): { high: boolean; low: boolean } {
  const bars = (run.mkt.bars[market] ?? []).slice(-5);
  if (!bars.length) return { high: false, low: false };
  const hi = Math.max(...bars.map((b) => b.h));
  const lo = Math.min(...bars.map((b) => b.l));
  const tol = tipsData.entryNearHighLowPct / 100;
  return { high: price >= hi * (1 - tol), low: price <= lo * (1 + tol) };
}

export function openPosition(g: GameState, o: OpenParams): Res {
  const run = g.run;
  const bad = blockReason(g, o.market);
  if (bad) return bad;
  const ex = run.positions[o.market];
  if (dayLimitHit(run)) return refuse('daylimit', DAY_LIMIT_MSG);
  if (ex) {
    if (ex.dir !== o.dir) return refuse('dir', '같은 종목에서는 한 방향만 잡을 수 있습니다.');
    if (ex.lev !== o.lev) return refuse('lev', '추가 진입은 같은 배율만 됩니다.');
    return addToPosition(g, { market: o.market, margin: o.margin, marginPct: o.marginPct });
  }
  if (Object.keys(run.positions).length >= 5) return refuse('count', '포지션은 최대 5개입니다.');
  if (!T.leverageOptions.includes(o.lev)) return refuse('lev', '없는 배율입니다.');
  if (o.lev > levCapNow(run)) return refuse('cap', `배율 상한 ${levCapNow(run)}배`);
  const lc0 = run.lastClose;
  const flip = !!o.flip && hasRun(run, 'A3b') && !!lc0 && lc0.market === o.market && lc0.tick === run.tick && lc0.dir !== o.dir;
  const rate = feeRateRun(run, o.lev, { allIn: o.margin === undefined && (o.marginPct ?? T.defaultMarginPct) >= 100, flip });
  const margin = o.margin ?? marginFromPct(run.cash, o.lev, o.marginPct ?? T.defaultMarginPct, rate);
  if (margin < T.minMargin) return refuse('min', '증거금이 모자랍니다.');
  const notional = margin * o.lev;
  if (notional > T.maxNotional) return refuse('max', '포지션 한도 2억');
  const fee = entryFee(notional, rate);
  if (margin + fee > run.cash) return refuse('cash', '현금 부족');
  const price = run.prices[o.market];
  const ext = recent5Extreme(run, o.market, price);
  run.cash -= margin + fee;
  const lastC = run.lastClose;
  const p: Position = {
    market: o.market, kind: 'perp', dir: o.dir, lev: o.lev, margin, margin0: margin, notional, entry: price,
    openTick: run.tick, openSettle: run.settleNo, slRoe: o.sl ?? null, tpRoe: o.tp ?? null, adds: 0,
    marginPct: run.cash + margin + fee > 0 ? Math.round((margin / (run.cash + margin + fee)) * 100) : 0,
    feesPaid: fee, fundingPaid: 0, peakRoe: 0, roeLowSec: 0, marginCalled: false, fundedBy: null, tipSource: null, tipAgree: 0,
    entryAtHigh: ext.high && o.dir === 1, entryAtLow: ext.low && o.dir === -1, fadedWire: false, newsAfterEntry: null,
    closeReserved: false, reservedStops: null, revenge: null,
  };
  if (rate !== T.feeRate) p.feeRate = rate;
  tagsFor(g, p);
  if (lastC && lastC.market === o.market) {
    if (lastC.liq) p.revenge = { dir: lastC.dir === o.dir ? 'same' : 'opposite', within: run.settleNo - lastC.settleNo };
    if (lastC.dir !== o.dir && run.tick - lastC.tick <= balance.settlement.intervalSec) bump(run, 'flips', 1);
  }
  run.positions[o.market] = p;
  if (feeEventLeft(run) > 0) bump(run, 'eventNotional', notional); // 오픈 기념 동안 수수료 없이 오간 크기(끝날 때 "아낀 수수료"를 셈한다)
  bump(run, 'tradesOpened', 1);
  if (p.tipSource) bump(run, 'tipTrades', 1);
  if (p.tipSource === 'leadroom') bump(run, 'leadroomFollowed', 1);
  run.tradeLog.push({ n: run.tick, market: o.market, dir: o.dir, lev: o.lev, margin, price, kind: 'entry' });
  logEvent(run, 'entry', `${marketById[o.market].name} ${o.dir === 1 ? '롱' : '숏'} ${o.lev}배 진입`, margin);
  return { ok: true, amount: margin };
}

export function addToPosition(g: GameState, o: { market: string; margin?: number; marginPct?: number }): Res {
  const run = g.run;
  const bad = blockReason(g, o.market);
  if (bad) return bad;
  const p = run.positions[o.market];
  if (!p) return refuse('none', '열린 포지션이 없습니다.');
  if (dayLimitHit(run)) return refuse('daylimit', DAY_LIMIT_MSG);
  // 오픈 기념(U-40)이 있는 판: 무료일 때 연 포지션이라도 이벤트가 끝난 뒤의 추가 진입은 지금 수수료율로 낸다(나올 때 수수료율은 크기로 가중 평균)
  const held = p.feeRate ?? T.feeRate;
  const now = openingEvent() ? Math.max(held, feeRateRun(run, p.lev)) : held;
  const rate = now * addFeeMul(run); // 쪼개 넣기(C3a)의 꼬리: 추가 진입 수수료 할인
  const m2 = o.margin ?? marginFromPct(run.cash, p.lev, o.marginPct ?? T.defaultMarginPct, rate);
  if (m2 < T.minMargin) return refuse('min', '증거금이 모자랍니다.');
  const n2 = m2 * p.lev;
  if (p.notional + n2 > T.maxNotional) return refuse('max', '포지션 한도 2억');
  const fee = entryFee(n2, rate);
  if (m2 + fee > run.cash) return refuse('cash', '현금 부족');
  const price = run.prices[o.market];
  run.cash -= m2 + fee;
  if (now !== held) p.feeRate = (held * p.notional + now * n2) / (p.notional + n2);
  p.entry = (p.notional + n2) / (p.notional / p.entry + n2 / price);
  p.notional += n2;
  p.margin += m2;
  p.margin0 += m2;
  p.feesPaid += fee;
  p.adds += 1;
  if (feeEventLeft(run) > 0) bump(run, 'eventNotional', n2);
  logEvent(run, 'add', `${marketById[o.market].name} 추가 진입`, m2);
  run.tradeLog.push({ n: run.tick, market: o.market, dir: p.dir, lev: p.lev, margin: m2, price, kind: 'add' });
  return { ok: true, amount: m2 };
}

export function setStops(g: GameState, market: string, sl: number | null, tp: number | null): Res {
  const run = g.run;
  const p = run.positions[market];
  if (!p) return refuse('none', '열린 포지션이 없습니다.');
  if (run.marketStatus !== 'open') {
    p.reservedStops = { sl, tp };
    return { ok: true, code: 'reserved' };
  }
  p.slRoe = sl;
  p.tpRoe = tp;
  return { ok: true };
}

const DAY_LIMIT_MSG = '하루 한도에 닿았습니다. 다음 아침에 풀립니다.';

/** 증거금만 더 넣는다(물타기 B3b, 또는 마진콜 전화 B2 를 받은 포지션). 크기(명목)는 그대로, 청산가가 멀어지고 걸린 돈이 커진다. 수수료 없음. */
export function addMargin(g: GameState, market: string, amount: number): Res {
  const run = g.run;
  if (run.over) return { ok: false };
  const p = run.positions[market];
  if (!p) return refuse('none', '열린 포지션이 없습니다.');
  if (!(hasRun(run, 'B3b') || (hasRun(run, 'B2') && run.marginCall?.market === market))) return refuse('tree', '증거금을 더 넣을 수 없습니다.');
  const amt = floorS(amount);
  if (!(amt >= 1)) return refuse('min', '넣을 돈이 없습니다.');
  if (amt > run.cash) return refuse('cash', '현금 부족');
  run.cash -= amt;
  p.margin += amt;
  p.margin0 += amt;
  p.marginAdded = (p.marginAdded ?? 0) + amt;
  bump(run, 'marginAdded', amt);
  logEvent(run, 'addMargin', `${marketById[market].name} 증거금 추가`, amt);
  if (run.marginCall?.market === market) run.marginCall = null;
  return { ok: true, amount: amt };
}
/** 마진콜 전화를 끊는다(넣지 않는다). */
export function marginCallDone(g: GameState): Res {
  g.run.marginCall = null;
  return { ok: true };
}

// ── 정리·청산 ───────────────────────────────────────────────────────────
type EndKind = 'liq' | 'sl' | 'tp' | 'close';

function finish(g: GameState, p: Position, price: number, kind: EndKind, opts: { viaFunding?: boolean } = {}): void {
  const run = g.run;
  // 강제 청산이면 돌아오는 돈이 없다. 비상금 주머니(C2)가 켜져 있으면 넣은 증거금의 일부만 돌아온다.
  const refund = kind === 'liq' ? liqRefund(run, p.margin0, p.marginAdded ?? 0) : 0;
  const back = kind === 'liq' ? refund : closeBack(p, price, exitFeeMul(run, kind));
  run.cash += back;
  const pnl = back - p.margin0 - p.feesPaid + (kind === 'liq' ? 0 : 0);
  const loss = Math.max(0, -pnl);
  if (loss > 0) bump(run, 'dayLoss', loss);
  delete run.positions[p.market];
  if (run.marginCall?.market === p.market) run.marginCall = null;
  run.futures.closedTrades += 1;
  bump(run, 'trades', 1);
  bump(run, p.lev === 200 ? 'lev200Trades' : 'nonLev200Trades', 1);
  if (kind === 'liq') {
    bump(run, 'liqStreak', 1);
    bump(run, 'liqCount', 1);
    bump(run, 'liqsThisCycle', 1);
  } else run.stats.liqStreak = 0;
  run.stats.winStreak = pnl > 0 ? (run.stats.winStreak ?? 0) + 1 : 0;
  if (loss > 0) {
    run.stats.liqLossCur = (run.stats.liqLossCur ?? 0) + loss;
    if (loss >= (run.stats.liqLossTop ?? 0)) {
      run.stats.liqLossTop = loss;
      run.stats.liqTipCur = p.tipSource;
    }
    const prevMax = Math.max(run.stats.maxLossRun ?? 0, g.family.stats.maxLoss ?? 0);
    run.stats.lastLoss = loss;
    run.stats.lossRecord = loss > prevMax;
    run.stats.maxLossRun = Math.max(run.stats.maxLossRun ?? 0, loss);
  }
  const tipRec = run.recentTips.find((t) => p.tipSource && tipKey(t.source) === p.tipSource && t.market === p.market && t.dir === p.dir);
  const rec: LastPos = {
    market: p.market, dir: p.dir, lev: p.lev, margin0: p.margin0, marginPct: p.marginPct,
    holdSettles: run.settleNo - p.openSettle, holdTicks: run.tick - p.openTick,
    sl: p.slRoe !== null ? 'set' : 'none', tp: p.tpRoe !== null ? 'set' : 'none', tpRoe: p.tpRoe, adds: p.adds,
    viaJump: kind === 'liq' && inJump(run, p.market), viaFunding: !!opts.viaFunding, fundedBy: p.fundedBy,
    tipSource: p.tipSource, tipWasRight: tipRec?.result === 'hit', tipAgree: p.tipAgree, revenge: p.revenge,
    entryAtHigh: p.entryAtHigh, entryAtLow: p.entryAtLow, fadedWire: p.fadedWire, newsAfterEntry: p.newsAfterEntry,
    maxRoe: p.peakRoe, roeLowMin: Math.floor(p.roeLowSec / 60), fundingPaid: p.fundingPaid, pnl, ended: kind,
    settleNo: run.settleNo, tick: run.tick,
  };
  if (pnl < 0 || !run.lastPos || run.lastPos.pnl >= 0) run.lastPos = rec;
  run.lastClose = { market: p.market, dir: p.dir, settleNo: run.settleNo, tick: run.tick, liq: kind === 'liq' };
  run.tradeLog.push({ n: run.tick, market: p.market, dir: p.dir, lev: p.lev, margin: p.margin, price, kind });
  const name = marketById[p.market].name;
  const side = `${p.dir === 1 ? '롱' : '숏'} ${p.lev}배`;
  if (kind === 'liq') logEvent(run, 'liq', `${name} ${side} 강제 청산`, -p.margin0);
  else if (kind === 'tp') logEvent(run, 'tp', `${name} ${side} 익절`, pnl);
  else if (kind === 'sl') logEvent(run, 'sl', `${name} ${side} 손절`, pnl);
  else logEvent(run, 'close', `${name} ${side} 정리`, pnl);
  if (refund > 0) logEvent(run, 'liq:refund', `증거금 일부가 돌아왔다(비상금 주머니 · 물타기)`, refund);
  if (kind === 'liq') {
    notify(run, `${name} ${side} 강제 청산. 증거금 ${josa(p.margin0.toLocaleString('ko-KR'), '이', '가')} 사라졌습니다.`, 'warn');
    checkLiquidationWipeout(g);
  }
}
export const tipKey = (s: string): string => tipSourceName(s);

export function closePosition(g: GameState, market: string): Res {
  const run = g.run;
  const p = run.positions[market];
  if (!p) return refuse('none', '열린 포지션이 없습니다.');
  if (run.marketStatus === 'delayed') {
    p.closeReserved = true;
    return { ok: true, code: 'reserved' };
  }
  if (run.marketStatus === 'halted') return refuse('status', '시장이 정지되어 있습니다.');
  finish(g, p, run.prices[market], 'close');
  return { ok: true };
}

function touched(p: Position, price: number): 'liq' | 'sl' | 'tp' | null {
  if (p.dir === 1 ? price <= liqPrice(p) : price >= liqPrice(p)) return 'liq';
  if (p.slRoe !== null) {
    const s = stopPrice(p, p.slRoe);
    if (p.dir === 1 ? price <= s : price >= s) return 'sl';
  }
  if (p.tpRoe !== null) {
    const s = stopPrice(p, p.tpRoe);
    if (p.dir === 1 ? price >= s : price <= s) return 'tp';
  }
  return null;
}

/** 한 틱: 시장이 열려 있을 때 포지션마다 청산 > 손절 > 익절 순으로 본다. 정지 중엔 얼린다. */
export function processPrice(g: GameState, market: string, price: number): void {
  const run = g.run;
  const p = run.positions[market];
  if (!p || run.over || run.marketStatus === 'halted') return;
  if (run.marketStatus === 'open') {
    if (p.reservedStops) {
      p.slRoe = p.reservedStops.sl;
      p.tpRoe = p.reservedStops.tp;
      p.reservedStops = null;
    }
    if (p.closeReserved) {
      finish(g, p, price, 'close');
      return;
    }
  }
  const roe = roePct(p, price);
  p.peakRoe = Math.max(p.peakRoe, roe);
  if (roe <= T.marginCallRoe && !p.marginCalled) {
    p.marginCalled = true;
    bump(run, 'marginCalls', 1);
  }
  // 마진콜 전화(B2): 포지션마다 한 번. 받을지 말지는 화면이 묻는다(addMargin · marginCallDone).
  // 전화가 오는 때 = 청산까지 가는 길의 60%를 지났을 때(ROE 기준). 고정 −70% 로는 200배에서 청산(약 −80%)까지 틈이 0.05% 뿐이라 전화보다 청산이 먼저 온다(U-38).
  if (!p.called && hasRun(run, 'B2') && roe <= roePct(p, liqPrice(p)) * 0.6) {
    p.called = true;
    run.marginCall = { market, tick: run.tick };
  }
  if (roe <= -80) p.roeLowSec += 1;
  const hit = touched(p, price);
  if (hit === 'liq') finish(g, p, price, 'liq');
  else if (hit === 'sl') finish(g, p, stopPrice(p, p.slRoe!), 'sl');
  else if (hit === 'tp') finish(g, p, stopPrice(p, p.tpRoe!), 'tp');
}

/** 정산 3단계: 열린 포지션마다 명목의 0.001% 를 증거금에서 뺀다. 뺀 뒤 증거금 + 손익 <= 명목 × 0.1% 이면 청산. */
/** 정산마다의 펀딩비율. 1막 시제품(balance.act1)은 0 — U-46 사용자: "펀딩비까지 하면 어렵고, 대신 거래세를 낮추는 방안"(한쪽만 내는 진짜 펀딩이 아니라 늘 같은 몫을 걷던 것이라 헷갈렸다) */
export const fundingRateNow = (): number => ((balance as { act1?: unknown }).act1 ? 0 : (T.fundingRate as number));
export function applyFundingOne(g: GameState, p: Position): void {
  const run = g.run;
  const rate = fundingRateNow();
  if (!(rate > 0)) return;
  const f = ceilS(p.notional * rate);
  p.margin -= f;
  p.fundingPaid += f;
  bump(run, 'fundingPaid', f);
  const price = run.prices[p.market];
  if (p.margin + pnlOf(p, price) <= p.notional * T.maintenanceRate) finish(g, p, price, 'liq', { viaFunding: true });
}
export function applyFunding(g: GameState): void {
  const run = g.run;
  if (run.marketStatus === 'halted') return;
  for (const p of positionList(run)) {
    if (run.over) return;
    applyFundingOne(g, p);
  }
}

// ── 봉 단위 처리(오프라인) ──────────────────────────────────────────────
/** 한 봉 안에서는 포지션에 불리한 쪽을 먼저(롱: 저가 -> 고가). 순서는 청산 > 손절 > 익절. */
export function processBar(g: GameState, bar: Bar): void {
  const run = g.run;
  const p = run.positions[bar.market];
  if (!p || run.over) return;
  const unfav = p.dir === 1 ? bar.l : bar.h;
  const fav = p.dir === 1 ? bar.h : bar.l;
  const crossed = (price: number, level: number) => (p.dir === 1 ? price <= level : price >= level);
  const crossedFav = (price: number, level: number) => (p.dir === 1 ? price >= level : price <= level);
  if (crossed(unfav, liqPrice(p))) return finish(g, p, liqPrice(p), 'liq');
  if (p.slRoe !== null && crossed(unfav, stopPrice(p, p.slRoe))) return finish(g, p, stopPrice(p, p.slRoe), 'sl');
  if (p.tpRoe !== null && crossedFav(fav, stopPrice(p, p.tpRoe))) return finish(g, p, stopPrice(p, p.tpRoe), 'tp');
  void totalDebt;
}

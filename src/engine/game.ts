import { balance, friendDefs, lenders, T } from './data';
import { createMarkets, stepMarket } from './market';
import { createFriends } from './friends';
import { initialRunStats } from './stats';
import { firePending } from './events';
import { processPrice } from './trading';
import { settle } from './settlement';
import { currentJobId, netWorth, refreshLatches } from './selectors';
import { clock } from './clock';
import type { GameState, LifeStats, RunState, Settings } from './types';

export const SAVE_VERSION = 1;

export function newRun(seed: number): RunState {
  const h = { rng: seed | 0 };
  const run: RunState = {
    seed,
    rng: h.rng,
    tick: 0,
    settleIn: balance.settlement.intervalSec,
    cycles: 0,
    cash: balance.start.cash,
    debts: { ...balance.start.debts },
    streak: { bank: 0, capital: 0, shark1: 0, shark2: 0, upkeep: 0 },
    upkeepArrears: 0,
    friends: createFriends(),
    houseStage: 0,
    jobId: balance.start.jobId,
    markets: {},
    positions: {},
    effects: [],
    pending: [],
    subsidyUsed: false,
    shark2Open: false,
    tapTimes: [],
    recentBorrows: [],
    lastNews: null,
    lastLiq: {},
    stats: initialRunStats(),
    cycleRealized: 0,
    cycleTapCount: 0,
    cycleEntries: 0,
    winStreak: 0,
    postLiq: null,
    creditScore: balance.credit.start,
    peakNetWorth: 0,
    view: { tab: 'village', location: 'work' },
    ticker: null,
    lastSettlement: null,
    tradeFlash: null,
    stampFlash: null,
    offline: false,
    digest: null,
    over: false,
  };
  run.markets = createMarkets(h);
  run.rng = h.rng;
  run.peakNetWorth = netWorth(run);
  void currentJobId;
  return run;
}

export function newLife(): LifeStats {
  return {
    lifeRuns: 1,
    lifeBankruptcies: 0,
    lifeLiqs: 0,
    lifeLaborTaps: 0,
    lifeOdTotal: 0,
    lifeOdShark1: 0,
    lifeOdShark2: 0,
    lifeBorrowShark2: 0,
    lifeFriendsBroken: 0,
    lifeLev200Trades: 0,
    dryStreak: 0,
  };
}

export function defaultSettings(): Settings {
  return { name: balance.protagonist.defaultName, priceColors: balance.ui.priceColors.convention === 'kr' ? 'kr' : 'intl', prologueSeen: false };
}

export function createGame(seed = (clock.now() >>> 0) ^ 0x9e3779b9): GameState {
  return {
    version: SAVE_VERSION,
    savedAt: clock.now(),
    run: newRun(seed),
    life: newLife(),
    encyclopedia: {},
    records: [],
    settings: defaultSettings(),
    pending: null,
  };
}

export const clone = <T>(x: T): T => structuredClone(x);

/** 내부: 제자리에서 1초 진행. */
export function tickMut(g: GameState): void {
  const run = g.run;
  if (run.over) return;
  run.tick += 1;
  const st = run.stats;
  if (run.view.tab === 'trade' && Object.keys(run.positions).length === 0) st.chartWatchSec += 1;
  const ids = Object.keys(run.markets);
  for (const id of ids) stepMarket(run, run.markets[id]);
  firePending(g);
  if (run.over) return;
  for (const id of ids) {
    const m = run.markets[id];
    processPrice(g, id, m.price, m.jumped, m.prev);
    if (run.over) return;
  }
  refreshLatches(run);
  run.settleIn -= 1;
  if (run.settleIn <= 0) {
    run.settleIn = balance.settlement.intervalSec;
    settle(g);
    if (run.over) return;
  }
  const nw = netWorth(run);
  if (nw > run.peakNetWorth) run.peakNetWorth = nw;
}

export function tick(s: GameState): GameState {
  const g = clone(s);
  tickMut(g);
  return g;
}

/** 새 인생: 도감·누적·기록·설정은 유지하고 회차만 초기화. */
export function startNewLife(s: GameState, seed = (clock.now() >>> 0) ^ 0x85ebca6b): GameState {
  const g = clone(s);
  g.run = newRun(seed);
  g.life.lifeRuns += 1;
  g.pending = null;
  g.savedAt = clock.now();
  return g;
}

/** 은퇴: 빚이 0일 때만. 기록을 남기고 새 회차를 시작한다(엔딩 없음). */
export function retire(s: GameState): { s: GameState; ok: boolean; msg?: string } {
  const run = s.run;
  const debt = run.debts.bank + run.debts.capital + run.debts.shark1 + run.debts.shark2 + friendDefs.reduce((a, f) => a + run.friends[f.id].debt, 0);
  if (debt > 0 || run.over) return { s, ok: false, msg: '빚이 남아 있어 은퇴할 수 없습니다' };
  const g = clone(s);
  g.records.push({ peakNetWorth: g.run.peakNetWorth, cycles: g.run.stats.cycles, endedBy: 'retire', at: clock.now() });
  g.records.sort((a, b) => b.peakNetWorth - a.peakNetWorth);
  g.records.length = Math.min(g.records.length, balance.ranking.localTopN);
  const next = startNewLife(g);
  return { s: next, ok: true };
}

void lenders;
void T;

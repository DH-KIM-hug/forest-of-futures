// 게임 생성과 step(state, input) -> state (GDD_v2 5.4). 순수: 시계·네트워크·DOM 을 모른다. 난수는 저장된 시드.
import { balance, COINS, marketDefs, friendDefs } from './data';
import { createFriends } from './friends';
import { initialRunStats } from './stats';
import { settle, forecast } from './settlement';
import { netWorth, walletValue } from './selectors';
import { refreshShark2Open } from './loans';
import { notify } from './util';
import { act, type Action } from './actions';
import type { FamilyState, GameState, RunState, Settings } from './types';
import type { Tick } from './feed/types';

export const SAVE_VERSION = 2;

export type Input = { type: 'tick'; tick: Tick } | { type: 'action'; action: Action };

export function newFamily(): FamilyState {
  return {
    generation: balance.start.generation, han: 0, hanSpent: 0, tree: {},
    pending: { peakNetWorth: 0, minedValue: 0, endingPoints: 0, simpleStreak: 0 },
    ledger: {}, peakNetWorth: 0, barehandPeak: 0, tipBook: {}, heirlooms: {}, traits: [], deepBlood: false,
    lenderRelations: {}, traces: [], lineage: [], stats: {}, retireStreak: 0, chainBroken: false,
  };
}

export function defaultSettings(): Settings {
  return { name: '칩멍크', priceColors: balance.ui.priceColors === 'kr' ? 'kr' : 'intl', prologueSeen: false, guides: {} };
}

export function newRun(seed: number, prices?: Record<string, number>): RunState {
  const ref: Record<string, number> = {};
  for (const m of marketDefs) ref[m.id] = prices?.[m.id] ?? m.startPrice;
  const debts: any = {};
  for (const id of ['bank', 'capital', 'shark1', 'shark2', 'tax'])
    debts[id] = { principal: balance.start.debts[id] ?? 0, inherited: 0, overdue: 0, graceLeft: 0 };
  return {
    seed, rng: seed | 0, startTick: 0, refPrice: ref, prices: { ...ref }, marketStatus: 'open', branch: 'forced',
    tick: 0, settleIn: balance.settlement.intervalSec, settleNo: 0,
    cash: balance.start.cash, cashLocked: 0, wallet: {}, walletTagBy: null, walletPeakValue: 0,
    coinWheels: {}, equipment: [], upgrades: { body: {}, run: {}, coinWheel: {}, tier: {} }, riding: null,
    acornTaps: 0, acornFrac: 0, minedValue: 0,
    futures: { open: false, openedAtSettle: null, levCap: 10, closedTrades: 0, waiver: false },
    debts, taxDueIn: null, upkeepArrears: 0, upkeepOverdue: 0,
    friends: createFriends(), house: balance.start.house, positions: {},
    effects: [], pendingEvents: [], offers: [], offerSeen: {}, shark2Open: false,
    eventLog: [], tradeLog: [], recentTips: [], recentBorrows: [], stats: initialRunStats(),
    peakNetWorth: 0, lastSeenTick: 0, over: false,
    uidSeq: 0, tapsThisTick: 0, garnishAcc: {}, rolloverPending: {}, waivePending: {}, promos: {},
    subsidyUsed: false, surplusAnnounced: false, firstWheelHintShown: false, notices: [], bankruptcy: null, lastSettlement: null,
  };
}

export interface NewGameOpts {
  seed?: number;
  prices?: Record<string, number>;
  deviceId?: string;
}

export function createGame(opts: NewGameOpts = {}): GameState {
  const seed = opts.seed ?? 1;
  const g: GameState = {
    version: SAVE_VERSION, savedAt: 0, deviceId: opts.deviceId ?? 'dev', family: newFamily(),
    run: newRun(seed, opts.prices), settings: defaultSettings(), pendingEnding: null,
  };
  g.run.peakNetWorth = netWorth(g.run);
  void friendDefs;
  return g;
}

export const clone = <T>(x: T): T => structuredClone(x);

/** 틱 하나(1초). 가격 갱신, 정산 카운트다운, 정산. */
function tickMut(g: GameState, t: Tick): void {
  const run = g.run;
  if (run.over) return;
  run.tick += 1;
  run.lastSeenTick = t.n;
  run.tapsThisTick = 0;
  run.marketStatus = t.st;
  for (const [id, cell] of Object.entries(t.p)) run.prices[id] = cell[0];
  const wv = walletValue(run);
  if (wv > run.walletPeakValue) run.walletPeakValue = wv;
  run.settleIn -= 1;
  if (run.settleIn <= 0) {
    run.settleIn = balance.settlement.intervalSec;
    settle(g);
  }
}

/** 흑자 전환(다음 정산 수지가 0 이상이 되는 순간) 속보. 세대당 한 번. */
function checkSurplus(g: GameState): void {
  const run = g.run;
  if (run.surplusAnnounced || run.over) return;
  if (run.equipment.length === 0 && !COINS.some((c) => run.coinWheels[c])) return;
  if (forecast(g).net >= 0) {
    run.surplusAnnounced = true;
    notify(run, '흑자 전환. 다음 정산 수지가 0 이상입니다.', 'wire', 'wire:surplus');
  }
}

/** 제자리 수정 버전(테스트·시뮬레이션·루프용). 행동의 결과를 돌려준다. */
export function stepMut(g: GameState, input: Input) {
  if (input.type === 'tick') {
    tickMut(g, input.tick);
    checkSurplus(g);
    return { ok: true };
  }
  const r = act(g, input.action);
  refreshShark2Open(g);
  checkSurplus(g);
  return r;
}

/** 순수 버전: 새 상태를 돌려준다. 실패한 행동이면 상태가 바뀌지 않았다. */
export function step(s: GameState, input: Input): GameState {
  const g = clone(s);
  stepMut(g, input);
  return g;
}

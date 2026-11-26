import { createGame, stepMut, clone } from '../../src/engine/game';
import type { Action } from '../../src/engine/actions';
import { eventsMeta, lendersMeta, tierById } from '../../src/engine/data';
import type { Tick } from '../../src/engine/feed/types';
import type { CoinId, EquipmentUnit, GameState } from '../../src/engine/types';

// 정확한 숫자를 보는 테스트는 무작위 사건·제안이 끼지 않게 한다(파일마다 모듈이 따로라 다른 파일에는 새지 않는다).
eventsMeta.rollProbPerSettlement = 0;
lendersMeta.offers.rollProbPerSettlement = 0;

export function fresh(seed = 1): GameState {
  return createGame({ seed });
}
/** 기능 시험용 기준판: 시작 상태(현금 0 · 엄마의 쳇바퀴 1대 · 오소리 30만, U-29)에 기대지 않는 시험이 쓴다.
 *  현금 10만, 캐피탈 15만 + 오소리 15만, 쳇바퀴 없음. 시작 상태 자체는 ac_a_start·ac_b_progress 가 본다. */
export function bare(seed = 1): GameState {
  const g = createGame({ seed });
  g.run.cash = 100000;
  g.run.coinWheels = {};
  g.run.wallet = {};
  g.run.riding = null;
  g.run.debts.shark1 = { principal: 150000, inherited: 0, overdue: 0, graceLeft: 0 };
  g.run.debts.capital.principal = 150000;
  g.run.peakNetWorth = -200000;
  return g;
}
export const tickOf = (g: GameState, over: Record<string, number> = {}, st: Tick['st'] = 'open'): Tick => ({
  n: g.run.tick + 1,
  st,
  p: Object.fromEntries(Object.entries({ ...g.run.prices, ...over }).map(([k, v]) => [k, [v, 1, 0.5] as [number, number, number]])),
});
/** 가격을 그대로 두고 n 틱 진행. */
export function tickN(g: GameState, n: number, over: Record<string, number> = {}, st: Tick['st'] = 'open'): void {
  for (let i = 0; i < n; i++) stepMut(g, { type: 'tick', tick: tickOf(g, over, st) });
}
/** 다음 정산이 끝날 때까지(정산 수 +k). */
export function settleOnce(g: GameState, k = 1): void {
  for (let i = 0; i < k; i++) tickN(g, g.run.settleIn);
}
export const A = (g: GameState, a: Action) => stepMut(g, { type: 'action', action: a });
/** 한 틱에 12번까지 인정되므로 12회마다 틱을 넘기며 n 번 누른다. */
export function tapN(g: GameState, n: number): void {
  for (let i = 0; i < n; i++) {
    if (g.run.tapsThisTick >= 12) tickN(g, 1);
    A(g, { type: 'tap' });
  }
}
export function setRatio(g: GameState, coin: string, ratio: number): void {
  g.run.prices[coin] = g.run.refPrice[coin] * ratio;
}
export function giveWheel(g: GameState, coin: CoinId, o: { on?: boolean; autoSell?: boolean } = {}): void {
  g.run.coinWheels[coin] = { on: o.on ?? true, autoSell: o.autoSell ?? false, tagBy: null };
  g.run.wallet[coin] ??= { qty: 0, locked: 0 };
  if (!g.run.riding) g.run.riding = coin;
}
/** 설비 한 대를 쥐여 준다. 알바가 필요한 설비(보조 쳇바퀴, U-30)는 알바가 붙은 채로(staffed=false 로 빈 쳇바퀴). */
export function giveEquip(g: GameState, tier: string, coin: CoinId, cost: number, on = true, staffed = true): EquipmentUnit {
  g.run.uidSeq += 1;
  const u: EquipmentUnit = { uid: `e${g.run.uidSeq}`, tier, coin, on, cost, tagBy: null, boughtWithLoan: false, inheritedSign: false, boughtTick: g.run.tick, ...(tierById[tier]?.wage != null ? { staffed } : {}) };
  g.run.equipment.push(u);
  return u;
}
export function giveCoinValue(g: GameState, coin: CoinId, value: number): void {
  g.run.wallet[coin] ??= { qty: 0, locked: 0 };
  g.run.wallet[coin].qty += value / g.run.prices[coin];
}
export function noDebts(g: GameState): void {
  for (const d of Object.values(g.run.debts)) d.principal = 0;
}
export { clone };

/** 선물 계좌가 열린 상태로 만든다(배율 상한 200). */
export function openFutures(g: GameState, cap = 200): void {
  g.run.futures.open = true;
  g.run.futures.levCap = cap;
  g.run.futures.openedAtSettle = g.run.settleNo;
}
export function pushBar(g: GameState, coin: string, b: Partial<{ o: number; h: number; l: number; c: number; vol: number; buy: number }>) {
  const p = g.run.prices[coin];
  const bar = { n: g.run.tick, o: p, h: p, l: p, c: p, vol: 1, buy: 0.5, jump: false, ...b };
  (g.run.mkt.bars[coin] ??= []).push(bar);
}
/** 떠난 틱 이후 flat 1분 봉(전 종목). 한 봉만 바꾸려면 mod. */
export function flatBars(g: GameState, minutes: number, mod?: (k: number, market: string) => Partial<{ o: number; h: number; l: number; c: number; st: 'open' | 'halted' | 'delayed' }> | undefined) {
  const out: import('../../src/engine/feed/types').Bar[] = [];
  for (let k = 0; k < minutes; k++)
    for (const m of Object.keys(g.run.prices)) {
      const p = g.run.prices[m];
      out.push({ market: m, n0: g.run.lastSeenTick + k * 60, o: p, h: p, l: p, c: p, vol: 60, buy: 0.5, st: 'open', ...(mod?.(k, m) ?? {}) });
    }
  return out;
}

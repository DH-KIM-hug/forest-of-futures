import { createGame, stepMut, clone } from '../../src/engine/game';
import type { Action } from '../../src/engine/actions';
import { eventsMeta, lendersMeta } from '../../src/engine/data';
import type { Tick } from '../../src/engine/feed/types';
import type { CoinId, EquipmentUnit, GameState } from '../../src/engine/types';

// 정확한 숫자를 보는 테스트는 무작위 사건·제안이 끼지 않게 한다(파일마다 모듈이 따로라 다른 파일에는 새지 않는다).
eventsMeta.rollProbPerSettlement = 0;
lendersMeta.offers.rollProbPerSettlement = 0;

export function fresh(seed = 1): GameState {
  return createGame({ seed });
}
export const tickOf = (g: GameState, over: Record<string, number> = {}): Tick => ({
  n: g.run.tick + 1,
  st: 'open',
  p: Object.fromEntries(Object.entries({ ...g.run.prices, ...over }).map(([k, v]) => [k, [v, 1, 0.5] as [number, number, number]])),
});
/** 가격을 그대로 두고 n 틱 진행. */
export function tickN(g: GameState, n: number, over: Record<string, number> = {}): void {
  for (let i = 0; i < n; i++) stepMut(g, { type: 'tick', tick: tickOf(g, over) });
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
export function giveEquip(g: GameState, tier: string, coin: CoinId, cost: number, on = true): EquipmentUnit {
  g.run.uidSeq += 1;
  const u: EquipmentUnit = { uid: `e${g.run.uidSeq}`, tier, coin, on, cost, tagBy: null, boughtWithLoan: false, inheritedSign: false, boughtTick: g.run.tick };
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

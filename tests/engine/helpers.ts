import { createGame } from '../../src/engine/game';
import { clock } from '../../src/engine/clock';
import type { GameState } from '../../src/engine/types';

export const T0 = new Date(2026, 5, 15, 12, 0, 0).getTime(); // 월요일 낮 12시
export function fresh(seed = 12345): GameState {
  clock.now = () => T0;
  return createGame(seed);
}
/** 모든 종목 가격을 고정하고 변동이 없게 만든다(테스트용). */
export function freezeMarkets(g: GameState) {
  for (const m of Object.values(g.run.markets)) {
    m.hist = [m.price];
  }
}
export function setPrice(g: GameState, id: string, price: number) {
  const m = g.run.markets[id];
  m.price = price;
  m.prev = price;
  m.hist = [price];
}

// 집과 이사(GDD_v2 3.8). 생활비는 balance.living.byHouse.
import { balance, houseDefs, housePrice, housingRules } from './data';
import { floorS } from './rng';
import { houseValue, lenderLimit, netWorth } from './selectors';
import { comma, logEvent } from './util';
import { refuse, refreshShark2Open } from './loans';
import type { GameState, Res } from './types';

/** 이사비 = 새 집 가격 − 현재 집 평가액 × 0.9. 음수면 현금을 돌려받는다. */
export function moveCost(g: GameState, to: number): number {
  return housePrice[to] - floorS(houseValue(g.run) * housingRules.sellRate);
}

export function moveBlockReason(g: GameState, to: number): string | null {
  const run = g.run;
  if (to === run.house) return '지금 사는 곳';
  const cost = moveCost(g, to);
  if (cost > run.cash) return '현금 부족';
  // 이사 뒤 조합 원금이 새 한도를 넘으면 막힌다(새 집 한도로 계산)
  const prev = run.house;
  run.house = to;
  const newLimit = lenderLimit(g, 'bank');
  run.house = prev;
  if (run.debts.bank.principal > newLimit) return `조합 원금이 한도(${comma(newLimit)})를 넘음`;
  return null;
}

export function moveTo(g: GameState, to: number): Res {
  const run = g.run;
  if (run.over) return { ok: false };
  if (to < 0 || to >= houseDefs.length) return refuse('range', '없는 집');
  const why = moveBlockReason(g, to);
  if (why) return refuse('blocked', why);
  const cost = moveCost(g, to);
  const dir = to > run.house ? 'up' : 'down';
  run.cash -= cost;
  run.house = to;
  run.upkeepOverdue = 0;
  run.upkeepArrears = 0;
  run.stats.cyclesSinceMove = 0;
  run.stats.netWorthAtMove = netWorth(run);
  run.stats.houseInherited = false;
  logEvent(run, `move_${dir}`, `${houseDefs[to].name}(으)로 이사`, cost);
  refreshShark2Open(g);
  return { ok: true, amount: cost };
}
export { balance };

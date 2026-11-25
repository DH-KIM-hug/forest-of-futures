import { houses, housingRules } from './data';
import { appraisal, appraisalMult, currentJobId, netWorth, refreshLatches } from './selectors';
import { floorS } from './rng';
import { say, comma } from './util';
import type { GameState } from './types';
import type { Res } from './trading';

export function moveCost(g: GameState, to: number): number {
  const run = g.run;
  return houses[to].price - floorS(appraisal(run) * housingRules.sellRate);
}

export function moveBlockReason(g: GameState, to: number): string | null {
  const run = g.run;
  if (to === run.houseStage) return '지금 사는 곳';
  const cost = moveCost(g, to);
  if (cost > run.cash) return '현금 부족';
  const newLimit = floorS(housingRules.ltv * houses[to].collateralValue * appraisalMult(run));
  if (run.debts.bank > newLimit) return `1금융 원금이 한도(${comma(newLimit)})를 넘음`;
  return null;
}

export function moveTo(g: GameState, to: number): Res {
  const run = g.run;
  if (run.over) return { ok: false };
  const why = moveBlockReason(g, to);
  if (why) return { ok: false, code: 'blocked', msg: why };
  const cost = moveCost(g, to);
  const dir = to > run.houseStage ? 'up' : 'down';
  run.cash -= cost;
  run.houseStage = to;
  run.streak.upkeep = 0;
  run.upkeepArrears = 0;
  run.stats.lastMoveDir = dir;
  run.stats.cyclesSinceMove = 0;
  run.stats.netWorthAtMove = netWorth(run);
  const jid = currentJobId(run);
  if (jid !== run.jobId) {
    run.jobId = jid;
    say(run, '새 일자리가 생겼다', 'job');
  }
  refreshLatches(run);
  say(run, `${houses[to].name}(으)로 이사했다`, 'info');
  return { ok: true };
}

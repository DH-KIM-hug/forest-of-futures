// 오프라인 따라잡기 중 경제 부분(GDD_v2 3.13 3번). 포지션·봉 처리는 M2.
import { balance, DEBT_IDS, lenderById } from './data';
import { treeLevel } from './legacy';
import { stage } from './selectors';
import { settle } from './settlement';
import { clone } from './game';
import type { GameState } from './types';

/** 떠난 동안 돌릴 경제 정산 횟수: 0단계는 0, 그 밖은 2 + idle 단계. */
export function offlineSettlementBudget(g: GameState): number {
  if (stage(g.run) === 0) return balance.progression.stage0OfflineSettlements;
  return balance.offline.maxSettlements + treeLevel(g.family, 'idle');
}

/** 어느 곳이든 연체가 (한도 - 1)이 되는 정산이면 true. 그 앞에서 멈춘다. */
function wouldReachGuard(g: GameState): boolean {
  const run = g.run;
  if (DEBT_IDS.some((id) => id !== 'tax' && run.debts[id].overdue >= lenderById[id].maxOverdue - 1)) return true;
  return run.upkeepOverdue >= balance.living.upkeepMaxOverdue - 1 && run.house > 0 && run.upkeepArrears > 0;
}

/** 자리를 비운 동안의 경제 정산을 현재 가격으로 돌린다. 처리한 정산 수를 돌려준다. */
export function economyCatchUp(g: GameState, awaySec: number): number {
  const budget = Math.min(offlineSettlementBudget(g), Math.floor(awaySec / balance.settlement.intervalSec) + (awaySec > balance.offline.replayMaxSec ? 99 : 0));
  let done = 0;
  for (let i = 0; i < budget; i++) {
    if (g.run.over) break;
    if (balance.offline.protectFromOverdueBankruptcy) {
      const probe = clone(g);
      settle(probe);
      if (probe.run.over || wouldReachGuard(probe)) break;
    }
    settle(g);
    done += 1;
  }
  return done;
}

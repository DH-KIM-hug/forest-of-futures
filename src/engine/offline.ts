import { balance } from './data';
import { clone, tickMut } from './game';
import type { Digest, GameState } from './types';

export interface CatchUpResult {
  s: GameState;
  ticks: number;
  digest: Digest | null;
}

const maxTicks = () => balance.offline.maxCycles * balance.settlement.intervalSec;

/**
 * 앱을 떠난 시간만큼 따라잡는다.
 * - 10초 미만이면 아무것도 하지 않는다(그냥 이어서).
 * - 최대 정산 5회분. 연체로는 파산하지 않게, 연체가 한도에 닿을 정산 직전에서 멈춘다.
 * - 청산으로 인한 파산은 일어난다(run.offline = true).
 */
export function catchUp(s: GameState, elapsedSec: number): CatchUpResult {
  if (elapsedSec < 10 || s.run.over) return { s, ticks: 0, digest: null };
  let g = clone(s);
  const run = g.run;
  run.offline = true;
  run.digest = { cycles: 0, wage: 0, interest: 0, notes: [] };
  const limit = Math.min(Math.floor(elapsedSec), maxTicks());
  let ticks = 0;
  const startCycles = run.cycles;
  const protect = balance.offline.protectFromOverdueBankruptcy;
  while (ticks < limit && !run.over && g.run.cycles - startCycles < balance.offline.maxCycles) {
    const willSettle = g.run.settleIn <= 1;
    if (willSettle && protect) {
      const probe = clone(g);
      tickMut(probe);
      if (probe.run.over && probe.run.stats && wouldBeOverdueBankrupt(probe)) {
        break;
      }
      g = probe;
    } else {
      tickMut(g);
    }
    ticks += 1;
  }
  const out = g.run;
  out.offline = false;
  const digest = out.digest;
  out.digest = null;
  if (digest) digest.cycles = out.cycles - startCycles;
  return { s: g, ticks, digest };
}

function wouldBeOverdueBankrupt(g: GameState): boolean {
  const c = g.pending?.snapshot?.cause as string | undefined;
  if (!c) return false;
  if (g.pending?.snapshot?.immediate) return false;
  // 청산 즉시 파산만 허용. 연체·친구·귀속 파산은 막는다.
  return true;
}

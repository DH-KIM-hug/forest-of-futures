import { jobRules } from './data';
import { currentJobId, jobById } from './selectors';
import { say } from './util';
import type { GameState, RunState } from './types';
import type { Res } from './trading';

/** 수입을 현금으로 받되, 오소리 연체 중이면 30%를 차압해 오소리 원금에서 깎는다. */
export function earn(run: RunState, g: GameState | null, amount: number): { cash: number; garnished: number } {
  let garnished = 0;
  if (run.streak.shark1 >= 1 && run.debts.shark1 > 0 && amount > 0) {
    garnished = Math.min(run.debts.shark1, Math.floor(amount * jobRules.garnishRate + 1e-9));
    run.debts.shark1 -= garnished;
    run.stats.garnished += garnished;
  }
  const cash = amount - garnished;
  run.cash += cash;
  void g;
  return { cash, garnished };
}

export const isGarnishing = (run: RunState) => run.streak.shark1 >= 1 && run.debts.shark1 > 0;

export function labor(g: GameState, nowMs: number): Res & { gained?: number } {
  const run = g.run;
  if (run.over) return { ok: false };
  run.tapTimes = run.tapTimes.filter((t) => nowMs - t < 1000);
  if (run.tapTimes.length >= jobRules.maxTapsPerSec) return { ok: false, code: 'rate' };
  run.tapTimes.push(nowMs);
  const job = jobById(run.jobId);
  const r = earn(run, g, job.payPerTap);
  run.stats.laborTaps += 1;
  g.life.lifeLaborTaps += 1;
  run.cycleTapCount += 1;
  if (run.postLiq && run.tick - run.postLiq.tick <= 3) {
    run.postLiq.taps += 1;
    run.stats.lastPostLiqTaps = run.postLiq.taps;
  }
  refreshJob(run);
  return { ok: true, gained: r.cash };
}

export function refreshJob(run: RunState): void {
  const id = currentJobId(run);
  if (id !== run.jobId) {
    run.jobId = id;
    say(run, `일자리가 바뀌었다: ${jobById(id).name}`, 'job');
  }
}

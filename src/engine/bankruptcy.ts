import { balance, endingById } from './data';
import { clock } from './clock';
import { pickEnding } from './endings';
import { buildSnapshot } from './stats';
import { netWorth, positionsEquity, totalDebt } from './selectors';
import type { GameState, PendingEnding } from './types';

const causeOrder: string[] = balance.bankruptcy.causePriority;

export function rankCauses(causes: string[]): string {
  return causes.slice().sort((a, b) => causeOrder.indexOf(a) - causeOrder.indexOf(b))[0];
}

/** 파산 확정: 스냅샷 -> 엔딩 판정 -> 도감/기록/누적 갱신. 이후 run.over = true. */
export function declareBankruptcy(
  g: GameState,
  cause: string,
  opts: { immediate?: boolean; causeLender?: string | null; shortfall?: number } = {},
): void {
  if (g.run.over) return;
  const run = g.run;
  g.life.lifeBankruptcies += 1;
  const snap = buildSnapshot(g, {
    cause,
    immediate: !!opts.immediate,
    causeLender: opts.causeLender ?? null,
    shortfall: opts.shortfall ?? 0,
  });
  const collected = new Set(Object.keys(g.encyclopedia));
  const pick = pickEnding(snap, collected, g.life.dryStreak);
  const now = clock.now();
  const prev = g.encyclopedia[pick.id];
  const nth = (prev?.count ?? 0) + 1;
  const wasNew = !prev;
  g.encyclopedia[pick.id] = prev
    ? { ...prev, count: nth }
    : { firstAt: now, count: 1, snapshot: pickSummary(snap) };
  g.life.dryStreak = wasNew ? 0 : g.life.dryStreak + 1;
  g.records.push({ peakNetWorth: run.peakNetWorth, cycles: run.stats.cycles, endedBy: pick.id, at: now });
  g.records.sort((a, b) => b.peakNetWorth - a.peakNetWorth);
  g.records.length = Math.min(g.records.length, balance.ranking.localTopN);
  const pending: PendingEnding = {
    id: pick.id,
    isNew: wasNew,
    via: pick.via,
    nth,
    snapshot: snap,
    lastLev: snap.lastLev,
    cycles: run.stats.cycles,
    cash: run.cash,
    totalDebt: totalDebt(run),
    collected: Object.keys(g.encyclopedia).length,
  };
  g.pending = pending;
  run.over = true;
  void endingById;
}

/** 도감에 저장하는 "그때의 상태" 요약. */
function pickSummary(snap: Record<string, any>) {
  const keys = ['cause', 'cash', 'totalDebt', 'netWorth', 'cycles', 'lastLev', 'houseStage', 'peakNetWorth'];
  const o: Record<string, any> = {};
  for (const k of keys) o[k] = snap[k] ?? null;
  return o;
}

/** 청산 직후 즉시 파산 검사. 파산이면 true. */
export function checkLiquidationWipeout(g: GameState): boolean {
  const cfg = balance.bankruptcy.liquidationWipeout;
  if (!cfg.enabled) return false;
  const run = g.run;
  const eq = run.cash + positionsEquity(run);
  if (eq < cfg.equityBelow && (!cfg.requiresDebt || totalDebt(run) > 0)) {
    declareBankruptcy(g, 'liquidation', { immediate: true });
    return true;
  }
  return false;
}
void netWorth;

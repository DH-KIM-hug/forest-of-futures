// 오프라인 따라잡기 중 경제 부분(GDD_v2 3.13 3번). 포지션·봉 처리는 M2.
import { balance, DEBT_IDS, lenderById } from './data';
import { treeLevel } from './legacy';
import { stage } from './selectors';
import { settle } from './settlement';
import { clone, stepMut } from './game';
import { closePosition as closeAtMarket } from './futures';
import type { Tick } from './feed/types';
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

// ── 포지션은 전 구간, 경제는 상한까지 (GDD_v2 3.13) ─────────────────────
import { balance as bal } from './data';
import { processBar, applyFundingOne, positionList, liqPrice } from './futures';
import { logEvent, notify } from './util';
import { bump } from './stats';
import type { Bar } from './feed/types';
import type { AwayReport, Res } from './types';

/** 앱이 가려질 때: 열린 포지션이 있으면 사실 한 줄을 속보 띠에. */
export function onBackground(g: GameState): Res {
  const run = g.run;
  const ps = positionList(run);
  logEvent(run, 'away', '자리를 비움');
  if (!ps.length) return { ok: true };
  let near = Infinity;
  for (const p of ps) near = Math.min(near, (Math.abs(run.prices[p.market] - liqPrice(p)) / run.prices[p.market]) * 100);
  notify(run, `열어 둔 포지션 ${ps.length}개 — 자리를 비워도 계속 움직입니다. 가장 가까운 청산가까지 ${near.toFixed(1)}%`, 'wire', `wire:away:${run.tick}`);
  return { ok: true };
}
export function onForeground(g: GameState): Res {
  logEvent(g.run, 'back', '돌아옴');
  return { ok: true };
}
/** 건물 방문 기록(연체 뒤 조합 방문 횟수 같은 통계용). */
export function visit(g: GameState, place: string): Res {
  if (place === 'terms.shark2') bump(g.run, 'termsOpened.shark2', 1);
  const k = `visitsSinceOverdue.${place}`;
  if (g.run.stats[k] !== undefined && g.run.stats[k] !== null) g.run.stats[k] += 1;
  return { ok: true };
}

/**
 * 60초를 넘게 비웠다가 돌아왔을 때. bars = 떠난 틱 이후의 1분 봉(종목마다). 제자리 수정, 시간표를 돌려준다.
 * - 포지션: 봉마다 불리한 쪽 먼저, 청산 > 손절 > 익절. 정지 구간의 봉은 건너뛰고 펀딩비도 붙지 않는다. 펀딩비는 180틱 경계마다.
 * - 경제: `2 + idle` 회분(0단계는 0회)만, 떠난 직후 정산 시각에, 그 시각의 봉 종가로. 연체가 한도-1 이 되는 정산 앞에서 멈춘다.
 * 60초 이하의 끊김은 이 함수가 아니라 1초 틱을 그대로 재생한다(`replayTicks`).
 */
export function catchUp(g: GameState, bars: Bar[], awaySec: number): AwayReport {
  const run = g.run;
  const fromTick = run.tick;
  const leaveN = run.lastSeenTick;
  const sorted = [...bars].sort((a, b) => a.n0 - b.n0);
  const openAtLeave = positionList(run).map((p) => ({ market: p.market, dir: p.dir, lev: p.lev, margin: p.margin }));
  run.report = [];
  run.stats.awayHours = Math.round((awaySec / 3600) * 100) / 100;
  let budget = offlineSettlementBudget(g);
  const sum = { mined: 0, power: 0, interest: 0 };
  let econDone = 0;
  let validTicks = 0;
  let lastN = leaveN;
  const interval = bal.settlement.intervalSec;
  const keep = bal.offline.barSec * 90 * 24 * 60; // 보관 기간 90일(초) — 1분 봉 기준
  void keep;
  const tooLong = awaySec > 90 * 24 * 3600;

  const groups = new Map<number, Bar[]>();
  for (const b of sorted) {
    if (!groups.has(b.n0)) groups.set(b.n0, []);
    groups.get(b.n0)!.push(b);
  }
  for (const n0 of [...groups.keys()].sort((a, b) => a - b)) {
    if (run.over) break;
    const group = groups.get(n0)!;
    run.tick = fromTick + (n0 - leaveN);
    const span = bal.offline.barSec;
    const halted = group.every((b) => b.st === 'halted');
    if (!halted) {
      for (const b of group) {
        if (b.st === 'halted') continue;
        processBar(g, b);
        run.prices[b.market] = b.c;
        if (run.over) break;
      }
      validTicks += span;
      while (validTicks >= interval && !run.over) {
        validTicks -= interval;
        for (const p of positionList(run)) {
          applyFundingOne(g, p);
          if (run.over) break;
        }
      }
    }
    lastN = n0 + span;
    // 경제 정산: 떠난 직후부터, 상한까지
    while (!run.over && econDone < budget && lastN - leaveN >= interval * (econDone + 1)) {
      if (bal.offline.protectFromOverdueBankruptcy) {
        const probe = clone(g);
        probe.run.report = null;
        settle(probe, { skipFunding: true });
        if (probe.run.over || wouldReachGuard(probe)) {
          budget = econDone;
          break;
        }
      }
      settle(g, { skipFunding: true });
      econDone += 1;
      const ls = g.run.lastSettlement;
      if (ls) {
        sum.mined += ls.mined;
        sum.power += ls.power;
        sum.interest += ls.interest;
      }
    }
  }
  if (tooLong && !run.over) {
    for (const p of positionList(run)) {
      const last = [...sorted].reverse().find((b) => b.market === p.market);
      if (last) run.prices[p.market] = last.c;
      run.marketStatus = 'open';
      closeAtMarket(g, p.market);
    }
  }
  run.tick = fromTick + Math.max(0, lastN - leaveN);
  run.lastSeenTick = Math.max(leaveN, lastN);
  if (run.over && run.bankruptcy) {
    run.bankruptcy.offline = true;
    if (g.pendingEnding) {
      g.pendingEnding.offline = true;
      g.pendingEnding.awayHours = run.stats.awayHours;
      g.pendingEnding.snapshot.offline = true;
    }
  }
  const entries = run.report;
  run.report = null;
  logEvent(run, 'back', '돌아옴');
  return {
    awayHours: run.stats.awayHours, awaySec, fromTick, toTick: run.tick, economySettlements: econDone, openAtLeave,
    entries, bankrupt: run.over, settlementSummary: sum,
  };
}

/** 60초 이하 끊김: 받은 1초 틱을 순서대로 그대로 재생한다(경제 포함). */
export function replayTicks(g: GameState, ticks: Tick[]): void {
  for (const t of ticks) stepMut(g, { type: 'tick', tick: t });
}

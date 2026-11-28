// 자리를 비운 사이(GDD_v2 3.13 → U-58). 사용자 결정 U-58: "접속 안 했을 때 걷어가면 안 된다".
//   - 정산 시계는 멈춘다: 이자, 생활비, 일당, 연체, 압류, 펀딩비, 캐는 값, 정산 횟수가 떠난 순간 그대로. 돌아오면 남은 초부터 다시 간다
//   - 열린 포지션은 진짜 시세를 탄다: 떠난 구간의 봉마다 청산, 손절, 익절(시세는 실제 값이라 멈춘 척하지 않는다)
import { stepMut } from './game';
import { closePosition as closeAtMarket } from './futures';
import type { Tick } from './feed/types';
import type { GameState } from './types';

// ── 포지션은 전 구간, 경제는 멈춤 (U-58) ─────────────────────
import { balance as bal } from './data';
import { processBar, positionList, liqPrice } from './futures';
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
  notify(run, `열어 둔 포지션 ${ps.length}개 — 자리를 비워도 계속 움직입니다. 가장 가까운 청산가까지 ${near.toFixed(1)}%. 정산 시계는 멈춥니다`, 'wire', `wire:away:${run.tick}`);
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
 * - 포지션: 봉마다 불리한 쪽 먼저, 청산 > 손절 > 익절. 정지 구간의 봉은 건너뛴다.
 * - 경제(U-58): 돌리지 않는다. 정산 횟수, 남은 초(settleIn), 현금의 이자와 생활비, 빚, 연체가 떠날 때 그대로. 펀딩비도 정산에 붙으므로 붙지 않는다.
 *   걸어 둔 증거금은 포지션 쪽이라 시세대로만 움직이고, 아무도 걷어 가지 않는다.
 * 60초 이하의 끊김은 이 함수가 아니라 1초 틱을 frozen 으로 재생한다(`replayTicks`).
 */
export function catchUp(g: GameState, bars: Bar[], awaySec: number): AwayReport {
  const run = g.run;
  const fromTick = run.tick;
  const leaveN = run.lastSeenTick;
  const sorted = [...bars].sort((a, b) => a.n0 - b.n0);
  const openAtLeave = positionList(run).map((p) => ({ market: p.market, dir: p.dir, lev: p.lev, margin: p.margin }));
  run.report = [];
  run.stats.awayHours = Math.round((awaySec / 3600) * 100) / 100;
  let lastN = leaveN;
  const tooLong = awaySec > 90 * 24 * 3600;
  const span = bal.offline.barSec;

  const groups = new Map<number, Bar[]>();
  for (const b of sorted) {
    if (!groups.has(b.n0)) groups.set(b.n0, []);
    groups.get(b.n0)!.push(b);
  }
  for (const n0 of [...groups.keys()].sort((a, b) => a - b)) {
    if (run.over) break;
    const group = groups.get(n0)!;
    run.tick = fromTick + (n0 - leaveN);
    for (const b of group) {
      if (b.st === 'halted') continue;
      processBar(g, b);
      run.prices[b.market] = b.c;
      if (run.over) break;
    }
    lastN = n0 + span;
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
    awayHours: run.stats.awayHours, awaySec, fromTick, toTick: run.tick, economySettlements: 0, openAtLeave,
    entries, bankrupt: run.over, settlementSummary: { mined: 0, power: 0, interest: 0 },
  };
}

/** 60초 이하 끊김: 받은 1초 틱을 순서대로 재생한다. frozen 이면 정산 시계는 멈춘 채(U-58: 가려진 동안의 틱) */
export function replayTicks(g: GameState, ticks: Tick[], frozen = false): void {
  for (const t of ticks) stepMut(g, { type: 'tick', tick: t, frozen });
}

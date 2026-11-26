// 게임 안 사건(GDD_v2 3.12). 시세를 움직이는 사건은 없다.
import { eventDefs, eventsMeta, eventById } from './data';
import { nextRandom } from './rng';
import { netWorth } from './selectors';
import { notify } from './util';
import type { GameState } from './types';

/** 정산 9단계의 앞부분: 남은 회차 -1, 예고된 사건 시작. */
export function decayEffects(g: GameState): void {
  const run = g.run;
  for (const e of run.effects) e.remaining -= 1;
  run.effects = run.effects.filter((e) => e.remaining > 0);
  for (const p of run.pendingEvents) p.startsIn -= 1;
  const due = run.pendingEvents.filter((p) => p.startsIn <= 0);
  run.pendingEvents = run.pendingEvents.filter((p) => p.startsIn > 0);
  for (const p of due) startEffect(g, p.id);
  const cur = run.effects[run.effects.length - 1];
  run.stats.event = cur ? cur.id : null;
}

function startEffect(g: GameState, id: string): void {
  const def = eventById[id];
  const eff = def.effect;
  if (eff.type === 'cash') return;
  g.run.effects.push({ id, type: eff.type, multiplier: eff.value, remaining: eff.settlements });
  g.run.stats.event = id;
}

/** 새 사건 추첨. 35% 로 하나. */
export function rollEvent(g: GameState): void {
  const run = g.run;
  // 세대의 첫 몇 번 정산은 조용하다(첫 이자·첫 대출의 숫자가 지원금·금리 인상에 흔들리지 않게)
  if (run.settleNo < ((eventsMeta as unknown as { quietSettlements?: number }).quietSettlements ?? 0)) return;
  if (nextRandom(run) >= eventsMeta.rollProbPerSettlement) return;
  const pool = eventDefs.filter((e) => {
    if (e.oncePerRun && run.subsidyUsed) return false;
    if (e.cond && e.cond.stat === 'netWorth' && !(netWorth(run) < e.cond.value)) return false;
    // 같은 종류가 진행 중이거나 예고 중이면 겹치지 않는다
    if (run.effects.some((x) => x.id === e.id) || run.pendingEvents.some((x) => x.id === e.id)) return false;
    return true;
  });
  if (!pool.length) return;
  const total = pool.reduce((a, e) => a + e.weight, 0);
  let r = nextRandom(run) * total;
  let pick = pool[pool.length - 1];
  for (const e of pool) {
    r -= e.weight;
    if (r < 0) {
      pick = e;
      break;
    }
  }
  notify(run, pick.text, 'wire', `event:${pick.id}`);
  if (pick.effect.type === 'cash') {
    run.cash += pick.effect.value;
    run.subsidyUsed = true;
    run.stats.subsidyTaken = true;
    return;
  }
  if (pick.announceBefore) run.pendingEvents.push({ id: pick.id, startsIn: pick.announceBefore });
  else startEffect(g, pick.id);
}

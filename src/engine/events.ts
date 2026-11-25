import { balance, eventDefs, eventRules, marketDefs, marketById } from './data';
import { applyNewsJump } from './market';
import { processPrice } from './trading';
import { netWorth } from './selectors';
import { nextRandom } from './rng';
import { say } from './util';
import type { GameState } from './types';

export function resolveHeadline(text: string, market?: string): string {
  return text.replace('{market}', market ? marketById[market].short : '');
}

/** 정산 6단계 일부: 속보 효과 회차 감소. */
export function decayEffects(g: GameState): void {
  const run = g.run;
  for (const e of run.effects) e.remaining -= 1;
  run.effects = run.effects.filter((e) => e.remaining > 0);
}

/** 정산 6단계 일부: 새 속보 추첨. */
export function rollEvent(g: GameState): void {
  const run = g.run;
  if (nextRandom(run) >= eventRules.rollProbPerSettlement) return;
  const elig = eventDefs.filter((e) => {
    if (e.oncePerRun && run.subsidyUsed) return false;
    if (e.condition && e.condition.stat === 'netWorth' && e.condition.op === '<' && !(netWorth(run) < e.condition.value)) return false;
    return true;
  });
  const total = elig.reduce((a, e) => a + e.weight, 0);
  let r = nextRandom(run) * total;
  let pick = elig[0];
  for (const e of elig) {
    r -= e.weight;
    if (r < 0) {
      pick = e;
      break;
    }
  }
  const at = run.tick + 1 + Math.floor(nextRandom(run) * balance.settlement.intervalSec);
  const market = marketDefs[Math.floor(nextRandom(run) * marketDefs.length)].id;
  run.pending.push({ at, kind: 'event', eventId: pick.id, market });
}

export function firePending(g: GameState): void {
  const run = g.run;
  if (!run.pending.length) return;
  const due = run.pending.filter((p) => p.at <= run.tick);
  if (!due.length) return;
  run.pending = run.pending.filter((p) => p.at > run.tick);
  for (const p of due) {
    if (p.kind === 'event') fireEvent(g, p.eventId!, p.market!);
    else if (p.kind === 'jump') {
      const st = run.markets[p.market!];
      applyNewsJump(st, p.dir!, p.size!);
      processPrice(g, p.market!, st.price, true, st.prev);
    } else if (p.kind === 'followUp') {
      say(run, p.text!, 'news');
    }
  }
}

function fireEvent(g: GameState, id: string, market: string): void {
  const run = g.run;
  const ev = eventDefs.find((e) => e.id === id)!;
  const eff = ev.effect;
  say(run, resolveHeadline(ev.headline, market), 'news');
  switch (eff.type) {
    case 'rateMultiplier':
    case 'appraisalMultiplier':
      run.effects = run.effects.filter((e) => e.type !== eff.type);
      run.effects.push({ id: ev.id, type: eff.type, multiplier: eff.multiplier, remaining: eff.durationSettlements });
      break;
    case 'marketJump': {
      const delay = eff.delaySecMin + Math.floor(nextRandom(run) * (eff.delaySecMax - eff.delaySecMin + 1));
      const size = eff.sizeMin + nextRandom(run) * (eff.sizeMax - eff.sizeMin);
      const headlineDir = ev.fake ? -eff.direction : eff.direction;
      run.lastNews = { market, headlineDir, fake: !!ev.fake, tick: run.tick };
      run.pending.push({ at: run.tick + delay, kind: 'jump', market, dir: eff.direction, size });
      if (ev.fake && ev.followUpHeadline)
        run.pending.push({ at: run.tick + delay, kind: 'followUp', text: resolveHeadline(ev.followUpHeadline, market) });
      break;
    }
    case 'volMultiplier': {
      const st = run.markets[market];
      st.volMult = eff.multiplier;
      st.volUntil = run.tick + eff.durationSec;
      break;
    }
    case 'cash':
      run.cash += eff.amount;
      run.subsidyUsed = true;
      run.stats.subsidyCount += 1;
      break;
  }
}

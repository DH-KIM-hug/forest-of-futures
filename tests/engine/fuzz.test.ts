import { describe, it, expect } from 'vitest';
import { fresh } from './helpers';
import { tickMut, clone, startNewLife } from '../../src/engine/game';
import * as A from '../../src/engine/actions';
import { nextRandom } from '../../src/engine/rng';
import { netWorth } from '../../src/engine/selectors';
import { houses, friendDefs } from '../../src/engine/data';

/** 무작위 행동을 섞어 오래 돌려도 숫자가 깨지지 않는지(NaN, 음수 현금) 본다. */
describe('엔진 퍼즈', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`시드 ${seed}: 무작위 행동 3시간 분량`, () => {
      let g = fresh(seed);
      const r = { rng: seed * 7919 };
      let now = 1_000_000;
      let lives = 0;
      for (let t = 0; t < 10800; t++) {
        now += 1000;
        const x = nextRandom(r);
        if (g.run.over) {
          g = startNewLife(g, seed + ++lives);
          continue;
        }
        if (x < 0.25) g = A.doLabor(g, now).s;
        else if (x < 0.3) g = A.doBorrow(g, (['bank', 'capital', 'shark1', 'shark2'] as const)[Math.floor(nextRandom(r) * 4)], true).s;
        else if (x < 0.36) g = A.doStamp(g, (['bank', 'capital', 'shark1', 'shark2'] as const)[Math.floor(nextRandom(r) * 4)], (['all', 1, 10] as const)[Math.floor(nextRandom(r) * 3)]).s;
        else if (x < 0.38) g = A.doBorrowFriend(g, friendDefs[Math.floor(nextRandom(r) * 5)].id).s;
        else if (x < 0.4) g = A.doStampFriend(g, friendDefs[Math.floor(nextRandom(r) * 5)].id, 10).s;
        else if (x < 0.41) g = A.doMove(g, Math.floor(nextRandom(r) * houses.length)).s;
        else if (x < 0.46) {
          const m = ['DTC', 'BTH', 'JQQ', 'SMS', 'SQH'][Math.floor(nextRandom(r) * 5)];
          const lev = [1, 2, 5, 10, 25, 50, 100, 200][Math.floor(nextRandom(r) * 8)];
          g = A.doOpen(g, { market: m, dir: nextRandom(r) < 0.5 ? 1 : -1, lev, marginPct: [10, 25, 50, 100][Math.floor(nextRandom(r) * 4)], sl: [null, -25, -50][Math.floor(nextRandom(r) * 3)], tp: [null, 50, 100][Math.floor(nextRandom(r) * 3)] }).s;
        } else if (x < 0.48) {
          const keys = Object.keys(g.run.positions);
          if (keys.length) g = A.doClose(g, keys[0]).s;
        }
        const c = clone(g);
        tickMut(c);
        g = c;
        const run = g.run;
        expect(Number.isFinite(run.cash)).toBe(true);
        expect(run.cash).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(netWorth(run))).toBe(true);
        for (const d of Object.values(run.debts)) expect(d).toBeGreaterThanOrEqual(0);
        for (const m of Object.values(run.markets)) expect(m.price).toBeGreaterThan(0);
      }
    });
  }
});

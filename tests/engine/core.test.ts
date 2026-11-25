import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGame, step, stepMut, clone } from '../../src/engine/game';
import type { Action } from '../../src/engine/actions';
import { SimFeed } from '../../src/engine/feed/simFeed';
import { ReplayFeed, type Recording } from '../../src/engine/feed/replayFeed';
import type { Feed, Tick } from '../../src/engine/feed/types';
import { nextRandom } from '../../src/engine/rng';
import { COINS, friendDefs, tierDefs } from '../../src/engine/data';
import { netWorth } from '../../src/engine/selectors';
import { eventsMeta, lendersMeta } from '../../src/engine/data';
import type { GameState } from '../../src/engine/types';

const rec: Recording = JSON.parse(readFileSync(join(__dirname, '../../docs/gdd/v2/sim/data/hl_3m.json'), 'utf8'));

function randomAction(g: GameState, r: { rng: number }): Action | null {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(nextRandom(r) * a.length)];
  const coin = pick(COINS);
  const x = nextRandom(r);
  if (x < 0.4) return { type: 'tap' };
  if (x < 0.46) return { type: 'buyWheel', coin };
  if (x < 0.5) return { type: 'buyEquip', tier: pick(tierDefs).id, coin };
  if (x < 0.53) return { type: 'sell', coin, part: pick(['all', 'half'] as const) };
  if (x < 0.58) return { type: 'upgrade', track: pick(['glove', 'shoes', 'oil', 'spokes', 'power', 'tier', 'fee']), target: pick([coin, 'helper', 'row']) };
  if (x < 0.64) return { type: 'borrow', lender: pick(['bank', 'capital', 'shark1', 'shark2'] as const), consent: true };
  if (x < 0.72) return { type: 'stamp', lender: pick(['bank', 'capital', 'shark1', 'shark2', 'tax'] as const), mult: pick([1, 10, 'all'] as const) };
  if (x < 0.75) return { type: 'borrowFriend', friend: pick(friendDefs).id };
  if (x < 0.77) return { type: 'stampFriend', friend: pick(friendDefs).id, mult: 10 };
  if (x < 0.79) return { type: 'move', to: Math.floor(nextRandom(r) * 5) };
  if (x < 0.82) return { type: 'rollover', lender: pick(['shark1', 'shark2'] as const) };
  if (x < 0.84 && g.run.equipment.length) return { type: 'toggleEquip', uid: pick(g.run.equipment).uid };
  if (x < 0.86) return { type: 'autoSell', coin, on: nextRandom(r) < 0.5 };
  if (x < 0.88 && g.run.equipment.length) return { type: 'moveEquip', uid: pick(g.run.equipment).uid, coin };
  if (x < 0.9 && g.run.equipment.length) return { type: 'sellEquip', uid: pick(g.run.equipment).uid };
  if (x < 0.92) return { type: 'ride', coin };
  if (x < 0.94 && g.run.offers.length) return { type: 'acceptOffer', id: g.run.offers[0].id };
  if (x < 0.95) return { type: pick(['eduPage', 'mockTrade', 'openAccount', 'signWaiver'] as const) };
  if (x < 0.965) return { type: 'open', market: pick(['DTC', 'BTH', 'SMS', 'MDT', 'JQQ']), dir: pick([1, -1] as const), lev: pick([1, 5, 10, 50, 200]), marginPct: pick([10, 50, 100]), sl: pick([null, -25]), tp: pick([null, 50]) };
  if (x < 0.975) return { type: 'close', market: pick(['DTC', 'BTH', 'SMS', 'MDT', 'JQQ']) };
  if (x < 0.985) return { type: 'add', market: pick(['DTC', 'BTH', 'SMS', 'MDT', 'JQQ']), marginPct: 25 };
  return null;
}

function drive(feed: Feed & { next(): Tick; snapshot(): Tick }, seed: number, seconds: number): GameState {
  const g = createGame({ seed, prices: Object.fromEntries(Object.entries(feed.snapshot().p).map(([k, v]) => [k, v[0]])) });
  const r = { rng: seed * 7919 };
  for (let t = 0; t < seconds; t++) {
    if (g.run.over) break;
    const n = Math.floor(nextRandom(r) * 3);
    for (let i = 0; i < n; i++) {
      const a = randomAction(g, r);
      if (a) stepMut(g, { type: 'action', action: a });
    }
    stepMut(g, { type: 'tick', tick: feed.next() });
    check(g);
  }
  return g;
}

function check(g: GameState) {
  const run = g.run;
  expect(Number.isFinite(run.cash)).toBe(true);
  expect(run.cash).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(netWorth(run))).toBe(true);
  for (const [id, d] of Object.entries(run.debts)) {
    expect(d.principal, id).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(d.principal), id).toBe(true);
  }
  for (const [c, w] of Object.entries(run.wallet)) {
    expect(Number.isFinite(w.qty), c).toBe(true);
    expect(w.qty, c).toBeGreaterThanOrEqual(0);
  }
  expect(run.equipment.length).toBeLessThanOrEqual(tierDefs.length * 3);
  expect(Object.keys(run.positions).length).toBeLessThanOrEqual(5);
  for (const p of Object.values(run.positions)) expect(Number.isFinite(p.margin) && p.notional <= 200000000).toBe(true);
}

describe('엔진 코어', () => {
  it('step 은 순수하다: 넣은 상태를 바꾸지 않는다', () => {
    const s = createGame({ seed: 5 });
    const before = JSON.stringify(s);
    const s2 = step(s, { type: 'action', action: { type: 'tap' } });
    expect(JSON.stringify(s)).toBe(before);
    expect(s2.run.cash).toBe(100027);
    const feed = new SimFeed(1);
    const s3 = step(s2, { type: 'tick', tick: feed.next() });
    expect(s3.run.tick).toBe(1);
    expect(s2.run.tick).toBe(0);
  });

  it('결정적이다: 같은 시드·같은 입력이면 같은 결과(사건·제안 추첨 포함)', () => {
    const save = [eventsMeta.rollProbPerSettlement, lendersMeta.offers.rollProbPerSettlement];
    eventsMeta.rollProbPerSettlement = 0.35;
    lendersMeta.offers.rollProbPerSettlement = 0.2;
    try {
      const a = drive(new SimFeed(11), 3, 4000);
      const b = drive(new SimFeed(11), 3, 4000);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      const c = drive(new SimFeed(12), 3, 4000);
      expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    } finally {
      [eventsMeta.rollProbPerSettlement, lendersMeta.offers.rollProbPerSettlement] = save;
    }
  });

  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`퍼즈 시드 ${seed}: 무작위 행동 3시간 분량에도 숫자가 깨지지 않는다(가짜 시세)`, () => {
      eventsMeta.rollProbPerSettlement = 0.35;
      lendersMeta.offers.rollProbPerSettlement = 0.2;
      const g = drive(new SimFeed(seed), seed, 10800);
      expect(g.run.tick).toBeGreaterThan(0);
    });
  }

  it('AC-v2-142 같은 엔진 코드가 SimFeed 와 ReplayFeed 의 같은 Tick 형식으로 돈다', () => {
    for (const feed of [new SimFeed(2), new ReplayFeed(rec)]) {
      const g = drive(feed, 9, 1800);
      expect(g.run.tick).toBeGreaterThan(100);
      expect(g.run.settleNo).toBeGreaterThanOrEqual(1);
      for (const c of COINS) expect(g.run.prices[c]).toBeGreaterThan(0);
    }
  });

  it('AC-v2-142 틱 입력은 JSON 으로 오가도 같다(서버 피드와 같은 모양)', () => {
    const t = new ReplayFeed(rec).next();
    const a = createGame({ seed: 1 });
    const b = clone(a);
    stepMut(a, { type: 'tick', tick: t });
    stepMut(b, { type: 'tick', tick: JSON.parse(JSON.stringify(t)) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

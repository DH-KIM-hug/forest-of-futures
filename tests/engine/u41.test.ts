// U-41(회차 4) → U-42(회차 5)에서 쉬는 기간을 20번으로 늘렸다: 금리 인상의 쉬는 기간 — 지난번 뒤 정산 20번 안에는 다시 뽑히지 않고, 앞의 인상이 살아 있는 동안에도 뽑히지 않는다. 숫자(두 배 · 두 번)는 그대로.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bare } from './helpers';
import { eventById, eventsMeta } from '../../src/engine/data';
import { decayEffects, rollEvent } from '../../src/engine/events';

describe('금리 인상의 쉬는 기간 (U-41)', () => {
  beforeEach(() => { eventsMeta.rollProbPerSettlement = 0.35; });
  afterEach(() => { eventsMeta.rollProbPerSettlement = 0; });
  it('숫자는 그대로(두 배 · 정산 두 번 · 예고 한 번), 쉬는 기간은 정산 20번(U-42)', () => {
    const e = eventById.rate_hike as unknown as { effect: { value: number; settlements: number }; announceBefore: number; cooldownSettlements: number };
    expect(e.effect).toMatchObject({ type: 'rateMultiplier', value: 2, settlements: 2 });
    expect(e.announceBefore).toBe(1);
    expect(e.cooldownSettlements).toBe(20);
  });
  it('정산 600번을 돌려도 두 인상 사이는 늘 20번 이상이고, 살아 있는 동안에는 겹치지 않는다', () => {
    for (const seed of [1, 7, 42, 99]) {
      const g = bare();
      g.run.rng = seed * 7919;
      const at: number[] = [];
      for (let k = 0; k < 600; k++) {
        g.run.settleNo = k + 5;
        decayEffects(g);
        const active = g.run.effects.some((x) => x.id === 'rate_hike') || g.run.pendingEvents.some((x) => x.id === 'rate_hike');
        const before = g.run.notices.filter((n) => n.id === 'event:rate_hike').length;
        rollEvent(g);
        const fired = g.run.notices.filter((n) => n.id === 'event:rate_hike').length > before;
        if (fired) { expect(active).toBe(false); at.push(g.run.settleNo); }
        g.run.notices = g.run.notices.slice(-3);
      }
      expect(at.length).toBeGreaterThan(3); // 없어진 것이 아니다
      for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(20);
    }
  });
  it('쉬는 기간이 끝나면 다시 뽑힐 수 있다(기록은 뽑힌 정산 번호)', () => {
    const g = bare();
    g.run.settleNo = 40;
    g.run.stats['eventAt.rate_hike'] = 21;
    let fired = false;
    for (let k = 0; k < 400 && !fired; k++) { g.run.rng = k * 31 + 5; g.run.notices = []; rollEvent(g); fired = g.run.notices.some((n) => n.id === 'event:rate_hike'); }
    expect(fired).toBe(false); // 19번 지남: 아직
    g.run.settleNo = 41;
    for (let k = 0; k < 400 && !fired; k++) { g.run.rng = k * 31 + 5; g.run.notices = []; g.run.pendingEvents = []; rollEvent(g); fired = g.run.notices.some((n) => n.id === 'event:rate_hike'); }
    expect(fired).toBe(true);
  });
});

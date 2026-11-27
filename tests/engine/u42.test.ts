// U-42(회차 5) 엔진 쪽: 금리 인상은 쉬는 기간 60번(U-47, 옛 20번) · 오픈 기념 수수료 무료가 남아 있는 동안에는 오지 않는다. 수수료율을 노드 레벨만으로 셈하는 순수 함수가 엔진의 셈과 같다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bare } from './helpers';
import { balance, eventById, eventsMeta } from '../../src/engine/data';
import { decayEffects, rollEvent } from '../../src/engine/events';
import { exitFeeMul, exitFeeMulLevels, feeEventLeft, feeRateLevels, feeRateRun, baseFeeRate } from '../../src/engine/skilltree';

const act1 = (on: boolean) => { if (on) (balance as { act1?: unknown }).act1 = { friends: false }; else delete (balance as { act1?: unknown }).act1; };
afterEach(() => { act1(false); eventsMeta.rollProbPerSettlement = 0; });

describe('금리 인상: 쉬는 기간 60번(U-47) · 오픈 기념 중에는 없다 (U-42 ⑥)', () => {
  beforeEach(() => { eventsMeta.rollProbPerSettlement = 1; });
  it('데이터: 쉬는 기간 60번, 오픈 기념 중에는 뽑지 않는다는 표시. 두 배 · 예고 한 번은 그대로, 효과는 정산 6번(U-47)', () => {
    const e = eventById.rate_hike as unknown as { effect: { value: number; settlements: number }; announceBefore: number; cooldownSettlements: number; notDuringFeeEvent: boolean };
    expect(e.cooldownSettlements).toBe(60);
    expect(e.notDuringFeeEvent).toBe(true);
    expect(e.effect).toMatchObject({ value: 2, settlements: 6 });
    expect(e.announceBefore).toBe(1);
  });
  it('오픈 기념이 남아 있는 정산(0~59번째)에는 씨앗 400개를 돌려도 한 번도 안 뽑힌다. 끝난 정산(60번째)부터는 뽑힌다', () => {
    act1(true);
    const fires = (settleNo: number): number => {
      let k = 0;
      for (let seed = 0; seed < 400; seed++) {
        const g = bare(); g.run.settleNo = settleNo; g.run.rng = seed * 131 + 7; g.run.notices = [];
        rollEvent(g);
        if (g.run.notices.some((n) => n.id === 'event:rate_hike')) k++;
      }
      return k;
    };
    for (const no of [3, 30, 59]) { const g = bare(); g.run.settleNo = no; expect(feeEventLeft(g.run)).toBeGreaterThan(0); expect(fires(no)).toBe(0); }
    const g = bare(); g.run.settleNo = 60; expect(feeEventLeft(g.run)).toBe(0);
    expect(fires(60)).toBeGreaterThan(20);
  });
  it('오픈 기념이 없는 판(1막이 아닌 판)에서는 예전처럼 뽑힌다 — 쉬는 기간만 60번', () => {
    eventsMeta.rollProbPerSettlement = 0.35;
    const g = bare(); g.run.rng = 4242;
    const at: number[] = [];
    for (let k = 0; k < 800; k++) {
      g.run.settleNo = k + 5; decayEffects(g);
      const before = g.run.notices.filter((n) => n.id === 'event:rate_hike').length;
      rollEvent(g);
      if (g.run.notices.filter((n) => n.id === 'event:rate_hike').length > before) at.push(g.run.settleNo);
      g.run.notices = g.run.notices.slice(-3);
    }
    expect(at.length).toBeGreaterThan(3);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(60);
  });
});

describe('수수료율을 노드 레벨만으로 (U-42 ④)', () => {
  it('엔진이 생에서 읽는 수수료율과 같다(레벨 조합 · 배율 · 전부 걸기 · 뒤집기 · 하루 한도)', () => {
    const g = bare();
    for (const skill of [{}, { R: 2 }, { R: 1, A1: 3, B1: 2 }, { R: 1, A1: 1, A2: 2, A3b: 1, A4: 2, B1: 4, B2: 1, B3a: 3, B4: 1, C1: 2, C2: 2, C3b: 2 }] as Record<string, number>[]) {
      g.run.skill = skill;
      for (const lev of [10, 25, 50, 200]) for (const ctx of [{}, { allIn: true }, { flip: true }]) for (const day of [null, 30000]) {
        g.run.dayLossLimit = day;
        expect(feeRateLevels(skill, baseFeeRate(g.run), lev, { ...ctx, dayLimit: day !== null })).toBeCloseTo(feeRateRun(g.run, lev, ctx), 12);
      }
      expect(exitFeeMulLevels(skill)).toBeCloseTo(exitFeeMul(g.run), 12);
      expect(exitFeeMulLevels(skill, 'sl')).toBeCloseTo(exitFeeMul(g.run, 'sl'), 12);
    }
  });
});

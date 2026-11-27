// U-50(회차 9): 나무가 판의 손맛을 바꾼다 — R 고비 보상, C1 따라가는 손절. 시세 · 청산가는 그대로다.
import { describe, expect, it } from 'vitest';
import { A, bare, openFutures, tickN } from './helpers';
import { liqPrice } from '../../src/engine/futures';
import { popBonusAmt, popBonusRate, trailStop } from '../../src/engine/skilltree';
import type { GameState } from '../../src/engine/types';

function trader(skill: Record<string, number> = {}): GameState {
  const g = bare();
  g.run.cash = 1_000_000;
  openFutures(g, 50);
  g.run.skill = { ...skill };
  return g;
}
/** 롱 50배 증거금 10,000 을 열고, ROE(%)가 되는 값을 돌려주는 함수와 같이 */
function long50(g: GameState) {
  expect(A(g, { type: 'open', market: 'BTH', dir: 1, lev: 50, margin: 10000 }).ok).toBe(true);
  const e = g.run.positions.BTH.entry;
  return (roe: number) => e * (1 + roe / 100 / 50);
}

describe('R 고비 보상 (U-50)', () => {
  it('몫: 나무가 없으면 0, Lv1 1%, 레벨이 오를수록 3%에 다가갈 뿐 닿지 않는다', () => {
    expect(popBonusRate(trader().run)).toBe(0);
    expect(popBonusRate(trader({ R: 1 }).run)).toBeCloseTo(0.01, 12);
    expect(popBonusRate(trader({ R: 2 }).run)).toBeCloseTo(0.01 + 0.02 * 0.15, 12);
    const r60 = popBonusRate(trader({ R: 60 }).run);
    expect(r60).toBeLessThan(0.03);
    expect(r60).toBeGreaterThan(0.0299);
    expect(popBonusAmt(trader({ R: 1 }).run, 10000)).toBe(100);
  });

  it('고비를 처음 넘을 때 한 번씩 현금에 얹는다(같은 고비는 두 번 안 준다). 여럿을 한 번에 넘으면 가장 높은 것 하나', () => {
    const g = trader({ R: 1 });
    const at = long50(g);
    const c0 = g.run.cash;
    tickN(g, 1, { BTH: at(55) });
    expect(g.run.cash - c0).toBe(100);
    expect(g.run.stats.lastPop).toMatchObject({ market: 'BTH', at: 50, amount: 100 });
    tickN(g, 1, { BTH: at(20) });
    tickN(g, 1, { BTH: at(56) }); // 다시 +50% 위: 이미 받았다
    expect(g.run.cash - c0).toBe(100);
    tickN(g, 1, { BTH: at(230) }); // 두 배 · 세 배를 한 번에: 세 배 하나
    expect(g.run.cash - c0).toBe(200);
    expect(g.run.positions.BTH.popBest).toBe(200);
    expect(g.run.stats.popBonus).toBe(200);
  });

  it('나무가 없으면 아무것도 얹지 않는다. 청산가 · 손익은 같은 값이다', () => {
    const g = trader(), h = trader({ R: 3 });
    const ag = long50(g), ah = long50(h);
    expect(liqPrice(g.run.positions.BTH)).toBeCloseTo(liqPrice(h.run.positions.BTH), 9);
    const cg = g.run.cash, ch = h.run.cash;
    tickN(g, 1, { BTH: ag(120) }); tickN(h, 1, { BTH: ah(120) });
    expect(g.run.cash).toBe(cg);
    expect(h.run.cash - ch).toBe(popBonusAmt(h.run, 10000));
    A(g, { type: 'close', market: 'BTH' }); A(h, { type: 'close', market: 'BTH' });
    expect(h.run.cash - ch - (g.run.cash - cg)).toBe(popBonusAmt(h.run, 10000)); // 받는 돈의 차이는 보상뿐
  });
});

describe('C1 따라가는 손절 (U-50)', () => {
  it('셈: +30% 아래면 그대로, 넘으면 max(+5, 최고 − 30), 지금 ROE 보다 1%p 위로는 안 올린다, 내리지 않는다', () => {
    const run = trader({ R: 1, C1: 1 }).run;
    expect(trailStop(run, -50, 29, 29)).toBeNull();
    expect(trailStop(run, -50, 31, 31)).toBe(5);
    expect(trailStop(run, 5, 80, 80)).toBe(50);
    expect(trailStop(run, 50, 70, 60)).toBeNull(); // 최고 − 30 = 40 < 50: 내리지 않는다
    expect(trailStop(run, -50, 80, 20)).toBe(19); // 최고는 80 이었지만 지금 20: 19 까지만
    expect(trailStop(run, null, 80, 80)).toBeNull(); // 손절을 끈 판은 따라가지 않는다
    expect(trailStop(trader({ R: 1 }).run, -50, 80, 80)).toBeNull(); // C1 이 없으면
  });

  it('틱마다 손절이 따라 올라오고, 되돌아오면 그 손절에서 닫힌다(본전 위)', () => {
    const g = trader({ R: 1, C1: 1 });
    const at = long50(g);
    A(g, { type: 'stops', market: 'BTH', sl: -50, tp: null });
    tickN(g, 1, { BTH: at(40) });
    expect(g.run.positions.BTH.slRoe).toBe(10);
    expect(g.run.stats.lastTrail).toMatchObject({ market: 'BTH', sl: 10, first: true });
    tickN(g, 1, { BTH: at(90) });
    expect(g.run.positions.BTH.slRoe).toBe(60);
    expect(g.run.stats.lastTrail.first).toBe(false);
    const c0 = g.run.cash;
    tickN(g, 1, { BTH: at(55) }); // 60 아래로: 손절
    expect(g.run.positions.BTH).toBeUndefined();
    expect(g.run.cash - c0).toBeGreaterThan(10000 * 1.55); // 넣은 돈 + 60% 근처(수수료를 빼도 +55% 위)
  });
});

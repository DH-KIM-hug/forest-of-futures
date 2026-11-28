// U-51(회차 10): 단타꾼 길 A1 의 도구 = 반 익절. 이익 중인 포지션의 절반을 그 자리에서 닫는다. 시세 · 청산가는 그대로다.
import { describe, expect, it } from 'vitest';
import { A, bare, openFutures, tickN } from './helpers';
import { liqPrice } from '../../src/engine/futures';
import type { GameState } from '../../src/engine/types';

function trader(skill: Record<string, number> = {}): GameState {
  const g = bare();
  g.run.cash = 1_000_000;
  openFutures(g, 50);
  g.run.skill = { ...skill };
  return g;
}
function long50(g: GameState, margin = 10000) {
  expect(A(g, { type: 'open', market: 'BTH', dir: 1, lev: 50, margin }).ok).toBe(true);
  const e = g.run.positions.BTH.entry;
  return (roe: number) => e * (1 + roe / 100 / 50);
}

describe('A1 반 익절 (U-51)', () => {
  it('나무(A1)가 없으면 안 된다. 손실 중이면 안 된다', () => {
    const g = trader();
    const at = long50(g);
    tickN(g, 1, { BTH: at(40) });
    expect(A(g, { type: 'half', market: 'BTH' }).ok).toBe(false);
    const h = trader({ R: 1, A1: 1 });
    const ah = long50(h);
    tickN(h, 1, { BTH: ah(-20) });
    expect(A(h, { type: 'half', market: 'BTH' }).ok).toBe(false);
    expect(h.run.positions.BTH.margin0).toBe(10000);
  });

  it('절반을 닫는다: 손에 들어온 돈 = 반쪽 증거금 + 반쪽 손익(수수료 뺌), 나머지는 같은 진입가 · 같은 청산가', () => {
    const g = trader({ R: 1, A1: 1 });
    const at = long50(g);
    tickN(g, 1, { BTH: at(60) });
    const p0 = { ...g.run.positions.BTH };
    const liq0 = liqPrice(g.run.positions.BTH);
    const c0 = g.run.cash;
    const r = A(g, { type: 'half', market: 'BTH' });
    expect(r.ok).toBe(true);
    const p = g.run.positions.BTH;
    expect(p.margin0).toBeCloseTo(p0.margin0 / 2, 9);
    expect(p.notional).toBeCloseTo(p0.notional / 2, 9);
    expect(p.entry).toBe(p0.entry);
    expect(liqPrice(p)).toBeCloseTo(liq0, 9);
    const got = g.run.cash - c0;
    expect(got).toBeGreaterThan(5000 * 1.55); // 반쪽 5,000 + 그 60% 근처(수수료가 있어도 +55% 위)
    expect(got).toBeLessThanOrEqual(5000 * 1.6 + 1);
    expect(p.halfs).toHaveLength(1);
    expect(p.halfs![0].margin).toBeCloseTo(5000, 9);
    expect(p.halfs![0].pnl).toBeCloseTo(got - 5000 - p0.feesPaid / 2, 6);
    expect(r.amount).toBeCloseTo(p.halfs![0].pnl, 6);
    expect(g.run.stats.lastHalf).toMatchObject({ market: 'BTH', n: 1 });
  });

  it('반 익절 뒤 나머지를 닫으면, 한 번에 닫은 판과 받는 돈이 같다(수수료 할인 없이 나눴을 뿐)', () => {
    const g = trader({ A1: 1 }), h = trader({ A1: 1 });
    const ag = long50(g), ah = long50(h);
    tickN(g, 1, { BTH: ag(80) }); tickN(h, 1, { BTH: ah(80) });
    const cg = g.run.cash, ch = h.run.cash;
    A(g, { type: 'half', market: 'BTH' });
    A(g, { type: 'close', market: 'BTH' });
    A(h, { type: 'close', market: 'BTH' });
    expect(Math.abs(g.run.cash - cg - (h.run.cash - ch))).toBeLessThanOrEqual(2); // 내림 두 번
  });

  it('두 번까지 나눌 수 있지만, 절반이 최소 증거금보다 작으면 안 된다', () => {
    const g = trader({ A1: 1 });
    const at = long50(g, 4000);
    tickN(g, 1, { BTH: at(50) });
    expect(A(g, { type: 'half', market: 'BTH' }).ok).toBe(true);
    expect(A(g, { type: 'half', market: 'BTH' }).ok).toBe(true);
    // 1,000 → 500: 최소 증거금(1,000)보다 작다
    expect(A(g, { type: 'half', market: 'BTH' }).ok).toBe(false);
    expect(g.run.positions.BTH.halfs).toHaveLength(2);
  });
});

import { slowHint, waitText } from '../../src/ui/proto/tension';
describe('느린 판 한 줄 (U-51)', () => {
  it('평소 1분 폭의 k배 = k² 분: 5분 안이면 말하지 않는다, 넘으면 걸릴 시간과 더 빠른 종목', () => {
    // 0.1% 를 가야 하는데 1분 폭 0.05% → 2배 → 4분: 말하지 않는다
    expect(slowHint({ needPct: 0.1, rangePct: 0.05, goal: '이자 한 번', alt: null, ownR: 0.05 })).toBeNull();
    // 0.3% / 0.05% = 6배 → 36분
    const h = slowHint({ needPct: 0.3, rangePct: 0.05, goal: '이자 한 번', alt: { name: '날다람쥐코인', r: 0.8 }, ownR: 0.05 })!;
    expect(h.sec).toBeCloseTo(36 * 60, 6);
    expect(h.text).toBe('평소대로면 이자 한 번까지 36분쯤. 지금 빠른 곳은 날다람쥐코인 (1분 0.8%)');
    // 다른 종목이 두 배도 안 빠르면 이름을 대지 않는다(없는 출렁임을 말하지 않는다)
    expect(slowHint({ needPct: 0.3, rangePct: 0.05, goal: '+15%', alt: { name: '도토이더', r: 0.07 }, ownR: 0.05 })!.text).toBe('평소대로면 +15%까지 36분쯤.');
    expect(slowHint({ needPct: 3, rangePct: 0.05, goal: '+15%', alt: null, ownR: 0.05 })!.text).toBe('평소대로면 +15%까지 하루 넘게 걸린다.');
    expect(slowHint({ needPct: 0.3, rangePct: null, goal: '+15%', alt: null, ownR: null })).toBeNull();
  });
  it('시간 글', () => {
    expect(waitText(400)).toBe('7분');
    expect(waitText(5400)).toBe('1.5시간');
    expect(waitText(7200)).toBe('2시간');
    expect(waitText(90000)).toBe('하루 넘게');
  });
});


// 포지션을 들고 있는 동안의 긴장(U-39 ①)과 자리를 비운 사이 보고서(U-39 ④). 순수 함수 시험.
import { describe, expect, it } from 'vitest';
import { claimShare, heroMood, holdBeat, orderOdds, reachOf, recentRange, stepsOf, tensionOf, type HoldSnap } from '../../src/ui/proto/tension';
import { awayCard, awayDur } from '../../src/ui/proto/away';
import type { AwayReport } from '../../src/engine/types';

/** 값 base 주위를 ±ampPct% 로 오가는 n초 기록 */
const wave = (base: number, ampPct: number, n = 60): number[] => Array.from({ length: n }, (_, i) => base * (1 + (ampPct / 100) * 0.5 * Math.sin(i / 3)));

describe('지난 1분 폭', () => {
  it('최고 − 최저를 지금 값에 견준 %', () => {
    const r = recentRange(wave(1000, 0.1))!;
    expect(r).toBeGreaterThan(0.09);
    expect(r).toBeLessThan(0.11);
  });
  it('기록이 10개보다 적으면 모른다', () => {
    expect(recentRange([1, 2, 3])).toBeNull();
    expect(stepsOf(1, null)).toBeNull();
    expect(tensionOf(1, [1, 2]).text).toBe('시세를 모으는 중');
  });
  it('폭이 0이어도 배수가 터지지 않는다', () => {
    const flat = Array.from({ length: 60 }, () => 100);
    expect(Number.isFinite(stepsOf(0.4, recentRange(flat))!)).toBe(true);
  });
});

describe('청산까지 = 지난 1분 폭의 몇 배', () => {
  it('실제로 잰 값(회차 2): 1분 폭 0.04% 인 장에서 10배는 한참 멀고 200배는 보이는 거리', () => {
    const h = wave(68000, 0.04);
    const t10 = tensionOf(9.9, h), t200 = tensionOf(0.4, h);
    expect(t10.reach).toBe('far');
    expect(t10.dots).toBe(0);
    expect(t200.steps!).toBeGreaterThan(8);
    expect(tensionOf(0.25, h).reach).toBe('seen');
    expect(tensionOf(0.1, h).reach).toBe('tight');
    expect(tensionOf(0.03, h).reach).toBe('edge');
  });
  it('가까울수록 점이 찬다', () => {
    const h = wave(100, 0.1);
    const dots = [5, 1.5, 0.5, 0.25, 0.15, 0.05].map((d) => tensionOf(d, h).dots);
    expect(dots).toEqual([...dots].sort((a, b) => a - b));
    expect(dots[dots.length - 1]).toBe(5);
  });
  it('한 줄에 폭과 배수와 말이 다 있다', () => {
    expect(tensionOf(0.4, wave(100, 0.1)).text).toMatch(/1분 폭\(0\.10%\)의 \d\.\d배, 보이는 거리/);
  });
  it('단계 경계', () => {
    expect([0.5, 1, 2.9, 3, 7.9, 8].map(reachOf)).toEqual(['edge', 'tight', 'tight', 'seen', 'seen', 'far']);
  });
});

describe('들어가기 전의 셈: 이자 한 번 치까지', () => {
  const base = { claim: 15500, feeRate: 0.0004, maintenanceRate: 0.001, hist: wave(68000, 0.04) };
  it('10배 · 2만 8천: 이자보다 청산이 가깝지는 않지만 시세가 5% 넘게 가야 한다', () => {
    const o = orderOdds({ ...base, margin: 28000, lev: 10 })!;
    expect(o.needPct).toBeCloseTo((15500 / 280000) * 100 + 0.08, 5);
    expect(o.needPct).toBeGreaterThan(5);
    expect(o.liqPct).toBeCloseTo(9.9, 5);
    expect(o.liqFirst).toBe(false);
    expect(o.needSteps!).toBeGreaterThan(100);
    expect(o.text).toMatch(/이자 15,500까지 시세 5\.\d%.*청산까지 9\.9%/);
  });
  it('200배 · 10만: 0.2%도 안 가면 이자 한 번 치, 청산은 0.4%', () => {
    const o = orderOdds({ ...base, margin: 100000, lev: 200 })!;
    expect(o.needPct).toBeLessThan(0.2);
    expect(o.liqPct).toBeCloseTo(0.4, 5);
    expect(o.liqFirst).toBe(false);
  });
  it('너무 작은 판은 청산이 먼저다: 못 번다고 그대로 말한다', () => {
    const o = orderOdds({ ...base, margin: 1000, lev: 10 })!;
    expect(o.liqFirst).toBe(true);
    expect(o.text).toMatch(/못 번다/);
  });
  it('걸 돈이 없으면 셈이 없다', () => {
    expect(orderOdds({ ...base, margin: 0, lev: 10 })).toBeNull();
  });
  it('손익을 이자 한 번 치의 %로', () => {
    expect(claimShare(7750, 15500)).toBe('이자의 +50%');
    expect(claimShare(-3100, 15500)).toBe('이자의 −20%');
    expect(claimShare(100, 15500)).toBeNull();
  });
});

describe('주인공의 몸', () => {
  const o = { hasPos: true, roe: 0, pnl: 0, claim: 15500, reach: 'far' as const, nearLiq: false };
  it('포지션이 없으면 그대로, 있으면 폰만 본다', () => {
    expect(heroMood({ ...o, hasPos: false })).toBe('idle');
    expect(heroMood(o)).toBe('phone');
  });
  it('크게 잃는 중이면 서성이고, 크게 따는 중이면 들썩인다', () => {
    expect(heroMood({ ...o, roe: -30, pnl: -8000 })).toBe('pace');
    expect(heroMood({ ...o, roe: 30, pnl: 8000 })).toBe('hop');
    expect(heroMood({ ...o, roe: 3, pnl: 5000 })).toBe('hop'); // 넣은 돈에 견줘 작아도 이자의 3할이면 큰돈이다
  });
  it('청산이 흔들리는 폭 안이면 굳는다', () => {
    expect(heroMood({ ...o, reach: 'edge', roe: 80, pnl: 9000 })).toBe('frozen');
    expect(heroMood({ ...o, nearLiq: true })).toBe('frozen');
  });
});

describe('들고 있는 동안의 속마음', () => {
  const s: HoldSnap = { pnl: 0, roe: 0, heldSec: 10, claim: 15500, reach: 'far', peakPnl: 0, lowRoe: 0, settles: 0 };
  it('아무 일도 없으면 말이 없다', () => {
    expect(holdBeat(s, {})).toBeNull();
  });
  it('이자 한 번 치를 넘으면 그 숫자를 말한다', () => {
    expect(holdBeat({ ...s, pnl: 16000, roe: 16, peakPnl: 16000 }, {})).toEqual({ key: 'claim', text: '…이자 한 번 치다. 지금 닫으면 16,000.' });
  });
  it('같은 말은 포지션마다 한 번', () => {
    expect(holdBeat({ ...s, pnl: 16000, roe: 16, peakPnl: 16000 }, { claim: true })).toBeNull();
  });
  it('벌었다가 토해 내면: 아까 닫을 걸', () => {
    expect(holdBeat({ ...s, pnl: 2000, peakPnl: 9000 }, {})?.key).toBe('gaveBack');
  });
  it('절반이 녹으면, 물렸다가 본전이 되면', () => {
    expect(holdBeat({ ...s, pnl: -14000, roe: -52, lowRoe: -52 }, {})?.key).toBe('half');
    expect(holdBeat({ ...s, pnl: 120, roe: 0.4, lowRoe: -30 }, {})?.key).toBe('even');
  });
  it('75초 동안 안 움직이면: 수수료만 냈다', () => {
    expect(holdBeat({ ...s, heldSec: 80, pnl: -150, roe: -0.6, lowRoe: -0.7 }, {})?.key).toBe('flat');
    expect(holdBeat({ ...s, heldSec: 80, pnl: -150, roe: -0.6, lowRoe: -20 }, {})).toBeNull(); // 크게 흔들렸다 돌아온 것은 "안 움직인다"가 아니다
  });
  it('정산을 넘겨 들고 있으면, 그리고 청산이 코앞이면 그것이 먼저', () => {
    expect(holdBeat({ ...s, settles: 1 }, {})?.key).toBe('settled');
    expect(holdBeat({ ...s, settles: 1, reach: 'edge', pnl: -9000, roe: -70 }, {})?.key).toBe('edge');
    expect(holdBeat({ ...s, reach: 'tight', pnl: -4000, roe: -40 }, {})?.key).toBe('tight');
  });
});

describe('자리를 비운 사이', () => {
  const rep = (over: Partial<AwayReport> = {}): AwayReport => ({
    awayHours: 0.2, awaySec: 720, fromTick: 1000, toTick: 1720, economySettlements: 2, bankrupt: false,
    openAtLeave: [{ market: 'MDT', dir: 1, lev: 50, margin: 52000 }], settlementSummary: { mined: 26000, power: 0, interest: 29000 },
    entries: [
      { tick: 1000, kind: 'away', text: '자리를 비움' },
      { tick: 1134, kind: 'liq', text: '멍도토 롱 50배 강제 청산', amount: -52000 },
      { tick: 1360, kind: 'quit:hamster', text: '알바 햄스터가 일당을 못 받고 나갔다', amount: 1800 },
      { tick: 1720, kind: 'back', text: '돌아옴' },
    ], ...over,
  });
  const o = { names: { MDT: '멍도토' }, openNow: 0, interval: 180 };
  it('시간 표기', () => {
    expect([40, 720, 3700, 90000].map(awayDur)).toEqual(['40초', '12분', '1시간 1분', '1일 1시간']);
  });
  it('청산과 나간 알바가 줄로, 나간 지 얼마 만인지와 함께', () => {
    const c = awayCard(rep(), { cash: 60000, debt: 500000 }, { cash: 4000, debt: 500000 }, o);
    expect(c.title).toBe('자리를 비운 12분');
    expect(c.rows.map((r) => r.text)).toEqual(['멍도토 롱 50배 강제 청산', '알바 햄스터가 일당을 못 받고 나갔다']);
    expect(c.rows[0]).toMatchObject({ amount: -52000, tone: 'loss', after: '나간 지 2분' });
    expect(c.left).toEqual(['멍도토 롱 50배']);
    expect(c.cashDelta).toBe(-56000);
    expect(c.debtDelta).toBe(0);
  });
  it('추심원 쪽지: 정산은 두 번만 돌았다(12분이면 네 번 올 시간)', () => {
    expect(awayCard(rep(), { cash: 0, debt: 0 }, { cash: 0, debt: 0 }, o).note).toBe('안 계셔서 2번만 걷고 갔어요오. 이자 29,000. 빈 집에선 더 안 걷어요오.');
    expect(awayCard(rep({ awaySec: 200, economySettlements: 1 }), { cash: 0, debt: 0 }, { cash: 0, debt: 0 }, o).note).toBe('안 계셔서 1번만 걷고 갔어요오. 이자 29,000.');
    expect(awayCard(rep({ awaySec: 90, economySettlements: 0, entries: [] }), { cash: 0, debt: 0 }, { cash: 0, debt: 0 }, o).note).toBeNull();
  });
  it('익절은 이익으로 적힌다', () => {
    const c = awayCard(rep({ entries: [{ tick: 1100, kind: 'tp', text: '멍도토 롱 50배 익절', amount: 26000 }] }), { cash: 0, debt: 0 }, { cash: 78000, debt: 0 }, o);
    expect(c.rows[0]).toMatchObject({ tone: 'gain', amount: 26000 });
  });
});

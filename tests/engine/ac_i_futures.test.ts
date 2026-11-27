import { describe, it, expect } from 'vitest';
import { A, bare, giveCoinValue, giveEquip, giveWheel, noDebts, openFutures, settleOnce, tickN } from './helpers';
import { liqPrice, roePct, shortInsurance, pnlOf, stopPrice } from '../../src/engine/futures';
import { walletValue } from '../../src/engine/selectors';
import { fundedByAt } from '../../src/engine/loans';
import { checkLiquidationWipeout } from '../../src/engine/bankruptcy';

const ref = 68000;
function longDtc(lev = 200, margin = 10000) {
  const g = bare();
  openFutures(g);
  g.run.cash = 1_000_000;
  expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev, margin }).ok).toBe(true);
  return g;
}

describe('H. 선물 거래', () => {
  it('AC-v2-80 도토코인 68,000, 200배 롱, 증거금 10,000: 명목 2,000,000, 진입 수수료 800, 청산가 67,728, +0.25% 면 ROE +50%', () => {
    const g = bare();
    openFutures(g);
    const c0 = g.run.cash;
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    const p = g.run.positions.DTC;
    expect(p.notional).toBe(2_000_000);
    expect(p.feesPaid).toBe(800);
    expect(c0 - g.run.cash).toBe(10800);
    expect(liqPrice(p)).toBeCloseTo(67728, 6);
    expect(roePct(p, ref * 1.0025)).toBeCloseTo(50, 6);
    expect(pnlOf(p, ref * 1.0025)).toBeCloseTo(5000, 6);
  });

  it('AC-v2-80 정리: 현금 += max(0, 증거금 + 손익 − N × 0.04%) 내림, 숏 청산가는 위쪽', () => {
    const g = longDtc(10, 10000);
    tickN(g, 1, { DTC: ref * 1.05 }); // +50% ROE
    const c0 = g.run.cash;
    A(g, { type: 'close', market: 'DTC' });
    expect(g.run.cash - c0).toBe(Math.floor(10000 + 100000 * 0.05 - 40));
    const s = bare();
    openFutures(s);
    A(s, { type: 'open', market: 'DTC', dir: -1, lev: 100, margin: 10000 });
    expect(liqPrice(s.run.positions.DTC)).toBeCloseTo(ref * (1 + 0.01 - 0.001), 6);
  });

  it('AC-v2-81 틱 가격이 청산가에 닿으면 증거금 전액 소멸, liq 기록', () => {
    const g = longDtc();
    const c0 = g.run.cash;
    tickN(g, 1, { DTC: 67728 });
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.cash).toBe(c0);
    expect(g.run.eventLog.some((e) => e.kind === 'liq')).toBe(true);
    expect(g.run.stats.liqStreak).toBe(1);
    expect(g.run.lastPos).toMatchObject({ ended: 'liq', lev: 200, dir: 1 });
  });

  it('AC-v2-82 손절 −25% 와 청산가를 같은 틱에 넘으면 청산이 우선', () => {
    const g = bare();
    openFutures(g);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000, sl: -25 });
    expect(stopPrice(g.run.positions.DTC, -25)).toBeCloseTo(ref * (1 - 0.25 / 200), 6);
    tickN(g, 1, { DTC: 67000 });
    expect(g.run.eventLog[g.run.eventLog.length - 1].kind).toBe('liq');
    expect(g.run.eventLog.some((e) => e.kind === 'sl')).toBe(false);
  });

  it('손절·익절은 그 값에 정리한다', () => {
    const g = bare();
    openFutures(g);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000, sl: -25, tp: 50 });
    tickN(g, 1, { DTC: ref * 0.99 }); // -10% ROE: 아직
    expect(g.run.positions.DTC).toBeDefined();
    const c0 = g.run.cash;
    tickN(g, 1, { DTC: ref * 0.9 }); // 한 번에 -100% ROE 를 넘어도 손절가(−25%)에 정리되지만 청산가가 더 가깝다 -> 청산
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.cash).toBe(c0);
    const h = bare();
    openFutures(h);
    A(h, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000, sl: -5, tp: 50 });
    const c1 = h.run.cash;
    tickN(h, 1, { DTC: ref * 0.99 }); // ROE -10% -> -5% 손절가(0.995)를 넘음
    expect(h.run.positions.DTC).toBeUndefined();
    expect(h.run.cash - c1).toBe(Math.floor(10000 + 100000 * -0.005 * 1 - 40)); // 손절가에 정리
    expect(h.run.eventLog.some((e) => e.kind === 'sl')).toBe(true);
  });

  it('AC-v2-83 100배 포지션(명목 1,000만)을 8시간(정산 480회, U-47) 들면 펀딩비 합계 15,840(정산마다 33)', () => {
    const g = bare();
    openFutures(g);
    noDebts(g);
    g.run.cash = 1_000_000;
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 100, margin: 100000 });
    expect(g.run.positions.DTC.notional).toBe(10_000_000);
    g.run.cash = 100_000_000;
    settleOnce(g, 480);
    expect(g.run.stats.fundingPaid).toBe(15840);
    expect(g.run.positions.DTC.fundingPaid).toBe(15840);
    expect(g.run.positions.DTC.margin).toBe(100000 - 15840);
  });

  it('펀딩비를 뺀 뒤 증거금 + 손익 ≤ 명목 × 0.1% 면 청산(viaFunding)', () => {
    const g = bare();
    openFutures(g);
    noDebts(g);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    g.run.positions.DTC.margin = 2000 + 5; // 명목 2,000,000 × 0.1% = 2,000, 펀딩비 20 을 빼면 2,000 이하
    settleOnce(g);
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.lastPos!.viaFunding).toBe(true);
  });

  it('AC-v2-84 명목이 2억을 넘는 입력은 막힌다("포지션 한도 2억")', () => {
    const g = bare();
    openFutures(g);
    g.run.cash = 1e9;
    const r = A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 20_000_001 });
    expect(r.ok).toBe(false);
    expect(r.msg).toBe('포지션 한도 2억');
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 20_000_000 }).ok).toBe(true);
  });

  it('AC-v2-85 롱을 가지면 숏은 막히고 추가 진입은 같은 배율로만, 새 진입가는 가중 조화 평균', () => {
    const g = longDtc(10, 10000);
    expect(A(g, { type: 'open', market: 'DTC', dir: -1, lev: 10, margin: 10000 }).code).toBe('dir');
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 5, margin: 10000 }).code).toBe('lev');
    tickN(g, 1, { DTC: ref * 1.01 });
    const p = g.run.positions.DTC;
    const n1 = p.notional;
    expect(A(g, { type: 'add', market: 'DTC', margin: 10000 }).ok).toBe(true);
    expect(p.notional).toBe(200000);
    expect(p.entry).toBeCloseTo(200000 / (n1 / ref + 100000 / (ref * 1.01)), 6);
    expect(p.adds).toBe(1);
    expect(p.margin0).toBe(20000);
  });

  it('포지션은 종목마다 하나, 거래할 수 있는 종목 수(6개, 날다람쥐코인 포함)까지', () => {
    const g = bare();
    openFutures(g);
    g.run.cash = 1e7;
    for (const m of ['DTC', 'BTH', 'SMS', 'MDT', 'JQQ', 'FLY']) expect(A(g, { type: 'open', market: m, dir: 1, lev: 2, margin: 1000 }).ok).toBe(true);
    expect(Object.keys(g.run.positions)).toHaveLength(6);
  });

  it('증거금 비율 선택: 100% 는 floor(현금 / (1 + 배율 × 0.04%))', () => {
    const g = bare();
    openFutures(g);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 50, marginPct: 100 });
    expect(g.run.positions.DTC.margin).toBe(Math.floor(100000 / (1 + 50 * 0.0004)));
    expect(g.run.cash).toBeGreaterThanOrEqual(0);
    expect(g.run.cash).toBeLessThan(5);
  });

  it('AC-v2-86 시장 지연: 진입은 막히고 정리는 예약, 정지: 손익·청산·펀딩비가 멈추고 정산은 계속, 다시 열리면 이어진다', () => {
    const g = longDtc(10, 10000);
    tickN(g, 1, {}, 'delayed');
    expect(A(g, { type: 'open', market: 'BTH', dir: 1, lev: 2, margin: 1000 }).ok).toBe(false);
    expect(A(g, { type: 'close', market: 'DTC' }).code).toBe('reserved');
    expect(g.run.positions.DTC).toBeDefined();
    tickN(g, 1);
    expect(g.run.positions.DTC).toBeUndefined();
    // 정지
    const h = longDtc(200, 10000);
    noDebts(h);
    h.run.cash = 1e9;
    tickN(h, 5, { DTC: 60000 }, 'halted');
    expect(h.run.positions.DTC).toBeDefined(); // 청산가 아래 가격이어도 얼려 있다
    const before = h.run.settleNo;
    settleOnce(h, 1);
    // settleOnce 는 정지 상태가 아닌 틱을 넣으므로 정지로 한 정산을 채운다
    void before;
    const k = longDtc(10, 10000);
    noDebts(k);
    k.run.cash = 1e9;
    tickN(k, 60, {}, 'halted'); // 정산 한 번(60초)
    expect(k.run.settleNo).toBe(1);
    expect(k.run.positions.DTC.fundingPaid).toBe(0);
    tickN(k, 60, {}, 'open');
    expect(k.run.positions.DTC.fundingPaid).toBe(1); // 명목 100,000 × 0.00033% = 0.33 -> 올려서 1
  });

  it('AC-v2-45 지갑 도토코인 100,000어치와 10배 숏(명목 100,000): −5% 면 지갑 95,000, 숏 평가익 +5,000, 숏으로 지킨 비율 100%', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 100000);
    openFutures(g);
    g.run.cash = 1_000_000;
    A(g, { type: 'open', market: 'DTC', dir: -1, lev: 10, margin: 10000 });
    tickN(g, 1, { DTC: ref * 0.95 });
    const p = g.run.positions.DTC;
    expect(walletValue(g.run)).toBeCloseTo(95000, 4);
    expect(pnlOf(p, g.run.prices.DTC)).toBeCloseTo(5000, 4);
    expect(shortInsurance(g.run, 'DTC').ratioPct).toBe(100);
    const h = bare();
    giveWheel(h, 'DTC');
    giveCoinValue(h, 'DTC', 100000);
    expect(shortInsurance(h.run, 'DTC').ratioPct).toBe(0);
  });

  it('AC-v2-61 빌리고 59초 뒤 진입한 포지션은 fundedBy=capital, 61초 뒤면 없다', () => {
    const g = bare();
    openFutures(g);
    A(g, { type: 'borrow', lender: 'capital' });
    tickN(g, 59);
    expect(fundedByAt(g)).toBe('capital');
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 2, margin: 1000 });
    expect(g.run.positions.DTC.fundedBy).toBe('capital');
    const h = bare();
    openFutures(h);
    A(h, { type: 'borrow', lender: 'capital' });
    tickN(h, 61);
    A(h, { type: 'open', market: 'DTC', dir: 1, lev: 2, margin: 1000 });
    expect(h.run.positions.DTC.fundedBy).toBeNull();
  });

  it('AC-v2-72 실제 청산에서 즉시 파산: 빚 30만, 쳇바퀴 1대면 파산하지 않고, 쳇바퀴·설비 0 이고 지갑 0 이면 그 자리에서, 빚 0 이면 아니다', () => {
    const mk = (opt: { wheel?: boolean; debt?: boolean }) => {
      const g = bare();
      openFutures(g);
      if (!opt.debt) noDebts(g);
      if (opt.wheel) giveWheel(g, 'DTC');
      g.run.cash = 100000;
      A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, marginPct: 100 });
      tickN(g, 1, { DTC: ref * 0.5 });
      return g;
    };
    const a = mk({ wheel: true, debt: true });
    expect(a.run.positions.DTC).toBeUndefined();
    expect(a.run.over).toBe(false);
    const b = mk({ debt: true });
    expect(b.run.over).toBe(true);
    expect(b.run.bankruptcy).toMatchObject({ cause: 'LIQ', immediate: true });
    const c = mk({});
    expect(c.run.over).toBe(false);
    const d = bare();
    giveEquip(d, 'wheel2', 'DTC', 20000);
    d.run.cash = 0;
    expect(checkLiquidationWipeout(d)).toBe(false);
  });
});

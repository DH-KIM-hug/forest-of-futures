import { describe, it, expect } from 'vitest';
import { A, bare, flatBars, giveWheel, noDebts, openFutures, tickN } from './helpers';
import { catchUp, onBackground, replayTicks } from '../../src/engine/offline';
import { liqPrice, stopPrice } from '../../src/engine/futures';
import type { Bar } from '../../src/engine/feed/types';
import type { GameState } from '../../src/engine/types';

const P = 68000;
function away(g: GameState) {
  g.run.lastSeenTick = 100000;
  g.run.tick = 5000;
}

describe('J. 오프라인', () => {
  it('AC-v2-92 단계 1, 포지션 없이 8시간: 경제는 정산 2회분만 처리되고 시간표는 한 번. idle 2단계면 4회분', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    away(g);
    const rep = catchUp(g, flatBars(g, 480), 8 * 3600);
    expect(rep.economySettlements).toBe(2);
    expect(g.run.settleNo).toBe(2);
    expect(rep.awayHours).toBe(8);
    expect(rep.entries.length).toBeGreaterThanOrEqual(0);
    const h = bare();
    giveWheel(h, 'DTC');
    h.family.tree.idle = 2;
    away(h);
    expect(catchUp(h, flatBars(h, 480), 8 * 3600).economySettlements).toBe(4);
    const s = bare(); // 단계 0 은 0회
    away(s);
    expect(catchUp(s, flatBars(s, 480), 8 * 3600).economySettlements).toBe(0);
    expect(s.run.settleNo).toBe(0);
  });

  it('AC-v2-93 200배 롱(청산가 −0.4%)을 걸고 나갔는데 2시간 13분 뒤 봉의 저가가 청산가에 닿으면 그 시각에 청산, 시간표에 보인다', () => {
    const g = bare();
    openFutures(g);
    giveWheel(g, 'MDT');
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    away(g);
    const liq = liqPrice(g.run.positions.DTC);
    expect(liq / P - 1).toBeCloseTo(-0.004, 6);
    const rep = catchUp(g, flatBars(g, 480, (k, m) => (k === 133 && m === 'DTC' ? { l: liq - 1 } : undefined)), 8 * 3600);
    expect(g.run.positions.DTC).toBeUndefined();
    const e = rep.entries.find((x) => x.kind === 'liq')!;
    expect(e.tick - rep.fromTick).toBe(133 * 60);
    expect(rep.openAtLeave).toHaveLength(1);
    expect(g.run.lastPos!.ended).toBe('liq');
  });

  it('AC-v2-94 자리를 비운 사이 익절가에 닿으면 그 값에 정리되어 현금에 들어와 있고, 같은 봉에서 손절·익절을 모두 지나면 손절이 먼저', () => {
    const mk = (bar: { h?: number; l?: number }) => {
      const g = bare();
      openFutures(g);
      A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000, sl: -25, tp: 150 });
      away(g);
      const p = g.run.positions.DTC;
      return { g, p, tp: stopPrice(p, 150), sl: stopPrice(p, -25), bar };
    };
    const a = mk({});
    const c0 = a.g.run.cash;
    const repA = catchUp(a.g, flatBars(a.g, 300, (k, m) => (k === 50 && m === 'DTC' ? { h: a.tp + 1 } : undefined)), 5 * 3600);
    expect(a.g.run.positions.DTC).toBeUndefined();
    expect(repA.entries.some((e) => e.kind === 'tp')).toBe(true);
    expect(a.g.run.cash - c0).toBe(10000 - 16 + 15000 - 40); // 증거금 - 펀딩비(50분, 16회) + 익절 이익 - 정리 수수료
    const b = mk({});
    const c1 = b.g.run.cash;
    const repB = catchUp(b.g, flatBars(b.g, 300, (k, m) => (k === 50 && m === 'DTC' ? { h: b.tp + 1, l: b.sl - 1 } : undefined)), 5 * 3600);
    expect(repB.entries.some((e) => e.kind === 'sl')).toBe(true);
    expect(repB.entries.some((e) => e.kind === 'tp')).toBe(false);
    expect(b.g.run.cash - c1).toBeLessThan(10000 * 0.8);
  });

  it('AC-v2-95 쳇바퀴·설비 0, 빚 30만, 현금 거의 전부를 넣은 포지션이 비운 사이 청산: 파산이 정해지고 offline=true, awayHours 기록', () => {
    const g = bare();
    openFutures(g);
    g.run.cash = 100000;
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, marginPct: 100 });
    away(g);
    const rep = catchUp(g, flatBars(g, 480, (k, m) => (k === 20 && m === 'DTC' ? { l: P * 0.5 } : undefined)), 8 * 3600);
    expect(rep.bankrupt).toBe(true);
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy).toMatchObject({ offline: true, immediate: true });
    expect(g.run.stats.awayHours).toBe(8);
    expect(rep.entries.some((e) => e.kind === 'bankrupt')).toBe(true);
  });

  it('AC-v2-96 오소리 연체가 1(한도 2)이 될 정산 앞에서 경제는 멈추고 파산하지 않는다', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    g.run.cash = 0;
    g.run.debts.capital.principal = 0;
    away(g);
    const rep = catchUp(g, flatBars(g, 480), 8 * 3600);
    expect(rep.economySettlements).toBe(0);
    expect(g.run.over).toBe(false);
    expect(g.run.debts.shark1.overdue).toBe(0);
  });

  it('AC-v2-96 연체 위험이 없으면 상한(2회)까지 돈다', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    away(g);
    expect(catchUp(g, flatBars(g, 480), 8 * 3600).economySettlements).toBe(2);
    expect(g.run.cash).toBe(100000 - 2 * 10000);
  });

  it('AC-v2-97 20초 끊겼다 붙으면 빈 20틱을 순서대로 재생하고, 청산가에 닿은 틱에서 청산된다', () => {
    const g = bare();
    openFutures(g);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    const liq = liqPrice(g.run.positions.DTC);
    const ticks = Array.from({ length: 20 }, (_, i) => ({
      n: g.run.tick + 1 + i, st: 'open' as const,
      p: Object.fromEntries(Object.entries(g.run.prices).map(([k, v]) => [k, [k === 'DTC' && i >= 6 ? liq - 1 : v, 1, 0.5] as [number, number, number]])),
    }));
    const t0 = g.run.tick;
    replayTicks(g, ticks);
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.eventLog.find((e) => e.kind === 'liq')!.at.tick).toBe(t0 + 7);
    expect(g.run.tick).toBe(t0 + 20);
  });

  it('AC-v2-98 열린 포지션이 있는 채 앱이 가려지면 속보 띠에 포지션 수와 가장 가까운 청산가까지의 거리가 한 번', () => {
    const g = bare();
    openFutures(g);
    g.run.cash = 1e6;
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    A(g, { type: 'open', market: 'BTH', dir: -1, lev: 10, margin: 10000 });
    A(g, { type: 'background' });
    const n = g.run.notices.filter((x) => x.id.startsWith('wire:away'));
    expect(n).toHaveLength(1);
    expect(n[0].text).toBe('열어 둔 포지션 2개 — 자리를 비워도 계속 움직입니다. 가장 가까운 청산가까지 0.4%');
    const h = bare();
    onBackground(h);
    expect(h.run.notices.filter((x) => x.id.startsWith('wire:away'))).toHaveLength(0);
  });

  it('AC-v2-99 비운 구간에 시장 정지가 30분 있었다면 그 봉은 건너뛰고 펀딩비도 붙지 않는다', () => {
    const run = (halted: boolean) => {
      const g = bare();
      openFutures(g);
      noDebts(g);
      g.run.cash = 1e7;
      A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 100000 }); // 명목 100만 -> 정산당 펀딩비 10
      away(g);
      catchUp(g, flatBars(g, 60, (k): Partial<Bar> | undefined => (halted && k >= 10 && k < 40 ? { st: 'halted', l: 1 } : undefined)), 3600);
      return g;
    };
    const a = run(false);
    const b = run(true);
    expect(a.run.positions.DTC.fundingPaid).toBe(20 * 10);
    expect(b.run.positions.DTC.fundingPaid).toBe(10 * 10);
    expect(b.run.positions.DTC).toBeDefined(); // 정지 봉의 저가(1)는 무시
  });

  it('90일을 넘게 비우면 남은 포지션은 마지막 봉 종가에 정리한다', () => {
    const g = bare();
    openFutures(g);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 2, margin: 10000 });
    away(g);
    const bars = flatBars(g, 3);
    catchUp(g, bars, 91 * 24 * 3600);
    expect(g.run.positions.DTC).toBeUndefined();
    void tickN;
  });
});

import { describe, it, expect } from 'vitest';
import { fresh, setPrice } from './helpers';
import { openPosition, processPrice, applyFunding, closePosition } from '../../src/engine/trading';
import { settle } from '../../src/engine/settlement';
import { liqPrice, posPnl, posRoe, slPrice } from '../../src/engine/selectors';

const open = (g: ReturnType<typeof fresh>, over: Partial<Parameters<typeof openPosition>[1]> = {}) =>
  openPosition(g, { market: 'DTC', dir: 1, lev: 10, marginPct: 25, ...over });

describe('거래', () => {
  it('AC-34 10배·25%·롱: 증거금 25,000, N 250,000, 수수료 100, 현금 74,900, 청산가 61,268', () => {
    const g = fresh();
    setPrice(g, 'DTC', 68000);
    expect(open(g).ok).toBe(true);
    const p = g.run.positions.DTC;
    expect(p.margin).toBe(25000);
    expect(p.notional).toBe(250000);
    expect(p.feesPaid).toBe(100);
    expect(g.run.cash).toBe(74900);
    expect(liqPrice(p)).toBeCloseTo(61268, 3);
  });

  it('AC-35 200배·전부: 증거금 92,592, 수수료 7,408, 현금 0', () => {
    const g = fresh();
    setPrice(g, 'DTC', 68000);
    open(g, { lev: 200, marginPct: 100 });
    expect(g.run.positions.DTC.margin).toBe(92592);
    expect(g.run.positions.DTC.feesPaid).toBe(7408);
    expect(g.run.cash).toBe(0);
  });

  it('AC-36 가격 +1%: PnL +2,500, ROE +10%', () => {
    const g = fresh();
    setPrice(g, 'DTC', 68000);
    open(g);
    const p = g.run.positions.DTC;
    expect(posPnl(p, 68680)).toBeCloseTo(2500, 6);
    expect(posRoe(p, 68680)).toBeCloseTo(10, 6);
  });

  it('AC-37 200배 롱: 67,728 이하면 강제 청산, 돌려받는 돈 0, liqs +1', () => {
    const g = fresh();
    setPrice(g, 'DTC', 68000);
    open(g, { lev: 200, margin: 10000 });
    const cash = g.run.cash;
    expect(liqPrice(g.run.positions.DTC)).toBeCloseTo(67728, 3);
    processPrice(g, 'DTC', 67729, false, 68000);
    expect(g.run.positions.DTC).toBeDefined();
    processPrice(g, 'DTC', 67728, false, 67729);
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.cash).toBe(cash);
    expect(g.run.stats.liqs).toBe(1);
  });

  it('AC-38 25배 롱 손절 -25%: 보통 틱은 67,320 에, 급등락 틱은 실제 가격에 정리', () => {
    const mk = () => {
      const g = fresh();
      setPrice(g, 'DTC', 68000);
      open(g, { lev: 25, margin: 10000, sl: -25 });
      return g;
    };
    const a = mk();
    expect(slPrice(a.run.positions.DTC)).toBeCloseTo(67320, 3);
    const c0 = a.run.cash;
    processPrice(a, 'DTC', 67300, false, 68000);
    expect(a.run.positions.DTC).toBeUndefined();
    expect(a.run.cash - c0).toBe(Math.floor(10000 - 2500 - 100)); // 67,320 에서 체결
    const b = mk();
    const c1 = b.run.cash;
    processPrice(b, 'DTC', 67000, true, 68000);
    expect(b.run.cash - c1).toBe(Math.floor(10000 - (1000 / 68000) * 250000 - 100)); // 67,000 에서 체결
  });

  it('AC-39 200배 롱 손절 -50%: 급등락 틱이 손절가와 청산가를 모두 넘으면 강제 청산', () => {
    const g = fresh();
    setPrice(g, 'DTC', 68000);
    open(g, { lev: 200, margin: 10000, sl: -50 });
    const cash = g.run.cash;
    processPrice(g, 'DTC', 67000, true, 68000);
    expect(g.run.stats.liqs).toBe(1);
    expect(g.run.cash).toBe(cash);
  });

  it('AC-40 익절 +50%: 익절가에 정리, 현금 += 증거금 + PnL - 수수료', () => {
    const g = fresh();
    setPrice(g, 'DTC', 68000);
    open(g, { lev: 25, margin: 10000, tp: 50 });
    const c = g.run.cash;
    processPrice(g, 'DTC', 69400, false, 69000);
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.cash - c).toBe(Math.floor(10000 + 5000 - 100)); // ROE +50% = PnL 5,000
  });

  it('AC-41 포지션이 있으면 반대 방향·다른 배율 진입은 막히고 다른 종목은 따로 연다', () => {
    const g = fresh();
    open(g);
    expect(open(g, { dir: -1 }).code).toBe('opposite');
    expect(open(g, { lev: 25 }).code).toBe('lev');
    expect(open(g, { market: 'BTH', dir: -1 }).ok).toBe(true);
    expect(Object.keys(g.run.positions).sort()).toEqual(['BTH', 'DTC']);
    expect(g.run.stats.hedgedEver).toBe(true);
    expect(closePosition(g, 'DTC').ok).toBe(true);
  });

  it('AC-42 추가 진입: 새 진입가 약 66,985, 증거금 50,000, adds 1', () => {
    const g = fresh();
    setPrice(g, 'DTC', 68000);
    open(g, { margin: 25000 });
    setPrice(g, 'DTC', 66000);
    open(g, { margin: 25000 });
    const p = g.run.positions.DTC;
    expect(p.entry).toBeCloseTo(66985, 0);
    expect(p.margin).toBe(50000);
    expect(p.notional).toBe(500000);
    expect(p.adds).toBe(1);
  });

  it('AC-43 200배 N 2,000,000: 정산 때 펀딩비 400 이 증거금에서 빠지고 청산가가 가까워진다', () => {
    const g = fresh();
    setPrice(g, 'DTC', 68000);
    open(g, { lev: 200, margin: 10000 });
    const before = liqPrice(g.run.positions.DTC);
    applyFunding(g);
    expect(g.run.positions.DTC.margin).toBe(9600);
    expect(liqPrice(g.run.positions.DTC)).toBeGreaterThan(before);
    expect(g.run.stats.fundingPaid).toBe(400);
  });

  it('AC-44 현금 900 이면 진입 불가, "증거금 부족 (최소 1,000)"', () => {
    const g = fresh();
    g.run.cash = 900;
    const r = open(g);
    expect(r.ok).toBe(false);
    expect(r.msg).toBe('증거금 부족 (최소 1,000)');
  });
});

describe('정산·연체·파산', () => {
  it('AC-46 첫 정산: 독사 0, 오소리 6,000, 캐피탈 3,000 -> 현금 91,000, 연체 없음', () => {
    const g = fresh();
    settle(g);
    expect(g.run.cash).toBe(91000);
    expect(Object.values(g.run.streak).every((x) => x === 0)).toBe(true);
    expect(g.run.cycles).toBe(1);
  });

  it('AC-47 현금 4,000: 오소리에 4,000 납부, 두 곳 연체 1', () => {
    const g = fresh();
    g.run.cash = 4000;
    settle(g);
    expect(g.run.debts.shark1).toBe(152000);
    expect(g.run.streak.shark1).toBe(1);
    expect(g.run.debts.capital).toBe(153000);
    expect(g.run.streak.capital).toBe(1);
    expect(g.run.cash).toBe(0);
  });

  it('AC-48 연체 1 -> 다음 정산에 전액 내면 0', () => {
    const g = fresh();
    g.run.streak.shark1 = 1;
    settle(g);
    expect(g.run.streak.shark1).toBe(0);
  });

  it('AC-49 연체 1 -> 또 못 내면 overdue_shark1 파산', () => {
    const g = fresh();
    g.run.streak.shark1 = 1;
    g.run.cash = 0;
    settle(g);
    expect(g.run.over).toBe(true);
    expect(g.pending?.snapshot.cause).toBe('overdue_shark1');
  });

  it('AC-50 독사와 캐피탈이 동시에 한도에 닿으면 overdue_shark2', () => {
    const g = fresh();
    g.run.debts.shark2 = 100000;
    g.run.streak.shark2 = 1;
    g.run.streak.capital = 2;
    g.run.cash = 0;
    settle(g);
    expect(g.pending?.snapshot.cause).toBe('overdue_shark2');
  });

  it('AC-51 총부채 300,000 + 전액 200배 청산 -> 즉시 liquidation (immediate)', () => {
    const g = fresh();
    setPrice(g, 'DTC', 68000);
    open(g, { lev: 200, marginPct: 100 });
    processPrice(g, 'DTC', 60000, true, 68000);
    expect(g.run.over).toBe(true);
    expect(g.pending?.snapshot.cause).toBe('liquidation');
    expect(g.pending?.snapshot.immediate).toBe(true);
  });

  it('AC-52 총부채 0 이면 전액 청산돼도 파산하지 않는다', () => {
    const g = fresh();
    g.run.debts = { bank: 0, capital: 0, shark1: 0, shark2: 0 };
    setPrice(g, 'DTC', 68000);
    open(g, { lev: 200, marginPct: 100 });
    processPrice(g, 'DTC', 60000, true, 68000);
    expect(g.run.over).toBe(false);
    expect(g.run.stats.liqs).toBe(1);
  });

  it('AC-53 회차 안에 청산 손실 50,000 >= 미납 9,000 이면 원인을 liquidation 으로(immediate=false, 채권처 shark1)', () => {
    const g = fresh();
    g.run.stats.liqsThisCycle = 1;
    g.run.cycleRealized = -50000;
    g.run.streak.shark1 = 1;
    g.run.cash = 0;
    settle(g);
    const s = g.pending!.snapshot;
    expect(s.cause).toBe('liquidation');
    expect(s.immediate).toBe(false);
    expect(s.causeLender).toBe('shark1');
    expect(s.shortfall).toBe(9000);
  });

  it('AC-54 금리 인상 속보 중에는 모든 이자가 2배', () => {
    const g = fresh();
    g.run.effects.push({ id: 'rate_hike', type: 'rateMultiplier', multiplier: 2, remaining: 2 });
    settle(g);
    expect(g.run.cash).toBe(100000 - 18000);
  });
});

describe('엔진 추가 확인', () => {
  it('속보: 가짜 속보는 반대로 움직이고 정정이 뜬다', async () => {
    const { firePending } = await import('../../src/engine/events');
    const g = fresh();
    g.run.pending.push({ at: 1, kind: 'event', eventId: 'fake_pump', market: 'DTC' });
    g.run.tick = 1;
    const p0 = g.run.markets.DTC.price;
    firePending(g);
    expect(g.run.lastNews?.fake).toBe(true);
    expect(g.run.lastNews?.headlineDir).toBe(1);
    const jump = g.run.pending.find((p) => p.kind === 'jump')!;
    expect(jump.dir).toBe(-1);
    g.run.tick = jump.at;
    firePending(g);
    expect(g.run.markets.DTC.price).toBeLessThan(p0);
    expect(g.run.ticker?.text).toContain('사실무근');
  });
});

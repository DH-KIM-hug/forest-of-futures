// U-40(회차 3): FRX 숲거래소 오픈 기념 — 생마다 처음 20번의 정산 동안 거래 수수료 0, 끝나면 0.01%(U-46: 0.02% → 0.01%). 시세·청산 공식은 그대로.
import { afterEach, describe, expect, it } from 'vitest';
import { A, bare, openFutures, settleOnce, tickN } from './helpers';
import { balance } from '../../src/engine/data';
import { applyBirth, baseFeeRate, feeEventLeft, feeRate, openingEvent } from '../../src/engine/skilltree';
import { exitFee, liqPrice } from '../../src/engine/futures';
import { retireAct1 } from '../../src/engine/act1Retire';
import { specialEndings } from '../../src/engine/act1';
import type { GameState } from '../../src/engine/types';

const T = balance.trading as typeof balance.trading & { openingEvent: { freeSettlements: number; afterFeeRate: number } };
const act1 = (on: boolean) => { if (on) (balance as { act1?: unknown }).act1 = { friends: false }; else delete (balance as { act1?: unknown }).act1; };
afterEach(() => act1(false));
function trader(levels: Record<string, number> = {}): GameState {
  const g = bare();
  openFutures(g);
  g.family.skill = { ...levels };
  applyBirth(g);
  g.run.cash = 1_000_000;
  g.run.debts.shark1.principal = 0; g.run.debts.capital.principal = 0; // 정산이 살림을 건드리지 않게
  return g;
}

describe('오픈 기념 수수료 무료 (U-40)', () => {
  it('숫자: 정산 20번 무료, 끝나면 0.01%(U-46, 옛 0.04% · 0.02%보다 싸다). 1막 시제품에서만 켜진다', () => {
    expect(T.openingEvent).toMatchObject({ freeSettlements: 20, afterFeeRate: 0.0001 });
    expect(T.openingEvent.afterFeeRate).toBeLessThan(T.feeRate);
    expect(openingEvent()).toBeNull();
    const g = trader();
    expect(feeEventLeft(g.run)).toBe(0);
    expect(baseFeeRate(g.run)).toBe(T.feeRate); // 이벤트가 없는 판은 그대로 0.04%
    act1(true);
    expect(openingEvent()).not.toBeNull();
    expect(feeEventLeft(g.run)).toBe(20);
    expect(feeRate(g, 200)).toBe(0);
  });
  it('남은 횟수는 정산마다 하나씩 줄고, 스무 번째 정산이 끝나면 0.01%가 된다', () => {
    act1(true);
    const g = trader();
    for (let k = 0; k < 20; k++) {
      expect(feeEventLeft(g.run)).toBe(20 - k);
      expect(feeRate(g, 50)).toBe(0);
      settleOnce(g);
    }
    expect(g.run.settleNo).toBe(20);
    expect(feeEventLeft(g.run)).toBe(0);
    expect(feeRate(g, 50)).toBeCloseTo(0.0001, 12);
    settleOnce(g, 3);
    expect(feeRate(g, 50)).toBeCloseTo(0.0001, 12); // 다시 무료가 되지 않는다
  });
  it('무료인 동안: 들어갈 때·나올 때 한 푼도 안 낸다. 청산가는 수수료가 있을 때와 같다(시세·청산 공식은 건드리지 않는다)', () => {
    const paid = trader();
    A(paid, { type: 'open', market: 'DTC', dir: 1, lev: 50, margin: 50_000 });
    const liqPaid = liqPrice(paid.run.positions.DTC);
    act1(true);
    const g = trader();
    const cash0 = g.run.cash;
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 50, margin: 50_000 }).ok).toBe(true);
    const p = g.run.positions.DTC;
    expect(p.feesPaid).toBe(0);
    expect(g.run.cash).toBe(cash0 - 50_000);
    expect(exitFee(p)).toBe(0);
    expect(liqPrice(p)).toBe(liqPaid);
    expect(g.run.stats.eventNotional).toBe(2_500_000); // 끝날 때 "아낀 수수료"를 셈할 크기
    tickN(g, 3);
    expect(A(g, { type: 'close', market: 'DTC' }).ok).toBe(true);
    expect(g.run.cash).toBe(cash0); // 시세가 그대로면 본전: 수수료가 없다
  });
  it('전부 걸기: 수수료 몫을 떼지 않고 가진 돈 전부가 증거금이 된다', () => {
    act1(true);
    const g = trader();
    g.run.cash = 80_000;
    A(g, { type: 'open', market: 'DTC', dir: -1, lev: 200, marginPct: 100 });
    expect(g.run.positions.DTC.margin0).toBe(80_000);
    expect(g.run.cash).toBe(0);
  });
  it('끝난 뒤: 0.01%를 내고, 나무의 할인(A1·A4)은 거기서부터 붙는다. 0 이 되지는 않는다', () => {
    act1(true);
    const g = trader({ R: 1, A1: 30, A2: 1, A3a: 1, A4: 30 });
    g.run.settleNo = 20;
    const r = feeRate(g, 25);
    expect(r).toBeLessThan(0.0001 * 0.36);
    expect(r).toBeGreaterThan(0);
    const plain = trader();
    plain.run.settleNo = 20;
    const cash0 = plain.run.cash;
    A(plain, { type: 'open', market: 'DTC', dir: 1, lev: 50, margin: 50_000 });
    expect(plain.run.positions.DTC.feesPaid).toBe(250); // 250만 × 0.01%
    expect(plain.run.cash).toBe(cash0 - 50_250);
    expect(plain.run.stats.eventNotional ?? 0).toBe(0);
  });
  it('무료일 때 연 포지션에 이벤트가 끝난 뒤 추가 진입하면 그 몫은 지금 수수료율로 낸다(나올 때는 크기로 가중 평균)', () => {
    act1(true);
    const g = trader();
    g.run.settleNo = 19;
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 50_000 });
    settleOnce(g);
    expect(feeEventLeft(g.run)).toBe(0);
    const before = g.run.cash;
    expect(A(g, { type: 'add', market: 'DTC', margin: 50_000 }).ok).toBe(true);
    const p = g.run.positions.DTC;
    expect(before - g.run.cash).toBe(50_000 + 50); // 50만 × 0.01%
    expect(p.feeRate).toBeCloseTo(0.00005, 12); // 무료 몫과 0.01% 몫의 크기 가중 평균
    expect(exitFee(p)).toBe(50); // 100만 × 0.005%(가중 평균, U-46 수수료 0.01%)
  });
  it('비상금 주머니(C2)의 보험료는 이벤트 중에도 낸다(무료는 거래소 수수료만)', () => {
    act1(true);
    const g = trader({ R: 1, C1: 1, C2: 1 });
    expect(feeRate(g, 10)).toBeCloseTo(0.0001, 12);
  });
  it('생마다 다시 시작한다: 새 생의 정산 번호는 0 이다', () => {
    act1(true);
    const g = trader();
    g.run.settleNo = 25;
    expect(feeEventLeft(g.run)).toBe(0);
    const next = bare();
    expect(next.run.settleNo).toBe(0);
    expect(feeEventLeft(next.run)).toBe(20);
  });
});

describe('빚 없는 생을 이어 간 끝 (U-40)', () => {
  it('도토리 100만을 쥐고 닫으면 「백만 도토리의 아침」', () => {
    act1(true);
    expect(specialEndings.map((e) => e.id)).toContain('END-R04');
    const g = bare();
    for (const id of Object.keys(g.run.debts)) g.run.debts[id as keyof typeof g.run.debts].principal = 0;
    g.run.stats['repaid.shark1'] = 300_000;
    g.run.cash = 999_999;
    const h = JSON.parse(JSON.stringify(g)) as GameState;
    expect(retireAct1(g).ok).toBe(true);
    expect(g.pendingEnding!.id).toBe('END-R01');
    h.run.cash = 1_000_000;
    expect(retireAct1(h).ok).toBe(true);
    expect(h.pendingEnding!.id).toBe('END-R04');
  });
});

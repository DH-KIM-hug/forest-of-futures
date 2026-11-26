import { describe, it, expect } from 'vitest';
import { A, bare, giveCoinValue, giveWheel, noDebts, openFutures, tapN, tickN } from './helpers';
import { futuresGate, tradeGate } from '../../src/engine/progression';
import { levCapNow, waiverAvailable } from '../../src/engine/futures';
import { stage } from '../../src/engine/selectors';

function ready() {
  const g = bare();
  giveWheel(g, 'DTC');
  g.run.minedValue = 50000;
  g.run.cash = 100000;
  return g;
}
function learn(g: ReturnType<typeof bare>) {
  for (let i = 0; i < 3; i++) A(g, { type: 'eduPage' });
  A(g, { type: 'mockTrade' });
}

describe('B. 선물 계좌 개설과 배율 상한 (M2)', () => {
  it('AC-v2-18 누적 채굴 49,999 면 개설 버튼이 없고 조건 첫 줄이 미충족, 50,000 + 예탁금이면 버튼이 생긴다', () => {
    const g = ready();
    g.run.minedValue = 49999;
    const a = futuresGate(g);
    expect(a.buttonVisible).toBe(false);
    expect(a.conditions[0]).toMatchObject({ id: 'mined', met: false, current: 49999, need: 50000 });
    expect(A(g, { type: 'openAccount' }).ok).toBe(false);
    g.run.minedValue = 50000;
    expect(futuresGate(g).buttonVisible).toBe(true);
    expect(futuresGate(g).conditions[0].met).toBe(true);
  });

  it('AC-v2-19 사전교육 3장 + 모의거래 1회 뒤 개설: 현금은 줄지 않고 단계 2, 상한 10, open_account. 모의거래 손익은 현금에 안 들어간다', () => {
    const g = ready();
    expect(A(g, { type: 'openAccount' }).code).toBe('edu');
    const c0 = g.run.cash;
    learn(g);
    expect(g.run.cash).toBe(c0);
    expect(A(g, { type: 'eduPage' }).ok).toBe(false);
    expect(A(g, { type: 'openAccount' }).ok).toBe(true);
    expect(g.run.cash).toBe(c0);
    expect(stage(g.run)).toBe(2);
    expect(g.run.futures.levCap).toBe(10);
    expect(g.run.eventLog.some((e) => e.kind === 'open_account')).toBe(true);
  });

  it('AC-v2-20 현금 + 지갑 29,999 면 "예탁금이 확인되지 않습니다"로 거절, 30,000 이면 열린다', () => {
    const g = ready();
    learn(g);
    g.run.cash = 29999;
    const r = A(g, { type: 'openAccount' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('deposit');
    expect(r.msg).toBe('예탁금이 확인되지 않습니다.');
    g.run.cash = 20000;
    giveCoinValue(g, 'DTC', 10000);
    expect(A(g, { type: 'openAccount' }).ok).toBe(true);
  });

  it('AC-v2-21 개설 직후 25배 이상은 잠김, 끝난 거래 3건(청산 포함) 뒤 50배, 10건 + 확인서 도장 뒤 200배(waiver)', () => {
    const g = ready();
    learn(g);
    A(g, { type: 'openAccount' });
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 25, margin: 1000 }).code).toBe('cap');
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 1000 }).ok).toBe(true);
    A(g, { type: 'close', market: 'DTC' });
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 1000 });
    A(g, { type: 'close', market: 'DTC' });
    expect(levCapNow(g.run)).toBe(10);
    // 청산도 끝난 거래로 센다
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 1000 });
    tickN(g, 1, { DTC: g.run.refPrice.DTC * 0.5 });
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.futures.closedTrades).toBe(3);
    expect(levCapNow(g.run)).toBe(50);
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 100, margin: 1000 }).code).toBe('cap');
    g.run.futures.closedTrades = 9;
    expect(waiverAvailable(g.run)).toBe(false);
    expect(A(g, { type: 'signWaiver' }).ok).toBe(false);
    g.run.futures.closedTrades = 10;
    expect(waiverAvailable(g.run)).toBe(true);
    expect(levCapNow(g.run)).toBe(50);
    expect(A(g, { type: 'signWaiver' }).ok).toBe(true);
    expect(levCapNow(g.run)).toBe(200);
    expect(g.run.eventLog.some((e) => e.kind === 'waiver')).toBe(true);
  });

  it("AC-v2-22 기질 '한 방 체질': 계좌를 열면 상한 50, 배율 기본값 50", () => {
    const g = ready();
    g.family.traits = ['onehit'];
    learn(g);
    A(g, { type: 'openAccount' });
    expect(levCapNow(g.run)).toBe(50);
    expect(g.run.futures.defaultLev).toBe(50);
  });

  it('AC-v2-115(일부) 집안 내력 2단계: 계좌를 열면 상한 200', () => {
    const g = ready();
    g.family.tree.nerve = 2;
    learn(g);
    A(g, { type: 'openAccount' });
    expect(levCapNow(g.run)).toBe(200);
  });

  it('AC-v2-23 단계 2 에서 종목 쳇바퀴가 전부 압류되면 탭은 거절되고(줍기 없음) 선물 계좌는 그대로', () => {
    const g = ready();
    learn(g);
    A(g, { type: 'openAccount' });
    expect(stage(g.run)).toBe(2);
    delete g.run.coinWheels.DTC;
    expect(stage(g.run)).toBe(0);
    const c0 = g.run.cash;
    expect(A(g, { type: 'tap' })).toMatchObject({ ok: false, code: 'nowheel' });
    expect(g.run.cash - c0).toBe(0);
    expect(g.run.futures.open).toBe(true);
  });

  it('AC-v2-24 거래 탭: 단계 0 은 자물쇠, 단계 1 은 읽기 전용 + 조건 3줄, 단계 2 는 주문', () => {
    const g = bare();
    expect(tradeGate(g)).toMatchObject({ mode: 'locked', text: '쳇바퀴가 있어야 시세가 보입니다' });
    giveWheel(g, 'DTC');
    const t1 = tradeGate(g);
    expect(t1.mode).toBe('readonly');
    expect(t1.conditions.map((c) => c.id)).toEqual(['mined', 'deposit', 'edu']);
    expect(t1.conditions.every((c) => typeof c.current === 'number' && typeof c.need === 'number')).toBe(true);
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 1000 }).ok).toBe(false); // 주문 버튼 없음
    openFutures(g);
    expect(tradeGate(g).mode).toBe('orders');
    void noDebts;
    void tapN;
  });
});

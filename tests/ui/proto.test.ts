// 시제품(?proto=1) 읽기 모델과, 시제품이 부르는 행동만으로 한 바퀴(쳇바퀴 → 추심원 → 대출·폰 → 알바 → 튜토리얼 청산 → 두 번째 대출 → 파산 → 환생)가 도는지 시험.
import { describe, expect, it } from 'vitest';
import { A, fresh, settleOnce, tapN, tickN } from '../engine/helpers';
import { claim, currentGoal, goalAt, hamsterMath, homeSummary, lifeNo, maxWheels, officeOffer, perSec, perSettle, slots, TUT, tutorialPrice } from '../../src/ui/proto/model';
import { balance } from '../../src/engine/data';
import { processPrice } from '../../src/engine/futures';
import { interestDue, nextBorrowRate } from '../../src/engine/selectors';

const F0 = { everOpened: false, waiting: false, loanTaken: false };

describe('시제품 읽기 모델 (U-29·U-30)', () => {
  it('처음: 엄마의 쳇바퀴 한 줄과 빈 자리 한 줄. 폰이 없어 알바를 못 부르고, 돈이 없어 쳇바퀴도 못 놓는다', () => {
    const g = fresh();
    const rows = slots(g);
    expect(rows.map((r) => r.kind)).toEqual(['first', 'empty']);
    expect(rows[0].action).toBe('hire');
    expect(rows[0].canAct).toBe(false);
    expect(rows[1].canAct).toBe(false);
    expect(rows[1].name).toContain(`${maxWheels() - 1}칸`);
    expect(claim(g)).toEqual({ interest: 4500, living: 1000, total: 5500 });
    expect(perSettle(g)).toBe(-5500);
    expect(homeSummary(g)).toMatchObject({ idle: 0, hamsters: 0, claim: 5500 });
    expect(A(g, { type: 'hire', coin: 'DTC' }).code).toBe('nophone');
  });
  it('목표 사슬: 이자 벌기 → 사무소에서 빌리기 → 알바 부르기 → 첫 포지션 → 첫 상환', () => {
    const g = fresh();
    expect(currentGoal(g, 0, F0)).toBe(0);
    expect(goalAt(g, 0, F0)).toMatchObject({ need: 5500, cur: 0, done: false });
    expect(currentGoal(g, 0, { ...F0, waiting: true })).toBe(1); // 추심원이 기다리면 다음 목표는 사무소
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    expect(currentGoal(g, 0, F0)).toBe(2);
    A(g, { type: 'hire', coin: 'DTC' });
    expect(currentGoal(g, 0, F0)).toBe(3);
    expect(currentGoal(g, 0, { ...F0, everOpened: true })).toBe(4);
  });
  it('빌린 뒤: 알바를 부르면 줄에 초당 수입이 뜨고, 쳇바퀴를 놓으면 줄이 는다. 값과 일당은 대수와 무관', () => {
    const g = fresh();
    expect(officeOffer(g)).toMatchObject({ lend: 100000, ratePct: 4 });
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    expect(interestDue(g, 'shark1')).toBe(8500);
    const hm = hamsterMath(g);
    expect(hm).toEqual({ sold: 6467, wage: 1800, net: 4667 });
    expect(A(g, { type: 'hire', coin: 'DTC' }).ok).toBe(true);
    expect(slots(g)[0]).toMatchObject({ staffed: true, net: 4667, action: null });
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(true);
    let rows = slots(g);
    expect(rows.map((r) => r.kind)).toEqual(['first', 'wheel', 'empty']);
    expect(rows[1]).toMatchObject({ staffed: false, action: 'hire', canAct: true, net: null });
    expect(A(g, { type: 'hire', uid: rows[1].uid! }).ok).toBe(true);
    rows = slots(g);
    expect(rows[2].btnSub).toBe('50,000'); // 두 번째도 같은 값
    expect(homeSummary(g)).toMatchObject({ idle: 9335, hamsters: 2, claim: 9500 });
    // 초당 환산은 지금 정산 간격을 쓴다
    expect(perSec(9335)).toBeCloseTo(9335 / balance.settlement.intervalSec, 9);
  });
  it('쳇바퀴가 실려 가면 다시 사는 줄이 생긴다', () => {
    const g = fresh();
    g.run.coinWheels = {};
    g.run.riding = null;
    const rows = slots(g);
    expect(rows.map((r) => r.kind)).toEqual(['lost']);
    expect(rows[0]).toMatchObject({ action: 'rebuy', canAct: false });
    expect(A(g, { type: 'tap' }).code).toBe('nowheel');
  });
});

describe('튜토리얼 거래 (U-31): 짜 둔 시세는 고른 쪽의 반대로만 간다', () => {
  for (const dir of [1, -1] as const) {
    it(`${dir === 1 ? '롱' : '숏'}을 골라도 ${TUT.maxSteps}걸음 안에 엔진이 청산한다`, () => {
      const g = fresh();
      A(g, { type: 'borrow', lender: 'shark1' });
      A(g, { type: 'openAccount', sponsor: true });
      const cash0 = g.run.cash;
      expect(A(g, { type: 'open', market: TUT.market, dir, lev: TUT.lev, margin: TUT.margin, sl: null, tp: null }).ok).toBe(true);
      const real = g.run.prices[TUT.market];
      let k = 0;
      while (g.run.positions[TUT.market] && k < TUT.maxSteps) {
        k += 1;
        const px = tutorialPrice(real, dir, k);
        expect(dir === 1 ? px < real : px > real).toBe(true);
        g.run.prices[TUT.market] = px;
        processPrice(g, TUT.market, px);
      }
      expect(g.run.positions[TUT.market]).toBeUndefined();
      expect(g.run.lastClose?.liq).toBe(true);
      expect(k).toBeLessThanOrEqual(TUT.maxSteps);
      expect(g.run.over).toBe(false); // 쳇바퀴가 있으니 그 자리에서 파산하지 않는다
      expect(cash0 - g.run.cash).toBeGreaterThanOrEqual(TUT.margin); // 넣은 돈(과 수수료)만 잃는다
      expect(cash0 - g.run.cash).toBeLessThan(TUT.margin + 500);
      console.log(`튜토리얼 ${dir === 1 ? '롱' : '숏'}: ${k}걸음(${(k * TUT.stepMs) / 1000}초)에 청산, 잃은 돈 ${Math.round(cash0 - g.run.cash)}`);
      // 두 번째 대출은 더 높은 금리
      expect(nextBorrowRate(g, 'shark1')).toBe(0.08);
      A(g, { type: 'borrow', lender: 'shark1' });
      expect(g.run.debts.shark1.principal).toBe(500000);
      expect(interestDue(g, 'shark1')).toBe(16500);
    });
  }
});

describe('시제품 한 바퀴', () => {
  it('쳇바퀴 -> 못 낸 이자 -> 대출·폰 -> 알바 -> 포지션 -> 청산 -> 파산 -> 환생', () => {
    const g = fresh(7);
    expect(lifeNo(g)).toBe(1);
    tapN(g, 60);
    expect(g.run.cash).toBeLessThan(claim(g).total);
    expect(A(g, { type: 'borrow', lender: 'shark1' }).ok).toBe(true);
    expect(A(g, { type: 'openAccount', sponsor: true }).ok).toBe(true);
    settleOnce(g);
    expect(g.run.debts.shark1.overdue).toBe(0);
    expect(A(g, { type: 'hire', coin: 'DTC' }).ok).toBe(true);
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(true);
    const r = A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, marginPct: 100, sl: null, tp: null });
    expect(r.ok).toBe(true);
    g.run.prices.DTC = g.run.refPrice.DTC * 0.8; // 급락 -> 10배 롱 청산
    tickN(g, 1, { DTC: g.run.prices.DTC });
    expect(Object.keys(g.run.positions)).toHaveLength(0);
    let n = 0;
    while (!g.run.over && n < 40) { settleOnce(g); n++; }
    expect(g.run.over).toBe(true);
    console.log('청산 뒤 파산까지 정산 횟수', n);
    expect(g.estate?.step).toBe('card');
    expect(A(g, { type: 'estateNext' }).ok).toBe(true);
    expect(A(g, { type: 'inherit', branch: 'renounce' }).ok).toBe(true);
    expect(g.estate?.step).toBe('tree');
    expect(A(g, { type: 'nextGeneration' }).ok).toBe(true);
    expect(g.run.over).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { A, bare, fresh, giveCoinValue, giveEquip, giveWheel, noDebts, settleOnce, tickN } from './helpers';
import { interestDue, netWorth, ownedCoins, stage } from '../../src/engine/selectors';
import { timeOfDay } from '../../src/engine/util';
import { balance } from '../../src/engine/data';

describe('A. 시작·시간·정산', () => {
  it('AC-v2-01 시작 상태(U-29): 현금 0, 엄마 빚 30만은 전부 오소리(옛 이자 1.5%), 엄마의 도토코인 쳇바퀴 한 대', () => {
    const g = fresh();
    expect(g.family.generation).toBe(2);
    expect(g.run.cash).toBe(0);
    expect(g.run.debts.shark1.principal).toBe(300000);
    expect(g.run.debts.capital.principal + g.run.debts.bank.principal + g.run.debts.shark2.principal + g.run.debts.tax.principal).toBe(0);
    expect(g.run.debts.shark1).toMatchObject({ inherited: 300000, rateCap: 0.015 });
    expect(interestDue(g, 'shark1')).toBe(4500); // 물려받은 300,000 × 옛 이자 1.5%
    expect(g.run.house).toBe(0);
    expect(stage(g.run)).toBe(1);
    expect(ownedCoins(g.run)).toEqual(['DTC']);
    expect(g.run.coinWheels.DTC).toEqual({ on: true, autoSell: true, tagBy: null });
    expect(g.run.riding).toBe('DTC');
    expect(g.run.equipment).toHaveLength(0);
    expect(g.run.futures.open).toBe(false);
    expect(g.family.han).toBe(0);
  });

  it('AC-v2-02 180틱마다 정산이 정확히 1번', () => {
    const g = fresh();
    tickN(g, 179);
    expect(g.run.settleNo).toBe(0);
    tickN(g, 1);
    expect(g.run.settleNo).toBe(1);
    tickN(g, 179);
    expect(g.run.settleNo).toBe(1);
    tickN(g, 1);
    expect(g.run.settleNo).toBe(2);
  });

  it('AC-v2-03 하루 = 정산 4회: 아침 -> 낮 -> 저녁 -> 밤 -> 아침', () => {
    const g = fresh();
    g.run.cash = 1000000; // 이자를 낼 수 있어야 네 번을 버틴다
    const seen = [timeOfDay(g.run)];
    for (let i = 0; i < 4; i++) {
      settleOnce(g);
      seen.push(timeOfDay(g.run));
    }
    expect(seen).toEqual([0, 1, 2, 3, 0]);
    expect(balance.settlement.dayLabels).toEqual(['아침', '낮', '저녁', '밤']);
  });

  it('AC-v2-04 첫 정산(가만히 두면): 오소리 이자 4,500 을 못 내 원금에 얹히고 연체 1, 생활비 1,000 은 캐피탈 비상금으로', () => {
    const g = fresh();
    settleOnce(g);
    expect(g.run.cash).toBe(0);
    expect(g.run.lastSettlement).toMatchObject({ interest: 4500, living: 1000, paid: 0, unpaid: 5500 });
    expect(g.run.debts.shark1).toMatchObject({ principal: 304500, inherited: 300000, overdue: 1 });
    expect(interestDue(g, 'shark1')).toBe(4680); // 300,000 × 1.5% + 얹힌 4,500 × 4%
    expect(g.run.debts.capital).toMatchObject({ principal: 1000, overdue: 0 });
    expect(g.run.coinWheels.DTC.tagBy).toBe('shark1'); // 가압류 딱지
  });

  it('AC-v2-04 현금이 있으면: 이자 4,500 + 생활비 1,000 이 빠지고 연체 없음', () => {
    const g = fresh();
    g.run.cash = 100000;
    settleOnce(g);
    expect(g.run.cash).toBe(94500);
    expect(g.run.lastSettlement).toMatchObject({ interest: 4500, living: 1000, unpaid: 0, wages: 0, quit: 0 });
    expect(Object.values(g.run.debts).every((d) => d.overdue === 0)).toBe(true);
  });

  it('AC-v2-04 납부 순서: 독사 -> 오소리 -> 캐피탈 -> 조합 -> 세무서 -> 생활비', () => {
    const g = bare(); // 오소리 15만 + 캐피탈 15만
    g.run.cash = 6500; // 오소리 6,000 전부, 캐피탈 500 만 낼 수 있다
    settleOnce(g);
    expect(g.run.debts.shark1.overdue).toBe(0);
    expect(g.run.debts.capital.overdue).toBe(1);
    expect(g.run.cash).toBe(0);
    // 못 낸 이자 2,500 은 원금에 더해진다. 생활비(빈 오두막)는 캐피탈 비상금으로
    expect(g.run.debts.capital.principal).toBe(150000 + 2500 + 1000);
  });

  it('AC-v2-05 빈 오두막, 현금 0, 빚 0: 캐피탈 원금 +1,000 이고 연체 없음', () => {
    const g = fresh();
    g.run.cash = 0;
    noDebts(g);
    settleOnce(g);
    expect(g.run.debts.capital.principal).toBe(1000);
    expect(Object.values(g.run.debts).every((d) => d.overdue === 0)).toBe(true);
    expect(g.run.upkeepOverdue).toBe(0);
  });

  it('AC-v2-06 통나무집, 현금 0, 빚 0: 생활비 8,000 을 3번 못 내 UPKEEP 파산', () => {
    const g = fresh();
    g.run.cash = 0;
    g.run.house = 1;
    noDebts(g);
    settleOnce(g, 2);
    expect(g.run.over).toBe(false);
    expect(g.run.upkeepOverdue).toBe(2);
    settleOnce(g);
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy?.cause).toBe('UPKEEP');
  });

  it('AC-v2-07 밤에는 조합이 닫혀 도장이 거절되고 closed:bank, 다른 곳은 된다', () => {
    const g = bare();
    g.run.house = 1;
    g.run.debts.bank.principal = 100000;
    g.run.cash = 500000;
    settleOnce(g, 3);
    expect(timeOfDay(g.run)).toBe(3);
    const r = A(g, { type: 'stamp', lender: 'bank' });
    expect(r.ok).toBe(false);
    expect(g.run.eventLog[g.run.eventLog.length - 1].kind).toBe('closed:bank');
    expect(A(g, { type: 'stamp', lender: 'capital' }).ok).toBe(true);
    expect(A(g, { type: 'stamp', lender: 'shark1' }).ok).toBe(true);
    g.run.shark2Open = true;
    g.run.debts.shark2.principal = 100000;
    expect(A(g, { type: 'stamp', lender: 'shark2' }).ok).toBe(true);
    expect(A(g, { type: 'borrow', lender: 'bank' }).ok).toBe(false);
    settleOnce(g); // 아침
    expect(A(g, { type: 'stamp', lender: 'bank' }).ok).toBe(true);
  });

  it('AC-v2-08 순자산 = 현금 + 지갑 + 설비 80% + 집 평가액 × 0.9 − 총부채', () => {
    const g = fresh();
    g.run.cash = 1000000;
    g.run.house = 1;
    giveEquip(g, 'wheel2', 'DTC', 100000, false);
    giveCoinValue(g, 'DTC', 200000);
    // 쳇바퀴(엄마의 도토코인 쳇바퀴 10,000)도 80% 로 친다
    expect(netWorth(g.run)).toBeCloseTo(1000000 + 200000 + 80000 + 8000 + 450000 - 300000, 4);
    void giveWheel;
  });
});

import { describe, it, expect } from 'vitest';
import { A, bare, fresh, giveEquip, giveWheel, noDebts, settleOnce, tickN } from './helpers';
import { fundedByAt } from '../../src/engine/loans';
import { interestDue, nextBorrowRate } from '../../src/engine/selectors';
import { lenderById } from '../../src/engine/data';
import { acceptOffer } from '../../src/engine/offers';

describe('E. 빚·도장·제안', () => {
  it('AC-v2-57 캐피탈 원금 150,000, 텐트(한도 200,000): [빌리기 +5만] 은 되고 한 번 더는 거절', () => {
    const g = bare();
    const c0 = g.run.cash;
    expect(A(g, { type: 'borrow', lender: 'capital' }).ok).toBe(true);
    expect(g.run.cash - c0).toBe(50000);
    expect(g.run.debts.capital.principal).toBe(200000);
    const r = A(g, { type: 'borrow', lender: 'capital' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('limit');
    expect(g.run.debts.capital.principal).toBe(200000);
  });

  it('AC-v2-58 독사: 20만을 빌리면 현금 +120,000, 원금 +200,000, 떼인 선이자 80,000. 두 번째는 연락처 동의가 필요', () => {
    const g = bare();
    g.run.shark2Open = true;
    const c0 = g.run.cash;
    const r = A(g, { type: 'borrow', lender: 'shark2' });
    expect(r.ok).toBe(true);
    expect(g.run.cash - c0).toBe(120000);
    expect(g.run.debts.shark2.principal).toBe(200000);
    expect(g.run.stats.upfrontPaid).toBe(80000);
    const r2 = A(g, { type: 'borrow', lender: 'shark2' });
    expect(r2.code).toBe('consent');
    expect(g.run.debts.shark2.principal).toBe(200000);
    expect(A(g, { type: 'borrow', lender: 'shark2', consent: true }).ok).toBe(true);
    expect(g.run.stats.contacts).toBe(true);
  });

  it('독사 골목은 처음엔 닫혀 있고 총부채 50만이 되면 열린다', () => {
    const g = bare();
    expect(A(g, { type: 'borrow', lender: 'shark2' }).code).toBe('locked');
    A(g, { type: 'borrow', lender: 'capital' }); // 총부채 35만
    g.run.debts.shark1.principal += 150000; // 50만
    A(g, { type: 'tap' });
    expect(g.run.shark2Open).toBe(true);
  });

  it('AC-v2-59 집이 없으면 조합 대출은 거절, bankRefusals +1, refused:bank', () => {
    const g = bare();
    const r = A(g, { type: 'borrow', lender: 'bank' });
    expect(r.ok).toBe(false);
    expect(g.run.stats.bankRefusals).toBe(1);
    expect(g.run.eventLog[g.run.eventLog.length - 1].kind).toBe('refused:bank');
    expect(g.run.debts.bank.principal).toBe(0);
  });

  it('AC-v2-60 오소리 도장: x1 은 -10,000, 전액은 min(현금, 원금), 원금 0 이면 완납', () => {
    const g = bare();
    g.run.cash = 50000;
    A(g, { type: 'stamp', lender: 'shark1' });
    expect(g.run.cash).toBe(40000);
    expect(g.run.debts.shark1.principal).toBe(140000);
    A(g, { type: 'stamp', lender: 'shark1', mult: 'all' });
    expect(g.run.cash).toBe(0);
    expect(g.run.debts.shark1.principal).toBe(100000);
    g.run.cash = 500000;
    const r = A(g, { type: 'stamp', lender: 'shark1', mult: 'all' });
    expect(r.cleared).toBe(true);
    expect(g.run.debts.shark1.principal).toBe(0);
    expect(A(g, { type: 'stamp', lender: 'shark1' }).ok).toBe(false);
  });

  it('AC-v2-60 x10 칩은 도장 10번 몫', () => {
    const g = bare();
    g.run.cash = 500000;
    A(g, { type: 'stamp', lender: 'shark1', mult: 10 });
    expect(g.run.debts.shark1.principal).toBe(50000);
  });

  it('AC-v2-61 빌리고 59초 뒤 진입이면 fundedBy 캐피탈, 61초 뒤면 없다', () => {
    const g = bare();
    A(g, { type: 'borrow', lender: 'capital' });
    tickN(g, 59);
    expect(fundedByAt(g)).toBe('capital');
    tickN(g, 2);
    expect(fundedByAt(g)).toBeNull();
  });

  it('AC-v2-62 독사에게 이자 미루기를 2번 쓰면 세 번째는 거절되고 rollover_refused', () => {
    const g = bare();
    g.run.shark2Open = true;
    g.run.debts.shark2.principal = 200000;
    expect(A(g, { type: 'rollover', lender: 'shark2' }).ok).toBe(true);
    expect(A(g, { type: 'rollover', lender: 'shark2' }).ok).toBe(true);
    const r = A(g, { type: 'rollover', lender: 'shark2' });
    expect(r.ok).toBe(false);
    expect(g.run.eventLog[g.run.eventLog.length - 1].kind).toBe('rollover_refused');
    expect(g.run.stats.rollovers).toBe(2);
  });

  it('이자 미루기는 이번 이자를 연체로 치지 않고 원금에 +10% 얹는다(오소리는 횟수 제한 없음)', () => {
    const g = bare();
    g.run.cash = 0;
    A(g, { type: 'rollover', lender: 'shark1' });
    A(g, { type: 'rollover', lender: 'shark1' });
    A(g, { type: 'rollover', lender: 'shark1' });
    settleOnce(g);
    expect(g.run.debts.shark1.principal).toBe(150000 + 6600);
    expect(g.run.debts.shark1.overdue).toBe(0);
    expect(g.run.debts.capital.overdue).toBe(1);
  });

  it('AC-v2-63 족제비의 반값 제안: 그 대출의 이자는 3회 동안 절반, 4~6회는 2배', () => {
    const g = bare();
    g.run.offers = [{ id: 'promo', from: 0, by: 'capital' }];
    const c0 = g.run.cash;
    expect(acceptOffer(g, 'promo').ok).toBe(true);
    expect(g.run.cash - c0).toBe(50000);
    expect(g.run.debts.capital.principal).toBe(200000);
    const rate = 0.02;
    const normal = 150000 * rate;
    const seq: number[] = [];
    for (let i = 0; i < 8; i++) {
      seq.push(interestDue(g, 'capital'));
      g.run.promos.capital.forEach((p) => (p.n += 1));
    }
    expect(seq).toEqual([normal + 500, normal + 500, normal + 500, normal + 2000, normal + 2000, normal + 2000, 4000, 4000]);
  });

  it('AC-v2-64 금리 인상 사건 중엔 모든 이자가 2배(기질 서류 체질이면 2.5배)', () => {
    const g = bare();
    expect(interestDue(g, 'shark1')).toBe(6000);
    g.run.effects.push({ id: 'rate_hike', type: 'rateMultiplier', multiplier: 2, remaining: 2 });
    expect(interestDue(g, 'shark1')).toBe(12000);
    settleOnce(g);
    expect(g.run.lastSettlement!.interest).toBe(18000);
    const h = bare();
    h.family.traits = ['paperwork'];
    h.run.effects.push({ id: 'rate_hike', type: 'rateMultiplier', multiplier: 2, remaining: 2 });
    expect(interestDue(h, 'shark1')).toBe(15000);
  });

  it('AC-v2-65 세금 빚 210,000, 기한 8회째 현금 50,000: 5만을 내고 남은 16만만큼 비싼 설비부터 공매', () => {
    const g = bare();
    noDebts(g);
    g.run.debts.tax.principal = 210000;
    g.run.taxDueIn = 1;
    g.run.cash = 50000;
    giveWheel(g, 'DTC');
    giveEquip(g, 'wheel2', 'DTC', 20000, false);
    giveEquip(g, 'generator', 'DTC', 400000, false);
    settleOnce(g);
    expect(g.run.stats.soldForTax).toBe(1); // 발전기 한 대(200,000)면 충분
    expect(g.run.equipment.map((u) => u.tier)).toEqual(['wheel2']);
    expect(g.run.debts.tax.principal).toBe(0);
    expect(g.run.taxDueIn).toBeNull();
    expect(g.run.cash).toBe(200000 - 160000); // 공매 대금에서 세금을 내고 남은 돈
    expect(g.run.debts.capital.principal).toBe(1000); // 생활비는 캐피탈 비상금
  });

  it('AC-v2-65 공매로도 모자라면 캐피탈 원금으로 넘어간다', () => {
    const g = bare();
    noDebts(g);
    g.run.debts.tax.principal = 210000;
    g.run.taxDueIn = 1;
    g.run.cash = 50000;
    giveWheel(g, 'DTC');
    giveEquip(g, 'wheel2', 'DTC', 20000, false);
    settleOnce(g);
    expect(g.run.stats.soldForTax).toBe(1);
    expect(g.run.equipment).toHaveLength(0);
    expect(g.run.debts.tax.principal).toBe(0);
    expect(g.run.debts.capital.principal).toBe(160000 - 10000 + 1000);
  });

  it('세금은 기한 전에는 청구되지 않고 기한이 다가오면 줄어든다', () => {
    const g = bare();
    g.run.debts.tax.principal = 210000;
    g.run.taxDueIn = 8;
    settleOnce(g);
    expect(g.run.taxDueIn).toBe(7);
    expect(g.run.debts.tax.principal).toBe(210000);
    expect(A(g, { type: 'stamp', lender: 'tax' }).ok).toBe(true);
    expect(g.run.debts.tax.principal).toBe(200000);
  });

  it('U-31 오소리는 같은 생의 두 번째 대출부터 8%: 그 10만은 따로 적혀(tranche) 제 금리로 이자가 붙는다', () => {
    const g = bare(); // 오소리 15만(4%)
    expect(lenderById.shark1).toMatchObject({ rate: 0.04, repeatRate: 0.08 });
    expect(nextBorrowRate(g, 'shark1')).toBe(0.04);
    expect(A(g, { type: 'borrow', lender: 'shark1' }).ok).toBe(true);
    expect(g.run.stats['borrow.shark1']).toBe(1);
    expect(g.run.debts.shark1.principal).toBe(250000);
    expect(g.run.debts.shark1.tranches ?? []).toEqual([]); // 첫 대출은 보통 금리라 따로 적지 않는다
    expect(interestDue(g, 'shark1')).toBe(10000); // 250,000 × 4%
    expect(nextBorrowRate(g, 'shark1')).toBe(0.08);
    expect(A(g, { type: 'borrow', lender: 'shark1' }).ok).toBe(true);
    expect(g.run.debts.shark1.principal).toBe(350000);
    expect(g.run.debts.shark1.tranches).toEqual([{ amount: 100000, rate: 0.08 }]);
    expect(interestDue(g, 'shark1')).toBe(18000); // 250,000 × 4% + 100,000 × 8%
    expect(A(g, { type: 'borrow', lender: 'shark1' }).ok).toBe(true); // 세 번째도 8%
    expect(interestDue(g, 'shark1')).toBe(26000);
    expect(g.run.debts.shark1.tranches!.reduce((a, t) => a + t.amount, 0)).toBe(200000);
  });

  it('U-31 도장은 비싼 몫부터: 두 번째 대출 뒤 10,000 을 갚으면 이자가 800 줄고, 8% 몫이 다 없어진 뒤에야 4% 몫이 준다', () => {
    const g = bare();
    g.run.cash = 0;
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'borrow', lender: 'shark1' });
    expect(interestDue(g, 'shark1')).toBe(18000);
    expect(A(g, { type: 'stamp', lender: 'shark1' })).toMatchObject({ ok: true, paid: 10000 });
    expect(g.run.debts.shark1.tranches).toEqual([{ amount: 90000, rate: 0.08 }]);
    expect(interestDue(g, 'shark1')).toBe(17200); // −800
    expect(A(g, { type: 'stamp', lender: 'shark1', mult: 10 })).toMatchObject({ ok: true, paid: 100000 });
    expect(g.run.debts.shark1.tranches ?? []).toEqual([]); // 8% 몫 90,000 이 먼저, 나머지 10,000 은 4% 몫에서
    expect(g.run.debts.shark1.principal).toBe(240000);
    expect(interestDue(g, 'shark1')).toBe(9600); // 240,000 × 4%
    // 다 갚아도 이번 생의 다음 대출은 여전히 8%
    expect(nextBorrowRate(g, 'shark1')).toBe(0.08);
  });

  it('U-31 물려받은 몫(옛 이자)·새로 빌린 몫(4%)·두 번째 몫(8%)이 한 장부에: 갚는 순서는 8% -> 4% -> 물려받은 몫', () => {
    const g = fresh(); // 오소리 30만, 물려받은 몫 1.5%
    A(g, { type: 'borrow', lender: 'shark1' });
    expect(interestDue(g, 'shark1')).toBe(8500); // 4,500 + 4,000
    A(g, { type: 'borrow', lender: 'shark1' });
    expect(g.run.debts.shark1).toMatchObject({ principal: 500000, inherited: 300000 });
    expect(interestDue(g, 'shark1')).toBe(16500); // 4,500 + 4,000 + 8,000
    expect(A(g, { type: 'stamp', lender: 'shark1', mult: 10 })).toMatchObject({ paid: 100000 });
    expect(interestDue(g, 'shark1')).toBe(8500);
    expect(A(g, { type: 'stamp', lender: 'shark1', mult: 10 })).toMatchObject({ paid: 100000 });
    expect(g.run.debts.shark1).toMatchObject({ principal: 300000, inherited: 300000 });
    expect(interestDue(g, 'shark1')).toBe(4500);
    g.run.cash = 50000;
    A(g, { type: 'stamp', lender: 'shark1', mult: 'all' });
    expect(g.run.debts.shark1).toMatchObject({ principal: 250000, inherited: 250000 });
    expect(interestDue(g, 'shark1')).toBe(3750); // 250,000 × 1.5%
  });

  it('U-31 캐피탈·조합·독사에는 두 번째 대출 금리가 없다(빌린 횟수만 센다)', () => {
    for (const id of ['capital', 'bank', 'shark2'] as const) expect((lenderById[id] as { repeatRate?: number }).repeatRate).toBeUndefined();
    const g = bare();
    noDebts(g);
    A(g, { type: 'borrow', lender: 'capital' });
    A(g, { type: 'borrow', lender: 'capital' });
    expect(g.run.stats['borrow.capital']).toBe(2);
    expect(nextBorrowRate(g, 'capital')).toBe(0.02);
    expect(g.run.debts.capital.tranches ?? []).toEqual([]);
    expect(interestDue(g, 'capital')).toBe(2000); // 100,000 × 2%
    g.run.shark2Open = true;
    A(g, { type: 'borrow', lender: 'shark2' });
    expect(nextBorrowRate(g, 'shark2')).toBe(lenderById.shark2.rate);
    expect(g.run.debts.shark2.tranches ?? []).toEqual([]);
  });
});

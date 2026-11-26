import { describe, it, expect } from 'vitest';
import { A, bare, giveCoinValue, giveEquip, giveWheel, noDebts, setRatio, settleOnce } from './helpers';
import { depositMined } from '../../src/engine/mining';
import { ensureTag, garnishRate, seizeFor } from '../../src/engine/seizure';
import { checkLiquidationWipeout } from '../../src/engine/bankruptcy';
import { walletValueOf } from '../../src/engine/selectors';
import { tierById } from '../../src/engine/data';

/** 오소리만 연체가 되게 만든 판: 캐피탈 빚 0, 현금 0, 설비는 꺼 둔다(지갑이 비어 급매가 없다). */
function sharkOverdue() {
  const g = bare();
  g.run.cash = 0;
  g.run.debts.capital.principal = 0;
  giveWheel(g, 'DTC');
  const w2 = giveEquip(g, 'wheel2', 'DTC', 20000, false);
  const row = giveEquip(g, 'row', 'DTC', 150000, false);
  return { g, w2, row };
}

describe('F. 연체·가압류·압류·파산', () => {
  it('AC-v2-66 오소리 연체 1: 싼 설비(보조 쳇바퀴)에 딱지, 팔기 막힘, 수입 1,000어치 중 700만 지갑·원금 -300', () => {
    const { g, w2, row } = sharkOverdue();
    settleOnce(g);
    expect(g.run.debts.shark1.overdue).toBe(1);
    expect(w2.tagBy).toBe('shark1');
    expect(row.tagBy).toBeNull();
    expect(A(g, { type: 'sellEquip', uid: w2.uid }).ok).toBe(false);
    expect(g.run.eventLog[g.run.eventLog.length - 1].kind).toBe('sell_blocked'); // AC-v2-68
    const p0 = g.run.debts.shark1.principal;
    depositMined(g, 'DTC', 1000);
    expect(g.run.wallet.DTC.qty * g.run.refPrice.DTC).toBeCloseTo(700, 6);
    expect(p0 - g.run.debts.shark1.principal).toBe(300);
    expect(g.run.stats.garnished).toBe(300);
  });

  it('AC-v2-66 탭 수입도 30%가 원금에서 깎인다', () => {
    const { g } = sharkOverdue();
    settleOnce(g);
    const p0 = g.run.debts.shark1.principal;
    for (let i = 0; i < 100; i++) A(g, { type: 'tap' }); // 12 만 인정
    expect(g.run.wallet.DTC.qty * g.run.refPrice.DTC).toBeCloseTo(12 * 2 * 0.7, 6);
    expect(p0 - g.run.debts.shark1.principal).toBe(Math.floor(12 * 2 * 0.3));
  });

  it('AC-v2-67 캐피탈 연체 1, 같은 단계 설비가 두 종목에: 지금 순수입이 큰 종목의 것에 딱지', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveWheel(g, 'MDT');
    const a = giveEquip(g, 'helper', 'DTC', 60000);
    const b = giveEquip(g, 'helper', 'MDT', 60000);
    setRatio(g, 'DTC', 13290 / 14700); // 순수입 3,000
    setRatio(g, 'MDT', 18965 / 19110); // 순수입 5,000
    g.run.debts.capital.overdue = 1;
    ensureTag(g, 'capital');
    expect(b.tagBy).toBe('capital');
    expect(a.tagBy).toBeNull();
  });

  it('AC-v2-68 딱지 붙은 설비는 못 판다(sell_blocked)', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    const u = giveEquip(g, 'wheel2', 'DTC', 20000);
    u.tagBy = 'capital';
    expect(A(g, { type: 'sellEquip', uid: u.uid }).code).toBe('tagged');
    expect(g.run.equipment).toHaveLength(1);
    expect(g.run.eventLog.some((e) => e.kind === 'sell_blocked')).toBe(true);
  });

  it('AC-v2-69 연체가 한도(2)에 닿으면 지갑이 먼저(시가의 90%): 27,000 깎이고 쳇바퀴는 남는다. 다음엔 보조 쳇바퀴가 실려 가 -10,000', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 30000);
    const u = giveEquip(g, 'wheel2', 'DTC', 20000);
    g.run.debts.shark1.overdue = 2;
    const p0 = g.run.debts.shark1.principal;
    const r1 = seizeFor(g, 'shark1');
    expect(r1).toMatchObject({ what: 'wallet', value: 27000 });
    expect(g.run.debts.shark1.principal).toBe(p0 - 27000);
    expect(walletValueOf(g.run, 'DTC')).toBe(0);
    expect(g.run.equipment).toHaveLength(1);
    const r2 = seizeFor(g, 'shark1');
    expect(r2).toMatchObject({ what: 'equipment', id: u.uid, value: 10000 });
    expect(g.run.debts.shark1.principal).toBe(p0 - 37000);
    expect(g.run.equipment).toHaveLength(0);
  });

  it('AC-v2-69 정산에서: 한도에 닿으면 압류하고 연체는 한도 - 1 에 머문다', () => {
    const { g, w2 } = sharkOverdue();
    g.run.debts.shark1.overdue = 1;
    g.run.equipment.find((u) => u.uid === w2.uid)!.tagBy = 'shark1';
    settleOnce(g);
    expect(g.run.over).toBe(false);
    expect(g.run.debts.shark1.overdue).toBe(1);
    expect(g.run.equipment.map((u) => u.tier)).toEqual(['row']);
    expect(g.run.stats.assetsSeized).toBe(1);
    expect(g.run.stats.seized).toContain('wheel2');
    settleOnce(g);
    expect(g.run.equipment).toHaveLength(0); // 또 못 내면 또 하나
  });

  it('AC-v2-70 설비가 없고 쳇바퀴가 도토코인·밤더리움이면 싼 도토코인 쳇바퀴가 먼저 -5,000', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveWheel(g, 'BTH');
    const p0 = g.run.debts.shark1.principal;
    const r = seizeFor(g, 'shark1');
    expect(r).toMatchObject({ what: 'wheel', id: 'DTC', value: 5000 });
    expect(g.run.debts.shark1.principal).toBe(p0 - 5000);
    expect(Object.keys(g.run.coinWheels)).toEqual(['BTH']);
  });

  it('AC-v2-70 도토코인 쳇바퀴에 설비가 붙어 있으면 그 쳇바퀴보다 설비가 먼저', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveWheel(g, 'BTH');
    giveEquip(g, 'wheel2', 'DTC', 20000);
    const r = seizeFor(g, 'shark1');
    expect(r!.what).toBe('equipment');
    expect(g.run.coinWheels.DTC).toBeDefined();
  });

  it('AC-v2-71 연체 한도, 지갑 1,000 미만, 설비·종목 쳇바퀴 0 이면 파산(SHARK)', () => {
    const g = bare();
    g.run.cash = 0;
    g.run.debts.shark1.overdue = 1;
    g.run.debts.capital.principal = 0;
    giveWheel(g, 'DTC');
    delete g.run.coinWheels.DTC; // 쳇바퀴 0
    giveCoinValue(g, 'DTC', 500);
    settleOnce(g);
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy).toMatchObject({ cause: 'SHARK', lastLender: 'shark1' });
  });

  it('AC-v2-72 청산 즉시 파산: 쳇바퀴 1대면 아니다 / 쳇바퀴·설비 0 이고 지갑 0 이면 그 자리에서 / 빚 0 이면 아니다', () => {
    const a = bare();
    giveWheel(a, 'DTC');
    a.run.cash = 0;
    expect(checkLiquidationWipeout(a)).toBe(false);
    expect(a.run.over).toBe(false);
    const b = bare();
    b.run.cash = 500;
    expect(checkLiquidationWipeout(b)).toBe(true);
    expect(b.run.over).toBe(true);
    expect(b.run.bankruptcy).toMatchObject({ cause: 'LIQ', immediate: true });
    const c = bare();
    noDebts(c);
    c.run.cash = 0;
    expect(checkLiquidationWipeout(c)).toBe(false);
    const d = bare();
    d.run.cash = 500;
    giveEquip(d, 'wheel2', 'DTC', 20000);
    expect(checkLiquidationWipeout(d)).toBe(false);
  });

  it('AC-v2-73 압류 금지 물품 2단계: 가압류 비율 24%', () => {
    const g = bare();
    expect(garnishRate(g)).toBeCloseTo(0.3, 9);
    g.family.tree.exempt = 2;
    expect(garnishRate(g)).toBeCloseTo(0.24, 9);
    const { g: h } = sharkOverdue();
    h.family.tree.exempt = 2;
    settleOnce(h);
    const p0 = h.run.debts.shark1.principal;
    depositMined(h, 'DTC', 1000);
    expect(p0 - h.run.debts.shark1.principal).toBe(240);
  });

  it('AC-v2-73 생계 수단 보호 1단계: 마지막 쳇바퀴 1대는 압류되지 않고, 다음 연체 한도에서 파산', () => {
    const g = bare();
    g.family.tree.lastwheel = 1;
    giveWheel(g, 'DTC');
    expect(seizeFor(g, 'shark1')).toBeNull();
    expect(g.run.coinWheels.DTC).toBeDefined();
    g.run.cash = 0;
    g.run.debts.capital.principal = 0;
    g.run.debts.shark1.overdue = 1;
    settleOnce(g);
    expect(g.run.over).toBe(true);
    // 둘이 있으면 싼 쪽부터 가져가고 하나가 남으면 거기서 멈춘다
    const h = bare();
    h.family.tree.lastwheel = 1;
    giveWheel(h, 'DTC');
    giveWheel(h, 'BTH');
    expect(seizeFor(h, 'shark1')).toMatchObject({ id: 'DTC' });
    expect(seizeFor(h, 'shark1')).toBeNull();
  });

  it('AC-v2-73 생계 수단 보호 2단계: 거기 붙은 가장 낮은 설비 1대도 지킨다', () => {
    const g = bare();
    g.family.tree.lastwheel = 2;
    giveWheel(g, 'DTC');
    giveEquip(g, 'wheel2', 'DTC', 20000);
    const row = giveEquip(g, 'row', 'DTC', 150000);
    expect(seizeFor(g, 'shark1')).toMatchObject({ id: row.uid });
    expect(seizeFor(g, 'shark1')).toBeNull();
    expect(g.run.equipment.map((u) => u.tier)).toEqual(['wheel2']);
  });

  it('조합은 헛간 이상 설비에만 딱지를 붙인다', () => {
    const g = bare();
    g.run.house = 1;
    giveWheel(g, 'DTC');
    const w2 = giveEquip(g, 'wheel2', 'DTC', 20000);
    g.run.debts.bank.principal = 100000;
    g.run.debts.bank.overdue = 1;
    ensureTag(g, 'bank');
    expect(w2.tagBy).toBeNull();
    const shed = giveEquip(g, 'shed', 'DTC', 1500000);
    ensureTag(g, 'bank');
    expect(shed.tagBy).toBe('bank');
    void tierById;
  });
});

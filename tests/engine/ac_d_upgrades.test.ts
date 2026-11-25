import { describe, it, expect } from 'vitest';
import { A, fresh, giveCoinValue, giveEquip, giveWheel, tapN, tickN } from './helpers';
import { affordableUpgrades, upgradeCost } from '../../src/engine/upgrades';
import { equipGross, equipPower, tapValue } from '../../src/engine/equipment';
import { netWorth, lenderLimit } from '../../src/engine/selectors';
import { seizeFor } from '../../src/engine/seizure';
import { abbrev } from '../../src/engine/util';
import { forcedSell } from '../../src/engine/mining';
import { settleOnce } from './helpers';

describe('D. 업그레이드', () => {
  it('AC-v2-47 목장갑: 값 4,000 / 4,600 / 5,290, 줍기 1회 28.08 은 누적해 정수로 반영', () => {
    const g = fresh();
    expect(upgradeCost(g.run, 'glove')).toBe(4000);
    g.run.cash = 100000;
    A(g, { type: 'upgrade', track: 'glove' });
    expect(g.run.cash).toBe(96000);
    expect(upgradeCost(g.run, 'glove')).toBe(4600);
    const c0 = g.run.cash;
    tapN(g, 25);
    expect(g.run.cash - c0).toBe(702); // 25 × 28.08
    A(g, { type: 'upgrade', track: 'glove' });
    expect(upgradeCost(g.run, 'glove')).toBe(5290);
  });

  it('AC-v2-47 현금이 모자라면 못 사고 최고 단계(10)에서는 더 못 산다', () => {
    const g = fresh();
    g.run.cash = 3999;
    expect(A(g, { type: 'upgrade', track: 'glove' }).ok).toBe(false);
    g.run.upgrades.body.glove = 10;
    g.run.cash = 1e12;
    expect(upgradeCost(g.run, 'glove')).toBeNull();
    expect(A(g, { type: 'upgrade', track: 'glove' }).code).toBe('max');
  });

  it('AC-v2-48 기름칠 3단계: 그 종목 설비 캐는 값 +6%, 4단계 값 2,662, 다른 종목은 영향 없음', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveWheel(g, 'BTH');
    const a = giveEquip(g, 'wheel2', 'DTC', 20000);
    const b = giveEquip(g, 'wheel2', 'BTH', 20000);
    const b0 = equipGross(g, b);
    g.run.upgrades.coinWheel.DTC = { oil: 3 };
    expect(equipGross(g, a)).toBeCloseTo(5700 * 1.06, 6);
    expect(equipGross(g, b)).toBe(b0);
    expect(upgradeCost(g.run, 'oil', 'DTC')).toBe(2662);
  });

  it('AC-v2-49 관성 바퀴 2단계(멍도토 쳇바퀴): 설비 없어도 정산마다 390어치, 전기세 0', () => {
    const g = fresh();
    giveWheel(g, 'MDT');
    g.run.upgrades.coinWheel.MDT = { spokes: 2 };
    settleOnce(g);
    expect(g.run.lastSettlement!.mined).toBeCloseTo(390, 6);
    expect(g.run.lastSettlement!.power).toBe(0);
    expect(g.run.wallet.MDT.qty * g.run.refPrice.MDT).toBeCloseTo(390, 6);
  });

  it('AC-v2-50 절전 5단계: 보조 쳇바퀴 전기세 3,791(올림)', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    const u = giveEquip(g, 'wheel2', 'DTC', 20000);
    g.run.upgrades.coinWheel.DTC = { power: 5 };
    expect(equipPower(g, u)).toBe(3791);
  });

  it('AC-v2-51 단골 환전상 10단계: 10,000어치 팔면 +9,980, 급매 수수료는 3% 그대로', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    g.run.upgrades.run.fee = 10;
    giveCoinValue(g, 'DTC', 20000);
    const c0 = g.run.cash;
    g.run.wallet.DTC.qty /= 2;
    A(g, { type: 'sell', coin: 'DTC', part: 'all' });
    expect(g.run.cash - c0).toBe(9980);
    giveCoinValue(g, 'DTC', 5000);
    const c1 = g.run.cash;
    expect(forcedSell(g, 1000)).toBe(1031); // ceil(1000 / 0.97)
    expect(g.run.cash - c1).toBe(Math.floor(1031 * 0.97));
  });

  it('AC-v2-52 달리기 Lv5(+2×5) × 가문 특성 grip 2단계(+20%) = 채굴 1회 (27+10)×1.2 = 44.4어치', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    g.run.upgrades.body.shoes = 5;
    g.family.tree.grip = 2;
    expect(tapValue(g, 'DTC')).toBeCloseTo(44.4, 9);
    A(g, { type: 'tap' });
    expect(g.run.wallet.DTC.qty * g.run.refPrice.DTC).toBeCloseTo(44.4, 9);
  });

  it('AC-v2-53 현금이 다음 값 이상이면 살 수 있는 목록에 오르고, 값은 줄여 쓴다', () => {
    const g = fresh();
    g.run.cash = 3999;
    expect(affordableUpgrades(g.run).some((x) => x.track === 'glove')).toBe(false);
    g.run.cash = 4000;
    expect(affordableUpgrades(g.run).some((x) => x.track === 'glove')).toBe(true);
    expect(abbrev(12345)).toBe('1.2만');
    expect(abbrev(9500)).toBe('9,500');
    expect(abbrev(150000000)).toBe('1.5억');
    expect(abbrev(34000000)).toBe('3,400만');
    expect(abbrev(20000)).toBe('2만');
  });

  it('AC-v2-54 멍도토 쳇바퀴가 압류되면 그 종목 업그레이드는 0, 몸·수수료 줄은 그대로, 빚에서는 7,500 만 깎인다', () => {
    const g = fresh();
    giveWheel(g, 'MDT');
    g.run.upgrades.coinWheel.MDT = { oil: 7, power: 3 };
    g.run.upgrades.body = { glove: 2, shoes: 3 };
    g.run.upgrades.run = { fee: 4 };
    const p0 = g.run.debts.shark1.principal;
    const r = seizeFor(g, 'shark1');
    expect(r).toMatchObject({ what: 'wheel', id: 'MDT', value: 7500 });
    expect(g.run.debts.shark1.principal).toBe(p0 - 7500);
    expect(g.run.upgrades.coinWheel.MDT).toBeUndefined();
    expect(g.run.upgrades.body).toEqual({ glove: 2, shoes: 3 });
    expect(g.run.upgrades.run).toEqual({ fee: 4 });
    expect(g.run.coinWheels.MDT).toBeUndefined();
  });

  it('AC-v2-55 알바 칩멍크가 0대가 되면 그 단계 업그레이드가 0', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    const u = giveEquip(g, 'helper', 'DTC', 60000);
    g.run.upgrades.tier.helper = 3;
    expect(A(g, { type: 'sellEquip', uid: u.uid }).ok).toBe(true);
    expect(g.run.upgrades.tier.helper).toBeUndefined();
  });

  it('AC-v2-56 업그레이드 단계는 순자산·담보에 들어가지 않는다', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveEquip(g, 'wheel2', 'DTC', 20000);
    const nw = netWorth(g.run);
    const lim = lenderLimit(g, 'capital');
    g.run.upgrades.body.glove = 10;
    g.run.upgrades.coinWheel.DTC = { oil: 20, spokes: 10, power: 15 };
    g.run.upgrades.tier.wheel2 = 5;
    g.run.upgrades.run.fee = 10;
    expect(netWorth(g.run)).toBe(nw);
    expect(lenderLimit(g, 'capital')).toBe(lim);
  });

  it('업그레이드 대상: 쳇바퀴가 없는 종목·없는 설비 단계에는 못 산다', () => {
    const g = fresh();
    g.run.cash = 1e6;
    expect(A(g, { type: 'upgrade', track: 'oil', target: 'DTC' }).ok).toBe(false);
    giveWheel(g, 'DTC');
    expect(A(g, { type: 'upgrade', track: 'oil', target: 'DTC' }).ok).toBe(true);
    expect(g.run.cash).toBe(1e6 - 2000);
    expect(A(g, { type: 'upgrade', track: 'tier', target: 'helper' }).ok).toBe(false);
    giveEquip(g, 'helper', 'DTC', 60000);
    expect(A(g, { type: 'upgrade', track: 'tier', target: 'helper' }).ok).toBe(true);
    expect(g.run.cash).toBe(1e6 - 2000 - 3000);
    void tickN;
  });
});

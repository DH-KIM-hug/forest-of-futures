import { describe, it, expect } from 'vitest';
import { A, fresh, giveCoinValue, giveEquip, giveWheel, noDebts, setRatio, settleOnce, tickN } from './helpers';
import { equipGross, equipPower, equipNetNow, isReverseMargin, mineConcentration, tierBlockReason, tapValue, nextTierCost } from '../../src/engine/equipment';
import { lenderLimit, walletValue, walletValueOf } from '../../src/engine/selectors';
import { payFromWallet } from '../../src/engine/mining';
import { tierById } from '../../src/engine/data';
import type { GameState } from '../../src/engine/types';

const ref = (g: GameState, c: string) => g.run.refPrice[c];

describe('C. 채굴·지갑·종목 쳇바퀴·설비', () => {
  it('AC-v2-25 도토코인 쳇바퀴 1번: 지갑에 27 ÷ 68,000 개, 환산값 27', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    A(g, { type: 'tap' });
    expect(g.run.wallet.DTC.qty).toBeCloseTo(27 / 68000, 12);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(27, 9);
  });

  it('AC-v2-26 가격이 -10% 이면 환산값 24.3, 다음 1회 채굴량(코인 수)은 그대로', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    A(g, { type: 'tap' });
    const q1 = g.run.wallet.DTC.qty;
    setRatio(g, 'DTC', 0.9);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(24.3, 9);
    tickN(g, 1);
    A(g, { type: 'tap' });
    expect(g.run.wallet.DTC.qty - q1).toBeCloseTo(q1, 12);
  });

  it('AC-v2-27 멍도토 쳇바퀴: 세대 시작가 기준 31.59어치', () => {
    const g = fresh();
    giveWheel(g, 'MDT');
    A(g, { type: 'tap' });
    expect(g.run.wallet.MDT.qty * ref(g, 'MDT')).toBeCloseTo(31.59, 9);
  });

  it('AC-v2-28 쳇바퀴를 옮겨 타도 지갑은 그대로, 그 뒤 탭은 새 종목만', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveWheel(g, 'BTH');
    A(g, { type: 'tap' });
    const dtc = g.run.wallet.DTC.qty;
    expect(A(g, { type: 'ride', coin: 'BTH' }).ok).toBe(true);
    tickN(g, 1);
    A(g, { type: 'tap' });
    expect(g.run.wallet.DTC.qty).toBe(dtc);
    expect(g.run.wallet.BTH.qty * ref(g, 'BTH')).toBeCloseTo(27 * 1.07, 9);
  });

  it('AC-v2-29 탭은 설비를 공짜로 따라가지 않는다: 설비 초당 100이어도 달리기 Lv0 이면 27, Lv15 면 (27+30)×1.5 + 100×2% = 87.5', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    const old = tierById.wheel2.netPerSec;
    tierById.wheel2.netPerSec = 100;
    try {
      giveEquip(g, 'wheel2', 'DTC', 20000);
      expect(tapValue(g, 'DTC')).toBeCloseTo(27, 9);
      g.run.upgrades.body.shoes = 15;
      expect(tapValue(g, 'DTC')).toBeCloseTo(87.5, 9);
      A(g, { type: 'tap' });
      expect(g.run.wallet.DTC.qty * ref(g, 'DTC')).toBeCloseTo(87.5, 9);
    } finally {
      tierById.wheel2.netPerSec = old;
    }
  });

  it('AC-v2-30 지갑 도토코인 10,000어치를 전부 팔면 현금 +9,950, 그 종목 0', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 10000);
    const c0 = g.run.cash;
    expect(A(g, { type: 'sell', coin: 'DTC', part: 'all' }).ok).toBe(true);
    expect(g.run.cash - c0).toBe(9950);
    expect(g.run.wallet.DTC.qty).toBe(0);
  });

  it('AC-v2-30 절반 팔기', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 10000);
    const c0 = g.run.cash;
    A(g, { type: 'sell', coin: 'DTC', part: 'half' });
    expect(g.run.cash - c0).toBe(4975);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(5000, 6);
  });

  it('AC-v2-31 캐는 즉시 팔기: 지갑에 안 쌓이고 floor(값 × 0.995) 가 현금으로. 꺼진 종목은 지갑에', () => {
    const g = fresh();
    giveWheel(g, 'DTC', { autoSell: true });
    giveWheel(g, 'BTH');
    const c0 = g.run.cash;
    A(g, { type: 'tap' });
    expect(g.run.wallet.DTC.qty).toBe(0);
    expect(g.run.cash - c0).toBe(Math.floor(27 * 0.995));
    A(g, { type: 'ride', coin: 'BTH' });
    tickN(g, 1);
    A(g, { type: 'tap' });
    expect(g.run.wallet.BTH.qty).toBeGreaterThan(0);
  });

  it('AC-v2-32 보조 쳇바퀴(도토코인): 5,700어치가 쌓이고 전기세 3,990어치가 빠져 순 1,710', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveEquip(g, 'wheel2', 'DTC', 20000);
    settleOnce(g);
    expect(g.run.lastSettlement!.mined).toBeCloseTo(5700, 6);
    expect(g.run.lastSettlement!.power).toBe(3990);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(1710, 6);
  });

  it('AC-v2-33 보조 쳇바퀴를 멍도토에 붙이면 캔 값 7,410, 전기세 5,415, 순 1,995', () => {
    const g = fresh();
    giveWheel(g, 'MDT');
    const u = giveEquip(g, 'wheel2', 'MDT', 20000);
    expect(equipGross(g, u)).toBeCloseTo(7410, 9);
    expect(equipPower(g, u)).toBe(5415);
    settleOnce(g);
    expect(walletValueOf(g.run, 'MDT')).toBeCloseTo(1995, 6);
  });

  it('AC-v2-34 도토코인 -30%: 캔 값 3,990 = 전기세 3,990, 순 0 -> 역마진. 멍도토 -27% 도 역마진', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    const u = giveEquip(g, 'wheel2', 'DTC', 20000);
    setRatio(g, 'DTC', 0.7);
    expect(equipNetNow(g, u)).toBeCloseTo(0, 6);
    expect(isReverseMargin(g, u)).toBe(true);
    settleOnce(g);
    expect(g.run.lastSettlement!.mined).toBeCloseTo(3990, 6);
    expect(g.run.lastSettlement!.power).toBe(3990);
    expect(walletValue(g.run)).toBeCloseTo(0, 6);
    const h = fresh();
    giveWheel(h, 'MDT');
    const v = giveEquip(h, 'wheel2', 'MDT', 20000);
    setRatio(h, 'MDT', 0.73);
    expect(equipNetNow(h, v)).toBeLessThan(0);
    expect(isReverseMargin(h, v)).toBe(true);
    setRatio(h, 'MDT', 1);
    expect(isReverseMargin(h, v)).toBe(false);
  });

  it('AC-v2-35 역마진인 설비를 끄면 캐지 않고 전기세도 0', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    const u = giveEquip(g, 'wheel2', 'DTC', 20000);
    setRatio(g, 'DTC', 0.7);
    A(g, { type: 'toggleEquip', uid: u.uid, on: false });
    settleOnce(g);
    expect(g.run.lastSettlement!.mined).toBe(0);
    expect(g.run.lastSettlement!.power).toBe(0);
    expect(g.run.wallet.DTC.qty).toBe(0);
  });

  it('AC-v2-35 종목 쳇바퀴를 끄면 그 위 설비도 멈춘다', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveEquip(g, 'wheel2', 'DTC', 20000);
    A(g, { type: 'toggleWheel', coin: 'DTC', on: false });
    settleOnce(g);
    expect(g.run.lastSettlement!.mined).toBe(0);
    expect(g.run.lastSettlement!.power).toBe(0);
  });

  it('AC-v2-36 전기세는 그 종목 지갑이 먼저, 나머지는 평가액 큰 종목에서', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveWheel(g, 'MDT');
    giveCoinValue(g, 'MDT', 2000);
    giveCoinValue(g, 'DTC', 10000);
    const left = payFromWallet(g.run, 'MDT', 5415);
    expect(left).toBeCloseTo(0, 9);
    expect(walletValueOf(g.run, 'MDT')).toBeCloseTo(0, 6);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(10000 - 3415, 6);
  });

  it('AC-v2-37 지갑 0·현금 0·전기세만 있고 텐트면 전기세 잔여가 생활비와 함께 캐피탈 원금으로', () => {
    const g = fresh();
    g.run.cash = 0;
    noDebts(g);
    giveWheel(g, 'DTC');
    giveEquip(g, 'wheel2', 'DTC', 20000);
    setRatio(g, 'DTC', 0.5); // 캔 값은 시가 2,850 이라 전기세 3,990 에서 1,140 이 모자란다
    settleOnce(g);
    expect(g.run.debts.capital.principal).toBeCloseTo(1140 + 1000, 6);
    expect(g.run.debts.capital.overdue).toBe(0);
    expect(g.run.upkeepOverdue).toBe(0);
  });

  it('AC-v2-37 오두막이면 유지비 미납으로 잡힌다', () => {
    const g = fresh();
    g.run.cash = 0;
    g.run.house = 1;
    noDebts(g);
    giveWheel(g, 'DTC');
    giveEquip(g, 'wheel2', 'DTC', 20000);
    setRatio(g, 'DTC', 0.5);
    settleOnce(g);
    expect(g.run.upkeepOverdue).toBe(1);
    expect(g.run.upkeepArrears).toBeCloseTo(1140 + 8000, 6);
    expect(g.run.debts.capital.principal).toBe(0);
  });

  it('AC-v2-38 현금 2,000, 청구 10,000, 지갑 50,000어치: 8,248어치가 급매되어 다 내고 연체 없음', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 50000);
    g.run.cash = 2000;
    settleOnce(g);
    expect(g.run.stats.forcedSold).toBe(8248);
    expect(g.run.cash).toBe(0);
    expect(Object.values(g.run.debts).every((d) => d.overdue === 0)).toBe(true);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(50000 - 8248, 4);
  });

  it('AC-v2-39 캐피탈 한도 = 200,000 + 4,000 + 50,000, 지갑이 20% 내리면 지갑 몫 40,000', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 100000);
    expect(lenderLimit(g, 'capital')).toBe(200000 + 4000 + 50000);
    setRatio(g, 'DTC', 0.8);
    expect(lenderLimit(g, 'capital')).toBe(200000 + 4000 + 40000);
  });

  it('AC-v2-40 설비는 단계마다 3대까지(전 종목 합), 둘째 25,000 · 셋째 31,250', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveWheel(g, 'MDT');
    giveWheel(g, 'BTH');
    g.run.cash = 1_000_000;
    expect(nextTierCost(g.run, 'wheel2')).toBe(20000);
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(true);
    expect(nextTierCost(g.run, 'wheel2')).toBe(25000);
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'MDT' }).ok).toBe(true);
    expect(nextTierCost(g.run, 'wheel2')).toBe(31250);
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(true);
    expect(g.run.cash).toBe(1_000_000 - 20000 - 25000 - 31250);
    const r = A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'BTH' });
    expect(r.ok).toBe(false);
    expect(g.run.equipment).toHaveLength(3);
  });

  it('AC-v2-41 텐트면 채굴 헛간 구매가 막히고 "주소지가 필요합니다(오두막 이상)"', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    g.run.cash = 5_000_000;
    expect(tierBlockReason(g, 'shed', 'DTC')).toBe('주소지가 필요합니다(오두막 이상)');
    expect(A(g, { type: 'buyEquip', tier: 'shed', coin: 'DTC' }).ok).toBe(false);
    g.run.house = 1;
    expect(tierBlockReason(g, 'shed', 'DTC')).toBeNull();
  });

  it('AC-v2-41 쳇바퀴가 하나도 없으면 설비를 못 산다', () => {
    const g = fresh();
    g.run.cash = 5_000_000;
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(false);
  });

  it('AC-v2-42 소형 발전기는 캐피탈 한도 +160,000, 채굴 헛간은 조합 한도 +720,000', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    const base = lenderLimit(g, 'capital');
    giveEquip(g, 'generator', 'DTC', 400000);
    expect(lenderLimit(g, 'capital') - base).toBe(160000);
    const h = fresh();
    giveWheel(h, 'DTC');
    h.run.house = 1;
    const b0 = lenderLimit(h, 'bank');
    expect(b0).toBe(400000);
    giveEquip(h, 'shed', 'DTC', 1500000);
    expect(lenderLimit(h, 'bank') - b0).toBe(720000);
  });

  it('AC-v2-43 설비를 다른 종목 쳇바퀴로 옮기면 구매가의 5%(3,000)를 내고 다음 정산부터 그 종목을 캔다', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    const u = giveEquip(g, 'helper', 'DTC', 60000);
    expect(A(g, { type: 'moveEquip', uid: u.uid, coin: 'MDT' }).ok).toBe(false); // 멍도토 쳇바퀴 없음
    giveWheel(g, 'MDT');
    const c0 = g.run.cash;
    expect(A(g, { type: 'moveEquip', uid: u.uid, coin: 'MDT' }).ok).toBe(true);
    expect(c0 - g.run.cash).toBe(3000);
    settleOnce(g);
    expect(g.run.wallet.MDT.qty).toBeGreaterThan(0);
    expect(g.run.wallet.DTC.qty).toBe(0);
  });

  it('AC-v2-44 도토코인 5,700 + 멍도토 14,700 × 1.3 = 19,110 이면 mineTopCoin MDT, mineConcentration 77', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveWheel(g, 'MDT');
    giveEquip(g, 'wheel2', 'DTC', 20000);
    giveEquip(g, 'helper', 'MDT', 60000);
    expect(mineConcentration(g)).toEqual({ pct: 77, coin: 'MDT' });
  });

  it('AC-v2-45(지갑 부분) 지갑 도토코인 100,000어치가 -5% 면 95,000 (숏 보험 쪽은 M2)', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 100000);
    setRatio(g, 'DTC', 0.95);
    expect(walletValue(g.run)).toBeCloseTo(95000, 6);
  });

  it('AC-v2-46 다음 정산 수지가 0 이상이 되면 속보 띠에 "흑자 전환"이 한 번', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    tickN(g, 1);
    expect(g.run.notices.some((n) => n.id === 'wire:surplus')).toBe(false);
    giveEquip(g, 'farm', 'DTC', 40_000_000);
    tickN(g, 1);
    expect(g.run.notices.filter((n) => n.id === 'wire:surplus')).toHaveLength(1);
    expect(g.run.notices.find((n) => n.id === 'wire:surplus')!.text).toContain('흑자 전환');
    tickN(g, 5);
    expect(g.run.notices.filter((n) => n.id === 'wire:surplus')).toHaveLength(1);
  });
});

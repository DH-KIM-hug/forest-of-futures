import { describe, it, expect } from 'vitest';
import { A, bare, giveCoinValue, giveEquip, giveWheel, noDebts, setRatio, settleOnce, tickN } from './helpers';
import { equipGross, equipPower, equipNetNow, isReverseMargin, mineConcentration, tierBlockReason, tapValue, nextTierCost } from '../../src/engine/equipment';
import { lenderLimit, walletValue, walletValueOf } from '../../src/engine/selectors';
import { payFromWallet } from '../../src/engine/mining';
import { tierById } from '../../src/engine/data';
import type { GameState } from '../../src/engine/types';

const ref = (g: GameState, c: string) => g.run.refPrice[c];

describe('C. 채굴·지갑·종목 쳇바퀴·설비', () => {
  it('AC-v2-25 도토코인 쳇바퀴 1번: 지갑에 2 ÷ 68,000 개, 환산값 2(tapBase, 고정)', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    A(g, { type: 'tap' });
    expect(g.run.wallet.DTC.qty).toBeCloseTo(2 / 68000, 12);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(2, 9);
  });

  it('AC-v2-26 가격이 -10% 이면 환산값 1.8, 다음 1회 채굴량(코인 수)은 그대로', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    A(g, { type: 'tap' });
    const q1 = g.run.wallet.DTC.qty;
    setRatio(g, 'DTC', 0.9);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(1.8, 9);
    tickN(g, 1);
    A(g, { type: 'tap' });
    expect(g.run.wallet.DTC.qty - q1).toBeCloseTo(q1, 12);
  });

  it('AC-v2-27 멍도토 쳇바퀴: 세대 시작가 기준 2 × 1.17 = 2.34어치', () => {
    const g = bare();
    giveWheel(g, 'MDT');
    A(g, { type: 'tap' });
    expect(g.run.wallet.MDT.qty * ref(g, 'MDT')).toBeCloseTo(2.34, 9);
  });

  it('AC-v2-28 쳇바퀴를 옮겨 타도 지갑은 그대로, 그 뒤 탭은 새 종목만', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveWheel(g, 'BTH');
    A(g, { type: 'tap' });
    const dtc = g.run.wallet.DTC.qty;
    expect(A(g, { type: 'ride', coin: 'BTH' }).ok).toBe(true);
    tickN(g, 1);
    A(g, { type: 'tap' });
    expect(g.run.wallet.DTC.qty).toBe(dtc);
    expect(g.run.wallet.BTH.qty * ref(g, 'BTH')).toBeCloseTo(2 * 1.07, 9);
  });

  it('AC-v2-29 탭은 고정값이다(U-30): 설비 초당 100이어도, 몸 줄에 무엇이 적혀 있어도 2. 달리기 레벨 줄은 없다', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    const old = tierById.helper.netPerSec;
    tierById.helper.netPerSec = 100;
    try {
      giveEquip(g, 'helper', 'DTC', 60000);
      expect(tapValue(g, 'DTC')).toBe(2);
      g.run.upgrades.body.shoes = 15; // 옛 저장에 남은 값이 있어도 효과가 없다
      expect(tapValue(g, 'DTC')).toBe(2);
      g.run.cash = 1e9;
      expect(A(g, { type: 'upgrade', track: 'shoes' })).toMatchObject({ ok: false, code: 'unknown' });
      A(g, { type: 'tap' });
      expect(g.run.wallet.DTC.qty * ref(g, 'DTC')).toBeCloseTo(2, 9);
    } finally {
      tierById.helper.netPerSec = old;
    }
  });

  it('AC-v2-30 지갑 도토코인 10,000어치를 전부 팔면 현금 +9,950, 그 종목 0', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 10000);
    const c0 = g.run.cash;
    expect(A(g, { type: 'sell', coin: 'DTC', part: 'all' }).ok).toBe(true);
    expect(g.run.cash - c0).toBe(9950);
    expect(g.run.wallet.DTC.qty).toBe(0);
  });

  it('AC-v2-30 절반 팔기', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 10000);
    const c0 = g.run.cash;
    A(g, { type: 'sell', coin: 'DTC', part: 'half' });
    expect(g.run.cash - c0).toBe(4975);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(5000, 6);
  });

  it('AC-v2-31 캐는 즉시 팔기: 지갑에 안 쌓이고 값 × 0.995 가 현금으로(1도토리 못 미친 몫은 다음 판매에 얹는다). 꺼진 종목은 지갑에', () => {
    const g = bare();
    giveWheel(g, 'DTC', { autoSell: true });
    giveWheel(g, 'BTH');
    const c0 = g.run.cash;
    A(g, { type: 'tap' });
    expect(g.run.wallet.DTC.qty).toBe(0);
    expect(g.run.cash - c0).toBe(1); // 2 × 0.995 = 1.99
    A(g, { type: 'tap' });
    A(g, { type: 'tap' });
    expect(g.run.cash - c0).toBe(5); // 3번 = 5.97 (한 번씩 내리면 3)
    expect(g.run.sellFrac).toBeCloseTo(0.97, 9);
    A(g, { type: 'ride', coin: 'BTH' });
    tickN(g, 1);
    A(g, { type: 'tap' });
    expect(g.run.wallet.BTH.qty).toBeGreaterThan(0);
  });

  it('AC-v2-32 보조 쳇바퀴(도토코인, 알바 붙음): 정산(60초)마다 2,170어치가 쌓이고 전기세는 없다. 일당 530 은 현금에서', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    const u = giveEquip(g, 'wheel2', 'DTC', 50000);
    expect(equipPower(g, u)).toBe(0);
    const c0 = g.run.cash;
    settleOnce(g);
    expect(g.run.lastSettlement!.mined).toBeCloseTo(2170, 6);
    expect(g.run.lastSettlement!.power).toBe(0);
    expect(g.run.lastSettlement!.wages).toBe(530);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(2170, 6);
    expect(c0 - g.run.cash).toBe(1950 + 1005 + 330 + 530); // 이자(오소리 1,950 + 캐피탈 1,005) + 생활비 + 일당
  });

  it('AC-v2-32 알바가 없는 보조 쳇바퀴는 캐지 않고 일당도 없다', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveEquip(g, 'wheel2', 'DTC', 50000, true, false);
    settleOnce(g);
    expect(g.run.lastSettlement).toMatchObject({ mined: 0, power: 0, wages: 0, quit: 0 });
    expect(g.run.wallet.DTC.qty).toBe(0);
  });

  it('AC-v2-33 보조 쳇바퀴를 멍도토에 붙이면 캔 값 2,170 × 1.3 = 2,821, 전기세 0', () => {
    const g = bare();
    giveWheel(g, 'MDT');
    const u = giveEquip(g, 'wheel2', 'MDT', 50000);
    expect(equipGross(g, u)).toBeCloseTo(2821, 9);
    expect(equipPower(g, u)).toBe(0);
    settleOnce(g);
    expect(walletValueOf(g.run, 'MDT')).toBeCloseTo(2821, 6);
  });

  it('AC-v2-33 전기를 쓰는 설비(알바 햄스터 단계, 물려받은 것): 4,900어치가 쌓이고 전기세 3,430어치가 빠져 순 1,470. 멍도토면 6,370 − 4,655', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveEquip(g, 'helper', 'DTC', 60000);
    settleOnce(g);
    expect(g.run.lastSettlement!.mined).toBeCloseTo(4900, 6);
    expect(g.run.lastSettlement!.power).toBe(3430);
    expect(g.run.lastSettlement!.wages).toBe(0);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(1470, 6);
    const h = bare();
    giveWheel(h, 'MDT');
    const u = giveEquip(h, 'helper', 'MDT', 60000);
    expect(equipGross(h, u)).toBeCloseTo(6370, 9);
    expect(equipPower(h, u)).toBe(4655);
  });

  it('AC-v2-34 도토코인 -30%: 캔 값 3,430 = 전기세 3,430, 순 0 -> 역마진. 멍도토 -27% 도 역마진', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    const u = giveEquip(g, 'helper', 'DTC', 60000);
    setRatio(g, 'DTC', 0.7);
    expect(equipNetNow(g, u)).toBeCloseTo(0, 6);
    expect(isReverseMargin(g, u)).toBe(true);
    settleOnce(g);
    expect(g.run.lastSettlement!.mined).toBeCloseTo(3430, 6);
    expect(g.run.lastSettlement!.power).toBe(3430);
    expect(walletValue(g.run)).toBeCloseTo(0, 6);
    const h = bare();
    giveWheel(h, 'MDT');
    const v = giveEquip(h, 'helper', 'MDT', 60000);
    setRatio(h, 'MDT', 0.73);
    expect(equipNetNow(h, v)).toBeLessThan(0);
    expect(isReverseMargin(h, v)).toBe(true);
    setRatio(h, 'MDT', 1);
    expect(isReverseMargin(h, v)).toBe(false);
  });

  it('AC-v2-35 역마진인 설비를 끄면 캐지 않고 전기세도 0', () => {
    const g = bare();
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
    const g = bare();
    giveWheel(g, 'DTC');
    giveEquip(g, 'wheel2', 'DTC', 20000);
    A(g, { type: 'toggleWheel', coin: 'DTC', on: false });
    settleOnce(g);
    expect(g.run.lastSettlement!.mined).toBe(0);
    expect(g.run.lastSettlement!.power).toBe(0);
  });

  it('AC-v2-36 전기세는 그 종목 지갑이 먼저, 나머지는 평가액 큰 종목에서', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveWheel(g, 'MDT');
    giveCoinValue(g, 'MDT', 2000);
    giveCoinValue(g, 'DTC', 10000);
    const left = payFromWallet(g.run, 'MDT', 5415);
    expect(left).toBeCloseTo(0, 9);
    expect(walletValueOf(g.run, 'MDT')).toBeCloseTo(0, 6);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(10000 - 3415, 6);
  });

  it('AC-v2-37 지갑 0·현금 0·전기세만 있고 빈 오두막이면 전기세 잔여가 생활비와 함께 캐피탈 원금으로', () => {
    const g = bare();
    g.run.cash = 0;
    noDebts(g);
    giveWheel(g, 'DTC');
    giveEquip(g, 'helper', 'DTC', 60000);
    setRatio(g, 'DTC', 0.5); // 캔 값은 시가 2,450 이라 전기세 3,430 에서 980 이 모자란다
    settleOnce(g);
    expect(g.run.debts.capital.principal).toBeCloseTo(980 + 330, 6);
    expect(g.run.debts.capital.overdue).toBe(0);
    expect(g.run.upkeepOverdue).toBe(0);
  });

  it('AC-v2-37 통나무집이면 유지비 미납으로 잡힌다', () => {
    const g = bare();
    g.run.cash = 0;
    g.run.house = 1;
    noDebts(g);
    giveWheel(g, 'DTC');
    giveEquip(g, 'helper', 'DTC', 60000);
    setRatio(g, 'DTC', 0.5);
    settleOnce(g);
    expect(g.run.upkeepOverdue).toBe(1);
    expect(g.run.upkeepArrears).toBeCloseTo(980 + 2700, 6);
    expect(g.run.debts.capital.principal).toBe(0);
  });

  it('AC-v2-38 현금 2,000, 청구 3,285(이자 1,950 + 1,005, 생활비 330), 지갑 50,000어치: 1,325어치가 급매되어 다 내고 연체 없음', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 50000);
    g.run.cash = 2000;
    settleOnce(g);
    expect(g.run.stats.forcedSold).toBe(1325); // 모자란 1,285 ÷ 0.97
    expect(g.run.cash).toBe(0);
    expect(Object.values(g.run.debts).every((d) => d.overdue === 0)).toBe(true);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(50000 - 1325, 4);
  });

  it('AC-v2-39 캐피탈 한도 = 200,000 + 4,000 + 50,000, 지갑이 20% 내리면 지갑 몫 40,000', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 100000);
    expect(lenderLimit(g, 'capital')).toBe(200000 + 4000 + 50000);
    setRatio(g, 'DTC', 0.8);
    expect(lenderLimit(g, 'capital')).toBe(200000 + 4000 + 40000);
  });

  it('AC-v2-40 살 수 있는 것은 보조 쳇바퀴뿐(U-30): 값은 몇 대째든 50,000, 다섯 대까지(전 종목 합), 알바 없이 온다', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveWheel(g, 'MDT');
    g.run.cash = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(nextTierCost(g.run, 'wheel2')).toBe(50000);
      expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: i % 2 ? 'MDT' : 'DTC' })).toMatchObject({ ok: true, amount: 50000 });
    }
    expect(g.run.cash).toBe(1_000_000 - 5 * 50000);
    expect(g.run.equipment.every((u) => u.staffed === false)).toBe(true);
    expect(tierBlockReason(g, 'wheel2', 'DTC')).toBe('놓을 자리가 없습니다');
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'MDT' }).ok).toBe(false);
    expect(g.run.equipment).toHaveLength(5);
    for (const t of ['helper', 'row', 'generator']) {
      expect(tierBlockReason(g, t, 'DTC')).toBe('집에 들일 수 없는 설비입니다');
      expect(A(g, { type: 'buyEquip', tier: t, coin: 'DTC' }).ok).toBe(false);
    }
  });

  it('AC-v2-41 빈 오두막이면 채굴 헛간은 "내 집이 필요합니다(통나무집 이상)", 집이 있어도 집에 들일 수 없다(물려받는 것만)', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    g.run.cash = 5_000_000;
    expect(tierBlockReason(g, 'shed', 'DTC')).toBe('내 집이 필요합니다(통나무집 이상)');
    expect(A(g, { type: 'buyEquip', tier: 'shed', coin: 'DTC' }).ok).toBe(false);
    g.run.house = 1;
    expect(tierBlockReason(g, 'shed', 'DTC')).toBe('집에 들일 수 없는 설비입니다');
    expect(A(g, { type: 'buyEquip', tier: 'shed', coin: 'DTC' }).ok).toBe(false);
  });

  it('AC-v2-41 쳇바퀴가 하나도 없으면 설비를 못 산다', () => {
    const g = bare();
    g.run.cash = 5_000_000;
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(false);
  });

  it('AC-v2-42 소형 발전기는 캐피탈 한도 +160,000, 채굴 헛간은 조합 한도 +720,000', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    const base = lenderLimit(g, 'capital');
    giveEquip(g, 'generator', 'DTC', 400000);
    expect(lenderLimit(g, 'capital') - base).toBe(160000);
    const h = bare();
    giveWheel(h, 'DTC');
    h.run.house = 1;
    const b0 = lenderLimit(h, 'bank');
    expect(b0).toBe(400000);
    giveEquip(h, 'shed', 'DTC', 1500000);
    expect(lenderLimit(h, 'bank') - b0).toBe(720000);
  });

  it('AC-v2-43 설비를 다른 종목 쳇바퀴로 옮기면 구매가의 5%(3,000)를 내고 다음 정산부터 그 종목을 캔다', () => {
    const g = bare();
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

  it('AC-v2-44 도토코인 2,170 + 멍도토 4,900 × 1.3 = 6,370 이면 mineTopCoin MDT, mineConcentration 74', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveWheel(g, 'MDT');
    giveEquip(g, 'wheel2', 'DTC', 50000);
    giveEquip(g, 'helper', 'MDT', 60000);
    expect(mineConcentration(g)).toEqual({ pct: 74, coin: 'MDT' }); // 6,370 ÷ 8,540 = 74.6%
  });

  it('AC-v2-45(지갑 부분) 지갑 도토코인 100,000어치가 -5% 면 95,000 (숏 보험 쪽은 M2)', () => {
    const g = bare();
    giveWheel(g, 'DTC');
    giveCoinValue(g, 'DTC', 100000);
    setRatio(g, 'DTC', 0.95);
    expect(walletValue(g.run)).toBeCloseTo(95000, 6);
  });

  it('AC-v2-46 다음 정산 수지가 0 이상이 되면 속보 띠에 "흑자 전환"이 한 번', () => {
    const g = bare();
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

import { describe, it, expect } from 'vitest';
import { A, flatBars, fresh, giveEquip, giveWheel, settleOnce, tapN, tickN } from './helpers';
import { ownedCoins, stage } from '../../src/engine/selectors';
import { wheelOffers, wheelStatus } from '../../src/engine/progression';
import { catchUp } from '../../src/engine/offline';
import { removeWheel, tapValue } from '../../src/engine/equipment';
import { stepMut } from '../../src/engine/game';

/** 쳇바퀴를 잃은 판(압류·판매 뒤). 줍기 단계는 없다(U-29). */
function wheelless() {
  const g = fresh();
  removeWheel(g.run, 'DTC');
  return g;
}

describe('B. 진행 단계·첫 쳇바퀴(U-29: 줍기 없음, 쳇바퀴에서 시작)', () => {
  it('AC-v2-09 시작부터 쳇바퀴: 1번 굴리면 도토코인 2어치(고정)를 캐 바로 팔린다(수수료 0.5%, 1도토리 못 미친 몫은 다음으로)', () => {
    const g = fresh();
    expect(tapValue(g, 'DTC')).toBe(2);
    A(g, { type: 'tap' });
    expect(g.run.cash).toBe(1); // 2 × 0.995 = 1.99 -> 1, 나머지 0.99
    expect(g.run.sellFrac).toBeCloseTo(0.99, 9);
    expect(g.run.minedValue).toBe(2);
    expect(g.run.wallet.DTC.qty).toBe(0); // 바로 팔기: 지갑에 안 쌓인다
    A(g, { type: 'tap' });
    expect(g.run.cash).toBe(3); // 누적 3.98
  });

  it('AC-v2-10 1초 안에 20번 눌러도 12번만 인정', () => {
    const g = fresh();
    for (let i = 0; i < 20; i++) A(g, { type: 'tap' });
    expect(g.run.cash).toBe(Math.floor(12 * 2 * 0.995)); // 23
    expect(g.run.stats.laborTaps).toBe(12);
    tickN(g, 1);
    A(g, { type: 'tap' });
    expect(g.run.stats.laborTaps).toBe(13);
  });

  it('AC-v2-11 줍기 조건·팻말은 없다: 처음부터 가졌고, 잃으면 값(10,000)만 내고 다시 산다', () => {
    const g = fresh();
    expect(wheelStatus(g, 'DTC')).toMatchObject({ owned: true, unlocked: true, canBuy: false, reason: null, progress: null });
    expect(g.run.notices.some((n) => n.id === 'sign:wheel' || n.id === 'hint:firstWheel')).toBe(false);
    const h = wheelless();
    expect(stage(h.run)).toBe(0);
    const offers = wheelOffers(h);
    expect(offers.map((o) => o.coin)).toEqual(['DTC']);
    expect(offers[0]).toMatchObject({ unlocked: true, canBuy: false, reason: '현금 부족' });
    h.run.cash = 10000;
    expect(wheelOffers(h)[0].canBuy).toBe(true);
  });

  it('AC-v2-11 쳇바퀴가 없으면 탭은 거절되고 아무것도 벌지 못한다', () => {
    const g = wheelless();
    const r = A(g, { type: 'tap' });
    expect(r).toMatchObject({ ok: false, code: 'nowheel' });
    expect(g.run.cash).toBe(0);
    expect(g.run.minedValue).toBe(0);
    expect(g.run.stats.laborTaps ?? 0).toBe(0);
  });

  it('AC-v2-12 잃은 쳇바퀴를 다시 사면 현금 -10,000, 단계 1, 탭은 코인을 캔다(새로 산 것은 지갑에 쌓인다)', () => {
    const g = wheelless();
    g.run.cash = 12000;
    expect(A(g, { type: 'buyWheel', coin: 'DTC' }).ok).toBe(true);
    expect(g.run.cash).toBe(2000);
    expect(stage(g.run)).toBe(1);
    expect(ownedCoins(g.run)).toEqual(['DTC']);
    expect(g.run.riding).toBe('DTC');
    tickN(g, 1);
    A(g, { type: 'tap' });
    expect(g.run.cash).toBe(2000);
    expect(g.run.wallet.DTC.qty).toBeGreaterThan(0);
    expect(A(g, { type: 'buyWheel', coin: 'DTC' }).ok).toBe(false); // 이미 있다
  });

  it('AC-v2-12 현금이 모자라면 못 산다', () => {
    const g = wheelless();
    g.run.cash = 9999;
    const r = A(g, { type: 'buyWheel', coin: 'DTC' });
    expect(r.ok).toBe(false);
    expect(wheelStatus(g, 'DTC').reason).toBe('현금 부족');
  });

  it('AC-v2-13 초당 1.5회로 한 정산(60초, U-47) 동안 굴리면 90번 × 2 × 0.995 = 179 (이자 1,500 에 한참 못 미친다)', () => {
    const g = fresh();
    for (let s = 0; s < 59; s++) {
      tapN(g, s % 2 === 0 ? 2 : 1);
      tickN(g, 1);
    }
    tapN(g, 1);
    // 59 초 * 1.5 = 88.5 -> 마지막 초의 1.5 를 채워 90
    tapN(g, 90 - g.run.stats.laborTaps);
    expect(g.run.stats.laborTaps).toBe(90);
    expect(g.run.cash).toBe(Math.floor(90 * 2 * 0.995)); // 179
    expect(g.run.minedValue).toBe(180);
  });

  it('AC-v2-14 → U-58 어느 단계든 8시간 비워도 정산 0회(현금, 빚, 남은 초 그대로)', () => {
    for (const g of [wheelless(), fresh(), (() => { const h = fresh(); h.run.cash = 100000; h.family.tree.idle = 2; return h; })()]) {
      g.run.settleIn = 37;
      const snap = JSON.stringify([g.run.cash, g.run.debts, g.run.settleNo, g.run.settleIn]);
      g.run.lastSeenTick = 100000;
      const rep = catchUp(g, flatBars(g, 480), 8 * 3600);
      expect(rep.economySettlements).toBe(0);
      expect(JSON.stringify([g.run.cash, g.run.debts, g.run.settleNo, g.run.settleIn])).toBe(snap);
    }
  });

  it('AC-v2-15 빌리지 않고 초당 1.5회로 굴리기만 하면: 첫 정산 연체·딱지, 둘째 정산에 쳇바퀴 압류, 셋째 정산에 파산', () => {
    const g = fresh();
    const round = () => {
      for (let t = 0; t < 60; t++) {
        for (let k = 0; k < (t % 2 === 0 ? 2 : 1); k++) stepMut(g, { type: 'action', action: { type: 'tap' } });
        tickN(g, 1);
      }
    };
    round();
    // 번 179 는 전부 이자로. 못 낸 1,321 은 원금에, 생활비 330 은 캐피탈로(U-47: 정산 60초)
    expect(g.run.settleNo).toBe(1);
    expect(g.run.cash).toBe(0);
    expect(g.run.debts.shark1).toMatchObject({ principal: 300000 + 1500 - 179, overdue: 1 });
    expect(g.run.debts.capital.principal).toBe(330);
    expect(g.run.coinWheels.DTC.tagBy).toBe('shark1');
    round();
    expect(g.run.settleNo).toBe(2);
    expect(g.run.over).toBe(false);
    expect(ownedCoins(g.run)).toEqual([]); // 엄마의 쳇바퀴가 실려 갔다
    expect(g.run.stats.assetsSeized).toBe(1);
    round();
    expect(g.run.over).toBe(true);
    expect(g.run.settleNo).toBe(3);
  });

  it('AC-v2-16 누적 채굴 19,999 면 밤더리움 쳇바퀴가 잠겨 있고 조건·현재 값이 보인다. 20,000 이면 30,000 에 산다', () => {
    const g = fresh();
    g.run.cash = 50000;
    g.run.minedValue = 19999;
    const s = wheelStatus(g, 'BTH');
    expect(s.visible).toBe(true);
    expect(s.canBuy).toBe(false);
    expect(s.progress).toEqual({ current: 19999, need: 20000 });
    expect(s.reason).toContain('20,000');
    g.run.minedValue = 20000;
    expect(wheelStatus(g, 'BTH').canBuy).toBe(true);
    expect(A(g, { type: 'buyWheel', coin: 'BTH' }).ok).toBe(true);
    expect(g.run.cash).toBe(20000);
  });

  it('AC-v2-17 빈 오두막이면 삼솔전자 쳇바퀴는 내 집이 없어 잠기고, 누적 채굴 50,000 이면 멍도토(15,000)가 열린다', () => {
    const g = fresh();
    g.run.cash = 200000;
    g.run.minedValue = 60000;
    const sms = wheelStatus(g, 'SMS');
    expect(sms.canBuy).toBe(false);
    expect(sms.reason).toBe('내 집이 필요합니다(통나무집 이상)');
    g.run.house = 1;
    expect(wheelStatus(g, 'SMS').canBuy).toBe(true);
    const h = fresh();
    h.run.cash = 100000;
    h.run.minedValue = 49999;
    expect(wheelStatus(h, 'MDT').canBuy).toBe(false);
    h.run.minedValue = 50000;
    expect(wheelStatus(h, 'MDT').canBuy).toBe(true);
    A(h, { type: 'buyWheel', coin: 'MDT' });
    expect(h.run.cash).toBe(100000 - 15000);
    void giveEquip;
    void settleOnce;
    void giveWheel;
  });

  it('AC-v2-114(일부) 선행 학습 2단계: 밤더리움 12,000, 멍도토(선물 계좌 조건) 30,000 기준', () => {
    const g = fresh();
    g.family.tree.prep = 2;
    expect(wheelStatus(g, 'BTH').progress!.need).toBe(12000);
    expect(wheelStatus(g, 'MDT').progress!.need).toBe(30000);
  });
});

import { describe, it, expect } from 'vitest';
import { A, fresh, giveEquip, giveWheel, settleOnce, tapN, tickN } from './helpers';
import { stage } from '../../src/engine/selectors';
import { wheelOffers, wheelStatus } from '../../src/engine/progression';
import { economyCatchUp, offlineSettlementBudget } from '../../src/engine/offline';
import { stepMut } from '../../src/engine/game';

describe('B. 진행 단계·도토리 줍기', () => {
  it('AC-v2-09 단계 0: 1번 누르면 현금 +27, 지갑 변화 없음', () => {
    const g = fresh();
    A(g, { type: 'tap' });
    expect(g.run.cash).toBe(100027);
    expect(Object.keys(g.run.wallet)).toHaveLength(0);
  });

  it('AC-v2-10 1초 안에 20번 누르면 12번만 인정', () => {
    const g = fresh();
    for (let i = 0; i < 20; i++) A(g, { type: 'tap' });
    expect(g.run.cash).toBe(100000 + 12 * 27);
    expect(g.run.stats.laborTaps).toBe(12);
    tickN(g, 1);
    A(g, { type: 'tap' });
    expect(g.run.stats.laborTaps).toBe(13);
  });

  it('AC-v2-11 줍기 199회엔 구매 버튼이 없고 200회에 팻말 + [도토코인 쳇바퀴 10,000] + 안내 말풍선 한 번', () => {
    const g = fresh();
    tapN(g, 199);
    expect(g.run.acornTaps).toBe(199);
    expect(wheelOffers(g)).toHaveLength(0);
    expect(g.run.notices.some((n) => n.id === 'hint:firstWheel')).toBe(false);
    tapN(g, 1);
    const offers = wheelOffers(g);
    expect(offers.map((o) => o.coin)).toEqual(['DTC']);
    expect(offers[0].canBuy).toBe(true);
    expect(g.run.notices.filter((n) => n.id === 'sign:wheel')).toHaveLength(1);
    expect(g.run.notices.filter((n) => n.id === 'hint:firstWheel')).toHaveLength(1);
    tapN(g, 30);
    expect(g.run.notices.filter((n) => n.id === 'hint:firstWheel')).toHaveLength(1);
  });

  it('AC-v2-12 쳇바퀴를 사면 현금 -10,000, 단계 1, 지갑 알약 생김, 탭은 코인을 캔다', () => {
    const g = fresh();
    tapN(g, 200);
    const before = g.run.cash;
    expect(A(g, { type: 'buyWheel', coin: 'DTC' }).ok).toBe(true);
    expect(g.run.cash).toBe(before - 10000);
    expect(stage(g.run)).toBe(1);
    expect(g.run.wallet.DTC).toBeDefined();
    const cash = g.run.cash;
    tickN(g, 1);
    A(g, { type: 'tap' });
    expect(g.run.cash).toBe(cash);
    expect(g.run.wallet.DTC.qty).toBeGreaterThan(0);
  });

  it('AC-v2-12 현금이 모자라면 못 산다', () => {
    const g = fresh();
    tapN(g, 200);
    g.run.cash = 9999;
    const r = A(g, { type: 'buyWheel', coin: 'DTC' });
    expect(r.ok).toBe(false);
    expect(wheelStatus(g, 'DTC').reason).toBe('현금 부족');
  });

  it('AC-v2-13 초당 1.5회로 한 정산 동안 줍으면 7,290', () => {
    const g = fresh();
    const c0 = g.run.cash;
    for (let s = 0; s < 179; s++) {
      tapN(g, s % 2 === 0 ? 2 : 1);
      tickN(g, 1);
    }
    tapN(g, 1);
    // 179 초 * 1.5 = 268.5 -> 마지막 초의 1.5 를 채워 270
    tapN(g, 270 - g.run.stats.laborTaps);
    expect(g.run.stats.laborTaps).toBe(270);
    expect(g.run.cash - c0).toBe(7290);
  });

  it('AC-v2-14 단계 0 에서 8시간 뒤 돌아와도 정산은 0회(현금·빚 그대로)', () => {
    const g = fresh();
    const snap = JSON.stringify([g.run.cash, g.run.debts]);
    expect(offlineSettlementBudget(g)).toBe(0);
    expect(economyCatchUp(g, 8 * 3600)).toBe(0);
    expect(JSON.stringify([g.run.cash, g.run.debts])).toBe(snap);
    expect(g.run.settleNo).toBe(0);
  });

  it('AC-v2-92(경제 부분) 단계 1 은 8시간 뒤 정산 2회분만, idle 2단계면 4회분', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    expect(offlineSettlementBudget(g)).toBe(2);
    expect(economyCatchUp(g, 8 * 3600)).toBe(2);
    expect(g.run.settleNo).toBe(2);
    const h = fresh();
    giveWheel(h, 'DTC');
    h.family.tree.idle = 2;
    expect(offlineSettlementBudget(h)).toBe(4);
    expect(economyCatchUp(h, 8 * 3600)).toBe(4);
  });

  it('AC-v2-15 2세대 시작, 단계 0, 초당 1.5회, 접속 중 정산만: 30번째 정산까지 연체 없음', () => {
    const g = fresh();
    for (let s = 0; s < 30; s++) {
      for (let t = 0; t < 180; t++) {
        for (let k = 0; k < (t % 2 === 0 ? 2 : 1); k++) stepMut(g, { type: 'action', action: { type: 'tap' } });
        tickN(g, 1);
      }
      expect(Object.values(g.run.debts).every((d) => d.overdue === 0)).toBe(true);
      expect(g.run.over).toBe(false);
    }
    expect(g.run.settleNo).toBe(30);
    expect(g.run.cash).toBe(100000 - 2710 * 30);
    expect(g.run.cash).toBeGreaterThan(0);
  });

  it('AC-v2-16 누적 채굴 19,999 면 밤더리움 쳇바퀴가 잠겨 있고 조건·현재 값이 보인다. 20,000 이면 30,000 에 산다', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
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

  it('AC-v2-17 텐트면 삼솔전자 쳇바퀴는 주소지로 잠기고, 누적 채굴 50,000 이면 멍도토(15,000)가 열린다', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    g.run.cash = 200000;
    g.run.minedValue = 60000;
    const sms = wheelStatus(g, 'SMS');
    expect(sms.canBuy).toBe(false);
    expect(sms.reason).toBe('주소지가 필요합니다(오두막 이상)');
    g.run.house = 1;
    expect(wheelStatus(g, 'SMS').canBuy).toBe(true);
    const h = fresh();
    giveWheel(h, 'DTC');
    h.run.cash = 100000;
    h.run.minedValue = 49999;
    expect(wheelStatus(h, 'MDT').canBuy).toBe(false);
    h.run.minedValue = 50000;
    expect(wheelStatus(h, 'MDT').canBuy).toBe(true);
    A(h, { type: 'buyWheel', coin: 'MDT' });
    expect(h.run.cash).toBe(100000 - 15000);
    void giveEquip;
    void settleOnce;
  });

  it('AC-v2-114(일부) 선행 학습 2단계: 밤더리움 12,000, 멍도토(선물 계좌 조건) 30,000 기준', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    g.family.tree.prep = 2;
    expect(wheelStatus(g, 'BTH').progress!.need).toBe(12000);
    expect(wheelStatus(g, 'MDT').progress!.need).toBe(30000);
  });
});

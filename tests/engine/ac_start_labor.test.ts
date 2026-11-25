import { describe, it, expect } from 'vitest';
import { fresh } from './helpers';
import { tick, clone } from '../../src/engine/game';
import { settle } from '../../src/engine/settlement';
import { doLabor } from '../../src/engine/actions';
import { labor } from '../../src/engine/labor';
import { netWorth, currentJob } from '../../src/engine/selectors';

describe('시작·시간', () => {
  it('AC-01 시작 상태', () => {
    const g = fresh();
    expect(g.run.cash).toBe(100000);
    expect(g.run.debts.capital).toBe(150000);
    expect(g.run.debts.shark1).toBe(150000);
    expect(g.run.debts.bank).toBe(0);
    expect(g.run.debts.shark2).toBe(0);
    expect(g.run.houseStage).toBe(0);
    expect(currentJob(g.run).id).toBe('pickup');
    expect(netWorth(g.run)).toBe(-200000);
  });

  it('AC-02 45틱에 정산 정확히 1번, 타이머 45로 복귀', () => {
    let g = fresh();
    for (let i = 0; i < 44; i++) g = tick(g);
    expect(g.run.cycles).toBe(0);
    expect(g.run.settleIn).toBe(1);
    g = tick(g);
    expect(g.run.cycles).toBe(1);
    expect(g.run.settleIn).toBe(45);
  });

  it('AC-03 같은 시드면 100틱 시세가 같다', () => {
    let a = fresh(777);
    let b = fresh(777);
    for (let i = 0; i < 100; i++) {
      a = tick(a);
      b = tick(b);
    }
    for (const id of Object.keys(a.run.markets)) expect(a.run.markets[id].hist).toEqual(b.run.markets[id].hist);
    const c = (() => {
      let x = fresh(778);
      for (let i = 0; i < 100; i++) x = tick(x);
      return x;
    })();
    expect(c.run.markets.DTC.price).not.toBe(a.run.markets.DTC.price);
  });
});

describe('노동', () => {
  it('AC-04 노동 1회: 현금 +60, laborTaps +1', () => {
    const r = doLabor(fresh(), 1000);
    expect(r.s.run.cash).toBe(100060);
    expect(r.s.run.stats.laborTaps).toBe(1);
  });

  it('AC-05 1초에 20번 눌러도 12번만 인정', () => {
    const g = fresh();
    for (let i = 0; i < 20; i++) labor(g, 5000 + i * 10);
    expect(g.run.stats.laborTaps).toBe(12);
    labor(g, 6100); // 1초가 지나면 다시 인정
    expect(g.run.stats.laborTaps).toBe(13);
  });

  it('AC-06 노동 150회째에 전단지 돌리기로 바뀌고 다음부터 +90', () => {
    const g = fresh();
    g.run.stats.laborTaps = 149;
    labor(g, 1000);
    expect(g.run.jobId).toBe('flyer');
    const before = g.run.cash;
    labor(g, 5000);
    expect(g.run.cash - before).toBe(90);
  });

  it('AC-07 급여는 이자 납부 전에 들어온다', () => {
    const g = fresh();
    g.run.jobId = 'flyer';
    g.run.cash = 0;
    settle(g);
    // 급여 1,500 이 먼저 들어와 오소리 이자(6,000) 중 1,500 을 냈다
    expect(g.run.debts.shark1).toBe(150000 + 4500);
    expect(g.run.cash).toBe(0);
  });

  it('AC-08 오소리 연체 중 노동 수입 30% 차압', () => {
    const g = fresh();
    g.run.streak.shark1 = 1;
    g.run.jobId = 'pickup';
    // 100 을 버는 상황을 만들기 위해 수입 함수를 직접 쓴다
    const before = clone(g);
    g.run.debts.shark1 = 150000;
    // 60 짜리 노동 하나로도 비율 확인
    labor(g, 1000);
    expect(g.run.cash - before.run.cash).toBe(60 - 18);
    expect(g.run.debts.shark1).toBe(150000 - 18);
    expect(g.run.stats.garnished).toBe(18);
  });

  it('AC-08 수입 100 → 현금 +70, 원금 -30', async () => {
    const { earn } = await import('../../src/engine/labor');
    const g = fresh();
    g.run.streak.shark1 = 1;
    const c = g.run.cash;
    earn(g.run, g, 100);
    expect(g.run.cash - c).toBe(70);
    expect(g.run.debts.shark1).toBe(149970);
    expect(g.run.stats.garnished).toBe(30);
  });
});

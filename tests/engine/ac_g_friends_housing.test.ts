import { describe, it, expect } from 'vitest';
import { A, bare, settleOnce } from './helpers';
import { lenderLimit } from '../../src/engine/selectors';
import { houseDefs, balance } from '../../src/engine/data';
import { livingDue } from '../../src/engine/selectors';

describe('G. 친구·집', () => {
  it('AC-v2-74 신뢰 100 에서 곰 형에게 빌리면 현금 +300,000, 신뢰 80. 신뢰 40 미만이면 거절(refused:friend)', () => {
    const g = bare();
    const c0 = g.run.cash;
    expect(A(g, { type: 'borrowFriend', friend: 'bear' }).ok).toBe(true);
    expect(g.run.cash - c0).toBe(300000);
    expect(g.run.friends.bear.trust).toBe(80);
    g.run.friends.fox.trust = 39;
    const r = A(g, { type: 'borrowFriend', friend: 'fox' });
    expect(r.ok).toBe(false);
    expect(g.run.eventLog[g.run.eventLog.length - 1].kind).toBe('refused:friend');
    g.run.friends.fox.trust = 40;
    expect(A(g, { type: 'borrowFriend', friend: 'fox' }).ok).toBe(true);
  });

  it('AC-v2-74 한도: 곰 형은 60만까지', () => {
    const g = bare();
    A(g, { type: 'borrowFriend', friend: 'bear' });
    A(g, { type: 'borrowFriend', friend: 'bear' });
    expect(g.run.friends.bear.debt).toBe(600000);
    expect(A(g, { type: 'borrowFriend', friend: 'bear' }).ok).toBe(false);
  });

  it('AC-v2-75 빌린 지 정산 5회가 지났고 잔액이 있으면 정산마다 신뢰 -20, friendOd +1', () => {
    const g = bare();
    A(g, { type: 'borrowFriend', friend: 'squirrel' }); // 신뢰 80, 갚기로 한 날 = 정산 5
    settleOnce(g, 5);
    expect(g.run.friends.squirrel.trust).toBe(80);
    expect(g.run.stats.friendOd).toBe(0);
    settleOnce(g);
    expect(g.run.friends.squirrel.trust).toBe(60);
    expect(g.run.stats.friendOd).toBe(1);
    settleOnce(g);
    expect(g.run.friends.squirrel.trust).toBe(40);
  });

  it('AC-v2-76 너구리 신뢰 0 이하: 절교, 남은 빚이 선이자 없이 독사 원금으로 옮겨지고 독사 골목이 열린다. 다람쥐는 빚을 지운다', () => {
    const g = bare();
    g.run.friends.raccoon = { ...g.run.friends.raccoon, trust: 10, debt: 50000, dueAt: 0, everBorrowed: true };
    g.run.friends.squirrel = { ...g.run.friends.squirrel, trust: 10, debt: 25000, dueAt: 0, everBorrowed: true };
    expect(g.run.shark2Open).toBe(false);
    settleOnce(g);
    expect(g.run.friends.raccoon.broken).toBe(true);
    expect(g.run.friends.raccoon.debt).toBe(0);
    expect(g.run.debts.shark2.principal).toBe(50000);
    expect(g.run.stats.claimsSold).toBe(50000);
    expect(g.run.shark2Open).toBe(true);
    expect(g.run.friends.squirrel.broken).toBe(true);
    expect(g.run.friends.squirrel.debt).toBe(0);
    expect(g.run.stats.broken).toEqual(['squirrel', 'raccoon'].sort((a, b) => ['squirrel', 'raccoon'].indexOf(a) - ['squirrel', 'raccoon'].indexOf(b)));
    expect(A(g, { type: 'borrowFriend', friend: 'raccoon' }).code).toBe('broken');
  });

  it('AC-v2-77 절교 3명이면 다음 정산에 FRIEND 로 파산', () => {
    const g = bare();
    for (const id of ['squirrel', 'raccoon', 'rabbit']) g.run.friends[id].broken = true;
    settleOnce(g);
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy!.cause).toBe('FRIEND');
  });

  it('AC-v2-78 텐트, 현금 500,000 에서 오두막으로 이사: 현금 0, 생활비 8,000, 조합 한도 400,000, 마을 색감이 바뀐다', () => {
    const g = bare();
    g.run.cash = 500000;
    const mood0 = houseDefs[g.run.house].villageMood;
    expect(A(g, { type: 'move', to: 1 }).ok).toBe(true);
    expect(g.run.cash).toBe(0);
    expect(livingDue(g)).toBe(8000);
    expect(balance.living.byHouse[1]).toBe(8000);
    expect(lenderLimit(g, 'bank')).toBe(400000);
    expect(houseDefs[g.run.house].villageMood).not.toBe(mood0);
  });

  it('AC-v2-78 현금이 모자라면 이사 못 간다', () => {
    const g = bare();
    g.run.cash = 499999;
    expect(A(g, { type: 'move', to: 1 }).ok).toBe(false);
  });

  it('AC-v2-79 창고(평가액 200만)에서 오두막으로: 현금 +1,300,000', () => {
    const g = bare();
    g.run.house = 2;
    g.run.cash = 0;
    expect(A(g, { type: 'move', to: 1 }).ok).toBe(true);
    expect(g.run.cash).toBe(1300000);
  });

  it('이사 뒤 조합 원금이 새 한도를 넘으면 막힌다', () => {
    const g = bare();
    g.run.house = 2;
    g.run.debts.bank.principal = 1_000_000;
    g.run.cash = 0;
    const r = A(g, { type: 'move', to: 1 });
    expect(r.ok).toBe(false);
    expect(g.run.house).toBe(2);
  });
});

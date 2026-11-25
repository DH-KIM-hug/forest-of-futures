import { describe, it, expect } from 'vitest';
import { fresh } from './helpers';
import { settle } from '../../src/engine/settlement';
import { borrow, stamp, stampAmount } from '../../src/engine/loans';
import { borrowFriend } from '../../src/engine/friends';
import { moveTo } from '../../src/engine/housing';
import { doView } from '../../src/engine/actions';
import { isShark2Unlocked, refreshLatches, lenderLimit, houseValueForNetWorth, currentJobId, netWorth } from '../../src/engine/selectors';
import { houses } from '../../src/engine/data';
import type { GameState } from '../../src/engine/types';

const rich = (g: GameState) => {
  g.run.cash = 100_000_000;
  return g;
};

describe('대출·도장', () => {
  it('AC-10 텐트에서 1금융 대출은 거절된다', () => {
    const g = fresh();
    const r = borrow(g, 'bank');
    expect(r.ok).toBe(false);
    expect(r.msg).toBe('고객님, 담보가 확인되지 않습니다.');
    expect(g.run.cash).toBe(100000);
    expect(g.run.stats.bankRefusals).toBe(1);
  });

  it('AC-11 오두막, 1금융 원금 400,000 이면 거절(한도 400,000)', () => {
    const g = fresh();
    g.run.houseStage = 1;
    g.run.debts.bank = 400000;
    expect(lenderLimit(g.run, 'bank')).toBe(400000);
    const r = borrow(g, 'bank');
    expect(r.ok).toBe(false);
    expect(g.run.debts.bank).toBe(400000);
  });

  it('AC-12 2금융 대출 +50,000', () => {
    const g = fresh();
    const r = borrow(g, 'capital');
    expect(r.ok).toBe(true);
    expect(g.run.cash).toBe(150000);
    expect(g.run.debts.capital).toBe(200000);
    expect(g.run.stats.borrowCapital).toBe(1);
  });

  it('AC-13 독사 첫 대출: 현금 +120,000, 원금 +200,000, 선이자 80,000', () => {
    const g = fresh();
    g.run.stats.odTotal = 1;
    const r = borrow(g, 'shark2');
    expect(r.ok).toBe(true);
    expect(g.run.cash).toBe(220000);
    expect(g.run.debts.shark2).toBe(200000);
    expect(g.run.stats.upfrontPaid).toBe(80000);
  });

  it('AC-14 독사 두 번째 대출은 연락처 제출 동의가 있어야 한다', () => {
    const g = fresh();
    g.run.stats.odTotal = 1;
    borrow(g, 'shark2');
    const cash = g.run.cash;
    const no = borrow(g, 'shark2', false);
    expect(no.ok).toBe(false);
    expect(g.run.cash).toBe(cash);
    expect(g.run.stats.contactsSeized).toBe(false);
    const yes = borrow(g, 'shark2', true);
    expect(yes.ok).toBe(true);
    expect(g.run.stats.contactsSeized).toBe(true);
  });

  it('AC-15 독사 골목: 잠김 -> 연체 1번이면 열리고 계속 열려 있다', () => {
    const g = fresh();
    expect(isShark2Unlocked(g.run)).toBe(false);
    expect(borrow(g, 'shark2').ok).toBe(false);
    g.run.stats.odTotal = 1;
    refreshLatches(g.run);
    expect(g.run.shark2Open).toBe(true);
    g.run.stats.odTotal = 0;
    expect(isShark2Unlocked(g.run)).toBe(true);
  });

  it('AC-15 총부채 50만 이상 / 채권 양도로도 열린다', () => {
    const g = fresh();
    g.run.debts.capital = 350000;
    expect(isShark2Unlocked(g.run)).toBe(true);
    const h = fresh();
    h.run.stats.claimsSold = 1;
    expect(isShark2Unlocked(h.run)).toBe(true);
  });

  it('AC-16 도장 x1: 현금 25,000 -> 15,000, 원금 -10,000, stamps +1', () => {
    const g = fresh();
    g.run.cash = 25000;
    const r = stamp(g, 'shark1', 1);
    expect(r.ok).toBe(true);
    expect(g.run.cash).toBe(15000);
    expect(g.run.debts.shark1).toBe(140000);
    expect(g.run.stats.stamps).toBe(1);
  });

  it('AC-17 현금이 도장액보다 적으면 도장은 꺼진다(현금 부족)', () => {
    const g = fresh();
    g.run.cash = 5000;
    expect(stampAmount(5000, 150000, 10000, 1)).toBe(0);
    const r = stamp(g, 'shark1', 1);
    expect(r.ok).toBe(false);
    expect(r.msg).toBe('현금 부족');
    expect(g.run.debts.shark1).toBe(150000);
  });

  it('AC-18 원금 7,000 < 도장액 10,000: 7,000만 빠지고 완납', () => {
    const g = fresh();
    g.run.debts.shark1 = 7000;
    g.run.cash = 50000;
    const r = stamp(g, 'shark1', 1);
    expect(r.paid).toBe(7000);
    expect(r.cleared).toBe(true);
    expect(g.run.debts.shark1).toBe(0);
    expect(g.run.cash).toBe(43000);
    expect(g.run.stampFlash?.lender).toBe('shark1');
  });

  it('AC-19 전액: 현금 80,000, 원금 150,000 -> 현금 0, 원금 70,000', () => {
    const g = fresh();
    g.run.cash = 80000;
    stamp(g, 'shark1', 'all');
    expect(g.run.cash).toBe(0);
    expect(g.run.debts.shark1).toBe(70000);
  });

  it('AC-20 (엔진 부분) 건물을 누르면 위치가 바뀐다', () => {
    const g = fresh();
    expect(g.run.view.location).toBe('work');
    const r = doView(g, { location: 'capital' });
    expect(r.s.run.view.location).toBe('capital');
  });
});

describe('친구', () => {
  it('AC-21 너구리 빌리기: +50,000, 잔액 50,000, 신뢰 80', () => {
    const g = fresh();
    const r = borrowFriend(g, 'raccoon');
    expect(r.ok).toBe(true);
    expect(g.run.cash).toBe(150000);
    expect(g.run.friends.raccoon.debt).toBe(50000);
    expect(g.run.friends.raccoon.trust).toBe(80);
  });

  it('AC-22 신뢰 39 면 거절, friendRefusals +1', () => {
    const g = fresh();
    g.run.friends.raccoon.trust = 39;
    const r = borrowFriend(g, 'raccoon');
    expect(r.ok).toBe(false);
    expect(g.run.stats.friendRefusals).toBe(1);
    expect(g.run.cash).toBe(100000);
  });

  it('AC-23 빌린 뒤 정산 5번은 무사, 6번째에 신뢰 -20 / odFriends +1', () => {
    const g = rich(fresh());
    borrowFriend(g, 'raccoon');
    expect(g.run.friends.raccoon.trust).toBe(80);
    for (let i = 0; i < 5; i++) settle(g);
    expect(g.run.friends.raccoon.trust).toBe(80);
    expect(g.run.stats.odFriends).toBe(0);
    settle(g);
    expect(g.run.friends.raccoon.trust).toBe(60);
    expect(g.run.stats.odFriends).toBe(1);
  });

  it('AC-24 너구리 절교: 채권이 독사로 넘어가고 독사 골목이 열린다', () => {
    const g = rich(fresh());
    const f = g.run.friends.raccoon;
    f.debt = 50000;
    f.trust = 20;
    f.dueAt = 0;
    settle(g);
    expect(f.broken).toBe(true);
    expect(f.debt).toBe(0);
    expect(g.run.debts.shark2).toBe(50000);
    expect(g.run.stats.claimsSold).toBe(50000);
    expect(g.run.shark2Open).toBe(true);
    expect(borrowFriend(g, 'raccoon').ok).toBe(false);
  });

  it('AC-25 단짝 다람쥐 절교: 빚이 지워지고 독사 원금은 그대로', () => {
    const g = rich(fresh());
    const f = g.run.friends.squirrel;
    f.debt = 25000;
    f.trust = 20;
    f.dueAt = 0;
    settle(g);
    expect(f.broken).toBe(true);
    expect(f.debt).toBe(0);
    expect(g.run.debts.shark2).toBe(0);
  });

  it('AC-26 연락처 추심: 독사 연체 중이면 정산마다 모든 친구 신뢰 -30', () => {
    const g = fresh();
    g.run.stats.contactsSeized = true;
    g.run.debts.shark2 = 100000;
    g.run.cash = 0;
    settle(g);
    expect(g.run.streak.shark2).toBe(1);
    for (const id of ['squirrel', 'raccoon', 'rabbit', 'fox', 'bear']) expect(g.run.friends[id].trust).toBe(70);
  });

  it('AC-27 절교 3명이면 다음 정산에서 friends 파산', () => {
    const g = rich(fresh());
    for (const id of ['squirrel', 'raccoon', 'rabbit']) g.run.friends[id].broken = true;
    g.run.stats.friendsBroken = 3;
    settle(g);
    expect(g.run.over).toBe(true);
    expect(g.pending?.snapshot.cause).toBe('friends');
  });
});

const setHouse = (g: GameState, stage: number) => {
  g.run.houseStage = stage;
  g.run.jobId = currentJobId(g.run);
};

describe('집', () => {
  it('AC-28 텐트 -> 오두막: 현금 0, 단계 1, lastMoveDir up', () => {
    const g = fresh();
    g.run.cash = 500000;
    const r = moveTo(g, 1);
    expect(r.ok).toBe(true);
    expect(g.run.cash).toBe(0);
    expect(g.run.houseStage).toBe(1);
    expect(g.run.stats.lastMoveDir).toBe('up');
  });

  it('AC-29 오두막 -> 창고: 드는 돈 2,000,000 - 450,000', () => {
    const g = fresh();
    setHouse(g, 1);
    g.run.cash = 1_600_000;
    moveTo(g, 2);
    expect(g.run.cash).toBe(1_600_000 - 1_550_000);
  });

  it('AC-30 창고 + 1금융 원금 1,000,000 -> 오두막은 막힌다', () => {
    const g = fresh();
    setHouse(g, 2);
    g.run.debts.bank = 1_000_000;
    const r = moveTo(g, 1);
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('400,000');
    expect(g.run.houseStage).toBe(2);
  });

  it('AC-31 오두막으로 이사하면 협력사 계약직이 현재 일', () => {
    const g = fresh();
    g.run.cash = 500000;
    moveTo(g, 1);
    expect(g.run.jobId).toBe('contract');
  });

  it('AC-32 황금 저택 + 현금 0: 정산 3번에 유지비 연체 파산', () => {
    const g = fresh();
    g.run.debts = { bank: 0, capital: 0, shark1: 0, shark2: 0 };
    g.run.cash = 0;
    setHouse(g, 4);
    expect(g.run.jobId).toBe('fulltime');
    settle(g);
    expect(g.run.upkeepArrears).toBe(400000);
    expect(g.run.cash).toBe(0);
    settle(g);
    expect(g.run.upkeepArrears).toBe(800000);
    expect(g.run.over).toBe(false);
    settle(g);
    expect(g.run.over).toBe(true);
    expect(g.pending?.snapshot.cause).toBe('overdue_upkeep');
  });

  it('AC-33 부동산 하락(x0.7): 1금융 한도 280,000, 순자산의 집 몫 315,000', () => {
    const g = fresh();
    setHouse(g, 1);
    g.run.effects.push({ id: 'housing_slump', type: 'appraisalMultiplier', multiplier: 0.7, remaining: 5 });
    expect(lenderLimit(g.run, 'bank')).toBe(280000);
    expect(houseValueForNetWorth(g.run)).toBe(315000);
    expect(netWorth(g.run)).toBe(100000 + 315000 - 300000);
  });

  it('집 5단계가 data/housing.json 그대로 읽힌다', () => {
    expect(houses.map((h) => h.price)).toEqual([0, 500000, 2000000, 10000000, 50000000]);
  });
});

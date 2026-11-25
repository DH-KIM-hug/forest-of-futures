// 시제품(?proto=1) 읽기 모델과, 시제품이 부르는 행동만으로 한 바퀴(줍기 -> 선물 -> 파산 -> 환생)가 도는지 시험.
import { describe, expect, it } from 'vitest';
import { A, fresh, settleOnce, setRatio, tapN, tickN } from '../engine/helpers';
import { BEAR_MINED, checklist, currentGoal, goalAt, lifeNo, lotRows, perSettle, squirrel, upgRows } from '../../src/ui/proto/model';
import { balance } from '../../src/engine/data';
import { eduNeeded, mockNeeded } from '../../src/engine/progression';

describe('시제품 읽기 모델', () => {
  it('처음: 줄은 잠긴 쳇바퀴 하나, 30번(U-18) 줍으면 사는 줄로 바뀐다', () => {
    const g = fresh();
    expect(lotRows(g).map((r) => r.kind)).toEqual(['locked']);
    expect(lotRows(g)[0].sub).toContain(`/${balance.progression.firstWheelUnlockTaps}회`);
    expect(perSettle(g)).toBeNull();
    tapN(g, balance.progression.firstWheelUnlockTaps);
    const rows = lotRows(g);
    expect(rows[0].kind).toBe('wheel');
    expect(rows[0].canBuy).toBe(true);
  });
  it('쳇바퀴를 사면 설비 줄 하나와 ???? 줄, 목표 사슬이 앞으로 간다', () => {
    const g = fresh();
    tapN(g, 200);
    A(g, { type: 'buyWheel', coin: 'DTC' });
    const rows = lotRows(g);
    expect(rows.map((r) => r.kind)).toEqual(['tier', 'locked']);
    expect(currentGoal(g, 0, { everOpened: false })).toBe(2);
    expect(goalAt(g, 2, { everOpened: false }).done).toBe(false);
  });
  it('계좌 개설 체크리스트(U-22): 네 줄을 실제로 해야 열린다', () => {
    const g = fresh();
    expect(lifeNo(g)).toBe(1);
    tapN(g, 30);
    A(g, { type: 'buyWheel', coin: 'DTC' });
    expect(checklist(g).map((c) => c.ok)).toEqual([false, false, false, false]);
    expect(A(g, { type: 'openAccount' }).ok).toBe(false);
    g.run.minedValue = BEAR_MINED; // 곰 형이 올 만큼 캤어도 채굴 실적(5만)은 아직
    expect(checklist(g)[0].ok).toBe(false);
    g.run.minedValue = balance.progression.futures.minedValueRequired;
    expect(checklist(g)[0].ok).toBe(true);
    expect(A(g, { type: 'openAccount' }).ok).toBe(false); // 교육·모의 전
    for (let i = 0; i < 3; i++) expect(A(g, { type: 'eduPage' }).ok).toBe(true);
    expect(A(g, { type: 'eduPage' }).ok).toBe(false);
    expect(checklist(g).map((c) => c.ok)).toEqual([true, true, false, false]);
    expect(A(g, { type: 'openAccount' }).ok).toBe(false); // 모의 전
    const cash = g.run.cash;
    expect(A(g, { type: 'mockTrade' }).ok).toBe(true);
    expect(g.run.cash).toBe(cash); // 모의 거래는 돈을 움직이지 않는다
    g.run.cash = 100; // 예탁금 모자람
    expect(A(g, { type: 'openAccount' }).ok).toBe(false);
    g.run.cash = balance.progression.futures.depositCheck;
    expect(A(g, { type: 'openAccount' }).ok).toBe(true);
    expect(g.run.cash).toBe(balance.progression.futures.depositCheck); // 잔고만 본다
    expect(goalAt(g, 4, { everOpened: false }).done).toBe(true);
  });
  it('강화 탭은 엔진의 생산 강화만: 쳇바퀴 전에는 장갑, 뒤에는 쳇바퀴·설비 강화', () => {
    const g = fresh();
    expect(upgRows(g).map((r) => r.track)).toEqual(['glove']);
    tapN(g, 30);
    A(g, { type: 'buyWheel', coin: 'DTC' });
    expect(upgRows(g).map((r) => r.track)).toEqual(['oil', 'spokes', 'power', 'fee']);
    A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' });
    g.run.cash = 200000;
    A(g, { type: 'buyEquip', tier: 'helper', coin: 'DTC' });
    expect(upgRows(g).some((r) => r.key === 'tier:helper')).toBe(true);
    const oil = upgRows(g).find((r) => r.track === 'oil')!;
    expect(A(g, { type: 'upgrade', track: oil.track, target: oil.target }).ok).toBe(true);
    expect(upgRows(g).find((r) => r.track === 'oil')!.lv).toBe(1);
  });
  it('다람쥐 상태', () => {
    const g = fresh();
    expect(squirrel(g, true, false)).toBe('줍는 중');
    expect(squirrel(g, false, true)).toBe('폰만 보는 중');
  });
});

describe('시제품 한 바퀴', () => {
  it('줍기 -> 쳇바퀴·설비 -> 계좌 -> 포지션 -> 청산 -> 파산 -> 환생', () => {
    const g = fresh(7);
    tapN(g, 200);
    expect(A(g, { type: 'buyWheel', coin: 'DTC' }).ok).toBe(true);
    A(g, { type: 'autoSell', coin: 'DTC', on: true });
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(true);
    g.run.minedValue += 100000; // 개발 단추(+10만)와 같은 효과
    g.run.cash += 100000;
    for (let i = 0; i < eduNeeded(g); i++) A(g, { type: 'eduPage' });
    if (mockNeeded(g) > 0) A(g, { type: 'mockTrade' });
    expect(A(g, { type: 'openAccount' }).ok).toBe(true);
    const r = A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, marginPct: 100, sl: null, tp: null });
    expect(r.ok).toBe(true);
    setRatio(g, 'DTC', 0.8); // 급락 -> 10배 롱 청산
    tickN(g, 1, { DTC: g.run.prices.DTC });
    expect(Object.keys(g.run.positions)).toHaveLength(0);
    let n = 0;
    while (!g.run.over && n < 40) { settleOnce(g); n++; }
    expect(g.run.over).toBe(true);
    console.log('청산 뒤 파산까지 정산 횟수', n);
    expect(g.estate?.step).toBe('card');
    expect(A(g, { type: 'estateNext' }).ok).toBe(true);
    expect(A(g, { type: 'inherit', branch: 'renounce' }).ok).toBe(true);
    expect(g.estate?.step).toBe('tree');
    expect(A(g, { type: 'nextGeneration' }).ok).toBe(true);
    expect(g.run.over).toBe(false);
    console.log('2생 시작', JSON.stringify(Object.fromEntries(Object.entries(g.run.debts).map(([k, v]) => [k, v.principal]))), 'cash', g.run.cash, 'wheels', Object.keys(g.run.coinWheels), 'han', g.family.han);
  });
});

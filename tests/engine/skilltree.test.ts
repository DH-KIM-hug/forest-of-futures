// 영구 스킬트리: 거래 한 갈래(docs/gdd/SKILLTREE_TRADE.md). 값·효과·조건·재화·엔진 연결.
import { describe, expect, it } from 'vitest';
import { A, bare, fresh, openFutures, settleOnce, tickN } from './helpers';
import { balance, skillById, skillMeta, skillNodes } from '../../src/engine/data';
import {
  activeLevels, applyBirth, buyNode, canBuy, costAt, defaultSl, effectAt, effectiveLevCaps, feeRate, grantAward, has, nextCost,
  nodeEffect, nodeLevel, pickNode, treeAward, treeView,
} from '../../src/engine/skilltree';
import { closeBack, entryFee, levCapNow, liqPrice, marginFromPct, waiverAvailable } from '../../src/engine/futures';
import { declareBankruptcy } from '../../src/engine/bankruptcy';
import { seizeFor } from '../../src/engine/seizure';
import { migrate, serialize } from '../../src/engine/save';
import { orderPreview } from '../../src/ui/vm/trade';
import type { GameState } from '../../src/engine/types';

const T = balance.trading;
const ref = 68000;
/** 이번 생에 켜진 노드를 바로 정한다(가문 값도 같이). */
function on(g: GameState, levels: Record<string, number>): void {
  g.family.skill = { ...levels };
  applyBirth(g);
}
function trader(levels: Record<string, number> = {}): GameState {
  const g = bare();
  openFutures(g);
  on(g, levels);
  return g;
}

describe('스킬트리 데이터', () => {
  it('뿌리 1 + 길 셋 × 5(3단계는 둘로 갈라진다), id 가 겹치지 않는다', () => {
    expect(skillNodes.length).toBe(16);
    expect(new Set(skillNodes.map((n) => n.id)).size).toBe(16);
    for (const p of ['A', 'B', 'C']) {
      const mine = skillNodes.filter((n) => n.path === p);
      expect(mine.map((n) => n.tier).sort()).toEqual([1, 2, 3, 3, 4]);
      expect(mine.filter((n) => n.tier === 1)[0].requires).toEqual(['R']);
      const t3 = mine.filter((n) => n.tier === 3);
      expect(t3[0].pair).toBe(t3[1].id);
      expect(t3[1].pair).toBe(t3[0].id);
      expect(mine.filter((n) => n.tier === 4)[0].requires.sort()).toEqual(t3.map((n) => n.id).sort());
    }
    for (const n of skillNodes) {
      expect(n.openCost).toBe(n.tier === 0 ? 1 : n.tier);
      // U-39 ⑨: 어떤 노드도 레벨의 끝이 없다. 숫자 노드는 cap, 켜고 끄는 노드는 숫자 꼬리(tail.cap)가 상한에 다가간다
      expect(n.maxLevel).toBeUndefined();
      if (n.kind === 'scaled') { expect(n.cap).toBeGreaterThan(0); expect(n.cap).toBeLessThan(1); expect(n.tail).toBeUndefined(); }
      else { expect(n.tail!.cap).toBeGreaterThan(0); expect(n.tail!.text.length).toBeGreaterThan(5); }
      for (const r of n.requires) expect(skillById[r]).toBeDefined();
    }
    expect(skillMeta.levelMul).toBe(1.6);
    expect(skillMeta.decay).toBe(0.85);
    expect(skillMeta.award).toEqual({ per: 50000, clearBonus: 2 });
  });
  it('길 하나를 여는 데 10개, 세 길을 다 여는 데 31개', () => {
    const open = (ids: string[]) => ids.reduce((a, id) => a + skillById[id].openCost, 0);
    expect(open(['A1', 'A2', 'A3a', 'A4'])).toBe(10);
    expect(open(['R', 'A1', 'A2', 'A3a', 'A4', 'B1', 'B2', 'B3a', 'B4', 'C1', 'C2', 'C3a', 'C4'])).toBe(31);
  });
});

describe('값과 효과', () => {
  it('열기 = openCost, 레벨 n→n+1 = ceil(openCost × 1.6^n)', () => {
    const a1 = skillById.A1, a4 = skillById.A4;
    expect([0, 1, 2, 3, 4].map((l) => costAt(a1, l))).toEqual([1, 2, 3, 5, 7]);
    expect([0, 1, 2, 3].map((l) => costAt(a4, l))).toEqual([4, 7, 11, 17]);
    expect(costAt(a1, 10)).toBe(Math.ceil(1.6 ** 10));
  });
  it('효과 = 상한 × (1 − 0.85^레벨): 다가갈 뿐 닿지 않는다', () => {
    const a1 = skillById.A1;
    expect(effectAt(a1, 0)).toBe(0);
    expect(effectAt(a1, 1)).toBeCloseTo(0.075, 6);
    expect(effectAt(a1, 5)).toBeCloseTo(0.5 * (1 - 0.85 ** 5), 9);
    expect(effectAt(a1, 10)).toBeCloseTo(0.4016, 3);
    let prev = 0;
    for (let l = 1; l <= 200; l++) { const e = effectAt(a1, l); expect(e).toBeGreaterThanOrEqual(prev); expect(e).toBeLessThanOrEqual(0.5); prev = e; }
    expect(effectAt(a1, 30)).toBeLessThan(0.5);
    expect(effectAt(skillById.A2, 1)).toBe(1);
  });
});

describe('사기·고르기', () => {
  it('앞 노드가 있어야 하고, 황금 도토코인이 있어야 한다', () => {
    const g = fresh();
    expect(canBuy(g, 'R').ok).toBe(false); // 재화 0
    g.family.gold = 3;
    expect(canBuy(g, 'A1').ok).toBe(false); // 뿌리 먼저
    expect(buyNode(g, 'R').ok).toBe(true);
    expect(g.family.gold).toBe(2);
    expect(nextCost(g, 'R')).toBe(2); // 켜고 끄는 노드도 레벨이 이어진다(U-39 ⑨): 1 × 1.6 올림
    g.family.gold = 0;
    expect(buyNode(g, 'R').ok).toBe(false); // 재화가 모자라다
    g.family.gold = 2;
    expect(buyNode(g, 'A2').ok).toBe(false); // A1 먼저
    expect(buyNode(g, 'A1').ok).toBe(true);
    expect(nodeLevel(g, 'A1')).toBe(1);
    expect(nextCost(g, 'A1')).toBe(2);
    expect(buyNode(g, 'A1').ok).toBe(false); // 1개 남음, 값 2
    expect(g.family.gold).toBe(1);
    expect(buyNode(g, 'nope').ok).toBe(false);
  });
  it('scaled 노드는 끝없이 오른다', () => {
    const g = fresh();
    g.family.gold = 1e9;
    buyNode(g, 'R');
    for (let i = 0; i < 40; i++) expect(buyNode(g, 'A1').ok).toBe(true);
    expect(nodeLevel(g, 'A1')).toBe(40);
    expect(nextCost(g, 'A1')).toBe(costAt(skillById.A1, 40));
  });
  it('3단계는 둘 다 살 수 있지만 한 생에 하나만 켜진다. 4단계는 둘 중 하나만 있으면 열린다', () => {
    const g = fresh();
    g.family.gold = 100;
    for (const id of ['R', 'A1', 'A2']) buyNode(g, id);
    expect(canBuy(g, 'A4').ok).toBe(false);
    expect(pickNode(g, 'A3a').ok).toBe(false); // 아직 없음
    expect(buyNode(g, 'A3b').ok).toBe(true);
    expect(g.family.skillPick.A).toBe('A3b');
    expect(buyNode(g, 'A4').ok).toBe(true);
    expect(buyNode(g, 'A3a').ok).toBe(true);
    expect(g.family.skillPick.A).toBe('A3a'); // 방금 산 것이 고른 것
    expect(activeLevels(g).A3a).toBe(1);
    expect(activeLevels(g).A3b).toBeUndefined();
    expect(pickNode(g, 'A3b').ok).toBe(true);
    expect(activeLevels(g).A3b).toBe(1);
    expect(activeLevels(g).A3a).toBeUndefined();
    expect(pickNode(g, 'A1').ok).toBe(false);
    const v = treeView(g);
    expect(v.find((n) => n.id === 'A3a')!.picked).toBe(false);
    expect(v.find((n) => n.id === 'A3b')!.picked).toBe(true);
    expect(v.find((n) => n.id === 'A1')!.nextEffect).toBeCloseTo(effectAt(skillById.A1, 2), 9);
  });
  it('그 생에 산 노드는 다음 생부터 켜진다(has 는 이번 생에 켜진 것만)', () => {
    const g = fresh();
    g.family.gold = 10;
    buyNode(g, 'R');
    buyNode(g, 'A1');
    expect(nodeLevel(g, 'A1')).toBe(1);
    expect(has(g, 'A1')).toBe(false);
    expect(nodeEffect(g, 'A1')).toBe(0);
    expect(feeRate(g, 10)).toBe(T.feeRate);
    applyBirth(g);
    expect(has(g, 'A1')).toBe(true);
    expect(nodeEffect(g, 'A1')).toBeCloseTo(0.075, 6);
  });
  it('treeBuy · treePick 행동은 환생 화면(estate)에서만', () => {
    const g = bare();
    g.family.gold = 5;
    expect(A(g, { type: 'treeBuy', id: 'R' }).ok).toBe(false);
    expect(g.family.gold).toBe(5);
    declareBankruptcy(g, { lastLender: 'shark1', shortfall: 1 });
    expect(g.estate).not.toBeNull();
    expect(A(g, { type: 'treeBuy', id: 'R' }).ok).toBe(true);
    for (const id of ['B1', 'B2', 'B3a']) expect(A(g, { type: 'treeBuy', id }).ok).toBe(id !== 'B3a'); // 5 − 1 − 1 − 2 = 1 < 3
    g.family.gold = 6;
    expect(A(g, { type: 'treeBuy', id: 'B3a' }).ok).toBe(true);
    expect(A(g, { type: 'treeBuy', id: 'B3b' }).ok).toBe(true);
    expect(A(g, { type: 'treePick', id: 'B3a' }).ok).toBe(true);
    expect(g.family.skillPick.B).toBe('B3a');
  });
});

describe('재화: 갚은 원금 5만당 1개', () => {
  it('오소리에게 갚은 원금만 센다. 다 갚으면 +2', () => {
    const g = fresh();
    expect(treeAward(g.run)).toBe(0);
    g.run.stats['repaid.shark1'] = 49999;
    expect(treeAward(g.run)).toBe(0);
    g.run.stats['repaid.shark1'] = 50000;
    expect(treeAward(g.run)).toBe(1);
    g.run.stats['repaid.shark1'] = 120000;
    expect(treeAward(g.run)).toBe(2);
    g.run.stats['repaid.capital'] = 900000; // 다른 곳은 세지 않는다
    expect(treeAward(g.run)).toBe(2);
    g.run.stats['repaid.shark1'] = 300000;
    g.run.debts.shark1.principal = 0;
    expect(treeAward(g.run)).toBe(8);
    g.run.stats['repaid.shark1'] = 0; // 갚은 적 없이 0(시험용 판)은 보너스 없음
    expect(treeAward(g.run)).toBe(0);
  });
  it('파산해도 그 생에 갚은 만큼은 남고, 한 번만 준다', () => {
    const g = bare();
    g.run.stats['repaid.shark1'] = 50000;
    declareBankruptcy(g, { lastLender: 'shark1', shortfall: 1 });
    expect(g.family.gold).toBe(1);
    expect(g.family.goldEarned).toBe(1);
    expect(g.estate!.gold).toBe(1);
    expect(grantAward(g)).toBe(0);
    expect(g.family.gold).toBe(1);
  });
  it('다음 생으로 넘어가도 나무와 재화는 그대로, 뿌리가 있으면 앱이 처음부터 열려 있다', () => {
    const g = bare();
    g.run.stats['repaid.shark1'] = 150000;
    declareBankruptcy(g, { lastLender: 'shark1', shortfall: 1 });
    expect(g.family.gold).toBe(3);
    expect(A(g, { type: 'treeBuy', id: 'R' }).ok).toBe(true);
    expect(A(g, { type: 'treeBuy', id: 'C1' }).ok).toBe(true);
    expect(A(g, { type: 'estateNext' }).ok).toBe(true);
    expect(A(g, { type: 'inherit', branch: 'renounce' }).ok).toBe(true);
    expect(A(g, { type: 'nextGeneration' }).ok).toBe(true);
    expect(g.family.gold).toBe(1);
    expect(g.family.goldEarned).toBe(3);
    expect(g.family.skill).toEqual({ R: 1, C1: 1 });
    expect(g.run.skill).toEqual({ R: 1, C1: 1 });
    expect(g.run.futures.open).toBe(true);
    expect(levCapNow(g.run)).toBe(50); // 계좌를 열면 50배(U-47), 확인서는 생마다 새로
    expect(defaultSl(g)).toBe(-50);
    expect(g.run.stats.goldGranted).toBeUndefined(); // 새 생은 다시 받을 수 있다
  });
  it('뿌리가 없으면 새 생의 계좌는 닫혀 있다', () => {
    const g = fresh();
    applyBirth(g);
    expect(g.run.futures.open).toBe(false);
    expect(g.run.skill).toEqual({});
    expect(defaultSl(g)).toBeNull();
  });
});

describe('수수료', () => {
  it('나무가 없으면 기본 수수료율 그대로', () => {
    const g = trader();
    expect(feeRate(g, 10)).toBe(T.feeRate);
    expect(feeRate(g, 200)).toBe(T.feeRate);
  });
  it('A1 × A4, C2 는 보험료 +0.01%p. B1 · B3a 는 수수료를 건드리지 않는다(U-47)', () => {
    const g = trader({ A1: 5, A4: 2, B1: 3, B2: 1, B3a: 4 });
    const a1 = 1 - 0.5 * (1 - 0.85 ** 5), a4 = 1 - 0.3 * (1 - 0.85 ** 2);
    expect(feeRate(g, 10)).toBeCloseTo(T.feeRate * a1 * a4, 12);
    expect(feeRate(g, 25)).toBeCloseTo(T.feeRate * a1 * a4, 12);
    expect(feeRate(g, 50)).toBeCloseTo(T.feeRate * a1 * a4, 12);
    expect(feeRate(g, 200)).toBeCloseTo(T.feeRate * a1 * a4, 12);
    const c = trader({ C2: 1 });
    expect(feeRate(c, 10)).toBeCloseTo(T.feeRate + 0.0001, 12);
  });
  it('진입·정리·미리보기가 같은 수수료율을 쓴다', () => {
    const g = trader({ A1: 10 });
    const rate = feeRate(g, 10);
    const pv = orderPreview(g, 'DTC', 1, 10, 25);
    const cash0 = g.run.cash;
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, marginPct: 25 }).ok).toBe(true);
    const p = g.run.positions.DTC;
    const fee = entryFee(p.notional, rate);
    expect(fee).toBeLessThan(entryFee(p.notional));
    expect(p.feesPaid).toBe(fee);
    expect(pv.fee).toBe(fee);
    expect(g.run.cash).toBe(cash0 - p.margin0 - fee);
    expect(p.feeRate).toBeCloseTo(rate, 12);
    expect(closeBack(p, ref)).toBe(p.margin - fee); // 제자리 정리: 증거금 − 나가는 수수료
    const before = g.run.cash;
    A(g, { type: 'close', market: 'DTC' });
    expect(g.run.cash).toBe(before + p.margin0 - fee);
  });
  it('전부 걸기: 보험료가 붙어도 증거금 + 수수료가 가진 돈을 넘지 않는다', () => {
    const g = trader({ C2: 3 });
    g.run.futures.levCap = 200;
    const r = A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, marginPct: 100 });
    expect(r.ok).toBe(true);
    expect(g.run.cash).toBeGreaterThanOrEqual(0);
    expect(g.run.cash).toBeLessThan(200);
    expect(marginFromPct(100000, 200, 100, feeRate(g, 200))).toBeLessThan(marginFromPct(100000, 200, 100));
  });
});

describe('원칙: 시세를 이기게 해 주는 노드는 없다', () => {
  it('모든 노드가 Lv30 이어도 수수료율은 0보다 크고, 새 포지션의 청산가는 나무 없는 판과 같다', () => {
    const all = Object.fromEntries(skillNodes.map((n) => [n.id, n.kind === 'scaled' ? 30 : 1]));
    for (const lev of [10, 50, 200]) {
      const a = trader(), b = trader(all);
      a.run.futures.levCap = b.run.futures.levCap = 200;
      expect(feeRate(b, lev)).toBeGreaterThan(0);
      for (const dir of [1, -1] as const) {
        const x = trader(), y = trader(all);
        x.run.futures.levCap = y.run.futures.levCap = 200;
        A(x, { type: 'open', market: 'DTC', dir, lev, margin: 10000 });
        A(y, { type: 'open', market: 'DTC', dir, lev, margin: 10000 });
        expect(liqPrice(y.run.positions.DTC)).toBe(liqPrice(x.run.positions.DTC));
        expect(y.run.positions.DTC.entry).toBe(x.run.positions.DTC.entry);
        expect(y.run.positions.DTC.notional).toBe(x.run.positions.DTC.notional);
      }
    }
  });
  it('같은 시세에서 청산되는 틱도 같다(비상금 주머니는 돌아오는 돈만 바꾼다)', () => {
    const a = trader(), b = trader({ C2: 30, A1: 30, A4: 30 }); // B1(한 번 버티기)은 아래 따로: 빌린 증거금으로 한 번 버틴다
    for (const g of [a, b]) {
      g.run.futures.levCap = 200;
      A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
      tickN(g, 1, { DTC: ref * 0.9965 }); // 청산가(−0.4%) 바로 위
    }
    expect(a.run.positions.DTC).toBeDefined();
    expect(b.run.positions.DTC).toBeDefined();
    for (const g of [a, b]) tickN(g, 1, { DTC: ref * 0.9955 });
    expect(a.run.positions.DTC).toBeUndefined();
    expect(b.run.positions.DTC).toBeUndefined();
  });
});

describe('배율 단계(U-47: 나무는 배율을 열지 않는다)', () => {
  it('계좌를 열면 50배, 확인서에 발도장을 찍는 순간 200배. 끝난 거래 수는 보지 않는다', () => {
    const g = bare();
    openFutures(g, 50);
    expect(levCapNow(g.run)).toBe(50);
    expect(effectiveLevCaps(g).map((c) => c.cap)).toEqual([50, 200]);
    expect(effectiveLevCaps(g).some((c) => c.closedTrades !== undefined)).toBe(false);
    expect(g.run.futures.closedTrades).toBe(0);
    expect(waiverAvailable(g.run)).toBe(true);
    expect(A(g, { type: 'signWaiver' }).ok).toBe(true);
    expect(levCapNow(g.run)).toBe(200);
    expect(waiverAvailable(g.run)).toBe(false); // 생마다 한 번
  });
  it('B1 · B3a 가 있어도 배율 단계는 같다', () => {
    const g = bare();
    openFutures(g, 50);
    on(g, { B1: 3, B2: 1, B3a: 1 });
    expect(levCapNow(g.run)).toBe(50);
    expect(effectiveLevCaps(g).map((c) => c.cap)).toEqual([50, 200]);
    const n = bare(); // 계좌가 없으면 확인서도 없다
    expect(A(n, { type: 'signWaiver' }).ok).toBe(false);
  });
});

describe('B1 한 번 버티기(U-47)', () => {
  const b1 = (lv: number) => 0.3 * (1 - 0.85 ** lv);
  it('청산가에 처음 닿으면 넣은 증거금 × 효과를 오소리가 대신 넣어 버틴다. 포지션마다 한 번', () => {
    const g = trader({ B1: 5 });
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    const p = g.run.positions.DTC;
    const liq0 = liqPrice(p);
    const buf = Math.floor(10000 * b1(5) + 1e-9);
    tickN(g, 1, { DTC: ref * 0.9955 }); // 청산가(약 −0.4%) 아래: 나무 없는 판이면 여기서 끝난다
    const q = g.run.positions.DTC;
    expect(q).toBeDefined();
    expect(q.held).toBe(true);
    expect(q.buf).toBe(buf);
    expect(q.margin).toBe(10000 + buf);
    expect(liqPrice(q)).toBeLessThan(liq0); // 청산가가 멀어졌다
    expect(g.run.stats.holdSaves).toBe(1);
    expect(g.run.eventLog.some((e) => e.kind === 'hold' && e.amount === buf)).toBe(true);
    // 두 번째로 닿으면 더는 없다
    tickN(g, 1, { DTC: liqPrice(q) * 0.999 });
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.lastClose!.liq).toBe(true);
    expect(g.run.stats.holdSaves).toBe(1);
  });
  it('버틴 뒤 정리하면 대신 넣은 돈은 먼저 돌려준다(손에 오는 돈은 넣은 돈이 없던 셈과 같다)', () => {
    const g = trader({ B1: 5 });
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    tickN(g, 1, { DTC: ref * 0.9955 });
    const q = g.run.positions.DTC;
    expect(q.buf).toBeGreaterThan(0);
    tickN(g, 1, { DTC: ref }); // 제자리로 돌아왔다
    const want = closeBack(q, ref);
    expect(want).toBe(Math.floor(10000 + q.buf! - q.buf! - entryFee(q.notional, q.feeRate)));
    const before = g.run.cash;
    expect(A(g, { type: 'close', market: 'DTC' }).ok).toBe(true);
    expect(g.run.cash).toBe(before + want);
  });
  it('노드가 없으면 버티지 않는다', () => {
    const g = trader();
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    tickN(g, 1, { DTC: ref * 0.9955 });
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.stats.holdSaves).toBeUndefined();
  });
});

describe('B3a 고배율 축하금(U-47)', () => {
  const tail1 = 0.1 * (1 - 0.85);
  function winAt(levels: Record<string, number>, lev: number): { g: GameState; pnl: number; cash0: number } {
    const g = trader(levels);
    const cash0 = g.run.cash;
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev, margin: 10000 }).ok).toBe(true);
    tickN(g, 1, { DTC: ref * 1.002 });
    const p = g.run.positions.DTC;
    const pnl = closeBack(p, g.run.prices.DTC) - p.margin0 - p.feesPaid; // 시세가 낸 손익(수수료 포함)
    expect(A(g, { type: 'close', market: 'DTC' }).ok).toBe(true);
    return { g, pnl, cash0 };
  }
  it('100배 이상으로 이긴 판: 수익 × 꼬리만큼 현금에 더 얹는다. 거래 손익은 그대로', () => {
    const { g, pnl, cash0 } = winAt({ B1: 1, B2: 1, B3a: 1 }, 200);
    expect(pnl).toBeGreaterThan(0);
    const bonus = Math.floor(pnl * tail1 + 1e-9);
    expect(bonus).toBeGreaterThan(0);
    expect(g.run.stats.winBonus).toBe(bonus);
    expect((g.run.stats.lastBonus as { amount: number }).amount).toBe(bonus);
    expect(g.run.cash).toBe(cash0 + pnl + bonus);
    const plain = winAt({}, 200);
    expect(plain.pnl).toBe(pnl); // 시세가 낸 손익은 나무와 무관
    expect(plain.g.run.cash).toBe(plain.cash0 + pnl);
  });
  it('50배로 이긴 판, 진 판, 청산된 판에는 없다', () => {
    const fifty = winAt({ B1: 1, B2: 1, B3a: 1 }, 50);
    expect(fifty.pnl).toBeGreaterThan(0);
    expect(fifty.g.run.stats.winBonus).toBeUndefined();
    const g = trader({ B1: 1, B2: 1, B3a: 1 });
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    tickN(g, 1, { DTC: 67000 });
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.stats.winBonus).toBeUndefined();
    const h = trader({ B1: 1, B2: 1, B3a: 1 });
    A(h, { type: 'open', market: 'DTC', dir: 1, lev: 100, margin: 10000 });
    tickN(h, 1, { DTC: ref * 0.999 });
    A(h, { type: 'close', market: 'DTC' });
    expect(h.run.stats.winBonus).toBeUndefined();
  });
});

describe('C2 비상금 주머니', () => {
  it('강제 청산 때 넣은 증거금 × 효과가 돌아온다', () => {
    const g = trader({ C2: 1 });
    g.run.futures.levCap = 200;
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    const cash = g.run.cash;
    tickN(g, 1, { DTC: 67000 });
    expect(g.run.positions.DTC).toBeUndefined();
    const back = Math.floor(10000 * 0.3 * 0.15);
    expect(back).toBe(450);
    expect(g.run.cash).toBe(cash + back);
    const ev = g.run.eventLog.find((e) => e.kind === 'liq:refund')!;
    expect(ev.amount).toBe(back);
    expect(g.run.lastClose!.liq).toBe(true);
    expect(g.run.stats.liqCount).toBe(1);
  });
  it('없으면 한 푼도 돌아오지 않는다', () => {
    const g = trader();
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    const cash = g.run.cash;
    tickN(g, 1, { DTC: 67000 });
    expect(g.run.cash).toBe(cash);
    expect(g.run.eventLog.some((e) => e.kind === 'liq:refund')).toBe(false);
  });
});

describe('C4 장부 정리', () => {
  const setup = (levels: Record<string, number>) => {
    const g = fresh(); // 엄마의 쳇바퀴 한 대, 오소리 30만
    on(g, levels);
    return g;
  };
  it('엄마의 쳇바퀴는 실려 가지 않는다(가져갈 것이 없으면 null)', () => {
    const g = setup({ C4: 1 });
    expect(seizeFor(g, 'shark1')).toBeNull();
    expect(g.run.coinWheels.DTC).toBeDefined();
  });
  it('없으면 실려 간다. 다른 규칙은 그대로', () => {
    const g = setup({});
    const r = seizeFor(g, 'shark1');
    expect(r?.what).toBe('wheel');
    expect(g.run.coinWheels.DTC).toBeUndefined();
    // C4 가 있어도 보조 쳇바퀴는 가져간다
    const h = setup({ C4: 1 });
    h.run.cash = 50000;
    h.run.futures.open = true;
    expect(A(h, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(true);
    expect(seizeFor(h, 'shark1')?.what).toBe('equipment');
    expect(h.run.equipment.length).toBe(0);
    expect(h.run.coinWheels.DTC).toBeDefined();
  });
});

describe('증거금 추가(물타기 B3b · 마진콜 전화 B2)', () => {
  it('B3b: 증거금만 늘고 청산가가 멀어진다. 크기와 진입가는 그대로', () => {
    const g = trader({ B3b: 1 });
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000 });
    const p = g.run.positions.DTC;
    const liq0 = liqPrice(p), n0 = p.notional, e0 = p.entry, cash = g.run.cash;
    expect(A(g, { type: 'addMargin', market: 'DTC', amount: 5000 }).ok).toBe(true);
    expect(p.margin).toBe(15000);
    expect(p.margin0).toBe(15000);
    expect(p.notional).toBe(n0);
    expect(p.entry).toBe(e0);
    expect(g.run.cash).toBe(cash - 5000);
    expect(liqPrice(p)).toBeLessThan(liq0);
    expect(liqPrice(p)).toBeCloseTo(e0 * (1 - 15000 / n0 + T.maintenanceRate), 6);
    expect(A(g, { type: 'addMargin', market: 'DTC', amount: 1e9 }).ok).toBe(false);
    expect(A(g, { type: 'addMargin', market: 'BTH', amount: 100 }).ok).toBe(false);
    expect(A(g, { type: 'addMargin', market: 'DTC', amount: 0 }).ok).toBe(false);
    // 숏은 청산가가 위로 멀어진다
    const s = trader({ B3b: 1 });
    A(s, { type: 'open', market: 'DTC', dir: -1, lev: 10, margin: 10000 });
    const l0 = liqPrice(s.run.positions.DTC);
    A(s, { type: 'addMargin', market: 'DTC', amount: 5000 });
    expect(liqPrice(s.run.positions.DTC)).toBeGreaterThan(l0);
  });
  it('노드가 없으면 거절', () => {
    const g = trader();
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000 });
    const r = A(g, { type: 'addMargin', market: 'DTC', amount: 5000 });
    expect(r.ok).toBe(false);
    expect(g.run.positions.DTC.margin).toBe(10000);
  });
  it('B2: 청산까지 가는 길의 60%를 지나면 포지션마다 한 번 전화가 온다. 그 포지션에만 넣을 수 있다', () => {
    const g = trader({ B2: 1 });
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000 });
    expect(A(g, { type: 'addMargin', market: 'DTC', amount: 1000 }).ok).toBe(false); // 전화가 오기 전
    tickN(g, 1, { DTC: ref * 0.95 }); // ROE −50%: 10배의 청산(약 −99%)까지 아직 60%를 못 갔다
    expect(g.run.marginCall).toBeNull();
    tickN(g, 1, { DTC: ref * 0.925 }); // ROE −75%
    expect(g.run.marginCall).toEqual({ market: 'DTC', tick: g.run.tick });
    expect(g.run.positions.DTC.called).toBe(true);
    const liq0 = liqPrice(g.run.positions.DTC);
    expect(A(g, { type: 'addMargin', market: 'DTC', amount: 5000 }).ok).toBe(true);
    expect(liqPrice(g.run.positions.DTC)).toBeLessThan(liq0);
    expect(g.run.marginCall).toBeNull();
    tickN(g, 1, { DTC: ref * 0.90 }); // 다시 깊어져도 두 번은 안 온다
    expect(g.run.positions.DTC).toBeDefined(); // 넣은 덕에 아직 살아 있다
    expect(g.run.marginCall).toBeNull();
    expect(A(g, { type: 'addMargin', market: 'DTC', amount: 1000 }).ok).toBe(false);
  });
  it('B2: 200배에서도 청산(약 −0.4%)보다 전화가 먼저 온다(−0.3% = ROE −60%, 문턱은 청산 ROE −80% 의 60% = −48%)', () => {
    const g = trader({ B2: 1 });
    openFutures(g, 200);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    tickN(g, 1, { DTC: ref * 0.998 }); // ROE −40%
    expect(g.run.marginCall).toBeNull();
    tickN(g, 1, { DTC: ref * 0.997 }); // ROE −60%
    expect(g.run.positions.DTC).toBeDefined();
    expect(g.run.marginCall?.market).toBe('DTC');
  });
  it('B2: 끊으면(marginCallDone) 닫히고, 포지션이 닫혀도 지워진다. 노드가 없으면 전화는 없다', () => {
    const g = trader({ B2: 1 });
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000 });
    tickN(g, 1, { DTC: ref * 0.925 });
    expect(g.run.marginCall?.market).toBe('DTC');
    expect(A(g, { type: 'marginCallDone' }).ok).toBe(true);
    expect(g.run.marginCall).toBeNull();
    const h = trader({ B2: 1 });
    A(h, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000 });
    tickN(h, 1, { DTC: ref * 0.925 });
    tickN(h, 1, { DTC: ref * 0.89 }); // 청산
    expect(h.run.positions.DTC).toBeUndefined();
    expect(h.run.marginCall).toBeNull();
    const n = trader();
    A(n, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000 });
    tickN(n, 1, { DTC: ref * 0.925 });
    expect(n.run.marginCall).toBeNull();
    expect(n.run.positions.DTC.called).toBeUndefined();
  });
});

describe('C3b 하루 한도', () => {
  it('노드가 있어야 정할 수 있다', () => {
    const g = trader();
    expect(A(g, { type: 'setDayLimit', value: 5000 }).ok).toBe(false);
    const h = trader({ C3b: 1 });
    expect(A(h, { type: 'setDayLimit', value: 0 }).ok).toBe(false);
    expect(A(h, { type: 'setDayLimit', value: 5000 }).ok).toBe(true);
    expect(h.run.dayLossLimit).toBe(5000);
    expect(A(h, { type: 'setDayLimit', value: null }).ok).toBe(true);
    expect(h.run.dayLossLimit).toBeNull();
  });
  it('하루 손실이 한도를 넘으면 진입이 잠기고, 다음 아침에 풀린다', () => {
    const g = trader({ C3b: 1 });
    A(g, { type: 'setDayLimit', value: 5000 });
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    tickN(g, 1, { DTC: 67000 }); // 청산 −10,000
    expect(g.run.stats.dayLoss).toBeGreaterThanOrEqual(10000);
    const r = A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 5000 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('daylimit');
    expect(r.msg).toBe('하루 한도에 닿았습니다. 다음 아침에 풀립니다.');
    const day = balance.settlement.dayCycleSettlements as number;
    settleOnce(g, day - 1);
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 5000 }).ok).toBe(false);
    settleOnce(g, 1); // 새 날 아침
    expect(g.run.settleNo % day).toBe(0);
    expect(g.run.stats.dayLoss).toBe(0);
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 5000 }).ok).toBe(true);
    // 열린 포지션에 더 넣는 것도 잠긴다
    g.run.stats.dayLoss = 6000;
    expect(A(g, { type: 'add', market: 'DTC', margin: 2000 }).code).toBe('daylimit');
    // 정리는 언제나 된다
    expect(A(g, { type: 'close', market: 'DTC' }).ok).toBe(true);
  });
  it('한도를 안 정했거나 노드가 없으면 잠기지 않는다', () => {
    const g = trader({ C3b: 1 });
    g.run.stats.dayLoss = 1e9;
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 5000 }).ok).toBe(true);
    const n = trader();
    n.run.dayLossLimit = 1;
    n.run.stats.dayLoss = 1e9;
    expect(A(n, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 5000 }).ok).toBe(true);
  });
});

describe('저장', () => {
  it('새 칸이 그대로 돌아온다', () => {
    const g = trader({ R: 1, B1: 2, B2: 1, B3b: 1 });
    g.family.gold = 7;
    g.family.goldEarned = 12;
    g.family.skillPick = { B: 'B3b' };
    g.run.dayLossLimit = 3000;
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000 });
    tickN(g, 1, { DTC: ref * 0.925 });
    const back = migrate(JSON.parse(serialize(g, 1)))!;
    expect(back.family.gold).toBe(7);
    expect(back.family.goldEarned).toBe(12);
    expect(back.family.skill).toEqual({ R: 1, B1: 2, B2: 1, B3b: 1 });
    expect(back.family.skillPick).toEqual({ B: 'B3b' });
    expect(back.run.skill).toEqual({ R: 1, B1: 2, B2: 1, B3b: 1 });
    expect(back.run.marginCall?.market).toBe('DTC');
    expect(back.run.dayLossLimit).toBe(3000);
    expect(back.run.positions.DTC.called).toBe(true);
  });
  it('옛 저장(새 칸 없음)은 기본값으로 채워진다', () => {
    const g = bare();
    const raw = JSON.parse(serialize(g, 1));
    delete raw.family.gold; delete raw.family.goldEarned; delete raw.family.skill; delete raw.family.skillPick;
    delete raw.run.skill; delete raw.run.marginCall; delete raw.run.dayLossLimit;
    const back = migrate(raw)!;
    expect(back.family.gold).toBe(0);
    expect(back.family.goldEarned).toBe(0);
    expect(back.family.skill).toEqual({});
    expect(back.family.skillPick).toEqual({});
    expect(back.run.skill).toEqual({});
    expect(back.run.marginCall).toBeNull();
    expect(back.run.dayLossLimit).toBeNull();
    expect(feeRate(back, 10)).toBe(T.feeRate);
  });
});

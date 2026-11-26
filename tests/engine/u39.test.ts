// U-39(회차 2): 켜고 끄는 노드의 숫자 꼬리 · 고정금리인 엄마 빚 · 1막의 못 낸 생활비 · 빚을 다 갚은 생 닫기 · 1막 엔딩 글.
import { afterEach, describe, expect, it } from 'vitest';
import { A, bare, fresh, giveEquip, openFutures, settleOnce, tickN } from './helpers';
import { balance, endingById, endings, lenderById, skillById, skillMeta, skillNodes, skillPathEndings } from '../../src/engine/data';
import { addFeeMul, applyBirth, callLoanCut, exitFeeMul, feeRate, liqRefund, longChartSec, nextCost, seizeRate, tailAt, tailRun, treeAward, treeView } from '../../src/engine/skilltree';
import { closeBack, entryFee, exitFee, liqPrice } from '../../src/engine/futures';
import { seizeFor } from '../../src/engine/seizure';
import { fixedInterest, interestDue } from '../../src/engine/selectors';
import { act1Coherent } from '../../src/engine/endings';
import { act1Text, ENDING_TOTAL, specialEndings, storyNames } from '../../src/engine/act1';
import { canRetireAct1, retireAct1 } from '../../src/engine/act1Retire';
import type { GameState } from '../../src/engine/types';

const T = balance.trading;
const act1 = (on: boolean) => { if (on) (balance as { act1?: unknown }).act1 = { friends: false }; else delete (balance as { act1?: unknown }).act1; };
afterEach(() => act1(false));
function trader(levels: Record<string, number> = {}): GameState {
  const g = bare();
  openFutures(g);
  g.family.skill = { ...levels };
  applyBirth(g);
  return g;
}
const tail = (id: string, lv: number) => skillById[id].tail!.cap * (1 - 0.85 ** lv);

describe('켜고 끄는 노드의 숫자 꼬리 (U-39 ⑨)', () => {
  it('꼬리 = tail.cap × (1 − 0.85^레벨): Lv1 에서 15%, 다가갈 뿐 닿지 않는다. 값은 다른 노드와 같은 식', () => {
    const d = skillById.A2;
    expect(tailAt(d, 0)).toBe(0);
    expect(tailAt(d, 1)).toBeCloseTo(0.25 * 0.15, 12);
    expect(tailAt(d, 60)).toBeLessThan(0.25);
    expect(tailAt(d, 60)).toBeGreaterThan(0.2499);
    expect(tailAt(skillById.A1, 5)).toBe(0); // 숫자 노드에는 꼬리가 없다(cap 이 그 숫자다)
    const g = fresh();
    g.family.skill = { R: 1, A1: 1, A2: 1 };
    expect(nextCost(g, 'A2')).toBe(Math.ceil(2 * 1.6)); // 2단계 노드: 열기 2 → Lv2 는 4
    g.family.skill.A2 = 3;
    expect(nextCost(g, 'A2')).toBe(Math.ceil(2 * 1.6 ** 3 - 1e-9));
  });
  it('모든 노드가 끝없이 오른다: 다음 값이 없는 노드가 없다', () => {
    const g = fresh();
    g.family.skill = Object.fromEntries(skillNodes.map((n) => [n.id, 40]));
    for (const v of treeView(g)) { expect(v.cost, v.id).not.toBeNull(); if (v.kind === 'binary') expect(v.tail!.next!).toBeGreaterThan(v.tail!.now); }
  });
  it('R = 10배 이하 · B3a = 200배 · B4 = 전부 걸기 · C3b = 한도를 걸어 둔 동안 · A3b = 뒤집어 들어갈 때의 수수료', () => {
    const g = trader({ R: 4, B3a: 2, B4: 3, C3b: 5, A3b: 1 });
    expect(feeRate(g, 10)).toBeCloseTo(T.feeRate * (1 - tail('R', 4)), 12);
    expect(feeRate(g, 25)).toBeCloseTo(T.feeRate, 12);
    expect(feeRate(g, 200)).toBeCloseTo(T.feeRate * (1 - tail('B3a', 2)), 12);
    expect(feeRate(g, 25, { allIn: true })).toBeCloseTo(T.feeRate * (1 - tail('B4', 3)), 12);
    expect(feeRate(g, 25, { flip: true })).toBeCloseTo(T.feeRate * (1 - tail('A3b', 1)), 12);
    g.run.dayLossLimit = 30000;
    expect(feeRate(g, 25)).toBeCloseTo(T.feeRate * (1 - tail('C3b', 5)), 12);
  });
  it('전부 걸기 행동은 B4 의 꼬리만큼 싼 수수료로 들어간다. 절반 걸기는 그대로', () => {
    const g = trader({ B4: 6 });
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 25, marginPct: 100 });
    expect(g.run.positions.DTC.feeRate).toBeCloseTo(T.feeRate * (1 - tail('B4', 6)), 12);
    const h = trader({ B4: 6 });
    A(h, { type: 'open', market: 'DTC', dir: 1, lev: 25, marginPct: 50 });
    expect(h.run.positions.DTC.feeRate).toBeUndefined();
  });
  it('반대 단추(A3b): 방금 정리한 종목의 반대쪽에 같은 틱에 들어갈 때만 할인된다', () => {
    const g = trader({ A3b: 3 });
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, marginPct: 25 });
    A(g, { type: 'close', market: 'DTC' });
    A(g, { type: 'open', market: 'DTC', dir: -1, lev: 10, marginPct: 25, flip: true });
    expect(g.run.positions.DTC.feeRate).toBeCloseTo(T.feeRate * (1 - tail('A3b', 3)), 12);
    // 정리 없이 flip 만 붙이면 할인이 없다
    const h = trader({ A3b: 3 });
    A(h, { type: 'open', market: 'DTC', dir: -1, lev: 10, marginPct: 25, flip: true });
    expect(h.run.positions.DTC.feeRate).toBeUndefined();
    // 같은 방향으로 다시 들어가는 것도 뒤집기가 아니다
    const k = trader({ A3b: 3 });
    A(k, { type: 'open', market: 'DTC', dir: 1, lev: 10, marginPct: 25 });
    A(k, { type: 'close', market: 'DTC' });
    A(k, { type: 'open', market: 'DTC', dir: 1, lev: 10, marginPct: 25, flip: true });
    expect(k.run.positions.DTC.feeRate).toBeUndefined();
  });
  it('A2 = 나올 때 수수료, C1 = 손절로 나올 때 수수료', () => {
    const g = trader({ A2: 4, C1: 2 });
    expect(exitFeeMul(g.run, 'close')).toBeCloseTo(1 - tail('A2', 4), 12);
    expect(exitFeeMul(g.run, 'tp')).toBeCloseTo(1 - tail('A2', 4), 12);
    expect(exitFeeMul(g.run, 'sl')).toBeCloseTo((1 - tail('A2', 4)) * (1 - tail('C1', 2)), 12);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 20000, sl: null });
    const p = { ...g.run.positions.DTC };
    const cash = g.run.cash;
    A(g, { type: 'close', market: 'DTC' });
    const xf = exitFee(p, exitFeeMul(g.run, 'close'));
    expect(xf).toBeLessThan(entryFee(p.notional));
    expect(g.run.cash).toBe(cash + p.margin - xf); // 제자리 정리: 증거금 − 할인된 나가는 수수료
    expect(closeBack(p, p.entry, exitFeeMul(g.run, 'close'))).toBe(p.margin - xf);
    // 손절로 닫히면 C1 까지 붙는다
    const h = trader({ C1: 6 });
    A(h, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 20000, sl: -10 });
    const q = { ...h.run.positions.DTC };
    const c2 = h.run.cash;
    tickN(h, 1, { DTC: q.entry * 0.985 });
    expect(h.run.positions.DTC).toBeUndefined();
    const loss = Math.round(q.notional * 0.01); // 손절가 = ROE −10% = 시세 −1%
    expect(h.run.cash).toBe(c2 + q.margin - loss - exitFee(q, exitFeeMul(h.run, 'sl')));
    expect(exitFee(q, exitFeeMul(h.run, 'sl'))).toBeLessThan(exitFee(q));
  });
  it('C3a = 추가 진입 수수료', () => {
    const g = trader({ C3a: 5 });
    expect(addFeeMul(g.run)).toBeCloseTo(1 - tail('C3a', 5), 12);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000 });
    const f0 = g.run.positions.DTC.feesPaid;
    A(g, { type: 'add', market: 'DTC', margin: 10000 });
    expect(g.run.positions.DTC.feesPaid - f0).toBe(entryFee(100000, T.feeRate * addFeeMul(g.run)));
    expect(g.run.positions.DTC.feesPaid - f0).toBeLessThan(f0);
  });
  it('B3b = 물타기로 더 넣은 증거금은 청산돼도 일부 돌아온다(처음 넣은 돈은 아니다)', () => {
    const g = trader({ B3b: 4 });
    g.run.futures.levCap = 200;
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 });
    A(g, { type: 'addMargin', market: 'DTC', amount: 4000 });
    expect(g.run.positions.DTC.marginAdded).toBe(4000);
    expect(liqRefund(g.run, 14000, 4000)).toBe(Math.floor(4000 * tail('B3b', 4)));
    expect(liqRefund(g.run, 14000, 0)).toBe(0);
    const cash = g.run.cash;
    tickN(g, 1, { DTC: 66000 });
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.lastClose!.liq).toBe(true);
    expect(g.run.cash).toBe(cash + Math.floor(4000 * tail('B3b', 4)));
  });
  it('C4 = 압류될 때 쳇바퀴를 더 쳐 준다(구매가의 50% + 꼬리)', () => {
    const g = trader({ C4: 3 });
    expect(seizeRate(g.run)).toBeCloseTo(0.5 + tail('C4', 3), 12);
    giveEquip(g, 'wheel2', 'DTC', 50000);
    const d0 = g.run.debts.shark1.principal;
    const r = seizeFor(g, 'shark1')!;
    expect(r.value).toBe(Math.floor(50000 * seizeRate(g.run)));
    expect(g.run.debts.shark1.principal).toBe(d0 - r.value);
    expect(seizeRate(trader().run)).toBe(0.5);
  });
  it('B2 = 마진콜 전화로 그 자리에서 빌리는 돈의 금리(오소리의 보통 금리 4% 아래로는 안 내려간다)', () => {
    const g = fresh();
    g.family.skill = { R: 1, B1: 1, B2: 8 };
    applyBirth(g);
    A(g, { type: 'borrow', lender: 'shark1' }); // 처음 빌리는 돈 4%
    expect(callLoanCut(g.run)).toBeCloseTo(tail('B2', 8), 12);
    // 전화가 없으면 call 을 붙여도 보통 금리(두 번째부터 6%)
    const h = JSON.parse(JSON.stringify(g)) as GameState;
    A(h, { type: 'borrow', lender: 'shark1', call: true });
    expect(h.run.debts.shark1.tranches!.at(-1)!.rate).toBe(0.06);
    g.run.marginCall = { market: 'DTC', tick: g.run.tick };
    expect(A(g, { type: 'borrow', lender: 'shark1', call: true }).ok).toBe(true);
    expect(g.run.debts.shark1.tranches!.at(-1)!.rate).toBeCloseTo(0.06 - tail('B2', 8), 12);
    expect(g.run.debts.shark1.tranches!.at(-1)!.rate).toBeGreaterThan(0.04);
    expect(0.06 - skillById.B2.tail!.cap).toBeCloseTo(0.04, 12); // 꼬리의 상한에서도 보통 금리와 같아질 뿐이다
  });
  it('A3a = 긴 창(2분 + 꼬리). 시세에는 닿지 않는다', () => {
    expect(longChartSec(trader().run)).toBe(120);
    expect(longChartSec(trader({ A3a: 1 }).run)).toBe(120 + Math.round(480 * 0.15));
    expect(longChartSec(trader({ A3a: 80 }).run)).toBeLessThanOrEqual(600);
  });
  it('원칙: 꼬리를 전부 Lv40 까지 키워도 수수료는 0보다 크고, 청산가와 청산되는 틱은 나무 없는 판과 같다', () => {
    const all = Object.fromEntries(skillNodes.map((n) => [n.id, 40]));
    const g = trader(all), h = trader();
    g.run.futures.levCap = 200; h.run.futures.levCap = 200;
    g.run.dayLossLimit = 10_000_000;
    expect(feeRate(g, 200, { allIn: true, flip: true })).toBeGreaterThan(0);
    expect(feeRate(g, 10, { allIn: true, flip: true })).toBeGreaterThan(0);
    expect(exitFeeMul(g.run, 'sl')).toBeGreaterThan(0);
    expect(addFeeMul(g.run)).toBeGreaterThan(0);
    for (const x of [g, h]) A(x, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000, sl: null });
    expect(liqPrice(g.run.positions.DTC)).toBe(liqPrice(h.run.positions.DTC));
    for (const x of [g, h]) tickN(x, 1, { DTC: liqPrice(h.run.positions.DTC) * 1.00005 });
    expect(!!g.run.positions.DTC).toBe(!!h.run.positions.DTC);
    for (const x of [g, h]) tickN(x, 1, { DTC: 60000 });
    expect(g.run.positions.DTC).toBeUndefined();
    expect(h.run.positions.DTC).toBeUndefined();
    for (const n of skillNodes) if (n.tail) expect(tailRun(g.run, n.id), n.id).toBeLessThan(n.tail.cap);
  });
  it('길마다 이어지는 엔딩이 데이터에 있고 전부 있는 엔딩이다', () => {
    for (const p of ['A', 'B', 'C']) { const ids = skillPathEndings[p] as string[]; expect(ids.length).toBeGreaterThanOrEqual(3); for (const id of ids) expect(endingById[id], id).toBeDefined(); }
  });
});

describe('엄마 빚은 고정금리다 (U-39 ⑥)', () => {
  it('금리 2배 사건에도 엄마 빚 이자 4,500 은 그대로: 14,500 → 24,500(29,000 이 아니다)', () => {
    const g = fresh();
    expect(interestDue(g, 'shark1')).toBe(4500);
    expect(fixedInterest(g, 'shark1')).toBe(4500);
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'borrow', lender: 'shark1' });
    expect(interestDue(g, 'shark1')).toBe(14500);
    g.run.effects.push({ id: 'rate_hike', type: 'rateMultiplier', multiplier: 2, remaining: 2 });
    expect(interestDue(g, 'shark1')).toBe(4500 + (4000 + 6000) * 2);
    expect(fixedInterest(g, 'shark1')).toBe(4500);
  });
  it('엄마 빚만 있는 생은 금리 인상이 지나가도 이자가 같다', () => {
    const g = fresh();
    g.run.effects.push({ id: 'rate_hike', type: 'rateMultiplier', multiplier: 2, remaining: 2 });
    expect(interestDue(g, 'shark1')).toBe(4500);
  });
  it('엄마 빚을 갚아 나가면 고정금리 몫도 준다. 다 갚으면 0', () => {
    const g = fresh();
    g.run.cash = 300000;
    A(g, { type: 'stamp', lender: 'shark1', mult: 10 });
    expect(fixedInterest(g, 'shark1')).toBe(200000 * 0.015);
    A(g, { type: 'stamp', lender: 'shark1', mult: 'all' });
    expect(fixedInterest(g, 'shark1')).toBe(0);
  });
  it('금리 상한이 없는 빚(본 게임의 보통 빚)은 전처럼 전부 두 배', () => {
    const g = bare();
    g.run.effects.push({ id: 'rate_hike', type: 'rateMultiplier', multiplier: 2, remaining: 2 });
    expect(interestDue(g, 'shark1')).toBe(12000);
    expect(fixedInterest(g, 'shark1')).toBe(0);
  });
});

describe('1막: 못 낸 생활비는 아는 곳의 빚이 된다 (U-39 ③)', () => {
  it('숲속 캐피탈과 거래한 적 없는 생: 오소리 장부에 얹힌다(만난 적 없는 캐피탈 빚이 생기지 않는다)', () => {
    act1(true);
    const g = fresh();
    settleOnce(g); // 현금 0: 이자 4,500 과 생활비 1,000 을 못 낸다
    expect(g.run.debts.capital.principal).toBe(0);
    expect(g.run.debts.shark1.principal).toBe(300000 + 4500 + 1000);
    expect(g.run.eventLog.some((e) => e.kind === 'overdue:upkeep' && /오소리 장부/.test(e.text))).toBe(true);
    expect(g.run.eventLog.some((e) => /캐피탈/.test(e.text))).toBe(false);
  });
  it('캐피탈에서 빌려 본 생은 전처럼 캐피탈 비상금 대출로 넘어간다', () => {
    act1(true);
    const g = fresh();
    A(g, { type: 'borrow', lender: 'capital' });
    g.run.cash = 0;
    const c0 = g.run.debts.capital.principal;
    settleOnce(g);
    expect(g.run.debts.capital.principal).toBeGreaterThanOrEqual(c0 + 1000);
    expect(g.run.eventLog.some((e) => e.kind === 'overdue:upkeep' && /숲속 캐피탈 비상금/.test(e.text))).toBe(true);
  });
  it('본 게임(1막 표시 없음)은 그대로 캐피탈', () => {
    const g = fresh();
    settleOnce(g);
    expect(g.run.debts.capital.principal).toBe(1000);
    expect(g.run.debts.shark1.principal).toBe(304500);
  });
});

describe('이름 통일 (U-39 ⑦)', () => {
  it('채권처 데이터의 이름이 지도·이야기와 같다', () => {
    expect(lenderById.capital.name).toBe('숲속 캐피탈');
    expect(lenderById.capital.npc).toBe('창구 너구리');
    expect(lenderById.shark1.name).toBe('오소리 대부');
    expect(lenderById.shark1.npc).toBe('오소리 대부');
  });
  it('1막에서 보여 주는 엔딩 글은 옛 이름을 쓰지 않는다', () => {
    expect(storyNames('오소리 소장의 집기 압류')).toBe('오소리 대부의 집기 압류');
    expect(storyNames('황금저축·캐피탈 · 족제비 대표')).toBe('숲속 캐피탈 · 창구 너구리');
    act1(true);
    for (const e of endings) { const x = act1Text(e); expect(x.title + x.line, e.id).not.toMatch(/오소리 소장|황금저축|족제비 대표/); }
    act1(false);
    expect(act1Text(endingById['END-041']).title).toBe('오소리 소장의 집기 압류'); // 본 게임의 원문은 그대로
  });
});

describe('1막 엔딩 글 (U-39 ③)', () => {
  it('고쳐 쓴 글: 석 달의 노동 · 집기 · 저축은행 대신 1막의 물건', () => {
    act1(true);
    expect(act1Text(endingById['END-151']).line).not.toMatch(/석 달/);
    expect(act1Text(endingById['END-151']).line).toMatch(/쳇바퀴가 며칠/);
    expect(act1Text(endingById['END-018']).title).toBe('숲속 캐피탈 자동이체 세 번');
    expect(act1Text(endingById['END-087']).line).toMatch(/쳇바퀴/);
    expect(act1Text(endingById['END-041']).line).not.toMatch(/냄비|맷돌/);
  });
  it('원인마다 기본 엔딩이 1막에서 말이 된다: 사채 · 압류 · (캐피탈에서 빌린 생의) 제도권 · 청산', () => {
    act1(true);
    const g = fresh();
    for (const id of ['END-041', 'END-087', 'END-158']) expect(act1Coherent(endingById[id], g), id).toBe(true);
    expect(act1Coherent(endingById['END-018'], g)).toBe(false); // 캐피탈을 모르는 생에는 캐피탈 엔딩이 없다
    g.run.stats['borrow.capital'] = 1;
    expect(act1Coherent(endingById['END-018'], g)).toBe(true);
  });
  it('글이 빈 엔딩과 1막에 없는 것(가게 · 일터 · 줍기 · 대를 이어)을 말하는 엔딩은 고르지 않는다', () => {
    act1(true);
    const g = fresh();
    g.run.stats['borrow.capital'] = 1; g.run.stats['borrow.shark2'] = 1;
    const ok = endings.filter((e) => act1Coherent(e, g));
    expect(ok.length).toBeGreaterThan(60);
    for (const e of ok) {
      const x = act1Text(e);
      expect(x.line.trim().length, e.id).toBeGreaterThan(0);
      expect(x.title + x.line, e.id).not.toMatch(/가게|일터|좌판|주운|주웠|대를 이어|석 달|셋방/);
    }
    expect(act1Coherent(endingById['END-175'], g)).toBe(false); // "대를 이어 만 번을 주웠고"
    expect(act1Coherent(endingById['END-069'], g)).toBe(false); // 글이 없다
  });
});

describe('빚을 다 갚은 생을 닫는다 (U-39 ⑧)', () => {
  const cleared = (): GameState => {
    act1(true);
    const g = fresh();
    g.run.cash = 400000;
    A(g, { type: 'stamp', lender: 'shark1', mult: 'all' });
    return g;
  };
  it('빚이 남아 있거나 1막이 아니면 닫을 수 없다', () => {
    act1(true);
    const g = fresh();
    expect(canRetireAct1(g)).toBe(false);
    expect(A(g, { type: 'retireAct1' }).ok).toBe(false);
    const c = cleared();
    act1(false);
    expect(canRetireAct1(c)).toBe(false);
  });
  it('엔딩 카드가 뜨고 도감에 남는다. 황금 도토코인은 평소대로(갚은 30만 = 6개 + 완납 2개)', () => {
    const g = cleared();
    expect(canRetireAct1(g)).toBe(true);
    expect(treeAward(g.run)).toBe(8);
    expect(A(g, { type: 'retireAct1' }).ok).toBe(true);
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy).toBeNull();
    expect(g.pendingEnding).toMatchObject({ id: 'END-R01', cause: 'RETIRE', isNew: true, title: '빚 없는 칩멍크' });
    expect(g.family.ledger['END-R01'].count).toBe(1);
    expect(g.estate).toMatchObject({ kind: 'bankrupt', step: 'card', gold: 8 });
    expect(g.family.gold).toBe(8);
    expect(g.family.stats.bankruptcies ?? 0).toBe(0); // 파산이 아니다
    expect(ENDING_TOTAL).toBe(200 + specialEndings.length);
  });
  it('그 뒤는 파산과 같은 길: 카드 → 환생 화면(나무) → 다음 생', () => {
    const g = cleared();
    A(g, { type: 'retireAct1' });
    expect(A(g, { type: 'estateNext' }).ok).toBe(true);
    expect(A(g, { type: 'inherit', branch: 'renounce' }).ok).toBe(true);
    expect(g.estate!.step).toBe('tree');
    expect(A(g, { type: 'treeBuy', id: 'R' }).ok).toBe(true);
    expect(A(g, { type: 'nextGeneration' }).ok).toBe(true);
    expect(g.run.over).toBe(false);
    expect(g.family.generation).toBe(3);
    expect(g.family.ledger['END-R01']).toBeDefined();
  });
  it('200배를 해 본 생 · 쳇바퀴 여섯 대를 다 놓은 생은 다른 은퇴 엔딩(못 본 것부터)', () => {
    const g = cleared();
    g.run.stats.lev200Trades = 3;
    A(g, { type: 'retireAct1' });
    expect(g.pendingEnding!.id).toBe('END-R02');
    const h = cleared();
    for (let i = 0; i < 5; i++) giveEquip(h, 'wheel2', 'DTC', 50000);
    A(h, { type: 'retireAct1' });
    expect(h.pendingEnding!.id).toBe('END-R03');
    // 이미 본 것은 뒤로: R02 를 본 가문이 200배 생을 또 닫으면 아직 못 본 기본 엔딩이 먼저
    const k = cleared();
    k.run.stats.lev200Trades = 1;
    k.family.ledger['END-R02'] = { count: 1, holders: [], firstAt: 2, scenes: [] };
    A(k, { type: 'retireAct1' });
    expect(k.pendingEnding!.id).toBe('END-R01');
  });
  it('은퇴 엔딩 글은 블랙코미디 한 줄씩, 1막에 있는 것만 말한다', () => {
    for (const e of specialEndings) {
      expect(e.causes).toEqual(['RETIRE']);
      expect(e.line.length).toBeGreaterThan(30);
      expect(e.title + e.line).not.toMatch(/친구|조합|세무서|가문|세대|통나무/);
    }
    expect(skillMeta.award.clearBonus).toBe(2);
  });
});

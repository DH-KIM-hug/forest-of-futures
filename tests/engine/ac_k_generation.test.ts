import { describe, it, expect } from 'vitest';
import { A, fresh, giveEquip, giveWheel, noDebts, openFutures, settleOnce, tapN, clone } from './helpers';
import { declareBankruptcy } from '../../src/engine/bankruptcy';
import { hanCalc, openEstate, previewBranch, statement, treeStatus, hanTotal, canRetire, pawn } from '../../src/engine/generation';
import { endings, legacy, treeById } from '../../src/engine/data';
import { treeCost, traitVal } from '../../src/engine/legacy';
import { interestDue, lenderLimit, stage } from '../../src/engine/selectors';
import { wheelStatus, futuresMinedValueNeeded } from '../../src/engine/progression';
import { estateSurplus } from '../../src/engine/estate';
import type { GameState } from '../../src/engine/types';

const IDS = endings.map((e) => e.id);
const fakeLedger = (g: GameState, n: number) => {
  g.family.ledger = {};
  for (let i = 0; i < n; i++) g.family.ledger[IDS[i]] = { count: 1, holders: [{ gen: 2, name: '칩멍크' }], firstAt: 2, scenes: [] };
};
/** 파산시켜 엔딩 카드 단계로 만든다. */
function bust(g: GameState, o: { peak?: number; mined?: number; immediate?: boolean; lastLender?: any } = {}) {
  if (o.peak !== undefined) g.run.peakNetWorth = o.peak;
  if (o.mined !== undefined) g.run.minedValue = o.mined;
  declareBankruptcy(g, { lastLender: o.lastLender ?? 'shark1', shortfall: 1000, immediate: o.immediate });
}
function toStatement(g: GameState) {
  A(g, { type: 'estateNext' });
}
function inherit(g: GameState, branch: 'renounce' | 'limited' | 'simple' | 'gift') {
  if (g.estate?.step === 'card') toStatement(g);
  const r = A(g, { type: 'inherit', branch });
  expect(r.ok).toBe(true);
  expect(A(g, { type: 'nextGeneration' }).ok).toBe(true);
}
/** 가진 것 없이 빚만 있는 부모. */
function parentWithDebts(d: Partial<Record<'bank' | 'capital' | 'shark1' | 'shark2', number>>) {
  const g = fresh();
  g.family.generation = 3;
  g.run.cash = 0;
  noDebts(g);
  for (const [k, v] of Object.entries(d)) g.run.debts[k as 'bank'].principal = v!;
  return g;
}
const startDebt = (g: GameState) => (['bank', 'capital', 'shark1', 'shark2'] as const).reduce((a, k) => a + g.run.debts[k].principal, 0);

describe('K. 세대·가훈·가문 특성', () => {
  it('AC-v2-100 3세대 파산: 엔딩 카드를 넘기면 재산 명세서에 세 갈래 카드(받는 가훈·남는 것·시작 빚·첫 정산 수지)가 보이고 시간 제한·권유 문구는 없다', () => {
    const g = fresh();
    g.family.generation = 3;
    bust(g);
    expect(g.estate!.step).toBe('card');
    expect(A(g, { type: 'inherit', branch: 'renounce' }).ok).toBe(false); // 카드를 넘기기 전에는 못 고른다
    toStatement(g);
    expect(g.estate!.step).toBe('statement');
    const st = statement(g);
    expect(st.cards.map((c) => c.branch)).toEqual(['renounce', 'limited', 'simple']);
    for (const c of st.cards) {
      expect(typeof c.han).toBe('number');
      expect(Array.isArray(c.keeps)).toBe(true);
      expect(c.startDebt + c.tax).toBeGreaterThanOrEqual(200000);
      expect(Number.isFinite(c.firstNet)).toBe(true);
    }
    expect(JSON.stringify(st)).not.toMatch(/추천|권유|제한 시간|deadline/);
    expect(Object.keys(g.estate!)).not.toContain('timeLimit');
  });

  it('AC-v2-101 최고 순자산 1,000,000·누적 채굴 400,000·새 엔딩·장부 20쪽·족보 0: 성과 21, 포기 +25, 한정 +12, 단순 0(성과 21 이월)', () => {
    const g = fresh();
    g.run.cash = 0;
    bust(g, { peak: 1_000_000, mined: 400_000 });
    fakeLedger(g, 19);
    g.pendingEnding!.isNew = true;
    g.family.ledger[IDS[19]] = { count: 1, holders: [], firstAt: 2, scenes: [] };
    const c = hanCalc(g, 'renounce');
    expect(c.peakTerm).toBe(12);
    expect(c.minedTerm).toBe(4);
    expect(c.endingPoints).toBe(5);
    expect(c.score).toBe(21);
    expect(c.award).toBe(25);
    expect(hanCalc(g, 'limited').award).toBe(12);
    expect(hanCalc(g, 'simple').award).toBe(0);
    toStatement(g);
    A(g, { type: 'inherit', branch: 'simple' });
    expect(g.family.han).toBe(0);
    expect(g.family.pending).toEqual({ peakNetWorth: 1_000_000, minedValue: 400_000, endingPoints: 5, simpleStreak: 1 });
  });

  it('AC-v2-102 이미 2번 얻은 엔딩(이번이 3번째): 반복 감쇠 0.49·새 엔딩 점수 5 없음. 8번째여도 0.3 아래로 안 내려간다', () => {
    const g = fresh();
    g.run.cash = 0;
    bust(g, { peak: 1_000_000, mined: 400_000 });
    fakeLedger(g, 20);
    g.pendingEnding!.isNew = false;
    g.pendingEnding!.nth = 3;
    const c = hanCalc(g, 'renounce');
    expect(c.repeatMul).toBeCloseTo(0.49, 10);
    expect(c.endingPoints).toBe(0);
    expect(c.score).toBe(16);
    expect(c.award).toBe(Math.floor(16 * 1.2 * 0.49));
    g.pendingEnding!.nth = 8;
    expect(hanCalc(g, 'renounce').repeatMul).toBe(0.3);
  });

  it('AC-v2-103 단순승인 두 번 뒤 상속포기: 세 세대의 성과(최고 순자산 최댓값, 채굴·엔딩 점수 합)로 한 번에 계산하고 쌓인 성과는 0', () => {
    const g = fresh();
    g.run.cash = 0;
    bust(g, { peak: 400_000, mined: 100_000 });
    const pts = [g.pendingEnding!.isNew ? 5 : 0];
    inherit(g, 'simple');
    g.run.cash = 0;
    bust(g, { peak: 900_000, mined: 200_000 });
    pts.push(g.pendingEnding!.isNew ? 5 : 0);
    inherit(g, 'simple');
    expect(g.family.pending.simpleStreak).toBe(2);
    g.run.cash = 0;
    bust(g, { peak: 100_000, mined: 300_000 });
    pts.push(g.pendingEnding!.isNew ? 5 : 0);
    toStatement(g);
    const c = hanCalc(g, 'renounce');
    expect(c.peak).toBe(900_000);
    expect(c.mined).toBe(600_000);
    expect(c.endingPoints).toBe(pts[0] + pts[1] + pts[2]);
    expect(c.peakTerm).toBe(Math.floor(4 * Math.sqrt(9)));
    expect(c.minedTerm).toBe(Math.floor(2 * Math.sqrt(6)));
    A(g, { type: 'inherit', branch: 'renounce' });
    expect(g.family.pending).toEqual({ peakNetWorth: 0, minedValue: 0, endingPoints: 0, simpleStreak: 0 });
    expect(g.family.han).toBe(c.award);
  });

  it('AC-v2-104 최고 순자산이 음수인 세대: 재산 항은 0', () => {
    const g = fresh();
    g.run.cash = 0;
    bust(g, { peak: -500_000, mined: 0 });
    g.run.peakNetWorth = -500_000;
    const c = hanCalc(g, 'renounce');
    expect(c.peakTerm).toBe(0);
    expect(Number.isFinite(c.award)).toBe(true);
  });

  it('AC-v2-105 부모가 캐피탈 20만·오소리 16만: 상속포기 -> 물려받는 빚 0, 학자금 15만 + 연대보증 8만, 현금 70,000, 텐트, 쳇바퀴·설비·계좌 없음, 단계 0, 떼인 채권처 한도 절반', () => {
    const g = parentWithDebts({ capital: 200000, shark1: 160000 });
    bust(g);
    inherit(g, 'renounce');
    const r = g.run;
    expect(r.branch).toBe('renounce');
    expect(r.debts.capital).toMatchObject({ principal: 150000, inherited: 0 });
    expect(r.debts.shark1).toMatchObject({ principal: 80000, inherited: 0 });
    expect(startDebt(g)).toBe(230000);
    expect(r.cash).toBe(70000);
    expect(r.house).toBe(0);
    expect(Object.keys(r.coinWheels)).toEqual([]);
    expect(r.equipment).toEqual([]);
    expect(r.futures.open).toBe(false);
    expect(stage(r)).toBe(0);
    expect(g.family.lenderRelations.capital).toBe('grudge');
    expect(lenderLimit(g, 'capital')).toBe(200000 * 0.5);
  });

  it('AC-v2-106 부모에게 사채가 없으면 연대보증 5만(시작 빚 20만), 사채 50만이면 15만(30만)', () => {
    const a = parentWithDebts({ capital: 100000 });
    bust(a);
    inherit(a, 'renounce');
    expect(a.run.debts.shark1.principal).toBe(50000);
    expect(startDebt(a)).toBe(200000);
    const b = parentWithDebts({ shark2: 500000 });
    bust(b);
    inherit(b, 'renounce');
    expect(b.run.debts.shark1.principal).toBe(150000);
    expect(startDebt(b)).toBe(300000);
  });

  it('AC-v2-107 창고에 살던 부모의 한정승인: 오두막, 도토코인 쳇바퀴 + 가장 낮은 설비 1대(와 붙은 업그레이드), 나머지는 경매로 부모 빚을 갚고 남으면 현금, 현금 70,000 + 잉여금, 단계 1', () => {
    const g = parentWithDebts({ capital: 100000 });
    g.run.house = 2;
    giveWheel(g, 'DTC');
    giveWheel(g, 'MDT');
    giveEquip(g, 'wheel2', 'DTC', 20000);
    giveEquip(g, 'wheel2', 'MDT', 25000);
    giveEquip(g, 'helper', 'DTC', 60000);
    g.run.upgrades.coinWheel.DTC = { oil: 2 };
    g.run.upgrades.coinWheel.MDT = { oil: 5 };
    g.run.cash = 0;
    bust(g);
    // 경매: 설비 50% (25000 → 12500, 60000 → 30000) + 멍도토 쳇바퀴 50% 7,500 + 집 70% 1,400,000 − 빚 100,000
    const surplus = 12500 + 30000 + 7500 + 1_400_000 - 100000;
    inherit(g, 'limited');
    const r = g.run;
    expect(r.house).toBe(1);
    expect(Object.keys(r.coinWheels)).toEqual(['DTC']);
    expect(r.equipment.map((u) => [u.tier, u.coin])).toEqual([['wheel2', 'DTC']]);
    expect(r.upgrades.coinWheel).toEqual({ DTC: { oil: 2 } });
    expect(r.cash).toBe(70000 + surplus);
    expect(startDebt(g)).toBe(200000);
    expect(stage(r)).toBe(1);
    expect(r.futures.open).toBe(false);
    expect(r.futures.edu).toBe(1);
    expect(Object.keys(g.family.lenderRelations)).toEqual([]); // 빚을 다 갚았으니 떼인 곳 없음
  });

  it('AC-v2-108 부모 남은 빚 캐피탈 20만·독사 80만(그중 30만은 연체 이자), 연속 단순승인 0: 승계 70만을 상한 30만에 맞춰 캐피탈 85,714·독사 214,286, 독사 금리 4%, 정산 1~3회 이자 0, 4회째부터 이자', () => {
    const g = parentWithDebts({ capital: 200000, shark2: 800000 });
    g.run.stats['capInt.shark2'] = 300000;
    g.run.cash = 0;
    bust(g);
    inherit(g, 'simple');
    const r = g.run;
    expect(r.debts.capital).toMatchObject({ principal: 85714, inherited: 85714, graceLeft: 3 });
    expect(r.debts.shark2).toMatchObject({ principal: 214286, inherited: 214286, rateCap: 0.04, graceLeft: 3 });
    expect(interestDue(g, 'shark2')).toBe(0);
    settleOnce(g, 3);
    expect(r.debts.shark2.graceLeft).toBe(0);
    expect(r.debts.shark2.principal).toBe(214286); // 3회 동안 이자 없음
    expect(interestDue(g, 'shark2')).toBe(Math.ceil(214286 * 0.04 * (g.family.lenderRelations.shark2 === 'grudge' ? 1 : 1)));
    expect(g.family.lenderRelations.shark2).toBe('tie');
  });

  it('AC-v2-109 부모가 소형 발전기까지 가져 봤고 파산 때 설비 0대: 단순승인 -> 쳇바퀴 줄 1대(inheritedSign) + 도토코인 쳇바퀴, 단계 1', () => {
    const g = parentWithDebts({ capital: 200000 });
    g.run.stats.maxTierEver = 3; // generator
    bust(g);
    inherit(g, 'simple');
    expect(g.run.equipment.map((u) => [u.tier, u.inheritedSign])).toEqual([['row', true]]);
    expect(Object.keys(g.run.coinWheels)).toEqual(['DTC']);
    expect(stage(g.run)).toBe(1);
  });

  it('AC-v2-110 부모의 선물 계좌(50배): 단순승인은 그대로, 상속포기는 계좌 없음·사전교육 1장', () => {
    const mk = () => {
      const g = parentWithDebts({ capital: 200000 });
      openFutures(g, 50);
      bust(g);
      return g;
    };
    const s = mk();
    inherit(s, 'simple');
    expect(s.run.futures.open).toBe(true);
    expect(s.run.futures.levCap).toBe(50);
    expect(stage(s.run)).toBe(2);
    const r = mk();
    inherit(r, 'renounce');
    expect(r.run.futures.open).toBe(false);
    expect(r.run.futures.edu).toBe(1);
  });

  it('AC-v2-111 어느 갈래든 시작 빚 합계 ≥ 200,000. 증여로 세금이 6만이면 학자금 14만이 더해진다', () => {
    for (const b of ['renounce', 'limited', 'simple'] as const) {
      const g = parentWithDebts({ capital: 50000 });
      bust(g);
      inherit(g, b);
      expect(startDebt(g) + g.run.debts.tax.principal).toBeGreaterThanOrEqual(200000);
    }
    const g = fresh();
    noDebts(g);
    g.run.house = 1;
    g.run.cash = 50000; // 순재산 50,000 + 오두막 450,000 = 500,000 → 세금 60,000
    expect(canRetire(g)).toBe(true);
    A(g, { type: 'retire' });
    A(g, { type: 'inherit', branch: 'gift' });
    A(g, { type: 'nextGeneration' });
    expect(g.run.debts.tax.principal).toBe(60000);
    expect(g.run.debts.capital.principal).toBe(140000);
  });

  it('AC-v2-112 빚 0·오두막 이상 은퇴: 엔딩 없이 전부 그대로, 순재산 100만이면 세금 21만, 한은 받지 않고 성과(+8)가 이월된다', () => {
    const g = fresh();
    noDebts(g);
    g.run.house = 1;
    g.run.cash = 542000; // + 쳇바퀴 8,000 + 오두막 450,000 = 1,000,000
    giveWheel(g, 'DTC');
    g.run.peakNetWorth = 1_000_000;
    A(g, { type: 'retire' });
    expect(g.run.over).toBe(true);
    expect(g.pendingEnding).toBeNull();
    expect(g.estate!.kind).toBe('retire');
    const ledgerBefore = Object.keys(g.family.ledger).length;
    A(g, { type: 'inherit', branch: 'gift' });
    expect(g.family.han).toBe(0);
    expect(g.family.pending.endingPoints).toBe(8);
    expect(g.family.pending.peakNetWorth).toBe(1_000_000);
    A(g, { type: 'nextGeneration' });
    const r = g.run;
    expect(r.branch).toBe('gift');
    expect(r.cash).toBe(542000);
    expect(r.house).toBe(1);
    expect(Object.keys(r.coinWheels)).toEqual(['DTC']);
    expect(r.debts.tax.principal).toBe(210000);
    expect(r.taxDueIn).toBe(8);
    expect(Object.keys(g.family.ledger).length).toBe(ledgerBefore);
    expect(g.family.traits).toEqual(['silverspoon']);
    expect(g.family.retireStreak).toBe(1);
    // 빚이 있거나 텐트면 은퇴할 수 없다
    const h = fresh();
    expect(canRetire(h)).toBe(false);
  });

  it('AC-v2-113 가훈 20, grip 0단계: 1단계 5·2단계 8·3단계 12. 두 단계를 사면 가훈 7, 줍기·채굴 1회 +20%', () => {
    const g = fresh();
    g.family.han = 20;
    expect([0, 1, 2].map((l) => treeCost('grip', l))).toEqual([5, 8, 12]);
    expect(A(g, { type: 'buyTree', id: 'grip' }).ok).toBe(true);
    expect(A(g, { type: 'buyTree', id: 'grip' }).ok).toBe(true);
    expect(g.family.han).toBe(7);
    expect(g.family.hanSpent).toBe(13);
    expect(g.family.tree.grip).toBe(2);
    expect(A(g, { type: 'buyTree', id: 'grip' }).ok).toBe(false); // 12 > 7
    const cash = g.run.cash;
    tapN(g, 10);
    expect(Math.round(g.run.cash - cash)).toBe(324); // 27 × 1.2 × 10
    expect(treeStatus(g).find((t) => t.id === 'grip')).toMatchObject({ level: 2, cost: 12, canBuy: false });
  });

  it('AC-v2-114 heirwheel 1: 상속포기로 시작해도 도토코인 쳇바퀴·단계 1. seed 2: 시작 현금 +40,000. prep 2: 선물 계좌 채굴 조건 30,000, 밤더리움 쳇바퀴 12,000', () => {
    const g = parentWithDebts({ capital: 200000 });
    g.family.tree = { heirwheel: 1, seed: 2, prep: 2 };
    bust(g);
    inherit(g, 'renounce');
    expect(Object.keys(g.run.coinWheels)).toEqual(['DTC']);
    expect(stage(g.run)).toBe(1);
    expect(g.run.cash).toBe(70000 + 40000);
    expect(futuresMinedValueNeeded(g)).toBe(30000);
    expect(wheelStatus(g, 'BTH').progress!.need).toBe(12000);
    // 단계 3: 도토코인 + 보조 쳇바퀴 1대 + 밤더리움
    const h = parentWithDebts({ capital: 200000 });
    h.family.tree = { heirwheel: 3 };
    bust(h);
    inherit(h, 'renounce');
    expect(Object.keys(h.run.coinWheels).sort()).toEqual(['BTH', 'DTC']);
    expect(h.run.equipment.map((u) => u.tier)).toEqual(['wheel2']);
  });

  it('AC-v2-115 haggle 3: 오소리 이자율 4% × 0.97³. nerve 2: 계좌를 열 때 상한 200', () => {
    const g = fresh();
    g.family.tree = { haggle: 3, nerve: 2 };
    noDebts(g);
    g.run.debts.shark1.principal = 100000;
    expect(interestDue(g, 'shark1')).toBe(Math.ceil(100000 * 0.04 * Math.pow(0.97, 3)));
    g.run.minedValue = 50000;
    g.run.cash = 100000;
    giveWheel(g, 'DTC');
    for (let i = 0; i < 3; i++) A(g, { type: 'eduPage' });
    A(g, { type: 'mockTrade' });
    expect(A(g, { type: 'openAccount' }).ok).toBe(true);
    expect(g.run.futures.levCap).toBe(200);
  });

  it('AC-v2-116 부모가 청산으로 파산하면 기질 한 방 체질, 같은 원인으로 2대 연속이면 진한 피(두 효과 1.5배)', () => {
    const g = parentWithDebts({ capital: 200000 });
    g.run.cash = 50000;
    bust(g, { immediate: true });
    expect(g.run.bankruptcy!.cause).toBe('LIQ');
    inherit(g, 'renounce');
    expect(g.family.traits).toEqual(['onehit']);
    expect(g.family.deepBlood).toBe(false);
    expect(traitVal(g, 'defaultLeverage')).toBe(50);
    g.run.cash = 50000;
    bust(g, { immediate: true });
    expect(g.run.bankruptcy!.cause).toBe('LIQ');
    inherit(g, 'renounce');
    expect(g.family.traits).toEqual(['onehit']);
    expect(g.family.deepBlood).toBe(true);
    // 다른 원인이 오면 부모 기질 + 조부모 기질
    const h = parentWithDebts({ capital: 200000 });
    h.family.traits = ['onehit'];
    h.run.debts.shark1.overdue = 1;
    bust(h, { lastLender: 'shark1' });
    const cause = h.run.bankruptcy!.cause;
    inherit(h, 'renounce');
    expect(h.family.traits.length).toBe(cause === 'LIQ' ? 1 : 2);
  });

  it('AC-v2-117 빚 없는 은퇴 2대 연속 뒤 그다음 세대가 세금을 기한 안에 완납하면 「고리 끊기」', () => {
    const g = fresh();
    noDebts(g);
    g.run.house = 1;
    g.run.cash = 800000;
    A(g, { type: 'retire' });
    A(g, { type: 'inherit', branch: 'gift' });
    A(g, { type: 'nextGeneration' });
    expect(g.family.retireStreak).toBe(1);
    g.run.cash = 99999999;
    A(g, { type: 'stamp', lender: 'tax', mult: 'all' }); // 첫 은퇴 세대의 세금은 기한 안에 냈지만 연속은 1
    expect(g.family.chainBroken).toBe(false);
    for (const d of Object.values(g.run.debts)) d.principal = 0;
    A(g, { type: 'retire' });
    A(g, { type: 'inherit', branch: 'gift' });
    A(g, { type: 'nextGeneration' });
    expect(g.family.retireStreak).toBe(2);
    expect(g.run.debts.tax.principal).toBeGreaterThan(0);
    expect(g.family.chainBroken).toBe(false);
    g.run.cash = 99999999;
    A(g, { type: 'stamp', lender: 'tax', mult: 'all' });
    expect(g.run.debts.tax.principal).toBe(0);
    expect(g.family.chainBroken).toBe(true);
    expect(g.family.traces).toContain('chain_broken');
    expect(g.run.over).toBe(false); // 게임은 계속된다
  });

  it('AC-v2-118 어떤 방식으로 세대가 끝나든 가문 장부·최고 재산·한·트리·정보 수첩·유품함은 그대로다', () => {
    for (const b of ['renounce', 'limited', 'simple'] as const) {
      const g = parentWithDebts({ capital: 200000 });
      g.family.tipBook = { fox: { said: 5, hit: 2 } };
      g.family.tree = { grip: 2 };
      g.family.han = 10;
      g.family.peakNetWorth = 5_000_000;
      g.family.heirlooms = { h_liq: { level: 1, pawnedTo: null } };
      bust(g);
      const ledgerKeys = Object.keys(g.family.ledger);
      const han0 = g.family.han;
      inherit(g, b);
      const f = g.family;
      expect(Object.keys(f.ledger)).toEqual(ledgerKeys);
      expect(f.peakNetWorth).toBeGreaterThanOrEqual(5_000_000);
      expect(f.han).toBeGreaterThanOrEqual(han0);
      expect(f.tree).toEqual({ grip: 2 });
      expect(f.tipBook).toEqual({ fox: { said: 5, hit: 2 } });
      expect(f.heirlooms.h_liq).toBeDefined();
      expect(f.generation).toBe(4);
    }
  });

  // ── M4 보조 규칙 ────────────────────────────────────────────────────
  it('가훈 문구: 원인마다 maxims.byCause 의 한 줄이 {points} 를 채워 estate 에 남는다', () => {
    for (const cause of Object.keys(legacy.maxims.byCause)) {
      const g = fresh();
      g.run.cash = 0;
      bust(g, { peak: 1_000_000, mined: 400_000 });
      g.estate = { ...g.estate!, cause, step: 'statement' };
      A(g, { type: 'inherit', branch: 'renounce' });
      expect(g.estate!.maxim).toContain(String(g.estate!.award));
      expect(g.estate!.maxim).not.toContain('{points}');
      expect(legacy.maxims.byCause[cause].some((l: string) => g.estate!.maxim === l.replace('{points}', String(g.estate!.award)))).toBe(true);
    }
  });

  it('빚 수렁 방지: 연속 단순승인 상한 30만 → 60만 → 90만(그 뒤 90만), 사채는 빌린 원금만, 포기는 언제나 20~30만·현금 7만·텐트', () => {
    let g = parentWithDebts({ capital: 2_000_000 });
    const caps: number[] = [];
    for (let i = 0; i < 5; i++) {
      g.run.cash = 0;
      g.run.debts.capital.principal = Math.max(g.run.debts.capital.principal, 2_000_000);
      bust(g);
      inherit(g, 'simple');
      caps.push(g.run.debts.capital.inherited);
    }
    expect(caps).toEqual([300000, 600000, 900000, 900000, 900000]);
    g.run.debts.capital.principal = 5_000_000;
    bust(g);
    inherit(g, 'renounce');
    expect(g.run.cash).toBe(70000);
    expect(g.run.house).toBe(0);
    const total = startDebt(g);
    expect(total).toBeGreaterThanOrEqual(200000);
    expect(total).toBeLessThanOrEqual(300000);
    g = fresh();
  });

  it('원한: 갚지 못한 채권처만 원한(한도 절반·금리 +1%p), thickskin 이 깎임을 줄인다', () => {
    const g = parentWithDebts({ shark1: 400000, bank: 0 });
    g.family.tree = { thickskin: 2 };
    bust(g);
    inherit(g, 'renounce');
    expect(g.family.lenderRelations).toEqual({ shark1: 'grudge' });
    expect(lenderLimit(g, 'shark1')).toBe(500000); // 깎임 0
    g.family.tree = {};
    expect(lenderLimit(g, 'shark1')).toBe(250000);
  });

  it('유품 전당: 유품 단계별 5만/15만/40만을 오소리·독사에서 빌리고, 다 갚으면 돌아오며, 맡긴 채 파산하면 0단계', () => {
    const g = fresh();
    noDebts(g);
    g.family.heirlooms = { h_liq: { level: 2, pawnedTo: null } };
    g.run.cash = 0;
    expect(A(g, { type: 'pawn', heirloom: 'h_liq', lender: 'shark1' }).ok).toBe(true);
    expect(g.run.cash).toBe(150000);
    expect(g.run.debts.shark1.principal).toBe(150000);
    expect(g.run.stats.pawned).toBe(1);
    expect(A(g, { type: 'pawn', heirloom: 'h_liq', lender: 'shark1' }).ok).toBe(false);
    A(g, { type: 'stamp', lender: 'shark1', mult: 'all' });
    expect(g.family.heirlooms.h_liq.pawnedTo).toBeNull();
    // 맡긴 채 파산
    const h = fresh();
    h.family.heirlooms = { h_liq: { level: 2, pawnedTo: null } };
    A(h, { type: 'pawn', heirloom: 'h_liq', lender: 'shark1' });
    h.run.cash = 0;
    bust(h);
    A(h, { type: 'estateNext' });
    A(h, { type: 'inherit', branch: 'renounce' });
    expect(h.family.heirlooms.h_liq.level).toBe(0);
    expect(pawn(h, 'h_liq', 'shark1').ok).toBe(false);
  });

  it('M3 에서 비워 둔 통계 키가 채워진다: parentInherit·parentCause·houseInherited·inheritedPaid·estateNet', () => {
    const g = parentWithDebts({ capital: 100000 });
    g.run.house = 1;
    g.run.cash = 0;
    expect(estateSurplus(g.run)).toBe(Math.floor(500000 * 0.7) - 100000);
    bust(g);
    const cause = g.run.bankruptcy!.cause;
    expect(g.pendingEnding!.snapshot.estateNet).toBe(250000);
    inherit(g, 'simple');
    expect(g.run.stats.parentInherit).toBe('forced');
    expect(g.run.stats.parentCause).toBe(cause);
    expect(g.run.stats.houseInherited).toBe(true);
    g.run.cash = 50000;
    A(g, { type: 'stamp', lender: 'capital', mult: 10 });
    expect(g.run.stats.inheritedPaid).toBeGreaterThan(0);
    g.run.stats.houseInherited = true;
    A(g, { type: 'move', to: 0 });
    expect(g.run.stats.houseInherited).toBe(false);
  });

  it('미리보기는 상태를 바꾸지 않고, 고른 결과와 같다', () => {
    const g = parentWithDebts({ capital: 200000, shark1: 160000 });
    g.run.cash = 0;
    bust(g);
    toStatement(g);
    const before = JSON.stringify(g);
    const card = previewBranch(g, 'renounce');
    expect(JSON.stringify(g)).toBe(before);
    A(g, { type: 'inherit', branch: 'renounce' });
    A(g, { type: 'nextGeneration' });
    expect(card.startDebt).toBe(startDebt(g));
    expect(card.startCash).toBe(g.run.cash);
    expect(card.han).toBe(g.family.han);
    expect(hanTotal(g)).toBe(card.han);
    expect(clone(g.family.generation)).toBe(4);
  });
});

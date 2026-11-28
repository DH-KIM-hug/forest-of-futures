// U-62 라이트 열매(engine/liteFruit.ts): 황금 도토코인 대신 엔딩 도감이 나무를 키운다.
// 새 엔딩만 열매, 죽은 모양에 맞는 공짜 가지, 도감 보상 5 / 10 / 20 / 30 / 40, 완납 = 특별한 결말, 옛 저장 옮기기, 라이트 화면에 황금이라는 말이 없다.
import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { A, settleOnce } from './helpers';
import { balance, skillById, skillNodes } from '../../src/engine/data';
import { createLiteGame, liteAfterLoan } from '../../src/engine/lite';
import { createGame } from '../../src/engine/game';
import { migrate, serialize } from '../../src/engine/save';
import { liteDevPick, liteEndings, LITE_ENDING_TOTAL } from '../../src/engine/liteEndings';
import { CLEAR_ID, COMPLETE_ID, GIFT_PAIRS, MILESTONES, liteSeenCount, litePerks, nextMilestone, recordLiteReward } from '../../src/engine/liteFruit';
import { buyNode, canBuy, costAt, nextCost, treeAward, treeWallet } from '../../src/engine/skilltree';
import { totalDebt, interestDue } from '../../src/engine/selectors';
import { giftText, nextText, rebirthFruit, retireSubLite } from '../../src/ui/proto/lite/fruitText';
import { repayBuys } from '../../src/ui/proto/ledger';
import type { GameState } from '../../src/engine/types';

const act1 = (on: boolean) => { if (on) (balance as { act1?: unknown }).act1 = { friends: false }; else delete (balance as { act1?: unknown }).act1; };
afterEach(() => { act1(false); liteDevPick.id = null; });

/** 연체 파산 한 번(엔딩을 고를 수 있다) */
function dieLite(g: GameState, pick?: string): void {
  if (pick) liteDevPick.id = pick;
  settleOnce(g); settleOnce(g);
  expect(g.run.over).toBe(true);
}
/** 도감에 미리 n개(LE40 부터 거꾸로, except 는 뺀다) */
function preseed(g: GameState, n: number, except: string[] = []): void {
  g.family.liteBook ??= {};
  for (const e of [...liteEndings].reverse().filter((x) => !except.includes(x.id)).slice(0, n)) g.family.liteBook[e.id] = { count: 1, firstAt: 1 };
}

describe('열매: 새 엔딩만', () => {
  it('처음 보는 엔딩은 열매 1개, 같은 엔딩을 다시 보면 0', () => {
    act1(true);
    const g = createLiteGame({ seed: 9 });
    dieLite(g, 'LE40');
    const p = g.pendingEnding!;
    expect(p.isNew).toBe(true);
    expect(p.lite!.reward!.fruit).toBe(1);
    expect(p.lite!.reward!.newCount).toBe(1);
    expect(g.family.fruit).toBe(1);
    expect(g.family.gold).toBe(0); // 황금은 주지 않는다
    // 같은 엔딩 다시
    const g2 = createLiteGame({ seed: 9 });
    g2.family = g.family;
    dieLite(g2, 'LE40');
    expect(g2.pendingEnding!.isNew).toBe(false);
    expect(g2.pendingEnding!.lite!.reward!.fruit).toBe(0);
    expect(g2.family.fruit).toBe(1);
    expect(rebirthFruit(g2.pendingEnding).main).toBe('새 엔딩 없음');
    expect(rebirthFruit(g.pendingEnding).main).toBe('이번 생에 새 엔딩 1개 → 열매 +1');
  });
  it('라이트 생은 황금을 받지 않는다(갚은 원금이 있어도)', () => {
    const g = createLiteGame();
    g.run.stats['repaid.shark1'] = 250_000;
    expect(treeAward(g.run)).toBe(0);
    const m = createGame();
    m.run.stats['repaid.shark1'] = 250_000;
    expect(treeAward(m.run)).toBeGreaterThan(0); // 본편은 그대로
  });
});

describe('열매로 나무를 산다(라이트 값)', () => {
  it('뿌리와 첫 가지는 1개, 2단계 2, 3단계 3, 4단계 5. 레벨마다 1.6배로 끝없이', () => {
    const want = [1, 1, 2, 3, 5];
    for (const d of skillNodes) expect(costAt(d, 0, true)).toBe(want[d.tier]);
    const a1 = skillById.A1;
    expect([1, 2, 3, 4, 5].map((lv) => costAt(a1, lv, true))).toEqual([2, 3, 5, 7, 11]);
    expect(costAt(a1, 30, true)).toBeGreaterThan(1000); // 다 차지 않는다
  });
  it('엔딩 둘이면 뿌리와 첫 가지 하나, 열매가 모자라면 「열매가 모자랍니다」', () => {
    const g = createLiteGame();
    g.family.fruit = 2;
    expect(treeWallet(g)).toBe(2);
    expect(buyNode(g, 'R').ok).toBe(true);
    expect(buyNode(g, 'C1').ok).toBe(true);
    expect(g.family.fruit).toBe(0);
    expect(canBuy(g, 'A1')).toEqual({ ok: false, reason: '열매가 모자랍니다.' });
    expect(nextCost(g, 'C1')).toBe(2);
  });
  it('본편은 황금 도토코인 그대로', () => {
    const g = createGame();
    g.family.gold = 1; g.family.fruit = 50;
    expect(treeWallet(g)).toBe(1);
    expect(buyNode(g, 'R').ok).toBe(true);
    expect(g.family.gold).toBe(0);
    expect(g.family.fruit).toBe(50);
  });
});

describe('공짜 가지(죽은 모양에 맞는 노드)', () => {
  it('6~10쌍, 노드는 모두 있다, 드럼통 = 한 번 버티기, 200배 생방송 = 고배율 축하금, 오래 버팀 = 마진콜 전화(금리)', () => {
    expect(GIFT_PAIRS.length).toBeGreaterThanOrEqual(6);
    expect(GIFT_PAIRS.length).toBeLessThanOrEqual(10);
    for (const x of GIFT_PAIRS) expect(skillById[x.node], x.node).toBeTruthy();
    const of = (id: string) => GIFT_PAIRS.find((x) => x.ending === id)?.node;
    expect(of('LE02')).toBe('B1');
    expect(of('LE15')).toBe('B3a');
    expect(of('LE33')).toBe('B2');
  });
  it('드럼통 엔딩을 처음 보면 「한 번 버티기」가 열리고 카드에 적힌다. 가졌으면 한 레벨', () => {
    act1(true);
    const g = createLiteGame({ seed: 3 });
    dieLite(g, 'LE02');
    const r = g.pendingEnding!.lite!.reward!;
    expect(r.gift).toMatchObject({ node: 'B1', kind: 'open', level: 1 });
    expect(giftText(r.gift!)).toBe('「한 번 버티기」 가지가 열렸다');
    expect(g.family.skill.B1).toBe(1);
    expect(g.family.fruit).toBe(1); // 열매는 따로
    const h = createLiteGame();
    h.family.skill = { B1: 2 };
    const { reward } = recordLiteReward(h, 'LE02');
    expect(reward.gift).toMatchObject({ kind: 'level', level: 3 });
    expect(h.family.skill.B1).toBe(3);
  });
  it('짝 가지(3단계)는 열리면 이번에 켜는 쪽이 된다', () => {
    const g = createLiteGame();
    recordLiteReward(g, 'LE15');
    expect(g.family.skill.B3a).toBe(1);
    expect(g.family.skillPick.B).toBe('B3a');
  });
});

describe('도감 보상', () => {
  it('5 / 10 / 20 / 30 / 40, 보상마다 열매가 더 붙는다', () => {
    expect(MILESTONES.map((m) => m.at)).toEqual([5, 10, 20, 30, 40]);
    expect(MILESTONES.at(-1)!.at).toBe(LITE_ENDING_TOTAL);
    expect(nextMilestone(3)!.left).toBe(2);
    expect(nextText(8)).toBe('다음 보상까지 2');
    expect(nextMilestone(40)).toBeNull();
  });
  it('다섯 번째 새 엔딩: 열매 1 + 보상 1, 다음 생 손에 +1만', () => {
    act1(true);
    const g = createLiteGame({ seed: 5 });
    preseed(g, 4, ['LE40']);
    dieLite(g, 'LE40');
    const r = g.pendingEnding!.lite!.reward!;
    expect(r.seen).toBe(5);
    expect(r.milestone).toMatchObject({ at: 5, fruit: 1 });
    expect(r.fruit).toBe(2);
    expect(r.next).toMatchObject({ at: 10, left: 5 });
    expect(litePerks(g.family.liteBook).cash).toBe(10_000);
    const n = createLiteGame();
    n.family = g.family;
    liteAfterLoan(n);
    expect(n.run.cash).toBe(110_000);
  });
  it('열 개: 코인 빚 30만의 이자 −10%', () => {
    const g = createLiteGame();
    const base = createLiteGame();
    liteAfterLoan(base);
    preseed(g, 10);
    liteAfterLoan(g);
    expect(totalDebt(g.run)).toBe(400_000);
    expect(g.run.debts.shark1.rateCap).toBeCloseTo(0.009, 9);
    expect(interestDue(g, 'shark1')).toBeLessThan(interestDue(base, 'shark1'));
  });
  it('스무 개 케이스, 서른 개 칭호, 마흔 개 = 도감 완성(특별한 결말이 같이 적힌다)', () => {
    const g = createLiteGame();
    preseed(g, 39, ['LE01']);
    expect(litePerks(g.family.liteBook)).toMatchObject({ inkCase: true, title: '드럼통 감별사', complete: false });
    const f0 = g.family.fruit ?? 0;
    const { reward } = recordLiteReward(g, 'LE01');
    expect(reward.milestone?.at).toBe(40);
    expect(g.family.liteBook![COMPLETE_ID]).toBeTruthy();
    expect(reward.newCount).toBe(2);
    expect((g.family.fruit ?? 0) - f0).toBe(1 + 5 + 1);
    expect(liteSeenCount(g.family.liteBook)).toBe(40); // 특별한 결말은 40 에 세지 않는다
    expect(reward.next).toBeNull();
  });
  it('덤은 시작 순자산을 최대 1만 올린다(전광판 검사 lite 시작 −29만과 맞는다)', () => {
    const g = createLiteGame();
    preseed(g, 40);
    liteAfterLoan(g);
    expect(g.run.cash - totalDebt(g.run)).toBe(-290_000);
  });
});

describe('완납 = 특별한 결말 「완납 영수증」', () => {
  it('빚을 다 갚고 은퇴하면 도감에 LX01, 처음이면 열매 1개, 황금 0, 카드는 라이트 카드(도장 완납)', () => {
    act1(true);
    const g = createLiteGame();
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    g.run.cash += 600_000;
    expect(A(g, { type: 'stamp', lender: 'shark1', mult: 'all' }).ok).toBe(true);
    expect(retireSubLite(g)).toBe('이번 생 마치기, 도감에 「완납 영수증」, 열매 +1');
    expect(A(g, { type: 'retireAct1' }).ok).toBe(true);
    const p = g.pendingEnding!;
    expect(p.id).toBe(CLEAR_ID);
    expect(p.lite?.stamp).toBe('완납');
    expect(p.lite?.reward?.fruit).toBe(1);
    expect(g.family.fruit).toBe(1);
    expect(g.family.gold).toBe(0);
    expect(g.estate?.gold ?? 0).toBe(0);
    expect(Object.keys(g.family.ledger)).toEqual([]);
    expect(retireSubLite(g)).toBe('이번 생 마치기, 완납 영수증 한 장 더');
  });
});

describe('옛 라이트 저장 옮기기', () => {
  it('남은 황금은 열매로(올림), 본 엔딩마다 열매와 공짜 가지와 보상을 소급, 두 번 옮기지 않는다', () => {
    const g = createLiteGame();
    g.family.gold = 3;
    g.family.skill = { R: 1 };
    preseed(g, 5, []); // LE36~LE40
    g.family.liteBook!.LE02 = { count: 2, firstAt: 1 }; // 드럼통 = B1
    const raw = JSON.parse(serialize(g, 1));
    delete raw.family.fruit; delete raw.family.fruitEarned;
    const back = migrate(raw)!;
    // 황금 3 + 본 엔딩 6 + 5개 보상 1
    expect(back.family.fruit).toBe(3 + 6 + 1);
    expect(back.family.gold).toBe(0);
    expect(back.family.skill.B1).toBe(1);
    expect(back.family.skill.R).toBe(1);
    const again = migrate(JSON.parse(serialize(back, 2)))!;
    expect(again.family.fruit).toBe(10);
    expect(again.family.skill.B1).toBe(1);
  });
  it('본편 저장은 건드리지 않는다', () => {
    const g = createGame();
    g.family.gold = 7;
    const raw = JSON.parse(serialize(g, 1));
    delete raw.family.fruit;
    const back = migrate(raw)!;
    expect(back.family.gold).toBe(7);
    expect(back.family.fruit ?? 0).toBe(0);
  });
});

describe('라이트 화면에 황금 도토코인이 없다', () => {
  it('라이트 폴더의 화면 파일에 「황금」이 없다', () => {
    const dir = join(__dirname, '../../src/ui/proto/lite');
    for (const f of readdirSync(dir).filter((x) => /\.(tsx?|css)$/.test(x))) {
      const src = readFileSync(join(dir, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
      expect(src, f).not.toMatch(/황금/);
    }
  });
  it('갚으러 가는 단추 글, 은퇴 글, 환생 줄, 엔딩 데이터 글에 황금과 가운데점이 없다', () => {
    const g = createLiteGame();
    liteAfterLoan(g);
    g.run.cash = 300_000;
    const t = repayBuys(g, 0)!.text;
    expect(t).not.toMatch(/황금/);
    const texts = [t, retireSubLite(g), rebirthFruit(null).main, ...rebirthFruit(null).sub, ...MILESTONES.flatMap((m) => [m.name, m.text])];
    for (const e of liteEndings) { const gift = (e as { gift?: { line: string } }).gift; if (gift) texts.push(gift.line); }
    for (const x of texts) { expect(x).not.toMatch(/황금|·/); }
  });
});

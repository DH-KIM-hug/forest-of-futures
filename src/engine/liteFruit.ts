// 라이트 나무의 열매(U-62, 사용자 결정 「황금 도토코인 없애기」): 엔딩 도감이 곧 성장이다.
//   처음 보는 엔딩마다 열매 1개(다시 본 엔딩은 0). 몇몇 엔딩은 죽은 모양에 맞는 가지를 공짜로 연다(가졌으면 한 레벨).
//   도감 5 / 10 / 20 / 30 / 40 개에 닿으면 열매를 더 주고 작은 덤이 켜진다. 완납은 황금 대신 특별한 결말 「완납 영수증」.
// 숫자와 글은 data/endings_lite.json(fruit, endings[].gift). 라이트가 아닌 생은 이 파일을 지나지 않는다.
import liteEndingsJson from '../../data/endings_lite.json';
import { skillById } from './data';
import { maxLevelOf, nodeLevel } from './skilltree';
import { liteEndingById, liteEndings, recordLite, type LiteBookEntry } from './liteEndings';
import type { GameState, LiteReward } from './types';

export type PerkKind = 'cash' | 'rate' | 'case' | 'title' | 'complete';
export interface Milestone { at: number; fruit: number; perk: PerkKind; value: number; name: string; text: string }
export interface LiteSpecial { id: string; title: string; lines: string[]; stamp: string }
interface FruitData { perNew: number; milestones: Milestone[]; specials: LiteSpecial[] }
const FRUIT = (liteEndingsJson as unknown as { fruit: FruitData }).fruit;
export const FRUIT_PER_NEW = FRUIT.perNew;
export const MILESTONES: Milestone[] = FRUIT.milestones;
export const LITE_SPECIALS: LiteSpecial[] = FRUIT.specials;
export const liteSpecialById: Record<string, LiteSpecial> = Object.fromEntries(LITE_SPECIALS.map((s) => [s.id, s]));
/** 완납 영수증 · 도감 완성 */
export const CLEAR_ID = 'LX01', COMPLETE_ID = 'LX02';

/** 엔딩의 공짜 가지(없으면 null) */
export const giftOf = (id: string): { node: string; line: string } | null =>
  (liteEndingById[id] as { gift?: { node: string; line: string } } | undefined)?.gift ?? null;
/** 공짜 가지가 붙은 엔딩들(데이터 순서) */
export const GIFT_PAIRS: { ending: string; node: string }[] = liteEndings.flatMap((e) => (giftOf(e.id) ? [{ ending: e.id, node: giftOf(e.id)!.node }] : []));

/** 도감에서 본 배드 엔딩 수(특별한 결말은 세지 않는다) */
export const liteSeenCount = (book: Record<string, unknown> | undefined): number => liteEndings.filter((e) => !!book?.[e.id]).length;
/** 다음 도감 보상: 몇 개째에, 몇 개 남았나. 다 받았으면 null */
export function nextMilestone(seen: number): { at: number; left: number; text: string; m: Milestone } | null {
  const m = MILESTONES.find((x) => x.at > seen);
  return m ? { at: m.at, left: m.at - seen, text: `${m.text}, 열매 +${m.fruit}`, m } : null;
}
/** 도감 수에 따라 켜지는 덤 */
export interface LitePerks { cash: number; rateMul: number; inkCase: boolean; title: string | null; complete: boolean }
export function litePerks(book: Record<string, unknown> | undefined): LitePerks {
  const n = liteSeenCount(book);
  const on = (k: PerkKind) => MILESTONES.find((m) => m.perk === k && n >= m.at);
  return {
    cash: on('cash')?.value ?? 0,
    rateMul: on('rate')?.value ?? 1,
    inkCase: !!on('case'),
    title: on('title')?.name ?? null,
    complete: !!on('complete'),
  };
}

/** 공짜 가지 하나: 없으면 연다(짝 가지면 이번에 켜는 쪽으로), 가졌으면 한 레벨. 다 자란 노드면 열매 1개로 */
function giveNode(g: GameState, id: string): { kind: 'open' | 'level' | 'fruit'; level: number } {
  const def = skillById[id];
  const f = g.family;
  const lv = nodeLevel(g, id);
  if (!def || lv >= maxLevelOf(def)) { f.fruit = (f.fruit ?? 0) + 1; f.fruitEarned = (f.fruitEarned ?? 0) + 1; return { kind: 'fruit', level: lv }; }
  f.skill[id] = lv + 1;
  if (def.pair && lv === 0) f.skillPick[def.path as 'A' | 'B' | 'C'] = id;
  return { kind: lv === 0 ? 'open' : 'level', level: lv + 1 };
}

const addFruit = (g: GameState, n: number): void => {
  g.family.fruit = (g.family.fruit ?? 0) + n;
  g.family.fruitEarned = (g.family.fruitEarned ?? 0) + n;
};

/** 엔딩 하나를 도감에 적고 상을 준다. 처음이면 열매, 공짜 가지, 도감 보상. 다시 본 것은 열매 0 */
export function recordLiteReward(g: GameState, id: string): { isNew: boolean; reward: LiteReward } {
  const f = g.family;
  f.liteBook ??= {};
  const before = liteSeenCount(f.liteBook);
  const isNew = recordLite(f.liteBook as Record<string, LiteBookEntry>, id, f.generation);
  const reward: LiteReward = { fruit: 0, newCount: 0, gift: null, milestone: null, seen: before, next: null };
  if (isNew) {
    addFruit(g, FRUIT_PER_NEW);
    reward.fruit += FRUIT_PER_NEW;
    reward.newCount = 1;
    const gift = giftOf(id);
    if (gift && skillById[gift.node]) {
      const r = giveNode(g, gift.node);
      if (r.kind === 'fruit') reward.fruit += 1;
      reward.gift = { node: gift.node, name: skillById[gift.node].name, kind: r.kind, level: r.level, line: gift.line };
    }
    const after = liteSeenCount(f.liteBook);
    const m = MILESTONES.find((x) => before < x.at && x.at <= after);
    if (m) {
      addFruit(g, m.fruit);
      reward.fruit += m.fruit;
      reward.milestone = { at: m.at, fruit: m.fruit, name: m.name, text: m.text };
      // 40 개: 특별한 결말 「도감 완성」이 도감에 같이 적힌다(그 몫의 열매도)
      if (m.perk === 'complete' && recordLite(f.liteBook as Record<string, LiteBookEntry>, COMPLETE_ID, f.generation)) {
        addFruit(g, FRUIT_PER_NEW);
        reward.fruit += FRUIT_PER_NEW;
        reward.newCount += 1;
      }
    }
  }
  reward.seen = liteSeenCount(f.liteBook);
  const nx = nextMilestone(reward.seen);
  reward.next = nx ? { at: nx.at, left: nx.left, text: nx.text } : null;
  return { isNew, reward };
}

/** 새 생의 덤(도감 5개 = 손에 +1만, 10개 = 코인 빚 30만의 이자 −10%). liteAfterLoan 의 끝에서 */
export function applyLitePerks(g: GameState): void {
  const p = litePerks(g.family.liteBook);
  if (p.cash > 0) g.run.cash += p.cash;
  const d = g.run.debts.shark1;
  if (p.rateMul < 1 && d.rateCap != null) d.rateCap = d.rateCap * p.rateMul;
}

/** 옛 라이트 저장(열매 칸이 없음): 남은 황금 도토코인은 1개 = 열매 1개(올림), 이미 본 엔딩도 열매와 공짜 가지와 도감 보상을 소급해 준다.
 *  rawFruit = 저장에 적혀 있던 열매(숫자면 이미 옮긴 저장). 옮겼으면 true */
export function migrateLiteFruit(g: GameState, rawFruit: unknown): boolean {
  if (!g.run.lite || typeof rawFruit === 'number') return false;
  const f = g.family;
  const book = f.liteBook ?? {};
  f.fruit = 0; f.fruitEarned = 0;
  addFruit(g, Math.ceil(Math.max(0, f.gold ?? 0)));
  f.gold = 0;
  const seen = liteEndings.filter((e) => book[e.id]);
  addFruit(g, seen.length * FRUIT_PER_NEW);
  for (const e of seen) { const gift = giftOf(e.id); if (gift && skillById[gift.node]) giveNode(g, gift.node); }
  for (const m of MILESTONES) if (seen.length >= m.at) {
    addFruit(g, m.fruit);
    if (m.perk === 'complete' && recordLite(book as Record<string, LiteBookEntry>, COMPLETE_ID, f.generation)) addFruit(g, FRUIT_PER_NEW);
  }
  if (book[CLEAR_ID]) addFruit(g, FRUIT_PER_NEW);
  f.liteBook = book;
  return true;
}

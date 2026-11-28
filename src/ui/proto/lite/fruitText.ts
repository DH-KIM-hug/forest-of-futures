// 라이트 열매(U-62)의 화면 글. 순수: 엔진 값만 읽는다. 황금 도토코인이라는 말은 라이트 화면에 없다.
import type { GameState, LiteReward, PendingEnding } from '../../../engine/types';
import { CLEAR_ID, FRUIT_PER_NEW, nextMilestone, liteSeenCount } from '../../../engine/liteFruit';

/** 공짜 가지 한 줄: 「한 번 버티기」 가지가 열렸다 */
export function giftText(gift: NonNullable<LiteReward['gift']>): string {
  if (gift.kind === 'open') return `「${gift.name}」 가지가 열렸다`;
  if (gift.kind === 'level') return `「${gift.name}」 가지가 한 마디 자랐다, Lv${gift.level}`;
  return `「${gift.name}」 가지는 다 자라서 열매 +1`;
}

/** 다음 도감 보상까지: 「다음 보상까지 2」 */
export function nextText(seen: number): string {
  const nx = nextMilestone(seen);
  return nx ? `다음 보상까지 ${nx.left}` : '도감 보상을 다 받았다';
}
export function nextDetail(seen: number): string {
  const nx = nextMilestone(seen);
  return nx ? `도감 ${nx.at}개: ${nx.text}` : '마흔 가지를 다 봤다';
}

/** 환생 화면의 열매 줄: 이번 생의 새 엔딩과 받은 열매, 없으면 다른 죽음을 권한다 */
export function rebirthFruit(p: PendingEnding | null): { main: string; sub: string[]; fruit: number } {
  const r = p?.lite?.reward;
  if (!r || r.newCount <= 0) return { main: '새 엔딩 없음', sub: ['다른 데서 망해 보자. 다른 코인, 다른 배율, 다른 돈줄, 다른 시각.'], fruit: 0 };
  const sub: string[] = [];
  if (r.gift) sub.push(giftText(r.gift));
  if (r.milestone) sub.push(`도감 ${r.milestone.at}개 보상: ${r.milestone.text}, 열매 +${r.milestone.fruit}`);
  return { main: `이번 생에 새 엔딩 ${r.newCount}개 → 열매 +${r.fruit}`, sub, fruit: r.fruit };
}

/** 빚을 다 갚은 장면의 「은퇴한다」 밑 글 */
export function retireSubLite(g: GameState): string {
  return g.family.liteBook?.[CLEAR_ID] ? '이번 생 마치기, 완납 영수증 한 장 더' : `이번 생 마치기, 도감에 「완납 영수증」, 열매 +${FRUIT_PER_NEW}`;
}

/** 지금 도감 수 */
export const seenOf = (g: GameState): number => liteSeenCount(g.family.liteBook);

const TAG_CLUE: Record<string, string> = {
  'lender:shark1': '오소리 대부 빚이 제일 많은 채', 'lender:shark2': '독사 대부 빚이 제일 많은 채', 'lender:capital': '숲속 캐피탈 빚이 제일 많은 채', 'lender:bank': '조합 빚이 제일 많은 채',
  'clock:night': '밤에', 'clock:dawn': '새벽에', 'clock:morning': '아침에', 'clock:day': '평일 한낮에',
  'life:short': '5분 안에', 'life:mid': '적당히 버티다', 'life:long': '20분 넘게 버티다',
  'lev:high': '100배 넘게 걸고', 'lev:low': '20배 이하로 조심조심', 'lev:mid': '어중간한 배율로',
  'dir:long': '롱만 치다', 'dir:short': '숏을 치다', 'peak:high': '한때 높이 올랐다가', maxed: '빌릴 곳이 다 막힌 채',
  'mode:liq': '몰빵 청산으로', 'mode:locked': '판을 쥔 채 이자를 못 내', 'mode:overdue': '이자가 밀려',
};
/** 못 본 엔딩의 단서: 그 엔딩의 가장 무거운 꼬리표 하나 */
export function liteClue(w: Record<string, number>, coinName: (id: string) => string): string {
  const top = Object.entries(w).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!top) return '어떻게든';
  if (top.startsWith('coin:')) return `${coinName(top.slice(5))}에 걸었다가`;
  return TAG_CLUE[top] ?? '어떻게든';
}

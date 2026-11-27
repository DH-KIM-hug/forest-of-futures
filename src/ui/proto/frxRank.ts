// FRX 회원 등급(U-51, 회차 10): 생마다 처음부터 쌓이는 거래 도장. 나무(환생 때 황금으로 사는 것, 사용자 결정 T-5 · T-7 · U-35 ④)는 그대로 두고,
// 첫 생에도 "거래로 자라는 것"이 화면에 보이게 한다. 실제 거래소의 거래량 등급처럼 판을 할수록 오른다 — 돈 · 수수료 · 확률은 바꾸지 않는다(이름표와 순간만).
//   도장: 닫힌 판마다 1개(진 판도), 터진 판은 등급만큼 더(짭짤하다 · 이자 벌었다 +1, 한 방 +2, 두 배 이상 +3)
//   등급 r 에 필요한 도장 = r(r+5)/2 → 단골 3 · 큰손 7 · 고래 12 · 숲의 고래 18 · 전설 25 · 전설 2 33 … 끝이 없다
export const RANK_NAMES = ['새싹', '단골', '큰손', '고래', '숲의 고래', '전설'];
export const stampsFor = (r: number): number => (r * (r + 5)) / 2;
export const rankName = (r: number): string => (r < RANK_NAMES.length ? RANK_NAMES[r] : `전설 ${r - RANK_NAMES.length + 2}`);
export interface Rank { r: number; name: string; /** 이 등급에 들어온 뒤 모은 도장 · 다음 등급까지 필요한 도장 */ have: number; need: number; next: string }
export function rankOf(stamps: number): Rank {
  let r = 0;
  while (stampsFor(r + 1) <= stamps) r++;
  return { r, name: rankName(r), have: stamps - stampsFor(r), need: stampsFor(r + 1) - stampsFor(r), next: rankName(r + 1) };
}
/** 닫힌 판 하나의 도장. tierLv = 터진 판의 등급(없으면 0) */
export const stampsOf = (tierLv: number): number => 1 + Math.min(3, Math.max(0, tierLv));

/** 등급마다 폰이 달라진다(U-53, 꾸밈뿐: 돈 · 수수료 · 확률은 그대로). 케이스는 폰 테두리 색, 고리는 폰 모서리의 리본 */
export interface RankLook { case: string; caseName: string; bow: string; bowName: string; /** 이 등급에 오르면 받는 것(새로 바뀐 것 하나) */ gift: string }
export const RANK_LOOKS: RankLook[] = [
  { case: 'teal', caseName: '청록', bow: '#C2413B', bowName: '붉은 리본', gift: '' },
  { case: 'leaf', caseName: '잎새 초록', bow: '#C2413B', bowName: '붉은 리본', gift: '잎새 초록 폰 케이스' },
  { case: 'leaf', caseName: '잎새 초록', bow: '#E8B93A', bowName: '금빛 리본', gift: '금빛 리본 고리' },
  { case: 'night', caseName: '밤하늘', bow: '#E8B93A', bowName: '금빛 리본', gift: '밤하늘 폰 케이스' },
  { case: 'plum', caseName: '머루 보라', bow: '#E8B93A', bowName: '금빛 리본', gift: '머루 보라 폰 케이스' },
  { case: 'gold', caseName: '황금', bow: '#C2413B', bowName: '붉은 리본', gift: '황금 폰 케이스' },
];
/** 전설 2 부터는 케이스는 황금 그대로, 고리가 번갈아 바뀐다 */
export function lookOf(r: number): RankLook {
  if (r < RANK_LOOKS.length) return RANK_LOOKS[r];
  const odd = (r - RANK_LOOKS.length) % 2 === 0;
  return { ...RANK_LOOKS[RANK_LOOKS.length - 1], bow: odd ? '#E8B93A' : '#C2413B', bowName: odd ? '금빛 리본' : '붉은 리본', gift: odd ? '금빛 리본 고리' : '붉은 리본 고리' };
}
/** 케이스 색(폰 테두리). teal 은 원래 색(var(--teal)) */
export const CASE_COL: Record<string, string> = { teal: '#3E9A9C', leaf: '#5C9A5A', night: '#3E5C8A', plum: '#7A5AA8', gold: '#C9962E' };

/** 등급의 수수료(U-56 ③, 사용자 결정): 오픈 기념이 끝난 뒤의 수수료율에서 한 등급마다 0.001%p, 절반까지. "0.009%" */
import { tierFee, openingEvent } from '../../engine/skilltree';
import { balance } from '../../engine/data';
export function rankFeePct(r: number): number {
  const ev = openingEvent();
  return tierFee(ev ? ev.afterFeeRate : (balance.trading.feeRate as number), r) * 100;
}
export const rankFeeText = (r: number): string => `수수료 ${+rankFeePct(r).toFixed(4)}%`;

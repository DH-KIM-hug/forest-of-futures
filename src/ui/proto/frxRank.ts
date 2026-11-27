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

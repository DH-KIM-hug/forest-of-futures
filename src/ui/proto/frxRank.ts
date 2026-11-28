// FRX 회원 등급(U-51 → U-65, 사용자 결정 「예탁금과 거래액으로 종합 판단」): 실제 거래소의 VIP 등급처럼 두 잣대로 본다. 거래 도장은 없앴다.
//   예탁금 = 거래소에 있는 돈: 손에 든 돈 + 열린 포지션의 증거금(지금 남은 몫). 빚은 빼지 않는다(거래소는 돈이 어디서 왔는지 묻지 않는다)
//   거래액 = 이번 생에 연 포지션 크기의 합(증거금 × 배율, 추가 진입 포함, 닫는 쪽은 넣지 않는다). run.tradeLog 에서 다시 셀 수 있다
//   등급 r 은 거래액이 V(r) 넘거나 예탁금이 D(r) 넘으면 된다(둘 중 하나). 이번 생에 오른 가장 높은 등급은 그대로 지킨다(예탁금이 줄어도 안 내려간다)
//   생마다 새싹부터(환생과 같은 결)
import type { RunState } from '../../engine/types';
import { comma, abbrev } from '../../engine/util';

export const RANK_NAMES = ['새싹', '단골', '큰손', '고래', '숲의 고래', '전설'];
export const rankName = (r: number): string => (r < RANK_NAMES.length ? RANK_NAMES[r] : `전설 ${r - RANK_NAMES.length + 2}`);

/** 등급 문턱: 거래액, 예탁금. 전설 2 부터는 둘 다 두 배씩 */
export const RANK_BARS: { vol: number; dep: number }[] = [
  { vol: 0, dep: 0 },
  { vol: 10_000_000, dep: 200_000 },
  { vol: 100_000_000, dep: 500_000 },
  { vol: 1_000_000_000, dep: 2_000_000 },
  { vol: 10_000_000_000, dep: 10_000_000 },
  { vol: 100_000_000_000, dep: 100_000_000 },
];
export function barOf(r: number): { vol: number; dep: number } {
  if (r < RANK_BARS.length) return RANK_BARS[r];
  const top = RANK_BARS[RANK_BARS.length - 1], k = 2 ** (r - RANK_BARS.length + 1);
  return { vol: top.vol * k, dep: top.dep * k };
}

/** 예탁금: 손의 돈 + 열린 포지션의 증거금 */
export function depositOf(run: Pick<RunState, 'cash' | 'positions'>): number {
  const m = Object.values(run.positions ?? {}).reduce((a, p) => a + Math.max(0, p.margin), 0);
  return Math.max(0, Math.floor(run.cash + m));
}
/** 거래액: 이번 생에 연 포지션(진입, 추가 진입)의 증거금 × 배율 합 */
export function volumeOf(run: Pick<RunState, 'tradeLog'>): number {
  let v = 0;
  for (const t of (run.tradeLog ?? []) as { kind?: string; margin?: number; lev?: number }[]) {
    if (t && (t.kind === 'entry' || t.kind === 'add')) v += Math.max(0, t.margin ?? 0) * Math.max(1, t.lev ?? 1);
  }
  return Math.floor(v);
}

/** 두 잣대로 닿은 등급(지키는 등급은 빼고) */
export function tierBy(dep: number, vol: number): number {
  let r = 0;
  while (r < 200) { const b = barOf(r + 1); if (vol >= b.vol || dep >= b.dep) r++; else break; }
  return r;
}
/** 이 등급에 들게 한 잣대(둘 다면 거래액) */
export function whyOf(r: number, dep: number, vol: number): { by: 'vol' | 'dep'; at: number } {
  const b = barOf(r);
  return vol >= b.vol || dep < b.dep ? { by: 'vol', at: b.vol } : { by: 'dep', at: b.dep };
}

export interface Rank {
  r: number; name: string; next: string;
  dep: number; vol: number;
  /** 다음 등급까지 모자란 거래액, 예탁금 */ needVol: number; needDep: number;
  /** 다음 등급에 더 가까운 쪽(모자란 몫의 비율이 작은 쪽) */ closer: 'vol' | 'dep';
  /** 다음 등급까지 간 몫(0~1, 가까운 쪽) */ frac: number;
}
/** best = 이번 생에 오른 가장 높은 등급(지킨다) */
export function rankOf(dep: number, vol: number, best = 0): Rank {
  const r = Math.max(best, tierBy(dep, vol));
  const nb = barOf(r + 1);
  const needVol = Math.max(0, Math.ceil(nb.vol - vol)), needDep = Math.max(0, Math.ceil(nb.dep - dep));
  const fv = Math.min(1, vol / nb.vol), fd = Math.min(1, dep / nb.dep);
  return { r, name: rankName(r), next: rankName(r + 1), dep, vol, needVol, needDep, closer: fd > fv ? 'dep' : 'vol', frac: Math.max(fv, fd) };
}
export const rankOfRun = (run: Pick<RunState, 'cash' | 'positions' | 'tradeLog'>, best = 0): Rank => rankOf(depositOf(run), volumeOf(run), best);

/** 큰 문턱의 말: 20만, 1천만, 10억, 1천억, 1조 */
export function bigWord(n: number): string {
  if (n >= 1e12 && n % 1e12 === 0) return `${comma(n / 1e12)}조`;
  if (n >= 1e8 && n % 1e8 === 0) { const x = n / 1e8; return x >= 1000 && x % 1000 === 0 ? `${x / 1000}천억` : `${comma(x)}억`; }
  if (n >= 1e4 && n % 1e4 === 0) { const x = n / 1e4; return x >= 1000 && x % 1000 === 0 ? `${x / 1000}천만` : `${comma(x)}만`; }
  return comma(n);
}
const word = (by: 'vol' | 'dep') => (by === 'vol' ? '거래액' : '예탁금');
/** 다음 목표(둘 다): 「단골까지 거래액 6,200,000 더, 또는 예탁금 80,000 더」 */
export const goalText = (k: Rank): string => `${k.next}까지 거래액 ${comma(k.needVol)} 더, 또는 예탁금 ${comma(k.needDep)} 더`;
/** 다음 목표(가까운 쪽 하나, 짧게): 「단골까지 거래액 620만」 */
export const goalShort = (k: Rank): string => `${k.next}까지 ${word(k.closer)} ${abbrev(k.closer === 'vol' ? k.needVol : k.needDep)}`;
/** 승급의 까닭: 「거래액 1천만 돌파」 */
export const whyText = (w: { by: 'vol' | 'dep'; at: number }): string => `${word(w.by)} ${bigWord(w.at)} 돌파`;

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
export const CASE_COL: Record<string, string> = { teal: '#3E9A9C', leaf: '#5C9A5A', night: '#3E5C8A', plum: '#7A5AA8', gold: '#C9962E', ink: '#2B2622' };

/** 등급의 수수료(U-56 ③, 사용자 결정): 오픈 기념이 끝난 뒤의 수수료율에서 한 등급마다 0.001%p, 절반까지. "0.009%" */
import { tierFee, openingEvent } from '../../engine/skilltree';
import { balance } from '../../engine/data';
export function rankFeePct(r: number): number {
  const ev = openingEvent();
  return tierFee(ev ? ev.afterFeeRate : (balance.trading.feeRate as number), r) * 100;
}
export const rankFeeText = (r: number): string => `수수료 ${+rankFeePct(r).toFixed(4)}%`;

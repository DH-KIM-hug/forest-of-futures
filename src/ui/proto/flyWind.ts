// 날다람쥐코인의 바람 세기와 숲 소문(U-52). 셈은 전부 시세 함수와 같은 씨앗(engine/feed/fly.ts) — 꾸민 말이 없다.
// 소문은 급등락보다 10~60초 앞에 돌기도 하고(급등락의 열에 여섯), 아무 일 없이 돌기도 한다. 쪽은 셋에 둘쯤 맞는다.
import { flyPrice, flyGust, flyTellsBetween, flyTellOutcome, flyTellRecord, TELL_WINDOW, type FlyTell, type FlyJump } from '../../engine/feed/fly';
import { SIM_FLY_EPOCH, simFly } from '../../engine/feed/simFeed';

/** 지금 날다람쥐 값이 셈된 시각(초): 받은 틱 번호가 유닉스 초(실시간) 또는 연습 시세의 번호. 값이 그 시각의 함수 값과 같은 것을 고른다(모르면 null) */
export function flySecOf(run: { prices: Record<string, number>; lastSeenTick: number }): number | null {
  const px = run.prices.FLY;
  if (!px) return null;
  for (const t of [run.lastSeenTick, simFly.epoch + run.lastSeenTick, SIM_FLY_EPOCH + run.lastSeenTick]) if (t > 0 && Math.abs(flyPrice(t) / px - 1) < 1e-9) return t;
  return null;
}

export type GustWord = '잔바람' | '보통 바람' | '센바람' | '돌풍';
export const gustWord = (mul: number): GustWord => (mul < 0.75 ? '잔바람' : mul < 1.35 ? '보통 바람' : mul < 1.9 ? '센바람' : '돌풍');
/** 날다람쥐 평소 1분 폭(%) — fly.ts FLY_SIGMA 의 1분 몫 */
export const FLY_1M_PCT = 0.55;

export const TELL_TEXT: Record<1 | -1, string> = { 1: '날다람쥐들이 꼭대기로 몰려간다', [-1]: '날다람쥐들이 땅으로 내려온다' } as Record<1 | -1, string>;
export const TELL_SHORT: Record<1 | -1, string> = { 1: '꼭대기로 몰려간다', [-1]: '땅으로 내려온다' } as Record<1 | -1, string>;
/** 오래 센 성적(시험 u52 가 같은 함수로 3,000시간을 세어 본 값: 큰 바람이 온 소문 46%, 그중 말한 쪽 65%) */
export const TELL_ODDS_TEXT = '숲 소문은 둘에 하나쯤 맞고, 맞아도 셋에 하나는 반대쪽';

export interface WindNow {
  gust: { mul: number; word: GustWord; leftSec: number; pct1m: number };
  /** 돌고 있는 소문(창 안), 또는 방금 끝난 소문의 결과 */
  tell: null | { x: FlyTell; state: 'live'; left: number } | { x: FlyTell; state: 'came'; jump: FlyJump; ago: number } | { x: FlyTell; state: 'miss'; ago: number };
  rec: { n: number; hit: number; dirHit: number };
}
/** 결과를 보여 주는 시간(초) */
const SHOW_AFTER = 30;
let recMemo: { min: number; rec: WindNow['rec'] } | null = null;
export function windNow(now: number): WindNow {
  const g = flyGust(now);
  const xs = flyTellsBetween(now - TELL_WINDOW - SHOW_AFTER, now);
  let tell: WindNow['tell'] = null;
  for (const x of xs) {
    const o = flyTellOutcome(x, now);
    if (o === undefined) tell = { x, state: 'live', left: x.at + TELL_WINDOW - now };
    else if (o && now - o.at <= SHOW_AFTER) tell = { x, state: 'came', jump: o, ago: now - o.at };
    else if (o === null && now - (x.at + TELL_WINDOW) <= SHOW_AFTER) tell = { x, state: 'miss', ago: now - (x.at + TELL_WINDOW) };
  }
  const min = Math.floor(now / 60);
  if (!recMemo || recMemo.min !== min) recMemo = { min, rec: flyTellRecord(now) };
  return { gust: { mul: g.mul, word: gustWord(g.mul), leftSec: g.endsAt - now, pct1m: FLY_1M_PCT * g.mul }, tell, rec: recMemo.rec };
}

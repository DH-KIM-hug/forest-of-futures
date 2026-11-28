// 날다람쥐코인의 바람 세기와 끝난 차트 모양(U-57). 셈은 전부 시세 함수와 같은 씨앗(engine/feed/fly.ts) — 꾸민 말이 없다.
// 모양은 끝난 뒤에만 이름을 붙인다(「쌍바닥 완성」, 「박스권 가짜 돌파」). 생기는 중에는 아무 말도 하지 않는다(앞일을 알려 주지 않는다).
import { flyPrice, flyGust, flyEpisodesBetween, type FlyEpisode } from '../../engine/feed/fly';
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
/** 날다람쥐 평소 1분 폭(%) — 시세 함수를 오래 센 1분 봉 높낮이 폭의 가운데 값(시험 fly.test 가 같은 셈) */
export const FLY_1M_PCT = 0.75;
export interface WindNow {
  gust: { mul: number; word: GustWord; leftSec: number; pct1m: number };
  /** 방금(SHOW_AFTER 초 안에) 끝난 모양 */
  done: null | { e: FlyEpisode; ago: number };
  /** 지난 하루 끝난 모양 수와 교과서대로 끝난 수 */
  rec: { n: number; ok: number };
}
/** 끝난 모양의 이름을 바람 줄에 남기는 시간(초) */
export const SHOW_AFTER = 240;
let recMemo: { min: number; rec: WindNow['rec'] } | null = null;
/** 지금까지 끝난 모양들(끝난 때가 from 과 now 사이). 생기는 중인 모양은 넣지 않는다 */
export function donePatterns(fromSec: number, now: number): FlyEpisode[] {
  return flyEpisodesBetween(fromSec, now).filter((e) => e.t1 <= now && e.t1 >= fromSec);
}
export function windNow(now: number): WindNow {
  const g = flyGust(now);
  const last = donePatterns(now - SHOW_AFTER, now).pop();
  const min = Math.floor(now / 60);
  if (!recMemo || recMemo.min !== min) {
    const ds = donePatterns(now - 86400, now);
    recMemo = { min, rec: { n: ds.length, ok: ds.filter((e) => e.ok).length } };
  }
  return { gust: { mul: g.mul, word: gustWord(g.mul), leftSec: g.endsAt - now, pct1m: FLY_1M_PCT * g.mul }, done: last ? { e: last, ago: now - last.t1 } : null, rec: recMemo.rec };
}

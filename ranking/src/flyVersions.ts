// 날다람쥐코인(FLY) 봉의 판(U-57): 시세 함수가 2판(교과서 차트 모양)으로 바뀌었다. 바꾼 시각 앞의 분은 1판으로 다시 센다(지난 기록이 그 값으로 셈해졌다).
// 바꾼 뒤 사흘은 옛 앱(캐시된 1판)이 낸 거래도 있을 수 있어, 두 판의 높낮이를 합친 봉(더 넓은 쪽)으로 대조한다. 그 뒤는 2판만.
import { flyCandles, FLY_V2_FROM } from '../../src/engine/feed/fly';
import { flyCandlesV1 } from '../../src/engine/feed/flyV1';
import type { Candle } from './verify';

/** 바꾼 뒤 두 판을 함께 받아 주는 시간(초) */
export const FLY_GRACE_SEC = 3 * 86400;

/** fromSec ~ toSec 의 1분 봉(높낮이만). 분마다 그 분의 판으로 */
export function flyCandlesVerified(fromSec: number, toSec: number): Candle[] {
  const m0 = Math.floor(fromSec / 60), m1 = Math.floor(toSec / 60);
  const cut = Math.floor(FLY_V2_FROM / 60), graceEnd = Math.floor((FLY_V2_FROM + FLY_GRACE_SEC) / 60);
  const out: Candle[] = [];
  const pick = (a: number, b: number, f: (x: number, y: number) => { t: number; h: number; l: number }[]) => (a <= b ? f(a * 60, b * 60) : []);
  // 1판만
  for (const c of pick(m0, Math.min(m1, cut - 1), flyCandlesV1)) out.push({ t: c.t, h: c.h, l: c.l });
  // 두 판을 합친 봉
  const g0 = Math.max(m0, cut), g1 = Math.min(m1, graceEnd - 1);
  if (g0 <= g1) {
    const a = flyCandlesV1(g0 * 60, g1 * 60), b = flyCandles(g0 * 60, g1 * 60);
    for (let i = 0; i < a.length; i++) out.push({ t: a[i].t, h: Math.max(a[i].h, b[i].h), l: Math.min(a[i].l, b[i].l) });
  }
  // 2판만
  for (const c of pick(Math.max(m0, graceEnd), m1, flyCandles)) out.push({ t: c.t, h: c.h, l: c.l });
  return out;
}

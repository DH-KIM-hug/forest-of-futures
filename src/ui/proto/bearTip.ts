// 곰 형의 "확실한 정보": 화면에서만 만드는 말. 엔진 규칙·시세에는 아무 영향이 없다.
// 최근 추세를 따라 말할 때가 65%, 거꾸로 말할 때가 35% (씨앗 난수: 같은 정산 번호면 같은 말).
import { COINS } from '../../engine/data';
import { historyOf } from '../priceHistory';
import type { GameState } from '../../engine/types';
import type { Tip } from './protoStore';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function makeTip(g: GameState): Tip {
  const no = g.run.settleNo;
  const r = rng(no * 7919 + g.family.generation * 104729 + 17);
  const coin = COINS[Math.floor(r() * COINS.length)];
  const h = historyOf(coin).slice(-90);
  const trend: 1 | -1 = h.length >= 2 && h[h.length - 1] < h[0] ? -1 : 1;
  const dir = (r() < 0.65 ? trend : -trend) as 1 | -1;
  return { coin, dir, price: g.run.prices[coin], no };
}

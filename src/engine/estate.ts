// 상속 개시 때의 재산 계산(경매·잉여금). GDD_v2 3.14 (2). 순수 계산만.
import { balance, housePrice, housingRules, tierDefs } from './data';
import { floorS } from './rng';
import { closeBack } from './futures';
import { ownedCoins, totalDebt, walletValue } from './selectors';
import { wheelByCoin } from './data';
import type { CoinId, RunState } from './types';

/** 열린 포지션을 시가로 정리하면 돌려받는 돈(수수료 포함). */
export const positionsCash = (run: RunState): number =>
  Object.values(run.positions).reduce((a, p) => a + closeBack(p, run.prices[p.market] ?? p.entry), 0);

/** 경매로 현금이 되는 값: 현금 + 포지션 + 지갑 90% + 설비·쳇바퀴 50% + 집 70%. 지킬 것(keep)은 뺀다. */
export function auctionPot(run: RunState, keep: { uids?: string[]; wheels?: CoinId[]; house?: boolean } = {}): number {
  let v = run.cash + positionsCash(run);
  v += floorS(walletValue(run) * balance.mining.walletSeizeRate);
  for (const u of run.equipment) if (!keep.uids?.includes(u.uid)) v += floorS(u.cost * balance.assets.auctionRate);
  for (const c of ownedCoins(run)) if (!keep.wheels?.includes(c)) v += floorS(wheelByCoin[c].cost * balance.assets.auctionRate);
  if (!keep.house) v += floorS(housePrice[run.house] * housingRules.auctionRate);
  return v;
}

/** 경매로 부모 빚(친구 빚 포함)을 갚고 남은 돈(음수면 모자람). 엔딩 조건 `estateNet`. */
export const estateSurplus = (run: RunState): number => auctionPot(run) - totalDebt(run);

/** 가장 낮은 단계 설비 한 대(한정승인이 지킨다). */
export function lowestEquip(run: RunState) {
  const rank = (t: string) => tierDefs.findIndex((x) => x.id === t);
  return [...run.equipment].sort((a, b) => rank(a.tier) - rank(b.tier) || a.cost - b.cost)[0] ?? null;
}

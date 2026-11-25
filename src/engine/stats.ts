// 이번 세대 통계(엔딩 조건·표시용). 값이 없는 키는 0 으로 읽는다. 전체 4.10 키는 M3.
import type { RunState } from './types';

export function initialRunStats(): Record<string, any> {
  return {
    laborTaps: 0, assetsEver: 0, assetsSeized: 0, seized: [] as string[], tagBy: [] as string[],
    garnished: 0, forcedSold: 0, upfrontPaid: 0, capitalizedInterest: 0, odTotal: 0, odInstitution: 0, 'od.shark2': 0,
    'borrow.shark2': 0, stamps: 0, 'stamps.shark2': 0, bankRefusals: 0, rollovers: 0, soldForTax: 0, upgradesBought: 0,
    friendsBroken: 0, broken: [] as string[], friendOd: 0, friendStamps: 0, friendsBorrowed: 0, friendBorrows: 0, claimsSold: 0,
    contacts: false, offerTaken: [] as string[], event: null, lastLender: null, shortfall: 0,
    garnishBySettle: [] as number[], lastSeizeSettleNo: -99, interestOnlyStreak: 0,
  };
}

export const stat = (run: RunState, k: string): number => (run.stats[k] as number | undefined) ?? 0;
export function bump(run: RunState, k: string, n = 1): void {
  run.stats[k] = ((run.stats[k] as number | undefined) ?? 0) + n;
}
export function addToSet(run: RunState, k: string, v: string): void {
  const a = (run.stats[k] ??= []) as string[];
  if (!a.includes(v)) a.push(v);
}

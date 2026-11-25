// 진행 단계·해금 조건(GDD_v2 2.4). 선물 계좌·배율 상한은 M2.
import { balance, coinWheelDefs, wheelByCoin } from './data';
import { floorS } from './rng';
import { treeLevel } from './legacy';
import { treeById } from './data';
import { ownedCoins, stage } from './selectors';
import { buyWheel } from './equipment';
import type { CoinId, GameState, Res } from './types';

/** 선행 학습(`prep`): 누적 채굴 조건을 단계당 20% 줄이고 최고 단계에서는 0. */
export function unlockFactor(g: GameState): number {
  const lv = treeLevel(g.family, 'prep');
  const t = treeById.prep;
  if (lv >= t.maxLevel) return 0;
  return 1 + (t.effect.addPct / 100) * lv;
}
export const minedValueNeeded = (g: GameState, base: number): number => Math.ceil(base * unlockFactor(g) - 1e-6);
export const futuresMinedValueNeeded = (g: GameState): number => minedValueNeeded(g, balance.progression.futures.minedValueRequired);

export interface WheelStatus {
  coin: CoinId;
  owned: boolean;
  visible: boolean; // 팻말이 섰거나 이미 1단계 이상
  unlocked: boolean;
  canBuy: boolean;
  reason: string | null; // 잠긴 이유 / 못 사는 이유
  progress: { current: number; need: number } | null; // 조건과 현재 값
}

export function wheelStatus(g: GameState, coin: CoinId): WheelStatus {
  const run = g.run;
  const def = wheelByCoin[coin];
  const owned = !!run.coinWheels[coin];
  const u = def.unlock;
  let unlocked = true;
  let reason: string | null = null;
  let progress: WheelStatus['progress'] = null;
  if (u.acornTaps !== undefined) {
    progress = { current: run.acornTaps, need: u.acornTaps };
    // 세대 중 한 번 팻말이 선 뒤에는(쳇바퀴를 가졌던 적이 있으면) 줍기 수를 다시 요구하지 않는다.
    unlocked = run.acornTaps >= u.acornTaps || run.stats.signSeen === true;
    if (!unlocked) reason = `줍기 ${u.acornTaps}회가 필요합니다`;
  } else if (u.minedValue !== undefined) {
    const need = minedValueNeeded(g, u.minedValue);
    progress = { current: floorS(run.minedValue), need };
    unlocked = run.minedValue >= need;
    if (!unlocked) reason = `누적 채굴 ${need.toLocaleString('ko-KR')}어치가 필요합니다`;
  } else if (u.house !== undefined) {
    progress = { current: run.house, need: u.house };
    unlocked = run.house >= u.house;
    if (!unlocked) reason = '주소지가 필요합니다(오두막 이상)';
  }
  const visible = owned || stage(run) >= 1 || (u.acornTaps !== undefined && unlocked);
  let canBuy = !owned && unlocked;
  if (canBuy && run.cash < def.cost) {
    canBuy = false;
    reason = '현금 부족';
  }
  if (owned) reason = null;
  return { coin, owned, visible, unlocked, canBuy, reason, progress };
}

export function purchaseWheel(g: GameState, coin: CoinId): Res {
  return buyWheel(g, coin, wheelStatus(g, coin));
}

export const wheelOffers = (g: GameState): WheelStatus[] => coinWheelDefs.map((w) => wheelStatus(g, w.coin as CoinId)).filter((s) => s.visible);
export { ownedCoins };

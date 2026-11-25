// 세대 안 업그레이드(GDD_v2 3.4a). 비용 = ceil(기준 × r^단계). 줄 안은 더하고 줄 사이는 곱한다.
import { coinWheelDefs, tierById, trackById, upgradeTracks, wheelByCoin } from './data';
import { ceilS } from './rng';
import { logEvent } from './util';
import { bump } from './stats';
import type { GameState, Res, RunState } from './types';

export const bodyLevel = (run: RunState, id: string) => run.upgrades.body[id] ?? 0;
export const runLevel = (run: RunState, id: string) => run.upgrades.run[id] ?? 0;
export const wheelLevel = (run: RunState, coin: string, id: string) => run.upgrades.coinWheel[coin]?.[id] ?? 0;
export const tierLevel = (run: RunState, tier: string) => run.upgrades.tier[tier] ?? 0;

export function upgradeLevel(run: RunState, trackId: string, target?: string): number {
  const t = trackById[trackId];
  if (t.scope === 'body') return bodyLevel(run, trackId);
  if (t.scope === 'run') return runLevel(run, trackId);
  if (t.scope === 'coinWheel') return wheelLevel(run, target!, trackId);
  return tierLevel(run, target!);
}

/** 다음 단계 값. 최고 단계면 null. */
export function upgradeCost(run: RunState, trackId: string, target?: string): number | null {
  const t = trackById[trackId];
  const n = upgradeLevel(run, trackId, target);
  if (n >= t.maxLevel) return null;
  let base = t.baseCost ?? 0;
  if (t.baseCostOfWheel) base = t.baseCostOfWheel * wheelByCoin[target!].cost;
  if (t.baseCostOfTier) base = t.baseCostOfTier * tierById[target!].cost;
  return ceilS(base * Math.pow(t.r, n));
}

/** 살 수 있는 상태인가(대상이 있고 최고 단계가 아님). 돈은 따로 본다. */
export function upgradeTargetOk(run: RunState, trackId: string, target?: string): boolean {
  const t = trackById[trackId];
  if (t.scope === 'coinWheel') return !!target && !!run.coinWheels[target];
  if (t.scope === 'tier') return !!target && !!tierById[target] && target !== 'wheel2' && run.equipment.some((u) => u.tier === target);
  return true;
}

export function buyUpgrade(g: GameState, trackId: string, target?: string): Res {
  const run = g.run;
  const t = trackById[trackId];
  if (!t) return { ok: false, code: 'unknown' };
  if (!upgradeTargetOk(run, trackId, target)) return { ok: false, code: 'target', msg: '붙일 곳이 없습니다.' };
  if (t.scope === 'tier' && !(target! in (t.names as object))) return { ok: false, code: 'target', msg: '이 설비는 정비 줄이 없습니다.' };
  const cost = upgradeCost(run, trackId, target);
  if (cost === null) return { ok: false, code: 'max', msg: '최고 단계입니다.' };
  if (run.cash < cost) return { ok: false, code: 'cash', msg: '현금 부족' };
  run.cash -= cost;
  if (t.scope === 'body') run.upgrades.body[trackId] = bodyLevel(run, trackId) + 1;
  else if (t.scope === 'run') run.upgrades.run[trackId] = runLevel(run, trackId) + 1;
  else if (t.scope === 'coinWheel') (run.upgrades.coinWheel[target!] ??= {})[trackId] = wheelLevel(run, target!, trackId) + 1;
  else run.upgrades.tier[target!] = tierLevel(run, target!) + 1;
  bump(run, 'upgradesBought', 1);
  logEvent(run, 'upgrade', `${trackId}${target ? ':' + target : ''} -> ${upgradeLevel(run, trackId, target)}단계`, cost);
  return { ok: true, amount: cost };
}

/** 지금 현금으로 살 수 있는 업그레이드가 있는가(초록 점, AC-v2-53). */
export function affordableUpgrades(run: RunState): { track: string; target?: string; cost: number }[] {
  const out: { track: string; target?: string; cost: number }[] = [];
  for (const t of upgradeTracks) {
    const targets: (string | undefined)[] =
      t.scope === 'coinWheel' ? coinWheelDefs.map((w) => w.coin).filter((c) => run.coinWheels[c])
      : t.scope === 'tier' ? Object.keys(t.names as object).filter((id) => upgradeTargetOk(run, 'tier', id))
      : [undefined];
    for (const target of targets) {
      const cost = upgradeCost(run, t.id, target);
      if (cost !== null && cost <= run.cash) out.push({ track: t.id, target, cost });
    }
  }
  return out;
}

/** 쳇바퀴가 실려 가거나 팔릴 때 그 종목 업그레이드는 사라진다. */
export function resetWheelUpgrades(run: RunState, coin: string): void {
  delete run.upgrades.coinWheel[coin];
}
/** 어떤 설비 단계가 0대가 되면 그 단계 업그레이드가 사라진다. */
export function resetTierIfEmpty(run: RunState, tier: string): void {
  if (!run.equipment.some((u) => u.tier === tier)) delete run.upgrades.tier[tier];
}

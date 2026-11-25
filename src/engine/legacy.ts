// 가문 특성 트리(가훈으로 사는 영구 업그레이드)·기질의 효과 읽기. 한 계산·이월·세 갈래는 M4(generation.ts).
import { treeById, traitById, traitsMeta } from './data';
import { ceilS } from './rng';
import type { FamilyState, GameState } from './types';

export const treeLevel = (f: FamilyState, id: string): number => f.tree[id] ?? 0;

/** 트리 한 단계 값(가훈) = ceil(기준 × r^단계). */
export function treeCost(id: string, level: number): number {
  const t = treeById[id];
  return ceilS(t.baseCost * Math.pow(t.r, level));
}

const MUL_STATS = new Set(['tapMul', 'equipYieldMul', 'houseLimitMul', 'livingMul', 'rateHikeMul']);

/** 기질이 주는 값. 없으면 null. 같은 키를 여러 기질이 주면 곱한다(배수 키) / 앞의 것(그 밖). */
export function traitVal(g: GameState, stat: string): number | null {
  let out: number | null = null;
  for (const id of g.family.traits) {
    const t = traitById[id];
    if (!t) continue;
    for (const e of [t.good, t.bad]) {
      if (e.stat !== stat) continue;
      let v = e.value;
      if (g.family.deepBlood && MUL_STATS.has(stat)) v = 1 + (v - 1) * traitsMeta.deepBloodMul;
      out = out === null ? v : MUL_STATS.has(stat) ? out * v : out;
    }
  }
  return out;
}
export const traitMul = (g: GameState, stat: string): number => traitVal(g, stat) ?? 1;
export const hasTrait = (g: GameState, id: string): boolean => g.family.traits.includes(id);

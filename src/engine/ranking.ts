import { balance } from './data';
import type { GameState } from './types';
import { netWorth } from './selectors';

export interface BoardRow {
  name: string;
  netWorth: number;
  me: boolean;
}

/** 내 순자산이 주민 9명 사이 몇 위인지(1이 가장 부자). */
export function rankOf(net: number): number {
  const npcs: { netWorth: number }[] = balance.ranking.npcs;
  return 1 + npcs.filter((n) => n.netWorth > net).length;
}

export function board(g: GameState): BoardRow[] {
  const me = netWorth(g.run);
  const rows: BoardRow[] = (balance.ranking.npcs as { name: string; netWorth: number }[]).map((n) => ({ name: n.name, netWorth: n.netWorth, me: false }));
  rows.push({ name: g.settings.name, netWorth: me, me: true });
  rows.sort((a, b) => b.netWorth - a.netWorth);
  return rows;
}

export function bestRecord(g: GameState): number {
  const best = g.records.length ? Math.max(...g.records.map((r) => r.peakNetWorth)) : null;
  return Math.max(best ?? -Infinity, g.run.peakNetWorth);
}

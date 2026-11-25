import { balance, endings, endingById } from './data';
import type { Cond, EndingDef } from './data';
import type { Snapshot } from './types';

export function evalCond(snap: Snapshot, [stat, op, value]: Cond): boolean {
  const v = snap[stat];
  if (v === null || v === undefined) return false;
  switch (op) {
    case '==': return v === value;
    case '!=': return v !== value;
    case '>=': return v >= value;
    case '<=': return v <= value;
    case '>': return v > value;
    case '<': return v < value;
    case 'has': return Array.isArray(v) && v.includes(value);
    case 'in': return Array.isArray(value) && value.includes(v);
    default: return false;
  }
}

export function causeMatches(e: EndingDef, cause: string): boolean {
  return e.trigger.causes === null || e.trigger.causes.includes(cause);
}

export function matches(e: EndingDef, snap: Snapshot): boolean {
  return causeMatches(e, snap.cause) && e.trigger.all.every((c) => evalCond(snap, c));
}

export interface Pick {
  id: string;
  isNew: boolean;
  via: 'normal' | 'pity' | 'repeat' | 'fallback';
}

const byPriority = (a: EndingDef, b: EndingDef) => b.priority - a.priority || a.no - b.no;

/**
 * 엔딩 선택(GDD 11.2).
 * dryStreak: 이번 파산 전까지 새 엔딩 없이 이어진 파산 수.
 */
export function pickEnding(snap: Snapshot, collected: Set<string>, dryStreak: number): Pick {
  const cands = endings.filter((e) => matches(e, snap));
  const fresh = balance.endings.preferUncollected ? cands.filter((e) => !collected.has(e.id)).sort(byPriority) : [];
  if (fresh.length) return { id: fresh[0].id, isNew: true, via: 'normal' };
  const pity = balance.endings.pity;
  if (pity.enabled && dryStreak + 1 >= pity.dryStreak) {
    const p = endings
      .filter((e) => e.trigger.type === 'proxy' && causeMatches(e, snap.cause) && !collected.has(e.id))
      .sort((a, b) => a.no - b.no);
    if (p.length) return { id: p[0].id, isNew: true, via: 'pity' };
  }
  const again = cands.slice().sort(byPriority);
  if (again.length) return { id: again[0].id, isNew: !collected.has(again[0].id), via: 'repeat' };
  const fb = endingById[balance.endings.fallbackId];
  return { id: fb.id, isNew: !collected.has(fb.id), via: 'fallback' };
}

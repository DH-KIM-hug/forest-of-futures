import { describe, it, expect } from 'vitest';
import { endings } from '../../src/engine/data';
import { buildSnapshot } from '../../src/engine/snapshot';
import { candidatesFor, evalAll } from '../../src/engine/endings';
import { createGame } from '../../src/engine/game';

type Snap = Record<string, any>;
const NUM = (x: unknown): x is number => typeof x === 'number';

/** 한 엔딩의 조건을 전부 참으로 만드는 스냅샷을 만든다(키마다 하한·상한·같음·집합을 모아 푼다). */
function synth(base: Snap, conds: [string, string, any][]): Snap {
  const s = { ...base };
  const lo: Record<string, number> = {};
  const hi: Record<string, number> = {};
  const exprs: [string, string, string][] = [];
  for (const [k, op, v] of conds) {
    if (v && typeof v === 'object' && 'expr' in v) { exprs.push([k, op, v.expr]); continue; }
    if (op === '=') s[k] = v;
    else if (op === '>=') lo[k] = Math.max(lo[k] ?? -Infinity, v);
    else if (op === '>') lo[k] = Math.max(lo[k] ?? -Infinity, v + 1);
    else if (op === '<=') hi[k] = Math.min(hi[k] ?? Infinity, v);
    else if (op === '<') hi[k] = Math.min(hi[k] ?? Infinity, v - 1);
    else if (op === 'has') s[k] = [...new Set([...(Array.isArray(s[k]) ? s[k] : []), v])];
    else if (op === 'in') {
      if (Array.isArray(v) && v[0] === 'grudge') { s[k] = 'shark1'; s.grudge = ['shark1']; } else s[k] = Array.isArray(v) ? v[0] : v.min;
    }
    else if (op === '!=') s[k] = typeof v === 'number' ? v + 1 : `${v}x`;
  }
  for (const k of new Set([...Object.keys(lo), ...Object.keys(hi)])) {
    const l = lo[k] ?? -Infinity, h = hi[k] ?? Infinity;
    s[k] = Number.isFinite(l) ? l : h;
    if (l > h) throw new Error(`모순: ${k}`);
  }
  for (const [k, , expr] of exprs) for (const tok of expr.match(/[A-Za-z_][\w.]*/g) ?? []) {
    const key = tok === 'tp' ? '_tpRoe' : tok;
    if (!NUM(s[key])) s[key] = 1000;
  }
  for (const [k, op, expr] of exprs) {
    let r = 1;
    for (const part of expr.split('*')) { const t = part.trim(); r *= /^-?[\d.]+$/.test(t) ? Number(t) : (s[t === 'tp' ? '_tpRoe' : t] as number); }
    s[k] = op === '>=' || op === '=' || op === '<=' ? r : op === '>' ? r + 1 : r - 1;
  }
  return s;
}

describe('M3 엔딩 200개: 조건을 만족하는 상태를 만들면 후보에 든다', () => {
  const g = createGame({ seed: 1 });
  for (const e of endings) {
    it(`${e.id} ${e.title}`, () => {
      for (const cause of e.causes) {
        const base = buildSnapshot(g, { cause, lastLender: null, shortfall: 0 });
        const snap = synth(base, e.conditions);
        expect(evalAll(e, snap), `조건 ${JSON.stringify(e.conditions)}`).toBe(true);
        expect(candidatesFor(snap, cause).map((x) => x.id)).toContain(e.id);
      }
    });
  }
  it('기본 상태(아무 조건도 안 채운)에서는 조건 있는 엔딩 대부분이 후보가 아니다', () => {
    const base = buildSnapshot(g, { cause: 'LIQ', lastLender: null, shortfall: 0 });
    const c = candidatesFor(base, 'LIQ').filter((e) => e.conditions.length > 0);
    expect(c.length).toBeLessThan(10);
  });
});

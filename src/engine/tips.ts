// 정보 — 미래를 모르는 입들(GDD_v2 3.11). 모든 규칙은 지나간 시세만 읽는다.
import { marketById, marketDefs, tipsData } from './data';
import { nextRandom } from './rng';
import { roePct } from './futures';
import { tipKey } from './futures';
import { logEvent, notify } from './util';
import { bump } from './stats';
import type { GameState, MarketAvg, SettleBar, TipRecord } from './types';

interface Source {
  id: string; name: string; kind: 'fact' | 'pitch' | 'advice'; rule: string; params: Record<string, number>; counted: boolean;
  lines: { up: string[]; down: string[] }; bundle?: string;
}
const SOURCES = tipsData.sources as Source[];
const ALL = marketDefs.map((m) => m.id);

const moveOf = (b: SettleBar) => (b.c - b.o) / b.o;
const rangeOf = (b: SettleBar) => (b.h - b.l) / b.o;

function dirFor(src: Source, run: GameState['run'], market: string): { dir: 0 | 1 | -1; vol?: number } | null {
  const bars = run.mkt.bars[market] ?? [];
  if (!bars.length) return null;
  const b = bars[bars.length - 1];
  const prev = bars.slice(0, -1).slice(-5);
  const avg: MarketAvg = run.mkt.avg[market];
  const P = src.params;
  const n5 = bars.slice(-(P.settles ?? 5));
  const move5 = n5.length ? (n5[n5.length - 1].c - n5[0].o) / n5[0].o : 0;
  const avg15 = avg.range180 * Math.sqrt(P.settles ?? 5);
  switch (src.rule) {
    case 'breakout': {
      if (prev.length < 1 || b.vol < P.volMul) return null;
      const hi = Math.max(...prev.map((x) => x.h));
      const lo = Math.min(...prev.map((x) => x.l));
      if (b.c > hi) return { dir: 1, vol: b.vol };
      if (b.c < lo) return { dir: -1, vol: b.vol };
      return null;
    }
    case 'flow': {
      if (b.vol < P.volMul) return null;
      if (b.buy >= P.buyShareHigh) return { dir: 1, vol: b.vol };
      if (b.buy <= P.buyShareLow) return { dir: -1, vol: b.vol };
      return null;
    }
    case 'vol': return rangeOf(b) >= P.rangeMul * avg.range180 ? { dir: 0 } : null;
    case 'mom1': return Math.abs(moveOf(b)) > P.rangeMul * avg.range180 ? { dir: moveOf(b) > 0 ? 1 : -1 } : null;
    case 'mom5': return n5.length >= (P.settles ?? 5) && Math.abs(move5) > P.rangeMul * avg15 ? { dir: move5 > 0 ? 1 : -1 } : null;
    case 'chaseLong': return n5.length >= (P.settles ?? 5) && move5 >= (P.riseMul ?? 1) * avg15 ? { dir: 1 } : null;
    case 'dipBuy': return n5.length >= (P.settles ?? 5) && move5 <= -(P.dropMul ?? 1.5) * avg15 ? { dir: 1 } : null;
    case 'flowFade': {
      if (b.vol < 3) return null;
      if (b.buy >= 0.75) return { dir: -1 };
      if (b.buy <= 0.25) return { dir: 1 };
      return null;
    }
    default: return null;
  }
}

function speak(g: GameState, src: Source, market: string, dir: 0 | 1 | -1, vol?: number): void {
  const run = g.run;
  const base = run.prices[market];
  const rec: TipRecord = {
    id: `${src.id}:${run.tick}`, source: src.id, market, dir, tick: run.tick, settleNo: run.settleNo, base,
    counted: src.counted && dir !== 0, fact: src.kind === 'fact', result: null,
  };
  run.recentTips.push(rec);
  if (run.recentTips.length > 40) run.recentTips.shift();
  run.tipCooldown[src.id] = run.settleNo;
  const lines = dir >= 0 ? src.lines.up : src.lines.down;
  const text = (lines[0] ?? '').replace('{market}', marketById[market].name).replace('{vol}', vol ? (Math.round(vol * 10) / 10).toString() : '');
  notify(run, src.kind === 'fact' ? text : `${src.name}: ${text}`, src.kind === 'fact' ? 'wire' : 'bubble', `tip:${src.id}:${run.tick}`);
  logEvent(run, `tip:${src.id}`, text);
  if (dir !== 0) bump(run, 'tipsSeen', 1);
  if (rec.counted) {
    const b = (g.family.tipBook[src.id] ??= { said: 0, hit: 0 });
    b.said += 1;
  }
  // 열려 있는 그 종목 포지션 뒤에 같은 종목 속보가 뜨면 기록(newsAfterEntry)
  if (src.kind === 'fact' && dir !== 0) {
    const p = run.positions[market];
    if (p) p.newsAfterEntry = dir > 0 ? 'up' : 'down';
  }
}

/** 정산이 끝난 뒤(봉을 닫은 뒤) 호출. 출처마다 정산 5회에 한 번까지만 말한다. */
export function runTips(g: GameState): void {
  const run = g.run;
  for (const src of SOURCES) {
    const last = run.tipCooldown[src.id];
    if (last !== undefined && run.settleNo - last < tipsData.sourceCooldownSettlements) continue;
    if (src.rule === 'roeBelow') {
      const p = Object.values(run.positions).find((q) => roePct(q, run.prices[q.market]) <= src.params.roe);
      if (p) speak(g, src, p.market, 0);
      continue;
    }
    if (src.rule === 'random') {
      if (nextRandom(run) < src.params.prob) {
        const m = ALL[Math.floor(nextRandom(run) * ALL.length)];
        speak(g, src, m, nextRandom(run) < 0.5 ? 1 : -1);
      }
      continue;
    }
    for (const m of ALL) {
      const r = dirFor(src, run, m);
      if (r) {
        speak(g, src, m, r.dir, r.vol);
        break;
      }
    }
  }
}

/** 틱마다: 말한 뒤 5분 안에 그 방향으로 평소 5분 변동 폭만큼 먼저 가면 적중, 반대로 먼저 가면(또는 못 가면) 불발. */
export function resolveTips(g: GameState): void {
  const run = g.run;
  for (const t of run.recentTips) {
    if (t.result || !t.counted) continue;
    const price = run.prices[t.market];
    const move = price / t.base - 1;
    const thr = run.mkt.avg[t.market].range300s;
    const el = run.tick - t.tick;
    let res: 'hit' | 'miss' | null = null;
    if (t.dir * move >= thr) res = 'hit';
    else if (t.dir * move <= -thr || el >= tipsData.hitWindowSec) res = 'miss';
    if (res) {
      t.result = res;
      if (res === 'hit') (g.family.tipBook[t.source] ??= { said: 0, hit: 0 }).hit += 1;
    }
  }
}
export { tipKey };

/** 출처의 가문 적중률(맞은 수 / 말한 수). 말한 적이 없으면 null. 기질 '의심병'이 말풍선 옆에 보여 준다. */
export function tipHitRate(g: GameState, source: string): number | null {
  const b = g.family.tipBook[source];
  return b && b.said > 0 ? b.hit / b.said : null;
}
/** 기질 '의심병'이면 속보가 늦게 뜨는 초. */
export const wireDelaySec = (g: GameState): number => traitVal(g, 'wireDelaySec') ?? 0;
import { traitVal } from './legacy';

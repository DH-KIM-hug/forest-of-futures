// 1분 봉(조회 API) → 가상 가격 봉. 실제 가격은 여기서 가상 가격이 되어 나간다(배율은 LiveCore.scale).
import { computeAvg } from '../../../server/src/shared';
import type { BarRecord } from '../../../server/src/shared';
import type { Bar } from '../../engine/feed/types';
import type { MarketStatus } from '../../engine/types';
import { COINS, INDEX_ID, INDEX_MEMBERS, INFO_URL } from './config';
import type { PostJson } from './io';

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }
export type CandleSet = Record<string, Candle[]>; // 내부 키(DTC.. IDX_XRP) → 시간순 1분 봉

const parse = (rows: any): Candle[] =>
  (Array.isArray(rows) ? rows : [])
    .map((r) => ({ t: Number(r.t), o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c), v: Number(r.v) }))
    .filter((c) => c.t > 0 && c.o > 0 && c.h > 0 && c.l > 0 && c.c > 0)
    .sort((a, b) => a.t - b.t);

/** 모든 키의 1분 봉을 한꺼번에. 하나라도 실패하면 던진다. */
export async function fetchCandles(post: PostJson, startMs: number, endMs: number): Promise<CandleSet> {
  const keys = Object.keys(COINS);
  const rows = await Promise.all(
    keys.map((k) => post(INFO_URL, { type: 'candleSnapshot', req: { coin: COINS[k], interval: '1m', startTime: Math.floor(startMs), endTime: Math.floor(endMs) } })),
  );
  const out: CandleSet = {};
  keys.forEach((k, i) => { out[k] = parse(rows[i]); });
  return out;
}

/** 키별 초당 평균 체결 금액(거래량 지수의 '평소'). */
export function volMeans(cs: CandleSet): Record<string, number> {
  const m: Record<string, number> = {};
  for (const [k, list] of Object.entries(cs)) {
    if (!list.length) continue;
    m[k] = list.reduce((a, c) => a + (c.v * c.c) / 60, 0) / list.length;
  }
  return m;
}

export type IndexAnchor =
  | { kind: 'forward'; base: number; prev: Record<string, number> } // 공백 앞의 지수 가격과 구성원 mid 에서 이어 간다
  | { kind: 'end'; end: number }; // 마지막 봉의 종가가 end 가 되도록 거꾸로 맞춘다

export interface ToBars {
  tradable: Record<string, string>; // 시장 id → 키 (지수 제외)
  k: Record<string, number>; // 시장 id → 배율
  anchor: IndexAnchor;
  means: Record<string, number>;
}

/** 1분 가상 봉(시간순, 종목마다). 지수는 서버처럼 구성원 수익률 평균을 이어 곱한다. */
export function toBars(cs: CandleSet, o: ToBars): Bar[] {
  const out: Bar[] = [];
  const rel = (key: string, c: Candle) => Math.min(50, o.means[key] > 0 ? (c.v * c.c) / 60 / o.means[key] : 1);
  for (const [id, key] of Object.entries(o.tradable)) {
    const k = o.k[id];
    if (!(k > 0)) continue;
    for (const c of cs[key] ?? []) out.push({ market: id, n0: Math.round(c.t / 1000), o: c.o * k, h: c.h * k, l: c.l * k, c: c.c * k, vol: rel(key, c), buy: 0.5, st: 'open' as MarketStatus });
  }
  // 지수
  const maps = INDEX_MEMBERS.map((key) => new Map((cs[key] ?? []).map((c) => [c.t, c])));
  const times = (cs[INDEX_MEMBERS[0]] ?? []).map((c) => c.t).filter((t) => maps.every((m) => m.has(t)));
  if (times.length) {
    const prev = INDEX_MEMBERS.map((key, i) => (o.anchor.kind === 'forward' ? o.anchor.prev[key] ?? maps[i].get(times[0])!.o : maps[i].get(times[0])!.o));
    let pc = o.anchor.kind === 'forward' ? o.anchor.base : 1;
    const rows: Bar[] = [];
    for (const t of times) {
      const f = (pick: (c: Candle) => number) => INDEX_MEMBERS.reduce((a, _k, i) => a + pick(maps[i].get(t)!) / prev[i], 0) / INDEX_MEMBERS.length;
      const op = pc * f((c) => c.o);
      const cl = pc * f((c) => c.c);
      const hi = Math.max(op, cl, pc * f((c) => c.h));
      const lo = Math.min(op, cl, pc * f((c) => c.l));
      const vs = INDEX_MEMBERS.map((key, i) => rel(key, maps[i].get(t)!));
      rows.push({ market: INDEX_ID, n0: Math.round(t / 1000), o: op, h: hi, l: lo, c: cl, vol: vs.reduce((a, b) => a + b, 0) / vs.length, buy: 0.5, st: 'open' });
      pc = cl;
      INDEX_MEMBERS.forEach((_k, i) => { prev[i] = maps[i].get(t)!.c; });
    }
    if (o.anchor.kind === 'end') {
      const s = o.anchor.end / rows[rows.length - 1].c;
      for (const r of rows) { r.o *= s; r.h *= s; r.l *= s; r.c *= s; }
    }
    out.push(...rows);
  }
  return out.sort((a, b) => a.n0 - b.n0);
}

/** 1분 봉 → 정산 봉(res 초, 경계는 res 의 배수). 꽉 찬 묶음만. */
export function regroup(bars60: Bar[], res: number): Bar[] {
  const per = res / 60;
  const by = new Map<string, Bar[]>();
  for (const b of bars60) {
    const key = `${b.market}|${Math.floor(b.n0 / res) * res}`;
    (by.get(key) ?? by.set(key, []).get(key)!).push(b);
  }
  const out: Bar[] = [];
  for (const [key, g] of by) {
    if (g.length < per) continue;
    g.sort((a, b) => a.n0 - b.n0);
    out.push({
      market: g[0].market, n0: Math.floor(g[0].n0 / res) * res, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[g.length - 1].c,
      vol: g.reduce((a, x) => a + x.vol, 0) / g.length, buy: 0.5, st: 'open',
    });
    void key;
  }
  return out.sort((a, b) => a.n0 - b.n0);
}

/** 서버 hello 의 avg(평소 값). 서버의 computeAvg 를 그대로 쓴다. */
export function avgOf(bars60: Bar[], bars180: Bar[], markets: string[]): Record<string, { vol180: number; range180: number; range300s: number }> {
  const rec = (b: Bar): BarRecord => ({ market: b.market, n0: b.n0, o: b.o, h: b.h, l: b.l, c: b.c, vol: b.vol, buy: b.buy, st: 0 });
  const out: Record<string, { vol180: number; range180: number; range300s: number }> = {};
  for (const m of markets) out[m] = computeAvg(bars180.filter((b) => b.market === m).map(rec), bars60.filter((b) => b.market === m).map(rec));
  return out;
}

/** 한 종목의 1분 봉 → 1초 가격 열(최근 count 개). 봉 안의 움직임은 시가 → 저/고 → 고/저 → 종가의 직선으로 메운다(시각용 복원). */
export function secondsOf(bars: Bar[], count: number): number[] {
  const out: number[] = [];
  const need = Math.ceil(count / 60) + 1;
  for (const b of bars.slice(-need)) {
    const path = b.c >= b.o ? [b.o, b.l, b.h, b.c] : [b.o, b.h, b.l, b.c];
    for (let s = 0; s < 60; s++) {
      const x = (s / 59) * 3;
      const i = Math.min(2, Math.floor(x));
      out.push(path[i] + (path[i + 1] - path[i]) * (x - i));
    }
  }
  return out.slice(-count);
}

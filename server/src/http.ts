// REST (GDD_v2 6.6) 의 경로 처리. 소켓과 분리된 순수 함수라서 테스트하기 쉽다.
import type { TickStore } from './store.ts';
import { computeAvg } from './bars.ts';
import { HELLO_RECENT_1M, groupBars, helloMessage, tickMessage, timeMessage } from './protocol.ts';
import type { Pipeline } from './pipeline.ts';
import type { TickRecord } from './types.ts';

export interface Ctx {
  store: TickStore;
  pipeline: Pipeline;
  markets: string[];
  epoch: number;
  nowMs: () => number;
}
export interface Reply {
  status: number;
  body: unknown;
}

const int = (v: string | null, d: number) => (v !== null && /^-?\d+$/.test(v) ? Number(v) : d);

export function route(method: string, url: URL, ctx: Ctx): Reply {
  const { pathname: path, searchParams: q } = url;
  if (path === '/healthz') {
    const last = ctx.pipeline.last;
    return {
      status: 200,
      body: {
        ok: true,
        n: ctx.pipeline.nOf(ctx.nowMs()),
        st: ctx.pipeline.currentStatus(),
        source: ctx.pipeline.activeSource() === 'primary' ? 'A' : 'B', // 출처 이름은 내보내지 않는다
        lastTickAgeSec: last ? ctx.pipeline.nOf(ctx.nowMs()) - last.n : null,
        ticks: ctx.pipeline.tickCount,
      },
    };
  }
  if (path === '/v1/time') {
    const n = ctx.pipeline.nOf(ctx.nowMs());
    return { status: 200, body: timeMessage(n, n + ctx.epoch, ctx.pipeline.currentStatus(), 1) };
  }
  if (path === '/v1/ticks') {
    const from = int(q.get('from'), NaN);
    let to = int(q.get('to'), NaN);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return { status: 400, body: { error: 'from/to' } };
    to = Math.min(to, from + 599);
    const ticks = ctx.store.ticksBetween(from, to).map((t: TickRecord) => {
      const { t: _t, ...rest } = tickMessage(t, ctx.markets);
      return rest;
    });
    return { status: 200, body: { from, to, ticks } };
  }
  if (path === '/v1/bars') {
    const res = int(q.get('res'), 0);
    const from = int(q.get('from'), NaN);
    const to = int(q.get('to'), NaN);
    if ((res !== 60 && res !== 180) || !Number.isFinite(from) || !Number.isFinite(to) || to < from) return { status: 400, body: { error: 'res/from/to' } };
    const max = Math.min(int(q.get('limit'), 20000), 20000);
    const r = ctx.store.barsBetween(res, from, to, max);
    const body: Record<string, unknown> = { res, from, to, markets: ctx.markets, bars: groupBars(r.bars, ctx.markets) };
    if (r.next !== undefined) body.next = r.next;
    return { status: 200, body };
  }
  if (path.startsWith('/v1/rank')) return { status: 501, body: { error: 'not implemented (M10)' } };
  return { status: 404, body: { error: 'not found' } };
}

/** 접속 직후 한 번 보내는 hello (정산 봉 480칸 + '평소' 값). 계산이 무거워 30초 캐시. */
export class HelloBuilder {
  private cache: { at: number; warm: ReturnType<TickStore['recentBars']>; avg: Record<string, ReturnType<typeof computeAvg>> } | null = null;
  private ctx: Ctx;
  constructor(ctx: Ctx) {
    this.ctx = ctx;
  }
  build() {
    const { store, pipeline, markets, epoch } = this.ctx;
    const now = this.ctx.nowMs();
    if (!this.cache || now - this.cache.at > 30000) {
      const warm = store.recentBars(180, 480);
      const b60 = store.recentBars(60, 1440);
      const avg: Record<string, ReturnType<typeof computeAvg>> = {};
      for (const m of markets) avg[m] = computeAvg(warm.filter((b) => b.market === m), b60.filter((b) => b.market === m));
      this.cache = { at: now, warm, avg };
    }
    const n = pipeline.last?.n ?? pipeline.nOf(now);
    // 최근 1분 봉은 캐시하지 않는다(지금 출렁이는 곳은 최근 몇 분이 생명이다)
    const recent = store.recentBars(60, HELLO_RECENT_1M);
    return helloMessage({ n, ts: n + epoch, epoch: 1, st: pipeline.currentStatus(), markets, warm: this.cache.warm, avg: this.cache.avg, recent });
  }
}

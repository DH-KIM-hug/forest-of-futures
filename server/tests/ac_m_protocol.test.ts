import { describe, expect, it } from 'vitest';
import { EPOCH, RAW, T0, feedMids, makePipe } from './helpers.ts';
import { HelloBuilder, route } from '../src/http.ts';
import { tickMessage } from '../src/protocol.ts';
import { TickStore } from '../src/store.ts';
import type { BarRecord } from '../src/types.ts';

const SEC = 1000;

function seeded(secs: number) {
  const m = makePipe();
  for (let t = 0; t < secs; t++) {
    const now = T0 + t * SEC;
    feedMids(m.pipe, 'primary', now, 1 + Math.sin(t / 50) * 2e-3);
    m.pipe.tick(now);
  }
  const ctx = { store: m.store, pipeline: m.pipe, markets: m.pipe.marketIds, epoch: EPOCH, nowMs: () => T0 + secs * SEC };
  return { ...m, ctx };
}

const FORBIDDEN = [/BTC/i, /ETH(?!ER)/i, /\bSOL\b/i, /DOGE/i, /XRP/i, /hyperliquid/i, /uniswap/i, /https?:\/\//i, /wss?:\/\//i, /arbitrum/i, /IDX_/];

function assertClean(payload: unknown, label: string) {
  const s = JSON.stringify(payload);
  for (const re of FORBIDDEN) expect(s, `${label} ${re}`).not.toMatch(re);
  for (const v of Object.values(RAW)) {
    // 원본 가격(정수부 포함 소수 표기)이 어떤 모양으로도 들어 있지 않다
    expect(s, `${label} raw ${v}`).not.toContain(String(v));
    expect(s, `${label} raw ${v}`).not.toContain(String(Math.floor(v)) + '.');
  }
}

describe('AC-v2-138 앱이 받는 메시지에 원본이 없다', () => {
  it('hello·k·REST 응답의 직렬화에 실제 가격·종목 이름·출처 주소가 없다', () => {
    const s = seeded(1300);
    assertClean(new HelloBuilder(s.ctx).build(), 'hello');
    for (const t of s.ticks.slice(-5)) assertClean(tickMessage(t, s.ctx.markets), 'k');
    const urls = ['/healthz', '/v1/time', `/v1/ticks?from=${s.ticks[0].n}&to=${s.ticks[0].n + 100}`, `/v1/bars?res=60&from=0&to=1000000000`, `/v1/bars?res=180&from=0&to=1000000000`];
    for (const u of urls) {
      const r = route('GET', new URL(u, 'http://x'), s.ctx);
      expect(r.status, u).toBe(200);
      assertClean(r.body, u);
    }
  });
  it('원본 mid 는 raw_ticks 테이블에만 있고(서버 안), 다른 표에는 없다', () => {
    const s = seeded(30);
    const raw = JSON.stringify(s.store.db.prepare('SELECT mids FROM raw_ticks LIMIT 1').get());
    expect(raw).toContain('123456');
    for (const t of ['ticks', 'bars_60', 'bars_180']) {
      expect(JSON.stringify(s.store.db.prepare(`SELECT * FROM ${t}`).all())).not.toContain('123456');
    }
  });
  it('XRP 는 지수에만: 발행 종목은 5개 가상 종목뿐이다', () => {
    const s = seeded(10);
    expect(Object.keys(tickMessage(s.ticks[5], s.ctx.markets).p).sort()).toEqual(['BTH', 'DTC', 'JQQ', 'MDT', 'SMS']);
  });
});

function fakeBars(store: TickStore, res: 60 | 180, slots: number, ids = ['DTC', 'BTH', 'SMS', 'MDT', 'JQQ']) {
  for (let i = 0; i < slots; i++) {
    for (const m of ids) {
      const b: BarRecord = { market: m, n0: i * res, o: 100, h: 101, l: 99, c: 100.5, vol: 1, buy: 0.5, st: i >= 100 && i < 110 ? 2 : 0, avg60: 100 };
      store.insertBar(res, b);
    }
  }
}

describe('AC-v2-139 hello', () => {
  it('정산 봉 480개와 평소 값이 들어 있다', () => {
    const s = seeded(10);
    fakeBars(s.store, 180, 600);
    const h: any = new HelloBuilder(s.ctx).build();
    expect(h.t).toBe('hello');
    expect(h.warm.res).toBe(180);
    for (const m of h.markets) expect(h.warm.bars[m]).toHaveLength(480);
    expect(h.warm.bars.DTC[0]).toHaveLength(7);
    expect(h.avg.DTC).toEqual(expect.objectContaining({ vol180: expect.any(Number), range180: expect.any(Number), range300s: expect.any(Number) }));
    expect(h.avg.DTC.range180).toBeGreaterThan(0);
  });
});

describe('AC-v2-140 /v1/bars', () => {
  it('1분 봉 8시간은 480개, 정지 표시와 함께', () => {
    const s = seeded(10);
    fakeBars(s.store, 60, 2000);
    const r: any = route('GET', new URL('/v1/bars?res=60&from=0&to=28799', 'http://x'), s.ctx).body;
    expect(r.bars.DTC).toHaveLength(480);
    expect(r.bars.DTC.filter((b: number[]) => b[7] === 2).length).toBe(10);
    expect(r.next).toBeUndefined();
  });
  it('20,000개를 넘으면 next 가 오고, next 부터 이어 받으면 빠짐없이 합쳐진다', () => {
    const s = seeded(10);
    fakeBars(s.store, 60, 20500, ['DTC']);
    const a: any = route('GET', new URL('/v1/bars?res=60&from=0&to=99999999', 'http://x'), s.ctx).body;
    expect(a.bars.DTC).toHaveLength(20000);
    expect(a.next).toBe(20000 * 60);
    const b: any = route('GET', new URL(`/v1/bars?res=60&from=${a.next}&to=99999999`, 'http://x'), s.ctx).body;
    expect(b.bars.DTC).toHaveLength(500);
    expect(b.next).toBeUndefined();
  });
  it('/v1/ticks 는 600개까지, /v1/time 은 n·ts·st·epoch', () => {
    const s = seeded(1000);
    const first = s.ticks[0].n;
    const r: any = route('GET', new URL(`/v1/ticks?from=${first}&to=${first + 900}`, 'http://x'), s.ctx).body;
    expect(r.ticks).toHaveLength(600);
    expect(r.ticks[0].p.DTC).toHaveLength(3);
    expect(r.ticks[0].src).toBeUndefined();
    const t: any = route('GET', new URL('/v1/time', 'http://x'), s.ctx).body;
    expect(Object.keys(t).sort()).toEqual(['epoch', 'n', 'st', 'ts']);
    expect(route('GET', new URL('/v1/ticks?from=5', 'http://x'), s.ctx).status).toBe(400);
  });
});

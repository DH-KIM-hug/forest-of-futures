import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerFeed } from '../../src/net/serverFeed';
import type { Tick } from '../../src/engine/feed/types';
import { cells, flush, hello, kmsg, makeNet } from './netHelpers';

let net: ReturnType<typeof makeNet>;
let feed: ServerFeed;
let got: Tick[];
beforeEach(() => {
  vi.useFakeTimers();
  net = makeNet();
  feed = new ServerFeed({ baseUrl: 'http://srv', wsFactory: net.wsFactory, fetchFn: net.fetchFn, random: () => 0.5 });
  got = [];
  feed.subscribe((t) => got.push(t));
});
afterEach(() => { feed.disconnect(); vi.useRealTimers(); });

const P = { DTC: 68000, BTH: 3400, SMS: 78.5, MDT: 210, JQQ: 520 };

describe('ServerFeed (가짜 소켓)', () => {
  it('연결 주소는 게임 서버의 /v1/stream 뿐이고, 틱은 엔진의 Tick 모양으로 나온다 (AC-v2-142)', async () => {
    feed.connect();
    expect((net.socks[0] as any).url).toBe('ws://srv/v1/stream');
    net.socks[0].push(hello(100));
    net.socks[0].push(kmsg(101, P));
    await flush();
    expect(got).toEqual([{ n: 101, st: 'open', p: cells(P) }]);
    expect(feed.status).toMatchObject({ conn: 'open', everConnected: true, market: 'open' });
  });

  it('AC-v2-97 20초 끊겼다 붙으면 빈 20틱을 받아 순서대로 흘리고 그 다음 틱을 잇는다', async () => {
    feed.connect();
    net.socks[0].push(hello(100));
    for (let n = 101; n <= 110; n++) net.socks[0].push(kmsg(n, P));
    await flush();
    net.socks[0].drop();
    expect(feed.status.conn).toBe('down');
    net.routes.push((p) => p.startsWith('/v1/ticks?from=111&to=130') ? { ticks: Array.from({ length: 20 }, (_, i) => ({ n: 111 + i, ts: 111 + i, st: 'open', p: cells(P) })) } : undefined);
    await vi.advanceTimersByTimeAsync(1100); // 재연결 1초(±0)
    expect(net.socks).toHaveLength(2);
    net.socks[1].push(hello(130));
    net.socks[1].push(kmsg(131, P));
    await flush();
    expect(got.map((t) => t.n)).toEqual(Array.from({ length: 31 }, (_, i) => 101 + i));
    expect(net.urls).toContain('/v1/ticks?from=111&to=130');
  });

  it('이미 받은 틱(중복·옛 틱)은 버린다', async () => {
    feed.connect();
    net.socks[0].push(hello(100));
    net.socks[0].push(kmsg(101, P));
    net.socks[0].push(kmsg(101, P));
    net.socks[0].push(kmsg(100, P));
    await flush();
    expect(got.map((t) => t.n)).toEqual([101]);
  });

  it('60틱을 넘는 끊김은 틱을 받지 않고 gapHandler(봉 따라잡기)가 끝난 뒤에 이어진다', async () => {
    const order: string[] = [];
    feed.subscribe((t) => order.push(`tick${t.n}`));
    feed.gapHandler = async (from, to) => { order.push(`gap${from}-${to}`); await new Promise((r) => setTimeout(r, 50)); order.push('gapdone'); };
    feed.connect();
    net.socks[0].push(hello(100));
    net.socks[0].push(kmsg(101, P));
    await flush();
    net.socks[0].drop();
    await vi.advanceTimersByTimeAsync(1100);
    net.socks[1].push(hello(7300));
    net.socks[1].push(kmsg(7301, P));
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(['tick101', 'gap102-7300', 'gapdone', 'tick7301']);
    expect(net.urls.some((u) => u.startsWith('/v1/ticks'))).toBe(false);
  });

  it('틱 REST 가 실패하면 봉 경로로 넘긴다', async () => {
    const calls: number[][] = [];
    feed.gapHandler = async (a, b) => { calls.push([a, b]); };
    feed.connect();
    net.socks[0].push(hello(100));
    net.socks[0].push(kmsg(101, P));
    net.socks[0].push(kmsg(111, P)); // 9틱 빠짐, REST 응답 없음(404)
    await flush();
    expect(calls).toEqual([[102, 110]]);
    expect(got.map((t) => t.n)).toEqual([101, 111]);
  });

  it('AC-v2-86 3초 동안 틱이 없으면 시세 지연, 60초면 정지, 틱이 오면 다시 열림', async () => {
    const seen: string[] = [];
    feed.onStatus((s) => seen.push(`${s.market}${s.stale ? '*' : ''}`));
    feed.connect();
    net.socks[0].push(hello(100));
    net.socks[0].push(kmsg(101, P));
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(feed.status.market).toBe('open');
    await vi.advanceTimersByTimeAsync(2000);
    expect(feed.status).toMatchObject({ market: 'delayed', stale: true });
    await vi.advanceTimersByTimeAsync(60000);
    expect(feed.status).toMatchObject({ market: 'halted', stale: true });
    net.socks[0].push(kmsg(102, P));
    await flush();
    expect(feed.status).toMatchObject({ market: 'open', stale: false });
  });

  it('서버가 보낸 delayed/halted 상태는 틱에 그대로 실린다', async () => {
    feed.connect();
    net.socks[0].push(hello(100));
    net.socks[0].push(kmsg(101, P, 'delayed'));
    net.socks[0].push(kmsg(102, P, 'halted'));
    await flush();
    expect(got.map((t) => t.st)).toEqual(['delayed', 'halted']);
    expect(feed.status.market).toBe('halted');
  });

  it('재연결 간격은 1 → 2 → 4 … 30초이고 hello 를 받으면 처음으로', async () => {
    feed.connect();
    const d: number[] = [];
    for (let i = 0; i < 7; i++) {
      net.socks[net.socks.length - 1].drop();
      d.push(feed.nextDelayMs);
      await vi.advanceTimersByTimeAsync(feed.nextDelayMs + 1);
    }
    expect(d).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    net.socks[net.socks.length - 1].push(hello(1));
    await flush();
    net.socks[net.socks.length - 1].drop();
    expect(feed.nextDelayMs).toBe(1000);
  });

  it('한 번도 못 붙었으면 everConnected=false (마을은 기기 시계로)', async () => {
    feed.connect();
    net.socks[0].drop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(feed.status.everConnected).toBe(false);
  });

  it('disconnect(앱이 가려짐)는 재연결을 멈추고, resumeFrom 으로 떠난 틱부터 이어 받는다', async () => {
    feed.connect();
    net.socks[0].push(hello(100));
    net.socks[0].push(kmsg(101, P));
    await flush();
    feed.disconnect();
    await vi.advanceTimersByTimeAsync(60000);
    expect(net.socks).toHaveLength(1);
    expect(feed.status.conn).toBe('idle');
    feed.resumeFrom(101);
    feed.connect();
    net.routes.push((p) => p.startsWith('/v1/ticks?from=102&to=104') ? { ticks: [102, 103, 104].map((n) => ({ n, ts: n, st: 'open', p: cells(P) })) } : undefined);
    net.socks[1].push(hello(104));
    net.socks[1].push(kmsg(105, P));
    await flush();
    expect(got.map((t) => t.n)).toEqual([101, 102, 103, 104, 105]);
  });

  it('bars(): next 로 이어 받아 합치고 Bar 모양(종목·상태 이름)으로 바꾼다', async () => {
    const row = (n0: number, st = 0) => [n0, 1, 2, 0.5, 1.5, 1, 0.5, st];
    net.routes.push((p) => p.startsWith('/v1/bars?res=60&from=0&') ? { bars: { DTC: [row(0), row(60, 2)] }, next: 120 } : undefined);
    net.routes.push((p) => p.startsWith('/v1/bars?res=60&from=120&') ? { bars: { DTC: [row(120)] } } : undefined);
    const bars = await feed.bars(60, 0, 1000);
    expect(bars.map((b) => [b.market, b.n0, b.st])).toEqual([['DTC', 0, 'open'], ['DTC', 60, 'halted'], ['DTC', 120, 'open']]);
    expect(bars[0]).toMatchObject({ o: 1, h: 2, l: 0.5, c: 1.5 });
  });
});

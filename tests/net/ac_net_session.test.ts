import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerFeed } from '../../src/net/serverFeed';
import { attachServerFeed, applyHello, type Session } from '../../src/net/session';
import { stepMut } from '../../src/engine/game';
import { liqPrice } from '../../src/engine/futures';
import type { AwayReport, GameState } from '../../src/engine/types';
import { A, fresh, openFutures, tickN } from '../engine/helpers';
import { cells, flush, hello, kmsg, makeNet } from './netHelpers';

let net: ReturnType<typeof makeNet>;
let feed: ServerFeed;
let g: GameState;
let sets: GameState[];
let away: AwayReport[];
let sess: Session;

function setup(prep?: (g: GameState) => void, lastSeen = 1000) {
  g = fresh();
  openFutures(g);
  g.run.cash = 1_000_000;
  prep?.(g);
  g.run.tick = 50;
  g.run.lastSeenTick = lastSeen;
  sets = [];
  away = [];
  feed = new ServerFeed({ baseUrl: 'http://srv', wsFactory: net.wsFactory, fetchFn: net.fetchFn, random: () => 0.5 });
  sess = attachServerFeed(feed, { get: () => g, set: (x) => { g = x; sets.push(x); }, onAway: (r) => away.push(r) });
}
beforeEach(() => { vi.useFakeTimers(); net = makeNet(); });
afterEach(() => { sess?.detach(); feed?.disconnect(); vi.useRealTimers(); });

const flatP = () => ({ ...g.run.prices });

describe('M6 ServerFeed ↔ 엔진', () => {
  it('AC-v2-97 20초 끊긴 사이 청산가에 닿았으면 닿은 틱에 청산된다', async () => {
    setup((x) => { expect(A(x, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 }).ok).toBe(true); });
    const P = flatP();
    const liq = liqPrice(g.run.positions.DTC);
    feed.connect();
    net.socks[0].push(hello(1000));
    for (let n = 1001; n <= 1010; n++) net.socks[0].push(kmsg(n, P));
    await flush();
    expect(g.run.positions.DTC).toBeDefined();
    net.socks[0].drop();
    net.routes.push((p) => p.startsWith('/v1/ticks?from=1011&to=1030') ? {
      ticks: Array.from({ length: 20 }, (_, i) => ({ n: 1011 + i, ts: 0, st: 'open', p: cells({ ...P, DTC: 1011 + i === 1020 ? liq - 1 : P.DTC }) })),
    } : undefined);
    await vi.advanceTimersByTimeAsync(1100);
    net.socks[1].push(hello(1030));
    net.socks[1].push(kmsg(1031, { ...P, DTC: P.DTC }));
    await flush();
    expect(g.run.positions.DTC).toBeUndefined();
    expect(g.run.lastPos!.ended).toBe('liq');
    const at = sets.find((s) => !s.run.positions.DTC && s.run.lastPos?.ended === 'liq')!;
    expect(at.run.lastSeenTick).toBe(1020); // 닿은 틱에서
    expect(g.run.lastSeenTick).toBe(1031);
  });

  it('AC-v2-93 연동: 2분 넘게 끊기면 서버 봉으로 따라잡는다(포지션 전 구간, 시간표가 남는다)', async () => {
    setup((x) => { A(x, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 }); });
    const P = flatP();
    const liq = liqPrice(g.run.positions.DTC);
    feed.connect();
    net.socks[0].push(hello(1000));
    net.socks[0].push(kmsg(1001, P));
    await flush();
    net.socks[0].drop();
    const minutes = 60;
    net.routes.push((p) => {
      if (!p.startsWith('/v1/bars?res=60&from=1002')) return undefined;
      const rows = (m: string) => Array.from({ length: minutes }, (_, k) => [1002 + k * 60, P[m as 'DTC'], P[m as 'DTC'], m === 'DTC' && k === 30 ? liq - 1 : P[m as 'DTC'], P[m as 'DTC'], 60, 0.5, 0]);
      return { bars: Object.fromEntries(Object.keys(P).map((m) => [m, rows(m)])) };
    });
    await vi.advanceTimersByTimeAsync(1100);
    net.socks[1].push(hello(1001 + minutes * 60));
    net.socks[1].push(kmsg(1002 + minutes * 60, P));
    await flush();
    expect(net.urls.some((u) => u.startsWith('/v1/ticks'))).toBe(false);
    expect(g.run.positions.DTC).toBeUndefined();
    expect(away).toHaveLength(1);
    expect(away[0].entries.some((e) => e.kind === 'liq')).toBe(true);
    expect(g.run.lastSeenTick).toBe(1002 + minutes * 60);
  });

  it('AC-v2-86 틱이 3초 끊기면 엔진은 시세 지연(진입 막힘), 60초면 정지, 틱이 오면 열림', async () => {
    setup();
    const P = flatP();
    feed.connect();
    net.socks[0].push(hello(1000));
    net.socks[0].push(kmsg(1001, P));
    await flush();
    expect(g.run.marketStatus).toBe('open');
    await vi.advanceTimersByTimeAsync(3500);
    expect(g.run.marketStatus).toBe('delayed');
    expect(A(g, { type: 'open', market: 'BTH', dir: 1, lev: 2, margin: 1000 }).ok).toBe(false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(g.run.marketStatus).toBe('halted');
    net.socks[0].push(kmsg(1002, P));
    await flush();
    expect(g.run.marketStatus).toBe('open');
  });

  it('AC-v2-86 정지: 포지션은 얼고 마을의 정산 시계는 계속 돈다', async () => {
    setup((x) => { A(x, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 }); });
    const P = flatP();
    const settleIn = g.run.settleIn;
    feed.connect();
    net.socks[0].push(hello(1000));
    for (let n = 1001; n <= 1005; n++) net.socks[0].push(kmsg(n, { ...P, DTC: 1 }, 'halted')); // 청산가 아래 가격이어도
    await flush();
    expect(g.run.positions.DTC).toBeDefined();
    expect(g.run.settleIn).toBe(settleIn - 5);
  });

  it('서버를 못 만나면 마을은 기기 시계로 돈다(시세 정지, 포지션 얼림). 붙으면 서버 번호로 맞춘다', async () => {
    setup((x) => { A(x, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 10000 }); }, 777);
    const settleIn = g.run.settleIn;
    feed.connect();
    await vi.advanceTimersByTimeAsync(2500);
    expect(g.run.settleIn).toBe(settleIn); // 3초 유예 동안은 가만히
    await vi.advanceTimersByTimeAsync(10000);
    expect(sess.localTicksRan()).toBe(true);
    expect(g.run.settleIn).toBeLessThan(settleIn);
    expect(g.run.marketStatus).toBe('halted');
    expect(g.run.positions.DTC).toBeDefined();
    // 서버가 나타났다
    net.socks[0].push(hello(900000));
    net.socks[0].push(kmsg(900001, flatP()));
    await flush();
    expect(g.run.lastSeenTick).toBe(900001);
    expect(feed.status.everConnected).toBe(true);
    expect(g.run.marketStatus).toBe('open');
  });

  it('새 게임의 세대 시작가는 첫 틱의 서버 가격이다', async () => {
    g = fresh();
    sets = [];
    feed = new ServerFeed({ baseUrl: 'http://srv', wsFactory: net.wsFactory, fetchFn: net.fetchFn });
    sess = attachServerFeed(feed, { get: () => g, set: (x) => { g = x; } });
    feed.connect();
    net.socks[0].push(hello(500));
    net.socks[0].push(kmsg(501, { DTC: 71000, BTH: 3500, SMS: 80, MDT: 220, JQQ: 530 }));
    await flush();
    expect(g.run.refPrice.DTC).toBe(71000);
    expect(g.run.lastSeenTick).toBe(501);
  });

  it('hello 의 평소 값과 준비 봉(정산 봉 480칸)이 엔진에 들어가 정보 규칙이 돈다 (AC-v2-139 앱 쪽)', () => {
    const x = fresh();
    const rows = Array.from({ length: 480 }, (_, i) => [i * 180, 100, 101, 99, 100, 1, 0.5]);
    applyHello(x, hello(1, 'open', {
      warm: { res: 180, bars: { DTC: rows } },
      avg: { DTC: { vol180: 1, range180: 0.01, range300s: 0.02 } },
    }) as any);
    expect(x.run.mkt.bars.DTC).toHaveLength(480);
    expect(x.run.mkt.avgFromServer).toBe(true);
    expect(x.run.mkt.avg.DTC.range180).toBe(0.01);
    stepMut(x, { type: 'tick', tick: { n: 1, st: 'open', p: cells(x.run.prices) as any } });
  });

  it('앱이 가려지면 연결을 닫고(열린 포지션 알림), 다시 보이면 마지막 틱부터 이어 받는다', async () => {
    setup((x) => { A(x, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000 }); });
    const P = flatP();
    feed.connect();
    net.socks[0].push(hello(1000));
    net.socks[0].push(kmsg(1001, P));
    await flush();
    sess.background();
    expect(net.socks[0].closed).toBe(true);
    expect(g.run.notices.some((n) => n.text.includes('열어 둔 포지션'))).toBe(true);
    sess.foreground();
    net.routes.push((p) => p.startsWith('/v1/ticks?from=1002&to=1010') ? { ticks: Array.from({ length: 9 }, (_, i) => ({ n: 1002 + i, ts: 0, st: 'open', p: cells(P) })) } : undefined);
    net.socks[1].push(hello(1010));
    net.socks[1].push(kmsg(1011, P));
    await flush();
    expect(g.run.lastSeenTick).toBe(1011);
  });
});
void tickN;

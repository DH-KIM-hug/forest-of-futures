import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DexAdapterStub, HyperliquidAdapter, type SocketLike } from '../src/hyperliquid.ts';
import { NotImplementedError, type RawEvent } from '../src/types.ts';

class FakeSock implements SocketLike {
  onopen: any = null; onmessage: any = null; onclose: any = null; onerror: any = null;
  sent: any[] = [];
  closed = false;
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.closed = true; this.onclose?.(); }
  terminate() { this.closed = true; }
  open() { this.onopen?.(); }
  msg(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}

const coins = { DTC: 'BTC', BTH: 'ETH', IDX_XRP: 'XRP' };
const bbo = (coin: string, b: string, a: string) => ({ channel: 'bbo', data: { coin, time: 1, bbo: [{ px: b, sz: '1', n: 1 }, { px: a, sz: '1', n: 1 }] } });

describe('Hyperliquid 어댑터 (가짜 소켓)', () => {
  let socks: FakeSock[];
  let events: RawEvent[];
  let ad: HyperliquidAdapter;
  beforeEach(() => {
    vi.useFakeTimers();
    socks = [];
    events = [];
    ad = new HyperliquidAdapter({ url: 'wss://x', coins, socketFactory: () => { const s = new FakeSock(); socks.push(s); return s; }, random: () => 0.5 });
    ad.onEvent((e) => events.push(e));
  });
  afterEach(() => { ad.stop(); vi.useRealTimers(); });

  it('붙으면 종목마다 bbo·trades 를 구독하고(allMids 는 쓰지 않는다) 주기적으로 ping 한다', () => {
    ad.start();
    socks[0].open();
    const subs = socks[0].sent.filter((m) => m.method === 'subscribe');
    expect(subs).toHaveLength(6);
    expect(subs.map((m) => m.subscription.type).sort()).toEqual(['bbo', 'bbo', 'bbo', 'trades', 'trades', 'trades']);
    expect(JSON.stringify(socks[0].sent)).not.toContain('allMids');
    for (let i = 0; i < 16; i++) { socks[0].msg({ channel: 'pong' }); vi.advanceTimersByTime(1000); }
    expect(socks[0].sent.some((m) => m.method === 'ping')).toBe(true);
  });

  it('bbo 의 mid = (매수호가 + 매도호가) / 2, 체결은 금액과 방향', () => {
    ad.start();
    socks[0].open();
    socks[0].msg(bbo('BTC', '100', '102'));
    socks[0].msg({ channel: 'trades', data: [{ coin: 'ETH', side: 'B', px: '10', sz: '2', time: 1 }, { coin: 'ETH', side: 'A', px: '10', sz: '1', time: 1 }, { coin: 'ZZZ', side: 'B', px: '1', sz: '1', time: 1 }] });
    expect(events).toEqual([
      { kind: 'mid', key: 'DTC', mid: 101, ts: 1 },
      { kind: 'trade', key: 'BTH', notional: 20, buy: true, ts: 1 },
      { kind: 'trade', key: 'BTH', notional: 10, buy: false, ts: 1 },
    ]);
  });

  it('끊기면 1 → 2 → 4 … 최대 30초로 다시 붙고, 데이터를 받으면 간격이 초기화된다', () => {
    ad.start();
    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      const s = socks[socks.length - 1];
      s.open();
      s.onclose();
      delays.push(ad.nextDelayMs);
      vi.advanceTimersByTime(ad.nextDelayMs + 1);
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    const s = socks[socks.length - 1];
    s.open();
    s.msg(bbo('BTC', '1', '1'));
    s.onclose();
    expect(ad.nextDelayMs).toBe(1000);
    expect(ad.connects).toBe(9);
  });

  it('±20% 흔들림', () => {
    const lo = new HyperliquidAdapter({ url: 'x', coins, socketFactory: () => new FakeSock(), random: () => 0 });
    const hi = new HyperliquidAdapter({ url: 'x', coins, socketFactory: () => new FakeSock(), random: () => 1 });
    expect(lo.backoffMs(2)).toBe(3200);
    expect(hi.backoffMs(2)).toBe(4800);
  });

  it('5초 동안 아무 메시지도 없으면 끊김으로 보고 다시 붙는다, 다시 붙으면 구독을 다시 보낸다', () => {
    ad.start();
    socks[0].open();
    vi.advanceTimersByTime(3000);
    socks[0].msg(bbo('BTC', '1', '1'));
    vi.advanceTimersByTime(4000);
    expect(socks).toHaveLength(1);
    vi.advanceTimersByTime(2000); // 마지막 메시지로부터 5초
    expect(socks[0].closed).toBe(true);
    vi.advanceTimersByTime(1100);
    expect(socks).toHaveLength(2);
    socks[1].open();
    expect(socks[1].sent.filter((m) => m.method === 'subscribe')).toHaveLength(6);
  });

  it('stop 은 재연결을 멈춘다', () => {
    ad.start();
    socks[0].open();
    ad.stop();
    vi.advanceTimersByTime(60000);
    expect(socks).toHaveLength(1);
  });

  it('보조 출처 어댑터(DEX)는 아직 구현되지 않았다(M10)', () => {
    expect(() => new DexAdapterStub().start()).toThrow(NotImplementedError);
  });
});

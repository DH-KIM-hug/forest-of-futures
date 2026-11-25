import { vi } from 'vitest';
import type { SocketLike } from '../../src/net/serverFeed';

export class FakeSock implements SocketLike {
  onopen: any = null; onmessage: any = null; onclose: any = null; onerror: any = null;
  closed = false;
  close() { this.closed = true; this.onclose?.(); }
  push(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
  drop() { this.onclose?.(); }
}

export const flush = () => vi.advanceTimersByTimeAsync(0);

export const hello = (n: number, st = 'open', extra: Record<string, unknown> = {}) => ({
  t: 'hello', n, ts: n, epoch: 1, st, markets: ['DTC', 'BTH', 'SMS', 'MDT', 'JQQ'],
  warm: { res: 180, bars: {} }, avg: {}, ...extra,
});
export const cells = (price: Record<string, number>) => Object.fromEntries(Object.entries(price).map(([k, v]) => [k, [v, 1, 0.5]]));
export const kmsg = (n: number, price: Record<string, number>, st = 'open') => ({ t: 'k', n, ts: n, st, p: cells(price) });

/** 가짜 서버: 소켓 목록 + REST 응답을 직접 정해 준다. */
export function makeNet() {
  const socks: FakeSock[] = [];
  const urls: string[] = [];
  const routes: ((path: string) => unknown | undefined)[] = [];
  const fetchFn = (async (u: string) => {
    const path = u.replace('http://srv', '');
    urls.push(path);
    for (const r of routes) {
      const body = r(path);
      if (body !== undefined) return { ok: true, status: 200, json: async () => body } as any;
    }
    return { ok: false, status: 404, json: async () => ({}) } as any;
  }) as unknown as typeof fetch;
  const wsFactory = (url: string) => { const s = new FakeSock(); (s as any).url = url; socks.push(s); return s; };
  return { socks, urls, routes, fetchFn, wsFactory };
}

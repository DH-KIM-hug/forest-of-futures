// ServerFeed: 게임 서버(WS 방송 + REST)에서 틱을 받아 엔진의 Feed 모양으로 내놓는다 (GDD_v2 6.6, 7.3).
// - 재연결 1→2→4…30초(±20%), 앱이 가려지면 disconnect().
// - 틱이 끊겨 빈 구간이 생기면: 60틱 이하는 REST 틱으로 채워 순서대로 흘리고, 더 길면 gapHandler(봉으로 따라잡기)에 맡긴다.
// - 3초 동안 틱이 없으면 '시세 지연'(delayed), 60초면 halted 로 알린다. 엔진은 tick 의 st 만 본다.
import type { Bar, Feed, Tick } from '../engine/feed/types';
import type { MarketStatus } from '../engine/types';
import { barsFromRows, tickFromMsg, type HelloMsg, type TickMsg } from './protocol';

export interface SocketLike {
  onopen: ((ev?: any) => void) | null;
  onmessage: ((ev: { data: any }) => void) | null;
  onclose: ((ev?: any) => void) | null;
  onerror: ((ev?: any) => void) | null;
  close(): void;
}

export type Conn = 'idle' | 'connecting' | 'open' | 'down';
export interface FeedStatus {
  conn: Conn;
  /** 이번 실행에서 서버를 한 번이라도 만났는가(못 만났으면 마을은 기기 시계로 돈다). */
  everConnected: boolean;
  /** 서버가 말하는 시장 상태, 또는 틱이 끊겼을 때 앱이 정한 상태. */
  market: MarketStatus;
  stale: boolean; // 3초 넘게 틱이 없음
}

export interface ServerFeedOpts {
  baseUrl: string; // http(s)://호스트:포트 (게임 서버뿐)
  wsFactory?: (url: string) => SocketLike;
  fetchFn?: typeof fetch;
  now?: () => number;
  random?: () => number;
  delayedAfterMs?: number;
  haltedAfterMs?: number;
  /** 이 틱 수 이하의 끊김은 틱을 받아 그대로 재생한다(3.13). */
  replayMaxTicks?: number;
}

export class ServerFeed implements Feed {
  status: FeedStatus = { conn: 'idle', everConnected: false, market: 'delayed', stale: false };
  /** 60틱을 넘는 끊김: from..to 틱이 빠졌다. 끝날 때까지 이어지는 틱은 기다린다. */
  gapHandler: ((from: number, to: number) => Promise<void>) | null = null;
  /** hello 가 올 때마다(엔진에 '평소' 값·준비 봉을 넣는 자리). */
  helloHandler: ((h: HelloMsg) => void) | null = null;
  lastN: number | null = null;
  serverN: number | null = null;

  private o: Required<Omit<ServerFeedOpts, 'wsFactory' | 'fetchFn'>> & { wsFactory: (u: string) => SocketLike; fetchFn: typeof fetch };
  private subs = new Set<(t: Tick) => void>();
  private statusSubs = new Set<(s: FeedStatus) => void>();
  private sock: SocketLike | null = null;
  private wanted = false;
  private attempt = 0;
  private retry: any = null;
  private watch: any = null;
  private lastTickAt = 0;
  private chain: Promise<void> = Promise.resolve();
  private lastCells: Tick['p'] | null = null;
  nextDelayMs = 0;

  constructor(opts: ServerFeedOpts) {
    const wsFactory = opts.wsFactory ?? ((u: string) => new WebSocket(u) as unknown as SocketLike);
    this.o = {
      now: () => Date.now(), random: Math.random, delayedAfterMs: 3000, haltedAfterMs: 60000, replayMaxTicks: 60,
      fetchFn: (...a: Parameters<typeof fetch>) => fetch(...a), ...opts, wsFactory,
    } as ServerFeed['o'];
  }

  // ── Feed ──────────────────────────────────────────────
  subscribe(cb: (t: Tick) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  onStatus(cb: (s: FeedStatus) => void): () => void {
    this.statusSubs.add(cb);
    return () => this.statusSubs.delete(cb);
  }
  async bars(res: 60 | 180, from: number, to: number): Promise<Bar[]> {
    const out: Bar[] = [];
    let f = from;
    for (let guard = 0; guard < 100; guard++) {
      const j = await this.get(`/v1/bars?res=${res}&from=${f}&to=${to}`);
      out.push(...barsFromRows(j.bars));
      if (j.next === undefined) break;
      f = j.next;
    }
    return out;
  }
  async now(): Promise<{ n: number; st: MarketStatus }> {
    const j = await this.get('/v1/time');
    return { n: j.n, st: j.st };
  }

  // ── 연결 ──────────────────────────────────────────────
  /** 엔진이 마지막으로 본 틱부터 이어 받는다(앱이 다시 보일 때). null 이면 서버의 지금부터. */
  resumeFrom(n: number | null): void {
    this.lastN = n;
  }
  connect(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.lastTickAt = this.o.now();
    this.open();
    this.watch = setInterval(() => this.checkStale(), 1000);
  }
  disconnect(): void {
    this.wanted = false;
    clearTimeout(this.retry);
    clearInterval(this.watch);
    const s = this.sock;
    this.sock = null;
    if (s) { s.onclose = null; try { s.close(); } catch { /* 무시 */ } }
    this.set({ conn: 'idle', stale: false });
  }

  private wsUrl(): string {
    return this.o.baseUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/v1/stream';
  }
  private open(): void {
    this.set({ conn: 'connecting' });
    const s = this.o.wsFactory(this.wsUrl());
    this.sock = s;
    s.onmessage = (ev) => {
      let m: any;
      try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
      this.chain = this.chain.then(() => this.onMsg(m)).catch(() => {});
    };
    s.onerror = () => {};
    s.onclose = () => {
      if (this.sock !== s) return;
      this.sock = null;
      this.set({ conn: 'down' });
      if (!this.wanted) return;
      this.nextDelayMs = Math.round(Math.min(30000, 1000 * 2 ** this.attempt) * (0.8 + 0.4 * this.o.random()));
      this.attempt += 1;
      this.retry = setTimeout(() => this.open(), this.nextDelayMs);
    };
  }

  private async onMsg(m: HelloMsg | TickMsg): Promise<void> {
    if (m.t === 'hello') {
      this.attempt = 0;
      this.serverN = m.n;
      this.lastTickAt = this.o.now();
      this.set({ conn: 'open', everConnected: true, market: m.st, stale: false });
      this.helloHandler?.(m);
      if (this.lastN === null) this.lastN = m.n; // 새로 시작: 지금부터
      return;
    }
    if (m.t !== 'k') return;
    this.serverN = m.n;
    const last = this.lastN ?? m.n - 1;
    if (m.n <= last) return; // 이미 받은 틱
    const missed = m.n - last - 1;
    if (missed > 0) {
      let filled = false;
      if (missed <= this.o.replayMaxTicks) {
        try {
          const j = await this.get(`/v1/ticks?from=${last + 1}&to=${m.n - 1}`);
          const got = (j.ticks as TickMsg[]).filter((t) => t.n > last && t.n < m.n).sort((a, b) => a.n - b.n);
          if (got.length === missed) {
            for (const t of got) this.deliver(tickFromMsg(t));
            filled = true;
          }
        } catch { /* 아래 봉 경로로 */ }
      }
      if (!filled) await this.gapHandler?.(last + 1, m.n - 1);
    }
    this.deliver(tickFromMsg(m));
  }

  private deliver(t: Tick): void {
    this.lastN = t.n;
    this.lastTickAt = this.o.now();
    this.lastCells = t.p;
    this.set({ market: t.st, stale: false });
    for (const cb of [...this.subs]) cb(t);
  }

  /** 틱이 안 오는 시간을 본다. 3초 → delayed, 60초 → halted. */
  private checkStale(): void {
    if (!this.wanted || !this.status.everConnected) return;
    const quiet = this.o.now() - this.lastTickAt;
    if (quiet >= this.o.haltedAfterMs) this.set({ market: 'halted', stale: true });
    else if (quiet >= this.o.delayedAfterMs) this.set({ market: this.status.market === 'halted' ? 'halted' : 'delayed', stale: true });
  }

  lastPrices(): Tick['p'] | null {
    return this.lastCells;
  }

  private async get(path: string): Promise<any> {
    const r = await this.o.fetchFn(this.o.baseUrl.replace(/\/$/, '') + path);
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
  }

  private set(p: Partial<FeedStatus>): void {
    const next = { ...this.status, ...p };
    if (next.conn === this.status.conn && next.market === this.status.market && next.stale === this.status.stale && next.everConnected === this.status.everConnected) return;
    this.status = next;
    for (const cb of [...this.statusSubs]) cb(next);
  }
}

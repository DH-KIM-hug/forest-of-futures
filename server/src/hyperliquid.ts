// Hyperliquid 공개 WebSocket 어댑터 (GDD_v2 6.2). bbo + trades 구독(종목당 2개 = 10개), ping, 5초 무소식이면 끊김으로 보고 재연결.
// allMids 는 쓰지 않는다. 소켓 생성은 주입할 수 있다(테스트용 가짜 소켓).
import { NotImplementedError, type RawEvent, type SourceAdapter, type SourceId } from './types.ts';

export interface SocketLike {
  onopen: ((ev?: any) => void) | null;
  onmessage: ((ev: { data: any }) => void) | null;
  onclose: ((ev?: any) => void) | null;
  onerror: ((ev?: any) => void) | null;
  send(data: string): void;
  close(): void;
  terminate?(): void;
}
export type SocketFactory = (url: string) => SocketLike;

export interface HlOpts {
  url: string;
  coins: Record<string, string>; // 내부 키 -> 실제 코인
  socketFactory: SocketFactory;
  pingMs?: number;
  silentMs?: number;
  now?: () => number;
  random?: () => number;
}

export class HyperliquidAdapter implements SourceAdapter {
  readonly id: SourceId = 'primary';
  private o: Required<HlOpts>;
  private cb: (e: RawEvent) => void = () => {};
  private sock: SocketLike | null = null;
  private stopped = true;
  private attempt = 0;
  private lastMsgAt = 0;
  private timers: { ping?: any; watch?: any; retry?: any } = {};
  private byCoin: Record<string, string> = {};
  connects = 0;
  messages = 0;
  nextDelayMs = 0;

  constructor(opts: HlOpts) {
    this.o = { pingMs: 15000, silentMs: 5000, now: () => Date.now(), random: Math.random, ...opts };
    for (const [k, c] of Object.entries(opts.coins)) this.byCoin[c] = k;
  }
  onEvent(cb: (e: RawEvent) => void): void {
    this.cb = cb;
  }
  start(): void {
    this.stopped = false;
    this.connect();
  }
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    clearTimeout(this.timers.retry);
    const s = this.sock;
    this.sock = null;
    if (s) {
      s.onclose = null;
      try { s.close(); } catch { /* 이미 닫힘 */ }
    }
  }

  private clearTimers() {
    clearInterval(this.timers.ping);
    clearInterval(this.timers.watch);
  }

  /** 재연결 간격: 1 → 2 → 4 … 최대 30초, ±20%. */
  backoffMs(attempt: number): number {
    const base = Math.min(30000, 1000 * Math.pow(2, attempt));
    return Math.round(base * (0.8 + 0.4 * this.o.random()));
  }

  private connect(): void {
    if (this.stopped) return;
    const s = this.o.socketFactory(this.o.url);
    this.sock = s;
    this.connects += 1;
    s.onopen = () => {
      this.lastMsgAt = this.o.now();
      for (const coin of Object.values(this.o.coins)) {
        s.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'bbo', coin } }));
        s.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'trades', coin } }));
      }
      this.timers.ping = setInterval(() => { try { s.send(JSON.stringify({ method: 'ping' })); } catch { /* onclose 가 처리 */ } }, this.o.pingMs);
      this.timers.watch = setInterval(() => {
        if (this.o.now() - this.lastMsgAt >= this.o.silentMs) this.drop(s);
      }, 1000);
    };
    s.onmessage = (ev) => this.handle(ev.data);
    s.onerror = () => {};
    s.onclose = () => {
      if (this.sock === s) this.afterClose();
    };
  }

  /** 소리 없이 죽은 연결을 끊는다. */
  private drop(s: SocketLike): void {
    s.onclose = null;
    try { (s.terminate ?? s.close).call(s); } catch { /* 무시 */ }
    if (this.sock === s) this.afterClose();
  }

  private afterClose(): void {
    this.sock = null;
    this.clearTimers();
    if (this.stopped) return;
    this.nextDelayMs = this.backoffMs(this.attempt);
    this.attempt += 1;
    this.timers.retry = setTimeout(() => this.connect(), this.nextDelayMs);
  }

  private handle(raw: any): void {
    this.lastMsgAt = this.o.now();
    let m: any;
    try { m = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch { return; }
    this.messages += 1;
    if (m.channel === 'bbo') {
      const key = this.byCoin[m.data?.coin];
      const [b, a] = m.data?.bbo ?? [];
      if (key && b && a) {
        const mid = (Number(b.px) + Number(a.px)) / 2;
        if (mid > 0) {
          this.attempt = 0; // 데이터가 왔다: 백오프 초기화
          this.cb({ kind: 'mid', key, mid, ts: Number(m.data.time) || this.lastMsgAt });
        }
      }
    } else if (m.channel === 'trades' && Array.isArray(m.data)) {
      for (const t of m.data) {
        const key = this.byCoin[t.coin];
        if (!key) continue;
        const notional = Number(t.px) * Number(t.sz);
        if (notional > 0) this.cb({ kind: 'trade', key, notional, buy: t.side === 'B', ts: Number(t.time) || this.lastMsgAt });
      }
    }
  }
}

/** 보조 출처(DEX 체결가). 실제 RPC 어댑터는 M10 에서. 지금은 start() 가 NotImplemented 를 던진다. */
export class DexAdapterStub implements SourceAdapter {
  readonly id: SourceId = 'secondary';
  start(): void {
    throw new NotImplementedError('DEX secondary source (M10)');
  }
  stop(): void {}
  onEvent(): void {}
}

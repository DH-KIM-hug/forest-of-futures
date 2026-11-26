// 브라우저 직결 시세 피드. 출처의 공개 WebSocket(bbo + trades)을 받아 1초 틱으로 만든다. 게임 서버가 없다.
// 소켓 어댑터·표본·변환·상태 판정은 서버 코드(server/src)를 그대로 쓰고, 여기는 시계와 봉 조회만 덧붙인다.
import { PrimaryAdapter, type SocketFactory } from '../../../server/src/shared';
import { marketDefs } from '../../engine/data';
import type { Bar, Feed, Tick } from '../../engine/feed/types';
import type { MarketStatus } from '../../engine/types';
import type { HelloMsg } from '../protocol';
import { avgOf, fetchCandles, regroup, secondsOf, toBars, volMeans, type CandleSet } from './candles';
import { COINS, INDEX_ID, SOCKET_URL } from './config';
import { LiveCore } from './core';
import type { PostJson } from './io';

export interface HlStatus {
  conn: 'idle' | 'connecting' | 'live' | 'down';
  market: MarketStatus;
  everConnected: boolean; // 데이터를 한 번이라도 받았다
}
export interface HlOpts {
  socketFactory: SocketFactory;
  post: PostJson;
  now?: () => number;
  replayMaxTicks?: number; // 이보다 오래 비우면 틱 대신 봉으로 메운다(서버 판과 같은 60)
}
export interface Warm { hello: HelloMsg; history: Record<string, number[]>; /** 지난 하루의 1분 봉(가상 가격). 시세면이 읽는다 */ day: Record<string, { t: number; o: number; h: number; l: number; c: number }[]> }

const TRADABLE: Record<string, string> = Object.fromEntries(
  marketDefs.filter((m) => m.id !== INDEX_ID).map((m) => [m.id, m.id] as const),
); // 내부 키가 곧 시장 id (sources 의 DTC BTH SMS MDT)

export class HlDirectFeed implements Feed {
  readonly core: LiveCore;
  status: HlStatus = { conn: 'idle', market: 'delayed', everConnected: false };
  /** 틱이 오래 비어 봉으로 메워야 할 때. bars 는 그 구간의 1분 봉(못 받으면 빈 배열). */
  gapHandler: ((from: number, to: number, bars: Bar[]) => void | Promise<void>) | null = null;
  private o: Required<Pick<HlOpts, 'now' | 'replayMaxTicks'>> & HlOpts;
  private adapter: PrimaryAdapter;
  private subs = new Set<(t: Tick) => void>();
  private statusSubs = new Set<(s: HlStatus) => void>();
  private nextN: number | null = null;
  private lastN: number | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;
  private anchoredWaiters: (() => void)[] = [];
  private means: Record<string, number> = {};

  constructor(opts: HlOpts) {
    this.o = { now: () => Date.now(), replayMaxTicks: 60, ...opts };
    this.core = new LiveCore(marketDefs.map((m) => ({ id: m.id, startPrice: m.startPrice })), this.o.now());
    this.adapter = new PrimaryAdapter({ url: SOCKET_URL, coins: COINS, socketFactory: opts.socketFactory, now: this.o.now });
    this.adapter.onEvent((e) => this.core.ingest(e, this.o.now()));
  }

  // ── 연결 ──
  connect(): void {
    if (this.timer) return;
    this.set({ conn: 'connecting' });
    this.adapter.start();
    this.timer = setInterval(() => void this.run(this.o.now()), 200);
  }
  disconnect(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.adapter.stop();
    this.set({ conn: 'idle' });
  }
  /** 탭이 다시 보일 때: 기다리지 않고 바로 시계를 맞춘다. */
  kick(): void {
    void this.run(this.o.now());
  }

  // ── Feed ──
  subscribe(cb: (t: Tick) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  onStatus(cb: (s: HlStatus) => void): () => void {
    this.statusSubs.add(cb);
    return () => this.statusSubs.delete(cb);
  }
  async now(): Promise<{ n: number; st: MarketStatus }> {
    return { n: this.lastN ?? Math.floor(this.o.now() / 1000), st: this.core.status };
  }
  async bars(res: 60 | 180, from: number, to: number): Promise<Bar[]> {
    const cs = await fetchCandles(this.o.post, from * 1000 - 60000, (to + 1) * 1000);
    const b60 = this.convert(cs, from > 0 && this.lastN !== null && from === this.lastN + 1 ? 'forward' : 'end').filter((b) => b.n0 >= from - 59 && b.n0 <= to);
    return res === 60 ? b60 : regroup(b60, 180);
  }

  /** 시작할 때 한 번: 최근 24시간 봉으로 정산 봉(480칸 이하)·평소 값·차트 기록을 만든다. 첫 틱 뒤에 부른다. */
  async loadWarm(): Promise<Warm | null> {
    await this.untilAnchored();
    // 첫 틱에 값이 아직 안 온 종목(조용한 종목은 첫 값이 몇 초 늦다)이 있으면 조금 기다린다 — 배율을 모르면 그 종목의 지난 봉을 가상 가격으로 못 바꾼다.
    // 회차 4 에서 본 것: 기다리지 않으면 삼솔전자 · 멍도토의 차트 기록과 지난 하루(시세면)가 비어 있었다. 8초가 지나도 없으면 있는 것만 쓴다.
    for (let i = 0; i < 32 && Object.values(TRADABLE).some((k) => !(this.core.lastMids[k] > 0)); i++) await new Promise((r) => setTimeout(r, 250));
    const nowMs = this.o.now();
    const cs = await fetchCandles(this.o.post, nowMs - 24 * 3600 * 1000, nowMs);
    this.means = volMeans(cs);
    for (const [k, mean] of Object.entries(this.means)) this.core.vol.seed(k, mean, 3600);
    const b60 = this.convert(cs, 'end');
    const b180 = regroup(b60, 180).slice(-480);
    const ids = marketDefs.map((m) => m.id);
    const rows: Record<string, number[][]> = {};
    for (const id of ids) rows[id] = b180.filter((b) => b.market === id).map((b) => [b.n0, b.o, b.h, b.l, b.c, b.vol, b.buy]);
    const history: Record<string, number[]> = {};
    for (const id of ids) history[id] = secondsOf(b60.filter((b) => b.market === id), 600);
    const day: Warm['day'] = {};
    for (const id of ids) day[id] = b60.filter((b) => b.market === id).map((b) => ({ t: b.n0 * 1000, o: b.o, h: b.h, l: b.l, c: b.c }));
    const n = this.lastN ?? Math.floor(nowMs / 1000);
    return {
      hello: { t: 'hello', n, ts: n, epoch: 0, st: this.core.status, markets: ids, warm: { res: 180, bars: rows }, avg: avgOf(b60, b180, ids) },
      history,
      day,
    };
  }

  // ── 안쪽 ──
  private convert(cs: CandleSet, mode: 'forward' | 'end'): Bar[] {
    const k = this.core.scale(TRADABLE);
    const now = this.core.rebaser.vprice[INDEX_ID];
    return toBars(cs, {
      tradable: TRADABLE,
      k,
      means: this.means.DTC ? this.means : volMeans(cs),
      anchor: mode === 'forward' ? { kind: 'forward', base: now, prev: this.core.lastMids } : { kind: 'end', end: now },
    });
  }

  private untilAnchored(): Promise<void> {
    return this.core.anchored ? Promise.resolve() : new Promise((r) => this.anchoredWaiters.push(r));
  }

  /** 시계가 흐른 만큼 틱을 만든다. */
  private async run(nowMs: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const cur = Math.floor(nowMs / 1000);
      if (this.nextN === null) this.nextN = cur;
      if (cur - this.nextN > this.o.replayMaxTicks) {
        const from = this.nextN;
        const to = cur - 1;
        this.nextN = cur;
        let bars: Bar[] = [];
        try { bars = await this.bars(60, from, to); } catch { /* 봉을 못 받았다: 건너뛴다 */ }
        if (bars.length) {
          const last: Record<string, number> = {};
          for (const b of bars) last[b.market] = b.c;
          this.core.adopt(last);
        }
        await this.gapHandler?.(from, to, bars);
      }
      while (this.nextN <= cur) {
        const t = this.core.tick(this.nextN, nowMs);
        this.nextN += 1;
        this.lastN = t.n;
        const quiet = this.core.status;
        this.status = { ...this.status, everConnected: this.status.everConnected || this.core.sampler.lastAt !== null };
        this.set({ conn: quiet === 'open' ? 'live' : this.status.everConnected ? 'down' : 'connecting', market: quiet });
        if (this.core.anchored && this.anchoredWaiters.length) for (const w of this.anchoredWaiters.splice(0)) w();
        for (const cb of [...this.subs]) cb(t);
      }
    } finally {
      this.busy = false;
    }
  }

  private set(p: Partial<HlStatus>): void {
    const next = { ...this.status, ...p };
    if (next.conn === this.status.conn && next.market === this.status.market && next.everConnected === this.status.everConnected) { this.status = next; return; }
    this.status = next;
    for (const cb of [...this.statusSubs]) cb(next);
  }
}

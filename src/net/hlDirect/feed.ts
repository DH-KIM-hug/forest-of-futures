// 브라우저 직결 시세 피드. 출처의 공개 WebSocket(bbo + trades)을 받아 1초 틱으로 만든다. 게임 서버가 없다.
// 소켓 어댑터·표본·변환·상태 판정은 서버 코드(server/src)를 그대로 쓰고, 여기는 시계와 봉 조회만 덧붙인다.
import { PrimaryAdapter, type SocketFactory } from '../../../server/src/shared';
import { marketDefs } from '../../engine/data';
import type { Bar, Feed, Tick } from '../../engine/feed/types';
import type { MarketStatus } from '../../engine/types';
import type { HelloMsg } from '../protocol';
import { avgOf, fetchCandles, regroup, secondsOf, toBars, volMeans, type CandleSet } from './candles';
import { COINS, INDEX_ID, INDEX_MEMBERS, SOCKET_URL } from './config';
import { LiveCore } from './core';
import { flyCandles, flySeconds } from '../../engine/feed/fly';
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
  /** 저장에서 이어 갈 때(U-55): 마지막 틱 번호, 그때의 가상 가격과 실제 값. 첫 값이 붙으면 그 사이 움직임을 값에 싣고 1분 봉으로 메운다 */
  resume?: HlResume;
}
export interface HlResume { n: number; prices: Record<string, number>; mids: Record<string, number> }
/** 이어 가기를 기다리는 가장 긴 시간(ms): 그 안에 첫 값이 안 붙으면 이어 가기를 버리고 저장된 값에서 그대로 간다 */
export const RESUME_WAIT_MS = 15000;
export interface Warm { hello: HelloMsg; history: Record<string, number[]>; /** 지난 하루의 1분 봉(가상 가격). 시세면이 읽는다 */ day: Record<string, { t: number; o: number; h: number; l: number; c: number }[]> }

const TRADABLE: Record<string, string> = Object.fromEntries(
  marketDefs.filter((m) => m.id !== INDEX_ID && !m.synthetic).map((m) => [m.id, m.id] as const),
); // 내부 키가 곧 시장 id (sources 의 DTC BTH SMS MDT). 날다람쥐코인(FLY)은 출처가 없다: 값은 시각의 함수(engine/feed/fly.ts)
const SYNTH = marketDefs.filter((m) => m.synthetic).map((m) => m.id);
/** 출처가 없는 종목의 1분 봉: 시각의 함수에서 바로 셈한다 */
function synthBars(fromSec: number, toSec: number): Bar[] {
  if (!SYNTH.length || toSec < fromSec) return [];
  return flyCandles(fromSec, toSec).map((c) => ({ market: SYNTH[0], n0: Math.round(c.t / 1000), o: c.o, h: c.h, l: c.l, c: c.c, vol: 1, buy: 0.5, st: 'open' as MarketStatus }));
}

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
  private resume: HlResume | null;
  private resumeSince = 0;
  /** 저장에서 이어 가는 중(첫 값이 붙어 떠난 사이를 메우기 전): 이 동안의 틱은 게임에 넣지 않는다 */
  resuming: boolean;

  constructor(opts: HlOpts) {
    this.o = { now: () => Date.now(), replayMaxTicks: 60, ...opts };
    const sp = opts.resume?.prices ?? {};
    this.core = new LiveCore(marketDefs.map((m) => ({ id: m.id, startPrice: sp[m.id] > 0 ? sp[m.id] : m.startPrice, synthetic: m.synthetic })), this.o.now());
    this.resume = opts.resume ?? null;
    this.resuming = !!this.resume;
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
  /** 이어 가기를 버린다(연습 시세로 내려갈 때) */
  dropResume(): void { this.resume = null; this.resuming = false; }
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
    const b60 = [...this.convert(cs, from > 0 && this.lastN !== null && from === this.lastN + 1 ? 'forward' : 'end'), ...synthBars(from - 59, to)].filter((b) => b.n0 >= from - 59 && b.n0 <= to).sort((a, b) => a.n0 - b.n0);
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
    const nowSec = Math.floor(nowMs / 1000);
    const b60 = [...this.convert(cs, 'end'), ...synthBars(nowSec - 24 * 3600, nowSec - 60)].sort((a, b) => a.n0 - b.n0);
    const b180 = regroup(b60, 180);
    const ids = marketDefs.map((m) => m.id);
    // 준비 봉(정산 봉)은 1분 봉 그대로(U-47: 정산이 60초다). '평소' 값(range180)은 3분 봉으로 잰다
    const rows: Record<string, number[][]> = {};
    for (const id of ids) rows[id] = b60.filter((b) => b.market === id).slice(-480).map((b) => [b.n0, b.o, b.h, b.l, b.c, b.vol, b.buy]);
    const history: Record<string, number[]> = {};
    for (const id of ids) history[id] = SYNTH.includes(id) ? flySeconds(nowSec - 1, 600) : secondsOf(b60.filter((b) => b.market === id), 600);
    const day: Warm['day'] = {};
    for (const id of ids) day[id] = b60.filter((b) => b.market === id).map((b) => ({ t: b.n0 * 1000, o: b.o, h: b.h, l: b.l, c: b.c }));
    const n = this.lastN ?? Math.floor(nowMs / 1000);
    return {
      hello: { t: 'hello', n, ts: n, epoch: 0, st: this.core.status, markets: ids, warm: { res: 60, bars: rows }, avg: avgOf(b60, b180, ids) },
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
      if (this.resume) {
        if (!this.resumeSince) this.resumeSince = nowMs;
        if (this.core.anchored) { const r = this.resume; this.resume = null; await this.resumeFrom(r, cur); this.resuming = false; }
        else if (nowMs - this.resumeSince > RESUME_WAIT_MS) this.dropResume();
      }
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

  /** 저장에서 이어 간다(U-55): 떠날 때의 실제 값과 지금 값의 비로 가상 가격을 옮기고, 그 사이 1분 봉을 gapHandler 로 넘긴다(엔진 따라잡기) */
  private async resumeFrom(r: HlResume, cur: number): Promise<void> {
    const rb = this.core.rebaser;
    const now = this.core.lastMids;
    for (const [id, key] of Object.entries(TRADABLE)) {
      if (r.mids[key] > 0 && now[key] > 0 && r.prices[id] > 0) rb.vprice[id] = r.prices[id] * (now[key] / r.mids[key]);
    }
    const rets = INDEX_MEMBERS.filter((k) => r.mids[k] > 0 && now[k] > 0).map((k) => now[k] / r.mids[k] - 1);
    if (rets.length && r.prices[INDEX_ID] > 0) rb.vprice[INDEX_ID] = r.prices[INDEX_ID] * (1 + rets.reduce((a, b) => a + b, 0) / rets.length);
    const from = r.n + 1;
    const to = cur - 1;
    if (to - from + 1 < this.o.replayMaxTicks) return; // 짧게 비웠다: 다음 틱이 값을 잇는다
    let bars: Bar[] = [];
    if (Object.keys(r.mids).length) {
      try {
        const cs = await fetchCandles(this.o.post, from * 1000 - 60000, (to + 1) * 1000);
        bars = toBars(cs, { tradable: TRADABLE, k: this.core.scale(TRADABLE), means: this.means.DTC ? this.means : volMeans(cs), anchor: { kind: 'forward', base: r.prices[INDEX_ID] ?? rb.vprice[INDEX_ID], prev: r.mids } });
      } catch { /* 봉을 못 받았다: 날다람쥐만 메운다 */ }
    }
    bars = [...bars, ...synthBars(from - 59, to)].filter((b) => b.n0 >= from - 59 && b.n0 <= to).sort((a, b) => a.n0 - b.n0);
    await this.gapHandler?.(from, to, bars);
  }

  private set(p: Partial<HlStatus>): void {
    const next = { ...this.status, ...p };
    if (next.conn === this.status.conn && next.market === this.status.market && next.everConnected === this.status.everConnected) { this.status = next; return; }
    this.status = next;
    for (const cb of [...this.statusSubs]) cb(next);
  }
}

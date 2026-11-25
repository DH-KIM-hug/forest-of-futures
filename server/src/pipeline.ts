// 표본 → 선택 → 변환 → 기록 → 봉. 시계(nowMs)는 밖에서 넣는다. 앱으로 나가는 값은 onTick 의 TickRecord(가상 가격)뿐이다.
import type { MarketCfg, SourcesConfig } from './config.ts';
import { Sampler, VolumeNorm } from './sampler.ts';
import { SourceSelector, maxReturnDiff, type SelectorOpts } from './selector.ts';
import { Rebaser } from './transform.ts';
import { BarBuilder } from './bars.ts';
import type { TickStore } from './store.ts';
import type { Cell, MarketStatus, RawEvent, SourceId, TickRecord } from './types.ts';

export interface PipelineDeps {
  store: TickStore;
  markets: MarketCfg[];
  sources: SourcesConfig;
  epoch: number; // 초: n = floor(nowMs/1000) - epoch
  startedAt: number; // ms
  selector?: Partial<SelectorOpts>;
  onTick?: (t: TickRecord) => void;
  onLog?: (msg: string) => void;
}

export class Pipeline {
  readonly samplers: Record<SourceId, Sampler> = { primary: new Sampler(), secondary: new Sampler() };
  readonly selector: SourceSelector;
  readonly rebaser: Rebaser;
  readonly bars60 = new BarBuilder(60);
  readonly bars180 = new BarBuilder(180);
  private vol = new VolumeNorm();
  private prevMid: Record<SourceId, Record<string, number>> = { primary: {}, secondary: {} };
  private nextN: number | null = null;
  private status: MarketStatus = 'delayed';
  private src: SourceId = 'primary';
  private d: PipelineDeps;
  last: TickRecord | null = null;
  tickCount = 0;
  readonly marketIds: string[];

  constructor(deps: PipelineDeps) {
    this.d = deps;
    this.marketIds = deps.markets.map((m) => m.id);
    const idx = deps.sources.index.id;
    const start: Record<string, number> = {};
    for (const m of deps.markets) start[m.id] = m.startPrice;
    this.selector = new SourceSelector(deps.startedAt, deps.selector);
    this.selector.onAlert = (m) => this.log(`ALERT ${m}`);
    // 저장된 마지막 틱에서 이어 간다(재시작 뒤: 멈추기 직전 가격에서 이어 붙임)
    const last = deps.store.lastTick();
    if (last) {
      for (const [k, c] of Object.entries(last.p)) if (k in start) start[k] = c[0];
      this.nextN = last.n + 1;
      this.last = last;
      const from = Math.floor(last.n / 180) * 180;
      for (const t of deps.store.ticksBetween(from, last.n)) {
        this.bars60.add(t);
        this.bars180.add(t);
      }
    }
    this.rebaser = new Rebaser(start, idx, { primary: deps.sources.index.primaryMembers, secondary: deps.sources.index.secondaryMembers });
    for (const k of deps.sources.volumeKeys) {
      const rows = deps.store.recentRaw(3600);
      const vals = rows.map((r) => r.vols[k] ?? 0);
      if (vals.length) this.vol.seed(k, vals.reduce((a, b) => a + b, 0) / vals.length, vals.length);
    }
  }

  private log(m: string) {
    this.d.onLog?.(m);
  }
  nOf(nowMs: number): number {
    return Math.floor(nowMs / 1000) - this.d.epoch;
  }
  currentStatus(): MarketStatus {
    return this.status;
  }
  activeSource(): SourceId {
    return this.src;
  }

  ingest(src: SourceId, e: RawEvent, nowMs: number): void {
    this.samplers[src].ingest(e, nowMs);
  }
  setSecondaryUnavailable(v: boolean): void {
    this.samplers.secondary.unavailable = v;
  }

  /** 시계가 흐른 만큼 틱을 만든다(밀린 초는 채운다). 만든 틱을 돌려준다. */
  tick(nowMs: number): TickRecord[] {
    const cur = this.nOf(nowMs);
    if (this.nextN === null) this.nextN = cur;
    const out: TickRecord[] = [];
    while (this.nextN <= cur) {
      const n = this.nextN++;
      out.push(cur - n > 5 ? this.haltedFill(n) : this.liveTick(n, nowMs));
    }
    return out;
  }

  /** 서버가 꺼져 있던(또는 크게 밀린) 구간: 직전 가격을 그대로, 상태 halted. */
  private haltedFill(n: number): TickRecord {
    const prev = this.last;
    const p: Record<string, Cell> = {};
    for (const id of this.marketIds) p[id] = [prev?.p[id]?.[0] ?? this.rebaser.vprice[id], 0, 0.5];
    this.status = 'halted';
    this.rebaser.reanchor({}); // 다시 열 때 첫 표본에서 앵커
    return this.emit({ n, ts: n + this.d.epoch, st: 'halted', src: this.src, p }, {}, {});
  }

  private liveTick(n: number, nowMs: number): TickRecord {
    const sp = this.samplers.primary.drain();
    const ss = this.samplers.secondary.drain();
    const retP = this.returns('primary', sp.mids);
    const retS = this.returns('secondary', ss.mids);
    const thr = this.d.selector?.divergeThreshold ?? 0.005;
    const diverged = maxReturnDiff(retP, retS) >= thr;
    const sel = this.selector.update(nowMs, this.samplers.primary, this.samplers.secondary, diverged);
    const wasOpen = this.status === 'open';
    const reopening = sel.status === 'open' && (!wasOpen || sel.switched);
    if (sel.switched) this.log(`source switch -> ${sel.active} (${sel.reason})`);
    if (sel.status !== this.status) this.log(`status ${this.status} -> ${sel.status}`);
    this.status = sel.status;
    this.src = sel.active;
    const d = sel.active === 'primary' ? sp : ss;
    if (reopening) this.rebaser.reanchor(d.mids);
    const p: Record<string, Cell> = {};
    if (sel.status === 'open') {
      this.rebaser.step(d.mids, sel.active);
      const idxId = this.d.sources.index.id;
      const mem = (sel.active === 'primary' ? this.d.sources.index.primaryMembers : this.d.sources.index.secondaryMembers);
      const vi: Record<string, number> = {};
      const bi: Record<string, number> = {};
      for (const k of this.d.sources.volumeKeys) {
        vi[k] = this.vol.index(k, d.vol[k] ?? 0);
        bi[k] = (d.vol[k] ?? 0) > 0 ? (d.buyVol[k] ?? 0) / d.vol[k] : -1;
      }
      for (const m of this.d.markets) {
        if (m.id === idxId) {
          const vs = mem.map((k) => vi[k]).filter((x) => x !== undefined);
          const bs = mem.map((k) => bi[k]).filter((x) => x !== undefined && x >= 0);
          p[m.id] = [this.rebaser.vprice[m.id], vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 1, bs.length ? bs.reduce((a, b) => a + b, 0) / bs.length : 0.5];
        } else {
          p[m.id] = [this.rebaser.vprice[m.id], vi[m.id] ?? 1, bi[m.id] !== undefined && bi[m.id] >= 0 ? bi[m.id] : 0.5];
        }
      }
    } else {
      for (const m of this.d.markets) p[m.id] = [this.rebaser.vprice[m.id], 0, 0.5];
    }
    return this.emit({ n, ts: n + this.d.epoch, st: sel.status, src: sel.active, p }, d.mids, d.vol);
  }

  private returns(src: SourceId, mids: Record<string, number>): Record<string, number> {
    const prev = this.prevMid[src];
    const r: Record<string, number> = {};
    for (const [k, m] of Object.entries(mids)) {
      if (prev[k] !== undefined) r[k] = m / prev[k] - 1;
      prev[k] = m;
    }
    return r;
  }

  private emit(t: TickRecord, mids: Record<string, number>, vols: Record<string, number>): TickRecord {
    const st = this.d.store;
    st.insertTick(t);
    if (Object.keys(mids).length) st.insertRaw(t.n, t.src, mids, vols);
    for (const b of this.bars60.add(t)) st.insertBar(60, b);
    for (const b of this.bars180.add(t)) st.insertBar(180, b);
    this.last = t;
    this.tickCount += 1;
    if (t.n % 3600 === 0) st.prune(t.ts, this.d.epoch);
    this.d.onTick?.(t);
    return t;
  }
}

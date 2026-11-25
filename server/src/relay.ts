// 조립: 설정 → 저장소 → 파이프라인 → 어댑터 → 허브. index.ts 와 테스트(가짜 어댑터)가 함께 쓴다.
import WebSocket from 'ws';
import { loadMarkets, loadSources, type Config } from './config.ts';
import { DexAdapterStub, HyperliquidAdapter, type SocketFactory } from './hyperliquid.ts';
import { Pipeline } from './pipeline.ts';
import { createHub, type Hub } from './server.ts';
import { TickStore } from './store.ts';
import type { SourceAdapter } from './types.ts';
import type { Ctx } from './http.ts';

export interface Relay {
  pipeline: Pipeline;
  store: TickStore;
  hub: Hub;
  ctx: Ctx;
  adapters: SourceAdapter[];
  start(): Promise<number>; // 포트
  stop(): Promise<void>;
}

export interface RelayOpts {
  cfg: Config;
  adapters?: SourceAdapter[]; // 주입하면 기본 어댑터 대신 쓴다(테스트)
  socketFactory?: SocketFactory;
  nowMs?: () => number;
  log?: (m: string) => void;
}

export function createRelay(o: RelayOpts): Relay {
  const { cfg } = o;
  const log = o.log ?? ((m) => cfg.log && console.log(`[relay] ${m}`));
  const nowMs = o.nowMs ?? (() => Date.now());
  const sources = loadSources(cfg.sourcesPath);
  if (cfg.primaryUrl) sources.primary.url = cfg.primaryUrl;
  const markets = loadMarkets(cfg.marketsPath);
  const store = new TickStore(cfg.dbPath);
  let epoch = Number(store.getMeta('tickEpoch'));
  if (!epoch) {
    epoch = cfg.tickEpoch ?? Math.floor(nowMs() / 1000) - 1;
    store.setMeta('tickEpoch', String(epoch));
  }
  let hub: Hub;
  const pipeline = new Pipeline({ store, markets, sources, epoch, startedAt: nowMs(), onLog: log, onTick: (t) => hub?.broadcast(t) });
  const ctx: Ctx = { store, pipeline, markets: markets.map((m) => m.id), epoch, nowMs };
  hub = createHub(ctx, cfg.corsOrigin);

  const factory: SocketFactory = o.socketFactory ?? ((url) => new WebSocket(url) as unknown as ReturnType<SocketFactory>);
  const adapters: SourceAdapter[] = o.adapters ?? [
    new HyperliquidAdapter({ url: sources.primary.url, coins: sources.primary.coins, socketFactory: factory }),
    new DexAdapterStub(),
  ];
  for (const a of adapters) a.onEvent((e) => pipeline.ingest(a.id, e, nowMs()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const loop = () => {
    if (!running) return;
    pipeline.tick(nowMs());
    timer = setTimeout(loop, 1000 - (nowMs() % 1000) + 20);
  };

  return {
    pipeline, store, hub, ctx, adapters,
    async start() {
      for (const a of adapters) {
        try {
          a.start();
        } catch (err) {
          log(`source ${a.id} unavailable: ${(err as Error).message}`);
          if (a.id === 'secondary') pipeline.setSecondaryUnavailable(true);
        }
      }
      if (cfg.disableSecondary) pipeline.setSecondaryUnavailable(true);
      running = true;
      loop();
      return new Promise<number>((resolve) => hub.server.listen(cfg.port, cfg.host, () => resolve((hub.server.address() as any).port)));
    },
    async stop() {
      running = false;
      clearTimeout(timer);
      for (const a of adapters) a.stop();
      await hub.close();
      store.close();
    },
  };
}

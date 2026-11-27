// M6 통합: 진짜 로컬 서버(가짜 출처 어댑터) + 진짜 WebSocket/HTTP + ServerFeed. Hyperliquid 에는 붙지 않는다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { createRelay, type Relay } from '../src/relay.ts';
import { ServerFeed } from '../../src/net/serverFeed.ts';
import { attachServerFeed } from '../../src/net/session.ts';
import { createGame } from '../../src/engine/game.ts';
import { marketsPath, sourcesPath, FakeSource, RAW } from './helpers.ts';
import type { GameState } from '../../src/engine/types.ts';
import type { Tick } from '../../src/engine/feed/types.ts';

let relay: Relay;
let src: FakeSource;
let base: string;
let driver: ReturnType<typeof setInterval>;

beforeAll(async () => {
  src = new FakeSource('primary');
  const sec = new FakeSource('secondary');
  const cfg = { ...loadConfig({ QUIET: '1', PORT: '0', HOST: '127.0.0.1', DB_PATH: ':memory:' }), sourcesPath, marketsPath, port: 0 };
  relay = createRelay({ cfg, adapters: [src, sec], log: () => {} });
  // 지난 시간의 1분 봉을 미리 넣어 둔다(오프라인 따라잡기용)
  const n = relay.pipeline.nOf(Date.now());
  for (let k = 1; k <= 30; k++) for (const m of relay.ctx.markets) relay.store.insertBar(60, { market: m, n0: Math.floor((n - 3600) / 60) * 60 + k * 60, o: 100, h: 101, l: 99, c: 100, vol: 1, buy: 0.5, st: 0 });
  const port = await relay.start();
  base = `http://127.0.0.1:${port}`;
  let i = 0;
  driver = setInterval(() => { i++; for (const k of Object.keys(RAW)) src.mid(k, (RAW as any)[k] * (1 + Math.sin(i / 3) * 1e-3)); }, 200);
});
afterAll(async () => { clearInterval(driver); await relay.stop(); });

describe('M6 로컬 서버 통합', () => {
  it('AC-v2-142/138 ServerFeed 가 실제 WS 로 틱을 받고 엔진이 그대로 돈다, 받은 메시지에 원본이 없다', async () => {
    const feed = new ServerFeed({ baseUrl: base });
    const ticks: Tick[] = [];
    feed.subscribe((t) => ticks.push(t));
    let g: GameState = createGame({ seed: 1 });
    const sess = attachServerFeed(feed, { get: () => g, set: (x) => { g = x; } });
    feed.connect();
    await new Promise<void>((resolve, reject) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (ticks.length >= 3) { clearInterval(iv); resolve(); }
        else if (Date.now() - t0 > 8000) { clearInterval(iv); reject(new Error('틱이 안 옴')); }
      }, 100);
    });
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i].n).toBe(ticks[i - 1].n + 1);
    expect(Object.keys(ticks[0].p).sort()).toEqual(['BTH', 'DTC', 'JQQ', 'MDT', 'SMS']);
    expect(g.run.lastSeenTick).toBe(ticks[ticks.length - 1].n);
    expect(g.run.marketStatus).toBe('open');
    expect(g.run.mkt.avgFromServer).toBe(true); // hello 의 평소 값이 들어갔다
    const all = [JSON.stringify(ticks), await (await fetch(`${base}/v1/time`)).text(), await (await fetch(`${base}/healthz`)).text()].join('');
    for (const v of Object.values(RAW)) expect(all).not.toContain(String(Math.floor(v)));
    expect(all).not.toMatch(/BTC|ETH|SOL|DOGE|XRP|hyperliquid/i);
    sess.detach();
    feed.disconnect();
  }, 15000);

  it('서버 봉으로 따라잡기: /v1/bars 를 ServerFeed.bars 로 받는다', async () => {
    const feed = new ServerFeed({ baseUrl: base });
    const now = await feed.now();
    expect(now.st).toMatch(/open|delayed/);
    const bars = await feed.bars(60, now.n - 7200, now.n);
    expect(bars.length).toBe(30 * 5);
    expect(bars[0]).toMatchObject({ o: 100, h: 101, l: 99, st: 'open' });
  });

  it('붙을 수 없으면 down 으로 백오프 재연결을 시도한다', async () => {
    const feed = new ServerFeed({ baseUrl: 'http://127.0.0.1:1' }); // 아무도 안 듣는 포트
    feed.connect();
    await new Promise((r) => setTimeout(r, 1500));
    expect(feed.status.everConnected).toBe(false);
    expect(feed.status.conn).toBe('down');
    expect(feed.nextDelayMs).toBeGreaterThan(0);
    feed.disconnect();
  });
});

describe('AC-v2-138 앱 번들에 시세 출처 주소·실제 종목 이름이 없다', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|json|html|css)$/.test(f) ? [p] : [];
  });
  const root = fileURLToPath(new URL('../../', import.meta.url));
  it('src·data·index.html', () => {
    const files = [...walk(join(root, 'src')), ...walk(join(root, 'data')), join(root, 'index.html')];
    expect(files.length).toBeGreaterThan(30);
    const bad = /hyperliquid|binance|uniswap|orca\.so|raydium|\b(BTC|ETH|SOL|DOGE|XRP)\b|wss?:\/\/|https?:\/\//i;
    const hits: string[] = [];
    for (const f of files) {
      const m = readFileSync(f, 'utf8').match(bad);
      if (m) hits.push(`${f.replace(root, '')}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });
  it('앱이 네트워크를 여는 곳은 두 군데뿐이다: ServerFeed(게임 서버)와 시제품 직결 시세의 io.ts(주소는 서버 설정 파일에서 읽음)', () => {
    // 의도는 그대로다: 연결을 여는 코드가 흩어지지 않고, 주소·종목 이름 문자열이 src 에 없다(위 테스트). 시제품(GitHub Pages)은 서버가 없어서 io.ts 가 하나 더 있다.
    const files = walk(join(root, 'src')).filter((f) => !f.includes('/engine/'));
    const users = files.filter((f) => /\bfetch\(|new WebSocket\(|fetchFn\(|wsFactory\(/.test(readFileSync(f, 'utf8')));
    // 전광판(랭킹 Worker, U-45)과 말하는 곳 rankingIo.ts 가 하나 더 있다(주소는 ranking/client.json 에서 읽는다)
    expect(users.map((f) => f.replace(root, '')).sort()).toEqual(['src/net/hlDirect/io.ts', 'src/net/rankingIo.ts', 'src/net/serverFeed.ts']);
  });
});

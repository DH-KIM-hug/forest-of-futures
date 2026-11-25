// 짧은 실연결 확인(기본 20초). 가상 값과 개수만 출력한다 — 실제 가격은 출력하지 않는다.
import { loadConfig } from '../src/config.ts';
import { createRelay } from '../src/relay.ts';
import { HyperliquidAdapter } from '../src/hyperliquid.ts';

const secs = Number(process.argv[2] ?? 20);
const cfg = { ...loadConfig(), dbPath: ':memory:', port: 0, host: '127.0.0.1', log: false };
const relay = createRelay({ cfg });
const port = await relay.start();
const hl = relay.adapters[0] as HyperliquidAdapter;
let msgs = 0, ticks = 0, hello = false;
let first: any = null, last: any = null;
const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/stream`);
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data));
  msgs += 1;
  if (m.t === 'hello') { hello = true; console.log(`hello: markets=${m.markets.join(',')} warmBarsDTC=${m.warm.bars.DTC.length} st=${m.st}`); }
  else { ticks += 1; first ??= m; last = m; }
};
await new Promise((r) => setTimeout(r, secs * 1000));
const fmt = (m: any) => `n+${m.n - first.n} st=${m.st} ` + Object.entries(m.p).map(([k, c]: any) => `${k}=${c[0]}`).join(' ');
console.log(`ws messages=${msgs} ticks=${ticks} hello=${hello}`);
console.log(`hl: connects=${hl.connects} messages=${hl.messages}`);
if (first) { console.log('first:', fmt(first)); console.log('last :', fmt(last)); }
const h: any = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
console.log('healthz:', JSON.stringify({ ...h, n: undefined }));
const tk: any = await (await fetch(`http://127.0.0.1:${port}/v1/ticks?from=${first.n}&to=${last.n}`)).json();
console.log(`rest ticks returned=${tk.ticks.length}`);
ws.close();
await relay.stop();
process.exit(0);

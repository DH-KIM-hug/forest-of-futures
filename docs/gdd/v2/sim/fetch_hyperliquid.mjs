#!/usr/bin/env node
// 선물의 숲 v2 — 시뮬레이션용 시세 기록 받기 (Hyperliquid 공개 API, 키 없음)
// 실행: node docs/gdd/v2/sim/fetch_hyperliquid.mjs [1m|3m] → data/hl_<간격>.json  (기본 3m = 정산 주기와 같다)
// 받는 것: candleSnapshot 1분봉(가장 짧은 간격) × 5종목 × 최대 5,000개(약 3.5일). 다섯 종목의 시각이 같다(같이 움직이는 성질이 남는다).
// 남기는 것: 각 종목 첫 시가 대비 로그 가격 × 1e6 (시가·고가·저가·종가), 거래량(평균=100). 가격 수준과 날짜는 버린다.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = dirname(fileURLToPath(import.meta.url));
const COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP']; // 넷째 자리: BNB → DOGE [사용자 확정 2026-11-25 "도지 하나 섞자"]
const IV = process.argv[2] === '1m' ? '1m' : '3m', STEP = IV === '1m' ? 60000 : 180000;
const end = Date.now() - STEP, start = end - 5000 * STEP;
const raw = {};
for (const coin of COINS) {
  const r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: IV, startTime: start, endTime: end } }) });
  if (!r.ok) throw new Error(`${coin} ${r.status}`);
  raw[coin] = await r.json(); console.log(coin, raw[coin].length);
}
// 다섯 종목 모두에 있는 분만 남긴다
const common = COINS.map((c) => new Set(raw[c].map((k) => k.t))).reduce((a, b) => new Set([...a].filter((x) => b.has(x))));
const ts = [...common].sort((a, b) => a - b);
const out = { source: `Hyperliquid candleSnapshot ${IV} (무기한 선물)`, unit: 'o,h,l,c: ln(가격/첫 시가) × 1e6, v: 거래량(종목 평균=100)', minutes: ts.length, coins: {} };
COINS.forEach((coin, i) => {
  const m = new Map(raw[coin].map((k) => [k.t, k])); const p0 = Number(m.get(ts[0]).o);
  const f = (x) => Math.round(Math.log(Number(x) / p0) * 1e6);
  const rows = ts.map((t) => m.get(t)); const mv = rows.reduce((a, k) => a + Number(k.v), 0) / rows.length || 1;
  out.coins['C' + (i + 1)] = { o: rows.map((k) => f(k.o)), h: rows.map((k) => f(k.h)), l: rows.map((k) => f(k.l)), c: rows.map((k) => f(k.c)), v: rows.map((k) => Math.round(Number(k.v) / mv * 100)) };
});
writeFileSync(join(DIR, 'data', `hl_${IV}.json`), JSON.stringify(out));
console.log('minutes', ts.length);

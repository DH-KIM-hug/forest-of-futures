// 선물의 숲 랭킹 Worker(Cloudflare Workers + D1).
// GET  /top?board=networth|roe|pnl&limit=50  → [{rank,name,value,detail,at}]
// GET  /me?board=…&deviceId=…                 → 내 기록과 순위
// POST /submit {deviceId,name,board,value,detail} → 검사 뒤 기기당 최고 기록만 남긴다
import { flyCandlesVerified } from './flyVersions';
import { BOARDS, LIMITS, REAL, SYNTH, checkLifeAgainstCandles, checkLifeShape, checkTradeAgainstCandles, checkTradeShape, parseSubmit, type Board, type Candle, type LifeDetail, type TradeDetail } from './verify';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
}

const HL_INFO = 'https://api.hyperliquid.xyz/info';

function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0],
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  };
}
const json = (data: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...h } });

/** 게임 종목의 1분 봉(from · to 는 ms). 날다람쥐코인(FLY)은 시각의 함수로 셈하고(바꾼 시각 앞은 1판, flyVersions.ts), 나머지는 실제 시세(Hyperliquid)에서 받는다 */
async function marketCandles(market: string, from: number, to: number): Promise<Candle[]> {
  if (SYNTH[market]) return flyCandlesVerified(Math.floor(from / 1000), Math.floor(to / 1000)).filter((c) => c.t <= to);
  return candles(REAL[market], from, to);
}

async function candles(coin: string, from: number, to: number): Promise<Candle[]> {
  const start = Math.floor(from / 60000) * 60000;
  const r = await fetch(HL_INFO, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: '1m', startTime: start, endTime: to } }),
  });
  if (!r.ok) return [];
  const arr = (await r.json()) as { t: number; h: string; l: string }[];
  return arr.map((c) => ({ t: c.t, h: Number(c.h), l: Number(c.l) })).filter((c) => c.t <= to);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/top') {
      const board = url.searchParams.get('board') as Board;
      if (!BOARDS.includes(board)) return json({ error: 'board' }, 400, h);
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
      const rs = await env.DB.prepare('SELECT name, value, detail, created_at FROM scores WHERE board = ? ORDER BY value DESC, created_at ASC LIMIT ?').bind(board, limit).all();
      const rows = (rs.results ?? []).map((r: any, i: number) => ({ rank: i + 1, name: r.name, value: r.value, detail: JSON.parse(r.detail), at: r.created_at }));
      return json({ board, rows }, 200, { ...h, 'cache-control': 'public, max-age=15' });
    }

    if (req.method === 'GET' && url.pathname === '/me') {
      const board = url.searchParams.get('board') as Board;
      const device = url.searchParams.get('deviceId') ?? '';
      if (!BOARDS.includes(board) || !device) return json({ error: 'args' }, 400, h);
      const mine = await env.DB.prepare('SELECT name, value, detail, created_at FROM scores WHERE board = ? AND device = ?').bind(board, device).first<any>();
      if (!mine) return json({ board, me: null }, 200, h);
      const above = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE board = ? AND value > ?').bind(board, mine.value).first<{ n: number }>();
      return json({ board, me: { rank: (above?.n ?? 0) + 1, name: mine.name, value: mine.value, detail: JSON.parse(mine.detail) } }, 200, h);
    }

    if (req.method === 'POST' && url.pathname === '/submit') {
      let body: unknown;
      try { body = await req.json(); } catch { return json({ ok: false, why: 'json' }, 400, h); }
      const p = parseSubmit(body);
      if (!p.ok) return json({ ok: false, why: p.why }, 400, h);
      const s = p.s;
      const now = Date.now();

      const last = await env.DB.prepare('SELECT last_at FROM submits WHERE device = ?').bind(s.deviceId).first<{ last_at: number }>();
      if (last && now - last.last_at < LIMITS.minIntervalMs) return json({ ok: false, why: 'tooSoon' }, 429, h);
      await env.DB.prepare('INSERT INTO submits (device, last_at) VALUES (?, ?) ON CONFLICT(device) DO UPDATE SET last_at = excluded.last_at').bind(s.deviceId, now).run();

      let why: string | null;
      if (s.board === 'networth') {
        const d = s.detail as LifeDetail;
        why = checkLifeShape(d, s.value, now);
        if (!why) {
          // 종목마다 봉을 한 번에 받는다(그 생의 첫 진입 ~ 마지막 정리, 최대 5,000봉 ≈ 3.5일). 그보다 오래된 거래는 봉이 없어 고비 보상 몫이 0 이다
          const byMarket = new Map<string, Candle[]>();
          // U-51: 진 거래의 봉도 받는다(고비 보상은 진 판에서도 받으니 상한에 그 몫을 셈한다)
          for (const m of new Set(d.trades.map((t) => t.market))) {
            const ts = d.trades.filter((t) => t.market === m);
            const from = Math.max(Math.min(...ts.map((t) => t.entryTs)), Math.max(...ts.map((t) => t.exitTs)) - 5000 * 60000);
            byMarket.set(m, await marketCandles(m, from, Math.max(...ts.map((t) => t.exitTs))));
          }
          why = checkLifeAgainstCandles(d, s.value, (t) => (byMarket.get(t.market) ?? []).filter((c) => c.t >= Math.floor(t.entryTs / 60000) * 60000 && c.t <= t.exitTs));
        }
      } else {
        const d = s.detail as TradeDetail;
        why = checkTradeShape(d, s.board, s.value, now);
        if (!why) why = checkTradeAgainstCandles(d, await marketCandles(d.market, d.entryTs, d.exitTs));
      }
      if (why) return json({ ok: false, why }, 422, h);

      const prev = await env.DB.prepare('SELECT value FROM scores WHERE board = ? AND device = ?').bind(s.board, s.deviceId).first<{ value: number }>();
      if (prev && prev.value >= s.value) {
        await env.DB.prepare('UPDATE scores SET name = ? WHERE board = ? AND device = ?').bind(s.name, s.board, s.deviceId).run();
        return json({ ok: true, kept: true, best: prev.value }, 200, h);
      }
      await env.DB.prepare('INSERT INTO scores (board, device, name, value, detail, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(board, device) DO UPDATE SET name = excluded.name, value = excluded.value, detail = excluded.detail, created_at = excluded.created_at')
        .bind(s.board, s.deviceId, s.name, s.value, JSON.stringify(s.detail), now).run();
      const above = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE board = ? AND value > ?').bind(s.board, s.value).first<{ n: number }>();
      return json({ ok: true, rank: (above?.n ?? 0) + 1 }, 200, h);
    }

    return json({ error: 'not found' }, 404, h);
  },
};

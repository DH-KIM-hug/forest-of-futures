// 제출 검사(순수 함수, 시험 가능). 서버는 계산하지 않고 "있을 수 있는 기록인가"만 본다.
// 거래 판(roe·pnl): 진입~정리 사이 실제 1분 봉의 최고·최저로 가능한 최대 유리 폭을 구하고,
// 주장한 수익률이 배율 × 그 폭(+여유)을 넘으면 거절한다.

export type Board = 'networth' | 'roe' | 'pnl';
export const BOARDS: Board[] = ['networth', 'roe', 'pnl'];

/** 게임 종목 → 실제 시세(Hyperliquid). 서버 안에서만 쓴다. */
export const REAL: Record<string, string> = { DTC: 'BTC', BTH: 'ETH', SMS: 'xyz:SMSN', MDT: 'DOGE', JQQ: 'xyz:XYZ100' };
/** 실제 시장이 없는 종목(U-47): 봉을 시각의 함수(src/engine/feed/fly.ts)로 다시 셈한다 */
export const SYNTH: Record<string, true> = { FLY: true };
/** 랭킹에 올릴 수 있는 종목인가 */
export const knownMarket = (m: string): boolean => !!REAL[m] || !!SYNTH[m];

export interface TradeDetail {
  market: string;
  dir: 1 | -1;
  lev: number;
  margin: number; // 도토리
  entryTs: number; // ms
  exitTs: number; // ms
  roe: number; // %, 수수료 포함 손익 ÷ 증거금
  pnl: number; // 도토리
}
export interface LifeDetail {
  lifeNo: number;
  settles: number;
  peak: number;
  /** 그 생의 끝난 거래 전부(이긴 것만 상한에 들어간다. 빠뜨려도 상한이 커지지 않는다). */
  trades: TradeDetail[];
  /** 라이트 생(U-59): 빚 40만, 손에 10만에서 연다. 생마다 같다 */
  lite?: boolean;
}
export interface Submit {
  deviceId: string;
  name: string;
  board: Board;
  value: number;
  detail: TradeDetail | LifeDetail;
}
export interface Candle { t: number; h: number; l: number }

export const LIMITS = {
  /** 별명 12글자 + 장부 번호 " #0417"(6글자). 게임이 번호를 붙여 보낸다 */
  nameMax: 18,
  maxLev: 200,
  maxMargin: 2e8,
  maxNetworth: 3e9, // 마을 사다리 꼭대기(30억)
  maxHoldMs: 7 * 24 * 3600e3,
  slackPct: 0.15, // 봉 사이 틈·수수료 반올림 여유(가격 폭 %p)
  minIntervalMs: 10_000,
};

export function cleanName(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  if (t.length < 1 || [...t].length > LIMITS.nameMax) return null;
  return t;
}

export function parseSubmit(body: unknown): { ok: true; s: Submit } | { ok: false; why: string } {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return { ok: false, why: 'body' };
  const deviceId = typeof b.deviceId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(b.deviceId) ? b.deviceId : null;
  if (!deviceId) return { ok: false, why: 'deviceId' };
  const name = cleanName(b.name);
  if (!name) return { ok: false, why: 'name' };
  const board = b.board as Board;
  if (!BOARDS.includes(board)) return { ok: false, why: 'board' };
  const value = Number(b.value);
  if (!Number.isFinite(value)) return { ok: false, why: 'value' };
  const d = b.detail as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return { ok: false, why: 'detail' };
  return { ok: true, s: { deviceId, name, board, value, detail: d as unknown as TradeDetail | LifeDetail } };
}

/** 거래 기록의 모양 검사(시세를 보기 전). */
export function checkTradeShape(d: TradeDetail, board: Board, value: number, now: number): string | null {
  if (!knownMarket(d.market)) return 'market';
  if (d.dir !== 1 && d.dir !== -1) return 'dir';
  if (!(d.lev >= 1 && d.lev <= LIMITS.maxLev)) return 'lev';
  if (!(d.margin > 0 && d.margin <= LIMITS.maxMargin)) return 'margin';
  if (!(d.entryTs > 0 && d.exitTs > d.entryTs && d.exitTs <= now + 60_000)) return 'time';
  if (d.exitTs - d.entryTs > LIMITS.maxHoldMs) return 'hold';
  if (!Number.isFinite(d.roe) || !Number.isFinite(d.pnl)) return 'num';
  if (d.roe <= 0 || d.pnl <= 0) return 'notWin';
  // pnl 과 roe 는 같은 증거금에서 나와야 한다(1% 여유)
  if (Math.abs(d.pnl - (d.margin * d.roe) / 100) > Math.max(2, d.margin * 0.01)) return 'pnlRoe';
  if (board === 'roe' && Math.abs(value - d.roe) > 1e-6) return 'value';
  if (board === 'pnl' && Math.abs(value - d.pnl) > 1e-6) return 'value';
  return null;
}

/** 진입~정리 사이 봉들로 가능한 최대 유리 폭(%). 롱: 최저에서 사서 최고에 판 폭, 숏: 반대. */
export function maxFavorablePct(candles: Candle[], dir: 1 | -1): number {
  if (!candles.length) return 0;
  let best = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    // 이 봉까지 나온 최저(롱)·최고(숏)에서 들어가 이 봉의 최고(롱)·최저(숏)에 나온다
    lo = Math.min(lo, c.l);
    hi = Math.max(hi, c.h);
    if (dir === 1) best = Math.max(best, (c.h / lo - 1) * 100);
    else best = Math.max(best, (1 - c.l / hi) * 100);
  }
  return best;
}

export function checkTradeAgainstCandles(d: TradeDetail, candles: Candle[]): string | null {
  if (!candles.length) return 'noCandles';
  const fav = maxFavorablePct(candles, d.dir);
  const cap = d.lev * (fav + LIMITS.slackPct);
  if (d.roe > cap) return `roeTooHigh(${d.roe.toFixed(2)} > ${cap.toFixed(2)})`;
  return null;
}

export const LIFE = {
  start: -300_000, // 첫 생: 엄마 빚 30만, 현금 0
  /** 둘째 생부터(U-46): 첫 생의 튜토리얼이 끝난 자리에서 시작한다 — 손에 10만, 빚 50만 */
  rebornStart: -400_000,
  /** 라이트(U-59, data/lite.json): 첫 생도 다음 생도 첫 대출을 받은 자리(빚 40만, 손에 10만)에서 연다. 쳇바퀴 · 알바가 없어 정산당 몫은 남는다.
   *  U-62: 엔딩 도감 5개의 덤으로 새 생의 손에 +1만까지(engine/liteFruit.ts) → −29만 */
  liteStart: -290_000,
  // U-47: 정산이 60초(튜토리얼 20초)가 되어 정산당 상한도 1/3
  mineMaxPerSettle: 17_000, // 쳇바퀴 6대 × 2,170 + 최대 탭(12회/초 × 60초 × 2) + 여유
  eventMaxPerSettle: 1_000, // 마을 사건(지원금 등) 평균 상한
  /** 고배율 축하금(나무 B3a): 이긴 거래 수익의 최대 몫(현금에 따로 얹힌다) */
  winBonusMax: 0.1,
  /** 고비 보상(나무 R, U-50): 들고 있는 판이 고비(+50%, 두 배 …)를 처음 넘을 때마다 넣은 돈의 몫(상한 1% + 2%). 진 판에서도 받는다 */
  popRateMax: 0.03,
  popAt: [50, 100, 200, 300, 500, 1000],
  maxTrades: 600,
  /** FRX 의뢰판 사례금(U-65, src/engine/questTip.ts QUEST_TIP.lifeMax): 한 생에 받는 사례금 합의 상한. 본편, 라이트 모두 */
  questMaxPerLife: 150_000,
};

/** 한 거래가 받을 수 있었던 고비 보상의 상한: 그 사이 봉으로 닿을 수 있었던 고비 수 × 넣은 돈 × 3%. 봉이 없으면 0(상한이 줄 뿐) */
export function popAllowance(t: TradeDetail, candles: Candle[]): number {
  if (!candles.length || !(t.margin > 0)) return 0;
  const reach = t.lev * (maxFavorablePct(candles, t.dir) + LIMITS.slackPct);
  return t.margin * LIFE.popRateMax * LIFE.popAt.filter((a) => a <= reach).length;
}

/** 한 생 재산: 모양 검사(시세 전). */
export function checkLifeShape(d: LifeDetail, value: number, now: number): string | null {
  if (!(value > 0 && value <= LIMITS.maxNetworth)) return 'networth';
  if (!(Number.isInteger(d.lifeNo) && d.lifeNo >= 1)) return 'lifeNo';
  if (!(Number.isInteger(d.settles) && d.settles >= 1 && d.settles <= 100_000)) return 'settles';
  if (!Array.isArray(d.trades) || d.trades.length > LIFE.maxTrades) return 'trades';
  for (const t of d.trades) {
    if (!knownMarket(t.market) || (t.dir !== 1 && t.dir !== -1) || !(t.lev >= 1 && t.lev <= LIMITS.maxLev)) return 'tradeShape';
    if (!(t.margin > 0 && t.margin <= LIMITS.maxMargin) || !(t.exitTs > t.entryTs && t.exitTs <= now + 60_000)) return 'tradeShape';
    if (!Number.isFinite(t.pnl) || !Number.isFinite(t.roe)) return 'tradeShape';
    if (t.pnl > 0 && Math.abs(t.pnl - (t.margin * t.roe) / 100) > Math.max(2, t.margin * 0.01)) return 'pnlRoe';
  }
  return null;
}

/** 이긴 거래마다 실제 봉으로 가능한지 보고, 재산 상한 = 시작 + 이긴 거래 합 × (1 + 축하금) + 거래마다 고비 보상 상한 + 정산 × (쳇바퀴 + 사건) + 의뢰 사례금 상한. */
export function checkLifeAgainstCandles(d: LifeDetail, value: number, candlesOf: (t: TradeDetail) => Candle[]): string | null {
  let wins = 0;
  let pops = 0;
  for (const t of d.trades) {
    const cs = candlesOf(t);
    pops += popAllowance(t, cs);
    if (t.pnl <= 0) continue;
    const why = checkTradeAgainstCandles(t, cs);
    if (why) return `trade:${why}`;
    wins += t.pnl;
  }
  const start = d.lite === true ? LIFE.liteStart : d.lifeNo >= 2 ? LIFE.rebornStart : LIFE.start;
  const bound = start + wins * (1 + LIFE.winBonusMax) + pops + d.settles * (LIFE.mineMaxPerSettle + LIFE.eventMaxPerSettle) + LIFE.questMaxPerLife;
  if (value > bound) return `tooHigh(${Math.round(value)} > ${Math.round(bound)})`;
  return null;
}

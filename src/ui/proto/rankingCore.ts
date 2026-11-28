// 전광판(랭킹, U-45)의 순수 부분: 제출 기록 만들기, 올려도 되는 거래 거르기, 한 생 재산 셈, 보내기 줄(재시도 · 10초 제한).
// 서버(ranking/src/verify.ts)가 검사하는 모양을 그대로 따른다. 화면 · 게임 상태는 모른다(ranking.ts 가 잇는다).

export type Board = 'networth' | 'roe' | 'pnl';
/** 판 순서(U-59 사용자: "최고 수익률, 최고 수익금, 최고 자산") */
export const BOARDS: Board[] = ['roe', 'pnl', 'networth'];
export const RANK_MARKETS = ['DTC', 'BTH', 'SMS', 'MDT', 'JQQ', 'FLY'] as const;

export interface TradeDetail {
  market: string;
  dir: 1 | -1;
  lev: number;
  margin: number;
  entryTs: number;
  exitTs: number;
  /** %, 수수료 포함 손익 ÷ 증거금 × 100 (결과 카드의 숫자와 같다) */
  roe: number;
  pnl: number;
}
export interface LifeDetail { lifeNo: number; settles: number; peak: number; trades: TradeDetail[]; /** 라이트 생(U-59): 서버가 시작 재산을 라이트 것(-30만)으로 잰다 */ lite?: true }

/** 포지션이 열릴 때 적어 두는 것(엔진 틱은 벽시계가 아니라서, 진입 시각은 화면 쪽이 적는다) */
export interface OpenMeta {
  /** 진입 때의 벽시계(ms) */ entryTs: number;
  /** 진입 때 실제 시세(실시간 직결)였나 */ real: boolean;
  /** 튜토리얼 거래(짜 둔 시세)였나 */ tutorial: boolean;
}
/** 닫힌 거래 하나(엔진 · 화면에서 모은 값) */
export interface ClosedTrade {
  market: string; dir: 1 | -1; lev: number; margin0: number; pnl: number;
  open: OpenMeta | null;
  /** 정리 때의 벽시계(ms) */ exitTs: number;
  /** 정리 때 실제 시세였나 */ realAtExit: boolean;
  /** 정리 때 튜토리얼 거래가 돌고 있었나 */ tutorialAtExit: boolean;
}

/** 이 거래를 전광판 셈에 넣어도 되나: 진입부터 정리까지 실제 시세, 튜토리얼 아님, 진입 시각을 안다. */
export function eligible(c: ClosedTrade): boolean {
  if (!c.open || !c.open.real || c.open.tutorial || !c.realAtExit || c.tutorialAtExit) return false;
  if (!(RANK_MARKETS as readonly string[]).includes(c.market)) return false;
  if (!(c.margin0 > 0) || !(c.lev >= 1) || !Number.isFinite(c.pnl)) return false;
  return c.exitTs > c.open.entryTs;
}

/** 거래 기록(서버 모양). pnl 은 도토리 단위로 반올림하고, roe 는 그 pnl 에서 다시 잰다(서버가 둘이 맞는지 본다). */
export function tradeDetail(c: ClosedTrade): TradeDetail {
  const pnl = Math.round(c.pnl);
  const margin = Math.round(c.margin0);
  return { market: c.market, dir: c.dir, lev: c.lev, margin, entryTs: Math.round(c.open!.entryTs), exitTs: Math.round(c.exitTs), roe: (pnl / margin) * 100, pnl };
}
/** 거래 판(roe · pnl)에 올릴 수 있는 이긴 거래인가 */
export const isWinningEntry = (c: ClosedTrade): boolean => eligible(c) && Math.round(c.pnl) > 0;

/** 한 생 재산(전광판의 셈) = 현금 + 지갑 시가 + 열린 포지션의 증거금 − 빚 전부. 설비 · 집 평가액은 넣지 않는다(서버 상한 = 번 돈만으로 잰다). */
export function lifeNetWorth(x: { cash: number; wallet: number; positionsMargin: number; debt: number }): number {
  return Math.floor(x.cash + x.wallet + x.positionsMargin - x.debt);
}

export const LIFE_MAX_TRADES = 600;
/** HL 1분 봉을 한 번에 받는 한도(서버가 그 생의 마지막 정리에서 이만큼 거슬러 받는다). 여유를 두고 자른다 */
const CANDLE_WINDOW_MS = 4900 * 60_000;
/** 한 생의 거래 목록: 이긴 것 먼저(큰 것부터) 600개까지. 서버가 봉을 못 받는 오래된 이긴 거래는 뺀다(빼면 상한이 줄 뿐 거절되지 않는다). */
export function lifeTrades(all: TradeDetail[]): TradeDetail[] {
  if (!all.length) return [];
  const lastExit = Math.max(...all.map((t) => t.exitTs));
  const wins = all.filter((t) => t.pnl > 0 && t.entryTs >= lastExit - CANDLE_WINDOW_MS).sort((a, b) => b.pnl - a.pnl);
  const losses = all.filter((t) => t.pnl <= 0);
  return [...wins, ...losses].slice(0, LIFE_MAX_TRADES);
}
export function lifeDetail(lifeNo: number, settles: number, peak: number, trades: TradeDetail[], lite = false): LifeDetail {
  const d: LifeDetail = { lifeNo, settles, peak: Math.floor(peak), trades: lifeTrades(trades) };
  if (lite) d.lite = true;
  return d;
}

// ── 보내기 줄 ──────────────────────────────────────────────────────────
export interface QueueItem { board: Board; value: number; detail: TradeDetail | LifeDetail; tries: number; nextAt: number; at: number; /** 이름만 고치려고 다시 보내는 것(거절돼도 세지 않는다) */ rename?: boolean }
export interface Rejected { board: Board; value: number; why: string; at: number }
export interface QueueState {
  items: QueueItem[];
  lastSentAt: number;
  /** 보낸 뒤 서버가 받은(또는 이미 더 좋은 것이 있던) 판마다의 값 */
  best: Partial<Record<Board, number>>;
  /** 마지막으로 안 내 순위 */
  rank: Partial<Record<Board, number>>;
  rejected: Rejected[];
  posts: number;
}
export const emptyQueue = (): QueueState => ({ items: [], lastSentAt: 0, best: {}, rank: {}, rejected: [], posts: 0 });

export const MIN_INTERVAL_MS = 10_500;
export const MAX_TRIES = 12;
/** 실패한 뒤 다시 보내기까지(15초, 30초, 1분 … 10분까지) */
export const backoffMs = (tries: number): number => Math.min(600_000, 15_000 * 2 ** Math.max(0, tries - 1));

/** 줄에 넣는다: 판마다 하나만 기다린다(서버는 기기당 최고만 남긴다). 이미 보낸 최고 · 기다리는 것보다 못하면 버린다. */
export function enqueue(q: QueueState, board: Board, value: number, detail: TradeDetail | LifeDetail, now: number): boolean {
  if (!Number.isFinite(value)) return false;
  if ((q.best[board] ?? -Infinity) >= value) return false;
  const i = q.items.findIndex((x) => x.board === board);
  if (i >= 0 && q.items[i].value >= value) return false;
  const item: QueueItem = { board, value, detail, tries: 0, nextAt: now, at: now };
  if (i >= 0) q.items[i] = item; else q.items.push(item);
  return true;
}

export interface SendResult { status: number; body: any }
export type Sender = (body: { deviceId: string; name: string; board: Board; value: number; detail: unknown }) => Promise<SendResult>;
export type PumpOutcome =
  | { kind: 'idle' } | { kind: 'wait'; ms: number }
  | { kind: 'ok'; board: Board; item: QueueItem; rank: number | null; prevRank: number | null; kept: boolean }
  | { kind: 'rejected'; board: Board; item: QueueItem; why: string }
  | { kind: 'retry'; board: Board; item: QueueItem; ms: number };

/** 줄의 맨 앞(보낼 때가 된 것)을 하나 보낸다. 서버 10초 제한을 지킨다. 돌려준 것에 따라 다음 펌프를 부르면 된다. */
export async function pumpOnce(q: QueueState, send: Sender, who: { deviceId: string; name: string }, now: () => number): Promise<PumpOutcome> {
  if (!q.items.length) return { kind: 'idle' };
  const t = now();
  const gap = q.lastSentAt + MIN_INTERVAL_MS - t;
  const ready = q.items.filter((x) => x.nextAt <= t).sort((a, b) => a.at - b.at)[0];
  if (!ready) return { kind: 'wait', ms: Math.max(gap, Math.min(...q.items.map((x) => x.nextAt)) - t) };
  if (gap > 0) return { kind: 'wait', ms: gap };
  q.lastSentAt = t;
  q.posts += 1;
  let r: SendResult;
  try {
    r = await send({ deviceId: who.deviceId, name: who.name, board: ready.board, value: ready.value, detail: ready.detail });
  } catch {
    r = { status: 0, body: null };
  }
  const drop = () => { q.items = q.items.filter((x) => x !== ready); };
  if (r.status === 200 && r.body?.ok) {
    drop();
    const prevRank = q.rank[ready.board] ?? null;
    q.best[ready.board] = Math.max(q.best[ready.board] ?? -Infinity, r.body.kept ? Number(r.body.best ?? ready.value) : ready.value);
    const rank = typeof r.body.rank === 'number' ? r.body.rank : null;
    if (rank !== null) q.rank[ready.board] = rank;
    return { kind: 'ok', board: ready.board, item: ready, rank, prevRank, kept: !!r.body.kept };
  }
  if (r.status === 429) {
    // 다른 판을 막 보냈다(이 기기의 10초): 기다렸다 그대로 다시
    ready.nextAt = now() + MIN_INTERVAL_MS;
    return { kind: 'retry', board: ready.board, item: ready, ms: MIN_INTERVAL_MS };
  }
  if (r.status === 400 || r.status === 422) {
    drop();
    const why = String(r.body?.why ?? r.status);
    if (!ready.rename) q.rejected = [...q.rejected, { board: ready.board, value: ready.value, why, at: now() }].slice(-30);
    return { kind: 'rejected', board: ready.board, item: ready, why };
  }
  // 그물이 끊겼거나 서버가 아프다: 조금씩 길게 기다렸다 다시
  ready.tries += 1;
  if (ready.tries >= MAX_TRIES) { drop(); return { kind: 'rejected', board: ready.board, item: ready, why: 'gaveUp' }; }
  const ms = backoffMs(ready.tries);
  ready.nextAt = now() + ms;
  return { kind: 'retry', board: ready.board, item: ready, ms };
}

// ── 전광판 글 ─────────────────────────────────────────────────────────
export const holdText = (ms: number): string => {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}초`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}시간${m % 60 ? ` ${m % 60}분` : ''}`;
  return `${Math.floor(h / 24)}일`;
};
/** 줄 아래 작은 글: "도토코인 200배 롱 3분" · "3번째 생 정산 41번" */
export function detailText(board: Board, d: any, marketName: (id: string) => string): string {
  if (!d || typeof d !== 'object') return '';
  if (board === 'networth') return `${d.lifeNo}번째 생 정산 ${d.settles}번`;
  return `${marketName(d.market)} ${d.lev}배 ${d.dir === 1 ? '롱' : '숏'} ${holdText(d.exitTs - d.entryTs)}`;
}
const commaN = (x: number): string => Math.round(x).toLocaleString('ko-KR');
export function valueText(board: Board, v: number): string {
  if (board === 'roe') return `+${v >= 1000 ? commaN(v) : v.toFixed(1)}%`;
  return commaN(v);
}
export const BOARD_LABEL: Record<Board, { tab: string; title: string; toast: string }> = {
  roe: { tab: '최고 수익률', title: '한 번의 거래로 가장 크게 불린 비율', toast: '수익률' },
  pnl: { tab: '최고 수익금', title: '한 번의 거래로 가장 많이 번 도토리', toast: '수익금' },
  networth: { tab: '최고 자산', title: '한 생에 가장 많이 모은 자산(빚을 뺀 것)', toast: '자산' },
};

/** 별명: 1~12글자, 꺾쇠 · 제어 문자는 뺀다. 서버(cleanName)는 장부 번호를 붙인 18글자까지 받는다 */
export const BASE_NAME_MAX = 12;
export function cleanName(s: string, max = BASE_NAME_MAX): string | null {
  const t = s.normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  if (t.length < 1 || [...t].length > max) return null;
  return t;
}
/** 장부 번호: 기기 번호에서 뽑은 네 자리(기기마다 늘 같다, &new=1 로도 바뀌지 않는다). 같은 별명을 가려 준다 */
export function ledgerNo(deviceId: string): string {
  let h = 2166136261;
  for (let i = 0; i < deviceId.length; i++) { h ^= deviceId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return String((h >>> 0) % 10000).padStart(4, '0');
}
/** 전광판과 소식에 붙는 이름: "몰빵다람쥐 #0417" */
export const withLedgerNo = (base: string, deviceId: string): string => `${base} #${ledgerNo(deviceId)}`;
/** 기기 번호: 아무 뜻 없는 무작위 글자(개인 정보 없음) */
export function newDeviceId(rand: () => number = Math.random): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'fof_';
  for (let i = 0; i < 20; i++) s += abc[Math.floor(rand() * abc.length)];
  return s;
}

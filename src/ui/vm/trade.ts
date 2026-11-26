// 거래 탭·시간표의 읽기 모델. 화면은 이것만 읽는다(시험: tests/ui/m8_trade.test.ts).
import { balance, marketById, marketDefs, tipsData } from '../../engine/data';
import {
  closeBack, entryFee, levCapNow, liqPrice, marginFromPct, pnlOf, roePct, shortInsurance, stopPrice, waiverAvailable,
} from '../../engine/futures';
import { futuresGate, tradeGate } from '../../engine/progression';
import { effectiveLevCaps, feeRate } from '../../engine/skilltree';
import { price, refPrice } from '../../engine/selectors';
import { comma } from '../../engine/util';
import type { AwayReport, GameState, Position } from '../../engine/types';

const T = balance.trading;
export const LEV_OPTIONS = T.leverageOptions as number[];
export const MARGIN_PCTS = T.marginPctOptions as number[];
export const SL_OPTIONS = T.slRoeOptions as (number | null)[];
export const TP_OPTIONS = T.tpRoeOptions as (number | null)[];
export const CHART_SECONDS = 120;

export const fmtPrice = (market: string, p: number): string => {
  const d = marketById[market]?.decimals ?? 0;
  return p.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
};

// ── 차트 눈금 (AC-v2-145) ───────────────────────────────────────────────
export interface ChartModel {
  lo: number; // 여백을 더한 세로축
  hi: number;
  dataLo: number;
  dataHi: number;
  spanPct: number; // 화면 전체(세로축 길이) ÷ 가운데 값 × 100
  label: string; // '화면 전체 0.06%'
  n: number;
}
/** 최근 가격 열의 범위에 세로축을 맞춘다. 여백은 위아래 각 4%, 범위가 0이면 가격의 0.02%를 최소 폭으로 쓴다. */
export function chartModel(prices: number[]): ChartModel {
  const data = prices.slice(-CHART_SECONDS);
  if (data.length === 0) return { lo: 0, hi: 1, dataLo: 0, dataHi: 1, spanPct: 0, label: '', n: 0 };
  let dLo = Math.min(...data);
  let dHi = Math.max(...data);
  const mid0 = (dLo + dHi) / 2;
  const minSpan = mid0 * 0.0002;
  if (dHi - dLo < minSpan) {
    dLo = mid0 - minSpan / 2;
    dHi = mid0 + minSpan / 2;
  }
  const pad = (dHi - dLo) * 0.04;
  const lo = dLo - pad;
  const hi = dHi + pad;
  const spanPct = ((hi - lo) / ((hi + lo) / 2)) * 100;
  return { lo, hi, dataLo: dLo, dataHi: dHi, spanPct, label: `화면 전체 ${spanPct.toFixed(2)}%`, n: data.length };
}

/** 지금 장: 최근 60초의 움직임을 '평소'(정산 봉 폭)와 비교. */
export function marketMood(g: GameState, market: string, hist: number[]): '잔잔함' | '보통' | '격동' {
  const h = hist.slice(-60);
  if (h.length < 10) return '보통';
  const mean = h.reduce((a, b) => a + b, 0) / h.length;
  const range = (Math.max(...h) - Math.min(...h)) / mean;
  const avg = g.run.mkt.avg[market]?.range180 ?? tipsData.defaultAvg[market]?.range180 ?? 0.0021;
  const usual = avg * Math.sqrt(60 / 180);
  const r = range / usual;
  return r < 0.7 ? '잔잔함' : r > 1.6 ? '격동' : '보통';
}

// ── 종목 꼬리표 ─────────────────────────────────────────────────────────
export interface MarketTab { id: string; name: string; pct: number; hasPos: boolean; posRoe: number | null }
export function marketTabs(g: GameState): MarketTab[] {
  const run = g.run;
  return marketDefs.filter((m) => m.tradable).map((m) => {
    const p = run.positions[m.id];
    return { id: m.id, name: m.name, pct: (price(run, m.id) / refPrice(run, m.id) - 1) * 100, hasPos: !!p, posRoe: p ? roePct(p, price(run, m.id)) : null };
  });
}

// ── 주문 미리보기 ───────────────────────────────────────────────────────
export interface OrderPreview {
  margin: number;
  fee: number;
  liq: number;
  liqPct: number; // 지금 가격 대비 청산가(%)
  info: string;
  reason: string | null; // 지금 못 들어가는 이유
}
export function orderPreview(g: GameState, market: string, dir: 1 | -1, lev: number, pct: number): OrderPreview {
  const run = g.run;
  const p = price(run, market);
  const rate = feeRate(g, lev); // 스킬트리 할인·보험료가 든 수수료율
  const margin = marginFromPct(run.cash, lev, pct, rate);
  const fee = entryFee(margin * lev, rate);
  const liq = dir === 1 ? p * (1 - 1 / lev + T.maintenanceRate) : p * (1 + 1 / lev - T.maintenanceRate);
  const liqPct = (liq / p - 1) * 100;
  let reason: string | null = null;
  if (run.marketStatus === 'delayed') reason = '시세 지연 중에는 진입할 수 없습니다';
  else if (run.marketStatus === 'halted') reason = '시장이 정지되어 있습니다';
  else if (margin < T.minMargin) reason = '증거금이 모자랍니다';
  else if (margin + fee > run.cash) reason = '현금 부족';
  else if (lev > levCapNow(run)) reason = levLockText(g, lev);
  else if (!run.positions[market] && Object.keys(run.positions).length >= 5) reason = '포지션은 최대 5개입니다';
  const lp = `${liqPct >= 0 ? '+' : '−'}${Math.abs(liqPct).toFixed(1)}%`;
  return { margin, fee, liq, liqPct, info: `증거금 ${comma(margin)} · 수수료 ${comma(fee)} · 청산가 ${fmtPrice(market, liq)}(${lp})`, reason };
}

// ── 배율 눈금자 ─────────────────────────────────────────────────────────
export function levLockText(g: GameState, lev: number): string {
  const f = g.run.futures;
  const caps = effectiveLevCaps(g);
  const step = caps.find((c) => c.cap >= lev && c.cap > f.levCap) ?? caps[caps.length - 1];
  const need = step.closedTrades ?? 0;
  if (step.waiver) {
    return f.closedTrades >= need
      ? `${step.cap}배: 캐피탈 창구에서 고위험 거래 확인서에 도장을 찍으면 열립니다`
      : `끝난 거래 ${need}건 뒤 ${step.cap}배 — 지금 ${f.closedTrades}건`;
  }
  return `끝난 거래 ${need}건 뒤 ${step.cap}배 — 지금 ${f.closedTrades}건`;
}
export interface Notch { lev: number; locked: boolean; hot: boolean; lockText: string | null }
export function levRuler(g: GameState): Notch[] {
  const cap = levCapNow(g.run);
  return LEV_OPTIONS.map((lev) => ({ lev, locked: lev > cap, hot: lev >= 100, lockText: lev > cap ? levLockText(g, lev) : null }));
}

// ── 포지션 줄 ───────────────────────────────────────────────────────────
const TIP_LABEL: Record<string, string> = {
  wire_break: '속보', wire_flow: '속보', wire_vol: '속보', weasel: '족제비 대표', bear: '곰 형', viper: '독사 대부', leadroom: '리딩방 전단지',
  'friend:fox': '여우 선배', 'friend:raccoon': '절친 너구리', 'friend:bear': '곰 형', 'friend:rabbit': '이웃 토끼', 'friend:squirrel': '단짝 다람쥐',
};
const FUND_LABEL: Record<string, string> = { bank: '조합', capital: '캐피탈', shark1: '오소리', shark2: '독사', friend: '친구', tax: '세무서' };
export interface PositionView {
  market: string; name: string; dir: 1 | -1; dirText: string; lev: number; roe: number; pnl: number; margin: number;
  entry: number; liq: number; sl: number | null; tp: number | null; slRoe: number | null; tpRoe: number | null;
  tags: string[]; liqDistPct: number; back: number; reserved: boolean;
}
export function positionView(g: GameState, market: string): PositionView | null {
  const run = g.run;
  const p: Position | undefined = run.positions[market];
  if (!p) return null;
  const px = price(run, market);
  const tags: string[] = [];
  if (p.tipSource) tags.push(`출처 ${TIP_LABEL[p.tipSource] ?? p.tipSource}`);
  if (p.fundedBy) tags.push(`${FUND_LABEL[p.fundedBy] ?? p.fundedBy}에서 빌린 돈`);
  return {
    market, name: marketById[market].name, dir: p.dir, dirText: p.dir === 1 ? '롱' : '숏', lev: p.lev, roe: roePct(p, px), pnl: pnlOf(p, px), margin: p.margin,
    entry: p.entry, liq: liqPrice(p), sl: p.slRoe !== null ? stopPrice(p, p.slRoe) : null, tp: p.tpRoe !== null ? stopPrice(p, p.tpRoe) : null,
    slRoe: p.slRoe, tpRoe: p.tpRoe, tags, liqDistPct: (Math.abs(px - liqPrice(p)) / px) * 100, back: closeBack(p, px), reserved: p.closeReserved,
  };
}

/** `지갑 도토코인 12,400어치 — 숏으로 지킨 비율 0%` (채굴 종목만). */
export function shortLine(g: GameState, market: string): string | null {
  if (!marketById[market]?.minable) return null;
  const s = shortInsurance(g.run, market);
  if (s.walletValue <= 0 && s.shortNotional <= 0) return null;
  return `지갑 ${marketById[market].name} ${comma(Math.floor(s.walletValue))}어치 — 숏으로 지킨 비율 ${s.ratioPct}%`;
}

// ── 잠금 3단계 (AC-v2-24) ───────────────────────────────────────────────
export interface GateLine { id: string; ok: boolean; text: string }
export function gateLines(g: GameState): GateLine[] {
  const gate = futuresGate(g);
  const t = (id: string) => gate.conditions.find((c) => c.id === id)!;
  const m = t('mined');
  const d = t('deposit');
  const e = t('edu');
  return [
    { id: 'mined', ok: m.met, text: `누적 채굴 ${comma(m.need)}어치 (지금 ${comma(m.current)})` },
    { id: 'edu', ok: e.met, text: `캐피탈에서 사전교육·모의거래${e.met ? '' : ` (${e.current}/${e.need})`}` },
    { id: 'deposit', ok: d.met, text: `예탁금 ${comma(d.need)} 확인` },
  ];
}
export function tradeMode(g: GameState) {
  const gate = tradeGate(g);
  const lines = gate.mode === 'readonly' ? gateLines(g) : [];
  return { mode: gate.mode, text: gate.text, lines, ready: lines.length > 0 && lines.every((l) => l.ok), cap: levCapNow(g.run), waiver: waiverAvailable(g.run) };
}

// ── 처음 세 번의 거래 설명(차트 밖 칩멍크 말) ───────────────────────────
const TUT = [
  '배율을 올리면 이길 때도 질 때도 그만큼 커집니다.',
  '청산가에 닿으면 증거금을 전부 잃습니다. 손절은 그 앞에 걸어 두는 선입니다.',
  '숏은 내릴 때 버는 거래입니다. 오르면 같은 만큼 잃습니다.',
];
export const tutorialLine = (g: GameState): string | null => (g.run.futures.open && g.run.futures.closedTrades < 3 ? TUT[g.run.futures.closedTrades] : null);

// ── 자리를 비운 사이 (8.6) ──────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0');
export const clock = (ms: number): string => `${pad2(new Date(ms).getHours())}:${pad2(new Date(ms).getMinutes())}`;
export function awayDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}일 ${h % 24}시간`;
  if (h >= 1) return `${h}시간 ${m % 60}분`;
  return `${m}분`;
}
export interface AwayRow { time: string; text: string; amount: number | null; sinceLeave: string | null; tone: 'plain' | 'loss' | 'gain' }
export interface AwayModel {
  title: string;
  rows: AwayRow[];
  footer: string | null;
  openAtLeave: string[];
  bankrupt: boolean;
  closes: number[];
  marks: number[]; // 차트 위 사건 위치(0~1)
}
export function awayModel(r: AwayReport, nowMs: number, closes: number[] = []): AwayModel {
  const leave = nowMs - r.awaySec * 1000;
  const entries = (r.entries ?? []).filter((e) => !['away', 'back', 'bankrupt'].includes(e.kind));
  const rows = entries.map((e): AwayRow => {
    const t = leave + (e.tick - r.fromTick) * 1000;
    const since = e.tick - r.fromTick;
    const isEnd = /liq|sl|tp|close/.test(e.kind);
    return {
      time: clock(t), text: e.text, amount: e.amount ?? null, sinceLeave: isEnd ? `나간 지 ${awayDuration(Math.max(0, since))}` : null,
      tone: e.kind.includes('liq') || (e.amount !== undefined && e.amount < 0) ? 'loss' : e.kind.includes('tp') && (e.amount ?? 0) > 0 ? 'gain' : 'plain',
    };
  });
  const s = r.settlementSummary;
  const footer = r.economySettlements > 0
    ? `정산은 ${r.economySettlements}회만 돌았습니다: 캔 값 +${comma(s.mined)} / 전기세 −${comma(s.power)} / 이자 −${comma(s.interest)}`
    : null;
  const span = Math.max(1, r.toTick - r.fromTick);
  return {
    title: `자리를 비운 사이 — ${awayDuration(r.awaySec)}`, rows, footer,
    openAtLeave: r.openAtLeave.map((p) => `${marketById[p.market]?.name ?? p.market} ${p.dir === 1 ? '롱' : '숏'} ${p.lev}배 (증거금 ${comma(p.margin)})`),
    bankrupt: r.bankrupt, closes,
    marks: entries.map((e) => Math.min(1, Math.max(0, (e.tick - r.fromTick) / span))),
  };
}

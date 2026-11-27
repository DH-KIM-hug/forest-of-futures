import { isNearLiq } from './model';
// 시제품 폰 탭 = 주인공의 폰 속 거래 앱 'FRX 숲거래소'(기획 v3.1 §5).
// 읽기 모델(vm/trade)과 엔진 행동(open/add/close/stops)은 기존 거래 화면과 같은 것을 쓴다. 생김새만 새로 만든다.
//   - 차트는 깨끗한 사각형, 가격 꼬리표는 차트 밖 축 띠에.
//   - 손익(ROE)이 화면에서 가장 큰 글자, 바로 옆에 `청산까지`.
//   - 주문 조건은 주문할 때만 올라오는 시트(§5.2). 진입은 두 번 누르면 끝난다.
//   - 손실을 확정하는 정리만 한 번 더 묻는다(2초). 창은 뜨지 않는다.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useGame } from '../../store/gameStore';
import { tutorialOpen, tutorialIntro, tutorialMargin } from './tutorial';
import { TUT, hamsterMath, claim } from './model';
import { tensionOf, orderOdds, claimShare, squeezeOf, dangerOf, nextMilestone, winTier, type WinTier } from './tension';
import { closedMath, tradeNet, say as toast } from './watch';
import { exitFee, fundingRateNow } from '../../engine/futures';
import { exitFeeMul } from '../../engine/skilltree';
import { recentRange } from './tension';
import { PhoneLane } from './Think';
import { forecast, miningLeftShare } from '../../engine/settlement';
import { rollTarget } from '../../engine/mining';
import { sellFeeRate } from '../../engine/mining';
import { balance } from '../../engine/data';
import { useProto } from './protoStore';
import { useUI } from '../uiStore';
import { comma, josa } from '../../engine/util';
import { clone } from '../../engine/game';
import { marketById } from '../../engine/data';
import { marginFromPct, shortInsurance } from '../../engine/futures';
import { wheelWorth } from './react';
import { has, feeRate, nodeEffect, activeLevels, longChartSec, tailRun } from '../../engine/skilltree';
import { skillById } from '../../engine/data';
import { price } from '../../engine/selectors';
import type { Position } from '../../engine/types';
import { historyOf, liveHistoryOf, markLive } from '../priceHistory';
import { coinLogo } from './coins';
import { acornStops, carryOf, chipCount, keepDueMargin, netForRoe, orderCtx, planLine, stopLabel, swingCount, swingText as swingCountText, type StopCtx } from './stops';
import { rollWheel, rolledFor } from './roll';
import { dayNoteOpen } from './daynote';
import { ctxOfPosition, plans, reapplyPlan } from './exitPlan';
import { STORY } from './text';
import { swingOf, swingText, sessionOf, liveliest, allQuiet, feeEventChip, SESSIONS, opensInText } from './market';
import { feeEventLeft, openingEvent } from '../../engine/skilltree';
import {
  chartModel, fmtPrice, levRuler, marketMood, marketTabs, MARGIN_PCTS, orderPreview, positionView, SL_OPTIONS, TP_OPTIONS, tradeMode,
  type PositionView,
} from '../vm/trade';
import { Acorn } from './art';
import { flyAcorns, reduced, useCountUp } from './fx';
import { WinBurst } from './Juice';
import { play, playTap, later } from './audio';
import { sprite } from './sprites';
const heroFront = sprite('hero')!.src; // 포지션 카드의 주인공: 폰을 보는 새 그림(U-33)
import './trade.css';

export const EXCHANGE_NAME = 'FRX 숲거래소';

// 종목 색(§11.3의 바랜 값)과 동전 무늬
const COIN: Record<string, { col: string; glyph: ReactNode }> = {
  DTC: { col: '#B9834F', glyph: <circle cx="10" cy="10" r="3.4" /> },
  BTH: { col: '#8E79B8', glyph: <path d="M12.6 4.6a6 6 0 1 0 2.8 8.6a4.8 4.8 0 0 1-2.8-8.6z" /> },
  MDT: { col: '#E0B84A', glyph: <><circle cx="10" cy="6.4" r="2.3" /><circle cx="13.6" cy="10" r="2.3" /><circle cx="10" cy="13.6" r="2.3" /><circle cx="6.4" cy="10" r="2.3" /></> },
  SMS: { col: '#6C93C4', glyph: <rect x="6.4" y="6.4" width="7.2" height="7.2" rx="1" /> },
  JQQ: { col: '#4FA37A', glyph: <path d="M10 5.2l4.6 8.4H5.4z" /> },
  FLY: { col: '#8E3FE0', glyph: <path d="M4 9l6-3 6 3-6 4z" /> },
};
export function Coin({ id, size = 22 }: { id: string; size?: number }) {
  const c = COIN[id] ?? COIN.DTC;
  const logo = coinLogo(id);
  // 코인 로고(U-40): 실제 로고의 실루엣을 숲 재료로 바꾼 패러디 그림. 그림이 없는 종목만 예전 SVG 동전으로
  if (logo) return <img className="pt-coin logo" data-coin={id} src={logo} width={size} height={size} alt="" draggable={false} />;
  return (
    <svg className="pt-coin" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8.6" fill={c.col} stroke="#4A4640" strokeWidth="2" />
      <g fill="#FFF8E4" opacity=".92">{c.glyph}</g>
    </svg>
  );
}
/** 오르내림 세모(글자 대신 그린다). */
export const Tri = ({ up, size = 10 }: { up: boolean; size?: number }) => (
  <svg className="pt-tri" width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" style={up ? undefined : { transform: 'rotate(180deg)' }}>
    <path d="M5 1.6 9 8.4H1z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);
const Chev = ({ dir = 'r', size = 12 }: { dir?: 'l' | 'r'; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" style={dir === 'l' ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M4 2l4.4 4L4 10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Lock = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
    <path d="M4.2 6.4V4.6a2.8 2.8 0 0 1 5.6 0v1.8" fill="none" stroke="#4A4640" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="2.6" y="6.2" width="8.8" height="6.2" rx="1.8" fill="#E8C24A" stroke="#4A4640" strokeWidth="1.6" />
  </svg>
);
const Cross = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
);
/** 폰 고리: 작은 붉은 나비매듭(§11.4). 폰 틀 모서리에 달려 있고, 거래할 때만 살짝 흔들린다. */
export function Charm({ r }: { r: RefObject<SVGSVGElement> }) {
  return (
    <svg ref={r} className="pt-charm" width="40" height="52" viewBox="0 0 34 44" aria-hidden="true">
      <path d="M17 0v19" stroke="#4A4640" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 24 6 17.5v13z M17 24l11-6.5v13z" fill="#C2413B" stroke="#4A4640" strokeWidth="2" strokeLinejoin="round" />
      <path d="M15 26l-4 10 5-2.4z M19 26l4 10-5-2.4z" fill="#C2413B" stroke="#4A4640" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="17" cy="24" r="3.4" fill="#C2413B" stroke="#4A4640" strokeWidth="2" />
    </svg>
  );
}

const sign = (x: number) => (x >= 0 ? '+' : '−');
const roeTxt = (x: number) => `${sign(x)}${Math.abs(x).toFixed(1)}%`;
const pctTxt = (x: number) => `${sign(x)}${Math.abs(x).toFixed(Math.abs(x) >= 10 ? 1 : 2)}%`;
const money = (x: number) => `${sign(x)}${comma(Math.abs(Math.round(x)))}`;

// ── 차트 ────────────────────────────────────────────────────────────────
interface Tag { key: string; cls: string; label: string; price: number; edge?: 'up' | 'down' }
/** 깨끗한 사각형 안에는 시세 선과 가로선뿐이다. 가격 꼬리표는 오른쪽 축 띠(차트 밖)에 둔다. */
export function PChart({ market, hist, pos, win = 120, band = null, foot = null, footH = 0, note = '', onPlotTap }: { /** 차트를 눌렀다(크게 · 작게, U-43) */ onPlotTap?: () => void; market: string; hist: number[]; pos: PositionView | null; win?: number; /** 지난 1분 폭(%): 지금 값 둘레에 그 폭만큼 띠를 그린다(청산선이 그 안에 들어오는지가 보인다) */ band?: number | null; /** 축 띠 맨 아래에 놓는 것(차트 창 고르기). 차트 안에는 아무것도 넣지 않는다 */ foot?: ReactNode; /** foot 의 높이(px): 꼬리표가 그 위에서 멈춘다 */ footH?: number; /** 축 띠에 적는 한 줄(화면 전체 폭). 자리가 넉넉할 때만 보인다 */ note?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  const data = hist.slice(-win);
  const n = data.length;
  const cm = chartModel(data);
  let lo = cm.dataLo, hi = cm.dataHi;
  if (pos) { lo = Math.min(lo, pos.entry); hi = Math.max(hi, pos.entry); }
  // 청산가는 시세 선이 납작해지지 않을 때만 화면 안에 넣는다. 아니면 축 띠 끝에 꼬리표만.
  if (pos) {
    const l2 = Math.min(lo, pos.liq), h2 = Math.max(hi, pos.liq);
    if ((cm.dataHi - cm.dataLo) / (h2 - l2) >= 0.22 || (hi - lo) / (h2 - l2) >= 0.45) { lo = l2; hi = h2; }
  }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;
  const Y = (p: number) => ((hi - p) / (hi - lo)) * 100;
  const slots = Math.max(n, Math.min(40, win));
  const X = (i: number) => (i / (slots - 1)) * 95;
  const last = n ? data[n - 1] : 0;
  const line = data.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)} ${Y(p).toFixed(2)}`).join('');
  const inside = (p: number) => p > lo && p < hi;

  const tags: Tag[] = [];
  if (n) tags.push({ key: 'now', cls: 'now', label: '', price: last });
  if (pos) {
    const t = (key: string, label: string, p: number) => tags.push({ key, cls: key, label, price: p, edge: inside(p) ? undefined : p >= hi ? 'up' : 'down' });
    t('entry', '진입', pos.entry);
    t('liq', '청산', pos.liq);
    if (pos.sl !== null) t('sl', '손절', pos.sl);
    if (pos.tp !== null) t('tp', '익절', pos.tp);
  }
  // 꼬리표끼리 겹치지 않게 세로로 민다(축 띠 안에서만).
  // 축 띠 아래의 단추는 차트가 아주 낮으면(시트가 열렸을 때) 뺀다. 위아래 끝 값은 꼬리표 자리가 넉넉할 때만 적는다
  const fH = foot && h >= footH + 64 ? footH : 0;
  const lims = h - fH >= 130;
  const noteH = lims && note ? 14 : 0;
  const GAP = 21, TOP = lims ? 30 : 11, BOT = Math.max(TOP, h - TOP - fH - noteH);
  // 꼬리표가 축 띠에 다 못 들어가면(낮은 차트에 손절·익절까지 다섯 개) 덜 급한 것부터 뺀다: 지금 값 > 청산 > 익절 > 손절 > 진입. 띠 밖으로 넘치지 않는다(U-41)
  const PRI = ['now', 'liq', 'tp', 'sl', 'entry'];
  const avail = Math.max(0, BOT - TOP);
  const maxTags = Math.max(2, Math.floor(avail / 15) + 1);
  const kept = tags.length > maxTags ? [...tags].sort((a, b) => PRI.indexOf(a.key) - PRI.indexOf(b.key)).slice(0, maxTags) : tags;
  const gap = kept.length > 1 ? Math.min(GAP, avail / (kept.length - 1)) : GAP;
  const placed = kept.map((t) => ({ ...t, y: Math.min(BOT, Math.max(TOP, (Y(t.price) / 100) * h)) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < placed.length; i++) if (placed[i].y - placed[i - 1].y < gap) placed[i].y = placed[i - 1].y + gap;
  for (let i = placed.length - 1; i >= 0; i--) {
    const cap = i === placed.length - 1 ? BOT : placed[i + 1].y - gap;
    if (placed[i].y > cap) placed[i].y = cap;
  }
  const liqIn = pos && inside(pos.liq);
  const dz = pos && liqIn ? (pos.dir === 1 ? { y: Y(pos.liq), hgt: 100 - Y(pos.liq) } : { y: 0, hgt: Y(pos.liq) }) : null;
  // 지난 1분 폭 띠: 포지션이 있을 때만, 지금 값에서 잃는 쪽으로 그 폭만큼
  const bd = pos && band && n ? (() => { const d = last * (band / 100); const a = Math.max(0, Math.min(100, Y(pos.dir === 1 ? last : last + d))), b = Math.max(0, Math.min(100, Y(pos.dir === 1 ? last - d : last))); return b - a > 0.6 ? { y: a, hgt: b - a } : null; })() : null;

  return (
    <div className="pt-chart" data-chart={market} data-hl="chart">
      <div className="plot" ref={box} role="img" onClick={onPlotTap} aria-label={`${marketById[market].name} 최근 ${win > 120 ? `${Math.round(win / 60)}분` : win >= 120 ? '2분' : '30초'} 시세`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[25, 50, 75].map((y) => <line key={y} className="grid" x1="0" x2="100" y1={y} y2={y} />)}
          {dz && <rect className="dz" x="0" width="100" y={dz.y} height={dz.hgt} />}
          {bd && <rect className="band" data-band x="0" width="100" y={bd.y} height={bd.hgt} />}
          {n >= 2 && <path className="area" d={`${line}L${X(n - 1).toFixed(2)} 100L0 100Z`} />}
          {pos && inside(pos.entry) && <line className="ln entry" x1="0" x2="100" y1={Y(pos.entry)} y2={Y(pos.entry)} />}
          {pos && pos.tp !== null && inside(pos.tp) && <line className="ln tp" x1="0" x2="100" y1={Y(pos.tp)} y2={Y(pos.tp)} />}
          {pos && pos.sl !== null && inside(pos.sl) && <line className="ln sl" x1="0" x2="100" y1={Y(pos.sl)} y2={Y(pos.sl)} />}
          {pos && liqIn && <line className="ln liq" x1="0" x2="100" y1={Y(pos.liq)} y2={Y(pos.liq)} />}
          {n >= 2 && <path className="px" d={line} />}
        </svg>
        {n >= 1 && <i className="dot" style={{ left: `${X(n - 1)}%`, top: `${Y(last)}%` }} />}
        {n < 12 && <span className="warm">시세를 모으는 중…</span>}
        <PhoneLane />
      </div>
      <div className="axis" aria-hidden="true">
        {lims && <span className="lim" style={{ top: 2 }}>{fmtPrice(market, hi)}</span>}
        {lims && <span className="lim" style={{ bottom: 2 + fH + noteH }}>{fmtPrice(market, lo)}</span>}
        {h > 0 && placed.map((t) => (
          <span key={t.key} className={'tag ' + t.cls + (t.edge ? ' edge' : '')} style={{ top: t.y }}>
            {t.label && <b>{t.label}</b>}<span>{fmtPrice(market, t.price)}</span>
          </span>
        ))}
        {noteH > 0 && <span className="scr" style={{ bottom: 1 + fH }}>{note}</span>}
      </div>
      {fH > 0 && <div className="foot">{foot}</div>}
    </div>
  );
}

// ── 화면 ────────────────────────────────────────────────────────────────
/** 정산이 이만큼(초) 안으로 오면 포지션 카드가 "정산을 넘기면 무슨 일이 생기는가"를 한 줄로 말한다(U-41) */
export const CARRY_SHOW_SEC = 75;
/** 시트는 손절·익절 하나뿐이다. 진입은 시트 없이 한 번에 한다. */
type Sheet = null | 'stops';
/** pnl = 이 거래로 늘거나 준 돈(들어갈 때·나올 때 수수료 포함). move = 시세로 번 돈, fees = 낸 수수료, worth = 쳇바퀴로 치면 얼마(react.ts) */
interface Result { k: number; kind: 'close' | 'tp' | 'sl' | 'liq'; dir: 1 | -1; pnl: number; margin: number; roe: number; name: string; dirText: string; lev: number; move: number; fees: number; worth: string | null; /** 정가로 냈다면 더 냈을 수수료(오픈 기념 · 나무의 할인)와 그 까닭 */ saved: number; savedBy: 'event' | 'tree' | null; /** 이 판을 들고 있는 동안 쳇바퀴를 굴려 번 돈(U-42) */ rolled: number; /** 고배율 축하금(나무 B3a, U-47) */ bonus: number }
/** 이 거래에서 아낀 수수료: 정가(오픈 기념이 있는 판은 끝난 뒤의 수수료율, 없는 판은 기본 수수료율)로 들어가고 나왔다면 냈을 돈 − 실제로 낸 돈 */
export function savedFees(p: { notional: number; feeRate?: number }, paid: number, liq: boolean): { saved: number; by: 'event' | 'tree' | null } {
  const ev = openingEvent();
  const list = ev ? ev.afterFeeRate : (balance.trading.feeRate as number);
  const full = Math.ceil(p.notional * list) * (liq ? 1 : 2);
  const saved = Math.max(0, full - paid);
  return { saved, by: saved <= 0 ? null : ev && (p.feeRate ?? list) < list * 0.01 ? 'event' : 'tree' };
}

const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
/** 화면 확인용(?pshot=…): up=수익 중, win/loss=방금 정리, stops=손절·익절 시트, arm=정리 확인. 시세 기록도 2분어치 채운다. */
const PSHOT = q.get('pshot');

function devPrepare(market: string): void {
  const st = useGame.getState();
  const px = price(st.g.run, market);
  const hst = historyOf(market);
  if (hst.length < 30) {
    const walk: number[] = [];
    let v = 0, seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    for (let i = 0; i < 100; i++) { v += rnd() * 0.0011 + Math.sin(i / 9) * 0.00012; walk.push(v); }
    const end = walk[walk.length - 1];
    const k = PSHOT === 'win' || PSHOT === 'up' ? 1 : -1; // 수익 장면은 오르는 길, 나머지는 내리는 길
    const fill = walk.map((w) => px * (1 + (w - end) * k * 0.9));
    hst.splice(0, hst.length, ...fill, px);
  }
  markLive(market);
  const p = st.g.run.positions[market];
  if (p && PSHOT !== 'edit') {
    const g = clone(st.g);
    const near = p.lev < 50; // pdev=near 장면
    const move = PSHOT === 'up' || PSHOT === 'win' ? 0.0041 : near ? -0.031 : -0.0062;
    g.run.positions[market].entry = px * (1 - move * g.run.positions[market].dir);
    st.setGame(g);
  }
}

export function ProtoTrade() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const net = useGame((s) => s.net);
  const tr = useUI((s) => s.trade);
  const setTrade = useUI((s) => s.setTrade);
  const run = g.run;
  const mode = tradeMode(g);
  const market = tr.market;
  const m = marketById[market];

  const [sheet, setSheet] = useState<Sheet>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean; k: number } | null>(null);
  const [arm, setArm] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [entered, setEntered] = useState(0);
  // 스킬트리(거래의 나무)가 이번 생에 켜 준 도구들. 시세·청산 공식은 건드리지 않는다.
  const sk = { oneTap: has(g, 'A2'), zoom: has(g, 'A3a'), flip: has(g, 'A3b'), water: has(g, 'B3b'), legend: has(g, 'B4'), split: has(g, 'C3a'), dayLimit: has(g, 'C3b') };
  /** 차트 창(초봉 차트 A3a): 0 = 2분, 1 = 초봉 30초, 2 = 긴 창(2분 + 꼬리) */
  const [zoom, setZoom] = useState(0);
  /** 차트에 보이는 시간(초): 2분 · 5분 · 10분. 기록은 초마다 한 값, 600개까지 */
  const [span, setSpan] = useState(120);
  const [bigChart, setBigChart] = useState(false);
  /** 포지션 카드의 둘째 줄(시세 · 수수료로 나눈 손익)은 카드를 누르면 펼친다(U-43: 차트에 자리를 준다) */
  const [whyOpen, setWhyOpen] = useState(false);
  /** 들고 있는 동안 증거금 칩은 접어 둔다: [추가 진입]을 한 번 누르면 펴지고, 한 번 더 누르면 들어간다(U-43: 차트에 자리를 준다) */
  const [addOpen, setAddOpen] = useState(false);
  /** 주문 조건의 증거금 · 수수료 줄을 펼쳤는가(수수료가 없을 때는 접혀 있다) */
  const [more, setMore] = useState(false);
  const [split, setSplit] = useState(false);
  const [perks, setPerks] = useState(false);
  const [rollK, setRollK] = useState(0);
  const [rollGain, setRollGain] = useState<string | null>(null);
  /** 이긴 판이 터지는 화면(U-48) */
  const [burst, setBurst] = useState<{ k: number; tier: WinTier; pnl: number; margin: number; streak: number; lev: number } | null>(null);
  /** 들고 있는 동안 숫자 옆에 터지는 고비(U-48): +50%, 두 배!, 이자 한 번, 반 날아감, 살았다! */
  const [pops, setPops] = useState<{ k: number; text: string; cls: string }[]>([]);
  const popK = useRef(0);
  const marks = useRef<Record<string, { best: number; claim: boolean; half: boolean; peakDanger: number; saved: boolean }>>({});
  /** 숫자가 한 틱에 오르내린 쪽(U-48): 손익 숫자가 그쪽 색으로 번쩍인다 */
  const [flash, setFlash] = useState<{ k: number; up: boolean } | null>(null);
  const lastNet = useRef<{ key: string; net: number } | null>(null);
  const splitT = useRef<number[]>([]);
  const noteT = useRef<number | undefined>(undefined);
  const armT = useRef<number | undefined>(undefined);
  const resT = useRef<number | undefined>(undefined);
  const charm = useRef<SVGSVGElement>(null);
  const plRef = useRef<HTMLDivElement>(null);
  const manual = useRef(false);
  const seen = useRef<{ p: Position; market: string; tick: number } | null>(null);
  const say = (text: string, bad = true) => {
    setNote((x) => ({ text, bad, k: (x?.k ?? 0) + 1 }));
    window.clearTimeout(noteT.current);
    noteT.current = window.setTimeout(() => setNote(null), 3200);
  };
  useEffect(() => () => { window.clearTimeout(noteT.current); window.clearTimeout(armT.current); window.clearTimeout(resT.current); splitT.current.forEach((t) => window.clearTimeout(t)); }, []);

  const swing = (big = false) => {
    if (reduced()) return;
    const a = big ? 16 : 9;
    charm.current?.animate(
      [0, 1, 2, 3, 4, 5].map((i) => ({ transform: `rotate(${(a * (1 - i / 5) ** 2 * Math.cos(i * Math.PI)).toFixed(1)}deg)` })),
      { duration: big ? 900 : 520, easing: 'ease-out' },
    );
  };
  useEffect(() => { swing(); }, []); // 폰을 꺼낼 때 한 번

  // 화면 확인용 준비(주소에 pshot 이 있을 때만). 첫 시세가 들어온 뒤(틱 +2)에 기록을 채우고, 틱 +4 에 정리한다.
  const dev = useRef({ t0: run.tick, step: 0 });
  useEffect(() => {
    if (!PSHOT) return;
    const d = dev.current;
    const dt = run.tick - d.t0;
    if (d.step === 0) {
      d.step = 1;
      window.setTimeout(() => {
        if (PSHOT === 'stops' || PSHOT === 'edit') setSheet('stops');
        if (PSHOT === 'arm') setArm(true);
      }, 60);
    }
    if (d.step === 1 && dt >= 2) { d.step = 2; devPrepare(market); }
    if (d.step === 2 && dt >= 4 && (PSHOT === 'win' || PSHOT === 'loss')) { d.step = 3; manual.current = true; act({ type: 'close', market }); }
  }, [run.tick, market, act]);

  const tutSt = useProto((s) => s.tutorial);
  useEffect(() => { if (tutSt === 'await') { if (market !== TUT.market) setTrade({ market: TUT.market }); tutorialIntro(); } }, [tutSt]);
  const hist = historyOf(market);
  const px = price(run, market);
  const pos = positionView(g, market);
  const tabs = marketTabs(g);
  // 지금 가장 출렁이는 종목(지난 1분 폭이 가장 큰 것)에 표시 — 잔잔한 장에서 어디가 움직이는지 보이게(U-39 ①)
  // 출렁임은 초 단위 실시간 값으로만 잰다(시작할 때 받아 온 분 봉은 섞지 않는다, U-40). 종목마다 꼬리표에 적는다 — 어느 종목에 걸지가 고를 거리가 되게
  const ranges = tabs.map((t) => ({ id: t.id, r: recentRange(liveHistoryOf(t.id)) }));
  const rangeOf = (id: string): number | null => ranges.find((x) => x.id === id)?.r ?? null;
  const wild = liveliest(ranges);
  const now = new Date();
  const sess = sessionOf(market, now, rangeOf(market));
  const quietAll = allQuiet(ranges.map((x) => x.r));
  const liveHist = liveHistoryOf(market);
  const evLeft = feeEventLeft(run);
  const tab = tabs.find((t) => t.id === market)!;
  const lev = pos ? pos.lev : tr.lev ?? run.futures.defaultLev;
  const lev0 = lev;
  const cl = claim(g);
  const fc = forecast(g);
  const dueAll = fc.interest + fc.living + fc.wages;
  // 정산까지 더 들어올 돈: 캐는 값은 틱마다 들어온다(U-43) — 이번 구간에 아직 안 들어온 몫만 센다
  const income = fc.mined * (1 - sellFeeRate(run)) * miningLeftShare(run);
  const freeWheel = rollTarget(run) !== null; // 알바가 없는 쳇바퀴가 있어야 주인공이 굴린다(U-43)
  // 정산 빼고 전부(U-42 ③): 다음 정산에 낼 돈(이자 + 생활비 + 일당)은 손에 남기고 나머지를 건다. 엔진에는 그만큼의 비율을 넘긴다
  const keepM = keepDueMargin({ cash: run.cash, due: dueAll, lev, feeRate: feeRate(g, lev) });
  const keepOn = !!tr.keep;
  const pct = keepOn ? (run.cash > 0 && keepM > 0 ? Math.min(99.99, ((keepM + 0.5) / run.cash) * 100) : 0) : tr.pct;
  const prev = orderPreview(g, market, pos ? pos.dir : 1, lev, pct);
  const ruler = levRuler(g);
  const mood = marketMood(g, market, hist);
  const cm = chartModel(hist);
  const offline = net.source === 'server' && net.conn !== 'open';
  const status =
    run.marketStatus === 'halted' ? '시장이 멈췄습니다. 포지션도 멈춰 있습니다'
    : run.marketStatus === 'delayed' ? '시세가 늦어져 새 거래를 열 수 없습니다'
    : offline ? '시장에 연결할 수 없습니다' : null;
  const ins = m.minable ? shortInsurance(run, market) : null;
  const call = !!pos && isNearLiq(pos);
  const rawPos = run.positions[market];
  /** 지금 정리하면 넣은 돈(증거금)에 더해지거나 빠지는 돈. 넣은 돈 + 이 값 = 돌려받는 돈(closeBack). 결과 카드도 같은 셈이다. */
  const netNow = pos && rawPos ? tradeNet(rawPos, pos.back) : 0;
  // 들고 있는 동안의 긴장(U-39 ①): 청산까지의 거리를 지난 1분 폭에 견주고, 정산 때 낼 돈이 묶여 있는지 본다
  const tn = pos ? tensionOf(pos.liqDistPct, liveHist) : null;
  const share = pos ? claimShare(netNow, cl.total) : null;
  // 큰 숫자 = 이 거래로 지금까지 늘거나 준 돈의 비율(수수료 포함). 그 아래에 왜 그 숫자인지(시세 · 수수료)
  const netRoe = pos && rawPos ? (netNow / Math.max(1, rawPos.margin0)) * 100 : 0;
  const feesNow = pos && rawPos ? Math.round(rawPos.feesPaid + exitFee(rawPos, exitFeeMul(run))) : 0;
  // ── 손맛(U-48): 숫자는 굴러가고, 틱마다 오르내린 쪽으로 번쩍이고, 고비를 넘으면 옆에 터진다 ──
  const posKey = rawPos ? market + ':' + rawPos.openTick : '';
  const netRoll = useCountUp(Math.round(netNow), 420);
  const roeShow = rawPos ? (netRoll / Math.max(1, rawPos.margin0)) * 100 : 0;
  const danger = pos ? dangerOf(pos.liqDistPct, pos.lev, balance.trading.maintenanceRate as number) : 0;
  useEffect(() => {
    if (!pos || !rawPos || tutSt !== 'done') { lastNet.current = null; return; }
    const prevN = lastNet.current;
    lastNet.current = { key: posKey, net: netNow };
    if (prevN && prevN.key === posKey && Math.abs(netNow - prevN.net) >= rawPos.margin0 * 0.004) setFlash((f) => ({ k: (f?.k ?? 0) + 1, up: netNow > prevN.net }));
    const mk = (marks.current[posKey] ??= { best: 0, claim: false, half: false, peakDanger: 0, saved: false });
    const pop = (text: string, cls: string, snd?: string) => {
      const k = ++popK.current;
      setPops((ps) => [...ps.slice(-2), { k, text, cls }]);
      window.setTimeout(() => setPops((ps) => ps.filter((x) => x.k !== k)), 1700);
      if (snd) play(snd);
    };
    mk.peakDanger = Math.max(mk.peakDanger, danger);
    const ms = nextMilestone(mk.best, netRoe);
    if (ms) { mk.best = ms.at; pop(ms.text, ms.at >= 100 ? 'gold' : 'up', ms.at >= 100 ? 'goal_complete' : 'acorn_arrive'); return; }
    if (!mk.claim && cl.total > 0 && netNow >= cl.total) { mk.claim = true; pop(`이자 한 번 벌었다 +${comma(Math.round(cl.total))}`, 'up', 'buy'); return; }
    // 청산 턱밑(들어간 거리의 70% 넘게 다가갔다)에서 본전 위로 돌아왔다: 한 번
    if (!mk.saved && mk.peakDanger >= 0.7 && netNow >= 0) { mk.saved = true; pop('살았다!', 'saved', 'collector_paid'); return; }
    if (!mk.half && netRoe <= -50) { mk.half = true; pop('반 날아감', 'down'); }
  }, [netNow, posKey]);

  // ── 출구를 도토리로(U-41): 익절 · 손절을 "이자 몇 번 치"로 건다. 엔진에는 그 돈이 되는 ROE 를 넘긴다 ──
  const maint = balance.trading.maintenanceRate as number;
  const sctx: StopCtx | null = rawPos
    ? ctxOfPosition(run, rawPos)
    : prev.margin >= 1 ? orderCtx({ margin: prev.margin, lev, feeRate: feeRate(g, lev, { allIn: pct >= 100 }), maint, exitMul: exitFeeMul(run), exitMulSl: exitFeeMul(run, 'sl') }) : null;
  // 「이자 한 번 걸기」(한 번 누르기 출구, U-41 · U-42 ①)는 뺐다(U-46 사용자: "이자 한 번 걸기는 제외"). 출구는 시트에서 % 나 도토리로 건다
  const tpK = tr.tpK ?? null, slK = tr.slK ?? null;
  const acOrder = !pos && sctx ? acornStops(sctx, tpK !== null ? tpK * cl.total : null, slK !== null ? slK * cl.total : null) : null;
  /** 다음 진입에 걸릴 출구(ROE %): 도토리로 정한 것이 있으면 그것이 먼저다 */
  const ordSl = slK !== null ? acOrder?.sl ?? null : tr.sl;
  const ordTp = tpK !== null ? acOrder?.tp ?? null : tr.tp;
  /** 열린 포지션에 도토리로 건 출구(추가 진입 뒤에 같은 돈으로 다시 건다) */
  const plan = { current: plans }; // exitPlan.ts: 거래소 탭을 떠나 있어도 남는다(정산의 펀딩비 뒤에 watch.ts 가 다시 건다)

  // 포지션이 사라지면(정리·손절·익절·청산) 결과를 손익 줄 자리에 잠깐 보여 준다.
  const raw = run.positions[market];
  useEffect(() => {
    const was = seen.current;
    if (!raw && was && was.market === market) {
      // 이 거래로 늘거나 준 돈: 돌려받은 돈 − 넣은 돈 − 들어갈 때 낸 수수료. 왜 그 숫자인지(시세 · 수수료)를 같이 보여 준다(U-38). 셈은 세상의 반응과 같은 것을 쓴다(watch.ts closedMath)
      const cm0 = closedMath(run, was.p);
      const liq = cm0.kind === 'liq';
      const { pnl, fees, move } = cm0;
      const kind: Result['kind'] = liq ? 'liq' : manual.current ? 'close' : cm0.kind === 'tp' || cm0.kind === 'sl' ? cm0.kind : pnl >= 0 ? 'tp' : 'sl';
      manual.current = false;
      setArm(false);
      setSheet(null);
      // 첫 주문(튜토리얼)은 오픈 기념 문자가 오기 전이다: 아낀 수수료를 「오픈 기념」으로 적지 않는다(U-46)
      const sv = useProto.getState().tutorial === 'run' ? { saved: 0, by: null } : savedFees(was.p, fees, liq);
      setResult((r) => ({ k: (r?.k ?? 0) + 1, kind, dir: was.p.dir, pnl, margin: was.p.margin0, roe: (pnl / Math.max(1, was.p.margin0)) * 100, name: m.name, dirText: was.p.dir === 1 ? '롱' : '숏', lev: was.p.lev, move, fees, worth: wheelWorth(pnl, hamsterMath(useGame.getState().g).net), saved: sv.saved, savedBy: sv.by, rolled: Object.keys(run.positions).length === 0 ? Math.round(rolledFor(was.p.openTick)) : 0, bonus: (() => { const lb = run.stats.lastBonus as { market: string; tick: number; amount: number } | undefined; return lb && lb.market === was.p.market && lb.tick === run.tick ? lb.amount : 0; })() }));
      if (!liq) play(pnl > 0 ? 'close_profit' : 'close_loss'); // 청산 소리는 watch.ts 가 낸다
      // 닫힌 판의 속마음은 지나간 일이다(U-48: 닫은 뒤에도 "지금 닫으면 …"이 남아 있던 것)
      if (useProto.getState().think) useProto.getState().patch({ think: null });
      if (pnl > 0) { flyAcorns(plRef.current?.getBoundingClientRect() ?? null, Math.min(7, 3 + Math.floor(pnl / 8000))); swing(true); }
      // 이긴 판의 등급(U-48): 넣은 돈에 견준 크기만큼 화면이 터진다(도토리 비, 등급 글자, 숫자가 0에서 굴러 오른다)
      const tier0 = !liq && pnl > 0 ? winTier((pnl / Math.max(1, was.p.margin0)) * 100) : null;
      // 넣은 돈에 견주면 작아도 이번 수금(이자 + 생활비)을 넘게 벌었으면 그것도 한 방이다
      const tier = tier0 && tier0.lv === 0 && cl.total > 0 && pnl >= cl.total ? { lv: 1 as const, word: '이자 벌었다', rain: 12 } : tier0;
      if (tier && tier.lv > 0) {
        setBurst((b) => ({ k: (b?.k ?? 0) + 1, tier, pnl, margin: was.p.margin0, streak: useProto.getState().winStreak, lev: was.p.lev }));
        if (tier.lv >= 2) later(260, () => play('close_profit_b'));
        if (tier.lv >= 3) later(720, () => play('goal_complete'));
      }
    }
    if (raw && (!was || was.market !== market)) { setResult(null); }
    seen.current = raw ? { p: raw, market, tick: run.tick } : null;
  });
  useEffect(() => { setArm(false); setResult(null); setSheet(null); setAddOpen(false); }, [market]);
  // 결과 카드는 장면(추심원의 말 등)이 지나간 뒤에도 6.5초 남는다(U-48): 「다시 걸기」를 누를 틈
  const talkingNow = useProto((st0) => st0.scenes.length > 0);
  useEffect(() => { if (!result || talkingNow) return; const t = window.setTimeout(() => setResult(null), 6500); return () => window.clearTimeout(t); }, [result?.k, talkingNow]);
  useEffect(() => { if (!pos) setAddOpen(false); }, [!!pos]);

  /** 도토리로 건 출구를 지금 포지션의 크기 · 수수료에 맞춰 다시 건다(진입 직후 · 추가 진입 뒤) */
  const reapply = () => {
    reapplyPlan(market);
  };
  /** 50배 위의 칸을 처음 눌렀다(U-47): 오소리 대부가 위험 고지 확인서를 밀어 준다. [발도장 찍기] 한 번이면 이번 생 내내 200배까지 열린다 */
  const askWaiver = (want: number) => {
    if (tutSt !== 'done') { say('첫 주문은 정해 둔 배율로 해요.', false); return; }
    play('ui_tap');
    useProto.getState().pushScene({
      id: 'waiverAsk', again: true, hold: true, lines: STORY.waiverAsk(want),
      choices: [
        { id: 'stamp', label: '발도장 찍기', sub: `${want}배 주문이 바로 열린다`, primary: true, run: () => { const r = useGame.getState().act({ type: 'signWaiver' }); if (r.ok) { play('overdue_stamp'); setTrade({ lev: want }); } else toast(r.msg ?? '찍을 수 없다'); } },
        { id: 'later', label: '다음에', sub: '50배까지만', run: () => { /* 그대로 */ } },
      ],
    });
  };
  /** levO = 「한 판 더」: 방금 닫힌 판의 배율로(U-48) */
  const doOpen = (dir: 1 | -1, levO?: number) => {
    const lev = levO ?? lev0;
    // 튜토리얼 거래(U-31): 첫 한 번은 정해 둔 돈·배율로, 짜 둔 시세 위에서
    if (useProto.getState().tutorial === 'await') { if (tutorialOpen(dir)) { setSheet(null); setResult(null); setEntered((k) => k + 1); swing(true); } return; }
    if (useProto.getState().tutorial === 'run') return;
    // 쪼개 넣기(C3a): 고른 증거금을 셋으로 나눠, 지금 한 번 + 2초 간격으로 두 번 더 넣는다. 평균 단가는 엔진이 낸다.
    if (levO !== undefined && levO !== tr.lev) setTrade({ lev: levO });
    const part = sk.split && split ? Math.floor(marginFromPct(run.cash, lev, pct, feeRate(g, lev)) / 3) : 0;
    const r = part > 0 ? act({ type: 'open', market, dir, lev, margin: part, sl: ordSl, tp: ordTp }) : act({ type: 'open', market, dir, lev, marginPct: pct, sl: ordSl, tp: ordTp });
    if (!r.ok) { say(r.msg ?? '주문할 수 없어요'); play('insufficient'); return; }
    // 걸어 둔 익절 폭이 지난 기록에 한 번도 없었다(조용한 장): 이번 생에 한 번, 오소리 대부가 있는 그대로 말한다 — 기다리는 동안에도 정산은 온다(U-41 ⑩)
    if (tpK !== null && acOrder?.tpMove != null && hist.length >= 60 && swingCount(hist, acOrder.tpMove) === 0 && !useProto.getState().seen.farTp) {
      useProto.getState().patch({ seen: { ...useProto.getState().seen, farTp: true } });
      window.setTimeout(() => toast(`오소리 대부: 그 익절 폭(${acOrder.tpMove!.toFixed(2)}%)은 지난 ${Math.max(1, Math.round(hist.length / 60))}분에 한 번도 안 나왔습니다. 정산은 그동안에도 와요.`, 7000), 1200);
    }
    // 도토리로 건 출구: 실제로 들어간 크기(쪼개 넣기면 셋 가운데 하나)에 맞춰 다시 건다
    if (tpK !== null || slK !== null) { plan.current[market] = { tp: tpK !== null ? tpK * cl.total : null, sl: slK !== null ? slK * cl.total : null }; reapply(); }
    else delete plan.current[market];
    if (part > 0) {
      splitT.current.forEach((t) => window.clearTimeout(t));
      splitT.current = [1, 2].map((k) => window.setTimeout(() => {
        const cur = useGame.getState().g.run.positions[market];
        if (!cur || cur.dir !== dir) return; // 그 사이 정리·청산됐으면 더 넣지 않는다
        const a = useGame.getState().act({ type: 'add', market, margin: part });
        if (a.ok) { play(dir === 1 ? 'order_long' : 'order_short'); say(`쪼개 넣기 ${k + 1}/3`, false); reapply(); }
      }, 2000 * k));
      say('쪼개 넣기 1/3', false);
    }
    play(dir === 1 ? 'order_long' : 'order_short');
    setSheet(null);
    setResult(null);
    setEntered((k) => k + 1);
    swing(true);
  };
  const doAdd = () => {
    const r = act({ type: 'add', market, marginPct: pct });
    if (!r.ok) { say(r.msg ?? '더 넣을 수 없습니다'); play('insufficient'); return; }
    play(pos?.dir === -1 ? 'order_short' : 'order_long');
    reapply();
    setSheet(null);
    setEntered((k) => k + 1);
    swing();
  };
  const doClose = () => {
    if (!pos) return;
    // 손실을 확정하는 정리만 한 번 더 묻는다(되돌릴 수 없는 손실에만 확인).
    if (netNow < 0 && !arm && !sk.oneTap) {
      setArm(true);
      window.clearTimeout(armT.current);
      armT.current = window.setTimeout(() => setArm(false), 2000);
      return;
    }
    manual.current = true;
    const r = act({ type: 'close', market });
    if (!r.ok) { manual.current = false; say(r.msg ?? '정리할 수 없습니다'); }
    else if (r.code === 'reserved') { manual.current = false; say('시세 지연. 요청을 접수했어요. 시세가 돌아오면 정리해요.', false); }
  };
  /** 반대 단추(A3b): 정리하고 같은 배율·같은 증거금 비율로 반대쪽에 들어간다(수수료는 두 번 낸다) */
  const doFlip = () => {
    if (!pos) return;
    const dir = (pos.dir === 1 ? -1 : 1) as 1 | -1, lv = pos.lev;
    manual.current = true;
    const c = act({ type: 'close', market });
    if (!c.ok || c.code === 'reserved') { manual.current = false; say(c.msg ?? '뒤집을 수 없습니다'); return; }
    const r = act({ type: 'open', market, dir, lev: lv, marginPct: pct, sl: ordSl, tp: ordTp, flip: true }); // flip = 반대 단추의 꼬리(뒤집어 들어간 포지션의 수수료 할인)
    if (!r.ok) { say(r.msg ?? '반대쪽에 주문할 수 없어요'); return; }
    play(dir === 1 ? 'order_long' : 'order_short');
    setEntered((k) => k + 1);
    swing(true);
  };
  /** 물타기(B3b): 포지션은 그대로 두고 증거금만 더 넣는다. 청산가가 멀어지고, 걸린 돈이 커진다. */
  const waterAmt = Math.floor((run.cash * pct) / 100);
  const doWater = () => {
    const r = act({ type: 'addMargin', market, amount: waterAmt });
    if (!r.ok) { say(r.msg ?? '더 넣을 수 없습니다'); play('insufficient'); return; }
    play('buy'); say(`증거금 +${comma(waterAmt)}. 청산가가 멀어졌다.`, false);
  };
  const dayLim = run.dayLossLimit ?? null;
  const DAY_OPTS: (number | null)[] = [null, 10000, 30000, 50000, 100000];
  const stepOf = (opts: (number | null)[], cur: number | null, d: 1 | -1) => opts[(opts.indexOf(cur) + d + opts.length) % opts.length];
  // 들고 있는 동안 쳇바퀴 굴리기(U-42): 엔진의 tap 그대로(초당 상한도 그대로)
  const rolledNow = useProto((st0) => (rawPos && st0.rolledKey !== null && Object.values(run.positions).some((x) => x.openTick === st0.rolledKey) ? st0.rolled : 0));
  const doRoll = () => {
    const r = rollWheel();
    if (!r.ok) { if (r.why === 'nowheel') { say('바퀴가 있던 자리다. 집에서 다시 살 수 있다.'); play('insufficient'); } return; }
    playTap();
    setRollGain(r.sold ? `+${comma(r.gain)}` : `+${comma(r.worth)} 코인`);
    setRollK((k) => k + 1);
  };
  const curSl = pos ? pos.slRoe : ordSl;
  const curTp = pos ? pos.tpRoe : ordTp;
  const applyPos = (sl: number | null, tp: number | null) => {
    const r = act({ type: 'stops', market, sl, tp });
    if (!r.ok) say(r.msg ?? '바꿀 수 없습니다');
    else if (r.code === 'reserved') say('시세 지연. 요청을 접수했어요. 시세가 돌아오면 적용해요.', false);
  };
  /** % 로 고르기(예전 그대로): 고른 쪽의 도토리 출구는 풀린다 */
  const setRoe = (kind: 'sl' | 'tp', v: number | null) => {
    if (pos) { const pl = plan.current[market]; if (pl) pl[kind] = null; applyPos(kind === 'sl' ? v : pos.slRoe, kind === 'tp' ? v : pos.tpRoe); }
    else setTrade(kind === 'sl' ? { sl: v, slK: null } : { tp: v, tpK: null });
  };
  const slWhyText = (why: 'liq' | 'fee' | null, amt: number) => (why === 'liq' ? `손절 −${comma(Math.round(amt))}보다 청산이 먼저 온다. 증거금이 그보다 작다.` : `수수료만으로 이미 −${comma(Math.round(amt))}를 넘는다.`);
  /** 도토리로 고르기: k = 다음 정산 청구액(이자 + 생활비)의 몇 배. null = 없음 */
  const setAcorn = (kind: 'sl' | 'tp', k: number | null): boolean => {
    const amt = k !== null ? k * cl.total : null;
    if (!sctx) return false;
    const a = acornStops(sctx, kind === 'tp' ? amt : null, kind === 'sl' ? amt : null);
    if (kind === 'sl' && amt !== null && a.sl === null) { say(slWhyText(a.slWhy, amt)); return false; }
    if (pos) {
      plan.current[market] = { ...(plan.current[market] ?? { tp: null, sl: null }), [kind]: amt };
      applyPos(kind === 'sl' ? a.sl : pos.slRoe, kind === 'tp' ? a.tp : pos.tpRoe);
    } else setTrade(kind === 'sl' ? { slK: k, sl: null } : { tpK: k, tp: null });
    return true;
  };
  /** 지금 걸린 출구가 "이자 k번 치"인가(포지션이면 건 값을 도토리로 되읽어 견준다) */
  const acIs = (kind: 'sl' | 'tp', k: number): boolean => {
    if (!pos) return (kind === 'sl' ? slK : tpK) === k;
    const roe = kind === 'sl' ? pos.slRoe : pos.tpRoe;
    if (roe === null || !sctx || !(cl.total > 0)) return false;
    return Math.abs(Math.abs(netForRoe(roe, sctx, kind)) - k * cl.total) <= Math.max(3, cl.total * 0.02);
  };
  const slTxt = stopLabel(curSl, sctx, 'sl');
  const tpTxt = stopLabel(curTp, sctx, 'tp');
  const pctOf = (v: number | null) => (v === null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v) >= 100 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(Math.abs(v) % 1 > 0.04 ? 1 : 0)}%`);

  const openTabs = tabs.filter((t) => t.hasPos);
  const openN = openTabs.length;
  const openNet = openTabs.reduce((a, t) => a + (t.posNet ?? 0), 0);
  const feeChipH = openingEvent() && useProto.getState().tutorial === 'done' && run.futures.open ? { ...feeEventChip(feeEventLeft(run), feeRate(g, tr.lev ?? run.futures.defaultLev) * 100), left: feeEventLeft(run) } : null;
  const frame = (body: ReactNode, cls = '') => (
    <div className="pt-wrap">
      <div className={'pt' + cls} data-pc={g.settings.priceColors} data-mode={mode.mode}>
        <Charm r={charm} />
        <header className="pt-bar">
          <span className="logo"><Acorn size={17} /></span>
          <b>{EXCHANGE_NAME}</b>
          <em>선물</em>
          {/* 열린 포지션 전부의 손익(U-47): 지금 정리하면 늘거나 줄 돈의 합(수수료 포함) */}
          {openN > 0 && <span className={'pt-sum ' + (openNet >= 0 ? 'up' : 'down')} data-possum={Math.round(openNet)} role="status" aria-label={`포지션 ${openN}개 합계 ${money(openNet)}`}><small>{openN}개</small>{money(openNet)}</span>}
          {/* 오픈 기념 수수료 무료(U-40): 거래소 머리에 늘 걸려 있다. 끝난 뒤에는 지금 수수료율 */}
          {feeChipH && <span className={'pt-fee' + (feeChipH.on ? ' on' : '') + (feeChipH.on && feeChipH.left <= 3 ? ' last' : '')} data-fee-event={feeChipH.left} role="status" aria-label={feeChipH.text}>{feeChipH.on ? '오픈 기념 무료' : feeChipH.text.replace('거래 ', '')}</span>}
          {Object.keys(activeLevels(g)).length > 0 && <button className="pt-perk" data-perks onClick={() => setPerks((v) => !v)} aria-expanded={perks} aria-label="이번 생에 열린 가지">나무 {Object.keys(activeLevels(g)).length}</button>}
        </header>
        {perks && <div className="pt-perks" role="status" onClick={() => setPerks(false)}>{Object.entries(activeLevels(g)).map(([id, lv]) => <span key={id}>{skillById[id]?.name}{skillById[id]?.kind === 'scaled' ? ` Lv${lv} (−${(nodeEffect(g, id) * 100).toFixed(1)}%)`.replace('(−', id === 'C2' || id === 'B1' ? '(+' : '(−') : skillById[id]?.tail ? ` Lv${lv} (${id === 'A3a' ? `+${Math.round(tailRun(run, id))}초` : id === 'B2' ? `−${(tailRun(run, id) * 100).toFixed(2)}%p` : `${id === 'B3b' || id === 'C4' ? '+' : '−'}${(tailRun(run, id) * 100).toFixed(1)}%`})` : ''}</span>)}</div>}
        {body}
      </div>
    </div>
  );

  // 0단계: 아직 앱이 잠겨 있다
  if (mode.mode === 'locked') {
    return frame(
      <div className="pt-lockbox"><Lock size={34} /><p>{(run.stats.assetsSeized ?? 0) > 0 ? '연결된 쳇바퀴 없음. 집에서 한 대를 다시 놓으면 거래를 재개할 수 있어요.' : mode.text}</p></div>,
    );
  }

  const tutBanner = tutSt === 'await' || tutSt === 'run' ? (
    <div className="pt-tutb" role="status" data-tut={tutSt}>{tutSt === 'await' ? <>첫 주문용 시세 <b>가진 돈 전부 {comma(tutorialMargin())}, {TUT.lev}배</b></> : <>첫 주문 진행 중</>}</div>
  ) : null;
  const coins = (
    <>{tutBanner}<div className="pt-coins" data-hl="coins" role="tablist" aria-label="종목">
      {tabs.map((t) => {
        const r = rangeOf(t.id), sw = swingOf(r);
        const ss = SESSIONS[t.id] ? sessionOf(t.id, now, r) : null;
        return (
        <button key={t.id} role="tab" aria-selected={t.id === market} className={'pt-ct sw-' + sw + (t.id === market ? ' on' : '') + (ss?.badge ? ' shut' : '')} data-swing={sw} data-session={ss?.state} onClick={() => {
          setTrade({ market: t.id });
          // 날다람쥐코인(FLY)을 처음 열었다: 숲 신문 한 줄(생마다 한 번)
          if (marketById[t.id].synthetic && !useProto.getState().seen.flyNews) { useProto.getState().patch({ seen: { ...useProto.getState().seen, flyNews: true } }); toast(`[도토리일보] ${marketById[t.id].name} 상장. 실체 없는 숲 밈코인, 값은 바람이 정한다.`, 6000); }
        }}>
          <Coin id={t.id} size={22} />
          <span className="nm">{marketById[t.id].short ?? marketById[t.id].name}</span>
          {/* 종목마다 지난 1분의 출렁임(실시간 값). 주식을 따라가는 종목이 본장 밖에서 자고 있으면 "장 마감" */}
          <small className={'swg ' + sw} title={ss ? ss.text : `지난 1분 폭 ${r === null ? '재는 중' : r.toFixed(3) + '%'}`}>
            <i className="bars" aria-hidden="true"><u /><u /><u /></i>{ss?.badge ?? swingText(r).replace(/^1분 /, '')}
          </small>
          {wild && wild.id === t.id && <i className="wild" data-wild title={`지난 1분 폭 ${wild.r.toFixed(2)}%`}>출렁</i>}
          {/* 포지션이 있는 종목(U-47: 여러 종목을 함께 든다): 방향과 지금 손익 색 */}
          {t.hasPos && <i className={'pd ' + ((t.posNet ?? 0) >= 0 ? 'up' : 'down')} data-posdir={t.posDir} aria-label={`${t.posDir === 1 ? '롱' : '숏'} 포지션, ${(t.posNet ?? 0) >= 0 ? '이익' : '손실'} ${comma(Math.abs(Math.round(t.posNet ?? 0)))}`}>{t.posDir === 1 ? '▲' : '▼'}</i>}
        </button>
        );
      })}
    </div></>
  );
  // 첫 주문(튜토리얼)의 시세 줄에는 따로 꼬리표를 달지 않는다(U-46 사용자: "재생 종료라는 말은 대체 뭐임."): 주문 줄 위의 「첫 주문 전표」가 말하고, 끝난 뒤 전표 뒷면이 쉬운 말로 밝힌다
  const feedTag: string | null = null;
  const quote = (
    <div className="pt-quote">
      <div className="px"><i className="qn">{marketById[market].name}</i><b>{fmtPrice(market, px)}</b><span className={tab.pct >= 0 ? 'up' : 'down'}><Tri up={tab.pct >= 0} size={10} />{pctTxt(tab.pct).slice(1)}</span></div>
      {status ? <div className="st-bad" role="status">{status}</div>
        : sess && sess.state !== 'open' ? <div className={'mood m-sess s-' + sess.state} data-sess={sess.state} role="status" onClick={() => { if (tutSt === 'done') dayNoteOpen(true); }}><b>{sess.state === 'closed' ? '본장 마감' : sess.state === 'after' ? '본장 마감, 그래도 움직인다' : '장중인데 조용함, 휴장인 듯'}</b><small data-opens-in>{opensInText(market, now) ? `다음 개장 ${sess.hours.split('~')[0]} (${opensInText(market, now)})` : `본장 ${sess.hours}`}</small></div>
        : <div className={'mood m-' + (mood === '잔잔함' ? 'calm' : mood === '격동' ? 'wild' : 'mid')} data-sess={sess ? 'open' : undefined} data-daynote-mood role="button" tabIndex={0} aria-label="도토리일보 시세면 열기" onClick={() => { if (tutSt === 'done') dayNoteOpen(true); }}><span data-feed={feedTag ? tutSt : undefined}>{feedTag ?? (sess ? `본장 ${sess.hours}` : m.synthetic ? '밈코인' : '24시간')}</span>{mood}{tutSt === 'done' && <i className="nw" aria-hidden="true">›</i>}</div>}
    </div>
  );
  // 차트 창: 나무의 초봉 차트(A3a)를 30초 · 긴 창으로 돌려 둔 동안에는 그것이 먼저다. 아니면 고른 시간(2분 · 5분 · 10분)
  const win = sk.zoom && zoom !== 0 ? (zoom === 1 ? 30 : longChartSec(run)) : span;
  const spanLabel = win === 120 ? cm.label : (() => {
    // 화면 전체 폭: chartModel 과 같은 셈을 지금 창에 대고 한다
    const d = hist.slice(-win);
    if (!d.length) return '';
    let a = Math.min(...d), b = Math.max(...d);
    const mid = (a + b) / 2, minSpan = mid * 0.0002;
    if (b - a < minSpan) { a = mid - minSpan / 2; b = mid + minSpan / 2; }
    const pad = (b - a) * 0.04;
    return `차트 세로 폭 ${(((b - a + pad * 2) / ((a + b) / 2)) * 100).toFixed(2)}%`;
  })();
  const WINS = [120, 300, 600];
  const winCtl = (
    <div className="pt-win">
      {sk.zoom && <button className="pt-zoom" data-zoom={zoom} onClick={() => setZoom((z) => (z + 1) % 3)}>{zoom === 1 ? '초봉 30초' : zoom === 2 ? `긴 창 ${(longChartSec(run) / 60).toFixed(1)}분` : `${span / 60}분`} ⇄</button>}
      <div className="seg" role="radiogroup" aria-label="차트에 보이는 시간">
        {WINS.map((w, i) => {
          const on = (!sk.zoom || zoom === 0) && span === w;
          // 기록이 아직 그만큼 안 쌓였으면 흐리게(눌러도 보이는 것은 같다)
          const thin = i > 0 && hist.length <= WINS[i - 1];
          return <button key={w} role="radio" aria-checked={on} className={(on ? 'on' : '') + (thin ? ' thin' : '')} data-win={w} title={thin ? '기록이 아직 그만큼 쌓이지 않았다' : undefined} onClick={() => { setSpan(w); setZoom(0); }}>{w / 60}분</button>;
        })}
      </div>
    </div>
  );
  const chart = (
    <>
      <PChart market={market} hist={hist} pos={pos} win={win} band={tn?.rangePct ?? null} foot={winCtl} footH={sk.zoom ? 50 : 26} note={spanLabel} onPlotTap={() => { if (useProto.getState().scenes.length) return; play('ui_tap'); setBigChart((v) => !v); }} />
      {ins && ins.shortNotional > 0 && (
        <div className="pt-meta">
          <span>지갑 평가액 {comma(Math.floor(ins.walletValue))}, 숏으로 상쇄하는 비율 {ins.ratioPct}%</span>
        </div>
      )}
    </>
  );

  // 계좌 개설 전: 차트만 보인다 + 조건 세 줄
  if (mode.mode === 'readonly') {
    return frame(
      <>
        {coins}{quote}{chart}
        <div className="pt-gate">
          <b>선물 계좌가 아직 없습니다</b>
          {mode.lines.map((l) => (
            <div key={l.id} className={'gl' + (l.ok ? ' ok' : '')}><i>{l.ok && <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.4l2.8 2.8L10 3.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}</i>{l.text}</div>
          ))}
        </div>
      </>,
    );
  }

  const plus = !!pos && netNow >= 0;
  const liqRoe = pos ? Math.abs(((pos.liq / pos.entry - 1) * pos.dir) * pos.lev * 100) : 100;
  const gx = (roe: number) => 50 + Math.max(-50, Math.min(50, (roe / liqRoe) * 50));

  const stepper = (label: string, cls: string, txt: string, on: boolean, dec: () => void, inc: () => void) => (
    <div className={'pt-step ' + cls + (on ? ' set' : '')}>
      <button aria-label={`${label} 낮추기`} onClick={dec}><Chev dir="l" /></button>
      <div className="v"><small>{label}</small><b>{txt}</b></div>
      <button aria-label={`${label} 높이기`} onClick={inc}><Chev /></button>
    </div>
  );
  const stops = (
    <div className="pt-stops">
      {stepper('손절', 'sl', pctOf(curSl) || '없음', curSl !== null, () => setRoe('sl', stepOf(SL_OPTIONS, curSl, -1)), () => setRoe('sl', stepOf(SL_OPTIONS, curSl, 1)))}
      {stepper('익절', 'tp', pctOf(curTp) || '없음', curTp !== null, () => setRoe('tp', stepOf(TP_OPTIONS, curTp, -1)), () => setRoe('tp', stepOf(TP_OPTIONS, curTp, 1)))}
    </div>
  );
  /** 도토리로 고르는 줄(U-41): 이자 반 번 · 한 번 · 두 번 치 */
  const AK: Record<'tp' | 'sl', number[]> = { tp: [0.5, 1, 2], sl: [0.5, 1] };
  const akName = (k: number) => (k === 0.5 ? '이자 반 번' : k === 1 ? '이자 한 번' : `이자 ${k}번`);
  const acRow = (kind: 'tp' | 'sl') => (
    <div className={'pt-acrow ' + kind} role="radiogroup" aria-label={kind === 'tp' ? '익절을 도토리로' : '손절을 도토리로'}>
      <span className="lb">{kind === 'tp' ? '익절' : '손절'}<small>{kind === 'tp' ? tpTxt : slTxt}</small></span>
      <button role="radio" aria-checked={(kind === 'tp' ? curTp : curSl) === null} className={'pt-chip' + ((kind === 'tp' ? curTp : curSl) === null ? ' on' : '')} data-ak={kind + '0'} onClick={() => { if (pos) { const pl = plan.current[market]; if (pl) pl[kind] = null; applyPos(kind === 'sl' ? null : pos.slRoe, kind === 'tp' ? null : pos.tpRoe); } else setTrade(kind === 'sl' ? { slK: null, sl: null } : { tpK: null, tp: null }); }}><b>없음</b></button>
      {AK[kind].map((k) => {
        // 그 폭이 지난 몇 분에 실제로 몇 번 나왔는가(칩마다): 조용한 장에서는 작은 출구를, 시끄러운 장에서는 큰 출구를 고를 수 있게
        const a = sctx ? acornStops(sctx, kind === 'tp' ? k * cl.total : null, kind === 'sl' ? k * cl.total : null) : null;
        const cnt = a ? chipCount(hist, kind === 'tp' ? a.tpMove : a.slMove) : null;
        return (
        <button key={k} role="radio" aria-checked={acIs(kind, k)} className={'pt-chip' + (acIs(kind, k) ? ' on' : '')} data-ak={kind + k} data-cnt={cnt ?? undefined} onClick={() => setAcorn(kind, k)}>
          <b>{akName(k)}</b><small>{kind === 'tp' ? '+' : '−'}{comma(Math.round(k * cl.total))}{cnt && <i> {cnt}</i>}</small>
        </button>
        );
      })}
    </div>
  );
  const marginChips = (
    <div className="pt-mg k5" data-hl="mg" role="radiogroup" aria-label="증거금">
      {MARGIN_PCTS.filter((p) => p < 100).map((p) => (
        <button key={p} role="radio" aria-checked={!keepOn && pct === p} className={'pt-chip' + (!keepOn && pct === p ? ' on' : '')} onClick={() => setTrade({ pct: p, keep: false })}>
          <b>{`${p}%`}</b><small>{comma(marginFromPct(run.cash, lev, p, feeRate(g, lev)))}</small>
        </button>
      ))}
      {/* 정산 빼고 전부(U-42 ③): 다음 정산에 낼 돈은 손에 남긴다 — 정산을 굶기지 않고 판을 키우는 길 */}
      <button role="radio" aria-checked={keepOn} className={'pt-chip keep' + (keepOn ? ' on' : '')} data-keep={keepM} disabled={tutSt !== 'done'} onClick={() => { setTrade({ keep: true }); if (keepM < 1) say(`다음 정산에 낼 ${comma(Math.round(dueAll))}도 모자란다.`); }}
        aria-label={`정산 빼고 전부: ${comma(Math.round(dueAll))}은 남기고 ${comma(keepM)}`}>
        <b>정산 빼고</b><small>{keepM > 0 ? comma(keepM) : '걸 돈 없음'}</small>
      </button>
      <button role="radio" aria-checked={!keepOn && pct === 100} className={'pt-chip' + (!keepOn && pct === 100 ? ' on' : '')} onClick={() => setTrade({ pct: 100, keep: false })}>
        <b>전부</b><small>{comma(marginFromPct(run.cash, lev, 100, feeRate(g, lev, { allIn: true })))}</small>
      </button>
    </div>
  );
  // 들어가기 전의 셈(U-39 ①): 이 증거금 · 이 배율로 이자 한 번 치까지 시세가 얼마나 가야 하는가, 넣고 나면 정산 때 낼 돈이 남는가
  const odds = !pos ? orderOdds({ margin: prev.margin, lev, claim: cl.total, feeRate: feeRate(g, lev, { allIn: pct >= 100 }), maintenanceRate: balance.trading.maintenanceRate as number, hist: liveHist }) : null;
  const sqOrder = !pos ? squeezeOf({ cash: run.cash - prev.margin - prev.fee, income, due: dueAll, settleIn: run.settleIn, holding: false }) : null;
  const sqHold = pos ? squeezeOf({ cash: run.cash, income, due: dueAll, settleIn: run.settleIn, holding: true }) : null;
  const stillNow = swingOf(rangeOf(market)) === 'still';
  // 도토리로 건 출구가 있으면 그 줄이 "이자까지" 줄을 대신한다. 그 폭이 지난 몇 분에 실제로 몇 번 나왔는지도 센다(약속이 아니라 센 것)
  const planTxt = !pos && acOrder && (tpK !== null || slK !== null) ? planLine({ tpNet: tpK !== null ? tpK * cl.total : null, slNet: slK !== null ? slK * cl.total : null, st: acOrder, hist }) : null;
  const oddsSwing = odds ? swingCountText(hist, odds.needPct) : null;
  const carry = pos && rawPos ? carryOf({ cash: run.cash, income, due: dueAll, settleIn: run.settleIn, notional: rawPos.notional, fundingRate: fundingRateNow()}) : null;
  const noteLine = note && <div key={note.k} className={'pt-note' + (note.bad ? ' bad' : '')} role="status">{note.text}</div>;

  // 주문 조건은 늘 펼쳐져 있다: 배율 눈금자(포지션이 없을 때) + 증거금 칩 + 위험 한 줄. 롱·숏을 누르면 바로 들어간다.
  const liqAbs = Math.abs(prev.liqPct).toFixed(Math.abs(prev.liqPct) < 10 ? 1 : 0);
  const oddsShown = !pos && !prev.reason && tutSt === 'done' && !!odds && !stillNow && !result;
  const quietShown = !pos && !prev.reason && tutSt === 'done' && stillNow && !result;
  // 접을 수 있는 때: 아래에 "이자까지"(또는 조용하다는) 줄이 있고, 낼 수수료가 없고, 막힌 까닭이 없을 때. 수수료를 내는 동안에는 늘 펼쳐 둔다
  const canFold = (oddsShown || quietShown) && prev.fee <= 0;
  const foldRisk = canFold && !more;
  const order = (
    <div className="pt-order">
      {!pos && (
        <div className="pt-ruler" data-hl="ruler" role="radiogroup" aria-label="배율">
          {ruler.map((nt) => (
            <button key={nt.lev} role="radio" aria-checked={nt.lev === lev} aria-label={`${nt.lev}배${nt.locked ? ' 잠김' : ''}`}
              className={'nt' + (nt.lev === lev ? ' on' : '') + (nt.hot ? ' hot' : '') + (nt.locked && !nt.seal ? ' locked' : '') + (nt.seal ? ' seal' : '')} data-lev={nt.lev}
              onClick={() => { if (nt.seal) askWaiver(nt.lev); else if (nt.locked) say(nt.lockText!, false); else setTrade({ lev: nt.lev }); }}>
              <i>{nt.locked && !nt.seal && <Lock size={12} />}</i><b>{nt.lev}{nt.lev === lev ? '배' : ''}</b>
            </button>
          ))}
        </div>
      )}
      {(!pos || addOpen) && marginChips}
      {pos && sk.water && <button className="pt-water" data-water disabled={waterAmt < 1} onClick={doWater}><b>물타기</b><span>증거금만 +{comma(waterAmt)}, 청산가가 멀어진다</span></button>}
      {!pos && sk.split && <button className={'pt-water split' + (split ? ' on' : '')} data-split aria-pressed={split} onClick={() => setSplit((v) => !v)}><b>쪼개 넣기</b><span>{split ? '세 번에 나눠 들어간다' : '꺼짐'}</span></button>}
      {/* 증거금 · 수수료 줄과 "이자까지" 줄은 한 덩이다. 수수료가 없는 동안에는 "이자까지" 한 줄만 보이고, 누르면 증거금 · 수수료 줄이 펼쳐진다(차트에 자리를 준다) */}
      <div className={'pt-info' + (foldRisk ? ' fold' : '') + (canFold ? ' tap' : '') + (prev.fee <= 0 ? ' nofee' : '')} data-hl="risk" data-more={canFold ? (more ? 'open' : 'shut') : undefined} onClick={canFold ? () => setMore((v) => !v) : undefined}>
        <div className={'pt-risk' + (prev.reason ? ' bad' : '') + (pos ? ' add' : '')} role="status">
          {prev.reason ? <span>{prev.reason}</span> : (
            <>
              <span>{pos ? '추가 ' : ''}증거금 {comma(prev.margin)}, 수수료 {prev.fee > 0 ? comma(prev.fee) : evLeft > 0 ? <b className="free" data-fee-free aria-label={`오픈 기념 수수료 무료, 정산 ${evLeft}번 남음`}>무료 (정산 {evLeft}번 남음)</b> : '0'}</span>
              {pos ? <span>배율 {pos.lev}배 그대로</span> : <b>반대 방향 약 {liqAbs}%에 청산</b>}
            </>
          )}
        </div>
        {oddsShown && (planTxt
          ? <div className="pt-odds plan" data-odds data-plan>{planTxt}</div>
          : <div className={'pt-odds' + (odds!.liqFirst ? ' no' : '')} data-odds>{odds!.text}{!odds!.liqFirst && oddsSwing ? `, ${oddsSwing}` : ''}</div>)}
        {/* 지금 고른 종목이 자고 있다: 이자까지의 셈 대신, 다른 종목이 깨어 있으면 어디가 움직이는지, 전부 조용하면 그렇다고 말한다(가짜 출렁임은 없다) */}
        {quietShown && (
          <div className="pt-quiet" data-quiet={quietAll ? 'all' : 'one'}>{quietAll ? '지금은 모든 종목 값이 거의 그대로다.' : wild ? `${josa(m.name, '은', '는')} ${sess?.state === 'closed' ? '본장 마감이라' : '지금'} 거의 안 움직인다. 움직이는 곳은 ${marketById[wild.id].name} (1분 ${wild.r.toFixed(2)}%)` : `${josa(m.name, '은', '는')} 지금 거의 안 움직인다.`}</div>
        )}
      </div>
      {!pos && !prev.reason && tutSt === 'done' && sqOrder && <div className="pt-squeeze" data-squeeze="order">{sqOrder.text}</div>}
    </div>
  );

  let lower: ReactNode;
  if (sheet === 'stops') {
    lower = (
      <section className="pt-sheet" aria-label="출구">
        <div className="sh-top">
          <div className="sh-title"><b>손절과 익절</b><span>{pos ? `${m.name} ${pos.dirText} ${pos.lev}배` : '다음 주문에 적용'}</span></div>
          <button className="pt-x" aria-label="출구 닫기" onClick={() => setSheet(null)}><Cross /></button>
        </div>
        {cl.total > 0 && <>{acRow('tp')}{acRow('sl')}<p className="pt-acnote" data-acnote>이자 한 번 = 다음 수금(이자 + 생활비) {comma(cl.total)}.{hist.length >= 60 ? ` 「n번」은 지난 ${Math.max(1, Math.round(hist.length / 60))}분에 그 폭이 나온 횟수.` : ''}</p></>}
        {stops}
        {sk.dayLimit && (
          <div className="pt-stops day" data-daylimit>
            {stepper('하루 한도', 'sl', dayLim === null ? '없음' : `−${comma(dayLim)}`, dayLim !== null, () => act({ type: 'setDayLimit', value: stepOf(DAY_OPTS, dayLim, -1) }), () => act({ type: 'setDayLimit', value: stepOf(DAY_OPTS, dayLim, 1) }))}
            <p>오늘 잃은 돈 {comma(Math.round((run.stats.dayLoss as number | undefined) ?? 0))}. 넘으면 다음 아침까지 새 거래가 잠긴다.</p>
          </div>
        )}
        {noteLine}
      </section>
    );
  } else {
    lower = (
      <>
        {result ? (
          <div key={'r' + result.k} ref={plRef} className={'pt-pl res ' + (result.pnl >= 0 ? 'win' : 'lose') + ' k-' + result.kind + (sk.legend || result.bonus > 0 ? ' legend' : '')} role="status" onClick={() => setResult(null)}>
            <img className="me" data-art={result.kind === 'liq' ? 'heroSad' : result.pnl > 0 ? 'heroHappy' : 'hero'} src={(result.kind === 'liq' ? sprite('heroSad') : result.pnl > 0 ? sprite('heroHappy') : sprite('hero'))!.src} alt="" />
            <div className="big">
              <div className="roe">{money(result.pnl)}</div>
              <div className="sub" data-why>시세 <b className={result.move >= 0 ? 'up' : 'down'}>{money(result.move)}</b>  수수료 {result.fees > 0 ? <b className="down">−{comma(result.fees)}</b> : <b>0</b>}<span className="xtra">넣은 돈 {comma(Math.round(result.margin))}, {result.dirText} {result.lev}배</span></div>
              {/* 쳇바퀴 단위와 아낀 수수료(U-40: 오픈 기념 덕인지 나무 덕인지, 정가였다면 얼마를 더 냈을지)를 한 줄에 — 카드가 길어지지 않게 */}
              {(result.worth || (result.savedBy && result.saved >= 10) || result.rolled >= 10 || result.bonus > 0) && (
                <div className="tags">
                  {result.bonus > 0 && <span className="bonus" data-bonus={result.bonus}>오소리 축하금 +{comma(result.bonus)}</span>}
                  {result.worth && <span className="worth" data-worth>{result.pnl >= 0 ? '' : '잃은 돈 = '}{result.worth}</span>}
                  {result.savedBy && result.saved >= 10 && <span className="saved" data-saved={result.savedBy}>{result.savedBy === 'event' ? '오픈 기념' : '나무'} −{comma(result.saved)}</span>}
                  {result.rolled >= 10 && <span className="rolled" data-rolled-res={result.rolled}>그동안 굴려 +{comma(result.rolled)}</span>}
                </div>
              )}
            </div>
            <div className="rs-end">
              <div className="stamp">{result.kind === 'liq' ? (sk.legend ? '전설의 청산' : '강제 청산') : result.kind === 'tp' ? '익절' : result.kind === 'sl' ? '손절' : '정리 완료'}</div>
              {/* 한 판 더(U-48): 같은 종목, 같은 방향, 지금 고른 배율과 증거금으로 바로 */}
              {tutSt === 'done' && !prev.reason && (
                <button className={'pt-again' + (result.kind === 'liq' ? ' hot' : '')} data-again onClick={(e) => { e.stopPropagation(); doOpen(result.dir, result.lev); }} aria-label={`다시 걸기, ${result.dir === 1 ? '롱' : '숏'} ${result.lev}배`}>
                  <b>{result.kind === 'liq' ? '다시 걸기' : '한 판 더'}</b><small>{result.dir === 1 ? '롱' : '숏'} {result.lev}배</small>
                </button>
              )}
            </div>
          </div>
        ) : pos ? (
          <div key={'p' + entered} ref={plRef} className={'pt-pl ' + (plus ? 'plus' : 'minus') + (call ? ' call' : '') + (entered ? ' in' : '')} aria-label="내 포지션">
            <div className="pl-top">
              {/* 들고 있는 동안 쳇바퀴를 굴린다(U-42): 주인공을 누르면 한 번 굴린다 — 눈은 폰에, 발은 쳇바퀴에. 굴려 번 돈은 따로 센다 */}
              {freeWheel ? (
              <button className={'pt-roll' + (rollK ? ' on' : '')} data-roll data-rolled={Math.round(rolledNow)} disabled={tutSt !== 'done'} onPointerDown={doRoll} aria-label={`쳇바퀴 굴리기 (들고 있는 동안 굴려 번 돈 ${comma(Math.round(rolledNow))})`}>
                <img className={'me' + (call ? ' shake' : '')} src={heroFront} alt="" />
                <i key={rollK} className={'wh' + (rollK ? ' spin' : '')} aria-hidden="true"><img src={(sprite('wheelEmpty') ?? sprite('wheel'))!.src} alt="" /></i>
                {rollGain && <span key={'g' + rollK} className="gain" aria-hidden="true">{rollGain}</span>}
                <small>{rolledNow >= 1 ? `+${comma(Math.round(rolledNow))}` : '굴리기'}</small>
              </button>
              ) : <img className={'me' + (call ? ' shake' : '')} src={heroFront} alt="" />}
              <div className={'big' + (whyOpen ? ' more' : '')} data-hl="posNet" onClick={() => setWhyOpen((v) => !v)}>
                <div key={flash ? 'f' + flash.k : 'f'} className={'roe' + (flash ? (flash.up ? ' fl-up' : ' fl-dn') : '')} data-netroe>{Math.abs(roeShow) >= 100 ? `${sign(roeShow)}${Math.abs(roeShow).toFixed(0)}%` : roeTxt(roeShow)}</div>
                <div className="sub" data-net><b>{money(netRoll)}</b>{share ? <i className="shr"> {share}</i> : ' 도토리'}</div>
                <div className="why" data-poswhy>시세 <b className={pos.pnl >= 0 ? 'up' : 'down'}>{money(pos.pnl)}</b>  수수료 {feesNow > 0 ? <b className="down">−{comma(feesNow)}</b> : <b>0{evLeft > 0 ? ' (오픈 기념)' : ''}</b>}</div>
              </div>
              {pops.length > 0 && <div className="pt-pops" aria-live="polite">{pops.map((x) => <span key={x.k} className={'pop ' + x.cls} data-pop={x.cls}>{x.text}</span>)}</div>}
              <div className={'liq' + (call ? ' hot' : '')} data-hl="posLiq"><small>청산까지</small><b>{pos.dir === 1 ? '−' : '+'}{pos.liqDistPct.toFixed(1)}%</b></div>
            </div>
            <div className="gauge" aria-hidden="true">
              <i className="end">청산</i>
              <div className="track">
                <span className="fill" style={pos.roe >= 0 ? { left: '50%', width: `${gx(pos.roe) - 50}%` } : { left: `${gx(pos.roe)}%`, width: `${50 - gx(pos.roe)}%` }} />
                <span className="mid" />
                {pos.slRoe !== null && <span className="tk sl" style={{ left: `${gx(pos.slRoe)}%` }} />}
                {pos.tpRoe !== null && <span className="tk tp" style={{ left: `${gx(pos.tpRoe)}%` }} />}
                <span className="knob" style={{ left: `${gx(pos.roe)}%` }} />
              </div>
            </div>
            {/* 청산까지의 거리 줄과 이 포지션의 한 줄(종목 · 방향 · 배율 · 증거금)을 한 줄에(U-43: 차트에 자리를 준다). 정산이 걸린 줄이 있으면 그 줄이 대신한다 */}
            <div className="pl-row2">
            {tn && (
              <div className={'pt-tense r-' + tn.reach} data-tense={tn.reach} data-hl="posTense" role="status">
                <span className="dots" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < tn.dots ? 'on' : ''} />)}</span>
                <span className="tx">청산까지 {tn.text}</span>
              </div>
            )}
            {sqHold ? <div className="pt-squeeze" data-squeeze="hold">{sqHold.text}</div> : carry && run.settleIn <= CARRY_SHOW_SEC ? <div className="pt-carry" data-carry>{carry.text}</div> : (
            <div className="fact">
              <Coin id={market} size={16} /><b className={pos.dir === 1 ? 'up' : 'down'}>{pos.dirText}</b> {pos.lev}배{(pos.tags.length > 0 || rolledNow >= 10) && <span>{pos.tags.join(', ')}{pos.tags.length > 0 && rolledNow >= 10 ? ', ' : ''}{rolledNow >= 10 ? `굴려 +${comma(Math.round(rolledNow))}` : ''}</span>}
            </div>
            )}
            </div>
          </div>
        ) : null}
        {order}
        {/* 위험 고지 확인서는 막는 문이 아니라 한 장면이다(U-47): 50배 위의 칸을 처음 누르면 오소리 대부가 밀어 준다 */}
        {(
        <div className="pt-condrow">
          <button className="pt-cond" data-hl="cond" onClick={() => setSheet('stops')}>
            <span className="vals">
              {curSl === null && curTp === null ? <span>손절과 익절 미설정</span> : <><span className={curSl !== null ? 'set' : ''}>손절 {slTxt}</span><span className={curTp !== null ? 'set' : ''}>익절 {tpTxt}</span></>}
            </span>
            <span className="more">바꾸기<Chev size={11} /></span>
          </button>
        </div>
        )}
        {noteLine}
        <div className="pt-orders" data-hl={pos ? undefined : 'orders'}>
          {pos ? (
            <>
              <button className={'pt-btn ' + (pos.dir === 1 ? 'long' : 'short') + (addOpen ? ' armadd' : '')} data-add={addOpen ? 'open' : 'shut'} disabled={!!prev.reason && addOpen} onClick={() => { if (!addOpen) { play('ui_tap'); setAddOpen(true); return; } setAddOpen(false); doAdd(); }}>
                <span><Tri up={pos.dir === 1} size={13} />{addOpen ? '추가로 넣기' : '추가 진입'}</span><small>{addOpen ? `+${comma(prev.margin)}` : '금액 고르기'}</small>
              </button>
              {sk.flip && <button className="pt-btn flip" data-flip onClick={doFlip}><span>⇅</span><small>뒤집기</small></button>}
              <button className={'pt-btn close' + (arm ? ' arm' : '') + (netNow >= 0 ? ' gain' : '')} data-hl="closeBtn" onClick={doClose}>
                <span>{arm ? '한 번 더 누르면 정리' : '정리하기'}</span>
                <small>{rawPos ? comma(Math.round(rawPos.margin0)) : ''} <b className={arm ? '' : netNow >= 0 ? 'up' : 'down'}>{money(netNow)}</b>{arm ? ' 확정' : ''}</small>
              </button>
            </>
          ) : (
            <>
              <button className="pt-btn long" disabled={!!prev.reason} onClick={() => doOpen(1)}><span><Tri up size={13} />롱</span><small>오른다 {lev}배</small></button>
              <button className="pt-btn short" disabled={!!prev.reason} onClick={() => doOpen(-1)}><span><Tri up={false} size={13} />숏</span><small>내린다 {lev}배</small></button>
            </>
          )}
        </div>
      </>
    );
  }

  // 차트를 크게 본 동안에는 아래 덩이(주문 조건)를 접고, 머리에 돌아오는 단추 하나(U-43)
  const bigOn = bigChart && !sheet && !result && tutSt === 'done';
  const unbig = bigOn ? <button className="pt-unbig" data-unbig onClick={() => setBigChart(false)}>주문으로 돌아가기</button> : null;
  return frame(<>{coins}{quote}{chart}{unbig}{lower}{burst && <WinBurst key={burst.k} {...burst} onDone={() => setBurst(null)} />}</>, (sheet ? ' sheet-open' : '') + (call ? ' near' : '') + (bigOn ? ' big' : '') + (pos && danger >= 0.7 ? ' edge' : ''));
}

import { isNearLiq } from './model';
// 시제품 폰 탭 = 주인공의 폰 속 거래 앱 'FRX 숲거래소'(기획 v3.1 §5).
// 읽기 모델(vm/trade)과 엔진 행동(open/add/close/stops)은 기존 거래 화면과 같은 것을 쓴다. 생김새만 새로 만든다.
//   - 차트는 깨끗한 사각형, 가격 꼬리표는 차트 밖 축 띠에.
//   - 손익(ROE)이 화면에서 가장 큰 글자, 바로 옆에 `청산까지`.
//   - 주문 조건은 주문할 때만 올라오는 시트(§5.2). 진입은 두 번 누르면 끝난다.
//   - 정리는 한 번 누르기(U-56 ①). 카드가 막 뜬 0.3초 안의 누름만 흘린다.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useGame } from '../../store/gameStore';
import { tutorialOpen, tutorialIntro, tutorialMargin } from './tutorial';
import { TUT, hamsterMath, claim, lifeNo } from './model';
import { flySecOf, windNow, donePatterns } from './flyWind';
import { flySeconds } from '../../engine/feed/fly';
import { ForestLine, forestOpen } from './ForestBoard';
import { rankFeeText, rankFeePct } from './frxRank';
import { tensionOf, orderOdds, claimShare, squeezeOf, dangerOf, burstTier, slowHint, typicalRange, soonText, waitText, type Odds } from './tension';
/** 라이트의 「이자까지」 한 줄: 셈 설명 없이 얼마 맞히면 얼마인지만 */
const liteOdds = (o: Odds, claimTotal: number): string => {
  const pc = (x: number) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2));
  return o.liqFirst ? '이자 벌기 전에 청산이 먼저 와요.' : `${pc(o.needPct)}% 맞히면 +${comma(Math.round(claimTotal))}`;
};
import { closedMath, tradeNet, say as toast, liqQuietLeft } from './watch';
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
import { swingOf, swingText, sessionOf, liveliest, allQuiet, feeEventChip, SESSIONS, opensInText, swingRank, sessionHoursKst } from './market';
import { feeEventLeft, openingEvent } from '../../engine/skilltree';
import {
  chartModel, fmtPrice, levRuler, marketMood, marketTabs, MARGIN_PCTS, orderPreview, positionView, SL_OPTIONS, TP_OPTIONS, tradeMode,
  type PositionView,
} from '../vm/trade';
import { Acorn } from './art';
import { flyAcorns, reduced, useCountUp } from './fx';
import { dayBars } from '../dayHistory';
import { WinBurst } from './Juice';
import { play, playTap, later } from './audio';
import { useOpenPositions } from './Lot';
import { pushPop, treePing } from './popBus';
import { rankOfRun, lookOf, rankName, goalShort, goalText, CASE_COL } from './frxRank';
import { sprite } from './sprites';
const heroFront = sprite('hero')!.src; // 포지션 카드의 주인공: 폰을 보는 새 그림(U-33)
import './trade.css';
import './tradeArt.css';
import './tradeManga.css';
import mgaNear from './img/manga/cut_near.webp';
import mgaWin from './img/manga/cut_win.webp';
import { isLite } from './config';
import { litePerks } from '../../engine/liteFruit';
import { quickBorrowWhy } from './loanActs';
import { QuickBorrow } from './lite/LiteLoan';
import coinInfoJson from '../../../data/coin_info.json';

export const EXCHANGE_NAME = 'FRX 숲거래소';
/** 만화 톱니 말풍선의 꼭짓점(200×90 칸, U-60) */
const MGA_BURST = Array.from({ length: 44 }, (_, i) => { const a = (i / 44) * Math.PI * 2, r = i % 2 ? 0.7 : 1; return `${(100 + Math.cos(a) * 98 * r).toFixed(1)},${(45 + Math.sin(a) * 43 * r).toFixed(1)}`; }).join(' ');

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
/** 나무 칩의 잎사귀(U-50) */
const Leaf = () => (
  <svg className="leaf" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 10.5C2 5 5.5 2 10.5 1.5C10.5 6.5 7.5 10 2 10.5Z" fill="#7FB069" stroke="#3E5B2E" strokeWidth="1.3" strokeLinejoin="round" /><path d="M2.4 10.1L7.6 4.6" stroke="#3E5B2E" strokeWidth="1.1" strokeLinecap="round" /></svg>
);
const Cross = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
);
/** 폰 고리: 작은 붉은 나비매듭(§11.4). 폰 틀 모서리에 달려 있고, 거래할 때만 살짝 흔들린다. */
export function Charm({ r }: { r: RefObject<SVGSVGElement> }) {
  return (
    <svg ref={r} className="pt-charm" width="40" height="52" viewBox="0 0 34 44" aria-hidden="true">
      <path d="M17 0v19" stroke="#4A4640" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 24 6 17.5v13z M17 24l11-6.5v13z" fill="var(--bow, #C2413B)" stroke="#4A4640" strokeWidth="2" strokeLinejoin="round" />
      <path d="M15 26l-4 10 5-2.4z M19 26l4 10-5-2.4z" fill="var(--bow, #C2413B)" stroke="#4A4640" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="17" cy="24" r="3.4" fill="var(--bow, #C2413B)" stroke="#4A4640" strokeWidth="2" />
    </svg>
  );
}

const sign = (x: number) => (x >= 0 ? '+' : '−');
const roeTxt = (x: number) => `${sign(x)}${Math.abs(x).toFixed(1)}%`;
const pctTxt = (x: number) => `${sign(x)}${Math.abs(x).toFixed(Math.abs(x) >= 10 ? 1 : 2)}%`;
const money = (x: number) => `${sign(x)}${comma(Math.abs(Math.round(x)))}`;

// ── 차트 ────────────────────────────────────────────────────────────────
interface Tag { key: string; cls: string; label: string; price: number; edge?: 'up' | 'down' }
/** 날다람쥐 차트의 끝난 모양(U-57): 끝난 뒤에만. ago = 마지막 값에서 몇 초 전(시작, 끝), 꼭짓점은 옅은 점선으로 */
export interface ChartPat { key: string; from: number; to: number; ok: boolean; label: string; pts: { ago: number; p: number }[] }
/** 깨끗한 사각형 안에는 시세 선과 가로선뿐이다. 가격 꼬리표는 오른쪽 축 띠(차트 밖)에 둔다. */
export function PChart({ market, hist, pos, win = 120, band = null, foot = null, footH = 0, note = '', onPlotTap, pats = [], over = null }: { /** 차트 칸 위에 얹는 만화 말풍선(만화 지면 A, U-60) */ over?: ReactNode; /** 끝난 차트 모양(U-57) */ pats?: ChartPat[]; /** 차트를 눌렀다(크게 · 작게, U-43) */ onPlotTap?: () => void; market: string; hist: number[]; pos: PositionView | null; win?: number; /** 지난 1분 폭(%): 지금 값 둘레에 그 폭만큼 띠를 그린다(청산선이 그 안에 들어오는지가 보인다) */ band?: number | null; /** 축 띠 맨 아래에 놓는 것(차트 창 고르기). 차트 안에는 아무것도 넣지 않는다 */ foot?: ReactNode; /** foot 의 높이(px): 꼬리표가 그 위에서 멈춘다 */ footH?: number; /** 축 띠에 적는 한 줄(화면 전체 폭). 자리가 넉넉할 때만 보인다 */ note?: string }) {
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
  // 보이는 창 전부로 세로 폭을 센다(5분, 10분, 30분 창에서 2분 밖의 값이 차트 밖으로 삐져나가 기둥처럼 보이던 것)
  const cm = chartModel(data, data.length);
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
  const fH = foot && h >= footH + 50 ? footH : 0;
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
          {pats.filter((pt) => pt.to >= 0 && pt.from <= n - 1).map((pt) => <polyline key={'k' + pt.key} className="pat-sk" points={pt.pts.filter((q) => q.ago <= n - 1).map((q) => `${X(n - 1 - q.ago).toFixed(2)},${Y(q.p).toFixed(2)}`).join(' ')} />)}
          {n >= 2 && <path className="px" d={line} />}
        </svg>
        {(() => {
          // 이름표가 겹치면 더 최근 것만 남긴다(괄호는 그대로): 회차 16 평가 「상승 깃발 완」이 「박스권 아래로 이탈」에 덮였다
          const vis = pats.filter((pt) => pt.to >= 0 && pt.from <= n - 1).map((pt) => ({ pt, x0: X(n - 1 - Math.min(pt.from, n - 1)), x1: X(n - 1 - pt.to) })).sort((a, b) => b.x1 - a.x1);
          let room = 101;
          return vis.map(({ pt, x0, x1 }) => {
            const w = pt.label.length * 2.6 + 4;
            const lx = x1 > 80 ? x1 - w : x0 < 12 ? x0 : (x0 + x1) / 2 - w / 2;
            const show = lx + w <= room;
            if (show) room = lx - 1;
            return (
              <span key={pt.key} className={'pt-pat' + (pt.ok ? '' : ' fake') + (x1 > 80 ? ' lf' : x0 < 12 ? ' rt' : '')} data-pat={pt.label} style={{ left: `${x0}%`, width: `${Math.max(1, x1 - x0)}%` }} aria-hidden="true">{show && <b>{pt.label}</b>}</span>
            );
          });
        })()}
        {n >= 1 && <i className="dot" style={{ left: `${X(n - 1)}%`, top: `${Y(last)}%` }} />}
        {n < 12 && <span className="warm">시세를 모으는 중…</span>}
        <PhoneLane />
        {over}
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
/** 한 번 누르기 정리(U-56 ①): 카드나 한곳 정리 판이 뜬 뒤 이 시간 안의 누름은 흘린다(잘못 누름 막기, 확인 단계는 없다) */
export const CLOSE_GUARD_MS = 300;
/** 시트는 손절·익절 하나뿐이다. 진입은 시트 없이 한 번에 한다. */
type Sheet = null | 'stops';
/** pnl = 이 거래로 늘거나 준 돈(들어갈 때·나올 때 수수료 포함). move = 시세로 번 돈, fees = 낸 수수료, worth = 쳇바퀴로 치면 얼마(react.ts) */
interface Result { k: number; kind: 'close' | 'tp' | 'sl' | 'liq'; dir: 1 | -1; pnl: number; margin: number; roe: number; name: string; dirText: string; lev: number; move: number; fees: number; worth: string | null; /** 정가로 냈다면 더 냈을 수수료(오픈 기념 · 나무의 할인)와 그 까닭 */ saved: number; savedBy: 'event' | 'tree' | null; /** 이 판을 들고 있는 동안 쳇바퀴를 굴려 번 돈(U-42) */ rolled: number; /** 고배율 축하금(나무 B3a, U-47) */ bonus: number; /** 닫힌 틱(의뢰 꼬리표를 맞춘다, U-56) */ tick?: number; market?: string }
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
  const sk = { half: has(g, 'A1'), oneTap: has(g, 'A2'), zoom: has(g, 'A3a'), flip: has(g, 'A3b'), water: has(g, 'B3b'), legend: has(g, 'B4'), split: has(g, 'C3a'), dayLimit: has(g, 'C3b') };
  /** 차트 창(초봉 차트 A3a): 0 = 2분, 1 = 초봉 30초, 2 = 긴 창(2분 + 꼬리) */
  const [zoom, setZoom] = useState(0);
  /** 차트에 보이는 시간(초): 2분 · 5분 · 10분. 기록은 초마다 한 값, 600개까지 */
  const [span, setSpan] = useState(120);
  const [bigChart, setBigChart] = useState(false);
  /** 종목 소개 카드(보기만 한다): 시세 줄의 종목 이름, 또는 이미 고른 종목 꼬리표를 한 번 더 누르면 */
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    if (!info) return;
    // 카드 밖을 누르면 닫히고, 그 누름은 그대로 아래 단추에 간다(거래를 막지 않는다)
    const f = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.pt-coininfo')) setInfo(null); };
    const t = window.setTimeout(() => document.addEventListener('pointerdown', f, true), 0);
    return () => { window.clearTimeout(t); document.removeEventListener('pointerdown', f, true); };
  }, [info]);
  /** 포지션 카드의 둘째 줄(시세 · 수수료로 나눈 손익)은 카드를 누르면 펼친다(U-43: 차트에 자리를 준다) */
  const [whyOpen, setWhyOpen] = useState(false);
  /** 들고 있는 동안 증거금 칩은 접어 둔다: [추가 진입]을 한 번 누르면 펴지고, 한 번 더 누르면 들어간다(U-43: 차트에 자리를 준다) */
  const [addOpen, setAddOpen] = useState(false);
  /** 주문 조건의 증거금 · 수수료 줄을 펼쳤는가(수수료가 없을 때는 접혀 있다) */
  const [more, setMore] = useState(false);
  const [split, setSplit] = useState(false);
  const [perks, setPerks] = useState(false);
  /** 열린 포지션을 한곳에서 정리하는 판(U-53): 머리의 합계를 누르면 열린다. 한 번 누르면 닫힌다(U-56 ①) */
  const [tray, setTray] = useState(false);
  const [trayArm, setTrayArm] = useState<string | null>(null);
  /** 한곳 정리 판이 열린 때(U-56 ①) */
  const trayAt = useRef(0);
  const trayArmT = useRef<number | undefined>(undefined);
  const [rollK, setRollK] = useState(0);
  const [rollGain, setRollGain] = useState<string | null>(null);
  /** 이긴 판이 터지는 화면(U-48): 어느 종목이 닫혀도, 어느 탭에서든(U-49) — watch.ts 가 띄운다 */
  const burst = useProto((s0) => s0.burst);
  /** 들고 있는 동안 숫자 옆에 터지는 고비(U-48): +50%, 두 배!, 이자 한 번, 반 날아감, 살았다! — Juice.tsx usePosPops 가 모든 포지션을 본다(U-49) */
  const popsAll = useProto((s0) => s0.pops);
  /** 나무가 방금 판에 한 일(U-50): 머리의 「나무」 칩이 2.4초 반짝이며 한 줄을 말한다 */
  const ping = useProto((s0) => s0.treePing);
  const [pingOn, setPingOn] = useState(false);
  /** FRX 회원 등급(U-65): 예탁금과 거래액으로(오른 등급은 이번 생 동안 지킨다). 오른 순간 칩이 튄다 */
  const frxBest = useProto((s0) => s0.frxBest);
  const rankUp = useProto((s0) => s0.rankUp);
  const rk = rankOfRun(run, frxBest);
  /** 등급의 폰(U-53): 케이스 색과 고리 색. 꾸밈뿐 */
  // 라이트 도감 20개의 덤(U-62): 새싹 등급의 청록 케이스 대신 만화 먹선 케이스
  const inkCase = useGame((s0) => isLite && litePerks(s0.g.family.liteBook).inkCase);
  const look0 = lookOf(rk.r), nextLook = lookOf(rk.r + 1);
  const look = inkCase && look0.case === 'teal' ? { ...look0, case: 'ink', caseName: '먹선 만화' } : look0;
  const rankSeen = useProto((s0) => s0.rankSeen);
  /** 승급 축하(U-53): 폰을 보고 있을 때(이긴 판의 상자, 장면이 지나간 뒤), 아니면 다음에 폰을 열 때 한 번 */
  const [rankCard, setRankCard] = useState<{ k: number; r: number; why?: string } | null>(null);
  const [rankUpOn, setRankUpOn] = useState(false);
  useEffect(() => { if (!rankUp) return; const t0 = window.setTimeout(() => setRankUpOn(true), useProto.getState().burst ? 400 : 700); const t1 = window.setTimeout(() => setRankUpOn(false), (useProto.getState().burst ? 400 : 700) + 3200); return () => { window.clearTimeout(t0); window.clearTimeout(t1); }; }, [rankUp?.k]);
  useEffect(() => { if (!ping) return; setPingOn(true); const t = window.setTimeout(() => setPingOn(false), 2400); return () => window.clearTimeout(t); }, [ping?.k]);
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
  // 날다람쥐코인의 바람 세기와 끝난 차트 모양(U-52, U-57): 시세 함수와 같은 씨앗에서 센다
  const flySec = marketById.FLY?.tradable ? flySecOf(run) : null;
  const wind = flySec !== null && tutSt === 'done' ? windNow(flySec) : null;
  // 차트의 끝난 모양(U-57): 보이는 창 안에서 끝난 모양에만 이름을 붙인다(생기는 중인 모양에는 아무것도 없다 — 앞일을 알려 주지 않는다)
  const flyPats = (win0: number, n0: number): ChartPat[] => {
    if (flySec === null || tutSt !== 'done' || !marketById[market].synthetic) return [];
    const span0 = Math.min(win0, n0) - 1;
    if (span0 < 30) return [];
    return donePatterns(flySec - span0, flySec).filter((e) => e.t1 - e.t0 <= span0 * 1.5).map((e) => ({
      key: 'p' + e.t0, from: flySec - e.t0, to: flySec - e.t1, ok: e.ok, label: e.label,
      pts: e.pts.map((q) => ({ ago: flySec - q.t, p: q.p })),
    }));
  };
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
  // 첫 주문(튜토리얼)은 띠대로 가진 돈 전부, 그 배율로 셈해 보인다(회차 15: 띠는 전부인데 증거금 줄은 25%였다)
  const prev = orderPreview(g, market, pos ? pos.dir : 1, tutSt === "await" ? TUT.lev : lev, tutSt === "await" ? 100 : pct);
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
  const share = pos && !isLite ? claimShare(netNow, cl.total) : null;
  // 큰 숫자 = 이 거래로 지금까지 늘거나 준 돈의 비율(수수료 포함). 그 아래에 왜 그 숫자인지(시세 · 수수료)
  const netRoe = pos && rawPos ? (netNow / Math.max(1, rawPos.margin0)) * 100 : 0;
  const feesNow = pos && rawPos ? Math.round(rawPos.feesPaid + exitFee(rawPos, exitFeeMul(run))) : 0;
  // ── 손맛(U-48): 숫자는 굴러가고, 틱마다 오르내린 쪽으로 번쩍이고, 고비를 넘으면 옆에 터진다 ──
  const posKey = rawPos ? market + ':' + rawPos.openTick : '';
  const netRoll = useCountUp(Math.round(netNow), 420, posKey + ':' + (rawPos?.halfs?.length ?? 0));
  const roeShow = rawPos ? (netRoll / Math.max(1, rawPos.margin0)) * 100 : 0;
  const danger = pos ? dangerOf(pos.liqDistPct, pos.lev, balance.trading.maintenanceRate as number) : 0;
  /** 만화 지면(U-60): 청산 코앞이면 지면 가장자리에 망점, 차트 칸이 기울고, 땀 흘리는 얼굴 컷과 「쿵덕 쿵덕!!」, 톱니 말풍선 */
  const nearA = !!pos && (call || danger >= 0.7);
  useEffect(() => {
    if (!pos || !rawPos || tutSt !== 'done') { lastNet.current = null; return; }
    const prevN = lastNet.current;
    lastNet.current = { key: posKey, net: netNow };
    if (prevN && prevN.key === posKey && Math.abs(netNow - prevN.net) >= rawPos.margin0 * 0.004) setFlash((f) => ({ k: (f?.k ?? 0) + 1, up: netNow > prevN.net }));
  }, [netNow, posKey]);
  const pops = popsAll.filter((x) => x.market === market);

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
      setResult((r) => ({ k: (r?.k ?? 0) + 1, tick: run.tick, market: was.p.market, kind, dir: was.p.dir, pnl, margin: was.p.margin0, roe: (pnl / Math.max(1, was.p.margin0)) * 100, name: m.name, dirText: was.p.dir === 1 ? '롱' : '숏', lev: was.p.lev, move, fees, worth: wheelWorth(pnl, hamsterMath(useGame.getState().g).net), saved: sv.saved, savedBy: sv.by, rolled: Object.keys(run.positions).length === 0 ? Math.round(rolledFor(was.p.openTick)) : 0, bonus: (() => { const lb = run.stats.lastBonus as { market: string; tick: number; amount: number } | undefined; return lb && lb.market === was.p.market && lb.tick === run.tick ? lb.amount : 0; })() }));
      // 청산 소리와 이긴 판의 등급 소리는 watch.ts 가 낸다(U-49: 어느 탭에서든)
      if (!liq && !burstTier(pnl, was.p.margin0, cl.total)) play(pnl > 0 ? 'close_profit' : 'close_loss');
      // 닫힌 판의 속마음은 지나간 일이다(U-48: 닫은 뒤에도 "지금 닫으면 …"이 남아 있던 것)
      if (useProto.getState().think) useProto.getState().patch({ think: null });
      if (pnl > 0) { flyAcorns(plRef.current?.getBoundingClientRect() ?? null, Math.min(7, 3 + Math.floor(pnl / 8000))); swing(true); }
      // 이긴 판의 등급(U-48)은 watch.ts 가 store.burst 로 띄운다(U-49: 집에서 닫혀도 터진다)
    }
    if (raw && (!was || was.market !== market)) { setResult(null); }
    seen.current = raw ? { p: raw, market, tick: run.tick } : null;
  });
  useEffect(() => { setArm(false); setResult(null); setSheet(null); setAddOpen(false); }, [market]);
  /** 포지션 카드가 뜬 때(U-56 ①: 한 번 누르기 정리의 0.3초 가드) */
  const posAt = useRef(0);
  const posOpenKey = run.positions[market] ? `${market}:${run.positions[market].openTick}` : '';
  useEffect(() => { if (posOpenKey) posAt.current = Date.now(); }, [posOpenKey]);
  /** 방금 닫힌 판이 의뢰를 움직였다(U-56): 결과 카드의 꼬리표 */
  const qfx = useProto((st0) => st0.questFx);
  const qfxOn = !!qfx && !!result && qfx.market === result.market && Math.abs(qfx.tick - (result.tick ?? -99)) <= 1;
  // 결과 카드는 장면(추심원의 말 등)이 지나간 뒤에도 6.5초 남는다(U-48)
  const talkingNow = useProto((st0) => st0.scenes.length > 0);
  /** 수익 인증서 묻기(ProfitPrompt)가 떠 있다: 승급 축하는 그 뒤에 */
  const profitOn = useProto((st0) => !!st0.profit);
  useEffect(() => {
    if (!rankUp || rankUp.k <= rankSeen || talkingNow || burst || profitOn || tutSt !== 'done' || mode.mode !== 'orders') return;
    // 청산 도장이 떠 있으면 걷힌 뒤에(회차 15: 승급 카드, 청산 도장, 알림이 세 겹으로 쌓였다)
    const t0 = window.setTimeout(() => { setRankCard({ k: rankUp.k, r: rankUp.r, why: rankUp.why }); useProto.getState().patch({ rankSeen: rankUp.k }); play('paw_stamp'); }, Math.max(650, liqQuietLeft() + 250));
    return () => window.clearTimeout(t0);
  }, [rankUp?.k, rankSeen, talkingNow, !!burst, profitOn, tutSt]);
  useEffect(() => { if (!rankCard) return; const t = window.setTimeout(() => setRankCard(null), 4200); return () => window.clearTimeout(t); }, [rankCard?.k]);
  // 승급 카드는 화면 어디를 눌러도 닫힌다(U-55): 머리와 탭 줄을 누른 것도 카드만 닫고 그 아래로는 가지 않는다. 뜬 지 0.4초 안의 탭은 받지 않는다
  useEffect(() => {
    if (!rankCard) return;
    const at = performance.now();
    const eat = (e: Event) => {
      const t = e.target as Element | null;
      if (t?.closest?.('.pt-rankcard')) return;
      e.stopPropagation(); e.preventDefault();
      if (e.type === 'click' && performance.now() - at > 400) setRankCard(null);
    };
    const kinds = ['pointerdown', 'pointerup', 'click'] as const;
    for (const k of kinds) window.addEventListener(k, eat, { capture: true });
    return () => { for (const k of kinds) window.removeEventListener(k, eat, { capture: true }); };
  }, [rankCard?.k]);
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
        { id: 'stamp', label: '발도장 찍기', sub: `${want}배 주문이 바로 열린다`, primary: true, run: () => { const r = useGame.getState().act({ type: 'signWaiver' }); if (r.ok) { play('paw_stamp'); setTrade({ lev: want }); } else toast(r.msg ?? '찍을 수 없다'); } },
        { id: 'later', label: '다음에', sub: '50배까지만', run: () => { /* 그대로 */ } },
      ],
    });
  };
  const doOpen = (dir: 1 | -1) => {
    const lev = lev0;
    // 튜토리얼 거래(U-31): 첫 한 번은 정해 둔 돈·배율로, 짜 둔 시세 위에서
    if (useProto.getState().tutorial === 'await') { if (tutorialOpen(dir)) { setSheet(null); setResult(null); setEntered((k) => k + 1); swing(true); } return; }
    if (useProto.getState().tutorial === 'run') return;
    // 쪼개 넣기(C3a): 고른 증거금을 셋으로 나눠, 지금 한 번 + 2초 간격으로 두 번 더 넣는다. 평균 단가는 엔진이 낸다.
    const part = sk.split && split ? Math.floor(marginFromPct(run.cash, lev, pct, feeRate(g, lev)) / 3) : 0;
    const r = part > 0 ? act({ type: 'open', market, dir, lev, margin: part, sl: ordSl, tp: ordTp }) : act({ type: 'open', market, dir, lev, marginPct: pct, sl: ordSl, tp: ordTp });
    if (!r.ok) { say(r.msg ?? '주문할 수 없어요'); play('insufficient'); return; }
    // 걸어 둔 익절 폭이 지난 기록에 한 번도 없었다(조용한 장): 이번 생에 한 번, 오소리 대부가 있는 그대로 말한다 — 기다리는 동안에도 정산은 온다(U-41 ⑩)
    if (tpK !== null && acOrder?.tpMove != null && hist.length >= 60 && swingCount(hist, acOrder.tpMove) === 0 && !useProto.getState().seen.farTp) {
      useProto.getState().patch({ seen: { ...useProto.getState().seen, farTp: true } });
      window.setTimeout(() => toast('오소리 대부: 익절이 좀 머네요. 기다리는 동안에도 정산은 와요.', 6000), 1200);
    }
    // 도토리로 건 출구: 실제로 들어간 크기(쪼개 넣기면 셋 가운데 하나)에 맞춰 다시 건다
    if (tpK !== null || slK !== null) { plan.current[market] = { tp: tpK !== null ? tpK * cl.total : null, sl: slK !== null ? slK * cl.total : null }; reapply(); }
    else delete plan.current[market];
    // FRX 첫 실전 카드로 맞춘 출구(이자 한 번)는 그 한 판의 것이다(회차 13): 다음 주문에 말없이 남으면 증거금을 키운 판이
    // 반대쪽 0.2% 남짓에서 1~2초 만에 손절됐다. 이 판의 출구는 위에서 걸었고, 주문 칸의 출구만 비운다(카드가 다시 뜨면 다시 맞춘다)
    if (firstSet) setTrade({ tpK: null, slK: null });
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
    // 한 번 누르면 바로 정리(U-56 ①, 사용자 결정: 200배의 두 번 누르기 사이에 이익이 날아갔다). 카드가 막 뜬 0.3초 안의 누름만 흘린다(잘못 누름 막기)
    if (Date.now() - posAt.current < CLOSE_GUARD_MS) return;
    manual.current = true;
    const r = act({ type: 'close', market });
    if (!r.ok) { manual.current = false; say(r.msg ?? '정리할 수 없습니다'); }
    else if (r.code === 'reserved') { manual.current = false; say('시세 지연. 요청을 접수했어요. 시세가 돌아오면 정리해요.', false); }
  };
  /** 반 익절(나무 A1, U-51): 이익 중인 포지션의 절반을 지금 닫는다. 돈은 바로 손에, 나머지 절반은 같은 진입가 · 같은 청산가로 계속 간다 */
  const halfRef = useRef<HTMLButtonElement>(null);
  const doHalf = () => {
    if (!pos || !rawPos) return;
    const left = rawPos.margin0 / 2;
    const r = act({ type: 'half', market });
    if (!r.ok) { say(r.msg ?? '나눠 닫을 수 없습니다'); play('insufficient'); return; }
    const got = Math.round(r.amount ?? 0);
    pushPop(`반 익절 +${comma(got)}`, 'half', market, () => { play('win_coins'); later(160, () => play('buy')); }, '나머지 반은 계속');
    treePing('A1', `반 익절 +${comma(got)}`);
    flyAcorns(halfRef.current?.getBoundingClientRect() ?? null, Math.min(8, 4 + Math.floor(got / 10000)));
    swing(true);
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
  // 따라가는 손절(나무 C1, U-50): 손절이 올라온 판이면 그렇다고 적는다
  const slTxt = stopLabel(curSl, sctx, 'sl') + (rawPos?.trailed ? ' 따라감' : '');
  const tpTxt = stopLabel(curTp, sctx, 'tp');
  const pctOf = (v: number | null) => (v === null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v) >= 100 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(Math.abs(v) % 1 > 0.04 ? 1 : 0)}%`);

  const openTabs = tabs.filter((t) => t.hasPos);
  const trayClose = (id: string, nv: number) => {
    // 한곳 정리도 한 번에(U-56 ①). 판이 막 열린 0.3초 안만 흘린다
    if (Date.now() - (trayAt.current || 0) < CLOSE_GUARD_MS) return;
    setTrayArm(null);
    if (id === market) manual.current = true;
    const r = act({ type: 'close', market: id });
    if (!r.ok) { if (id === market) manual.current = false; toast(r.msg ?? '정리할 수 없습니다'); return; }
    if (r.code === 'reserved') { if (id === market) manual.current = false; toast('시세 지연. 요청을 접수했어요. 시세가 돌아오면 정리해요.'); return; }
    // 다른 종목의 판: 결과 카드는 그 종목 화면의 것이라 여기서는 소리만(이긴 판의 상자와 청산 소리는 watch.ts 가 어느 종목이든 낸다)
    if (id !== market && nv <= 0) play('close_loss');
  };
  useEffect(() => { if (openTabs.length === 0) setTray(false); }, [openTabs.length]);
  const openN = openTabs.length;
  const openNet = openTabs.reduce((a, t) => a + (t.posNet ?? 0), 0);
  const feeChipH = openingEvent() && useProto.getState().tutorial === 'done' && run.futures.open ? { ...feeEventChip(feeEventLeft(run), feeRate(g, tr.lev ?? run.futures.defaultLev) * 100), left: feeEventLeft(run) } : null;
  const frame = (body: ReactNode, cls = '') => (
    <div className="pt-wrap mga">
      <div className={'pt' + cls + ' case-' + look.case} data-pc={g.settings.priceColors} data-mode={mode.mode} data-case={look.case} style={{ ['--bow' as string]: look.bow, ...(look.case !== 'teal' ? { borderColor: CASE_COL[look.case] } : {}) }}>
        <Charm r={charm} />
        <header className="pt-bar">
          <span className="logo"><Acorn size={17} /></span>
          <b data-short="FRX">{EXCHANGE_NAME}</b>
          {/* FRX 회원 등급(U-51 → U-65): 튜토리얼 뒤에는 「선물」 자리에. 누르면 의뢰판(맨 위에 예탁금, 거래액, 다음 등급) */}
          {tutSt === 'done' ? (
            <button key={rankUp ? 'rk' + rankUp.k : 'rk'} className={'pt-rank r' + Math.min(rk.r, 5) + (rk.r > 5 ? ' rX' : '') + (rankUpOn ? ' up' : '')} data-rank={rk.r} aria-label={`FRX ${rk.name} 회원, ${rankFeeText(rk.r)}, ${goalText(rk)}`}
              onClick={() => { forestOpen('quest'); }}>
              <span className="rn">{rk.name}<small data-rank-next>{goalShort(rk)}</small>{!(feeChipH && feeChipH.on) && <small className="fee" data-rank-fee>{rankFeeText(rk.r).replace('수수료 ', '')}</small>}</span><i aria-hidden="true"><u style={{ width: `${Math.round(rk.frac * 100)}%` }} /></i>
              {rankUpOn && <span className="ru" aria-hidden="true">{rk.name} 승급!</span>}
            </button>
          ) : <em>선물</em>}
          {/* 열린 포지션 전부의 손익(U-47): 지금 정리하면 늘거나 줄 돈의 합(수수료 포함) */}
          {openN > 0 && <button className={'pt-sum ' + (openNet >= 0 ? 'up' : 'down') + (tray ? ' open' : '')} data-possum={Math.round(openNet)} aria-expanded={tray} aria-label={`포지션 ${openN}개 합계 ${money(openNet)}, 한곳에서 정리하기`} onClick={() => { play('ui_tap'); trayAt.current = Date.now(); setTray((v) => !v); setTrayArm(null); }}><small>{openN}개</small>{money(openNet)}<Chev size={9} /></button>}
          {/* 오픈 기념 수수료 무료(U-40): 거래소 머리에 늘 걸려 있다. 끝난 뒤에는 지금 수수료율 */}
          {feeChipH && <span className={'pt-fee' + (feeChipH.on ? ' on' : '') + (feeChipH.on && feeChipH.left <= 3 ? ' last' : '')} data-fee-event={feeChipH.left} role="status" aria-label={feeChipH.text}>{feeChipH.on ? '오픈 기념 무료' : feeChipH.text.replace('거래 ', '')}</span>}
          {Object.keys(activeLevels(g)).length > 0 && <button key={ping ? 'pk' + ping.k : 'pk'} className={'pt-perk' + (pingOn ? ' ping' : '')} data-perks data-ping={pingOn ? ping!.id : undefined} onClick={() => setPerks((v) => !v)} aria-expanded={perks} aria-label="이번 생에 열린 가지"><Leaf />나무 {Object.keys(activeLevels(g)).length}{pingOn && <span className="pk-say" aria-hidden="true">{ping!.text}</span>}</button>}
        </header>
        {tray && openN > 0 && (
          <div className="pt-tray" data-tray role="group" aria-label="열린 포지션 한곳에서 정리">
            {openTabs.map((t) => {
              const pz = run.positions[t.id];
              const nv = Math.round(t.posNet ?? 0);
              const armed = trayArm === t.id;
              return (
                <div key={t.id} className={'tr-row ' + (nv >= 0 ? 'up' : 'down')} data-tray-row={t.id}>
                  <button className="tr-go" onClick={() => { play('ui_tap'); setTrade({ market: t.id }); setTray(false); }}><Coin id={t.id} size={18} /><span>{marketById[t.id].short ?? marketById[t.id].name}</span><small className={t.posDir === 1 ? 'up' : 'down'}>{t.posDir === 1 ? '롱' : '숏'} {pz?.lev}배</small></button>
                  <b className="tr-net">{money(nv)}</b>
                  <button className={'tr-close' + (armed ? ' arm' : '') + (nv >= 0 ? ' gain' : '')} data-tray-close={t.id} onClick={() => trayClose(t.id, nv)}>{armed ? '한 번 더' : '정리'}</button>
                </div>
              );
            })}
            {(() => {
              const wins = openTabs.filter((t) => (t.posNet ?? 0) > 0);
              const sumW = wins.reduce((a, t) => a + (t.posNet ?? 0), 0);
              return wins.length > 0 && openN > 1 ? <button className="tr-all" data-tray-wins={wins.length} onClick={() => { for (const t of wins) trayClose(t.id, 1); }}>이익 난 판{wins.length > 1 ? ` ${wins.length}개 모두` : ''} 정리 <b>{money(sumW)}</b></button> : null;
            })()}
          </div>
        )}
        {perks && <div className="pt-perks" role="status" onClick={() => setPerks(false)}>{ping && <span className="last" data-ping-last>방금: {skillById[ping.id]?.name} {ping.text}</span>}{Object.entries(activeLevels(g)).map(([id, lv]) => <span key={id}>{skillById[id]?.name}{skillById[id]?.kind === 'scaled' ? ` Lv${lv} (−${(nodeEffect(g, id) * 100).toFixed(1)}%)`.replace('(−', id === 'C2' || id === 'B1' ? '(+' : '(−') : skillById[id]?.tail ? ` Lv${lv} (${id === 'A3a' ? `+${Math.round(tailRun(run, id))}초` : id === 'B2' ? `−${(tailRun(run, id) * 100).toFixed(2)}%p` : `${id === 'B3b' || id === 'C4' ? '+' : '−'}${(tailRun(run, id) * 100).toFixed(1)}%`})` : ''}</span>)}</div>}
        {body}
      </div>
    </div>
  );

  // 훅은 모두 이른 return 앞에서 부른다(회차 13: 잠김, 계좌 없음 화면으로 바뀌는 순간 훅 수가 달라져 화면이 통째로 꺼졌다)
  const firstTry = useProto((s0) => s0.firstTry);

  // 0단계: 아직 앱이 잠겨 있다. 압류로 잠겼는데 판이 열려 있으면 그 판을 여기서 닫는다(회차 14: 열린 판이 화면에서 사라졌다)
  const lockedOpen = Object.values(run.positions);
  if (mode.mode === 'locked') {
    return frame(
      <div className="pt-lockbox"><Lock size={34} /><p>{(run.stats.assetsSeized ?? 0) > 0 ? '연결된 쳇바퀴 없음. 집에서 한 대를 다시 놓으면 거래를 재개할 수 있어요.' : mode.text}</p>{lockedOpen.length > 0 && <LockedPositions ps={lockedOpen} />}</div>,
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
          if (t.id === market && tutSt === 'done') { play('ui_tap'); setInfo((v) => (v ? null : t.id)); return; }
          setTrade({ market: t.id });
          // 날다람쥐코인(FLY)을 처음 열었다: 숲 신문 한 줄(생마다 한 번)
          if (marketById[t.id].synthetic && !useProto.getState().seen.flyNews) { useProto.getState().patch({ seen: { ...useProto.getState().seen, flyNews: true } }); toast(`[도토리일보] ${marketById[t.id].name} 상장. 숲이 들썩인다.`, 6000); }
        }}>
          <Coin id={t.id} size={22} />
          {t.id === market && tutSt === 'done' && <i className="inf" aria-hidden="true">i</i>}
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
  // 날다람쥐코인은 시세 함수의 바람 세기로 말한다(회차 15: 돌풍 특보가 떴는데 「잔잔함」이라 적혀 있었다)
  const moodQ: string = m.synthetic && wind ? wind.gust.word : mood;
  const quote = (
    <div className="pt-quote">
      <div className="px"><i className="qn" role="button" tabIndex={0} data-coininfo-open aria-label={`${marketById[market].name} 소개 보기`} onClick={() => { if (tutSt !== 'done') return; play('ui_tap'); setInfo((v) => (v ? null : market)); }}>{marketById[market].name}{tutSt === 'done' && <u className="inf" aria-hidden="true">i</u>}</i><b>{fmtPrice(market, px)}</b><span className={tab.pct >= 0 ? 'up' : 'down'}><Tri up={tab.pct >= 0} size={10} />{pctTxt(tab.pct).slice(1)}</span></div>
      {status ? <div className="st-bad" role="status">{status}</div>
        : sess && sess.state !== 'open' ? <div className={'mood m-sess s-' + sess.state} data-sess={sess.state} role="status" onClick={() => { if (tutSt === 'done') dayNoteOpen(true); }}><b>{sess.state === 'closed' ? '본장 마감' : sess.state === 'after' ? '본장 마감, 그래도 움직인다' : '장중인데 조용함, 휴장인 듯'}</b><small data-opens-in>{opensInText(market, now) ? `개장 ${sess.hours.split('~')[0]}, ${opensInText(market, now)!.replace(/^본장까지 /, '')} 뒤` : `본장 ${sess.hours}`}</small></div>
        : <div className={'mood m-' + (moodQ === '잔잔함' || moodQ === '잔바람' ? 'calm' : moodQ === '격동' || moodQ === '돌풍' || moodQ === '센바람' ? 'wild' : 'mid')} data-sess={sess ? 'open' : undefined} data-daynote-mood role="button" tabIndex={0} aria-label="도토리일보 시세면 열기" onClick={() => { if (tutSt === 'done') dayNoteOpen(true); }}><span data-feed={feedTag ? tutSt : undefined}>{feedTag ?? (sess ? `본장 ${sess.hours}` : m.synthetic ? '밈코인' : '24시간')}</span>{moodQ}{tutSt === 'done' && <i className="nw" aria-hidden="true">›</i>}</div>}
    </div>
  );
  // 바람 줄(U-52, U-57): 날다람쥐코인을 볼 때만. 지금 10분의 바람 세기, 방금 끝난 차트 모양(끝난 뒤에만), 지난 하루 모양 성적
  const windLine = wind && marketById[market].synthetic ? (() => {
    const d = wind.done, gw = wind.gust;
    const cls = 'pt-wind' + (d ? ' came' + (d.e.ok ? '' : ' fake') : '') + (gw.mul >= 1.35 ? ' gusty' : gw.mul < 0.75 ? ' calm' : '');
    return (
      <button className={cls} data-wind={d ? (d.e.ok ? 'ok' : 'fake') : 'none'} data-gust={gw.word} onClick={() => { play('ui_tap'); toast('바람이 셀수록 크게 오르내린다.', 4000); }}
        aria-label={`바람 ${gw.word}${d ? ', 방금 ' + d.e.label : ''}`}>
        <span className={'gw g' + Math.min(3, Math.floor(gw.mul / 0.65))}><i className="bars" aria-hidden="true"><u /><u /><u /></i>{gw.word}<small>{Math.ceil(gw.leftSec / 60)}분</small></span>
        {d ? <span className="tl" data-pat-done={d.e.label}><b>방금</b> {d.e.label}<em className={d.e.ok ? (d.e.dir === 1 ? 'up' : 'down') : (d.e.dir === 1 ? 'down' : 'up')}>{(d.e.ok ? d.e.dir : -d.e.dir) === 1 ? '▲' : '▼'}</em></span>
          : <span className="tl dim">{gw.mul >= 1.35 ? '다들 몰려드는 중!' : gw.mul < 0.75 ? '오늘은 조용하네요' : '숲이 수군거려요'}</span>}
      </button>
    );
  })() : null;
  // 지금 출렁이는 곳(U-53): 실제 시세 종목을 1분 봉 폭(지난 3분 평균, 초 단위 실시간 값으로 센 것)으로 줄 세운다. 날다람쥐 · 본장 마감 종목은 뺀다
  // 회차 13: 실시간 값이 3분 모이기 전에는 접속할 때 거래소에서 받아 온 진짜 1분 봉(dayHistory)으로 잰다 — 들어오자마자 뜬다
  const rankRow = tutSt === 'done' && !pos && !result && !marketById[market].synthetic ? (() => {
    const rk0 = swingRank(tabs.filter((t) => !marketById[t.id].synthetic).map((t) => ({ id: t.id, live: liveHistoryOf(t.id), bars: dayBars(t.id).slice(-6), shut: sessionOf(t.id, now, rangeOf(t.id))?.state === 'closed' })), 3, 3, now.getTime());
    if (rk0.length < 2) return null;
    const mins = Math.min(...rk0.map((x) => x.bars));
    return (
      <div className="pt-hot" data-hot={rk0.map((x) => x.id).join(',')} role="group" aria-label="지금 출렁이는 곳">
        <button className="hd" onClick={() => { play('ui_tap'); toast('지금 크게 움직이는 코인들.', 3500); }}>지금 출렁이는 곳</button>
        {rk0.map((x, i) => (
          <button key={x.id} className={'it' + (x.id === market ? ' on' : '')} data-hot-id={x.id} onClick={() => { if (x.id === market) return; play('ui_tap'); setTrade({ market: x.id }); }}>
            <i>{i + 1}</i>{marketById[x.id].short ?? marketById[x.id].name}<b>{x.pct < 0.095 ? x.pct.toFixed(2) : x.pct.toFixed(1)}%</b>
          </button>
        ))}
      </div>
    );
  })() : null;
  // 차트 창: 나무의 초봉 차트(A3a)를 30초 · 긴 창으로 돌려 둔 동안에는 그것이 먼저다. 아니면 고른 시간(2분 · 5분 · 10분)
  // 날다람쥐코인은 값이 시각의 함수라 지난 값을 언제든 다시 셀 수 있다(U-57): 차트를 함수 값으로 그리고, 30분 창도 연다(모양 하나가 다 들어온다)
  const flyChart = marketById[market].synthetic && flySec !== null && tutSt === 'done';
  const span1 = !flyChart && span > 600 ? 600 : span;
  const win = sk.zoom && zoom !== 0 ? (zoom === 1 ? 30 : longChartSec(run)) : span1;
  const chartHist = flyChart ? flySeconds(flySec!, Math.max(win, 120)) : hist;
  const spanLabel = win === 120 ? cm.label : (() => {
    // 화면 전체 폭: chartModel 과 같은 셈을 지금 창에 대고 한다
    const d = chartHist.slice(-win);
    if (!d.length) return '';
    let a = Math.min(...d), b = Math.max(...d);
    const mid = (a + b) / 2, minSpan = mid * 0.0002;
    if (b - a < minSpan) { a = mid - minSpan / 2; b = mid + minSpan / 2; }
    const pad = (b - a) * 0.04;
    return `차트 세로 폭 ${(((b - a + pad * 2) / ((a + b) / 2)) * 100).toFixed(2)}%`;
  })();
  const WINS = flyChart ? [120, 300, 600, 1800] : [120, 300, 600];
  const winCtl = (
    <div className="pt-win">
      {sk.zoom && <button className="pt-zoom" data-zoom={zoom} onClick={() => setZoom((z) => (z + 1) % 3)}>{zoom === 1 ? '초봉 30초' : zoom === 2 ? `긴 창 ${(longChartSec(run) / 60).toFixed(1)}분` : `${span1 / 60}분`} ⇄</button>}
      <div className={'seg' + (WINS.length > 3 ? ' four' : '')} role="radiogroup" aria-label="차트에 보이는 시간">
        {WINS.map((w, i) => {
          const on = (!sk.zoom || zoom === 0) && span1 === w;
          // 기록이 아직 그만큼 안 쌓였으면 흐리게(눌러도 보이는 것은 같다)
          const thin = i > 0 && chartHist.length <= WINS[i - 1];
          return <button key={w} role="radio" aria-checked={on} className={(on ? 'on' : '') + (thin ? ' thin' : '')} data-win={w} title={thin ? '기록이 아직 그만큼 쌓이지 않았다' : undefined} onClick={() => { setSpan(w); setZoom(0); }}>{w / 60}분</button>;
        })}
      </div>
    </div>
  );
  const chart = (
    <>
      <PChart market={market} hist={chartHist} pos={pos} win={win} pats={flyPats(win, chartHist.length)} band={tn?.rangePct ?? null} foot={winCtl} footH={(sk.zoom ? 50 : 26) + (WINS.length > 3 ? 18 : 0)} note={isLite ? '' : spanLabel} over={nearA ? <span className="mga-bal" aria-hidden="true"><svg viewBox="0 0 200 90" preserveAspectRatio="none"><polygon points={MGA_BURST} /></svg><b>청산 코앞!!</b></span> : <i className="mga-sfx" aria-hidden="true">{Math.abs(tab.pct) >= 1 ? (tab.pct > 0 ? '쭈욱!' : '뚝!') : '스~윽'}</i>} onPlotTap={() => { if (useProto.getState().scenes.length) return; play('ui_tap'); setBigChart((v) => !v); }} />
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
        const cnt = a && !isLite ? chipCount(hist, kind === 'tp' ? a.tpMove : a.slMove) : null;
        return (
        <button key={k} role="radio" aria-checked={acIs(kind, k)} className={'pt-chip' + (acIs(kind, k) ? ' on' : '')} data-ak={kind + k} data-cnt={cnt ?? undefined} onClick={() => setAcorn(kind, k)}>
          <b>{akName(k)}</b><small>{kind === 'tp' ? '+' : '−'}{comma(Math.round(k * cl.total))}{cnt && <i> {cnt}</i>}</small>
        </button>
        );
      })}
    </div>
  );
  // 첫 주문(튜토리얼): 띠가 말하는 대로 「전부」와 그 배율에 불이 켜진다(회차 14: 띠는 "가진 돈 전부"인데 25% 칩이 켜져 있었다)
  const tutAwait = tutSt === 'await';
  const levShown = tutAwait ? TUT.lev : lev;
  const marginChips = (
    <div className="pt-mg k5" data-hl="mg" role="radiogroup" aria-label="증거금">
      {MARGIN_PCTS.filter((p) => p < 100).map((p) => (
        <button key={p} role="radio" aria-checked={!tutAwait && !keepOn && pct === p} className={'pt-chip' + (!tutAwait && !keepOn && pct === p ? ' on' : '')} onClick={() => setTrade({ pct: p, keep: false })}>
          <b>{`${p}%`}</b><small>{comma(marginFromPct(run.cash, lev, p, feeRate(g, lev)))}</small>
        </button>
      ))}
      {/* 정산 빼고 전부(U-42 ③): 다음 정산에 낼 돈은 손에 남긴다 — 정산을 굶기지 않고 판을 키우는 길 */}
      <button role="radio" aria-checked={keepOn} className={'pt-chip keep' + (keepOn ? ' on' : '')} data-keep={keepM} disabled={tutSt !== 'done'} onClick={() => { setTrade({ keep: true }); if (keepM < 1) say(`다음 정산에 낼 ${comma(Math.round(dueAll))}도 모자란다.`); }}
        aria-label={`정산 빼고 전부: ${comma(Math.round(dueAll))}은 남기고 ${comma(keepM)}`}>
        <b>정산 빼고</b><small>{keepM > 0 ? comma(keepM) : '걸 돈 없음'}</small>
      </button>
      <button role="radio" aria-checked={tutAwait || (!keepOn && pct === 100)} className={'pt-chip' + (tutAwait || (!keepOn && pct === 100) ? ' on' : '')} onClick={() => setTrade({ pct: 100, keep: false })}>
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
  const planTxt = !isLite && !pos && acOrder && (tpK !== null || slK !== null) ? planLine({ tpNet: tpK !== null ? tpK * cl.total : null, slNet: slK !== null ? slK * cl.total : null, st: acOrder, hist }) : null;
  const oddsSwing = odds && !isLite ? swingCountText(hist, odds.needPct) : null;
  const carry = pos && rawPos ? carryOf({ cash: run.cash, income, due: dueAll, settleIn: run.settleIn, notional: rawPos.notional, fundingRate: fundingRateNow()}) : null;
  const firstShowEarly = tutSt === 'done' && firstTry > 0 && lifeNo(g) === 1 && !pos && !result && cl.total > 0 && !sheet;
  // 느린 판(U-51): 평소대로면 목표까지 5분 넘게 걸리는 판이면 그렇다고, 지금 더 빨리 움직이는 종목이 있으면 그 이름을 — 손 놓고 기다리지 않게. 눌러서 그 종목으로 간다
  const altM = wild && wild.id !== market && !rankRow ? { id: wild.id, name: marketById[wild.id].name, r: wild.r } : null;
  const heldSec = rawPos ? run.tick - rawPos.openTick : 0;
  const slow = tutSt !== 'done' || result ? null
    : pos && rawPos ? (heldSec >= 30 && netRoe < 15 ? slowHint({ needPct: (15 - netRoe) / pos.lev, rangePct: typicalRange(liveHist), goal: '+15%', alt: altM, ownR: rangeOf(market) }) : null)
    : odds && !odds.liqFirst && !prev.reason ? slowHint({ needPct: odds.needPct, rangePct: typicalRange(liveHist), goal: '이자 한 번', alt: altM, ownR: rangeOf(market) }) : null;
  const slowLine = slow ? (
    <button className={'pt-slow' + (slow.alt ? ' go' : '')} data-slow={Math.round(slow.sec)} disabled={!slow.alt} onClick={() => { if (!altM) return; play('ui_tap'); setTrade({ market: altM.id }); }}>
      <span>{isLite ? `이대로면 ${slow.sec >= 86400 ? '하루 넘게' : waitText(slow.sec) + '쯤'} 걸려요.${slow.alt && altM ? ` ${josa(altM.name, '이', '가')} 더 빨라요.` : ''}` : slow.text}</span>{slow.alt && <b>보러 가기 ›</b>}
    </button>
  ) : null;
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
            <button key={nt.lev} role="radio" aria-checked={nt.lev === levShown} aria-label={`${nt.lev}배${nt.locked ? ' 잠김' : ''}`}
              className={'nt' + (nt.lev === levShown ? ' on' : '') + (nt.hot ? ' hot' : '') + (nt.locked && !nt.seal ? ' locked' : '') + (nt.seal ? ' seal' : '')} data-lev={nt.lev}
              onClick={() => { if (nt.seal) askWaiver(nt.lev); else if (nt.locked) say(nt.lockText!, false); else setTrade({ lev: nt.lev }); }}>
              <i>{nt.locked && !nt.seal && <Lock size={12} />}</i><b>{nt.lev}{nt.lev === levShown ? '배' : ''}</b>
            </button>
          ))}
        </div>
      )}
      {(!pos || addOpen) && marginChips}
      {pos && sk.water && <button className="pt-water" data-water disabled={waterAmt < 1} onClick={doWater}><b>물타기</b><span>증거금만 +{comma(waterAmt)}, 청산가가 멀어진다</span></button>}
      {!pos && sk.split && <button className={'pt-water split' + (split ? ' on' : '')} data-split aria-pressed={split} onClick={() => setSplit((v) => !v)}><b>쪼개 넣기</b><span>{split ? '세 번에 나눠 들어간다' : '꺼짐'}</span></button>}
      {/* 증거금 · 수수료 줄과 "이자까지" 줄은 한 덩이다. 수수료가 없는 동안에는 "이자까지" 한 줄만 보이고, 누르면 증거금 · 수수료 줄이 펼쳐진다(차트에 자리를 준다) */}
      {(!pos || addOpen) && <div className={'pt-info' + (foldRisk ? ' fold' : '') + (canFold ? ' tap' : '') + (prev.fee <= 0 ? ' nofee' : '')} data-hl="risk" data-more={canFold ? (more ? 'open' : 'shut') : undefined} onClick={canFold ? () => setMore((v) => !v) : undefined}>
        <div className={'pt-risk' + (prev.reason ? ' bad' : '') + (pos ? ' add' : '')} role="status">
          {prev.reason ? <span>{pos && /증거금이 모자/.test(prev.reason) ? `더 넣을 돈이 모자란다 (손에 ${comma(Math.floor(run.cash))})` : prev.reason}</span> : (
            <>
              <span>{pos ? '추가 ' : ''}증거금 {comma(prev.margin)}, 수수료 {prev.fee > 0 ? comma(prev.fee) : evLeft > 0 ? <b className="free" data-fee-free aria-label={`오픈 기념 수수료 무료, 정산 ${evLeft}번 남음`}>무료 (정산 {evLeft}번 남음)</b> : '0'}</span>
              {pos ? <span>배율 {pos.lev}배 그대로</span> : <b>반대 방향 약 {liqAbs}%에 청산</b>}
            </>
          )}
        </div>
        {oddsShown && (planTxt
          ? <div className="pt-odds plan" data-odds data-plan>{planTxt}</div>
          : odds!.tight ? <div className="pt-odds warn" data-odds data-tight>{isLite ? '청산선이 아주 가까워요. 한 번 출렁이면 끝.' : odds!.tight}</div>
          : <div className={'pt-odds' + (odds!.liqFirst ? ' no' : '')} data-odds>{isLite ? liteOdds(odds!, cl.total) : odds!.text}{!odds!.liqFirst && oddsSwing ? `, ${oddsSwing}` : ''}</div>)}
        {/* 지금 고른 종목이 자고 있다: 이자까지의 셈 대신, 다른 종목이 깨어 있으면 어디가 움직이는지, 전부 조용하면 그렇다고 말한다(가짜 출렁임은 없다) */}
        {quietShown && (
          <div className="pt-quiet" data-quiet={quietAll ? 'all' : 'one'}>{quietAll ? '지금은 모든 종목 값이 거의 그대로다.' : wild ? `${josa(m.name, '은', '는')} ${sess?.state === 'closed' ? '본장 마감이라' : '지금'} 거의 안 움직인다. 움직이는 곳은 ${marketById[wild.id].name}.` : `${josa(m.name, '은', '는')} 지금 거의 안 움직인다.`}</div>
        )}
      </div>}
      {!pos && !prev.reason && tutSt === 'done' && sqOrder && <div className="pt-squeeze" data-squeeze="order">{sqOrder.text}</div>}
      {!pos && !firstShowEarly && slowLine}
    </div>
  );

  // ── 첫 실전 한 판(U-50, 첫 생): 튜토리얼이 끝나면 FRX 앱이 작은 판 하나를 맞춰 준다 — 가장 출렁이는 날다람쥐코인, 50배, 넣는 돈 25%, 익절 · 손절 = 이자 한 번.
  // 누르면 주문 칸이 그대로 맞춰지고(배율 눈금 · 증거금 칩 · 출구가 그 값으로), 롱이나 숏은 손으로 누른다. 이긴 판이 터지거나 세 번 지면 사라진다. 이기는 확률은 그대로 반반이다 ──
  const FIRST = { market: (tabs.some((t) => t.id === 'FLY') ? 'FLY' : wild?.id ?? 'DTC') as string, lev: 50, pct: 25 };
  const firstShow = tutSt === 'done' && firstTry > 0 && lifeNo(g) === 1 && !pos && !result && !prev.reason && cl.total > 0 && !sheet;
  const firstSet = firstShow && market === FIRST.market && lev === FIRST.lev && !keepOn && tr.pct === FIRST.pct && tpK === 1 && slK === 1;
  const firstGo = () => {
    play('ui_tap');
    setTrade({ market: FIRST.market, lev: FIRST.lev, pct: FIRST.pct, keep: false, tpK: 1, slK: 1, tp: null, sl: null });
    if (marketById[FIRST.market].synthetic && !useProto.getState().seen.flyNews) { useProto.getState().patch({ seen: { ...useProto.getState().seen, flyNews: true } }); toast(`[도토리일보] ${marketById[FIRST.market].name} 상장. 숲이 들썩인다.`, 6000); }
  };
  const firstCard = firstShow ? (
    <div className={'pt-first' + (firstSet ? ' set' : '')} data-first={firstSet ? 'set' : 'ask'} data-hl="cond" role="status">
      <img className="ft-boss" src={sprite('boss')!.src} alt="" aria-hidden="true" />
      <div className="ft-t"><b>FRX 첫 실전</b><span>{marketById[FIRST.market].name} {FIRST.lev}배, {FIRST.pct}%</span></div>
      <p>익절 <b className="up">+{comma(Math.round(cl.total))}</b> 손절 <b className="down">−{comma(Math.round(cl.total))}</b>{firstSet ? <>, 이제 롱이나 숏.</> : <>, 이자 한 번 치.</>}</p>
      {!firstSet && <button className="ft-go" data-first-go onClick={firstGo}>이대로 맞추기</button>}
    </div>
  ) : null;

  // 라이트: 급할 때 빌리기 말풍선(U-61). 증거금이 모자라 주문이 막혔거나, 정산이 10초 안인데 손의 돈이 모자라다
  const quickWhy = isLite && tutSt === 'done' && !result ? quickBorrowWhy(g, { orderShort: (!pos || addOpen) && !!prev.reason && /증거금이 모자|현금 부족|모자란다/.test(prev.reason) }) : null;
  const ordersRow = (
    <div className={'pt-orders' + (firstSet ? ' first-go' : '')} data-hl={pos ? undefined : 'orders'}>
      {pos ? (
        <>
          <button className={'pt-btn ' + (pos.dir === 1 ? 'long' : 'short') + (addOpen ? ' armadd' : '')} data-add={addOpen ? 'open' : 'shut'} disabled={!!prev.reason && addOpen} onClick={() => { if (!addOpen) { play('ui_tap'); setAddOpen(true); return; } setAddOpen(false); doAdd(); }}>
            <span><Tri up={pos.dir === 1} size={13} />{addOpen ? '추가로 넣기' : '추가 진입'}</span><small>{addOpen ? `+${comma(prev.margin)}` : '금액 고르기'}</small>
          </button>
          {sk.flip && <button className="pt-btn flip" data-flip onClick={doFlip}><span>⇅</span><small>뒤집기</small></button>}
          {sk.half && (() => {
            // 반 익절(U-51): 이익일 때만 눌린다. 자리는 늘 같다(손익이 오락가락해도 단추가 움직이지 않게)
            const can = netNow > 0 && !!rawPos && rawPos.margin0 / 2 >= (balance.trading.minMargin as number) && !(rawPos.buf ?? 0) && run.marketStatus === 'open';
            return <button ref={halfRef} className={'pt-btn half' + (can ? ' on' : '')} data-half={can ? 'on' : 'off'} disabled={!can} onClick={doHalf} aria-label={can ? `반 익절, 지금 +${comma(Math.round(netNow / 2))}` : '반 익절, 이익일 때'}><span>반 익절</span><small>{can ? `+${comma(Math.round(netNow / 2))}` : '이익일 때'}</small></button>;
          })()}
          <button className={'pt-btn close' + (arm ? ' arm' : '') + (netNow >= 0 ? ' gain' : '')} data-hl="closeBtn" onClick={doClose}>
            <span>{arm ? '한 번 더 누르면 정리' : '정리하기'}</span>
            <small>{rawPos ? comma(Math.round(rawPos.margin0)) : ''} <b className={arm ? '' : netNow >= 0 ? 'up' : 'down'}>{money(netNow)}</b>{arm ? ' 확정' : ''}</small>
          </button>
        </>
      ) : (
        <>
          <button className="pt-btn long" disabled={!!prev.reason} onClick={() => doOpen(1)}><span><Tri up size={13} />롱!</span><small>오른다 {lev}배</small></button>
          <button className="pt-btn short" disabled={!!prev.reason} onClick={() => doOpen(-1)}><span><Tri up={false} size={13} />숏!</span><small>내린다 {lev}배</small></button>
        </>
      )}
    </div>
  );
  let lower: ReactNode;
  if (sheet === 'stops') {
    lower = (
      <>
      <section className="pt-sheet" aria-label="출구">
        <div className="sh-top">
          <div className="sh-title"><b>손절과 익절</b><span>{pos ? `${m.name} ${pos.dirText} ${pos.lev}배` : '다음 주문에 적용'}</span></div>
          <button className="pt-x" aria-label="출구 닫기" onClick={() => setSheet(null)}><Cross /></button>
        </div>
        {cl.total > 0 && <>{acRow('tp')}{acRow('sl')}{!isLite && <p className="pt-acnote" data-acnote>이자 한 번 = 다음 수금(이자 + 생활비) {comma(cl.total)}.{hist.length >= 60 ? ` 「n번」은 지난 ${Math.max(1, Math.round(hist.length / 60))}분에 그 폭이 나온 횟수.` : ''}</p>}</>}
        {stops}
        {sk.dayLimit && (
          <div className="pt-stops day" data-daylimit>
            {stepper('하루 한도', 'sl', dayLim === null ? '없음' : `−${comma(dayLim)}`, dayLim !== null, () => act({ type: 'setDayLimit', value: stepOf(DAY_OPTS, dayLim, -1) }), () => act({ type: 'setDayLimit', value: stepOf(DAY_OPTS, dayLim, 1) }))}
            <p>오늘 잃은 돈 {comma(Math.round((run.stats.dayLoss as number | undefined) ?? 0))}. 넘으면 다음 아침까지 새 거래가 잠긴다.</p>
          </div>
        )}
        {noteLine}
      </section>
      {/* 출구를 고른 자리에서 바로 들어간다(U-53): 시트를 닫고 롱을 누르던 한 번을 줄인다 */}
      <div className="pt-sheetgo">{ordersRow}</div>
      </>
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
              {(result.worth || (result.savedBy && result.saved >= 10) || result.rolled >= 10 || result.bonus > 0 || qfxOn) && (
                <div className="tags">
                  {qfxOn && <span className={'quest' + (qfx!.done ? ' done' : '')} data-quest-res={qfx!.done ? 'done' : 'prog'}>{qfx!.lines[0]}</span>}
                  {result.bonus > 0 && <span className="bonus" data-bonus={result.bonus}>오소리 축하금 +{comma(result.bonus)}</span>}
                  {result.worth && <span className="worth" data-worth>{result.pnl >= 0 ? '' : '잃은 돈 = '}{result.worth}</span>}
                  {result.savedBy && result.saved >= 10 && <span className="saved" data-saved={result.savedBy}>{result.savedBy === 'event' ? '오픈 기념으로 아낌' : '나무로 아낌'} {comma(result.saved)}</span>}
                  {result.rolled >= 10 && <span className="rolled" data-rolled-res={result.rolled}>그동안 굴려 +{comma(result.rolled)}</span>}
                </div>
              )}
            </div>
            <div className="rs-end">
              <div className="stamp">{result.kind === 'liq' ? (sk.legend ? '전설의 청산' : '강제 청산') : result.kind === 'tp' ? '익절' : result.kind === 'sl' ? '손절' : '정리 완료'}</div>
            </div>
          </div>
        ) : pos ? (
          <div key={'p' + entered} ref={plRef} className={'pt-pl ' + (plus ? 'plus' : 'minus') + (call ? ' call' : '') + (entered ? ' in' : '')} aria-label="내 포지션">
            {nearA && <span className="mga-thump" aria-hidden="true">쿵덕 쿵덕!!</span>}
            <div className="pl-top">
              {/* 들고 있는 동안 쳇바퀴를 굴린다(U-42): 주인공을 누르면 한 번 굴린다 — 눈은 폰에, 발은 쳇바퀴에. 굴려 번 돈은 따로 센다 */}
              {freeWheel ? (
              <button className={'pt-roll' + (rollK ? ' on' : '')} data-roll data-rolled={Math.round(rolledNow)} disabled={tutSt !== 'done'} onPointerDown={doRoll} aria-label={`쳇바퀴 굴리기 (들고 있는 동안 굴려 번 돈 ${comma(Math.round(rolledNow))})`}>
                <img className={'me' + (call ? ' shake' : '') + (nearA ? ' sweat' : '')} src={nearA ? mgaNear : heroFront} alt="" />
                <i key={rollK} className={'wh' + (rollK ? ' spin' : '')} aria-hidden="true"><img src={(sprite('wheelEmpty') ?? sprite('wheel'))!.src} alt="" /></i>
                {rollGain && <span key={'g' + rollK} className="gain" aria-hidden="true">{rollGain}</span>}
                <small>{rolledNow >= 1 ? `+${comma(Math.round(rolledNow))}` : '굴리기'}</small>
              </button>
              ) : <img className={'me' + (call ? ' shake' : '') + (nearA ? ' sweat' : '')} src={nearA ? mgaNear : heroFront} alt="" />}
              <div className={'big' + (whyOpen ? ' more' : '')} data-hl="posNet" onClick={() => setWhyOpen((v) => !v)}>
                <div key={flash ? 'f' + flash.k : 'f'} className={'roe' + (flash ? (flash.up ? ' fl-up' : ' fl-dn') : '')} data-netroe>{Math.abs(roeShow) >= 100 ? `${sign(roeShow)}${Math.abs(roeShow).toFixed(0)}%` : roeTxt(roeShow)}</div>
                <div className="sub" data-net><b>{money(netRoll)}</b>{share ? <i className="shr"> {share}</i> : ' 도토리'}</div>
                <div className="why" data-poswhy>시세 <b className={pos.pnl >= 0 ? 'up' : 'down'}>{money(pos.pnl)}</b>  수수료 {feesNow > 0 ? <b className="down">−{comma(feesNow)}</b> : <b>0{evLeft > 0 ? ' (오픈 기념)' : ''}</b>}</div>
              </div>
              {pops.length > 0 && <div className="pt-pops" aria-live="polite">{pops.map((x) => <span key={x.k} className={'pop ' + x.cls + (x.sub ? ' has-sub' : '')} data-pop={x.cls}>{x.text}{x.sub && <small className="psub" data-pop-sub>{x.sub}</small>}</span>)}</div>}
              <div className={'liq' + (call ? ' hot' : '')} data-hl="posLiq" aria-label={`값이 ${pos.dir === 1 ? '내려' : '올라'} ${pos.liqDistPct.toFixed(1)}% 가면 청산`}><small>청산까지 값</small><b data-liqdir={pos.dir === 1 ? 'down' : 'up'}><i className="ar" aria-hidden="true">{pos.dir === 1 ? '▼' : '▲'}</i>{pos.liqDistPct.toFixed(1)}%</b></div>
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
                <span className="dots" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < (call ? 5 : tn.dots) ? 'on' : ''} />)}</span>
                <span className="tx">청산까지 {isLite && tn.sec !== null ? soonText(tn.sec) : tn.text}</span>
              </div>
            )}
            {sqHold ? <div className="pt-squeeze" data-squeeze="hold">{sqHold.text}</div> : carry && run.settleIn <= CARRY_SHOW_SEC ? <div className="pt-carry" data-carry>{carry.text}</div> : (
            <div className="fact">
              <Coin id={market} size={16} /><b className={pos.dir === 1 ? 'up' : 'down'}>{pos.dirText}</b> {pos.lev}배{(pos.tags.length > 0 || rolledNow >= 10) && <span>{pos.tags.join(', ')}{pos.tags.length > 0 && rolledNow >= 10 ? ', ' : ''}{rolledNow >= 10 ? `굴려 +${comma(Math.round(rolledNow))}` : ''}</span>}
            </div>
            )}
            </div>
            {/* 둘 넘게 들었으면 포지션 카드에서도 한곳 정리로(회차 13): 머리의 합계 칩은 엄지에 작다 */}
            {openN > 1 && (
              <button className={'pl-all ' + (openNet >= 0 ? 'up' : 'down')} data-plall={openN} aria-expanded={tray} onClick={() => { play('ui_tap'); trayAt.current = Date.now(); setTray(true); setTrayArm(null); plRef.current?.closest('.pt')?.scrollTo?.({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); }}>
                <span>판 {openN}개 합계 <b>{money(openNet)}</b></span><em>한곳 정리<Chev size={10} /></em>
              </button>
            )}
            {/* 느린 판(U-51): 들고 있는 판이 평소대로면 +15%까지 오래 걸리면 한 줄, 더 빠른 종목으로 가는 단추 */}
            {slowLine && <div className="pl-row3">{slowLine}</div>}
          </div>
        ) : null}
        {order}
        {/* 위험 고지 확인서는 막는 문이 아니라 한 장면이다(U-47): 50배 위의 칸을 처음 누르면 오소리 대부가 밀어 준다 */}
        {firstCard ?? (
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
        {quickWhy && <QuickBorrow why={quickWhy} />}
        {ordersRow}
      </>
    );
  }

  // 차트를 크게 본 동안에는 아래 덩이(주문 조건)를 접고, 머리에 돌아오는 단추 하나(U-43)
  const bigOn = bigChart && !sheet && !result && tutSt === 'done';
  const unbig = bigOn ? <button className="pt-unbig" data-unbig onClick={() => setBigChart(false)}>주문으로 돌아가기</button> : null;
  const rankCardEl = rankCard ? (() => {
    const lk = lookOf(rankCard.r), nx = lookOf(rankCard.r + 1);
    return (
      <div className="pt-rankcard" data-rankcard={rankCard.r} role="status" onClick={() => setRankCard(null)}>
        <div className="rc-in">
          <small>FRX 숲거래소 회원 등급</small>
          <b>{rankName(rankCard.r)} 승급</b>
          {rankCard.why && <p className="why" data-rankcard-why>{rankCard.why}</p>}
          <div className="rc-phone" style={{ ['--case' as string]: CASE_COL[lk.case], ['--bow' as string]: lk.bow }} aria-hidden="true">
            <i className={'ph' + (lk.case === 'gold' ? ' gold' : '')}><u /></i>
            <svg className="rc-bow" width="34" height="44" viewBox="0 0 34 44"><path d="M17 0v19" stroke="#4A4640" strokeWidth="2" strokeLinecap="round" /><path d="M17 24 6 17.5v13z M17 24l11-6.5v13z" fill="var(--bow)" stroke="#4A4640" strokeWidth="2" strokeLinejoin="round" /><path d="M15 26l-4 10 5-2.4z M19 26l4 10-5-2.4z" fill="var(--bow)" stroke="#4A4640" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="17" cy="24" r="3.4" fill="var(--bow)" stroke="#4A4640" strokeWidth="2" /></svg>
          </div>
          <p className="gift">선물 <em>{lk.gift}</em></p>
          <p className="fee" data-rankcard-fee>이제 거래 {rankFeeText(rankCard.r)}{!isLite && rankCard.r > 0 && rankFeePct(rankCard.r) < rankFeePct(rankCard.r - 1) ? <small> (전 {+rankFeePct(rankCard.r - 1).toFixed(4)}%)</small> : null}</p>
          <p className="ms" data-rankcard-ms>예탁금 {comma(rk.dep)}<br />거래액 {comma(rk.vol)}</p>
          <p className="nx">{rk.r === rankCard.r ? goalShort(rk) : `다음 ${rankName(rankCard.r + 1)}`}, 선물은 {nx.gift}</p>
        </div>
      </div>
    );
  })() : null;
  // 만화 지면(U-60): 크게 이긴 판(넣은 돈의 두 배 넘게)은 결과 카드가 떠 있는 동안 차트 칸을 이긴 컷이 차지한다. 누르면 차트로
  const winT = result && result.kind !== 'liq' ? burstTier(result.pnl, result.margin, cl.total) : null;
  const winPanel = result && winT && winT.lv >= 3 ? (
    <div key={'w' + result.k} className={'mga-win lv' + winT.lv} data-mga-win={winT.lv} role="status" onClick={() => setResult(null)}>
      <img src={mgaWin} alt="" />
      <i className="flash" aria-hidden="true">번쩍!!</i>
      <i className="dstamp" aria-hidden="true">{winT.lv >= 4 ? '대박!' : winT.word + '!'}</i>
      <div className="wn">
        <b className="reel" aria-label={money(result.pnl)}>{money(result.pnl).split('').map((c, i) => <span key={i} style={{ animationDelay: `${i * 70}ms` }}>{c}</span>)}</b>
        <small>{result.dirText} {result.lev}배 {result.kind === 'tp' ? '익절' : '정리'}, 넣은 돈 {comma(Math.round(result.margin))} → <em>{comma(Math.round(result.margin + result.pnl))}</em> {((result.margin + result.pnl) / Math.max(1, result.margin)).toFixed(1)}배</small>
      </div>
    </div>
  ) : null;
  return frame(<>{coins}{quote}{windLine}{tutSt === 'done' && !bigOn && <ForestLine />}{rankRow}{winPanel ?? chart}{unbig}{lower}{rankCardEl}{info && <CoinInfoCard id={info} now={now} r1={info === market && flyChart ? recentRange(chartHist) : rangeOf(info)} typ={typicalRange(info === market && flyChart ? chartHist : liveHistoryOf(info))} onClose={() => setInfo(null)} />}{burst && <WinBurst key={burst.k} {...burst} onDone={() => { if (useProto.getState().burst?.k === burst.k) useProto.getState().patch({ burst: null }); }} />}</>, (sheet ? ' sheet-open' : '') + (call ? ' near' : '') + (bigOn ? ' big' : '') + (pos && danger >= 0.7 ? ' edge' : '') + (nearA ? ' mga-near' : '') + (winPanel ? ' mga-won' : ''));
}

/** 거래 화면이 잠겼는데 열린 판(회차 14): 종목, 손익, [정리] — 정리는 한곳 정리 판과 같은 행동(close) */
function LockedPositions({ ps }: { ps: { market: string; dir: 1 | -1; lev: number }[] }) {
  const act = useGame((s) => s.act);
  const views = useOpenPositions();
  return (
    <div className="pt-lockpos" data-lockpos>
      <small>열린 판은 그대로 움직인다</small>
      {ps.map((p) => { const v = views.find((x) => x.market === p.market); const net = v ? Math.round(v.net) : 0; return (
        <button key={p.market} className={'lp ' + (net >= 0 ? 'up' : 'dn')} data-lockclose={p.market} onClick={() => { const r = act({ type: 'close', market: p.market }); play(r.ok ? (net >= 0 ? 'close_profit' : 'close_loss') : 'insufficient'); }}>
          <span>{marketById[p.market]?.name ?? p.market} {p.dir === 1 ? '롱' : '숏'} {p.lev}배</span><b>{net >= 0 ? '+' : '−'}{comma(Math.abs(net))}</b><em>정리</em>
        </button>
      ); })}
    </div>
  );
}

const COIN_INFO = (coinInfoJson as { coins: Record<string, { lore: string; rumor: string }> }).coins;
const COIN_KIND: Record<string, string> = { DTC: '코인', BTH: '코인', MDT: '밈코인', SMS: '주식', JQQ: '지수', FLY: '밈코인' };
const pctFmt = (r: number) => (r < 0.1 ? r.toFixed(3) : r.toFixed(2)) + '%';
/** 종목 소개 카드: 로고, 이름, 설명, 숲의 소문, 거래 시간과 평소 1분 폭(실시간). 보기만 하고, 아무 데나 누르면 닫힌다 */
function CoinInfoCard({ id, now, r1, typ, onClose }: { id: string; now: Date; r1: number | null; typ: number | null; onClose: () => void }) {
  const m = marketById[id];
  const t = COIN_INFO[id];
  if (!m || !t) return null;
  const ses = SESSIONS[id] ? sessionOf(id, now, r1) : null;
  const hours = SESSIONS[id] ? `평일 본장 ${sessionHoursKst(id, now)} (한국 시간)` : '24시간, 주말에도 쉬지 않는다';
  const nowTxt = ses ? (ses.state === 'open' ? '지금 장중' : ses.state === 'after' ? '지금 본장 마감, 그래도 조금 움직인다' : ses.state === 'holiday' ? '장중인데 조용함, 휴장인 듯' : '지금 본장 마감') : '지금 열려 있음';
  return (
    <div className="pt-coininfo" data-coininfo={id} role="dialog" aria-label={`${m.name} 소개`} onClick={onClose}>
      <div className="ci-top"><Coin id={id} size={40} /><div className="ci-nm"><b>{m.name}</b><small>{COIN_KIND[id] ?? '종목'}</small></div></div>
      <p className="ci-lore">{t.lore}</p>
      <p className="ci-rumor"><b>숲의 소문</b>{t.rumor}</p>
      <dl className="ci-facts">
        <div><dt>거래 시간</dt><dd>{hours}<small>{nowTxt}</small></dd></div>
        {!isLite && <div><dt>평소 1분 폭</dt><dd data-ci-typ>{typ === null ? '재는 중' : pctFmt(typ)}<small>{r1 === null ? '지난 1분 재는 중' : `지난 1분 ${pctFmt(r1)}`}</small></dd></div>}
      </dl>
      <span className="ci-x">누르면 닫힘</span>
    </div>
  );
}

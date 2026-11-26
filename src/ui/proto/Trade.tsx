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
import { TUT } from './model';
import { useProto } from './protoStore';
import { useUI } from '../uiStore';
import { comma } from '../../engine/util';
import { clone } from '../../engine/game';
import { marketById } from '../../engine/data';
import { closeBack, marginFromPct, shortInsurance } from '../../engine/futures';
import { price } from '../../engine/selectors';
import type { Position } from '../../engine/types';
import { historyOf } from '../priceHistory';
import {
  chartModel, fmtPrice, levRuler, marketMood, marketTabs, MARGIN_PCTS, orderPreview, positionView, SL_OPTIONS, TP_OPTIONS, tradeMode, tutorialLine,
  type PositionView,
} from '../vm/trade';
import { Acorn } from './art';
import { flyAcorns, reduced } from './fx';
import { play } from './audio';
import heroFront from './img/hero_front.png';
import './trade.css';

export const EXCHANGE_NAME = 'FRX 숲거래소';

// 종목 색(§11.3의 바랜 값)과 동전 무늬
const COIN: Record<string, { col: string; glyph: ReactNode }> = {
  DTC: { col: '#B9834F', glyph: <circle cx="10" cy="10" r="3.4" /> },
  BTH: { col: '#8E79B8', glyph: <path d="M12.6 4.6a6 6 0 1 0 2.8 8.6a4.8 4.8 0 0 1-2.8-8.6z" /> },
  MDT: { col: '#E0B84A', glyph: <><circle cx="10" cy="6.4" r="2.3" /><circle cx="13.6" cy="10" r="2.3" /><circle cx="10" cy="13.6" r="2.3" /><circle cx="6.4" cy="10" r="2.3" /></> },
  SMS: { col: '#6C93C4', glyph: <rect x="6.4" y="6.4" width="7.2" height="7.2" rx="1" /> },
  JQQ: { col: '#4FA37A', glyph: <path d="M10 5.2l4.6 8.4H5.4z" /> },
};
export function Coin({ id, size = 22 }: { id: string; size?: number }) {
  const c = COIN[id] ?? COIN.DTC;
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
export function PChart({ market, hist, pos }: { market: string; hist: number[]; pos: PositionView | null }) {
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
  const data = hist.slice(-120);
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
  const slots = Math.max(n, 40);
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
  const lims = h >= 130;
  const GAP = 21, TOP = lims ? 30 : 11, BOT = Math.max(TOP, h - TOP);
  const placed = tags.map((t) => ({ ...t, y: Math.min(BOT, Math.max(TOP, (Y(t.price) / 100) * h)) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < placed.length; i++) if (placed[i].y - placed[i - 1].y < GAP) placed[i].y = placed[i - 1].y + GAP;
  for (let i = placed.length - 1; i >= 0; i--) {
    const cap = i === placed.length - 1 ? BOT : placed[i + 1].y - GAP;
    if (placed[i].y > cap) placed[i].y = cap;
  }
  const liqIn = pos && inside(pos.liq);
  const dz = pos && liqIn ? (pos.dir === 1 ? { y: Y(pos.liq), hgt: 100 - Y(pos.liq) } : { y: 0, hgt: Y(pos.liq) }) : null;

  return (
    <div className="pt-chart" data-chart={market} data-hl="chart">
      <div className="plot" ref={box} role="img" aria-label={`${marketById[market].name} 최근 2분 시세`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[25, 50, 75].map((y) => <line key={y} className="grid" x1="0" x2="100" y1={y} y2={y} />)}
          {dz && <rect className="dz" x="0" width="100" y={dz.y} height={dz.hgt} />}
          {n >= 2 && <path className="area" d={`${line}L${X(n - 1).toFixed(2)} 100L0 100Z`} />}
          {pos && inside(pos.entry) && <line className="ln entry" x1="0" x2="100" y1={Y(pos.entry)} y2={Y(pos.entry)} />}
          {pos && pos.tp !== null && inside(pos.tp) && <line className="ln tp" x1="0" x2="100" y1={Y(pos.tp)} y2={Y(pos.tp)} />}
          {pos && pos.sl !== null && inside(pos.sl) && <line className="ln sl" x1="0" x2="100" y1={Y(pos.sl)} y2={Y(pos.sl)} />}
          {pos && liqIn && <line className="ln liq" x1="0" x2="100" y1={Y(pos.liq)} y2={Y(pos.liq)} />}
          {n >= 2 && <path className="px" d={line} />}
        </svg>
        {n >= 1 && <i className="dot" style={{ left: `${X(n - 1)}%`, top: `${Y(last)}%` }} />}
        {n < 12 && <span className="warm">시세를 모으는 중…</span>}
      </div>
      <div className="axis" aria-hidden="true">
        {lims && <span className="lim" style={{ top: 2 }}>{fmtPrice(market, hi)}</span>}
        {lims && <span className="lim" style={{ bottom: 2 }}>{fmtPrice(market, lo)}</span>}
        {h > 0 && placed.map((t) => (
          <span key={t.key} className={'tag ' + t.cls + (t.edge ? ' edge' : '')} style={{ top: t.y }}>
            {t.label && <b>{t.label}</b>}<span>{fmtPrice(market, t.price)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── 화면 ────────────────────────────────────────────────────────────────
/** 시트는 손절·익절 하나뿐이다. 진입은 시트 없이 한 번에 한다. */
type Sheet = null | 'stops';
interface Result { k: number; kind: 'close' | 'tp' | 'sl' | 'liq'; pnl: number; margin: number; roe: number; name: string; dirText: string; lev: number }

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
  useEffect(() => () => { window.clearTimeout(noteT.current); window.clearTimeout(armT.current); window.clearTimeout(resT.current); }, []);

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
  const tab = tabs.find((t) => t.id === market)!;
  const lev = pos ? pos.lev : tr.lev ?? run.futures.defaultLev;
  const pct = tr.pct;
  const prev = orderPreview(g, market, pos ? pos.dir : 1, lev, pct);
  const ruler = levRuler(g);
  const mood = marketMood(g, market, hist);
  const cm = chartModel(hist);
  const offline = net.source === 'server' && net.conn !== 'open';
  const status =
    run.marketStatus === 'halted' ? '시장 정지 · 포지션은 멈춰 있습니다'
    : run.marketStatus === 'delayed' ? '시세 지연 · 새 진입은 막혀 있습니다'
    : offline ? '시장에 연결할 수 없습니다' : null;
  const ins = m.minable ? shortInsurance(run, market) : null;
  const call = !!pos && isNearLiq(pos);
  const rawPos = run.positions[market];
  /** 지금 정리하면 넣은 돈(증거금)에 더해지거나 빠지는 돈. 넣은 돈 + 이 값 = 돌려받는 돈(closeBack). 결과 카드도 같은 셈이다. */
  const netNow = pos && rawPos ? pos.back - rawPos.margin0 : 0;

  // 포지션이 사라지면(정리·손절·익절·청산) 결과를 손익 줄 자리에 잠깐 보여 준다.
  const raw = run.positions[market];
  useEffect(() => {
    const was = seen.current;
    if (!raw && was && was.market === market) {
      const lc = run.lastClose;
      const liq = !!lc && lc.liq && lc.market === market && lc.tick >= was.tick;
      const pnl = liq ? -was.p.margin0 : closeBack(was.p, px) - was.p.margin0; // 넣은 돈 + pnl = 돌려받은 돈
      const kind: Result['kind'] = liq ? 'liq' : manual.current ? 'close' : pnl >= 0 ? 'tp' : 'sl';
      manual.current = false;
      setArm(false);
      setSheet(null);
      setResult((r) => ({ k: (r?.k ?? 0) + 1, kind, pnl, margin: was.p.margin0, roe: (pnl / Math.max(1, was.p.margin0)) * 100, name: m.name, dirText: was.p.dir === 1 ? '롱' : '숏', lev: was.p.lev }));
      window.clearTimeout(resT.current);
      resT.current = window.setTimeout(() => setResult(null), 5200);
      if (!liq) play(pnl > 0 ? 'close_profit' : 'close_loss'); // 청산 소리는 watch.ts 가 낸다
      if (pnl > 0) { flyAcorns(plRef.current?.getBoundingClientRect() ?? null, Math.min(7, 3 + Math.floor(pnl / 8000))); swing(true); }
    }
    if (raw && (!was || was.market !== market)) { setResult(null); }
    seen.current = raw ? { p: raw, market, tick: run.tick } : null;
  });
  useEffect(() => { setArm(false); setResult(null); setSheet(null); }, [market]);

  const doOpen = (dir: 1 | -1) => {
    // 튜토리얼 거래(U-31): 첫 한 번은 정해 둔 돈·배율로, 짜 둔 시세 위에서
    if (useProto.getState().tutorial === 'await') { if (tutorialOpen(dir)) { setSheet(null); setResult(null); setEntered((k) => k + 1); swing(true); } return; }
    if (useProto.getState().tutorial === 'run') return;
    const r = act({ type: 'open', market, dir, lev, marginPct: pct, sl: tr.sl, tp: tr.tp });
    if (!r.ok) { say(r.msg ?? '들어갈 수 없습니다'); play('insufficient'); return; }
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
    setSheet(null);
    setEntered((k) => k + 1);
    swing();
  };
  const doClose = () => {
    if (!pos) return;
    // 손실을 확정하는 정리만 한 번 더 묻는다(되돌릴 수 없는 손실에만 확인).
    if (netNow < 0 && !arm) {
      setArm(true);
      window.clearTimeout(armT.current);
      armT.current = window.setTimeout(() => setArm(false), 2000);
      return;
    }
    manual.current = true;
    const r = act({ type: 'close', market });
    if (!r.ok) { manual.current = false; say(r.msg ?? '정리할 수 없습니다'); }
    else if (r.code === 'reserved') { manual.current = false; say('시세 지연 중이라 예약되었습니다. 열리면 정리됩니다.', false); }
  };
  const stepOf = (opts: (number | null)[], cur: number | null, d: 1 | -1) => opts[(opts.indexOf(cur) + d + opts.length) % opts.length];
  const curSl = pos ? pos.slRoe : tr.sl;
  const curTp = pos ? pos.tpRoe : tr.tp;
  const setStops = (sl: number | null, tp: number | null) => {
    if (pos) {
      const r = act({ type: 'stops', market, sl, tp });
      if (!r.ok) say(r.msg ?? '바꿀 수 없습니다');
      else if (r.code === 'reserved') say('시세 지연 중이라 예약되었습니다. 열리면 적용됩니다.', false);
    } else setTrade({ sl, tp });
  };
  const slTxt = curSl === null ? '없음' : `−${Math.abs(curSl)}%`;
  const tpTxt = curTp === null ? '없음' : `+${curTp}%`;

  const frame = (body: ReactNode, cls = '') => (
    <div className="pt-wrap">
      <div className={'pt' + cls} data-pc={g.settings.priceColors} data-mode={mode.mode}>
        <Charm r={charm} />
        <header className="pt-bar">
          <span className="logo"><Acorn size={17} /></span>
          <b>{EXCHANGE_NAME}</b>
          <em>선물</em>
        </header>
        {body}
      </div>
    </div>
  );

  // 0단계: 아직 앱이 잠겨 있다
  if (mode.mode === 'locked') {
    return frame(
      <div className="pt-lockbox"><Lock size={34} /><p>{(run.stats.assetsSeized ?? 0) > 0 ? '쳇바퀴가 압류되어 거래 앱이 잠겼습니다. 쳇바퀴를 다시 사야 열립니다.' : mode.text}</p></div>,
    );
  }

  const tutBanner = tutSt === 'await' || tutSt === 'run' ? (
    <div className="pt-tutb" role="status" data-tut={tutSt}>{tutSt === 'await' ? <>오소리 대부 「롱이든 숏이든 한번 걸어 보세요.」 <b>{comma(tutorialMargin())} · {TUT.lev}배</b></> : <>…시세가 움직인다</>}</div>
  ) : null;
  const coins = (
    <>{tutBanner}<div className="pt-coins" data-hl="coins" role="tablist" aria-label="종목">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === market} className={'pt-ct' + (t.id === market ? ' on' : '')} onClick={() => setTrade({ market: t.id })}>
          <Coin id={t.id} size={20} />
          <span className="nm">{marketById[t.id].name}</span>
          <small className={t.pct >= 0 ? 'up' : 'down'}><Tri up={t.pct >= 0} size={7} />{Math.abs(t.pct).toFixed(1)}%</small>
          {t.hasPos && <i className={'pd ' + ((t.posRoe ?? 0) >= 0 ? 'up' : 'down')} aria-label="포지션 있음" />}
        </button>
      ))}
    </div></>
  );
  const quote = (
    <div className="pt-quote">
      <div className="px"><b>{fmtPrice(market, px)}</b><span className={tab.pct >= 0 ? 'up' : 'down'}><Tri up={tab.pct >= 0} size={10} />{pctTxt(tab.pct).slice(1)}</span></div>
      {status ? <div className="st-bad" role="status">{status}</div> : <div className={'mood m-' + (mood === '잔잔함' ? 'calm' : mood === '격동' ? 'wild' : 'mid')}><span>지금 장</span>{mood}</div>}
    </div>
  );
  const chart = (
    <>
      <PChart market={market} hist={hist} pos={pos} />
      <div className="pt-meta">
        <span>{cm.label}</span>
        {ins && (ins.walletValue > 0 || ins.shortNotional > 0) && <span>지갑 {comma(Math.floor(ins.walletValue))}어치 중 숏으로 지킨 {ins.ratioPct}%</span>}
      </div>
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

  const plus = !!pos && pos.roe >= 0;
  const liqRoe = pos ? Math.abs(((pos.liq / pos.entry - 1) * pos.dir) * pos.lev * 100) : 100;
  const gx = (roe: number) => 50 + Math.max(-50, Math.min(50, (roe / liqRoe) * 50));
  const tut = tutorialLine(g);

  const stepper = (label: string, cls: string, txt: string, on: boolean, dec: () => void, inc: () => void) => (
    <div className={'pt-step ' + cls + (on ? ' set' : '')}>
      <button aria-label={`${label} 낮추기`} onClick={dec}><Chev dir="l" /></button>
      <div className="v"><small>{label}</small><b>{txt}</b></div>
      <button aria-label={`${label} 높이기`} onClick={inc}><Chev /></button>
    </div>
  );
  const stops = (
    <div className="pt-stops">
      {stepper('손절', 'sl', slTxt, curSl !== null, () => setStops(stepOf(SL_OPTIONS, curSl, -1), curTp), () => setStops(stepOf(SL_OPTIONS, curSl, 1), curTp))}
      {stepper('익절', 'tp', tpTxt, curTp !== null, () => setStops(curSl, stepOf(TP_OPTIONS, curTp, -1)), () => setStops(curSl, stepOf(TP_OPTIONS, curTp, 1)))}
    </div>
  );
  const marginChips = (
    <div className="pt-mg" data-hl="mg" role="radiogroup" aria-label="증거금">
      {MARGIN_PCTS.map((p) => (
        <button key={p} role="radio" aria-checked={pct === p} className={'pt-chip' + (pct === p ? ' on' : '')} onClick={() => setTrade({ pct: p })}>
          <b>{p === 100 ? '전부' : `${p}%`}</b><small>{comma(marginFromPct(run.cash, lev, p))}</small>
        </button>
      ))}
    </div>
  );
  const noteLine = note && <div key={note.k} className={'pt-note' + (note.bad ? ' bad' : '')} role="status">{note.text}</div>;

  // 주문 조건은 늘 펼쳐져 있다: 배율 눈금자(포지션이 없을 때) + 증거금 칩 + 위험 한 줄. 롱·숏을 누르면 바로 들어간다.
  const liqAbs = Math.abs(prev.liqPct).toFixed(Math.abs(prev.liqPct) < 10 ? 1 : 0);
  const order = (
    <div className="pt-order">
      {!pos && (
        <div className="pt-ruler" data-hl="ruler" role="radiogroup" aria-label="배율">
          {ruler.map((nt) => (
            <button key={nt.lev} role="radio" aria-checked={nt.lev === lev} aria-label={`${nt.lev}배${nt.locked ? ' 잠김' : ''}`}
              className={'nt' + (nt.lev === lev ? ' on' : '') + (nt.hot ? ' hot' : '') + (nt.locked ? ' locked' : '')}
              onClick={() => { if (nt.locked) say(nt.lockText!, false); else setTrade({ lev: nt.lev }); }}>
              <i>{nt.locked && <Lock size={12} />}</i><b>{nt.lev}{nt.lev === lev ? '배' : ''}</b>
            </button>
          ))}
        </div>
      )}
      {marginChips}
      <div className={'pt-risk' + (prev.reason ? ' bad' : '') + (pos ? ' add' : '')} data-hl="risk" role="status">
        {prev.reason ? <span>{prev.reason}</span> : (
          <>
            <span>{pos ? '추가 ' : ''}증거금 {comma(prev.margin)} · 수수료 {comma(prev.fee)}</span>
            {pos ? <span>배율 {pos.lev}배 그대로</span> : <b>청산 약 −{liqAbs}%</b>}
          </>
        )}
      </div>
    </div>
  );

  let lower: ReactNode;
  if (sheet === 'stops') {
    lower = (
      <section className="pt-sheet" aria-label="손절·익절">
        <div className="sh-top">
          <div className="sh-title"><b>손절·익절</b><span>{pos ? `${m.name} ${pos.dirText} ${pos.lev}배` : '다음 진입에 걸린다'}</span></div>
          <button className="pt-x" aria-label="손절·익절 닫기" onClick={() => setSheet(null)}><Cross /></button>
        </div>
        {stops}
        {noteLine}
      </section>
    );
  } else {
    lower = (
      <>
        {result ? (
          <div key={'r' + result.k} ref={plRef} className={'pt-pl res ' + (result.pnl >= 0 ? 'win' : 'lose') + ' k-' + result.kind} role="status" onClick={() => setResult(null)}>
            <img className="me" src={heroFront} alt="" />
            <div className="big">
              <div className="roe">{money(result.pnl)}</div>
              <div className="sub">넣은 돈 {comma(Math.round(result.margin))} <b className={result.pnl >= 0 ? 'up' : 'down'}>{money(result.pnl)}</b><span className="xtra">ROE {roeTxt(result.roe)} · {result.dirText} {result.lev}배</span></div>
            </div>
            <div className="stamp">{result.kind === 'liq' ? '강제 청산' : result.kind === 'tp' ? '익절' : result.kind === 'sl' ? '손절' : '정리 완료'}</div>
          </div>
        ) : pos ? (
          <div key={'p' + entered} ref={plRef} className={'pt-pl ' + (plus ? 'plus' : 'minus') + (call ? ' call' : '') + (entered ? ' in' : '')} aria-label="내 포지션">
            <div className="pl-top">
              <img className={'me' + (call ? ' shake' : '')} src={heroFront} alt="" />
              <div className="big">
                <div className="roe">{Math.abs(pos.roe) >= 100 ? `${sign(pos.roe)}${Math.abs(pos.roe).toFixed(0)}%` : roeTxt(pos.roe)}</div>
                <div className="sub"><b>{money(pos.pnl)}</b> 도토리</div>
              </div>
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
            <div className="fact">
              <Coin id={market} size={16} />{m.name} <b className={pos.dir === 1 ? 'up' : 'down'}>{pos.dirText}</b> {pos.lev}배<span>증거금 {comma(Math.round(pos.margin))}</span>
              {pos.tags.length > 0 && <span className="tg">{pos.tags.join(', ')}</span>}
            </div>
          </div>
        ) : tut && !tutBanner ? (
          <p className="pt-tut"><img src={heroFront} alt="" />{tut}</p>
        ) : null}
        {order}
        {/* 확인서를 찍을 수 있을 때는 손절·익절 줄 자리에 확인서가 온다(화면 높이를 늘리지 않는다) */}
        {!pos && mode.waiver ? (
        <button className="pt-waiver" data-waiver onClick={() => { const r = act({ type: 'signWaiver' }); if (r.ok) { play('overdue_stamp'); say('고위험 거래 확인서에 도장을 찍었다. 200배까지 열렸다.', false); } else say(r.msg ?? '아직 안 됩니다'); }}>
          <span><b>고위험 거래 확인서</b><small>「손실은 전부 본인 책임입니다」 · 도장을 찍으면 200배</small></span><i>도장</i>
        </button>
        ) : (
        <button className="pt-cond" data-hl="cond" onClick={() => setSheet('stops')}>
          <span className="vals">
            {curSl === null && curTp === null ? <span>손절·익절 없음</span> : <><span className={curSl !== null ? 'set' : ''}>손절 {slTxt}</span><span className={curTp !== null ? 'set' : ''}>익절 {tpTxt}</span></>}
          </span>
          <span className="more">바꾸기<Chev size={11} /></span>
        </button>
        )}
        {noteLine}
        <div className="pt-orders" data-hl={pos ? undefined : 'orders'}>
          {pos ? (
            <>
              <button className={'pt-btn ' + (pos.dir === 1 ? 'long' : 'short')} disabled={!!prev.reason} onClick={doAdd}>
                <span><Tri up={pos.dir === 1} size={13} />추가 진입</span><small>+{comma(prev.margin)}</small>
              </button>
              <button className={'pt-btn close' + (arm ? ' arm' : '') + (netNow >= 0 ? ' gain' : '')} data-hl="closeBtn" onClick={doClose}>
                <span>{arm ? '한 번 더 누르면 정리' : '정리하기'}</span>
                <small>{rawPos ? comma(Math.round(rawPos.margin0)) : ''} <b className={arm ? '' : netNow >= 0 ? 'up' : 'down'}>{money(netNow)}</b>{arm ? ' 확정' : ''}</small>
              </button>
            </>
          ) : (
            <>
              <button className="pt-btn long" disabled={!!prev.reason} onClick={() => doOpen(1)}><span><Tri up size={13} />롱</span><small>오른다 · {lev}배</small></button>
              <button className="pt-btn short" disabled={!!prev.reason} onClick={() => doOpen(-1)}><span><Tri up={false} size={13} />숏</span><small>내린다 · {lev}배</small></button>
            </>
          )}
        </div>
      </>
    );
  }

  return frame(<>{coins}{quote}{chart}{lower}</>, (sheet ? ' sheet-open' : '') + (call ? ' near' : ''));
}

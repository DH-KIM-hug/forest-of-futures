// 라이트 모드의 거래 중 만화 컷(docs/gdd/LITE_CONTI.md 3부, 장면 B). 그림은 컬러 만화 컷, 글씨(효과음)와 숫자는 화면이 얹는다.
//   pray  C1 평가손 기도: 증거금의 절반 넘게 잃은 채 들고 있다(청산이 아직 코앞은 아닐 때). 세로 세 칸, 진짜 날짜와 시각, 진짜 평가손익. 판마다 한 번
//   near  C2 청산 직전(위험 0.7 이상): 질린 얼굴 + 진짜 시세로 그린 먹 차트 + 스~~윽, 멈칫…, ??, 쿵덕 쿵덕(심장 박동에 맞춰). 판마다 한 번
//   liq   C3 강제 청산: 우는 얼굴, 붉은 번쩍, 주륵 주륵, 부들 부들, 쿵덕 쿵덕!!, 「진다는 건 있을 수 없어…!」, 청산 도장과 잃은 돈
//   first C4 이번 생 처음 이긴 실전 판, 그 뒤로는 이번 생 신기록: 울다 웃는 다로미, 세로 다짐, 흑 흐끅 하하, 진짜 거래의 WIN 상자와 잔액
//   win   C5 대박 이상(넣은 돈의 네 배 이상): 별 눈, 번쩍!!, 두둥!!
//   lev   장면 B 50배 넘게 걸 때, 생마다 처음 한 번: 간다…!
// pray 와 near 는 누름이 그대로 지나간다([정리하기]를 가리지 않는다). 나머지는 누르면 닫힌다. 1.3~2.6초(first 만 4.5초), 서로 20초 간격, near 는 90초 pray 는 2분에 한 번. 움직임 줄이기면 흔들지 않는다.
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../../store/gameStore';
import { useProto } from '../protoStore';
import { useOpenPositions } from '../Lot';
import { historyOf } from '../../priceHistory';
import { closedMath } from '../watch';
import { dangerOf, burstTier } from '../tension';
import { claim } from '../model';
import { reduced, useFx } from '../fx';
import { balance, marketById } from '../../../engine/data';
import { liqPrice } from '../../../engine/futures';
import { comma } from '../../../engine/util';
import type { GameState, Position } from '../../../engine/types';
import cutNear from '../img/manga/cut_near.webp';
import cutLiq from '../img/manga/cut_liq.webp';
import cutWin from '../img/manga/cut_win.webp';
import cutLev from '../img/manga/cut_lev.webp';
import cutFirst from '../img/manga/cut_first.webp';
import dChart from '../img/manga/d_chart.webp';
import dBack from '../img/manga/d_back.webp';
import { lev100Due } from './LiteCuts';
import './lite.css';

type Kind = 'pray' | 'near' | 'liq' | 'win' | 'lev' | 'first';
interface WinData { name: string; dir: 1 | -1; lev: number; entry: number; exit: number; movePct: number; pnl: number; roe: number; cash: number; dec: number; record: boolean }
interface Cut { k: number; kind: Kind; market: string; pnl?: number; lost?: number; win?: WinData; at?: Date }

const MS: Record<Kind, number> = { pray: 2600, near: 1800, liq: 2200, win: 1900, lev: 1300, first: 4500 };
const GAP_MS = 20_000;
/** 200배는 거의 판마다 청산 근처를 지난다: 청산 직전 컷은 90초에 한 번, 기도는 2분에 한 번만(드물어야 특별하다) */
export const NEAR_GAP_MS = 90_000, PRAY_GAP_MS = 120_000;
/** 평가손 기도: 넣은 돈의 이만큼(%) 넘게 잃고 있을 때. 청산 위험이 이보다 낮을 때만(곧 청산될 판에는 C2 가 뜬다) */
export const PRAY_ROE = -50, PRAY_MAX_DANGER = 0.72;
/** 결심 컷은 이 배율을 넘을 때 */
export const LEV_CUT_OVER = 50;

/** 지난 56초의 진짜 시세(1초 기록)로 4초 봉 14개 */
function candles(market: string): { o: number; h: number; l: number; c: number }[] {
  const h = historyOf(market).filter((x) => x > 0).slice(-56);
  const out: { o: number; h: number; l: number; c: number }[] = [];
  for (let i = 0; i < h.length; i += 4) { const s = h.slice(i, i + 4); if (s.length) out.push({ o: s[0], h: Math.max(...s), l: Math.min(...s), c: s[s.length - 1] }); }
  return out;
}

/** 먹으로 그린 차트(그림의 오른쪽 빈 칸에): 봉, 청산선, 다가가는 쪽으로 점선 */
function InkChart({ market, liq, dir }: { market: string; liq: number; dir: 1 | -1 }) {
  const cs = candles(market);
  if (cs.length < 2) return null;
  const W = 100, H = 100;
  const lo = Math.min(liq, ...cs.map((c) => c.l)), hi = Math.max(liq, ...cs.map((c) => c.h));
  const pad = (hi - lo) * 0.08 || hi * 0.0005;
  const y = (v: number) => H - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * H;
  const bw = W / cs.length;
  const last = cs[cs.length - 1];
  const ly = y(liq);
  return (
    <svg className="mc-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {cs.map((c, i) => {
        const x = i * bw + bw / 2, up = c.c >= c.o;
        const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke="#111" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
            <rect x={x - bw * 0.32} y={top} width={bw * 0.64} height={Math.max(1.2, bot - top)} fill={up ? '#fff' : '#111'} stroke="#111" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
      <line x1={0} x2={W} y1={ly} y2={ly} stroke="#E23B3B" strokeWidth={2.4} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
      <path d={`M${W - bw / 2} ${y(last.c)} L${W - bw / 2} ${ly + (dir === 1 ? -2 : 2)}`} stroke="#111" strokeWidth={3} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Lt({ t, x, y, fs, rot = 0, cls = '', v = false }: { t: string; x: number; y: number; fs: number; rot?: number; cls?: string; v?: boolean }) {
  return <b className={'mc-sfx ' + cls + (v ? ' v' : '')} style={{ left: `${x}%`, top: `${y}%`, ['--fs' as string]: `${fs}cqw`, ['--rot' as string]: `${rot}deg` }} aria-hidden="true">{t}</b>;
}
/** 그림 위 말풍선 자리의 글 */
function Say({ t, x, y, w, h, fs }: { t: string; x: number; y: number; w: number; h: number; fs: number }) {
  return <div className="mc-think" style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, fontSize: `${fs}cqw` }}><span>{t}</span></div>;
}

/** 기기 시계의 날짜와 시각(예: 2026년 11월 28일 새벽 3시) */
export function clockCaption(d: Date): string {
  const h = d.getHours();
  const part = h < 6 ? '새벽' : h < 12 ? '아침' : h < 18 ? '오후' : '밤';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${part} ${h12}시`;
}
const isNight = (d: Date): boolean => d.getHours() < 6 || d.getHours() >= 21;

export function MangaCut() {
  const [cut, setCut] = useState<Cut | null>(null);
  const q = useRef<Cut[]>([]);
  const cutRef = useRef<Cut | null>(null);
  const lastAt = useRef(0);
  const seen = useRef(new Set<string>());
  const levLife = useRef(-1);
  const kindAt = useRef<Partial<Record<Kind, number>>>({});
  const best = useRef({ gen: -1, pnl: 0 });
  const kRef = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const openPs = useOpenPositions();
  const g = useGame((s) => s.g);

  const open = (c: Cut) => {
    cutRef.current = c; setCut(c);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(close, MS[c.kind]);
  };
  const close = () => {
    window.clearTimeout(timer.current);
    const nx = q.current.shift() ?? null;
    cutRef.current = null; setCut(null);
    if (nx) window.setTimeout(() => open(nx), 120);
  };
  /** force = 청산, 첫 승리처럼 꼭 보여야 하는 것(간격을 무시하고 줄을 선다) */
  const show = (c: Omit<Cut, 'k'>, force = false): boolean => {
    const now = Date.now();
    if (!force && (now - lastAt.current < GAP_MS || cutRef.current)) return false;
    lastAt.current = now;
    const full = { ...c, k: ++kRef.current };
    if (cutRef.current) { q.current.push(full); return true; }
    open(full);
    return true;
  };

  // C3 강제 청산
  useFx((e) => {
    if (e.kind !== 'liq') return;
    show({ kind: 'liq', market: e.market, lost: e.lost }, true);
  });

  // 판이 열리고 닫히는 것을 본다(엔진 상태를 읽기만 한다)
  useEffect(() => {
    let prev: GameState = useGame.getState().g;
    return useGame.subscribe((s) => {
      const g1 = s.g, run = g1.run;
      if (best.current.gen !== g1.family.generation) best.current = { gen: g1.family.generation, pnl: 0 };
      if (g1.family.generation !== prev.family.generation || run.tick - prev.run.tick > 30) { prev = g1; return; }
      const P = useProto.getState();
      // 장면 B: 50배 넘게 건다(생마다 처음 한 번)
      for (const p of Object.values(run.positions)) {
        const was = prev.run.positions[p.market];
        if ((!was || was.openTick !== p.openTick) && p.lev > LEV_CUT_OVER && levLife.current !== g1.family.generation && P.scenes.length === 0 && !lev100Due(p.lev)) {
          levLife.current = g1.family.generation;
          show({ kind: 'lev', market: p.market });
        }
      }
      // 닫힌 판
      const closed = Object.values(prev.run.positions).filter((p) => { const c = run.positions[p.market]; return !c || c.openTick !== p.openTick; });
      for (const p of closed) {
        const m = closedMath(run, p as Position);
        if (m.kind === 'liq') continue; // 청산은 useFx 가 본다
        const firstWin = m.pnl > 0 && !P.seen.liteFirstWin;
        const record = m.pnl > 0 && best.current.pnl > 0 && m.pnl > best.current.pnl;
        if (m.pnl > best.current.pnl) best.current.pnl = m.pnl;
        if (firstWin || record) {
          if (firstWin) P.patch({ seen: { ...useProto.getState().seen, liteFirstWin: true } });
          const def = marketById[p.market];
          show({ kind: 'first', market: p.market, win: { name: def?.name ?? p.market, dir: p.dir, lev: p.lev, entry: p.entry, exit: m.exit, movePct: ((m.exit - p.entry) / p.entry) * 100, pnl: m.pnl, roe: (m.pnl / Math.max(1, p.margin0)) * 100, cash: run.cash, dec: def?.decimals ?? 2, record: !firstWin } }, true);
          continue;
        }
        const t = burstTier(m.pnl, p.margin0, claim(prev).total);
        if (t && t.lv >= 4) show({ kind: 'win', market: p.market, pnl: m.pnl });
      }
      prev = g1;
    });
  }, []);

  // C2 청산 직전, C1 평가손 기도: 판마다 한 번
  const maint = balance.trading.maintenanceRate as number;
  const rows = openPs.map((p) => ({ p, d: dangerOf(p.liqDistPct, p.lev, maint) }));
  const near = [...rows].sort((a, b) => b.d - a.d)[0];
  useEffect(() => {
    if (useProto.getState().scenes.length > 0) return;
    for (const { p, d } of rows) {
      const raw = g.run.positions[p.market];
      if (!raw) continue;
      const key = p.market + ':' + raw.openTick;
      // 청산 직전은 간격을 무시한다(줄을 서서라도 뜬다). 기도는 간격에 막히면 다음 기회에(본 것으로 치지 않는다)
      const now = Date.now();
      if (d >= 0.7 && !seen.current.has('near:' + key)) { seen.current.add('near:' + key); if (now - (kindAt.current.near ?? -1e9) >= NEAR_GAP_MS) { kindAt.current.near = now; show({ kind: 'near', market: p.market }, true); } return; }
      if (p.netRoe <= PRAY_ROE && d < PRAY_MAX_DANGER && !seen.current.has('pray:' + key) && now - (kindAt.current.pray ?? -1e9) >= PRAY_GAP_MS) { if (show({ kind: 'pray', market: p.market, pnl: p.net, at: new Date() })) { seen.current.add('pray:' + key); kindAt.current.pray = now; } return; }
    }
  });

  if (!cut) return null;
  const calm = reduced();
  const raw = g.run.positions[cut.market];
  const danger = near?.d ?? 0.8;
  const beat = `${(0.95 - 0.45 * Math.min(1, danger)).toFixed(2)}s`;
  const pass = cut.kind === 'near' || cut.kind === 'pray';
  const label = { pray: '평가손 기도', near: '청산이 코앞', liq: '강제 청산', first: cut.win?.record ? '신기록' : '첫 실전 승리', win: '크게 이겼다', lev: '고배율 진입' }[cut.kind];
  const w = cut.win;
  const px = (v: number) => (w ? v.toLocaleString('ko-KR', { minimumFractionDigits: Math.min(w.dec, 6), maximumFractionDigits: Math.min(w.dec, 6) }) : String(v));
  const at = cut.at ?? new Date();
  // 평가손익은 지금 값을 따라간다(판이 아직 열려 있으면)
  const livePnl = cut.kind === 'pray' ? (openPs.find((p) => p.market === cut.market)?.net ?? cut.pnl ?? 0) : 0;

  if (cut.kind === 'pray') return (
    <div key={cut.k} className={'manga-cut pass k-pray' + (calm ? ' calm' : '') + (isNight(at) ? ' night' : '')} data-cut="pray" role="status" aria-live="polite" aria-label={`${label}, 평가손익 ${comma(Math.round(livePnl))}`}>
      <div className="mc-strip">
        <div className="mc-panel s1">
          <img src={dChart} alt="" draggable={false} />
          <div className="mc-date">{clockCaption(at)}</div>
          <Say t="힉!" x={3} y={7} w={13} h={16} fs={4.2} />
          <Say t="히익…" x={2} y={44} w={11} h={14} fs={3.2} />
          <Lt t="딸깍" x={48} y={66} fs={4.6} rot={-8} />
          <Lt t="딸깍" x={74} y={40} fs={3.6} rot={10} />
        </div>
        <div className="mc-panel s2">
          <img src={dBack} alt="" draggable={false} />
          <Say t="신이시여… 제발" x={7} y={10} w={26} h={22} fs={3.6} />
          <Say t="이 돈은 빚인데…" x={66} y={10} w={27} h={23} fs={3.6} />
          <Lt t="딸깍" x={66} y={46} fs={4} rot={-6} />
        </div>
        <div className="mc-panel s3 pink">
          <b className="mc-v l">절대로 날리지 않을 거예요……!</b>
          <div className="mc-eval"><small>평가손익</small><b>{livePnl >= 0 ? '+' : '−'}{comma(Math.abs(Math.round(livePnl)))}</b></div>
          <b className="mc-v r">이 돈은</b>
        </div>
      </div>
    </div>
  );

  const img = { near: cutNear, liq: cutLiq, win: cutWin, lev: cutLev, first: cutFirst }[cut.kind];
  return (
    <div key={cut.k} className={'manga-cut k-' + cut.kind + (calm ? ' calm' : '') + (pass ? ' pass' : '')} data-cut={cut.kind} role="status" aria-live="polite" aria-label={label} onClick={pass ? undefined : close}>
      {cut.kind === 'liq' && <i className="mc-red" aria-hidden="true" />}
      <div className="mc-panel" style={{ ['--beat' as string]: beat }}>
        <img src={img} alt="" draggable={false} />
        {cut.kind === 'near' && <>
          <div className="mc-chartbox">{raw ? <InkChart market={cut.market} liq={liqPrice(raw)} dir={raw.dir} /> : null}</div>
          <Lt t="스~~윽" x={90} y={12} fs={5.2} v cls="slide" />
          <Lt t="멈칫…" x={6} y={6} fs={3.6} rot={-8} />
          <Lt t="??" x={38} y={44} fs={9} rot={8} cls="pop late" />
          <Lt t="쿵덕 쿵덕!!" x={2} y={76} fs={7.4} rot={-6} cls="heart" />
          <Lt t="청산" x={53} y={3} fs={2.6} cls="tag" />
        </>}
        {cut.kind === 'liq' && <>
          <Lt t="주륵 주륵" x={4} y={6} fs={6} rot={-5} cls="drip" />
          <Lt t="부들 부들" x={36} y={13} fs={5} rot={4} cls="shake" />
          <Lt t="쿵덕 쿵덕!!" x={3} y={80} fs={6.4} rot={-4} cls="heart" />
          <Say t="진다는 건 있을 수 없어…!" x={72} y={6} w={24} h={22} fs={2.6} />
          <div className="mc-liqstamp"><b>청산</b>{cut.lost !== undefined && cut.lost > 0 && <span>잃은 돈 −{comma(cut.lost)}</span>}</div>
        </>}
        {cut.kind === 'win' && <>
          <Lt t="번쩍!!" x={5} y={3} fs={8} rot={-8} cls="pop" />
          <Lt t="두둥!!" x={66} y={5} fs={6.4} rot={7} cls="pop late" />
          {cut.pnl !== undefined && <b className="mc-pnl">+{comma(Math.round(cut.pnl))}</b>}
        </>}
        {cut.kind === 'lev' && <>
          <Lt t="간다…!" x={76} y={8} fs={9} v cls="pop" />
          <Lt t="꿀꺽" x={58} y={70} fs={3.6} rot={10} />
        </>}
        {cut.kind === 'first' && w && <>
          <b className="mc-vow" aria-hidden="true">이 빚, 반드시 갚는다!</b>
          {[['흑', 25, 6, -10], ['흐끅', 54, 3, 8], ['아하핫', 70, 12, -6], ['하하!', 82, 34, 10], ['아핫!!', 20, 46, -12]].map(([t, x, y, r], i) => (
            <b key={i} className="mc-sob" style={{ left: `${x}%`, top: `${y}%`, ['--rot' as string]: `${r}deg`, animationDelay: `${0.1 + i * 0.12}s` }} aria-hidden="true">{t}</b>
          ))}
          <div className="mc-winbox" data-winbox>
            <em>{w.record ? '신기록!' : 'WIN!'}</em>
            <div className="wb-n">{w.name} {w.dir === 1 ? '롱' : '숏'} {w.lev}배</div>
            <div className="wb-p">{px(w.entry)} → {px(w.exit)}</div>
            <div className="wb-m">{w.movePct >= 0 ? '▲' : '▼'}{Math.abs(w.movePct).toFixed(2)}% <small>×{w.lev}</small> → {w.roe >= 0 ? '+' : '−'}{Math.abs(w.roe).toFixed(0)}%</div>
            <div className="wb-g">이익 +{comma(Math.round(w.pnl))}</div>
          </div>
          <div className="mc-bal" data-balance={Math.round(w.cash)}>다로미 FRX 잔액 <b>{comma(Math.round(w.cash))}</b></div>
        </>}
      </div>
      {!pass && <small className="mc-hint" aria-hidden="true">눌러서 닫기</small>}
    </div>
  );
}

// 날다람쥐코인 길잡이(라이트, 프롤로그 바로 뒤): 오소리 대부가 빨대를 물고 자기 거래소를 보여 준다. 걸음표는 flyTutSteps.ts.
// 말만 하는 걸음은 아무 데나 누르면 넘어가고, 행동 걸음은 비춘 단추를 진짜로 눌러야 넘어간다(그 밖은 눌리지 않는다).
// 거래 화면(Trade.tsx)은 건드리지 않는다: 이미 붙은 data 속성과 class 로 단추를 찾아 그 둘레만 뚫어 둔다.
// 말풍선은 비춘 단추, 종목 줄, [정리하기]를 덮지 않는 자리에 뜬다. 장면(컷인)이 뜨면 잠깐 비켜 준다.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../../store/gameStore';
import { useUI } from '../../uiStore';
import { useProto } from '../protoStore';
import { balance } from '../../../engine/data';
import { forecast } from '../../../engine/settlement';
import { flySeconds } from '../../../engine/feed/fly';
import { flySecOf } from '../flyWind';
import { chartModel, fmtPrice, marketTabs } from '../../vm/trade';
import { claim } from '../model';
import { closedMath } from '../watch';
import { sprite } from '../sprites';
import { play } from '../audio';
import { reduced } from '../fx';
import { isLite } from '../config';
import { markTip } from '../guide';
import { FT_STEPS, FT_LEV, FT_PCT, FT_SHOW_LEV, ftActDone, ftNext, ftJump, ftResume, ftSeenBefore, markFtSeen, type FtCtx, type FtTarget } from './flyTutSteps';
import type { Position } from '../../../engine/types';
import faceThink from '../img/manga/face_think.webp';
import faceHappy from '../img/manga/face_happy.webp';
import './flyTutorial.css';

const MR = balance.trading.maintenanceRate as number;
/** 비출 곳 → 화면 조각. 거래 화면에 원래 붙은 속성과 class 를 쓴다 */
const TARGETS: Record<FtTarget, string | (() => Element | null)> = {
  flyTab: '.pt-coins .pt-ct.on',
  quote: '.pt-quote',
  wind: () => document.querySelector('.pt-wind') ?? document.querySelector('.pt-chart'),
  chart: '.pt-chart',
  orders: '.pt-orders',
  lev50: `.pt-ruler [data-lev="${FT_LEV}"]`,
  lev200: `.pt-ruler [data-lev="${FT_SHOW_LEV}"]`,
  mg25: () => Array.from(document.querySelectorAll('.pt-mg button')).find((b) => b.querySelector('b')?.textContent?.trim() === `${FT_PCT}%`) ?? null,
  firstGo: '[data-first-go]',
  orderBtns: '.pt-orders',
  posNet: '[data-hl="posNet"]',
  posLiq: '[data-hl="posLiq"]',
  close: '.pt-btn.close',
  settle: '[data-lite-settle]',
  mapTab: '[data-tab="map"]',
};
const find = (t: FtTarget | undefined): Element | null => {
  if (!t) return null;
  const s = TARGETS[t];
  return typeof s === 'string' ? document.querySelector(s) : s();
};

interface Box { x: number; y: number; w: number; h: number }
interface Layout { W: number; H: number; target: Box | null; coins: Box | null; close: Box | null; plot: Box | null; dotY: number | null }
const boxOf = (el: Element | null, o: DOMRect): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
};
const hit = (a: Box, b: Box | null, pad = 0) => !!b && a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
const PAD = 6;
/** 구멍 뚫린 덮개(evenodd): 겉 사각형 + 구멍들 */
const holePath = (W: number, H: number, holes: Box[]) => `path(evenodd, 'M0 0H${W}V${H}H0Z${holes.map((b) => `M${b.x - PAD} ${b.y - PAD}h${b.w + PAD * 2}v${b.h + PAD * 2}h${-(b.w + PAD * 2)}Z`).join('')}')`;

/** 말풍선 자리: 비춘 곳, 종목 줄, [정리하기]를 덮지 않고 비춘 곳에 가장 가까운 높이 */
export function placeBubble(L: Pick<Layout, 'W' | 'H' | 'target' | 'coins' | 'close'>, bh: number): { top: number; below: boolean } {
  const avoid = [L.target, L.coins, L.close].filter(Boolean) as Box[];
  const t = L.target;
  const want = t ? t.y + t.h / 2 : L.H * 0.56;
  let best: { top: number; d: number } | null = null;
  for (let top = 8; top + bh <= L.H - 8; top += 4) {
    const b = { x: 10, y: top, w: L.W - 20, h: bh };
    if (avoid.some((a) => hit(b, a, PAD + 4))) continue;
    const d = t ? Math.min(Math.abs(top - (t.y + t.h)), Math.abs(top + bh - t.y)) : Math.abs(top + bh / 2 - want);
    if (!best || d < best.d) best = { top, d };
  }
  const top = best?.top ?? Math.max(8, L.H - bh - 110);
  return { top, below: !!t && top >= t.y + t.h / 2 };
}

export function FlyTutorial() {
  const st = useProto((s) => s.flyTut);
  if (!isLite || st !== 'run') return null;
  return <FlyTutorialOn />;
}

function FlyTutorialOn() {
  const g = useGame((s) => s.g);
  const tr = useUI((s) => s.trade);
  const scenes = useProto((s) => s.scenes.length);
  const tab = useProto((s) => s.tab);
  const prologue = useProto((s) => s.prologue);
  const run = g.run;
  const rawPos = run.positions.FLY as Position | undefined;
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [i, setI] = useState(() => ftResume(!!rawPos));
  const [canSkip] = useState(ftSeenBefore);
  const [L, setL] = useState<Layout | null>(null);
  const [bh, setBh] = useState(118);
  const [pulse, setPulse] = useState(0);
  const tapped = useRef(false);
  const at = useRef(performance.now());
  const bub = useRef<HTMLDivElement>(null);
  /** 들고 있던 판(닫힌 뒤 손익을 센다) · 닫힌 판 · 시작할 때 정산 번호 */
  const lastPos = useRef<Position | null>(rawPos ?? null);
  const [closed, setClosed] = useState<FtCtx['closed']>(null);
  const settle0 = useRef(run.settleNo);
  const step = FT_STEPS[i];
  const hidden = scenes > 0 || prologue || tab !== 'phone';

  useEffect(() => { setRoot(document.querySelector('.pr') as HTMLElement | null); }, []);
  // 오픈 기념 문자가 길잡이와 같은 때 떴으면 내려 두었다가 끝난 뒤에 다시 뜨게 한다(seen.ftHeldSms)
  useEffect(() => {
    const P = useProto.getState();
    if (!P.scenes.some((x) => x.id === 'feeEventSms')) return;
    P.patch({ scenes: P.scenes.filter((x) => x.id !== 'feeEventSms'), seen: { ...P.seen, feeEventSms: true, ftHeldSms: true } });
  }, [scenes]);
  // 시작할 때: 거래소를 날다람쥐로, 첫 실전 카드가 뜨게. 첫 정산 장면은 이 길잡이가 대신 말한다. 오픈 기념 문자는 끝난 뒤로 미룬다
  useEffect(() => {
    const P = useProto.getState();
    const seen = { ...P.seen };
    if (!seen.feeEventSms) { seen.feeEventSms = true; seen.ftHeldSms = true; }
    P.patch({ tab: 'phone', firstTry: Math.max(1, P.firstTry), cutCount: Math.max(1, P.cutCount), seen });
    useUI.getState().setTrade({ market: 'FLY' });
    // 손익과 청산까지는 이 길잡이가 말한다: 다음 판에 같은 설명 컷인(guide.ts pos.net, pos.liq)이 또 뜨지 않게
    markTip('pos.net'); markTip('pos.liq');
  }, []);
  // 판이 열려 있는 동안 마지막 모습을 들고 있다가, 닫히면 엔진의 거래 기록으로 손익을 센다
  useEffect(() => {
    if (rawPos) { lastPos.current = rawPos; return; }
    const p = lastPos.current;
    if (p && !closed) {
      const c = closedMath(run, p);
      setClosed({ kind: c.kind, pnl: Math.round(c.pnl) });
    }
  }, [rawPos, run, closed]);
  // 걸음이 바뀌면: 누름 기록을 지우고, 비출 곳이 보이게 굴린다
  useEffect(() => {
    tapped.current = false;
    at.current = performance.now();
    const el = find(step?.target);
    if (el && step?.target !== 'settle' && step?.target !== 'mapTab') (el as HTMLElement).scrollIntoView?.({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  }, [i]);

  // 자리 재기: 비춘 곳, 종목 줄, 정리하기, 차트(청산선 미리 보기)
  useEffect(() => {
    if (!root) return;
    let raf = 0, last = '';
    const loop = () => {
      const o = root.getBoundingClientRect();
      const dot = document.querySelector('.pt-chart .dot');
      const lay: Layout = {
        W: o.width, H: o.height,
        target: boxOf(find(step?.target), o),
        coins: boxOf(document.querySelector('.pt-coins'), o),
        close: boxOf(document.querySelector('.pt-btn.close'), o),
        plot: step?.ghostLiq ? boxOf(document.querySelector('.pt-chart .plot'), o) : null,
        dotY: step?.ghostLiq && dot ? (() => { const r = dot.getBoundingClientRect(); return r.top + r.height / 2 - o.top; })() : null,
      };
      const k = JSON.stringify(lay);
      if (k !== last) { last = k; setL(lay); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [root, i]);
  useLayoutEffect(() => { const h = bub.current?.offsetHeight; if (h && Math.abs(h - bh) > 2) setBh(h); });

  // 대사 값
  const ctx: FtCtx = useMemo(() => {
    const fc = forecast(g);
    const t = marketTabs(g).find((x) => x.id === 'FLY');
    const net = t?.posNet ?? null;
    const cl = claim(g);
    return {
      lev: FT_LEV, liqPct: (1 / FT_LEV - MR) * 100, interest: Math.round(fc.interest), living: Math.round(fc.living), claim: Math.round(cl.total),
      up: t ? t.pct >= 0 : null, pc: g.settings.priceColors === 'intl' ? 'intl' : 'kr',
      candles: !!document.querySelector('.pt-chart [data-candle], .pt-chart .candle'),
      net: net === null ? null : Math.round(net), closed, settled: run.settleNo > settle0.current,
    };
  }, [g, closed]);

  const finish = (how: 'done' | 'skip') => {
    const P = useProto.getState();
    const seen = { ...P.seen };
    if (seen.ftHeldSms) { seen.feeEventSms = false; delete seen.ftHeldSms; }
    if (how === 'done') markFtSeen();
    P.patch({ flyTut: how, seen });
  };
  const go = (to: number) => { if (to < 0) { play('paw_stamp'); finish('done'); return; } setI(to); };

  // 판이 닫히면 들고 있던 걸음에서 결과로
  useEffect(() => { const j = ftJump(i, !!closed); if (j !== i) setI(j); }, [closed, i]);
  // 행동 걸음: 비춘 단추를 누른 결과가 화면에 들어오면 다음
  const ui = { lev: tr.lev ?? null, pct: tr.pct, keep: !!tr.keep, tpK: tr.tpK ?? null, slK: tr.slK ?? null, hasPos: !!rawPos, closed: !!closed };
  useEffect(() => {
    if (!step || step.kind === 'text') return;
    if (ftActDone(step.id, ui, tapped.current)) { const t = window.setTimeout(() => go(ftNext(i, !!closed)), step.kind === 'wait' ? 500 : 260); return () => window.clearTimeout(t); }
  });
  // 비춘 단추를 누른 순간을 잡는다(누름은 그대로 단추에 간다)
  useEffect(() => {
    if (!step || step.kind === 'text' || !step.target) return;
    const on = (e: Event) => { const el = find(step.target); if (el && el.contains(e.target as Node)) { tapped.current = true; } };
    document.addEventListener('click', on, true);
    return () => document.removeEventListener('click', on, true);
  }, [i]);

  if (!root || !step || hidden) return null;
  const W = L?.W ?? 390, H = L?.H ?? 844;
  const tgt = L?.target ?? null;
  // 눌러도 되는 구멍: 행동 걸음은 비춘 단추, 들고 있는 동안은 늘 [정리하기]
  const pass: Box[] = [];
  const isAct = step.kind !== 'text';
  const actMissing = isAct && !tgt;
  if (isAct && tgt) pass.push(tgt);
  if (step.phase === 'hold' && L?.close && !(isAct && tgt && step.target === 'close')) pass.push(L.close);
  const lit: Box[] = tgt ? [tgt, ...pass.filter((b) => b !== tgt)] : pass;
  const onCatch = () => {
    if (performance.now() - at.current < 380) return; // 연타가 대사를 건너뛰지 않게
    if (isAct && !actMissing) { play('insufficient'); setPulse((x) => x + 1); return; }
    play('ui_tap');
    go(ftNext(i, !!closed));
  };
  const pl = L ? placeBubble(L, bh) : { top: H * 0.5, below: false };
  // 대부는 빨대 컵을 든 반신, 다로미는 만화 얼굴(이긴 판 뒤에는 웃는 얼굴)
  const face = step.who === 'boss' ? sprite('boss') : { src: step.phase === 'post' && (closed?.pnl ?? 0) > 0 ? faceHappy : faceThink };
  const tailX = tgt ? Math.max(40, Math.min(W - 40, tgt.x + tgt.w / 2)) - 10 : null;
  const hint = isAct && !actMissing ? (step.kind === 'wait' ? '기다리거나, 정리하기' : '반짝이는 곳을 눌러요') : '눌러서 계속';

  return createPortal(
    <div className="ft" data-ft={step.id} data-ft-kind={step.kind} aria-live="polite">
      <div className="ft-dim" style={{ clipPath: holePath(W, H, lit) }} aria-hidden="true" />
      <div className="ft-catch" style={{ clipPath: holePath(W, H, actMissing ? [] : pass) }} onClick={onCatch} />
      {tgt && <i key={'r' + pulse} className={'ft-ring' + (isAct ? ' act' : '') + (pulse ? ' no' : '')} style={{ left: tgt.x - PAD, top: tgt.y - PAD, width: tgt.w + PAD * 2, height: tgt.h + PAD * 2 }} aria-hidden="true" />}
      {step.ghostLiq && L?.plot && <GhostLiq L={L} />}
      <div ref={bub} key={step.id} className={'ft-bub ft-' + step.who + (pl.below ? ' below' : ' above')} style={{ top: pl.top, ...(tailX !== null ? { ['--tx' as string]: `${tailX - 10}px` } : {}) } as CSSProperties} onClick={onCatch} role="dialog" aria-label={step.who === 'boss' ? '오소리 대부' : '다로미'}>
        {face && <span className="ft-face"><span className="ft-ph"><img src={face.src} alt="" draggable={false} /></span>{step.sfx && <b className="ft-sfx" aria-hidden="true">{step.sfx}</b>}</span>}
        <div className="ft-say">
          <small className="ft-who">{step.who === 'boss' ? '오소리 대부' : '다로미'}</small>
          <p>{step.line(ctx)}</p>
          <span className="ft-hint">{hint}</span>
        </div>
        {tgt && tailX !== null && <i className="ft-tail" aria-hidden="true" />}
        {canSkip && <button className="ft-skip" data-ft-skip onClick={(e) => { e.stopPropagation(); play('ui_tap'); finish('skip'); }}>건너뛰기</button>}
      </div>
    </div>,
    root,
  );
}

/** 청산선 미리 보기: 지금 값에서 롱이면 아래로, 숏이면 위로 그 배율의 청산 거리. 차트 밖이면 가장자리에 화살표 */
function GhostLiq({ L }: { L: Layout }) {
  const run = useGame((s) => s.g.run);
  const plot = L.plot!;
  const sec = flySecOf(run);
  if (sec === null) return null;
  const data = flySeconds(sec, 120);
  const cm = chartModel(data, data.length);
  const pad = (cm.dataHi - cm.dataLo) * 0.1;
  const lo = cm.dataLo - pad, hi = cm.dataHi + pad;
  const last = data[data.length - 1];
  const yOf = (p: number) => (L.dotY ?? plot.y + ((hi - last) / (hi - lo)) * plot.h) + ((last - p) / (hi - lo)) * plot.h;
  const dist = (1 / FT_LEV - MR) * 100;
  const lines = [
    { k: 'long', p: last * (1 - 1 / FT_LEV + MR), label: `롱 청산 ${fmtPrice('FLY', last * (1 - 1 / FT_LEV + MR))}` },
    { k: 'short', p: last * (1 + 1 / FT_LEV - MR), label: `숏 청산 ${fmtPrice('FLY', last * (1 + 1 / FT_LEV - MR))}` },
  ];
  return (
    <>
      {lines.map((l) => {
        const y = yOf(l.p);
        const out = y < plot.y + 6 ? 'up' : y > plot.y + plot.h - 6 ? 'down' : null;
        const yy = Math.max(plot.y + 4, Math.min(plot.y + plot.h - 4, y));
        return (
          <div key={l.k} className={'ft-liq ' + l.k + (out ? ' out' : '')} data-ft-liq={l.k} style={{ left: plot.x, width: plot.w, top: yy }} aria-hidden="true">
            <b>{out === 'up' ? '▲ ' : out === 'down' ? '▼ ' : ''}{l.label}{out ? `, ${(Math.round(dist * 10) / 10).toString()}% ${out === 'up' ? '위' : '아래'}` : ''}</b>
          </div>
        );
      })}
    </>
  );
}

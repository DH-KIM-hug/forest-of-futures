// 라이트 모드의 거래 중 만화 컷 2탄(docs/gdd/LITE_ENDINGS.md 「곳곳에 만화」). 그림은 컬러 만화 컷, 효과음과 숫자는 화면이 얹는다.
//   knock  낼 수 없는 정산 10초 전: 문 창에 붙은 추심원 얼굴, 똑 똑 똑…, 남은 초(진짜 카운트다운), 이자와 손의 돈. 정산마다 한 번
//   sign   청산 뒤 90초 안에 또 빌림: 떨리는 손의 서명, 덜덜덜, 「…한 번만 더.」 생마다 한 번
//   streak 세 판 내리 이김: 선글라스 칩멍크, 후훗…, 3연승(4연승…). 3분에 한 번
//   read   날다람쥐 판을 이겼는데 들고 있는 사이 교과서 모양이 그 쪽으로 끝났다: 읽었다…!, 모양 이름. 3분에 한 번
//   lev100 처음으로 100배 넘게 건다(이 기기에서 한 번): 레버를 끝까지, {배율}배…!, 이제 돌이킬 수 없다
// 모두 화면 위쪽에 뜨고 그림만 눌린다(누르면 닫힘). 그림 바깥은 누름이 그대로 지나가 [정리하기]를 가리지 않는다.
// 다른 만화 컷(.manga-cut)이 떠 있으면 기다리지 않고 건너뛴다(knock 은 기다린다). 서로 25초 간격. 움직임 줄이기면 흔들지 않는다.
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../../store/gameStore';
import { useProto } from '../protoStore';
import { closedMath } from '../watch';
import { forecast } from '../../../engine/settlement';
import { comma } from '../../../engine/util';
import { donePatterns, flySecOf } from '../flyWind';
import { reduced, useFx } from '../fx';
import { play } from '../audio';
import { pdev } from '../config';
import type { GameState, Position } from '../../../engine/types';
import './lite.css';
import './liteEnding.css';

const IMGS = import.meta.glob('../img/manga/cut_{knock,sign,streak,read,lev100}.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const img = (k: string): string | undefined => IMGS[`../img/manga/cut_${k}.webp`];

export type LiteCutKind = 'knock' | 'sign' | 'streak' | 'read' | 'lev100';
interface Cut { k: number; kind: LiteCutKind; n?: number; label?: string; lev?: number; due?: number; cash?: number }
const MS: Record<LiteCutKind, number> = { knock: 10_000, sign: 2400, streak: 2400, read: 2400, lev100: 2200 };
export const LITE_CUT_GAP_MS = 25_000;
/** 같은 종류가 다시 뜨기까지 */
export const LITE_CUT_KIND_GAP_MS: Record<LiteCutKind, number> = { knock: 0, sign: 0, streak: 180_000, read: 180_000, lev100: 0 };
export const KNOCK_SEC = 10, SIGN_AFTER_LIQ_MS = 90_000, STREAK_N = 3, LEV100 = 100;
const LEV100_KEY = 'fc.lite.lev100';
const everLev100 = (): boolean => { try { return localStorage.getItem(LEV100_KEY) === '1'; } catch { return false; } };
/** 처음 100배 넘게 거는 판이면 LiteCuts 의 lev100 컷이 맡는다(MangaCut 의 「간다…!」는 건너뛴다) */
export const lev100Due = (lev: number): boolean => lev >= LEV100 && !everLev100();
const markLev100 = (): void => { try { localStorage.setItem(LEV100_KEY, '1'); } catch { /* 저장 못 해도 이번 판은 한 번 */ } };

/** 날다람쥐 판 p 를 들고 있는 사이(지금부터 held 초 전까지) 교과서대로, 그 판의 쪽으로 끝난 모양 */
export function readPattern(run: GameState['run'], p: Position, heldSec: number): string | null {
  if (p.market !== 'FLY') return null;
  const now = flySecOf(run);
  if (now === null) return null;
  const e = donePatterns(now - heldSec - 2, now).filter((x) => x.ok && x.dir === p.dir).pop();
  return e ? e.label : null;
}

function Fx({ t, x, y, fs, rot = 0, cls = '', v = false }: { t: string; x: number; y: number; fs: number; rot?: number; cls?: string; v?: boolean }) {
  return <b className={'mc-sfx ' + cls + (v ? ' v' : '')} style={{ left: `${x}%`, top: `${y}%`, ['--fs' as string]: `${fs}cqw`, ['--rot' as string]: `${rot}deg` }} aria-hidden="true">{t}</b>;
}

export function LiteCuts() {
  const [cut, setCut] = useState<Cut | null>(null);
  const cutRef = useRef<Cut | null>(null);
  const lastAt = useRef(0);
  const kindAt = useRef<Partial<Record<LiteCutKind, number>>>({});
  const liqAt = useRef(-1e12);
  const signLife = useRef(-1);
  const knockSettle = useRef(-1);
  const streak = useRef({ gen: -1, n: 0 });
  const kRef = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const g = useGame((s) => s.g);

  const close = () => { window.clearTimeout(timer.current); cutRef.current = null; setCut(null); };
  const show = (c: Omit<Cut, 'k'>): boolean => {
    const now = Date.now();
    if (cutRef.current || document.querySelector('.manga-cut, .lite-manga')) return false;
    if (now - lastAt.current < LITE_CUT_GAP_MS && c.kind !== 'knock') return false;
    if (now - (kindAt.current[c.kind] ?? -1e12) < LITE_CUT_KIND_GAP_MS[c.kind]) return false;
    lastAt.current = now; kindAt.current[c.kind] = now;
    const full = { ...c, k: ++kRef.current };
    cutRef.current = full; setCut(full);
    play(c.kind === 'knock' ? 'ui_tap' : c.kind === 'streak' ? 'win_fanfare' : 'ui_tap');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(close, MS[c.kind]);
    return true;
  };

  /** 같은 순간에 다른 만화 컷(MangaCut)이 뜨는지 DOM 에 그려진 뒤에 본다 */
  const soon = (c: Omit<Cut, 'k'>, ok?: () => void) => window.setTimeout(() => { if (show(c)) ok?.(); }, 80);

  // 화면 확인용(&pdev=…): window.__liteCut({ kind: 'streak', n: 3 }) 이 간격을 무시하고 띄운다
  useEffect(() => {
    if (!pdev) return;
    (window as unknown as { __liteCut?: (c: Omit<Cut, 'k'>) => void }).__liteCut = (c) => { lastAt.current = 0; kindAt.current = {}; cutRef.current = null; show(c); };
  }, []);

  useFx((e) => { if (e.kind === 'liq') { liqAt.current = Date.now(); streak.current.n = 0; if (cutRef.current) close(); } });

  useEffect(() => {
    let prev: GameState = useGame.getState().g;
    return useGame.subscribe((s) => {
      const g1 = s.g, run = g1.run;
      if (g1.family.generation !== prev.family.generation || run.tick - prev.run.tick > 30 || run.over) { prev = g1; return; }
      if (streak.current.gen !== g1.family.generation) streak.current = { gen: g1.family.generation, n: 0 };
      const P = useProto.getState();
      // lev100: 처음으로 100배 넘게
      for (const p of Object.values(run.positions)) {
        const was = prev.run.positions[p.market];
        if ((!was || was.openTick !== p.openTick) && p.lev >= LEV100 && !everLev100() && P.scenes.length === 0) {
          markLev100();
          soon({ kind: 'lev100', lev: p.lev });
        }
      }
      // sign: 청산 뒤 90초 안에 또 빌린다
      for (const id of ['shark1', 'shark2', 'capital', 'bank'] as const) {
        const k = `borrow.${id}`;
        if (((run.stats[k] as number | undefined) ?? 0) > ((prev.run.stats[k] as number | undefined) ?? 0) && Date.now() - liqAt.current < SIGN_AFTER_LIQ_MS && signLife.current !== g1.family.generation) {
          const gen = g1.family.generation;
          signLife.current = gen;
          soon({ kind: 'sign' }, () => { signLife.current = gen; });
        }
      }
      // 닫힌 판: 연승, 읽었다
      const closed = Object.values(prev.run.positions).filter((p) => { const c = run.positions[p.market]; return !c || c.openTick !== p.openTick; });
      for (const p of closed) {
        const m = closedMath(run, p as Position);
        if (m.kind === 'liq') continue;
        if (m.pnl > 0) {
          streak.current.n += 1;
          const pat = readPattern(run, p as Position, Math.max(1, run.tick - p.openTick));
          if (pat) soon({ kind: 'read', label: pat }, () => { kindAt.current.streak = Date.now(); });
          else if (streak.current.n >= STREAK_N) soon({ kind: 'streak', n: streak.current.n });
        } else streak.current.n = 0;
      }
      // knock: 낼 수 없는 정산 10초 전(정산마다 한 번)
      if (run.settleIn <= KNOCK_SEC && run.settleIn > 0 && knockSettle.current !== run.settleNo && P.scenes.length === 0) {
        const f = forecast(g1);
        const due = f.interest + f.living;
        const no = run.settleNo;
        if (run.cash < due) soon({ kind: 'knock', due, cash: Math.max(0, Math.floor(run.cash)) }, () => { knockSettle.current = no; });
      }
      // 정산이 지나가면 문 두드리는 컷은 닫는다
      if (cutRef.current?.kind === 'knock' && run.settleNo !== prev.run.settleNo) close();
      prev = g1;
    });
  }, []);

  if (!cut) return null;
  const calm = reduced();
  const src = img(cut.kind);
  const label = { knock: '추심원이 문을 두드린다', sign: '또 빌린다', streak: `${cut.n}연승`, read: '읽었다', lev100: `${cut.lev}배` }[cut.kind];
  const left = Math.max(0, Math.ceil(g.run.settleIn));
  return (
    <div key={cut.k} className={'manga-cut pass lite-cut k-' + cut.kind + (calm ? ' calm' : '')} data-cut={cut.kind} role="status" aria-live="polite" aria-label={label}>
      <div className="mc-panel lc-tap" onClick={close}>
        {src ? <img src={src} alt="" draggable={false} /> : <div className="lc-noimg" />}
        {cut.kind === 'knock' && <>
          <Fx t="똑" x={4} y={6} fs={8} rot={-10} cls="pop" />
          <Fx t="똑" x={16} y={14} fs={7} rot={6} cls="pop late" />
          <Fx t="똑…" x={28} y={6} fs={6} rot={-4} cls="pop late" />
          <b className="lc-count" aria-label={`정산까지 ${left}초`}>{left}</b>
          <div className="lc-due">이자 {comma(cut.due ?? 0)}<br />손에 {comma(cut.cash ?? 0)}</div>
        </>}
        {cut.kind === 'sign' && <>
          <Fx t="덜덜덜" x={4} y={4} fs={7} rot={-6} cls="shake" />
          <Fx t="슥…" x={70} y={66} fs={5} rot={8} cls="pop late" />
          <div className="mc-think lc-say" style={{ left: '31%', top: '3%', width: '34%', height: '20%' }}><span>…한 번만 더.</span></div>
        </>}
        {cut.kind === 'streak' && <>
          <Fx t="후훗…" x={66} y={8} fs={7} rot={6} cls="pop" />
          <b className="lc-big" style={{ right: '4%', top: '38%' }}>{cut.n}연승</b>
          <Fx t="나… 천재인가?" x={60} y={78} fs={3.6} rot={-3} cls="pop late" />
        </>}
        {cut.kind === 'read' && <>
          <Fx t="읽었다…!" x={4} y={4} fs={9} rot={-6} cls="pop" />
          <Fx t="번뜩" x={74} y={8} fs={5} rot={10} cls="pop late" />
          {cut.label && <div className="lc-tag">{cut.label}</div>}
        </>}
        {cut.kind === 'lev100' && <>
          <b className="lc-big" style={{ left: '4%', top: '6%' }}>{cut.lev}배…!</b>
          <Fx t="우우웅" x={6} y={46} fs={5.5} rot={-8} cls="shake" />
          <Fx t="이제 돌이킬 수 없다" x={4} y={78} fs={3.8} rot={-2} cls="pop late" />
        </>}
      </div>
      <small className="mc-hint" aria-hidden="true">눌러서 닫기</small>
    </div>
  );
}

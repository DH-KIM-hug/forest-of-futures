// 시제품 반응(juice) 한 곳: 사건 → 등급별 묶음. 시뮬레이션은 건드리지 않는다(game-feel).
import { coinImgHtml } from './coins';
//   소: 줍기 탭(눌림 + +n + 도토리 2~3알이 HUD 로 날아감), 숫자 굴러 오름
//   중: 구입(새 물건 팝), 정산(막대 번쩍), 추심원 도착
//   대: 강제 청산(장면 흔들림 + '청산' 도장), 파산
import { useEffect, useRef, useState } from 'react';
import { acornSvg, C, O } from './art';

export type FxEvent =
  | { kind: 'tap'; gain: string; wheel?: boolean; sold?: boolean }
  | { kind: 'settle'; mined: number; sold: boolean }
  | { kind: 'buy'; price: number; key: string }
  | { kind: 'liq'; market: string; /** 잃은 돈(U-49: 도장 밑에 숫자) */ lost?: number; lev?: number };

const subs = new Set<(e: FxEvent) => void>();
export const fx = {
  emit(e: FxEvent) { subs.forEach((f) => f(e)); },
  on(f: (e: FxEvent) => void) { subs.add(f); return () => { subs.delete(f); }; },
};
export function useFx(f: (e: FxEvent) => void): void {
  const ref = useRef(f);
  ref.current = f;
  useEffect(() => fx.on((e) => ref.current(e)), []);
}

export const reduced = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let live = 0;
/** 도토리 몇 알이 from 에서 HUD 도토리 숫자로 포물선을 그리며 날아간다. 동시에 12알까지. */
export function flyAcorns(from: DOMRect | null, n = 3): void {
  if (!from || reduced()) return;
  const target = document.getElementById('pr-acorn-ic');
  if (!target) return;
  const to = target.getBoundingClientRect();
  for (let i = 0; i < n && live < 12; i++) {
    const el = document.createElement('div');
    el.className = 'pr-fly';
    el.innerHTML = acornSvg(18);
    const sx = from.left + from.width / 2 + (Math.random() - 0.5) * 24;
    const sy = from.top + from.height * 0.35;
    el.style.left = `${sx - 9}px`;
    el.style.top = `${sy - 9}px`;
    document.body.appendChild(el);
    live++;
    const dx = to.left + to.width / 2 - sx, dy = to.top + to.height / 2 - sy;
    const side = (i % 2 ? 1 : -1) * (18 + Math.random() * 16);
    const a = el.animate(
      [
        { transform: 'translate(0,0) scale(.5) rotate(0deg)', opacity: 0.4 },
        { transform: `translate(${side}px,-34px) scale(1.15) rotate(${side * 3}deg)`, opacity: 1, offset: 0.28 },
        { transform: `translate(${dx}px,${dy}px) scale(.7) rotate(${side * 8}deg)`, opacity: 1 },
      ],
      { duration: 560 + i * 70, delay: i * 45, easing: 'cubic-bezier(.45,0,.75,.6)', fill: 'forwards' },
    );
    a.onfinish = () => {
      el.remove();
      live--;
      target.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
    };
  }
}

/** 날아가는 코인 · 지갑의 코인 그림: 로고 그림이 있으면 그것(U-40), 없으면 예전 SVG 동전 */
export const coinSvg = (size = 16, id = 'DTC'): string => coinImgHtml(id, size) ??
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="${C.dtc}" stroke="${O}" stroke-width="2.2"/><circle cx="12" cy="12" r="5" fill="none" stroke="${O}" stroke-width="1.6" opacity=".55"/></svg>`;

/** 작은 그림(코인 등)이 from 에서 to 로 날아간다. 동시에 16개까지. */
export function flyIcons(html: string, from: DOMRect | null, to: DOMRect | null, n = 1, o: { delay?: number; size?: number; onEnd?: () => void } = {}): void {
  if (!from || !to || reduced()) { if (o.onEnd) o.onEnd(); return; }
  const size = o.size ?? 16;
  for (let i = 0; i < n && live < 16; i++) {
    const el = document.createElement('div');
    el.className = 'pr-fly';
    el.style.width = el.style.height = `${size}px`;
    el.innerHTML = html;
    const sx = from.left + from.width / 2 + (Math.random() - 0.5) * 10;
    const sy = from.top + from.height / 2;
    el.style.left = `${sx - size / 2}px`;
    el.style.top = `${sy - size / 2}px`;
    document.body.appendChild(el);
    live++;
    const dx = to.left + to.width / 2 - sx, dy = to.top + to.height / 2 - sy;
    const arc = -26 - Math.random() * 12;
    const a = el.animate(
      [
        { transform: 'translate(0,0) scale(.6)', opacity: 0.5 },
        { transform: `translate(${dx * 0.4}px,${dy * 0.4 + arc}px) scale(1.1)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${dx}px,${dy}px) scale(.75)`, opacity: 1 },
      ],
      { duration: 460, delay: (o.delay ?? 0) + i * 60, easing: 'cubic-bezier(.4,0,.7,.7)', fill: 'both' },
    );
    a.onfinish = () => { el.remove(); live--; if (i === n - 1 && o.onEnd) o.onEnd(); };
  }
}

/** 숫자가 목표로 굴러간다(ease-out 350ms). 동작 줄이기면 바로 바뀐다. */
/** 그림이 마지막으로 그려진 때(requestAnimationFrame 심장 박동). 오래 안 그려졌으면 숫자는 굴리지 않고 바로 끝값 */
let lastFrame = 0;
let beating = false;
function heartbeat(): void {
  if (beating || typeof requestAnimationFrame === 'undefined') return;
  beating = true;
  const beat = () => { lastFrame = performance.now(); requestAnimationFrame(beat); };
  requestAnimationFrame(beat);
}
export function useCountUp(v: number, ms = 380, snapKey: string | number = ''): number {
  heartbeat();
  const [d, setD] = useState(v);
  const cur = useRef(v);
  const key = useRef(snapKey);
  // snapKey 가 바뀌면 굴리지 않고 바로 그 값(U-51: 반 익절로 판 크기가 반이 된 순간 — 굴러 내려가는 동안 비율이 엉뚱하게 보이던 것)
  const snap = key.current !== snapKey;
  key.current = snapKey;
  if (snap && cur.current !== v) { cur.current = v; if (d !== v) setD(v); }
  useEffect(() => {
    const from = cur.current;
    if (from === v) return;
    if (reduced() || Math.abs(v - from) < 2 || performance.now() - lastFrame > 300) { cur.current = v; setD(v); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const val = Math.round(from + (v - from) * (1 - Math.pow(1 - k, 3)));
      cur.current = val;
      setD(val);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // 그림이 그려지지 않는 동안(가려진 탭, 절전, 백그라운드)에는 requestAnimationFrame 이 오지 않는다: 굴리던 숫자가 그 자리에 멈춰
    // 포지션 카드만 +0.0% 로 남고 머리 알약과 정리 단추는 +14,023 이던 것(회차 15 평가). 시간이 지나면 시계로 끝값에 닿는다
    const done = window.setTimeout(() => { cancelAnimationFrame(raf); cur.current = v; setD(v); }, ms + 80);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(done); };
  }, [v, ms]);
  return d;
}

/** 실제 시계에 따른 시간대 색조(§10.3). */
export interface Tint { name: string; color: string; op: number; night: boolean }
export function tintAt(d = new Date()): Tint {
  const m = d.getHours() * 60 + d.getMinutes();
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ptime') : null; // 화면 확인용 덮어쓰기(예: ptime=2130)
  const mm = q ? +q.slice(0, -2) * 60 + +q.slice(-2) : m;
  if (mm >= 300 && mm < 420) return { name: '새벽', color: '#C9D6F2', op: 0.3, night: false };
  if (mm >= 420 && mm < 960) return { name: '낮', color: '#ffffff', op: 0, night: false };
  if (mm >= 960 && mm < 1080) return { name: '늦은 오후', color: '#F6D9A8', op: 0.18, night: false };
  if (mm >= 1080 && mm < 1170) return { name: '노을', color: '#F2B27A', op: 0.32, night: false };
  if (mm >= 1170 && mm < 1320) return { name: '저녁', color: '#8E86C7', op: 0.42, night: true };
  return { name: '밤', color: '#4E5C96', op: 0.55, night: true };
}
export function useClock(): Date {
  const [d, setD] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setD(new Date()), 15000); return () => window.clearInterval(t); }, []);
  return d;
}
export const clockText = (d: Date): string => {
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')}`;
};

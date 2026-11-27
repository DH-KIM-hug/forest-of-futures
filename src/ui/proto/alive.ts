// 살아 있는 인물(U-43 사용자: "츠키 애들은 움직이잖니?"): 화면의 모든 인물이 늘 조금씩 움직인다 — 숨(발을 축으로 1~2px), 눈 깜빡임, 가끔 고개.
// 가볍게: 숨 · 고개는 CSS 애니메이션(인물마다 길이와 엇박이 다르다), 깜빡임은 타이머 하나가 등록된 그림의 투명도만 바꾼다(리액트를 다시 그리지 않는다).
// 동작 줄이기: 깜빡임은 남기고 숨 · 고개는 끈다(CSS).
import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
/** 인물마다 다른 숨의 길이(1.3~1.8초, U-46)와 엇박, 고개를 까딱이는 긴 박자(7~13초). 같은 이름이면 늘 같은 값(순수) */
export function aliveVars(seed: string): { dur: number; delay: number; tilt: number } {
  const a = hash(seed), b = hash(seed + '#'), c = hash(seed + '~');
  return { dur: +(1.3 + a * 0.5).toFixed(2), delay: +(-b * 3).toFixed(2), tilt: +(7 + c * 6).toFixed(1) }; // U-46: 숨 1.3~1.8초(머리가 보이게 내려앉는다)
}
export const aliveStyle = (seed: string): CSSProperties => { const v = aliveVars(seed); return { ['--al-dur' as string]: `${v.dur}s`, ['--al-delay' as string]: `${v.delay}s`, ['--al-tilt' as string]: `${v.tilt}s` }; };

/** 다음 깜빡임까지(ms): 2.5~6초. rnd = 0~1 */
export const nextBlinkIn = (rnd: number): number => 2500 + rnd * 3500;
/** 눈을 감고 있는 시간(ms) · 두 번 깜빡일 몫 */
export const BLINK_MS = 120, DOUBLE_BLINK = 0.22;

interface Reg { el: Element; at: number; until: number; again: boolean; second: boolean }
const regs = new Set<Reg>();
let timer: number | undefined;
function tick(): void {
  const now = performance.now();
  for (const r of regs) {
    const st = (r.el as HTMLElement | SVGElement).style;
    if (r.until > 0 && now >= r.until) {
      st.opacity = '0'; r.until = 0;
      // 가끔 두 번: 눈을 뜬 지 0.13초 뒤에 한 번 더
      if (r.again) { r.at = now + 130; r.again = false; r.second = true; } else { r.at = now + nextBlinkIn(Math.random()); r.second = false; }
    } else if (r.until === 0 && now >= r.at) { st.opacity = '1'; r.until = now + BLINK_MS; if (!r.second) r.again = Math.random() < DOUBLE_BLINK; }
  }
  if (!regs.size && timer !== undefined) { window.clearInterval(timer); timer = undefined; }
}
/** 눈 감은 겹(투명도 0 으로 놓인 그림)을 깜빡임 타이머에 올린다. 돌려주는 ref 를 그 그림에 단다. */
export function useBlink<T extends Element>(): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const r: Reg = { el, at: performance.now() + nextBlinkIn(Math.random()), until: 0, again: false, second: false };
    regs.add(r);
    timer ??= window.setInterval(tick, 40);
    return () => { regs.delete(r); };
  }, []);
  return ref;
}

/** 말하는 동안 음절마다 몸이 살짝 들썩인다(U-43): 대사의 shown 번째 글자가 막 나왔을 때 부른다. 한글 · 숫자 · 영문 음절에서만, 동작 줄이기면 하지 않는다.
 *  리액트를 다시 그리지 않는다(Web Animations 한 번, 기존 숨 애니메이션에 더한다). */
export function talkBob(el: Element | null, text: string, shown: number): void {
  if (!el || shown <= 0 || typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (!isSyllable(text[shown - 1] ?? '')) return;
  (el as HTMLElement).animate?.([{ transform: 'translateY(0px) scaleY(1)' }, { transform: 'translateY(-1.6px) scaleY(1.018)' }, { transform: 'translateY(0px) scaleY(1)' }], { duration: 120, easing: 'ease-out', composite: 'add' });
}
/** 소리를 내는 글자인가(한글 음절 · 숫자 · 영문) */
export const isSyllable = (ch: string): boolean => /[가-힣0-9A-Za-z]/.test(ch);

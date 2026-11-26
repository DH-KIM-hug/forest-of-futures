// 대사가 한 글자씩 나오면서 웅얼거리는 소리가 같이 난다(U-36). 시간표는 babble.ts, 소리는 audio.ts.
// 글은 처음부터 다 놓아 두고 아직 안 나온 글자만 투명하게 한다 → 줄바꿈·카드 크기가 흔들리지 않고, 화면 읽기 프로그램은 한 번에 다 읽는다.
// 동작 줄이기(prefers-reduced-motion)여도 글자는 한 글자씩 나온다(화면이 움직이는 것이 아니라 글이 차는 것이라서). 탭 한 번이면 바로 다 보인다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { planSpeech, shownAt, voiceOf } from './babble';
import { speak } from './audio';

const noop = () => { /* 없음 */ };
export interface SpeechView { /** 보이는 글자 수 */ shown: number; typing: boolean; /** 바로 다 보이고 소리를 끊는다 */ finish: () => void; /** 다 나올 때까지(초, 기다림 포함) */ dur: number }

/**
 * @param id     같은 글이 이어 나와도 줄이 바뀐 것을 알게 하는 이름(줄 번호)
 * @param active false 면 아직 화면에 없는 줄(소리도 타자도 없다)
 * @param delay  말풍선·카드가 올라오는 동안 기다리는 시간(초)
 * @param mute   글자만 나오고 소리는 내지 않는다(컷인이 떠 있을 때의 세상 말풍선)
 */
export function useSpeech(text: string, who: string, o: { id?: string | number; active?: boolean; delay?: number; mute?: boolean } = {}): SpeechView {
  const active = o.active !== false;
  const delay = o.delay ?? 0;
  const sp = useMemo(() => { const v = voiceOf(who); return v ? planSpeech(text, v) : null; }, [text, who]);
  const key = `${o.id ?? ''}|${who}|${text}`;
  const [st, setSt] = useState({ key: '', shown: 0 });
  const stop = useRef<() => void>(noop);
  const done = useRef('');
  useEffect(() => {
    if (!sp || !active) return;
    const t0 = performance.now() + delay * 1000;
    stop.current = o.mute ? noop : speak(sp, delay);
    const timer = window.setInterval(() => {
      if (done.current === key) { window.clearInterval(timer); return; }
      const n = shownAt(sp, (performance.now() - t0) / 1000);
      setSt((s) => (s.key === key && s.shown === n ? s : { key, shown: n }));
      if (n >= sp.text.length) window.clearInterval(timer);
    }, 30);
    return () => { window.clearInterval(timer); stop.current(); stop.current = noop; };
  }, [key, active]);
  const shown = !sp || !active ? text.length : st.key === key ? st.shown : 0;
  const finish = () => { done.current = key; stop.current(); stop.current = noop; setSt({ key, shown: text.length }); };
  return { shown, typing: shown < text.length, finish, dur: sp && active ? delay + sp.typed : 0 };
}

/** 나온 글자 + 아직 안 나온 글자(투명). HTML 용 */
export function Typed({ text, shown }: { text: string; shown: number }) {
  if (shown >= text.length) return <>{text}</>;
  return <><span>{text.slice(0, shown)}</span><span className="untyped">{text.slice(shown)}</span></>;
}

/** 세상 속 말풍선(SVG text 안에 넣는다): 한 글자씩 + 웅얼거림 */
export function SvgSay({ text, who, delay, mute }: { text: string; who: string; delay?: number; mute?: boolean }) {
  const s = useSpeech(text, who, { delay, mute });
  if (!s.typing) return <>{text}</>;
  return <><tspan>{text.slice(0, s.shown)}</tspan><tspan fillOpacity={0}>{text.slice(s.shown)}</tspan></>;
}

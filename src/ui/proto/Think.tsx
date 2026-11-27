// 포지션을 들고 있는 동안 주인공이 속으로 하는 말(U-39 ①). 잠깐 떴다 사라지는 생각 풍선. 글자는 주인공 속마음 목소리로 한 글자씩 나온다(U-36).
import { useEffect, useState } from 'react';
import { useProto } from './protoStore';
import { Typed, useSpeech } from './speech';

function Inner({ text, cls }: { text: string; cls: string }) {
  const talking = useProto((s) => s.scenes.length > 0);
  const sp = useSpeech(text, 'hero', { id: text, mute: talking });
  return <div className={'pr-think ' + cls} data-think role="status"><Typed text={text} shown={sp.shown} /></div>;
}
/** cls = 놓이는 자리(home: 집의 주인공 머리 위, fx: 거래소 포지션 카드 위) */
export function Think({ cls, style }: { cls: string; style?: React.CSSProperties }) {
  const t = useProto((s) => s.think);
  if (!t) return null;
  return <div className={'pr-thinkbox ' + cls} style={style}><Inner key={t.k} text={t.text} cls={cls} /></div>;
}

/** 거래소의 말 자리(U-46 사용자: "거래하려는데 말풍선이 종목을 가려서 힘들어."): 차트 안쪽 왼쪽 위 한 줄 띠. 종목 줄 · 가격 꼬리표(차트 오른쪽 칸) · 주문 단추를 덮지 않고, 눌림은 통과한다.
 *  알림(toast)과 속마음(think) 가운데 하나만 — 알림이 먼저. 거래소에서는 더 빨리 사라진다(알림 2.6초, 속마음 4초). */
export function PhoneLane() {
  const toast = useProto((s) => s.toast);
  const think = useProto((s) => s.think);
  const [gone, setGone] = useState<string | null>(null);
  const text = toast ?? think?.text ?? null;
  const key = toast ? 't:' + toast : think ? 'h:' + think.k : null;
  useEffect(() => {
    if (!key) return;
    const t = window.setTimeout(() => setGone(key), toast ? 2600 : 4000);
    return () => window.clearTimeout(t);
  }, [key]);
  if (!text || gone === key) return null;
  return <div className={'pr-lane' + (toast ? ' toast' : ' think')} role="status" data-lane={toast ? 'toast' : 'think'} {...(toast ? {} : { 'data-think': '' })}>{toast ? text : <Inner2 text={text} />}</div>;
}
function Inner2({ text }: { text: string }) {
  const talking = useProto((s) => s.scenes.length > 0);
  const sp = useSpeech(text, 'hero', { id: text, mute: talking });
  return <Typed text={text} shown={sp.shown} />;
}

// 포지션을 들고 있는 동안 주인공이 속으로 하는 말(U-39 ①). 잠깐 떴다 사라지는 생각 풍선. 글자는 주인공 속마음 목소리로 한 글자씩 나온다(U-36).
// U-48: 풍선은 나온 글자만큼만 자란다(아직 안 나온 글자 자리를 비워 두지 않는다 — 큰 빈 점선 상자가 차트를 덮던 것). 여러 종목을 들면 앞에 그 종목의 작은 로고.
import { useEffect, useState } from 'react';
import { useProto } from './protoStore';
import { useSpeech } from './speech';
import { coinLogo } from './coins';

/** 나온 글자만(풍선이 글자와 함께 자란다) */
function Shown({ text }: { text: string }) {
  const talking = useProto((s) => s.scenes.length > 0);
  const sp = useSpeech(text, 'hero', { id: text, mute: talking });
  return <>{text.slice(0, Math.max(1, sp.shown))}</>;
}
const Mark = ({ m }: { m?: string }) => { const src = m ? coinLogo(m) : null; return src ? <img className="tk-coin" src={src} alt="" width={15} height={15} draggable={false} /> : null; };

/** cls = 놓이는 자리(home: 집의 주인공 머리 위) */
export function Think({ cls, style }: { cls: string; style?: React.CSSProperties }) {
  const t = useProto((s) => s.think);
  if (!t) return null;
  return <div className={'pr-thinkbox ' + cls} style={style}><div key={t.k} className={'pr-think ' + cls} data-think role="status" aria-label={t.text}><Mark m={t.m} /><Shown text={t.text} /></div></div>;
}

/** 거래소의 말 자리(U-46 사용자: "거래하려는데 말풍선이 종목을 가려서 힘들어."): 차트 안쪽 왼쪽 위 작은 띠. 종목 줄 · 가격 꼬리표(차트 오른쪽 칸) · 주문 단추를 덮지 않고, 눌림은 통과한다.
 *  알림(toast)과 속마음(think) 가운데 하나만 — 알림이 먼저. 거래소에서는 더 빨리 사라진다(알림 2.6초, 속마음 4초). */
export function PhoneLane() {
  const toast = useProto((s) => s.toast);
  const think = useProto((s) => s.think);
  const toastK = useProto((s) => s.toastK);
  const keep = useProto((s) => s.toastKeep);
  const [gone, setGone] = useState<string | null>(null);
  const text = toast ?? think?.text ?? null;
  const key = toast ? 't:' + toastK : think ? 'h:' + think.k : null;
  useEffect(() => {
    if (!key) return;
    const t = window.setTimeout(() => setGone(key), toast ? (keep ? 5000 : 2600) : 4000);
    return () => window.clearTimeout(t);
  }, [key]);
  if (!text || gone === key) return null;
  return <div className={'pr-lane' + (toast ? ' toast' : ' think') + (toast && keep ? ' keep' : '')} role="status" aria-label={text} data-lane={toast ? 'toast' : 'think'} {...(toast ? {} : { 'data-think': '' })}>{toast ? text : <><Mark m={think?.m} /><Shown key={think?.k} text={text} /></>}</div>;
}

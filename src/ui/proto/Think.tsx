// 포지션을 들고 있는 동안 주인공이 속으로 하는 말(U-39 ①). 잠깐 떴다 사라지는 생각 풍선. 글자는 주인공 속마음 목소리로 한 글자씩 나온다(U-36).
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

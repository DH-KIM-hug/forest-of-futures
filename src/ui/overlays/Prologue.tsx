import { useState } from 'react';
import { useUI } from '../uiStore';

export const PROLOGUE = [
  '숲의 금융이 무너진 해였다.',
  '아버지가 사고로 세상을 떠났다.\n장례를 치르고 나니 우편함에 통지서가 쌓여 있었다.',
  '남은 건 빈 오두막의 쳇바퀴 하나, 현금 0, 빚 30만.',
  '상속을 포기할 수 있는 기간은 석 달이었다.\n아무도 알려 주지 않았다.',
];
export const PROLOGUE_KEY = 'fof.prologue.v2';

/** 프롤로그 4장(8.10). 한 번 보면 다시 뜨지 않는다. */
export function PrologueScreen() {
  const [i, setI] = useState(0);
  const done = useUI((s) => s.finishPrologue);
  const last = i >= PROLOGUE.length - 1;
  return (
    <div className="prologue" role="dialog" aria-label="프롤로그">
      <button className="skip" onClick={done}>건너뛰기</button>
      <p key={i} className="pg">{PROLOGUE[i]}</p>
      <div className="dots" aria-hidden="true">{PROLOGUE.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
      <button className="act next" onClick={() => (last ? done() : setI(i + 1))}>{last ? '시작' : '다음'}</button>
    </div>
  );
}

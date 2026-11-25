import { useState } from 'react';
import { useGame } from '../../store/gameStore';

const PAGES = [
  ['도토리 금융 위기.', '엄마는 가진 것을 전부 잃었다.'],
  ['그리고 사고가 있었다.', '엄마는 돌아오지 않았다.'],
  ['남은 건 텐트 하나,', '현금 10만 도토리, 빚 30만 도토리.'],
];

export function Prologue() {
  const finish = useGame((s) => s.finishPrologue);
  const [i, setI] = useState(0);
  const next = () => (i >= PAGES.length - 1 ? finish() : setI(i + 1));
  return (
    <div className="prologue" onClick={next} role="dialog" aria-label="프롤로그">
      <button className="skip" onClick={(e) => { e.stopPropagation(); finish(); }}>건너뛰기</button>
      {PAGES[i].map((l) => <div key={l}>{l}</div>)}
      {i === PAGES.length - 1 && <div className="hs">"괜찮아. 이번엔 진짜야."</div>}
      <div className="tap">화면을 누르세요 ({i + 1}/{PAGES.length})</div>
    </div>
  );
}

// 라이트 모드의 머리: 빚, 손의 돈, 열린 판의 손익, 다음 정산까지의 시계와 낼 돈. 초당 수입은 없다(쳇바퀴가 없다).
import { useGame } from '../../../store/gameStore';
import { useProto } from '../protoStore';
import { useOpenPositions } from '../Lot';
import { Money } from '../Money';
import { Acorn } from '../art';
import { GIcon } from '../icons';
import { SoundBtn } from '../AudioUi';
import { LiveBadge } from '../../../net/hlDirect/LiveBadge';
import { clockText, useClock } from '../fx';
import { comma } from '../../../engine/util';
import { forecast } from '../../../engine/settlement';
import { settleSec } from '../../../engine/pace';
import { DEBT_IDS } from '../../../engine/data';
import { FlyTutorial } from './FlyTutorial';
import { useState } from 'react';
import { openLoan } from './LiteLoan';
import { LiteBook } from './LiteEnding';
import { openBoard } from '../ranking';
import { dayNoteOpen } from '../daynote';
import { play } from '../audio';
import { useUnlock } from '../rankUnlock';
import { liteSeenCount } from '../../../engine/liteFruit';
import { useLiteOpen } from './liteUnlock';
import { LiteUnlockStamp } from './LiteUnlockStamp';
import { DoorLine, Lurkers } from './Collectors';

/** 머리의 작은 아이콘(U-61, U-68): 전광판은 처음 다 갚은 뒤에만, 엔딩 도감은 엔딩을 하나라도 본 뒤에, 도토리일보는 첫 판을 닫은 뒤에 칸이 생긴다 */
function HudIcons({ onBook }: { onBook: () => void }) {
  // 처음 다 갚은 축하가 걸려 있거나 떠 있는 동안에는 아직 없다: 축하를 닫으면 그때 칸이 생긴다
  const rank = useUnlock((s) => !!s.rec && (s.rec.cheered || (!s.due && !s.cheer)));
  const book = useGame((s) => liteSeenCount(s.g.family.liteBook) > 0);
  const news = useLiteOpen(true).news;
  return (
    <span className="lt-icons">
      {rank && (
        <button data-hud-rank onClick={() => { play('ui_tap'); openBoard(); }} aria-label="숲 전광판">
          <GIcon name="board" size={24} />
        </button>
      )}
      {book && (
        <button data-hud-book onClick={() => { play('ui_tap'); onBook(); }} aria-label="엔딩 도감">
          <GIcon name="book" size={24} />
        </button>
      )}
      {news && (
        <button data-hud-news onClick={() => { play('ui_tap'); dayNoteOpen(true); }} aria-label="도토리일보">
          <GIcon name="news" size={24} />
        </button>
      )}
      <LiteUnlockStamp />
    </span>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

export function LiteHud() {
  const g = useGame((s) => s.g);
  const tab = useProto((s) => s.tab);
  const now = useClock();
  const run = g.run;
  const f = forecast(g);
  const due = Math.round(f.interest + f.living);
  const debt = DEBT_IDS.filter((id) => id !== 'tax').reduce((a, id) => a + run.debts[id].principal, 0);
  const od = DEBT_IDS.reduce((a, id) => a + run.debts[id].overdue, 0);
  const openPs = useOpenPositions();
  const openSum = openPs.reduce((a, p) => a + p.net, 0);
  const left = Math.max(0, run.settleIn);
  const span = settleSec(run);
  const short = run.cash < due;
  const [book, setBook] = useState(false);
  return (
    <header className="pr-hud lite tight" data-lite-hud>
      <div className="r1">
        <div className="lt">
          <div className="clock">{clockText(now)} <SoundBtn /><LiveBadge /></div>
          {/* U-63: 빚 칩을 누르면 아래 대출 탭으로 */}
          <div className="debt-row"><button className="debt" data-hl="debt" data-debt-open onClick={() => { play('ui_tap'); openLoan(); }} aria-label={`빚 ${comma(debt)}, 대출로`}><b>빚 {comma(debt)}</b>{od > 0 && <span className="hike">연체 {od}회</span>}</button><HudIcons onBook={() => setBook(true)} /></div>
        </div>
        <div className="acorn">
          <div className="n" data-hl="acorn"><Money value={run.cash} perSec={0} /><i id="pr-acorn-ic"><Acorn size={26} /></i></div>
          {openPs.length > 0 && tab !== 'phone' && <button className={'hpos ' + (openSum >= 0 ? 'up' : 'down')} data-hudpos={Math.round(openSum)} onClick={() => useProto.getState().setTab('phone')} aria-label={`열린 포지션 ${openPs.length}개 손익 합계, 거래소로`}>포지션 {openSum >= 0 ? '+' : '−'}{comma(Math.abs(Math.round(openSum)))}</button>}
        </div>
      </div>
      <div className={'lite-settle' + (short ? ' short' : '') + (left <= 10 ? ' soon' : '')} data-lite-settle={left} role="timer" aria-label={`다음 정산까지 ${mmss(left)}, 낼 돈 ${comma(due)}`}>
        <i style={{ width: `${Math.min(100, (1 - left / Math.max(1, span)) * 100)}%` }} />
        <span>정산 <b>{mmss(left)}</b></span>
        <span>이자 {comma(Math.round(f.interest))} + 생활비 {comma(Math.round(f.living))} = <b>−{comma(due)}</b>{short ? <em> 모자람</em> : null}</span>
      </div>
      {/* 프롤로그 뒤 날다람쥐코인 길잡이: 앱 뿌리(.pr)에 띄운다(머리 안에 있지 않다) */}
      <FlyTutorial />
      {/* 빚진 돈줄마다 추심원 하나(U-65): 머리 오른쪽 얼굴, 정산 문 앞의 띠 */}
      <Lurkers />
      <DoorLine />
      {book && <LiteBook onClose={() => setBook(false)} />}
    </header>
  );
}

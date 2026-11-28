// 라이트 모드의 머리: 빚, 손의 돈, 열린 판의 손익, 다음 정산까지의 시계와 낼 돈. 초당 수입은 없다(쳇바퀴가 없다).
import { useGame } from '../../../store/gameStore';
import { useProto } from '../protoStore';
import { useOpenPositions } from '../Lot';
import { Money } from '../Money';
import { Acorn } from '../art';
import { SoundBtn } from '../AudioUi';
import { LiveBadge } from '../../../net/hlDirect/LiveBadge';
import { clockText, useClock } from '../fx';
import { comma } from '../../../engine/util';
import { forecast } from '../../../engine/settlement';
import { settleSec } from '../../../engine/pace';
import { DEBT_IDS } from '../../../engine/data';
import { FlyTutorial } from './FlyTutorial';
import { useState } from 'react';
import { LoanButton, openLoan } from './LiteLoan';
import { LiteBook } from './LiteEnding';
import { openBoard } from '../ranking';
import { dayNoteOpen } from '../daynote';
import { play } from '../audio';
import { useUnlock } from '../rankUnlock';

/** 머리의 작은 아이콘 셋(U-61): 지도에서 가던 전광판, 엔딩 도감, 도토리일보 */
function HudIcons({ onBook }: { onBook: () => void }) {
  const locked = useUnlock((s) => !s.rec);
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <span className="lt-icons">
      <button className={locked ? 'locked' : ''} data-hud-rank onClick={() => { play('ui_tap'); openBoard(); }} aria-label={locked ? '숲 전광판, 잠김' : '숲 전광판'}>
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3" width="15" height="10" {...stroke} /><path d="M6 17v-4M14 17v-4M5.5 9.5l3-3 2.5 2 3.5-3.5" {...stroke} /></svg>
      </button>
      <button data-hud-book onClick={() => { play('ui_tap'); onBook(); }} aria-label="엔딩 도감">
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4.5c2.5-1 5-1 7 .8 2-1.8 4.5-1.8 7-.8v11c-2.5-1-5-1-7 .8-2-1.8-4.5-1.8-7-.8z M10 5.3v11" {...stroke} /></svg>
      </button>
      <button data-hud-news onClick={() => { play('ui_tap'); dayNoteOpen(true); }} aria-label="도토리일보">
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="13" height="12.5" {...stroke} /><path d="M15.5 7.5h2v7.5a1.5 1.5 0 0 1-3 0 M5.5 7.5h7M5.5 10.5h7M5.5 13.5h4" {...stroke} /></svg>
      </button>
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
    <header className={'pr-hud lite' + (tab === 'phone' ? ' tight' : '')} data-lite-hud>
      <div className="r1">
        <div className="lt">
          <div className="clock">{clockText(now)} <SoundBtn /><LiveBadge /></div>
          {/* U-61: 지도 탭이 없다. 빚 칩이나 「대출」을 누르면 거래소 안의 대출 */}
          <div className="debt-row"><button className="debt" data-hl="debt" data-debt-open onClick={() => { play('ui_tap'); openLoan(); }} aria-label={`빚 ${comma(debt)}, 대출 열기`}><b>빚 {comma(debt)}</b>{od > 0 && <span className="hike">연체 {od}회</span>}</button><LoanButton /><HudIcons onBook={() => setBook(true)} /></div>
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
      {book && <LiteBook onClose={() => setBook(false)} />}
    </header>
  );
}

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
  return (
    <header className={'pr-hud lite' + (tab === 'phone' ? ' tight' : '')} data-lite-hud>
      <div className="r1">
        <div className="lt">
          <div className="clock">{clockText(now)} <SoundBtn /><LiveBadge /></div>
          <div className="debt" data-hl="debt"><b>빚 {comma(debt)}</b>{od > 0 && <span className="hike">연체 {od}회</span>}</div>
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
    </header>
  );
}

import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { TIP_EVERY } from './model';
import { say } from './watch';
import { comma } from '../../engine/util';
import { friendById, friendRules, marketById } from '../../engine/data';
import { RowIcon } from './art';
import { play } from './audio';

const pct = (x: number) => `${Math.max(x > 0 ? 6 : 0, Math.min(1, x) * 100)}%`;

/** 인맥 탭(U-6): 사람 카드. 공격력 대신 그 사람이 주는 것. */
export function PeopleTab() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const bearMet = useProto((s) => s.bearMet);
  const tip = useProto((s) => s.tip);
  const run = g.run;

  // ── 단짝 다람쥐 (friends.squirrel) ──
  const f = friendById.squirrel;
  const fs = run.friends.squirrel;
  const left = f.maxLoan - fs.debt;
  const canBorrow = !fs.broken && fs.trust >= friendRules.minTrustToBorrow && left > 0;
  const overdue = fs.debt > 0 && fs.dueAt !== null && run.settleNo >= fs.dueAt;
  const lv = Math.max(1, Math.ceil(fs.trust / 20));
  const dueIn = fs.dueAt !== null ? Math.max(0, fs.dueAt - run.settleNo) : 0;
  const borrow = () => {
    const r = act({ type: 'borrowFriend', friend: 'squirrel' });
    play(r.ok ? 'collector_paid' : 'insufficient');
    say(r.ok ? `다람쥐: 자, ${comma(r.amount ?? 0)}. 날짜만 적자. 이자는 됐고.` : `다람쥐: ${r.msg ?? '미안, 곤란해.'}`);
  };
  const repay = () => {
    const r = act({ type: 'stampFriend', friend: 'squirrel' });
    play(r.ok ? 'collector_paid' : 'insufficient');
    say(r.ok ? (r.cleared ? '다람쥐: 다 갚았네. 고마워!' : `다람쥐: ${comma((r as any).paid ?? 0)} 받았어.`) : r.msg ?? '갚을 수 없다');
  };
  let warn = '';
  if (fs.broken) warn = '연락 끊김. 문이 닫혀 있다.';
  else if (overdue) warn = `갚기로 한 날이 지났다. 정산마다 믿음 ${friendRules.trustPerOverdueSettlement}.`;
  else if (fs.debt > 0) warn = `정산 ${dueIn}번 안에 갚자. 또 빌리면 사이가 멀어진다 (믿음 ${friendRules.trustPerBorrow}).`;
  else warn = `빌릴 때마다 믿음 ${friendRules.trustPerBorrow}. ${friendRules.minTrustToBorrow} 아래면 더는 안 빌려준다.`;

  // ── 곰 형 (화면 전용: 사건으로 만난다. 돈으로 영입하지 않는다) ──
  const tipNow = tip ? (run.prices[tip.coin] / tip.price - 1) * 100 : 0;
  const tipRight = tip ? (tip.dir === 1 ? tipNow > 0 : tipNow < 0) : false;
  const nextIn = TIP_EVERY - (run.settleNo % TIP_EVERY);

  return (
    <div className="pr-pane">
      <div className="pr-title"><b>인맥</b><span>아는 사이 {1 + (bearMet ? 1 : 0)}명</span></div>
      <p className="pr-note left">돈을 빌려주는 사람, 정보를 주는 사람. 알바 햄스터는 공터에서 구한다.</p>

      <div className={'pr-card plc person' + (fs.broken ? ' gone' : '')}>
        <div className="plc-top"><div className="ic"><RowIcon kind="squirrel" /></div><div className="mid">
          <div className="nm">단짝 다람쥐 <small>사이 Lv {lv}</small></div>
          <div className="eff">{fs.broken ? '연락 끊김' : `빌려준다 · 이자 0% · 한 번에 ${comma(f.borrowUnit)}`}</div>
          <div className="sb">지금 빌린 돈 <b>{comma(fs.debt)}</b> · 더 빌릴 수 있는 돈 <b>{comma(fs.broken ? 0 : left)}</b> / 한도 {comma(f.maxLoan)}</div>
        </div></div>
        <div className="pr-bar sm" aria-label={`믿음 ${fs.trust}`}><i className="trust" style={{ width: pct(fs.trust / friendRules.trustMax) }} /></div>
        <div className={'gl' + (overdue || fs.broken ? ' bad' : '')}>{warn}</div>
        <div className="btns">
          <button className={'buy' + (canBorrow ? ' on' : '')} disabled={!canBorrow} data-friend-borrow onClick={borrow}><span>빌리기</span><small>{left > 0 ? '+' + comma(Math.min(f.borrowUnit, left)) : '한도 다 씀'}</small></button>
          <button className={'buy' + (fs.debt > 0 ? ' pay' : '')} disabled={fs.debt <= 0} onClick={repay}><span>갚기</span><small>−{comma(Math.min(f.stampUnit, fs.debt || f.stampUnit))}</small></button>
        </div>
      </div>

      {!bearMet ? (
        <div className="pr-card plc person locked">
          <div className="plc-top"><div className="ic"><span className="q">?</span></div><div className="mid">
            <div className="nm">????</div>
            <div className="sb">동네에서 소문이 빠른 사람. 코인을 캐다 보면 지나가다 들른다고 한다.</div>
          </div></div>
        </div>
      ) : (
        <div className="pr-card plc person">
          <div className="plc-top"><div className="ic"><RowIcon kind="bear" /></div><div className="mid">
            <div className="nm">곰 형 <small>사이 Lv 1</small></div>
            <div className="eff">정산 {TIP_EVERY}번마다 확실한 정보를 준다</div>
            <div className="sb">다음 정보까지 정산 {nextIn}번</div>
          </div></div>
          {tip && (
            <div className="tip">
              <p>「{marketById[tip.coin].name}, <b className={tip.dir === 1 ? 'up' : 'dn'}>{tip.dir === 1 ? '오른다 ▲' : '내린다 ▼'}</b>. 확실해.」</p>
              <small>받은 뒤 {tipNow >= 0 ? '+' : '−'}{Math.abs(tipNow).toFixed(2)}% · {Math.abs(tipNow) < 0.005 ? '아직 모른다' : tipRight ? '지금은 맞았다' : '지금은 틀렸다'}</small>
            </div>
          )}
          <div className="gl">확실하다고 했지, 맞는다고는 안 했다.</div>
        </div>
      )}
    </div>
  );
}

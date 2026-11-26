import { useEffect, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { onFirstOfficeLoan, say } from './watch';
import { comma } from '../../engine/util';
import { lenderById } from '../../engine/data';
import { interestDue, lenderLimit, nextBorrowRate } from '../../engine/selectors';
import type { LenderId } from '../../engine/types';
import { ProtoTrade } from './Trade';
import { PLACE } from './text';
import { RowIcon } from './art';
import { play } from './audio';

/** 지도 탭: 추심원이 꽂고 간 쪽지. 처음엔 오소리 사무소만 그려져 있다. 빌리고 갚는 곳. */
export function MapTab() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const focus = useProto((s) => s.mapFocus);
  const smsSeen = useProto((s) => !!s.seen.sms);
  const waiting = useProto((s) => s.waiting);
  const loanTaken = useProto((s) => s.loanTaken);
  const [msg, setMsg] = useState<string | null>(null);
  const run = g.run;
  useEffect(() => {
    if (!focus) return;
    document.querySelector(`[data-place="${focus}"]`)?.scrollIntoView({ block: 'start' });
    const t = window.setTimeout(() => useProto.getState().patch({ mapFocus: null }), 2500);
    return () => window.clearTimeout(t);
  }, [focus]);
  // 폰을 받기 전에는 쪽지에 그려진 오소리 사무소뿐. 폰이 생기면 다른 곳도 보인다.
  const ids = (['shark1', 'capital', 'bank', 'shark2'] as const).filter((id) => id === 'shark1' || (loanTaken && (id !== 'shark2' || run.shark2Open)));
  const doBorrow = (id: LenderId) => {
    const before = useGame.getState().g;
    const r = act({ type: 'borrow', lender: id, consent: true });
    play(r.ok ? 'collector_paid' : 'insufficient');
    setMsg(r.ok ? `${PLACE[id].name}: +${comma(r.amount ?? 0)} 받았다. 이제 정산마다 이자 ${comma(interestDue(useGame.getState().g, id))}.` : r.msg ?? '안 된다');
    if (r.ok && id === 'shark1') onFirstOfficeLoan(before);
  };
  const doPay = (id: LenderId, mult: 1 | 'all') => { const r = act({ type: 'stamp', lender: id, mult }); play(r.ok ? 'collector_paid' : 'insufficient'); setMsg(r.ok ? `${PLACE[id].name}: 원금 ${comma(r.paid ?? 0)} 갚았다` : r.msg === '현금 부족' ? '도토리가 부족합니다' : r.msg ?? '안 된다'); };
  const total = (['bank', 'capital', 'shark1', 'shark2'] as const).reduce((a, id) => a + run.debts[id].principal, 0);
  return (
    <div className="pr-pane">
      <div className="pr-title"><b>마을 지도</b><span>빚 {comma(total)}</span></div>
      <p className="pr-note left">{waiting ? '추심원이 집 문 앞에서 기다린다. 사무소에서 빌리면 오늘 이자는 거기서 떼어 간다.' : '추심원이 꽂고 간 쪽지. 이자는 정산마다 걷어 가고, 원금은 직접 가서 갚는다.'}</p>
      {msg && <div className="pr-msg" role="status">{msg}</div>}
      {ids.map((id) => {
        const l = lenderById[id];
        const d = run.debts[id];
        const pl = PLACE[id];
        if (id === 'bank' && run.house <= 0) {
          return (
            <div key={id} className="pr-card plc locked" data-place={id}>
              <div className="plc-top"><div className="ic"><RowIcon kind={id} /></div><div className="mid"><div className="nm">{pl.name} <small>{pl.npc}</small></div><div className="sb">내 이름으로 된 집이 있어야 문을 열어 준다. 딱지 붙은 오두막은 담보가 아니다.</div></div></div>
            </div>
          );
        }
        const room = Math.max(0, lenderLimit(g, id) - d.principal);
        const amt = Math.min(l.borrowUnit!, room);
        const got = Math.floor(amt * (1 - (l.upfront ?? 0)));
        const payAmt = Math.min(l.stampUnit, d.principal);
        const first = id === 'shark1' && !loanTaken;
        return (
          <div key={id} className={'pr-card plc' + (id === 'shark1' ? ' ring' : '') + (id === 'shark1' && (smsSeen || waiting) ? ' blink' : '') + (focus === id ? ' focus' : '')} data-place={id}>
            <div className="plc-top"><div className="ic"><RowIcon kind={id} /></div><div className="mid">
              <div className="nm">{pl.name} <small>{pl.npc}</small></div>
              <div className="sb"><b>빚 {comma(d.principal)}</b> · 정산마다 이자 {comma(interestDue(g, id))}{d.overdue > 0 ? <em className="od"> · 연체 {d.overdue}회</em> : ''}</div>
              <div className="sb">새로 빌리는 돈 금리 {(nextBorrowRate(g, id) * 100).toFixed(0)}% · 더 빌릴 수 있는 돈 {comma(room)}{l.upfront ? ' · 선이자 ' + l.upfront * 100 + '%' : ''}</div>
              {first && <div className="sq">{pl.npc} 「오셨어요? 앉으세요. 도장 하나면 됩니다.」</div>}
            </div></div>
            <div className="btns">
              <button className={'buy' + (amt > 0 ? ' on' : '')} disabled={amt <= 0} data-borrow={id} onClick={() => doBorrow(id)}><span>{amt > 0 ? '빌리기' : '한도 다 씀'}</span><small>{amt > 0 ? '+' + comma(got) : ''}</small></button>
              <button className={'buy' + (d.principal > 0 ? ' pay' : '')} disabled={d.principal <= 0} data-pay={id} onClick={() => doPay(id, 1)}><span>갚기</span><small>−{comma(payAmt)}</small></button>
              <button className={'buy' + (d.principal > 0 ? ' pay' : '')} disabled={d.principal <= 0} onClick={() => doPay(id, 'all')}><span>전부</span><small>−{comma(Math.min(d.principal, Math.floor(run.cash)))}</small></button>
            </div>
          </div>
        );
      })}
      {!loanTaken && <p className="pr-note left">쪽지에는 오소리 사무소만 그려져 있다.</p>}
    </div>
  );
}

/** 거래소 탭: 오소리 대부가 준 중고폰 속 FRX 숲거래소(Trade.tsx). 폰을 받으면 바로 거래할 수 있다. */
export function PhoneTab() {
  const open = useGame((s) => s.g.run.futures.open);
  if (!open) return <div className="pr-pane"><p className="pr-note">폰이 없다.</p></div>;
  return <ProtoTrade />;
}
void say;

import { useEffect, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { onFirstOfficeLoan, say } from './watch';
import { comma } from '../../engine/util';
import { lenderById } from '../../engine/data';
import { interestDue, lenderLimit, nextBorrowRate } from '../../engine/selectors';
import type { LenderId } from '../../engine/types';
import { ProtoTrade } from './Trade';
import { PLACE, STORY } from './text';
import { ledgerRows, goldStamps, repaidOffice, STAMP_STEP } from './ledger';
import { RowIcon } from './art';
import { play } from './audio';

/** 지도 탭: 추심원이 꽂고 간 쪽지. 처음엔 오소리 사무소만 그려져 있다. 빌리고 갚는 곳. */
export function MapTab() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const focus = useProto((s) => s.mapFocus);
  const smsSeen = useProto((s) => !!s.seen.sms);
  const capitalKnown = useProto((s) => !!s.seen.capitalSms);
  const viperKnown = useProto((s) => !!s.seen.viperSms);
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
  // 다른 돈줄은 사건으로 지도에 그려진다(U-38): 숲속 캐피탈·조합 = 캐피탈의 문자를 받은 뒤, 뒷골목 = 모르는 번호의 문자를 받은 뒤
  const ids = (['shark1', 'capital', 'bank', 'shark2'] as const).filter((id) => id === 'shark1' || (loanTaken && (id === 'shark2' ? viperKnown && run.shark2Open : capitalKnown)));
  const doBorrow = (id: LenderId, agreed = false) => {
    const before = useGame.getState().g;
    const firstAt = ((before.run.stats[`borrow.${id}`] as number | undefined) ?? 0) === 0;
    // 뒷골목의 첫 대출은 독사 대부가 조건을 먼저 말한다: 적는 돈과 받는 돈이 다르다(선이자). 듣고 나서 고른다.
    if (id === 'shark2' && firstAt && !agreed) {
      const l2 = lenderById.shark2;
      const unit = Math.min(l2.borrowUnit!, Math.max(0, lenderLimit(before, 'shark2') - before.run.debts.shark2.principal));
      const got = Math.floor(unit * (1 - (l2.upfront ?? 0)));
      useProto.getState().pushScene({ id: 'viperOffer', again: true, lines: STORY.viperOffer({ unit, got, ratePct: Math.round(l2.rate * 100) }),
        choices: [
          { id: 'take', label: '빌린다', sub: `+${comma(got)} · 빚 +${comma(unit)}`, primary: true, run: () => doBorrow('shark2', true) },
          { id: 'leave', label: '돌아선다', run: () => setMsg('뒷골목: 문이 조용히 닫힌다.') },
        ] });
      return;
    }
    const r = act({ type: 'borrow', lender: id, consent: true });
    play(r.ok ? 'collector_paid' : 'insufficient');
    setMsg(r.ok ? `${PLACE[id].name}: +${comma(r.amount ?? 0)} 받았다. 이제 정산마다 이자 ${comma(interestDue(useGame.getState().g, id))}.` : r.msg ?? '안 된다');
    if (r.ok && id === 'shark1') onFirstOfficeLoan(before);
    // 숲속 캐피탈에서 처음 빌렸다: 창구 너구리가 조건을 말한다(한도가 왜 그 숫자인지, 밀리면 어떻게 되는지)
    if (r.ok && id === 'capital' && firstAt) useProto.getState().pushScene({ id: 'capitalIntro', lines: STORY.capitalIntro({ amount: r.amount ?? 0, ratePct: Math.round(lenderById.capital.rate * 100) }) });
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
            <div key={id} className="pr-card plc locked" data-place={id} onClick={() => useProto.getState().pushScene({ id: 'owlRefuse', again: true, auto: 3500, lines: STORY.owlRefuse() })}>
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
          <div key={id} className={'pr-card plc' + (id === 'shark1' ? ' ring' : '') + (id === 'shark1' && (smsSeen || waiting) ? ' blink' : '') + (focus === id ? ' focus' : '')} data-place={id} data-hl={id === 'shark1' ? 'office' : undefined}>
            <div className="plc-top"><div className="ic"><RowIcon kind={id} /></div><div className="mid">
              <div className="nm">{pl.name} <small>{pl.npc}</small></div>
              <div className="sb"><b>빚 {comma(d.principal)}</b> · 정산마다 이자 {comma(interestDue(g, id))}{d.overdue > 0 ? <em className="od"> · 연체 {d.overdue}회</em> : ''}</div>
              <div className="sb">새로 빌리는 돈 금리 {(nextBorrowRate(g, id) * 100).toFixed(0)}% · 더 빌릴 수 있는 돈 {comma(room)}{l.upfront ? ' · 선이자 ' + l.upfront * 100 + '%' : ''}</div>
              {first && <div className="sq">{pl.npc} 「오셨어요? 앉으세요. 도장 하나면 됩니다.」</div>}
            </div></div>
            {id === 'shark1' && loanTaken && <Ledger />}
            <div className="btns">
              <button className={'buy' + (amt > 0 ? ' on' : '')} disabled={amt <= 0} data-borrow={id} data-hl={id === 'shark1' ? 'borrow' : undefined} onClick={() => doBorrow(id)}><span>{amt > 0 ? '빌리기' : '한도 다 씀'}</span><small>{amt > 0 ? '+' + comma(got) : ''}</small></button>
              <button className={'buy' + (d.principal > 0 ? ' pay' : '')} disabled={d.principal <= 0} data-pay={id} data-hl={id === 'shark1' ? 'pay' : undefined} onClick={() => doPay(id, 1)}><span>갚기</span><small>−{comma(payAmt)}</small></button>
              <button className={'buy' + (d.principal > 0 ? ' pay' : '')} disabled={d.principal <= 0} onClick={() => doPay(id, 'all')}><span>전부</span><small>−{comma(Math.min(d.principal, Math.floor(run.cash)))}</small></button>
            </div>
          </div>
        );
      })}
      {!loanTaken && <p className="pr-note left">쪽지에는 오소리 사무소만 그려져 있다.</p>}
    </div>
  );
}

/** 오소리 사무소의 장부(U-38): 빚을 금리별 줄로 보여 준다. 갚으면 맨 위(비싼) 줄부터 지워지고, 5만을 갚을 때마다 금박 도장이 하나 찍힌다. */
function Ledger() {
  const g = useGame((s) => s.g);
  const rows = ledgerRows(g);
  const stamps = goldStamps(g);
  const top = rows.find((r) => r.left > 0)?.key;
  const toNext = STAMP_STEP - (repaidOffice(g) % STAMP_STEP);
  return (
    <div className="pr-ledger" data-ledger aria-label="오소리 장부">
      <div className="lg-h"><b>장부</b><span>갚으면 위 줄부터 지워진다</span></div>
      {rows.map((r) => (
        <div key={r.key} className={'lg-row' + (r.left <= 0 ? ' done' : '') + (r.key === top ? ' top' : '')} data-row={r.key}>
          <i className="rt">{r.ratePct}%</i>
          <span className="nm">{r.label}</span>
          <span className="bar"><u style={{ width: `${r.start > 0 ? (r.left / r.start) * 100 : 0}%` }} /></span>
          <b className="amt">{r.left <= 0 ? '지움' : comma(r.left)}</b>
          <small className="iv">{r.left <= 0 ? '' : `이자 ${comma(r.interest)}`}</small>
        </div>
      ))}
      <div className="lg-st" data-stamps={stamps}>
        <span className="dots">{Array.from({ length: Math.min(10, stamps + 1) }, (_, i) => <i key={i} className={i < stamps ? 'on' : ''} />)}{stamps > 9 && <em>×{stamps}</em>}</span>
        <small>금박 도장 {stamps}개 · {g.run.debts.shark1.principal > 0 ? `${comma(Math.min(toNext, g.run.debts.shark1.principal))} 더 갚으면 하나` : '장부가 깨끗하다'}</small>
      </div>
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

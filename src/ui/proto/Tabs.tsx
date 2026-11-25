import { useEffect, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { checklist, upgRows, type UpgRow } from './model';
import { say } from './watch';
import { comma } from '../../engine/util';
import { futuresGate } from '../../engine/progression';
import { lenderById } from '../../engine/data';
import { interestDue, lenderLimit } from '../../engine/selectors';
import type { LenderId } from '../../engine/types';
import { ProtoTrade } from './Trade';
import { AccountApp } from './Account';
import { PLACE } from './text';
import { RowIcon } from './art';
import { play } from './audio';

/** 강화 탭(U-5, U-22): 생산 강화만. 탭·기능을 여는 카드는 없다(그건 사건으로 열린다). 값·효과는 엔진 upgrades.json. */
export function UpgTab() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const rows = upgRows(g);
  const lvSum = rows.reduce((a, r) => a + r.lv, 0);
  const maxSum = rows.reduce((a, r) => a + r.max, 0);
  const buy = (r: UpgRow) => {
    const res = act({ type: 'upgrade', track: r.track, target: r.target });
    if (!res.ok) { say(res.msg === '현금 부족' ? '도토리가 부족합니다' : res.msg ?? '살 수 없다'); play('insufficient'); return; }
    play('buy');
  };
  return (
    <div className="pr-pane">
      <div className="pr-title"><b>공터 등급 {lvSum + 1}</b><span>강화 {lvSum}/{maxSum}</span></div>
      <div className="pr-bar"><i style={{ width: `${maxSum ? (lvSum / maxSum) * 100 : 0}%` }} /></div>
      <p className="pr-note left">지금 가진 것을 더 잘 돌게 하는 강화. 살수록 값이 오른다.</p>
      {rows.map((r) => (
        <div key={r.key} className="pr-card upg" data-upg={r.key}>
          <div className="ic"><RowIcon kind={r.icon} /></div>
          <div className="mid">
            <div className="nm">{r.name} <small>Lv {r.lv}/{r.max}</small></div>
            <div className="eff">{r.eff}</div>
            <div className="sq">{r.quip}</div>
          </div>
          <button className={'buy' + (r.canBuy ? ' on' : '')} disabled={r.cost === null || !r.canBuy} onClick={() => buy(r)}>
            <span>{r.cost === null ? '만렙' : r.canBuy ? '강화' : '부족'}</span>{r.cost !== null && <small>{comma(r.cost)}</small>}
          </button>
        </div>
      ))}
      {rows.length === 0 && <p className="pr-note">강화할 것이 아직 없다.</p>}
    </div>
  );
}

/** 지도 탭: 마을의 장소. 빌리고 갚는 곳, 그리고 숲속 캐피탈 창구에서 선물 계좌 예탁금을 확인한다. */
export function MapTab() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const phoneOpen = useProto((s) => !!s.everUnlocked.phone);
  const focus = useProto((s) => s.mapFocus);
  const smsSeen = useProto((s) => !!s.seen.sms);
  const [msg, setMsg] = useState<string | null>(null);
  const run = g.run;
  useEffect(() => {
    if (!focus) return;
    document.querySelector(`[data-place="${focus}"]`)?.scrollIntoView({ block: 'start' });
    const t = window.setTimeout(() => useProto.getState().patch({ mapFocus: null }), 2500);
    return () => window.clearTimeout(t);
  }, [focus]);
  const ids = (['shark1', 'capital', 'bank', 'shark2'] as const).filter((id) => id !== 'shark2' || run.shark2Open);
  const doBorrow = (id: LenderId) => { const r = act({ type: 'borrow', lender: id, consent: true }); play(r.ok ? 'collector_paid' : 'insufficient'); setMsg(r.ok ? `${PLACE[id].name}: +${comma(r.amount ?? 0)} 받았다. 이자는 다음 정산부터.` : r.msg ?? '안 된다'); };
  const doPay = (id: LenderId, mult: 1 | 'all') => { const r = act({ type: 'stamp', lender: id, mult }); play(r.ok ? 'collector_paid' : 'insufficient'); setMsg(r.ok ? `${PLACE[id].name}: 원금 ${comma(r.paid ?? 0)} 갚았다` : r.msg === '현금 부족' ? '도토리가 부족합니다' : r.msg ?? '안 된다'); };
  const gate = futuresGate(g);
  const rows = checklist(g);
  const ready = rows.slice(0, 3).every((r) => r.ok);
  const depOk = gate.conditions[1].met;
  const openAccount = () => {
    const r = act({ type: 'openAccount' });
    if (!r.ok) { play('insufficient'); setMsg(`창구 너구리: ${r.msg ?? '아직 안 됩니다.'}`); return; }
    play('goal_complete');
    setMsg('선물 계좌가 열렸다. 폰에서 거래할 수 있다.');
  };
  const total = (['bank', 'capital', 'shark1', 'shark2'] as const).reduce((a, id) => a + run.debts[id].principal, 0);
  return (
    <div className="pr-pane">
      <div className="pr-title"><b>마을 지도</b><span>빚 {comma(total)}</span></div>
      <p className="pr-note left">추심원이 꽂고 간 쪽지. 이자는 정산마다 걷어 가고, 원금은 직접 가서 갚는다.</p>
      {msg && <div className="pr-msg" role="status">{msg}</div>}
      {ids.map((id) => {
        const l = lenderById[id];
        const d = run.debts[id];
        const pl = PLACE[id];
        if (id === 'bank' && run.house <= 0) {
          return (
            <div key={id} className="pr-card plc locked" data-place={id}>
              <div className="plc-top"><div className="ic"><RowIcon kind={id} /></div><div className="mid"><div className="nm">{pl.name} <small>{pl.npc}</small></div><div className="sb">집(주소지)이 있어야 문을 열어 준다. 텐트는 담보가 아니다.</div></div></div>
            </div>
          );
        }
        const room = Math.max(0, lenderLimit(g, id) - d.principal);
        const amt = Math.min(l.borrowUnit!, room);
        const got = Math.floor(amt * (1 - (l.upfront ?? 0)));
        const payAmt = Math.min(l.stampUnit, d.principal);
        const acct = id === 'capital' && phoneOpen && !run.futures.open;
        return (
          <div key={id} className={'pr-card plc' + (id === 'shark1' ? ' ring' : '') + (id === 'shark1' && smsSeen ? ' blink' : '') + (focus === id ? ' focus' : '')} data-place={id}>
            <div className="plc-top"><div className="ic"><RowIcon kind={id} /></div><div className="mid">
              <div className="nm">{pl.name} <small>{pl.npc}</small></div>
              <div className="sb"><b>빚 {comma(d.principal)}</b> · 정산마다 이자 {comma(interestDue(g, id))}{d.overdue > 0 ? <em className="od"> · 연체 {d.overdue}회</em> : ''}</div>
              <div className="sb">금리 {(l.rate * 100).toFixed(0)}% · 더 빌릴 수 있는 돈 {comma(room)}{l.upfront ? ' · 선이자 ' + l.upfront * 100 + '%' : ''}</div>
            </div></div>
            {acct && (
              <div className="acct" data-acct>
                <div className="sq">창구 너구리 「예탁금은 {comma(gate.conditions[1].need)}입니다. 없으시면 저희가 빌려 드릴 수도 있어요.」</div>
                {rows.map((r) => r.id === 'deposit'
                  ? <div key={r.id} className={'gl' + (depOk ? ' ok' : '')}>{depOk ? '✔' : '○'} 예탁금 {comma(r.need)} (가진 돈 {comma(Math.floor(gate.conditions[1].current))})</div>
                  : <div key={r.id} className={'gl' + (r.ok ? ' ok' : '')}>{r.ok ? '✔' : '○'} {r.label} {r.id === 'mined' ? `${comma(r.cur)}/${comma(r.need)}` : `${r.cur}/${r.need}`}</div>)}
                <button className={'buy wide' + (gate.canOpen ? ' on' : '')} disabled={!gate.canOpen} data-open-account onClick={openAccount}>
                  <span>{gate.canOpen ? '예탁금 확인하고 계좌 열기' : !ready ? '폰의 체크리스트를 먼저' : '예탁금이 모자라다'}</span>
                  <small>{gate.canOpen ? '돈은 빠져나가지 않는다 · 잔고만 본다' : !ready ? '채굴 실적 · 사전 교육 · 모의 거래' : `${comma(gate.conditions[1].need - Math.floor(gate.conditions[1].current))} 더 필요`}</small>
                </button>
              </div>
            )}
            <div className="btns">
              <button className={'buy' + (amt > 0 ? ' on' : '')} disabled={amt <= 0} data-borrow={id} onClick={() => doBorrow(id)}><span>{amt > 0 ? '빌리기' : '한도 다 씀'}</span><small>{amt > 0 ? '+' + comma(got) : ''}</small></button>
              <button className={'buy' + (d.principal > 0 ? ' pay' : '')} disabled={d.principal <= 0} data-pay={id} onClick={() => doPay(id, 1)}><span>갚기</span><small>−{comma(payAmt)}</small></button>
              <button className={'buy' + (d.principal > 0 ? ' pay' : '')} disabled={d.principal <= 0} onClick={() => doPay(id, 'all')}><span>전부</span><small>−{comma(Math.min(d.principal, Math.floor(run.cash)))}</small></button>
            </div>
          </div>
        );
      })}
      {run.friends.squirrel.debt > 0 && <p className="pr-note left">단짝네 집 앞을 지난다. 「…월세가 또 올랐네.」</p>}
    </div>
  );
}

/** 폰 탭: 계좌가 없으면 개설 체크리스트, 있으면 거래 앱(Trade.tsx). */
export function PhoneTab() {
  const open = useGame((s) => s.g.run.futures.open);
  return open ? <ProtoTrade /> : <AccountApp />;
}

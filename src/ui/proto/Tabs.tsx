import { useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { MAP_PRICE, PEOPLE_PRICE } from './model';
import { ownedCoins } from '../../engine/selectors';
import { say } from './watch';
import { comma } from '../../engine/util';
import { clone } from '../../engine/game';
import { futuresGate, eduNeeded, mockNeeded } from '../../engine/progression';
import { gateLines } from '../vm/trade';
import { lenderById, DEBT_IDS } from '../../engine/data';
import { interestDue, lenderLimit } from '../../engine/selectors';
import type { LenderId } from '../../engine/types';
import { ProtoTrade } from './Trade';
import { RowIcon } from './art';
import { play } from './audio';

/** 강화 탭: 한 번만 사는 카드. 탭 해금이 여기서 일어난다(U-4·U-5). */
export function UpgTab() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const setGame = useGame((s) => s.setGame);
  const mapBought = useProto((s) => s.mapBought);
  const peopleBought = useProto((s) => s.peopleBought);
  const run = g.run;
  const gate = futuresGate(g);
  const lines = gateLines(g);
  const depositOk = gate.conditions[1].met;
  const canPhone = gate.buttonVisible && depositOk;
  const total = 3;
  const bought = (run.futures.open ? 1 : 0) + (mapBought ? 1 : 0) + (peopleBought ? 1 : 0);
  const peopleOpen = ownedCoins(run).length > 0;

  const openPhone = () => {
    for (let i = 0; i < eduNeeded(g); i++) act({ type: 'eduPage' });
    if (mockNeeded(g) > 0) act({ type: 'mockTrade' });
    const r = act({ type: 'openAccount' });
    if (!r.ok) { say(r.msg ?? '아직 안 된다'); play('insufficient'); }
    else useProto.getState().setTab('phone');
  };
  const buyMap = () => {
    // 시제품 가짜: 지도 값을 엔진 밖에서 현금에서 뗀다(엔진에는 이 카드가 없다).
    const c = clone(g);
    if (c.run.cash < MAP_PRICE) { say('도토리가 부족합니다'); play('insufficient'); return; }
    play('buy');
    c.run.cash -= MAP_PRICE;
    setGame(c);
    useProto.getState().patch({ mapBought: true });
  };
  const buyPeople = () => {
    // 시제품 가짜: 지도와 같이 값을 엔진 밖에서 현금에서 뗀다.
    const c = clone(g);
    if (c.run.cash < PEOPLE_PRICE) { say('도토리가 부족합니다'); play('insufficient'); return; }
    play('buy');
    c.run.cash -= PEOPLE_PRICE;
    setGame(c);
    useProto.getState().patch({ peopleBought: true });
  };
  return (
    <div className="pr-pane">
      <div className="pr-title"><b>공터 등급 {bought + 1}</b><span>산 카드 {bought}/{total}</span></div>
      <div className="pr-bar"><i style={{ width: `${(bought / total) * 100}%` }} /></div>
      {!run.futures.open && (
        <div className="pr-card">
          <div className="ic"><RowIcon kind="phone" /></div>
          <div className="mid">
            <div className="nm">중고폰 사기</div>
            <div className="eff">폰 탭이 열린다 · 선물 계좌 개설</div>
            <div className="sq">족제비 「내려도 버는 폰이에요~ 약관은 한 번만 읽으세요.」</div>
            {lines.map((l) => <div key={l.id} className={'gl' + (l.ok ? ' ok' : '')}>{l.ok ? '✔' : '○'} {l.text}</div>)}
          </div>
          <button className={'buy' + (canPhone ? ' on' : '')} disabled={!canPhone} onClick={openPhone}><span>개설</span><small>무료</small></button>
        </div>
      )}
      {!mapBought && (
        <div className="pr-card">
          <div className="ic"><RowIcon kind="map" /></div>
          <div className="mid"><div className="nm">마을 지도 얻기</div><div className="eff">지도 탭이 열린다 · 돈을 빌리고 갚는 곳</div><div className="sq">오소리 「길 잃으면 곤란해요.」</div></div>
          <button className={'buy' + (run.cash >= MAP_PRICE ? ' on' : '')} disabled={run.cash < MAP_PRICE} onClick={buyMap}><span>{run.cash >= MAP_PRICE ? '구입' : '부족'}</span><small>{comma(MAP_PRICE)}</small></button>
        </div>
      )}
      {!peopleBought && (peopleOpen ? (
        <div className="pr-card">
          <div className="ic"><RowIcon kind="people" /></div>
          <div className="mid"><div className="nm">아는 사이 늘리기</div><div className="eff">인맥 탭이 열린다 · 알바 햄스터, 단짝 다람쥐</div><div className="sq">다람쥐 「요즘 뭐 해? 밥은 먹었고?」</div></div>
          <button className={'buy' + (run.cash >= PEOPLE_PRICE ? ' on' : '')} disabled={run.cash < PEOPLE_PRICE} onClick={buyPeople}><span>{run.cash >= PEOPLE_PRICE ? '구입' : '부족'}</span><small>{comma(PEOPLE_PRICE)}</small></button>
        </div>
      ) : (
        <div className="pr-card locked"><div className="ic"><span className="q">?</span></div><div className="mid"><div className="nm">????</div><div className="sb">첫 쳇바퀴를 사면 보인다</div></div><button className="buy" disabled><span>잠김</span></button></div>
      ))}
      {run.futures.open && mapBought && peopleBought && <p className="pr-note">살 수 있는 카드를 다 샀다. 이제 빚만 남았다.</p>}
    </div>
  );
}

/** 지도 탭: 장소 목록과 빌리기·갚기 단추(시제품). */
export function MapTab() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const [msg, setMsg] = useState<string | null>(null);
  const run = g.run;
  const ids = (['bank', 'capital', 'shark1', 'shark2'] as const).filter((id) => id !== 'shark2' || run.shark2Open);
  void DEBT_IDS;
  const doBorrow = (id: LenderId) => { const r = act({ type: 'borrow', lender: id, consent: true }); play(r.ok ? 'collector_paid' : 'insufficient'); setMsg(r.ok ? `${lenderById[id].name}: +${comma(r.amount ?? 0)} 받았다` : r.msg ?? '안 된다'); };
  const doPay = (id: LenderId, mult: 1 | 'all') => { const r = act({ type: 'stamp', lender: id, mult }); play(r.ok ? 'collector_paid' : 'insufficient'); setMsg(r.ok ? `${lenderById[id].name}: ${comma((r as any).paid ?? 0)} 갚았다` : r.msg ?? '안 된다'); };
  return (
    <div className="pr-pane">
      <div className="pr-title"><b>마을 지도</b><span>빚 {comma(['bank', 'capital', 'shark1', 'shark2'].reduce((a, id) => a + run.debts[id as LenderId].principal, 0))}</span></div>
      {msg && <div className="pr-msg">{msg}</div>}
      {ids.map((id) => {
        const l = lenderById[id];
        const d = run.debts[id];
        return (
          <div key={id} className="pr-card plc">
            <div className="plc-top"><div className="ic"><RowIcon kind={id} /></div><div className="mid">
              <div className="nm">{l.name} <small>{l.npc}</small></div>
              <div className="sb"><b>빚 {comma(d.principal)}</b> · 이번 이자 {comma(interestDue(g, id))}{d.overdue > 0 ? <em className="od"> · 연체 {d.overdue}회</em> : ''}</div>
              <div className="sb">한도 {comma(lenderLimit(g, id))} · 금리 {(l.rate * 100).toFixed(0)}%{l.upfront ? ' · 선이자 ' + l.upfront * 100 + '%' : ''}</div>
            </div></div>
            <div className="btns">
              {(() => { const room = Math.max(0, lenderLimit(g, id) - d.principal); const amt = Math.min(l.borrowUnit!, room); return (
                <button className={'buy' + (amt > 0 ? ' on' : '')} disabled={amt <= 0} onClick={() => doBorrow(id)}><span>{amt > 0 ? '빌리기' : '한도 다 씀'}</span><small>{amt > 0 ? '+' + comma(amt) : ''}</small></button>); })()}
              <button className={'buy' + (d.principal > 0 ? ' pay' : '')} disabled={d.principal <= 0} onClick={() => doPay(id, 1)}><span>갚기</span><small>−{comma(l.stampUnit)}</small></button>
              <button className={'buy' + (d.principal > 0 ? ' pay' : '')} disabled={d.principal <= 0} onClick={() => doPay(id, 'all')}><span>전부</span><small>갚기</small></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 폰 탭: 주인공의 폰 속 거래 앱(Trade.tsx). */
export function PhoneTab() {
  return <ProtoTrade />;
}

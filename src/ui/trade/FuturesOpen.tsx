// 캐피탈 창구의 선물 계좌 개설 흐름: 사전교육 3장 -> 모의거래 한 번 -> 예탁금 확인 -> 통지서. 개설 뒤에는 고위험 거래 확인서.
import { useState } from 'react';
import { useGame } from '../../store/gameStore';
import { comma } from '../../engine/util';
import { eduNeeded, futuresGate, mockNeeded } from '../../engine/progression';
import { levCapNow, waiverAvailable } from '../../engine/futures';
import { Art } from '../common/Art';

export const EDU_PAGES = [
  { t: '1장. 레버리지', s: '배율을 올리면 같은 돈으로 더 큰 금액을 겁니다. 이기면 배율만큼, 지면 배율만큼 커집니다.' },
  { t: '2장. 청산가', s: '손실이 증거금에 닿는 가격이 청산가입니다. 닿으면 증거금은 돌려받지 못합니다.' },
  { t: '3장. 내려도 벌 수 있습니다', s: '숏은 가격이 내릴 때 버는 거래입니다. 반대로 오르면 같은 만큼 잃습니다.' },
];

export function CapitalFutures() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const [mockStep, setMockStep] = useState<0 | 1>(0);
  const [note, setNote] = useState<string | null>(null);
  const run = g.run;
  const f = run.futures;
  const gate = futuresGate(g);
  const need = eduNeeded(g);
  const mock = mockNeeded(g);
  const go = (a: Parameters<typeof act>[0]) => {
    const r = act(a);
    setNote(r.ok ? null : r.msg ?? '할 수 없습니다.');
    return r;
  };

  if (f.open) {
    const cap = levCapNow(run);
    return (
      <div className="ledger edu">
        <b>선물 계좌 통지서</b>
        <span className="sub">배율 상한 {cap}배 · 끝난 거래 {f.closedTrades}건{f.waiver ? ' · 확인서 접수됨' : ''}</span>
        {waiverAvailable(run) && (
          <>
            <p className="fine">끝난 거래 10건을 넘으면 고위험 거래 확인서에 도장을 찍어 200배를 열 수 있습니다.</p>
            <button className="act stamp" onClick={() => go({ type: 'signWaiver' })}>고위험 거래 확인서 도장</button>
          </>
        )}
        {note && <p className="note bad">{note}</p>}
      </div>
    );
  }
  if (!gate.buttonVisible) {
    const m = gate.conditions[0];
    return (
      <div className="ledger edu">
        <b>선물 계좌</b>
        <span className="sub">누적 채굴 {comma(m.need)}어치가 되면 개설할 수 있습니다 (지금 {comma(m.current)}).</span>
      </div>
    );
  }
  const eduDone = f.edu >= need;
  const page = EDU_PAGES[Math.min(f.edu, EDU_PAGES.length - 1)];
  const mockDone = f.mock || mock === 0;
  return (
    <div className="ledger edu">
      <b>선물 계좌 개설</b>
      <div className="steps" aria-label="진행">
        {Array.from({ length: Math.max(need, 1) }, (_, i) => <i key={i} className={i < f.edu || need === 0 ? 'on' : ''} />)}
        <i className={mockDone ? 'on' : ''} />
        <i className={gate.conditions[1].met ? 'on' : ''} />
      </div>
      {!eduDone && (
        <>
          <div className="npc">
            <Art id="npc_weasel" className="bust" alt="창구 너구리" />
            <div className="bubble"><span><b>{page.t}</b><br />{page.s}</span></div>
          </div>
          <button className="act" onClick={() => go({ type: 'eduPage' })}>{f.edu + 1 < need ? `다음 (${f.edu + 1}/${need})` : `교육 마치기 (${f.edu + 1}/${need})`}</button>
        </>
      )}
      {eduDone && !mockDone && (
        <div className="mock">
          <b>모의거래 (가짜 돈)</b>
          <span className="fine">손익은 현금에 반영되지 않습니다. 한 번 눌러 보면 통과입니다.</span>
          {mockStep === 0 ? (
            <button className="act" onClick={() => setMockStep(1)}>가짜 돈 10,000으로 모의 진입</button>
          ) : (
            <button className="act" onClick={() => go({ type: 'mockTrade' })}>모의 정리</button>
          )}
        </div>
      )}
      {eduDone && mockDone && (
        <>
          <span className={'sub'}>예탁금 확인: 현금 + 지갑 {comma(gate.conditions[1].current)} / {comma(gate.conditions[1].need)} {gate.conditions[1].met ? '확인됨' : '모자랍니다'} (확인만 하고 떼지 않습니다)</span>
          <button className="act" disabled={!gate.canOpen} onClick={() => go({ type: 'openAccount' })}>선물 계좌 개설</button>
        </>
      )}
      {note && <p className="note bad">{note}</p>}
    </div>
  );
}

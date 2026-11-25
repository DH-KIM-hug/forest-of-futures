import { useState } from 'react';
import { useGame } from '../../store/gameStore';
import { board, bestRecord } from '../../engine/ranking';
import { totalDebt } from '../../engine/selectors';
import { balance } from '../../engine/data';
import { fmt } from '../common/format';

export function Board() {
  const g = useGame((s) => s.g);
  const ui = useGame((s) => s.ui);
  const { patchUi, retire, rename, setColors, resetAll } = useGame.getState();
  const [name, setName] = useState(g.settings.name);
  const [confirm, setConfirm] = useState(0);
  const rows = board(g);
  const debt = totalDebt(g.run);
  const msg = ui.say && ui.say.where === 'board' ? ui.say.text : null;
  return (
    <div className="full" data-stage={g.run.houseStage} role="dialog" aria-label="광장 전광판">
      <header>
        <button onClick={() => patchUi({ overlay: null })} aria-label="뒤로 가기"><img src="/ui/icons/back.webp" alt="" width="34" height="34" draggable={false} /></button>
        <h2>광장 전광판</h2>
      </header>
      <div className="scroll">
        <h4 style={{ margin: '0 0 4px' }}>순자산 랭킹 (기준: 이번 회차 순자산)</h4>
        {rows.map((r, i) => (
          <div key={r.name + i} className={'brow' + (r.me ? ' me' : '')}>
            <span className="rk">{i + 1}</span>
            <span className="n">{r.name}{r.me ? ' (나)' : ''}</span>
            <span>{fmt(r.netWorth)}</span>
          </div>
        ))}
        <div className="sub" style={{ margin: '6px 0' }}>내 최고 순자산 {fmt(bestRecord(g))}</div>
        <button className="act" style={{ width: '100%' }} disabled={debt > 0} onClick={() => retire()}>
          {debt > 0 ? '은퇴(기록 확정) · 빚이 남아 있음' : '은퇴(기록 확정)'}
        </button>
        {msg && <div className="sub">{msg}</div>}

        <h4 style={{ margin: '14px 0 4px' }}>내 기록 (상위 {balance.ranking.localTopN})</h4>
        {g.records.length === 0 && <div className="sub">아직 끝난 회차가 없습니다.</div>}
        {g.records.map((r, i) => (
          <div key={i} className="brow">
            <span className="rk">{i + 1}</span>
            <span className="n">{r.endedBy === 'retire' ? '은퇴' : r.endedBy} · 정산 {r.cycles}회</span>
            <span>{fmt(r.peakNetWorth)}</span>
          </div>
        ))}

        <div className="set">
          <h4>설정</h4>
          <div className="row">
            <input type="text" value={name} maxLength={balance.protagonist.nameMaxLength} onChange={(e) => setName(e.target.value)} aria-label="주인공 이름" />
            <button onClick={() => rename(name)}>이름 변경</button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className={'chip' + (g.settings.priceColors === 'kr' ? ' on' : '')} style={{ flex: 1 }} onClick={() => setColors('kr')}>상승 빨강 · 하락 파랑</button>
            <button className={'chip' + (g.settings.priceColors === 'intl' ? ' on' : '')} style={{ flex: 1 }} onClick={() => setColors('intl')}>상승 초록 · 하락 빨강</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <button style={{ width: '100%' }} onClick={() => (confirm === 0 ? setConfirm(1) : (setConfirm(0), resetAll()))}>
              {confirm === 0 ? '데이터 초기화' : '정말 초기화합니다(도감·기록 모두 삭제). 한 번 더 누르세요'}
            </button>
            {confirm === 1 && <button style={{ width: '100%', marginTop: 6 }} onClick={() => setConfirm(0)}>취소</button>}
          </div>
          <p className="legal">이 게임은 실제 투자와 무관한 모의 게임입니다. 등장하는 종목·기관·인물은 모두 가상입니다.</p>
        </div>
      </div>
    </div>
  );
}

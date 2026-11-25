import { useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useUI } from '../uiStore';
import { ladder, lineageRows, retireInfo } from '../vm/records';
import { TreeView } from './Tree';
import { comma } from '../../engine/util';
import { clone } from '../../engine/game';

type Tab = 'rank' | 'mine' | 'tree' | 'set';

/** 전광판(8.9): 순위(주민 사다리) · 내 기록 · 가문 특성 · 설정 · 은퇴. */
export function BoardScreen() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const setGame = useGame((s) => s.setGame);
  const hardReset = useGame((s) => s.reset);
  const close = useUI((s) => s.setOverlay);
  const [tab, setTab] = useState<Tab>('rank');
  const [sure, setSure] = useState(0);
  const retire = retireInfo(g);
  const set = (fn: (x: typeof g) => void) => { const n = clone(g); fn(n); setGame(n); };
  return (
    <div className="full board" role="dialog" aria-label="전광판">
      <header>
        <button className="back" onClick={() => close(null)} aria-label="닫기"><img src="/ui/icons/back.webp" alt="" />닫기</button>
        <h2>광장 전광판</h2>
      </header>
      <div className="chips tabs tabsrow" role="tablist">
        {([['rank', '순위'], ['mine', '내 기록'], ['tree', '가문 특성'], ['set', '설정']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="scroll">
        {tab === 'rank' && (
          <>
            <p className="sub">서버 순위는 아직 열리지 않았습니다. 주민 사다리만 보입니다. (최고 순자산)</p>
            {ladder(g).map((r) => (
              <div key={r.name} className={'brow' + (r.me ? ' me' : '')}><span className="rk">{r.rank}</span><span className="n">{r.name}</span><span className="mono">{comma(r.peak)}</span></div>
            ))}
          </>
        )}
        {tab === 'mine' && (
          <>
            {lineageRows(g).length === 0 && <p className="sub">아직 끝난 세대가 없습니다.</p>}
            {lineageRows(g).map((l) => (
              <div key={l.gen} className="brow"><span className="rk">{l.gen}</span><span className="n">{l.ending}<small className="block sub">{l.branch}</small></span><span className="mono">{comma(l.peak)}</span></div>
            ))}
          </>
        )}
        {tab === 'tree' && <TreeView />}
        {tab === 'set' && (
          <div className="set">
            <h4>이름</h4>
            <input type="text" value={g.settings.name} maxLength={8} onChange={(e) => set((x) => { x.settings.name = e.target.value; })} aria-label="이름" />
            <h4>시세 색 관례</h4>
            <div className="chips">
              <button className={'chip' + (g.settings.priceColors === 'kr' ? ' on' : '')} onClick={() => set((x) => { x.settings.priceColors = 'kr'; })}>오르면 빨강</button>
              <button className={'chip' + (g.settings.priceColors === 'intl' ? ' on' : '')} onClick={() => set((x) => { x.settings.priceColors = 'intl'; })}>오르면 초록</button>
            </div>
            <h4>은퇴하고 물려주기</h4>
            <button className="act wide" disabled={!retire.ok} onClick={() => { act({ type: 'retire' }); close(null); }}>은퇴하고 물려주기</button>
            {!retire.ok && <p className="sub">{retire.reason}</p>}
            <h4>데이터 초기화</h4>
            {sure === 0 && <button className="wide" onClick={() => setSure(1)}>데이터 초기화</button>}
            {sure === 1 && <button className="wide" onClick={() => setSure(2)}>정말 지울까요? 한 번 더 누르면 확인 단계로</button>}
            {sure === 2 && <button className="act stamp wide" onClick={() => { hardReset(); close(null); setSure(0); }}>모든 기록을 지웁니다 (되돌릴 수 없음)</button>}
            <h4>고지</h4>
            <p className="legal">이 게임은 모의 게임이며 시세는 가상입니다. 실제 투자·대출과 아무 관련이 없고, 실제 자산을 걸지 않습니다.</p>
            <h4>라이선스</h4>
            <p className="legal">표시용 글꼴 Jua: SIL Open Font License 1.1 (public/fonts/OFL.txt).</p>
          </div>
        )}
      </div>
    </div>
  );
}

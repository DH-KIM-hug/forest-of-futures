import { useEffect } from 'react';
import { useGame } from '../../store/gameStore';
import { useUI } from '../uiStore';
import { Art } from '../common/Art';
import { COL, ROW, HOUSE_ART, type ArtId } from '../assets';
import { buildingBadge } from '../vm/village';
import { Stage } from './Stage';
import { FriendsSheet, HomeSheet, LenderSheet, VisitSheet, WorkSheet } from './Sheets';
import { houseDefs } from '../../engine/data';
import { archiveCount } from '../vm/records';
import { affordableUpgrades } from '../../engine/upgrades';
import { futuresGate } from '../../engine/progression';

interface B { id: string; name: string; x: number; y: number }
const LAYOUT: B[] = [
  { id: 'bank', name: '숲속중앙조합', x: COL[0], y: ROW[0] },
  { id: 'capital', name: '숲속 캐피탈', x: COL[1], y: ROW[0] },
  { id: 'board', name: '광장 전광판', x: COL[2], y: ROW[0] },
  { id: 'archive', name: '마을 기록관', x: COL[0], y: ROW[1] },
  { id: 'home', name: '내 집', x: COL[1], y: ROW[1] },
  { id: 'friends', name: '친구네 골목', x: COL[2], y: ROW[1] },
  { id: 'shark1', name: '오소리 대부', x: COL[0], y: ROW[2] },
  { id: 'shark2', name: '독사 골목', x: COL[2], y: ROW[2] },
];

export function Village() {
  const g = useGame((s) => s.g);
  const sheet = useUI((s) => s.sheet);
  const open = useUI((s) => s.open);
  const setOverlay = useUI((s) => s.setOverlay);
  const seen = useUI((s) => s.seenVisit);
  const run = g.run;
  const offer = run.offers[0];
  const affordable = affordableUpgrades(run).length > 0;
  const gate = futuresGate(g);
  const offerKey = offer ? `${offer.id}:${offer.from}` : null;

  // 새 제안이 오면 채권자가 일터 앞으로 와 말풍선을 띄운다(AC-v2-147)
  useEffect(() => {
    if (offerKey && offerKey !== seen && useUI.getState().sheet === null) open({ k: 'visit' });
    if (!offerKey && useUI.getState().sheet?.k === 'visit') useUI.getState().close();
  }, [offerKey, seen, open]);

  const onClick = (id: string) => {
    if (id === 'archive' || id === 'board') setOverlay(id);
    else if (id === 'home') open({ k: 'home' });
    else if (id === 'friends') open({ k: 'friends' });
    else open({ k: 'lender', id: id as any });
  };
  const art = (id: string): ArtId => {
    if (id === 'home') return HOUSE_ART[run.house] ?? HOUSE_ART[0];
    if (id === 'shark2') return run.shark2Open ? 'bld_shark2_open' : 'bld_shark2_locked';
    return `bld_${id}` as ArtId;
  };
  const sel = sheet?.k === 'lender' ? sheet.id : sheet?.k === 'home' ? 'home' : sheet?.k === 'friends' ? 'friends' : null;

  let panel = null;
  if (sheet?.k === 'lender') panel = <LenderSheet id={sheet.id} />;
  else if (sheet?.k === 'friends') panel = <FriendsSheet />;
  else if (sheet?.k === 'home') panel = <HomeSheet />;
  else if (sheet?.k === 'work') panel = <WorkSheet key={sheet.tab ?? 'w'} tab={sheet.tab} />;
  else if (sheet?.k === 'visit') panel = <VisitSheet />;

  return (
    <div className="scene" role="group" aria-label="마을">
      <Art id="bg_village" className="scene-bg" />
      <div className="sky" />
      {LAYOUT.map((b) => {
        const { debt, od } = buildingBadge(g, b.id);
        const dark = b.id === 'shark2' && !run.shark2Open;
        const nm = b.id === 'home' ? houseDefs[run.house].name : b.id === 'archive' ? `${b.name} ${archiveCount(g)}/200` : dark ? '어두운 골목' : b.name;
        return (
          <button
            key={b.id}
            className={'bld ' + b.id + (sel === b.id ? ' sel' : '') + (dark ? ' dark' : '') + (b.id === 'home' ? ' home' : '')}
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
            onClick={() => onClick(b.id)}
            aria-label={`${nm}${debt ? ` 원금 ${debt}` : ''}${od ? ` ${od}` : ''}`}
          >
            <span className="art"><Art id={art(b.id)} /></span>
            <span className="nm">{nm}{debt && <span className="d">{debt}</span>}</span>
            {od && <span className="od"><img src="/ui/icons/overdue.webp" alt="" /><b>{od}</b></span>}
          </button>
        );
      })}
      <div className="worksign" style={{ left: `${COL[1]}%`, top: `${ROW[2]}%` }}>
        <button className={'signbtn' + (sheet?.k === 'work' ? ' sel' : '')} onClick={() => open(sheet?.k === 'work' ? null : { k: 'work' })} aria-label="일터 패널 열기">
          일터{affordable && <i className="dot" aria-label="살 수 있는 것이 있습니다" />}
        </button>
        {gate.canOpen && <button className="signbtn small act" onClick={() => open({ k: 'lender', id: 'capital' })}>선물 계좌 개설</button>}
      </div>
      <Stage />
      {panel}
    </div>
  );
}

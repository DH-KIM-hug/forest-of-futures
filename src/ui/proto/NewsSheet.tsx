// 도토리일보 시세면(U-41): 거래소에서 펴 보는 신문 한 장. 지난 몇 시간의 실제 움직임을 종목마다 한 줄로 싣는다(daynote.ts).
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { marketDefs } from '../../engine/data';
import { useUI } from '../uiStore';
import { cell, dayBars, dayNote, dayNoteOpen } from './daynote';
import { sessionOf, SESSIONS, opensInText } from './market';
import { recentRange } from './tension';
import { liveHistoryOf } from '../priceHistory';
import { Coin } from './Trade';
import { useEffect } from 'react';
import { bustNewsItems, refreshBusts, useBust } from './bustNews';
import { openBoard } from './ranking';
import { Face } from './ForestBoard';
import { play } from './audio';

/** 「오늘 망한 자들」(U-59): 전광판에 이름을 올린 이들의 파산 소식. 모자라면 숲 단타방 마을 사람들 이야기로 채운다. 누르면 전광판 */
export function BustNews({ max = 5 }: { max?: number }) {
  const rows = useBust((s) => s.rows);
  const log = useProto((s) => s.rivalLog);
  useEffect(() => { void refreshBusts(); }, []);
  const items = bustNewsItems(rows, log, Math.floor(Date.now() / 86_400_000), max);
  return (
    <div className="dn-bust" data-bust-news={items.filter((x) => x.real).length}>
      <h4>오늘 망한 자들</h4>
      {items.map((x) => (
        <button key={x.key} className={'bn' + (x.real ? ' real' : ' npc')} data-bust-item={x.real ? 'real' : 'npc'} onClick={() => { play('ui_tap'); if (x.real) { dayNoteOpen(false); openBoard(); } }}>
          {x.who ? <Face who={x.who} size={22} /> : <i className="bn-mark" aria-hidden="true">속보</i>}
          <span>{x.text}</span>
        </button>
      ))}
    </div>
  );
}

const span = (min: number) => (min >= 90 ? `${Math.round(min / 60)}시간` : `${Math.max(1, Math.round(min))}분`);

export function DayNoteSheet() {
  const on = useProto((s) => s.dayNote);
  const live = useGame((s) => s.net.source === 'hl' && !s.net.fallback);
  useGame((s) => Math.floor(s.g.run.tick / 5)); // 5초마다 다시 읽는다
  if (!on) return null;
  const mk = marketDefs.filter((m) => m.tradable).map((m) => ({ id: m.id, name: m.name }));
  const now = Date.now();
  const note = dayNote(mk, Object.fromEntries(mk.map((m) => [m.id, dayBars(m.id)])), now);
  const pick = (id: string) => { useUI.getState().setTrade({ market: id }); dayNoteOpen(false); };
  const cls = (x: number | null) => (x === null ? '' : x >= 0 ? 'up' : 'down');
  return (
    <div className="pr-notice pr-daynote" role="dialog" aria-label="도토리일보 시세면" data-daynote-sheet onClick={() => dayNoteOpen(false)}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <div className="mast"><b>도토리일보</b><span>시세면  {live ? '실제 시세' : '연습 시세'}, 지난 {span(note.spanMin)}</span></div>
        <h3 data-headline>{note.headline}</h3>
        <p className="sub">{note.sub}</p>
        <div className="tbl" role="table">
          <div className="th" role="row"><span>종목</span><span>1시간</span><span>6시간</span><span>하루</span><span>지금 1분 폭</span></div>
          {note.rows.map((r) => {
            const ss = SESSIONS[r.id] ? sessionOf(r.id, new Date(now), recentRange(liveHistoryOf(r.id))) : null;
            return (
              <button key={r.id} className="tr" role="row" data-note-row={r.id} onClick={() => pick(r.id)}>
                <span className="nm"><Coin id={r.id} size={18} />{r.name}</span>
                <span className={cls(r.h1)}>{cell(r.h1)}</span><span className={cls(r.h6)}>{cell(r.h6)}</span><span className={cls(r.h24)}>{cell(r.h24)}</span>
                <span className="now">{r.now1m === null ? '–' : `${r.now1m.toFixed(2)}%`}{r.ratio !== null && <small className={r.ratio >= 1.6 ? 'hot' : r.ratio < 0.6 ? 'cold' : ''}>평소의 {r.ratio.toFixed(1)}배</small>}</span>
                {(r.loudHour !== null || ss?.badge) && <small className="loud">{ss?.badge && <i data-note-opens={r.id}>{ss.badge === '휴장?' ? '휴장인 듯' : `${ss.badge}${opensInText(r.id, new Date(now)) ? `, ${opensInText(r.id, new Date(now))}` : ''}`}</i>}{r.loudHour !== null && `가장 뛴 때 ${r.loudHour}시 무렵, 1분 ${r.loud1m!.toFixed(2)}%`}</small>}
              </button>
            );
          })}
        </div>
        <BustNews />
        <p className="boss" data-note-boss><b>오소리 대부</b>「{note.boss}」</p>
        <button className="buy on wide" data-daynote-ok onClick={() => dayNoteOpen(false)}><span>접는다</span></button>
      </div>
    </div>
  );
}

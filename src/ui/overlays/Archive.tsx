import { useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useUI } from '../uiStore';
import { endingById } from '../../engine/data';
import { albumModel, CAUSE, heirloomRows, lineageRows, tipBookRows, traitRows } from '../vm/records';
import { comma } from '../../engine/util';

type Tab = 'album' | 'tree' | 'tips' | 'heir';

/** 기록관(3.16·8.9): 등불(이대로 가면) · 2열 카드 앨범 · 거르기 칩 · 가계도 · 정보 수첩 · 유품함. */
export function ArchiveScreen() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const close = useUI((s) => s.setOverlay);
  const [tab, setTab] = useState<Tab>('album');
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const m = albumModel(g, filter);
  return (
    <div className="full archive" role="dialog" aria-label="기록관">
      <header>
        <button className="back" onClick={() => close(null)} aria-label="닫기"><img src="/ui/icons/back.webp" alt="" />닫기</button>
        <h2>기록관 {m.count}</h2>
      </header>
      <div className={'lantern' + (m.lantern.on ? ' on' : '')} role="status"><i aria-hidden="true" />{m.lantern.on ? '등불 켜짐' : '등불 꺼짐'} — {m.lantern.text}</div>
      <div className="chips tabs tabsrow" role="tablist">
        {([['album', '앨범'], ['tree', '가계도'], ['tips', '정보 수첩'], ['heir', '유품함']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'album' && (
        <>
          <div className="fchip-row" role="group" aria-label="원인 거르기">
            <button className={'chip' + (filter === null ? ' on' : '')} aria-pressed={filter === null} onClick={() => setFilter(null)}>전체</button>
            {Object.entries(CAUSE).map(([k, c]) => (
              <button key={k} className={'chip' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{c.label}</button>
            ))}
          </div>
          <div className="scroll album">
            {m.filtered.map((e) => {
              const def = endingById[e.id];
              const cause = CAUSE[e.causes[0]];
              return (
                <div key={e.id} role="button" tabIndex={0} className={'enc' + (e.collected ? ' got' : ' locked')} style={{ ['--cc' as any]: cause?.color }} onClick={() => setOpen(open === e.id ? null : e.id)} onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); setOpen(open === e.id ? null : e.id); } }} aria-expanded={open === e.id}>
                  <span className="no">No.{String(e.no).padStart(3, '0')} <i className="stars" aria-label={`희귀도 ${def.rarity}`}>{'★'.repeat(def.rarity)}</i></span>
                  <span className="ti">{e.title}</span>
                  <span className="cs">{e.causes.map((c) => CAUSE[c]?.label).join('·')}</span>
                  {!e.collected && <span className="hn">{e.clueVisible ? e.clue : '단서가 가려져 있습니다'}</span>}
                  {e.collected && e.holders.length > 0 && <span className="hn">{e.holders.map((h) => `${h.gen}세대 ${h.name}`).join(' · ')}</span>}
                  {open === e.id && (
                    <span className="det">
                      {e.line && <span>{e.line}</span>}
                      {e.conditionsView.map((c, i) => <span key={i} className={'cd' + (e.hiddenIndex === i ? ' q' : '')}>{c}</span>)}
                      {e.hiddenIndex !== null && <span>같은 원인의 이웃 엔딩을 하나 모으면 열립니다.</span>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {tab === 'tree' && (
        <div className="scroll">
          {lineageRows(g).length === 0 && <p className="sub">아직 적힌 세대가 없습니다.</p>}
          {lineageRows(g).map((l) => (
            <div key={l.gen} className="item"><b className="nm">{l.gen}세대 · {l.name}</b><span className="sub">{l.id.replace('END-', 'No.')} {l.ending} · {l.branch} · 최고 순자산 {comma(l.peak)}</span></div>
          ))}
          {traitRows(g).map((t) => <div key={t.id} className="item"><b className="nm">기질 · {t.name}</b><span className="sub">{t.note}</span></div>)}
        </div>
      )}
      {tab === 'tips' && (
        <div className="scroll">
          <p className="sub">출처별 들은 횟수 / 맞은 횟수. 권유가 아니라 기록입니다.</p>
          {tipBookRows(g).length === 0 && <p className="sub">아직 들은 말이 없습니다.</p>}
          {tipBookRows(g).map((t) => (
            <div key={t.id} className="item row sb"><b className="nm">{t.name}</b><span className="mono">{t.said} / {t.hit}</span></div>
          ))}
        </div>
      )}
      {tab === 'heir' && (
        <div className="scroll">
          {heirloomRows(g).map((h) => (
            <div key={h.id} className="item">
              <div className="row sb"><b className="nm">{h.name}</b><span className="sub">{CAUSE[h.cause]?.label} · {h.level}/{h.max}단계</span></div>
              {h.level > 0 && !h.pawnedTo && (
                <div className="inl">
                  <button onClick={() => { const r = act({ type: 'pawn', heirloom: h.id, lender: 'shark1' }); setNote(r.ok ? `+${comma(r.amount ?? 0)} 받고 오소리에게 맡겼습니다` : r.msg ?? ''); }}>오소리에 맡기기 {h.pawnAmount ? comma(h.pawnAmount) : ''}</button>
                  <button onClick={() => { const r = act({ type: 'pawn', heirloom: h.id, lender: 'shark2' }); setNote(r.ok ? `+${comma(r.amount ?? 0)} 받고 독사에게 맡겼습니다` : r.msg ?? ''); }}>독사에 맡기기</button>
                </div>
              )}
              {h.pawnedTo && <span className="sub">{h.pawnedTo === 'shark1' ? '오소리' : '독사'}에게 맡겨 둠. 그 빚을 다 갚으면 돌아옵니다.</span>}
            </div>
          ))}
          {note && <p className="note">{note}</p>}
        </div>
      )}
    </div>
  );
}

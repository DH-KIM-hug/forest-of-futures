// 라이트 모드의 엔딩 카드(docs/gdd/LITE_ENDINGS.md): 파산 표제지(장면 D) 다음에 뜬다. 그림 한 장, 제목, 글 1~3줄, 「새 엔딩!」, 도감 수, [도감] [환생하기].
// 엔딩은 엔진이 고른다(engine/liteEndings.ts, g.pendingEnding.lite). 그림은 img/endings/{id}.webp, 없으면 먹색 빈 칸.
import { useState } from 'react';
import { useGame } from '../../../store/gameStore';
import { liteEndings, LITE_ENDING_TOTAL } from '../../../engine/liteEndings';
import { lifeNo } from '../model';
import { play } from '../audio';
import { reduced } from '../fx';
import './liteEnding.css';

const IMGS = import.meta.glob('../img/endings/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const endingImg = (id: string): string | undefined => IMGS[`../img/endings/${id}.webp`];

/** 도감: 본 엔딩은 그림과 제목, 못 본 것은 ???? */
export function LiteBook({ onClose, hi }: { onClose: () => void; hi?: string }) {
  const book = useGame((s) => s.g.family.liteBook) ?? {};
  const [sel, setSel] = useState<string | null>(null);
  const got = liteEndings.filter((e) => book[e.id]).length;
  const s = sel ? liteEndings.find((e) => e.id === sel) : null;
  return (
    <div className="le-book" role="dialog" aria-label="엔딩 도감" data-lite-book={got}>
      <div className="le-bh"><b>엔딩 도감</b><span>{got} / {LITE_ENDING_TOTAL}</span><button onClick={() => { play('ui_tap'); onClose(); }} data-book-close>닫기</button></div>
      {s && (
        <div className="le-bsel" onClick={() => setSel(null)}>
          {endingImg(s.id) && <img src={endingImg(s.id)} alt="" />}
          <b>{s.title}</b>
          {s.lines.map((l, i) => <p key={i}>{l}</p>)}
          <small>{book[s.id]?.count ?? 0}번 봤다</small>
        </div>
      )}
      <div className="le-grid">
        {liteEndings.map((e, i) => {
          const have = !!book[e.id];
          return (
            <button key={e.id} className={'le-tile' + (have ? ' got' : '') + (e.id === hi ? ' hi' : '')} data-tile={e.id} disabled={!have} onClick={() => { play('ui_tap'); setSel(e.id); }} aria-label={have ? e.title : `${i + 1}번, 아직 못 봄`}>
              {have && endingImg(e.id) ? <img src={endingImg(e.id)} alt="" loading="lazy" /> : <i>{i + 1}</i>}
              <span>{have ? e.title : '????'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LiteEndingCard({ onNext }: { onNext: () => void }) {
  const g = useGame((s) => s.g);
  const p = g.pendingEnding;
  const [bookOpen, setBookOpen] = useState(false);
  if (!p?.lite) return null;
  const img = endingImg(p.id);
  const calm = reduced();
  return (
    <div className={'le-end' + (calm ? ' calm' : '')} data-ending={p.id} data-lite-ending={p.id} data-new={p.isNew ? '1' : '0'} role="dialog" aria-label={`엔딩 ${p.title}`}>
      <div className="le-ep">제{lifeNo(g)}화 끝</div>
      <figure className="le-fig">
        {img ? <img src={img} alt="" draggable={false} /> : <div className="le-noimg" aria-hidden="true" />}
        {p.isNew && <b className="le-new" aria-label="새 엔딩">새 엔딩!</b>}
        <div className="le-stamp" aria-hidden="true">파산</div>
      </figure>
      <h2 className="le-title">{p.title}</h2>
      <div className="le-text">{p.lite.lines.map((l, i) => <p key={i} style={{ animationDelay: `${0.9 + i * 0.5}s` }}>{l}</p>)}</div>
      <div className="le-row">
        <button className="le-booksbtn" data-book onClick={() => { play('ui_tap'); setBookOpen(true); }}>엔딩 도감 <b>{p.collected} / {p.lite.total}</b></button>
        {!p.isNew && <small className="le-nth">{p.nth}번째로 본 엔딩</small>}
      </div>
      <button className="go le-go" data-ending-next onClick={onNext}>다음</button>
      {bookOpen && <LiteBook onClose={() => setBookOpen(false)} hi={p.id} />}
    </div>
  );
}

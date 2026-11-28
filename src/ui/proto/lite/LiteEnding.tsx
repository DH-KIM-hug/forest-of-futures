// 라이트 모드의 엔딩 카드(docs/gdd/LITE_ENDINGS.md): 파산 표제지(장면 D) 다음에 뜬다. 그림 한 장, 제목, 글 1~3줄, 「새 엔딩!」, 도감 수, [도감] [환생하기].
// 엔딩은 엔진이 고른다(engine/liteEndings.ts, g.pendingEnding.lite). 그림은 img/endings/{id}.webp, 없으면 먹색 빈 칸.
// U-62: 새 엔딩이면 열매 하나(나무의 재화), 공짜 가지, 도감 보상, 다음 보상까지 몇 개. 완납과 도감 완성은 특별한 결말.
import { useState } from 'react';
import { useGame } from '../../../store/gameStore';
import { liteEndings, LITE_ENDING_TOTAL } from '../../../engine/liteEndings';
import { CLEAR_ID, LITE_SPECIALS, MILESTONES, giftOf, liteSeenCount, litePerks, liteSpecialById } from '../../../engine/liteFruit';
import { skillById } from '../../../engine/data';
import { lifeNo } from '../model';
import { play } from '../audio';
import { reduced } from '../fx';
import { sprite } from '../sprites';
import { FruitIcon } from './Fruit';
import { giftText, milestoneShort, nextText } from './fruitText';
import './liteEnding.css';

const IMGS = import.meta.glob('../img/endings/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** 그림: 배드 엔딩은 img/endings, 특별한 결말은 은퇴 사진(완납 = 대부의 책상과 액자, 도감 완성 = 해 질 녘 문 앞에서 다시 폰) */
const SPECIAL_ART: Record<string, 'endRetire2' | 'endRetire4'> = { LX01: 'endRetire2', LX02: 'endRetire4' };
export const endingImg = (id: string): string | undefined => IMGS[`../img/endings/${id}.webp`] ?? (liteSpecialById[id] ? sprite(SPECIAL_ART[id] ?? 'endRetire2')?.src : undefined);

/** 도감 보상 다섯 칸: 받은 것은 금색 */
function Miles({ seen }: { seen: number }) {
  return (
    <div className="le-miles" data-miles={seen}>
      <div className="le-mtrack">
        <u style={{ width: `${Math.min(100, (seen / LITE_ENDING_TOTAL) * 100)}%` }} />
        {MILESTONES.map((m) => <i key={m.at} className={seen >= m.at ? 'on' : ''} style={{ left: `${(m.at / LITE_ENDING_TOTAL) * 100}%` }} data-mile={m.at}>{m.at}</i>)}
      </div>
      <div className="le-mnames">{MILESTONES.map((m) => <span key={m.at} className={seen >= m.at ? 'on' : ''}><b>{m.at}</b>{milestoneShort(m)}</span>)}</div>
      <small className="le-mnext" data-next-left={seen}>{nextText(seen)}</small>
    </div>
  );
}

/** 도감: 본 엔딩은 그림과 제목, 못 본 것은 ???? */
export function LiteBook({ onClose, hi }: { onClose: () => void; hi?: string }) {
  const book = useGame((s) => s.g.family.liteBook) ?? {};
  const fruit = useGame((s) => s.g.family.fruit ?? 0);
  const [sel, setSel] = useState<string | null>(null);
  const got = liteSeenCount(book);
  const title = litePerks(book).title;
  const s = sel ? liteEndings.find((e) => e.id === sel) ?? LITE_SPECIALS.find((e) => e.id === sel) : null;
  const sGift = s ? giftOf(s.id) : null;
  const tile = (id: string, title: string, label: string, i?: number) => {
    const have = !!book[id];
    const gift = giftOf(id);
    return (
      <button key={id} className={'le-tile' + (have ? ' got' : '') + (id === hi ? ' hi' : '')} data-tile={id} disabled={!have} onClick={() => { play('ui_tap'); setSel(id); }} aria-label={have ? title : `${label}, 아직 못 봄`}>
        {have && endingImg(id) ? <img src={endingImg(id)} alt="" loading="lazy" /> : <i>{i !== undefined ? i + 1 : '★'}</i>}
        <span>{have ? title : '????'}</span>
      </button>
    );
  };
  return (
    <div className="le-book" role="dialog" aria-label="엔딩 도감" data-lite-book={got}>
      <div className="le-bh"><b>엔딩 도감</b><span>{got} / {LITE_ENDING_TOTAL}</span><span className="le-bfruit" data-book-fruit={fruit}><FruitIcon size={16} /> {fruit}</span><button onClick={() => { play('ui_tap'); onClose(); }} data-book-close>닫기</button></div>
      {title && <div className="le-title-badge" data-title-badge>칭호 「{title}」</div>}
      <Miles seen={got} />
      {s && (
        <div className="le-bsel" onClick={() => setSel(null)}>
          {endingImg(s.id) && <img src={endingImg(s.id)} alt="" />}
          <b>{s.title}</b>
          {s.lines.map((l, i) => <p key={i}>{l}</p>)}
          {sGift && <p className="le-bgift">「{skillById[sGift.node]?.name}」 열림</p>}
          <small>{book[s.id]?.count ?? 0}번 봤다</small>
        </div>
      )}
      <div className="le-grid">
        {liteEndings.map((e, i) => tile(e.id, e.title, `${i + 1}번`, i))}
        <div className="le-sph">특별한 결말</div>
        {LITE_SPECIALS.map((e) => tile(e.id, e.title, e.id === CLEAR_ID ? '빚을 다 갚으면' : '마흔 가지를 다 보면'))}
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
  const r = p.lite.reward;
  const stamp = p.lite.stamp;
  const seen = liteSeenCount(g.family.liteBook);
  const title = litePerks(g.family.liteBook).title;
  return (
    <div className={'le-end' + (calm ? ' calm' : '') + (stamp ? ' special' : '')} data-ending={p.id} data-lite-ending={p.id} data-new={p.isNew ? '1' : '0'} role="dialog" aria-label={`엔딩 ${p.title}`}>
      <div className="le-ep">제{lifeNo(g)}화 끝{title && <em className="le-eptitle"> 「{title}」</em>}</div>
      <figure className="le-fig">
        {img ? <img src={img} alt="" draggable={false} /> : <div className="le-noimg" aria-hidden="true" />}
        {p.isNew && <b className="le-new" aria-label="새 엔딩">새 엔딩!</b>}
        <div className={'le-stamp' + (stamp ? ' gold' : '')} aria-hidden="true">{stamp ?? '파산'}</div>
      </figure>
      <h2 className="le-title">{p.title}</h2>
      <div className="le-text">{p.lite.lines.map((l, i) => <p key={i} style={{ animationDelay: `${0.9 + i * 0.5}s` }}>{l}</p>)}</div>
      {r && r.fruit > 0 && (
        <div className="le-reward" data-fruit-gain={r.fruit} role="status">
          <span className="le-fruit"><FruitIcon size={26} /><b>열매 +{r.fruit}</b><small>나무에 쓴다</small></span>
          {r.gift && <span className="le-gift" data-gift={r.gift.node} data-gift-kind={r.gift.kind}><b>{giftText(r.gift)}</b></span>}
          {r.milestone && <span className="le-mile" data-milestone={r.milestone.at}><b>도감 {r.milestone.at}개! {r.milestone.name}</b><small>{r.milestone.text}, 열매 +{r.milestone.fruit}</small></span>}
        </div>
      )}
      <div className="le-row">
        <button className="le-booksbtn" data-book onClick={() => { play('ui_tap'); setBookOpen(true); }}>엔딩 도감 <b>{p.collected} / {p.lite.total}</b></button>
        <small className="le-next" data-next-left={seen}>{nextText(seen)}</small>
        {!p.isNew && <small className="le-nth">{p.nth}번째로 본 엔딩. 열매는 처음 볼 때만 열린다.</small>}
      </div>
      <button className="go le-go" data-ending-next onClick={onNext}>다음</button>
      {bookOpen && <LiteBook onClose={() => setBookOpen(false)} hi={p.id} />}
    </div>
  );
}

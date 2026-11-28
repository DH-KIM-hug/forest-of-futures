// 숲 게시판(U-56, 회차 15): FRX 의뢰판 · 숲 단타방 · 트로피 장. 거래소의 「의뢰」 줄과 집 벽의 붉은 쪽지, 액자에서 연다.
import { useEffect, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto, type Who } from './protoStore';
import { questById, QUESTS, GUST_QUEST, progText } from './quests';
import { RIVALS, rivalById, roeOf, standings } from './rivals';
import { TROPHIES, loadTrophies, onTrophies } from './trophies';
import { rankOf, rankFeeText } from './frxRank';
import { flySecOf } from './flyWind';
import { marketById } from '../../engine/data';
import { openingEvent, feeEventLeft } from '../../engine/skilltree';
import { comma } from '../../engine/util';
import { sprite, type SpriteId } from './sprites';
import { play } from './audio';
import { useUI } from '../uiStore';
import { bustHeadline, refreshBusts, useBust } from './bustNews';
import { openBoard } from './ranking';

const FACE: Partial<Record<Who, SpriteId>> = { raccoon: 'cRaccoon', weasel: 'cWeasel', owl: 'cOwl', viper: 'cViper', boss: 'cBoss', collector: 'cCollector' };
export function Face({ who, off = false, size = 34 }: { who: Who; off?: boolean; size?: number }) {
  const sp = FACE[who] ? sprite(FACE[who]!) : null;
  return (
    <span className={'fb-face' + (off ? ' off' : '') + (who === 'news' ? ' news' : '')} style={{ width: size, height: size }} aria-hidden="true">
      {sp ? <img src={sp.src} alt="" draggable={false} /> : <b>호외</b>}
    </span>
  );
}
const sgn = (x: number) => (x >= 0 ? '+' : '−') + comma(Math.abs(Math.round(x)));
const mName = (id: string) => marketById[id]?.short ?? marketById[id]?.name ?? id;
export const forestOpen = (tab: 'quest' | 'rival' | 'trophy') => { play('ui_tap'); useProto.getState().patch({ forest: tab }); };

export function ForestBoard() {
  const tab = useProto((s) => s.forest);
  const quests = useProto((s) => s.quests);
  const rivals = useProto((s) => s.rivals);
  const log = useProto((s) => s.rivalLog);
  const tradeLife = useProto((s) => s.tradeLife);
  const stamps = useProto((s) => s.frxStamps);
  const g = useGame((s) => s.g);
  const [, bump] = useState(0);
  useEffect(() => onTrophies(() => bump((k) => k + 1)), []);
  if (!tab) return null;
  const close = () => useProto.getState().patch({ forest: null });
  const set = (t: 'quest' | 'rival' | 'trophy') => { play('ui_tap'); useProto.getState().patch({ forest: t }); };
  const rk = rankOf(stamps);
  const evOn = !!openingEvent() && feeEventLeft(g.run) > 0;
  const fs = flySecOf(g.run);
  const book = loadTrophies();
  const have = TROPHIES.filter((t) => book[t.id]).length;
  return (
    <div className="pr-notice pr-forest" role="dialog" aria-label="숲 게시판" data-forest={tab} onClick={close}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <div className="fb-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'quest'} className={tab === 'quest' ? 'on' : ''} data-fb-tab="quest" onClick={() => set('quest')}>의뢰판</button>
          <button role="tab" aria-selected={tab === 'rival'} className={tab === 'rival' ? 'on' : ''} data-fb-tab="rival" onClick={() => set('rival')}>단타방</button>
          <button role="tab" aria-selected={tab === 'trophy'} className={tab === 'trophy' ? 'on' : ''} data-fb-tab="trophy" onClick={() => set('trophy')}>트로피 {have}</button>
        </div>
        {tab === 'quest' && (
          <div className="fb-body" data-fb="quest">
            {!quests && <p className="sub">첫 주문을 치르고 나면 마을 사람들이 의뢰를 붙인다.</p>}
            {quests?.gust && !quests.gust.done && (
              <div className="fb-q gust" data-fbq="gust">
                <Face who="news" />
                <div className="tx"><small>{GUST_QUEST.name}{fs !== null ? `, 남은 ${Math.max(1, Math.ceil((quests.gust.endsAt - fs) / 60))}분` : ''}</small><b>{GUST_QUEST.title}</b><i>「{GUST_QUEST.line}」</i></div>
                <em className="rw">도장 +{GUST_QUEST.reward}</em>
              </div>
            )}
            {quests?.slots.map((s) => { const q = questById[s.id]; if (!q) return null; return (
              <div key={s.id} className="fb-q" data-fbq={s.id}>
                <Face who={q.who} />
                <div className="tx"><small>{q.name}</small><b>{q.title}</b><i>「{q.line}」</i>
                  <span className="bar" aria-hidden="true"><u style={{ width: `${(s.prog / q.need) * 100}%` }} /></span>
                </div>
                <em className="rw">{progText(s, q)}<small>도장 +{q.reward}</small></em>
              </div>
            ); })}
            {quests && <p className="fb-foot" data-fb-fee>이번 생 끝낸 의뢰 {quests.done}개. 도장은 FRX 등급으로 간다: 지금 {rk.name}, {evOn ? '오픈 기념이 끝나면 ' : ''}{rankFeeText(rk.r)}. {rk.next}까지 {rk.need - rk.have}개, 그러면 {rankFeeText(rk.r + 1)}.</p>}
          </div>
        )}
        {tab === 'rival' && (
          <div className="fb-body" data-fb="rival">
            {!rivals ? <p className="sub">첫 주문을 치르고 나면 단타방에 들어간다.</p> : (() => {
              const rows = standings(rivals, tradeLife, g.run.prices);
              return (
                <>
                  <p className="fb-lead">돈을 빌려준 사람들도 몰래 선물을 한다. 같은 시세, 이번 생 거래 손익.</p>
                  <div className="fb-rank" role="table">
                    {rows.map((r, i) => { const d = rivalById[r.id]; const o = d ? rivals.r[r.id] : null; const p = o?.pos; const px = p ? g.run.prices[p.market] : 0; return (
                      <div key={r.id} className={'fb-row' + (r.me ? ' me' : '')} role="row" data-fbr={r.id}>
                        <i className="no">{i + 1}</i>
                        {d ? <Face who={d.who} size={28} /> : <span className="fb-face me" style={{ width: 28, height: 28 }}><img src={sprite('heroHappy')!.src} alt="" /></span>}
                        <span className="nm">{r.name}<small>{d && o ? (p ? `${mName(p.market)} ${p.dir === 1 ? '롱' : '숏'} ${p.lev}배 ${px ? (roeOf(p, px) >= 0 ? '+' : '−') + Math.abs(roeOf(p, px)).toFixed(0) + '%' : ''}` : `쉬는 중${o.busts ? `, 파산 ${o.busts}번` : ''}`) : '다로미'}</small></span>
                        <b className={r.pnl >= 0 ? 'up' : 'down'}>{sgn(r.pnl)}</b>
                      </div>
                    ); })}
                  </div>
                  <div className="fb-log">
                    {log.slice(0, 6).map((e, i) => { const d = rivalById[e.id]; return (
                      <p key={e.at + e.id + i} className={'lg ' + e.kind}><b>{d.name}</b> {e.kind === 'open' ? `${mName(e.market)} ${e.dir === 1 ? '롱' : '숏'} ${e.lev}배 진입` : e.kind === 'liq' ? `${mName(e.market)} ${e.lev}배 청산 ${sgn(e.pnl)}` : e.kind === 'bust' ? '파산' : `${mName(e.market)} ${e.lev}배 ${e.pnl >= 0 ? '익절' : '손절'} ${sgn(e.pnl)}`}<i>「{e.line}」</i></p>
                    ); })}
                    {log.length === 0 && <p className="sub">아직 조용하다. 다들 눈치를 본다.</p>}
                  </div>
                </>
              );
            })()}
          </div>
        )}
        {tab === 'trophy' && (
          <div className="fb-body" data-fb="trophy">
            <p className="fb-lead">생을 넘어 남는 것. {have} / {TROPHIES.length}, 엔딩 장부 {Object.keys(g.family.ledger).length}개</p>
            <div className="fb-tro">
              {TROPHIES.map((t) => { const on = !!book[t.id]; return (
                <button key={t.id} className={'tro' + (on ? ' on' : '')} data-tro={t.id} data-have={on ? 1 : 0} onClick={() => { play('ui_tap'); }} aria-label={on ? `${t.name}, ${book[t.id].gen}번째 생` : `잠김, ${t.how}`}>
                  <Face who={t.who} off={!on} size={30} />
                  <b>{on ? t.name : '???'}</b>
                  <small>{on ? `${book[t.id].gen}번째 생에 얻음` : t.how}</small>
                </button>
              ); })}
            </div>
          </div>
        )}
        <button className="buy on wide" data-forest-ok onClick={close}><span>접는다</span></button>
      </div>
    </div>
  );
}

/** 거래소의 한 줄: 맨 앞 의뢰(또는 돌풍 특보)와 단타방 순위. 방금 라이벌의 일이 있으면 그것을 */
export function ForestLine() {
  const quests = useProto((s) => s.quests);
  const rivals = useProto((s) => s.rivals);
  const log = useProto((s) => s.rivalLog);
  const tradeLife = useProto((s) => s.tradeLife);
  const prices = useGame((s) => s.g.run.prices);
  const tick = useGame((s) => s.g.run.tick);
  const ui = useUI((s) => s.trade.market);
  const busts = useBust((st) => st.rows);
  // U-59 「오늘 망한 자들」: 2분에 한 번 받아 두고, 1분에 9초쯤 진짜 사람의 파산 소식을 띄운다
  useEffect(() => { void refreshBusts(); }, [Math.floor(tick / 120)]);
  if (!quests) return null;
  const bustNow = busts.length && tick % 60 < 9 ? busts[Math.floor(tick / 60) % busts.length] : null;
  const fresh = log.find((e) => tick - e.at <= 8 && e.kind !== 'open' && (e.market === ui || e.kind === 'bust'));
  const gust = quests.gust && !quests.gust.done;
  const s0 = quests.slots[0];
  const q = gust ? GUST_QUEST : questById[s0?.id];
  const rows = rivals ? standings(rivals, tradeLife, prices) : [];
  const myRank = rows.findIndex((r) => r.me) + 1;
  return (
    <div className="pt-forest" data-forestline>
      {bustNow && !log.find((e) => tick - e.at <= 8 && e.kind !== 'open') ? (
        <button className="fq ev bust" data-fl-bust onClick={() => { play('ui_tap'); openBoard(); }}>
          <Face who="news" size={20} /><span><em>오늘 망한 자들</em>{bustHeadline(bustNow)}</span>
        </button>
      ) : fresh ? (
        <button className={'fq ev ' + fresh.kind} data-fl-ev={fresh.kind} onClick={() => forestOpen('rival')}>
          <Face who={rivalById[fresh.id].who} size={20} /><span><b>{rivalById[fresh.id].name}</b> {fresh.kind === 'liq' ? `${fresh.lev}배 청산` : fresh.kind === 'bust' ? '파산' : fresh.pnl >= 0 ? `${fresh.lev}배 익절` : `${fresh.lev}배 손절`} 「{fresh.line}」</span>
        </button>
      ) : q ? (
        <button className={'fq' + (gust ? ' gust' : '')} data-fl-q={gust ? 'gust' : s0.id} onClick={() => forestOpen('quest')}>
          <Face who={q.who} size={20} /><span><em>{gust ? '돌풍 의뢰' : '의뢰'}</em>{q.title}</span><b className="pg">{gust ? `+${q.reward}` : `${progText(s0, q)}`}</b>
        </button>
      ) : null}
      {rivals && <button className="fr" data-fl-rank={myRank} onClick={() => forestOpen('rival')} aria-label={`숲 단타방 ${myRank}위`}>단타방 <b>{myRank}위</b></button>}
    </div>
  );
}

export const RIVAL_COUNT = RIVALS.length;
export const QUEST_COUNT = QUESTS.length;

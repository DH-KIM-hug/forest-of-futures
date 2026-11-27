import { useEffect, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { endingCardModel } from '../vm/records';
import { comma } from '../../engine/util';
import { lifeNo } from './model';
import { rebirthOverride } from './dev';
import { sprite, RETIRE_PHOTO, type SpriteId } from './sprites';
import { activeLevels, treeView, type NodeView } from '../../engine/skilltree';
import { nodeOdds, treeOddsLine } from './odds';
import { endingById, skillById, skillPathEndings } from '../../engine/data';
import { act1Text } from '../../engine/act1';
import { play } from './audio';
import { RankRebirth } from './RankingBoard';

/** 사건 기록의 물건 이름을 집에 적힌 이름으로(채권처 이름은 데이터가 이미 지도의 이름이다, U-39 ⑦) */
const placeName = (t: string): string => t.replace(/도토코인 쳇바퀴/g, '엄마의 쳇바퀴');

/** 폴라로이드 속 마지막 사진(U-40 그림): 파산 = 색이 빠진 빈 집에 폰을 든 주인공, 은퇴 = 색이 남은 해 질 녘의 집. */
function Photo({ retired, id }: { retired: boolean; /** 엔딩 id: 은퇴 엔딩 넷은 사진이 따로 있다(U-41) */ id?: string }) {
  const key: SpriteId = retired ? (id && RETIRE_PHOTO[id] && sprite(RETIRE_PHOTO[id]) ? RETIRE_PHOTO[id] : 'endRetire') : 'endBankrupt';
  return <img className="photo" data-art={key} src={sprite(key)!.src} alt="" draggable={false} />;
}

/** 엔딩 카드 → 환생(상속포기 갈래 자동) → 다음 생. 가훈 값은 엔진 값(황금 실물 도토코인으로 표기). */
export function EndingFlow() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const e = g.estate;
  useEffect(() => {
    // 명세서 단계에서 꺼졌다 켜진 경우: 가장 단순한 길(상속포기)로 자동 진행
    if (e && e.step === 'statement') act({ type: 'inherit', branch: 'renounce' });
  }, [e?.step]);
  if (!e) return null;
  if (e.step === 'card') {
    const m = endingCardModel(g);
    if (!m) return null;
    const retired = m.cause === 'RETIRE'; // 빚을 다 갚고 닫은 생(U-39 ⑧): 도장만 다르고 흐름은 같다
    return (
      <div className={'pr-end' + (retired ? ' retired' : '')} data-ending={m.id} data-cause={m.cause} role="dialog" aria-label="엔딩">
        <figure className="polaroid">
          <Photo retired={retired} id={m.id} />
          <figcaption>{m.title}</figcaption>
          <div className={'stamp' + (retired ? ' gold' : '')} aria-label={retired ? '은퇴' : '파산'}>{retired ? '은퇴' : '파산'}</div>
        </figure>
        <div className="card">
          <div className="cause" style={{ background: m.color }}>{m.no}  {m.causeLabel}</div>
          <p className="line">{m.line}</p>
          <div className="blk"><h4>마지막 세 장면</h4>
            {m.scenes.length === 0 && <p className="sub">기록이 없습니다.</p>}
            {m.scenes.map((s, i) => <div key={i} className="sc"><span>{placeName(s.text)}</span>{s.amount !== null && <b className={s.amount >= 0 ? 'up' : 'dn'}>{s.amount >= 0 ? '+' : '−'}{comma(Math.abs(s.amount))}</b>}</div>)}
          </div>
          <p className="sub">{m.status}, 장부 {m.ledger}</p>
        </div>
        <button className="go" data-rebirth onClick={() => act({ type: 'estateNext' })}>환생하기</button>
      </div>
    );
  }
  if (e.step === 'statement') return <div className="pr-end"><p className="sub">…</p></div>;
  const run = g.run;
  const repaid = Math.round((run.stats['repaid.shark1'] as number | undefined) ?? 0);
  const retired = g.pendingEnding?.cause === 'RETIRE';
  return (
    <div className="pr-end re tree" role="dialog" aria-label="환생">
      <div className="re-top">
        <img src={sprite('hero')!.src} alt="" width={42} height={56} />
        <div>
          <h2>다시 눈을 뜬다</h2>
          <p>{retired ? '빚을 다 갚고 며칠 뒤, 그 오두막에서 눈을 떴다. 첫 주문을 날린 그날 저녁이다. 오소리 장부에 다시 50만.' : '다시 그 오두막, 첫 주문을 날린 그날 저녁이다. 오소리 장부에 50만.'}</p>
        </div>
      </div>
      <div className="award" data-award={e.gold ?? 0}>
        <img className="coin art" data-art="goldcoin" src={sprite('goldcoin')!.src} alt="" />
        <span>지난 생에 갚은 원금 <b className="sm">{comma(repaid)}</b><br /><small>5만마다 금박 도장 하나{run.debts.shark1.principal <= 0 && repaid > 0 ? ', 완납 +2' : ''}</small></span>
        <b>+{comma(e.gold ?? 0)}</b>
      </div>
      <SkillTree />
      <p className="re-stat">지난 생: 정산 {run.settleNo}번, 거래 {run.futures.closedTrades}건, 청산 {(run.stats.liqCount as number | undefined) ?? 0}번</p>
      <RankRebirth />
      <button className="go" data-next-life onClick={() => { if (act({ type: 'nextGeneration' }).ok) rebirthOverride(); }}>{lifeNo(g) + 1}번째 생 시작</button>
    </div>
  );
}

const PATHS: { id: 'A' | 'B' | 'C'; name: string; sub: string }[] = [
  { id: 'A', name: '단타꾼', sub: '빨리 들어가고 빨리 나온다' },
  { id: 'B', name: '고배율꾼', sub: '크게 걸고 크게 망한다' },
  { id: 'C', name: '버티는 자', sub: '죽지 않는 법을 산다' },
];
const COLX = { A: 17, B: 50, C: 83 } as const;
const ROWY = [91, 73, 54, 34, 13]; // 단계 0(뿌리) ~ 4, 아래에서 위로 자란다
const posOf = (v: NodeView): { x: number; y: number } => {
  if (v.tier === 0) return { x: 50, y: ROWY[0] };
  const x = COLX[v.path as 'A' | 'B' | 'C'];
  // 3단계는 가지가 둘로 갈라진다(a 가 왼쪽)
  return { x: v.tier === 3 ? x + (v.id.endsWith('a') ? -8.5 : 8.5) : x, y: ROWY[v.tier] };
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
/** 켜고 끄는 노드의 숫자 꼬리 표기(U-39 ⑨) */
const tailFmt = (id: string, x: number): string =>
  id === 'A3a' ? `+${Math.round(x)}초` : id === 'B2' ? `−${(x * 100).toFixed(2)}%p` : id === 'B3b' ? `${(x * 100).toFixed(1)}%` : id === 'C4' ? `+${(x * 100).toFixed(1)}%p` : `−${(x * 100).toFixed(1)}%`;
/** 노드 효과 한 줄: 지금 → 다음 */
function effectText(v: NodeView): string {
  if (v.tail) return `${v.tail.text} ${v.level > 0 ? `지금 ${tailFmt(v.id, v.tail.now)}` : '열면'}${v.tail.next !== null ? ` → ${tailFmt(v.id, v.tail.next)}` : ''}`;
  if (v.kind !== 'scaled') return v.level > 0 ? '열림' : '';
  const what = v.id === 'C2' ? '청산 때 돌려받는 증거금' : v.id === 'B1' ? '50배 이상 수수료' : '거래 수수료';
  const sign = v.id === 'C2' ? '' : '−';
  return `${what} ${sign}${pct(v.effect)}${v.nextEffect !== null ? ` → ${sign}${pct(v.nextEffect)}` : ''} (상한 ${sign}${pct(v.cap ?? 0)})`;
}

/** 영구 스킬트리(docs/gdd/SKILLTREE_TRADE.md): 뿌리에서 세 가지가 뻗는 나무 한 그루. 환생 화면에서만 산다. 산 노드는 지금 시작하는 생부터 켜진다. */
function SkillTree() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const [sel, setSel] = useState<string>('R');
  const [msg, setMsg] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const nodes = treeView(g);
  const byId = Object.fromEntries(nodes.map((v) => [v.id, v]));
  const cur = byId[sel] ?? nodes[0];
  const gold = g.family.gold ?? 0;
  const edges: [string, string][] = [];
  for (const v of nodes) for (const r of skillById[v.id].requires) edges.push([r, v.id]);
  // 이 길의 엔딩(U-39 ⑪): 봤으면 이름, 못 봤으면 ???? — 누르면 단서(본 것은 글)
  const pathEnds = cur.path === 'R' ? [] : ((skillPathEndings[cur.path] as string[] | undefined) ?? []).filter((id) => endingById[id]);
  const seenEnd = (id: string) => !!g.family.ledger[id];
  const active = activeLevels(g);
  const od = nodeOdds(active, cur.id, cur.level);
  const buy = () => { const r = act({ type: 'treeBuy', id: cur.id }); if (r.ok) { play('new_equipment'); setMsg(null); } else { play('insufficient'); setMsg(r.msg ?? '살 수 없다'); } };
  const pick = () => { const r = act({ type: 'treePick', id: cur.id }); if (r.ok) play('ui_tap'); };
  return (
    <section className="pr-tree" data-tree aria-label="스킬트리">
      <div className="tr-h"><b>거래의 나무</b><span className="gold" data-gold={gold}><img className="coin art" src={sprite('goldcoin')!.src} alt="" />{comma(gold)}개</span></div>
      <p className="tr-odds" data-tree-odds>{treeOddsLine(active)}</p>
      <div className="tr-paths">{PATHS.map((p) => <span key={p.id} className={'p-' + p.id}><b>{p.name}</b><small>{p.sub}</small></span>)}</div>
      <div className="tr-box">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {edges.map(([a, b]) => { const A = posOf(byId[a]), B = posOf(byId[b]); const on = byId[a].level > 0 && byId[b].level > 0; return <line key={a + b} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className={on ? 'on' : ''} vectorEffect="non-scaling-stroke" />; })}
        </svg>
        {nodes.map((v) => {
          const p = posOf(v);
          const cls = 'nd p-' + v.path + (v.level > 0 ? ' own' : '') + (v.canBuy ? ' can' : '') + (v.level > 0 && !v.picked ? ' off' : '') + (v.id === sel ? ' sel' : '');
          return (
            <button key={v.id} className={cls} data-node={v.id} data-level={v.level} style={{ left: `${p.x}%`, top: `${p.y}%` }} onClick={() => { setSel(v.id); setMsg(null); setHint(null); play('ui_tap'); }}
              aria-label={`${v.name}${v.level > 0 ? ` 레벨 ${v.level}` : ' 잠김'}`}>
              <i>{v.level > 0 ? (v.kind === 'scaled' || v.tail ? v.level : '✓\uFE0E') : v.cost ?? ''}</i>
              <em>{v.name}</em>
            </button>
          );
        })}
      </div>
      <div className="tr-info" data-info={cur.id}>
        <div className="l">
          <b>{cur.name}{cur.level > 0 && (cur.kind === 'scaled' || cur.tail) ? ` Lv${cur.level}` : ''}</b>
          <p>{cur.desc}</p>
          {effectText(cur) && (cur.kind === 'scaled' || cur.tail) && <small data-effect>{effectText(cur)}</small>}
          {/* 이 노드가 예시 한 판(5만 200배, 익절 · 손절 ±15,500)을 얼마나 바꾸는가(U-42 ④): 수수료가 기울인 승률을 지금 → 다음 레벨로. 시세는 그대로다 */}
          {od && cur.cost !== null && <small className={'odds' + ((od.next.p ?? 0) < (od.now.p ?? 0) ? ' worse' : '')} data-odds={cur.id}>{od.text}</small>}
          {cur.level > 0 && !cur.picked && <small>짝 가지가 켜져 있다. 한 생에 하나만.</small>}
          {msg && <small className="bad">{msg}</small>}
        </div>
        {cur.level > 0 && cur.pair && !cur.picked
          ? <button className="buy on" data-pick onClick={pick}><span>이번 생에 켠다</span></button>
          : cur.cost !== null
            ? <button className={'buy' + (cur.canBuy ? ' on' : '')} data-buy disabled={!cur.canBuy} onClick={buy}><span>{cur.level > 0 ? '키운다' : '연다'}</span><small>{cur.canBuy ? `황금 ${cur.cost}개` : cur.reason ?? ''}</small></button>
            : <span className="have">열림</span>}
      </div>
      {pathEnds.length > 0 && (
        <div className={'tr-ends p-' + cur.path} data-path-ends={cur.path}>
          <b>{PATHS.find((p) => p.id === cur.path)?.name}의 엔딩 {pathEnds.filter(seenEnd).length}/{pathEnds.length}</b>
          <span>{pathEnds.map((id) => {
            const e = endingById[id];
            const got = seenEnd(id);
            return <button key={id} className={got ? 'got' : ''} data-end={id} data-got={got ? '1' : '0'} onClick={() => { play('ui_tap'); setHint(got ? `「${act1Text(e).title}」 ${act1Text(e).line}` : `???? — ${e.clue}`); }}>{got ? act1Text(e).title : '????'}</button>;
          })}</span>
          {hint && <small data-end-hint>{hint}</small>}
        </div>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { endingCardModel } from '../vm/records';
import { comma } from '../../engine/util';
import { lifeNo } from './model';
import { rebirthOverride } from './dev';
import { Room, Wheel, C } from './art';
import heroSit from './img/hero_sit.png';
import heroFront from './img/hero_front.png';
import { treeView, type NodeView } from '../../engine/skilltree';
import { skillById } from '../../engine/data';
import { play } from './audio';

/** 장부·사건 기록의 채권처 이름을 지도에 적힌 이름으로(데이터의 옛 이름 '황금저축·캐피탈' → '숲속 캐피탈') */
const placeName = (t: string): string => t.replace(/황금저축·캐피탈/g, '숲속 캐피탈').replace(/도토코인 쳇바퀴/g, '엄마의 쳇바퀴');

/** 폴라로이드 속 마지막 사진: 색을 뺀 빈 오두막(§10.3 엔딩은 색을 뺀다). 주인공은 앉아서 폰을 본다. */
function Photo() {
  return (
    <svg className="photo" viewBox="0 0 300 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="300" height="220" fill="#8D8A84" />
      <Room cx={150} cy={236} hw={170} h={120} wall="#D9B98A" floor="#E3C9A0" />
      <g opacity={0.55}><Wheel cx={206} cy={176} w={56} col={C.dtc} /></g>
      <image href={heroSit} x={98} y={128} width={74} height={67} />
    </svg>
  );
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
    return (
      <div className="pr-end" role="dialog" aria-label="엔딩">
        <figure className="polaroid">
          <Photo />
          <figcaption>{m.title}</figcaption>
          <div className="stamp" aria-label="파산">파산</div>
        </figure>
        <div className="card">
          <div className="cause" style={{ background: m.color }}>{m.no} · {m.causeLabel}</div>
          <p className="line">{m.line}</p>
          <div className="blk"><h4>마지막 세 장면</h4>
            {m.scenes.length === 0 && <p className="sub">기록이 없습니다.</p>}
            {m.scenes.map((s, i) => <div key={i} className="sc"><span>{placeName(s.text)}</span>{s.amount !== null && <b className={s.amount >= 0 ? 'up' : 'dn'}>{s.amount >= 0 ? '+' : '−'}{comma(Math.abs(s.amount))}</b>}</div>)}
          </div>
          <p className="sub">{m.status} · 장부 {m.ledger}</p>
        </div>
        <button className="go" data-rebirth onClick={() => act({ type: 'estateNext' })}>환생하기</button>
      </div>
    );
  }
  if (e.step === 'statement') return <div className="pr-end"><p className="sub">…</p></div>;
  const run = g.run;
  const repaid = Math.round((run.stats['repaid.shark1'] as number | undefined) ?? 0);
  return (
    <div className="pr-end re tree" role="dialog" aria-label="환생">
      <div className="re-top">
        <img src={heroFront} alt="" width={54} height={52} />
        <div>
          <h2>다시 눈을 뜬다</h2>
          <p>폰 고리의 리본이 빛난다. 다시 그 오두막, 그날이다. 빚 30만도 그대로다.</p>
        </div>
      </div>
      <div className="award" data-award={e.gold ?? 0}>
        <i className="coin" aria-hidden="true" />
        <span>지난 생에 갚은 원금 <b className="sm">{comma(repaid)}</b><br /><small>장부의 금박 도장 5만마다 하나{run.debts.shark1.principal <= 0 && repaid > 0 ? ' · 완납 +2' : ''}</small></span>
        <b>+{comma(e.gold ?? 0)}</b>
      </div>
      <SkillTree />
      <p className="re-stat">지난 생: 정산 {run.settleNo}번 · 거래 {run.futures.closedTrades}건 · 청산 {(run.stats.liqCount as number | undefined) ?? 0}번</p>
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
/** 노드 효과 한 줄: 지금 → 다음 */
function effectText(v: NodeView): string {
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
  const nodes = treeView(g);
  const byId = Object.fromEntries(nodes.map((v) => [v.id, v]));
  const cur = byId[sel] ?? nodes[0];
  const gold = g.family.gold ?? 0;
  const edges: [string, string][] = [];
  for (const v of nodes) for (const r of skillById[v.id].requires) edges.push([r, v.id]);
  const buy = () => { const r = act({ type: 'treeBuy', id: cur.id }); if (r.ok) { play('new_equipment'); setMsg(null); } else { play('insufficient'); setMsg(r.msg ?? '살 수 없다'); } };
  const pick = () => { const r = act({ type: 'treePick', id: cur.id }); if (r.ok) play('ui_tap'); };
  return (
    <section className="pr-tree" data-tree aria-label="스킬트리">
      <div className="tr-h"><b>거래의 나무</b><span className="gold" data-gold={gold}><i className="coin" />{comma(gold)}개</span></div>
      <div className="tr-paths">{PATHS.map((p) => <span key={p.id} className={'p-' + p.id}><b>{p.name}</b><small>{p.sub}</small></span>)}</div>
      <div className="tr-box">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {edges.map(([a, b]) => { const A = posOf(byId[a]), B = posOf(byId[b]); const on = byId[a].level > 0 && byId[b].level > 0; return <line key={a + b} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className={on ? 'on' : ''} vectorEffect="non-scaling-stroke" />; })}
        </svg>
        {nodes.map((v) => {
          const p = posOf(v);
          const cls = 'nd p-' + v.path + (v.level > 0 ? ' own' : '') + (v.canBuy ? ' can' : '') + (v.level > 0 && !v.picked ? ' off' : '') + (v.id === sel ? ' sel' : '');
          return (
            <button key={v.id} className={cls} data-node={v.id} data-level={v.level} style={{ left: `${p.x}%`, top: `${p.y}%` }} onClick={() => { setSel(v.id); setMsg(null); play('ui_tap'); }}
              aria-label={`${v.name}${v.level > 0 ? ` 레벨 ${v.level}` : ' 잠김'}`}>
              <i>{v.level > 0 ? (v.kind === 'scaled' ? v.level : '✓\uFE0E') : v.cost ?? ''}</i>
              <em>{v.name}</em>
            </button>
          );
        })}
      </div>
      <div className="tr-info" data-info={cur.id}>
        <div className="l">
          <b>{cur.name}{cur.level > 0 && cur.kind === 'scaled' ? ` Lv${cur.level}` : ''}</b>
          <p>{cur.desc}</p>
          {effectText(cur) && cur.kind === 'scaled' && <small>{effectText(cur)}</small>}
          {cur.level > 0 && !cur.picked && <small>지금은 짝 노드가 켜져 있다. 한 생에 둘 중 하나만.</small>}
          {msg && <small className="bad">{msg}</small>}
        </div>
        {cur.level > 0 && cur.pair && !cur.picked
          ? <button className="buy on" data-pick onClick={pick}><span>이번 생에 켠다</span></button>
          : cur.cost !== null
            ? <button className={'buy' + (cur.canBuy ? ' on' : '')} data-buy disabled={!cur.canBuy} onClick={buy}><span>{cur.level > 0 ? '키운다' : '연다'}</span><small>{cur.canBuy ? `황금 ${cur.cost}개` : cur.reason ?? ''}</small></button>
            : <span className="have">열림</span>}
      </div>
    </section>
  );
}

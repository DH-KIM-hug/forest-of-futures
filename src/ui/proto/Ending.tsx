import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { endingCardModel } from '../vm/records';
import { comma } from '../../engine/util';
import { lifeNo } from './model';
import { rebirthOverride } from './dev';
import { sprite, RETIRE_PHOTO, type SpriteId } from './sprites';
import { activeLevels, popRateAt, popRateCap, treeView, type NodeView } from '../../engine/skilltree';
import { flyIcons, reduced } from './fx';
import { later } from './audio';
import { nodeOdds, treeOddsLine } from './odds';
import { endingById, skillById, skillPathEndings } from '../../engine/data';
import { act1Text } from '../../engine/act1';
import { play } from './audio';
import { RankRebirth } from './RankingBoard';
import { closeBack } from '../../engine/futures';
import { marketById } from '../../engine/data';
import { isLite } from './config';
import { LiteEndingCard } from './lite/LiteEnding';

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
    // 라이트(docs/gdd/LITE_ENDINGS.md): 엔딩 40개 중 하나의 그림 카드
    if (isLite && g.pendingEnding?.lite) return <LiteEndingCard onNext={() => act({ type: 'estateNext' })} />;
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
          {/* 판에 걸려 있던 돈(U-56): 파산하면 폰째로 넘어가고 열린 판은 그대로 사라진다. 걸어 둔 돈과 그때의 값 */}
          {!retired && Object.keys(g.run.positions).length > 0 && (
            <div className="blk lockd" data-end-locked={Object.keys(g.run.positions).length}><h4>판에 걸려 있던 돈</h4>
              {Object.values(g.run.positions).map((p) => { const back = Math.max(0, Math.round(closeBack(p, g.run.prices[p.market] ?? p.entry))); return (
                <div key={p.market} className="sc"><span>{marketById[p.market]?.name ?? p.market} {p.dir === 1 ? '롱' : '숏'} {p.lev}배, 걸어 둔 {comma(p.margin0)}</span><b className="dn">그때 값 {comma(back)}</b></div>
              ); })}
              <p className="sub">압류 목록에는 없었다. 폰이 파산 서류에 올라가면서 판도 같이 사라졌다.</p>
            </div>
          )}
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
          <p>{isLite ? (retired ? '완납 영수증을 액자에 넣었는데, 눈을 뜨니 손에 오소리의 봉투가 있다. 폰에는 FRX. 장부에 다시 40만.' : '폰 화면이 꺼졌다가 켜진다. 손에 오소리의 봉투, 장부에 40만. 또 그 아침이다.') : retired ? '완납 영수증을 넣어 둔 주머니에서 엄마 집 열쇠가 나온다. 해가 지고 있다. 또 그날, 첫 주문을 날린 저녁이다. 오소리 장부에 다시 50만.' : '문턱에 짐차 바퀴 자국이 아직 젖어 있다. 손끝에 진흙이 묻는다. 또 그날, 첫 주문을 날린 저녁이다. 오소리 장부에 50만.'}</p>
        </div>
      </div>
      <div className="award" data-award={e.gold ?? 0}>
        <img className="coin art" data-art="goldcoin" src={sprite('goldcoin')!.src} alt="" />
        <span>지난 생에 갚은 원금 <b className="sm">{comma(repaid)}</b><br /><small>5만마다 황금 도토코인 하나{run.debts.shark1.principal <= 0 && repaid > 0 ? ', 완납 +2' : ''}</small></span>
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
  { id: 'C', name: '버티는 자', sub: '손실을 줄이고 오래 버틴다' },
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
  id === 'A3a' ? `+${Math.round(x)}초` : id === 'B2' ? `−${(x * 100).toFixed(2)}%p` : id === 'B3b' || id === 'B3a' ? `${(x * 100).toFixed(1)}%` : id === 'C4' ? `+${(x * 100).toFixed(1)}%p` : `−${(x * 100).toFixed(1)}%`;
/** 노드 효과 한 줄: 지금 → 다음 */
function effectText(v: NodeView): string {
  // 뿌리(U-50): 고비 보상이 먼저(판에서 보이는 것), 수수료 꼬리는 뒤에
  if (v.id === 'R') return `고비 보상 넣은 돈의 ${v.level > 0 ? pct(popRateAt(v.level)) : '없음'} → ${pct(popRateAt(v.level + 1))} (상한 ${pct(popRateCap())}). ${v.tail ? `10배 이하 수수료 ${v.level > 0 ? tailFmt(v.id, v.tail.now) : '0'}${v.tail.next !== null ? ` → ${tailFmt(v.id, v.tail.next)}` : ''}` : ''}`;
  if (v.tail) return `${v.tail.text} ${v.level > 0 ? `지금 ${tailFmt(v.id, v.tail.now)}` : '열면'}${v.tail.next !== null ? ` → ${tailFmt(v.id, v.tail.next)}` : ''}`;
  if (v.kind !== 'scaled') return v.level > 0 ? '열림' : '';
  const what = v.id === 'C2' ? '청산 때 돌려받는 증거금' : v.id === 'B1' ? '청산 직전 대신 넣어 주는 증거금' : '거래 수수료';
  const sign = v.id === 'C2' || v.id === 'B1' ? '' : '−';
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
  /** 레벨이 오른 순간(U-50): 열매가 터지고, 황금이 날아가 박히고, "Lv2 → Lv3"이 솟고, 효과 줄이 금빛으로 바뀐다 */
  const [up, setUp] = useState<{ k: number; id: string; from: number; to: number; was: string } | null>(null);
  const goldRef = useRef<HTMLSpanElement>(null);
  const buy = () => {
    const from = cur.level, was = effectText(cur);
    const fromRect = goldRef.current?.getBoundingClientRect() ?? null;
    const r = act({ type: 'treeBuy', id: cur.id });
    if (!r.ok) { play('insufficient'); setMsg(r.msg ?? '살 수 없다'); return; }
    setMsg(null);
    const id = cur.id;
    const toEl = document.querySelector(`[data-node="${id}"] i`);
    flyIcons(`<img src="${sprite('goldcoin')!.src}" width="20" height="20" alt="" style="border-radius:50%">`, fromRect, toEl?.getBoundingClientRect() ?? null, Math.min(6, 2 + from), { size: 20 });
    play('new_equipment');
    later(reduced() ? 0 : 520, () => { setUp((u) => ({ k: (u?.k ?? 0) + 1, id, from, to: from + 1, was })); play(from === 0 ? 'win_fanfare' : 'milestone_up'); if (from > 0) later(160, () => play('goal_complete')); });
  };
  useEffect(() => { if (!up) return; const t = window.setTimeout(() => setUp(null), 2600); return () => window.clearTimeout(t); }, [up?.k]);
  const pick = () => { const r = act({ type: 'treePick', id: cur.id }); if (r.ok) play('ui_tap'); };
  return (
    <section className="pr-tree" data-tree aria-label="스킬트리">
      <div className="tr-h"><b>거래의 나무</b><span className="gold" data-gold={gold} ref={goldRef}><img className="coin art" src={sprite('goldcoin')!.src} alt="" />{comma(gold)}개</span></div>
      <p className="tr-odds" data-tree-odds>{treeOddsLine(active)}</p>
      <div className="tr-paths">{PATHS.map((p) => <span key={p.id} className={'p-' + p.id}><b>{p.name}</b><small>{p.sub}</small></span>)}</div>
      <div className="tr-box">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {edges.map(([a, b]) => { const A = posOf(byId[a]), B = posOf(byId[b]); const on = byId[a].level > 0 && byId[b].level > 0; return <line key={a + b} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className={on ? 'on' : ''} vectorEffect="non-scaling-stroke" />; })}
        </svg>
        {nodes.map((v) => {
          const p = posOf(v);
          const cls = 'nd p-' + v.path + (v.level > 0 ? ' own' : '') + (v.canBuy ? ' can' : '') + (v.level > 0 && !v.picked ? ' off' : '') + (v.id === sel ? ' sel' : '') + (up?.id === v.id ? ' lvup' : '');
          return (
            <button key={v.id} className={cls} data-node={v.id} data-level={v.level} style={{ left: `${p.x}%`, top: `${p.y}%` }} onClick={() => { setSel(v.id); setMsg(null); setHint(null); play('ui_tap'); }}
              aria-label={`${v.name}${v.level > 0 ? ` 레벨 ${v.level}` : ' 잠김'}`}>
              <i key={up?.id === v.id ? 'u' + up.k : 'n'}>{v.level > 0 ? (v.kind === 'scaled' || v.tail ? v.level : '✓\uFE0E') : v.cost ?? ''}</i>
              <em>{v.name}</em>
              {up?.id === v.id && <span key={'f' + up.k} className="lvf" aria-hidden="true">{up.from === 0 ? '열림!' : `Lv${up.from} → ${up.to}`}</span>}
              {up?.id === v.id && !reduced() && <span key={'s' + up.k} className="spark" aria-hidden="true">{Array.from({ length: 8 }, (_, j) => <u key={j} style={{ ['--a' as string]: `${j * 45}deg` }} />)}</span>}
            </button>
          );
        })}
      </div>
      <div className="tr-info" data-info={cur.id}>
        <div className="l">
          <b>{cur.name}{cur.level > 0 && (cur.kind === 'scaled' || cur.tail) ? ` Lv${cur.level}` : ''}</b>
          <p>{cur.desc}</p>
          {effectText(cur) && (cur.kind === 'scaled' || cur.tail) && <small key={up?.id === cur.id ? 'e' + up.k : 'e'} className={up?.id === cur.id ? 'just' : ''} data-effect>{effectText(cur)}</small>}
          {up?.id === cur.id && <small className="lvnote" data-lvup={up.to} role="status">{up.from === 0 ? '다음 생부터 판에서 켜진다.' : `Lv${up.to}. 다음 생의 판이 이만큼 달라진다.`}</small>}
          {/* 이 노드가 예시 한 판(5만 200배, 익절 · 손절 ±15,500)을 얼마나 바꾸는가(U-42 ④): 수수료가 기울인 승률을 지금 → 다음 레벨로. 시세는 그대로다 */}
          {od && cur.cost !== null && <small className={'odds' + ((od.next.p ?? 0) < (od.now.p ?? 0) ? ' worse' : '')} data-odds={cur.id}>{od.text}</small>}
          {cur.level > 0 && !cur.picked && <small>짝 가지가 켜져 있다. 한 생에 하나만.</small>}
          {msg && <small className="bad">{msg}</small>}
        </div>
        {cur.level > 0 && cur.pair && !cur.picked
          ? <button className="buy on" data-pick onClick={pick}><span>이번 생에 켠다</span></button>
          : cur.cost !== null
            ? <button className={'buy' + (cur.canBuy ? ' on' : '')} data-buy disabled={!cur.canBuy} onClick={buy}><span>{cur.level > 0 ? '키운다' : '연다'}</span><small>{cur.canBuy ? `황금 도토코인 ${cur.cost}개` : cur.reason ?? ''}</small></button>
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

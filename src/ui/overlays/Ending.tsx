import { useGame } from '../../store/gameStore';
import { endingById, endingsMeta, marketById, houses } from '../../engine/data';
import { fmt } from '../common/format';

const CAT_COLOR: Record<string, string> = { 'CAT-A': '#c8d7e6', 'CAT-B': '#d8c8b0', 'CAT-C': '#e6c8d4', 'CAT-D': '#c8e0d2' };

export function EndingScreen() {
  const g = useGame((s) => s.g);
  const newLife = useGame((s) => s.newLife);
  const p = g.pending;
  if (!p) return null;
  const e = endingById[p.id];
  const cause = endingsMeta.causes[p.snapshot.cause] ?? p.snapshot.cause;
  const lastLev = p.lastLev;
  return (
    <div className="ending" role="alertdialog" aria-label="파산">
      <div className="static" aria-hidden="true" />
      <div className="stampbig">파산</div>
      <div className="fade">
        <div className="eno">{e.id} · {e.categoryName} · {cause}</div>
        <h1>{e.title}</h1>
        <div className="pic" style={{ background: CAT_COLOR[e.category] }}>{e.motif}</div>
        <div className="line">{e.line}</div>
      </div>
      <div className="fade2">
        <div className="state">
          현금 {fmt(p.cash)} · 총부채 {fmt(p.totalDebt)}<br />
          버틴 정산 {fmt(p.cycles)}회{lastLev ? ` · 마지막 배율 ${lastLev}배` : ''} · 집 {houses[p.snapshot.houseStage].name}
          {p.snapshot.lastMarket ? ` · ${marketById[p.snapshot.lastMarket]?.short ?? ''}` : ''}
        </div>
        <p style={{ margin: '10px 0 0', textAlign: 'center' }}>
          {p.isNew ? <span className="nb">새 엔딩</span> : <span>이미 수집({p.nth}번째)</span>}
          {p.via === 'pity' ? ' · 대용 조건으로 열림' : ''}
          {'  '}도감 {p.collected} / 200
        </p>
      </div>
      <button className="act fade2" onClick={newLife}>새 인생 시작</button>
    </div>
  );
}

import { useState } from 'react';
import { useGame } from '../../store/gameStore';
import { endings, endingsMeta } from '../../engine/data';

const CATS = [
  { id: 'all', name: '전체', n: 200 },
  ...Object.entries<any>(endingsMeta.categories).map(([id, c]) => ({ id, name: `${c.name} ${c.to - c.from + 1}`, n: c.to - c.from + 1 })),
];
const CAT_COLOR: Record<string, string> = { 'CAT-A': '#c8d7e6', 'CAT-B': '#d8c8b0', 'CAT-C': '#e6c8d4', 'CAT-D': '#c8e0d2' };

export function Archive() {
  const g = useGame((s) => s.g);
  const patch = useGame((s) => s.patchUi);
  const [cat, setCat] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = endings.filter((e) => cat === 'all' || e.category === cat);
  const total = Object.keys(g.encyclopedia).length;
  return (
    <div className="full" data-stage={g.run.houseStage} role="dialog" aria-label="마을 기록관">
      <header>
        <button onClick={() => patch({ overlay: null })} aria-label="뒤로 가기"><img src="/ui/icons/back.webp" alt="" width="34" height="34" draggable={false} /></button>
        <h2>마을 기록관 · {total} / 200</h2>
      </header>
      <div className="fchip-row">
        {CATS.map((c) => (
          <button key={c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}>{c.name}</button>
        ))}
      </div>
      <div className="scroll">
        {list.map((e) => {
          const got = g.encyclopedia[e.id];
          if (!got) {
            return (
              <div key={e.id} className="enc locked" style={{ border: '2px solid var(--line)' }}>
                <div className="no">{e.id} · ???</div>
                <div className="hn">{e.trigger.type === 'proxy' ? '대용 조건 · ' : ''}{e.hint}</div>
              </div>
            );
          }
          const open = openId === e.id;
          return (
            <button key={e.id} className="enc" onClick={() => setOpenId(open ? null : e.id)} aria-expanded={open}>
              <div className="no">{e.id} · {e.categoryName}</div>
              <div className="ti">{e.title}</div>
              <div className="hn">{e.line}</div>
              {open && (
                <div className="det">
                  <div className="art-ph" style={{ background: CAT_COLOR[e.category] }}>{e.motif}</div>
                  처음 얻은 날 {new Date(got.firstAt).toLocaleDateString('ko-KR')} · 얻은 횟수 {got.count}회<br />
                  그때의 상태: 현금 {Math.round(got.snapshot.cash ?? 0).toLocaleString('ko-KR')} · 총부채 {Math.round(got.snapshot.totalDebt ?? 0).toLocaleString('ko-KR')} · 버틴 정산 {got.snapshot.cycles ?? 0}회
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useGame } from '../../store/gameStore';
import { statementModel } from '../vm/records';
import { TreeView } from './Tree';
import { comma } from '../../engine/util';
import { legacy } from '../../engine/data';

/** 재산 명세서(8.8): '세월이 흘렀다…' 한 장 → 부모가 남긴 것 · 한 계산식 · 세 갈래 카드. 권유·시간 제한 없음. 고른 뒤(포기·한정승인·단순승인) 가문 특성 트리. */
export function EstateScreen() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const e = g.estate!;
  const [passed, setPassed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (e.step === 'tree') {
    return (
      <div className="full estate" role="dialog" aria-label="가문 특성">
        <header><h2>가문 특성</h2></header>
        <div className="scroll">
          <TreeView onNext={() => { const r = act({ type: 'nextGeneration' }); if (!r.ok) setErr(r.msg ?? '시작할 수 없습니다'); }} />
          {err && <p className="note bad">{err}</p>}
        </div>
      </div>
    );
  }
  const m = statementModel(g);
  if (!passed) {
    return (
      <button className="passage" onClick={() => setPassed(true)} aria-label="계속">
        <p>세월이 흘렀다…</p>
        <small>{e.maxim ?? ''}</small>
        <em>눌러서 넘기기</em>
      </button>
    );
  }
  return (
    <div className="full estate" role="dialog" aria-label="재산 명세서">
      <header><h2>재산 명세서</h2></header>
      <div className="scroll">
        <section className="ledger">
          <b>부모가 남긴 것</b>
          {m.parent.map((r) => <div key={r.label} className="row sb"><span className="sub">{r.label}</span><span className="v">{r.value}</span></div>)}
        </section>
        {m.formula && <p className="formula">{m.formula} <i>× 갈래</i></p>}
        <div className={'cards n' + m.cards.length}>
          {m.cards.map((c) => (
            <article key={c.branch} className={'bcard ' + c.branch}>
              <h3>{c.title}</h3>
              <p className="han">+{comma(c.han)}<small>{legacy.currency.name}</small></p>
              <dl>
                {c.lines.slice(1).map((l) => <div key={l.k}><dt>{l.k}</dt><dd>{l.v}</dd></div>)}
              </dl>
              {c.grudge.length > 0 && <p className="fine">원한 {c.grudge.length}곳</p>}
              <button className="act" onClick={() => { const r = act({ type: 'inherit', branch: c.branch as any }); if (!r.ok) setErr(r.msg ?? '고를 수 없습니다'); }}>{c.title}</button>
            </article>
          ))}
        </div>
        {err && <p className="note bad">{err}</p>}
      </div>
    </div>
  );
}

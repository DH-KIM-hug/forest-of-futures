import { useMemo } from 'react';
import { useGame } from '../../store/gameStore';
import { useUI } from '../uiStore';
import { awayModel } from '../vm/trade';
import { comma } from '../../engine/util';

/** 자리를 비운 사이 — 돌아오면 가장 먼저 뜬다(8.6). 위에 줄인 차트, 아래에 실제 시각 순서의 사실 문장. */
export function AwayOverlay() {
  const away = useGame((s) => s.net.away)!;
  const g = useGame((s) => s.g);
  const at = useUI((s) => s.awayAt);
  const dismiss = useUI((s) => s.dismissAway);
  const pos = away.openAtLeave[0]?.market ?? 'DTC';
  const closes = useMemo(() => (g.run.mkt.bars[pos] ?? []).map((b) => b.c), [g.run.mkt.bars, pos]);
  const m = awayModel(away, at, closes);
  const lo = Math.min(...closes, Infinity);
  const hi = Math.max(...closes, -Infinity);
  const pts = closes.map((c, i) => `${(i / Math.max(1, closes.length - 1)) * 100},${100 - ((c - lo) / Math.max(1e-9, hi - lo)) * 90 - 5}`).join(' ');
  return (
    <div className="away" role="dialog" aria-label="자리를 비운 사이">
      <h2>{m.title}</h2>
      <div className="mini" aria-label="비운 구간 차트">
        {closes.length > 1 ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={pts} fill="none" stroke="#7a9a6a" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            {m.marks.map((x, i) => <line key={i} x1={x * 100} x2={x * 100} y1="0" y2="100" stroke="#d93a26" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />)}
          </svg>
        ) : null}
      </div>
      <div className="rows">
        {m.openAtLeave.map((t, i) => <div key={'o' + i} className="r"><time>나감</time><span className="t">{t}를 걸어 두고 나감</span></div>)}
        {m.rows.length === 0 && m.openAtLeave.length === 0 && <div className="r"><span className="t">그동안 일어난 일이 없습니다.</span></div>}
        {m.rows.map((r, i) => (
          <div key={i} className={'r ' + r.tone}>
            <time>{r.time}</time>
            <span className="t">{r.text}{r.sinceLeave && <small>{r.sinceLeave}</small>}</span>
            {r.amount !== null && <span className="a">{r.amount >= 0 ? '+' : '−'}{comma(Math.abs(r.amount))}</span>}
          </div>
        ))}
      </div>
      {m.footer && <p className="foot">({m.footer})</p>}
      <button className="act" onClick={dismiss}>확인</button>
    </div>
  );
}

// 손맛(회차 7, U-48): 이긴 판이 터지는 화면. 시뮬레이션은 건드리지 않는다 — 이미 닫힌 판의 숫자를 크게 보여 줄 뿐이다.
//   등급(tension.ts winTier)은 넣은 돈에 견준 크기: 짭짤하다(+15%), 한 방(+50%), 두 배(+100%), 대박(+300%), 전설(+1000%)
//   도토리 비가 폰 화면 위에서 쏟아지고, 등급 글자가 찍히고, 딴 돈이 0에서 굴러 오르고, 주인공이 뛴다. 높은 등급은 금빛 살이 돈다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { comma } from '../../engine/util';
import { acornSvg } from './art';
import { sprite } from './sprites';
import { reduced } from './fx';
import type { WinTier } from './tension';

/** 0 → v 로 ms 동안 굴러 오른다(처음엔 빠르게, 끝에서 느리게) */
function useRollFromZero(v: number, ms: number): number {
  const [d, setD] = useState(() => (reduced() ? v : 0));
  const raf = useRef(0);
  useEffect(() => {
    if (reduced()) { setD(v); return; }
    const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / ms); setD(Math.round(v * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf.current = requestAnimationFrame(step); };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [v, ms]);
  return d;
}

export function WinBurst({ tier, pnl, margin, streak, lev, onDone }: { tier: WinTier; pnl: number; margin: number; streak: number; lev: number; onDone: () => void }) {
  const life = tier.lv >= 3 ? 3000 : tier.lv === 2 ? 2500 : 1800;
  useEffect(() => { const t = window.setTimeout(onDone, life); return () => window.clearTimeout(t); }, []);
  const shown = useRollFromZero(Math.round(pnl), tier.lv >= 3 ? 1100 : 800);
  // 도토리 비: 자리, 늦음, 크기, 돌기를 한 번만 뽑는다
  const rain = useMemo(() => Array.from({ length: reduced() ? 0 : tier.rain }, (_, i) => ({
    x: 4 + ((i * 37) % 92) + Math.random() * 4,
    d: Math.random() * (tier.lv >= 3 ? 0.9 : 0.5),
    s: 16 + Math.round(Math.random() * (tier.lv >= 3 ? 14 : 8)),
    r: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360),
    t: 1.25 + Math.random() * 0.7,
  })), []);
  const happy = sprite('heroHappy');
  const roe = (pnl / Math.max(1, margin)) * 100;
  return (
    <div className={'pr-burst lv' + tier.lv} data-burst={tier.lv} aria-live="polite" role="status" aria-label={`${tier.word}, +${comma(Math.round(pnl))} 도토리`}>
      {tier.lv >= 3 && <i className="rays" aria-hidden="true" />}
      <div className="rain" aria-hidden="true">
        {rain.map((a, i) => <span key={i} style={{ left: `${a.x}%`, width: a.s, height: a.s, animationDelay: `${a.d}s`, animationDuration: `${a.t}s`, ['--rot' as string]: `${a.r}deg` }} dangerouslySetInnerHTML={{ __html: acornSvg(a.s) }} />)}
      </div>
      <div className="core">
        <b className="word">{tier.word}{tier.lv >= 3 ? '!' : ''}</b>
        <b className="money">+{comma(shown)}</b>
        <small className="cap">넣은 돈 {comma(Math.round(margin))} → {comma(Math.round(margin + pnl))} <em>{roe >= 100 ? `${(1 + roe / 100).toFixed(1)}배` : `+${roe.toFixed(0)}%`}</em></small>
        {(streak >= 2 || lev >= 100) && (
          <span className="chips">
            {streak >= 2 && <i className="streak" data-streak={streak}>{streak}연승</i>}
            {lev >= 100 && <i className="lev">{lev}배</i>}
          </span>
        )}
      </div>
      {happy && tier.lv >= 2 && <img className="hop" src={happy.src} alt="" draggable={false} />}
    </div>
  );
}

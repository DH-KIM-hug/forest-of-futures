// 손맛(회차 7, U-48): 이긴 판이 터지는 화면. 시뮬레이션은 건드리지 않는다 — 이미 닫힌 판의 숫자를 크게 보여 줄 뿐이다.
//   등급(tension.ts winTier)은 넣은 돈에 견준 크기: 짭짤하다(+15%), 한 방(+50%), 두 배(+100%), 대박(+300%), 전설(+1000%)
//   도토리 비가 폰 화면 위에서 쏟아지고, 등급 글자가 찍히고, 딴 돈이 0에서 굴러 오르고, 주인공이 뛴다. 높은 등급은 금빛 살이 돈다.
//   U-49: 어느 탭에서든. 집에서 닫힌 익절도 같은 상자가 터지고, 도토리가 집 안으로 쏟아져 머리의 도토리 숫자로 날아가고, 햄스터들이 들썩인다.
//   들고 있는 동안의 고비 팝(+50%, 두 배!, 이자 한 번, 반 날아감, 살았다!)도 여기서 모든 포지션을 본다(거래소는 그 종목 것만, 집은 포지션 줄 위에).
import { useEffect, useMemo, useRef, useState } from 'react';
import { comma } from '../../engine/util';
import { acornSvg } from './art';
import { sprite } from './sprites';
import { flyAcorns, reduced } from './fx';
import { dangerOf, nextMilestone, type WinTier } from './tension';
import { useProto } from './protoStore';
import { useGame } from '../../store/gameStore';
import { balance } from '../../engine/data';
import { claim } from './model';
import { useOpenPositions } from './Lot';
import { coinLogo } from './coins';
import { play, later } from './audio';
import { pushPop, treePing } from './popBus';
import { popBonusAmt } from '../../engine/skilltree';

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

export function WinBurst({ tier, pnl, margin, streak, lev, onDone, name, dir, how, market, home, record, rankUp }: { tier: WinTier; pnl: number; margin: number; streak: number; lev: number; onDone: () => void; name?: string; dir?: 1 | -1; how?: 'tp' | 'close' | 'sl'; market?: string; home?: boolean; record?: boolean; rankUp?: string }) {
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
    <div className={'pr-burst lv' + tier.lv + (home ? ' home' : '')} data-burst={tier.lv} data-where={home ? 'home' : 'phone'} aria-live="polite" role="status" aria-label={`${tier.word}, +${comma(Math.round(pnl))} 도토리`}>
      {tier.lv >= 3 && <i className="rays" aria-hidden="true" />}
      <div className="rain" aria-hidden="true">
        {rain.map((a, i) => <span key={i} style={{ left: `${a.x}%`, width: a.s, height: a.s, animationDelay: `${a.d}s`, animationDuration: `${a.t}s`, ['--rot' as string]: `${a.r}deg` }} dangerouslySetInnerHTML={{ __html: acornSvg(a.s) }} />)}
      </div>
      <div className="core">
        {name && <small className="who">{market && coinLogo(market) && <img src={coinLogo(market)!} alt="" draggable={false} />}{name} {dir === 1 ? '롱' : '숏'} {lev}배{how === 'tp' ? ' 익절' : ''}</small>}
        <b className="word">{tier.word}{tier.lv >= 3 ? '!' : ''}</b>
        <b className="money">+{comma(shown)}</b>
        <small className="cap">넣은 돈 {comma(Math.round(margin))} → {comma(Math.round(margin + pnl))} <em>{roe >= 100 ? `${(1 + roe / 100).toFixed(1)}배` : `+${roe.toFixed(0)}%`}</em></small>
        {(streak >= 2 || lev >= 100 || record || rankUp) && (
          <span className="chips">
            {record && <i className="rec" data-record>이번 생 신기록</i>}
            {rankUp && <i className="rec rk" data-rankup>FRX {rankUp} 승급</i>}
            {streak >= 2 && <i className="streak" data-streak={streak}>{streak}연승</i>}
            {lev >= 100 && <i className="lev">{lev}배</i>}
          </span>
        )}
      </div>
      {happy && tier.lv >= 2 && <img className="hop" src={happy.src} alt="" draggable={false} />}
    </div>
  );
}

/** 집이나 지도에서 판이 크게 닫혔다(U-49): 같은 상자가 화면 가운데서 터지고, 도토리가 주인공에게서 머리의 도토리 숫자로 날아간다. 거래소에서는 Trade 가 그린다 */
export function HomeBurst() {
  const burst = useProto((s) => s.burst);
  const tab = useProto((s) => s.tab);
  const shown = useRef(0);
  useEffect(() => {
    if (!burst || tab === 'phone' || shown.current === burst.k) return;
    shown.current = burst.k;
    const n = Math.min(12, 4 + burst.tier.lv * 2);
    // 집이면 주인공에게서, 지도면 지도 위의 작은 주인공(내 집 팻말 옆)에게서(U-50). 화면 밖이면 터진 상자에서
    later(350, () => {
      const el = document.getElementById('pr-hero') ?? document.getElementById('pr-map-hero');
      let r = el?.getBoundingClientRect() ?? null;
      if (r && (r.bottom < 40 || r.top > window.innerHeight - 40)) r = null;
      flyAcorns(r ?? document.querySelector('.pr-burst .core')?.getBoundingClientRect() ?? null, n);
    });
  }, [burst?.k, tab]);
  if (!burst || tab === 'phone') return null;
  return <WinBurst key={burst.k} {...burst} home onDone={() => { if (useProto.getState().burst?.k === burst.k) useProto.getState().patch({ burst: null }); }} />;
}

// ── 들고 있는 동안의 고비(U-48 → U-49: 모든 포지션, 어느 탭에서든) ──
interface Mark { best: number; claim: boolean; half: boolean; peakDanger: number; saved: boolean }
const marks: Record<string, Mark> = {};
/** 틱마다 열린 포지션 전부를 보고, 새로 넘은 고비를 팝으로 띄운다(포지션마다 고비당 한 번). ProtoApp 에서 한 번 부른다 */
export function usePosPops(): void {
  const ps = useOpenPositions();
  const g = useGame((s) => s.g);
  const tut = useProto((s) => s.tutorial);
  useEffect(() => {
    if (tut !== 'done') return;
    const cl = claim(g).total;
    const maint = balance.trading.maintenanceRate as number;
    for (const p of ps) {
      const raw = g.run.positions[p.market];
      if (!raw) continue;
      const mk = (marks[p.market + ':' + raw.openTick] ??= { best: 0, claim: false, half: false, peakDanger: 0, saved: false });
      mk.peakDanger = Math.max(mk.peakDanger, dangerOf(p.liqDistPct, p.lev, maint));
      const ms = nextMilestone(mk.best, p.netRoe);
      if (ms) {
        mk.best = ms.at;
        // 고비 보상(나무 R, U-50): 엔진이 이 고비에 보상을 얹었으면 팝 둘째 줄에 적고, 도토리가 팝에서 머리의 숫자로 날아간다
        const bon = (raw.popBest ?? 0) >= ms.at ? popBonusAmt(g.run, raw.margin0) : 0;
        pushPop(ms.text, ms.at >= 100 ? 'gold' : 'up', p.market, () => { play('milestone_up'); if (ms.at >= 100) later(140, () => play('goal_complete')); if (bon > 0) later(260, () => play('buy')); }, bon > 0 ? `고비 보상 +${comma(bon)}` : undefined);
        if (bon > 0) { treePing('R', `고비 보상 +${comma(bon)}`); later(180, () => flyAcorns(document.querySelector('.pt-pops .pop:last-child')?.getBoundingClientRect() ?? null, 4)); }
        continue;
      }
      if (!mk.claim && cl > 0 && p.net >= cl) { mk.claim = true; pushPop(`이자 한 번 벌었다 +${comma(Math.round(cl))}`, 'up', p.market, () => play('buy')); continue; }
      // 청산 턱밑(들어간 거리의 70% 넘게 다가갔다)에서 본전 위로 돌아왔다: 한 번
      if (!mk.saved && mk.peakDanger >= 0.7 && p.net >= 0) { mk.saved = true; pushPop('살았다!', 'saved', p.market, () => play('saved_phew')); continue; }
      if (!mk.half && p.netRoe <= -50) { mk.half = true; pushPop('반 날아감', 'down', p.market); }
    }
  }, [g.run.tick, tut]);
}

/** 집이나 지도에서의 고비 팝(U-49): 세상 위, 주인공 머리 높이에 크게. 여러 종목을 들면 앞에 작은 로고 */
export function HomePops() {
  const tab = useProto((s) => s.tab);
  const pops = useProto((s) => s.pops);
  const many = useOpenPositions().length > 1;
  if (tab === 'phone' || !pops.length) return null;
  return (
    <div className="pt-pops home-pops" aria-live="polite">
      {pops.map((x) => <span key={x.k} className={'pop ' + x.cls + (x.sub ? ' has-sub' : '')} data-pop={x.cls}>{many && coinLogo(x.market) && <img src={coinLogo(x.market)!} alt="" draggable={false} />}{x.text}{x.sub && <small className="psub" data-pop-sub>{x.sub}</small>}</span>)}
    </div>
  );
}

/** 한 번 버티기(나무 B1)가 잡은 순간(U-50): 청산 도장이 찍힐 자리에 금빛 숨. 붉게 번지던 가장자리가 걷히고, "한 번 더 산다"가 찍히고, 오소리가 넣은 돈이 보인다.
 *  시세 · 청산 공식은 그대로다(엔진의 holdOnce 가 한 일을 크게 보여 줄 뿐) */
export function SecondWind() {
  const w = useProto((s) => s.wind);
  // 잡아 준 포지션이 끝내 닫혔으면(다음 틱에 청산 등) 바로 걷는다 — 청산 도장과 겹치지 않게
  const alive = useGame((s) => !!w && !!s.g.run.positions[w.market]);
  useEffect(() => { if (w && !alive) useProto.getState().patch({ wind: null }); }, [alive, w?.k]);
  useEffect(() => {
    if (!w) return;
    const t = window.setTimeout(() => { if (useProto.getState().wind?.k === w.k) useProto.getState().patch({ wind: null }); }, 2200);
    return () => window.clearTimeout(t);
  }, [w?.k]);
  if (!w) return null;
  return (
    <div key={w.k} className="pr-wind" data-wind={w.amount} role="status" aria-live="assertive" aria-label={`한 번 더 산다, 오소리 대부가 증거금 ${comma(w.amount)}을 넣었다`}>
      <i className="ring" aria-hidden="true" />
      <div className="stamp">한 번 더 산다</div>
      <b className="amt">오소리 대부 +{comma(w.amount)}</b>
      <p>{w.name} 청산가가 한 칸 물러났다. 정리할 때 돌려준다.</p>
    </div>
  );
}

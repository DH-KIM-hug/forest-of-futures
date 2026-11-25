import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { comma } from '../../engine/util';
import { walletValue } from '../../engine/selectors';
import { Art } from '../common/Art';
import { WHEEL_ART, NPC_ART, heroArt } from '../assets';
import { anyOverdue, heroPose, standingCreditors, stageModel, visitModel } from '../vm/village';
import { useUI } from '../uiStore';

const GLYPH: Record<string, string> = { acorn: '●', night: '☾', paw: '✿', neat: '■' };
interface Float { id: number; x: number; text: string }

/** 화면 아래 일터 무대. 0단계는 줍기, 1단계부터는 종목 쳇바퀴가 나란히. 누르는 곳은 무대 전체. */
export function Stage() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const open = useUI((s) => s.open);
  const sheet = useUI((s) => s.sheet);
  const run = g.run;
  const m = stageModel(g);
  const [floats, setFloats] = useState<Float[]>([]);
  const [tapping, setTapping] = useState(false);
  const [joy, setJoy] = useState(false);
  const seq = useRef(0);
  const tapTimer = useRef<number | undefined>(undefined);
  const lastStamps = useRef<number>(run.stats.stamps ?? 0);

  const nearLiq = Object.values(run.positions).some((p) => p.marginCalled);
  const pose = heroPose({
    over: run.over, overdueNear: anyOverdue(g), nearLiq, tapping, stage: m.stage, flashJoy: joy, greedy: false,
  });

  useEffect(() => {
    const now = run.stats.stamps ?? 0;
    if (now > lastStamps.current) {
      setJoy(true);
      const t = window.setTimeout(() => setJoy(false), 1500);
      lastStamps.current = now;
      return () => window.clearTimeout(t);
    }
    lastStamps.current = now;
  }, [run.stats.stamps]);

  const doTap = useCallback((coin?: string, x = 50) => {
    const before = useGame.getState().g.run;
    const b = before.cash + walletValue(before);
    if (coin && before.riding !== coin) act({ type: 'ride', coin: coin as any });
    const res = act({ type: 'tap' });
    if (!res.ok) return;
    const after = useGame.getState().g.run;
    const gain = Math.max(0, Math.round(after.cash + walletValue(after) - b));
    const id = ++seq.current;
    setFloats((f) => [...f.slice(-5), { id, x, text: `+${comma(gain)}` }]);
    window.setTimeout(() => setFloats((f) => f.filter((q) => q.id !== id)), 850);
    setTapping(true);
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => setTapping(false), 280);
  }, [act]);

  const visit = visitModel(g);
  const standing = standingCreditors(g);
  const hasWheels = m.stage >= 1;

  return (
    <div className={'stage s' + m.stage} data-n={m.wheels.length} aria-label="일터">
      <div className="ground" />
      {m.stage === 0 && (
        <button className="stage-tap" aria-label="도토리 줍기" onPointerDown={(e) => { e.preventDefault(); doTap(undefined, 50); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doTap(); } }}>
          {[8, 22, 36, 66, 80, 91].map((l, i) => <i key={i} className="ac" style={{ left: l + '%', bottom: 8 + (i % 3) * 10 }} />)}
          {m.acornTaps < 2 && <><i className="finger" aria-hidden="true" /><span className="finger-note">여기를 눌러 줍기</span></>}
          <Art id={heroArt(pose === 'idle' && !tapping ? 'pick' : pose)} className={'hero' + (tapping ? ' bn' : '')} alt="칩멍크" />
        </button>
      )}
      {hasWheels && (
        <div className="wheels">
          {m.wheels.map((wl, i) => (
            <button
              key={wl.coin}
              className={'wheel' + (wl.riding ? ' riding' : '') + (wl.on ? '' : ' off') + (wl.reverse ? ' rev' : '')}
              style={{ ['--wc' as any]: wl.color }}
              onPointerDown={(e) => { e.preventDefault(); doTap(wl.coin, ((i + 0.5) / m.wheels.length) * 100); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doTap(wl.coin); } }}
              aria-label={`${wl.name}${wl.riding ? ' 타는 중' : ''}${wl.reverse ? ' 역마진' : ''}${wl.on ? '' : ' 꺼짐'}`}
              aria-pressed={wl.riding}
            >
              <span className="wsign"><b>{GLYPH[wl.sign] ?? '●'}</b> {wl.short}</span>
              <Art id={WHEEL_ART[wl.coin]} className="wimg" label={wl.short} />
              {wl.riding && <Art id={heroArt(pose === 'idle' || pose === 'pick' ? 'run' : pose)} className={'hero in' + (tapping ? ' spin' : '')} alt="칩멍크" />}
              {wl.units > 0 && <span className="wunits">설비 {wl.units}{wl.riding && m.props[0] ? ` · ${m.props[0]}` : ''}</span>}
              {wl.reverse && <span className="rev-sticker">역마진</span>}
              {wl.tagBy && <span className="gar-tag">가압류</span>}
              {!wl.on && <span className="off-tag">꺼짐</span>}
            </button>
          ))}
        </div>
      )}
      {floats.map((f) => <span key={f.id} className="float" style={{ left: f.x + '%', bottom: '58%' }}>{f.text}</span>)}
      {m.stage === 0 && <span className="sign-note">{m.signUp ? "'쳇바퀴 팝니다'" : `줍기 ${m.acornTaps}/${m.acornNeed}`}</span>}
      {m.offer && (
        <button className="act offer" disabled={!m.offer.canBuy} onClick={() => act({ type: 'buyWheel', coin: m.offer!.coin })}>
          도토코인 쳇바퀴 {comma(m.offer.cost)}
          {!m.offer.canBuy && m.offer.reason && <small>{m.offer.reason}</small>}
        </button>
      )}
      {standing.map((id, i) => (
        <button key={id} className="standing" style={{ right: 8 + i * 58 }} onClick={() => open({ k: 'lender', id })} aria-label={`${id === 'shark1' ? '오소리' : '독사'}가 일터 앞에 서 있습니다`}>
          <Art id={NPC_ART[id]} />
        </button>
      ))}
      {visit && sheet === null && (
        <button className="visitor" onClick={() => open({ k: 'visit' })} aria-label={`${visit.name}의 방문`}>
          <Art id={NPC_ART[visit.by] ?? 'npc_weasel'} /><i>!</i>
        </button>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { lenderById, T } from '../../engine/data';
import { friendsDebt, isShark2Unlocked, currentJob, posRoe } from '../../engine/selectors';
import { limitOf } from '../../engine/settlement';
import { short } from '../common/format';
import { WorkStage, LenderSheet, FriendsSheet, HomeSheet, LockedSheet } from './Panels';
import { heroPose, HERO_POSES } from './heroPose';
import type { RunState } from '../../engine/types';

const HOUSE_IMG = ['0_tent', '1_cabin', '2_warehouse', '3_villa', '4_mansion'];
function art(id: string, run: RunState, open: boolean): string {
  if (id === 'home') return `house_${HOUSE_IMG[run.houseStage] ?? HOUSE_IMG[0]}`;
  if (id === 'work') return run.jobId === 'pickup' || run.jobId === 'flyer' ? 'bld_work_street' : 'bld_work_shop';
  if (id === 'shark2') return open ? 'bld_shark2_open' : 'bld_shark2_locked';
  return `bld_${id}`;
}

interface B { id: string; name: string; x: number; y: number }
// bg_village.webp 의 빈 터 9곳(가로 18/50.5/83%, 발밑 세로 36/51.5/67%)에 맞춘 좌표(장면 대비 %)
const COL = [17.5, 50.5, 83];
const ROW = [36.4, 51.6, 67.2];
const LAYOUT: B[] = [
  { id: 'bank', name: '숲속중앙조합', x: COL[0], y: ROW[0] },
  { id: 'capital', name: '황금저축·캐피탈', x: COL[1], y: ROW[0] },
  { id: 'board', name: '광장 전광판', x: COL[2], y: ROW[0] },
  { id: 'archive', name: '마을 기록관', x: COL[0], y: ROW[1] },
  { id: 'home', name: '내 집', x: COL[1], y: ROW[1] },
  { id: 'friends', name: '친구네 골목', x: COL[2], y: ROW[1] },
  { id: 'shark1', name: '오소리 대부', x: COL[0], y: ROW[2] },
  { id: 'work', name: '일터', x: COL[1], y: ROW[2] },
  { id: 'shark2', name: '독사 골목', x: COL[2], y: ROW[2] },
];

function badge(run: RunState, id: string): { debt: string | null; od: string | null } {
  if (id === 'friends') {
    const d = friendsDebt(run);
    return { debt: d > 0 ? short(d) : null, od: null };
  }
  if (id in lenderById) {
    const d = run.debts[id as 'bank'];
    const st = run.streak[id as 'bank'];
    return { debt: d > 0 ? short(d) : null, od: st > 0 ? `연체 ${st}/${limitOf(id)}` : null };
  }
  if (id === 'home' && run.streak.upkeep > 0) return { debt: null, od: `연체 ${run.streak.upkeep}/${limitOf('upkeep')}` };
  return { debt: null, od: null };
}

export function Village() {
  const g = useGame((s) => s.g);
  const go = useGame((s) => s.go);
  const digest = useGame((s) => s.ui.digest);
  const patch = useGame((s) => s.patchUi);
  const run = g.run;
  const loc = run.view.location;
  const open = isShark2Unlocked(run);
  // 기록관·전광판은 건물로 가면 바로 열린다. 예전 저장의 location 값은 일터로 본다.
  const where = loc === 'archive' || loc === 'board' ? 'work' : loc;
  const [hop, setHop] = useState(0);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    HERO_POSES.forEach((p) => { new Image().src = `/art/hero_${p}.webp`; });
  }, []);
  const lastTaps = useRef(run.stats.laborTaps);
  useEffect(() => {
    if (run.stats.laborTaps !== lastTaps.current) {
      lastTaps.current = run.stats.laborTaps;
      setHop((h) => h + 1);
      setWorking(true);
      const t = setTimeout(() => setWorking(false), 300);
      return () => clearTimeout(t);
    }
  }, [run.stats.laborTaps]);
  const pose = heroPose({
    over: run.over,
    anyOverdue: Object.values(run.streak).some((v) => v > 0),
    nearLiq: Object.values(run.positions).some((p) => posRoe(p, run.markets[p.market].price) <= T.marginCallRoe),
    tick: run.tick,
    tradeFlash: run.tradeFlash,
    stampFlash: run.stampFlash,
    workHop: working,
  });

  const job = currentJob(run);
  const atWork = where === 'work';
  const here = LAYOUT.find((b) => b.id === where) ?? LAYOUT[7];
  const onClick = (id: string) => {
    if (id === 'archive' || id === 'board') patch({ overlay: id });
    else go({ location: id });
  };
  const hasNews = !!(run.ticker && run.tick - run.ticker.tick < 14);

  let sheet = null;
  if (!atWork) {
    if (where === 'home') sheet = <HomeSheet />;
    else if (where === 'friends') sheet = <FriendsSheet />;
    else if (where === 'shark2' && !open) sheet = <LockedSheet />;
    else sheet = <LenderSheet id={where as 'bank'} />;
  }

  return (
    <div className="scene" data-stage={run.houseStage} role="group" aria-label="마을">
      <img className="scene-bg" src="/ui/bg_village.webp" alt="" draggable={false} />
      {LAYOUT.map((b) => {
        const { debt, od } = badge(run, b.id);
        const dark = b.id === 'shark2' && !open;
        const label = b.id === 'work' ? job.name : dark ? '어두운 골목' : b.name;
        const nm = b.id === 'archive' ? `${label} ${Object.keys(g.encyclopedia).length}/200` : label;
        return (
          <button
            key={b.id}
            className={'bld ' + b.id + (where === b.id ? ' sel' : '') + (dark ? ' dark' : '')}
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
            onClick={() => onClick(b.id)}
            aria-label={`${nm}${debt ? ` 원금 ${debt}` : ''}${od ? ` ${od}` : ''}`}
            aria-pressed={where === b.id}
          >
            <span className="art">
              <img src={`/art/${art(b.id, run, open)}.webp`} alt="" draggable={false} />
            </span>
            <span className="nm">
              {nm}
              {debt && <span className="d">{debt}</span>}
            </span>
            {od && (
              <span className="od">
                <img src="/ui/icons/overdue.webp" alt="" />
                <b>{od}</b>
              </span>
            )}
          </button>
        );
      })}

      <WorkStage onWork={() => { if (!atWork) go({ location: 'work' }); }} />

      <div
        className={'hero' + (atWork ? ' stage' : '')}
        style={atWork
          ? { left: '36%', top: 'calc(100% - var(--tab-h) - 10px)' }
          : { left: `${here.x - 11}%`, top: `${here.y + 1.2}%`, ['--hhw' as any]: '60px' }}
      >
        <img key={hop} className={hop ? 'bn' : ''} src={`/art/hero_${pose}.webp`} alt={g.settings.name} />
      </div>

      {digest && (
        <button className={'digest' + (hasNews ? ' hasnews' : '')} onClick={() => patch({ digest: null })} aria-label="자리를 비운 사이 요약 닫기">
          자리를 비운 사이 — 정산 {digest.cycles}회, 급여 +{digest.wage.toLocaleString('ko-KR')}, 이자 -{digest.interest.toLocaleString('ko-KR')}
          {digest.notes.length ? `, ${digest.notes.join(', ')}` : ''}
        </button>
      )}
      {sheet}
    </div>
  );
}

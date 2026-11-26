// 집 탭 위 세상(U-29): 지붕을 걷은 단칸 오두막 안. 아이소 마름모 바닥 + 뒤쪽 벽 둘. 처음엔 엄마의 쳇바퀴 하나뿐이고,
// 쳇바퀴를 놓고 알바를 부를수록 방이 찬다. 좌표는 390×432 캔버스(아래 맞춤). HUD 가 위를 덮으므로 중요한 것은 y 200 아래.
// 바닥 칸 좌표: 뒤 모서리 (195,212) 에서 오른쪽 앞으로 i, 왼쪽 앞으로 j (한 칸 = 20×10). 바닥은 10×10 칸.
import { useRef, useState, type ReactNode } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { comma } from '../../engine/util';
import { C, O, Dia, Cube, Poly, Wheel, Hamster, Badger, Spiky, Round, Device, dk } from './art';
import { useFx, flyAcorns, flyIcons, coinSvg, tintAt, useClock } from './fx';
import { sellFeeRate } from '../../engine/mining';
import { houseDefs } from '../../engine/data';
import heroFront from './img/hero_front.png';
import heroSide from './img/hero_side.png';
import { COLLECTOR_NAME } from './text';
import { EXTRA_WHEEL } from './model';

type Item = { y: number; key: string; node: ReactNode };
type Pt = [number, number];
const F = (i: number, j: number): Pt => [195 + 20 * (i - j), 212 + 10 * (i + j)];
/** 오른쪽 벽 위의 점: t = 뒤 모서리에서 오른쪽 모서리까지 0..1, u = 바닥에서 높이 */
const RW = (t: number, u: number): Pt => [195 + 200 * t, 212 + 100 * t - u];
const LW = (t: number, u: number): Pt => [195 - 200 * t, 212 + 100 * t - u];
/** 더 놓는 쳇바퀴 다섯 자리(뒤에서 앞으로). 첫 쳇바퀴는 가운데 앞. */
const EXTRA_SLOTS: Pt[] = [F(7.4, 2.6), F(2.6, 7.4), F(4.6, 4.2), F(9.2, 5.2), F(5.2, 9.2)];
const WALLS = ['#D9B98A', '#C9955C', '#C08A55', '#B98552', '#A9785A'];
const FLOORS = ['#E3C9A0', '#E3C08D', '#DDB67F', '#E6C795', '#EBD2A2'];

/** 벽 판자 줄과 바닥 널 줄(얇은 선). 빈 방이 덜 밋밋하게 */
function Planks({ wall }: { wall: string }) {
  const lines: ReactNode[] = [];
  for (const u of [50, 100]) {
    lines.push(<path key={'l' + u} d={`M${LW(1, u)} L${LW(0, u)}`} stroke={dk(wall, 0.8)} strokeWidth={1.6} opacity={0.5} />);
    lines.push(<path key={'r' + u} d={`M${RW(0, u)} L${RW(1, u)}`} stroke={dk(wall, 0.7)} strokeWidth={1.6} opacity={0.5} />);
  }
  for (const k of [2, 4, 6, 8]) lines.push(<path key={'f' + k} d={`M${F(k, 0)} L${F(k, 10)}`} stroke={O} strokeWidth={1.4} opacity={0.14} />);
  return <g>{lines}</g>;
}

export function World({ near }: { near: boolean }) {
  const g = useGame((s) => s.g);
  const tapping = useProto((s) => s.tapping);
  const collector = useProto((s) => s.collector);
  const waiting = useProto((s) => s.waiting);
  const run = g.run;
  const now = useClock();
  const tint = tintAt(now);
  const heroRef = useRef<SVGGElement>(null);
  const [floats, setFloats] = useState<{ id: number; t: string; x: number; y: number; cls: string }[]>([]);
  const [tapKey, setTapKey] = useState(0);
  const idRef = useRef(0);

  const first = run.coinWheels.DTC;
  const extras = run.equipment.filter((u) => u.tier === EXTRA_WHEEL);
  const phone = run.futures.open;
  // 카메라: 방이 비었을 때는 쳇바퀴 가까이, 찰수록 물러난다. 아래(발밑 줄)는 고정하고 위로 키운다.
  const cam = extras.length === 0 ? { z: 1.08, fx: 197 } : { z: 1, fx: 195 };

  // 주인공: 첫 쳇바퀴를 알바가 돌리면 옆에 서서 민다. 아니면 쳇바퀴 안. 청산이 가까우면 폰만 본다.
  const [wx, wy] = F(8.6, 8.0);
  const inWheel = !!first && !first.staffed && !near;
  const hx = inWheel ? wx : wx - 46;
  const hy = inWheel ? wy - 20 : wy + 8;
  const hh = inWheel ? 40 : 54;
  const pose = near ? heroSide : inWheel ? heroSide : heroFront;
  const heroCls = near ? ' stare' : tapping ? (inWheel ? ' run' : ' squash') : ' idle';

  const addFloat = (t: string, x: number, y: number, cls = '') => {
    const id = ++idRef.current;
    setFloats((f) => [...f.slice(-6), { id, t, x, y, cls }]);
    window.setTimeout(() => setFloats((f) => f.filter((q) => q.id !== id)), 900);
  };
  useFx((e) => {
    if (e.kind === 'tap') {
      setTapKey((k) => k + 1);
      // 쳇바퀴 → 콜드월렛으로 코인이 날아가고, 바로 팔기면 지갑 → 도토리 숫자로 도토리가 날아간다
      const wal = document.getElementById('pr-wallet-dev')?.getBoundingClientRect() ?? null;
      flyIcons(coinSvg(16), document.getElementById('pr-wheel1')?.getBoundingClientRect() ?? null, wal, 1, { onEnd: () => { if (e.sold) flyAcorns(wal, 1); } });
      addFloat(e.gain, wx + (Math.random() - 0.5) * 16, wy - 86, e.sold ? '' : 'coin');
    } else if (e.kind === 'settle') {
      // 정산: 알바가 돌린 모든 쳇바퀴에서 코인이 전선을 타고 지갑으로
      const wal = document.getElementById('pr-wallet-dev')?.getBoundingClientRect() ?? null;
      const whs = Array.from(document.querySelectorAll('.pr-whfx.on'));
      whs.forEach((el, i) => flyIcons(coinSvg(16), el.getBoundingClientRect(), wal, 2, { delay: i * 90 }));
      if (e.sold) {
        window.setTimeout(() => {
          addFloat(`+${comma(Math.round(e.mined * (1 - sellFeeRate(useGame.getState().g.run))))}`, wx - 60, wy - 40);
          flyAcorns(document.getElementById('pr-wallet-dev')?.getBoundingClientRect() ?? null, 4);
        }, 650 + whs.length * 90);
      }
    } else if (e.kind === 'buy') {
      if (e.price > 0) addFloat(`−${comma(e.price)}`, 230, 250, 'neg');
    }
  });

  const lv = Math.min(run.house, 4);
  const wall = WALLS[lv], floor = FLOORS[lv];
  const items: Item[] = [];
  // 엄마가 쓰던 이불 한 채(방에 남은 것은 이것과 쳇바퀴뿐)
  { const [x, y] = F(1.4, 4.6); items.push({ y, key: 'bed', node: <g><Cube cx={x} cy={y} hw={26} h={5} fill="#EFE3CC" /><Cube cx={x - 12} cy={y - 11} hw={9} h={5} fill="#F6EEDD" /></g> }); }
  // 환생한 만큼 창턱에 돌이 쌓인다
  const stones = Math.max(1, Math.min(4, g.family.generation - 1));
  // 첫 쳇바퀴(엄마의 쳇바퀴)
  if (first) {
    const spin = !near && (first.staffed || tapping);
    items.push({ y: wy, key: 'w1', node: (
      <g className="pa-pop">
        <Dia cx={wx} cy={wy + 18} hw={44} fill={dk(floor, 0.9)} sw={2} />
        <g id="pr-wheel1" className={'pr-whfx' + (first.staffed ? ' on' : '')}><Wheel cx={wx} cy={wy} w={72} col={C.dtc} spin={spin} /></g>
        {first.staffed && <Hamster cx={wx} cy={wy - 20} h={24} run={!near} />}
        {first.tagBy && <g transform={`rotate(-8 ${wx + 26} ${wy - 62})`}><rect x={wx + 8} y={wy - 74} width={38} height={22} rx={3} fill={C.red} stroke={O} strokeWidth={2} /><text x={wx + 27} y={wy - 58} textAnchor="middle" fontSize={12} fontWeight={800} fill="#fff">딱지</text></g>}
      </g>
    ) });
  }
  // 콜드월렛(작은 받침 위) + 전선
  if (first) {
    const [dx, dy] = F(7.2, 9.4);
    items.push({ y: dy + 6, key: 'dev', node: (
      <g className="pr-wal-hit" role="button" tabIndex={0} aria-label="콜드월렛 열기" onClick={() => useProto.getState().patch({ wallet: true })} onKeyDown={(e) => { if (e.key === 'Enter') useProto.getState().patch({ wallet: true }); }}>
        <circle cx={dx} cy={dy - 12} r={24} fill="transparent" />
        <Cube cx={dx} cy={dy + 4} hw={10} h={9} fill={C.wall} /><g id="pr-wallet-dev"><Device x={dx} y={dy - 18} k={0.75} /></g>
      </g>
    ) });
    const live = !near && (first.staffed || tapping || extras.some((u) => u.staffed));
    items.push({ y: wy - 30, key: 'wire', node: <path d={`M${wx - 26} ${wy + 6} Q${wx - 44} ${wy + 22} ${dx + 8} ${dy - 2}`} fill="none" stroke={live ? '#E8B830' : '#8A8378'} strokeWidth={3} strokeLinecap="round" className={live ? 'pa-flow' : undefined} strokeDasharray={live ? '6 7' : undefined} /> });
  }
  // 더 놓은 쳇바퀴: 알바가 있으면 돌고, 없으면 서 있다
  extras.slice(0, EXTRA_SLOTS.length).forEach((u, i) => {
    const [x, y] = EXTRA_SLOTS[i];
    const col = [C.mdt, C.bth, C.sms, C.cream, C.mint][i];
    items.push({ y, key: u.uid, node: (
      <g className="pa-pop" data-wheel={u.staffed ? 'run' : 'idle'}>
        <Dia cx={x} cy={y + 14} hw={30} fill={dk(floor, 0.9)} sw={2} />
        <g className={'pr-whfx' + (u.staffed ? ' on' : '')} opacity={u.staffed ? 1 : 0.72}><Wheel cx={x} cy={y} w={52} col={col} spin={!!u.staffed && !near} /></g>
        {u.staffed ? <Hamster cx={x} cy={y - 14} h={20} run={!near} /> : <text x={x} y={y - 60} textAnchor="middle" fontSize={11} fontWeight={800} fill="#6B4A35" className="pa-t pa-lbl">알바 없음</text>}
        {u.tagBy && <rect x={x + 6} y={y - 52} width={16} height={12} rx={2} fill={C.red} stroke={O} strokeWidth={1.6} />}
      </g>
    ) });
  });
  // 주인공
  if (first || near) items.push({ y: inWheel ? wy + 0.5 : wy + 12, key: 'hero', node: (
    <g ref={heroRef} id="pr-hero">
      {!inWheel && <ellipse cx={hx} cy={hy + 1} rx={19} ry={5} fill="#000" opacity={0.13} />}
      <g key={`t${tapping ? tapKey : 0}`} className={'pa-hero' + heroCls} style={{ transformOrigin: `${hx}px ${hy}px` }}>
        <image href={pose} x={hx - hh * 0.52} y={hy - hh} width={hh * 1.04} height={hh} />
      </g>
      {phone && !inWheel && <g transform={`translate(${hx + 20} ${hy - 22})`}><rect x={-5} y={-9} width={10} height={17} rx={2.5} fill={C.mint} stroke={O} strokeWidth={1.8} /><path d="M3 8 l4 5" stroke={O} strokeWidth={1.2} /><circle cx={8} cy={14} r={2.6} fill="#C2413B" stroke={O} strokeWidth={1} /></g>}
      {near && <path className="pa-sweat" d={`M${hx - 20} ${hy - hh + 8} q-5 8 0 11 q5 -3 0 -11z`} fill="#BFE3F2" stroke={O} strokeWidth={1.6} />}
    </g>
  ) });
  else items.push({ y: wy + 12, key: 'hero', node: <g id="pr-hero"><ellipse cx={wx} cy={wy + 1} rx={19} ry={5} fill="#000" opacity={0.13} /><image href={heroFront} x={wx - 28} y={wy - 54} width={56} height={54} /></g> });
  // 추심원: 문으로 들어와 문 앞에 선다. 기다리는 동안에도 서 있다. 이자 막대가 정산 상환액만큼 깎인다.
  const [cx0, cy0] = F(4.2, 9.6);
  if (waiting) {
    items.push({ y: cy0, key: 'colwait', node: <g className="pa-walkin"><Badger cx={cx0} cy={cy0} h={50} /><g transform={`translate(${cx0 - 34} ${cy0 - 64})`}><rect x={-6} y={-18} width={80} height={18} rx={9} fill={O} /><text x={34} y={-5} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{COLLECTOR_NAME}</text></g></g> });
  } else if (collector && collector.interest > 0) {
    const left = collector.overdue ? 1 - collector.fill : 0;
    items.push({ y: cy0, key: `col${collector.at}`, node: (
      <g key={`col${collector.at}`} className="pa-walkin">
        <Badger cx={cx0} cy={cy0} h={50} />
        <g transform={`translate(${cx0 - 34} ${cy0 - 68})`}>
          <rect x={-6} y={-40} width={80} height={18} rx={9} fill={O} />
          <text x={34} y={-27} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{COLLECTOR_NAME}</text>
          <text x={34} y={-6} textAnchor="middle" fontSize={12} fill="#B8432C" className="pa-t pa-lbl">이자 {comma(collector.interest)}</text>
          <rect x={0} y={0} width={68} height={11} rx={5.5} fill="#fff" stroke={O} strokeWidth={2} />
          <rect className="pa-cut" x={2} y={2} width={64} height={7} rx={3.5} fill={C.red} style={{ ['--left' as string]: left }} />
        </g>
      </g>
    ) });
  }
  items.sort((a, b) => a.y - b.y);
  const houseName = houseDefs[run.house]?.name ?? '빈 오두막';
  const H = 150;

  return (
    <div className={'pr-world room' + (near ? ' near' : '') + (tint.night ? ' night' : '')} aria-label={houseName} role="img">
      <div className="pr-place" aria-hidden="true">{houseName}</div>
      <svg viewBox="0 0 390 432" preserveAspectRatio="xMidYMax slice" className="pr-world-svg">
        <g className="pr-cam" style={{ transform: `translate(195px, 432px) scale(${cam.z}) translate(${-cam.fx}px, -432px)` }}>
          <rect x={-100} y={-300} width={590} height={800} className="pr-out" />
          {/* 뒤쪽 벽 둘 + 바닥 */}
          <Poly p={[LW(1, 0), LW(0, 0), LW(0, H), LW(1, H)]} fill={wall} />
          <Poly p={[RW(0, 0), RW(1, 0), RW(1, H), RW(0, H)]} fill={dk(wall, 0.88)} />
          <Dia cx={195} cy={412} hw={200} fill={floor} />
          <Planks wall={wall} />
          {/* 왼쪽 벽: 문(바깥쪽에 딱지가 붙어 있다) */}
          <Poly p={[LW(0.86, 0), LW(0.66, 0), LW(0.66, 96), LW(0.86, 96)]} fill="#8E6540" sw={2.4} />
          <circle cx={LW(0.7, 46)[0]} cy={LW(0.7, 46)[1]} r={3.2} fill={C.gold} stroke={O} strokeWidth={1.6} />
          {run.house <= 0 && <g transform={`rotate(-27 ${LW(0.76, 66)[0]} ${LW(0.76, 66)[1]})`}><rect x={LW(0.76, 66)[0] - 15} y={LW(0.76, 66)[1] - 9} width={30} height={18} rx={2} fill={C.red} stroke={O} strokeWidth={1.8} /><text x={LW(0.76, 66)[0]} y={LW(0.76, 66)[1] + 4.5} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">딱지</text></g>}
          {/* 왼쪽 벽: 가구가 실려 간 자국 */}
          <Poly p={[LW(0.44, 34), LW(0.2, 34), LW(0.2, 92), LW(0.44, 92)]} fill="none" sw={1.8} dash="5 6" />
          {/* 오른쪽 벽: 창 + 창턱의 돌 */}
          <Poly p={[RW(0.3, 56), RW(0.56, 56), RW(0.56, 112), RW(0.3, 112)]} fill="#CFE6EE" sw={2.4} />
          <path className="pr-win-night" d={`M${RW(0.3, 56)} L${RW(0.56, 56)} L${RW(0.56, 112)} L${RW(0.3, 112)}z`} fill="#33406A" />
          <path d={`M${RW(0.43, 56)} L${RW(0.43, 112)} M${RW(0.3, 84)} L${RW(0.56, 84)}`} stroke={O} strokeWidth={2} />
          <Poly p={[RW(0.27, 52), RW(0.59, 52), RW(0.59, 46), RW(0.27, 46)]} fill={dk(wall, 0.7)} sw={2} />
          {Array.from({ length: stones }, (_, i) => <ellipse key={i} cx={RW(0.5, 0)[0]} cy={RW(0.5, 57 + i * 7)[1]} rx={8 - i * 1.4} ry={4.2} fill={C.stone} stroke={O} strokeWidth={1.8} />)}
          {/* 오른쪽 벽: 빈 못 하나 */}
          <circle cx={RW(0.8, 96)[0]} cy={RW(0.8, 96)[1]} r={2.4} fill={O} />
          {items.map((it) => <g key={it.key}>{it.node}</g>)}
          {!waiting && collector && collector.interest > 0 && (
            collector.overdue
              ? <Spiky key={`sb${collector.at}`} x={cx0 + 14} y={cy0 - 122} w={168} h={30} text="이자가 모자라요오. 연체." tail={6} />
              : <Round key={`rb${collector.at}`} x={cx0 + 14} y={cy0 - 122} w={176} h={28} text={`이자 ${comma(collector.interest)} 수납 완료요오~`} tail={6} />
          )}
          {waiting && <Round x={cx0 + 14} y={cy0 - 100} w={150} h={28} text="사무소로 오세요오." tail={6} />}
          {floats.map((f) => <text key={f.id} x={f.x} y={f.y} textAnchor="middle" className={'pa-float ' + f.cls}>{f.t}</text>)}
        </g>
      </svg>
      <div className="pr-tint" style={{ background: tint.color, opacity: tint.op }} />
      {near && <div className="pr-gloom" />}
    </div>
  );
}

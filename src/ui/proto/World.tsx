// 공터 위 세상(§3.1~3.3): 아이소 마름모 공터. 물건은 진행에 따라 생기고, 생길 때 0.6배에서 넘쳐 자리 잡는다.
// 좌표는 390×400 캔버스(아래 맞춤). HUD 가 위를 덮으므로 중요한 것은 y 200 아래에 둔다.
import { useRef, useState, type ReactNode } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { ownedCoins } from '../../engine/selectors';
import { comma } from '../../engine/util';
import { C, O, Dia, Cube, Room, Tent, Tree, Wheel, Hamster, Badger, Spiky, Round, Device } from './art';
import { useFx, flyAcorns, tintAt, useClock } from './fx';
import heroFront from './img/hero_front.png';
import heroSide from './img/hero_side.png';
import { COLLECTOR_NAME } from './text';

type Item = { y: number; key: string; node: ReactNode };
const WHEEL2_SLOTS: [number, number, number, string][] = [[278, 336, 56, C.mdt], [150, 330, 54, C.bth], [328, 364, 50, C.sms]];
const HELPER_SLOTS: [number, number][] = [[262, 388], [296, 380], [236, 398]];

function House({ lv }: { lv: number }) {
  const x = 92, y = 354;
  if (lv <= 0) return <Tent cx={x} cy={y} s={0.8} />;
  const hw = [0, 56, 62, 66, 72][Math.min(lv, 4)], h = [0, 34, 40, 46, 52][Math.min(lv, 4)];
  const wall = ['', C.wall, '#C08A55', '#B98552', '#A9785A'][Math.min(lv, 4)];
  return (
    <Room cx={x} cy={y} hw={hw} h={h} wall={wall}>
      <Cube cx={x - hw * 0.35} cy={y - hw * 0.45} hw={13} h={7} fill="#F1E6D0" />
      <Cube cx={x + hw * 0.2} cy={y - hw * 0.6} hw={10} h={12} fill="#B98552" />
      {lv >= 3 && <Cube cx={x + hw * 0.45} cy={y - hw * 0.3} hw={9} h={8} fill="#8FB8B0" />}
      {/* 창의 불(저녁·밤에만 켜진다) */}
      <rect className="pa-window" x={x - hw * 0.55} y={y - hw * 0.5 - h * 0.85} width={12} height={10} rx={2} fill="#F8D978" stroke={O} strokeWidth={1.8} />
    </Room>
  );
}

export function World({ near }: { near: boolean }) {
  const g = useGame((s) => s.g);
  const tapping = useProto((s) => s.tapping);
  const collector = useProto((s) => s.collector);
  const run = g.run;
  const now = useClock();
  const tint = tintAt(now);
  const heroRef = useRef<SVGGElement>(null);
  const [floats, setFloats] = useState<{ id: number; t: string; x: number; y: number; cls: string }[]>([]);
  const [tapKey, setTapKey] = useState(0);
  const idRef = useRef(0);

  const wheels = ownedCoins(run).length;
  const eq: Record<string, number> = {};
  for (const u of run.equipment) eq[u.tier] = (eq[u.tier] ?? 0) + 1;
  const running = wheels > 0 && !tapping && !near;
  // 카메라(§3.3): 지을수록 물러난다. 아래(발밑 줄)는 고정하고 위로 키운다.
  const cam = wheels === 0 ? { z: 1.3, fx: 178 } : run.equipment.length <= 1 ? { z: 1.14, fx: 190 } : { z: 1, fx: 195 };

  // 주인공 자리와 자세
  const onPile = wheels === 0;
  const hx = near ? 178 : onPile ? 207 : running ? 214 : 178;
  const hy = near ? 400 : onPile ? 366 : running ? 340 : 400;
  const hh = running ? 40 : 58;
  const pose = near || running ? heroSide : heroFront;

  const addFloat = (t: string, x: number, y: number, cls = '') => {
    const id = ++idRef.current;
    setFloats((f) => [...f.slice(-6), { id, t, x, y, cls }]);
    window.setTimeout(() => setFloats((f) => f.filter((q) => q.id !== id)), 900);
  };
  useFx((e) => {
    if (e.kind === 'tap') {
      setTapKey((k) => k + 1);
      addFloat(e.gain, hx + (Math.random() - 0.5) * 18, hy - hh - 8);
      flyAcorns(heroRef.current?.getBoundingClientRect() ?? null, 2 + (idRef.current % 2));
    } else if (e.kind === 'buy') {
      addFloat(`−${comma(e.price)}`, 230, 250, 'neg');
    }
  });

  const items: Item[] = [];
  items.push({ y: 354, key: 'house', node: <g key={`house${run.house}`} className="pa-pop"><House lv={run.house} /></g> });
  items.push({ y: 374, key: 'mail', node: <g><Cube cx={34} cy={376} hw={5} h={22} fill={C.wall} /><Cube cx={34} cy={354} hw={9} h={9} fill="#D0A06A" /></g> });
  items.push({ y: 290, key: 'oak', node: <Tree cx={322} cy={292} r={46} h={58} /> });
  const stones = Math.max(1, Math.min(4, g.family.generation));
  items.push({ y: 338, key: 'cairn', node: <g>{Array.from({ length: stones }, (_, i) => <Cube key={i} cx={366} cy={340 - i * 8} hw={11 - i * 2} h={8} fill={C.stone} />)}</g> });
  if (onPile) {
    items.push({ y: 372, key: 'pile', node: (
      <g key={tapKey} className={tapKey ? 'pa-jiggle' : ''} style={{ transformOrigin: '207px 372px' }}>
        <Dia cx={207} cy={384} hw={44} fill="#C9A46A" />
        {[[190, 362], [214, 368], [228, 356], [200, 350], [222, 343]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={5} ry={6} fill={C.dtc} stroke={O} strokeWidth={2} />)}
      </g>
    ) });
  }
  if (wheels > 0) {
    items.push({ y: 358, key: 'w1', node: <g className="pa-pop"><Dia cx={214} cy={378} hw={44} fill={C.dirt} sw={2} /><Wheel cx={214} cy={360} w={72} col={C.dtc} spin={running} /></g> });
    items.push({ y: 394, key: 'dev', node: <g className="pa-pop"><Cube cx={128} cy={396} hw={10} h={10} fill={C.wall} /><Device x={128} y={374} k={0.75} /></g> });
    // 쳇바퀴 → 콜드월렛 전선: 돌 때 전기가 흘러 들어간다
    items.push({ y: 340, key: 'wire', node: <path d="M190 372 Q160 396 138 388" fill="none" stroke={running ? '#E8B830' : '#8A8378'} strokeWidth={3} strokeLinecap="round" className={running ? 'pa-flow' : undefined} strokeDasharray={running ? '6 7' : undefined} /> });
  }
  for (let i = 0; i < Math.min(eq.wheel2 ?? 0, 3); i++) {
    const [x, y, w, col] = WHEEL2_SLOTS[i];
    items.push({ y, key: `w2${i}`, node: <g className="pa-pop"><Dia cx={x} cy={y + 16} hw={w * 0.55} fill={C.dirt} sw={2} /><Wheel cx={x} cy={y} w={w} col={col} spin={running} /></g> });
  }
  for (let i = 0; i < Math.min(eq.helper ?? 0, 3); i++) {
    const [x, y] = HELPER_SLOTS[i];
    // 알바 햄스터는 저마다 작은 쳇바퀴 안에서 달린다(equipment.json helper: "알바 햄스터가 옆 쳇바퀴를 돌린다")
    const w = 42, wy = y - w * 0.56;
    items.push({ y, key: `h${i}`, node: <g className="pa-pop"><Dia cx={x} cy={y + 12} hw={w * 0.55} fill={C.dirt} sw={2} /><Wheel cx={x} cy={y} w={w} col={C.cream} spin={!near} /><Hamster cx={x} cy={wy + w * 0.3} h={20} run={!near} /></g> });
  }
  if (eq.row) items.push({ y: 266, key: 'row', node: <g className="pa-pop"><Dia cx={206} cy={276} hw={42} fill={C.dirt} sw={2} />{[180, 206, 232].map((x, i) => <Wheel key={x} cx={x} cy={262 + (i === 1 ? 4 : 0)} w={28} col={[C.dtc, C.bth, C.mdt][i]} spin={running} />)}</g> });
  if (eq.generator) items.push({ y: 398, key: 'gen', node: <g className="pa-pop"><Cube cx={336} cy={404} hw={12} h={16} fill="#A9A39A" /><path d="M338 366 l-6 9 h6 l-3 8 l8 -11 h-6 l3 -6z" fill={C.mdt} stroke={O} strokeWidth={1.6} strokeLinejoin="round" /></g> });
  if (eq.shed) items.push({ y: 372, key: 'shed', node: <g className="pa-pop"><Room cx={350} cy={374} hw={26} h={18} wall="#B98552" /></g> });
  if (eq.powerroom) items.push({ y: 270, key: 'pw', node: <g className="pa-pop"><Cube cx={262} cy={272} hw={16} h={26} fill="#8FB8B0" /></g> });
  if (eq.farm) items.push({ y: 262, key: 'farm', node: <g className="pa-pop"><Room cx={140} cy={266} hw={34} h={22} wall="#B98552" floor={C.dirt} /></g> });
  // 주인공
  items.push({ y: running ? 362 : onPile ? 390 : hy + 0.5, key: 'hero', node: (
    <g ref={heroRef} id="pr-hero">
      {!running && <ellipse cx={hx} cy={hy + 1} rx={20} ry={5} fill="#000" opacity={0.13} />}
      <g key={`t${tapKey}`} className={'pa-hero' + (tapping && tapKey ? ' squash' : '') + (near ? ' stare' : running ? ' run' : ' idle')} style={{ transformOrigin: `${hx}px ${hy}px` }}>
        <image href={pose} x={hx - hh * 0.52} y={hy - hh} width={hh * 1.04} height={hh} />
      </g>
      {near && <path className="pa-sweat" d={`M${hx - 20} ${hy - hh + 8} q-5 8 0 11 q5 -3 0 -11z`} fill="#BFE3F2" stroke={O} strokeWidth={1.6} />}
    </g>
  ) });
  // 추심원(§3.7): 길목에서 걸어 들어와 집 앞에 선다. 이자 막대가 정산 상환액만큼 깎인다.
  if (collector && collector.interest > 0) {
    const left = collector.overdue ? 1 - collector.fill : 0;
    items.push({ y: 399, key: `col${collector.at}`, node: (
      <g key={`col${collector.at}`} className="pa-walkin">
        <Badger cx={44} cy={398} h={48} />
        <g transform="translate(10 330)">
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

  return (
    <div className={'pr-world' + (near ? ' near' : '') + (tint.night ? ' night' : '')} aria-label="공터" role="img">
      <svg viewBox="0 0 390 432" preserveAspectRatio="xMidYMax slice" className="pr-world-svg">
        <g className="pr-cam" style={{ transform: `translate(195px, 432px) scale(${cam.z}) translate(${-cam.fx}px, -432px)` }}>
        <rect x={-100} y={-300} width={590} height={700} fill={C.grass} />
        {/* 숲 뒤 두 겹 */}
        {[-1, 0, 1, 2, 3, 4, 5, 6].map((i) => <circle key={'b' + i} cx={i * 62 + 10} cy={96 + Math.abs(i - 2.5) * 8} r={44} fill={C.forest1} stroke={O} strokeWidth={2.5} />)}
        {[-1, 0, 1, 2, 3, 4, 5, 6].map((i) => (
          <g key={'f' + i}>
            <circle cx={i * 70} cy={186 + Math.abs(i - 2.5) * 8} r={38} fill={C.forest1} stroke={O} strokeWidth={2.5} />
            <circle cx={i * 70 + 34} cy={164 + Math.abs(i - 2.5) * 8} r={32} fill={C.forest2} stroke={O} strokeWidth={2.5} />
          </g>
        ))}
        <Dia cx={195} cy={412} hw={200} fill={C.lot} dash="2 9" />
        <path d="M-20 400 L30 360 L70 372 L36 410z" fill={C.dirt} />
        {items.map((it) => <g key={it.key}>{it.node}</g>)}
        {collector && collector.interest > 0 && (
          collector.overdue
            ? <Spiky key={`sb${collector.at}`} x={96} y={262} w={168} h={30} text={`연체다. 장부에 적어 두지.`} tail={6} />
            : <Round key={`rb${collector.at}`} x={96} y={262} w={150} h={28} text="이번 회차 수납 완료~" tail={6} />
        )}
        {floats.map((f) => <text key={f.id} x={f.x} y={f.y} textAnchor="middle" className={'pa-float ' + f.cls}>{f.t}</text>)}
        </g>
        {tint.night && !near && [[60, 250], [150, 230], [250, 300], [340, 250]].map(([x, y], i) => <circle key={i} className="pa-firefly" cx={x} cy={y} r={2.6} fill="#FFF4A8" style={{ animationDelay: `${i * 0.7}s` }} />)}
      </svg>
      <div className="pr-tint" style={{ background: tint.color, opacity: tint.op }} />
      {near && <div className="pr-gloom" />}
    </div>
  );
}

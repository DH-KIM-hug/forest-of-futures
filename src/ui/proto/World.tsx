// 집 탭의 세상(U-33·U-34): 나무 밑동 집 그림(sprites.ts 'home') 한 장을 화면 너비에 맞춰 깔고, 그 위에 쳇바퀴·알바·주인공·손님을 그림 좌표로 얹는다.
// 자리와 구도는 home.ts(WHEEL_SLOTS·homeCam). 좌표는 그림 픽셀(992×1586)로 적고, SVG 는 390 너비 단위로 그린다(선 굵기·글자 크기가 예전 그대로).
// 접힌 판일 때 쳇바퀴(와 주인공)를 누르면 굴린다. 새 그림이 없는 것(알바·추심원·콜드월렛)은 예전 SVG 로 그린다.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { comma } from '../../engine/util';
import { C, O, Hamster, Badger, Spiky, Round, Device, Zap } from './art';
import { SvgSay } from './speech';
import { useFx, flyAcorns, flyIcons, coinSvg, tintAt, useClock } from './fx';
import { sellFeeRate } from '../../engine/mining';
import { houseDefs } from '../../engine/data';
import { COLLECTOR_NAME } from './text';
import { EXTRA_WHEEL } from './model';
import { HOME_IMG, WHEEL_SLOTS, WHEEL_BOX, WHEEL_FACE, FLOOR_PATCH, HERO_SPOT, HERO_H, VISITOR_SPOT, WALLET_SPOT, TAP_AREA, assignSlots, homeCam, type Pt } from './home';
import { HOME_BY_LEVEL, sprite, spriteOr } from './sprites';

/** 그림 픽셀 → SVG 단위(390 너비) */
const K = 390 / HOME_IMG.w;
const VB_H = HOME_IMG.h * K;
const at = (p: Pt): Pt => [p[0] * K, p[1] * K];
const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
/** 굴려 본 횟수가 이만큼 되기 전에는 쳇바퀴 위에 "쳇바퀴를 톡톡"을 띄운다 */
export const TAP_HINT_TAPS = 8;

type Item = { y: number; key: string; node: ReactNode };

/** 쳇바퀴 한 대: 그림 + (돌면) 앞면을 도는 줄과 번개 + (알바가 있으면) 햄스터. foot = 발밑(SVG 단위) */
function WheelAt({ foot, spin, staffed, tagged, label, bump, id, pop }: { foot: Pt; spin: boolean; staffed: boolean; tagged: boolean; label?: string; bump?: number; id?: string; pop?: boolean }) {
  const [x, y] = foot;
  const img = sprite('wheel')!;
  const ham = sprite('hamster');
  const cx = x + WHEEL_FACE.dx * K, cy = y + WHEEL_FACE.dy * K;
  return (
    <g className={pop ? 'pa-pop' : undefined} data-wheel={staffed ? 'run' : 'idle'}>
      <ellipse cx={x + 6} cy={y - 3} rx={WHEEL_BOX.w * K * 0.5} ry={8} fill="#5A3A1E" opacity={0.16} />
      <g key={bump ?? 0} className={bump ? 'pa-thump' : undefined} style={{ transformOrigin: `${x}px ${y}px` }}>
        <g id={id} className={'pr-whfx' + (staffed ? ' on' : '')}>
          <image href={img.src} x={x + WHEEL_BOX.dx * K} y={y + WHEEL_BOX.dy * K} width={WHEEL_BOX.w * K} height={WHEEL_BOX.h * K} />
        </g>
        {/* 도는 표시: 앞면 타원 안에서 밝은 호 셋이 돈다 */}
        <g transform={`translate(${cx} ${cy}) rotate(${WHEEL_FACE.tilt}) scale(${WHEEL_FACE.rx * K} ${WHEEL_FACE.ry * K})`} className={'pr-turn' + (spin ? ' on' : '')} aria-hidden="true">
          <g className="arcs">
            {[0, 120, 240].map((a) => <path key={a} transform={`rotate(${a})`} d="M0.78 0 A0.78 0.78 0 0 1 0.39 0.675" fill="none" stroke="#FFF6DC" strokeWidth={2.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
          </g>
        </g>
        {staffed && (ham ? <image className={spin ? 'pa-hop' : undefined} href={ham.src} x={cx + 2 - 12 * (ham.w / ham.h)} y={cy - 7} width={24 * (ham.w / ham.h)} height={24} /> : <Hamster cx={cx + 2} cy={cy + 17} h={24} run={spin} />)}
      </g>
      {spin && <Zap cx={cx + 22} cy={cy - 26} s={1.1} />}
      {spin && <Zap cx={cx - 24} cy={cy - 12} s={0.85} delay={0.45} />}
      {tagged && <g transform={`rotate(-8 ${x + 22} ${y - 58})`}><rect x={x + 6} y={y - 68} width={34} height={19} rx={3} fill={C.red} stroke={O} strokeWidth={2} /><text x={x + 23} y={y - 54} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">딱지</text></g>}
      {label && <text x={cx} y={y + WHEEL_BOX.dy * K - 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#6B4A35" className="pa-t pa-lbl">{label}</text>}
    </g>
  );
}

export function World({ near, cover, open, onRoll }: { near: boolean; /** 아래 판이 덮는 높이(px) */ cover: number; /** 판이 펴져 있다(빈 자리 표시를 보여 준다) */ open: boolean; onRoll: () => void }) {
  const g = useGame((s) => s.g);
  const tapping = useProto((s) => s.tapping);
  const collector = useProto((s) => s.collector);
  const waiting = useProto((s) => s.waiting);
  const slotOf = useProto((s) => s.slotOf);
  const slotHi = useProto((s) => s.slotHi);
  const talking = useProto((s) => s.scenes.length > 0);
  const run = g.run;
  const now = useClock();
  const tint = tintAt(now);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 390, h: 690, hud: 180 });
  const [floats, setFloats] = useState<{ id: number; t: string; x: number; y: number; cls: string }[]>([]);
  const [tapKey, setTapKey] = useState(0);
  const idRef = useRef(0);

  // 세상 칸과 HUD 의 크기를 잰다(구도 계산에 쓴다)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const hud = document.querySelector<HTMLElement>('.pr-hud');
    const measure = () => setBox((o) => { const n = { w: el.clientWidth, h: el.clientHeight, hud: hud?.offsetHeight ?? 0 }; return o.w === n.w && o.h === n.h && o.hud === n.hud ? o : n; });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (hud) ro.observe(hud);
    return () => ro.disconnect();
  }, []);
  const cam = homeCam({ ...box, cover });

  const first = run.coinWheels.DTC;
  const extras = run.equipment.filter((u) => u.tier === EXTRA_WHEEL);
  const seat = assignSlots(extras.map((u) => u.uid), slotOf);
  const [wx, wy] = at(WHEEL_SLOTS[0]);
  const [hx, hy] = at(HERO_SPOT);
  const hh = HERO_H * K;
  const heroImg = (near ? spriteOr('heroNear', 'hero') : tapping ? spriteOr('heroRun', 'hero') : sprite('hero'))!;
  const hw = hh * (heroImg.w / heroImg.h);
  const heroCls = near ? ' stare' : tapping ? ' squash' : ' idle';

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
      addFloat(e.gain, wx + 30 + (Math.random() - 0.5) * 14, wy - 62, e.sold ? '' : 'coin');
    } else if (e.kind === 'settle') {
      // 정산: 알바가 돌린 모든 쳇바퀴에서 코인이 지갑으로
      const wal = document.getElementById('pr-wallet-dev')?.getBoundingClientRect() ?? null;
      const whs = Array.from(document.querySelectorAll('.pr-whfx.on'));
      whs.forEach((el, i) => flyIcons(coinSvg(16), el.getBoundingClientRect(), wal, 2, { delay: i * 90 }));
      if (e.sold) {
        window.setTimeout(() => {
          addFloat(`+${comma(Math.round(e.mined * (1 - sellFeeRate(useGame.getState().g.run))))}`, hx, hy - hh - 10);
          flyAcorns(document.getElementById('pr-wallet-dev')?.getBoundingClientRect() ?? null, 4);
        }, 650 + whs.length * 90);
      }
    } else if (e.kind === 'buy') {
      if (e.price > 0) addFloat(`−${comma(e.price)}`, 195, at([0, 990])[1], 'neg');
    }
  });

  const items: Item[] = [];
  // 엄마의 쳇바퀴(자리 0): 그림 속 쳇바퀴는 바닥 조각으로 덮고, 같은 그림을 그 자리에 얹는다(눌리면 들썩이고, 실려 가면 없다)
  if (first) {
    const spin = !near && (!!first.staffed || tapping);
    items.push({ y: wy, key: 'w0', node: <WheelAt foot={[wx, wy]} id="pr-wheel1" spin={spin} staffed={!!first.staffed} tagged={!!first.tagBy} bump={first.staffed ? 0 : tapKey} /> });
  }
  // 더 놓은 쳇바퀴(자리 1~5): 알바가 있으면 돌고, 없으면 서 있다
  for (let s = 1; s < WHEEL_SLOTS.length; s++) {
    const u = extras.find((x) => x.uid === seat[s]);
    const foot = at(WHEEL_SLOTS[s]);
    if (u) items.push({ y: foot[1], key: u.uid, node: <WheelAt foot={foot} pop spin={!!u.staffed && !near} staffed={!!u.staffed} tagged={!!u.tagBy} label={u.staffed ? undefined : '알바 없음'} /> });
  }
  // 콜드월렛(작은 상자 위) + 쳇바퀴에서 오는 전선
  if (first) {
    const [dx, dy] = at(WALLET_SPOT);
    const live = !near && (!!first.staffed || tapping || extras.some((u) => u.staffed));
    // 전선: 쳇바퀴 받침 → 바닥 → 상자 모서리를 타고 올라 → 기기
    const w1 = at([WHEEL_SLOTS[0][0] + 62, WHEEL_SLOTS[0][1] - 10]), w2 = at([690, 1046]), w3 = at([690, 994]);
    items.push({ y: wy - 1, key: 'wire', node: <path d={`M${w1} Q${(w1[0] + w2[0]) / 2} ${w2[1] + 9} ${w2} L${w3} L${dx - 9} ${dy - 3}`} fill="none" stroke={live ? '#E8B830' : '#7A6A58'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={live ? 'pa-flow' : undefined} strokeDasharray={live ? '6 7' : undefined} /> });
    items.push({ y: dy + 30, key: 'dev', node: (
      <g className="pr-wal-hit" role="button" tabIndex={0} aria-label="콜드월렛 열기" onClick={() => useProto.getState().patch({ wallet: true })} onKeyDown={(e) => { if (e.key === 'Enter') useProto.getState().patch({ wallet: true }); }}>
        <circle cx={dx} cy={dy - 10} r={24} fill="transparent" />
        <ellipse cx={dx} cy={dy + 2} rx={10} ry={4} fill="#5A3A1E" opacity={0.18} />
        <g id="pr-wallet-dev">{sprite('wallet') ? <image href={sprite('wallet')!.src} x={dx - 11} y={dy - 28} width={22} height={30} /> : <Device x={dx} y={dy - 14} k={0.8} />}</g>
      </g>
    ) });
  }
  // 주인공: 엄마의 쳇바퀴 옆에 서 있다. 굴리면 움찔, 청산이 가까우면 폰만 본다.
  items.push({ y: hy, key: 'hero', node: (
    <g id="pr-hero">
      <ellipse cx={hx + 1} cy={hy - 1} rx={hw * 0.42} ry={4.5} fill="#5A3A1E" opacity={0.2} />
      <g key={`t${tapping ? tapKey : 0}`} className={'pa-hero' + heroCls} style={{ transformOrigin: `${hx}px ${hy}px` }}>
        <image href={heroImg.src} x={hx - hw / 2} y={hy - hh} width={hw} height={hh} />
      </g>
      {near && <path className="pa-sweat" d={`M${hx - 16} ${hy - hh + 6} q-5 8 0 11 q5 -3 0 -11z`} fill="#BFE3F2" stroke={O} strokeWidth={1.6} />}
    </g>
  ) });
  // 추심원: 뒷벽 둥근 문으로 들어와 문 앞에 선다. 기다리는 동안에도 서 있다. 이자 막대가 정산 상환액만큼 깎인다.
  const [cx0, cy0] = at(VISITOR_SPOT);
  const colImg = sprite('collector');
  const col = colImg ? <image href={colImg.src} x={cx0 - 26 * (colImg.w / colImg.h)} y={cy0 - 52} width={52 * (colImg.w / colImg.h)} height={52} /> : <Badger cx={cx0} cy={cy0} h={52} />;
  if (waiting) {
    items.push({ y: cy0, key: 'colwait', node: <g className="pa-walkin door">{col}<g transform={`translate(${cx0 - 40} ${cy0 - 60})`}><rect x={0} y={-18} width={80} height={18} rx={9} fill={O} /><text x={40} y={-5} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{COLLECTOR_NAME}</text></g></g> });
  } else if (collector && collector.interest > 0) {
    const left = collector.overdue ? 1 - collector.fill : 0;
    items.push({ y: cy0, key: `col${collector.at}`, node: (
      <g key={`col${collector.at}`} className="pa-walkin door">
        {col}
        <g transform={`translate(${cx0 - 34} ${cy0 - 70})`}>
          <text x={34} y={-6} textAnchor="middle" fontSize={12} fill="#B8432C" className="pa-t pa-lbl">이자 {comma(collector.interest)}</text>
          <rect x={0} y={0} width={68} height={11} rx={5.5} fill="#fff" stroke={O} strokeWidth={2} />
          <rect className="pa-cut" x={2} y={2} width={64} height={7} rx={3.5} fill={C.red} style={{ ['--left' as string]: left }} />
        </g>
      </g>
    ) });
  }
  items.sort((a, b) => a.y - b.y);

  const houseName = houseDefs[run.house]?.name ?? '빈 오두막';
  const home = HOME_BY_LEVEL[Math.min(run.house, HOME_BY_LEVEL.length - 1)] ?? sprite('home')!;
  const patch = sprite('floorPatch')!;
  const taps = run.stats.laborTaps ?? 0;
  const hint = !!first && !first.staffed && !waiting && !open && !near && !talking && taps < TAP_HINT_TAPS;
  /** 말풍선: 손님 머리 위, 화면 오른쪽을 넘지 않게 */
  const bubble = (w: number): { x: number; tail: number } => { const x = Math.max(6, Math.min(cx0 - 20, 384 - w)); return { x, tail: Math.max(8, Math.min(w - 26, cx0 - x - 4)) }; };
  /** 바닥의 자리 표시(타원): 판이 펴져 있으면 빈 자리, 방금 누른 칸이면 밝게 */
  const spots = WHEEL_SLOTS.map((p, s) => {
    const filled = s === 0 ? !!first : !!seat[s];
    const hi = slotHi === s;
    if (!hi && (filled || !open)) return null;
    const [x, y] = at(p);
    return (
      <g key={s} className={'pr-spotmark' + (hi ? ' hi' : '')} data-slotmark={s}>
        <ellipse cx={x} cy={y - 7} rx={30} ry={13} />
        {!filled && <text x={x} y={y - 2} textAnchor="middle" fontSize={15} className="pa-t">+</text>}
      </g>
    );
  });

  return (
    <div ref={ref} className={'pr-world home' + (near ? ' near' : '') + (tint.night ? ' night' : '')} aria-label={houseName} role="img">
      <div className="pr-stage" style={{ height: cam.imgH, transform: `translate3d(0, ${cam.top}px, 0)` }} data-cam={cam.top}>
        <img className="bg" src={home.src} alt="" draggable={false} />
        <button className="pr-wheel-hit" data-tap data-hl="wheel" onPointerDown={onRoll} aria-label={first ? '쳇바퀴 굴리기 (코인 채굴)' : '쳇바퀴가 없다'}
          style={{ left: pct(TAP_AREA[0], HOME_IMG.w), top: pct(TAP_AREA[1], HOME_IMG.h), width: pct(TAP_AREA[2], HOME_IMG.w), height: pct(TAP_AREA[3], HOME_IMG.h) }} />
        <svg className="fg" viewBox={`0 0 390 ${VB_H.toFixed(2)}`} preserveAspectRatio="none">
          <image href={patch.src} x={FLOOR_PATCH[0] * K} y={FLOOR_PATCH[1] * K} width={FLOOR_PATCH[2] * K} height={FLOOR_PATCH[3] * K} />
          {spots}
          {items.map((it) => <g key={it.key}>{it.node}</g>)}
          {!waiting && collector && collector.interest > 0 && (
            collector.overdue
              ? <Spiky key={`sb${collector.at}`} {...bubble(168)} y={cy0 - 126} w={168} h={30} text={<SvgSay who="collector" text="이자가 모자라요오. 연체." delay={0.9} mute={talking} />} />
              : <Round key={`rb${collector.at}`} {...bubble(176)} y={cy0 - 124} w={176} h={28} text={<SvgSay who="collector" text={`이자 ${comma(collector.interest)} 수납 완료요오~`} delay={0.9} mute={talking} />} />
          )}
          {waiting && <Round {...bubble(150)} y={cy0 - 114} w={150} h={28} text={<SvgSay who="collector" text="사무소로 오세요오." delay={0.9} mute={talking} />} />}
          {floats.map((f) => <text key={f.id} x={f.x} y={f.y} textAnchor="middle" className={'pa-float ' + f.cls}>{f.t}</text>)}
        </svg>
        {hint && <div className="pr-tok" style={{ left: pct(WHEEL_SLOTS[0][0] + WHEEL_FACE.dx, HOME_IMG.w), top: pct(WHEEL_SLOTS[0][1] + WHEEL_BOX.dy - 14, HOME_IMG.h) }} aria-hidden="true">쳇바퀴를 톡톡</div>}
      </div>
      <div className="pr-place" aria-hidden="true">{houseName}</div>
      <div className="pr-tint" style={{ background: tint.color, opacity: tint.op }} />
      {near && <div className="pr-gloom" />}
    </div>
  );
}

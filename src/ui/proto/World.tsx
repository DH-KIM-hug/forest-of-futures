// 집 탭의 세상(U-33·U-34): 나무 밑동 집 그림(sprites.ts 'home') 한 장을 화면 너비에 맞춰 깔고, 그 위에 쳇바퀴·알바·주인공·손님을 그림 좌표로 얹는다.
// 자리와 구도는 home.ts(WHEEL_SLOTS·homeCam). 좌표는 그림 픽셀(992×1586)로 적고, SVG 는 390 너비 단위로 그린다(선 굵기·글자 크기가 예전 그대로).
// 접힌 판일 때 쳇바퀴(와 주인공)를 누르면 굴린다. 새 그림이 없는 것(알바·추심원·콜드월렛)은 예전 SVG 로 그린다.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { comma } from '../../engine/util';
import { C, O, Badger, Spiky, Round, Device, Zap } from './art';
import { SvgSay } from './speech';
import { useFx, flyAcorns, flyIcons, coinSvg, tintAt, useClock } from './fx';
import { sellFeeRate } from '../../engine/mining';
import { houseDefs } from '../../engine/data';
import { COLLECTOR_NAME } from './text';
import { EXTRA_WHEEL } from './model';
import { EMPTY_WHEEL_H, EMPTY_WHEEL_DY, EMPTY_WHEEL_FACE, HOME_IMG, WHEEL_SLOTS, WHEEL_BOX, WHEEL_FACE as OLD_FACE, FLOOR_PATCH, HERO_SPOT, HERO_H, VISITOR_SPOT, WALLET_SPOT, TAP_AREA, RIG_SPOT, RIG_H, RIG_ART, HOOP, heroSpotFor, assignSlots, homeCam, cableRoute, type Foot, type Pt } from './home';
import { HOME_BY_LEVEL, sprite, spriteOr, blinkOf, WALK_PAIR, STEPS_PER_SEC, STRIDE, type SpriteId } from './sprites';
import { WalkFrames } from './WalkFrames';
import { aliveStyle, useBlink } from './alive';
import { rollTarget } from '../../engine/mining';
import { reduced } from './fx';
import { hamsterMath, perSec, rateTxt } from './model';
import { balance } from '../../engine/data';
import { Think } from './Think';
import type { HeroMood } from './tension';

/** 그림 픽셀 → SVG 단위(390 너비) */
const K = 390 / HOME_IMG.w;
const VB_H = HOME_IMG.h * K;
const at = (p: Pt): Pt => [p[0] * K, p[1] * K];
const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
/** 알바가 도는 쳇바퀴 · 주인공이 굴리는 쳇바퀴 그림의 키(집 그림 픽셀). 주인공(HERO_H)에 견준 크기는 docs/art/v5/cast_v5.png */
const HAM_WHEEL_H = 150, RIDE_H = 196;
/** 굴려 본 횟수가 이만큼 되기 전에는 쳇바퀴 위에 "쳇바퀴를 톡톡"을 띄운다 */
export const TAP_HINT_TAPS = 8;

type Item = { y: number; key: string; node: ReactNode };

/** 주인공이 굴리는 쳇바퀴의 빠르기(U-43): 누를수록 빨라지고, 마지막으로 누른 지 0.6초에 걸쳐 멈춘다. taps = 누른 때들(ms), now = 지금(ms). 순수 함수 */
export function heroSpinRate(taps: number[], now: number): number {
  if (!taps.length) return 0;
  const last = taps[taps.length - 1];
  const perSecond = taps.filter((t) => now - t <= 1000).length;
  const target = Math.min(2.8, 0.9 + 0.22 * perSecond);
  const dt = (now - last) / 1000;
  if (dt <= 0.15) return target;
  const k = Math.max(0, 1 - (dt - 0.15) / 0.6);
  return target * k * Math.sqrt(k);
}

/** 눈을 깜빡이는 그림(SVG): 눈 뜬 그림 위에 눈 감은 겹을 투명하게 올려 두고, 깜빡임 타이머가 잠깐 보이게 한다 */
function BlinkImage({ id, x, y, w, h }: { id: SpriteId; x: number; y: number; w: number; h: number }) {
  const ref = useBlink<SVGImageElement>();
  const b = blinkOf(id);
  const img = sprite(id)!;
  return <>
    <image href={img.src} x={x} y={y} width={w} height={h} />
    {b && <image ref={ref} data-blink={id} href={b} x={x} y={y} width={w} height={h} style={{ opacity: 0 }} />}
  </>;
}

/** 쳇바퀴 한 대. foot = 발밑(SVG 단위)
 *  kind: empty = 빈 쳇바퀴(가만히 있다) · hamster = 알바가 돈다(늘 돈다) · hero = 주인공이 굴린다(누르는 동안 돌고, 손을 떼면 멈춘다)
 *  도는 쳇바퀴는 두 겹이다: 쳇바퀴 그림 위에서 앞 테를 따라 이음매가 돌고(테가 도는 것으로 읽힌다), 안의 달리는 이는 제자리에서 통통 뛴다. */
function WheelAt({ foot, kind, running, tagged, label, bump, id, pop, cheer = false }: { foot: Pt; kind: 'empty' | 'hamster' | 'hero'; /** 지금 돌고 있다 */ running: boolean; tagged: boolean; label?: string; bump?: number; id?: string; pop?: boolean; /** 방금 크게 땄다(U-41): 알바가 뛰고 쳇바퀴에 불이 켜진다 */ cheer?: boolean }) {
  const [x, y] = foot;
  const empty = sprite('wheelEmpty');
  const img = empty ?? sprite('wheel')!;
  const WHEEL_FACE = empty ? EMPTY_WHEEL_FACE : OLD_FACE;
  const eh = EMPTY_WHEEL_H * K, ew = eh * (img.w / img.h);
  const hero = kind === 'hero';
  const drum = kind === 'empty' ? null : sprite(hero ? 'heroDrum' : 'hamsterDrum'), runner = kind === 'empty' ? null : sprite(hero ? 'heroRunner' : 'hamsterRunner');
  const oh = (hero ? RIDE_H : HAM_WHEEL_H) * K, ow = drum ? oh * (drum.w / drum.h) : 0;
  const ox = x - ow / 2, oy = y + 5 * K - oh, u = oh / 300; // u = 쳇바퀴 그림 한 칸의 크기(SVG 단위)
  const hp = hero ? HOOP.hero : HOOP.hamster;
  const cx = x + WHEEL_FACE.dx * K, cy = y + WHEEL_FACE.dy * K;
  const staffed = kind === 'hamster';
  return (
    <g className={(pop ? 'pa-pop' : '') + (cheer && staffed ? ' pa-cheer' : '') || undefined} data-wheel={staffed ? 'run' : hero ? 'hero' : 'idle'} data-running={running ? '1' : '0'}>
      <ellipse cx={x + 6} cy={y - 3} rx={WHEEL_BOX.w * K * 0.5} ry={8} fill="#5A3A1E" opacity={0.16} />
      <g key={bump ?? 0} className={bump ? 'pa-thump' : undefined} style={{ transformOrigin: `${x}px ${y}px` }}>
        <g id={id} className={'pr-whfx' + (staffed ? ' on' : '')} data-art={drum ? (hero ? 'heroWheel' : 'hamsterWheel') : empty ? 'wheelEmpty' : 'wheel'}>
          {drum && runner ? (
            // 도는 쳇바퀴: 주인공의 쳇바퀴는 data-herospin 이 붙은 겹들의 빠르기를 누르는 빠르기에 맞춘다(World 의 한 군데서)
            <g className={'wh-run' + (running ? ' on' : '') + (hero ? ' byhero' : '')} data-herospin={hero ? '1' : undefined}>
              <image href={drum.src} x={ox} y={oy} width={ow} height={oh} />
              <ellipse className="wh-ticks" cx={ox + hp.cx * u} cy={oy + hp.cy * u} rx={hp.rx * u} ry={hp.ry * u} strokeWidth={12 * u} strokeDasharray={`${20 * u} ${40 * u}`} style={{ ['--tick' as string]: `${60 * u}px` }} />
              <ellipse className="wh-ticks hi" cx={ox + hp.cx * u} cy={oy + hp.cy * u} rx={hp.rx * u} ry={hp.ry * u} strokeWidth={7 * u} strokeDasharray={`${9 * u} ${51 * u}`} strokeDashoffset={-24 * u} style={{ ['--tick' as string]: `${60 * u}px` }} />
              {runner.n ? (
                // 옆모습으로 달리는 이(U-47): 띠 그림을 한 칸씩 넘긴다. 빠르기는 주인공이면 누르는 빠르기를 따른다
                <svg x={ox} y={oy} width={ow} height={oh} overflow="hidden">
                  <image className="wh-strip" data-runner href={runner.src} x={0} y={0} width={ow * runner.n} height={oh} preserveAspectRatio="none" style={{ ['--strip' as string]: `${-ow * runner.n}px`, ['--n' as string]: runner.n, animationTimingFunction: `steps(${runner.n})`, animationDuration: `${runner.n * (hero ? 0.05 : 0.07)}s` }} />
                </svg>
              ) : <image className="wh-bob" data-runner href={runner.src} x={ox} y={oy} width={ow} height={oh} style={{ transformOrigin: `${ox + ow * 0.55}px ${oy + oh * 0.68}px` }} />}
            </g>
          ) : empty ? <image href={img.src} x={x - ew / 2} y={y + EMPTY_WHEEL_DY * K - eh} width={ew} height={eh} />
            : <image href={img.src} x={x + WHEEL_BOX.dx * K} y={y + WHEEL_BOX.dy * K} width={WHEEL_BOX.w * K} height={WHEEL_BOX.h * K} />}
        </g>
      </g>
      {cheer && (
        <g className="pr-cheerlight" data-cheer aria-hidden="true">
          {[[-30, -52, 0], [-4, -70, 0.25], [24, -56, 0.5], [34, -26, 0.75]].map(([dx, dy, d], i) => <circle key={i} cx={cx + dx} cy={cy + dy} r={3.4} style={{ animationDelay: `${d}s` }} />)}
          {staffed && <text x={cx + 30} y={cy - 62} textAnchor="middle" fontSize={11} className="pa-t pa-lbl sq">찍!</text>}
        </g>
      )}
      {running && <Zap cx={cx + 22} cy={cy - 26} s={1.1} />}
      {running && <Zap cx={cx - 24} cy={cy - 12} s={0.85} delay={0.45} />}
      {tagged && <g transform={`rotate(-8 ${x + 22} ${y - 58})`}><rect x={x + 6} y={y - 68} width={34} height={19} rx={3} fill={C.red} stroke={O} strokeWidth={2} /><text x={x + 23} y={y - 54} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">딱지</text></g>}
      {label && <text x={empty ? x : cx} y={empty ? y + EMPTY_WHEEL_DY * K - eh - 4 : y + WHEEL_BOX.dy * K - 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#6B4A35" className="pa-t pa-lbl">{label}</text>}
    </g>
  );
}

/** 아이소 바닥에서 a → b 로 가는 줄이 꺾이는 곳: b − a 를 두 바닥 축 u = (cos30°, sin30°), v = (−cos30°, sin30°) 으로 나눠 먼저 u 쪽으로 간다. 순수 함수 */
export function floorCorner(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const cu = Math.cos(Math.PI / 6), su = 0.5;
  // dx = (p − q)·cu, dy = (p + q)·su → p = (dx/cu + dy/su)/2
  const p = (dx / cu + dy / su) / 2;
  return [a[0] + p * cu, a[1] + p * su];
}

/** 꺾인 길을 SVG 경로로: 꺾는 곳은 둥글게 */
export function routePath(pl: Pt[], r = 6): string {
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pl[0][0])} ${f(pl[0][1])}`;
  for (let i = 1; i < pl.length - 1; i++) {
    const [px, py] = pl[i - 1], [cx, cy] = pl[i], [nx, ny] = pl[i + 1];
    const l1 = Math.hypot(cx - px, cy - py) || 1, l2 = Math.hypot(nx - cx, ny - cy) || 1;
    const k1 = Math.min(r, l1 / 2) / l1, k2 = Math.min(r, l2 / 2) / l2;
    d += ` L${f(cx - (cx - px) * k1)} ${f(cy - (cy - py) * k1)} Q${f(cx)} ${f(cy)} ${f(cx + (nx - cx) * k2)} ${f(cy + (ny - cy) * k2)}`;
  }
  const e = pl[pl.length - 1];
  return d + ` L${f(e[0])} ${f(e[1])}`;
}

/** 전선 한 가닥(바닥을 따라 살짝 처진다): 짙은 테 + 흐린 색. on 이면 전기 알갱이가 채굴기 쪽으로 흐른다 */
function Cable({ from, to, on, hero, loose, sag = 14, hue = '#8A9A62', route }: { from: Pt; to: Pt; on: boolean; hero?: boolean; /** 뽑혀서 바닥에 늘어져 있다(실려 간 쳇바퀴의 전선) */ loose?: boolean; sag?: number; hue?: string; /** 바닥을 따라 꺾어 가는 길(cableRoute, SVG 단위). 있으면 그 길로 간다 */ route?: Pt[] }) {
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2 + sag;
  // 바닥에 놓인 전선: 아이소 바닥의 두 축(오른아래 30° · 왼아래 30°)을 따라 한 번 꺾여 간다. 꺾이는 곳은 둥글게, 중간에 살짝 늘어진다(손으로 깐 줄)
  const c = floorCorner(from, to);
  const d = route && !loose ? routePath(route) : loose
    ? `M${to[0]} ${to[1]} Q${mx} ${my + 6} ${mx + (from[0] - mx) * 0.45} ${my + 10} q-6 5 2 9`
    : `M${from[0]} ${from[1]} C${(from[0] + (c[0] - from[0]) * 0.9).toFixed(1)} ${(from[1] + (c[1] - from[1]) * 0.9 + sag * 0.25).toFixed(1)} ${(c[0] + (to[0] - c[0]) * 0.25).toFixed(1)} ${(c[1] + (to[1] - c[1]) * 0.25 + sag * 0.2).toFixed(1)} ${to[0]} ${to[1]}`;
  return (
    <g className={'pr-cable' + (on ? ' on' : '') + (loose ? ' loose' : '')} data-cable={on ? 'on' : loose ? 'loose' : 'idle'} data-herospin={hero ? '1' : undefined}>
      <path d={d} className="c-out" />
      <path d={d} className="c-in" style={{ stroke: on ? '#B9A04A' : hue }} />
      {!loose && <path d={d} className="c-pulse" />}
    </g>
  );
}

/** 채굴기(U-43): 쳇바퀴의 전기로 코인을 캔다. 어느 쳇바퀴든 돌면 불빛이 깜빡이고 잎 날개가 돈다 */
function Rig({ on }: { on: boolean }) {
  const img = sprite('miner')!, f1 = sprite('minerFan1')!, f2 = sprite('minerFan2')!;
  const u = (RIG_H * K) / RIG_ART.h;
  const [rx, ry] = at(RIG_SPOT);
  const x0 = rx - (RIG_ART.w * u) / 2, y0 = ry - RIG_ART.h * u;
  const fr = RIG_ART.fanR * u;
  return (
    <g id="pr-rig" data-hl="rig" className={'pr-rig' + (on ? ' on' : '')} data-rig={on ? 'on' : 'off'} data-art="miner">
      <ellipse cx={rx} cy={ry - 3} rx={RIG_ART.w * u * 0.46} ry={6} fill="#5A3A1E" opacity={0.2} />
      <image href={img.src} x={x0} y={y0} width={RIG_ART.w * u} height={RIG_ART.h * u} />
      {RIG_ART.fans.map(([fx0, fy0], i) => { const cx = x0 + fx0 * u, cy = y0 + fy0 * u; return <image key={i} className="rig-fan" href={(i ? f2 : f1).src} x={cx - fr} y={cy - fr} width={fr * 2} height={fr * 2} style={{ transformOrigin: `${cx}px ${cy}px`, animationDelay: `${-i * 0.13}s` }} />; })}
      {RIG_ART.leds.map(([lx, ly], i) => <rect key={i} className="rig-led" x={x0 + (lx - 4) * u} y={y0 + (ly - 3.5) * u} width={8 * u} height={7 * u} rx={1.5 * u} style={{ animationDelay: `${-((i * 7) % 12) * 0.11}s` }} />)}
    </g>
  );
}
/** 채굴기에서 전선이 꽂히는 곳 · 지갑으로 나가는 곳(SVG 단위) */
function rigPoint(p: Pt): Pt {
  const u = (RIG_H * K) / RIG_ART.h;
  const [rx, ry] = at(RIG_SPOT);
  return [rx - (RIG_ART.w * u) / 2 + p[0] * u, ry - RIG_ART.h * u + p[1] * u];
}

export function World({ near, mood = 'idle', cover, open, onRoll, hold = null }: { /** 포지션을 들고 있다(U-42): 지금 손익 합과 그동안 굴려 번 돈 — 주인공 머리 위의 폰 꼬리표 */ hold?: { net: number; rolled: number } | null; near: boolean; /** 포지션을 들고 있는 동안의 몸(tension.ts heroMood): 폰만 본다 · 서성인다 · 들썩인다 · 굳는다 */ mood?: HeroMood; /** 아래 판이 덮는 높이(px) */ cover: number; /** 판이 펴져 있다(빈 자리 표시를 보여 준다) */ open: boolean; onRoll: () => void }) {
  const g = useGame((s) => s.g);
  const tapping = useProto((s) => s.tapping);
  const collector = useProto((s) => s.collector);
  const waiting = useProto((s) => s.waiting);
  const slotOf = useProto((s) => s.slotOf);
  const slotHi = useProto((s) => s.slotHi);
  const talking = useProto((s) => s.scenes.length > 0);
  const cheer = useProto((s) => s.cheer);
  const thinking = useProto((s) => !!s.think);
  const run = g.run;
  const now = useClock();
  const tint = tintAt(now);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 390, h: 690, hud: 180 });
  const [floats, setFloats] = useState<{ id: number; t: string; x: number; y: number; cls: string; to?: Pt }[]>([]);
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
  const hh = HERO_H * K;
  // 주인공이 굴릴 수 있는 쳇바퀴(U-43: 알바가 든 쳇바퀴는 못 굴린다): 엄마의 쳇바퀴(자리 0) 또는 알바 없는 보조 쳇바퀴의 자리. 없으면 -1
  const target = rollTarget(run);
  const rideSlot = target === null ? -1 : target === 'mom' ? 0 : seat.indexOf(target);
  const [wx, wy] = at(WHEEL_SLOTS[Math.max(0, rideSlot)]);
  const spot = heroSpotFor(rideSlot);
  const [hx, hy] = at(spot);
  // 주인공의 몸(U-40 그림): 폰을 받기 전에는 빈손 · 청산 직후에는 주저앉는다 · 크게 따는 중이면 폰을 치켜든다 · 잃는 중이면 걷는다(서성인다)
  // 쳇바퀴를 직접 굴리는 동안에는 그 쳇바퀴 안에 들어가 있다(서 있는 그림은 그리지 않는다)
  const justLiq = !!run.lastClose?.liq && run.tick - run.lastClose.tick < 25;
  const riding = tapping && rideSlot >= 0 && !near && !!sprite('heroDrum');
  const cheering = !!cheer && !near && !justLiq;
  // 걸음(U-43 사용자: "주인공 시선이 한쪽만 있어서 이상한데"): 서는 자리가 바뀌면 그쪽으로 미끄러지며 걷는 그림을 쓴다 — 멀어지면 등, 다가오면 앞, 옆으로는 옆 그림(왼쪽이면 뒤집는다)
  const prevSpot = useRef(spot);
  const [walk, setWalk] = useState<{ dx: number; dy: number; dur: number } | null>(null);
  useEffect(() => {
    const p = prevSpot.current;
    if (p[0] === spot[0] && p[1] === spot[1]) return;
    prevSpot.current = spot;
    // 두 걸음 걷기(U-46): 거리 ÷ 보폭으로 걸음 수를 정하고, 그 걸음 수를 초당 5.5 걸음으로 걷는 시간만큼 미끄러진다(발이 바닥에서 미끄러지지 않게)
    const steps = Math.max(2, Math.round((Math.hypot(spot[0] - p[0], spot[1] - p[1]) * K) / (hh * STRIDE)));
    const dur = steps / STEPS_PER_SEC;
    setWalk({ dx: spot[0] - p[0], dy: spot[1] - p[1], dur });
    const t = window.setTimeout(() => setWalk(null), dur * 1000 + 40);
    return () => window.clearTimeout(t);
  }, [spot[0], spot[1]]);
  const phone = run.futures.open;
  const walking = !!walk && !riding && !near;
  const wdir = walk ? (walk.dy < -Math.abs(walk.dx) * 0.6 ? 'back' : walk.dy > Math.abs(walk.dx) * 0.6 ? 'front' : 'side') : null;
  const standId: SpriteId = near ? (sprite('heroFrozen') ? 'heroFrozen' : 'hero') : mood === 'frozen' && sprite('heroFrozen') ? 'heroFrozen' : cheering && phone ? 'heroHappy' : justLiq ? 'heroSad' : !phone ? 'heroEmpty' : mood === 'hop' ? 'heroHappy' : mood === 'pace' ? 'heroWalk' : 'hero';
  const heroId: SpriteId = walking ? (wdir === 'back' ? 'heroWalkBack' : wdir === 'front' && !phone ? 'heroWalkFront' : phone ? 'heroWalk' : 'heroWalkEmpty') : standId;
  // 보는 쪽: 걷는 중에는 가는 쪽. 서 있을 때는 하는 일 쪽 — 추심원이 와 있으면 문 쪽(오른쪽 위), 포지션을 들었으면 폰(그림 그대로), 굴릴 쳇바퀴가 있으면 그 쳇바퀴 쪽
  const visitor = waiting || (!!collector && collector.interest > 0);
  const wheelLeft = wx < hx;
  const flip = walking ? (wdir === 'back' ? walk!.dx > 0 : walk!.dx < 0) : !visitor && !hold && rideSlot >= 0 && wheelLeft && (standId === 'hero' || standId === 'heroEmpty');
  const heroImg = spriteOr(heroId, 'hero')!;
  const hScale = heroId === 'heroSad' ? 0.9 : heroId === 'heroHappy' ? 1.1 : 1;
  const hw = hh * hScale * (heroImg.w / heroImg.h);
  // 손익이 몸에 보인다(U-39 ①). 걷는 중에는 두 박자로 통통
  const cycling = walking && !!WALK_PAIR[heroId];
  const heroCls = walking ? (cycling ? '' : ' walkbob') : near || mood === 'frozen' ? ' stare' : cheering ? ' hopjoy' : mood === 'pace' ? ' pace' : mood === 'hop' ? ' hopjoy' : mood === 'phone' ? ' phone' : ' al';

  const addFloat = (t: string, x: number, y: number, cls = '', to?: Pt) => {
    const id = ++idRef.current;
    setFloats((f) => [...f.slice(-7), { id, t, x, y, cls, to }]);
    window.setTimeout(() => setFloats((f) => f.filter((q) => q.id !== id)), cls.includes('inc') ? 1150 : 900);
  };
  // 주인공이 굴리는 쳇바퀴의 빠르기: 누른 때들을 적어 두고, 도는 겹들(data-herospin)의 애니메이션 빠르기를 한 군데서 맞춘다(리액트는 다시 그리지 않는다)
  const taps = useRef<number[]>([]);
  const raf = useRef(0);
  const applyRate = () => {
    const el = ref.current;
    const rate = reduced() ? 0 : heroSpinRate(taps.current, performance.now());
    if (el) for (const n of Array.from(el.querySelectorAll('[data-herospin]'))) for (const a of (n as Element).getAnimations({ subtree: true })) a.playbackRate = rate;
    if (el) el.dataset.herorate = rate.toFixed(2);
    if (rate > 0.01) raf.current = requestAnimationFrame(applyRate); else raf.current = 0;
  };
  useEffect(() => { if (!raf.current) applyRate(); return () => { cancelAnimationFrame(raf.current); raf.current = 0; }; });
  const rigRect = () => document.getElementById('pr-rig')?.getBoundingClientRect() ?? null;
  useFx((e) => {
    if (e.kind === 'tap') {
      setTapKey((k) => k + 1);
      taps.current = [...taps.current.filter((t) => performance.now() - t < 1200), performance.now()];
      if (!raf.current) raf.current = requestAnimationFrame(applyRate);
      // 채굴기 → 콜드월렛으로 코인이 건너가고(쳇바퀴의 전기는 전선으로 간다), 바로 팔기면 지갑 → 도토리 숫자로 도토리가 날아간다
      const wal = document.getElementById('pr-wallet-dev')?.getBoundingClientRect() ?? null;
      flyIcons(coinSvg(16), rigRect(), wal, 1, { onEnd: () => { if (e.sold) flyAcorns(wal, 1); } });
      addFloat(e.gain, wx + 30 + (Math.random() - 0.5) * 14, wy - 62, e.sold ? '' : 'coin');
    } else if (e.kind === 'buy') {
      if (e.price > 0) addFloat(`−${comma(e.price)}`, 195, at([0, 990])[1], 'neg');
    }
  });

  // ── 쳇바퀴들: 자리마다 무엇이 있고 지금 도는가 ──
  interface W { slot: number; key: string; foot: Pt; kind: 'empty' | 'hamster' | 'hero'; running: boolean; tagged: boolean; label?: string; pop: boolean }
  const wheels: W[] = [];
  if (first) wheels.push({ slot: 0, key: 'w0', foot: at(WHEEL_SLOTS[0]), kind: first.staffed ? 'hamster' : riding && rideSlot === 0 ? 'hero' : 'empty', running: !near && (!!first.staffed || (riding && rideSlot === 0)), tagged: !!first.tagBy, pop: false });
  for (let s = 1; s < WHEEL_SLOTS.length; s++) {
    const u = extras.find((x) => x.uid === seat[s]);
    if (u) wheels.push({ slot: s, key: u.uid, foot: at(WHEEL_SLOTS[s]), kind: u.staffed ? 'hamster' : riding && rideSlot === s ? 'hero' : 'empty', running: !near && (!!u.staffed || (riding && rideSlot === s)), tagged: !!u.tagBy, label: u.staffed || (riding && rideSlot === s) ? undefined : '알바 없음', pop: true });
  }
  const anyRun = wheels.some((w) => w.running);
  const staffedN = wheels.filter((w) => w.kind === 'hamster').length;
  const sock = rigPoint(RIG_ART.socket);
  const cableFrom = (w: W): Pt => [w.foot[0] + (w.foot[0] < sock[0] ? 20 : -20), w.foot[1] - 4];
  // 전선의 길(U-46): 주인공이 서는 곳 · 손님 자리 · 다른 쳇바퀴의 발밑과 상자를 피해 바닥의 두 축을 따라 꺾어 간다. 쳇바퀴가 놓이거나 알바가 바뀔 때만 다시 센다(주인공이 걸을 때마다 줄이 움직이지 않게)
  const routeKey = wheels.map((w) => w.key + ':' + w.slot + (w.kind === 'hamster' ? 'h' : '')).join(',');
  const routes = useMemo(() => {
    const out: Record<string, Pt[]> = {};
    const img = (p: Pt): Pt => [p[0] / K, p[1] / K];
    const heroSpots: Pt[] = [HERO_SPOT, ...wheels.filter((w) => w.slot > 0 && w.kind !== 'hamster').map((w) => heroSpotFor(w.slot))];
    for (const w of wheels) {
      const feet: Foot[] = [...heroSpots.map((p) => ({ p, w: 45 })), { p: VISITOR_SPOT, w: 40 }, ...wheels.filter((o) => o.key !== w.key).map((o) => ({ p: WHEEL_SLOTS[o.slot], w: 80 }))];
      out[w.key] = cableRoute(img(cableFrom(w)), img(sock), feet).map((p) => at(p));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);
  // 실려 간 쳇바퀴의 전선: 잠깐 바닥에 늘어져 있다가 사라진다
  const prevWheels = useRef<Record<string, Pt>>({});
  const [loose, setLoose] = useState<{ id: number; from: Pt }[]>([]);
  useEffect(() => {
    const cur: Record<string, Pt> = Object.fromEntries(wheels.map((w) => [w.key, cableFrom(w)]));
    const gone = Object.entries(prevWheels.current).filter(([k]) => !cur[k]);
    prevWheels.current = cur;
    if (!gone.length) return;
    const add = gone.map(([, from]) => ({ id: ++idRef.current, from }));
    setLoose((l) => [...l, ...add]);
    const t = window.setTimeout(() => setLoose((l) => l.filter((x) => !add.some((a) => a.id === x.id))), 2200);
    return () => window.clearTimeout(t);
  }, [wheels.map((w) => w.key).join(',')]);

  // ── 정산 때 나가는 돈(U-43): 도토리 숫자에서 추심원에게로 붉은 "−"가 줄지어 간다 ──
  useEffect(() => {
    if (!collector || collector.interest <= 0 || collector.overdue || reduced()) return;
    const t = window.setTimeout(() => {
      const from = document.getElementById('pr-acorn-ic')?.getBoundingClientRect() ?? null;
      const to = document.getElementById('pr-collector')?.getBoundingClientRect() ?? null;
      flyIcons('<b class="fly-minus">−</b>', from, to, 7, { size: 20 });
    }, 700);
    return () => window.clearTimeout(t);
  }, [collector?.at]);

  // ── 초당 버는 돈이 눈에 보인다(U-43 사용자: "알바 고용하고 하면 초당 얼마 버는지 시각화 제대로 좀"): 도는 쳇바퀴마다 1초에 한 번 "+n"이 떠서 채굴기 쪽으로 가고, 채굴기 → 지갑으로 합이 건너간다 ──
  const secGain = Math.round(perSec(hamsterMath(g).sold)); // 알바 한 마리가 1초에 캐서 파는 돈(엔진 값)
  const turn = useRef(0);
  const live = useRef({ staffedN, secGain, talking, wheels });
  live.current = { staffedN, secGain, talking, wheels };
  useEffect(() => {
    if (staffedN <= 0) return;
    const t = window.setInterval(() => {
      const L = live.current;
      if (reduced() || L.talking || document.hidden) return;
      const runners = L.wheels.filter((w) => w.kind === 'hamster' && w.running);
      if (!runners.length) return;
      // 여섯 대가 한꺼번에 뜨면 시끄럽다: 한 번에 두 대까지, 차례로
      for (let k = 0; k < Math.min(2, runners.length); k++) {
        const w = runners[(turn.current + k) % runners.length];
        // 쳇바퀴 발치에서 떠서 전선을 따라 채굴기로 간다(U-43)
        const from = cableFrom(w), sk = rigPoint(RIG_ART.socket);
        addFloat(`+${comma(L.secGain)}`, from[0], from[1] - 10, 'inc travel', [sk[0] - from[0], sk[1] - from[1]]);
      }
      turn.current += 2;
      const wal = document.getElementById('pr-wallet-dev')?.getBoundingClientRect() ?? null;
      const [dx, dy] = at(WALLET_SPOT);
      flyIcons(coinSvg(14), rigRect(), wal, 1, { onEnd: () => addFloat(`+${comma(L.secGain * runners.length)}`, dx, dy - 38, 'inc sum') });
    }, Math.max(1000, 1000));
    return () => window.clearInterval(t);
  }, [staffedN > 0]);
  // 알바를 부른 순간: 그 쳇바퀴 위에 "초당 +0 → +n"
  const prevStaffed = useRef<string[] | null>(null);
  const prevGenW = useRef(g.family.generation);
  useEffect(() => {
    const now2 = wheels.filter((w) => w.kind === 'hamster').map((w) => w.key);
    const was = prevStaffed.current;
    prevStaffed.current = now2;
    // 새 생이 알바 둘을 데리고 시작할 때(U-46)는 "알바를 들였다"가 아니다
    const newLife = prevGenW.current !== g.family.generation; prevGenW.current = g.family.generation;
    if (!was || newLife) return;
    for (const k of now2) if (!was.includes(k)) { const w = wheels.find((x) => x.key === k)!; addFloat(`초당 +0 → +${rateTxt(perSec(hamsterMath(g).sold))}`, Math.max(70, Math.min(320, w.foot[0])), w.foot[1] - HAM_WHEEL_H * K - 14, 'hire'); }
  }, [wheels.filter((w) => w.kind === 'hamster').map((w) => w.key).join(','), g.family.generation]);

  const items: Item[] = [];
  for (const w of wheels) items.push({ y: w.foot[1], key: w.key, node: <WheelAt foot={w.foot} id={w.slot === 0 ? 'pr-wheel1' : undefined} kind={w.kind} running={w.running} tagged={w.tagged} label={w.label} pop={w.pop} bump={w.slot === rideSlot && w.kind !== 'hamster' ? tapKey : 0} cheer={cheering} /> });
  // 채굴기(뒷벽 앞): 어느 쳇바퀴든 돌면 켜진다
  items.push({ y: at(RIG_SPOT)[1], key: 'rig', node: <Rig on={anyRun} /> });
  // 콜드월렛(작은 상자 위)
  if (first || extras.length) {
    const [dx, dy] = at(WALLET_SPOT);
    items.push({ y: dy + 30, key: 'dev', node: (
      <g className="pr-wal-hit" data-hl="walletDev" role="button" tabIndex={0} aria-label="콜드월렛 열기" onClick={() => useProto.getState().patch({ wallet: true })} onKeyDown={(e) => { if (e.key === 'Enter') useProto.getState().patch({ wallet: true }); }}>
        <circle cx={dx} cy={dy - 10} r={24} fill="transparent" />
        <ellipse cx={dx} cy={dy + 2} rx={10} ry={4} fill="#5A3A1E" opacity={0.18} />
        <g id="pr-wallet-dev">{sprite('wallet') ? <image data-art="wallet" href={sprite('wallet')!.src} x={dx - 14} y={dy - 30} width={28} height={32} /> : <Device x={dx} y={dy - 14} k={0.8} />}</g>
      </g>
    ) });
  }
  // 주인공: 굴릴 수 있는 쳇바퀴 옆에 서 있다(없으면 엄마의 쳇바퀴 옆에서 폰을 본다). 자리가 바뀌면 걸어간다
  const [bx, by] = at(HERO_SPOT);
  if (!riding) items.push({ y: hy, key: 'hero', node: (
    <g id="pr-hero" data-mood={near ? 'frozen' : mood} data-art={heroId} data-flip={flip ? '1' : '0'} data-slot={rideSlot} className="pr-herowalk" style={{ transform: `translate(${hx - bx}px, ${hy - by}px)`, transitionDuration: walk ? `${walk.dur.toFixed(2)}s` : undefined }}>
      <ellipse cx={bx + 1} cy={by - 1} rx={hw * 0.42} ry={4.5} fill="#5A3A1E" opacity={0.2} />
      <g transform={flip ? `translate(${2 * bx} 0) scale(-1 1)` : undefined}>
        <g className={'pa-hero' + heroCls} style={{ transformOrigin: `${bx}px ${by}px`, ...aliveStyle('hero') }}>
          {cycling
            ? <WalkFrames id={heroId} x={bx - hw / 2} y={by - hh * hScale} w={hw} h={hh * hScale} period={2 / STEPS_PER_SEC} />
            : heroId === 'hero' || heroId === 'heroEmpty'
            ? <BlinkImage id={heroId} x={bx - hw / 2} y={by - hh * hScale} w={hw} h={hh * hScale} />
            : <image href={heroImg.src} x={bx - hw / 2} y={by - hh * hScale} width={hw} height={hh * hScale} />}
        </g>
      </g>
      {(near || mood === 'frozen' || mood === 'pace') && <path className="pa-sweat" d={`M${bx - 16} ${by - hh + 6} q-5 8 0 11 q5 -3 0 -11z`} fill="#BFE3F2" stroke={O} strokeWidth={1.6} />}
    </g>
  ) });
  // 추심원: 뒷벽 둥근 문으로 들어와 문 앞에 선다. 기다리는 동안에는 장부를 톡톡 두드린다. 이자를 받으면 고개를 끄덕인다
  const [cx0, cy0] = at(VISITOR_SPOT);
  const colImg = sprite('cCollector');
  const cw = colImg ? 52 * (colImg.w / colImg.h) : 0;
  const col = (cls: string) => colImg
    ? <g id="pr-collector" className={'pa-npc ' + cls} style={{ transformOrigin: `${cx0}px ${cy0}px`, ...aliveStyle('collector') }} data-art="cCollector"><BlinkImage id="cCollector" x={cx0 - cw / 2} y={cy0 - 52} w={cw} h={52} /></g>
    : <Badger cx={cx0} cy={cy0} h={52} />;
  if (waiting) {
    items.push({ y: cy0, key: 'colwait', node: <g className="pa-walkin door">{col('al taps')}<g transform={`translate(${cx0 - 40} ${cy0 - 60})`}><rect x={0} y={-18} width={80} height={18} rx={9} fill={O} /><text x={40} y={-5} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{COLLECTOR_NAME}</text></g></g> });
  } else if (collector && collector.interest > 0) {
    const left = collector.overdue ? 1 - collector.fill : 0;
    items.push({ y: cy0, key: `col${collector.at}`, node: (
      <g key={`col${collector.at}`} className="pa-walkin door">
        {col(collector.overdue ? 'al' : 'al nod')}
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
  const taps0 = run.stats.laborTaps ?? 0;
  const hint = rideSlot >= 0 && !waiting && !open && !near && !talking && taps0 < TAP_HINT_TAPS;
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
  const out = rigPoint(RIG_ART.out);
  const [wdx, wdy] = at(WALLET_SPOT);
  /** 굴리기 탭이 먹는 네모: 엄마의 쳇바퀴 둘레(늘) + 주인공이 굴리는 쳇바퀴 둘레(다른 자리일 때) */
  const hitAt = (slot: number) => { const dx = WHEEL_SLOTS[slot][0] - WHEEL_SLOTS[0][0], dy = WHEEL_SLOTS[slot][1] - WHEEL_SLOTS[0][1]; const x = Math.max(0, Math.min(HOME_IMG.w - TAP_AREA[2], TAP_AREA[0] + dx)); return { left: pct(x, HOME_IMG.w), top: pct(TAP_AREA[1] + dy, HOME_IMG.h), width: pct(TAP_AREA[2], HOME_IMG.w), height: pct(TAP_AREA[3], HOME_IMG.h) }; };

  return (
    <div ref={ref} className={'pr-world home' + (near ? ' near' : '') + (tint.night ? ' night' : '')} aria-label={houseName} role="img" data-rideslot={rideSlot}>
      <div className="pr-stage" style={{ height: cam.imgH, transform: `translate3d(0, ${cam.top}px, 0)` }} data-cam={cam.top}>
        <img className="bg" src={home.src} alt="" draggable={false} />
        <button className="pr-wheel-hit" data-tap data-hl="wheel" onPointerDown={onRoll} aria-label={first ? (rideSlot >= 0 ? '쳇바퀴 굴리기 (코인 채굴)' : '쳇바퀴 (알바가 돌린다)') : '쳇바퀴가 없다'} style={hitAt(0)} />
        {rideSlot > 0 && <button className="pr-wheel-hit" data-tap2 onPointerDown={onRoll} aria-label="쳇바퀴 굴리기 (코인 채굴)" style={hitAt(rideSlot)} />}
        <svg className="fg" viewBox={`0 0 390 ${VB_H.toFixed(2)}`} preserveAspectRatio="none">
          <image href={patch.src} x={FLOOR_PATCH[0] * K} y={FLOOR_PATCH[1] * K} width={FLOOR_PATCH[2] * K} height={FLOOR_PATCH[3] * K} />
          {spots}
          {/* 전선(U-43): 쳇바퀴마다 채굴기로 한 가닥, 채굴기에서 콜드월렛으로 한 가닥. 도는 쳇바퀴의 전선에는 전기가 흐른다. 바닥에 놓인 것이라 쳇바퀴 · 사람보다 먼저 그린다 */}
          <g className="pr-cables" data-hl="cables">
            {wheels.map((w) => <Cable key={w.key} from={cableFrom(w)} to={sock} on={w.running} hero={w.kind === 'hero'} hue={w.tagged ? '#B8785A' : '#8A9A62'} route={routes[w.key]} />)}
            {loose.map((l) => <Cable key={'l' + l.id} from={l.from} to={sock} on={false} loose />)}
            {(first || extras.length > 0) && <g className={'pr-cable out' + (anyRun ? ' on' : '')} data-cable-out={anyRun ? 'on' : 'idle'}>
              {(() => { const d = `M${out[0]} ${out[1]} Q${(out[0] + wdx) / 2 + 20} ${out[1] + 6} ${wdx - 26} ${wdy - 52} T${wdx - 9} ${wdy - 4}`; return <><path d={d} className="c-out" /><path d={d} className="c-in" style={{ stroke: anyRun ? '#C9A44C' : '#9A8F6E' }} /><path d={d} className="c-pulse" /></>; })()}
            </g>}
          </g>
          {items.map((it) => <g key={it.key}>{it.node}</g>)}
          {!waiting && collector && collector.interest > 0 && (
            collector.overdue
              ? <Spiky key={`sb${collector.at}`} {...bubble(168)} y={cy0 - 126} w={168} h={30} text={<SvgSay who="collector" text="이자가 모자라요오. 연체." delay={0.9} mute={talking} />} />
              : <Round key={`rb${collector.at}`} {...bubble(176)} y={cy0 - 124} w={176} h={28} text={<SvgSay who="collector" text={`이자 ${comma(collector.interest)}, 받았어요오.`} delay={0.9} mute={talking} />} />
          )}
          {waiting && <Round {...bubble(150)} y={cy0 - 114} w={150} h={28} text={<SvgSay who="collector" text="사무소로 오세요오." delay={0.9} mute={talking} />} />}
          {/* 폰 꼬리표(U-42): 포지션을 든 채 집에 있으면 주인공 머리 위에 지금 손익이 뜬다. 굴려 번 돈이 있으면 그 아래에 */}
          {hold && !cheering && !talking && !riding && !thinking && !walking && (
            <g className={'pr-herotag ' + (hold.net >= 0 ? 'up' : 'dn')} data-herotag={Math.round(hold.net)} transform={`translate(${hx + 30} ${hy - hh * hScale - 12})`}>
              <rect x={-36} y={-17} width={72} height={hold.rolled >= 1 ? 31 : 19} rx={7} />
              <text x={0} y={-3} textAnchor="middle" fontSize={12.5} className="pa-t">폰 {hold.net >= 0 ? '+' : '−'}{comma(Math.abs(Math.round(hold.net)))}</text>
              {hold.rolled >= 1 && <text x={0} y={10} textAnchor="middle" fontSize={10.5} className="pa-t s">굴려 +{comma(Math.round(hold.rolled))}</text>}
            </g>
          )}
          {cheering && cheer && (
            <g className="pr-cheerbn" data-cheer-banner>
              <text x={hx + 26} y={hy - hh * 1.1 - 30} textAnchor="middle" fontSize={17} className="pa-t pa-lbl">+{comma(cheer.amount)}</text>
              <text x={hx + 26} y={hy - hh * 1.1 - 13} textAnchor="middle" fontSize={11.5} className="pa-t pa-lbl s">한 판에 이자 {cheer.worth >= 2 ? `${cheer.worth.toFixed(1)}번` : '한 번'} 치</text>
            </g>
          )}
          {floats.map((f) => <text key={f.id} x={f.x} y={f.y} textAnchor="middle" className={'pa-float ' + f.cls} style={f.to ? { ['--tx' as string]: `${f.to[0].toFixed(1)}px`, ['--ty' as string]: `${f.to[1].toFixed(1)}px` } : undefined}>{f.t}</text>)}
        </svg>
        <Think cls="home" style={{ left: pct(spot[0], HOME_IMG.w), top: pct(spot[1] - HERO_H - 34, HOME_IMG.h) }} />
        {hint && <div className="pr-tok" style={{ left: pct(WHEEL_SLOTS[rideSlot][0] + OLD_FACE.dx, HOME_IMG.w), top: pct(WHEEL_SLOTS[rideSlot][1] + WHEEL_BOX.dy - 14, HOME_IMG.h) }} aria-hidden="true">쳇바퀴를 톡톡</div>}
      </div>
      <div className="pr-place" aria-hidden="true">{houseName}</div>
      <div className="pr-tint" style={{ background: tint.color, opacity: tint.op }} />
      {near && <div className="pr-gloom" />}
    </div>
  );
}

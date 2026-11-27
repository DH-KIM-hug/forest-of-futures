// 프롤로그(STORY_ACT1 v3 0장, U-29): 첫 실행이 곧 조작 설명. 30~60초, 탭으로 넘긴다.
// 개정 대본(docs/gdd/SCRIPT_ACT1_REVISED_USER.md 장면 1~4): P1 짐차가 떠난 뒤(봉투, 반출 목록) → P2 두 번 묶은 매듭(쳇바퀴의 리본) → P3 열쇠를 받으러 온 추심원: 엄마 빚 30만을 내 이름으로 → P4 쳇바퀴를 굴린다(여기서부터 조작).
// 엄마의 죽음은 보여 주지 않는다. 새 그림은 만들지 않고 시제품 부품(art.tsx)으로 그린다. 숫자는 엔진 값.
import { useEffect, useRef, useState } from 'react';
import { O, Acorn } from './art';
import { sprite, spriteOr, blinkOf, STEPS_PER_SEC, STRIDE, type SpriteId } from './sprites';
import { WalkFrames } from './WalkFrames';
import { HOME_IMG, WHEEL_SLOTS, FLOOR_PATCH, HERO_SPOT, HERO_H, VISITOR_SPOT, EMPTY_WHEEL_H, EMPTY_WHEEL_DY, RIG_SPOT, RIG_H, RIG_ART } from './home';
import { aliveStyle, useBlink, talkBob } from './alive';
import { play, playTap } from './audio';
import { balance, lenderById } from '../../engine/data';
import { comma } from '../../engine/util';
import { prologueTalk, ledgerNote } from './text';
import { firstVisitSec } from './model';
import { Typed, useSpeech } from './speech';

export const PROLOGUE_KEY = 'fof.proto.prologue.v3';
export const prologueSeen = (): boolean => { try { return localStorage.getItem(PROLOGUE_KEY) === '1'; } catch { return false; } };

type Step = 'p1' | 'p2' | 'p3' | 'p4';
const DEBTS = balance.start.debts as Record<string, number>;
const DEBT_TOTAL = Object.values(DEBTS).reduce((a, b) => a + b, 0);
const CAPS = ((balance.start as unknown as { inheritedRateCap?: Record<string, number> }).inheritedRateCap ?? {}) as Record<string, number>;
/** 엄마 빚의 정산당 이자(엔진과 같은 식: 원금 × 물려받은 몫의 금리 상한) */
const INTEREST = Math.ceil(Object.entries(DEBTS).reduce((a, [id, p]) => a + p * Math.min(lenderById[id].rate, CAPS[id] ?? lenderById[id].rate), 0) - 1e-9);
const TAP: number = balance.mining.tapBase;
/** 걸어가는 길(무대 단위)과 그 자리의 크기: 길 아래에서 문 앞 계단까지 */
const WALK: [number, number, number][] = [[172, 648, 1], [178, 548, 0.86], [184, 462, 0.74]];
/** 걸음(U-46): walk 번째 자리로 가는 데 몇 걸음, 몇 초. 보폭 = 그 자리 키의 STRIDE 배(멀어질수록 작아진다) — 발이 미끄러지지 않게 걸음 수로 시간을 정한다 */
const HERO_PRO_H = 72;
const walkSteps = (n: number): number => { const [x0, y0, k0] = WALK[Math.max(0, n - 1)], [x1, y1, k1] = WALK[Math.min(n, 2)]; return Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / (HERO_PRO_H * ((k0 + k1) / 2) * STRIDE))); };
const walkDur = (n: number): number => walkSteps(n) / STEPS_PER_SEC;
const TALK = prologueTalk({ debt: DEBT_TOTAL, interest: INTEREST });

const Finger = ({ x, y }: { x: number; y: number }) => (
  <g className="pp-finger" style={{ transformOrigin: `${x}px ${y}px` }}>
    <circle cx={x} cy={y} r={26} fill="none" stroke="#fff" strokeWidth={3} strokeDasharray="5 7" strokeLinecap="round" />
    <path d={`M${x + 8} ${y + 10} l14 22 l5 -9 l10 3z`} fill="#fff" stroke={O} strokeWidth={2.2} strokeLinejoin="round" />
  </g>
);
const Ribbon = ({ x, y, k = 1 }: { x: number; y: number; k?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${k})`}>
    <path d="M0 0 -22 -13v26z M0 0l22 -13v26z" fill="#C2413B" stroke={O} strokeWidth={2.4} strokeLinejoin="round" />
    <path d="M-4 4l-8 20 10 -5z M4 4l8 20 -10 -5z" fill="#C2413B" stroke={O} strokeWidth={2.2} strokeLinejoin="round" />
    <circle cx={0} cy={0} r={6.5} fill="#C2413B" stroke={O} strokeWidth={2.4} />
  </g>
);
// ── 그림(U-40): P1 = 해 질 녘의 나무 밑동 집 바깥(s_prologue), P2~P4 = 집 안(집 탭과 같은 그림). 좌표는 집 그림 픽셀을 무대 단위로 옮긴다 ──
/** 집 그림(992×1586)을 무대(390×800, y −100~700)에 꽉 채웠을 때의 배율과 옮김 */
const HS = 800 / HOME_IMG.h, HX0 = (390 - HOME_IMG.w * HS) / 2;
const PX = (x: number) => HX0 + x * HS, PY = (y: number) => -100 + y * HS;
const WX = PX(WHEEL_SLOTS[0][0]), WY = PY(WHEEL_SLOTS[0][1]);
const HEROX = PX(HERO_SPOT[0]), HEROY = PY(HERO_SPOT[1]), HEROH = HERO_H * HS * 1.05;
const COLX = PX(VISITOR_SPOT[0]), COLY = PY(VISITOR_SPOT[1]);
/** 채굴기(U-43): 엄마 것. 고물이라 안 실어 갔다. 쳇바퀴에서 전선 한 가닥이 꽂혀 있다. on = 쳇바퀴가 돈다(불빛 · 잎 날개 · 전기) */
const RU = (RIG_H * HS) / RIG_ART.h, RX0 = PX(RIG_SPOT[0]) - (RIG_ART.w * RU) / 2, RY0 = PY(RIG_SPOT[1]) - RIG_ART.h * RU;
function RoomRig({ on }: { on: boolean }) {
  const img = sprite('miner'), f1 = sprite('minerFan1'), f2 = sprite('minerFan2');
  if (!img || !f1 || !f2) return null;
  const sx = RX0 + RIG_ART.socket[0] * RU, sy = RY0 + RIG_ART.socket[1] * RU;
  const fx = WX + 26, fy = WY - 6;
  const d = `M${fx} ${fy} C${fx + 22} ${fy + 18} ${sx + 30} ${sy + 34} ${sx} ${sy}`;
  const fr = RIG_ART.fanR * RU;
  return (
    <g className={'pr-rig' + (on ? ' on' : '')} data-rig={on ? 'on' : 'off'} data-art="miner">
      <g className={'pr-cable' + (on ? ' on' : '')} data-cable={on ? 'on' : 'idle'}><path d={d} className="c-out" /><path d={d} className="c-in" style={{ stroke: on ? '#B9A04A' : '#8A9A62' }} /><path d={d} className="c-pulse" /></g>
      <image href={img.src} x={RX0} y={RY0} width={RIG_ART.w * RU} height={RIG_ART.h * RU} />
      {RIG_ART.fans.map(([a, b], i) => { const cx = RX0 + a * RU, cy = RY0 + b * RU; return <image key={i} className="rig-fan" href={(i ? f2 : f1).src} x={cx - fr} y={cy - fr} width={fr * 2} height={fr * 2} style={{ transformOrigin: `${cx}px ${cy}px` }} />; })}
      {RIG_ART.leds.map(([lx, ly], i) => <rect key={i} className="rig-led" x={RX0 + (lx - 4) * RU} y={RY0 + (ly - 3.5) * RU} width={8 * RU} height={7 * RU} rx={1.5 * RU} style={{ animationDelay: `${-((i * 7) % 12) * 0.11}s` }} />)}
    </g>
  );
}
/** 숨 쉬고 눈을 깜빡이는 서 있는 인물(프롤로그) */
function Alive({ id, seed, x, y, h, art }: { id: SpriteId; seed: string; x: number; y: number; h: number; art?: string }) {
  const img = sprite(id)!, b = blinkOf(id), ref = useBlink<SVGImageElement>();
  const w = h * (img.w / img.h);
  return (
    <g className="pa-npc al" data-alive={seed} style={{ transformOrigin: `${x}px ${y}px`, ...aliveStyle(seed) }}>
      <image data-art={art ?? id} href={img.src} x={x - w / 2} y={y - h} width={w} height={h} />
      {b && <image ref={ref} data-blink={id} href={b} x={x - w / 2} y={y - h} width={w} height={h} style={{ opacity: 0 }} />}
    </g>
  );
}
function HomeRoom() {
  const home = sprite('home')!, patch = sprite('floorPatch')!;
  return (
    <g>
      <image href={home.src} x={HX0} y={-100} width={HOME_IMG.w * HS} height={800} preserveAspectRatio="none" />
      <image href={patch.src} x={PX(FLOOR_PATCH[0])} y={PY(FLOOR_PATCH[1])} width={FLOOR_PATCH[2] * HS} height={FLOOR_PATCH[3] * HS} />
      <rect x={-60} y={-120} width={510} height={840} fill="#3A3442" opacity={0.2} />
    </g>
  );
}

export function Prologue({ onDone, canSkip }: { onDone: () => void; canSkip: boolean }) {
  const [step, setStep] = useState<Step>('p1');
  const [walk, setWalk] = useState(0);
  const [moving, setMoving] = useState(false);
  const [card, setCard] = useState<0 | 1 | 2>(0); // 리본 카드: 0 없음, 1 발견, 2 주머니에
  const [ribbon, setRibbon] = useState(false);
  const [talk, setTalk] = useState(0);
  const [ledger, setLedger] = useState(false);
  const [gain, setGain] = useState(false);
  const lock = useRef(false);
  // 추심원 말풍선도 한 글자씩 + 웅얼거림(U-36). 첫 줄은 말풍선이 뜨는 0.8초를 기다린다.
  const sp = useSpeech(TALK[talk].text, TALK[talk].who, { id: talk, active: step === 'p3' && !ledger, delay: talk === 0 ? 1 : 0.1 });
  // 말하는 동안 음절마다 몸이 살짝 들썩인다(U-43)
  const colRef = useRef<SVGGElement>(null);
  const heroRef = useRef<SVGGElement>(null);
  useEffect(() => { if (sp.typing) talkBob(TALK[talk].who === 'hero' ? heroRef.current : colRef.current, TALK[talk].text, sp.shown); }, [sp.shown]);
  const t = useRef<number[]>([]);
  const after = (ms: number, f: () => void) => { t.current.push(window.setTimeout(f, ms)); };
  useEffect(() => () => { t.current.forEach((x) => window.clearTimeout(x)); }, []);
  const finish = () => { try { localStorage.setItem(PROLOGUE_KEY, '1'); } catch { /* 저장소 막힘 */ } onDone(); };
  const go = (s: Step, ms = 500) => { lock.current = true; after(ms, () => { lock.current = false; setStep(s); }); };
  const hold = (ms = 450) => { lock.current = true; after(ms, () => { lock.current = false; }); };

  const tapStage = () => {
    if (lock.current || card) return;
    if (step === 'p1') {
      play('collector_steps', { vol: 0.5 });
      const n = walk + 1;
      setWalk(n);
      // 걷는 동안만 두 걸음을 번갈아 끼운다(U-46): 글라이드 시간 = 걸음 수 ÷ 초당 걸음
      setMoving(true); after(walkDur(n) * 1000, () => setMoving(false));
      if (n >= 2) go('p2', 900); else hold(600);
    } else if (step === 'p3' && !ledger) {
      if (sp.typing) { sp.finish(); return; }
      play('ui_tap');
      if (talk < TALK.length - 1) { setTalk(talk + 1); hold(); } else { play('overdue_stamp'); setLedger(true); hold(600); }
    }
  };
  const tapWheel = () => {
    if (lock.current || card) return;
    if (step === 'p2' && !ribbon) { play('unlock_tab'); setCard(1); hold(); }
    else if (step === 'p4' && !gain) { playTap(); setGain(true); lock.current = true; after(1100, finish); }
  };
  const tapCard = () => {
    if (lock.current) return;
    if (card === 1) { play('goal_complete'); setCard(2); hold(); return; }
    play('ui_tap'); setCard(0); setRibbon(true);
    after(250, () => play('collector_steps'));
    go('p3', 800);
  };
  const tapLedger = () => { if (lock.current) return; play('ui_tap'); setLedger(false); go('p4', 150); };

  // 개정 대본: 왜 오늘 해 지기 전에 여기 왔는지(사무소 봉투, 유품 인수), 빈 방에 쳇바퀴만 남은 까닭(반출 목록, 「수금용」 꼬리표)
  const caption = step === 'p1' ? (walk === 0 ? '장례를 마치고 오니 문틈에 오소리 사무소 봉투가 끼워져 있었다. 엄마 집에서 짐을 빼겠단다. 유품 인수는 오늘 해 질 때까지.' : '바퀴 자국 두 줄이 집 앞에서 큰길로 이어진다. 문에 붙은 반출 목록: 찬장, 식탁, 의자 둘.')
    : step === 'p2' ? (ribbon ? '' : '바닥에 찬장 자국이 희다. 쳇바퀴에 꼬리표가 붙어 있다. 「수금용, 반출 보류」')
    : step === 'p3' ? (talk === 0 && !ledger ? '문밖에서 수첩 모서리가 먼저 보인다.' : '') : gain ? '' : '추심원이 문간에서 몸을 비켜 준다. 쳇바퀴를 눌러 굴린다.';
  const hint = step === 'p1' ? '눌러서 걷기' : step === 'p2' && !ribbon ? '쳇바퀴 살펴보기' : step === 'p3' && !ledger ? '눌러서 계속' : '';
  const [hx, hy, hk] = WALK[Math.min(walk, 2)];
  const emptyImg = sprite('heroEmpty')!, backImg = spriteOr('heroWalkBack', 'heroWalkEmpty')!, rideImg = sprite('heroWheel')!, wheelImg = spriteOr('wheelEmpty', 'wheel')!, outside = sprite('prologue')!;

  return (
    <div className={'pr-pro s-' + step} role="dialog" aria-label="프롤로그" data-step={step} data-talk={talk} data-typing={sp.typing ? '1' : ''} onClick={tapStage}>
      {canSkip && <button className="pp-skip" onClick={(e) => { e.stopPropagation(); finish(); }}>건너뛰기</button>}
      <svg key={step} className="pp-stage" viewBox="0 -100 390 800" preserveAspectRatio="xMidYMid slice">
        {step === 'p1' && (
          <g>
            {/* 해 질 녘, 엄마가 살던 나무 밑동 집. 문 옆에 붉은 딱지 */}
            <image data-art="prologue" href={outside.src} x={-30} y={-100} width={450} height={800} preserveAspectRatio="xMidYMid slice" />
            {walk >= 1 && <circle className="pp-stamp" cx={318} cy={318} r={30} fill="none" stroke="#fff" strokeWidth={3} strokeDasharray="5 7" strokeLinecap="round" style={{ transformOrigin: '318px 318px' }} />}
            <g className="pp-walk" style={{ transform: `translate(${hx}px, ${hy}px) scale(${hk})`, transitionDuration: `${walkDur(Math.max(1, walk)).toFixed(2)}s` }} data-moving={moving ? '1' : ''}>
              <ellipse cx={0} cy={2} rx={24} ry={6} fill="#000" opacity={0.18} />
              {/* 폰은 아직 없다. 집 쪽(화면 안쪽)으로 걸어 들어가니 등이 보인다(U-43 사용자: "처음 집 갈 때 뒤돌며 걷는 것 같음"). 문 앞에 멈춰서도 집을 본다 */}
              <g className={moving ? '' : 'pa-npc al'} style={{ transformOrigin: '0px 0px', ...aliveStyle('hero-pro') }} data-face="back">
                {moving
                  ? <WalkFrames id="heroWalkBack" x={-36 * (backImg.w / backImg.h)} y={-72} w={72 * (backImg.w / backImg.h)} h={72} period={2 / STEPS_PER_SEC} />
                  : <image data-art="heroWalkBack" href={backImg.src} x={-36 * (backImg.w / backImg.h)} y={-72} width={72 * (backImg.w / backImg.h)} height={72} />}
              </g>
            </g>
          </g>
        )}
        {step !== 'p1' && (
          <g>
            <HomeRoom />
            <RoomRig on={step === 'p4' && gain} />
            <g data-hit="wheel" onClick={(e) => { e.stopPropagation(); tapWheel(); }} className={gain ? 'pa-jiggle' : ''} style={{ transformOrigin: `${WX}px ${WY}px` }}>
              {gain
                ? <image data-art="heroWheel" className="pa-jog" href={rideImg.src} x={WX - 54 * (rideImg.w / rideImg.h)} y={WY + 3 - 108} width={108 * (rideImg.w / rideImg.h)} height={108} />
                : <image data-art="wheelEmpty" href={wheelImg.src} x={WX - (EMPTY_WHEEL_H * HS * (wheelImg.w / wheelImg.h)) / 2} y={WY + EMPTY_WHEEL_DY * HS - EMPTY_WHEEL_H * HS} width={EMPTY_WHEEL_H * HS * (wheelImg.w / wheelImg.h)} height={EMPTY_WHEEL_H * HS} />}
              {!ribbon && <g className="pp-glowwrap"><circle className="pp-glow" cx={WX + 34} cy={WY - 88} r={22} fill="#F8D978" /><Ribbon x={WX + 34} y={WY - 88} k={0.7} /></g>}
              <rect x={WX - 66} y={WY - 112} width={132} height={130} fill="transparent" />
              {step === 'p2' && !ribbon && !card && <Finger x={WX} y={WY - 46} />}
              {step === 'p4' && !gain && <Finger x={WX} y={WY - 46} />}
              {gain && <text x={WX} y={WY - 122} textAnchor="middle" className="pa-float">+{TAP}</text>}
            </g>
            {/* 폰은 아직 없다: 빈손으로 서 있다. 굴리는 동안에는 쳇바퀴 안에 있다 */}
            {!(step === 'p4' && gain) && <g ref={heroRef}><Alive id="heroEmpty" seed="hero" x={HEROX} y={HEROY} h={HEROH} /></g>}
            {step === 'p3' && (
              <g className="pa-walkin">
                <g ref={colRef}><Alive id="cCollector" seed="collector" x={COLX} y={COLY} h={74} /></g>
                <g className={'pa-bubble' + (talk > 0 ? ' now' : '')} key={talk}>
                  <rect x={22} y={COLY - 192} width={346} height={84} rx={20} fill="#fff" stroke={O} strokeWidth={2.6} />
                  {/* 꼬리는 말하는 쪽을 가리킨다(추심원 또는 칩멍크) */}
                  {(() => { const tx = Math.max(48, Math.min(330, TALK[talk].who === 'hero' ? HEROX : COLX)); return <><path d={`M${tx - 14} ${COLY - 110} l14 22 l8 -22z`} fill="#fff" stroke={O} strokeWidth={2.6} strokeLinejoin="round" /><rect x={tx - 16} y={COLY - 116} width={26} height={6} fill="#fff" /></>; })()}
                  <foreignObject x={32} y={COLY - 188} width={326} height={76}><div className={'pp-say' + (TALK[talk].who === 'hero' ? ' by-hero' : '')} data-who={TALK[talk].who}><span>{TALK[talk].who === 'hero' && <b className="pp-who">칩멍크</b>}<Typed text={TALK[talk].text} shown={sp.shown} /></span></div></foreignObject>
                </g>
                <rect x={COLX - 65} y={COLY + 6} width={130} height={24} rx={12} fill={O} /><text x={COLX} y={COLY + 23} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fff">오소리 추심원</text>
              </g>
            )}
          </g>
        )}
      </svg>
      {step === 'p3' && !ledger && <div className="pp-dots" aria-label={`${talk + 1}/${TALK.length}`}>{TALK.map((_, k) => <i key={k} className={k <= talk ? 'on' : ''} />)}</div>}
      {caption && <div key={caption} className="pp-cap">{caption}</div>}
      {hint && <div className="pp-hint">{hint}</div>}
      {card > 0 && (
        <div className="pp-card-back" onClick={(e) => { e.stopPropagation(); tapCard(); }}>
          <div key={card} className="pp-card b-ribbon" data-card="ribbon">
            <svg viewBox="0 0 200 130" className="pp-art"><circle className="pp-glow" cx={100} cy={64} r={46} fill="#F8D978" /><g className={card === 2 ? 'pp-swing' : ''} style={{ transformOrigin: '100px 20px' }}><Ribbon x={100} y={62} k={1.9} /></g></svg>
            {card === 1 ? <><p>엄마가 머리에 매던 리본이다. 매듭이 두 개다.</p><small>하나만 지으면 꼭 풀린다고 했다.</small></> : <><p>풀어서 주머니에 넣는다.</p><small>문틀을 두드리는 소리가 난다.</small></>}
            <em>눌러서 계속</em>
          </div>
        </div>
      )}
      {ledger && (
        <div className="pp-card-back" onClick={(e) => { e.stopPropagation(); tapLedger(); }}>
          <div className="pp-card b-ledger" data-card="ledger">
            <p>추심원이 엄마 이름 아래에 새 줄을 긋는다.</p>
            <small>열쇠를 주머니에 넣는다. 리본이 같이 잡힌다.</small>
            <div className="pp-led"><span>남은 원금</span><b className="debt">{comma(DEBT_TOTAL)}</b></div>
            <div className="pp-led"><span>정산마다 이자</span><b className="debt">{comma(INTEREST)}</b></div>
            <div className="pp-led"><span>가진 돈</span><b><Acorn size={24} />0</b></div>
            <small>{ledgerNote(firstVisitSec(balance.settlement.introSec ?? balance.settlement.intervalSec))}</small>
            <em>눌러서 계속</em>
          </div>
        </div>
      )}
    </div>
  );
}

// 프롤로그(STORY_ACT1 v3 0장, U-29): 첫 실행이 곧 조작 설명. 30~60초, 탭으로 넘긴다.
// P1 엄마의 오두막 앞(문에 딱지) → P2 빈 방, 쳇바퀴 하나와 붉은 리본 → P3 추심원: 빚 30만 · 가진 돈 0 → P4 쳇바퀴를 굴린다(여기서부터 조작).
// 엄마의 죽음은 보여 주지 않는다. 새 그림은 만들지 않고 시제품 부품(art.tsx)으로 그린다. 숫자는 엔진 값.
import { useEffect, useRef, useState } from 'react';
import { O, Acorn } from './art';
import { sprite, spriteOr } from './sprites';
import { HOME_IMG, WHEEL_SLOTS, FLOOR_PATCH, HERO_SPOT, HERO_H, VISITOR_SPOT, EMPTY_WHEEL_H, EMPTY_WHEEL_DY } from './home';
import { play, playTap } from './audio';
import { balance, lenderById } from '../../engine/data';
import { comma } from '../../engine/util';
import { prologueTalk, LEDGER_NOTE } from './text';
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
  const [card, setCard] = useState<0 | 1 | 2>(0); // 리본 카드: 0 없음, 1 발견, 2 주머니에
  const [ribbon, setRibbon] = useState(false);
  const [talk, setTalk] = useState(0);
  const [ledger, setLedger] = useState(false);
  const [gain, setGain] = useState(false);
  const lock = useRef(false);
  // 추심원 말풍선도 한 글자씩 + 웅얼거림(U-36). 첫 줄은 말풍선이 뜨는 0.8초를 기다린다.
  const sp = useSpeech(TALK[talk], 'collector', { id: talk, active: step === 'p3' && !ledger, delay: talk === 0 ? 1 : 0.1 });
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

  const caption = step === 'p1' ? (walk === 0 ? '소식을 듣고, 엄마가 살던 오두막에 왔다.' : '창이 어둡다. 문에 붉은 딱지가 붙어 있다.')
    : step === 'p2' ? (ribbon ? '' : '안은 비었다. 다 실려 갔다. 쳇바퀴 하나만 남았다.')
    : step === 'p3' ? '' : gain ? '' : '가진 돈 0. 쳇바퀴를 눌러 굴린다.';
  const hint = step === 'p1' ? '화면을 누르면 걷는다' : step === 'p2' && !ribbon ? '쳇바퀴를 눌러 본다' : step === 'p3' && !ledger ? '탭하면 계속' : '';
  const [hx, hy, hk] = WALK[Math.min(walk, 2)];
  const emptyImg = sprite('heroEmpty')!, rideImg = sprite('heroWheel')!, wheelImg = spriteOr('wheelEmpty', 'wheel')!, walkImg = spriteOr('heroWalkEmpty', 'heroEmpty')!, colImg = sprite('cCollector')!, outside = sprite('prologue')!;

  return (
    <div className={'pr-pro s-' + step} role="dialog" aria-label="프롤로그" data-step={step} data-talk={talk} data-typing={sp.typing ? '1' : ''} onClick={tapStage}>
      {canSkip && <button className="pp-skip" onClick={(e) => { e.stopPropagation(); finish(); }}>건너뛰기</button>}
      <svg key={step} className="pp-stage" viewBox="0 -100 390 800" preserveAspectRatio="xMidYMid slice">
        {step === 'p1' && (
          <g>
            {/* 해 질 녘, 엄마가 살던 나무 밑동 집. 문 옆에 붉은 딱지 */}
            <image data-art="prologue" href={outside.src} x={-30} y={-100} width={450} height={800} preserveAspectRatio="xMidYMid slice" />
            {walk >= 1 && <circle className="pp-stamp" cx={318} cy={318} r={30} fill="none" stroke="#fff" strokeWidth={3} strokeDasharray="5 7" strokeLinecap="round" style={{ transformOrigin: '318px 318px' }} />}
            <g className="pp-walk" style={{ transform: `translate(${hx}px, ${hy}px) scale(${hk})` }}>
              <ellipse cx={0} cy={2} rx={24} ry={6} fill="#000" opacity={0.18} />
              {/* 폰은 아직 없다: 빈손으로 걷는 그림(U-41). 멈춰 선 마지막 걸음에는 서 있는 빈손 그림 */}
              {walk < 2
                ? <image data-art="heroWalkEmpty" href={walkImg.src} x={-36 * (walkImg.w / walkImg.h)} y={-72} width={72 * (walkImg.w / walkImg.h)} height={72} />
                : <image data-art="heroEmpty" href={emptyImg.src} x={-36 * (emptyImg.w / emptyImg.h)} y={-72} width={72 * (emptyImg.w / emptyImg.h)} height={72} />}
            </g>
          </g>
        )}
        {step !== 'p1' && (
          <g>
            <HomeRoom />
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
            {!(step === 'p4' && gain) && <image data-art="heroEmpty" href={emptyImg.src} x={HEROX - (HEROH * (emptyImg.w / emptyImg.h)) / 2} y={HEROY - HEROH} width={HEROH * (emptyImg.w / emptyImg.h)} height={HEROH} />}
            {step === 'p3' && (
              <g className="pa-walkin">
                <image data-art="cCollector" href={colImg.src} x={COLX - 37 * (colImg.w / colImg.h)} y={COLY - 74} width={74 * (colImg.w / colImg.h)} height={74} />
                <g className={'pa-bubble' + (talk > 0 ? ' now' : '')} key={talk}>
                  <rect x={22} y={COLY - 172} width={346} height={64} rx={20} fill="#fff" stroke={O} strokeWidth={2.6} />
                  <path d={`M${COLX - 14} ${COLY - 110} l14 22 l8 -22z`} fill="#fff" stroke={O} strokeWidth={2.6} strokeLinejoin="round" /><rect x={COLX - 16} y={COLY - 116} width={26} height={6} fill="#fff" />
                  <foreignObject x={32} y={COLY - 168} width={326} height={58}><div className="pp-say"><span><Typed text={TALK[talk]} shown={sp.shown} /></span></div></foreignObject>
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
            {card === 1 ? <><p>손잡이에 붉은 리본이 묶여 있다.</p><small>엄마가 머리에 묶던 것이다.</small></> : <><p>풀어서 주머니에 넣었다.</p><small>아직 따뜻하다.</small></>}
            <em>탭하면 계속</em>
          </div>
        </div>
      )}
      {ledger && (
        <div className="pp-card-back" onClick={(e) => { e.stopPropagation(); tapLedger(); }}>
          <div className="pp-card b-ledger" data-card="ledger">
            <p>추심원이 장부를 펼친다.</p>
            <div className="pp-led"><span>빚</span><b className="debt">{comma(DEBT_TOTAL)}</b></div>
            <div className="pp-led"><span>정산마다 이자</span><b className="debt">{comma(INTEREST)}</b></div>
            <div className="pp-led"><span>가진 돈</span><b><Acorn size={24} />0</b></div>
            <small>{LEDGER_NOTE}</small>
            <em>탭하면 계속</em>
          </div>
        </div>
      )}
    </div>
  );
}

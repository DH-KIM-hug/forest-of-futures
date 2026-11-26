// 프롤로그(STORY_ACT1 v3 0장, U-29): 첫 실행이 곧 조작 설명. 30~60초, 탭으로 넘긴다.
// P1 엄마의 오두막 앞(문에 딱지) → P2 빈 방, 쳇바퀴 하나와 붉은 리본 → P3 추심원: 빚 30만 · 가진 돈 0 → P4 쳇바퀴를 굴린다(여기서부터 조작).
// 엄마의 죽음은 보여 주지 않는다. 새 그림은 만들지 않고 시제품 부품(art.tsx)으로 그린다. 숫자는 엔진 값.
import { useEffect, useRef, useState } from 'react';
import { C, O, Cube, Room, Wheel, Badger, Acorn, dk } from './art';
import { play, playTap } from './audio';
import { balance, lenderById } from '../../engine/data';
import { comma } from '../../engine/util';
import { prologueTalk, LEDGER_NOTE } from './text';
import heroSide from './img/hero_side.png';
import heroFront from './img/hero_front.png';

export const PROLOGUE_KEY = 'fof.proto.prologue.v3';
export const prologueSeen = (): boolean => { try { return localStorage.getItem(PROLOGUE_KEY) === '1'; } catch { return false; } };

type Step = 'p1' | 'p2' | 'p3' | 'p4';
const DEBTS = balance.start.debts as Record<string, number>;
const DEBT_TOTAL = Object.values(DEBTS).reduce((a, b) => a + b, 0);
const CAPS = ((balance.start as unknown as { inheritedRateCap?: Record<string, number> }).inheritedRateCap ?? {}) as Record<string, number>;
/** 엄마 빚의 정산당 이자(엔진과 같은 식: 원금 × 물려받은 몫의 금리 상한) */
const INTEREST = Math.ceil(Object.entries(DEBTS).reduce((a, [id, p]) => a + p * Math.min(lenderById[id].rate, CAPS[id] ?? lenderById[id].rate), 0) - 1e-9);
const TAP: number = balance.mining.tapBase;
const WALK: [number, number][] = [[70, 560], [150, 500], [226, 452]];
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
/** 빈 방(집 탭과 같은 방): 바닥 + 벽 둘 + 실려 간 자국 + 창 */
function EmptyRoom() {
  const wall = '#D9B98A';
  return (
    <g>
      <rect x={-60} y={-120} width={510} height={840} fill="#4E4A52" />
      <Room cx={195} cy={600} hw={190} h={170} wall={wall} floor="#E3C9A0" />
      <path d="M52 470 L52 400 L112 370 L112 440z" fill="none" stroke={O} strokeWidth={1.8} strokeDasharray="5 6" />
      <path d="M250 392 L310 422 L310 362 L250 332z" fill="#33406A" stroke={O} strokeWidth={2.4} strokeLinejoin="round" />
      <path d="M280 347 v60" stroke={O} strokeWidth={2} />
      <Cube cx={104} cy={520} hw={26} h={5} fill="#EFE3CC" />
      <circle cx={340} cy={392} r={2.6} fill={dk(wall, 0.4)} />
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
  const [hx, hy] = WALK[Math.min(walk, 2)];

  return (
    <div className={'pr-pro s-' + step} role="dialog" aria-label="프롤로그" data-step={step} data-talk={talk} onClick={tapStage}>
      {canSkip && <button className="pp-skip" onClick={(e) => { e.stopPropagation(); finish(); }}>건너뛰기</button>}
      <svg key={step} className="pp-stage" viewBox="0 -100 390 800" preserveAspectRatio="xMidYMid slice">
        {step === 'p1' && (
          <g>
            <rect x={-60} y={-120} width={510} height={840} fill="#E9A873" /><circle cx={92} cy={150} r={56} fill="#F8D978" opacity={0.9} />
            {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={i * 80 - 10} cy={262 + (i % 2) * 14} r={64} fill="#7E9460" stroke={O} strokeWidth={2.5} />)}
            <rect x={-60} y={296} width={510} height={440} fill="#B5AE6C" />
            <path d="M-10 720 L40 560 L210 440 L262 430 L290 462 L150 590 L120 720z" fill={C.dirt} stroke={O} strokeWidth={2.5} strokeLinejoin="round" />
            {/* 엄마의 오두막: 통나무 벽, 맞배지붕, 어두운 창, 문에 딱지 */}
            <path d="M196 440 V300 L296 240 L396 300 V440z" fill="#B98552" stroke={O} strokeWidth={3} strokeLinejoin="round" />
            <path d="M180 312 L296 224 L412 312 L396 326 L296 250 L196 326z" fill="#7C5A3C" stroke={O} strokeWidth={3} strokeLinejoin="round" />
            {[340, 372, 404].map((y) => <path key={y} d={`M196 ${y} H396`} stroke={O} strokeWidth={1.6} opacity={0.3} />)}
            <rect x={322} y={336} width={46} height={40} rx={3} fill="#4d4a45" stroke={O} strokeWidth={2.6} />
            <rect x={232} y={350} width={54} height={90} rx={4} fill="#6B4A35" stroke={O} strokeWidth={3} />
            {walk >= 1 && <g className="pp-stamp" style={{ transformOrigin: '259px 388px' }}><rect x={238} y={374} width={42} height={28} rx={3} fill="#C8553D" stroke={O} strokeWidth={2.4} transform="rotate(-6 259 388)" /><text x={259} y={393} textAnchor="middle" fontSize={14} fontWeight={800} fill="#fff" transform="rotate(-6 259 388)">딱지</text></g>}
            <g className="pp-walk" style={{ transform: `translate(${hx}px, ${hy}px)` }}>
              <ellipse cx={0} cy={2} rx={22} ry={6} fill="#000" opacity={0.14} />
              <circle cx={-16} cy={-38} r={13} fill="#D8B078" stroke={O} strokeWidth={2.4} />
              <image href={heroSide} x={-30} y={-62} width={64} height={62} />
            </g>
          </g>
        )}
        {step !== 'p1' && (
          <g>
            <EmptyRoom />
            <g data-hit="wheel" onClick={(e) => { e.stopPropagation(); tapWheel(); }} className={gain ? 'pa-jiggle' : ''} style={{ transformOrigin: '214px 560px' }}>
              <Wheel cx={214} cy={560} w={104} col={C.dtc} spin={gain} />
              {!ribbon && <g className="pp-glowwrap"><circle className="pp-glow" cx={254} cy={476} r={22} fill="#F8D978" /><Ribbon x={254} y={476} k={0.8} /></g>}
              <rect x={150} y={440} width={130} height={130} fill="transparent" />
              {step === 'p2' && !ribbon && !card && <Finger x={214} y={500} />}
              {step === 'p4' && !gain && <Finger x={214} y={500} />}
              {gain && <text x={214} y={430} textAnchor="middle" className="pa-float">+{TAP}</text>}
            </g>
            {step === 'p4' && gain
              ? <image href={heroSide} x={186} y={470} width={58} height={56} />
              : <image href={heroFront} x={96} y={540} width={66} height={64} />}
            {step === 'p3' && (
              <g className="pa-walkin">
                <Badger cx={300} cy={600} h={96} />
                <g className={'pa-bubble' + (talk > 0 ? ' now' : '')} key={talk}>
                  <rect x={22} y={250} width={346} height={64} rx={20} fill="#fff" stroke={O} strokeWidth={2.6} />
                  <path d="M286 312 l14 22 l8 -22z" fill="#fff" stroke={O} strokeWidth={2.6} strokeLinejoin="round" /><rect x={284} y={306} width={26} height={6} fill="#fff" />
                  <foreignObject x={32} y={254} width={326} height={58}><div className="pp-say">{TALK[talk]}</div></foreignObject>
                </g>
                <rect x={236} y={206} width={130} height={24} rx={12} fill={O} /><text x={301} y={223} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fff">오소리 추심원</text>
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

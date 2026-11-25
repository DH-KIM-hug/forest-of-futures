// 프롤로그(기획서 v3.1 §8.5 + STORY_ACT1 0장): 첫 실행이 곧 조작 설명. 60~90초.
// P1 고향 도착 → P2 엄마의 빈 집, 상자 넷(앞치마 봉투 "급할 때" 100,000 · 사진 · 빚 장부 · 붉은 리본 → 폰 고리) → P3 딱지 → P4 공터 돌탑·텐트 → P5 첫 줍기.
// 엄마의 죽음은 보여 주지 않는다. 새 그림은 만들지 않고 시제품 부품(art.tsx)으로 그린다.
import { useEffect, useRef, useState } from 'react';
import { C, O, Cube, Dia, Room, Tent, Tree, Acorn } from './art';
import { play, playTap } from './audio';
import { balance } from '../../engine/data';
import { comma } from '../../engine/util';
import heroSide from './img/hero_side.png';
import heroFront from './img/hero_front.png';

export const PROLOGUE_KEY = 'fof.proto.prologue.v1';
export const prologueSeen = (): boolean => { try { return localStorage.getItem(PROLOGUE_KEY) === '1'; } catch { return false; } };

type Step = 'p1' | 'p2' | 'p3' | 'p4' | 'p5';
type Box = 'apron' | 'photo' | 'ledger' | 'ribbon';
const START_CASH: number = balance.start.cash;
const DEBTS = balance.start.debts as Record<string, number>;
const DEBT_TOTAL = Object.values(DEBTS).reduce((a, b) => a + b, 0);
const WALK: [number, number][] = [[84, 520], [150, 462], [222, 414], [290, 368]];
const BOXES: { id: Box; x: number; y: number; col: string }[] = [
  { id: 'apron', x: 112, y: 452, col: '#D8B078' }, { id: 'photo', x: 196, y: 494, col: '#CDA46C' },
  { id: 'ledger', x: 280, y: 452, col: '#C39A62' }, { id: 'ribbon', x: 196, y: 408, col: '#B98552' },
];

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

/** 상자에서 나온 물건 한 장. 탭하면 다음 박자로. */
function ItemCard({ box, stage }: { box: Box; stage: number }) {
  if (box === 'apron') return stage === 0 ? (
    <>
      <svg viewBox="0 0 200 130" className="pp-art"><path d="M70 14 h60 l10 30 v70 h-80 v-70z" fill="#F1E6D0" stroke={O} strokeWidth={3} strokeLinejoin="round" /><path d="M70 14 q30 -22 60 0" fill="none" stroke={O} strokeWidth={3} /><rect x={84} y={62} width={32} height={26} rx={4} fill="#E3D3B0" stroke={O} strokeWidth={2.4} /><path d="M158 20 v60" stroke="#9A6B45" strokeWidth={7} strokeLinecap="round" /><ellipse cx={158} cy={96} rx={15} ry={18} fill="#B98552" stroke={O} strokeWidth={3} /></svg>
      <p>앞치마와 나무 국자.</p><small>주머니가 불룩하다.</small>
    </>
  ) : (
    <>
      <svg viewBox="0 0 200 130" className="pp-art"><g transform="rotate(-5 100 65)"><rect x={38} y={30} width={124} height={76} rx={6} fill="#FBF3DC" stroke={O} strokeWidth={3} /><path d="M38 34 l62 40 l62 -40" fill="none" stroke={O} strokeWidth={2.6} strokeLinejoin="round" /><text x={100} y={98} textAnchor="middle" fontSize={17} fontWeight={800} fill="#6B4A35">「급할 때」</text></g></svg>
      <p>주머니에서 봉투 하나. 엄마 글씨다.</p>
      <div className="pp-num"><Acorn size={26} />{comma(START_CASH)}</div><small>엄마 비상금. 이게 가진 전부다.</small>
    </>
  );
  if (box === 'photo') return (
    <>
      <svg viewBox="0 0 200 130" className="pp-art">
        {[[-12, 52, '봄'], [3, 100, '여름'], [14, 148, '겨울']].map(([r, x, t], i) => (
          <g key={i} transform={`rotate(${r} ${x} 70)`}><rect x={+x - 34} y={22} width={68} height={86} rx={3} fill="#FFFDF8" stroke={O} strokeWidth={2.6} /><rect x={+x - 28} y={28} width={56} height={54} fill="#CFE0C0" stroke={O} strokeWidth={2} />
            <circle cx={+x - 8} cy={60} r={13} fill="#C98A52" stroke={O} strokeWidth={2} /><circle cx={+x + 12} cy={68} r={8} fill="#D98F4E" stroke={O} strokeWidth={2} /><text x={+x} y={100} textAnchor="middle" fontSize={11} fontWeight={700} fill="#625c53">{t}</text></g>
        ))}
      </svg>
      <p>폴라로이드 세 장. 엄마와 어린 나.</p><small>앨범의 첫 장이 된다.</small>
    </>
  );
  if (box === 'ledger') return (
    <>
      <svg viewBox="0 0 200 130" className="pp-art"><rect x={40} y={14} width={120} height={104} rx={6} fill="#F3E7C6" stroke={O} strokeWidth={3} /><path d="M100 14 v104" stroke={O} strokeWidth={2} /><path d="M52 40 h36 M52 56 h36 M52 72 h24 M112 40 h36" stroke={O} strokeWidth={2.4} strokeLinecap="round" opacity={0.6} />
        <g transform="rotate(-12 132 82)"><circle cx={132} cy={82} r={24} fill="none" stroke="#C8553D" strokeWidth={4} /><circle cx={132} cy={84} r={12} fill="none" stroke="#C8553D" strokeWidth={3} /><path d="M126 66 l2 14 M138 66 l-2 14" stroke="#C8553D" strokeWidth={4} strokeLinecap="round" /><circle cx={127} cy={84} r={2} fill="#C8553D" /><circle cx={137} cy={84} r={2} fill="#C8553D" /></g></svg>
      <p>빚 장부. 붉은 오소리 도장.</p>
      <div className="pp-num debt">{comma(DEBT_TOTAL)}</div>
      <small>오소리 대부 {comma(DEBTS.shark1 ?? 0)} · 숲속 캐피탈 {comma(DEBTS.capital ?? 0)}. 엄마의 빚이 내 빚이 됐다.</small>
    </>
  );
  return stage === 0 ? (
    <>
      <svg viewBox="0 0 200 130" className="pp-art"><circle className="pp-glow" cx={100} cy={64} r={46} fill="#F8D978" /><Ribbon x={100} y={62} k={1.9} /></svg>
      <p>상자 바닥에 붉은 리본.</p><small>은은하게 빛난다.</small>
    </>
  ) : (
    <>
      <svg viewBox="0 0 200 130" className="pp-art"><rect x={70} y={8} width={52} height={96} rx={11} fill="#9AD0C2" stroke={O} strokeWidth={3.4} /><rect x={78} y={20} width={36} height={60} rx={4} fill="#E6F4EF" stroke={O} strokeWidth={2.2} />
        <g className="pp-swing" style={{ transformOrigin: '122px 96px' }}><path d="M122 96 l14 12" stroke={O} strokeWidth={2.4} strokeLinecap="round" /><Ribbon x={140} y={112} k={0.75} /></g></svg>
      <p>폰 고리에 리본을 묶었다.</p><small>폰이 달랑, 한 번 흔들린다.</small>
    </>
  );
}

export function Prologue({ onDone, canSkip }: { onDone: () => void; canSkip: boolean }) {
  const [step, setStep] = useState<Step>('p1');
  const [walk, setWalk] = useState(0);
  const [open, setOpen] = useState<Box[]>([]);
  const [card, setCard] = useState<{ box: Box; stage: number } | null>(null);
  const [stone, setStone] = useState(false);
  const [tent, setTent] = useState(false);
  const [gain, setGain] = useState(false);
  const lock = useRef(false);
  const t = useRef<number[]>([]);
  const after = (ms: number, f: () => void) => { t.current.push(window.setTimeout(f, ms)); };
  useEffect(() => () => { t.current.forEach((x) => window.clearTimeout(x)); }, []);
  const finish = () => { try { localStorage.setItem(PROLOGUE_KEY, '1'); } catch { /* 저장소 막힘 */ } onDone(); };
  const go = (s: Step, ms = 500) => { lock.current = true; after(ms, () => { lock.current = false; setStep(s); }); };
  const allThree = (['apron', 'photo', 'ledger'] as Box[]).every((b) => open.includes(b));

  const tapStage = () => {
    if (lock.current || card) return;
    if (step === 'p1') {
      play('collector_steps', { vol: 0.5 });
      const n = walk + 1;
      setWalk(n);
      if (n >= 3) go('p2', 900);
    } else if (step === 'p3') { play('ui_tap'); go('p4', 150); }
  };
  const tapBox = (b: Box) => {
    if (lock.current || card) return;
    if (b === 'ribbon' && !allThree) { play('insufficient'); return; }
    play(b === 'ledger' ? 'overdue_stamp' : b === 'ribbon' ? 'unlock_tab' : 'ui_tap');
    setCard({ box: b, stage: 0 });
  };
  const tapCard = () => {
    if (!card || lock.current) return;
    const two = card.box === 'apron' || card.box === 'ribbon';
    if (two && card.stage === 0) { play(card.box === 'apron' ? 'buy' : 'goal_complete'); setCard({ box: card.box, stage: 1 }); return; }
    play('ui_tap');
    if (!open.includes(card.box)) setOpen([...open, card.box]);
    const wasRibbon = card.box === 'ribbon';
    setCard(null);
    if (wasRibbon) { after(250, () => play('collector_steps')); go('p3', 700); }
  };
  const tapStone = () => {
    if (lock.current || stone) return;
    play('buy'); setStone(true); lock.current = true;
    after(700, () => { setTent(true); play('new_equipment'); });
    after(1700, () => { lock.current = false; setStep('p5'); });
  };
  const tapPile = () => {
    if (lock.current || gain) return;
    playTap(); setGain(true); lock.current = true;
    after(1100, finish);
  };

  const caption = step === 'p1' ? (walk === 0 ? '소식을 듣고, 고향에 돌아왔다.' : walk < 3 ? '길 끝의 집 하나만 창이 어둡다.' : '…')
    : step === 'p2' ? (open.length === 0 ? '엄마의 빈 집. 바닥에 상자 넷.' : allThree && !open.includes('ribbon') ? '마지막 상자의 뚜껑이 들썩인다.' : '상자를 눌러 연다.')
    : step === 'p3' ? '' : step === 'p4' ? (stone ? '오늘부터 여기가 집이다.' : '참나무 아래 빈 땅. 돌 하나를 놓는다.') : gain ? '' : '낙엽 더미를 누르면 도토리를 줍는다.';
  const hint = step === 'p1' && walk < 3 ? '화면을 누르면 걷는다' : step === 'p3' ? '탭하면 계속' : '';
  const [hx, hy] = WALK[Math.min(walk, 3)];

  return (
    <div className={'pr-pro s-' + step} role="dialog" aria-label="프롤로그" data-step={step} onClick={tapStage}>
      {canSkip && <button className="pp-skip" onClick={(e) => { e.stopPropagation(); finish(); }}>건너뛰기</button>}
      <svg key={step} className="pp-stage" viewBox="0 -100 390 800" preserveAspectRatio="xMidYMid slice">
        {step === 'p1' && (
          <g>
            <rect x={-60} y={-120} width={510} height={840} fill="#F2B27A" /><circle cx={300} cy={150} r={60} fill="#F8D978" opacity={0.9} />
            {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={i * 80 - 10} cy={250 + (i % 2) * 14} r={62} fill="#8E9E63" stroke={O} strokeWidth={2.5} />)}
            <rect x={-60} y={280} width={510} height={440} fill="#B9B36E" />
            <path d="M-10 720 L60 520 L250 400 L330 330 L390 318 L390 380 L300 430 L150 560 L130 720z" fill={C.dirt} stroke={O} strokeWidth={2.5} strokeLinejoin="round" />
            {[[70, 400, true], [150, 350, true], [240, 320, true]].map(([x, y], i) => (
              <g key={i}><Room cx={+x} cy={+y} hw={34} h={26} wall={C.wall} /><rect x={+x - 22} y={+y - 36} width={11} height={10} rx={2} fill="#F8D978" stroke={O} strokeWidth={1.8} /></g>
            ))}
            <g><Room cx={338} cy={318} hw={38} h={30} wall="#A9785A" /><rect x={314} y={276} width={12} height={11} rx={2} fill="#4d4a45" stroke={O} strokeWidth={1.8} /></g>
            <g className="pp-walk" style={{ transform: `translate(${hx}px, ${hy}px)` }}>
              <ellipse cx={0} cy={2} rx={22} ry={6} fill="#000" opacity={0.14} />
              <circle cx={-16} cy={-38} r={13} fill="#D8B078" stroke={O} strokeWidth={2.4} />
              <image href={heroSide} x={-30} y={-62} width={64} height={62} />
            </g>
          </g>
        )}
        {step === 'p2' && (
          <g>
            <rect x={-60} y={-120} width={510} height={840} fill="#5B5348" />
            <Room cx={195} cy={540} hw={186} h={170} wall="#C9A77E" floor="#E3C08D" />
            <rect x={70} y={258} width={44} height={52} rx={2} fill="none" stroke="#A98A62" strokeWidth={2.5} strokeDasharray="5 6" transform="skewY(-26) translate(0 60)" />
            <Cube cx={300} cy={404} hw={40} h={14} fill="#F1E6D0" /><Cube cx={322} cy={384} hw={14} h={8} fill="#fff" />
            {[...BOXES].sort((a, b) => a.y - b.y).map((b) => {
              const done = open.includes(b.id);
              const wob = b.id === 'ribbon' && allThree && !done;
              return (
                <g key={b.id} className={'pp-box' + (done ? ' done' : '') + (wob ? ' wob' : '')} data-box={b.id} onClick={(e) => { e.stopPropagation(); tapBox(b.id); }} style={{ transformOrigin: `${b.x}px ${b.y}px` }}>
                  <Cube cx={b.x} cy={b.y} hw={30} h={24} fill={b.col} />
                  {!done && <path d={`M${b.x - 30} ${b.y - 39} L${b.x} ${b.y - 24} L${b.x + 30} ${b.y - 39}`} fill="none" stroke={O} strokeWidth={2} opacity={0.5} />}
                  {b.id === 'ribbon' && allThree && !done && <circle className="pp-glow" cx={b.x} cy={b.y - 40} r={20} fill="#F8D978" />}
                  <rect x={b.x - 34} y={b.y - 62} width={68} height={66} fill="transparent" />
                </g>
              );
            })}
            <image href={heroFront} x={52} y={500} width={66} height={64} />
          </g>
        )}
        {step === 'p3' && (
          <g>
            <rect x={-60} y={-120} width={510} height={840} fill="#8E86A7" />
            <rect x={-60} y={420} width={510} height={300} fill="#9AA06B" />
            <path d="M40 430 V170 L195 80 L350 170 V430z" fill="#A9785A" stroke={O} strokeWidth={3} strokeLinejoin="round" />
            <rect x={150} y={250} width={90} height={180} rx={6} fill="#6B4A35" stroke={O} strokeWidth={3} />
            <g className="pp-stamp" style={{ transformOrigin: '196px 300px' }}><rect x={166} y={278} width={60} height={42} rx={4} fill="#C8553D" stroke={O} strokeWidth={2.6} transform="rotate(-6 196 300)" /><text x={196} y={306} textAnchor="middle" fontSize={17} fontWeight={800} fill="#fff" transform="rotate(-6 196 300)">퇴거</text></g>
            <g className="pa-walkin"><ellipse cx={92} cy={470} rx={52} ry={12} fill="#000" opacity={0.16} /><rect x={44} y={300} width={96} height={170} rx={40} fill="#4d4a45" stroke={O} strokeWidth={3} /><circle cx={92} cy={282} r={40} fill="#5d5446" stroke={O} strokeWidth={3} /><circle cx={78} cy={278} r={4} fill="#fff" /><circle cx={106} cy={278} r={4} fill="#fff" /><path d="M78 298 h28" stroke="#fff" strokeWidth={3} strokeLinecap="round" /></g>
            <image href={heroFront} x={262} y={410} width={70} height={68} />
            <g className="pa-bubble"><rect x={96} y={186} width={236} height={46} rx={23} fill="#fff" stroke={O} strokeWidth={2.6} /><path d="M128 230 l-10 18 l26 -18z" fill="#fff" stroke={O} strokeWidth={2.6} strokeLinejoin="round" /><rect x={124} y={224} width={22} height={6} fill="#fff" /><text x={214} y={215} textAnchor="middle" fontSize={17} fontWeight={800} fill="#B8432C">이 집, 오늘까지입니다.</text></g>
          </g>
        )}
        {(step === 'p4' || step === 'p5') && (
          <g>
            <rect x={-60} y={-120} width={510} height={840} fill={C.grass} />
            {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={i * 78 - 6} cy={150 + (i % 2) * 16} r={66} fill={C.forest1} stroke={O} strokeWidth={2.5} />)}
            <Dia cx={195} cy={560} hw={200} fill={C.lot} dash="2 9" />
            <Tree cx={300} cy={380} r={62} h={80} />
            {stone && <g className="pa-pop"><Cube cx={346} cy={452} hw={15} h={11} fill={C.stone} /></g>}
            {step === 'p4' && !stone && <g data-hit="stone" onClick={(e) => { e.stopPropagation(); tapStone(); }}><Cube cx={258} cy={500} hw={15} h={11} fill={C.stone} /><Finger x={258} y={486} /><rect x={220} y={450} width={80} height={76} fill="transparent" /></g>}
            {tent && <g className="pa-pop"><Tent cx={108} cy={490} s={0.95} /></g>}
            <image href={heroFront} x={162} y={470} width={66} height={64} />
            {step === 'p5' && (
              <g data-hit="pile" onClick={(e) => { e.stopPropagation(); tapPile(); }}>
                <g className={gain ? 'pa-jiggle' : ''} style={{ transformOrigin: '270px 520px' }}>
                  <Dia cx={270} cy={534} hw={44} fill="#C9A46A" />
                  {[[254, 512], [276, 518], [290, 506], [264, 500], [284, 494]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={5.5} ry={6.5} fill={C.dtc} stroke={O} strokeWidth={2} />)}
                </g>
                {!gain && <Finger x={270} y={508} />}
                {gain && <text x={270} y={470} textAnchor="middle" className="pa-float">+{balance.progression.acornPerTap}</text>}
                <rect x={220} y={470} width={100} height={80} fill="transparent" />
              </g>
            )}
          </g>
        )}
      </svg>
      {step === 'p2' && <div className="pp-dots" aria-label={`상자 ${open.length}/4`}>{BOXES.map((b) => <i key={b.id} className={open.includes(b.id) ? 'on' : ''} />)}</div>}
      {caption && <div key={caption} className="pp-cap">{caption}</div>}
      {hint && <div className="pp-hint">{hint}</div>}
      {card && (
        <div className="pp-card-back" onClick={(e) => { e.stopPropagation(); tapCard(); }}>
          <div key={card.box + card.stage} className={'pp-card b-' + card.box} data-card={card.box}>
            <ItemCard box={card.box} stage={card.stage} />
            <em>탭하면 계속</em>
          </div>
        </div>
      )}
    </div>
  );
}

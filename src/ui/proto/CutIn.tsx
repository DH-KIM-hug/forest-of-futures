// 컷인 대화(§7.6·7.7, U-8·U-9): 사람이 크게 올라오고 이름표 + 한 줄씩. 탭으로 넘긴다. 아래에 진행 점.
// 정산 컷인도 같은 틀을 쓴다(이자 금액은 추심원 대사에, 내 정산 합계는 따로 — U-23).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto, type Scene, type Who } from './protoStore';
import { WHO_NAME } from './text';
import { comma } from '../../engine/util';
import { Badger, O } from './art';
import { play } from './audio';
import { Typed, useSpeech } from './speech';
import { say } from './watch';
import { hlPanel, hlSel, hlTab, markTip } from './guide';

const TAB_LABEL: Record<string, string> = { map: '지도', phone: '거래소', lot: '집' };
import heroFront from './img/hero_front.png';
import { sprite } from './sprites';

/** 오소리 대부 반신. win=웃음, 아니면 정색 */
function BossBust({ win }: { win: boolean }) {
  return (
    <svg className="bust" viewBox="20 300 350 430" aria-hidden="true">
      <polygon points="40,844 70,640 320,640 350,844" fill="#5d5446" stroke={O} strokeWidth={3} strokeLinejoin="round" />
      <polygon points="170,640 195,720 220,640" fill="#E9D9B4" stroke={O} strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={85} cy={360} r={46} fill="#8C8478" stroke={O} strokeWidth={3} /><circle cx={305} cy={360} r={46} fill="#8C8478" stroke={O} strokeWidth={3} />
      <circle cx={85} cy={360} r={24} fill="#5d5446" stroke={O} strokeWidth={2} /><circle cx={305} cy={360} r={24} fill="#5d5446" stroke={O} strokeWidth={2} />
      <ellipse cx={195} cy={470} rx={150} ry={150} fill="#8C8478" stroke={O} strokeWidth={3} />
      <ellipse cx={195} cy={488} rx={100} ry={98} fill="#EFE8DA" stroke={O} strokeWidth={2.5} />
      <polygon points="160,330 185,330 178,400 150,396" fill="#3d3a36" stroke={O} strokeWidth={2} /><polygon points="205,330 230,330 240,396 212,400" fill="#3d3a36" stroke={O} strokeWidth={2} />
      <circle cx={152} cy={470} r={6} fill={O} /><circle cx={238} cy={470} r={6} fill={O} />
      {win
        ? <path d="M138 454 q14 -8 28 -2 M224 452 q14 -6 28 2" fill="none" stroke={O} strokeWidth={3} strokeLinecap="round" />
        : <path d="M136 446 l30 10 M254 446 l-30 10" fill="none" stroke={O} strokeWidth={4} strokeLinecap="round" />}
      <ellipse cx={195} cy={512} rx={13} ry={9} fill={O} />
      {win
        ? <path d="M158 538 q37 28 74 0" fill="none" stroke={O} strokeWidth={3.5} strokeLinecap="round" />
        : <path d="M166 548 h58" fill="none" stroke={O} strokeWidth={3.5} strokeLinecap="round" />}
      <g transform="rotate(-10 300 690)"><rect x={262} y={640} width={78} height={96} rx={6} fill="#F3E7C6" stroke={O} strokeWidth={3} /><path d="M276 666 h50 M276 684 h50 M276 702 h34" stroke={O} strokeWidth={2.5} strokeLinecap="round" /></g>
    </svg>
  );
}

/** 둥근 얼굴 하나로 그리는 조연(족제비·너구리): 귀 + 얼굴 + 주둥이. 새 그림은 만들지 않는다. */
function Face({ fur, muzzle, mask, smile, slim }: { fur: string; muzzle: string; mask?: boolean; smile: boolean; slim?: boolean }) {
  if (slim) return (
    <svg className="bust" viewBox="0 0 200 200" aria-hidden="true">
      <path d="M52 200 q6 -58 48 -58 q42 0 48 58z" fill={fur} stroke={O} strokeWidth={3} strokeLinejoin="round" />
      <path d="M100 150 l-22 -12 v24z M100 150 l22 -12 v24z" fill="#C8553D" stroke={O} strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={66} cy={40} r={12} fill={fur} stroke={O} strokeWidth={3} /><circle cx={134} cy={40} r={12} fill={fur} stroke={O} strokeWidth={3} />
      <ellipse cx={100} cy={88} rx={46} ry={62} fill={fur} stroke={O} strokeWidth={3} />
      <path d="M70 96 q30 -34 60 0 q4 44 -30 50 q-34 -6 -30 -50z" fill={muzzle} />
      <path d="M74 76 q8 -8 16 0 M110 76 q8 -8 16 0" fill="none" stroke={O} strokeWidth={3.2} strokeLinecap="round" />
      <ellipse cx={100} cy={108} rx={6} ry={4.5} fill={O} />
      <path d="M84 120 q16 14 32 0" fill="none" stroke={O} strokeWidth={3} strokeLinecap="round" />
      <path d="M62 110 h-22 M62 118 l-20 6 M138 110 h22 M138 118 l20 6" stroke={O} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
  return (
    <svg className="bust" viewBox="0 0 200 200" aria-hidden="true">
      <path d="M30 200 q10 -62 70 -62 q60 0 70 62z" fill={fur} stroke={O} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={52} cy={48} r={20} fill={fur} stroke={O} strokeWidth={3} /><circle cx={148} cy={48} r={20} fill={fur} stroke={O} strokeWidth={3} />
      <ellipse cx={100} cy={92} rx={66} ry={60} fill={fur} stroke={O} strokeWidth={3} />
      {mask && <path d="M40 80 q60 -22 120 0 q-4 30 -60 26 q-56 4 -60 -26z" fill="#4d4a45" />}
      <ellipse cx={100} cy={114} rx={34} ry={26} fill={muzzle} />
      <circle cx={76} cy={86} r={5} fill={mask ? '#fff' : O} /><circle cx={124} cy={86} r={5} fill={mask ? '#fff' : O} />
      <ellipse cx={100} cy={104} rx={8} ry={6} fill={O} />
      {smile ? <path d="M82 118 q18 16 36 0" fill="none" stroke={O} strokeWidth={3} strokeLinecap="round" /> : <path d="M86 122 h28" fill="none" stroke={O} strokeWidth={3} strokeLinecap="round" />}
    </svg>
  );
}

function Bust({ who, smile }: { who: Who; smile: boolean }) {
  // 새 그림이 들어온 인물은 그 그림으로(sprites.ts: boss · weasel · collector)
  const art = who === 'boss' || who === 'weasel' || who === 'collector' ? sprite(who) : null;
  if (art) return <img className="bust" src={art.src} alt="" />;
  switch (who) {
    case 'boss': return <BossBust win={smile} />;
    case 'collector': return <svg className="bust" viewBox="0 0 200 200" aria-hidden="true"><Badger cx={100} cy={196} h={180} /></svg>;
    case 'weasel': return <Face slim fur="#C9B08A" muzzle="#FFF8E4" smile={smile} />;
    case 'hero': return <img className="bust hero" src={heroFront} alt="" />;
    case 'sms': return (
      <svg className="bust" viewBox="0 0 200 200" aria-hidden="true">
        <rect x={56} y={14} width={88} height={176} rx={18} fill="#9AD0C2" stroke={O} strokeWidth={4} /><rect x={66} y={32} width={68} height={130} rx={6} fill="#E6F4EF" stroke={O} strokeWidth={2.5} />
        <rect x={72} y={46} width={50} height={26} rx={9} fill="#fff" stroke={O} strokeWidth={2.2} /><path d="M78 56 h36 M78 63 h24" stroke={O} strokeWidth={2.4} strokeLinecap="round" />
        <circle cx={132} cy={40} r={11} fill="#C8553D" stroke={O} strokeWidth={2.5} /><text x={132} y={45} textAnchor="middle" fontSize={14} fontWeight={800} fill="#fff">1</text>
      </svg>
    );
    default: return null;
  }
}

interface Spot { x: number; y: number; w: number; h: number; H: number; W: number }
/** 대사 카드와 인물이 차지하는 높이(대략). 비추는 조각이 이 안에 들면 카드를 위로 올린다. */
const CARD_ZONE = 300;

export function CutIn() {
  const sc: Scene | undefined = useProto((s) => s.scenes[0]);
  const over = useGame((s) => s.g.run.over);
  if (!sc || over) return null;
  return <CutInScene key={sc.id} sc={sc} />;
}

function CutInScene({ sc }: { sc: Scene }) {
  const [i, setI] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // 쳇바퀴를 연타하던 손가락이 대사를 넘겨 버리지 않게, 줄이 뜨고 0.6초는 탭을 받지 않는다
  const shownAt = useRef(performance.now());
  const held = useRef(false);
  const n = sc.lines.length;
  const line = sc.lines[Math.min(i, n - 1)];
  const last = i >= n - 1;
  // 말하는 줄은 한 글자씩 나오며 웅얼거린다(U-36). 지문·문자는 한 번에 뜬다. 첫 줄은 카드가 올라온 뒤에 시작한다.
  const sp = useSpeech(line.text, line.who, { id: i, delay: i === 0 ? 0.3 : 0.05 });

  useEffect(() => {
    play('cutin_whoosh');
    // 설명이 든 장면은 읽는 동안 게임 시계를 멈춘다(정산 막대를 설명하는 사이에 정산이 오지 않게). 이미 멈춰 있으면 건드리지 않는다.
    if (sc.hold && useGame.getState().speed !== 0) { held.current = true; useGame.getState().setSpeed(0); }
  }, []);
  const end = () => {
    const P = useProto.getState();
    const cur = P.scenes[0];
    if (!cur) return;
    const patch: Record<string, unknown> = { scenes: P.scenes.slice(1), seen: { ...P.seen, [cur.id]: true } };
    if (cur.unlock && !P.everUnlocked[cur.unlock]) {
      patch.everUnlocked = { ...P.everUnlocked, [cur.unlock]: true };
      patch.visited = { ...P.visited, [cur.unlock]: false };
      play('unlock_tab');
      say(`${TAB_LABEL[cur.unlock]} 탭이 열렸다!`);
    }
    if (held.current) { held.current = false; useGame.getState().setSpeed(1); }
    P.patch(patch);
    cur.onEnd?.();
  };
  // 가만두면 넘어가는 장면(막지 않는 한두 줄): 줄마다 auto 밀리초
  useEffect(() => {
    if (!sc.auto) return;
    // 다 말하고 1.2초는 읽을 틈을 준다(긴 줄이 말하는 도중에 넘어가지 않게)
    const t = window.setTimeout(() => { if (last) end(); else setI((k) => k + 1); }, Math.max(sc.auto, (sp.dur + 1.2) * 1000));
    return () => window.clearTimeout(t);
  }, [i]);
  // 설명 줄은 화면에 뜬 순간 '봤다'고 적는다(평생 한 번)
  useEffect(() => { if (line.tip) markTip(line.tip); }, [i]);
  // 이 줄이 비추는 화면 조각의 자리를 잰다(다른 탭에 있으면 그 탭으로 넘긴다). 조각이 없으면 그냥 대사만 나온다.
  useLayoutEffect(() => {
    if (!line.hl) { setSpot(null); return; }
    const tab = hlTab(line.hl);
    const P = useProto.getState();
    if (tab && P.tab !== tab && (tab === 'lot' || P.everUnlocked[tab])) P.setTab(tab);
    // 집 아래 판은 이 줄이 짚는 것이 보이는 상태로 맞춘다(U-34: 세상의 쳇바퀴·한 줄 = 접힘, 칸·견줌 막대 = 펴짐)
    const panel = hlPanel(line.hl);
    if (panel) P.setPanel(panel === 'open');
    const sel = hlSel(line.hl);
    let scrolled = false;
    const measure = () => {
      const el = document.querySelector(sel);
      const box = root.current?.getBoundingClientRect();
      if (!el || !box) { setSpot(null); return; }
      if (!scrolled) { scrolled = true; el.scrollIntoView({ block: 'nearest' }); }
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) { setSpot(null); return; }
      const x = Math.max(4, b.left - box.left - 5), y = Math.max(4, b.top - box.top - 5);
      const w = Math.min(box.width - 4, b.right - box.left + 5) - x, h = Math.min(box.height - 4, b.bottom - box.top + 5) - y;
      setSpot((o) => (o && Math.abs(o.x - x) < 0.5 && Math.abs(o.y - y) < 0.5 && Math.abs(o.w - w) < 0.5 && Math.abs(o.h - h) < 0.5 && o.H === box.height ? o : { x, y, w, h, H: box.height, W: box.width }));
    };
    measure();
    const t = window.setInterval(measure, 180);
    return () => window.clearInterval(t);
  }, [i]);

  const smile = line.mood ? line.mood === 'smile' : sc.settle ? sc.settle.win : true;
  const pick = last ? sc.choices : undefined;
  const guarded = () => performance.now() - shownAt.current < 600;
  // 글자가 나오는 중에 누르면 그 줄이 바로 다 보이고 소리가 멎는다. 한 번 더 누르면 전처럼 넘어간다.
  const next = () => { if (guarded()) return; if (sp.typing) { sp.finish(); return; } if (last && pick) return; shownAt.current = performance.now(); if (last) end(); else { play('ui_tap'); setI(i + 1); } };
  const choose = (run: () => void) => { if (guarded()) return; play('ui_tap'); end(); run(); };
  /** 설명 건너뛰기: 이 장면의 설명 줄을 전부 본 것으로 적고 닫는다. 고를 것이 있는 장면은 고르는 줄로 간다. */
  const skip = () => {
    if (guarded()) return;
    for (const l of sc.lines) if (l.tip) markTip(l.tip);
    play('ui_tap');
    if (sc.choices) { shownAt.current = performance.now(); setI(n - 1); } else end();
  };
  const st = sc.settle;
  // 비추는 조각이 화면 아래쪽(대사 카드 자리)에 있으면 카드를 위로 올린다
  const top = !!spot && spot.y + spot.h > spot.H - CARD_ZONE;
  return (
    <div ref={root} className={'pr-cutin who-' + line.who + (st && !st.win ? ' lose' : ' win') + (line.hl ? ' hl' : '') + (spot ? ' spot' : '') + (top ? ' top' : '')} onClick={next} role="dialog" aria-label="컷인 대화"
      data-scene={sc.id} data-line={i} data-typing={sp.typing ? '1' : ''} data-tip={line.tip ?? ''} data-spot={spot ? line.hl : ''}>
      {spot && <div className="pr-spot" style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h }} aria-hidden="true"><i className={'arr ' + (top ? 'dn' : 'up')} /></div>}
      <div key={line.who} className="bustbox"><Bust who={line.who} smile={smile} /></div>
      {st && !st.win && <div className="stamp">연체</div>}
      <div className={'say' + (line.who === 'note' ? ' note' : '') + (line.who === 'sms' ? ' sms' : '')}>
        {WHO_NAME[line.who] && <div className="tag">{WHO_NAME[line.who]}</div>}
        {sc.guide && !last && <button className="skip" data-skip onClick={(e) => { e.stopPropagation(); skip(); }}>설명 건너뛰기</button>}
        <p key={i}><Typed text={line.text} shown={sp.shown} /></p>
        {st && i === 0 && (
          <div className="meta"><span>내 정산 합계 <b className={st.net >= 0 ? 'up' : 'dn'}>{st.net >= 0 ? '+' : '−'}{comma(Math.abs(st.net))}</b></span><span>채굴 − 전기 − 이자 − 생활비</span></div>
        )}
        {n > 1 && <div className="dots" aria-label={`${i + 1}/${n}`}>{sc.lines.map((_, k) => <i key={k} className={k <= i ? 'on' : ''} />)}</div>}
        {last && sc.unlock && !pick && <div className="unl">끝나면 {TAB_LABEL[sc.unlock]} 탭이 열린다</div>}
        {pick && (
          <div className="pick">
            {pick.map((c) => (
              <button key={c.id} className={'buy' + (c.primary ? ' on' : '')} data-choice={c.id} onClick={(e) => { e.stopPropagation(); choose(c.run); }}><span>{c.label}</span>{c.sub && <small>{c.sub}</small>}</button>
            ))}
          </div>
        )}
        {!pick && <em>{last ? '탭하면 닫기' : '탭하면 다음'}</em>}
      </div>
    </div>
  );
}

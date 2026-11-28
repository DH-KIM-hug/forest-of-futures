// 컷인 대화(§7.6·7.7, U-8·U-9): 사람이 크게 올라오고 이름표 + 한 줄씩. 탭으로 넘긴다. 아래에 진행 점.
// 정산 컷인도 같은 틀을 쓴다(이자 금액은 추심원 대사에, 내 정산 합계는 따로 — U-23).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto, type Scene, type Who } from './protoStore';
import { WHO_NAME } from './text';
import { comma } from '../../engine/util';
import { O } from './art';
import { play } from './audio';
import { Typed, useSpeech } from './speech';
import { say } from './watch';
import { hlPanel, hlSel, hlTab, markTip } from './guide';
import { choicesShown } from './rankUnlock';

const TAB_LABEL: Record<string, string> = { map: '지도', phone: '거래소', lot: '집' };
import heroFront from './img/hero_front.png';
import { sprite, BUST_OF, blinkOf } from './sprites';
import { aliveStyle, talkBob, useBlink } from './alive';

function Bust({ who, sceneId, phone }: { who: Who; smile: boolean; sceneId?: string; phone?: boolean }) {
  // 반신은 전부 새 그림이다(U-40, sprites.ts BUST_OF). 알바가 나가는 장면은 봇짐을 멘 햄스터가 같이 나온다.
  if (who === 'weasel' && sceneId === 'quit' && sprite('hamsterQuit')) return <span className="bust duo"><img src={sprite('weasel')!.src} alt="" /><img className="prop" data-art="hamsterQuit" src={sprite('hamsterQuit')!.src} alt="" /></span>;
  const id = BUST_OF[who];
  const art = id ? sprite(id) : null;
  if (art) return <img className="bust" data-art={id} src={art.src} alt="" />;
  switch (who) {
    // 주인공 속마음: 폰을 받기 전에는 빈손
    case 'hero': { const h = (phone ? sprite('hero') : sprite('heroEmpty')) ?? sprite('hero'); return h ? <HeroBust id={phone ? 'hero' : 'heroEmpty'} src={h.src} /> : <img className="bust hero" src={heroFront} alt="" />; }
    case 'news': return (
      <svg className="bust" viewBox="0 0 200 200" aria-hidden="true">
        <g transform="rotate(-5 100 110)">
          <rect x={30} y={40} width={140} height={150} rx={6} fill="#F3EBD6" stroke={O} strokeWidth={4} />
          <rect x={42} y={52} width={116} height={24} fill={O} /><text x={100} y={70} textAnchor="middle" fontSize={15} fontWeight={800} fill="#F3EBD6">도토리일보</text>
          <path d="M44 92 h112 M44 106 h112 M44 120 h70 M44 142 h50 M44 156 h50 M44 170 h50" stroke={O} strokeWidth={4} strokeLinecap="round" />
          <rect x={106} y={134} width={50} height={42} fill="#C9BFA4" stroke={O} strokeWidth={2.5} />
        </g>
      </svg>
    );
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

/** 주인공(온몸 그림): 눈 감은 겹을 같은 크기로 겹쳐 두고 가끔 깜빡인다(U-43) */
function HeroBust({ id, src }: { id: 'hero' | 'heroEmpty'; src: string }) {
  const ref = useBlink<HTMLImageElement>();
  const b = blinkOf(id);
  return <span className="bust hero blinkbox"><img data-art={id} src={src} alt="" />{b && <img ref={ref} className="blink" data-blink={id} src={b} alt="" style={{ opacity: 0 }} />}</span>;
}

interface Spot { x: number; y: number; w: number; h: number; H: number; W: number }
/** 대사 카드와 인물이 차지하는 높이(대략). 비추는 조각이 이 안에 들면 카드를 위로 올린다. */
const CARD_ZONE = 300;

/** 판이 닫힌 순간의 숨(U-48): beatUntil 까지는 null. 그 뒤에 다시 그린다 */
export function useBeatOver(): boolean {
  const beat = useProto((s) => s.beatUntil);
  const [, tick] = useState(0);
  const wait = beat - Date.now();
  useEffect(() => { if (wait <= 0) return; const t = window.setTimeout(() => tick((x) => x + 1), wait + 30); return () => window.clearTimeout(t); }, [beat]);
  return wait <= 0;
}
export function CutIn() {
  const sc: Scene | undefined = useProto((s) => s.scenes[0]);
  const over = useGame((s) => s.g.run.over);
  const free = useBeatOver();
  if (!sc || over || !free) return null;
  return <CutInScene key={sc.id} sc={sc} />;
}

function CutInScene({ sc }: { sc: Scene }) {
  const [i, setI] = useState(0);
  const phone = useGame((st0) => st0.g.run.futures.open);
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
  // 살아 있는 인물(U-43): 말하는 동안 음절마다 살짝 들썩인다(웅얼거림의 시간표를 그대로 따른다)
  const bustRef = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (sp.typing) talkBob(bustRef.current, line.text, sp.shown); }, [sp.shown]);

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
      say(cur.unlock === 'map' ? '마을 지도를 펼쳤다' : cur.unlock === 'phone' ? '숲거래소 앱을 열 수 있다' : `${TAB_LABEL[cur.unlock]} 탭이 열렸다`);
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
      const w = Math.min(box.width - 4, b.right - box.left + 5) - x;
      let h = Math.min(box.height - 4, b.bottom - box.top + 5) - y;
      // 아주 큰 조각(U-43: 화면의 절반을 넘는 차트)은 대사 카드 자리 위까지만 비춘다 — 카드를 위로 올리면 그 조각의 머리를 덮는다
      if (h > box.height * 0.4 && y < box.height - CARD_ZONE - 120) h = Math.min(h, box.height - CARD_ZONE - 8 - y);
      setSpot((o) => (o && Math.abs(o.x - x) < 0.5 && Math.abs(o.y - y) < 0.5 && Math.abs(o.w - w) < 0.5 && Math.abs(o.h - h) < 0.5 && o.H === box.height ? o : { x, y, w, h, H: box.height, W: box.width }));
    };
    measure();
    const t = window.setInterval(measure, 180);
    return () => window.clearInterval(t);
  }, [i]);

  const smile = line.mood ? line.mood === 'smile' : sc.settle ? sc.settle.win : true;
  const pick = last ? sc.choices : undefined;
  // U-59: 고르는 줄이 떴다(첫 완납이면 그 위로 전광판 축하가 뜬다)
  useEffect(() => { if (pick && !sp.typing) choicesShown(sc.id); }, [!!pick, sp.typing]);
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
      {/* 화면 전체가 넘기는 자리(U-46 사용자: "탭하면 다음 / 닫기 할 때 그 상태창을 탭하는 게 너무 힘들어"): 투명한 단추 한 장이 세상 위 · 카드 아래를 덮는다(iOS 는 단추가 아닌 곳의 탭을 click 으로 안 넘긴다) */}
      <button type="button" className="pr-tapall" data-tapall aria-label={pick ? '글자 다 보기' : last ? '닫기' : '다음'} onClick={(e) => { e.stopPropagation(); next(); }} />
      {spot && <div className="pr-spot" style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h }} aria-hidden="true"><i className={'arr ' + (top ? 'dn' : 'up')} /></div>}
      <div key={line.who} className="bustbox"><span ref={bustRef} className={'al-html' + (line.who === 'boss' ? ' headbob' : '')} style={aliveStyle(line.who)} data-alive={line.who}><Bust who={line.who} smile={smile} sceneId={sc.id} phone={phone} /></span></div>
      {st && !st.win && <div className="stamp">연체</div>}
      {/* 설명 건너뛰기(U-46): 카드에서 떨어진 화면 구석의 작은 단추 — 넘기려고 누르다가 잘못 닿지 않게 */}
      {sc.guide && !last && <button className={'pr-skipall' + (top ? ' low' : '')} data-skip onClick={(e) => { e.stopPropagation(); skip(); }}>건너뛰기 ›</button>}
      <div className={'say' + (line.who === 'note' ? ' note' : '') + (line.who === 'sms' ? ' sms' : '')}>
        {WHO_NAME[line.who] && <div className="tag">{WHO_NAME[line.who]}</div>}
        
        <p key={i}><Typed text={line.text} shown={sp.shown} /></p>
        {st && i === 0 && (
          <div className="meta">
            {/* 정산 때 나간 것을 한 줄씩(U-46 사용자: "일당은 언제 나가는 돈인지?") — 이자 · 생활비 · 일당은 정산마다 같이 나간다 */}
            {st.living !== undefined && <span className="parts" data-settle-parts>이자 <b className="dn">−{comma(st.interest + (st.other ?? 0))}</b> 생활비 <b className="dn">−{comma(st.living)}</b>{(st.wages ?? 0) > 0 && <> 일당 {st.hamsters ?? 0}마리 <b className="dn">−{comma(st.wages ?? 0)}</b></>}</span>}
            <span>이번 정산 <b className={st.net >= 0 ? 'up' : 'dn'}>{st.net >= 0 ? '+' : '−'}{comma(Math.abs(st.net))}</b></span>
          </div>
        )}
        {n > 1 && <div className="dots" aria-label={`${i + 1}/${n}`}>{sc.lines.map((_, k) => <i key={k} className={k <= i ? 'on' : ''} />)}</div>}
        {last && sc.unlock && !pick && <div className="unl">끝나면 {TAB_LABEL[sc.unlock]} 탭이 열린다</div>}
        {pick && (
          <div className={'pick' + (pick.some((c) => c.primary) ? '' : ' even')}>
            {pick.map((c) => (
              <button key={c.id} className={'buy' + (c.primary ? ' on' : '')} data-choice={c.id} onClick={(e) => { e.stopPropagation(); choose(c.run); }}><span>{c.label}</span>{c.sub && <small>{c.sub}</small>}</button>
            ))}
          </div>
        )}
        {!pick && <em>{last ? '눌러서 닫기' : '눌러서 다음'}</em>}
      </div>
    </div>
  );
}

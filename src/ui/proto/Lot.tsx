// 집 탭(U-34): 세상(집 그림)이 화면을 채우고, 아래에 접히는 판이 있다.
//   접힘: 탭 줄 위에 얇은 한 줄("▲ 초당 +89 ≥ 이자 초당 69 · 정산 1:42"). 누르거나 위로 끌면 펴진다. 이때 세상의 쳇바퀴를 누르면 굴린다.
//   펴짐: 버는 돈 · 견줌 막대 · 나가는 돈 + 바닥 자리 여섯을 2×3 칸으로(칸마다 상태 하나 + 할 일 하나). ▼·아래로 끌기·세상 아무 데나 누르면 접힌다(그 탭은 굴리지 않는다).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useUI } from '../uiStore';
import { useProto } from './protoStore';
import { tiles, homeSummary, WHEEL_COIN, EXTRA_WHEEL, isNearLiq, rateTxt, perSec, claim, type Tile } from './model';
import { heroMood, tensionOf, type HeroMood } from './tension';
import { tradeNet } from './watch';
import { liveHistoryOf } from '../priceHistory';
import { TILE_GRID, afterDrag, DRAG_PX } from './home';
import { journeyOf } from './stops';
import { say, sendAway } from './watch';
import { comma } from '../../engine/util';
import { marketById } from '../../engine/data';
import { positionView, type PositionView } from '../vm/trade';
import { World } from './World';
import { C } from './art';
import { coinLogo } from './coins';
import { sprite } from './sprites';
import { fx } from './fx';
import { play, playTap } from './audio';
import { has } from '../../engine/skilltree';
import { rollWheel, staffedTap, FORCE_NUDGE } from './roll';

const roeTxt = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}%`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const bought = new Set<string>(); // 이번 접속에서 처음 사는 물건이면 짧은 팡파르

/** 열린 포지션 + 이 거래로 지금까지 늘거나 준 돈(net: 들어갈 때·나올 때 수수료 포함)과 그 비율(netRoe, 넣은 돈 대비 %).
 *  화면의 큰 숫자는 전부 이 값을 쓴다 — 시세만 본 손익(pnl·roe)은 수수료가 빠져 있어 200배에서는 "+1.3%"인데 닫으면 −15%였다(회차 2 에서 본 것). */
export type OpenPos = PositionView & { net: number; netRoe: number };
export function useOpenPositions(): OpenPos[] {
  const g = useGame((s) => s.g);
  return Object.keys(g.run.positions).map((m) => {
    const v = positionView(g, m);
    const raw = g.run.positions[m];
    if (!v || !raw) return null;
    const net = tradeNet(raw, v.back);
    return { ...v, net, netRoe: (net / Math.max(1, raw.margin0)) * 100 };
  }).filter((x): x is OpenPos => !!x);
}

/** 내 포지션 한 줄(판 맨 위에 고정, 접혀 있어도 보인다): 누르면 거래소의 그 종목으로 */
function PinRow({ p }: { p: OpenPos }) {
  const setTab = useProto((s) => s.setTab);
  const call = isNearLiq(p);
  const m = marketById[p.market];
  const net = p.net;
  const tn = tensionOf(p.liqDistPct, liveHistoryOf(p.market));
  return (
    <button className={'pr-pin' + (call ? ' call' : '') + (net >= 0 ? ' plus' : ' minus')} onClick={() => { useUI.getState().setTrade({ market: p.market }); setTab('phone'); }} aria-label={`내 포지션 ${m.name}, 거래소에서 보기`}>
      <span className="who">{coinLogo(p.market) ? <img className="coin logo" src={coinLogo(p.market)!} alt="" draggable={false} /> : <i className="coin" style={{ background: C.dtc }} />}{m.name}</span>
      <span className="dir"><b className={p.dir === 1 ? 'long' : 'short'}>{p.dir === 1 ? '롱 ▲' : '숏 ▼'}</b> {p.lev}배</span>
      <span className={'liq r-' + tn.reach} data-reach={tn.reach}>{call ? '▼ 청산 임박 ' : '청산까지 '}{p.dir === 1 ? '−' : '+'}{p.liqDistPct.toFixed(1)}%<i className="dots" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <u key={i} className={i < tn.dots ? 'on' : ''} />)}</i></span>
      <span className="roe"><b>{net >= 0 ? '+' : '−'}{comma(Math.abs(Math.round(net)))}</b><small>{roeTxt(p.netRoe)}</small></span>
    </button>
  );
}

/** 판의 한 칸 = 바닥의 한 자리. 칸 전체가 단추다: 누르면 그 자리가 세상에서 밝아지고, 할 일이 있으면 한다. */
function TileBtn({ t, 'data-hl': hl, onAct }: { t: Tile; 'data-hl'?: 'tileFirst' | 'tileEmpty'; onAct: (t: Tile) => boolean }) {
  const [pop, setPop] = useState(0);
  // 알바가 막 들었다(U-43): 칸의 초당 숫자가 한 번 크게 튀어 오른다
  const was = useRef(t.state);
  const [hired, setHired] = useState(0);
  useEffect(() => { if (was.current !== 'run' && t.state === 'run') setHired((k) => k + 1); was.current = t.state; }, [t.state]);
  const cls = 'pr-tile ' + t.state + (t.locked ? ' locked' : '') + (t.action ? ' act' : '') + (t.canAct ? ' can' : '') + (t.tagged ? ' tagged' : '');
  return (
    <button className={cls} data-tile={t.slot} data-state={t.state} data-act={t.action ?? 'none'} data-can={t.canAct ? '1' : '0'} data-hl={hl}
      aria-label={`${t.name}: ${t.action ? `${t.btn} ${t.btnSub}` : t.text}`} onClick={() => { if (onAct(t)) setPop((k) => k + 1); }}>
      <span className="cap">
        <i className="ic">{t.state === 'empty' || t.state === 'lost' ? <b className="q">+</b> : <img src={(sprite('wheelEmpty') ?? sprite('wheel'))!.src} alt="" />}</i>
        <em>{t.name}</em>{t.tagged && <u>딱지</u>}
      </span>
      {t.action
        ? <span key={pop} className={'do' + (t.canAct ? ' on' : '') + (pop ? ' popped' : '')}><b>{t.btn}</b><small>{t.btnSub}</small></span>
        : <span className="stt">{t.state === 'run' ? <><b key={hired} className={hired ? 'hired' : undefined}>{t.text}</b><small>알바가 돌린다</small></> : <small>{t.text}</small>}</span>}
    </button>
  );
}

export function Lot() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const mapOpen = useProto((s) => !!s.everUnlocked.map);
  const waiting = useProto((s) => s.waiting);
  const open = useProto((s) => s.panelOpen);
  const setPanel = useProto((s) => s.setPanel);
  const slotOf = useProto((s) => s.slotOf);
  const pos = useOpenPositions();
  const run = g.run;
  const tradeLife = useProto((s) => s.tradeLife), claimWins = useProto((s) => s.claimWins), paidLife = useProto((s) => s.paidLife), closes = useProto((s) => s.closes);
  // 포지션을 든 채 굴려 번 돈(U-42): 주인공 머리 위 폰 꼬리표에 손익과 함께 적는다
  const rolledHold = useProto((s) => (s.rolledKey !== null && Object.values(run.positions).some((x) => x.openTick === s.rolledKey) ? s.rolled : 0));
  const jr = journeyOf({ tradeNet: tradeLife, claim: claim(g).total, settles: run.settleNo, paid: paidLife, claimWins });
  const cells = tiles(g, slotOf);
  const sum = homeSummary(g);
  const near = pos.some((p) => isNearLiq(p));
  // 주인공의 몸: 가장 급한 포지션 하나가 정한다(굳는다 > 서성인다 > 들썩인다 > 폰만 본다)
  const cl = claim(g).total;
  const RANK: HeroMood[] = ['idle', 'phone', 'hop', 'pace', 'frozen'];
  const mood = pos.reduce<HeroMood>((best, p) => {
    const m = heroMood({ hasPos: true, roe: p.netRoe, pnl: p.net, claim: cl, reach: tensionOf(p.liqDistPct, liveHistoryOf(p.market)).reach, nearLiq: isNearLiq(p) });
    return RANK.indexOf(m) > RANK.indexOf(best) ? m : best;
  }, 'idle');
  const tapTimer = useRef<number | undefined>(undefined);
  const hiTimer = useRef<number | undefined>(undefined);

  // 판이 덮는 높이: 머리(한 줄 또는 견줌 줄 + 포지션 줄) + 펴졌을 때 칸들. 움직이는 중이 아니라 다 움직인 뒤의 높이를 잰다(세상의 구도가 같이 미끄러진다).
  const headRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [cover, setCover] = useState(open ? 250 : 44);
  useLayoutEffect(() => {
    const measure = () => { const h = (headRef.current?.offsetHeight ?? 0) + (open ? gridRef.current?.offsetHeight ?? 0 : 0); setCover((o) => (Math.abs(o - h) < 1 ? o : h)); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    if (headRef.current) ro.observe(headRef.current);
    if (gridRef.current) ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, [open, waiting, pos.length]);

  /** 쳇바퀴 굴리기(세상의 쳇바퀴를 눌렀다). 엔진의 tap 행동 그대로. */
  const doTap = () => {
    if (useProto.getState().panelOpen) { setPanel(false); return; } // 펴져 있을 때의 탭은 접기만 한다
    if (useProto.getState().forceTrade) { say(FORCE_NUDGE); useProto.getState().patch({ pointTab: 'phone' }); return; }
    if (useProto.getState().waiting) { say('추심원이 문 앞에서 기다린다. 지도에서 사무소로 가거나, 돌려보낸다.'); return; }
    const r = rollWheel();
    if (!r.ok) { if (r.why === 'nowheel') { say('쳇바퀴가 없다. 다시 사야 캘 수 있다.'); play('insufficient'); } else if (r.why === 'staffed') staffedTap(); return; }
    playTap();
    useProto.getState().patch({ tapping: true });
    fx.emit({ kind: 'tap', gain: r.sold ? `+${comma(r.gain)}` : `+${comma(r.worth)} 코인`, wheel: true, sold: r.sold });
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => useProto.getState().patch({ tapping: false }), 700);
  };
  /** 칸을 눌렀다: 그 자리를 세상에서 밝히고, 할 일이 있으면 한다(놓기 · 알바 부르기 · 다시 사기). */
  const onAct = (t: Tile): boolean => {
    useProto.getState().patch({ slotHi: t.slot });
    window.clearTimeout(hiTimer.current);
    hiTimer.current = window.setTimeout(() => useProto.getState().patch({ slotHi: null }), 1500);
    if (useProto.getState().forceTrade) { say(FORCE_NUDGE); useProto.getState().patch({ pointTab: 'phone' }); return false; }
    if (!t.action) { if (t.locked) say(t.state === 'idle' ? '알바는 폰으로 부른다. 아직 폰이 없다.' : t.text); return false; }
    const had = new Set(useGame.getState().g.run.equipment.map((u) => u.uid));
    const cash0 = useGame.getState().g.run.cash;
    const res = t.action === 'hire' ? act(t.uid ? { type: 'hire', uid: t.uid } : { type: 'hire', coin: WHEEL_COIN })
      : t.action === 'place' ? act({ type: 'buyEquip', tier: EXTRA_WHEEL, coin: WHEEL_COIN })
      : act({ type: 'buyWheel', coin: WHEEL_COIN });
    if (!res.ok) { say(res.msg === '현금 부족' ? '도토리가 부족합니다' : res.msg ?? '할 수 없다'); play('insufficient'); return false; }
    if (t.action === 'rebuy') act({ type: 'autoSell', coin: WHEEL_COIN, on: true }); // 시제품 기본: 캐면 바로 팔기(지갑 시트에서 끌 수 있다)
    if (t.action === 'place') {
      // 누른 칸의 자리에 놓는다
      const nu = useGame.getState().g.run.equipment.find((u) => !had.has(u.uid));
      if (nu) useProto.getState().patch({ slotOf: { ...useProto.getState().slotOf, [nu.uid]: t.slot } });
    }
    play(bought.has(t.action) ? 'buy' : 'new_equipment');
    bought.add(t.action);
    if (t.action === 'hire') say('알바 햄스터가 왔다. 캔 돈은 1초마다 들어오고, 일당은 정산 때 나간다.');
    else fx.emit({ kind: 'buy', price: t.action === 'place' ? cash0 - useGame.getState().g.run.cash : 0, key: String(t.slot) });
    return true;
  };

  // 머리 줄: 누르면 접고 펴고, 위·아래로 끌어도 된다
  const drag = useRef<{ y: number; id: number } | null>(null);
  const dragged = useRef(false);
  const onDown = (e: React.PointerEvent) => { drag.current = { y: e.clientY, id: e.pointerId }; dragged.current = false; };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) < DRAG_PX) return; // 탭은 click 이 맡는다
    dragged.current = true;
    setPanel(afterDrag(dy, useProto.getState().panelOpen));
  };
  const onToggle = () => { if (dragged.current) { dragged.current = false; return; } play('ui_tap'); setPanel(!useProto.getState().panelOpen); };

  const idleSec = perSec(sum.idle), claimSec = perSec(sum.claim);
  const ahead = idleSec >= claimSec;
  const share = idleSec + claimSec > 0 ? Math.max(0.04, Math.min(0.96, idleSec / (idleSec + claimSec))) : 0.5;
  const left = mmss(Math.max(0, run.settleIn));
  const todo = cells.some((t) => t.action && t.canAct);
  const nextEmpty = cells.find((t) => t.state === 'empty')?.slot;
  const bySlot = (s: number) => cells.find((t) => t.slot === s)!;

  return (
    <div className={'pr-lot' + (open ? ' open' : '')} style={{ ['--cover' as string]: `${cover}px` }}>
      <World near={near} mood={mood} cover={cover} open={open} onRoll={doTap} hold={pos.length ? { net: pos.reduce((a, p) => a + p.net, 0), rolled: rolledHold } : null} />
      {open && <div className="pr-scrim" data-scrim onPointerDown={() => setPanel(false)} aria-hidden="true" />}
      <section className={'pr-panel' + (open ? ' open' : '')} data-panel={open ? 'open' : 'closed'} aria-label="집의 쳇바퀴">
        <div ref={headRef} className="hd">
          {pos.map((p) => has(g, 'A2')
            ? <div key={p.market} className="pr-pinwrap"><PinRow p={p} /><button className="buy on pinclose" data-pinclose onClick={() => { const r = act({ type: 'close', market: p.market }); play(r.ok ? 'ui_tap' : 'insufficient'); }}><span>정리</span></button></div>
            : <PinRow key={p.market} p={p} />)}
          {waiting && (
            <div className="pr-wait" role="status" data-wait>
              <span>추심원이 문 앞에서 기다린다</span>
              {mapOpen && <button className="buy on" data-wait-go onClick={() => { useProto.getState().patch({ mapFocus: 'shark1' }); useProto.getState().setTab('map'); }}><span>사무소로</span><small>지도</small></button>}
              <button className="buy" data-wait-away onClick={sendAway}><span>돌려보낸다</span><small>연체</small></button>
            </div>
          )}
          <button className={'pr-strip' + (ahead ? ' ok' : ' short') + (open ? ' full' : '')} data-strip data-sum data-hl={open ? 'bar' : 'strip'} aria-expanded={open}
            aria-label={open ? '쳇바퀴 자리 접기' : '쳇바퀴 자리 펴기'} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; }} onClick={onToggle}>
            <i className="grip" aria-hidden="true" />
            {open ? (
              <>
                <span className="cmp">
                  <span className="in"><i className="chev">▼&#xFE0E;</i><small>버는 돈</small><b>초당 {rateTxt(idleSec)}</b></span>
                  <span className="bar" role="img" aria-label={ahead ? '버는 돈이 더 많다' : '나가는 돈이 더 많다'}><i style={{ width: `${share * 100}%` }} /><u /></span>
                  <span className="out"><small>나가는 돈</small><b>초당 {rateTxt(claimSec)}</b></span>
                </span>
                <span className="nx">정산까지 <b>{left}</b> · 다음 정산 때 <b>{comma(sum.claim)}</b></span>
                {/* 이번 생의 길(U-41): 낸 돈과 거래가 벌어 온 돈 */}
                {(run.settleNo > 0 || closes > 0) && <span className="jr" data-journey="home">{jr.text}</span>}
              </>
            ) : (
              <span className="one">
                <i className="chev">▲&#xFE0E;{todo && <u className="dot" />}</i>
                {/* 초당 들어오는 돈 / 나가는 돈(U-43): 들어오는 것은 초록, 나가는 것은 빨강. 견줌 기호 대신 빗금 하나 */}
                <b className="in">초당 +{rateTxt(idleSec)}</b><i className="cmpch" aria-label={ahead ? '버는 돈이 더 많다' : '나가는 돈이 더 많다'}>/</i><b className="out">−{rateTxt(claimSec)}</b>
                <span className="tm">정산 {left}</span>
              </span>
            )}
          </button>
        </div>
        <div className="body" aria-hidden={!open}>
          <div className="clip">
            <div ref={gridRef} className="pr-grid" data-hl="grid">
              {TILE_GRID.map((s) => { const t = bySlot(s); return <TileBtn key={s} t={t} onAct={onAct} data-hl={s === 0 ? 'tileFirst' : s === nextEmpty ? 'tileEmpty' : undefined} />; })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

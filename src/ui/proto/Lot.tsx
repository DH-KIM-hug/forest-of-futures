import { useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useUI } from '../uiStore';
import { useProto } from './protoStore';
import { slots, homeSummary, WHEEL_COIN, EXTRA_WHEEL, isNearLiq, secOf, rateTxt, perSec, type Slot } from './model';
import { say, sendAway } from './watch';
import { comma } from '../../engine/util';
import { marketById } from '../../engine/data';
import { ownedCoins, stage } from '../../engine/selectors';
import { tapValue } from '../../engine/equipment';
import { sellFeeRate } from '../../engine/mining';
import { positionView, type PositionView } from '../vm/trade';
import { historyOf } from '../priceHistory';
import { World } from './World';
import { RowIcon, C } from './art';
import { HOME_WHEEL_NAME } from './text';
import { fx } from './fx';
import { play, playTap } from './audio';

const roeTxt = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}%`;

const bought = new Set<string>(); // 이번 접속에서 처음 사는 물건이면 짧은 팡파르

function Spark({ market, up }: { market: string; up: boolean }) {
  const h = historyOf(market).slice(-90);
  if (h.length < 2) return <svg className="pr-spark" />;
  const lo = Math.min(...h), hi = Math.max(...h), span = hi - lo || hi * 0.0002;
  const pts = h.map((v, i) => `${((i / (h.length - 1)) * 100).toFixed(1)},${(30 - ((v - lo) / span) * 26 - 2).toFixed(1)}`).join(' ');
  // 상승 / 하락 색(§11.3): #D0584A / #4F7FC0
  return <svg className="pr-spark" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={up ? '#D0584A' : '#4F7FC0'} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>;
}

export function useOpenPositions(): PositionView[] {
  const g = useGame((s) => s.g);
  return Object.keys(g.run.positions).map((m) => positionView(g, m)!).filter(Boolean);
}

function PinRow({ p }: { p: PositionView }) {
  const setTab = useProto((s) => s.setTab);
  const call = isNearLiq(p);
  const m = marketById[p.market];
  return (
    <button className={'pr-pin' + (call ? ' call' : '') + (p.roe >= 0 ? ' plus' : ' minus')} onClick={() => { useUI.getState().setTrade({ market: p.market }); setTab('phone'); }} aria-label={`내 포지션 ${m.name}, 거래소에서 보기`}>
      <div className="l">
        <div className="who"><i className="coin" style={{ background: C.dtc }} />{m.name}</div>
        <div className="dir"><b className={p.dir === 1 ? 'long' : 'short'}>{p.dir === 1 ? '롱 ▲' : '숏 ▼'}</b> {p.lev}배</div>
        <div className="liq">청산까지 {p.dir === 1 ? '−' : '+'}{p.liqDistPct.toFixed(1)}%</div>
      </div>
      <div className="m"><div className="roe">{roeTxt(p.roe)}</div><div className="pnl">{p.pnl >= 0 ? '+' : '−'}{comma(Math.abs(Math.round(p.pnl)))}</div></div>
      <Spark market={p.market} up={p.roe >= 0} />
      {call && <div className="warn">▼ 청산 임박</div>}
    </button>
  );
}

/** 쳇바퀴 자리 한 줄: 빈 자리 → [쳇바퀴 놓기] → 선 쳇바퀴 → [알바 부르기] → 도는 중(초당 수입). 한 번 누르면 한 걸음. */
function SlotRow({ r, onAct }: { r: Slot; onAct: (r: Slot) => boolean }) {
  const [pop, setPop] = useState(0);
  const empty = r.kind === 'empty' || r.kind === 'lost';
  return (
    <div className={'pr-row slot' + (empty ? ' locked' : '') + (r.staffed ? ' run' : '') + (r.tagged ? ' tagged' : '')} data-row={r.kind === 'wheel' ? 'wheel' : r.kind} data-staffed={r.staffed ? '1' : '0'}>
      <div className="ic">{empty ? <span className="q">+</span> : <RowIcon kind={r.staffed ? 'hamwheel' : 'wheel'} />}</div>
      <div className="mid">
        <div className="nm">{r.name}{r.tagged && <em className="tag">딱지</em>}</div>
        <div className="sb">{r.net !== null && <b>초당 +{secOf(r.net)}</b>}{r.net !== null ? ' · ' : ''}{r.sub}</div>
      </div>
      <button key={pop} className={'buy' + (r.canAct ? ' on' : '') + (r.action === null ? ' done' : '') + (pop ? ' popped' : '')} disabled={r.action === null} data-act={r.action ?? 'none'} onClick={() => { if (onAct(r)) setPop((k) => k + 1); }}>
        <span>{r.btn}</span><small>{r.btnSub}</small>
      </button>
    </div>
  );
}

export function Lot() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const mapOpen = useProto((s) => !!s.everUnlocked.map);
  const waiting = useProto((s) => s.waiting);
  const pos = useOpenPositions();
  const run = g.run;
  const rows = slots(g);
  const sum = homeSummary(g);
  const near = pos.some((p) => isNearLiq(p));
  const tapTimer = useRef<number | undefined>(undefined);
  const rideCoin = run.riding ?? ownedCoins(run)[0];
  const wheeled = stage(run) > 0 && !!rideCoin;
  const [tapKey, setTapKey] = useState(0);

  const doTap = () => {
    if (useProto.getState().waiting) { say('추심원이 문 앞에서 기다린다. 지도에서 사무소로 가거나, 돌려보낸다.'); return; }
    const g0 = useGame.getState().g;
    const before = g0.run.cash;
    const coin0 = g0.run.riding ?? ownedCoins(g0.run)[0];
    if (!(stage(g0.run) > 0 && !!coin0)) { say('쳇바퀴가 없다. 다시 사야 캘 수 있다.'); play('insufficient'); return; }
    const worth = Math.round(tapValue(g0, coin0));
    const r = act({ type: 'tap' });
    if (!r.ok) return;
    const gain = useGame.getState().g.run.cash - before;
    const sold = !!g0.run.coinWheels[coin0]?.autoSell;
    playTap();
    setTapKey((k) => k + 1);
    useProto.getState().patch({ tapping: true });
    fx.emit({ kind: 'tap', gain: sold ? `+${comma(gain)}` : `+${comma(worth)} 코인`, wheel: true, sold });
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => useProto.getState().patch({ tapping: false }), 700);
  };
  const onAct = (r: Slot): boolean => {
    const res = r.action === 'hire' ? act(r.uid ? { type: 'hire', uid: r.uid } : { type: 'hire', coin: WHEEL_COIN })
      : r.action === 'place' ? act({ type: 'buyEquip', tier: EXTRA_WHEEL, coin: WHEEL_COIN })
      : r.action === 'rebuy' ? act({ type: 'buyWheel', coin: WHEEL_COIN }) : { ok: false };
    if (!res.ok) { say(res.msg === '현금 부족' ? '도토리가 부족합니다' : res.msg ?? '할 수 없다'); play('insufficient'); return false; }
    if (r.action === 'rebuy') act({ type: 'autoSell', coin: WHEEL_COIN, on: true }); // 시제품 기본: 캐면 바로 팔기(지갑 시트에서 끌 수 있다)
    play(bought.has(r.action!) ? 'buy' : 'new_equipment');
    bought.add(r.action!);
    if (r.action === 'hire') say('알바 햄스터가 왔다. 일당은 정산 때 나간다.');
    else fx.emit({ kind: 'buy', price: r.action === 'place' ? run.cash - useGame.getState().g.run.cash : 0, key: r.key });
    return true;
  };
  const tapNet = wheeled ? tapValue(g, rideCoin) * (run.coinWheels[rideCoin]?.autoSell ? 1 - sellFeeRate(run) : 1) : 0;
  const idleSec = perSec(sum.idle), claimSec = perSec(sum.claim);
  const ahead = idleSec >= claimSec;

  return (
    <div className="pr-lot">
      <World near={near} />
      <section className="pr-panel" aria-label="집의 쳇바퀴">
        {waiting ? (
          <div className="pr-wait" role="status" data-wait>
            <span>추심원이 문 앞에서 기다린다</span>
            {mapOpen && <button className="buy on" data-wait-go onClick={() => { useProto.getState().patch({ mapFocus: 'shark1' }); useProto.getState().setTab('map'); }}><span>사무소로</span><small>지도</small></button>}
            <button className="buy" data-wait-away onClick={sendAway}><span>돌려보낸다</span><small>연체</small></button>
          </div>
        ) : (
          <div className={'pr-sum' + (ahead ? ' ok' : ' short')} role="status" data-sum>
            <span>알바 {sum.hamsters}마리가 버는 돈 <b className="up">초당 {rateTxt(idleSec)}</b></span>
            <i>{ahead ? '≥' : '<'}</i>
            <span>이자·생활비 <b className="dn">초당 {rateTxt(claimSec)}</b><small>정산 때 {comma(sum.claim)}</small></span>
          </div>
        )}
        <div className="pr-rows">
          {pos.map((p) => <PinRow key={p.market} p={p} />)}
          <div className="pr-row tap">
            <button className="tapbody" onPointerDown={doTap} data-tap aria-label={wheeled ? '쳇바퀴 굴리기 (코인 채굴)' : '쳇바퀴가 없다'}>
              <div key={tapKey} className={'ic' + (tapKey ? ' boing' : '')}><RowIcon kind="wheel" /></div>
              <div className="mid">
                <div className="nm">쳇바퀴 굴리기</div>
                <div className="sb">{wheeled ? `탭마다 도토코인 +${comma(Math.round(tapValue(g, rideCoin)))}어치${run.coinWheels[rideCoin]?.autoSell ? ' → 바로 팔려 도토리로' : ' → 콜드월렛'}` : `${HOME_WHEEL_NAME}가 실려 갔다`}</div>
                {wheeled && <div className="sb ms">1초에 세 번 굴리면 초당 +{rateTxt(tapNet * 3)} · 탭 값은 오르지 않는다</div>}
              </div>
              <div className="buy tapbtn"><span>굴리기</span><small>탭!</small></div>
            </button>
          </div>
          {rows.map((r) => <SlotRow key={r.key} r={r} onAct={onAct} />)}
        </div>
      </section>
    </div>
  );
}

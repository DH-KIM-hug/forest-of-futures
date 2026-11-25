import { useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useUI } from '../uiStore';
import { useProto } from './protoStore';
import { lotRows, WHEEL_COIN, isNearLiq, type Row } from './model';
import { say } from './watch';
import { comma } from '../../engine/util';
import { marketById, balance } from '../../engine/data';
import { ownedCoins, stage } from '../../engine/selectors';
import { tapValue } from '../../engine/equipment';
import { wheelByCoin } from '../../engine/data';
import { positionView, type PositionView } from '../vm/trade';
import { historyOf } from '../priceHistory';
import { World } from './World';
import { RowIcon, C } from './art';
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
    <button className={'pr-pin' + (call ? ' call' : '') + (p.roe >= 0 ? ' plus' : ' minus')} onClick={() => { useUI.getState().setTrade({ market: p.market }); setTab('phone'); }} aria-label={`내 포지션 ${m.name}, 폰에서 보기`}>
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

function ProdRow({ r, onBuy }: { r: Row; onBuy: (r: Row) => boolean }) {
  const locked = r.kind === 'locked';
  const [pop, setPop] = useState(0);
  return (
    <div className={'pr-row' + (locked ? ' locked' : '')} data-row={r.key}>
      <div className="ic">{locked ? <span className="q">?</span> : <RowIcon kind={r.kind === 'wheel' ? 'wheel' : r.tier ?? 'wheel'} />}</div>
      <div className="mid">
        <div className="nm">{r.name}</div>
        <div className="sb">{r.income !== null && !locked ? <b>정산당 +{comma(r.income)}</b> : null}{r.income !== null && !locked ? ' · ' : ''}{r.sub}</div>
        <div className="bar"><i style={{ width: `${Math.max(r.progress > 0 ? 6 : 0, r.progress * 100)}%` }} /></div>
      </div>
      <button key={pop} className={'buy' + (r.canBuy ? ' on' : '') + (pop ? ' popped' : '')} disabled={!r.canBuy} onClick={() => { if (onBuy(r)) setPop((n) => n + 1); }}>
        <span>{r.maxed ? '만렙' : locked ? '잠김' : r.canBuy ? '구입' : '부족'}</span><small>{comma(r.price)}</small>
      </button>
    </div>
  );
}

export function Lot() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const mapOpen = useProto((s) => !!s.everUnlocked.map);
  const pos = useOpenPositions();
  const run = g.run;
  const rows = lotRows(g);
  const near = pos.some((p) => isNearLiq(p));
  const tapTimer = useRef<number | undefined>(undefined);
  const upTimer = useRef<number | undefined>(undefined);
  const tapUp = useProto((s) => s.tapUp);
  const rideCoin = run.riding ?? ownedCoins(run)[0];
  const wheeled = stage(run) > 0 && !!rideCoin;
  const [tapKey, setTapKey] = useState(0);

  const doTap = () => {
    const g0 = useGame.getState().g;
    const before = g0.run.cash;
    const coin0 = g0.run.riding ?? ownedCoins(g0.run)[0];
    const wheel = stage(g0.run) > 0 && !!coin0;
    const worth = wheel ? Math.round(tapValue(g0, coin0)) : 0;
    const r = act({ type: 'tap' });
    if (!r.ok) return;
    const gain = useGame.getState().g.run.cash - before;
    const sold = wheel && !!g0.run.coinWheels[coin0]?.autoSell;
    playTap();
    setTapKey((k) => k + 1);
    useProto.getState().patch({ tapping: true });
    fx.emit({ kind: 'tap', gain: wheel ? (sold ? `+${comma(gain)}` : `+${comma(worth)} 코인`) : gain > 0 ? `+${comma(gain)}` : '+코인', wheel, sold });
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => useProto.getState().patch({ tapping: false }), 700);
  };
  const buy = (r: Row): boolean => {
    const g0 = useGame.getState().g;
    const tc = g0.run.riding ?? ownedCoins(g0.run)[0];
    const tap0 = tc ? tapValue(g0, tc) : 0;
    const res = r.kind === 'wheel' ? act({ type: 'buyWheel', coin: WHEEL_COIN }) : act({ type: 'buyEquip', tier: r.tier!, coin: ownedCoins(run)[0] ?? WHEEL_COIN });
    if (!res.ok) { say(res.msg ?? '살 수 없다'); play('insufficient'); return false; }
    if (r.kind === 'wheel') act({ type: 'autoSell', coin: WHEEL_COIN, on: true }); // 시제품 기본: 캐면 바로 팔기(지갑 시트에서 끌 수 있다)
    play(bought.has(r.key) ? 'buy' : 'new_equipment');
    bought.add(r.key);
    if (r.kind !== 'wheel' && tc) {
      const g1 = useGame.getState().g;
      const up = tapValue(g1, tc) - tap0;
      if (up > 0.04) {
        useProto.getState().patch({ tapUp: `탭 +${up >= 1 ? comma(Math.round(up)) : up.toFixed(1)}` });
        window.clearTimeout(upTimer.current);
        upTimer.current = window.setTimeout(() => useProto.getState().patch({ tapUp: null }), 2400);
      }
    }
    fx.emit({ kind: 'buy', price: r.price, key: r.key });
    return true;
  };
  const nextPrice = rows.find((r) => r.kind !== 'locked' && !r.canBuy && r.price > run.cash)?.price ?? 0;
  const short = run.cash < nextPrice;

  return (
    <div className="pr-lot">
      <World near={near} />
      <section className="pr-panel" aria-label="생산 줄">
        <div className={'pr-hint' + (short ? ' on' : '')} aria-live="polite">{short ? (mapOpen ? '도토리가 부족합니다 · 지도에서 빌릴 수는 있다' : '도토리가 부족합니다') : ''}</div>
        <div className="pr-rows">
          {pos.map((p) => <PinRow key={p.market} p={p} />)}
          <div className="pr-row tap">
            <button className="tapbody" onPointerDown={doTap} data-tap aria-label={wheeled ? '쳇바퀴 달리기 (코인 채굴)' : '도토리 줍기'}>
              <div key={tapKey} className={'ic' + (tapKey ? ' boing' : '')}><RowIcon kind={wheeled ? 'wheel' : 'pile'} /></div>
              <div className="mid">
                <div className="nm">{wheeled ? <>쳇바퀴 달리기 <small>(코인 채굴)</small></> : '도토리 줍기'}{tapUp && <b key={tapUp} className="tapup">{tapUp}</b>}</div>
                <div className="sb">{wheeled ? `탭마다 ${wheelByCoin[rideCoin].name.replace(' 쳇바퀴', '')} +${comma(Math.round(tapValue(g, rideCoin)))}어치 → 콜드월렛${run.coinWheels[rideCoin]?.autoSell ? ' → 바로 팔림' : ''}` : `탭마다 도토리 +${balance.progression.acornPerTap} · 줍기 ${comma(run.acornTaps)}회`}</div>
              </div>
              <div className="buy tapbtn"><span>{wheeled ? '달리기' : '줍기'}</span><small>탭!</small></div>
            </button>
          </div>
          {rows.map((r) => <ProdRow key={r.key} r={r} onBuy={buy} />)}
        </div>
      </section>
    </div>
  );
}

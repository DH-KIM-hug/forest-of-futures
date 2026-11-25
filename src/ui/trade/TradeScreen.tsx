import { useEffect, useState } from 'react';
import { useGame, slOptions, tpOptions } from '../../store/gameStore';
import { marketDefs, marketById, T } from '../../engine/data';
import { changePct, formatPrice } from '../../engine/market';
import { posPnl, posRoe, liqPrice } from '../../engine/selectors';
import { entryPreview } from '../../engine/trading';
import { Chart } from './Chart';
import { heroPose } from '../village/heroPose';
import { fmt, sgn, pct, arrow } from '../common/format';

const cls = (x: number) => (x > 0 ? 'up' : x < 0 ? 'down' : '');

export function TradeScreen() {
  const g = useGame((s) => s.g);
  const ui = useGame((s) => s.ui);
  const st = useGame.getState();
  const run = g.run;
  const mk = run.markets[ui.market];
  const pos = run.positions[ui.market];
  const colors = g.settings.priceColors;
  const upC = colors === 'kr' ? '#e5484d' : '#2f9e5a';
  const downC = colors === 'kr' ? '#3e7bfa' : '#e5484d';
  const price = mk.price;
  const diff = price - mk.prev;
  const [flash, setFlash] = useState<string | null>(null);
  const tf = run.tradeFlash;
  useEffect(() => {
    if (!tf || run.tick - tf.tick > 2) return;
    const label = tf.kind === 'tp' ? '익절' : tf.kind === 'sl' ? '손절' : tf.kind === 'liq' ? '강제 청산' : '정리';
    setFlash(`${label} ${sgn(tf.amount)}`);
    const t = setTimeout(() => setFlash(null), 2000);
    return () => clearTimeout(t);
  }, [tf?.tick, tf?.kind]);

  const lev = pos ? pos.lev : ui.lev;
  const pctSel = T.marginPctOptions[ui.pctIdx];
  const dir = pos ? pos.dir : 1;
  const prev = entryPreview(run.cash, price, dir, lev, pctSel);
  const shortOfCash = run.cash < T.minMargin;
  const slV = pos ? pos.slRoe : slOptions[ui.slIdx];
  const tpV = pos ? pos.tpRoe : tpOptions[ui.tpIdx];

  const stepSl = (d: number) => {
    const i = Math.min(slOptions.length - 1, Math.max(0, (pos ? slOptions.indexOf(pos.slRoe) : ui.slIdx) + d));
    if (pos) st.setStops(slOptions[i], pos.tpRoe);
    else st.patchUi({ slIdx: i });
  };
  const stepTp = (d: number) => {
    const i = Math.min(tpOptions.length - 1, Math.max(0, (pos ? tpOptions.indexOf(pos.tpRoe) : ui.tpIdx) + d));
    if (pos) st.setStops(pos.slRoe, tpOptions[i]);
    else st.patchUi({ tpIdx: i });
  };
  const trades = run.stats.trades;
  const tutorial =
    trades === 0 ? '레버리지: 배율만큼 손익이 커집니다.' : trades === 1 ? '청산가: 이 가격에 닿으면 증거금이 사라집니다.' : trades === 2 ? '손절·익절: 정한 수익률에 닿으면 자동으로 정리됩니다.' : null;
  const hintText = shortOfCash
    ? `증거금 부족 (최소 ${fmt(T.minMargin)})`
    : pos
      ? `추가 증거금 ${fmt(prev.margin)} · 수수료 ${fmt(prev.fee)} · 청산가 ${formatPrice(mk.id, liqPrice(pos))}`
      : `증거금 ${fmt(prev.margin)} · 수수료 ${fmt(prev.fee)} · 청산가 ${formatPrice(mk.id, prev.liq)}(${pct(prev.liqDistPct)})`;

  const roe = pos ? posRoe(pos, price) : 0;
  const pnl = pos ? posPnl(pos, price) : 0;
  const call = pos ? roe < T.marginCallRoe : false;
  const canOpen = prev.ok;
  let pose = heroPose({
    over: run.over,
    anyOverdue: Object.values(run.streak).some((v) => v > 0),
    nearLiq: call,
    tick: run.tick,
    tradeFlash: run.tradeFlash,
    stampFlash: run.stampFlash,
    workHop: false,
  });
  if (pose === 'idle' && pos && roe > 0) pose = 'joy';

  const levOpts: number[] = T.leverageOptions;
  return (
    <div className="trade" data-pc={colors}>
      <div className="mtabs" role="tablist" aria-label="종목">
        {marketDefs.map((m) => {
          const s = run.markets[m.id];
          const c = changePct(s, 60);
          return (
            <button key={m.id} role="tab" aria-selected={ui.market === m.id} className={ui.market === m.id ? 'on' : ''} onClick={() => st.patchUi({ market: m.id })}>
              {m.short}
              <small className={cls(c)}>{arrow(c)}{Math.abs(c).toFixed(1)}%</small>
              {run.positions[m.id] && <span className="pd" aria-label="포지션 있음" />}
            </button>
          );
        })}
      </div>
      <div className="quote">
        <span className={'px ' + cls(diff)}>{arrow(diff)} {formatPrice(mk.id, price)}</span>
        <span className="av"><img src="/ui/icons/acorn.webp" alt="" />사용 가능 {fmt(run.cash)}</span>
      </div>
      <div className="chartbox">
        <Chart market={mk} pos={pos} up={upC} down={downC} />
      </div>
      <div className={'posrow' + (call ? ' call' : '') + (pos && !flash ? (roe >= 0 ? ' plus' : ' minus') : '')} aria-live="polite">
        <img className="me" src={`/art/hero_${pose}.webp`} alt="" draggable={false} />
        {flash ? (
          <span className="fl">{flash}</span>
        ) : pos ? (
          <span className="tx">
            <span className="dir">{pos.dir > 0 ? '롱' : '숏'} {pos.lev}배 · 증거금 {fmt(pos.margin)}</span>
            <span className={'roe ' + cls(roe)}>{pct(roe)}</span>
            <span className={'pnl ' + cls(pnl)}>{sgn(pnl)}</span>
          </span>
        ) : (
          <span className="tx">포지션 없음</span>
        )}
      </div>
      <div className="levrow" role="group" aria-label={`배율 ${lev}배${lev === 200 ? ', 최대 위험' : ''}`}>
        <span className="lab">{pos ? <img src="/ui/icons/lock.webp" alt="포지션이 있어 잠김" /> : null}배율</span>
        <div className="track">
          {levOpts.map((o) => {
            const on = o === lev;
            return (
              <button key={o} className={'notch' + (on ? ' on' : '') + (o >= 100 ? ' hot' : '')} disabled={!!pos} onClick={() => st.patchUi({ lev: o })} aria-pressed={on} aria-label={`배율 ${o}배${o === 200 ? ' 최대 위험' : ''}`}>
                {on ? (o === 200 ? <span className="tag200">200배</span> : <img className="handle" src="/ui/icons/acorn.webp" alt="" />) : <span className="kn" />}
                <span>{o}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mgrow">
        {(T.marginPctOptions as number[]).map((p, i) => (
          <button key={p} className={'chip' + (ui.pctIdx === i ? ' on' : '')} onClick={() => st.patchUi({ pctIdx: i })} aria-pressed={ui.pctIdx === i}>
            {ui.pctIdx === i ? '✓ ' : ''}{p === 100 ? '전부' : `${p}%`}
          </button>
        ))}
      </div>
      <div className="hint" aria-live="polite">{hintText}</div>
      {tutorial && <div className="hint tut">{tutorial}</div>}
      <div className="sltp">
        <div className="g">
          <img className="ic" src="/ui/icons/stop_loss.webp" alt="" />
          <button onClick={() => stepSl(-1)} aria-label="손절 수익률 낮추기">◀</button>
          <span className="v">손절 {slV === null ? '없음' : `${slV}%`}</span>
          <button onClick={() => stepSl(1)} aria-label="손절 수익률 높이기">▶</button>
        </div>
        <div className="g">
          <img className="ic" src="/ui/icons/take_profit.webp" alt="" />
          <button onClick={() => stepTp(-1)} aria-label="익절 수익률 낮추기">◀</button>
          <span className="v">익절 {tpV === null ? '없음' : `+${tpV}%`}</span>
          <button onClick={() => stepTp(1)} aria-label="익절 수익률 높이기">▶</button>
        </div>
      </div>
      <div className="orders">
        {pos ? (
          <>
            <button className="add" disabled={!canOpen} onClick={() => st.addToPosition()}>추가 진입</button>
            <button className="close" onClick={() => st.close()}>정리하기</button>
          </>
        ) : (
          <>
            <button className="long" disabled={!canOpen} onClick={() => st.open(1)} aria-label={`${marketById[mk.id].short} 롱, 오른다`}>▲ 롱 · 오른다</button>
            <button className="short" disabled={!canOpen} onClick={() => st.open(-1)} aria-label={`${marketById[mk.id].short} 숏, 내린다`}>▼ 숏 · 내린다</button>
          </>
        )}
      </div>
    </div>
  );
}

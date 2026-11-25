import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useUI } from '../uiStore';
import { comma } from '../../engine/util';
import { marketById } from '../../engine/data';
import { price } from '../../engine/selectors';
import { historyOf } from '../priceHistory';
import { Art } from '../common/Art';
import { heroArt } from '../assets';
import { ChartBox, type ChartLine } from './Chart';
import {
  chartModel, fmtPrice, levRuler, marketMood, marketTabs, MARGIN_PCTS, orderPreview, positionView, shortLine, SL_OPTIONS, TP_OPTIONS, tradeMode, tutorialLine,
} from '../vm/trade';

const COLORS = { kr: { up: '#e5484d', down: '#3e7bfa' }, intl: { up: '#2f9e5a', down: '#e5484d' } };
const pctTxt = (x: number, d = 1) => `${x >= 0 ? '▲' : '▼'}${Math.abs(x).toFixed(d)}%`;
const roeTxt = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}%`;

/** 거래 탭: 한 화면, 스크롤·팝업 없음. 차트는 장식 없는 사각형이다. */
export function TradeScreen() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const net = useGame((s) => s.net);
  const tr = useUI((s) => s.trade);
  const setTrade = useUI((s) => s.setTrade);
  const open = useUI((s) => s.open);
  const run = g.run;
  const mode = tradeMode(g);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const msgTimer = useRef<number | undefined>(undefined);
  const say = (text: string, bad = true) => {
    setMsg({ text, bad });
    window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(null), 3500);
  };
  useEffect(() => () => window.clearTimeout(msgTimer.current), []);

  const col = COLORS[g.settings.priceColors];
  const market = tr.market;
  const hist = historyOf(market);
  const px = price(run, market);
  const pos = positionView(g, market);
  const tabs = marketTabs(g);
  const tab = tabs.find((t) => t.id === market)!;
  const lev = pos ? pos.lev : tr.lev ?? run.futures.defaultLev;
  const pct = tr.pct;
  const dirForPreview = pos ? pos.dir : 1;
  const prev = orderPreview(g, market, dirForPreview, lev, pct);
  const ruler = levRuler(g);
  const mood = marketMood(g, market, hist);
  const cm = chartModel(hist);
  const offline = net.source === 'server' && net.conn !== 'open';
  const status =
    run.marketStatus === 'halted' ? '시장이 정지되어 있습니다. 포지션은 멈춰 있습니다.'
    : run.marketStatus === 'delayed' ? '시세가 지연되고 있습니다. 새 진입은 막혀 있습니다.'
    : offline ? '시장에 연결할 수 없습니다.' : null;

  const lines: ChartLine[] = [];
  if (pos) {
    lines.push({ price: pos.entry, color: '#3b6fd8', dash: [], width: 1.6, label: '진입' });
    lines.push({ price: pos.liq, color: '#d93a26', dash: [6, 4], width: 1.8, label: '청산가' });
    if (pos.sl !== null) lines.push({ price: pos.sl, color: '#c77a1f', dash: [3, 3], width: 1.2, label: '손절' });
    if (pos.tp !== null) lines.push({ price: pos.tp, color: '#2f9a55', dash: [3, 3], width: 1.2, label: '익절' });
  }

  const doOpen = (dir: 1 | -1) => {
    const r = act({ type: 'open', market, dir, lev, marginPct: pct, sl: tr.sl, tp: tr.tp });
    if (!r.ok) say(r.msg ?? '들어갈 수 없습니다.');
  };
  const doAdd = () => {
    const r = act({ type: 'add', market, marginPct: pct });
    if (!r.ok) say(r.msg ?? '더 넣을 수 없습니다.');
  };
  const doClose = () => {
    const r = act({ type: 'close', market });
    if (!r.ok) say(r.msg ?? '정리할 수 없습니다.');
  };
  const step = (opts: (number | null)[], cur: number | null, d: 1 | -1) => {
    const i = opts.indexOf(cur);
    return opts[(i + d + opts.length) % opts.length];
  };
  const curSl = pos ? pos.slRoe : tr.sl;
  const curTp = pos ? pos.tpRoe : tr.tp;
  const setStops = (sl: number | null, tp: number | null) => {
    if (pos) {
      const r = act({ type: 'stops', market, sl, tp });
      if (!r.ok) say(r.msg ?? '바꿀 수 없습니다.');
      else if (r.code === 'reserved') say('시세 지연 중이라 예약되었습니다. 열리면 적용됩니다.', false);
    } else setTrade({ sl, tp });
  };

  const tabsRow = (
    <div className="mtabs" role="tablist" aria-label="종목">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === market} className={t.id === market ? 'on' : ''} onClick={() => setTrade({ market: t.id })}>
          <span>{marketById[t.id].name.slice(0, 4)}</span>
          <small className={t.pct >= 0 ? 'up' : 'down'}>{pctTxt(t.pct)}</small>
          {t.hasPos && <i className="pd" aria-label="포지션 있음" />}
        </button>
      ))}
    </div>
  );

  // 0단계: 자물쇠
  if (mode.mode === 'locked') {
    return (
      <div className="trade locked" data-mode="locked">
        <div className="lockbox">
          <img src="/ui/icons/lock.webp" alt="" />
          <p>{mode.text}</p>
        </div>
        <ChartBox market={market} prices={[]} lines={[]} up={col.up} down={col.down} empty />
        <div className="sp" />
      </div>
    );
  }

  return (
    <div className="trade" data-mode={mode.mode}>
      {tabsRow}
      <div className="quote">
        <div className="px"><b>{fmtPrice(market, px)}</b><span className={tab.pct >= 0 ? 'up' : 'down'}>{pctTxt(tab.pct)}</span></div>
        <div className="av"><img src="/ui/icons/acorn.webp" alt="" />{comma(run.cash)}</div>
        <div className={'mood ' + mood}>{mood}</div>
      </div>
      {status && <div className="statusline" role="status">{status}</div>}
      <ChartBox market={market} prices={hist} lines={lines} up={col.up} down={col.down} />
      <div className="metaline">
        <span>{cm.label}</span>
        {shortLine(g, market) && <span className="sl">{shortLine(g, market)}</span>}
      </div>

      {mode.mode === 'readonly' ? (
        <div className="gate">
          {mode.lines.map((l) => (
            <div key={l.id} className={'gl' + (l.ok ? ' ok' : '')}><b>{l.ok ? '☑' : '☐'}</b> {l.text}</div>
          ))}
          <p className="gh">{mode.ready ? '캐피탈 창구에서 계좌를 열 수 있습니다.' : '조건이 차면 캐피탈 창구에서 계좌를 열 수 있습니다.'}</p>
          <button className="act" onClick={() => { act({ type: 'view', tab: 'village' }); open({ k: 'lender', id: 'capital' }); }}>캐피탈 창구로</button>
        </div>
      ) : (
        <>
          {pos ? (
            <div className={'posrow ' + (pos.roe >= 0 ? 'plus' : 'minus') + (pos.liqDistPct < 5 ? ' call' : '')} aria-label="내 포지션">
              <Art id={heroArt(pos.roe >= 0 ? 'idle' : 'sweat')} className="me" alt="" />
              <div className="tx">
                <span className="dir">{pos.dirText} {pos.lev}배</span>
                <span className={'roe ' + (pos.roe >= 0 ? 'up' : 'down')}>{roeTxt(pos.roe)}</span>
                <span className="pnl">{pos.pnl >= 0 ? '+' : '−'}{comma(Math.abs(Math.round(pos.pnl)))}<small> / 증거금 {comma(Math.round(pos.margin))}</small></span>
              </div>
              {pos.tags.length > 0 && <div className="tg">{pos.tags.join(' · ')}</div>}
            </div>
          ) : (
            tutorialLine(g) && (
              <div className="tut"><Art id={heroArt('idle')} className="me" alt="" /><p>{tutorialLine(g)}</p></div>
            )
          )}
          <div className="levrow" role="radiogroup" aria-label="배율">
            {ruler.map((n) => (
              <button
                key={n.lev}
                role="radio"
                aria-checked={n.lev === lev}
                className={'notch' + (n.lev === lev ? ' on' : '') + (n.hot ? ' hot' : '') + (n.locked ? ' locked' : '')}
                onClick={() => {
                  if (n.locked) say(n.lockText!, false);
                  else if (!pos) setTrade({ lev: n.lev });
                  else say('추가 진입은 같은 배율만 됩니다.', false);
                }}
              >
                <span className="kn">{n.locked && <img src="/ui/icons/lock.webp" alt="잠김" />}</span>
                <b>{n.lev}</b>
              </button>
            ))}
          </div>
          <div className="mgrow">
            {MARGIN_PCTS.map((p) => (
              <button key={p} className={'chip' + (pct === p ? ' on' : '')} aria-pressed={pct === p} onClick={() => setTrade({ pct: p })}>{p === 100 ? '전부' : `${p}%`}</button>
            ))}
          </div>
          <div className={'hint' + (msg ? (msg.bad ? ' bad' : ' ok') : prev.reason ? ' bad' : '')} role="status">{msg ? msg.text : prev.reason ?? prev.info}</div>
          <div className="sltp">
            <div className="g">
              <button aria-label="손절 낮추기" onClick={() => setStops(step(SL_OPTIONS, curSl, -1), curTp)}>◀</button>
              <span className="v"><img className="ic" src="/ui/icons/stop_loss.webp" alt="" />손절 {curSl === null ? '없음' : `−${Math.abs(curSl)}%`}</span>
              <button aria-label="손절 높이기" onClick={() => setStops(step(SL_OPTIONS, curSl, 1), curTp)}>▶</button>
            </div>
            <div className="g">
              <button aria-label="익절 낮추기" onClick={() => setStops(curSl, step(TP_OPTIONS, curTp, -1))}>◀</button>
              <span className="v"><img className="ic" src="/ui/icons/take_profit.webp" alt="" />익절 {curTp === null ? '없음' : `+${curTp}%`}</span>
              <button aria-label="익절 높이기" onClick={() => setStops(curSl, step(TP_OPTIONS, curTp, 1))}>▶</button>
            </div>
          </div>
          <div className="orders">
            {pos ? (
              <>
                <button className={'add'} disabled={!!prev.reason} onClick={doAdd}>추가 진입 {pos.dir === 1 ? '▲' : '▼'}</button>
                <button className="close" onClick={doClose}>정리하기 {pos.back > 0 ? `+${comma(pos.back)}` : ''}</button>
              </>
            ) : (
              <>
                <button className="long" disabled={!!prev.reason} onClick={() => doOpen(1)}>▲ 롱 · 오른다</button>
                <button className="short" disabled={!!prev.reason} onClick={() => doOpen(-1)}>▼ 숏 · 내린다</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

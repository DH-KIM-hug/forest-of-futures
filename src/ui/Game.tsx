import { useEffect } from 'react';
import { useGame } from '../store/gameStore';
import { useUI } from './uiStore';
import { Hud, Ticker } from './common/Hud';
import { Village } from './village/Village';
import { TradeScreen } from './trade/TradeScreen';
import { anyOverdue, timeIdx } from './vm/village';
import { tradeGate } from '../engine/progression';
import { roePct } from '../engine/futures';
import { startHistory } from './priceHistory';
import { Overlays } from './overlays/Overlays';
import './styles.css';

/** 앱 틀: HUD 알약 + 속보 띠 + (마을 | 거래) + 탭 바. */
export function Game() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const shake = useUI((s) => s.shake);
  const run = g.run;
  const tab = run.view.tab;
  const away = useGame((s) => s.net.away);
  useEffect(() => { startHistory(); }, []);
  useEffect(() => { if (away) useUI.getState().markAway(Date.now()); }, [away]);
  const gate = tradeGate(g);
  const pos = Object.values(run.positions);
  const roeSum = pos.reduce((a, p) => a + roePct(p, run.prices[p.market]), 0);
  const od = anyOverdue(g);
  const go = (t: 'village' | 'trade') => {
    useUI.getState().close();
    act({ type: 'view', tab: t });
  };
  return (
    <div className={'app' + (shake ? ' sh' + (shake % 2) : '')} data-tab={tab} data-time={timeIdx(g)} data-house={run.house} data-pc={g.settings.priceColors}>
      <div className="top">
        <Hud />
        <Ticker />
      </div>
      <div className="content">{tab === 'village' ? <Village /> : <TradeScreen />}</div>
      <nav className="tabbar" aria-label="화면 전환">
        <button className={tab === 'village' ? 'on' : ''} aria-current={tab === 'village'} onClick={() => go('village')}>
          <img src="/ui/icons/tab_village.webp" alt="" />마을
          {od && <i className="dot od">연체</i>}
        </button>
        <button className={tab === 'trade' ? 'on' : ''} aria-current={tab === 'trade'} onClick={() => go('trade')}>
          <img src={gate.mode === 'orders' ? '/ui/icons/tab_trade.webp' : '/ui/icons/lock.webp'} alt="" />거래
          {pos.length > 0 && <i className={'dot ' + (roeSum >= 0 ? 'up' : 'down')}>{roeSum >= 0 ? '▲' : '▼'}{Math.abs(roeSum).toFixed(0)}%</i>}
        </button>
      </nav>
      <Overlays />
    </div>
  );
}

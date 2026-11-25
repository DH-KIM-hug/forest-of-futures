import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useGame } from './store/gameStore';
import { Hud, Ticker } from './ui/common/Hud';
import { Village } from './ui/village/Village';
import { TradeScreen } from './ui/trade/TradeScreen';
import { EndingScreen } from './ui/overlays/Ending';
import { Archive } from './ui/overlays/Archive';
import { Board } from './ui/overlays/Board';
import { Prologue } from './ui/overlays/Prologue';

function Main() {
  const g = useGame((s) => s.g);
  const ui = useGame((s) => s.ui);
  const go = useGame((s) => s.go);
  const patch = useGame((s) => s.patchUi);
  const run = g.run;
  const tab = run.view.tab;
  const [shake, setShake] = useState(false);
  const flash = run.tradeFlash;
  useEffect(() => {
    if (flash && flash.kind === 'liq' && run.tick - flash.tick <= 1) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 600);
      return () => clearTimeout(t);
    }
  }, [flash?.tick, flash?.kind]);

  // 검수용: #trade, #village, #archive, #board 로 화면을 바로 연다 (프롤로그는 닫음)
  useEffect(() => {
    const h = location.hash.replace('#', '');
    if (!h) return;
    if (h === 'trade' || h === 'village') {
      patch({ overlay: null });
      go({ tab: h });
    } else if (h === 'archive' || h === 'board') {
      patch({ overlay: h });
    }
  }, []);

  const posCount = Object.keys(run.positions).length;
  let sumRoe = 0;
  if (posCount) {
    let m = 0;
    let p = 0;
    for (const pos of Object.values(run.positions)) {
      m += pos.margin;
      p += (pos.dir * (run.markets[pos.market].price - pos.entry)) / pos.entry * pos.notional;
    }
    sumRoe = (p / m) * 100;
  }
  const overdue = Object.values(run.streak).some((x) => x > 0);

  return (
    <div className={'app' + (shake ? ' shake' : '')} data-stage={run.houseStage} data-pc={g.settings.priceColors}
      style={{ ['--up' as any]: g.settings.priceColors === 'kr' ? '#e5484d' : '#2f9e5a', ['--down' as any]: g.settings.priceColors === 'kr' ? '#3e7bfa' : '#e5484d' }}>
      <div className="top">
        <Hud />
        <Ticker />
      </div>
      {ui.notice && (
        <button className="notice" onClick={() => patch({ notice: null })}>{ui.notice}</button>
      )}
      <div className="content">{tab === 'village' ? <Village /> : <TradeScreen />}</div>
      <nav className="tabbar" aria-label="탭">
        <button className={tab === 'village' ? 'on' : ''} onClick={() => go({ tab: 'village' })} aria-current={tab === 'village'}>
          <img src="/ui/icons/tab_village.webp" alt="" draggable={false} />
          마을
          {overdue && <span className="dot" aria-label="연체 있음">연체</span>}
        </button>
        <button className={tab === 'trade' ? 'on' : ''} onClick={() => go({ tab: 'trade' })} aria-current={tab === 'trade'}>
          <img src="/ui/icons/tab_trade.webp" alt="" draggable={false} />
          거래
          {posCount > 0 && <span className={'dot'} style={{ background: sumRoe >= 0 ? 'var(--up)' : 'var(--down)' }}>{sumRoe >= 0 ? '+' : ''}{sumRoe.toFixed(0)}%</span>}
        </button>
      </nav>
      {ui.overlay === 'archive' && <Archive />}
      {ui.overlay === 'board' && <Board />}
      {ui.overlay === 'prologue' && <Prologue />}
      {run.over && g.pending && <EndingScreen />}
    </div>
  );
}

class Boundary extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  render() {
    if (this.state.err)
      return (
        <div className="errscreen">
          <p>게임 데이터를 불러오지 못했습니다.</p>
          <button onClick={() => location.reload()}>다시 시도</button>
        </div>
      );
    return this.props.children;
  }
}

export default function App() {
  return (
    <Boundary>
      <Main />
    </Boundary>
  );
}

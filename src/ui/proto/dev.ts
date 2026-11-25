// 시제품 전용 장면 건너뛰기: ?proto=1&pdev=<장면>. 기존 dev.ts 의 장면 조립을 재사용한다(엔진 규칙은 건드리지 않는다).
import { useGame, persistFlag } from '../../store/gameStore';
import { buildScenario } from '../dev';
import { useProto, type Tab } from './protoStore';
import { createGame, clone, stepMut } from '../../engine/game';
import { balance, marketById } from '../../engine/data';
import { pdev } from './config';

/** 새 게임으로 시작(저장 읽기 없음). 정산 간격 덮어쓰기는 이 앞에서 끝나 있어야 한다. */
export function bootProto(): void {
  persistFlag.on = false;
  const st = useGame.getState();
  let g = createGame({ seed: (Date.now() & 0xffff) | 1, prices: st.g.run.prices });
  g.settings.prologueSeen = true;
  g.run.settleIn = balance.settlement.intervalSec;
  if (pdev) g = scene(pdev, g);
  st.setGame(g);
  const t = new URLSearchParams(window.location.search).get('ptab');
  if (t) useProto.getState().setTab(t as Tab);
}

function scene(name: string, base: ReturnType<typeof createGame>) {
  const P = useProto.getState();
  const tab = (t: Tab) => P.patch({ tab: t, visited: { lot: true, [t]: true } });
  const un = { lot: true, upg: true, phone: true, map: true } as const;
  const ready = () => {
    const g = buildScenario('trade', base);
    g.run.settleIn = balance.settlement.intervalSec;
    P.patch({ mapBought: true, everUnlocked: { ...un }, visited: { lot: true, upg: true, phone: true, map: true } });
    return g;
  };
  switch (name) {
    case 'ready': return ready();
    case 'pos': case 'near': case 'liq': {
      let g = ready();
      const px = g.run.prices.DTC;
      stepMut(g, { type: 'action', action: { type: 'open', market: 'DTC', dir: 1, lev: name === 'pos' ? 50 : 25, marginPct: 25, sl: null, tp: null } });
      if (name === 'liq') g.run.positions.DTC.entry = px * 1.08; // 다음 틱에 강제 청산(화면 확인용)
      if (name === 'near') {
        const p = g.run.positions.DTC;
        // 청산가까지 약 3%가 되게 진입가를 옮긴다(화면 확인용)
        p.entry = px * (1 - 0.0094);
      }
      g = clone(g);
      return g;
    }
    case 'profit': {
      const g = ready();
      P.patch({ wins: 2, closes: 3, profit: { coin: marketById.DTC.name, dir: 1, lev: 50, roe: 128.4, pnl: 38520, entry: 0.8421, exit: 0.8441, heldSec: 187, wins: 2, closes: 3, gen: 2, date: new Date() } });
      return g;
    }
    case 'debt': { const g = ready(); g.run.settleIn = 2; return g; }
    case 'broke': case 'rebirth': {
      const g = buildScenario('ending', base);
      P.patch({ everUnlocked: { ...un } });
      if (name === 'rebirth') { stepMut(g, { type: 'action', action: { type: 'estateNext' } }); stepMut(g, { type: 'action', action: { type: 'inherit', branch: 'renounce' } }); }
      return g;
    }
    case 'friends': case 'friendsup': case 'friendsbor': {
      // 인맥: friendsup = 강화 탭(카드 사기 전), friends = 인맥 탭, friendsbor = 빌린 뒤 + 곰 형 영입
      const g = ready();
      g.run.cash = name === 'friendsbor' ? 40_000 : 60_000;
      if (name === 'friendsup') { P.patch({ everUnlocked: { lot: true, upg: true }, visited: { lot: true, upg: true }, mapBought: true, tab: 'upg' }); return g; }
      P.patch({ peopleBought: true, everUnlocked: { ...un }, visited: { lot: true, upg: true, phone: true, map: true }, tab: 'people' });
      if (name === 'friendsbor') {
        stepMut(g, { type: 'action', action: { type: 'borrowFriend', friend: 'squirrel' } });
        g.run.cash = 40_000;
        P.patch({ bearBought: true, tip: { coin: 'DTC', dir: 1, price: g.run.prices.DTC * 0.998, no: 2 } });
      }
      return clone(g);
    }
    default: return base;
  }
}

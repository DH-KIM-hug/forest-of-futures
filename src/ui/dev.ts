// 개발 전용: ?dev=<장면> 으로 화면 상태를 바로 만든다(스크린샷·눈 검사용). 엔진 코드는 건드리지 않고 상태만 조립한다.
// 사용: ?feed=sim&dev=stage1 (&sheet=bank|capital|shark1|shark2|friends|home|work|visit, &overlay=archive|board|tree|away, &tab=trade)
import { createGame, clone } from '../engine/game';
import { useGame, persistFlag } from '../store/gameStore';
import { useUI } from './uiStore';
import { declareBankruptcy } from '../engine/bankruptcy';
import { tierDefs, COINS } from '../engine/data';
import type { GameState } from '../engine/types';

function wheels(g: GameState, coins: string[]) {
  for (const c of coins) g.run.coinWheels[c] = { on: true, autoSell: false, tagBy: null };
  g.run.riding = coins[0] as any;
  for (const c of coins) g.run.wallet[c] = { qty: 0.08 + Math.random() * 0.1, locked: 0 };
}
function equip(g: GameState, tier: string, coin: string) {
  g.run.uidSeq += 1;
  g.run.equipment.push({ uid: 'e' + g.run.uidSeq, tier, coin: coin as any, on: true, cost: tierDefs.find((t) => t.id === tier)!.cost, tagBy: null, boughtWithLoan: false, inheritedSign: false, boughtTick: 0 });
}

export function buildScenario(name: string, base: GameState): GameState {
  const g = clone(base);
  const run = g.run;
  g.settings.prologueSeen = true;
  const stage1 = () => {
    wheels(g, ['DTC', 'BTH', 'MDT']);
    run.acornTaps = 240;
    run.stats.signSeen = true;
    run.cash = 184_500;
    run.minedValue = 31_200;
    run.house = 1;
    equip(g, 'wheel2', 'DTC');
    equip(g, 'helper', 'BTH');
    run.prices.DTC *= 1.01;
    run.prices.BTH *= 0.93;
  };
  switch (name) {
    case 'stage0': run.acornTaps = 120; break;
    case 'sign': run.acornTaps = 240; run.stats.signSeen = true; run.cash = 52_000; break;
    case 'stage1': stage1(); break;
    case 'rev': stage1(); run.prices.BTH *= 0.5; run.debts.shark1.principal = 200_000; run.debts.shark1.overdue = 1; run.equipment[1].tagBy = 'shark1'; run.coinWheels.BTH.tagBy = 'shark1'; break;
    case 'four': stage1(); wheels(g, ['DTC', 'BTH', 'MDT', 'SMS']); run.house = 2; break;
    case 'debt': stage1(); run.debts.bank.principal = 300_000; run.debts.shark1.principal = 100_000; run.debts.shark1.overdue = 1; run.debts.shark2.principal = 200_000; run.shark2Open = true; run.debts.tax.principal = 120_000; run.taxDueIn = 6; break;
    case 'visit': stage1(); run.offers = [{ id: 'promo', from: run.settleNo, by: 'capital' }]; break;
    case 'trade0': break;
    case 'trade1': stage1(); run.view.tab = 'trade'; run.minedValue = 31_200; break;
    case 'trade': case 'trade2': stage1(); run.futures = { open: true, edu: 3, mock: true, defaultLev: 10, openedAtSettle: 0, levCap: 50, closedTrades: 3, waiver: false }; run.view.tab = 'trade'; run.minedValue = 90_000; break;
    case 'tradepos': {
      stage1();
      run.futures = { open: true, edu: 3, mock: true, defaultLev: 10, openedAtSettle: 0, levCap: 50, closedTrades: 3, waiver: false };
      run.view.tab = 'trade';
      const p = run.prices.DTC;
      run.positions.DTC = {
        market: 'DTC', kind: 'perp', dir: 1, lev: 25, margin: 25_000, margin0: 25_000, notional: 625_000, entry: p * 0.998, openTick: 0, openSettle: 0, slRoe: -25, tpRoe: 50, adds: 0, marginPct: 25,
        feesPaid: 250, fundingPaid: 0, peakRoe: 5, roeLowSec: 0, marginCalled: false, fundedBy: 'capital', tipSource: 'fox', tipAgree: 1, entryAtHigh: false, entryAtLow: false, fadedWire: false, newsAfterEntry: null,
        closeReserved: false, reservedStops: null, revenge: null,
      };
      break;
    }
    case 'ending': case 'estate': case 'tree': {
      stage1();
      run.debts.shark1.principal = 400_000;
      run.debts.shark1.overdue = 2;
      declareBankruptcy(g, { lastLender: 'shark1', shortfall: 40_000 });
      if (name !== 'ending' && g.estate) g.estate.step = name === 'estate' ? 'statement' : 'tree';
      if (name === 'tree') g.family.han = 60;
      break;
    }
    default: break;
  }
  void COINS;
  return g;
}

/** 주소의 dev·sheet·overlay·tab 값을 읽어 적용한다. 저장은 끈다. */
export function applyDev(): void {
  if (!(import.meta as any).env?.DEV) return;
  const q = new URLSearchParams(window.location.search);
  const dev = q.get('dev');
  if (!dev && !q.get('sheet') && !q.get('overlay')) return;
  persistFlag.on = false;
  if (dev) useGame.getState().setGame(buildScenario(dev, useGame.getState().g));
  const sheet = q.get('sheet');
  if (sheet) {
    if (['bank', 'capital', 'shark1', 'shark2'].includes(sheet)) useUI.getState().open({ k: 'lender', id: sheet as any });
    else if (sheet === 'friends') useUI.getState().open({ k: 'friends' });
    else if (sheet === 'home') useUI.getState().open({ k: 'home' });
    else if (sheet === 'visit') useUI.getState().open({ k: 'visit' });
    else if (sheet.startsWith('work')) useUI.getState().open({ k: 'work', tab: (sheet.split(':')[1] as any) || 'wallet' });
  }
  const ov = q.get('overlay');
  if (ov) useUI.getState().setOverlay(ov as any);
  const tab = q.get('tab');
  if (tab) {
    const g = clone(useGame.getState().g);
    g.run.view.tab = tab as any;
    useGame.getState().setGame(g);
  }
}
void createGame;

// 플레이어 행동(액션). 모두 제자리 수정이고 Res 를 돌려준다. 순수 래퍼는 game.ts 의 step.
import { buyEquip, moveEquip, ride, sellEquip, sellWheel, setAutoSell, toggleEquip, toggleWheel } from './equipment';
import { moveTo } from './housing';
import { borrow, rollover, stamp, type Mult } from './loans';
import { sell, tap } from './mining';
import { acceptOffer, declineOffer } from './offers';
import { purchaseWheel } from './progression';
import { borrowFriend, stampFriend } from './friends';
import { buyUpgrade } from './upgrades';
import type { CoinId, GameState, LenderId, DebtId, Res } from './types';

export type Action =
  | { type: 'tap' }
  | { type: 'ride'; coin: CoinId }
  | { type: 'buyWheel'; coin: CoinId }
  | { type: 'sellWheel'; coin: CoinId }
  | { type: 'buyEquip'; tier: string; coin: CoinId }
  | { type: 'moveEquip'; uid: string; coin: CoinId }
  | { type: 'toggleEquip'; uid: string; on?: boolean }
  | { type: 'toggleWheel'; coin: CoinId; on?: boolean }
  | { type: 'autoSell'; coin: CoinId; on: boolean }
  | { type: 'sellEquip'; uid: string }
  | { type: 'sell'; coin: CoinId; part: 'all' | 'half' }
  | { type: 'upgrade'; track: string; target?: string }
  | { type: 'borrow'; lender: LenderId; consent?: boolean }
  | { type: 'stamp'; lender: DebtId; mult?: Mult }
  | { type: 'rollover'; lender: LenderId }
  | { type: 'borrowFriend'; friend: string }
  | { type: 'stampFriend'; friend: string; mult?: Mult }
  | { type: 'move'; to: number }
  | { type: 'acceptOffer'; id: string }
  | { type: 'declineOffer'; id: string };

export function act(g: GameState, a: Action): Res {
  switch (a.type) {
    case 'tap': return tap(g);
    case 'ride': return ride(g, a.coin);
    case 'buyWheel': return purchaseWheel(g, a.coin);
    case 'sellWheel': return sellWheel(g, a.coin);
    case 'buyEquip': return buyEquip(g, a.tier, a.coin);
    case 'moveEquip': return moveEquip(g, a.uid, a.coin);
    case 'toggleEquip': return toggleEquip(g, a.uid, a.on);
    case 'toggleWheel': return toggleWheel(g, a.coin, a.on);
    case 'autoSell': return setAutoSell(g, a.coin, a.on);
    case 'sellEquip': return sellEquip(g, a.uid);
    case 'sell': return sell(g, a.coin, a.part);
    case 'upgrade': return buyUpgrade(g, a.track, a.target);
    case 'borrow': return borrow(g, a.lender, a.consent ?? false);
    case 'stamp': return stamp(g, a.lender, a.mult ?? 1);
    case 'rollover': return rollover(g, a.lender);
    case 'borrowFriend': return borrowFriend(g, a.friend);
    case 'stampFriend': return stampFriend(g, a.friend, a.mult ?? 1);
    case 'move': return moveTo(g, a.to);
    case 'acceptOffer': return acceptOffer(g, a.id);
    case 'declineOffer': return declineOffer(g, a.id);
  }
}

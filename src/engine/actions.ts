// 플레이어 행동(액션). 모두 제자리 수정이고 Res 를 돌려준다. 순수 래퍼는 game.ts 의 step.
import { buyEquip, hire, moveEquip, ride, sellEquip, sellWheel, setAutoSell, toggleEquip, toggleWheel } from './equipment';
import { moveTo } from './housing';
import { borrow, rollover, stamp, type Mult } from './loans';
import { sell, tap } from './mining';
import { acceptOffer, declineOffer } from './offers';
import { purchaseWheel } from './progression';
import { borrowFriend, stampFriend } from './friends';
import { buyUpgrade } from './upgrades';
import type { CoinId, GameState, LenderId, DebtId, Res, Dir } from './types';
import { eduPage, mockTrade, openAccount, signWaiver } from './progression';
import { endIntro } from './pace';
import { addMargin, addToPosition, closePosition, halfClose, marginCallDone, openPosition, setStops } from './futures';
import { buyNode, callLoanCut, pickNode, setDayLimit } from './skilltree';
import { retireAct1 } from './act1Retire';
import { buyTree, chooseBranch, estateNext, pawn, retire, startNextGeneration, type ChoiceBranch } from './generation';
import { onBackground, onForeground, visit } from './offline';

export type Action =
  | { type: 'eduPage' }
  | { type: 'mockTrade' }
  | { type: 'openAccount'; sponsor?: boolean }
  | { type: 'signWaiver' }
  | { type: 'endIntro' }
  | { type: 'open'; market: string; dir: Dir; lev: number; margin?: number; marginPct?: number; sl?: number | null; tp?: number | null; flip?: boolean }
  | { type: 'add'; market: string; margin?: number; marginPct?: number }
  | { type: 'close'; market: string }
  | { type: 'stops'; market: string; sl: number | null; tp: number | null }
  | { type: 'view'; tab: 'village' | 'trade' }
  | { type: 'visit'; place: string }
  | { type: 'background' }
  | { type: 'foreground' }
  | { type: 'tap' }
  | { type: 'ride'; coin: CoinId }
  | { type: 'buyWheel'; coin: CoinId }
  | { type: 'sellWheel'; coin: CoinId }
  | { type: 'buyEquip'; tier: string; coin: CoinId }
  | { type: 'hire'; uid?: string; coin?: CoinId }
  | { type: 'moveEquip'; uid: string; coin: CoinId }
  | { type: 'toggleEquip'; uid: string; on?: boolean }
  | { type: 'toggleWheel'; coin: CoinId; on?: boolean }
  | { type: 'autoSell'; coin: CoinId; on: boolean }
  | { type: 'sellEquip'; uid: string }
  | { type: 'sell'; coin: CoinId; part: 'all' | 'half' }
  | { type: 'upgrade'; track: string; target?: string }
  /** call = 마진콜 전화(B2)를 받는 중에 그 자리에서 빌린다(오소리 대부만, 꼬리만큼 금리 할인) */
  | { type: 'borrow'; lender: LenderId; consent?: boolean; call?: boolean }
  | { type: 'stamp'; lender: DebtId; mult?: Mult }
  | { type: 'rollover'; lender: LenderId }
  | { type: 'borrowFriend'; friend: string }
  | { type: 'stampFriend'; friend: string; mult?: Mult }
  | { type: 'move'; to: number }
  | { type: 'acceptOffer'; id: string }
  | { type: 'declineOffer'; id: string }
  | { type: 'retire' }
  /** 1막: 빚을 다 갚은 생을 닫는다(엔딩 카드 → 환생) */
  | { type: 'retireAct1' }
  | { type: 'estateNext' }
  | { type: 'inherit'; branch: ChoiceBranch }
  | { type: 'buyTree'; id: string }
  | { type: 'nextGeneration' }
  | { type: 'pawn'; heirloom: string; lender: 'shark1' | 'shark2' }
  // 영구 스킬트리(거래 한 갈래): 사고 고르는 것은 환생 화면에서만
  | { type: 'treeBuy'; id: string }
  | { type: 'treePick'; id: string }
  | { type: 'addMargin'; market: string; amount: number }
  | { type: 'half'; market: string }
  | { type: 'marginCallDone' }
  | { type: 'setDayLimit'; value: number | null }
  /** FRX 회원 등급(U-56 ③): 수수료 할인의 단계. 0 이상의 정수 */
  | { type: 'setFeeTier'; tier: number };

export function act(g: GameState, a: Action): Res {
  switch (a.type) {
    case 'eduPage': return eduPage(g);
    case 'mockTrade': return mockTrade(g);
    case 'openAccount': return openAccount(g, a.sponsor ?? false);
    case 'signWaiver': return signWaiver(g);
    case 'endIntro': return endIntro(g);
    case 'open': return openPosition(g, a);
    case 'add': return addToPosition(g, a);
    case 'close': return closePosition(g, a.market);
    case 'stops': return setStops(g, a.market, a.sl, a.tp);
    case 'view': g.run.view.tab = a.tab; return { ok: true };
    case 'visit': return visit(g, a.place);
    case 'background': return onBackground(g);
    case 'foreground': return onForeground(g);
    case 'tap': return tap(g);
    case 'ride': return ride(g, a.coin);
    case 'buyWheel': return purchaseWheel(g, a.coin);
    case 'sellWheel': return sellWheel(g, a.coin);
    case 'buyEquip': return buyEquip(g, a.tier, a.coin);
    case 'hire': return hire(g, a.uid, a.coin);
    case 'moveEquip': return moveEquip(g, a.uid, a.coin);
    case 'toggleEquip': return toggleEquip(g, a.uid, a.on);
    case 'toggleWheel': return toggleWheel(g, a.coin, a.on);
    case 'autoSell': return setAutoSell(g, a.coin, a.on);
    case 'sellEquip': return sellEquip(g, a.uid);
    case 'sell': return sell(g, a.coin, a.part);
    case 'upgrade': return buyUpgrade(g, a.track, a.target);
    case 'borrow': return borrow(g, a.lender, a.consent ?? false, undefined, a.call && a.lender === 'shark1' && g.run.marginCall ? callLoanCut(g.run) : 0);
    case 'stamp': return stamp(g, a.lender, a.mult ?? 1);
    case 'rollover': return rollover(g, a.lender);
    case 'borrowFriend': return borrowFriend(g, a.friend);
    case 'stampFriend': return stampFriend(g, a.friend, a.mult ?? 1);
    case 'move': return moveTo(g, a.to);
    case 'acceptOffer': return acceptOffer(g, a.id);
    case 'declineOffer': return declineOffer(g, a.id);
    case 'retire': return retire(g);
    case 'retireAct1': return retireAct1(g);
    case 'estateNext': return estateNext(g);
    case 'inherit': return chooseBranch(g, a.branch);
    case 'buyTree': return buyTree(g, a.id);
    case 'nextGeneration': return startNextGeneration(g);
    case 'pawn': return pawn(g, a.heirloom, a.lender);
    case 'treeBuy': return g.estate ? buyNode(g, a.id) : { ok: false, code: 'step', msg: '나무는 환생할 때만 키울 수 있습니다.' };
    case 'treePick': return g.estate ? pickNode(g, a.id) : { ok: false, code: 'step', msg: '나무는 환생할 때만 고를 수 있습니다.' };
    case 'addMargin': return addMargin(g, a.market, a.amount);
    case 'half': return halfClose(g, a.market);
    case 'marginCallDone': return marginCallDone(g);
    case 'setDayLimit': return setDayLimit(g, a.value);
    case 'setFeeTier': { const t = Math.max(0, Math.floor(a.tier) || 0); g.run.feeTier = t; return { ok: true } as Res; }
  }
}

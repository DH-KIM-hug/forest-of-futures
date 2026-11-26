// 진행 단계·해금 조건(GDD_v2 2.4). 선물 계좌·배율 상한은 M2.
import { balance, coinWheelDefs, wheelByCoin } from './data';
import { floorS } from './rng';
import { treeLevel } from './legacy';
import { treeById } from './data';
import { ownedCoins, stage } from './selectors';
import { buyWheel } from './equipment';
import type { CoinId, GameState, Res } from './types';

/** 선행 학습(`prep`): 누적 채굴 조건을 단계당 20% 줄이고 최고 단계에서는 0. */
export function unlockFactor(g: GameState): number {
  const lv = treeLevel(g.family, 'prep');
  const t = treeById.prep;
  if (lv >= t.maxLevel) return 0;
  return 1 + (t.effect.addPct / 100) * lv;
}
export const minedValueNeeded = (g: GameState, base: number): number => Math.ceil(base * unlockFactor(g) - 1e-6);
export const futuresMinedValueNeeded = (g: GameState): number => minedValueNeeded(g, balance.progression.futures.minedValueRequired);

export interface WheelStatus {
  coin: CoinId;
  owned: boolean;
  visible: boolean; // 팻말이 섰거나 이미 1단계 이상
  unlocked: boolean;
  canBuy: boolean;
  reason: string | null; // 잠긴 이유 / 못 사는 이유
  progress: { current: number; need: number } | null; // 조건과 현재 값
}

export function wheelStatus(g: GameState, coin: CoinId): WheelStatus {
  const run = g.run;
  const def = wheelByCoin[coin];
  const owned = !!run.coinWheels[coin];
  const u = def.unlock;
  let unlocked = true;
  let reason: string | null = null;
  let progress: WheelStatus['progress'] = null;
  // 조건이 없는 쳇바퀴(도토코인: 시작할 때 가진 것)는 잃어도 값만 내면 다시 산다(U-29).
  if (u.minedValue !== undefined) {
    const need = minedValueNeeded(g, u.minedValue);
    progress = { current: floorS(run.minedValue), need };
    unlocked = run.minedValue >= need;
    if (!unlocked) reason = `누적 채굴 ${need.toLocaleString('ko-KR')}어치가 필요합니다`;
  } else if (u.house !== undefined) {
    progress = { current: run.house, need: u.house };
    unlocked = run.house >= u.house;
    if (!unlocked) reason = '내 집이 필요합니다(통나무집 이상)';
  }
  const visible = owned || stage(run) >= 1 || (u.minedValue === undefined && u.house === undefined);
  let canBuy = !owned && unlocked;
  if (canBuy && run.cash < def.cost) {
    canBuy = false;
    reason = '현금 부족';
  }
  if (owned) reason = null;
  return { coin, owned, visible, unlocked, canBuy, reason, progress };
}

export function purchaseWheel(g: GameState, coin: CoinId): Res {
  return buyWheel(g, coin, wheelStatus(g, coin));
}

export const wheelOffers = (g: GameState): WheelStatus[] => coinWheelDefs.map((w) => wheelStatus(g, w.coin as CoinId)).filter((s) => s.visible);
export { ownedCoins };

// ── 선물 계좌 개설과 배율 상한 (GDD_v2 2.4) ─────────────────────────────
import { levCapNow } from './futures';
import { traitVal } from './legacy';
import { logEvent, notify } from './util';
import { refuse } from './loans';
import { walletValue as walletValueOf } from './selectors';

export const eduNeeded = (g: GameState): number => (treeLevel(g.family, 'prep') >= treeById.prep.maxLevel ? 0 : balance.progression.futures.eduPages);
export const mockNeeded = (g: GameState): number => (treeLevel(g.family, 'prep') >= treeById.prep.maxLevel ? 0 : balance.progression.futures.mockTrades);

export interface GateCondition { id: 'mined' | 'deposit' | 'edu'; met: boolean; current: number; need: number }
export interface FuturesGate {
  conditions: GateCondition[];
  buttonVisible: boolean; // 캐피탈 창구의 [선물 계좌 개설] 버튼(누적 채굴 조건을 넘어야 보인다)
  canOpen: boolean;
}
export function futuresGate(g: GameState): FuturesGate {
  const run = g.run;
  const f = run.futures;
  const needMined = futuresMinedValueNeeded(g);
  const dep = balance.progression.futures.depositCheck;
  const eduDone = f.edu >= eduNeeded(g) && (f.mock || mockNeeded(g) === 0);
  const conditions: GateCondition[] = [
    { id: 'mined', met: run.minedValue >= needMined, current: Math.floor(run.minedValue), need: needMined },
    { id: 'deposit', met: run.cash + walletValueOf(run) >= dep, current: Math.floor(run.cash + walletValueOf(run)), need: dep },
    { id: 'edu', met: eduDone, current: f.edu + (f.mock ? 1 : 0), need: eduNeeded(g) + mockNeeded(g) },
  ];
  const visible = conditions[0].met && !f.open && stage(run) >= 1;
  return { conditions, buttonVisible: visible, canOpen: visible && conditions.every((c) => c.met) };
}

/** 거래 탭의 잠금 상태: 단계 0 은 자물쇠, 단계 1 은 읽기 전용 차트 + 조건 줄, 단계 2 는 주문. */
export function tradeGate(g: GameState): { mode: 'locked' | 'readonly' | 'orders'; text: string | null; conditions: GateCondition[] } {
  const run = g.run;
  if (stage(run) === 0) return { mode: 'locked', text: '쳇바퀴가 있어야 시세가 보입니다', conditions: [] };
  if (!run.futures.open) return { mode: 'readonly', text: null, conditions: futuresGate(g).conditions };
  return { mode: 'orders', text: null, conditions: [] };
}

export function eduPage(g: GameState): Res {
  const f = g.run.futures;
  if (f.edu >= eduNeeded(g)) return refuse('done', '사전교육을 모두 마쳤습니다.');
  f.edu += 1;
  return { ok: true };
}
/** 모의거래: 눌러 보면 통과. 손익은 현금에 반영되지 않는다. */
export function mockTrade(g: GameState): Res {
  if (g.run.futures.mock) return refuse('done', '이미 마쳤습니다.');
  g.run.futures.mock = true;
  return { ok: true };
}

/** 선물 계좌 개설. sponsor = 오소리 대부가 돈을 빌려주며 쥐여 준 중고폰으로 여는 길(U-29):
 *  오소리 대부에 빚이 있으면 채굴 실적·교육·모의·예탁금 조건 없이 바로 열린다. 그 밖에는 캐피탈 창구의 조건을 다 채워야 한다. */
export function openAccount(g: GameState, sponsor = false): Res {
  const run = g.run;
  const f = run.futures;
  if (f.open) return refuse('open', '이미 개설되었습니다.');
  if (sponsor) {
    if (run.debts.shark1.principal <= 0 || !((run.stats.sharkBorrowed ?? 0) > 0)) return refuse('sponsor', '오소리 대부에서 빌린 적이 없습니다.');
  } else {
    const gate = futuresGate(g);
    if (!gate.buttonVisible) return refuse('locked', '개설 조건이 아직 아닙니다.');
    if (!gate.conditions[1].met) return refuse('deposit', '예탁금이 확인되지 않습니다.');
    if (!gate.conditions[2].met) return refuse('edu', '사전교육과 모의거래를 마쳐야 합니다.');
  }
  f.open = true;
  f.openedAtSettle = run.settleNo;
  let cap = balance.progression.futures.levCaps[0].cap as number;
  const nerve = treeLevel(g.family, 'nerve');
  if (nerve > 0) cap = Math.max(cap, treeById.nerve.effect.levels[nerve - 1]);
  if (nerve >= 2) f.waiver = true; // 확인서는 '가문 보관분'으로 갈음
  const onehit = traitVal(g, 'defaultLeverage');
  if (onehit) {
    cap = Math.max(cap, onehit);
    f.defaultLev = onehit;
  }
  f.levCap = cap;
  logEvent(run, 'open_account', sponsor ? '오소리 대부가 준 중고폰으로 선물 계좌 개설' : '선물 계좌 개설');
  notify(run, '축하드립니다, 고객님. 이제 내려도 벌 수 있습니다.', 'bubble', 'bubble:open_account');
  return { ok: true };
}

export function signWaiver(g: GameState): Res {
  const run = g.run;
  const f = run.futures;
  if (!f.open || f.waiver) return refuse('none', '받을 확인서가 없습니다.');
  if (f.closedTrades < (balance.progression.futures.levCaps[2].closedTrades as number)) return refuse('trades', '끝난 거래가 모자랍니다.');
  f.waiver = true;
  logEvent(run, 'waiver', '고위험 거래 확인서에 도장');
  notify(run, '확인서가 접수되었습니다.', 'info', 'wire:waiver');
  return { ok: true };
}
export { levCapNow };

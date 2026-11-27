// 탭 채굴·지갑·팔기·급매·캐는 즉시 팔기(GDD_v2 3.2·3.3). 줍기 단계는 없다(U-29).
import { balance, COINS, lenderById, wheelByCoin } from './data';
import { floorS, ceilS } from './rng';
import { treeLevel, traitMul } from './legacy';
import { ensureRiding, tapValue } from './equipment';
import { applyGarnish } from './seizure';
import { ownedCoins, price, refPrice, stage, walletValue, walletValueOf } from './selectors';
import { bodyLevel, runLevel } from './upgrades';
import { bump } from './stats';
import { logEvent, notify, timeOfDay } from './util';
import type { CoinId, GameState, Res, RunState } from './types';

const M = balance.mining;

export function sellFeeRate(run: RunState): number {
  const t = (balance as any).mining;
  const lv = runLevel(run, 'fee');
  return Math.max(t.sellFeeMin, Math.round((t.sellFee - 0.0003 * lv) * 1e6) / 1e6);
}

/** 캔 것을 지갑(또는 즉시 팔기면 현금)에 넣는다. valueRef = 세대 시작가 기준 어치. 가압류가 있으면 먼저 뗀다. */
export function depositMined(g: GameState, coin: CoinId, valueRef: number): void {
  const run = g.run;
  if (valueRef <= 0) return;
  let qty = valueRef / refPrice(run, coin);
  run.minedValue += valueRef;
  qty = applyGarnish(g, coin, qty);
  if (run.coinWheels[coin]?.autoSell) {
    // 1도토리에 못 미친 나머지는 버리지 않고 다음 판매에 얹는다(탭 한 번이 몇 도토리뿐일 때 수수료보다 내림이 더 크지 않게)
    run.sellFrac += qty * price(run, coin) * (1 - sellFeeRate(run));
    const got = floorS(run.sellFrac);
    run.sellFrac -= got;
    run.cash += got;
    return;
  }
  (run.wallet[coin] ??= { qty: 0, locked: 0 }).qty += qty;
}

/** 쳇바퀴를 한 번 굴린다. 초당 12회까지만 인정(한 틱 = 1초). 쳇바퀴가 없으면(압류·판매) 캘 것이 없다. */
/** 주인공이 굴릴 수 있는 쳇바퀴(U-43 사용자: "알바 고용하면 그때부터 탭은 안 되어야 하는데"): 쳇바퀴 한 대는 한 명이 돌린다 — 알바가 든 쳇바퀴는 주인공이 못 굴린다.
 *  엄마의 쳇바퀴(타고 있는 종목의 쳇바퀴)에 알바가 없으면 'mom', 아니면 알바 없는 보조 쳇바퀴의 uid, 하나도 없으면 null. */
export function rollTarget(run: RunState): string | null {
  const coin = run.riding ?? ownedCoins(run)[0];
  if (!coin) return null;
  const w = run.coinWheels[coin];
  if (w && w.on !== false && !w.staffed) return 'mom';
  const u = run.equipment.find((x) => x.staffed === false && x.on && x.coin === coin);
  return u ? u.uid : null;
}
export function tap(g: GameState): Res {
  const run = g.run;
  if (run.over) return { ok: false };
  if (stage(run) === 0) return { ok: false, code: 'nowheel', msg: '쳇바퀴가 없습니다.' };
  if (rollTarget(run) === null) return { ok: false, code: 'staffed', msg: '쳇바퀴마다 알바가 돌리고 있습니다.' };
  if (run.tapsThisTick >= balance.progression.maxTapsPerSec) return { ok: false, code: 'rate' };
  run.tapsThisTick += 1;
  bump(run, 'laborTaps', 1);
  if (timeOfDay(run) === 3) bump(run, 'nightTaps', 1);
  const coin = ensureRiding(run)!;
  depositMined(g, coin, tapValue(g, coin));
  return { ok: true };
}

export function sell(g: GameState, coin: CoinId, part: 'all' | 'half'): Res {
  const run = g.run;
  if (run.over) return { ok: false };
  const w = run.wallet[coin];
  if (!w || w.qty <= 0) return { ok: false, code: 'empty' };
  const qty = part === 'all' ? w.qty : w.qty / 2;
  const value = qty * price(run, coin);
  const got = floorS(value * (1 - sellFeeRate(run)));
  w.qty -= qty;
  if (part === 'all' || w.qty < 1e-15) w.qty = 0;
  run.cash += got;
  logEvent(run, 'sell', `${wheelByCoin[coin].name.replace(' 쳇바퀴', '')} 판매`, got);
  return { ok: true, amount: got };
}

/** 급매: 모자란 현금 `need` 를 지갑에서 만든다(수수료 3%, 평가액 큰 종목부터). 판 값(수수료 포함)을 돌려준다. */
export function forcedSell(g: GameState, need: number): number {
  const run = g.run;
  if (need <= 0) return 0;
  let target = ceilS(need / (1 - M.forcedSellFee));
  let sold = 0;
  const order = [...COINS].sort((a, b) => walletValueOf(run, b) - walletValueOf(run, a));
  for (const c of order) {
    if (target <= 0) break;
    const val = walletValueOf(run, c);
    if (val <= 0) continue;
    const take = Math.min(val, target);
    run.wallet[c].qty = take >= val - 1e-9 ? 0 : run.wallet[c].qty - take / price(run, c);
    sold += take;
    target -= take;
  }
  if (sold <= 0) return 0;
  run.cash += floorS(sold * (1 - M.forcedSellFee));
  bump(run, 'forcedSold', sold);
  logEvent(run, 'forced_sell', '급매로 지갑을 팔았다', sold);
  return sold;
}

/** 전기세를 지갑 코인에서 시가로 뗀다. `coin` 먼저, 그다음 평가액 큰 종목 순(skipOthers 면 그 종목만). 못 뗀 도토리값을 돌려준다. */
export function payFromWallet(run: RunState, coin: CoinId, value: number, others = true): number {
  let left = value;
  const order = [coin, ...(others ? [...COINS].filter((c) => c !== coin).sort((a, b) => walletValueOf(run, b) - walletValueOf(run, a)) : [])];
  for (const c of order) {
    if (left <= 1e-9) break;
    const val = walletValueOf(run, c);
    if (val <= 0) continue;
    const take = Math.min(val, left);
    run.wallet[c].qty = take >= val - 1e-9 ? 0 : run.wallet[c].qty - take / price(run, c);
    left -= take;
  }
  return Math.max(0, left);
}

export { walletValue, ownedCoins, lenderById };

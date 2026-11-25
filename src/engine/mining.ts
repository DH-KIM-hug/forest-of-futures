// 탭 채굴·지갑·팔기·급매·캐는 즉시 팔기(GDD_v2 3.2·3.3)와 줍기(0단계).
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
    const got = floorS(qty * price(run, coin) * (1 - sellFeeRate(run)));
    run.cash += got;
    return;
  }
  (run.wallet[coin] ??= { qty: 0, locked: 0 }).qty += qty;
}

function acornValue(g: GameState): number {
  const run = g.run;
  return balance.progression.acornPerTap * (1 + 0.04 * bodyLevel(run, 'glove')) * (1 + 0.1 * treeLevel(g.family, 'grip')) * traitMul(g, 'tapMul');
}

/** 일터를 한 번 누른다. 초당 12회까지만 인정(한 틱 = 1초). */
export function tap(g: GameState): Res {
  const run = g.run;
  if (run.over) return { ok: false };
  if (run.tapsThisTick >= balance.progression.maxTapsPerSec) return { ok: false, code: 'rate' };
  run.tapsThisTick += 1;
  bump(run, 'laborTaps', 1);
  if (timeOfDay(run) === 3) bump(run, 'nightTaps', 1);
  if (stage(run) === 0) {
    const value = applyGarnish(g, null, acornValue(g));
    run.acornFrac += value;
    const whole = floorS(run.acornFrac);
    run.cash += whole;
    run.acornFrac -= whole;
    run.acornTaps += 1;
    const need = balance.progression.firstWheelUnlockTaps;
    if (run.acornTaps >= need && !run.stats.signSeen) {
      run.stats.signSeen = true;
      notify(run, "길가에 '쳇바퀴 팝니다' 팻말이 섰다.", 'info', 'sign:wheel');
      if (!run.firstWheelHintShown && run.branch === 'forced') {
        run.firstWheelHintShown = true;
        notify(run, '저거 하나만 있어도 다를 텐데.', 'bubble', 'hint:firstWheel');
      }
    }
    return { ok: true, amount: whole };
  }
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

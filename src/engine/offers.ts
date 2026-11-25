// 채권처의 제안(GDD_v2 3.5): 정산 뒤 20% 확률로 하나. 같은 제안은 정산 5회에 한 번.
import { lendersMeta, offerById, offerDefs, lenderById } from './data';
import { nextRandom } from './rng';
import { borrow, refuse, rollover, refreshShark2Open } from './loans';
import { addToSet, bump } from './stats';
import { logEvent, notify } from './util';
import type { GameState, LenderId, Res } from './types';

export function rollOffer(g: GameState): void {
  const run = g.run;
  run.offers = [];
  if (nextRandom(run) >= lendersMeta.offers.rollProbPerSettlement) return;
  const pool = offerDefs.filter((o) => {
    const last = run.offerSeen[o.id];
    if (last !== undefined && run.settleNo - last < o.cooldownSettlements) return false;
    const fx = o.effect;
    if (fx.type === 'waiveInterest' || fx.type === 'promoLoan') {
      if (fx.type === 'waiveInterest' && run.debts[fx.lender as LenderId].principal <= 0) return false;
      if (fx.lender === 'shark2' && !run.shark2Open) return false;
    }
    if (fx.type === 'rollover' && !fx.lenders.some((l: LenderId) => run.debts[l].principal > 0)) return false;
    if (fx.type === 'flyer' && run.shark2Open) return false;
    return true;
  });
  if (!pool.length) return;
  const pick = pool[Math.floor(nextRandom(run) * pool.length) % pool.length];
  run.offerSeen[pick.id] = run.settleNo;
  run.offers = [{ id: pick.id, from: run.settleNo, by: pick.by }];
  logEvent(run, pick.log, pick.text);
  notify(run, `${lenderById[pick.by]?.npc ?? '속보'}: ${pick.text}`, pick.by === 'wire' ? 'wire' : 'bubble', `offer:${pick.id}`);
}

export function acceptOffer(g: GameState, id: string): Res {
  const run = g.run;
  const slot = run.offers.find((o) => o.id === id);
  if (!slot) return refuse('none', '받을 제안이 없습니다.');
  const def = offerById[id];
  const fx = def.effect;
  let res: Res = { ok: true };
  if (fx.type === 'promoLoan') {
    res = borrow(g, fx.lender, true, fx.amount);
    if (res.ok) (run.promos[fx.lender] ??= []).push({ amount: fx.amount, n: 0 });
  } else if (fx.type === 'waiveInterest') {
    const d = run.debts[fx.lender as LenderId];
    const pay = Math.min(fx.payAmount, d.principal);
    if (run.cash < pay || pay <= 0) return refuse('cash', '현금 부족');
    run.cash -= pay;
    d.principal -= pay;
    if (nextRandom(run) < fx.trueProb) run.waivePending[fx.lender] = true;
  } else if (fx.type === 'rollover') {
    const target = (fx.lenders as LenderId[]).find((l) => run.debts[l].principal > 0)!;
    res = rollover(g, target);
  } else if (fx.type === 'flyer') {
    run.shark2Open = true;
    run.stats.flyerOpen = true;
  }
  if (!res.ok) return res;
  run.offers = run.offers.filter((o) => o.id !== id);
  addToSet(run, 'offerTaken', id === 'promo' ? 'promo_loan' : id === 'waive' || id === 'fake_waive' ? 'discount_today' : id);
  refreshShark2Open(g);
  return { ok: true };
}

export function declineOffer(g: GameState, id: string): Res {
  g.run.offers = g.run.offers.filter((o) => o.id !== id);
  return { ok: true };
}

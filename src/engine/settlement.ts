// 정산 한 번(GDD_v2 3.1의 순서). 파산하면 g.run.over 가 true.
import { balance, lenderById, tierById, tierDefs } from './data';
import { ceilS, floorS } from './rng';
import { declareBankruptcy, type BankruptCtx } from './bankruptcy';
import { decayEffects, rollEvent } from './events';
import { equipGross, equipNetNow, equipPower, isActive, removeEquip, spokesGross } from './equipment';
import { settleFriends, brokenCount } from './friends';
import { depositMined, forcedSell, payFromWallet } from './mining';
import { rollOffer } from './offers';
import { applyFunding } from './futures';
import { closeBars } from './market';
import { runTips } from './tips';
import { ensureTag, removeTags, seizeFor } from './seizure';
import { interestDue, livingDue, netWorth, ownedCoins, price, refPrice } from './selectors';
import { bump } from './stats';
import { lendersMeta } from './data';
import { onTaxPaid } from './generation';
import { refreshShark2Open } from './loans';
import { comma, logEvent, notify } from './util';
import type { CoinId, DebtId, GameState, PayId } from './types';

const PAY = balance.settlement.payOrder as PayId[];
const LENDERS = ['shark2', 'shark1', 'capital', 'bank'] as const;

/** 다음 정산 수지 예상(지금 시세 기준). HUD 의 `캔 값 / 전기세 / 이자·생활비`. */
export function forecast(g: GameState) {
  const run = g.run;
  let mined = 0;
  let power = 0;
  for (const u of run.equipment) {
    if (!isActive(run, u)) continue;
    mined += equipGross(g, u) * (price(run, u.coin) / refPrice(run, u.coin));
    power += equipPower(g, u);
  }
  for (const c of ownedCoins(run)) if (run.coinWheels[c].on) mined += spokesGross(g, c) * (price(run, c) / refPrice(run, c));
  let interest = 0;
  for (const id of LENDERS) interest += interestDue(g, id);
  const living = livingDue(g);
  return { mined, power, interest, living, net: mined - power - interest - living };
}

export function settle(g: GameState, opts: { skipFunding?: boolean } = {}): void {
  const run = g.run;
  const st = run.stats;
  const rep = { settleNo: run.settleNo + 1, mined: 0, power: 0, interest: 0, living: 0, tax: 0, paid: 0, unpaid: 0, forcedSold: 0 };
  const garnishedBefore = (st.garnished as number) ?? 0;
  const forcedBefore = (st.forcedSold as number) ?? 0;

  // 1. 채굴: 켜진 설비와 관성 바퀴가 종목 지갑에 캔다(가압류 30% 먼저 뗌)
  const perCoin: Partial<Record<CoinId, number>> = {};
  for (const u of run.equipment) if (isActive(run, u)) perCoin[u.coin] = (perCoin[u.coin] ?? 0) + equipGross(g, u);
  for (const c of ownedCoins(run)) if (run.coinWheels[c].on) perCoin[c] = (perCoin[c] ?? 0) + spokesGross(g, c);
  for (const c of ownedCoins(run)) {
    const v = perCoin[c] ?? 0;
    if (v > 0) {
      rep.mined += v * (price(run, c) / refPrice(run, c));
      depositMined(g, c, v);
    }
  }

  // 2. 전기세: 그 종목 지갑의 코인에서 시가로(모자라면 평가액 큰 종목 순). 즉시 팔기 종목은 현금에서 낸다.
  let powerRemainder = 0;
  const powerBy: Partial<Record<CoinId, number>> = {};
  for (const u of run.equipment) if (isActive(run, u)) powerBy[u.coin] = (powerBy[u.coin] ?? 0) + equipPower(g, u);
  for (const c of ownedCoins(run)) {
    const p = powerBy[c] ?? 0;
    if (p <= 0) continue;
    rep.power += p;
    powerRemainder += run.coinWheels[c].autoSell ? p : payFromWallet(run, c, p);
  }
  powerRemainder = ceilS(powerRemainder);

  // 3. 펀딩비(열린 포지션마다 명목의 0.001%, 뺀 뒤 청산 검사). 오프라인에서는 봉 처리가 따로 붙인다.
  if (!opts.skipFunding) applyFunding(g);
  if (run.over) return;

  // 4. 청구액
  const due: Record<string, number> = {};
  const rollIds: LenderId2[] = [];
  for (const id of LENDERS) {
    let i = interestDue(g, id);
    if (run.rolloverPending[id] && run.debts[id].principal > 0) {
      const raw = i;
      i = 0;
      const add = ceilS(raw * (1 + lendersMeta.rollover.addPct));
      run.debts[id].principal += add;
      bump(run, `capInt.${id}`, add);
      rollIds.push(id);
    }
    due[id] = i;
    rep.interest += i;
  }
  let taxDue = 0;
  if (run.taxDueIn !== null && run.debts.tax.principal > 0) {
    run.taxDueIn -= 1;
    if (run.taxDueIn <= 0) taxDue = run.debts.tax.principal;
  }
  due.tax = taxDue;
  rep.tax = taxDue;
  rep.living = livingDue(g);
  due.upkeep = rep.living + run.upkeepArrears + powerRemainder;
  const claim = Object.values(due).reduce((a, b) => a + b, 0);
  st.lastClaim = claim;

  // 5. 급매
  if (run.cash < claim) rep.forcedSold = forcedSell(g, claim - run.cash);

  // 6. 납부: 독사 -> 오소리 -> 캐피탈 -> 조합 -> 세무서 -> 생활비·전기세
  const unpaid: Record<string, number> = {};
  for (const id of PAY) {
    const d = due[id] ?? 0;
    const pay = Math.min(d, run.cash);
    run.cash -= pay;
    unpaid[id] = d - pay;
    rep.paid += pay;
    if (id === 'tax' && pay > 0) {
      run.debts.tax.principal -= pay;
    }
  }
  rep.unpaid = Object.values(unpaid).reduce((a, b) => a + b, 0);

  // 세금: 기한이 지났는데 남았으면 비싼 설비부터 공매(구매가의 50%), 그래도 남으면 캐피탈 빚으로
  if (taxDue > 0 && unpaid.tax > 0) {
    let left = unpaid.tax;
    const order = [...run.equipment].sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || b.cost - a.cost);
    for (const u of order) {
      if (left <= 0) break;
      const got = floorS(u.cost * balance.assets.auctionRate);
      removeEquip(run, u.uid);
      bump(run, 'soldForTax', 1);
      logEvent(run, 'sell', `${tierById[u.tier].name} 세금 공매`, got);
      if (got >= left) {
        run.cash += got - left;
        left = 0;
      } else left -= got;
    }
    if (left > 0) run.debts.capital.principal += left;
    run.debts.tax.principal = 0;
    run.taxDueIn = null;
  } else if (taxDue > 0) {
    run.debts.tax.principal = 0;
    run.taxDueIn = null;
    onTaxPaid(g);
  }

  // 7. 연체 처리
  const trig: BankruptCtx[] = [];
  const note = (c: BankruptCtx) => void (trig.length || trig.push(c));
  for (const id of LENDERS) {
    const d = run.debts[id];
    if (rollIds.includes(id as LenderId2)) {
      logEvent(run, 'rollover', `${lenderById[id].name}: 이자 미룸`);
    } else if (due[id] > 0 && unpaid[id] > 0) {
      d.principal += unpaid[id];
      bump(run, 'capitalizedInterest', unpaid[id]);
      bump(run, `capInt.${id}`, unpaid[id]);
      d.overdue += 1;
      bump(run, 'odTotal', 1);
      if (id === 'bank' || id === 'capital') bump(run, 'odInstitution', 1);
      if (id === 'shark2') bump(run, 'od.shark2', 1);
      logEvent(run, `overdue:${id}`, `${lenderById[id].name} 이자 연체 ${d.overdue}회`, unpaid[id]);
      if (id === 'bank' && st['visitsSinceOverdue.bank'] == null) st['visitsSinceOverdue.bank'] = 0;
    } else if (due[id] > 0 || d.principal <= 0) {
      d.overdue = 0;
    }
    if (d.graceLeft > 0) d.graceLeft -= 1;
    run.waivePending[id] = false;
    run.rolloverPending[id] = false;
    for (const p of run.promos[id] ?? []) p.n += 1;
  }
  for (const p of Object.values(run.promos)) void p;
  if (unpaid.upkeep > 0) {
    if (run.house === 0) {
      run.debts.capital.principal += unpaid.upkeep; // 텐트: 비상금 대출로 자동 전환(한도와 무관)
      run.upkeepArrears = 0;
      run.upkeepOverdue = 0;
      logEvent(run, 'overdue:upkeep', '생활비를 못 내 캐피탈 비상금 대출로 넘어감', unpaid.upkeep);
    } else {
      run.upkeepArrears = unpaid.upkeep;
      run.upkeepOverdue += 1;
      logEvent(run, 'overdue:upkeep', `생활비·유지비 미납 ${run.upkeepOverdue}회`, unpaid.upkeep);
      if (run.upkeepOverdue >= balance.living.upkeepMaxOverdue) note({ lastLender: 'upkeep', shortfall: unpaid.upkeep });
    }
  } else {
    run.upkeepArrears = 0;
    run.upkeepOverdue = 0;
  }

  // 딱지와 압류
  for (const id of LENDERS) {
    const d = run.debts[id];
    const limit = lenderById[id].maxOverdue;
    if (d.overdue >= limit) {
      const r = seizeFor(g, id);
      if (r) {
        d.overdue = Math.max(0, limit - 1);
        ensureTag(g, id);
      } else note({ lastLender: id, shortfall: unpaid[id] || unpaid.upkeep });
    } else if (d.overdue >= 1) ensureTag(g, id);
    else removeTags(run, id);
  }
  if (run.debts.tax.principal <= 0) removeTags(run, 'tax');
  refreshShark2Open(g);

  // 8. 친구
  settleFriends(g);

  // 9. 게임 안 사건 · 채권처의 제안
  decayEffects(g);
  rollEvent(g);
  rollOffer(g);

  // 10. 파산 검사
  const sh = Math.max(unpaid.shark2, unpaid.shark1, unpaid.capital, unpaid.bank, unpaid.upkeep);
  if (!trig.length && brokenCount(run) >= balance.bankruptcy.friendsBrokenLimit) trig.push({ lastLender: null, shortfall: sh });
  const gAdd = ((st.garnished as number) ?? 0) - garnishedBefore;
  (st.garnishBySettle as number[]).push(gAdd);
  if ((st.garnishBySettle as number[]).length > 3) (st.garnishBySettle as number[]).shift();
  void forcedBefore;
  if (trig.length) declareBankruptcy(g, trig[0]);

  // 정산 봉을 닫고 정보 규칙을 돌린다
  if (!run.over) {
    closeBars(run);
    runTips(g);
  }
  st.liqLossPrev = st.liqLossCur ?? 0;
  st.liqLossCur = 0;
  st.liqTipPrev = st.liqTipCur ?? null;
  st.liqTipCur = null;
  st.liqLossTop = 0;
  st.liqsThisCycle = 0;

  // 11. 통계·최고 순자산·알림
  run.settleNo += 1;
  const nw = netWorth(run);
  if (nw > run.peakNetWorth) run.peakNetWorth = nw;
  if (run.peakNetWorth > g.family.peakNetWorth && nw >= run.peakNetWorth) st.familyRecordTick = run.tick;
  st.interestOnlyStreak = rep.interest > 0 && !st.stampedCycle ? (st.interestOnlyStreak ?? 0) + 1 : 0;
  st.stampedCycle = 0;
  run.lastSettlement = rep;
  if (!run.over)
    notify(run, `정산: 캔 값 +${comma(rep.mined)} / 전기세 -${comma(rep.power)} / 이자·생활비 -${comma(rep.interest + rep.living)}`, 'settle');
}

const tierRank = (tier: string): number => tierDefs.findIndex((x) => x.id === tier);
type LenderId2 = 'bank' | 'capital' | 'shark1' | 'shark2';
export type { DebtId };

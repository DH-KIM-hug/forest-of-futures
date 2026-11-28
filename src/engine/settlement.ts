// 정산 한 번(GDD_v2 3.1의 순서). 파산하면 g.run.over 가 true.
import { balance, lenderById, tierById, tierDefs } from './data';
import { ceilS, floorS } from './rng';
import { declareBankruptcy, type BankruptCtx } from './bankruptcy';
import { decayEffects, rollEvent } from './events';
import { equipGross, equipNetNow, equipPower, isActive, laborWage, removeEquip, spokesGross, staffedWheelGross, tierWage, wheelStaffed } from './equipment';
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
import { settleSec } from './pace';
import { refreshShark2Open } from './loans';
import { liteRefer } from './liteRefer';
import { comma, logEvent, notify } from './util';
import type { CoinId, DebtId, GameState, PayId, RunState } from './types';

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
  let wages = 0;
  for (const c of ownedCoins(run)) {
    if (run.coinWheels[c].on) mined += spokesGross(g, c) * (price(run, c) / refPrice(run, c));
    if (wheelStaffed(run, c)) { mined += staffedWheelGross(c) * (price(run, c) / refPrice(run, c)); wages += laborWage(); }
  }
  for (const u of run.equipment) if (isActive(run, u)) wages += tierWage(u.tier);
  let interest = 0;
  for (const id of LENDERS) interest += interestDue(g, id);
  const living = livingDue(g);
  return { mined, power, wages, interest, living, net: mined - power - wages - interest - living };
}

/** 캐는 값을 sec 초어치 넣는다(U-43 사용자: "알바로 버는 돈은 거의 0.1초당 올라가고, 정산은 20초당"): 켜진 설비 · 알바가 도는 쳇바퀴 · 관성 바퀴가 정산 한 번에 캐는 값 × sec ÷ 정산 간격.
 *  가압류(딱지 30%)와 바로 팔기는 depositMined 가 그대로 한다. 엔진은 틱(1초)마다 1초어치를 넣는다. 화면은 그 사이를 0.1초 걸음으로 이어 보여 준다. */
export function creditMining(g: GameState, sec: number): number {
  const run = g.run;
  if (!(sec > 0) || run.over) return 0;
  const k = sec / settleSec(run);
  const perCoin: Partial<Record<CoinId, number>> = {};
  for (const u of run.equipment) if (isActive(run, u)) perCoin[u.coin] = (perCoin[u.coin] ?? 0) + equipGross(g, u);
  for (const c of ownedCoins(run)) if (run.coinWheels[c].on) perCoin[c] = (perCoin[c] ?? 0) + spokesGross(g, c) + (wheelStaffed(run, c) ? staffedWheelGross(c) : 0);
  let sum = 0;
  for (const c of ownedCoins(run)) {
    const v = (perCoin[c] ?? 0) * k;
    if (v > 0) {
      sum += v * (price(run, c) / refPrice(run, c));
      depositMined(g, c, v);
    }
  }
  run.stats.creditedSec = ((run.stats.creditedSec as number | undefined) ?? 0) + sec;
  run.stats.minedCur = ((run.stats.minedCur as number | undefined) ?? 0) + sum;
  return sum;
}
/** 이번 정산 구간에서 아직 안 들어온 캐는 값의 몫(0~1): 정산까지 남은 수입을 어림할 때 쓴다 */
export const miningLeftShare = (run: RunState): number => Math.max(0, 1 - (((run.stats.creditedSec as number | undefined) ?? 0) / settleSec(run)));

export function settle(g: GameState, opts: { skipFunding?: boolean } = {}): void {
  const run = g.run;
  const st = run.stats;
  const rep = { settleNo: run.settleNo + 1, mined: 0, power: 0, interest: 0, living: 0, tax: 0, paid: 0, unpaid: 0, forcedSold: 0, wages: 0, quit: 0 };
  // 가압류는 캐는 돈이 틱마다 들어올 때도 떼인다(U-43): 이 정산 몫은 지난 정산이 끝난 때부터 센다
  const garnishedBefore = (st.garnishedMark as number | undefined) ?? 0;
  const forcedBefore = (st.forcedSold as number) ?? 0;

  // 1. 채굴: 캐는 값은 틱마다 조금씩 들어온다(creditMining, U-43). 정산은 이번 구간에 아직 안 들어온 나머지만 넣고(틱 없이 정산만 부르는 따라잡기 · 미리 보기는 구간 전체가 여기서 들어온다),
  //    구간 동안 캔 값의 합을 보고서에 적는다. 한 구간의 합은 예전(정산 때 한꺼번에)과 같다.
  creditMining(g, Math.max(0, settleSec(run) - ((st.creditedSec as number | undefined) ?? 0)));
  rep.mined = Math.round(((st.minedCur as number | undefined) ?? 0) * 1e6) / 1e6; // 틱마다 나눠 넣은 값의 합(끝자리 오차를 턴다)
  st.creditedSec = 0;
  st.minedCur = 0;

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
  // 6-0. 라이트의 소개(U-65): 못 낸 돈을 다음 돈줄이 대신 낸다(연체가 아니다). rep.unpaid 는 모자랐던 돈 그대로.
  // 소개로도 못 메우면(까마귀, 또는 다음 돈줄 한도가 모자람) 연체 없이 이 정산에 파산(아래 파산 검사)
  const referBust = liteRefer(g, unpaid, rep);

  // 6-1. 알바 일당(U-30): 이자·생활비를 낸 뒤 남은 현금에서 한 마리씩. 못 받은 알바는 그 자리에서 나간다(빚으로 남지 않는다).
  const payWage = (w: number, leave: () => void) => {
    if (w <= 0) return;
    if (run.cash >= w) {
      run.cash -= w;
      rep.wages += w;
    } else {
      leave();
      rep.quit += 1;
      bump(run, 'hamstersQuit', 1);
      logEvent(run, 'quit:hamster', '알바 햄스터가 일당을 못 받고 나갔다', w);
    }
  };
  for (const c of ownedCoins(run)) if (wheelStaffed(run, c)) payWage(laborWage(), () => { run.coinWheels[c].staffed = false; });
  for (const u of run.equipment) if (isActive(run, u)) payWage(tierWage(u.tier), () => { u.staffed = false; });
  if (rep.quit > 0) notify(run, `알바 햄스터 ${rep.quit}마리가 일당을 못 받고 나갔다. 빈 쳇바퀴는 돌지 않는다.`, 'warn');

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
  if (referBust) note(referBust);
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
      // 빈 오두막(0단계): 못 낸 생활비는 빚으로 넘어간다(한도와 무관).
      // 1막 시제품(balance.act1): 숲속 캐피탈과 거래한 적 없는 생이면 아는 곳은 오소리 사무소뿐이다 — 오소리 장부에 얹는다(만난 적 없는 캐피탈이 장부에 생기지 않게, U-39 ③).
      const act1 = !!(balance as { act1?: unknown }).act1;
      const knowsCapital = ((st['borrow.capital'] as number | undefined) ?? 0) > 0 || run.debts.capital.principal > 0;
      const to: 'shark1' | 'capital' = act1 && !knowsCapital ? 'shark1' : 'capital';
      run.debts[to].principal += unpaid.upkeep;
      run.upkeepArrears = 0;
      run.upkeepOverdue = 0;
      bump(run, `livingToDebt.${to}`, unpaid.upkeep);
      logEvent(run, 'overdue:upkeep', to === 'shark1' ? '생활비를 못 내 오소리 장부에 얹음' : `생활비를 못 내 ${lenderById.capital.name} 비상금 대출로 넘어감`, unpaid.upkeep);
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
  st.garnishedMark = (st.garnished as number) ?? 0;
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
  // 새 날 아침: 하루 손실 한도(C3b)의 셈을 비운다
  if (run.settleNo % balance.settlement.dayCycleSettlements === 0) st.dayLoss = 0;
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

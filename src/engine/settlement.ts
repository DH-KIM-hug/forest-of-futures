import { balance, lenderById, housingRules } from './data';
import { declareBankruptcy } from './bankruptcy';
import { decayEffects, rollEvent } from './events';
import { settleFriends } from './friends';
import { earn } from './labor';
import { applyFunding } from './trading';
import { currentJobId, interestDue, jobById, netWorth, rateMult, refreshLatches, upkeepDue, brokenCount } from './selectors';
import { say, comma, signed } from './util';
import type { GameState, LenderId, PayId } from './types';

const PAY_ORDER: PayId[] = balance.settlement.payOrder;

/** 정산 한 번. 파산했으면 g.run.over 가 true 가 된다. */
export function settle(g: GameState): void {
  const run = g.run;
  const st = run.stats;
  const credit = balance.credit;
  // 0. 방치 연속 횟수
  st.idleStreak = run.cycleTapCount === 0 && run.cycleEntries === 0 ? st.idleStreak + 1 : 0;

  // 1. 급여
  const job = jobById(run.jobId);
  const wage = job.wagePerSettlement;
  if (wage > 0) earn(run, g, wage);

  // 2. 펀딩비
  if (applyFunding(g)) return;

  // 3. 납부
  const paidAt: Record<string, number> = {};
  const unpaid: Record<string, number> = {};
  let interestPaid = 0;
  for (const id of PAY_ORDER) {
    const due = id === 'upkeep' ? upkeepDue(run) : interestDue(run, id as LenderId);
    if (due <= 0) {
      paidAt[id] = 0;
      unpaid[id] = 0;
      continue;
    }
    const pay = Math.min(due, run.cash);
    run.cash -= pay;
    paidAt[id] = pay;
    unpaid[id] = due - pay;
    interestPaid += pay;
  }

  // 4. 연체 처리
  let shortfall = 0;
  let anyUnpaid = false;
  for (const id of PAY_ORDER) {
    const u = unpaid[id];
    if (u > 0) {
      anyUnpaid = true;
      shortfall += u;
      st.odTotal += 1;
      g.life.lifeOdTotal += 1;
      if (id === 'shark1') g.life.lifeOdShark1 += 1;
      if (id === 'shark2') g.life.lifeOdShark2 += 1;
      run.streak[id] += 1;
      run.creditScore = Math.max(credit.min, run.creditScore + credit.perOverdue);
      if (id === 'upkeep') run.upkeepArrears = u;
      else {
        run.debts[id as LenderId] += u;
        st.capitalizedInterest += u;
      }
    } else {
      run.streak[id] = 0;
      if (id === 'upkeep') run.upkeepArrears = 0;
    }
  }
  refreshLatches(run);
  if (!anyUnpaid) run.creditScore = Math.min(credit.max, run.creditScore + credit.perCleanSettlement);

  // 5. 친구
  settleFriends(g);

  // 6. 속보
  decayEffects(g);
  rollEvent(g);

  const wageTxt = wage > 0 ? `급여 +${comma(wage)}` : '급여 0';
  const text = `정산: ${wageTxt} / 이자 -${comma(interestPaid)}`;

  // 7. 파산 검사
  let overdueCause: string | null = null;
  let causeLender: string | null = null;
  for (const id of PAY_ORDER) {
    if (run.streak[id] >= limitOf(id)) {
      overdueCause = `overdue_${id}`;
      causeLender = id;
      break;
    }
  }
  let cause: string | null = null;
  let immediate = false;
  if (overdueCause) {
    cause = overdueCause;
    const att = balance.bankruptcy.attributeToTrading;
    if (att.enabled && st.liqsThisCycle >= 1 && -run.cycleRealized >= shortfall && shortfall > 0) cause = 'liquidation';
  }
  if (cause !== 'liquidation' && brokenCount(run) >= balance.bankruptcy.friendsBrokenLimit) cause = 'friends';
  if (cause) {
    run.lastSettlement = { cycle: run.cycles + 1, wage, interest: interestPaid, text };
    st.shortfall = shortfall;
    declareBankruptcy(g, cause, { immediate, causeLender, shortfall });
    return;
  }

  // 8. 통계 갱신
  run.cycles += 1;
  st.cycles += 1;
  st.liqsThisCycle = 0;
  run.cycleRealized = 0;
  run.cycleTapCount = 0;
  run.cycleEntries = 0;
  if (st.cyclesSinceMove !== null) st.cyclesSinceMove += 1;
  if (st.cyclesSinceBankBorrow !== null) st.cyclesSinceBankBorrow += 1;
  if (st.cyclesSinceShark2Borrow !== null) st.cyclesSinceShark2Borrow += 1;
  run.lastSettlement = { cycle: run.cycles, wage, interest: interestPaid, text };
  if (run.digest) {
    run.digest.cycles += 1;
    run.digest.wage += wage;
    run.digest.interest += interestPaid;
  }
  for (const id of PAY_ORDER) {
    if (unpaid[id] > 0) {
      const name = id === 'upkeep' ? '유지비' : lenderById[id].name;
      const lim = limitOf(id);
      say(run, `${name} 연체 ${run.streak[id]}/${lim}. 다음 정산까지 내지 못하면 끝입니다.`, 'warn');
      break;
    }
  }
  if (!anyUnpaid) say(run, text, 'settle');
  const jid = currentJobId(run);
  if (jid !== run.jobId) {
    run.jobId = jid;
    say(run, `일자리가 바뀌었다: ${jobById(jid).name}`, 'job');
  }
  void rateMult;
  void netWorth;
  void signed;
}

export function limitOf(id: string): number {
  if (id === 'upkeep') return housingRules.upkeepMaxOverdueStreak;
  return lenderById[id].maxOverdueStreak;
}

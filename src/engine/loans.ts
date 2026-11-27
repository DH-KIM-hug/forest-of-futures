// 채권처 대출·원금 탕감 도장·이자 미루기(GDD_v2 3.5). 대출은 그 건물에 가 있어야 한다는 것은 화면 몫.
import { balance, lenderById, lendersMeta } from './data';
import { ceilS, floorS } from './rng';
import { traitVal } from './legacy';
import { onTaxPaid, returnPawn } from './generation';
import { lenderLimit, sharkDebt, totalDebt, interestDue, nextBorrowRate } from './selectors';
import { addToSet, bump, stat } from './stats';
import { friendsOn } from './friends';
import { isNight, logEvent, notify } from './util';
import type { DebtId, GameState, LenderId, Res } from './types';

export const refuse = (code: string, msg: string): Res => ({ ok: false, code, msg });

/** 독사 골목이 열려 있는가: 연체·총부채 50만·채권 양도·전단지·기질 '빚 내성'. */
export function refreshShark2Open(g: GameState): void {
  const run = g.run;
  if (run.shark2Open) return;
  const c = lendersMeta.shark2Open;
  const anyOd = Object.values(run.debts).some((d) => d.overdue >= 1) || run.upkeepOverdue >= 1;
  if ((c.anyOverdue && anyOd) || totalDebt(run) >= c.totalDebtAtLeast || (c.claimSold && stat(run, 'claimsSold') > 0) || traitVal(g, 'shark2OpenAtStart')) run.shark2Open = true;
}

export function closedNow(g: GameState, id: DebtId): boolean {
  return (id === 'bank' || id === 'tax') && isNight(g.run);
}

function closedRes(g: GameState, id: DebtId): Res {
  logEvent(g.run, 'closed:bank', `${lenderById[id].name}: 영업시간이 끝났다`);
  return refuse('closed', lenderById.bank.lines.closed);
}

export function borrow(g: GameState, id: LenderId, consent = false, unitOverride?: number, rateCut = 0): Res {
  const run = g.run;
  const l = lenderById[id];
  if (run.over) return { ok: false };
  if (id === 'shark2' && !run.shark2Open) return refuse('locked', '아직 갈 일이 없는 골목입니다.');
  if (closedNow(g, id)) return closedRes(g, id);
  // 한 번에 빌리는 단위보다 남은 한도가 적으면 남은 만큼만 빌린다(DECISIONS_LOG U-20). 남은 한도가 0 이면 거절.
  const room = Math.max(0, lenderLimit(g, id) - run.debts[id].principal);
  const unit = unitOverride ?? (room > 0 ? Math.min(l.borrowUnit!, room) : l.borrowUnit!);
  if (id === 'bank' && run.house <= 0) {
    bump(run, 'bankRefusals', 1);
    logEvent(run, 'refused:bank', `${l.name}: 담보가 확인되지 않음`);
    return refuse('collateral', l.lines.refuseCollateral);
  }
  if (run.debts[id].principal + unit > lenderLimit(g, id)) {
    if (id === 'bank') bump(run, 'bankRefusals', 1);
    logEvent(run, `refused:${id}`, `${l.name}: 한도 초과`);
    return refuse('limit', l.lines.refuseLimit ?? l.lines.refuseCollateral);
  }
  if (id === 'shark2' && friendsOn() && stat(run, 'borrow.shark2') >= (l.contactsFromNth ?? 2) - 1) {
    if (!consent) return refuse('consent', '지인 연락처 제출에 동의해야 합니다.');
    run.stats.contacts = true;
  }
  const upfront = id === 'shark2' ? (traitVal(g, 'shark2Upfront') ?? l.upfront) : l.upfront;
  const received = floorS(unit * (1 - upfront));
  // 오소리 대부: 같은 생에 두 번째로 빌리는 돈부터는 더 높은 금리(그 몫에만)
  // rateCut = 마진콜 전화로 그 자리에서 빌릴 때의 금리 할인(스킬트리 B2 의 꼬리). 그 채권처의 보통 금리 아래로는 내려가지 않는다.
  const rateNow = Math.max(l.rate, nextBorrowRate(g, id) - Math.max(0, rateCut));
  if (rateNow !== l.rate) (run.debts[id].tranches ??= []).push({ amount: unit, rate: rateNow });
  run.cash += received;
  run.debts[id].principal += unit;
  bump(run, 'upfrontPaid', unit - received);
  if (id === 'shark1' || id === 'shark2') bump(run, 'sharkBorrowed', unit);
  if (id === 'shark2' && run.stats.flyerOpen) bump(run, 'flyerLoans', 1);
  if (id === 'shark2') bump(run, 'borrow.shark2', 1);
  else bump(run, `borrow.${id}`, 1);
  if (id === 'bank' && run.stats['visitsSinceOverdue.bank'] != null) run.stats['visitsSinceOverdue.bank'] += 1;
  run.recentBorrows = run.recentBorrows.filter((b) => run.tick - b.tick <= balance.trading.fundedByWindowSec * 2);
  run.recentBorrows.push({ src: id, kind: 'lender', tick: run.tick, counted: false });
  logEvent(run, `borrow:${id}`, `${l.name}에서 빌림`, received);
  refreshShark2Open(g);
  return { ok: true, amount: received };
}

/** 빌리고 60초 안에 선물에 들어가면 포지션에 붙는 꼬리표(M2 가 읽는다). */
export function fundedByAt(g: GameState, tick = g.run.tick): string | null {
  const w = balance.trading.fundedByWindowSec;
  for (let i = g.run.recentBorrows.length - 1; i >= 0; i--) {
    const b = g.run.recentBorrows[i];
    if (tick - b.tick <= w) return b.src;
  }
  return null;
}

/** 60초 안에 빌린 곳이 있고 다른 곳에 도장을 찍으면 돌려막기. */
export function noteRepay(g: GameState, targetId: string, kind: 'lender' | 'friend'): void {
  const run = g.run;
  const b = run.recentBorrows.find((x) => !x.counted && x.src !== targetId && run.tick - x.tick <= balance.trading.fundedByWindowSec);
  if (!b) return;
  b.counted = true;
  bump(run, 'refi', 1);
  if (b.src === 'shark2' && targetId === 'shark1') bump(run, 'refi.shark2_to_shark1', 1);
  if (b.kind === 'friend' && kind === 'friend') bump(run, 'refi.friend_to_friend', 1);
  if (b.kind === 'friend' && kind === 'lender') bump(run, 'refi.friend_to_lender', 1);
}

/** 갚는 크기: 도장 단위의 몇 배(1 이상의 정수) 또는 전부. 시제품의 「정산 빼고 갚기」(U-42)가 단위의 n 배를 넘긴다 */
export type Mult = number | 'all';
export function stampAmount(cash: number, principal: number, unit: number, mult: Mult): number {
  if (principal <= 0) return 0;
  if (mult === 'all') return Math.min(cash, principal);
  if (cash < Math.min(unit, principal)) return 0;
  if (!(mult >= 1)) return 0;
  return Math.min(unit * Math.floor(mult), principal, cash);
}

export function stamp(g: GameState, id: DebtId, mult: Mult = 1): Res {
  const run = g.run;
  const l = lenderById[id];
  if (run.over) return { ok: false };
  if (closedNow(g, id)) return closedRes(g, id);
  const d = run.debts[id];
  if (d.principal <= 0) return refuse('none', '빚 없음');
  const amt = stampAmount(run.cash, d.principal, l.stampUnit, mult);
  if (amt <= 0) return refuse('cash', '현금 부족');
  run.cash -= amt;
  d.principal -= amt;
  bump(run, `repaid.${id}`, amt); // 이번 생에 갚은 원금(장부의 금박 도장 · 환생 때 황금 도토코인의 기준)
  // 비싼 몫부터 갚는다: 따로 정한 금리 몫(높은 금리 먼저) → 보통 몫 → 물려받은 몫
  if (d.tranches?.length) {
    let left = amt;
    for (const t of [...d.tranches].sort((a, b) => b.rate - a.rate)) { const cut = Math.min(t.amount, left); t.amount -= cut; left -= cut; }
    d.tranches = d.tranches.filter((t) => t.amount > 0);
  }
  if (d.inherited > 0) {
    bump(run, 'inheritedPaid', amt);
    d.inherited = Math.min(d.inherited, d.principal);
  }
  bump(run, 'stamps', Math.max(1, ceilS(amt / l.stampUnit)));
  if (id === 'shark2') bump(run, 'stamps.shark2', 1);
  run.stats.lastStampAmount = amt;
  run.stats.stampedCycle = 1;
  noteRepay(g, id, 'lender');
  logEvent(run, `stamp:${id}`, `${l.name}에 도장`, amt);
  const cleared = d.principal === 0;
  if (cleared) {
    if (id === 'tax') {
      run.taxDueIn = null;
      onTaxPaid(g);
    }
    returnPawn(g, id);
    notify(run, `${l.name} 완납`, 'info');
  }
  return { ok: true, paid: amt, cleared };
}

/** 이자 미루기(오소리·독사): 다음 정산의 이자를 연체로 치지 않고 원금에 +10% 얹어 더한다. */
export function rollover(g: GameState, id: LenderId): Res {
  const run = g.run;
  const cfg = lendersMeta.rollover;
  if (!cfg.lenders.includes(id) || run.debts[id].principal <= 0) return refuse('none', '미룰 이자가 없습니다.');
  const used = (run.stats[`rollover.${id}`] as number | undefined) ?? 0;
  const lim = cfg.refuseAfter[id];
  if (lim !== null && lim !== undefined && used >= lim) {
    logEvent(run, 'rollover_refused', `${lenderById[id].name}: 이자 미루기 거절`);
    return refuse('refused', '더는 미뤄 줄 수 없습니다.');
  }
  run.stats[`rollover.${id}`] = used + 1;
  bump(run, 'rollovers', 1);
  run.rolloverPending[id] = true;
  logEvent(run, 'rollover', `${lenderById[id].name}: 이번 이자를 미룸`);
  return { ok: true };
}

export { addToSet, interestDue, sharkDebt };

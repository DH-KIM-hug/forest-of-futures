// 채권처 대출·원금 탕감 도장·이자 미루기(GDD_v2 3.5). 대출은 그 건물에 가 있어야 한다는 것은 화면 몫.
import { balance, lenderById, lendersMeta } from './data';
import { ceilS, floorS } from './rng';
import { traitVal } from './legacy';
import { lenderLimit, sharkDebt, totalDebt, interestDue } from './selectors';
import { addToSet, bump, stat } from './stats';
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

export function borrow(g: GameState, id: LenderId, consent = false, unitOverride?: number): Res {
  const run = g.run;
  const l = lenderById[id];
  if (run.over) return { ok: false };
  if (id === 'shark2' && !run.shark2Open) return refuse('locked', '아직 갈 일이 없는 골목입니다.');
  if (closedNow(g, id)) return closedRes(g, id);
  const unit = unitOverride ?? l.borrowUnit!;
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
  if (id === 'shark2' && stat(run, 'borrow.shark2') >= (l.contactsFromNth ?? 2) - 1) {
    if (!consent) return refuse('consent', '지인 연락처 제출에 동의해야 합니다.');
    run.stats.contacts = true;
  }
  const upfront = id === 'shark2' ? (traitVal(g, 'shark2Upfront') ?? l.upfront) : l.upfront;
  const received = floorS(unit * (1 - upfront));
  run.cash += received;
  run.debts[id].principal += unit;
  bump(run, 'upfrontPaid', unit - received);
  if (id === 'shark1' || id === 'shark2') bump(run, 'sharkBorrowed', unit);
  if (id === 'shark2' && run.stats.flyerOpen) bump(run, 'flyerLoans', 1);
  if (id === 'shark2') bump(run, 'borrow.shark2', 1);
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

export type Mult = 1 | 10 | 'all';
export function stampAmount(cash: number, principal: number, unit: number, mult: Mult): number {
  if (principal <= 0) return 0;
  if (mult === 'all') return Math.min(cash, principal);
  if (cash < Math.min(unit, principal)) return 0;
  return Math.min(unit * mult, principal, cash);
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
  bump(run, 'stamps', Math.max(1, ceilS(amt / l.stampUnit)));
  if (id === 'shark2') bump(run, 'stamps.shark2', 1);
  run.stats.lastStampAmount = amt;
  run.stats.stampedCycle = 1;
  noteRepay(g, id, 'lender');
  logEvent(run, `stamp:${id}`, `${l.name}에 도장`, amt);
  const cleared = d.principal === 0;
  if (cleared) {
    if (id === 'tax') run.taxDueIn = null;
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

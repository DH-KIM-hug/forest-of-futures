import { balance, lenderById, friendById } from './data';
import { appraisal, lenderLimit, refreshLatches, isShark2Unlocked } from './selectors';
import { say, comma } from './util';
import type { GameState, LenderId } from './types';
import type { Res } from './trading';

export interface StampRes extends Res {
  paid?: number;
  cleared?: boolean;
}

const refuse = (code: string, msg: string): Res => ({ ok: false, code, msg });

export function borrow(g: GameState, id: LenderId, consent = false): Res {
  const run = g.run;
  const l = lenderById[id];
  const st = run.stats;
  if (run.over) return { ok: false };
  if (id === 'shark2' && !isShark2Unlocked(run)) return refuse('locked', '아직 갈 일이 없는 골목입니다.');
  if (id === 'bank') {
    if (appraisal(run) <= 0) {
      st.bankRefusals += 1;
      run.creditScore = Math.max(balance.credit.min, run.creditScore + balance.credit.perBankRefusal);
      return refuse('collateral', l.refuseLines[0]);
    }
  }
  const limit = lenderLimit(run, id);
  if (run.debts[id] + l.borrowUnit > limit) {
    if (id === 'bank') {
      st.bankRefusals += 1;
      run.creditScore = Math.max(balance.credit.min, run.creditScore + balance.credit.perBankRefusal);
    }
    return refuse('limit', l.refuseLines[l.refuseLines.length - 1]);
  }
  if (id === 'shark2' && st.borrowShark2 >= 1) {
    if (!consent) return refuse('consent', '지인 연락처 제출에 동의해야 합니다.');
    st.contactsSeized = true;
  }
  const received = Math.floor(l.borrowUnit * (1 - l.upfrontRate) + 1e-9);
  run.cash += received;
  run.debts[id] += l.borrowUnit;
  st.upfrontPaid += l.borrowUnit - received;
  if (id === 'capital') st.borrowCapital += 1;
  if (id === 'shark1') {
    st.borrowShark1 += 1;
    st.borrowSharks += 1;
  }
  if (id === 'shark2') {
    st.borrowShark2 += 1;
    st.borrowSharks += 1;
    g.life.lifeBorrowShark2 += 1;
    st.cyclesSinceShark2Borrow = 0;
  }
  if (id === 'bank') st.cyclesSinceBankBorrow = 0;
  run.recentBorrows = run.recentBorrows.filter((b) => run.tick - b.tick <= 120);
  run.recentBorrows.push({ src: id, kind: 'lender', tick: run.tick, counted: false });
  refreshLatches(run);
  say(run, `${l.name} 대출 +${comma(received)}`, 'info');
  return { ok: true };
}

/** 60초 안에 빌린 곳이 있고 다른 곳에 갚았으면 돌려막기. */
export function noteRepay(g: GameState, targetId: string, targetKind: 'lender' | 'friend'): void {
  const run = g.run;
  const st = run.stats;
  const b = run.recentBorrows.find((x) => !x.counted && x.src !== targetId && run.tick - x.tick <= 60);
  if (!b) return;
  b.counted = true;
  st.refiAny += 1;
  if (b.src === 'shark2' && targetId === 'shark1') st.refiShark2ToShark1 += 1;
  if (b.kind === 'friend' && targetKind === 'friend') st.refiFriendToFriend += 1;
  if (b.kind === 'friend' && targetKind === 'lender') st.refiFriendToLender += 1;
}

export type Mult = 1 | 10 | 'all';

export function stampAmount(cash: number, principal: number, unit: number, mult: Mult): number {
  if (principal <= 0) return 0;
  if (mult === 'all') return Math.min(cash, principal);
  if (cash < Math.min(unit, principal)) return 0;
  return Math.min(unit * mult, principal, cash);
}

export function stamp(g: GameState, id: LenderId, mult: Mult = 1): StampRes {
  const run = g.run;
  const l = lenderById[id];
  if (run.over) return { ok: false };
  if (run.debts[id] <= 0) return refuse('none', '빚 없음');
  const amt = stampAmount(run.cash, run.debts[id], l.stampUnit, mult);
  if (amt <= 0) return refuse('cash', '현금 부족');
  run.cash -= amt;
  run.debts[id] -= amt;
  const n = Math.max(1, Math.ceil(amt / l.stampUnit - 1e-9));
  const st = run.stats;
  st.stamps += n;
  if (id === 'bank') st.stampsBank += n;
  if (id === 'shark1') st.stampsShark1 += n;
  if (id === 'shark2') st.stampsShark2 += n;
  noteRepay(g, id, 'lender');
  const cleared = run.debts[id] === 0;
  if (cleared) {
    run.stampFlash = { lender: id, tick: run.tick };
    say(run, `${l.name} 완납`, 'info');
  }
  return { ok: true, paid: amt, cleared };
}

void friendById;

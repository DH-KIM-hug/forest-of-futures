import { friendById, friendDefs, friendRules, balance } from './data';
import { noteRepay, stampAmount } from './loans';
import type { Mult, StampRes } from './loans';
import { refreshLatches } from './selectors';
import { say, comma } from './util';
import type { GameState } from './types';
import type { Res } from './trading';

export function createFriends() {
  const out: Record<string, any> = {};
  for (const f of friendDefs)
    out[f.id] = { trust: friendRules.trustStart, debt: 0, broken: false, dueAt: null, everBorrowed: false, maxedOut: false };
  return out;
}

export function borrowFriend(g: GameState, id: string): Res {
  const run = g.run;
  const f = friendById[id];
  const fs = run.friends[id];
  const st = run.stats;
  if (run.over) return { ok: false };
  if (fs.broken) return { ok: false, code: 'broken', msg: '문이 닫혀 있습니다.' };
  if (fs.trust < friendRules.minTrustToBorrow || fs.debt + f.borrowUnit > f.maxLoan) {
    st.friendRefusals += 1;
    return { ok: false, code: 'refuse', msg: fs.trust < friendRules.minTrustToBorrow ? '지금은 곤란해.' : '더는 빌려줄 수 없어.' };
  }
  if (fs.debt === 0) fs.dueAt = run.cycles + friendRules.dueCycles;
  fs.debt += f.borrowUnit;
  fs.trust += friendRules.trustPerBorrow;
  run.cash += f.borrowUnit;
  st.borrowFriends += 1;
  if (!fs.everBorrowed) {
    fs.everBorrowed = true;
    st.friendsBorrowed += 1;
  }
  if (!fs.maxedOut && fs.debt >= f.maxLoan) {
    fs.maxedOut = true;
    st.friendMaxedOut += 1;
  }
  run.recentBorrows = run.recentBorrows.filter((b) => run.tick - b.tick <= 120);
  run.recentBorrows.push({ src: id, kind: 'friend', tick: run.tick, counted: false });
  say(run, `${f.name}에게 +${comma(f.borrowUnit)}`, 'info');
  return { ok: true };
}

export function stampFriend(g: GameState, id: string, mult: Mult = 1): StampRes {
  const run = g.run;
  const f = friendById[id];
  const fs = run.friends[id];
  if (run.over) return { ok: false };
  if (fs.debt <= 0) return { ok: false, code: 'none', msg: '빚 없음' };
  const amt = stampAmount(run.cash, fs.debt, f.stampUnit, mult);
  if (amt <= 0) return { ok: false, code: 'cash', msg: '현금 부족' };
  run.cash -= amt;
  fs.debt -= amt;
  const n = Math.max(1, Math.ceil(amt / f.stampUnit - 1e-9));
  run.stats.stamps += n;
  run.stats.friendRepayStamps += n;
  fs.trust = Math.min(friendRules.trustMax, fs.trust + friendRules.trustPerStamp * n);
  noteRepay(g, id, 'friend');
  const cleared = fs.debt === 0;
  if (cleared) {
    fs.dueAt = null;
    fs.trust = Math.min(friendRules.trustMax, fs.trust + friendRules.trustOnFullRepay);
    say(run, `${f.name} 빚 완납`, 'info');
  }
  return { ok: true, paid: amt, cleared };
}

/** 신뢰가 0 이하인 친구를 절교 처리한다. */
export function processBreaks(g: GameState): void {
  const run = g.run;
  const st = run.stats;
  for (const f of friendDefs) {
    const fs = run.friends[f.id];
    if (fs.broken || fs.trust > 0) continue;
    fs.broken = true;
    fs.trust = 0;
    st.friendsBroken += 1;
    st.brokenFriendIds.push(f.id);
    g.life.lifeFriendsBroken += 1;
    if (f.onBreak === 'sellClaim') {
      run.debts.shark2 += fs.debt;
      st.claimsSold += fs.debt;
    }
    fs.debt = 0;
    fs.dueAt = null;
    say(run, `${f.name}: ${f.breakLine}`, 'warn');
  }
  refreshLatches(run);
}

/** 정산 5단계. */
export function settleFriends(g: GameState): void {
  const run = g.run;
  const st = run.stats;
  const collecting = st.contactsSeized && run.streak.shark2 >= 1;
  for (const f of friendDefs) {
    const fs = run.friends[f.id];
    if (fs.broken) continue;
    if (fs.debt > 0) {
      if (fs.dueAt !== null && run.cycles >= fs.dueAt) {
        fs.trust += friendRules.trustPerOverdueSettlement;
        st.odFriends += 1;
      }
    } else if (!collecting) {
      fs.trust = Math.min(friendRules.trustMax, fs.trust + friendRules.trustRecoveryPerCleanSettlement);
    }
  }
  if (collecting) {
    for (const f of friendDefs) {
      const fs = run.friends[f.id];
      if (!fs.broken) fs.trust += friendRules.contactCollectionTrustPerSettlement;
    }
  }
  processBreaks(g);
}
void balance;

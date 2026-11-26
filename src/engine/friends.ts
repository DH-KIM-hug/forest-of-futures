// 친구 5명(GDD_v2 3.7). v1 규칙 유지.
import { balance, friendById, friendDefs, friendRules, traitById } from './data';
import { hasTrait } from './legacy';
import { noteRepay, stampAmount, refuse } from './loans';
import type { Mult } from './loans';
import { addToSet, bump } from './stats';
import { logEvent, notify } from './util';
import type { FriendState, GameState, Res, RunState } from './types';

export function createFriends(brokenStartTrust?: number): Record<string, FriendState> {
  const out: Record<string, FriendState> = {};
  for (const f of friendDefs) out[f.id] = { trust: friendRules.trustStart, debt: 0, broken: false, dueAt: null, everBorrowed: false, maxedOut: false };
  void brokenStartTrust;
  return out;
}

export const brokenCount = (run: RunState): number => friendDefs.filter((f) => run.friends[f.id].broken).length;

export function borrowFriend(g: GameState, id: string): Res {
  const run = g.run;
  const f = friendById[id];
  const fs = run.friends[id];
  if (run.over) return { ok: false };
  if (fs.broken) return refuse('broken', '문이 닫혀 있습니다.');
  const amt = Math.min(f.borrowUnit, Math.max(0, f.maxLoan - fs.debt)); // 남은 한도만큼만(U-20)
  if (fs.trust < friendRules.minTrustToBorrow || amt <= 0) {
    logEvent(run, 'refused:friend', `${f.name}: 거절`);
    return refuse('refuse', fs.trust < friendRules.minTrustToBorrow ? '지금은 곤란해.' : '더는 빌려줄 수 없어.');
  }
  if (fs.debt === 0) fs.dueAt = run.settleNo + friendRules.dueCycles;
  fs.debt += amt;
  fs.trust += friendRules.trustPerBorrow;
  run.cash += amt;
  bump(run, 'friendBorrows', 1);
  if (!fs.everBorrowed) {
    fs.everBorrowed = true;
    bump(run, 'friendsBorrowed', 1);
  }
  if (!fs.maxedOut && fs.debt >= f.maxLoan) fs.maxedOut = true;
  run.recentBorrows = run.recentBorrows.filter((b) => run.tick - b.tick <= 120);
  run.recentBorrows.push({ src: 'friend', kind: 'friend', tick: run.tick, counted: false });
  logEvent(run, `borrow:friend`, `${f.name}에게 빌림`, amt);
  return { ok: true, amount: amt };
}

export function stampFriend(g: GameState, id: string, mult: Mult = 1): Res {
  const run = g.run;
  const f = friendById[id];
  const fs = run.friends[id];
  if (run.over) return { ok: false };
  if (fs.debt <= 0) return refuse('none', '빚 없음');
  const amt = stampAmount(run.cash, fs.debt, f.stampUnit, mult);
  if (amt <= 0) return refuse('cash', '현금 부족');
  run.cash -= amt;
  fs.debt -= amt;
  const n = Math.max(1, Math.ceil(amt / f.stampUnit - 1e-9));
  bump(run, 'stamps', n);
  bump(run, 'friendStamps', n);
  if (id === 'raccoon') bump(run, 'friendStamps.raccoon', n);
  fs.trust = Math.min(friendRules.trustMax, fs.trust + friendRules.trustPerStamp * n);
  noteRepay(g, id, 'friend');
  logEvent(run, 'stamp:friend', `${f.name}에게 갚음`, amt);
  const cleared = fs.debt === 0;
  if (cleared) {
    fs.dueAt = null;
    fs.trust = Math.min(friendRules.trustMax, fs.trust + friendRules.trustOnFullRepay);
    notify(run, `${f.name} 빚 완납`, 'info');
  }
  return { ok: true, paid: amt, cleared };
}

/** 신뢰 0 이하인 친구를 절교 처리한다. 채권 양도는 선이자 없이 독사 원금으로. */
export function processBreaks(g: GameState): void {
  const run = g.run;
  for (const f of friendDefs) {
    const fs = run.friends[f.id];
    if (fs.broken || fs.trust > 0) continue;
    fs.broken = true;
    fs.trust = 0;
    bump(run, 'friendsBroken', 1);
    addToSet(run, 'broken', f.id);
    run.stats.lastBroken = f.id;
    run.stats.cashAtBreak = run.cash;
    run.stats.friendDebtAtBreak = fs.debt;
    if (run.stats.firstBreakSettle === undefined) run.stats.firstBreakSettle = run.settleNo;
    if ((run.stats.friendsBroken as number) >= 3 && run.stats.brokenWithinSettles === undefined) run.stats.brokenWithinSettles = run.settleNo - run.stats.firstBreakSettle;
    if (f.onBreak === 'sellClaim' && fs.debt > 0) {
      run.debts.shark2.principal += fs.debt;
      bump(run, 'claimsSold', fs.debt);
      run.shark2Open = true;
    }
    fs.debt = 0;
    fs.dueAt = null;
    logEvent(run, `break:${f.id}`, `${f.name}와 절교`);
    notify(run, `${f.name}: ${f.breakLine}`, 'warn');
  }
}

/** 친구 규칙이 켜져 있는가. 1막 시제품은 인맥을 뺐다(U-29) — 연락처 추심·절교가 화면에 없는 사람들에게 일어나지 않게 끈다(balance.act1.friends = false, U-38). */
export const friendsOn = (): boolean => (balance as { act1?: { friends?: boolean } }).act1?.friends !== false;

/** 정산 8단계. 갚기로 한 날이 지난 빚 -> 신뢰 -20, 연락처 추심 -> 전원 -30. */
export function settleFriends(g: GameState): void {
  if (!friendsOn()) return;
  const run = g.run;
  const collecting = run.stats.contacts === true && run.debts.shark2.overdue >= 1;
  for (const f of friendDefs) {
    const fs = run.friends[f.id];
    if (fs.broken) continue;
    if (fs.debt > 0) {
      if (fs.dueAt !== null && run.settleNo >= fs.dueAt) {
        fs.trust += friendRules.trustPerOverdueSettlement;
        bump(run, 'friendOd', 1);
      }
    } else if (!collecting) {
      fs.trust = Math.min(friendRules.trustMax, fs.trust + friendRules.trustRecoveryPerCleanSettlement);
    }
  }
  if (collecting) {
    for (const f of friendDefs) {
      const fs = run.friends[f.id];
      if (!fs.broken) {
        fs.trust += friendRules.contactCollectionTrustPerSettlement;
        bump(run, 'collectionTrustLoss', -friendRules.contactCollectionTrustPerSettlement);
      }
    }
  }
  processBreaks(g);
}
export { hasTrait, traitById };

// 오소리 사무소의 장부(U-38): 빚을 몫(금리)별 줄로 읽고, 튜토리얼 뒤의 목표("5만 더 갚기")와 금박 도장을 만든다.
// 순수 읽기 모델이다. 규칙은 엔진의 것만 쓴다(갚는 순서 = loans.ts stamp: 비싼 몫 → 보통 몫 → 엄마 빚).
import { balance, lenderById } from '../../engine/data';
import { haggleMult, rateMult } from '../../engine/selectors';
import type { GameState } from '../../engine/types';

/** 장부 한 줄. repeat = 두 번째부터 빌린 돈(2%), first = 처음 빌린 돈(1.3%), mom = 엄마 빚(옛 이자 0.5%) */
export interface LedgerRow { key: 'repeat' | 'first' | 'mom'; label: string; ratePct: number; left: number; start: number; interest: number; /** 고정금리(금리 인상 사건에도 그대로) */ fixed: boolean }

/** 금박 도장 하나에 필요한 상환액. 환생 때 받는 황금 실물 도토코인과 같은 기준이다(SKILLTREE_TRADE.md: 갚은 원금 5만당 1개). */
export const STAMP_STEP = 50_000;
const ceil = (x: number) => Math.ceil(x - 1e-9);

/** 이번 생에 오소리 대부에게 갚은 원금 */
export const repaidOffice = (g: GameState): number => (g.run.stats['repaid.shark1'] as number | undefined) ?? 0;
/** 장부에 찍힌 금박 도장 수 */
export const goldStamps = (g: GameState): number => Math.floor(repaidOffice(g) / STAMP_STEP);

export function ledgerRows(g: GameState): LedgerRow[] {
  const d = g.run.debts.shark1;
  const l = lenderById.shark1 as { rate: number; repeatRate?: number; borrowUnit?: number };
  const m = rateMult(g);
  const unit = l.borrowUnit ?? 100_000;
  const borrows = (g.run.stats['borrow.shark1'] as number | undefined) ?? 0;
  const repeatLeft = Math.min(d.principal, (d.tranches ?? []).reduce((a, t) => a + t.amount, 0));
  const momLeft = Math.min(d.inherited ?? 0, d.principal - repeatLeft);
  const firstLeft = Math.max(0, d.principal - repeatLeft - momLeft);
  const momRate = d.rateCap != null ? Math.min(l.rate, d.rateCap) : l.rate;
  const repeatRate = (d.tranches ?? [])[0]?.rate ?? l.repeatRate ?? l.rate;
  const momStart = (balance.start.debts as Record<string, number>).shark1 ?? 0;
  const rows: LedgerRow[] = [];
  // 엄마 빚은 고정금리다("어머님 때 이자 그대로"): 금리 인상 사건의 배수를 받지 않는다(U-39 ⑥, 엔진 interestDue 와 같은 셈)
  const momFixed = d.rateCap != null && d.rateCap < l.rate;
  const row = (key: LedgerRow['key'], label: string, rate: number, left: number, start: number, fixed = false) => {
    if (start <= 0 && left <= 0) return;
    rows.push({ key, label, ratePct: +(rate * 100).toFixed(1), left, start: Math.max(start, left), interest: ceil(left * rate * (fixed ? haggleMult(g) : m)), fixed });
  };
  row('repeat', '더 빌린 돈', repeatRate, repeatLeft, Math.max(0, borrows - 1) * unit);
  // 빌린 적이 없는데 이 줄에 돈이 있으면 못 낸 이자·생활비가 얹힌 것이다
  row('first', borrows >= 1 ? '처음 빌린 돈' : '밀려서 얹힌 돈', l.rate, firstLeft, borrows >= 1 ? unit : 0);
  row('mom', g.run.lite ? '코인 빚' : '엄마 빚', momRate, momLeft, momStart, momFixed); // 라이트: 날다람쥐코인을 사려고 빌린 30만
  return rows;
}

/** amount 를 갚으면 정산마다 이자가 얼마나 주는가(비싼 줄부터 지운다) */
export function interestCut(g: GameState, amount: number): number {
  const m = rateMult(g);
  let left = amount, cut = 0;
  for (const r of ledgerRows(g)) {
    const a = Math.min(r.left, left);
    left -= a;
    cut += a * (r.ratePct / 100) * (r.fixed ? haggleMult(g) : m);
  }
  return Math.floor(cut + 1e-9);
}

export interface LedgerGoal { label: string; cur: number; need: number; cut: number }
/** 튜토리얼 뒤의 목표: 다음 금박 도장까지(5만 단위). 남은 빚이 5만보다 적으면 남은 만큼. 오소리 빚이 없으면 null */
export function ledgerGoal(g: GameState): LedgerGoal | null {
  const left = g.run.debts.shark1.principal;
  if (left <= 0) return null;
  const cur = repaidOffice(g) % STAMP_STEP;
  const need = Math.min(STAMP_STEP, cur + left);
  const rows = ledgerRows(g);
  const top = rows.find((r) => r.left > 0)!;
  return { label: top.key === 'mom' ? `${g.run.lite ? '코인 빚' : '엄마 빚'} 잔액 ${man(left)}` : '오소리 빚 갚기, 높은 금리부터', cur, need, cut: interestCut(g, need - cur) };
}
const man = (x: number) => (x % 10000 === 0 ? `${x / 10000}만` : Math.round(x).toLocaleString('ko-KR'));

/** 장부에서 일어난 일(이야기 장면의 열쇠). 갚기 전·후의 장부를 견준다. 한 번에 여러 줄을 넘으면 가장 뒤의 것 하나만. */
export type LedgerBeat = 'repeatCleared' | 'firstCleared' | 'mom20' | 'mom10' | 'momCleared';
export function ledgerBeat(before: GameState, after: GameState): LedgerBeat | null {
  const at = (g: GameState, k: LedgerRow['key']) => ledgerRows(g).find((r) => r.key === k)?.left ?? 0;
  const was = (k: LedgerRow['key']) => at(before, k), now = (k: LedgerRow['key']) => at(after, k);
  if (after.run.debts.shark1.principal >= before.run.debts.shark1.principal) return null;
  if (was('mom') > 0 && now('mom') <= 0 && after.run.debts.shark1.principal <= 0) return 'momCleared';
  if (was('mom') > 100_000 && now('mom') <= 100_000) return 'mom10';
  if (was('mom') > 200_000 && now('mom') <= 200_000) return 'mom20';
  if ((was('first') > 0 || was('repeat') > 0) && now('first') <= 0 && now('repeat') <= 0) return 'firstCleared';
  if (was('repeat') > 0 && now('repeat') <= 0) return 'repeatCleared';
  return null;
}

// ── 엄마 이야기의 단서 셋(U-39 ⑫, 사용자 "재밌으면 넣어") ─────────────────
// 한 번에 하나만, 설명 없이, 내가 한 일에 묶여 나온다. 엄마도 10만까지 갚았다가 다시 30만이 됐다 — 내가 갚다가 다시 빌리는 바로 그때 보인다.
export type MomClue = 'reason' | 'mirror' | 'frame';
/** 지금 보여 줄 단서(없으면 null). seen = 이번 생에 이미 본 것, reborrowed = 방금 "갚은 적이 있는데 다시 빌렸다", shownThisVisit = 이번 방문(같은 정산 사이)에 이미 하나 보여 줬다.
 *  reason(지워진 사유 칸) = 첫 금박 도장 · mirror(10만에서 다시 30만) = 갚다가 다시 빌린 때 · frame(뒤집힌 액자) = 엄마 빚 줄에 처음 손이 닿은 때 */
export function momClueDue(g: GameState, seen: Partial<Record<MomClue, boolean>>, o: { reborrowed: boolean; shownThisVisit: boolean }): MomClue | null {
  if (o.shownThisVisit) return null;
  const momStart = (balance.start.debts as Record<string, number>).shark1 ?? 0;
  const mom = ledgerRows(g).find((r) => r.key === 'mom');
  if (!seen.mirror && o.reborrowed && ((g.run.stats['repaidGross.shark1'] as number | undefined) ?? repaidOffice(g)) > 0) return 'mirror';
  if (!seen.reason && goldStamps(g) >= 1) return 'reason';
  if (!seen.frame && momStart > 0 && (mom?.left ?? 0) < momStart && repaidOffice(g) > 0) return 'frame';
  return null;
}

/** 지금 갚으면 무엇을 사는가(U-42 ⑤: 이긴 장면의 [갚으러 간다] 단추에 적는다). keep = 손에 남길 돈(다음 정산에 낼 돈).
 *  amount = 갚을 수 있는 돈(손에 든 돈 − keep, 남은 빚까지), cut = 정산마다 줄어드는 이자, stamps = 새로 찍히는 금박 도장, from → to = 다음 도장까지의 막대(%) */
export interface RepayBuys { amount: number; /** 도장 단위의 몇 배(엔진 stamp 의 mult) */ mult: number; cut: number; stamps: number; from: number; to: number; text: string }
export function repayBuys(g: GameState, keep: number): RepayBuys | null {
  const left = g.run.debts.shark1.principal;
  const unit = (lenderById.shark1 as { stampUnit: number }).stampUnit;
  const free = Math.floor(g.run.cash - Math.max(0, keep));
  // 갚는 돈은 도장 단위(1만)로 끊는다. 남은 빚이 그보다 적으면 남은 빚 전부
  const mult = Math.floor(Math.min(free, left) / unit);
  const amount = mult >= 1 ? mult * unit : left <= free && left > 0 ? left : 0;
  if (!(amount > 0)) return null;
  const cur = repaidOffice(g) % STAMP_STEP;
  const stamps = Math.floor((cur + amount) / STAMP_STEP);
  const from = Math.round((cur / STAMP_STEP) * 100), to = Math.round((((cur + amount) % STAMP_STEP) / STAMP_STEP) * 100);
  const cut = interestCut(g, amount);
  const nn = (x: number) => Math.round(x).toLocaleString('ko-KR');
  return { amount, mult: Math.max(1, mult), cut, stamps, from, to, text: `${nn(amount)} 갚으면 이자 −${nn(cut)}, ${stamps > 0 ? `금박 도장 +${stamps}` : `다음 도장 ${to}%`}` };
}

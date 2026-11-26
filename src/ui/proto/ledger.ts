// 오소리 사무소의 장부(U-38): 빚을 몫(금리)별 줄로 읽고, 튜토리얼 뒤의 목표("5만 더 갚기")와 금박 도장을 만든다.
// 순수 읽기 모델이다. 규칙은 엔진의 것만 쓴다(갚는 순서 = loans.ts stamp: 비싼 몫 → 보통 몫 → 엄마 빚).
import { balance, lenderById } from '../../engine/data';
import { rateMult } from '../../engine/selectors';
import type { GameState } from '../../engine/types';

/** 장부 한 줄. repeat = 두 번째부터 빌린 돈(6%), first = 처음 빌린 돈(4%), mom = 엄마 빚(옛 이자 1.5%) */
export interface LedgerRow { key: 'repeat' | 'first' | 'mom'; label: string; ratePct: number; left: number; start: number; interest: number }

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
  const row = (key: LedgerRow['key'], label: string, rate: number, left: number, start: number) => {
    if (start <= 0 && left <= 0) return;
    rows.push({ key, label, ratePct: +(rate * 100).toFixed(1), left, start: Math.max(start, left), interest: ceil(left * rate * m) });
  };
  row('repeat', '더 빌린 돈', repeatRate, repeatLeft, Math.max(0, borrows - 1) * unit);
  row('first', '처음 빌린 돈', l.rate, firstLeft, borrows >= 1 ? unit : 0);
  row('mom', '엄마 빚', momRate, momLeft, momStart);
  return rows;
}

/** amount 를 갚으면 정산마다 이자가 얼마나 주는가(비싼 줄부터 지운다) */
export function interestCut(g: GameState, amount: number): number {
  const m = rateMult(g);
  let left = amount, cut = 0;
  for (const r of ledgerRows(g)) {
    const a = Math.min(r.left, left);
    left -= a;
    cut += a * (r.ratePct / 100) * m;
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
  const what = top.key === 'mom' ? `엄마 빚 ${man(left)} 남음` : `${top.ratePct}% 빚부터`;
  return { label: `오소리 장부 · ${what}`, cur, need, cut: interestCut(g, need - cur) };
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

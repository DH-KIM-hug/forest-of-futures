// 도토리로 건 출구(U-41)를 포지션마다 기억해 두고, 크기나 비용이 바뀌면 같은 돈이 되게 다시 건다(추가 진입 뒤 · 정산의 펀딩비 뒤).
// 화면 상태다(저장하지 않는다). 엔진에는 그 돈이 되는 ROE 만 넘긴다(stops.ts acornStops).
import { useGame } from '../../store/gameStore';
import { balance } from '../../engine/data';
import { exitFee } from '../../engine/futures';
import { exitFeeMul } from '../../engine/skilltree';
import type { Position, RunState } from '../../engine/types';
import { acornStops, type StopCtx } from './stops';

/** 종목 → 도토리로 정한 출구(이만큼 따면 · 이만큼 잃으면, 없으면 null) */
export const plans: Record<string, { tp: number | null; sl: number | null }> = {};

/** 열린 포지션의 출구 셈에 드는 숫자. 이미 낸 돈 = 들어갈 때 수수료 + 지금까지 증거금에서 빠진 펀딩비
 *  (회차 4 의 실시간 판에서 본 것: 펀딩비를 빼지 않으면 정산을 두 번 넘긴 "+7,750" 익절이 +7,563 으로 닫혔다) */
export function ctxOfPosition(run: RunState, p: Position): StopCtx {
  return {
    notional: p.notional, lev: p.lev, margin: p.margin, feesIn: p.feesPaid + (p.fundingPaid ?? 0),
    feeOut: exitFee(p, exitFeeMul(run)), feeOutSl: exitFee(p, exitFeeMul(run, 'sl')), maint: balance.trading.maintenanceRate as number,
  };
}
/** 걸어 둔 도토리 출구를 지금 포지션에 맞춰 다시 건다. 포지션이 없으면 기억을 지운다. 바뀐 것이 없으면 아무것도 하지 않는다. */
export function reapplyPlan(market: string): void {
  const st = useGame.getState();
  const run = st.g.run;
  const p = run.positions[market];
  const pl = plans[market];
  if (!p) { delete plans[market]; return; }
  if (!pl || (pl.tp === null && pl.sl === null)) return;
  const a = acornStops(ctxOfPosition(run, p), pl.tp, pl.sl);
  // 따라가는 손절(나무 C1, U-50)로 올라온 손절은 내리지 않는다
  const sl0 = pl.sl !== null ? a.sl : p.slRoe;
  const sl = p.trailed && sl0 !== null && p.slRoe !== null ? Math.max(sl0, p.slRoe) : sl0, tp = pl.tp !== null ? a.tp : p.tpRoe;
  const same = (x: number | null, y: number | null) => (x === null || y === null ? x === y : Math.abs(x - y) < 1e-9);
  if (same(sl, p.slRoe) && same(tp, p.tpRoe)) return;
  st.act({ type: 'stops', market, sl, tp });
}
/** 열린 포지션 전부(정산 뒤에 부른다) + 닫힌 종목의 기억 지우기 */
export function reapplyAllPlans(): void {
  for (const m of Object.keys(plans)) reapplyPlan(m);
}

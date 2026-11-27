// 정산 간격(U-47): 보통 60초. 첫 생의 튜토리얼 동안(튜토리얼 거래 · 청산 · 두 번째 대출 · "지금부터 실제 시세" 알림까지)은 introSec 20초.
// 정산 한 번에 오가는 돈은 간격과 무관하게 같다(정산당 숫자). 튜토리얼이 끝나는 순간 endIntro 가 남은 시간을 새 간격에 맞춰 늘린다.
import { balance } from './data';
import type { GameState, Res, RunState } from './types';

/** 이 생의 지금 정산 간격(초) */
export const settleSec = (run: RunState): number => (run.intro ? (balance.settlement.introSec ?? balance.settlement.intervalSec) : balance.settlement.intervalSec);

/** 튜토리얼이 끝났다: 정산 간격이 보통 간격이 된다. 이번 정산 구간에서 지난 몫(0~1)은 그대로 두고 남은 시간 · 이미 넣은 캐는 값의 초를 새 간격에 맞춘다. */
export function endIntro(g: GameState): Res {
  const run = g.run;
  if (!run.intro) return { ok: true };
  const from = settleSec(run);
  run.intro = false;
  const k = settleSec(run) / from;
  run.settleIn = Math.max(1, Math.round(run.settleIn * k));
  const cs = run.stats.creditedSec as number | undefined;
  if (cs) run.stats.creditedSec = cs * k;
  return { ok: true };
}

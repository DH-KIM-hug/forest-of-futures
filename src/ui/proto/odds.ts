// 나무의 수수료 노드가 실제로 무엇을 바꾸는가(U-42 ④, 회차 5): 오픈 기념이 끝난 뒤의 「이자 한 번 걸기」 한 판을 기준 삼아
// "이 나무로는 익절 대 손절이 몇 대 몇인가 · 한 판에 평균 얼마를 잃는가"를 지금 레벨과 다음 레벨로 셈한다.
// 순수 함수다. 시세는 건드리지 않는다 — 어떤 노드도 이길 확률을 바꾸지 않는다. 바뀌는 것은 수수료뿐이고, 수수료가 익절을 멀게 · 손절을 가깝게 만든 만큼이 돌아올 뿐이다.
// 셈: 익절까지의 폭 a, 손절까지의 폭 b 에서 익절에 먼저 닿을 몫 = b / (a + b)(stops.ts fairOdds). 지난 사흘 반의 실제 1분 봉(다섯 종목)으로 센 값과 1%p 안에서 맞았다:
//   수수료 0.02% → 식 37.1% · 봉 36.8~38.8% / 0.01% → 식 43.5% · 봉 43.4~44.2% / 0% → 식 50% · 봉 49.3~49.9% (FUN_LOG 회차 5 §2)
import { balance, skillById } from '../../engine/data';
import { exitFeeMulLevels, feeRateLevels, openingEvent } from '../../engine/skilltree';
import { acornStops, fairOdds, orderCtx } from './stops';

/** 기준 판: 증거금 5만 · 200배 · 익절 = 손절 = 이자 한 번 치(첫 대출 뒤의 청구액 15,500). 회차 4 · 5 의 봉 셈과 같은 판이다 */
export const REF_BET = { margin: 50_000, lev: 200, claim: 15_500 } as const;
/** 오픈 기념이 끝난 뒤의 기본 수수료율(이벤트가 없는 판은 기본 수수료율) */
export const listFeeRate = (): number => openingEvent()?.afterFeeRate ?? (balance.trading.feeRate as number);

export interface BetOdds { /** 익절에 먼저 닿을 몫(0~1). 손절을 걸 수 없으면 null */ p: number | null; /** 한 판의 평균 손익(도토리, 음수) */ ev: number | null; /** 들어갈 때 수수료율(%) */ ratePct: number; /** 들어갈 때 + 나올 때(익절) 수수료 */ fees: number }
/** 이 노드 레벨들로 기준 판을 걸면 */
export function betOdds(levels: Record<string, number>, base = listFeeRate()): BetOdds {
  const rate = feeRateLevels(levels, base, REF_BET.lev);
  const c = orderCtx({ margin: REF_BET.margin, lev: REF_BET.lev, feeRate: rate, maint: balance.trading.maintenanceRate as number, exitMul: exitFeeMulLevels(levels), exitMulSl: exitFeeMulLevels(levels, 'sl') });
  const st = acornStops(c, REF_BET.claim, REF_BET.claim);
  const p = fairOdds(st);
  return { p, ev: p === null ? null : Math.round(p * REF_BET.claim - (1 - p) * REF_BET.claim), ratePct: rate * 100, fees: c.feesIn + c.feeOut };
}

export interface NodeOdds { now: BetOdds; next: BetOdds; /** 한 줄: "…익절 37.1% → 38.1% · 판당 −4,000 → −3,700" */ text: string }
const pc = (p: number | null) => (p === null ? '–' : `${(p * 100).toFixed(1)}%`);
const ev = (x: number | null) => (x === null ? '–' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toLocaleString('ko-KR')}`);
/** 노드 id 를 한 레벨 올리면 기준 판이 어떻게 달라지는가. 그 판을 바꾸지 않는 노드(도구 · 10배 이하 할인 등)는 null.
 *  active = 다음 생에 켜질 레벨(짝 노드는 고른 쪽만). 짝의 안 고른 쪽을 보면 그쪽을 켠 것으로 셈한다. */
export function nodeOdds(active: Record<string, number>, id: string, ownLevel: number): NodeOdds | null {
  const def = skillById[id];
  if (!def) return null;
  const cur = { ...active };
  const up = { ...active, [id]: ownLevel + 1 };
  if (def.pair) { delete up[def.pair]; }
  const now = betOdds(cur), next = betOdds(up);
  if (now.p === null || next.p === null || (Math.abs(now.p - next.p) < 0.0005 && now.ev === next.ev)) return null;
  return { now, next, text: `수수료가 돌아온 뒤 「이자 한 번 걸기」(5만 · 200배): 익절 ${pc(now.p)} → ${pc(next.p)} · 판당 ${ev(now.ev)} → ${ev(next.ev)}` };
}
/** 나무 머리의 한 줄: 지금 나무로 기준 판을 걸면 */
export function treeOddsLine(active: Record<string, number>): string {
  const o = betOdds(active), bare = betOdds({});
  const w = o.p === null ? null : Math.round(o.p * 100);
  return `오픈 기념이 끝나면 수수료 ${o.ratePct.toFixed(o.ratePct < 0.01 ? 4 : 3).replace(/0+$/, '').replace(/\.$/, '')}% · 「이자 한 번 걸기」(5만 · 200배)는 익절 ${w ?? '–'} : 손절 ${w === null ? '–' : 100 - w}${bare.p !== null && o.p !== null && o.p - bare.p >= 0.005 ? ` (나무 없이는 ${Math.round(bare.p * 100)} : ${100 - Math.round(bare.p * 100)})` : ''}`;
}

// 포지션을 들고 있는 동안의 긴장(U-39 ①). 순수 함수다(엔진·저장소를 부르지 않는다). 시세·청산 공식은 건드리지 않고, 이미 있는 숫자를 "지금 흔들리는 폭"에 견줘 읽어 줄 뿐이다.
//   - 청산까지의 거리 = 지난 1분에 움직인 폭의 몇 배인가(멀다 · 보인다 · 한 번 출렁이면 닿는다 · 흔들리는 폭 안)
//   - 들어가기 전: 이 판으로 이자 한 번 치를 벌려면 시세가 얼마나 가야 하는가, 청산은 얼마나 먼가
//   - 들고 있는 동안: 주인공의 몸(폰만 본다 · 서성인다 · 들썩인다 · 굳는다)과 속마음 한 줄(포지션마다 한 번씩)
const n = (x: number) => Math.round(Math.abs(x)).toLocaleString('ko-KR');

/** 창(초) 동안의 시세 폭(최고 − 최저)을 지금 값에 견준 %. 기록이 짧으면 null. */
export function recentRange(hist: number[], win = 60): number | null {
  const h = hist.slice(-win);
  if (h.length < 10) return null;
  const last = h[h.length - 1];
  if (!(last > 0)) return null;
  return ((Math.max(...h) - Math.min(...h)) / last) * 100;
}
/** 폭이 0에 가까울 때 배수가 터지지 않게 두는 바닥(%) */
export const RANGE_FLOOR = 0.005;
/** 거리(%)가 지난 1분 폭의 몇 배인가 */
export const stepsOf = (distPct: number, rangePct: number | null): number | null => (rangePct === null ? null : Math.abs(distPct) / Math.max(RANGE_FLOOR, rangePct));

export type Reach = 'far' | 'seen' | 'tight' | 'edge';
/** 배수 → 네 단계. edge = 지금 흔들리는 폭 안(1배 미만), tight = 한두 번 출렁이면(3배 미만), seen = 보이는 거리(8배 미만), far = 한참 멀다 */
export function reachOf(steps: number | null): Reach {
  if (steps === null) return 'far';
  return steps < 1 ? 'edge' : steps < 3 ? 'tight' : steps < 8 ? 'seen' : 'far';
}
export const REACH_TEXT: Record<Reach, string> = { far: '한참 멀다', seen: '보이는 거리', tight: '한 번 출렁이면 닿는다', edge: '지금 흔들리는 폭 안이다' };
const times = (k: number) => (k >= 100 ? '100배 넘게' : k >= 10 ? `${Math.round(k)}배` : `${k.toFixed(1)}배`);

export interface Tension { rangePct: number | null; steps: number | null; reach: Reach; /** 점 다섯 개 가운데 찬 수(가까울수록 많다) */ dots: number; /** 한 줄: "지난 1분 폭 0.11%의 3.8배 · 보이는 거리" */ text: string }
/** 열린 포지션의 청산까지 거리를 지난 1분 폭에 견준다. */
export function tensionOf(liqDistPct: number, hist: number[]): Tension {
  const rangePct = recentRange(hist);
  const steps = stepsOf(liqDistPct, rangePct);
  const reach = reachOf(steps);
  const dots = steps === null ? 0 : steps < 1 ? 5 : steps < 2 ? 4 : steps < 3 ? 3 : steps < 8 ? 2 : steps < 20 ? 1 : 0;
  const text = steps === null ? '시세를 모으는 중' : `1분 폭(${rangePct!.toFixed(2)}%)의 ${times(steps)} · ${REACH_TEXT[reach]}`;
  return { rangePct, steps, reach, dots, text };
}

export interface Odds {
  /** 이자 한 번 치(수수료까지)를 벌려면 시세가 가야 하는 폭 % */ needPct: number;
  /** 청산까지 % */ liqPct: number;
  /** 그 폭이 지난 1분 폭의 몇 배인가 */ needSteps: number | null; liqSteps: number | null;
  /** 이자보다 청산이 가깝다 */ liqFirst: boolean;
  text: string;
}
/** 들어가기 전의 셈: 이 증거금 · 이 배율이면 이자 한 번 치까지 시세가 얼마나 가야 하는가. 거짓 약속이 아니라 나눗셈이다. */
export function orderOdds(o: { margin: number; lev: number; claim: number; feeRate: number; maintenanceRate: number; hist: number[] }): Odds | null {
  const notional = o.margin * o.lev;
  if (!(notional > 0) || !(o.claim > 0)) return null;
  const needPct = (o.claim / notional) * 100 + o.feeRate * 2 * 100; // 들어갈 때·나올 때 수수료만큼 더 가야 한다
  const liqPct = (1 / o.lev - o.maintenanceRate) * 100;
  const r = recentRange(o.hist);
  const needSteps = stepsOf(needPct, r), liqSteps = stepsOf(liqPct, r);
  const liqFirst = needPct >= liqPct;
  const pc = (x: number) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2));
  const text = liqFirst
    ? `이 판으로는 이자 ${n(o.claim)}을 못 번다 (시세 ${pc(needPct)}% 필요 · 청산은 ${pc(liqPct)}%)`
    : `이자 ${n(o.claim)}까지 시세 ${pc(needPct)}%${needSteps !== null ? ` (1분 폭의 ${times(needSteps)})` : ''} · 청산까지 ${pc(liqPct)}%`;
  return { needPct, liqPct, needSteps, liqSteps, liqFirst, text };
}

/** 지금 손익이 이자 한 번 치의 몇 %인가(포지션 카드의 한 줄). 너무 작으면 null */
export function claimShare(pnl: number, claim: number): string | null {
  if (!(claim > 0)) return null;
  const k = (pnl / claim) * 100;
  if (Math.abs(k) < 3) return null;
  return `이자의 ${k >= 0 ? '+' : '−'}${Math.round(Math.abs(k))}%`;
}

// ── 주인공의 몸 ──────────────────────────────────────────────────────────
/** idle = 포지션 없음, phone = 폰만 본다, pace = 쳇바퀴 옆을 서성인다(잃는 중), hop = 들썩인다(따는 중), frozen = 굳었다(청산이 흔들리는 폭 안) */
export type HeroMood = 'idle' | 'phone' | 'pace' | 'hop' | 'frozen';
export function heroMood(o: { hasPos: boolean; roe: number; pnl: number; claim: number; reach: Reach; nearLiq: boolean }): HeroMood {
  if (!o.hasPos) return 'idle';
  if (o.nearLiq || o.reach === 'edge') return 'frozen';
  const big = Math.abs(o.roe) >= 25 || Math.abs(o.pnl) >= Math.max(1, o.claim) * 0.3;
  if (big && o.pnl < 0) return 'pace';
  if (big && o.pnl > 0) return 'hop';
  return o.reach === 'tight' ? 'pace' : 'phone';
}

// ── 들고 있는 동안의 속마음(포지션마다 한 번씩) ──────────────────────────
export interface HoldSnap {
  /** 지금 정리하면 넣은 돈에 더해지거나 빠지는 돈 */ pnl: number;
  roe: number; heldSec: number; claim: number; reach: Reach;
  /** 이 포지션에서 본 가장 큰 이익 · 가장 깊은 손실(ROE %) */ peakPnl: number; lowRoe: number;
  /** 들고 있는 사이 지나간 정산 수 */ settles: number;
  /** 다음 정산에 낼 돈이 포지션에 묶여 있다(그리고 정산이 1분 안이다) */ squeezed?: boolean;
}
export interface HoldBeat { key: string; text: string }
/** 포지션 하나를 들고 있는 동안 주인공이 속으로 하는 말. 위에서부터 처음 맞는 것 하나, 포지션마다 열쇠당 한 번. 전부 실제 숫자에서 나온다. */
export function holdBeat(s: HoldSnap, seen: Record<string, boolean>): HoldBeat | null {
  const claim = Math.max(1, s.claim);
  const B = (key: string, text: string): HoldBeat | null => (seen[key] ? null : { key, text });
  return (s.reach === 'edge' ? B('edge', '…지금 흔들리는 만큼만 더 가면 끝이다.') : null)
    ?? (s.reach === 'tight' && s.pnl < 0 ? B('tight', '…한 번만 더 출렁이면 닿는다.') : null)
    ?? (s.squeezed ? B('squeeze', '…정산이 온다. 낼 돈이 전부 여기 묶여 있다.') : null)
    ?? (s.roe >= 100 ? B('double', '…두 배다. 두 배면… 조금만 더.') : null)
    ?? (s.pnl >= claim ? B('claim', `…이자 한 번 치다. 지금 닫으면 ${n(s.pnl)}.`) : null)
    ?? (s.peakPnl >= claim * 0.5 && s.pnl <= s.peakPnl * 0.3 ? B('gaveBack', `…아까는 +${n(s.peakPnl)}이었다. 아까 닫을 걸.`) : null)
    ?? (s.roe <= -50 ? B('half', '…넣은 돈의 절반이 녹았다.') : null)
    ?? (s.lowRoe <= -25 && s.pnl >= 0 ? B('even', '…본전이다. 본전이면 나가야 하는데.') : null)
    ?? (s.settles >= 1 ? B('settled', '…정산이 한 번 지나갔다. 아직 들고 있다.') : null)
    ?? (s.heldSec >= 75 && Math.abs(s.roe) < 4 && s.lowRoe > -8 && s.peakPnl < claim * 0.1 ? B('flat', '…안 움직인다. 수수료만 냈다.') : null);
}

// ── 정산 때 낼 돈이 포지션에 묶여 있는가 ───────────────────────────────
// 회차 2 에서 실제로 겪은 일: 가진 돈을 전부 걸고 3분을 들고 있었더니 정산 때 이자를 낼 돈이 없어 연체가 됐다(돈은 포지션 안에 있었다).
// 규칙은 그대로 두고(추심원은 거래소 안의 돈을 못 걷는다), 들어가기 전과 들고 있는 동안에 그 사실을 숫자로 말해 준다.
export interface Squeeze { /** 정산 때 낼 돈(이자 + 생활비 + 일당) */ due: number; /** 그때 손에 있을 돈(지금 가진 돈 + 알바가 캐서 판 값) */ have: number; short: number; text: string }
/** cash = 주문을 넣고 난 뒤(또는 지금) 손에 남는 돈, income = 정산 때 알바가 캐서 팔리는 값, due = 이자 + 생활비 + 일당. 모자라지 않으면 null */
export function squeezeOf(o: { cash: number; income: number; due: number; settleIn: number; holding: boolean }): Squeeze | null {
  const have = Math.floor(o.cash + o.income);
  if (!(o.due > 0) || have >= o.due) return null;
  const mm = `${Math.floor(Math.max(0, o.settleIn) / 60)}:${String(Math.max(0, o.settleIn) % 60).padStart(2, '0')}`;
  const text = o.holding
    ? `정산 ${mm} 뒤 낼 돈 ${n(o.due)} · 손에 ${n(have)} — 닫아야 낸다`
    : `넣고 나면 손에 ${n(have)} · 정산(${mm} 뒤) 낼 돈 ${n(o.due)} — 못 닫으면 연체`;
  return { due: Math.round(o.due), have, short: Math.round(o.due - have), text };
}

// 출구를 도토리로 건다(U-41, 회차 4). 순수 함수다 — 엔진의 손절·익절(진입가 × (1 ± ROE/배율), futures.ts stopPrice)은 그대로 두고,
// "이 거래로 +15,500(수수료까지)"이 되는 ROE 가 몇 %인지 셈해서 그 값을 건다. 시세 · 청산 공식은 건드리지 않는다.
//   - 익절 = 이자 한 번 치 / 손절 = 이자 한 번 치를 한 번 눌러 건다(이자 = 다음 정산에 걷어 갈 돈: 이자 + 생활비)
//   - 손절이 청산보다 멀면(증거금이 이자보다 작다) 걸지 않고 그렇다고 말한다
//   - 그 폭이 지난 몇 분 동안 실제로 몇 번 나왔는가(약속이 아니라 센 것)
//   - 정산을 넘겨 들고 있으면 무슨 일이 생기는가(손에서 나가는 돈 · 포지션은 그대로 · 펀딩비)
const n = (x: number) => Math.round(Math.abs(x)).toLocaleString('ko-KR');

/** 출구 셈에 드는 숫자. 포지션이면 포지션 값, 주문 전이면 넣을 증거금 · 배율로 만든 값 */
export interface StopCtx {
  /** 명목(증거금 × 배율) */ notional: number;
  lev: number;
  /** 지금 증거금(펀딩비를 뺀 값. 청산가를 정한다) */ margin: number;
  /** 들어갈 때 낸(낼) 수수료 */ feesIn: number;
  /** 나올 때 낼 수수료: 익절 · 그냥 정리 */ feeOut: number;
  /** 나올 때 낼 수수료: 손절(나무 C1 의 할인이 든 값) */ feeOutSl: number;
  /** 유지 증거금율 */ maint: number;
}
/** 주문 전의 셈: 증거금 · 배율 · 수수료율(들어갈 때) · 나올 때 곱(나무) */
export function orderCtx(o: { margin: number; lev: number; feeRate: number; maint: number; exitMul?: number; exitMulSl?: number }): StopCtx {
  const notional = o.margin * o.lev;
  const fee = (r: number) => Math.ceil(notional * r - 1e-9) + 0;
  return { notional, lev: o.lev, margin: o.margin, feesIn: fee(o.feeRate), feeOut: fee(o.feeRate * (o.exitMul ?? 1)), feeOutSl: fee(o.feeRate * (o.exitMulSl ?? o.exitMul ?? 1)), maint: o.maint };
}

/** 시세 ROE(%) → 그 값에 닿아 닫히면 이 거래로 늘거나 주는 돈(수수료 포함). 엔진의 stopPrice 와 같은 뜻의 ROE 다(시세 폭 × 배율) */
export const netForRoe = (roe: number, c: StopCtx, kind: 'tp' | 'sl'): number => ((roe / 100) * c.notional) / c.lev - c.feesIn - (kind === 'sl' ? c.feeOutSl : c.feeOut);
/** 이 거래로 net 만큼 늘거나 주는(음수) 때의 시세 ROE(%) */
export const roeForNet = (net: number, c: StopCtx, kind: 'tp' | 'sl'): number => ((net + c.feesIn + (kind === 'sl' ? c.feeOutSl : c.feeOut)) * c.lev * 100) / c.notional;
/** 청산가의 ROE(%): −(증거금/명목 − 유지율) × 배율 */
export const liqRoe = (c: StopCtx): number => -(c.margin / c.notional - c.maint) * c.lev * 100;
/** ROE(%) → 진입가에서의 시세 폭(%) */
export const movePct = (roe: number, lev: number): number => roe / lev;

export interface AcornStops {
  /** 걸 ROE(%). 걸 수 없으면 null */ tp: number | null; sl: number | null;
  /** 손절을 못 거는 까닭: liq = 청산이 그 손실보다 먼저 온다 · fee = 수수료만으로 이미 그만큼 잃는다 */ slWhy: 'liq' | 'fee' | null;
  /** 익절까지 · 손절까지의 시세 폭(%) */ tpMove: number | null; slMove: number | null;
}
/** 손절이 청산에 이만큼(비율) 가까우면 청산이 먼저라고 본다 */
export const SL_LIQ_GAP = 0.97;
/** 도토리로 정한 출구(tpNet: 이만큼 따면, slNet: 이만큼 잃으면 — 둘 다 양수, 없으면 null)를 엔진이 받는 ROE 로 바꾼다. */
export function acornStops(c: StopCtx, tpNet: number | null, slNet: number | null): AcornStops {
  const out: AcornStops = { tp: null, sl: null, slWhy: null, tpMove: null, slMove: null };
  if (!(c.notional > 0)) return out;
  if (tpNet !== null && tpNet > 0) {
    // 닿았을 때 적어도 tpNet 이 남게 아주 조금 올려 건다(반올림으로 1 도토리가 모자라지 않게)
    out.tp = roeForNet(tpNet + 1, c, 'tp');
    out.tpMove = movePct(out.tp, c.lev);
  }
  if (slNet !== null && slNet > 0) {
    const roe = roeForNet(-slNet, c, 'sl');
    if (roe >= 0) out.slWhy = 'fee';
    else if (roe <= liqRoe(c) * SL_LIQ_GAP) out.slWhy = 'liq';
    else { out.sl = roe; out.slMove = movePct(roe, c.lev); }
  }
  return out;
}

/** 지난 기록(초 단위 값)에서 시세가 pct% 만큼 한쪽으로 간 횟수(오르든 내리든). 지난번에 센 뒤의 가장 낮은 값에서 그만큼 올랐거나, 가장 높은 값에서 그만큼 내렸으면 한 번.
 *  한 번 세면 그 자리에서 다시 잰다(겹쳐 세지 않는다). */
export function swingCount(hist: number[], pct: number): number {
  if (!(pct > 0) || hist.length < 2) return 0;
  let lo = hist[0], hi = hist[0], k = 0;
  for (let i = 1; i < hist.length; i++) {
    const v = hist[i];
    if (!(v > 0)) continue;
    if (!(lo > 0)) { lo = hi = v; continue; }
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    if (((v - lo) / lo) * 100 >= pct || ((hi - v) / hi) * 100 >= pct) { k++; lo = hi = v; }
  }
  return k;
}
/** "지난 10분에 4번" — 기록이 1분도 안 되면 null(아직 셀 것이 없다) */
export function swingText(hist: number[], pct: number): string | null {
  if (hist.length < 60) return null;
  const mins = Math.max(1, Math.round(hist.length / 60));
  const k = swingCount(hist, pct);
  return k > 0 ? `지난 ${mins}분에 ${k}번` : `지난 ${mins}분엔 없었다`;
}

/** 주문 판의 한 줄(출구를 도토리로 걸었을 때): "익절 +15,500 = 시세 0.16% · 지난 10분에 4번 · 손절 −15,500 = 0.16%" */
export function planLine(o: { tpNet: number | null; slNet: number | null; st: AcornStops; hist: number[]; /** 익절 폭이 한 번도 안 나온 조용한 장: 더 작은 출구(이자 반 번 치)의 폭은 몇 번 나왔는지 덧붙인다 */ hint?: string | null }): string | null {
  const parts: string[] = [];
  const pc = (x: number) => (Math.abs(x) >= 1 ? Math.abs(x).toFixed(1) : Math.abs(x).toFixed(2));
  if (o.tpNet !== null && o.st.tpMove !== null) { const s = swingText(o.hist, o.st.tpMove); parts.push(`익절 +${n(o.tpNet)} (유리한 쪽 ${pc(o.st.tpMove)}%${s ? `, ${s}` : ''})`); }
  if (o.slNet !== null) parts.push(o.st.slMove !== null ? `손절 −${n(o.slNet)} (반대쪽 ${pc(o.st.slMove)}%)` : o.st.slWhy === 'liq' ? `손절 −${n(o.slNet)}보다 청산이 먼저다` : `수수료만으로 −${n(o.slNet)}를 넘는다`);
  // 수수료가 승률을 기울였으면 그 기울기를 적는다(U-42 ④): 익절은 멀고 손절은 가깝다
  const od = o.tpNet !== null && o.slNet !== null ? oddsText(fairOdds(o.st)) : null;
  if (od) parts.push(`수수료 반영 후 ${od}`);
  return parts.length ? parts.join(', ') : null;
}

/** 조용한 장에서 고를 거리(회차 4 의 실시간 판에서 본 것: 새벽의 조용한 장에서는 200배 · 이자 한 번 치의 폭 0.17% 가 9분 동안 한 번도 안 나왔다).
 *  익절 폭이 지난 기록에 한 번도 없으면, 절반 폭은 몇 번 나왔는지 센다. 있으면 "반 번 폭은 3번", 그것도 없으면 null */
export function halfHint(hist: number[], tpMove: number | null): string | null {
  if (tpMove === null || hist.length < 60 || swingCount(hist, tpMove) > 0) return null;
  const k = swingCount(hist, tpMove / 2);
  return k > 0 ? `반 번 폭은 ${k}번` : null;
}
/** 시트의 칩 아래에 적는 횟수: "3번"(그 폭이 지난 기록에 나온 횟수). 기록이 1분이 안 되면 null */
export const chipCount = (hist: number[], move: number | null): string | null => (move === null || hist.length < 60 ? null : `${swingCount(hist, Math.abs(move))}번`);

/** 출구 단추에 적는 글: 건 값(ROE %)을 도토리로 읽어 준다 */
export function stopLabel(roe: number | null, c: StopCtx | null, kind: 'tp' | 'sl'): string {
  if (roe === null) return '없음';
  if (!c) return kind === 'sl' ? `−${Math.abs(roe).toFixed(Math.abs(roe) % 1 ? 1 : 0)}%` : `+${roe.toFixed(roe % 1 ? 1 : 0)}%`;
  const v = netForRoe(roe, c, kind);
  return `${v >= 0 ? '+' : '−'}${n(v)}`;
}

/** 정산을 넘겨 들고 있으면(포지션 카드의 한 줄): 추심원은 손에 든 돈에서만 걷는다. 포지션은 그대로 간다. 펀딩비만 증거금에서 빠진다. */
export interface CarryInfo { /** 정산 때 손에서 나가는 돈 */ due: number; /** 그 뒤 손에 남는 돈(알바 수입 포함) */ left: number; /** 증거금에서 빠지는 펀딩비 */ funding: number; text: string }
export function carryOf(o: { cash: number; income: number; due: number; settleIn: number; notional: number; fundingRate: number }): CarryInfo | null {
  if (!(o.due > 0)) return null;
  const left = Math.floor(o.cash + o.income - o.due);
  if (left < 0) return null; // 모자라면 "닫아야 낸다"는 붉은 줄(tension.ts squeezeOf)이 대신 말한다
  const funding = Math.ceil(o.notional * o.fundingRate - 1e-9);
  const mm = `${Math.floor(Math.max(0, o.settleIn) / 60)}:${String(Math.max(0, o.settleIn) % 60).padStart(2, '0')}`;
  return { due: Math.round(o.due), left, funding, text: `${mm} 뒤 정산 −${n(o.due)}, 포지션은 그대로, ${n(left)} 남음` };
}

/** 출구 칩(U-67, 사용자: "이자 한 번 치는 빼 걍"): 넣은 돈의 몇 배를 벌면 익절, 잃으면 손절. 0.5 = +50%. 1~200배 어디서나 같은 뜻이다 */
export const EXIT_PRESETS: Record<'tp' | 'sl', number[]> = { tp: [0.2, 0.5, 1, 2], sl: [0.1, 0.25, 0.5] };

/** 이번 생에 거래가 벌어 온 돈(집 판 · 장부의 한 줄)(집 판 · 장부의 한 줄). claim = 지금 정산 한 번에 걷어 가는 돈 */
export function journeyOf(o: { tradeNet: number; claim: number; settles: number; paid: number; claimWins: number }): { share: number; text: string; short: string } {
  const share = o.claim > 0 ? o.tradeNet / o.claim : 0;
  const sign = o.tradeNet >= 0 ? '+' : '−';
  return {
    share,
    // U-67(사용자: "이자 한 번 버는 거 의미 없어"): 「이자 n번 치」로 읽어 주던 꼬리를 뺐다. 돈만 적는다
    short: `거래 ${sign}${n(o.tradeNet)}`,
    text: `이번 생 낸 돈 ${n(o.paid)}, 거래로 ${sign}${n(o.tradeNet)}`,
  };
}

// ── U-42(회차 5): 장에 맞춘 출구 · 수수료가 기울인 승률 · 정산 빼고 전부 ─────────────────────────────
// 「이자 한 번 걸기」의 장에 맞춘 크기(maxSwing · autoExit, U-42 ①)는 뺐다(U-46 사용자: "이자 한 번 걸기는 제외").

/** 수수료가 기울인 승률(U-42 ④): 익절까지의 폭 a, 손절까지의 폭 b 일 때, 오르내림이 반반인 시세가 익절에 먼저 닿을 몫 = b / (a + b).
 *  수수료가 0 이면 반반이고, 수수료가 붙으면 익절은 멀고 손절은 가깝다. 지난 사흘 반의 1분 봉으로 센 값과 1%p 안에서 맞는다(FUN_LOG 회차 5). 예측이 아니라 나눗셈이다. */
export function fairOdds(st: { tpMove: number | null; slMove: number | null }): number | null {
  if (st.tpMove === null || st.slMove === null) return null;
  const a = Math.abs(st.tpMove), b = Math.abs(st.slMove);
  return a + b > 0 ? b / (a + b) : null;
}
/** 주문 줄의 덧말: 반반에서 2%p 넘게 기울었을 때만 "익절 37 : 손절 63" */
export function oddsText(p: number | null): string | null {
  if (p === null || Math.abs(p - 0.5) < 0.02) return null;
  const w = Math.round(p * 100);
  return `익절 ${w} : 손절 ${100 - w}`;
}

/** 정산 빼고 전부(U-42 ③): 다음 정산에 낼 돈(이자 + 생활비 + 일당)을 손에 남기고 나머지를 전부 건다. 들어갈 때 수수료도 남긴다. 걸 돈이 없으면 0 */
export function keepDueMargin(o: { cash: number; due: number; lev: number; feeRate: number }): number {
  const free = o.cash - Math.max(0, o.due);
  return free > 0 ? Math.max(0, Math.floor(free / (1 + o.lev * o.feeRate))) : 0;
}

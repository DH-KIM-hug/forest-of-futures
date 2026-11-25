import { marketDefs, marketById, marketModel, T } from './data';
import { gauss, nextRandom } from './rng';
import type { MarketState, RunState } from './types';

const HIST_MAX = T.chartWindowTicks + 10;

function pickRegime(h: { rng: number }): -1 | 0 | 1 {
  const w = marketModel.regimeWeights;
  const r = nextRandom(h);
  return r < w.up ? 1 : r < w.up + w.down ? -1 : 0;
}

export function createMarkets(h: { rng: number }): Record<string, MarketState> {
  const out: Record<string, MarketState> = {};
  for (const m of marketDefs) {
    out[m.id] = {
      id: m.id,
      price: m.startPrice,
      prev: m.startPrice,
      regime: pickRegime(h),
      jumped: false,
      hist: [m.startPrice],
      volMult: 1,
      volUntil: 0,
    };
  }
  return out;
}

/** 시세 한 틱. logP' = logP + 추세 + σN(0,1) + 급등락 - k(logP - log시작가) */
export function stepMarket(run: RunState, st: MarketState): void {
  const m = marketById[st.id];
  if (run.tick >= st.volUntil) st.volMult = 1;
  const sigma = m.sigmaPerTick * st.volMult;
  if (nextRandom(run) < m.switchProbPerTick) st.regime = pickRegime(run);
  let d = st.regime * m.driftSigmaRatio * sigma + sigma * gauss(run);
  st.jumped = false;
  if (nextRandom(run) < m.jump.probPerTick) {
    const size = (m.jump.minSigma + nextRandom(run) * (m.jump.maxSigma - m.jump.minSigma)) * sigma;
    d += (nextRandom(run) < 0.5 ? -1 : 1) * size;
    st.jumped = true;
  }
  const lp = Math.log(st.price);
  st.prev = st.price;
  st.price = Math.exp(lp + d - m.meanReversionK * (lp - Math.log(m.startPrice)));
  pushHist(st);
}

export function pushHist(st: MarketState): void {
  st.hist.push(st.price);
  if (st.hist.length > HIST_MAX) st.hist.shift();
}

/** 이벤트로 가격을 한 번에 움직인다(속보). */
export function applyNewsJump(st: MarketState, dir: number, size: number): void {
  st.price = st.price * Math.exp(dir * size);
  st.jumped = true;
  // 같은 틱의 히스토리 끝 값을 갱신
  st.hist[st.hist.length - 1] = st.price;
}

export function changePct(st: MarketState, ticks: number): number {
  const h = st.hist;
  const base = h[Math.max(0, h.length - 1 - ticks)];
  return (st.price / base - 1) * 100;
}

export function formatPrice(id: string, price: number): string {
  const d = marketById[id].decimals;
  return price.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// 날다람쥐코인(FLY) 시세 함수 1판(U-47~U-56). 이제 게임은 쓰지 않는다: 바꾼 시각(FLY_V2_FROM, fly.ts) 앞에 연 거래를 전광판이 다시 셀 때만 쓴다.
// 고치지 않는다(지난 기록이 이 값으로 셈해졌다).
// 실제 시장이 없다: 값은 시각(유닉스 초)만의 순수 함수다. 누구의 폰에서든 같은 때 같은 값이고, 랭킹 서버도 같은 함수로 다시 셈한다.
// 이 파일은 아무것도 가져오지 않는다(브라우저 · 게임 서버 · 랭킹 Worker 가 그대로 같이 쓴다).
//
// 값 = 기준가 × exp(느린 물결(t) + 그 시간의 흔들림(t) + 그 시간의 급등락(t))
//   - 느린 물결: 하루 · 4시간 · 20분 마디마다 씨앗으로 정한 높이를 부드럽게 잇는다(닫힌 식, 어느 시각이든 바로 나온다).
//   - 흔들림: 1초 로그 수익률(분마다 씨앗, 10분 마디마다 변동성 배수)을 쌓은 길에서, 그 시간의 끝이 0 이 되게 당긴 다리(Brownian bridge).
//     시간마다 처음과 끝이 느린 물결에 닿으므로 시간끼리 이어지고, 0 이나 무한대로 흘러가지 않는다(약한 평균 회귀).
//   - 급등락: 시간마다 씨앗으로 0~2번. 10~60초에 걸쳐 크게 오르거나 내리고, 몇 분에 걸쳐 되돌아오며, 그 시간이 끝나기 전에 0 이 된다.
// 그래서 어느 시간이든 그 시간의 씨앗만으로 셈한다(처음부터 다시 돌리지 않는다). 1분 봉도 어느 구간이든 바로 나온다.

/** 기준가(도토리) */
const FLY_BASE = 100;
/** 1초 로그 수익률의 기본 표준편차: 1분 약 0.55%(도토코인이 따라가는 시세의 평소 1분 폭의 대여섯 배) */
const FLY_SIGMA = 0.0055 / Math.sqrt(60);

const HOUR = 3600;
const U32 = 4294967296;

/** 정수 몇 개 → 32비트 해시(엔진마다 같은 값: 정수 곱셈만 쓴다) */
function hash(a: number, b: number, c: number): number {
  let x = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d) ^ 0x27d4eb2f) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
/** (0, 1) 균등 */
const uni = (a: number, b: number, c: number): number => (hash(a, b, c) + 0.5) / U32;
/** 표준 정규(박스-뮬러) */
const gauss = (a: number, b: number, c: number): number => Math.sqrt(-2 * Math.log(uni(a, b, c * 2))) * Math.cos(2 * Math.PI * uni(a, b, c * 2 + 1));

// 씨앗 갈래(섞이지 않게)
const K_DAY = 11, K_H4 = 12, K_M20 = 13, K_STEP = 21, K_VOL = 22, K_JUMP = 31;

/** 마디 knot 의 높이(−1~1) */
const knot = (kind: number, i: number): number => uni(kind, i, 0) * 2 - 1;
/** 마디 길이 len 의 값 잇기(부드러운 계단) */
function wave(kind: number, len: number, t: number): number {
  const i = Math.floor(t / len);
  const f = t / len - i;
  const s = f * f * (3 - 2 * f);
  return knot(kind, i) * (1 - s) + knot(kind, i + 1) * s;
}
/** 느린 물결(로그): 하루 ±0.45, 4시간 ±0.16, 20분 ±0.05 */
function flySlow(t: number): number {
  return 0.45 * wave(K_DAY, 86400, t) + 0.16 * wave(K_H4, 4 * HOUR, t) + 0.05 * wave(K_M20, 1200, t);
}

interface Jump { s0: number; ramp: number; amp: number; tau: number }
/** 그 시간의 급등락(0~2번) */
function jumpsOf(h: number): Jump[] {
  const out: Jump[] = [];
  const n = uni(K_JUMP, h, 0) < 0.55 ? (uni(K_JUMP, h, 1) < 0.3 ? 2 : 1) : 0;
  for (let k = 0; k < n; k++) {
    const s0 = Math.floor(60 + uni(K_JUMP, h, 10 + k) * (HOUR - 1200));
    const ramp = 10 + Math.floor(uni(K_JUMP, h, 20 + k) * 51); // 10~60초
    const size = 0.05 + 0.2 * Math.pow(uni(K_JUMP, h, 30 + k), 1.6); // 로그 5%~25%
    const amp = (uni(K_JUMP, h, 40 + k) < 0.5 ? -1 : 1) * size;
    const tau = 90 + uni(K_JUMP, h, 50 + k) * 510; // 되돌아오는 데 1.5~10분
    out.push({ s0, ramp, amp, tau });
  }
  return out;
}
function jumpAt(js: Jump[], s: number): number {
  let v = 0;
  for (const j of js) {
    if (s <= j.s0) continue;
    const x = s - j.s0;
    const up = x >= j.ramp ? 1 : (() => { const f = x / j.ramp; return f * f * (3 - 2 * f); })();
    const back = x <= j.ramp ? 1 : Math.exp(-(x - j.ramp) / j.tau);
    const end = 1 - Math.pow((s - j.s0) / (HOUR - j.s0), 2); // 그 시간이 끝날 때 0
    v += j.amp * up * back * Math.max(0, end);
  }
  return v;
}

/** 시간 h 의 10분 마디 block 의 변동성 배수(0.45~2.6) */
const volMul = (h: number, block: number): number => Math.min(2.6, Math.max(0.45, Math.exp(0.55 * gauss(K_VOL, h, block))));

/** 시간 h 의 3,601개 로그 값(초 0~3600, 느린 물결 제외). 처음과 끝은 0. */
function hourPath(h: number): Float64Array {
  const w = new Float64Array(HOUR + 1);
  let acc = 0;
  for (let s = 0; s < HOUR; s++) {
    const m = Math.floor(s / 60);
    const block = Math.floor(s / 600);
    const vm = volMul(h, block);
    acc += FLY_SIGMA * vm * gauss(K_STEP, h * 60 + m, s % 60);
    w[s + 1] = acc;
  }
  const end = w[HOUR];
  const js = jumpsOf(h);
  for (let s = 0; s <= HOUR; s++) w[s] = w[s] - (s / HOUR) * end + jumpAt(js, s);
  return w;
}

// 최근 몇 시간의 길만 기억한다(틱마다 다시 셈하지 않게)
const cache = new Map<number, Float64Array>();
function pathOf(h: number): Float64Array {
  let w = cache.get(h);
  if (w) { cache.delete(h); cache.set(h, w); return w; }
  w = hourPath(h);
  cache.set(h, w);
  if (cache.size > 30) cache.delete(cache.keys().next().value as number);
  return w;
}

/** 시각 tSec(유닉스 초, 정수가 아니면 내림)의 값 */
export function flyPriceV1(tSec: number): number {
  const t = Math.floor(tSec);
  const h = Math.floor(t / HOUR);
  const s = t - h * HOUR;
  return FLY_BASE * Math.exp(flySlow(t) + pathOf(h)[s]);
}

interface FlyCandle { t: number; o: number; h: number; l: number; c: number }
/** 1분 봉(t = 그 분이 시작한 때, ms). fromSec 이 든 분부터 toSec 이 든 분까지. 분마다 60개의 1초 값으로 만든다. */
export function flyCandlesV1(fromSec: number, toSec: number): FlyCandle[] {
  const out: FlyCandle[] = [];
  const m0 = Math.floor(fromSec / 60), m1 = Math.floor(toSec / 60);
  for (let m = m0; m <= m1; m++) {
    let o = 0, hi = -Infinity, lo = Infinity, c = 0;
    for (let k = 0; k < 60; k++) {
      const p = flyPriceV1(m * 60 + k);
      if (k === 0) o = p;
      if (p > hi) hi = p;
      if (p < lo) lo = p;
      c = p;
    }
    out.push({ t: m * 60000, o, h: hi, l: lo, c });
  }
  return out;
}

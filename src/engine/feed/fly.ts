// 날다람쥐코인(FLY): 실체 없는 숲 밈코인. 값은 바람(시각)이 정한다. 2판(U-57): 교과서 차트 모양이 실제로 생기고 끝난다.
// 실제 시장이 없다: 값은 시각(유닉스 초)만의 순수 함수다. 누구의 폰에서든 같은 때 같은 값이고, 랭킹 서버도 같은 함수로 다시 셈한다.
// 이 파일은 아무것도 가져오지 않는다(브라우저, 게임 서버, 랭킹 Worker 가 그대로 같이 쓴다).
//
// 값 = 기준가 × exp(시간의 닻(t) + 모양의 뼈대(t) + 잔떨림(t) + 맞춤(t))
//   - 닻: 하루, 4시간 마디마다 씨앗으로 정한 높이(닫힌 식). 4시간 마디마다 처음과 끝이 닻에 닿는다 → 0 이나 무한대로 흘러가지 않는다.
//   - 모양의 뼈대: 4시간 마디마다 씨앗으로 모양 몇 개(3~22분)를 차례로 깐다. 쌍바닥과 쌍봉, 머리어깨와 역머리어깨, 깃발, 페넌트,
//     상승 하락 대칭 삼각형, 상승 하락 쐐기, 추세 채널과 이탈, 박스권(지지 저항)과 돌파, 급등락과 소진.
//     모양마다 꼭짓점(교과서의 자리) 몇 개를 잇는다. 열에 일곱쯤은 교과서대로 끝나고, 열에 셋쯤은 속임수(가짜 돌파, 실패한 모양)다.
//     차트를 읽으면 유리하지만 확실하지는 않다.
//   - 잔떨림: 꼭짓점 사이마다 처음과 끝이 0 인 브라운 다리(1초 흔들림, 10분 마디마다 바람 세기 배수). 꼭짓점에서 이어진다.
//   - 맞춤: 그 마디의 모양들이 닻까지 못 간 나머지를 마디에 고르게 나눈다(보통 아주 작다).
// 그래서 어느 시각이든 그 마디의 씨앗만으로 셈한다(모양 차례는 수십 개, 값은 그 시간만)(처음부터 다시 돌리지 않는다). 1분 봉도 어느 구간이든 바로 나온다.
// 1판(U-47~U-56)은 flyV1.ts 에 그대로 있다: 바꾼 시각(FLY_V2_FROM) 앞의 거래를 전광판이 다시 셀 때만 쓴다.

export const FLY_ID = 'FLY';
/** 기준가(도토리) */
export const FLY_BASE = 100;
/** 1초 로그 수익률의 기본 표준편차(잔떨림). 모양의 뼈대가 더해져 평소 1분 폭은 0.6% 안팎 */
export const FLY_SIGMA = 0.0028 / Math.sqrt(60);
/** 2판으로 바꾼 시각(유닉스 초, 2026-11-28 00:00 UTC). 이 앞에 연 거래는 1판으로 다시 센다(전광판) */
export const FLY_V2_FROM = 1_795_824_000;
/** 모양이 교과서와 반대로 끝나는(속임수) 몫 */
export const FLY_FAKE_RATE = 0.3;

const HOUR = 3600;
/** 모양을 까는 마디(4시간). 마디마다 처음과 끝이 닻에 닿는다 */
const CHUNK = 4 * HOUR;
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

// 씨앗 갈래(섞이지 않게). 1판과 같은 갈래(K_DAY, K_H4, K_VOL)는 같은 닻, 같은 바람
const K_DAY = 11, K_H4 = 12, K_VOL = 22, K_NOISE = 61, K_EP = 71;

const knot = (kind: number, i: number): number => uni(kind, i, 0) * 2 - 1;
function wave(kind: number, len: number, t: number): number {
  const i = Math.floor(t / len);
  const f = t / len - i;
  const s = f * f * (3 - 2 * f);
  return knot(kind, i) * (1 - s) + knot(kind, i + 1) * s;
}
/** 시각 t 의 닻(로그): 하루 ±0.45, 4시간 ±0.16 */
const anchorAt = (t: number): number => {
  return 0.45 * wave(K_DAY, 86400, t) + 0.16 * wave(K_H4, 4 * HOUR, t); };

/** 시간 h 의 10분 마디 block 의 바람 세기(흔들림 배수 0.45~2.6) */
const volMul = (h: number, block: number): number => Math.min(2.6, Math.max(0.45, Math.exp(0.55 * gauss(K_VOL, h, block))));

// ── 모양 ────────────────────────────────────────────────────────────────
export type FlyKind = 'dbl' | 'hs' | 'flag' | 'pennant' | 'tri' | 'sym' | 'wedge' | 'channel' | 'range' | 'burst';
interface KindDef { w: number; len: [number, number]; amp: number; sign: 1 | -1 }
/** 고르는 무게, 길이(초), 크기(10분짜리의 로그 높이), 위로 놓았을 때(o = +1) 교과서가 말하는 쪽 */
const KINDS: Record<FlyKind, KindDef> = {
  dbl: { w: 12, len: [480, 1080], amp: 0.03, sign: 1 },
  hs: { w: 9, len: [720, 1320], amp: 0.034, sign: 1 },
  flag: { w: 11, len: [300, 720], amp: 0.026, sign: 1 },
  pennant: { w: 8, len: [300, 720], amp: 0.026, sign: 1 },
  tri: { w: 10, len: [480, 1080], amp: 0.036, sign: 1 },
  sym: { w: 8, len: [480, 960], amp: 0.036, sign: 1 },
  wedge: { w: 9, len: [480, 960], amp: 0.04, sign: 1 },
  channel: { w: 10, len: [600, 1200], amp: 0.034, sign: -1 },
  range: { w: 12, len: [480, 1080], amp: 0.034, sign: 1 },
  burst: { w: 8, len: [180, 480], amp: 0, sign: -1 },
};
const KIND_LIST = Object.keys(KINDS) as FlyKind[];
const AMP_K = 0.62;
const SHORT: FlyKind[] = ['flag', 'pennant'];

type Pt = [number, number];
/** 위로 놓은(o = +1) 모양의 꼭짓점(시간 몫 0~1, 높이는 a 단위)과 교과서의 갈림 자리(brk, 시간 몫). r(k) = 씨앗 [0,1) */
function shape(kind: FlyKind, ok: boolean, r: (k: number) => number, len: number, ramp: number): { pts: Pt[]; brk: number } {
  const j = (k: number, s: number) => (r(k) * 2 - 1) * s;
  switch (kind) {
    case 'dbl': { // 쌍바닥: 두 바닥이 거의 같은 높이, 그 사이 고점이 목선. 목선을 넘으면 바닥~목선 높이만큼 더 간다
      const n = 0.45 + 0.15 * r(1), e = j(2, 0.04), neck = -1 + n;
      const base: Pt[] = [[0, 0], [0.2 + 0.04 * r(3), -1], [0.42, neck], [0.64, -1 + e], [0.82, neck - 0.04]];
      return { brk: 0.85, pts: ok ? [...base, [0.87, neck + 0.1], [0.92, neck + 0.03], [1, neck + n * (0.9 + 0.4 * r(4))]] : [...base, [0.87, neck + 0.07], [0.91, neck - 0.06], [1, -1.35 - 0.2 * r(4)]] };
    }
    case 'hs': { // 역머리어깨: 왼어깨, 머리(가장 깊다), 오른어깨, 두 어깨 사이 고점을 잇는 목선
      const base: Pt[] = [[0, 0], [0.13, -0.55 + j(1, 0.05)], [0.25, -0.25], [0.43, -1], [0.58, -0.23], [0.72, -0.55 + j(2, 0.05)], [0.84, -0.27]];
      return { brk: 0.86, pts: ok ? [...base, [0.88, -0.12], [0.92, -0.2], [1, -0.24 + 0.75 * (0.8 + 0.4 * r(3))]] : [...base, [0.88, -0.17], [0.92, -0.32], [1, -1.25 - 0.15 * r(3)]] };
    }
    case 'flag': { // 상승 깃발: 빠른 깃대, 살짝 내려가는 좁은 통로, 위로 빠지면 깃대만큼
      const base: Pt[] = [[0, 0], [0.17, 1], [0.27, 0.8], [0.35, 0.92], [0.45, 0.72], [0.54, 0.84], [0.63, 0.65], [0.71, 0.76]];
      return { brk: 0.75, pts: ok ? [...base, [0.77, 0.86], [1, 0.72 + 0.9 + 0.4 * r(1)]] : [...base, [0.77, 0.58], [1, 0.1 - 0.3 * r(1)]] };
    }
    case 'pennant': { // 상승 페넌트: 깃대 뒤 좁아지는 작은 삼각형
      const base: Pt[] = [[0, 0], [0.17, 1], [0.27, 0.74], [0.37, 0.94], [0.47, 0.8], [0.56, 0.91], [0.64, 0.84], [0.71, 0.89]];
      return { brk: 0.74, pts: ok ? [...base, [0.78, 0.98], [1, 0.87 + 0.9 + 0.3 * r(1)]] : [...base, [0.78, 0.74], [1, 0.3 - 0.3 * r(1)]] };
    }
    case 'tri': { // 상승 삼각형: 평평한 저항, 높아지는 저점. 저항을 넘으면 삼각형 높이만큼
      const R = 0.5;
      const base: Pt[] = [[0, 0], [0.1, R], [0.22, -0.5], [0.35, R + j(1, 0.02)], [0.48, -0.15], [0.6, R + j(2, 0.02)], [0.72, 0.17], [0.82, R - 0.02]];
      return { brk: 0.84, pts: ok ? [...base, [0.87, R + 0.13], [0.91, R + 0.04], [1, R + 0.9 + 0.3 * r(3)]] : [...base, [0.86, R + 0.06], [0.9, 0.38], [1, -0.45 - 0.3 * r(3)]] };
    }
    case 'sym': { // 대칭 삼각형: 앞선 움직임 뒤 고점은 낮아지고 저점은 높아진다. 교과서는 앞선 쪽으로 빠진다
      const base: Pt[] = [[0, 0], [0.14, 0.65], [0.26, -0.25], [0.38, 0.45], [0.5, -0.05], [0.61, 0.32], [0.71, 0.07], [0.79, 0.22]];
      return { brk: 0.82, pts: ok ? [...base, [0.86, 0.38], [1, 0.2 + 0.9 + 0.3 * r(1)]] : [...base, [0.86, 0.0], [1, -0.65 - 0.3 * r(1)]] };
    }
    case 'wedge': { // 하락 쐐기: 고점 저점 모두 내려가며 좁아진다(위 선이 더 가파르다). 교과서는 위로, 쐐기가 시작한 자리까지
      const base: Pt[] = [[0, 0], [0.12, -0.62], [0.24, -0.28], [0.37, -0.88], [0.5, -0.58], [0.62, -1.02], [0.72, -0.82], [0.8, -1.08]];
      return { brk: 0.84, pts: ok ? [...base, [0.87, -0.68], [0.91, -0.78], [1, 0.05 + 0.2 * r(1)]] : [...base, [0.87, -1.3], [1, -1.55 - 0.25 * r(1)]] };
    }
    case 'channel': { // 상승 채널: 나란한 두 선 사이를 오르내린다. 교과서는 아래 추세선을 깨면 내려간다(되돌림 시험 뒤)
      const base: Pt[] = [[0, 0], [0.1, 0.42], [0.2, 0.18], [0.32, 0.68], [0.44, 0.44], [0.56, 0.94], [0.68, 0.7], [0.78, 1.18], [0.86, 0.92]];
      return { brk: 0.89, pts: ok ? [...base, [0.91, 0.72], [0.95, 0.84], [1, 0.4 - 0.25 * r(1)]] : [...base, [0.91, 0.84], [0.95, 1.02], [1, 1.35 + 0.15 * r(1)]] };
    }
    case 'range': { // 박스권: 지지와 저항 사이를 오간다. 빠진 쪽으로 박스 높이만큼(속임수면 되돌아 반대쪽으로)
      const base: Pt[] = [[0, 0], [0.1, 0.5], [0.22, -0.5], [0.34, 0.48], [0.46, -0.48], [0.58, 0.5], [0.7, -0.49], [0.8, 0.3]];
      return { brk: 0.83, pts: ok ? [...base, [0.86, 0.64], [0.9, 0.53], [1, 0.5 + 0.9 + 0.3 * r(1)]] : [...base, [0.86, 0.62], [0.9, 0.38], [1, -0.95 - 0.25 * r(1)]] };
    }
    case 'burst': { // 급등과 소진: 10~60초에 크게 오르고, 낮아지는 고점으로 힘이 빠지면 되돌린다(교과서). 속임수면 더 간다
      const fr = Math.min(0.3, ramp / len);
      const base: Pt[] = [[0, 0], [fr, 1], [fr + 0.07, 1.04], [fr + 0.16, 0.94], [fr + 0.26, 1.0]];
      return { brk: fr + 0.3, pts: ok ? [...base, [1, 1 - (0.45 + 0.3 * r(1))]] : [...base, [fr + 0.36, 0.97], [1, 1.3 + 0.2 * r(1)]] };
    }
  }
}

const NAME: Record<FlyKind, [string, string]> = {
  dbl: ['쌍바닥', '쌍봉'], hs: ['역머리어깨', '머리어깨'], flag: ['상승 깃발', '하락 깃발'], pennant: ['상승 페넌트', '하락 페넌트'],
  tri: ['상승 삼각형', '하락 삼각형'], sym: ['대칭 삼각형', '대칭 삼각형'], wedge: ['하락 쐐기', '상승 쐐기'], channel: ['상승 채널', '하락 채널'],
  range: ['박스권', '박스권'], burst: ['급등', '급락'],
};
function resultWord(kind: FlyKind, o: 1 | -1, ok: boolean): string {
  if (kind === 'channel') return ok ? '이탈' : '이탈 실패';
  if (kind === 'range') return ok ? (o === 1 ? '위로 돌파' : '아래로 이탈') : (o === 1 ? '가짜 돌파' : '가짜 이탈');
  if (kind === 'burst') return ok ? '소진' : '소진 없이 계속';
  return ok ? '완성' : '실패';
}

/** 한 모양(에피소드). 시각은 유닉스 초, 값은 가격 */
export interface FlyEpisode {
  t0: number; t1: number;
  /** 교과서의 갈림 자리(목선, 저항, 추세선을 건드리는 때) */
  brk: number;
  kind: FlyKind;
  /** 놓은 쪽(+1 = 위로 놓은 모양: 쌍바닥, 역머리어깨, 상승 깃발 …) */
  o: 1 | -1;
  /** 교과서가 말하는 쪽 */
  dir: 1 | -1;
  /** 교과서대로 끝났는가(아니면 속임수) */
  ok: boolean;
  /** 모양 이름과 끝난 말(「쌍바닥 완성」, 「박스권 가짜 돌파」) */
  name: string; label: string;
  /** 꼭짓점(뼈대) */
  pts: { t: number; p: number }[];
}
export interface Plan { eps: { t0: number; t1: number; brk: number; kind: FlyKind; o: 1 | -1; ok: boolean; knots: Pt[] }[]; knots: Pt[]; resid: number; a0: number }

function pickKind(c: number, k: number, rem: number): FlyKind {
  const list = rem <= 600 ? SHORT : rem < 900 ? KIND_LIST.filter((x) => x !== 'burst') : KIND_LIST;
  const tot = list.reduce((s, x) => s + KINDS[x].w, 0);
  let u = uni(K_EP, c, k * 32) * tot;
  for (const x of list) { u -= KINDS[x].w; if (u <= 0) return x; }
  return list[list.length - 1];
}

/** 4시간 마디 c 의 모양 차례(씨앗만으로). 시각은 마디가 시작한 때부터의 초 */
export function planChunk(c: number): Plan {
  const t0 = c * CHUNK;
  const a0 = anchorAt(t0), gap = anchorAt(t0 + CHUNK) - a0;
  const eps: Plan['eps'] = [];
  const knots: Pt[] = [[0, 0]];
  let s = 0, cur = 0, k = 0;
  while (s < CHUNK) {
    const rem = CHUNK - s;
    const kind = pickKind(c, k, rem);
    const d = KINDS[kind];
    const r = (i: number) => uni(K_EP, c, k * 32 + 8 + i);
    let len = Math.round(d.len[0] + uni(K_EP, c, k * 32 + 1) * (d.len[1] - d.len[0]));
    if (len > rem || rem - len < 300) len = rem;
    const ok = uni(K_EP, c, k * 32 + 2) >= FLY_FAKE_RATE;
    const ta = t0 + s;
    const gust = volMul(Math.floor(ta / HOUR), Math.floor((ta % HOUR) / 600));
    const ramp = 10 + Math.floor(uni(K_EP, c, k * 32 + 3) * 51);
    let a: number;
    if (kind === 'burst') {
      const u = uni(K_EP, c, k * 32 + 4);
      a = u < 0.4 ? 0.05 + 0.2 * Math.pow(uni(K_EP, c, k * 32 + 5), 1.6) : 0.02 + 0.03 * uni(K_EP, c, k * 32 + 5);
    } else a = AMP_K * d.amp * (0.75 + 0.5 * uni(K_EP, c, k * 32 + 4)) * Math.sqrt(len / 600) * Math.pow(gust, 0.35);
    const sh = shape(kind, ok, r, len, ramp);
    const pts = sh.pts.map(([f, v]) => [f, v] as Pt);
    // 놓는 쪽: 닻까지 남은 거리 쪽으로 기운다(오래 가면 제자리로)
    const need = gap - cur;
    const end0 = pts[pts.length - 1][1];
    const pUp = 1 / (1 + Math.exp(-need / 0.04));
    const toward = uni(K_EP, c, k * 32 + 6) < pUp ? 1 : -1;
    const o: 1 | -1 = (Math.abs(end0) < 0.05 ? (uni(K_EP, c, k * 32 + 7) < pUp ? 1 : -1) : toward * Math.sign(end0)) as 1 | -1;
    // 끝 다리를 닻 쪽으로 조금 늘인다(교과서의 목표 거리도 1~2배는 흔하다). 줄이지는 않는다(모양의 뜻이 흐려지지 않게)
    const want = need * Math.min(1, (len * 3) / rem);
    const pv = o * a * pts[pts.length - 2][1], ev = o * a * end0;
    if (Math.abs(ev - pv) > 1e-9 && Math.sign(want - pv) === Math.sign(ev - pv)) {
      const kx = Math.min(len === rem ? 2.6 : 1.8, Math.max(1, (want - pv) / (ev - pv)));
      const last = pts[pts.length - 1], prev = pts[pts.length - 2];
      last[1] = prev[1] + (last[1] - prev[1]) * kx;
    }
    const epKnots: Pt[] = [];
    let lastS = s;
    for (let i = 1; i < pts.length; i++) {
      let ts = i === pts.length - 1 ? s + len : Math.round(s + pts[i][0] * len);
      if (ts <= lastS) ts = lastS + 1;
      if (ts >= s + len && i < pts.length - 1) continue;
      const v = cur + o * a * pts[i][1];
      knots.push([ts, v]);
      epKnots.push([ts, v]);
      lastS = ts;
    }
    eps.push({ t0: s, t1: s + len, brk: s + Math.round(sh.brk * len), kind, o, ok, knots: epKnots });
    cur = knots[knots.length - 1][1];
    s += len;
    k++;
  }
  return { eps, knots, resid: gap - cur, a0 };
}

const planCache = new Map<number, Plan>();
function planOf(c: number): Plan {
  let p = planCache.get(c);
  if (p) return p;
  p = planChunk(c);
  planCache.set(c, p);
  if (planCache.size > 12) planCache.delete(planCache.keys().next().value as number);
  return p;
}

/** 시간 h 의 3,601개 로그 값(초 0~3600) */
function hourPath(h: number): Float64Array {
  const w = new Float64Array(HOUR + 1);
  const c = Math.floor((h * HOUR) / CHUNK);
  const plan = planOf(c);
  const base = c * CHUNK, off = h * HOUR - base;
  const { knots, resid, a0 } = plan;
  // 다음 마디의 첫 값(마디 끝 = 다음 마디의 닻)
  const fill = (sec: number, v: number) => { const x = base + sec - h * HOUR; if (x >= 0 && x <= HOUR) w[x] = v; };
  for (let i = 1; i < knots.length; i++) {
    const [sa, va] = knots[i - 1], [sb, vb] = knots[i];
    if (sb < off || sa > off + HOUR) continue;
    const L = sb - sa;
    // 꼭짓점 사이의 잔떨림: 처음과 끝이 0 인 다리(씨앗은 절대 시각)
    let acc = 0;
    const tmp = new Float64Array(L + 1);
    for (let x = 0; x < L; x++) {
      const at = base + sa + x;
      acc += FLY_SIGMA * volMul(Math.floor(at / HOUR), Math.floor((at % HOUR) / 600)) * gauss(K_NOISE, at, 0);
      tmp[x + 1] = acc;
    }
    for (let x = 0; x <= L; x++) {
      const sec = sa + x;
      fill(sec, a0 + va + ((vb - va) * x) / L + tmp[x] - (x / L) * acc + (resid * sec) / CHUNK);
    }
  }
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
export function flyPrice(tSec: number): number {
  const t = Math.floor(tSec);
  const h = Math.floor(t / HOUR);
  return FLY_BASE * Math.exp(pathOf(h)[t - h * HOUR]);
}

export interface FlyCandle { t: number; o: number; h: number; l: number; c: number }
/** 1분 봉(t = 그 분이 시작한 때, ms). fromSec 이 든 분부터 toSec 이 든 분까지. 분마다 60개의 1초 값으로 만든다. */
export function flyCandles(fromSec: number, toSec: number): FlyCandle[] {
  const out: FlyCandle[] = [];
  const m0 = Math.floor(fromSec / 60), m1 = Math.floor(toSec / 60);
  for (let m = m0; m <= m1; m++) {
    let o = 0, hi = -Infinity, lo = Infinity, c = 0;
    for (let k = 0; k < 60; k++) {
      const p = flyPrice(m * 60 + k);
      if (k === 0) o = p;
      if (p > hi) hi = p;
      if (p < lo) lo = p;
      c = p;
    }
    out.push({ t: m * 60000, o, h: hi, l: lo, c });
  }
  return out;
}
/** 최근 count 초의 1초 값(차트 기록) */
export function flySeconds(endSec: number, count: number): number[] {
  const out: number[] = [];
  for (let t = Math.floor(endSec) - count + 1; t <= endSec; t++) out.push(flyPrice(t));
  return out;
}

/** 4시간 마디 c 의 모양들 */
function episodesOfChunk(c: number): FlyEpisode[] {
  const plan = planOf(c);
  const base = c * CHUNK;
  return plan.eps.map((e) => {
    const nm = NAME[e.kind][e.o === 1 ? 0 : 1];
    return {
      t0: base + e.t0, t1: base + e.t1, brk: base + e.brk, kind: e.kind, o: e.o, dir: (e.o * KINDS[e.kind].sign) as 1 | -1, ok: e.ok,
      name: nm, label: `${nm} ${resultWord(e.kind, e.o, e.ok)}`,
      pts: [{ t: base + e.t0, p: flyPrice(base + e.t0) }, ...e.knots.map(([s0]) => ({ t: base + s0, p: flyPrice(base + s0) }))],
    };
  });
}
/** 시간 h 에 시작한 모양들 */
export function flyEpisodesOfHour(h: number): FlyEpisode[] {
  return episodesOfChunk(Math.floor((h * HOUR) / CHUNK)).filter((e) => Math.floor(e.t0 / HOUR) === h);
}
/** fromSec ~ toSec 에 걸친 모양들(겹치는 것 전부) */
export function flyEpisodesBetween(fromSec: number, toSec: number): FlyEpisode[] {
  const out: FlyEpisode[] = [];
  for (let c = Math.floor(fromSec / CHUNK); c <= Math.floor(toSec / CHUNK); c++) for (const e of episodesOfChunk(c)) if (e.t1 > fromSec && e.t0 <= toSec) out.push(e);
  return out;
}

// ── 바람 세기(U-52): 값과 같은 씨앗에서 나온다 ─────────────
/** 지금 10분 마디의 바람 세기: 흔들림의 배수(평소 = 1)와 그 마디가 끝나는 시각(초). 이 마디에 시작한 모양도 그만큼 크다 */
export function flyGust(tSec: number): { mul: number; endsAt: number } {
  const t = Math.floor(tSec);
  const h = Math.floor(t / HOUR);
  const block = Math.floor((t - h * HOUR) / 600);
  return { mul: volMul(h, block), endsAt: h * HOUR + (block + 1) * 600 };
}

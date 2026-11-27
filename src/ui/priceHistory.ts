// 차트용 시세 기록(화면 쪽). 엔진은 정산 봉만 가지므로 최근 틱을 여기서 모은다(저장하지 않는다).
import { useGame } from '../store/gameStore';
import { pushDayPrice } from './dayHistory';

export const HIST_LEN = 600;
const hist: Record<string, number[]> = {};
/** 종목마다 실시간으로 쌓인 값의 수(뒤에서부터). 시작할 때 봉으로 복원한 값은 세지 않는다 — "지난 1분 폭"은 초 단위 실시간 값으로만 잰다(U-40). */
const live: Record<string, number> = {};
let lastTick = -1;
let started = false;
/** 짜 둔 시세가 도는 종목(튜토리얼): 그동안 틱이 와도 그 종목 값은 쌓지 않는다(틱의 값이 짜 둔 값이라, 끝나고 걷어 낼 때 남아 실제 차트 앞에 계단이 남았다 — 회차 15 평가) */
const scripted = new Set<string>();
export function beginScript(market: string): void { scripted.add(market); }
export function endScript(market: string): void { scripted.delete(market); }
export const isScripted = (market: string): boolean => scripted.has(market);

export function pushPrices(prices: Record<string, number>, tick: number, seed = false): void {
  if (tick === lastTick) return;
  lastTick = tick;
  for (const [k, v] of Object.entries(prices)) {
    if (scripted.has(k)) continue;
    const a = (hist[k] ??= []);
    a.push(v);
    if (!seed) live[k] = Math.min(HIST_LEN, (live[k] ?? 0) + 1); // 시작할 때의 값(저장된 값 · 장면 건너뛰기의 값)은 시세가 아니라 씨앗이다
    if (a.length > HIST_LEN) a.splice(0, a.length - HIST_LEN);
  }
}
/** 시작할 때 봉으로 복원한 지난 가격을 앞에 붙인다(이미 쌓인 최근 값은 그대로 뒤에 남는다). */
export function prependHistory(past: Record<string, number[]>): void {
  for (const [k, v] of Object.entries(past)) {
    const a = (hist[k] ??= []);
    // 뒤에 남기는 것은 실시간으로 쌓인 값만(씨앗 값은 버린다 — 차트 왼쪽에 절벽이 생기지 않게)
    const n = Math.min(a.length, live[k] ?? 0);
    hist[k] = [...v, ...(n > 0 ? a.slice(-n) : [])].slice(-HIST_LEN);
  }
}
/** 튜토리얼의 짜 둔 시세를 차트에 그렸다가(pushOne) 끝나면 지운다(dropLast). 진짜 시세 기록과 섞이지 않게. */
export function pushOne(market: string, v: number): void { (hist[market] ??= []).push(v); live[market] = (live[market] ?? 0) + 1; }
export function dropLast(market: string, n: number): void { const a = hist[market]; if (a) a.splice(Math.max(0, a.length - n), n); live[market] = Math.max(0, (live[market] ?? 0) - n); }
export const historyOf = (market: string): number[] => hist[market] ?? [];
/** 실시간으로 쌓인 값만(봉으로 복원한 앞부분은 뺀다). 긴장 · 출렁임을 잴 때 쓴다. */
export function liveHistoryOf(market: string): number[] {
  const a = hist[market] ?? [];
  const n = Math.min(a.length, live[market] ?? 0);
  return n > 0 ? a.slice(-n) : [];
}
/** 화면 확인용: 채워 넣은 기록을 실시간 값으로 친다 */
export function markLive(market: string): void { live[market] = (hist[market] ?? []).length; }
export function resetHistory(): void {
  for (const k of Object.keys(hist)) delete hist[k];
  for (const k of Object.keys(live)) delete live[k];
  scripted.clear();
  lastTick = -1;
}

/** 스토어를 구독해 틱마다 쌓는다(한 번만). */
export function startHistory(): void {
  if (started) return;
  started = true;
  const g0 = useGame.getState().g;
  pushPrices(g0.run.prices, g0.run.tick, true);
  useGame.subscribe((s, prev) => {
    if (s.g.run.tick !== prev.g.run.tick) {
      pushPrices(s.g.run.prices, s.g.run.tick);
      const now = Date.now();
      for (const [k, v] of Object.entries(s.g.run.prices)) if (!scripted.has(k)) pushDayPrice(k, v, now);
    }
  });
}

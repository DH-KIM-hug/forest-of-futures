// 차트용 시세 기록(화면 쪽). 엔진은 정산 봉만 가지므로 최근 틱을 여기서 모은다(저장하지 않는다).
import { useGame } from '../store/gameStore';

export const HIST_LEN = 600;
const hist: Record<string, number[]> = {};
let lastTick = -1;
let started = false;

export function pushPrices(prices: Record<string, number>, tick: number): void {
  if (tick === lastTick) return;
  lastTick = tick;
  for (const [k, v] of Object.entries(prices)) {
    const a = (hist[k] ??= []);
    a.push(v);
    if (a.length > HIST_LEN) a.splice(0, a.length - HIST_LEN);
  }
}
/** 시작할 때 봉으로 복원한 지난 가격을 앞에 붙인다(이미 쌓인 최근 값은 그대로 뒤에 남는다). */
export function prependHistory(past: Record<string, number[]>): void {
  for (const [k, v] of Object.entries(past)) {
    const a = (hist[k] ??= []);
    hist[k] = [...v, ...a].slice(-HIST_LEN);
  }
}
/** 튜토리얼의 짜 둔 시세를 차트에 그렸다가(pushOne) 끝나면 지운다(dropLast). 진짜 시세 기록과 섞이지 않게. */
export function pushOne(market: string, v: number): void { (hist[market] ??= []).push(v); }
export function dropLast(market: string, n: number): void { const a = hist[market]; if (a) a.splice(Math.max(0, a.length - n), n); }
export const historyOf = (market: string): number[] => hist[market] ?? [];
export function resetHistory(): void {
  for (const k of Object.keys(hist)) delete hist[k];
  lastTick = -1;
}

/** 스토어를 구독해 틱마다 쌓는다(한 번만). */
export function startHistory(): void {
  if (started) return;
  started = true;
  const g0 = useGame.getState().g;
  pushPrices(g0.run.prices, g0.run.tick);
  useGame.subscribe((s, prev) => {
    if (s.g.run.tick !== prev.g.run.tick) pushPrices(s.g.run.prices, s.g.run.tick);
  });
}

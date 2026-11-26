// 지난 하루의 1분 봉(화면 쪽, 저장하지 않는다). 도토리일보 시세면(proto/daynote.ts)이 읽는다.
// 실시간 판은 시작할 때 받아 온 지난 24시간의 봉을 깔고(setDayHistory), 그 뒤로는 틱마다 그 분의 봉에 넣는다(pushDayPrice).
export interface MinBar { /** 그 분의 시작(ms) */ t: number; o: number; h: number; l: number; c: number }
export const DAY_MINUTES = 1440;
const store: Record<string, MinBar[]> = {};

/** 시작할 때 받아 온 지난 하루의 1분 봉을 깐다(이미 쌓인 실시간 분은 뒤에 남긴다). */
export function setDayHistory(past: Record<string, MinBar[]>): void {
  for (const [id, bars] of Object.entries(past)) {
    const cur = store[id] ?? [];
    const lastT = bars.length ? bars[bars.length - 1].t : -1;
    store[id] = [...bars, ...cur.filter((b) => b.t > lastT)].slice(-DAY_MINUTES);
  }
}
/** 실시간 값 하나를 그 분의 봉에 넣는다. */
export function pushDayPrice(id: string, price: number, nowMs: number): void {
  if (!(price > 0)) return;
  const t = Math.floor(nowMs / 60000) * 60000;
  const a = (store[id] ??= []);
  const last = a[a.length - 1];
  if (last && last.t === t) { last.h = Math.max(last.h, price); last.l = Math.min(last.l, price); last.c = price; }
  else if (!last || t > last.t) { a.push({ t, o: price, h: price, l: price, c: price }); if (a.length > DAY_MINUTES) a.splice(0, a.length - DAY_MINUTES); }
}
export const dayBars = (id: string): MinBar[] => store[id] ?? [];
export function resetDay(): void { for (const k of Object.keys(store)) delete store[k]; }

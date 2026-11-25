export const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');
export const sgn = (n: number): string => (n >= 0 ? '+' : '-') + fmt(Math.abs(n));

const trim = (x: number) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, ''));
/** 좁은 곳용 줄임 표기: 150000 -> 15만, 7500 -> 7,500 */
export function short(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1e8) return `${s}${trim(a / 1e8)}억`;
  if (a >= 1e4) return `${s}${trim(a / 1e4)}만`;
  return fmt(n);
}
export const pct = (x: number, d = 1) => `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(d)}%`;
export const arrow = (x: number) => (x > 0 ? '▲' : x < 0 ? '▼' : '-');

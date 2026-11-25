// mulberry32. 상태는 32비트 정수 하나(run.rng)에 저장한다.
export function nextRandom(holder: { rng: number }): number {
  let a = holder.rng | 0;
  a = (a + 0x6d2b79f5) | 0;
  holder.rng = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function gauss(holder: { rng: number }): number {
  let u = 0;
  while (u === 0) u = nextRandom(holder);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * nextRandom(holder));
}

export const floorS = (x: number) => Math.floor(x + 1e-9);
export const ceilS = (x: number) => Math.ceil(x - 1e-9);

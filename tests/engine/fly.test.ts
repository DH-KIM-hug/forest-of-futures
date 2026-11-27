// 날다람쥐코인(FLY) 값 함수: 결정적인가, 출렁임이 큰가, 시간끼리 이어지는가, 0 이나 무한대로 흘러가지 않는가.
import { describe, expect, it } from 'vitest';
import { FLY_BASE, flyCandles, flyPrice, flySeconds } from '../../src/engine/feed/fly';

const T0 = 1_764_000_000; // 2025-11 어느 날
const std = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };

describe('FLY 값 함수', () => {
  it('같은 시각이면 같은 값(몇 번을 불러도, 순서를 바꿔도)', () => {
    const a = [T0, T0 + 1, T0 + 3599, T0 + 3600, T0 + 86_400 * 3 + 17].map(flyPrice);
    // 다른 시간들을 셈해 기억을 밀어낸 뒤 다시
    for (let h = 0; h < 40; h++) flyPrice(T0 + 1_000_000 + h * 3600);
    const b = [T0, T0 + 1, T0 + 3599, T0 + 3600, T0 + 86_400 * 3 + 17].map(flyPrice);
    expect(b).toEqual(a);
    expect(flyPrice(T0 + 0.7)).toBe(flyPrice(T0));
  });

  it('1분 수익률이 크다(평소 1분 폭 0.4%~1.2%, 급등락까지 넣으면 3% 아래)', () => {
    const r: number[] = [];
    for (let m = 0; m < 48 * 60; m++) r.push(Math.log(flyPrice(T0 + (m + 1) * 60) / flyPrice(T0 + m * 60)));
    // 평소 폭: 절댓값의 가운데 값으로 잰다(급등락에 끌려가지 않게)
    const mad = [...r].map(Math.abs).sort((a, b) => a - b)[r.length >> 1] * 1.4826;
    expect(mad).toBeGreaterThan(0.004);
    expect(mad).toBeLessThan(0.012);
    expect(std(r)).toBeLessThan(0.03);
  });

  it('큰 급등락이 가끔 있다(48시간에 1분 사이 4% 넘는 움직임이 몇 번)', () => {
    let big = 0;
    for (let m = 0; m < 48 * 60; m++) if (Math.abs(Math.log(flyPrice(T0 + (m + 1) * 60) / flyPrice(T0 + m * 60))) > 0.04) big++;
    expect(big).toBeGreaterThanOrEqual(2);
    expect(big).toBeLessThan(200);
  });

  it('시간 경계에서 끊기지 않는다(1초 사이 움직임이 보통 1초 폭 수준)', () => {
    const jumps: number[] = [];
    for (let h = 1; h < 200; h++) {
      const t = T0 - (T0 % 3600) + h * 3600;
      jumps.push(Math.abs(Math.log(flyPrice(t) / flyPrice(t - 1))));
    }
    expect(Math.max(...jumps)).toBeLessThan(0.01);
  });

  it('1년 내내 기준가의 1/10 ~ 10배 안에 머문다', () => {
    let lo = Infinity, hi = 0;
    for (let k = 0; k < 365 * 24; k += 1) { const p = flyPrice(T0 + k * 3600 + 1234); lo = Math.min(lo, p); hi = Math.max(hi, p); }
    expect(lo).toBeGreaterThan(FLY_BASE / 10);
    expect(hi).toBeLessThan(FLY_BASE * 10);
  });

  it('1분 봉은 1초 값과 같은 셈이다(어느 구간이든 처음부터 다시 돌리지 않고)', () => {
    const from = T0 + 50_000, to = from + 600;
    const cs = flyCandles(from, to);
    expect(cs.length).toBe(Math.floor(to / 60) - Math.floor(from / 60) + 1);
    for (const c of cs) {
      const xs = Array.from({ length: 60 }, (_, k) => flyPrice(c.t / 1000 + k));
      expect(c.o).toBe(xs[0]);
      expect(c.c).toBe(xs[59]);
      expect(c.h).toBe(Math.max(...xs));
      expect(c.l).toBe(Math.min(...xs));
    }
    // 아주 먼 구간도 바로 나온다
    const far = flyCandles(T0 + 400 * 86400, T0 + 400 * 86400 + 120);
    expect(far.every((c) => c.l > 0 && c.h >= c.l)).toBe(true);
    expect(flySeconds(T0 + 100, 5)).toEqual([96, 97, 98, 99, 100].map((d) => flyPrice(T0 + d)));
  });
});

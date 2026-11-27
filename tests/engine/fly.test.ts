// 날다람쥐코인(FLY) 값 함수: 결정적인가, 출렁임이 큰가, 시간끼리 이어지는가, 0 이나 무한대로 흘러가지 않는가.
import { describe, expect, it } from 'vitest';
import { FLY_BASE, FLY_FAKE_RATE, flyCandles, flyEpisodesBetween, flyEpisodesOfHour, flyGust, flyPrice, flySeconds, planChunk, type FlyEpisode } from '../../src/engine/feed/fly';
import { flyCandlesV1, flyPriceV1 } from '../../src/engine/feed/flyV1';

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

  it('바람 세기는 10분 마디', () => {
    const g = flyGust(T0 + 5);
    expect(g.mul).toBeGreaterThanOrEqual(0.45); expect(g.mul).toBeLessThanOrEqual(2.6);
    expect(g.endsAt % 600).toBe(0);
    expect(flyGust(g.endsAt - 1).mul).toBe(g.mul);
  });
});

// U-57(회차 16): 교과서 차트 모양
const H0 = Math.floor(T0 / 3600);
const allEps = (hours: number): FlyEpisode[] => { const out: FlyEpisode[] = []; for (let h = H0; h < H0 + hours; h++) out.push(...flyEpisodesOfHour(h)); return out; };
const minNear = (t: number, w = 20) => Math.min(...Array.from({ length: 2 * w + 1 }, (_, k) => flyPrice(t - w + k)));
const maxNear = (t: number, w = 20) => Math.max(...Array.from({ length: 2 * w + 1 }, (_, k) => flyPrice(t - w + k)));

describe('FLY 2판: 교과서 모양', () => {
  const eps = allEps(600);
  it('모양이 시간을 빈틈없이 채운다(앞 모양의 끝 = 뒤 모양의 처음, 3~22분)', () => {
    for (let i = 1; i < eps.length; i++) expect(eps[i].t0).toBe(eps[i - 1].t1);
    for (const e of eps) { expect(e.t1 - e.t0).toBeGreaterThanOrEqual(180); expect(e.t1 - e.t0).toBeLessThanOrEqual(1620); expect(e.brk).toBeGreaterThan(e.t0); expect(e.brk).toBeLessThan(e.t1); }
    expect(flyEpisodesBetween(T0, T0 + 3600).length).toBeGreaterThanOrEqual(3);
  });
  it('열 가지 모양이 다 나온다', () => {
    const kinds = new Set(eps.map((e) => e.kind));
    expect([...kinds].sort()).toEqual(['burst', 'channel', 'dbl', 'flag', 'hs', 'pennant', 'range', 'sym', 'tri', 'wedge']);
  });
  it('속임수는 열에 셋쯤(25~35%)', () => {
    const fake = eps.filter((e) => !e.ok).length / eps.length;
    expect(fake).toBeGreaterThan(0.25); expect(fake).toBeLessThan(0.35);
    expect(Math.abs(fake - FLY_FAKE_RATE)).toBeLessThan(0.04);
  });
  it('갈림 자리 뒤의 실제 값은 열에 일곱쯤 교과서 쪽으로 간다(읽으면 유리, 확실하지는 않다)', () => {
    let n = 0, hit = 0;
    for (const e of eps) { n++; if (Math.sign(Math.log(flyPrice(e.t1) / flyPrice(e.brk))) === e.dir) hit++; }
    expect(hit / n).toBeGreaterThan(0.62); expect(hit / n).toBeLessThan(0.78);
    // 교과서대로 끝난 모양은 거의 다 그쪽으로, 속임수는 거의 다 반대로
    const ok = eps.filter((e) => e.ok), bad = eps.filter((e) => !e.ok);
    expect(ok.filter((e) => Math.sign(Math.log(flyPrice(e.t1) / flyPrice(e.brk))) === e.dir).length / ok.length).toBeGreaterThan(0.9);
    expect(bad.filter((e) => Math.sign(Math.log(flyPrice(e.t1) / flyPrice(e.brk))) === -e.dir).length / bad.length).toBeGreaterThan(0.85);
  });
  // 잔떨림이 있어 모양 하나하나가 늘 깨끗하지는 않다(돌풍 때는 더 거칠다). 열에 아홉 넘게 교과서의 꼴이면 된다
  const share = (xs: boolean[]) => xs.filter(Boolean).length / xs.length;
  it('쌍바닥: 두 바닥이 비슷한 높이, 교과서대로면 목선을 넘고, 실패면 바닥 아래로', () => {
    const dbs = eps.filter((e) => e.kind === 'dbl' && e.o === 1);
    expect(dbs.length).toBeGreaterThan(20);
    const lows: boolean[] = [], brk: boolean[] = [];
    for (const e of dbs) {
      const [, l1, nk, l2] = e.pts;
      const a = minNear(l1.t), b = minNear(l2.t), neck = maxNear(nk.t);
      const depth = neck / Math.min(a, b) - 1;
      lows.push(Math.abs(a / b - 1) < Math.max(0.006, depth * 0.35) && neck > Math.max(a, b)); // 두 바닥: 깊이의 1/3 안
      // 갈림은 꼭짓점(뼈대)으로 잰다: 끝 값이 목선 위, 또는 두 바닥 아래
      const end = flyPrice(e.t1);
      brk.push(e.ok ? end > nk.p : end < Math.min(l1.p, l2.p));
      expect(e.label).toBe(e.ok ? '쌍바닥 완성' : '쌍바닥 실패');
    }
    expect(share(lows)).toBeGreaterThan(0.9);
    expect(share(brk)).toBeGreaterThan(0.97);
  });
  it('머리어깨: 머리가 두 어깨보다 높고, 교과서대로면 목선 아래로', () => {
    const hs = eps.filter((e) => e.kind === 'hs' && e.o === -1);
    expect(hs.length).toBeGreaterThan(10);
    const shape0: boolean[] = [], brk: boolean[] = [];
    for (const e of hs) {
      const ls = maxNear(e.pts[1].t), head = maxNear(e.pts[3].t), rs = maxNear(e.pts[5].t);
      shape0.push(head > ls && head > rs);
      const neck = Math.min(e.pts[2].p, e.pts[4].p);
      brk.push(e.ok ? flyPrice(e.t1) < neck : flyPrice(e.t1) > e.pts[3].p);
    }
    expect(share(shape0)).toBeGreaterThan(0.9);
    expect(share(brk)).toBeGreaterThan(0.97);
  });
  it('상승 삼각형: 저항이 평평하고 저점은 높아진다', () => {
    const ok: boolean[] = [];
    for (const e of eps.filter((x) => x.kind === 'tri' && x.o === 1)) {
      const res = [1, 3, 5].map((i) => e.pts[i].p);
      const height = Math.min(...res) / e.pts[2].p - 1;
      ok.push(Math.max(...res) / Math.min(...res) - 1 < Math.max(0.004, height * 0.25) && e.pts[4].p > e.pts[2].p && e.pts[6].p > e.pts[4].p);
    }
    expect(ok.length).toBeGreaterThan(10);
    expect(share(ok)).toBeGreaterThan(0.9);
  });
  it('모양 사이와 시간 사이에서 끊기지 않는다(1초 사이 1% 넘는 틈이 급등락 밖에 없다)', () => {
    for (const e of eps.slice(0, 400)) {
      if (e.kind === 'burst') continue;
      expect(Math.abs(Math.log(flyPrice(e.t0) / flyPrice(e.t0 - 1)))).toBeLessThan(0.01);
    }
  });
  it('시간마다 닻까지 못 간 나머지(맞춤)는 보통 작다', () => {
    const rs = Array.from({ length: 1000 }, (_, k) => Math.abs(planChunk(Math.floor(H0 / 4) + k).resid)).sort((a, b) => a - b);
    expect(rs[500]).toBeLessThan(0.03);
    expect(rs[900]).toBeLessThan(0.08);
  });
  it('끝난 모양의 이름(나중에 붙이는 말)', () => {
    const labels = new Set(eps.map((e) => e.label));
    for (const x of ['쌍바닥 완성', '쌍봉 실패', '역머리어깨 완성', '상승 깃발 완성', '박스권 가짜 돌파', '상승 채널 이탈', '급등 소진']) expect(labels.has(x)).toBe(true);
    for (const l of labels) expect(l).not.toMatch(/·/);
  });
});

describe('FLY 1판은 지난 거래를 다시 셀 때만', () => {
  it('1판은 그대로다(같은 값, 바뀌지 않는다)', () => {
    expect(flyPriceV1(T0)).toBeCloseTo(flyPriceV1(T0), 12);
    const cs = flyCandlesV1(T0, T0 + 120);
    expect(cs.length).toBe(3);
    expect(flyPriceV1(T0 + 1234)).not.toBe(flyPrice(T0 + 1234));
  });
});


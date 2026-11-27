// U-48(회차 7) 손맛: 청산까지 얼마나 왔나, 들고 있는 동안의 고비, 이긴 판의 등급, 장면을 미루는 숨, 날다람쥐코인 속보 문턱.
import { describe, expect, it } from 'vitest';
import { dangerOf, nextMilestone, ROE_MILESTONES, winTier } from '../../src/ui/proto/tension';
import { BEAT_MS, FLY_NEWS_GAP, FLY_NEWS_PCT } from '../../src/ui/proto/watch';
import { flyPrice } from '../../src/engine/feed/fly';
import balance from '../../data/balance.json';

const maint = balance.trading.maintenanceRate;

describe('dangerOf: 진입가 0 → 청산가 1', () => {
  it('들어간 순간은 0, 청산가에서는 1, 넘어도 1', () => {
    const init = (1 / 200 - maint) * 100;
    expect(dangerOf(init, 200, maint)).toBeCloseTo(0, 6);
    expect(dangerOf(init / 2, 200, maint)).toBeCloseTo(0.5, 6);
    expect(dangerOf(0, 200, maint)).toBe(1);
    expect(dangerOf(-0.1, 200, maint)).toBe(1);
  });
  it('이익 쪽으로 가서 청산이 멀어지면 0 아래로 내려가지 않는다', () => {
    expect(dangerOf(5, 50, maint)).toBe(0);
  });
  it('배율과 상관없이 들어간 거리에 견준다(10배에서 0.3% 남으면 턱밑, 200배에서 0.3% 남으면 아직 4분의 1)', () => {
    expect(dangerOf(0.3, 10, maint)).toBeGreaterThan(0.9);
    expect(dangerOf(0.3, 200, maint)).toBeCloseTo(0.25, 2);
  });
});

describe('nextMilestone: 들고 있는 동안 넘은 고비', () => {
  it('처음 +50% 를 넘으면 +50%, 같은 고비는 다시 안 나온다', () => {
    expect(nextMilestone(0, 49)).toBeNull();
    expect(nextMilestone(0, 52)?.text).toBe('+50%');
    expect(nextMilestone(50, 70)).toBeNull();
  });
  it('100% 는 두 배, 한 틱에 여럿을 넘으면 가장 높은 것 하나', () => {
    expect(nextMilestone(50, 101)?.text).toBe('두 배!');
    expect(nextMilestone(0, 320)?.at).toBe(300);
  });
  it('고비 글에 가운데점이 없다', () => {
    for (const m of ROE_MILESTONES) expect(m.text).not.toMatch(/·/);
  });
});

describe('winTier: 이긴 판의 등급', () => {
  it('잔돈은 0, 15% 부터 짭짤하다, 100% 두 배, 300% 대박, 1000% 전설', () => {
    expect(winTier(10).lv).toBe(0);
    expect(winTier(15).word).toBe('짭짤하다');
    expect(winTier(60).word).toBe('한 방');
    expect(winTier(100).word).toBe('두 배');
    expect(winTier(400).word).toBe('대박');
    expect(winTier(1500).word).toBe('전설');
  });
  it('등급이 오를수록 도토리 비가 굵어진다', () => {
    const r = [15, 50, 100, 300, 1000].map((x) => winTier(x).rain);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1]);
  });
});

describe('숨과 속보 문턱', () => {
  it('장면을 미루는 숨은 결과 카드를 읽을 만큼(2~3초)', () => {
    expect(BEAT_MS).toBeGreaterThanOrEqual(2000);
    expect(BEAT_MS).toBeLessThanOrEqual(3200);
  });
  it('날다람쥐코인 속보는 하루에 열 번 넘게, 백 번 아래로(시세 함수에서 센다)', () => {
    const t0 = 1_764_000_000; // 고정 시각(시험이 날마다 같은 값)
    const ps: number[] = [];
    for (let t = t0; t < t0 + 86400; t++) ps.push(flyPrice(t));
    let n = 0, last = -1e9;
    for (let i = 60; i < ps.length; i++) {
      if (i - last < FLY_NEWS_GAP) continue;
      const w = ps.slice(i - 60, i + 1);
      const r = ((Math.max(...w) - Math.min(...w)) / ps[i]) * 100;
      if (r >= FLY_NEWS_PCT) { n++; last = i; }
    }
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThan(100);
  });
});

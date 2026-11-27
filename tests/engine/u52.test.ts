// U-52 회차 11: 날다람쥐코인의 숲 소문과 바람 세기. 값은 그대로, 소문은 같은 씨앗에서.
import { describe, expect, it } from 'vitest';
import { flyPrice, flyTellsBetween, flyTellOutcome, flyTellRecord, flyJumpsOfHour, flyGust, TELL_WINDOW } from '../../src/engine/feed/fly';

const H = 3600, T0 = 1_764_000_000;
describe('U-52 숲 소문', () => {
  it('값은 소문 전과 같다(시세 함수 그대로)', () => {
    let s = 0; for (let i = 0; i < 200; i++) s += flyPrice(T0 + i * 7919);
    expect(s).toBeCloseTo(21195.6240590297, 6);
    expect(flyPrice(1764003600 + 1234)).toBeCloseTo(84.05489540307944, 9);
  });
  it('같은 때 같은 소문(순수 함수)', () => {
    expect(flyTellsBetween(T0, T0 + 6 * H)).toEqual(flyTellsBetween(T0, T0 + 6 * H));
  });
  it('미리 도는 소문은 급등락보다 10~60초 앞, 성적은 반쯤', () => {
    let n = 0, hit = 0, dirHit = 0, jumps = 0, told = 0;
    const end = T0 + 3000 * H;
    for (const x of flyTellsBetween(T0, end)) {
      n++;
      const o = flyTellOutcome(x, end + H);
      expect(o).not.toBeUndefined();
      if (o) { hit++; if (o.dir === x.dir) dirHit++; expect(o.at - x.at).toBeGreaterThanOrEqual(0); expect(o.at - x.at).toBeLessThanOrEqual(TELL_WINDOW); }
    }
    for (let h = T0 / H; h < end / H; h++) for (const j of flyJumpsOfHour(Math.floor(h))) { jumps++; if (flyTellsBetween(j.at - 60, j.at - 10).length) told++; }
    const prec = hit / n, dirOk = dirHit / hit, cover = told / jumps;
    console.log('소문', { n, hit, dirHit, prec, dirOk, jumps, cover, perHour: n / 3000 });
    expect(prec).toBeGreaterThan(0.45); expect(prec).toBeLessThan(0.65);
    expect(dirOk).toBeGreaterThan(0.58); expect(dirOk).toBeLessThan(0.72);
    expect(cover).toBeGreaterThan(0.5); expect(cover).toBeLessThan(0.7);
  });
  it('성적은 지난 하루를 센다', () => {
    const r = flyTellRecord(T0 + 30 * H);
    expect(r.n).toBeGreaterThan(5); expect(r.hit).toBeLessThanOrEqual(r.n); expect(r.dirHit).toBeLessThanOrEqual(r.hit);
  });
  it('바람 세기는 10분 마디', () => {
    const g = flyGust(T0 + 5);
    expect(g.mul).toBeGreaterThanOrEqual(0.45); expect(g.mul).toBeLessThanOrEqual(2.6);
    expect(g.endsAt % 600).toBe(0);
    expect(flyGust(g.endsAt - 1).mul).toBe(g.mul);
  });
});

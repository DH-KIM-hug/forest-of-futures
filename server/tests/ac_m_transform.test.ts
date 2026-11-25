import { describe, expect, it } from 'vitest';
import { Rebaser } from '../src/transform.ts';
import { Sampler } from '../src/sampler.ts';
import { BarBuilder, computeAvg } from '../src/bars.ts';
import type { TickRecord } from '../src/types.ts';

const members = { primary: ['A', 'B', 'IDX_X'], secondary: ['A', 'B'] };
const mk = () => new Rebaser({ A: 68000, B: 3400, JQQ: 520 }, 'JQQ', members);

describe('AC-v2-133 변환기는 결정적', () => {
  it('같은 mid 열을 두 번 돌리면 가상 가격 열이 같다', () => {
    const series = Array.from({ length: 200 }, (_, i) => ({ A: 100000 + Math.sin(i / 7) * 900, B: 2000 + Math.cos(i / 5) * 40, IDX_X: 0.5 + i * 1e-4 }));
    const run = () => {
      const r = new Rebaser({ A: 68000, B: 3400, JQQ: 520 }, 'JQQ', members);
      return series.map((m) => { r.step(m, 'primary'); return { ...r.prices() }; });
    };
    expect(run()).toEqual(run());
  });
});

describe('AC-v2-134 mid 100,000 -> 100,012.5 이면 68,000 -> 68,008.5', () => {
  it('수익률을 그대로 곱한다, 갱신이 없으면 직전 값', () => {
    const r = mk();
    r.step({ A: 100000, B: 2000, IDX_X: 1 }, 'primary'); // 앵커
    expect(r.vprice.A).toBe(68000);
    r.step({ A: 100012.5, B: 2000, IDX_X: 1 }, 'primary');
    expect(r.vprice.A).toBeCloseTo(68008.5, 6);
    r.step({ A: 100012.5, B: 2000, IDX_X: 1 }, 'primary'); // 그 초에 갱신이 없다: 같은 mid
    expect(r.vprice.A).toBeCloseTo(68008.5, 6);
  });
});

describe('AC-v2-135 변동성 보정 없음', () => {
  it('아주 작은 수익률도 큰 수익률도 그대로 낸다', () => {
    const r = mk();
    r.step({ A: 100000, B: 1, IDX_X: 1 }, 'primary');
    r.step({ A: 100000 * (1 + 0.000004), B: 1, IDX_X: 1 }, 'primary');
    expect(r.vprice.A / 68000 - 1).toBeCloseTo(0.000004, 9);
    const r2 = mk();
    r2.step({ A: 100000, B: 1, IDX_X: 1 }, 'primary');
    r2.step({ A: 100108, B: 1, IDX_X: 1 }, 'primary');
    expect(r2.vprice.A / 68000 - 1).toBeCloseTo(0.00108, 9);
  });
});

describe('지수 JQQ (XRP 는 지수에만)', () => {
  it('구성원 1초 수익률의 평균. 보조 출처는 가진 종목만의 평균', () => {
    const r = mk();
    r.step({ A: 100, B: 100, IDX_X: 100 }, 'primary');
    r.step({ A: 101, B: 100, IDX_X: 102 }, 'primary'); // +1%, 0, +2% -> 평균 1%
    expect(r.vprice.JQQ).toBeCloseTo(520 * 1.01, 9);
    expect(Object.keys(r.prices())).not.toContain('IDX_X');
    const r2 = mk();
    r2.step({ A: 100, B: 100 }, 'secondary');
    r2.step({ A: 101, B: 100 }, 'secondary'); // 평균 0.5%
    expect(r2.vprice.JQQ).toBeCloseTo(520 * 1.005, 9);
  });
  it('다시 앵커하면 그 사이 움직임은 버리고 이어 붙인다', () => {
    const r = mk();
    r.step({ A: 100, B: 100, IDX_X: 100 }, 'primary');
    r.reanchor({ A: 150, B: 150, IDX_X: 150 });
    r.step({ A: 150, B: 150, IDX_X: 150 }, 'primary');
    expect(r.vprice.A).toBe(68000);
    expect(r.vprice.JQQ).toBe(520);
  });
});

describe('표본', () => {
  it('1초 안에 마지막 mid 가 남고 체결량은 비워진다', () => {
    const s = new Sampler();
    s.ingest({ kind: 'mid', key: 'A', mid: 10, ts: 0 }, 1);
    s.ingest({ kind: 'mid', key: 'A', mid: 11, ts: 0 }, 2);
    s.ingest({ kind: 'trade', key: 'A', notional: 30, buy: true, ts: 0 }, 2);
    s.ingest({ kind: 'trade', key: 'A', notional: 10, buy: false, ts: 0 }, 2);
    const d = s.drain();
    expect(d.mids.A).toBe(11);
    expect(d.vol.A).toBe(40);
    expect(d.buyVol.A).toBe(30);
    const d2 = s.drain();
    expect(d2.mids.A).toBe(11); // 갱신이 없으면 직전 값
    expect(d2.vol.A).toBeUndefined();
  });
});

const tk = (n: number, price: number, st: TickRecord['st'] = 'open', vol = 1): TickRecord => ({ n, ts: n, st, src: 'primary', p: { DTC: [price, vol, 0.5] } });

describe('봉 만들기', () => {
  it('60틱마다 닫히고 OHLC·평균 vol 이 맞다', () => {
    const b = new BarBuilder(60);
    const closed = [];
    for (let n = 60; n < 121; n++) closed.push(...b.add(tk(n, 100 + (n === 70 ? 5 : n === 80 ? -3 : 0), 'open', n % 2 ? 2 : 0)));
    expect(closed).toHaveLength(1);
    const c = closed[0];
    expect(c).toMatchObject({ n0: 60, o: 100, h: 105, l: 97, c: 100, st: 0 });
    expect(c.vol).toBeCloseTo(1, 6);
  });
  it('정산 봉은 마지막 60틱 평균(avg60)을 갖는다', () => {
    const b = new BarBuilder(180);
    const out = [];
    for (let n = 0; n <= 180; n++) out.push(...b.add(tk(n, n < 120 ? 50 : 100)));
    expect(out[0].avg60).toBe(100);
  });
  it('정지 틱은 OHLC 에서 빠지고, 전부 정지면 납작한 st=2 봉', () => {
    const b = new BarBuilder(60);
    const out = [];
    for (let n = 0; n < 60; n++) out.push(...b.add(tk(n, n < 30 ? 100 : 100, n < 30 ? 'open' : 'halted')));
    for (let n = 60; n < 120; n++) out.push(...b.add(tk(n, 100, 'halted')));
    out.push(...b.add(tk(120, 100)));
    expect(out[0].st).toBe(0);
    expect(out[1]).toMatchObject({ st: 2, o: 100, h: 100, l: 100, c: 100 });
  });
  it('평소 값: 봉이 없으면 기본값, 있으면 평균', () => {
    expect(computeAvg([], []).range300s).toBeGreaterThan(0);
    const bars = Array.from({ length: 10 }, (_, i) => ({ market: 'DTC', n0: i * 180, o: 100, h: 101, l: 99, c: 100, vol: 2, buy: 0.5, st: 0 as const }));
    const a = computeAvg(bars, []);
    expect(a.vol180).toBe(2);
    expect(a.range180).toBeCloseTo(0.02, 9);
  });
});

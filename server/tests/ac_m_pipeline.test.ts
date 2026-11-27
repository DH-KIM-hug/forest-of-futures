import { describe, expect, it } from 'vitest';
import { EPOCH, RAW, T0, feedMids, makePipe, markets } from './helpers.ts';
import { TickStore } from '../src/store.ts';
import { flyPrice } from '../../src/engine/feed/fly.ts';

const SEC = 1000;

/** 매초 (primary/secondary 가 살아 있으면) mid 를 넣고 틱을 만든다. */
function run(pipe: ReturnType<typeof makePipe>['pipe'], from: number, to: number, alive: { p: boolean; s: boolean }, mul = (_t: number) => 1) {
  for (let t = from; t < to; t++) {
    const now = T0 + t * SEC;
    if (alive.p) feedMids(pipe, 'primary', now, mul(t));
    if (alive.s) feedMids(pipe, 'secondary', now, mul(t), 0.001, ['DTC', 'BTH', 'SMS']);
    pipe.tick(now);
  }
}

describe('AC-v2-136 자동 전환', () => {
  it('주 출처가 5초 조용하면 보조로 전환, 가격은 이어지고 상태는 open, 출처가 틱 기록에 남는다', () => {
    const { pipe, ticks, store } = makePipe();
    run(pipe, 0, 20, { p: true, s: true });
    const before = ticks[ticks.length - 1];
    expect(before.src).toBe('primary');
    run(pipe, 20, 40, { p: false, s: true }); // 보조는 스케일이 완전히 다르다(0.001배)
    const after = ticks.filter((t) => t.src === 'secondary');
    expect(after.length).toBeGreaterThan(10);
    expect(ticks.every((t, i) => i === 0 || t.st === 'open' || t.n - EPOCH >= 0)).toBe(true);
    expect(after.every((t) => t.st === 'open')).toBe(true);
    const jump = Math.abs(after[0].p.DTC[0] / before.p.DTC[0] - 1);
    expect(jump).toBeLessThan(1e-9); // 이어 붙임
    expect(store.ticksBetween(0, 1e9).some((t) => t.src === 'secondary')).toBe(true);
  });
  it('주 출처가 60초 정상이면 복귀한다(복귀 때도 이어 붙임)', () => {
    const { pipe, ticks } = makePipe();
    run(pipe, 0, 10, { p: true, s: true });
    run(pipe, 10, 30, { p: false, s: true });
    expect(pipe.activeSource()).toBe('secondary');
    run(pipe, 30, 60, { p: true, s: true });
    expect(pipe.activeSource()).toBe('secondary'); // 아직 60초 안 됨
    run(pipe, 60, 100, { p: true, s: true });
    expect(pipe.activeSource()).toBe('primary');
    const i = ticks.findIndex((t, k) => k > 0 && ticks[k - 1].src === 'secondary' && t.src === 'primary');
    expect(Math.abs(ticks[i].p.DTC[0] / ticks[i - 1].p.DTC[0] - 1)).toBeLessThan(1e-9);
  });
  it('주 출처 수익률이 보조와 30초 넘게 0.5%p 이상 어긋나면 보조로 전환(알림)', () => {
    const { pipe } = makePipe();
    // 주: 매초 +1% 씩 오른다. 보조: 평평하다.
    for (let t = 0; t < 45; t++) {
      const now = T0 + t * SEC;
      feedMids(pipe, 'primary', now, Math.pow(1.01, t));
      feedMids(pipe, 'secondary', now, 1, 0.001, ['DTC', 'BTH', 'SMS']);
      pipe.tick(now);
    }
    expect(pipe.activeSource()).toBe('secondary');
  });
});

describe('AC-v2-137 시장 정지', () => {
  it('두 출처가 5초 조용하면 delayed(가격 멈춤), 60초 넘으면 halted. 다시 열리면 멈추기 직전 값에서 이어진다', () => {
    const { pipe, ticks } = makePipe();
    run(pipe, 0, 10, { p: true, s: true }, (t) => 1 + t * 1e-4);
    const lastOpen = ticks[ticks.length - 1];
    run(pipe, 10, 20, { p: false, s: false });
    const d = ticks.filter((t) => t.st === 'delayed');
    expect(d.length).toBeGreaterThan(0);
    expect(d.every((t) => t.p.DTC[0] === lastOpen.p.DTC[0])).toBe(true);
    run(pipe, 20, 90, { p: false, s: false });
    expect(pipe.currentStatus()).toBe('halted');
    expect(ticks[ticks.length - 1].st).toBe('halted');
    // 다시 열림: 시장은 그 사이 +10% 움직였다. 가상 가격은 멈추기 직전 값에서 이어진다.
    run(pipe, 90, 100, { p: true, s: false }, () => 1.1);
    const reopened = ticks.filter((t, i) => i > 0 && ticks[i - 1].st !== 'open' && t.st === 'open')[0];
    expect(reopened).toBeTruthy();
    expect(Math.abs(reopened.p.DTC[0] / lastOpen.p.DTC[0] - 1)).toBeLessThan(1e-9);
  });
  it('서버 재시작: 꺼져 있던 초는 halted 로 채우고 저장된 마지막 가격에서 이어 붙인다', () => {
    const store = new TickStore(':memory:');
    const a = makePipe(store);
    run(a.pipe, 0, 20, { p: true, s: false }, (t) => 1 + t * 1e-3);
    const last = a.ticks[a.ticks.length - 1];
    const b = makePipe(store); // 같은 저장소로 새 프로세스를 흉내
    const later = T0 + 300 * SEC;
    feedMids(b.pipe, 'primary', later, 5); // 시장은 5배가 됐다
    const out = b.pipe.tick(later);
    const filled = out.filter((t) => t.st === 'halted');
    expect(filled.length).toBeGreaterThan(200);
    expect(filled[0].n).toBe(last.n + 1);
    expect(filled.every((t) => t.p.DTC[0] === last.p.DTC[0])).toBe(true);
    run(b.pipe, 301, 320, { p: true, s: false }, () => 5);
    const resumed = b.ticks[b.ticks.length - 1];
    expect(Math.abs(resumed.p.DTC[0] / last.p.DTC[0] - 1)).toBeLessThan(1e-6);
    expect(store.ticksBetween(last.n + 1, last.n + 300).length).toBe(300); // 틱 번호에 구멍이 없다
  });
});

describe('틱·봉 저장', () => {
  it('1초 틱과 1분/정산 봉이 기록되고 hello 용 평소 값이 나온다', () => {
    const { pipe, store } = makePipe();
    run(pipe, 0, 400, { p: true, s: false }, (t) => 1 + Math.sin(t / 10) * 1e-3);
    const b60 = store.barsBetween(60, 0, 1e9);
    const b180 = store.barsBetween(180, 0, 1e9);
    expect(b60.bars.length).toBeGreaterThanOrEqual(5 * 5);
    expect(b180.bars.length).toBeGreaterThanOrEqual(5);
    expect(b180.bars[0].avg60).toBeGreaterThan(0);
    expect(markets.map((m) => m.id)).toEqual(['DTC', 'BTH', 'MDT', 'SMS', 'JQQ', 'FLY']);
    // 날다람쥐코인(FLY, U-47)은 출처가 없어도 틱마다 시각의 함수 값으로 나온다
    expect(Object.keys(store.ticksBetween(0, 1e9)[0].p).sort()).toEqual(['BTH', 'DTC', 'FLY', 'JQQ', 'MDT', 'SMS']);
    const t0 = store.ticksBetween(0, 1e9)[0];
    expect(t0.p.FLY[0]).toBeCloseTo(flyPrice(t0.ts), 9);
  });
});
void RAW;

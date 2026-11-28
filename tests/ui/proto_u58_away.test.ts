// U-58 자리를 비운 동안은 걷지 않는다(사용자 결정): 가려진 탭의 정산 시계, 실시간 시세 풀의 frozen 틱, 서버 판의 재생 틱.
import { describe, expect, it } from 'vitest';
import { createGame, stepMut } from '../../src/engine/game';
import { SimFeed } from '../../src/engine/feed/simFeed';
import { liqPrice } from '../../src/engine/futures';
import { AwayClock, FREEZE_GRACE_SEC } from '../../src/net/awayClock';
import { attachHlFeed } from '../../src/net/hlDirect/attach';
import type { Tick } from '../../src/engine/feed/types';
import type { GameState } from '../../src/engine/types';

const T0 = 1_700_000_000; // 벽시계 초
const pricesOf = (t: Tick) => Object.fromEntries(Object.entries(t.p).map(([k, v]) => [k, v[0]]));
function game(): { g: GameState; feed: SimFeed } {
  const feed = new SimFeed(3);
  const g = createGame({ seed: 9, prices: pricesOf(feed.snapshot()) });
  g.run.intro = false;
  g.run.cash = 50_000;
  g.run.futures.open = true;
  g.run.settleIn = 60;
  return { g, feed };
}

describe('U-58 가려진 탭의 시계(AwayClock)', () => {
  it(`가려진 지 ${FREEZE_GRACE_SEC}초까지는 돈다, 그 뒤로 멈춘다`, () => {
    const c = new AwayClock();
    expect(c.frozenNow(T0 * 1000)).toBe(false);
    c.hide(T0 * 1000);
    expect(c.frozenNow((T0 + FREEZE_GRACE_SEC - 1) * 1000)).toBe(false);
    expect(c.frozenNow((T0 + FREEZE_GRACE_SEC) * 1000)).toBe(true);
    expect(c.frozenAt(T0 + 2)).toBe(false);
    expect(c.frozenAt(T0 + FREEZE_GRACE_SEC)).toBe(true);
    c.show((T0 + 40) * 1000);
    expect(c.frozenNow((T0 + 41) * 1000)).toBe(false);
    // 다시 보인 뒤에 한꺼번에 들어온 틱도 번호(시각)가 가려진 구간이면 멈춘다
    expect(c.frozenAt(T0 + 20)).toBe(true);
    expect(c.frozenAt(T0 + 39)).toBe(true);
    expect(c.frozenAt(T0 + 40)).toBe(false);
    expect(c.frozenAt(T0 + 1)).toBe(false);
  });
  it('유예 안에 돌아오면 아무 구간도 남기지 않는다', () => {
    const c = new AwayClock();
    c.hide(T0 * 1000);
    c.show((T0 + 3) * 1000);
    expect(c.spans).toEqual([]);
    expect(c.frozenAt(T0 + 2)).toBe(false);
  });
});

describe('U-58 실시간 시세 풀: 가려진 동안의 틱', () => {
  function wire(clock: AwayClock) {
    const { g, feed: sim } = game();
    let cur = g;
    let cb: ((t: Tick) => void) | null = null;
    const fake = { resuming: false, subscribe: (f: (t: Tick) => void) => { cb = f; return () => {}; }, gapHandler: null, loadWarm: () => Promise.resolve(null), kick() {} };
    attachHlFeed(fake as never, { get: () => cur, set: (x) => { cur = x; }, frozen: (n) => clock.frozenAt(n) });
    const push = (n: number, over?: (p: Tick['p']) => void) => { const t = sim.next(); t.n = n; over?.(t.p); cb!(t); };
    return { get: () => cur, push };
  }
  it('가려진 지 5초 뒤의 틱은 정산 시계를 멈춘다. 다시 보이면 남은 초부터', () => {
    const clock = new AwayClock();
    const w = wire(clock);
    for (let i = 0; i < 10; i++) w.push(T0 + i);
    expect(w.get().run.settleIn).toBe(50);
    clock.hide((T0 + 10) * 1000);
    for (let i = 10; i < 400; i++) w.push(T0 + i); // 6분 넘게 가려진 채
    expect(w.get().run.settleIn).toBe(45); // 유예 5초만 흘렀다
    expect(w.get().run.settleNo).toBe(0);
    clock.show((T0 + 400) * 1000);
    for (let i = 400; i < 445; i++) w.push(T0 + i);
    expect(w.get().run.settleIn).toBe(60); // 남은 45초를 다 쓰고 정산 한 번, 다시 60
    expect(w.get().run.settleNo).toBe(1);
  });
  it('가려진 동안에도 포지션은 시세를 탄다: 청산가에 닿으면 그 틱에서 청산', () => {
    const clock = new AwayClock();
    const w = wire(clock);
    w.push(T0);
    const g = w.get();
    const r = stepMut(g, { type: 'action', action: { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10_000 } });
    expect(r).toMatchObject({ ok: true });
    const liq = liqPrice(g.run.positions.DTC);
    clock.hide((T0 + 1) * 1000);
    for (let i = 1; i < 30; i++) w.push(T0 + i);
    expect(w.get().run.positions.DTC).toBeDefined();
    w.push(T0 + 30, (p) => { p.DTC = [liq * 0.99, 1, 0.5]; });
    expect(w.get().run.positions.DTC).toBeUndefined();
    expect(w.get().run.eventLog.some((e) => e.kind === 'liq')).toBe(true);
    expect(w.get().run.settleNo).toBe(0);
  });
});

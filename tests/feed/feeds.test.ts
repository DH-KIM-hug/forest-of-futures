import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SimFeed } from '../../src/engine/feed/simFeed';
import { ReplayFeed, CANDLE_TICKS, type Recording } from '../../src/engine/feed/replayFeed';
import { marketDefs } from '../../src/engine/data';
import type { Tick } from '../../src/engine/feed/types';

const rec: Recording = JSON.parse(readFileSync(join(__dirname, '../../docs/gdd/v2/sim/data/hl_3m.json'), 'utf8'));

function checkTick(t: Tick) {
  expect(Number.isInteger(t.n)).toBe(true);
  expect(['open', 'delayed', 'halted']).toContain(t.st);
  expect(Object.keys(t.p).sort()).toEqual(marketDefs.map((m) => m.id).sort());
  for (const [id, cell] of Object.entries(t.p)) {
    expect(cell, id).toHaveLength(3);
    expect(cell[0]).toBeGreaterThan(0);
    expect(Number.isFinite(cell[0]) && Number.isFinite(cell[1]) && Number.isFinite(cell[2])).toBe(true);
    expect(cell[2]).toBeGreaterThanOrEqual(0);
    expect(cell[2]).toBeLessThanOrEqual(1);
  }
}

describe('M0 피드 (AC-v2-142 형식, 시드 재현)', () => {
  it('SimFeed: 같은 시드는 같은 시세 열, 다른 시드는 다르다', () => {
    const a = new SimFeed(7), b = new SimFeed(7), c = new SimFeed(8);
    const ta: Tick[] = [], tb: Tick[] = [], tc: Tick[] = [];
    for (let i = 0; i < 300; i++) (ta.push(a.next()), tb.push(b.next()), tc.push(c.next()));
    expect(ta).toEqual(tb);
    expect(ta).not.toEqual(tc);
    ta.forEach(checkTick);
    expect(ta[0].n).toBe(1);
    expect(ta[299].n).toBe(300);
  });

  it('ReplayFeed: 기록(3분봉)을 1초 틱으로 흘려 주고 같은 Tick 형식이다', () => {
    expect(rec.minutes).toBeGreaterThan(1000);
    const f = new ReplayFeed(rec);
    const ticks: Tick[] = [];
    for (let i = 0; i < CANDLE_TICKS * 3; i++) ticks.push(f.next());
    ticks.forEach(checkTick);
    // 기록의 첫 봉 종가와 이어진다(상승봉이면 o->l->h->c)
    const c0 = rec.coins.C1.c[0];
    const t180 = ticks[CANDLE_TICKS - 1].p.DTC[0];
    expect(t180).toBeCloseTo(68000 * Math.exp(c0 / 1e6), 4);
    // 지수는 다섯 종목 평균이라 JQQ 는 음수가 아니다
    expect(ticks[10].p.JQQ[0]).toBeGreaterThan(0);
    // 재생은 결정적이다
    const g = new ReplayFeed(rec);
    expect(Array.from({ length: 50 }, () => g.next())).toEqual(ticks.slice(0, 50));
  });

  it('두 피드 모두 구독으로 틱을 밀어 주고 봉(1분·정산)을 만들 수 있다', async () => {
    for (const feed of [new SimFeed(3), new ReplayFeed(rec)]) {
      const got: Tick[] = [];
      const off = feed.subscribe((t) => got.push(t));
      for (let i = 0; i < 360; i++) feed.next();
      off();
      feed.next();
      expect(got).toHaveLength(360);
      const bars60 = await feed.bars(60, 1, 360);
      expect(bars60.length).toBeGreaterThanOrEqual(marketDefs.length * 6);
      const b = bars60[0];
      expect(b.h).toBeGreaterThanOrEqual(Math.max(b.o, b.c));
      expect(b.l).toBeLessThanOrEqual(Math.min(b.o, b.c));
      const bars180 = await feed.bars(180, 1, 360);
      expect(bars180.length).toBeGreaterThanOrEqual(marketDefs.length * 2);
      expect((await feed.now()).st).toBe('open');
    }
  });

  it('앱이 받는 피드 값에 실제 가격·실제 종목 이름이 없다', () => {
    const f = new ReplayFeed(rec);
    const t = f.next();
    expect(JSON.stringify(t)).not.toMatch(/BTC|ETH|SOL|DOGE|XRP|hyperliquid/i);
    expect(t.p.DTC[0]).toBeGreaterThan(60000); // 가상 시작가 근처(실제 가격이 아니라 68,000 에서 시작)
    expect(t.p.DTC[0]).toBeLessThan(76000);
  });
});

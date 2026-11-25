import { describe, it, expect } from 'vitest';
import { A, fresh, openFutures, pushBar, tickN } from './helpers';
import { runTips, tipHitRate, wireDelaySec } from '../../src/engine/tips';
import { tipsData, eventDefs } from '../../src/engine/data';
import type { GameState } from '../../src/engine/types';

const P = 68000;
/** 도토코인에 직전 5회 고가 68,100 이하 + 방금 정산 종가가 그 위, 거래량 2.5배인 봉을 만든다. */
function breakoutBars(g: GameState, vol = 2.5) {
  for (let i = 0; i < 5; i++) pushBar(g, 'DTC', { o: P, h: P + 100, l: P - 100, c: P + 20 * (i % 2) });
  pushBar(g, 'DTC', { o: P, h: P + 520, l: P - 10, c: P + 500, vol });
}
const tipsOf = (g: GameState, src: string) => g.run.recentTips.filter((t) => t.source === src);

describe('I. 정보', () => {
  it('AC-v2-87 종가가 그 전 5회 고가를 넘고 거래량이 평소의 2.5배면 wire_break, 같은 출처는 정산 5회 안에 다시 말하지 않는다', () => {
    const g = fresh();
    breakoutBars(g);
    runTips(g);
    const t = tipsOf(g, 'wire_break');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ market: 'DTC', dir: 1, fact: true });
    const n = g.run.notices.find((x) => x.id.startsWith('tip:wire_break'))!;
    expect(n.text).toBe('도토코인, 15분 고가 갱신. 거래량 평소의 2.5배');
    expect(n.kind).toBe('wire');
    runTips(g);
    g.run.settleNo += 4;
    runTips(g);
    expect(tipsOf(g, 'wire_break')).toHaveLength(1);
    g.run.settleNo += 1;
    runTips(g);
    expect(tipsOf(g, 'wire_break')).toHaveLength(2);
  });

  it('AC-v2-87 거래량이 2.5배에 못 미치면 뜨지 않는다', () => {
    const g = fresh();
    breakoutBars(g, 2.4);
    runTips(g);
    expect(tipsOf(g, 'wire_break')).toHaveLength(0);
  });

  it('AC-v2-88 속보 20초 안에 같은 종목·같은 방향 진입이면 tipSource=wire_break. 21초 뒤·숏(fadedWire)·다른 종목이면 안 붙는다', () => {
    const mk = () => {
      const g = fresh();
      openFutures(g);
      breakoutBars(g);
      runTips(g);
      return g;
    };
    const a = mk();
    tickN(a, 20);
    A(a, { type: 'open', market: 'DTC', dir: 1, lev: 2, margin: 1000 });
    expect(a.run.positions.DTC.tipSource).toBe('wire_break');
    expect(a.run.positions.DTC.fadedWire).toBe(false);
    const b = mk();
    tickN(b, 21);
    A(b, { type: 'open', market: 'DTC', dir: 1, lev: 2, margin: 1000 });
    expect(b.run.positions.DTC.tipSource).toBeNull();
    const c = mk();
    tickN(c, 5);
    A(c, { type: 'open', market: 'DTC', dir: -1, lev: 2, margin: 1000 });
    expect(c.run.positions.DTC.tipSource).toBeNull();
    expect(c.run.positions.DTC.fadedWire).toBe(true);
    const d = mk();
    A(d, { type: 'open', market: 'BTH', dir: 1, lev: 2, margin: 1000 });
    expect(d.run.positions.BTH.tipSource).toBeNull();
  });

  it('AC-v2-89 곰 형이 "오른다"고 한 뒤 5분 안에 평소 5분 변동 폭만큼 먼저 내리면 말한 횟수 +1, 맞은 횟수 +0', () => {
    const g = fresh();
    // 직전 5정산 동안 크게 빠짐 -> 곰 형 "바닥이다"
    const avg15 = g.run.mkt.avg.DTC.range180 * Math.sqrt(5);
    let p = P * 1.2;
    for (let i = 0; i < 5; i++) {
      const next = p * (1 - (avg15 * 2) / 5);
      pushBar(g, 'DTC', { o: p, h: p, l: next, c: next });
      p = next;
    }
    g.run.prices.DTC = p;
    runTips(g);
    const t = tipsOf(g, 'bear')[0];
    expect(t).toMatchObject({ dir: 1, counted: true });
    expect(g.family.tipBook.bear).toEqual({ said: 1, hit: 0 });
    tickN(g, 30, { DTC: p * (1 - g.run.mkt.avg.DTC.range300s * 1.2) });
    expect(t.result).toBe('miss');
    expect(g.family.tipBook.bear).toEqual({ said: 1, hit: 0 });
  });

  it('적중: 말한 방향으로 평소 5분 폭만큼 먼저 가면 맞은 횟수 +1', () => {
    const g = fresh();
    breakoutBars(g);
    runTips(g);
    const t = tipsOf(g, 'wire_break')[0];
    tickN(g, 10, { DTC: g.run.prices.DTC * (1 + g.run.mkt.avg.DTC.range300s * 1.2) });
    expect(t.result).toBe('hit');
    expect(g.family.tipBook.wire_break).toEqual({ said: 1, hit: 1 });
    expect(tipHitRate(g, 'wire_break')).toBe(1);
  });

  it('AC-v2-90 시스템 문구(fact 출처·사건)에는 권유 표현이 없다', () => {
    const bad = /오른다|내린다|사라|팔아라|매수하세요|매도하세요|사세요|파세요/;
    for (const s of tipsData.sources.filter((x: any) => x.kind === 'fact')) for (const l of [...s.lines.up, ...s.lines.down]) expect(bad.test(l), l).toBe(false);
    for (const e of eventDefs) expect(bad.test(e.text), e.id).toBe(false);
  });

  it("AC-v2-91 기질 '의심병': 출처의 가문 적중률이 숫자로 나오고 속보가 3초 늦게 뜬다", () => {
    const g = fresh();
    expect(wireDelaySec(g)).toBe(0);
    g.family.traits = ['doubting'];
    g.family.tipBook.fox = { said: 4, hit: 1 };
    expect(wireDelaySec(g)).toBe(3);
    expect(tipHitRate(g, 'fox')).toBe(0.25);
    expect(tipHitRate(g, 'bear')).toBeNull();
  });

  it('단짝 다람쥐는 포지션 ROE -50% 아래에서 "그만 정리해"(수첩에 세지 않는다)', () => {
    const g = fresh();
    openFutures(g);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 10000 });
    tickN(g, 1, { DTC: P * 0.994 }); // -6% ROE
    runTips(g);
    expect(tipsOf(g, 'squirrel')).toHaveLength(0);
    tickN(g, 1, { DTC: P * 0.9945 });
    g.run.prices.DTC = P * 0.9945;
    g.run.positions.DTC.entry = P * 1.06; // ROE 가 -50% 보다 아래(약 -62%)
    runTips(g);
    expect(tipsOf(g, 'squirrel')).toHaveLength(1);
    expect(tipsOf(g, 'squirrel')[0].counted).toBe(false);
  });
});

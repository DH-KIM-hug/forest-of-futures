// U-56(회차 15): FRX 의뢰판, 숲 단타방, 트로피 장, 등급 수수료, 연습 시세 날다람쥐의 벽시계, 한 번 누르기 정리
import { describe, it, expect } from 'vitest';
import { newBoard, applyClose, fitBoard, setGust, questById, QUESTS, GUST_QUEST, judge, type CloseInfo } from '../../src/ui/proto/quests';
import { newRivals, stepRivals, standings, opposite, RIVALS, RIVAL_BANK } from '../../src/ui/proto/rivals';
import { TROPHIES } from '../../src/ui/proto/trophies';
import { tierFee, TIER_FEE_STEP, baseFeeRate } from '../../src/engine/skilltree';
import { SimFeed, SIM_FLY_EPOCH } from '../../src/engine/feed/simFeed';
import { flyPrice } from '../../src/engine/feed/fly';
import { createGame } from '../../src/engine/game';
import { act } from '../../src/engine/actions';
import { CLOSE_GUARD_MS } from '../../src/ui/proto/Trade';

const C = (o: Partial<CloseInfo>): CloseInfo => ({ market: 'DTC', dir: 1, lev: 10, pnl: 100, roe: 5, heldSec: 40, kind: 'close', claim: 4200, fly: false, ...o });

describe('FRX 의뢰판', () => {
  it('셋이 걸리고, 같은 씨앗이면 같은 판, 배율이 낮으면 배율 의뢰를 붙이지 않는다', () => {
    const a = newBoard(7, 200), b = newBoard(7, 200);
    expect(a.slots.map((s) => s.id)).toEqual(b.slots.map((s) => s.id));
    expect(new Set(a.slots.map((s) => s.id)).size).toBe(3);
    for (let seed = 0; seed < 40; seed++) {
      const low = newBoard(seed, 25);
      expect(low.slots.every((s) => (questById[s.id].minCap ?? 0) <= 25)).toBe(true);
    }
    const fit = fitBoard({ ...a, slots: [{ id: 'lev100', prog: 0 }, ...a.slots.slice(1).filter((s) => s.id !== 'lev100')].slice(0, 3) }, 10);
    expect(fit.slots.some((s) => s.id === 'lev100')).toBe(false);
  });
  it('끝낸 의뢰는 도장을 주고 그 자리에 다음 의뢰가 붙는다', () => {
    const b = { ...newBoard(3, 200), slots: [{ id: 'short', prog: 0 }, { id: 'five', prog: 4 }, { id: 'sl', prog: 0 }] };
    const r = applyClose(b, C({ dir: -1, pnl: 5000 }), 200);
    expect(r.finished.sort()).toEqual(['five', 'short']);
    expect(r.stamps).toBe(questById.short.reward + questById.five.reward);
    expect(r.board.slots).toHaveLength(3);
    expect(r.board.slots.map((s) => s.id)).not.toContain('short');
    expect(r.board.slots.find((s) => s.id === 'sl')?.prog).toBe(0);
    expect(r.board.done).toBe(2);
  });
  it('연승은 지면 처음부터, 세 종목은 같은 종목을 두 번 세지 않는다, 청산 뒤 다음 판', () => {
    expect(judge('streak', C({ pnl: -10 }), { id: 'streak', prog: 2 }).reset).toBe(true);
    const s1 = judge('three', C({ market: 'DTC' }), { id: 'three', prog: 0 });
    expect(judge('three', C({ market: 'DTC' }), { id: 'three', prog: 1, set: s1.set }).add).toBe(0);
    const arm = judge('comeback', C({ kind: 'liq', pnl: -1000, roe: -100 }), { id: 'comeback', prog: 0 });
    expect(arm.armed).toBe(true);
    expect(judge('comeback', C({ pnl: 10 }), { id: 'comeback', prog: 0, armed: true }).add).toBe(1);
  });
  it('돌풍 특보: 돌풍 동안 날다람쥐로 이익이면 한 번 끝나고, 돌풍이 지나면 내려간다', () => {
    let b = setGust(newBoard(1, 200), 1000);
    expect(b.gust).toEqual({ endsAt: 1000, done: false });
    const r = applyClose(b, C({ market: 'FLY', fly: true, gust: true, pnl: 300 }), 200);
    expect(r.finished).toContain('gust');
    expect(r.stamps).toBeGreaterThanOrEqual(GUST_QUEST.reward);
    b = setGust(r.board, null);
    expect(b.gust).toBeNull();
  });
});

describe('숲 단타방', () => {
  it('같은 씨앗, 같은 값이면 같은 판. 200배 너구리는 값이 반대로 가면 청산된다', () => {
    const px = { FLY: 100, DTC: 68000 };
    let a = newRivals(5, 0), b = newRivals(5, 0);
    const evA: string[] = [], evB: string[] = [];
    for (let t = 1; t <= 400; t++) {
      const p = { FLY: 100 * (1 + 0.004 * Math.sin(t / 9)), DTC: px.DTC };
      const ra = stepRivals(a, t, p, { FLY: Math.sign(Math.cos(t / 9)) }, ['FLY', 'DTC']); a = ra.state; evA.push(...ra.events.map((e) => e.id + e.kind + e.at));
      const rb = stepRivals(b, t, p, { FLY: Math.sign(Math.cos(t / 9)) }, ['FLY', 'DTC']); b = rb.state; evB.push(...rb.events.map((e) => e.id + e.kind + e.at));
    }
    expect(evA).toEqual(evB);
    expect(evA.some((e) => e.startsWith('raccoonliq'))).toBe(true);
    expect(a.r.raccoon.liqs).toBeGreaterThan(0);
  });
  it('순위에는 나와 넷이 있고, 반대편 라이벌을 찾는다', () => {
    const s = newRivals(1, 0);
    s.r.viper.pos = { market: 'FLY', dir: -1, lev: 100, entry: 100, margin: 40000, at: 0 };
    s.r.viper.bank = RIVAL_BANK - 40000;
    const rows = standings(s, 12345, { FLY: 101 });
    expect(rows).toHaveLength(RIVALS.length + 1);
    expect(rows[0].me).toBe(true);
    expect(rows.find((r) => r.id === 'viper')!.pnl).toBeCloseTo(-40000, 0);
    expect(opposite(s, 'FLY', 1)?.id).toBe('viper');
    expect(opposite(s, 'FLY', -1)).toBeNull();
  });
});

it('트로피: 의뢰마다 하나 + 단타방 셋, 이름이 겹치지 않는다', () => {
  expect(TROPHIES.length).toBe(QUESTS.length + 1 + 3);
  expect(new Set(TROPHIES.map((t) => t.name)).size).toBe(TROPHIES.length);
});

describe('등급 수수료(사용자 결정)', () => {
  it('한 등급마다 0.001%p, 절반에서 멈춘다', () => {
    expect(tierFee(0.0001, 0)).toBeCloseTo(0.0001, 12);
    expect(tierFee(0.0001, 1)).toBeCloseTo(0.00009, 12);
    expect(tierFee(0.0001, 5)).toBeCloseTo(0.00005, 12);
    expect(tierFee(0.0001, 9)).toBeCloseTo(0.00005, 12);
    expect(tierFee(0, 3)).toBe(0);
    expect(TIER_FEE_STEP).toBe(0.00001);
  });
  it('엔진: setFeeTier 로 기본 수수료율이 준다', () => {
    const g = createGame({ seed: 3 });
    const before = baseFeeRate(g.run);
    expect(act(g, { type: 'setFeeTier', tier: 2 }).ok).toBe(true);
    expect(g.run.feeTier).toBe(2);
    if (before > 0) expect(baseFeeRate(g.run)).toBeLessThan(before);
  });
});

it('연습 시세의 날다람쥐: 기준 시각을 주면 그 시각의 값(실시간 판과 같은 함수)', () => {
  const now = 1_790_000_000;
  const f = new SimFeed(9, 0, now);
  const t = f.next();
  expect(t.p.FLY[0]).toBeCloseTo(flyPrice(now + 1), 9);
  const d = new SimFeed(9).next();
  expect(d.p.FLY[0]).toBeCloseTo(flyPrice(SIM_FLY_EPOCH + 1), 9);
  f.rebase({}, 50, now + 100);
  expect(f.next().p.FLY[0]).toBeCloseTo(flyPrice(now + 151), 9);
});

it('한 번 누르기 정리의 가드는 0.3초', () => {
  expect(CLOSE_GUARD_MS).toBe(300);
});

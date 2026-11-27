// U-47 화면 쪽: 집의 정산 막대, 여러 종목을 함께 든 거래소 꼬리표, 정산당 금리 표기, 처음부터 200배(발도장 한 칸).
import { describe, expect, it } from 'vitest';
import { A, fresh, tickN } from '../engine/helpers';
import { officeOffer, ratePct, settleBar, staffedCount } from '../../src/ui/proto/model';
import { levRuler, marketTabs, orderPreview } from '../../src/ui/vm/trade';
import { STORY } from '../../src/ui/proto/text';
import { MAX_POSITIONS } from '../../src/engine/futures';
import { marketDefs } from '../../src/engine/data';
import type { GameState } from '../../src/engine/types';

/** 첫 대출 + 폰 + 알바 둘(엄마의 쳇바퀴 + 보조 쳇바퀴) */
const working = (): GameState => {
  const g = fresh();
  A(g, { type: 'borrow', lender: 'shark1' });
  A(g, { type: 'openAccount', sponsor: true });
  A(g, { type: 'hire', coin: 'DTC' });
  A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' });
  A(g, { type: 'hire', uid: g.run.equipment[0].uid });
  return g;
};

describe('정산 막대 (U-47)', () => {
  it('낼 돈 = 이자 + 일당 + 생활비, 결론 = 손에 든 돈 + 수금까지 더 들어올 돈 − 낼 돈', () => {
    const g = working();
    const b = settleBar(g);
    expect(b.interest).toBe(2800);
    expect(b.living).toBe(330);
    expect(b.wages).toBe(1060);
    expect(b.hamsters).toBe(staffedCount(g));
    expect(b.due).toBe(2800 + 330 + 1060);
    expect(b.left).toBeCloseTo(g.run.cash + b.proj - b.due, 6);
    expect(b.ok).toBe(b.left >= 0);
    expect(b.text).toMatch(/^이대로면 [\d,]+ (남아요|모자라요)$/);
  });
  it('1초마다 번 돈이 차오르고 더 들어올 돈은 준다(합은 그대로), 막대 자리는 0~100%', () => {
    const g = working();
    g.run.cash = 0;
    const b0 = settleBar(g);
    expect(b0.earned).toBe(0);
    tickN(g, 10);
    const b1 = settleBar(g);
    expect(b1.earned).toBeGreaterThan(0);
    expect(b1.proj).toBeLessThan(b0.proj);
    expect(Math.abs(b1.earned + b1.proj - b0.proj)).toBeLessThan(5); // 판 때의 끝자리만 다르다
    expect(b1.pct(b1.due)).toBeGreaterThan(0);
    expect(b1.pct(b1.due)).toBeLessThanOrEqual(100);
    expect(b1.pct(1e12)).toBe(100);
  });
  it('모자라면 붉은 결론(정산은 있는 만큼 내고 나머지는 연체가 된다)', () => {
    const g = working();
    g.run.cash = 0;
    g.run.equipment[0].staffed = false;
    g.run.coinWheels.DTC.staffed = false;
    const b = settleBar(g);
    expect(b.proj).toBe(0);
    expect(b.ok).toBe(false);
    expect(b.text).toBe(`이대로면 ${b.due.toLocaleString('ko-KR')} 모자라요`);
  });
  it('열린 포지션의 손익은 막대에 섞지 않는다', () => {
    const g = working();
    const before = settleBar(g);
    A(g, { type: 'open', market: 'BTH', dir: 1, lev: 10, margin: 10_000 });
    const after = settleBar(g);
    expect(after.due).toBe(before.due);
    expect(after.left).toBeCloseTo(before.left - (before.left - after.left), 6);
    // 증거금으로 나간 만큼만 손에 든 돈이 준다
    expect(before.left - after.left).toBeGreaterThanOrEqual(10_000);
  });
});

describe('여러 종목을 함께 든다 (U-47)', () => {
  it('종목 꼬리표 여섯, 포지션이 있는 종목은 방향과 지금 손익을 안다', () => {
    const g = working();
    g.run.cash = 300_000;
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 20_000 }).ok).toBe(true);
    expect(A(g, { type: 'open', market: 'BTH', dir: -1, lev: 25, margin: 20_000 }).ok).toBe(true);
    expect(A(g, { type: 'open', market: 'FLY', dir: 1, lev: 50, margin: 20_000 }).ok).toBe(true);
    const tabs = marketTabs(g);
    expect(tabs.map((t) => t.id)).toEqual(marketDefs.filter((m) => m.tradable).map((m) => m.id));
    expect(tabs.map((t) => t.id).at(-1)).toBe('FLY');
    expect(tabs.filter((t) => t.hasPos).map((t) => [t.id, t.posDir])).toEqual([['DTC', 1], ['BTH', -1], ['FLY', 1]]);
    // 막 들어간 판: 시세는 그대로라 손익은 수수료만큼(0 이하)
    for (const t of tabs.filter((x) => x.hasPos)) expect(t.posNet!).toBeLessThanOrEqual(0);
    expect(tabs.find((t) => t.id === 'SMS')!.posNet).toBeNull();
  });
  it('포지션은 종목마다 하나, 거래할 수 있는 종목 수(6)까지', () => {
    expect(MAX_POSITIONS).toBe(6);
    const g = working();
    g.run.cash = 1_000_000;
    for (const m of marketDefs.filter((x) => x.tradable)) expect(A(g, { type: 'open', market: m.id, dir: 1, lev: 5, margin: 10_000 }).ok).toBe(true);
    expect(Object.keys(g.run.positions)).toHaveLength(6);
    expect(orderPreview(g, 'DTC', 1, 5, 10).reason).toBeNull(); // 이미 든 종목은 추가 진입
  });
});

describe('처음부터 200배, 정산당 금리 표기 (U-47)', () => {
  it('50배 위는 막힌 칸이 아니라 발도장 한 번 남은 칸이다', () => {
    const g = working();
    const r = levRuler(g);
    expect(r.filter((n) => n.seal).map((n) => n.lev)).toEqual([100, 200]);
    expect(r.filter((n) => n.locked && !n.seal)).toEqual([]);
    expect(A(g, { type: 'signWaiver' }).ok).toBe(true);
    expect(levRuler(g).some((n) => n.locked)).toBe(false);
    expect(A(g, { type: 'signWaiver' }).ok).toBe(false); // 생마다 한 번
  });
  it('확인서 장면: 그 배율로 반대로 얼마면 다 잃는지 말한다. 화면 글에 가운데점이 없다', () => {
    const lines = STORY.waiverAsk(200);
    expect(lines.map((l) => l.text).join('\n')).toContain('200배는 반대로 약 0.5% 움직이면');
    for (const l of lines) expect(l.text).not.toContain('·');
  });
  it('금리 %: 1.3, 2, 0.5, 0.33 (반올림으로 1 이나 0 이 되지 않는다)', () => {
    expect(ratePct(0.013)).toBe(1.3);
    expect(ratePct(0.02)).toBe(2);
    expect(ratePct(0.005)).toBe(0.5);
    expect(ratePct(0.0033)).toBe(0.33);
    expect(officeOffer(fresh()).ratePct).toBe(1.3);
  });
});

// U-42(회차 5) 화면 쪽: 장에 맞춘 출구 · 수수료가 기울인 승률(주문 줄 · 나무) · 정산 빼고 전부 · 정산 빼고 갚기 · 본장까지 남은 시간 · 연달아 이긴/진 판의 줄 · 들고 있는 동안 굴린 돈.
import { afterEach, describe, expect, it } from 'vitest';
import { A, bare, openFutures } from '../engine/helpers';
import { balance, skillById } from '../../src/engine/data';
import { forecast } from '../../src/engine/settlement';
import { acornStops, fairOdds, keepDueMargin, oddsText, orderCtx, planLine, swingCount } from '../../src/ui/proto/stops';
import { betOdds, nodeOdds, treeOddsLine, REF_BET } from '../../src/ui/proto/odds';
import { opensInMin, opensInText, openHeadsUp, spanText, untilHourMin } from '../../src/ui/proto/market';
import { repayBuys, interestCut, STAMP_STEP } from '../../src/ui/proto/ledger';
import { holdBeat } from '../../src/ui/proto/tension';
import { STORY } from '../../src/ui/proto/text';
import type { GameState } from '../../src/engine/types';

const T = balance.trading;
const act1 = (on: boolean) => { if (on) (balance as { act1?: unknown }).act1 = { friends: false }; else delete (balance as { act1?: unknown }).act1; };
afterEach(() => act1(false));
const ctx = (fee = 0) => orderCtx({ margin: 50_000, lev: 200, feeRate: fee, maint: T.maintenanceRate as number });
/** 초 단위 기록: 가운데 값 100 둘레를 amp(%) 만큼 오가는 물결 */
const wave = (n: number, ampPct: number, period = 120) => Array.from({ length: n }, (_, i) => 100 * (1 + (ampPct / 100) * Math.sin((i / period) * 2 * Math.PI)));

// U-46: 「이자 한 번 걸기」(장에 맞춘 출구, U-42 ①)를 게임에서 뺐다 — 그 시험(maxSwing · autoExit)도 뺐다

describe('수수료가 기울인 승률 (U-42 ④)', () => {
  it('수수료 0 이면 반반(덧말 없음), 0.02% 면 37 대 63 — 주문 줄에 적힌다(셈 자체의 시험: U-46 뒤 1막의 수수료는 0.01%)', () => {
    const free = acornStops(ctx(0), 15_500, 15_500), paid = acornStops(ctx(0.0002), 15_500, 15_500);
    expect(fairOdds(free)!).toBeCloseTo(0.5, 2);
    expect(oddsText(fairOdds(free))).toBeNull();
    expect(fairOdds(paid)!).toBeCloseTo(0.5 - 2000 / 15_500, 2); // 0.5 − (한쪽 수수료 ÷ 건 돈)
    expect(oddsText(fairOdds(paid))).toBe('익절 37 : 손절 63');
    expect(planLine({ tpNet: 15_500, slNet: 15_500, st: paid, hist: [] })).toContain('수수료 반영 후 익절 37 : 손절 63');
    expect(planLine({ tpNet: 15_500, slNet: 15_500, st: free, hist: [] })).not.toContain('수수료 반영');
  });
  it('나무: 0.02% 에서 노드 없이 37.1% · 판당 −4,000, 단골 수수료 Lv1 → 38.1% · −3,700(봉으로 센 값 36.8~38.8%). U-46 의 0.01% 에서는 43.5% · −2,000 → 44.0% · −1,850(봉 43.4~44.2%)', () => {
    const bare0 = betOdds({}, 0.0002);
    expect(bare0.p! * 100).toBeCloseTo(37.1, 1); expect(bare0.ev).toBe(-4000); expect(bare0.ratePct).toBeCloseTo(0.02, 6);
    const a1 = betOdds({ R: 1, A1: 1 }, 0.0002);
    expect(a1.p! * 100).toBeCloseTo(38.1, 1); expect(a1.ev).toBe(-3700);
    expect(betOdds({}, 0).p!).toBeCloseTo(0.5, 3);
    const b1 = betOdds({}, 0.0001), b2 = betOdds({ R: 1, A1: 1 }, 0.0001);
    expect(b1.p! * 100).toBeCloseTo(43.5, 1); expect(b1.ev).toBe(-2000); expect(b2.p! * 100).toBeCloseTo(44.0, 1); expect(b2.ev).toBe(-1850);
  });
  it('노드 설명: 수수료 노드는 지금 → 다음 승률을 적고, 그 판을 안 바꾸는 노드는 적지 않는다. 어떤 노드도 반반을 넘기지 못한다', () => {
    act1(true);
    const own = { R: 1 };
    const a1 = nodeOdds(own, 'A1', 0)!;
    expect(a1.text).toMatch(/익절 확률 43\.5% → 44\.0%\n한 판 평균 −2,000 → −1,850/); // U-46: 끝난 뒤 수수료 0.01%
    // U-47: B1(한 번 버티기)은 수수료를 건드리지 않는다 — 이 판의 승률도 그대로라 적지 않는다
    for (const id of ['R', 'A3a', 'B1', 'B2', 'B3a', 'B4', 'C3a', 'C4']) expect(nodeOdds(own, id, id === 'R' ? 1 : 0)).toBeNull();
    // 비상금 주머니는 보험료(+0.01%p)만큼 이 판을 더 기울인다 — 그것도 적는다
    const c2 = nodeOdds({ R: 1, C1: 1 }, 'C2', 0)!;
    expect(c2.next.p!).toBeLessThan(c2.now.p!);
    // 전부 100레벨씩 올려도 반반에는 못 미친다(수수료는 0이 되지 않는다)
    const all = Object.fromEntries(Object.keys(skillById).filter((k) => k !== 'C2' && k !== 'A3a' && k !== 'B3b' && k !== 'C3a').map((k) => [k, 100]));
    expect(betOdds(all).p!).toBeLessThan(0.5);
    expect(treeOddsLine(own)).toMatch(/수수료 0\.01%\. 5만 200배, 익절과 손절을 ±15,500에 걸면 익절 44 : 손절 56/); // U-46: 「이자 한 번 걸기」 이름 없이 · 0.01%
    expect(treeOddsLine({ R: 1, A1: 5, A4: 5 })).toMatch(/익절 46 : 손절 54 \(나무 없이는 44 : 56\)/);
    expect(REF_BET).toMatchObject({ margin: 50_000, lev: 200, claim: 15_500 });
  });
});

describe('정산 빼고 전부 · 정산 빼고 갚기 (U-42 ③ ⑤)', () => {
  const trader = (cash: number): GameState => { const g = bare(); openFutures(g); g.run.cash = cash; g.run.futures.waiver = true; g.run.futures.closedTrades = 20; return g; };
  it('셈: 손에 든 돈 − 다음 정산에 낼 돈, 수수료가 있으면 그것까지 남긴다. 모자라면 0', () => {
    expect(keepDueMargin({ cash: 110_000, due: 19_100, lev: 200, feeRate: 0 })).toBe(90_900);
    expect(keepDueMargin({ cash: 110_000, due: 19_100, lev: 200, feeRate: 0.0002 })).toBe(Math.floor(90_900 / 1.04));
    expect(keepDueMargin({ cash: 12_000, due: 19_100, lev: 200, feeRate: 0 })).toBe(0);
  });
  it('진짜 엔진: 그 비율로 들어가면 정산에 낼 돈이 손에 남는다(전부 걸면 0이 남는다)', () => {
    const g = trader(110_000);
    const f = forecast(g), due = f.interest + f.living + f.wages;
    const m = keepDueMargin({ cash: g.run.cash, due, lev: 200, feeRate: T.feeRate as number });
    const r = A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, marginPct: Math.min(99.99, ((m + 0.5) / g.run.cash) * 100), sl: null, tp: null });
    expect(r.ok).toBe(true);
    expect(g.run.positions.DTC.margin0).toBe(m);
    expect(g.run.cash).toBeGreaterThanOrEqual(due);
    expect(g.run.cash).toBeLessThan(due + 2);
  });
  it('갚기: 다음 정산에 낼 돈을 남기고 도장 단위로 갚는다. 줄어드는 이자와 금박 도장이 적힌다', () => {
    const g = bare();
    g.run.debts.shark1 = { principal: 490_000, inherited: 300_000, overdue: 0, graceLeft: 0, tranches: [{ amount: 90_000, rate: 0.06 }] } as GameState['run']['debts']['shark1'];
    g.run.cash = 124_900; g.run.stats['repaid.shark1'] = 10_000;
    const b = repayBuys(g, 19_500)!;
    expect(b.amount).toBe(100_000); expect(b.mult).toBe(10);
    expect(b.cut).toBe(interestCut(g, 100_000));
    expect(b.stamps).toBe(Math.floor((10_000 + 100_000) / STAMP_STEP));
    expect(b.text).toMatch(/^100,000 갚으면 이자 −[\d,]+, 금박 도장 \+2$/);
    const cash0 = g.run.cash;
    const r = A(g, { type: 'stamp', lender: 'shark1', mult: b.mult });
    expect(r.ok).toBe(true);
    expect(cash0 - g.run.cash).toBe(100_000);
    expect(g.run.cash).toBeGreaterThanOrEqual(19_500);
    expect(repayBuys(Object.assign(bare(), {}), 1e9)).toBeNull(); // 남길 돈이 더 많으면 갚을 것이 없다
  });
});

describe('본장까지 남은 시간 (U-42: 달력으로 아는 것만)', () => {
  const at = (iso: string) => new Date(iso);
  it('금요일 아침 6:43(서울): 삼솔전자 본장까지 2시간 17분, 잣스닥(뉴욕 목 16:43 — 마감 뒤)은 다음 날 09:30 까지', () => {
    const now = at('2026-11-27T06:43:00+09:00');
    expect(opensInMin('SMS', now)).toBe(137);
    expect(opensInText('SMS', now)).toBe('본장까지 2시간 17분');
    expect(opensInMin('JQQ', now)).toBe((24 - 16) * 60 - 43 + 9 * 60 + 30);
    expect(opensInMin('DTC', now)).toBeNull(); expect(opensInText('DTC', now)).toBeNull();
  });
  it('본장 중이면 0(글은 없다), 금요일 마감 뒤에는 월요일 아침까지', () => {
    expect(opensInMin('SMS', at('2026-11-27T10:00:00+09:00'))).toBe(0);
    expect(opensInText('SMS', at('2026-11-27T10:00:00+09:00'))).toBeNull();
    expect(opensInMin('SMS', at('2026-11-27T16:00:00+09:00'))).toBe(8 * 60 + 2 * 1440 + 9 * 60);
    expect(spanText(8 * 60 + 2 * 1440 + 9 * 60)).toBe('2일 17시간');
    expect(spanText(41)).toBe('41분'); expect(spanText(120)).toBe('2시간');
  });
  it('개장 30 · 10 · 1분 전에 한 번씩만 알린다', () => {
    const said = new Set<string>();
    expect(openHeadsUp('SMS', at('2026-11-27T08:29:10+09:00'), said)).toBeNull();
    const h = openHeadsUp('SMS', at('2026-11-27T08:30:10+09:00'), said)!;
    expect(h.min).toBe(30);
    said.add(h.key);
    expect(openHeadsUp('SMS', at('2026-11-27T08:30:40+09:00'), said)).toBeNull();
    expect(openHeadsUp('SMS', at('2026-11-27T08:50:05+09:00'), said)!.min).toBe(10);
    expect(openHeadsUp('SMS', at('2026-11-27T08:59:05+09:00'), said)!.min).toBe(1);
    expect(openHeadsUp('SMS', at('2026-11-27T09:00:05+09:00'), said)).toBeNull();
  });
  it('어제 가장 시끄러웠던 시간대까지', () => {
    expect(untilHourMin(9, at('2026-11-27T06:43:00+09:00'))).toBe(137);
    expect(untilHourMin(6, at('2026-11-27T06:43:00+09:00'))).toBe(0);
    expect(untilHourMin(5, at('2026-11-27T06:43:00+09:00'))).toBe(22 * 60 + 17);
  });
});

describe('연달아 이긴 · 진 판, 들고 있는 동안 굴린 돈 (U-42)', () => {
  it('장면의 줄: 숫자는 받은 값 그대로, 엄마 이야기는 건드리지 않는다(빚이 어디서 왔는지는 아직 아무도 말하지 않는다)', () => {
    const w = STORY.winRun({ sum: 31_402, stampPct: 63 }), l = STORY.lossRun({ sum: 31_000, spins: 7, cash: 95_100, claim: 15_500 });
    expect(w.map((x) => x.who)).toEqual(['boss', 'hero']); // 개정 대본 장면 29
    expect(w[0].text).toContain('+31,402'); // U-44: 금박 도장 몇 %는 장부가 보여 준다(대사에서 뺐다)
    expect(l[0].text).toContain('31,000'); expect(l[1].text).toContain('7번 정산'); expect(l[2].text).toContain('95,100');
    expect(STORY.lossRun({ sum: 31_000, spins: null, cash: 9_000, claim: 15_500 })[1].text).toContain('이번 정산에 15,500 필요한데');
    for (const x of [...w, ...l]) expect(x.text).not.toMatch(/엄마|어머님/);
  });
  it('속마음: 굴린 돈이 다음 정산의 5%를 넘으면 한 번 — 숫자가 그대로 들어간다', () => {
    const base = { pnl: 100, roe: 0.2, heldSec: 50, claim: 15_500, reach: 'far' as const, peakPnl: 200, lowRoe: -1, settles: 0 };
    expect(holdBeat({ ...base, rolled: 500 }, {})).toBeNull();
    const b = holdBeat({ ...base, rolled: 1_240 }, {})!;
    expect(b.key).toBe('rolled'); expect(b.text).toContain('1,240'); expect(b.text).toContain('8%');
    expect(holdBeat({ ...base, rolled: 1_240 }, { rolled: true })).toBeNull();
  });
});

// U-42(회차 5) 화면 쪽: 장에 맞춘 출구 · 수수료가 기울인 승률(주문 줄 · 나무) · 정산 빼고 전부 · 정산 빼고 갚기 · 본장까지 남은 시간 · 연달아 이긴/진 판의 줄 · 들고 있는 동안 굴린 돈.
import { afterEach, describe, expect, it } from 'vitest';
import { A, bare, openFutures } from '../engine/helpers';
import { balance, skillById } from '../../src/engine/data';
import { forecast } from '../../src/engine/settlement';
import { acornStops, autoExit, fairOdds, keepDueMargin, maxSwing, oddsText, orderCtx, planLine, swingCount, AUTO_MIN_COUNT, AUTO_STEP } from '../../src/ui/proto/stops';
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

describe('지난 n분에 실제로 본 가장 큰 움직임 (U-42 ①)', () => {
  it('기록이 1분이 안 되면 null, 있으면 "그 폭으로 세면 한 번 이상 나오는 가장 큰 폭"', () => {
    expect(maxSwing(wave(40, 0.1))).toBeNull();
    const h = wave(600, 0.05); // 위아래 0.05% → 고저 폭 약 0.1%
    const m = maxSwing(h)!;
    expect(m).toBeGreaterThan(0.095); expect(m).toBeLessThan(0.105);
    expect(swingCount(h, m * 0.999)).toBeGreaterThanOrEqual(1);
    expect(swingCount(h, m * 1.01)).toBe(0);
  });
  it('두 번 이상 나온 폭은 한 번 나온 폭보다 크지 않다(센 그대로)', () => {
    const h = [...wave(300, 0.02), ...wave(300, 0.08)];
    const one = maxSwing(h, 1)!, two = maxSwing(h, 2)!;
    expect(two).toBeLessThanOrEqual(one);
    expect(swingCount(h, two * 0.999)).toBeGreaterThanOrEqual(2);
  });
});

describe('한 번 누르기의 출구가 장에 맞춘다 (U-42 ①)', () => {
  const claim = 15_500;
  it('상위 결정 그대로: 기준은 "한 번 이상 나온 가장 큰 폭"이고 500 단위로 내린다', () => { expect(AUTO_MIN_COUNT).toBe(1); expect(AUTO_STEP).toBe(500); });
  it('시끄러운 장(지난 10분에 이자 한 번 폭이 나왔다): 이자 한 번 치 그대로', () => {
    const a = autoExit(ctx(), claim, wave(600, 0.12)); // 고저 0.24% > 0.155%
    expect(a).toMatchObject({ net: claim, by: 'claim' });
    expect(a.why).toContain('지난 10분에 나온 폭');
  });
  it('조용한 장(가장 큰 폭 0.1%): 그 폭으로 벌 수 있는 돈으로 줄인다 — 이자 한 번 치보다 작고, 그 폭은 지난 기록에 실제로 있었다', () => {
    const h = wave(600, 0.05);
    const a = autoExit(ctx(), claim, h);
    expect(a.by).toBe('range');
    expect(a.net).toBeLessThan(claim); expect(a.net % AUTO_STEP).toBe(0);
    expect(a.net).toBeGreaterThanOrEqual(9_500); expect(a.net).toBeLessThanOrEqual(10_000); // 0.1% × 명목 1,000만 = 10,000
    expect(a.why).toBe('지난 10분 최대 폭 기준');
    const st = acornStops(ctx(), a.net, a.net);
    expect(swingCount(h, st.tpMove!)).toBeGreaterThanOrEqual(1); // 걸린 익절 폭이 지난 10분에 한 번은 나왔다
    expect(st.sl).not.toBeNull(); // 손절도 같은 크기로 걸린다(대칭, U-42 ②)
    expect(Math.abs(st.slMove!)).toBeCloseTo(st.tpMove!, 3);
  });
  it('죽은 장(폭이 거의 없다): 걸 만한 돈이 안 되면 이자 한 번 치로 두고 그렇다고 말한다', () => {
    const a = autoExit(ctx(), claim, wave(600, 0.004));
    expect(a).toMatchObject({ net: claim, by: 'flat' });
    expect(a.why).toContain('걸 만한 폭이 없었다');
  });
  it('수수료가 있으면 같은 폭으로 벌 수 있는 돈이 수수료만큼 준다', () => {
    const h = wave(600, 0.07); // 고저 0.14% → 수수료 0: 14,000 / 0.02%: 14,000 − 4,000
    const free = autoExit(ctx(0), claim, h), paid = autoExit(ctx(0.0002), claim, h);
    expect(free.by).toBe('range'); expect(paid.by).toBe('range');
    expect(free.net - paid.net).toBeGreaterThanOrEqual(3_500); expect(free.net - paid.net).toBeLessThanOrEqual(4_500);
  });
  it('아직 잰 것이 없으면(기록 1분 미만 · 주문 판이 비었다) 이자 한 번 치', () => {
    expect(autoExit(ctx(), claim, wave(30, 0.01)).by).toBe('claim');
    expect(autoExit(null, claim, wave(600, 0.01))).toMatchObject({ net: claim, by: 'claim' });
  });
});

describe('수수료가 기울인 승률 (U-42 ④)', () => {
  it('수수료 0 이면 반반(덧말 없음), 0.02% 면 37 대 63 — 주문 줄에 적힌다', () => {
    const free = acornStops(ctx(0), 15_500, 15_500), paid = acornStops(ctx(0.0002), 15_500, 15_500);
    expect(fairOdds(free)!).toBeCloseTo(0.5, 2);
    expect(oddsText(fairOdds(free))).toBeNull();
    expect(fairOdds(paid)!).toBeCloseTo(0.5 - 2000 / 15_500, 2); // 0.5 − (한쪽 수수료 ÷ 건 돈)
    expect(oddsText(fairOdds(paid))).toBe('익절 37 : 손절 63');
    expect(planLine({ tpNet: 15_500, slNet: 15_500, st: paid, hist: [] })).toContain('수수료 탓에 익절 37 : 손절 63');
    expect(planLine({ tpNet: 15_500, slNet: 15_500, st: free, hist: [] })).not.toContain('수수료 탓');
  });
  it('나무: 노드 없이 37.1% · 판당 −4,000. 단골 수수료 Lv1 → 38.1% · −3,700. 지난 사흘 반의 봉으로 센 값(36.8~38.8%)과 맞는다', () => {
    const bare0 = betOdds({}, 0.0002);
    expect(bare0.p! * 100).toBeCloseTo(37.1, 1); expect(bare0.ev).toBe(-4000); expect(bare0.ratePct).toBeCloseTo(0.02, 6);
    const a1 = betOdds({ R: 1, A1: 1 }, 0.0002);
    expect(a1.p! * 100).toBeCloseTo(38.1, 1); expect(a1.ev).toBe(-3700);
    expect(betOdds({}, 0).p!).toBeCloseTo(0.5, 3);
  });
  it('노드 설명: 수수료 노드는 지금 → 다음 승률을 적고, 그 판을 안 바꾸는 노드는 적지 않는다. 어떤 노드도 반반을 넘기지 못한다', () => {
    act1(true);
    const own = { R: 1 };
    const a1 = nodeOdds(own, 'A1', 0)!;
    expect(a1.text).toMatch(/익절 확률 37\.1% → 38\.1%\n한 판 평균 −4,000 → −3,700/);
    expect(nodeOdds(own, 'B1', 0)!.next.p!).toBeGreaterThan(a1.now.p!);
    for (const id of ['R', 'A3a', 'B2', 'B4', 'C3a', 'C4']) expect(nodeOdds(own, id, id === 'R' ? 1 : 0)).toBeNull();
    // 비상금 주머니는 보험료(+0.01%p)만큼 이 판을 더 기울인다 — 그것도 적는다
    const c2 = nodeOdds({ R: 1, C1: 1 }, 'C2', 0)!;
    expect(c2.next.p!).toBeLessThan(c2.now.p!);
    // 전부 100레벨씩 올려도 반반에는 못 미친다(수수료는 0이 되지 않는다)
    const all = Object.fromEntries(Object.keys(skillById).filter((k) => k !== 'C2' && k !== 'A3a' && k !== 'B3b' && k !== 'C3a').map((k) => [k, 100]));
    expect(betOdds(all).p!).toBeLessThan(0.5);
    expect(treeOddsLine(own)).toMatch(/수수료 0\.02%\. 「이자 한 번 걸기」\(5만, 200배\)는 익절 37 : 손절 63/);
    expect(treeOddsLine({ R: 1, A1: 5, B1: 5 })).toMatch(/익절 42 : 손절 58 \(나무 없이는 37 : 63\)/);
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
    expect(w.map((x) => x.who)).toEqual(['weasel', 'boss', 'collector', 'hero']);
    expect(w[1].text).toContain('+31,402'); // U-44: 금박 도장 몇 %는 장부가 보여 준다(대사에서 뺐다)
    expect(l[0].text).toContain('−31,000'); expect(l[1].text).toContain('7정산'); expect(l[3].text).toContain('95,100');
    expect(STORY.lossRun({ sum: 31_000, spins: null, cash: 9_000, claim: 15_500 })[3].text).toContain('15,500에 모자란다');
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

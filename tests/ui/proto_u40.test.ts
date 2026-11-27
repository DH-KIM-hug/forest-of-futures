// U-40(회차 3) 화면 쪽: 본장 시간과 "장 마감 · 조용함", 종목마다 출렁임, 코인 로고, 오픈 기념 딱지, 돌려 쓰는 줄.
import { describe, expect, it } from 'vitest';
import { allQuiet, feeEventChip, feeSaved, liveliest, LIVELY_PCT, QUIET_PCT, sessionHoursKst, sessionOf, sessionOpen, SESSIONS, swingOf, swingText } from '../../src/ui/proto/market';
import { COIN_LOGO, coinImgHtml, coinLogo } from '../../src/ui/proto/coins';
import { marketDefs } from '../../src/engine/data';
import { holdBeat, recentRange, type HoldSnap } from '../../src/ui/proto/tension';
import { settleRemark, tradeReaction } from '../../src/ui/proto/react';
import { STORY } from '../../src/ui/proto/text';
import { liveHistoryOf, historyOf, prependHistory, pushPrices, resetHistory } from '../../src/ui/priceHistory';
import { SAVINGS_STEPS, savingsStep } from '../../src/ui/proto/watch';
import sources from '../../server/config/sources.json';

/** 한국 시간으로 적은 때 */
const kst = (s: string) => new Date(s + '+09:00');

describe('본장 시간 (삼솔전자 = 서울, 잣스닥 = 뉴욕)', () => {
  it('시세 출처와 맞는다: 삼솔전자 = 삼성전자, 잣스닥 = 나스닥 100. 코인 셋에는 본장이 없다', () => {
    expect(sources.primary.coins.SMS).toBe('xyz:SMSN');
    expect(sources.primary.coins.IDX_NDX).toBe('xyz:XYZ100');
    expect(Object.keys(SESSIONS).sort()).toEqual(['JQQ', 'SMS']);
    for (const id of ['DTC', 'BTH', 'MDT']) { expect(sessionOpen(id, kst('2026-11-25T10:00'))).toBeNull(); expect(sessionOf(id, kst('2026-11-25T10:00'), 0)).toBeNull(); }
  });
  it('삼솔전자: 평일 09:00~15:30(한국 시간)', () => {
    expect(sessionHoursKst('SMS', kst('2026-11-25T10:00'))).toBe('09:00~15:30');
    expect(sessionOpen('SMS', kst('2026-11-25T08:59'))).toBe(false);
    expect(sessionOpen('SMS', kst('2026-11-25T09:00'))).toBe(true);
    expect(sessionOpen('SMS', kst('2026-11-25T15:29'))).toBe(true);
    expect(sessionOpen('SMS', kst('2026-11-25T15:30'))).toBe(false);
    expect(sessionOpen('SMS', kst('2026-11-28T10:00'))).toBe(false); // 토요일
  });
  it('잣스닥: 겨울 23:30~06:00, 미국 여름 시간에는 22:30~05:00. 한국의 토요일 새벽은 뉴욕의 금요일 장이다', () => {
    expect(sessionHoursKst('JQQ', kst('2026-11-25T12:00'))).toBe('23:30~06:00');
    expect(sessionHoursKst('JQQ', kst('2026-07-08T12:00'))).toBe('22:30~05:00');
    expect(sessionOpen('JQQ', kst('2026-11-25T23:29'))).toBe(false);
    expect(sessionOpen('JQQ', kst('2026-11-25T23:30'))).toBe(true);
    expect(sessionOpen('JQQ', kst('2026-11-26T05:59'))).toBe(true);
    expect(sessionOpen('JQQ', kst('2026-11-26T06:00'))).toBe(false);
    expect(sessionOpen('JQQ', kst('2026-07-08T22:30'))).toBe(true);
    expect(sessionOpen('JQQ', kst('2026-11-28T02:00'))).toBe(true); // 토요일 새벽 = 뉴욕 금요일 낮
    expect(sessionOpen('JQQ', kst('2026-11-30T02:00'))).toBe(false); // 월요일 새벽 = 뉴욕 일요일
  });
  it('달력과 시세를 함께 본다: 장 마감 · 조용함 / 장 마감인데 움직인다 / 장중 / 장중인데 조용함(휴장인 듯)', () => {
    const night = kst('2026-11-25T20:00'), day = kst('2026-11-25T10:00');
    expect(sessionOf('SMS', night, 0)).toMatchObject({ state: 'closed', badge: '장 마감', open: false, quiet: true, hours: '09:00~15:30' });
    expect(sessionOf('SMS', night, 0)!.text).toBe('본장 마감 (본장 09:00~15:30)');
    expect(sessionOf('SMS', night, 0.2)).toMatchObject({ state: 'after', badge: null }); // 실제로 미국 장 시간에는 움직인다(회차 3 실측)
    expect(sessionOf('SMS', day, 0.2)).toMatchObject({ state: 'open', badge: null });
    expect(sessionOf('SMS', day, 0)).toMatchObject({ state: 'holiday', badge: '휴장?' });
    // 추수감사절 밤(2026-11-26 목, 뉴욕 휴장): 달력으로는 장중인데 시세가 안 움직인다
    expect(sessionOf('JQQ', kst('2026-11-27T00:45'), 0.004)!.state).toBe('holiday');
    // 아직 못 쟀으면 달력만 믿는다
    expect(sessionOf('JQQ', night, null)!.state).toBe('closed');
    expect(sessionOf('JQQ', kst('2026-11-26T01:00'), null)!.state).toBe('open');
  });
});

describe('종목마다 출렁임', () => {
  it('지난 1분 폭 → 재는 중 · 조용 · 잔잔 · 출렁', () => {
    expect(swingOf(null)).toBe('wait');
    expect(swingOf(0)).toBe('still');
    expect(swingOf(QUIET_PCT)).toBe('calm');
    expect(swingOf(LIVELY_PCT)).toBe('lively');
    expect(swingText(null)).toBe('재는 중');
    expect(swingText(0.0312)).toBe('1분 0.03%');
    expect(swingText(0.31)).toBe('1분 0.3%');
  });
  it('가장 출렁이는 종목은 조용하지 않을 때만 고른다. 셋 이상 재서 전부 조용하면 "다 조용하다"', () => {
    expect(liveliest([{ id: 'DTC', r: 0.01 }, { id: 'BTH', r: 0.005 }])).toBeNull();
    expect(liveliest([{ id: 'DTC', r: 0.05 }, { id: 'BTH', r: 0.09 }, { id: 'SMS', r: null }])).toEqual({ id: 'BTH', r: 0.09 });
    expect(allQuiet([0.001, 0.01, 0, null, null])).toBe(true);
    expect(allQuiet([0.001, 0.01, 0.05])).toBe(false);
    expect(allQuiet([0.001, null, null, null, null])).toBe(false); // 아직 모른다
  });
  it('안 움직이는 시세에서도 셈이 깨지지 않는다(폭 0)', () => {
    expect(recentRange(new Array(60).fill(78.5))).toBe(0);
    expect(swingOf(recentRange(new Array(60).fill(78.5)))).toBe('still');
  });
  it('출렁임은 실시간으로 쌓인 값으로만 잰다: 시작할 때의 값과 봉으로 복원한 값은 섞이지 않는다', () => {
    resetHistory();
    pushPrices({ DTC: 70000 }, 0, true); // 씨앗(저장된 값)
    expect(liveHistoryOf('DTC')).toEqual([]);
    for (let i = 1; i <= 12; i++) pushPrices({ DTC: 68000 + i }, i);
    prependHistory({ DTC: [60000, 61000, 75000] }); // 분 봉에서 복원한 지난 값(폭이 크다)
    expect(historyOf('DTC').slice(0, 3)).toEqual([60000, 61000, 75000]);
    expect(historyOf('DTC')).not.toContain(70000); // 씨앗은 차트에서도 빠진다
    expect(liveHistoryOf('DTC')).toHaveLength(12);
    expect(recentRange(liveHistoryOf('DTC'))!).toBeLessThan(0.02);
    expect(recentRange(historyOf('DTC'))!).toBeGreaterThan(10);
    resetHistory();
  });
});

describe('코인 로고', () => {
  it('거래되는 종목 다섯에 전부 로고가 있다(도토코인 · 밤더리움 · 삼솔전자 · 멍도토 · 잣스닥)', () => {
    const ids = marketDefs.filter((m) => m.tradable).map((m) => m.id);
    expect(ids.sort()).toEqual(['BTH', 'DTC', 'JQQ', 'MDT', 'SMS']);
    for (const id of ids) { expect(coinLogo(id), id).toMatch(/\.webp/); expect(coinImgHtml(id, 20)).toContain('width="20"'); }
    expect(new Set(Object.values(COIN_LOGO)).size).toBe(5); // 다섯이 서로 다른 그림이다
    expect(coinLogo('NOPE')).toBeNull();
    expect(coinImgHtml('NOPE')).toBeNull();
  });
});

describe('오픈 기념 딱지와 대사', () => {
  it('주문 판의 딱지: 남은 정산 수, 끝나면 지금 수수료율', () => {
    expect(feeEventChip(20, 0)).toEqual({ on: true, text: '오픈 기념 수수료 무료, 정산 20번 남음' });
    expect(feeEventChip(1, 0).text).toContain('정산 1번 남음');
    expect(feeEventChip(0, 0.02)).toEqual({ on: false, text: '거래 수수료 0.02%' });
    expect(feeEventChip(0, 0.0072).text).toBe('거래 수수료 0.007%');
  });
  it('아낀 수수료 = 이벤트 동안 오간 크기 × 끝난 뒤 수수료율 × 2', () => {
    expect(feeSaved(2_500_000, 0.0002)).toBe(1000);
    expect(feeSaved(0, 0.0002)).toBe(0);
  });
  it('끝나는 장면은 실제 숫자를 말한다', () => {
    const t = STORY.feeEventEnd({ ratePct: 0.02, trades: 7, saved: 12_400, lev: 200 }).map((l) => l.text).join(' ');
    expect(t).toContain('0.02%');
    expect(t).toContain('7건');
    expect(t).toContain('12,400');
    expect(t).toContain('200배로 거래하면 수수료는 넣은 돈의 4%예요');
    expect(STORY.feeEventEnd({ ratePct: 0.02, trades: 0, saved: 0, lev: 50 })[1].text).toContain('이용 0건');
    expect(STORY.feeEventSms({ left: 20, reborn: false })[0]).toMatchObject({ who: 'sms' });
    expect(STORY.feeEventSms({ left: 20, reborn: false })[0].text).toContain('정산 20번');
  });
});

describe('되풀이되지 않는 줄', () => {
  const snap: HoldSnap = { pnl: -100, roe: -1, heldSec: 90, claim: 15000, reach: 'far', peakPnl: 0, lowRoe: -1, settles: 0 };
  it('속마음은 포지션 순번으로 번갈아 나온다. 첫 줄은 회차 2 그대로', () => {
    const a = holdBeat(snap, {}, 0)!, b = holdBeat(snap, {}, 1)!, c = holdBeat(snap, {}, 2)!;
    expect(a.text).toBe('값은 그대론데 수수료만 나갔다.');
    expect(new Set([a.text, b.text, c.text]).size).toBe(2); // U-44: 겹치는 줄은 덜어 냈다(두 줄이 번갈아)
    expect(holdBeat(snap, {}, 2)!.text).toBe(a.text);
    expect(a.key).toBe(b.key);
  });
  it('수수료가 무료인 판에서는 "수수료만 냈다"고 말하지 않는다', () => {
    for (const k of [0, 1, 2]) expect(holdBeat({ ...snap, feesPaid: 0 }, {}, k)!.text).not.toMatch(/수수료만|수수료는 이미|돈은 줄었다/);
    expect(holdBeat({ ...snap, feesPaid: 120 }, {}, 0)!.text).toBe('값은 그대론데 수수료만 나갔다.');
  });
  it('청산 반응도 무료일 때는 수수료를 벌었다고 하지 않는다. 본전 세 판은 낸 수수료가 있을 때만 수수료 얘기', () => {
    const ctx = { claim: 15000, wheelNet: 3000, cashAfter: 50000, liqs: 1, winStreak: 0, lossStreak: 0, tinyStreak: 0, feesLife: 0, seen: {} };
    const t = { pnl: -30000, margin: 30000, lev: 50, liq: true, heldSec: 40, fundedBy: null, allIn: false };
    expect(tradeReaction(t, { ...ctx, feeFree: true })!.lines[0]).toContain('수수료도 없었어요');
    expect(tradeReaction(t, ctx)!.lines[0]).toContain('수수료도 나갔어요');
    const flat = { ...t, pnl: 0, liq: false };
    expect(tradeReaction(flat, { ...ctx, tinyStreak: 3, feesLife: 0, feeFree: true })!.key).toBe('flatFree');
    expect(tradeReaction(flat, { ...ctx, tinyStreak: 3, feesLife: 2400 })!.key).toBe('feeBleed');
  });
  it('정산 알림도 번갈아 쓴다', () => {
    const c = { interest: 14500, other: 0, net: 3000, cashAfter: 90000, nextClaim: 15500, nextNet: 3000, overdue: false, posOpen: false, negStreak: 0, firstPositive: false };
    const lines = [0, 1, 2].map((nth) => settleRemark({ ...c, nth }));
    expect(new Set(lines).size).toBe(3);
    expect(settleRemark(c)).toBe(lines[0]);
    for (const l of lines) expect(l).toMatch(/^추심원: .*이자 14,500/);
  });
});

describe('빚 없는 생의 모은 돈 고비', () => {
  it('10만 → 30만 → 100만, 본 것은 건너뛴다', () => {
    expect(SAVINGS_STEPS).toEqual([100_000, 300_000, 1_000_000]);
    expect(savingsStep({})).toBe(0);
    expect(savingsStep({ savings0: true })).toBe(1);
    expect(savingsStep({ savings0: true, savings1: true, savings2: true })).toBe(3);
    for (const k of [0, 1, 2]) expect(STORY.savings(k).length).toBeGreaterThan(0);
  });
});

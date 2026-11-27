// U-45 전광판(랭킹): 제출 기록 만들기(roe · pnl · 시각), "실제 시세 · 튜토리얼 아닌 이긴 거래만" 거르기, 한 생 재산 셈, 보내기 줄(재시도 · 10초 제한 · 거절).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  backoffMs, cleanName, detailText, eligible, emptyQueue, enqueue, holdText, isWinningEntry, lifeDetail, lifeNetWorth, lifeTrades, MIN_INTERVAL_MS, newDeviceId, pumpOnce, tradeDetail, valueText,
  type ClosedTrade, type QueueState, type Sender, type TradeDetail,
} from '../../src/ui/proto/rankingCore';
import { __rankState, __resetRankingForTest, observe, rankNetWorth } from '../../src/ui/proto/ranking';
import { checkLifeShape, checkTradeShape } from '../../ranking/src/verify';
import { createGame, clone, stepMut } from '../../src/engine/game';
import { buildScenario } from '../../src/ui/dev';
import { useProto } from '../../src/ui/proto/protoStore';
import type { NetInfo } from '../../src/store/gameStore';

const T0 = 1_760_000_000_000;
const win = (o: Partial<ClosedTrade> = {}): ClosedTrade => ({
  market: 'DTC', dir: 1, lev: 50, margin0: 10_000, pnl: 1234.4,
  open: { entryTs: T0, real: true, tutorial: false }, exitTs: T0 + 180_000, realAtExit: true, tutorialAtExit: false, ...o,
});

describe('U-45 거래 기록: 서버 모양 그대로', () => {
  it('pnl 은 반올림, roe 는 그 pnl ÷ 증거금 × 100(결과 카드와 같은 셈), 시각은 진입 · 정리 벽시계', () => {
    const d = tradeDetail(win());
    expect(d).toEqual({ market: 'DTC', dir: 1, lev: 50, margin: 10_000, entryTs: T0, exitTs: T0 + 180_000, roe: 12.34, pnl: 1234 });
    // 서버의 모양 검사를 그대로 통과한다(pnl ≈ margin × roe / 100, value = roe · pnl)
    expect(checkTradeShape(d, 'roe', d.roe, T0 + 200_000)).toBeNull();
    expect(checkTradeShape(d, 'pnl', d.pnl, T0 + 200_000)).toBeNull();
  });
  it('숏 · 큰 배율도 같은 셈', () => {
    const d = tradeDetail(win({ dir: -1, lev: 200, margin0: 3333, pnl: 9999.6 }));
    expect(d.roe).toBeCloseTo((10_000 / 3333) * 100, 9);
    expect(checkTradeShape(d, 'roe', d.roe, T0 + 200_000)).toBeNull();
  });
});

describe('U-45 올려도 되는 거래: 실제 시세 · 튜토리얼 아님 · 이긴 것', () => {
  it('실제 시세로 이긴 거래만 거래 판에 간다', () => {
    expect(isWinningEntry(win())).toBe(true);
    expect(isWinningEntry(win({ pnl: -500 }))).toBe(false); // 진 거래(생의 목록에는 들어간다)
    expect(eligible(win({ pnl: -500 }))).toBe(true);
    expect(isWinningEntry(win({ pnl: 0.3 }))).toBe(false); // 반올림하면 0
  });
  it('연습 시세 · 튜토리얼 · 진입 시각을 모르는 거래는 빠진다', () => {
    expect(eligible(win({ open: { entryTs: T0, real: false, tutorial: false } }))).toBe(false);
    expect(eligible(win({ realAtExit: false }))).toBe(false);
    expect(eligible(win({ open: { entryTs: T0, real: true, tutorial: true } }))).toBe(false);
    expect(eligible(win({ tutorialAtExit: true }))).toBe(false);
    expect(eligible(win({ open: null }))).toBe(false);
    expect(eligible(win({ market: 'XXX' }))).toBe(false);
    expect(eligible(win({ exitTs: T0 }))).toBe(false);
  });
});

describe('U-45 한 생 재산', () => {
  it('현금 + 지갑 + 포지션 증거금 − 빚(설비 · 집 평가액은 넣지 않는다)', () => {
    expect(lifeNetWorth({ cash: 420_000, wallet: 1_500.7, positionsMargin: 20_000, debt: 300_000 })).toBe(141_500);
    expect(lifeNetWorth({ cash: 0, wallet: 0, positionsMargin: 0, debt: 300_000 })).toBe(-300_000);
  });
  it('게임 상태에서: 새 판은 −30만(엄마 빚)', () => {
    const g = createGame({ seed: 3, prices: { DTC: 1, BTH: 1, SMS: 1, MDT: 1, JQQ: 1 } });
    expect(rankNetWorth(g)).toBe(Math.floor(g.run.cash - 300_000));
  });
  it('생의 거래 목록: 이긴 것 먼저, 600개까지(U-47: 종목 여섯 · 정산 60초), 봉을 못 받는 오래된 이긴 거래는 뺀다', () => {
    const mk = (i: number, pnl: number, ago = 0): TradeDetail => ({ market: 'DTC', dir: 1, lev: 10, margin: 1000, entryTs: T0 - ago, exitTs: T0 - ago + 60_000, roe: pnl / 10, pnl });
    const all = [...Array.from({ length: 400 }, (_, i) => mk(i, -50)), ...Array.from({ length: 300 }, (_, i) => mk(i, 10 + i))];
    const out = lifeTrades(all);
    expect(out.length).toBe(600);
    expect(out.slice(0, 300).every((t) => t.pnl > 0)).toBe(true);
    expect(out[0].pnl).toBe(309);
    const old = lifeTrades([mk(0, 100, 6 * 24 * 3600e3), mk(1, 50)]);
    expect(old.map((t) => t.pnl)).toEqual([50]);
    const d = lifeDetail(2, 14, 123_456.9, all.slice(0, 3));
    expect(d).toMatchObject({ lifeNo: 2, settles: 14, peak: 123_456 });
    expect(checkLifeShape(d, d.peak, T0 + 100_000)).toBeNull();
  });
});

describe('U-45 보내기 줄: 판마다 하나, 10초 제한, 재시도, 거절은 조용히', () => {
  const who = { deviceId: 'smoketest_unit00', name: '시험' };
  const D = tradeDetail(win());
  let q: QueueState;
  let t: number;
  const now = () => t;
  const replies = (...rs: ({ status: number; body: any } | Error)[]) => {
    const calls: any[] = [];
    const s: Sender = async (b) => { calls.push(b); const r = rs.shift(); if (!r || r instanceof Error) throw r ?? new Error('net'); return r; };
    return { s, calls };
  };
  beforeEach(() => { q = emptyQueue(); t = T0; });

  it('같은 판은 더 좋은 것 하나만 기다린다 · 이미 받은 최고보다 못하면 넣지 않는다', () => {
    expect(enqueue(q, 'roe', 10, D, t)).toBe(true);
    expect(enqueue(q, 'roe', 8, D, t)).toBe(false);
    expect(enqueue(q, 'roe', 12, D, t)).toBe(true);
    expect(enqueue(q, 'pnl', 1000, D, t)).toBe(true);
    expect(q.items.map((x) => [x.board, x.value])).toEqual([['roe', 12], ['pnl', 1000]]);
    q.best.networth = 50_000;
    expect(enqueue(q, 'networth', 40_000, D, t)).toBe(false);
    expect(enqueue(q, 'networth', Number.NaN, D, t)).toBe(false);
  });

  it('받으면 줄에서 빠지고 순위를 기억한다 · 다음 것은 10초 뒤에', async () => {
    enqueue(q, 'roe', 12.34, D, t); enqueue(q, 'pnl', 1234, D, t);
    const { s, calls } = replies({ status: 200, body: { ok: true, rank: 3 } }, { status: 200, body: { ok: true, kept: true, best: 5000 } });
    const a = await pumpOnce(q, s, who, now);
    expect(a).toMatchObject({ kind: 'ok', board: 'roe', rank: 3, prevRank: null, kept: false });
    expect(calls[0]).toMatchObject({ deviceId: who.deviceId, name: '시험', board: 'roe', value: 12.34 });
    expect(q.best.roe).toBe(12.34);
    expect(q.rank.roe).toBe(3);
    const b = await pumpOnce(q, s, who, now);
    expect(b.kind).toBe('wait');
    expect((b as any).ms).toBe(MIN_INTERVAL_MS);
    t += MIN_INTERVAL_MS;
    const c = await pumpOnce(q, s, who, now);
    expect(c).toMatchObject({ kind: 'ok', board: 'pnl', kept: true });
    expect(q.best.pnl).toBe(5000); // 서버에 이미 더 좋은 기록이 있었다
    expect(q.items.length).toBe(0);
    expect(calls.length).toBe(2);
    expect((await pumpOnce(q, s, who, now)).kind).toBe('idle');
  });

  it('429(너무 빨리) → 그대로 10초 뒤 다시', async () => {
    enqueue(q, 'roe', 5, D, t);
    const { s } = replies({ status: 429, body: { ok: false, why: 'tooSoon' } }, { status: 200, body: { ok: true, rank: 9 } });
    expect((await pumpOnce(q, s, who, now)).kind).toBe('retry');
    expect(q.items[0].tries).toBe(0);
    t += 5000;
    expect((await pumpOnce(q, s, who, now)).kind).toBe('wait');
    t += MIN_INTERVAL_MS;
    expect((await pumpOnce(q, s, who, now))).toMatchObject({ kind: 'ok', rank: 9 });
  });

  it('그물이 끊기면(fetch 가 던진다 · 5xx) 점점 길게 기다렸다 다시, 12번이면 버린다', async () => {
    enqueue(q, 'pnl', 77, D, t);
    const { s } = replies(new Error('offline'), { status: 503, body: null });
    const a = await pumpOnce(q, s, who, now);
    expect(a).toMatchObject({ kind: 'retry', ms: backoffMs(1) });
    expect(q.items[0].nextAt).toBe(t + 15_000);
    t += 15_000;
    const b = await pumpOnce(q, s, who, now);
    expect(b).toMatchObject({ kind: 'retry', ms: 30_000 });
    expect(backoffMs(20)).toBe(600_000);
    q.items[0].tries = 11; t += 30_000;
    const c = await pumpOnce(q, () => Promise.reject(new Error('x')), who, now);
    expect(c).toMatchObject({ kind: 'rejected', why: 'gaveUp' });
    expect(q.items.length).toBe(0);
  });

  it('거절(422 · 400)은 줄에서 빼고 조용히 적어 둔다(이름 고치기용 다시 보내기는 세지 않는다)', async () => {
    enqueue(q, 'roe', 999, D, t);
    const { s } = replies({ status: 422, body: { ok: false, why: 'roeTooHigh(999 > 30)' } });
    expect(await pumpOnce(q, s, who, now)).toMatchObject({ kind: 'rejected', why: 'roeTooHigh(999 > 30)' });
    expect(q.rejected.length).toBe(1);
    expect(q.items.length).toBe(0);
    q.items.push({ board: 'pnl', value: 1, detail: D, tries: 0, nextAt: 0, at: 0, rename: true });
    t += MIN_INTERVAL_MS;
    await pumpOnce(q, async () => ({ status: 422, body: { why: 'noCandles' } }), who, now);
    expect(q.rejected.length).toBe(1);
  });
});

describe('U-45 게임을 지켜보며 기록한다(observe)', () => {
  const live: NetInfo = { source: 'hl', conn: 'open', market: 'open', stale: false, everConnected: true, away: null };
  const sim: NetInfo = { ...live, source: 'sim', conn: 'local' };
  const sent: any[] = [];
  beforeEach(() => { sent.length = 0; __resetRankingForTest(async (b) => { sent.push(b); return { status: 200, body: { ok: true, rank: 1 } }; }); useProto.getState().patch({ tutorial: 'done' }); });
  const base = () => buildScenario('trade', createGame({ seed: 7, prices: { DTC: 100, BTH: 100, SMS: 100, MDT: 100, JQQ: 100 } }));
  const openThenWin = (net: NetInfo, netClose = net, tut: 'done' | 'run' = 'done') => {
    const g0 = base();
    const g1 = clone(g0);
    expect(stepMut(g1, { type: 'action', action: { type: 'open', market: 'DTC', dir: 1, lev: 25, marginPct: 25, sl: null, tp: null } }).ok).toBe(true);
    if (tut !== 'done') useProto.getState().patch({ tutorial: 'await' });
    observe(g0, g1, net, T0);
    if (tut !== 'done') useProto.getState().patch({ tutorial: tut });
    const g2 = clone(g1);
    g2.run.prices.DTC = g1.run.positions.DTC.entry * 1.01; // +1% × 25배
    expect(stepMut(g2, { type: 'action', action: { type: 'close', market: 'DTC' } }).ok).toBe(true);
    observe(g1, g2, netClose, T0 + 95_000);
    return { g1, g2 };
  };

  it('실제 시세로 이긴 거래: 수익률 · 수익금 판에 진입 · 정리 시각과 함께 들어간다', () => {
    const { g1 } = openThenWin(live);
    const { queue, life } = __rankState();
    expect(queue.items.map((x) => x.board).sort()).toEqual(['pnl', 'roe']);
    const d = queue.items[0].detail as TradeDetail;
    expect(d).toMatchObject({ market: 'DTC', dir: 1, lev: 25, margin: g1.run.positions.DTC.margin0, entryTs: T0, exitTs: T0 + 95_000 });
    expect(d.pnl).toBeGreaterThan(0);
    expect(d.roe).toBeCloseTo((d.pnl / d.margin) * 100, 9);
    expect(d.roe).toBeLessThan(25 * (1 + 0.15)); // 배율 × (실제 폭 1% + 여유) 아래
    expect(life!.trades.length).toBe(1);
    expect(life!.tainted).toBe(false);
  });
  it('연습 시세(&feed=sim)면 아무것도 줄에 들어가지 않고, 그 생의 재산도 섞인 것으로 친다', () => {
    openThenWin(sim);
    expect(__rankState().queue.items.length).toBe(0);
    expect(__rankState().life!.trades.length).toBe(0);
    expect(__rankState().life!.tainted).toBe(true);
  });
  it('들고 있는 사이 연습 시세로 내려갔으면 빠진다', () => {
    openThenWin(live, { ...live, fallback: true });
    expect(__rankState().queue.items.length).toBe(0);
  });
  it('튜토리얼 거래(짜 둔 시세)는 어디에도 들어가지 않는다(생도 섞이지 않는다)', () => {
    openThenWin(live, live, 'run');
    expect(__rankState().queue.items.length).toBe(0);
    expect(__rankState().life!.trades.length).toBe(0);
    expect(__rankState().life!.tainted).toBe(false);
  });
  it('정산 때 이번 생 최고 재산이 0 을 넘으면 재산 판에 넣는다(5번에 한 번까지), 생이 끝나면 한 번 더', () => {
    const g0 = base();
    g0.run.cash = 500_000; // 빚 30만을 넘는 현금
    const g1 = clone(g0); g1.run.settleNo += 1;
    observe(g0, g1, live, T0);
    const q1 = __rankState().queue.items.filter((x) => x.board === 'networth');
    expect(q1.length).toBe(1);
    expect(q1[0].value).toBe(rankNetWorth(g1));
    expect(q1[0].detail).toMatchObject({ lifeNo: 1, settles: g1.run.settleNo, peak: rankNetWorth(g1) });
    // 바로 다음 정산에 더 올라도 5번이 지나기 전에는 넣지 않는다
    __rankState().queue.items.length = 0;
    const g2 = clone(g1); g2.run.settleNo += 1; g2.run.cash += 10_000;
    observe(g1, g2, live, T0 + 1000);
    expect(__rankState().queue.items.length).toBe(0);
    expect(__rankState().life!.peak).toBe(rankNetWorth(g2));
    // 생이 끝났다: 최고 재산을 넣는다
    const g3 = clone(g2); g3.run.over = true;
    observe(g2, g3, live, T0 + 2000);
    expect(__rankState().queue.items.map((x) => [x.board, x.value])).toEqual([['networth', rankNetWorth(g2)]]);
  });
  it('재산이 0 이하(빚이 더 많다)면 넣지 않는다', () => {
    const g0 = base(); g0.run.cash = 1000;
    const g1 = clone(g0); g1.run.settleNo += 1; g1.run.over = true;
    observe(g0, g1, live, T0);
    expect(__rankState().queue.items.length).toBe(0);
  });
});

describe('U-45 글', () => {
  it('줄 아래 작은 글 · 값', () => {
    const name = (id: string) => ({ DTC: '도토코인' } as Record<string, string>)[id] ?? id;
    expect(detailText('roe', { market: 'DTC', lev: 200, dir: 1, entryTs: 0, exitTs: 180_000 }, name)).toBe('도토코인 200배 롱 3분');
    expect(detailText('pnl', { market: 'DTC', lev: 25, dir: -1, entryTs: 0, exitTs: 42_000 }, name)).toBe('도토코인 25배 숏 42초');
    expect(detailText('networth', { lifeNo: 3, settles: 41 }, name)).toBe('3번째 생 정산 41번');
    expect(holdText(3 * 3600e3 + 5 * 60e3)).toBe('3시간 5분');
    expect(valueText('roe', 123.456)).toBe('+123.5%');
    expect(valueText('pnl', 1234567)).toBe('1,234,567');
    for (const b of ['roe', 'pnl', 'networth'] as const) expect(detailText(b, b === 'networth' ? { lifeNo: 1, settles: 1 } : { market: 'DTC', lev: 1, dir: 1, entryTs: 0, exitTs: 1 }, name)).not.toContain('·');
  });
  it('이름 1~12글자 · 기기 번호는 서버가 받는 모양', () => {
    expect(cleanName('  도토리부자 ')).toBe('도토리부자');
    expect(cleanName('')).toBeNull();
    expect(cleanName('가'.repeat(13))).toBeNull();
    expect(cleanName('<b>x</b>')).toBe('bx/b');
    expect(newDeviceId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});

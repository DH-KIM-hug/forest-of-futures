// U-55 시제품 저장: 키(주소 값), 봉투 왕복, 버전, 저장해도 되는 순간, 떠난 사이 메우기(연습 시세, 실시간 시세의 이어 가기).
import { describe, expect, it } from 'vitest';
import { createGame, stepMut } from '../../src/engine/game';
import { SimFeed } from '../../src/engine/feed/simFeed';
import { HlDirectFeed } from '../../src/net/hlDirect/feed';
import { COINS } from '../../src/net/hlDirect/config';
import { marketDefs } from '../../src/engine/data';
import {
  AWAY_REPORT_MIN, PROTO_KEEP, PROTO_SAVE_VERSION, canSaveNow, pack, pickProto, protoSaveKey, simCatchUp, unpack,
} from '../../src/ui/proto/protoSave';
import type { GameState } from '../../src/engine/types';
import type { Bar } from '../../src/engine/feed/types';

const sim = new SimFeed(7);
const pricesOf = (t: ReturnType<SimFeed['snapshot']>) => Object.fromEntries(Object.entries(t.p).map(([k, v]) => [k, v[0]]));
function midGame(): { g: GameState; feed: SimFeed } {
  const feed = new SimFeed(11);
  const g = createGame({ seed: 5, prices: pricesOf(feed.snapshot()) });
  g.run.cash = 50_000;
  g.run.futures.open = true;
  for (let i = 0; i < 30; i++) stepMut(g, { type: 'tick', tick: feed.next() });
  return { g, feed };
}
const P0 = { prologue: false, tutorial: 'done', waiting: false, forceTrade: false, scenes: [] as { choices?: unknown[] }[] };

describe('U-55 저장 키', () => {
  it('장면 건너뛰기, 다시 보기, 치트는 저장을 읽지도 쓰지도 않는다', () => {
    expect(protoSaveKey('?proto=1&pdev=mid')).toBeNull();
    expect(protoSaveKey('?proto=1&prologue=1')).toBeNull();
    expect(protoSaveKey('?proto=1&cheat=1')).toBeNull();
  });
  it('시세 출처, 빠른 정산, 자동 검증은 저마다 다른 키(실시간 시세 판과 연습 시세 판이 섞이지 않는다)', () => {
    const ks = ['?proto=1', '?proto=1&feed=sim', '?proto=1&feed=sim&fast=1', '?proto=1&feed=sim&fast=1&e2e=1', '?proto=1&prologue=0'].map(protoSaveKey);
    expect(ks[0]).toBe('fof.proto.save:hl');
    expect(ks[4]).toBe(ks[0]);
    expect(new Set(ks.slice(0, 4)).size).toBe(4);
  });
});

describe('U-55 봉투', () => {
  it('왕복: 엔진 상태, 화면 쪽 생의 기록, 주문 칸, 시세 이어 붙일 값이 그대로 돌아온다', () => {
    const { g } = midGame();
    const r = stepMut(g, { type: 'action', action: { type: 'open', market: 'DTC', dir: 1, lev: 50, margin: 10_000 } });
    expect(r.ok).toBe(true);
    const P = { tutorial: 'done', loanTaken: true, frxBest: 2, bestTrade: { pnl: 3, market: 'FLY', lev: 50, dir: 1, roe: 12 }, scenes: [{ id: 'x' }], toast: '지워질 것', burst: { k: 1 } };
    const raw = pack({ g, p: pickProto(P), trade: { market: 'DTC', lev: 50, pct: 25, sl: null, tp: null }, feed: { kind: 'sim', n: g.run.lastSeenTick, mids: {} }, now: 123_456 });
    const u = unpack(raw);
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect(u.env.v).toBe(PROTO_SAVE_VERSION);
    expect(u.env.at).toBe(123_456);
    expect(u.env.g.run.cash).toBe(g.run.cash);
    expect(Object.keys(u.env.g.run.positions)).toEqual(['DTC']);
    expect(u.env.g.run.positions.DTC.entry).toBe(g.run.positions.DTC.entry);
    expect(u.env.g.run.prices).toEqual(g.run.prices);
    expect(u.env.p).toEqual({ tutorial: 'done', loanTaken: true, frxBest: 2, bestTrade: P.bestTrade });
    expect(u.env.trade).toMatchObject({ market: 'DTC', lev: 50 });
    expect(u.env.feed).toEqual({ kind: 'sim', n: g.run.lastSeenTick, mids: {} });
  });
  it('그 순간의 것(장면, 알림, 터지는 화면, 문 앞의 추심원)은 저장하지 않는다', () => {
    for (const k of ['scenes', 'toast', 'burst', 'pops', 'waiting', 'forceTrade', 'prologue', 'away', 'collector', 'think']) expect(PROTO_KEEP as readonly string[]).not.toContain(k);
  });
  it('버전: 다른 버전은 old, 읽을 수 없는 것은 broken, 없으면 none', () => {
    const { g } = midGame();
    const ok = JSON.parse(pack({ g, p: {}, trade: null, feed: { kind: 'sim', n: 1, mids: {} }, now: 1 }));
    expect(unpack(JSON.stringify({ ...ok, v: PROTO_SAVE_VERSION + 1 }))).toEqual({ ok: false, why: 'old' });
    expect(unpack(JSON.stringify({ ...ok, v: 0 }))).toEqual({ ok: false, why: 'old' });
    expect(unpack('{ 깨진')).toEqual({ ok: false, why: 'broken' });
    expect(unpack(JSON.stringify({ ...ok, g: { run: null } }))).toEqual({ ok: false, why: 'broken' });
    expect(unpack(JSON.stringify({ ...ok, feed: null }))).toEqual({ ok: false, why: 'broken' });
    expect(unpack(null)).toEqual({ ok: false, why: 'none' });
  });
  it('엔진 상태의 모자란 칸은 기본값으로 채운다(engine/save.ts migrate)', () => {
    const { g } = midGame();
    const x = JSON.parse(pack({ g, p: {}, trade: null, feed: { kind: 'sim', n: 1, mids: {} }, now: 1 }));
    delete x.g.run.view;
    const u = unpack(JSON.stringify(x));
    expect(u.ok && u.env.g.run.view).toBeTruthy();
  });
});

describe('U-55 저장해도 되는 순간', () => {
  it('첫 생의 튜토리얼 동안, 프롤로그, 문 앞의 추심원, 폰이 울린 동안, 고르는 장면이 떠 있으면 쓰지 않는다', () => {
    const { g } = midGame();
    expect(canSaveNow(g, P0, 1)).toBe(true);
    expect(canSaveNow(g, { ...P0, tutorial: 'run' }, 1)).toBe(false);
    expect(canSaveNow(g, { ...P0, tutorial: 'none' }, 1)).toBe(false);
    expect(canSaveNow(g, { ...P0, tutorial: 'none' }, 2)).toBe(true);
    expect(canSaveNow(g, { ...P0, prologue: true }, 2)).toBe(false);
    expect(canSaveNow(g, { ...P0, waiting: true }, 2)).toBe(false);
    expect(canSaveNow(g, { ...P0, forceTrade: true }, 1)).toBe(false);
    expect(canSaveNow(g, { ...P0, scenes: [{ choices: [1] }] }, 1)).toBe(false);
    expect(canSaveNow(g, { ...P0, scenes: [{}] }, 1)).toBe(true);
  });
  it('생이 끝난 판(엔딩 카드)은 고르는 장면이 있어도 쓴다: 새로 고쳐 파산을 되돌리지 못한다', () => {
    const { g } = midGame();
    g.run.over = true;
    expect(canSaveNow(g, { ...P0, scenes: [{ choices: [1] }] }, 1)).toBe(true);
  });
});

describe('U-55 떠난 사이 메우기(연습 시세)', () => {
  it('짧게(1분 안) 비웠으면 보고서 없이 그만큼 틱을 돌린다', () => {
    const { g, feed } = midGame();
    const t0 = g.run.tick;
    const left0 = g.run.settleIn, settle0 = g.run.settleNo;
    expect(simCatchUp(g, () => feed.next(), AWAY_REPORT_MIN - 5)).toBeNull();
    expect(g.run.tick).toBe(t0 + AWAY_REPORT_MIN - 5);
    expect([g.run.settleNo, g.run.settleIn]).toEqual([settle0, left0]); // U-58: 그 틱도 정산 시계를 멈춘 채
  });
  it('저장에서 이어 간 뒤 오래 비웠으면 엔진 따라잡기: 정산은 멈춘 채(U-58), 열린 포지션은 봉마다 움직이고, 보고서 한 장', () => {
    const { g, feed } = midGame();
    const o = stepMut(g, { type: 'action', action: { type: 'open', market: 'DTC', dir: 1, lev: 50, margin: 10_000 } }); expect(o).toMatchObject({ ok: true });
    expect(g.run.positions.DTC).toBeTruthy();
    // 저장 → 읽기 → 새 연습 시세를 저장된 값과 틱 번호에 맞춘다(gameStore simResume 과 같은 길)
    const u = unpack(pack({ g, p: {}, trade: null, feed: { kind: 'sim', n: g.run.lastSeenTick, mids: {} }, now: 0 }));
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    const g2 = u.env.g;
    const f2 = new SimFeed(99);
    f2.rebase(g2.run.prices, u.env.feed.n);
    expect(f2.snapshot().p.DTC[0]).toBe(g2.run.prices.DTC);
    const settle0 = g2.run.settleNo, left0 = g2.run.settleIn, debts0 = JSON.stringify(g2.run.debts);
    const r = simCatchUp(g2, () => f2.next(), 3 * 3600);
    expect(r).not.toBeNull();
    expect(r!.awaySec).toBe(3 * 3600);
    expect(r!.economySettlements).toBe(0);
    expect(g2.run.settleNo).toBe(settle0);
    expect(g2.run.settleIn).toBe(left0);
    expect(JSON.stringify(g2.run.debts)).toBe(debts0);
    expect(r!.openAtLeave.map((p) => p.market)).toEqual(['DTC']);
    // 50배는 세 시간 연습 시세를 못 버틴다: 봉 안에서 청산되어 보고서에 적힌다
    expect(g2.run.positions.DTC).toBeUndefined();
    expect(r!.entries.some((e) => e.kind === 'liq' || e.kind === 'sl' || e.kind === 'tp')).toBe(true);
    expect(g2.run.lastSeenTick).toBe(u.env.feed.n + 3 * 3600);
  });
  it('연습 시세는 SIM_AWAY_CAP 넘게는 돌리지 않는다(보고서의 시간은 실제 비운 시간)', () => {
    const { g, feed } = midGame();
    const n0 = g.run.lastSeenTick;
    const r = simCatchUp(g, () => feed.next(), 10 * 24 * 3600);
    expect(r!.awaySec).toBe(10 * 24 * 3600);
    expect(g.run.lastSeenTick - n0).toBe(6 * 3600);
  });
  void sim;
});

// ── 실시간 시세의 이어 가기 ──
class FakeSock {
  onopen: any = null; onmessage: any = null; onclose: any = null; onerror: any = null;
  send() {}
  close() {}
  msg(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}
const PX = { DTC: 60000, BTH: 3000, SMS: 127, MDT: 0.2, IDX_NDX: 26000 } as Record<string, number>;
describe('U-55 실시간 시세의 이어 가기', () => {
  it('첫 값이 붙으면 떠날 때의 실제 값과 지금 값의 비로 가상 가격을 옮기고, 그 사이 1분 봉을 넘긴다. 그 전의 틱은 게임에 넣지 않는다', async () => {
    let now = 1_700_000_000_000;
    const leaveN = Math.floor(now / 1000) - 3600; // 한 시간 전에 저장
    const saved: Record<string, number> = Object.fromEntries(marketDefs.map((m) => [m.id, m.startPrice * 1.5]));
    const mids: Record<string, number> = { ...PX }; // 떠날 때의 실제 값
    const posts: any[] = [];
    const socks: FakeSock[] = [];
    const feed = new HlDirectFeed({
      socketFactory: () => { const s = new FakeSock(); socks.push(s); return s as any; },
      post: async (_u, b: any) => {
        posts.push(b);
        // 1분 봉: 떠난 때부터 지금까지 값이 1.1배로 곧게 오른다
        const out = [];
        for (let t = b.req.startTime; t < b.req.endTime; t += 60_000) out.push({ t, o: 1, h: 1, l: 1, c: 1, v: 1 });
        return out.map((c: any, i: number, a: any[]) => { const key = Object.keys(COINS).find((k) => COINS[k] === b.req.coin)!; const p = (PX[key] ?? 1) * (1 + (0.1 * i) / a.length); return { ...c, o: p, h: p, l: p, c: p }; });
      },
      now: () => now,
      resume: { n: leaveN, prices: saved, mids },
    });
    expect(feed.resuming).toBe(true);
    let gap: { from: number; to: number; bars: Bar[] } | null = null;
    feed.gapHandler = (from, to, bars) => { gap = { from, to, bars }; };
    const ticks: number[] = [];
    feed.subscribe((t) => { if (!feed.resuming) ticks.push(t.p.DTC[0]); });
    feed.connect();
    socks[0].onopen();
    const all = (m: number) => { for (const k of Object.keys(PX)) socks[0].msg({ channel: 'bbo', data: { coin: COINS[k], time: now, bbo: [{ px: String(PX[k] * m - 0.0001) }, { px: String(PX[k] * m + 0.0001) }] } }); };
    const run = async (ms: number) => { now += ms; await (feed as any).run(now); };
    await run(0);
    all(1.1); // 지금 실제 값은 떠날 때의 1.1배
    await run(1000);
    expect(feed.resuming).toBe(true); // 이 초에 처음 붙었다(아직 안 메웠다)
    await run(1000);
    expect(feed.resuming).toBe(false);
    expect(gap).not.toBeNull();
    expect(gap!.from).toBe(leaveN + 1);
    expect(gap!.bars.filter((b) => b.market === 'DTC').length).toBeGreaterThan(50);
    expect(gap!.bars.some((b) => b.market === 'FLY')).toBe(true);
    // 봉의 끝 = 저장된 가상 가격 × 1.1 (같은 비)
    const dtc = gap!.bars.filter((b) => b.market === 'DTC');
    expect(dtc[dtc.length - 1].c / saved.DTC).toBeCloseTo(1.1, 2);
    expect(dtc[0].o / saved.DTC).toBeCloseTo(1, 2);
    await run(1000);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[ticks.length - 1] / saved.DTC).toBeCloseTo(1.1, 3);
  });
  it('첫 값이 끝내 안 붙으면 이어 가기를 버리고 저장된 값에서 그대로 간다', async () => {
    let now = 1_700_000_000_000;
    const saved: Record<string, number> = Object.fromEntries(marketDefs.map((m) => [m.id, m.startPrice * 2]));
    const feed = new HlDirectFeed({ socketFactory: () => new FakeSock() as any, post: async () => [], now: () => now, resume: { n: 1, prices: saved, mids: {} } });
    feed.connect();
    await (feed as any).run(now);
    now += 16_000;
    await (feed as any).run(now);
    expect(feed.resuming).toBe(false);
    expect(feed.core.rebaser.vprice.DTC).toBe(saved.DTC);
  });
});

import { min1Of } from '../../src/net/protocol';
describe('U-55 서버 hello 의 최근 1분 봉', () => {
  it('서버 번호를 벽시계(ms)로 바꿔 시세면 봉으로', () => {
    const h = { t: 'hello' as const, n: 1000, ts: 1_700_000_000, epoch: 1, st: 'open' as const, markets: ['DTC'], warm: { res: 180, bars: {} }, avg: {}, min1: { DTC: [[880, 1, 2, 0.5, 1.5], [940, 1.5, 2, 1, 1.8]] } };
    const d = min1Of(h)!;
    expect(d.DTC).toEqual([{ t: (880 + 1_699_999_000) * 1000, o: 1, h: 2, l: 0.5, c: 1.5 }, { t: (940 + 1_699_999_000) * 1000, o: 1.5, h: 2, l: 1, c: 1.8 }]);
    expect(min1Of({ ...h, min1: undefined })).toBeNull();
  });
});

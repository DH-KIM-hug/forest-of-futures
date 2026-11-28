// U-59 전광판 잠금(사용자: "한 번이라도 다 갚으면 축하합니다. 랭킹 오픈")과 「오늘 망한 자들」 소식.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __readUnlockRec, __setUnlockForTest, UNLOCK_KEY, choicesShown, endCheer, isRankUnlocked, rankCleared, rankGrandfather, useUnlock } from '../../src/ui/proto/rankUnlock';
import { __rankState, __resetRankingForTest, __setEventSenderForTest, observe, rankNetWorth } from '../../src/ui/proto/ranking';
import { BOARDS, BOARD_LABEL } from '../../src/ui/proto/rankingCore';
import { bustCause, bustFromGame, bustHeadline, bustNewsItems, dailyRivalHeadlines, rivalHeadline, type BustRow } from '../../src/ui/proto/bustNews';
import { createGame, clone, stepMut } from '../../src/engine/game';
import { buildScenario } from '../../src/ui/dev';
import { useProto } from '../../src/ui/proto/protoStore';
import type { NetInfo } from '../../src/store/gameStore';

const T0 = 1_760_000_000_000;
const live: NetInfo = { source: 'hl', conn: 'open', market: 'open', stale: false, everConnected: true, away: null };
const base = () => buildScenario('trade', createGame({ seed: 7, prices: { DTC: 100, BTH: 100, SMS: 100, MDT: 100, JQQ: 100 } }));
/** 실제 시세로 이긴 거래 한 판(시각 at 부터) */
function winTrade(g0: ReturnType<typeof base>, at: number) {
  const g1 = clone(g0);
  expect(stepMut(g1, { type: 'action', action: { type: 'open', market: 'DTC', dir: 1, lev: 25, marginPct: 25, sl: null, tp: null } }).ok).toBe(true);
  observe(g0, g1, live, at);
  const g2 = clone(g1);
  g2.run.prices.DTC = g1.run.positions.DTC.entry * 1.01;
  expect(stepMut(g2, { type: 'action', action: { type: 'close', market: 'DTC' } }).ok).toBe(true);
  observe(g1, g2, live, at + 95_000);
  return g2;
}
// 브라우저 저장소 흉내(생과 저장을 넘어 남는지 본다)
const store = new Map<string, string>();
const fakeWindow = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } }, location: { search: '' }, setTimeout, clearTimeout };

describe('U-59 잠금과 풀림', () => {
  const sent: any[] = [];
  beforeEach(() => { sent.length = 0; store.clear(); __resetRankingForTest(async (b) => { sent.push(b); return { status: 200, body: { ok: true, rank: 1 } }; }, false); useProto.getState().patch({ tutorial: 'done' }); });
  afterEach(() => { delete (globalThis as any).window; });

  it('처음에는 잠겨 있다', () => {
    expect(isRankUnlocked()).toBe(false);
    expect(useUnlock.getState().cheer).toBe(false);
  });
  it('잠긴 동안 이긴 거래는 줄에 들어가지 않는다(생의 거래 목록에는 남는다)', () => {
    winTrade(base(), T0);
    expect(__rankState().queue.items.length).toBe(0);
    expect(__rankState().life!.trades.length).toBe(1);
  });
  it('잠긴 동안 자산이 올라도 재산 판에 넣지 않는다', () => {
    const g0 = base(); g0.run.cash = 900_000;
    const g1 = clone(g0); g1.run.settleNo += 1; g1.run.over = true;
    observe(g0, g1, live, T0);
    expect(__rankState().queue.items.length).toBe(0);
  });
  it('처음 다 갚으면 풀리고 축하가 걸린다. 그 뒤의 거래부터 올라간다', () => {
    const g = winTrade(base(), T0);
    expect(rankCleared(T0 + 100_000)).toBe(true);
    expect(isRankUnlocked()).toBe(true);
    expect(useUnlock.getState().due).toBe(true);
    // 풀리기 전 거래는 거슬러 넣지 않는다
    expect(__rankState().queue.items.length).toBe(0);
    g.run.tick += 5; // 다음 판(다른 진입 틱)
    winTrade(g, T0 + 200_000);
    expect(__rankState().queue.items.map((x) => x.board).sort()).toEqual(['pnl', 'roe']);
  });
  it('풀린 순간 이번 생 최고 자산은 다시 잰다(풀리기 전의 높은 자산은 넣지 않는다)', () => {
    const g0 = base(); g0.run.cash = 900_000;
    const g1 = clone(g0); g1.run.settleNo += 1;
    observe(g0, g1, live, T0);
    expect(__rankState().life!.peak).toBe(rankNetWorth(g1));
    rankCleared(T0 + 1);
    expect(__rankState().life!.peak).toBe(-Infinity);
    const g2 = clone(g1); g2.run.cash = 400_000; g2.run.settleNo += 1;
    observe(g1, g2, live, T0 + 2);
    expect(__rankState().life!.peak).toBe(rankNetWorth(g2));
    const g3 = clone(g2); g3.run.over = true;
    observe(g2, g3, live, T0 + 3);
    expect(__rankState().queue.items.find((x) => x.board === 'networth')!.value).toBe(rankNetWorth(g2));
  });
  it('축하는 완납 장면의 고르는 줄에서 한 번만 뜬다. 두 번째 완납에는 없다', () => {
    rankCleared(T0);
    choicesShown('repay');
    expect(useUnlock.getState().cheer).toBe(false); // 다른 장면에는 안 뜬다
    choicesShown('clear');
    expect(useUnlock.getState().cheer).toBe(true);
    endCheer();
    expect(useUnlock.getState().cheer).toBe(false);
    expect(useUnlock.getState().rec!.cheered).toBe(true);
    // 다음 생에 또 다 갚았다
    expect(rankCleared(T0 + 9e6)).toBe(false);
    choicesShown('clear');
    expect(useUnlock.getState().cheer).toBe(false);
  });
  it('풀림은 기기에 남는다: 환생해도, 새로 고쳐도(다른 생의 저장이어도) 풀려 있고 축하는 다시 안 뜬다', () => {
    (globalThis as any).window = fakeWindow;
    rankCleared(T0); choicesShown('clear'); endCheer();
    expect(JSON.parse(store.get(UNLOCK_KEY)!)).toMatchObject({ at: T0, cheered: true, why: 'clear' });
    // 새로 고침: 저장소에서 다시 읽는다
    __setUnlockForTest(null);
    useUnlock.setState({ rec: __readUnlockRec() });
    expect(isRankUnlocked()).toBe(true);
    // 환생(새 생의 판): 잠그지 않는다, 새 생의 이긴 거래가 바로 올라간다
    const g = base(); g.family.generation += 1; g.run.seed += 1;
    winTrade(g, T0 + 500_000);
    expect(__rankState().queue.items.length).toBe(2);
    expect(rankCleared(T0 + 9e6)).toBe(false);
  });
  it('예전 저장에 다 갚은 생이 있으면 축하 없이 조용히 풀린다', () => {
    expect(rankGrandfather(false)).toBe(false);
    expect(isRankUnlocked()).toBe(false);
    expect(rankGrandfather(true, T0)).toBe(true);
    expect(useUnlock.getState().rec).toMatchObject({ cheered: true, why: 'past' });
    choicesShown('clear');
    expect(useUnlock.getState().cheer).toBe(false);
  });
});

describe('U-59 판 순서와 이름', () => {
  it('최고 수익률, 최고 수익금, 최고 자산', () => {
    expect(BOARDS).toEqual(['roe', 'pnl', 'networth']);
    expect(BOARDS.map((b) => BOARD_LABEL[b].tab)).toEqual(['최고 수익률', '최고 수익금', '최고 자산']);
  });
});

describe('U-59 파산 소식', () => {
  const posted: any[] = [];
  beforeEach(() => { posted.length = 0; store.clear(); (globalThis as any).window = fakeWindow; __resetRankingForTest(async () => ({ status: 200, body: { ok: true } }), true); __setEventSenderForTest(async (b) => { posted.push(b); return { status: 200 }; }); useProto.getState().patch({ tutorial: 'done' }); });
  afterEach(() => { delete (globalThis as any).window; });
  const bust = (g0: ReturnType<typeof base>) => {
    const g1 = clone(g0); g1.run.over = true;
    g1.run.bankruptcy = { cause: 'LIQ', lastLender: null, shortfall: 0, tick: g1.run.tick, settleNo: g1.run.settleNo, immediate: true, offline: false };
    observe(g0, g1, live, T0 + 1000);
    return g1;
  };
  it('이름을 적은 풀린 기기는 파산 소식을 올린다', () => {
    store.set('fof.rank.name', '도토리부자');
    bust(base());
    expect(posted.length).toBe(1);
    expect(posted[0].name).toMatch(/^도토리부자 #\d{4}$/); expect(posted[0]).toMatchObject({ cause: 'liq', lite: false });
    expect(typeof posted[0].deviceId).toBe('string');
  });
  it('이름이 없으면 올리지 않는다', () => {
    bust(base());
    expect(posted.length).toBe(0);
  });
  it('잠겨 있으면 이름이 있어도 올리지 않는다', () => {
    store.set('fof.rank.name', '도토리부자');
    __setUnlockForTest(null);
    bust(base());
    expect(posted.length).toBe(0);
  });
  it('원인: 청산, 이자 미납, 연체 한도, 빌릴 곳 막힘', () => {
    const g = base(); g.run.over = true;
    const set = (cause: string, immediate = false) => { g.run.bankruptcy = { cause, lastLender: null, shortfall: 0, tick: 0, settleNo: 0, immediate, offline: false }; return bustCause(g); };
    expect(set('SHARK', true)).toBe('liq');
    expect(set('TIP')).toBe('liq');
    expect(set('UPKEEP')).toBe('interest');
    expect(set('SHARK')).toBe('overdue');
    expect(set('FRIEND')).toBe('noLender');
    expect(bustFromGame(g, null, null, 'fof_x')).toBeNull();
    expect(bustFromGame(g, { market: 'FLY', dir: 1, lev: 200, pnl: -84_000, liq: true }, '토끼', 'fof_x', T0)).toMatchObject({ coin: 'FLY', dir: 1, lev: 200, loss: 84_000 });
  });
});

describe('U-59 신문 제목', () => {
  const row = (o: Partial<BustRow> = {}): BustRow => ({ name: '다람쥐 IN7Y', cause: 'liq', coin: 'FLY', dir: 1, lev: 200, loss: 84_000, peak: 50_000, ending: null, lite: true, at: T0, ...o });
  it('진짜 사람의 이름과 판이 제목에 들어간다(가운데점 없음)', () => {
    for (let i = 0; i < 12; i++) {
      const t = bustHeadline(row({ at: T0 + i }));
      expect(t).toContain('다람쥐 IN7Y');
      expect(t).not.toContain('·');
    }
    expect(bustHeadline(row({ cause: 'interest', coin: null, lev: null, dir: null }))).toMatch(/오소리 이자 못 내고 드럼통 대기 번호 \d+번/);
  });
  it('라이트 엔딩 제목을 섞는다', () => {
    const ts = Array.from({ length: 12 }, (_, i) => bustHeadline(row({ at: T0 + i, ending: '대부의 빨대 담당' })));
    expect(ts.every((t) => t.includes('대부의 빨대 담당'))).toBe(true);
  });
  it('진짜 소식이 없으면 숲 단타방 마을 사람들로 채워 비지 않는다(사람 이름을 지어내지 않는다)', () => {
    const xs = bustNewsItems([], [], 20000);
    expect(xs.length).toBe(3);
    expect(xs.every((x) => !x.real && x.text.startsWith('[숲 단타방]'))).toBe(true);
    expect(dailyRivalHeadlines(20000)).toEqual(dailyRivalHeadlines(20000)); // 같은 날은 같은 이야기
    const ev = { id: 'raccoon', kind: 'liq' as const, market: 'FLY', dir: 1 as const, lev: 200, pnl: -30_000, roe: -100, at: 5, line: '점심값이었는데.' };
    expect(rivalHeadline(ev)).toBe('[숲 단타방] 창구 너구리, 날다람쥐 200배 롱 청산. 「점심값이었는데.」');
    const mixed = bustNewsItems([row()], [ev], 20000);
    expect(mixed[0].real).toBe(true);
    expect(mixed[1].text).toBe(rivalHeadline(ev));
    expect(mixed.length).toBe(3);
  });
});

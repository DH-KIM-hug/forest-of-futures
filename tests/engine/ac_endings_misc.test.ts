import { describe, it, expect, beforeAll } from 'vitest';
import { fresh, setPrice } from './helpers';
import { openPosition, processPrice } from '../../src/engine/trading';
import { endings } from '../../src/engine/data';
import { matches, pickEnding } from '../../src/engine/endings';
import { buildSnapshot } from '../../src/engine/stats';
import { startNewLife, retire, tickMut, createGame } from '../../src/engine/game';
import { catchUp } from '../../src/engine/offline';
import { board, rankOf } from '../../src/engine/ranking';
import { netWorth } from '../../src/engine/selectors';
import { saveGame, loadGame, memoryAdapter, BROKEN_KEY, SAVE_KEY, BROKEN_NOTICE } from '../../src/store/persistence';
import type { GameState } from '../../src/engine/types';

/** 200배 전액을 넣고 2초 만에 청산돼 즉시 파산한 상태를 만든다. */
function wipeout200(g: GameState) {
  setPrice(g, 'DTC', 68000);
  openPosition(g, { market: 'DTC', dir: 1, lev: 200, marginPct: 100 });
  g.run.tick += 2;
  processPrice(g, 'DTC', 60000, true, 68000);
}

describe('엔딩 판정', () => {
  it('AC-55 200배·보유 2초 청산, 도감이 비어 있으면 END-151', () => {
    const g = fresh();
    wipeout200(g);
    expect(g.run.over).toBe(true);
    expect(g.pending?.id).toBe('END-151');
    expect(g.pending?.isNew).toBe(true);
  });

  it('AC-56 END-151 을 이미 수집했으면 다른 미수집 엔딩(priority 최대)', () => {
    const g = fresh();
    g.encyclopedia['END-151'] = { firstAt: 1, count: 1, snapshot: {} };
    wipeout200(g);
    expect(g.pending?.id).not.toBe('END-151');
    expect(g.pending?.isNew).toBe(true);
    // 조건이 맞는 미수집 후보 중 priority 가 가장 큰 것인지 직접 확인
    const snap = g.pending!.snapshot;
    const cands = endings.filter((e) => matches(e, snap) && e.id !== 'END-151');
    const best = cands.sort((a, b) => b.priority - a.priority || a.no - b.no)[0];
    expect(g.pending?.id).toBe(best.id);
  });

  it('AC-57 맞는 엔딩을 모두 수집하고 새 엔딩 없는 파산이 2번 이어졌으면 3번째에 미수집 proxy 중 가장 작은 번호', () => {
    const g = fresh();
    wipeout200(g);
    const snap = g.pending!.snapshot;
    const collected = new Set(endings.filter((e) => matches(e, snap)).map((e) => e.id));
    const proxies = endings.filter((e) => e.trigger.type === 'proxy' && (e.trigger.causes === null || e.trigger.causes.includes('liquidation')) && !collected.has(e.id));
    const expected = proxies.sort((a, b) => a.no - b.no)[0].id;
    const p = pickEnding(snap, collected, 2);
    expect(p.via).toBe('pity');
    expect(p.id).toBe(expected);
    expect(pickEnding(snap, collected, 1).via).toBe('repeat');
  });

  it('AC-58 조건이 맞는 엔딩이 하나도 없으면 END-001', () => {
    const p = pickEnding({ cause: 'none' }, new Set(), 0);
    expect(p.id).toBe('END-001');
    expect(p.via).toBe('fallback');
  });

  it('원인마다 기본 엔딩이 하나씩 있어 후보가 비지 않는다', () => {
    const g = fresh();
    const base = { overdue_upkeep: 'END-039', overdue_bank: 'END-006', overdue_capital: 'END-018', overdue_shark1: 'END-041', overdue_shark2: 'END-097', friends: 'END-101', liquidation: 'END-158' };
    for (const [cause, id] of Object.entries(base)) {
      const snap = buildSnapshot(g, { cause, immediate: false, causeLender: null, shortfall: 0 });
      const e = endings.find((x) => x.id === id)!;
      expect(matches(e, snap)).toBe(true);
    }
  });

  it('AC-59 처음 얻은 엔딩은 도감에 날짜·상태와 함께 저장되고 다시 켜도 열려 있다', () => {
    const g = fresh();
    wipeout200(g);
    const id = g.pending!.id;
    expect(g.encyclopedia[id].count).toBe(1);
    expect(g.encyclopedia[id].firstAt).toBeGreaterThan(0);
    expect(g.encyclopedia[id].snapshot.cause).toBe('liquidation');
    const a = memoryAdapter();
    saveGame(a, g);
    const back = loadGame(a).state!;
    expect(back.encyclopedia[id].count).toBe(1);
    expect(back.pending?.id).toBe(id);
  });

  it('AC-60 새 인생 시작: 시작 상태로 돌아가고 도감·누적·기록은 그대로', () => {
    const g = fresh();
    wipeout200(g);
    const n = startNewLife(g, 99);
    expect(n.run.cash).toBe(100000);
    expect(n.run.debts).toEqual({ bank: 0, capital: 150000, shark1: 150000, shark2: 0 });
    expect(n.run.houseStage).toBe(0);
    expect(n.run.over).toBe(false);
    expect(n.pending).toBeNull();
    expect(Object.keys(n.encyclopedia)).toEqual(Object.keys(g.encyclopedia));
    expect(n.life.lifeLiqs).toBe(1);
    expect(n.life.lifeBankruptcies).toBe(1);
    expect(n.records.length).toBe(1);
  });

  it('AC-61 엔딩 200개 전부에 힌트가 있고 번호가 1..200 이다(기록관은 이 목록을 그대로 그린다)', () => {
    expect(endings.length).toBe(200);
    expect(endings.map((e) => e.no)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(endings.every((e) => e.hint.length > 0 && e.title.length > 0)).toBe(true);
  });

  it('rule 114 / proxy 86 개 구성', () => {
    expect(endings.filter((e) => e.trigger.type === 'rule').length).toBe(114);
    expect(endings.filter((e) => e.trigger.type === 'proxy').length).toBe(86);
  });
});

describe('랭킹·저장·오프라인', () => {
  it('AC-62 순자산 1,000,000 은 너구리(900,000) 위, 토끼(2,500,000) 아래', () => {
    const g = fresh();
    g.run.debts = { bank: 0, capital: 0, shark1: 0, shark2: 0 };
    g.run.cash = 1_000_000;
    expect(netWorth(g.run)).toBe(1_000_000);
    const rows = board(g).map((r) => r.name);
    const me = rows.indexOf(g.settings.name);
    expect(rows[me + 1]).toBe('절친 너구리');
    expect(rows[me - 1]).toBe('이웃 토끼');
    expect(rankOf(1_000_000)).toBe(8);
  });

  it('AC-63 빚 0 이면 은퇴로 기록이 남고 엔딩은 열리지 않는다 / 빚이 있으면 불가', () => {
    const g = fresh();
    expect(retire(g).ok).toBe(false);
    g.run.debts = { bank: 0, capital: 0, shark1: 0, shark2: 0 };
    g.run.peakNetWorth = 777777;
    const r = retire(g);
    expect(r.ok).toBe(true);
    expect(r.s.records[0]).toMatchObject({ peakNetWorth: 777777, endedBy: 'retire' });
    expect(Object.keys(r.s.encyclopedia).length).toBe(0);
    expect(r.s.run.cash).toBe(100000);
  });

  it('AC-64 저장 후 5초 뒤 다시 열면 그대로', () => {
    let g = fresh();
    for (let i = 0; i < 20; i++) tickMut(g);
    const a = memoryAdapter();
    saveGame(a, g);
    const back = loadGame(a).state!;
    const r = catchUp(back, 5);
    expect(r.ticks).toBe(0);
    expect(JSON.stringify(r.s.run)).toBe(JSON.stringify(g.run));
  });

  it('AC-65 포지션 없이 1시간 떠났다 오면 정산은 5번만, 요약 한 번', () => {
    const g = fresh();
    const r = catchUp(g, 3600);
    expect(r.s.run.cycles).toBe(5);
    expect(r.digest?.cycles).toBe(5);
    expect(r.s.run.offline).toBe(false);
    expect(r.s.run.over).toBe(false);
  });

  it('AC-66 현금 0 으로 떠나도 연체는 1 에서 멈추고 파산하지 않는다', () => {
    const g = fresh();
    g.run.cash = 0;
    const r = catchUp(g, 10 * 3600);
    expect(r.s.run.streak.shark1).toBe(1);
    expect(r.s.run.over).toBe(false);
  });

  it('AC-67 전액 200배로 떠나 따라잡기 중 청산되면 엔딩이 기다린다(offline = true)', () => {
    const g = fresh();
    setPrice(g, 'DTC', 68000);
    openPosition(g, { market: 'DTC', dir: 1, lev: 200, marginPct: 100 });
    g.run.positions.DTC.entry = 68000 * 1.01; // 청산가가 이미 현재가 위에 있도록
    const r = catchUp(g, 300);
    expect(r.s.run.over).toBe(true);
    expect(r.s.pending?.snapshot.offline).toBe(true);
    expect(r.s.pending?.snapshot.cause).toBe('liquidation');
  });

  it('AC-68 저장 데이터가 깨졌으면 원본을 fof.save.broken 으로 옮기고 새로 시작한다', () => {
    const a = memoryAdapter();
    a.set(SAVE_KEY, '{깨진 json');
    const r = loadGame(a);
    expect(r.state).toBeNull();
    expect(r.notice).toBe(BROKEN_NOTICE);
    expect(a.get(BROKEN_KEY)).toBe('{깨진 json');
    expect(a.get(SAVE_KEY)).toBeNull();
    const b = memoryAdapter();
    b.set(SAVE_KEY, JSON.stringify({ version: 99 }));
    expect(loadGame(b).notice).toBe(BROKEN_NOTICE);
  });

  it('10분 시뮬레이션(노동 없이)에서도 엔진이 끝까지 돈다', () => {
    const g = createGame(4242);
    for (let i = 0; i < 600 && !g.run.over; i++) tickMut(g);
    expect(g.run.tick).toBeGreaterThan(0);
    expect(Number.isFinite(netWorth(g.run))).toBe(true);
  });
});

describe('화면 규칙(소스 정적 검사)', () => {
  // @types/node 를 설치하지 않으므로 node:fs 는 동적으로 불러온다(디스크 절약).
  let fsMod: any;
  beforeAll(async () => {
    fsMod = await import(/* @vite-ignore */ ['node', 'fs'].join(':'));
  });
  const read = (p: string): string => fsMod.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
  it('AC-09 거래 화면 소스에는 노동·도장·대출 호출이 없다', () => {
    const src = read('src/ui/trade/TradeScreen.tsx') + read('src/ui/trade/Chart.tsx');
    expect(src).not.toMatch(/doLabor|doStamp|doBorrow|doMove/);
  });
  it('AC-69 모든 button 은 44px 이상', () => {
    const css = read('src/styles.css');
    expect(css).toMatch(/button\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/button\s*\{[^}]*min-width:\s*44px/);
  });
  it('AC-70 탭은 마을·거래 두 개뿐이고 홈 화면이 없다', () => {
    const src = read('src/App.tsx');
    expect(src).toMatch(/마을/);
    expect(src).toMatch(/거래/);
    expect(src).not.toMatch(/홈 화면|HomeScreen/);
  });
  it('AC-71 집 단계 5벌의 마을 색감이 CSS 에 있다', () => {
    const css = read('src/styles.css');
    for (let i = 0; i < 5; i++) expect(css).toContain(`[data-stage="${i}"]`);
  });
  it('AC-72 동작 줄이기에서는 흔들림이 꺼진다', () => {
    const css = read('src/styles.css');
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.shake[\s\S]*animation:\s*none/);
  });
});

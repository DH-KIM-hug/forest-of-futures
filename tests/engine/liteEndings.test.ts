// 라이트 배드 엔딩 40개(engine/liteEndings.ts, data/endings_lite.json, docs/gdd/LITE_ENDINGS.md): 가벼운 무게 뽑기, 도감, 금지어.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { A, settleOnce } from './helpers';
import { balance } from '../../src/engine/data';
import { createLiteGame } from '../../src/engine/lite';
import { createGame } from '../../src/engine/game';
import { migrate, serialize } from '../../src/engine/save';
import { processPrice } from '../../src/engine/futures';
import {
  liteEndings, liteEndingById, liteWeight, pickLite, factTags, liteFacts, recordLite, liteRoll, LITE_SEEN_MUL, LITE_ENDING_TOTAL,
  levBand, clockBand, lifeBand, type LiteFacts,
} from '../../src/engine/liteEndings';

const act1 = (on: boolean) => { if (on) (balance as { act1?: unknown }).act1 = { friends: false }; else delete (balance as { act1?: unknown }).act1; };
afterEach(() => act1(false));

const KNOWN = /^(mode:(liq|locked|overdue)|maxed|lender:(shark1|shark2|capital|bank|crow)|coin:(FLY|DTC|BTH|MDT|SMS|JQQ)|dir:(long|short)|lev:(low|mid|high)|life:(short|mid|long)|clock:(dawn|morning|day|night)|peak:high)$/;

describe('라이트 엔딩 데이터', () => {
  it('40개 안팎, id 가 겹치지 않고, 글은 1~3줄, 꼬리표는 아는 말뿐', () => {
    expect(LITE_ENDING_TOTAL).toBeGreaterThanOrEqual(36);
    expect(new Set(liteEndings.map((e) => e.id)).size).toBe(liteEndings.length);
    for (const e of liteEndings) {
      expect(e.lines.length).toBeGreaterThanOrEqual(1);
      expect(e.lines.length).toBeLessThanOrEqual(3);
      expect(e.title.trim()).not.toBe('');
      for (const [k, v] of Object.entries(e.w)) { expect(k).toMatch(KNOWN); expect(v).toBeGreaterThan(0); }
    }
  });
  it('죽음의 암시는 5~10% 사이', () => {
    const n = liteEndings.filter((e) => e.death).length;
    expect(n / liteEndings.length).toBeGreaterThanOrEqual(0.05);
    expect(n / liteEndings.length).toBeLessThanOrEqual(0.1);
  });
  it('금지선: 자살, 자해, 피, 시신, 죽는 순간을 말하는 글이 없다. 가운데점도 없다', () => {
    const BAN = /자살|자해|목을 매|목매|투신|뛰어내|극단적 선택|스스로 목숨|피가|피를|피범벅|핏|유혈|시신|시체|사체|숨이 멎|숨을 거두|죽었다|죽는다|죽여|살해|상처|피투성이|·/;
    for (const e of liteEndings) expect(`${e.title} ${e.lines.join(' ')}`).not.toMatch(BAN);
  });
  it('편지나 통보를 받는 장면이 아니다(결과 뒤의 삶)', () => {
    for (const e of liteEndings) expect(`${e.title} ${e.lines.join(' ')}`).not.toMatch(/편지|통지서|고지서|문자가 왔|알림이 왔/);
  });
  it('그림이 들어간 엔딩은 원본 PNG 가 있다', () => {
    for (const e of liteEndings) {
      if (existsSync(`src/ui/proto/img/endings/${e.id}.webp`)) expect(existsSync(`docs/art/v5/endings_lite/${e.id}.png`)).toBe(true);
    }
  });
});

const facts = (o: Partial<LiteFacts> = {}): LiteFacts => ({ mode: 'overdue', maxed: false, lender: 'shark1', coin: 'FLY', dir: 'long', lev: 'high', life: 'mid', clock: 'day', peakHigh: false, ...o });

describe('무게 뽑기', () => {
  it('꼬리표 띠: 배율, 시계, 생의 길이', () => {
    expect([levBand(5), levBand(20), levBand(50), levBand(100), levBand(200)]).toEqual(['low', 'low', 'mid', 'high', 'high']);
    expect([clockBand(0), clockBand(5), clockBand(6), clockBand(13), clockBand(23)]).toEqual(['dawn', 'dawn', 'morning', 'day', 'night']);
    expect([lifeBand(60), lifeBand(600), lifeBand(3600)]).toEqual(['short', 'mid', 'long']);
  });
  it('기본 무게 1, 맞는 꼬리표마다 그 무게를 더한다. 본 엔딩은 seenMul 배', () => {
    const e = liteEndingById.LE18; // 조합(부엉이) 5
    expect(liteWeight(e, ['lender:shark1'], false)).toBe(1);
    expect(liteWeight(e, ['lender:bank'], false)).toBe(6);
    expect(liteWeight(e, ['lender:bank'], true)).toBeCloseTo(6 * LITE_SEEN_MUL);
  });
  it('맞는 사실이 있으면 그 엔딩이 훨씬 자주 나온다(하지만 다른 것도 나온다)', () => {
    const tags = factTags(facts({ lender: 'bank', coin: 'DTC', dir: null, lev: null }));
    const count: Record<string, number> = {};
    const N = 4000;
    for (let i = 0; i < N; i++) { const e = pickLite(tags, {}, (i + 0.5) / N); count[e.id] = (count[e.id] ?? 0) + 1; }
    const base = count.LE40 ?? 0; // 오후 세 시(clock:day 4) — day 라 맞는다
    expect(count.LE18).toBeGreaterThan((count.LE02 ?? 0) * 4); // 조합 1+5 vs 독사(맞는 것 없음) 1
    expect(base).toBeGreaterThan(0);
    expect(Object.keys(count).length).toBeGreaterThanOrEqual(30); // 다양하다
  });
  it('이미 본 엔딩은 덜 나온다: 새 엔딩이 자주 보인다', () => {
    const tags = factTags(facts());
    const book: Record<string, unknown> = {};
    for (const e of liteEndings.slice(0, 20)) book[e.id] = { count: 1, firstAt: 1 };
    let fresh = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) if (!book[pickLite(tags, book, (i + 0.5) / N).id]) fresh++;
    expect(fresh / N).toBeGreaterThan(0.65);
  });
  it('liteRoll 은 [0,1) 이고 씨앗이 같으면 같다', () => {
    for (let i = 0; i < 200; i++) { const r = liteRoll(i, 2, i * 7); expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThan(1); }
    expect(liteRoll(5, 2, 100)).toBe(liteRoll(5, 2, 100));
  });
});

describe('라이트 파산 → 엔딩 → 도감', () => {
  it('연체 파산: 라이트 엔딩을 고르고 도감에 적고, 200개 장부는 건드리지 않는다', () => {
    act1(true);
    const g = createLiteGame({ seed: 9 });
    for (let i = 0; i < 6 && !g.run.over; i++) settleOnce(g); // 소개의 사다리(U-65): 캐피탈, 까마귀, 딱지, 파산
    expect(g.run.over).toBe(true);
    const p = g.pendingEnding!;
    expect(p.lite).toBeTruthy();
    expect(liteEndingById[p.id]).toBeTruthy();
    expect(p.isNew).toBe(true);
    expect(p.collected).toBe(1);
    expect(p.lite!.total).toBe(LITE_ENDING_TOTAL);
    expect(p.lite!.tags).toContain('mode:overdue');
    expect(p.lite!.tags).toContain('lender:shark1');
    expect(Object.keys(g.family.ledger)).toEqual([]);
    expect(g.family.liteBook![p.id].count).toBe(1);
    expect(g.family.lineage.at(-1)!.endedBy).toBe(p.id);
  });
  it('한도까지 빌린 뒤 200배 몰빵 청산: mode:liq, lev:high, coin:FLY, dir:short, maxed', () => {
    act1(true);
    const g = createLiteGame();
    while (A(g, { type: 'borrow', lender: 'shark1' }).ok) { /* 한도까지 */ }
    A(g, { type: 'openAccount', sponsor: true });
    A(g, { type: 'signWaiver' });
    expect(A(g, { type: 'open', market: 'FLY', dir: -1, lev: 200, marginPct: 100, sl: null, tp: null }).ok).toBe(true);
    const px = g.run.prices.FLY;
    for (let k = 1; k <= 20 && !g.run.over; k++) { g.run.prices.FLY = px * (1 + 0.001 * k); processPrice(g, 'FLY', g.run.prices.FLY); }
    expect(g.run.over).toBe(true);
    const tags = g.pendingEnding!.lite!.tags;
    for (const t of ['mode:liq', 'lev:high', 'coin:FLY', 'dir:short', 'maxed', 'life:short']) expect(tags).toContain(t);
  });
  it('판을 쥔 채 이자를 못 내면 mode:locked', () => {
    act1(true);
    const g = createLiteGame();
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    A(g, { type: 'signWaiver' });
    expect(A(g, { type: 'open', market: 'BTH', dir: 1, lev: 10, marginPct: 100, sl: null, tp: null }).ok).toBe(true);
    g.run.cash = 0;
    expect(liteFacts(g, new Date(2026, 10, 28, 3)).mode).toBe('locked');
    const f = liteFacts(g, new Date(2026, 10, 28, 3));
    expect(f.coin).toBe('BTH');
    expect(f.lev).toBe('low');
    expect(f.clock).toBe('dawn');
  });
  it('도감은 생과 저장을 넘어 남는다', () => {
    act1(true);
    const g = createLiteGame({ seed: 4 });
    for (let i = 0; i < 6 && !g.run.over; i++) settleOnce(g); // 소개의 사다리(U-65): 캐피탈, 까마귀, 딱지, 파산
    const id = g.pendingEnding!.id;
    const back = migrate(JSON.parse(serialize(g, 1)))!;
    expect(back.family.liteBook![id]).toEqual({ count: 1, firstAt: g.family.generation });
    expect(back.pendingEnding?.lite?.lines.length).toBeGreaterThan(0);
    // 옛 저장(liteBook 없음)도 빈 도감으로 읽힌다
    const old = JSON.parse(serialize(createGame(), 1));
    delete old.family.liteBook;
    expect(migrate(old)!.family.liteBook).toEqual({});
  });
  it('recordLite: 처음이면 true, 다시면 count 만 는다', () => {
    const b: Record<string, { count: number; firstAt: number }> = {};
    expect(recordLite(b, 'LE01', 2)).toBe(true);
    expect(recordLite(b, 'LE01', 3)).toBe(false);
    expect(b.LE01).toEqual({ count: 2, firstAt: 2 });
  });
  it('라이트가 아닌 생은 예전 엔딩 그대로(라이트 꼬리 없음)', () => {
    const g = createGame({ seed: 2 });
    g.run.cash = 0;
    for (let i = 0; i < 12 && !g.run.over; i++) settleOnce(g);
    if (g.pendingEnding) { expect(g.pendingEnding.lite).toBeUndefined(); expect(liteEndingById[g.pendingEnding.id]).toBeUndefined(); }
  });
});

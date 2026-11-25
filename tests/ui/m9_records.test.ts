// M9 화면(엔딩 카드·재산 명세서·기록관·전광판·프롤로그)의 읽기 모델 시험.
import { describe, expect, it } from 'vitest';
import { A, fresh, giveWheel, clone } from '../engine/helpers';
import { declareBankruptcy } from '../../src/engine/bankruptcy';
import { endings } from '../../src/engine/data';
import { archiveEntry } from '../../src/engine/endings';
import { serialize, migrate } from '../../src/engine/save';
import { albumModel, BRANCH_LABEL, CAUSE, endingCardModel, heirloomRows, ladder, overlayRoute, retireInfo, statementModel, tipBookRows } from '../../src/ui/vm/records';
import { pctStr } from '../../src/ui/vm/village';
import { PROLOGUE } from '../../src/ui/overlays/Prologue';

function bankrupt(gen = 3) {
  const g = fresh();
  g.family.generation = gen;
  giveWheel(g, 'DTC');
  g.run.debts.shark1.principal = 400_000;
  g.run.debts.shark1.overdue = 2;
  declareBankruptcy(g, { lastLender: 'shark1', shortfall: 40_000 });
  return g;
}

describe('AC-v2-128 엔딩 카드', () => {
  it('번호·원인 띠, 마지막 세 장면(시각), 한 끗 차이(최대 2), 다음 세대에 남는 것, 새 엔딩, 장부 n / 200', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    for (const t of ['tap', 'tap']) A(g, { type: t as 'tap' });
    A(g, { type: 'borrow', lender: 'capital' });
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'stamp', lender: 'shark1' });
    g.run.debts.shark1.overdue = 2;
    declareBankruptcy(g, { lastLender: 'shark1', shortfall: 40_000 });
    const m = endingCardModel(g)!;
    expect(m.no).toMatch(/^No\.\d{3}$/);
    expect(m.causeLabel).toBe(CAUSE[m.cause].label);
    expect(m.scenes).toHaveLength(3);
    for (const s of m.scenes) expect(s.when).toMatch(/^정산 \d+회 · (아침|낮|저녁|밤)$/);
    expect(m.misses.length).toBeLessThanOrEqual(2);
    for (const x of m.misses) expect(x.text).toMatch(/ → END-\d{3} · \?\?\?$/);
    expect(m.next.trace.length).toBeGreaterThan(0);
    expect(m.status).toBe('새 엔딩');
    expect(m.ledger).toBe('1 / 200');
    expect(m.cta).toBe('상속 개시');
    expect(m.line).not.toMatch(/[{}]/); // AC-v2-129: {laborTaps} 같은 자리표시자가 채워진다
  });
  it('이미 얻은 엔딩은 "이미 수집(n번째)"', () => {
    const g = bankrupt();
    const id = g.pendingEnding!.id;
    const g2 = fresh();
    giveWheel(g2, 'DTC');
    g2.family.ledger[id] = { count: 2, holders: [{ gen: 2, name: 'a' }], firstAt: 2, scenes: [] };
    g2.run.debts.shark1.principal = 400_000;
    g2.run.debts.shark1.overdue = 2;
    declareBankruptcy(g2, { lastLender: 'shark1', shortfall: 40_000 });
    const m = endingCardModel(g2)!;
    if (m.id === id) expect(m.status).toBe('이미 수집(3번째)');
    else expect(m.status).toBe('새 엔딩');
  });
});

describe('AC-v2-100 재산 명세서', () => {
  it('3세대 이상 파산 -> 세 갈래 카드(받는 가훈·남는 것·시작 빚·첫 정산 예상 수지), 권유·시간 제한 없음', () => {
    const g = bankrupt(3);
    A(g, { type: 'estateNext' });
    expect(g.estate!.step).toBe('statement');
    const m = statementModel(g);
    expect(m.cards.map((c) => c.branch)).toEqual(['renounce', 'limited', 'simple']);
    for (const c of m.cards) {
      expect(c.lines.map((l) => l.k)).toEqual(['받는 가훈', '남는 것', '시작 빚', '시작 현금', '첫 정산 예상 수지', '시작 단계']);
    }
    const text = JSON.stringify(m);
    expect(text).not.toMatch(/추천|권유|남은 시간|지금 아니면|제한/);
    expect(m.formula).toMatch(/^성과 \d+ × 장부 [\d.]+ × 반복 [\d.]+ × 족보 [\d.]+$/);
    expect(m.parent[0].label).toBe('현금');
  });
  it('은퇴(증여)는 한 갈래', () => {
    const g = fresh();
    g.run.house = 1;
    g.run.debts.bank.principal = 0;
    g.run.debts.capital.principal = 0;
    g.run.debts.shark1.principal = 0;
    g.run.debts.shark2.principal = 0;
    expect(retireInfo(g).ok).toBe(true);
    A(g, { type: 'retire' });
    expect(statementModel(g).cards.map((c) => c.branch)).toEqual(['gift']);
    expect(BRANCH_LABEL.gift).toBe('증여');
  });
  it('은퇴가 막히면 이유를 말한다', () => {
    const g = fresh();
    const r = retireInfo(g);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('오두막');
    expect(r.reason).toContain('빚');
  });
  it('표시 이름은 가훈', () => {
    const g = bankrupt(3);
    A(g, { type: 'estateNext' });
    expect(statementModel(g).cards[0].lines[0].k).toBe('받는 가훈');
  });
});

describe('AC-v2-148 어디서 꺼도 그 화면에서 이어진다', () => {
  const none = { prologue: false, away: false, overlay: null as string | null };
  it('엔딩 카드 -> 명세서 -> 트리 단계가 저장 후에도 같은 화면', async () => {
    const g = bankrupt(3);
    expect(overlayRoute(g, none)).toBe('ending');
    const reload = (x: typeof g) => migrate(JSON.parse(serialize(x, 1)))!;
    expect(overlayRoute(reload(g), none)).toBe('ending');
    A(g, { type: 'estateNext' });
    expect(overlayRoute(reload(g), none)).toBe('estate');
    A(g, { type: 'inherit', branch: 'renounce' });
    expect(g.estate!.step).toBe('tree');
    expect(overlayRoute(reload(g), none)).toBe('estate');
    A(g, { type: 'nextGeneration' });
    expect(overlayRoute(g, none)).toBeNull();
  });
  it('프롤로그·자리를 비운 사이가 먼저, 기록관·전광판은 그 다음', () => {
    const g = fresh();
    expect(overlayRoute(g, { prologue: true, away: true, overlay: 'archive' })).toBe('prologue');
    g.run.tick = 100;
    expect(overlayRoute(g, { prologue: true, away: true, overlay: 'archive' })).toBe('away');
    expect(overlayRoute(g, { prologue: false, away: false, overlay: 'archive' })).toBe('archive');
    expect(overlayRoute(g, { prologue: false, away: false, overlay: 'board' })).toBe('board');
  });
  it('프롤로그는 4장', () => {
    expect(PROLOGUE).toHaveLength(4);
    expect(PROLOGUE[2]).toContain('텐트 하나, 현금 10만, 빚 30만');
    expect(PROLOGUE[3]).toContain('석 달');
  });
});

describe('AC-v2-127·130·131 기록관', () => {
  it('등불: 이대로 가면 미수집 엔딩이면 켜지고 번호와 단서가 맨 위 줄에', () => {
    const g = fresh();
    g.run.debts.shark1.principal = 100_000;
    g.run.debts.shark1.overdue = 1;
    const a = albumModel(g);
    expect(a.lantern.on).toBe(true);
    expect(a.lantern.text).toMatch(/^No\.\d{3} · .+/);
    // 이대로 가면 나올 엔딩을 이미 모았다면 꺼진다
    const id = 'END-' + a.lantern.text.slice(3, 6);
    g.family.ledger[id] = { count: 1, holders: [{ gen: 2, name: 'x' }], firstAt: 2, scenes: [] };
    const b = albumModel(g);
    if (b.lantern.on) expect(b.lantern.text.slice(0, 6)).not.toBe(a.lantern.text.slice(0, 6));
    else expect(b.lantern.text).toContain('이미');
  });
  it('미수집 칸은 ???, 원인, 행동 문장 단서. 200칸', () => {
    const g = fresh();
    const a = albumModel(g);
    expect(a.entries).toHaveLength(200);
    const e = a.entries.find((x) => x.clueVisible)!;
    expect(e.title).toBe('???');
    expect(e.causes.length).toBeGreaterThan(0);
    expect(e.clue.length).toBeGreaterThan(0);
    expect(albumModel(g, 'LIQ').filtered.every((x) => x.causes.includes('LIQ'))).toBe(true);
  });
  it('★3 은 조건 하나가 ? 로, 같은 원인의 이웃 엔딩을 하나 모으면 열린다', () => {
    const g = fresh();
    const hid = endings.find((e) => e.rarity === 3 && e.hiddenCondIndex !== null)!;
    const before = archiveEntry(g, hid);
    expect(before.clueVisible).toBe(false);
    expect(before.conditionsView.some((c) => / \?$/.test(c))).toBe(true);
    const nb = endings.find((o) => o.id !== hid.id && o.causes.some((c) => hid.causes.includes(c)) && o.conditions.some((c) => hid.conditions.some((h) => h[0] === c[0])))!;
    g.family.ledger[nb.id] = { count: 1, holders: [{ gen: 2, name: 'x' }], firstAt: 2, scenes: [] };
    expect(archiveEntry(g, hid).clueVisible).toBe(true);
  });
  it('같은 엔딩을 다른 세대가 다시 얻으면 두 세대가 모두 적힌다', () => {
    const g = fresh();
    const id = endings[10].id;
    g.family.ledger[id] = { count: 2, holders: [{ gen: 2, name: '칩멍크' }, { gen: 3, name: '칩멍크' }], firstAt: 2, scenes: [] };
    const e = albumModel(g).entries.find((x) => x.id === id)!;
    expect(e.holders.map((h) => h.gen)).toEqual([2, 3]);
    expect(e.title).not.toBe('???');
  });
  it('정보 수첩: 출처별 들은 횟수 / 맞은 횟수, 유품함', () => {
    const g = fresh();
    g.family.tipBook = { fox: { said: 6, hit: 2 } };
    expect(tipBookRows(g)).toEqual([{ id: 'fox', name: '여우 선배', said: 6, hit: 2 }]);
    expect(heirloomRows(g).length).toBeGreaterThan(0);
  });
  it('전광판 사다리: 주민 9명 + 내 집안', () => {
    const g = fresh();
    g.family.peakNetWorth = 2_000_000;
    const l = ladder(g);
    expect(l).toHaveLength(10);
    expect(l.find((r) => r.me)!.rank).toBe(3);
  });
});

describe('AC-v2-150 동작 줄이기 · 색 말고도 구분', () => {
  it('상승·하락은 ▲▼ 와 +/− 로도 구분', () => {
    expect(pctStr(0.8)).toBe('▲+0.8%');
    expect(pctStr(-0.4)).toBe('▼−0.4%');
  });
  it('동작 줄이기 설정이면 흔들림·깜빡임·카드 뒤집힘·도장이 꺼진다', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync('src/ui/styles.css', 'utf8');
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
    for (const sel of ['.app.sh0', '.ending .static', '.ending .stampbig', '.ending .ecard.new', '.pill.timer.warn .bell', '.posrow.call', '.finger']) expect(blocks).toContain(sel);
    expect(blocks).toMatch(/\.ending \.ecard\.new \{ animation: none/);
  });
});
void clone;

// U-39(회차 2) 시제품 쪽: 장부의 고정금리 줄 · 정산 알림 · 새 대사 · 첫 추심원 60초 · 정산 때 낼 돈이 포지션에 묶이는가.
import { afterEach, describe, expect, it } from 'vitest';
import { A, fresh, settleOnce } from '../engine/helpers';
import { ledgerRows, interestCut } from '../../src/ui/proto/ledger';
import { settleRemark } from '../../src/ui/proto/react';
import { STORY, WHO_NAME, PLACE } from '../../src/ui/proto/text';
import { FIRST_VISIT_SEC, firstVisitSec, fixedInterestNow, interestAfterHike, interestNow, claim } from '../../src/ui/proto/model';
import { squeezeOf } from '../../src/ui/proto/tension';
import { balance, lenderById } from '../../src/engine/data';
import { tapValue } from '../../src/engine/equipment';

afterEach(() => { delete (balance as { act1?: unknown }).act1; });

describe('오소리 장부: 엄마 빚은 고정금리 (U-39 ⑥)', () => {
  const borrowed = () => { const g = fresh(); A(g, { type: 'borrow', lender: 'shark1' }); A(g, { type: 'borrow', lender: 'shark1' }); return g; };
  it('금리 2배 중에도 엄마 빚 줄의 이자는 4,500, 빌린 돈 줄만 두 배', () => {
    const g = borrowed();
    g.run.effects.push({ id: 'rate_hike', type: 'rateMultiplier', multiplier: 2, remaining: 2 });
    const rows = Object.fromEntries(ledgerRows(g).map((r) => [r.key, r]));
    expect(rows.mom).toMatchObject({ interest: 4500, fixed: true });
    expect(rows.first).toMatchObject({ interest: 8000, fixed: false });
    expect(rows.repeat).toMatchObject({ interest: 12000, fixed: false });
    expect(ledgerRows(g).reduce((a, r) => a + r.interest, 0)).toBe(interestNow(g));
    // 엄마 빚 5만을 갚으면 이자는 750 준다(금리 인상과 상관없이)
    g.run.debts.shark1.tranches = []; g.run.debts.shark1.principal = 300000;
    expect(interestCut(g, 50000)).toBe(750);
  });
  it('금리 인상 장면에 넣는 숫자: 14,500 → 24,500, 그대로인 몫 4,500', () => {
    const g = borrowed();
    expect(interestNow(g)).toBe(14500);
    expect(fixedInterestNow(g)).toBe(4500);
    expect(interestAfterHike(g, 2)).toBe(24500);
    const lines = STORY.rateHike({ text: '속보', from: 14500, to: 24500, times: 2, fixed: 4500 });
    expect(lines[1].text).toContain('14,500 그대로 준비하세요. 그다음 2번은 24,500'); // U-46
    expect(lines[2].text).toBe('어머님 건 그대로예요. 처음부터 금리를 정해 둔 거라서요.');
    expect(STORY.rateHike({ text: '속보', from: 2000, to: 4000, times: 2, fixed: 0 })).toHaveLength(2); // U-44: 월급 농담은 뺐다. 엄마 빚을 다 갚은 뒤에는 그 줄이 없다
  });
  it('빌린 적 없이 밀려서 얹힌 돈은 그 이름으로 적힌다', () => {
    (balance as { act1?: unknown }).act1 = { friends: false };
    const g = fresh();
    settleOnce(g);
    const first = ledgerRows(g).find((r) => r.key === 'first')!;
    expect(first.label).toBe('밀려서 얹힌 돈');
    expect(first.left).toBe(5500);
    A(g, { type: 'borrow', lender: 'shark1' });
    expect(ledgerRows(g).find((r) => r.key === 'first')!.label).toBe('처음 빌린 돈');
  });
});

describe('첫 생의 첫 추심원은 60초 뒤 (U-39 ⑤)', () => {
  it('보통 속도 60초, 빠른 판(20초)은 그대로', () => {
    expect(FIRST_VISIT_SEC).toBe(60);
    expect(firstVisitSec(180)).toBe(60);
    expect(firstVisitSec(20)).toBe(20);
  });
  it('그 60초 동안 아무리 눌러도 첫 청구액에 못 미친다(초당 12번)', () => {
    const g = fresh();
    const max = balance.progression.maxTapsPerSec * FIRST_VISIT_SEC * tapValue(g, 'DTC');
    expect(max).toBe(1440);
    expect(max).toBeLessThan(claim(g).total);
    expect(claim(g).total).toBe(5500);
  });
});

describe('정산 알림: 들고 있는 포지션을 추심원이 흘끗 본다', () => {
  const c = { interest: 14500, other: 0, net: -6000, cashAfter: 80000, nextClaim: 15500, nextNet: -6000, overdue: false, posOpen: true, negStreak: 1, firstPositive: false };
  it('이자의 3할이 넘는 이익 · 손실은 숫자로, 작으면 전처럼', () => {
    expect(settleRemark({ ...c, posPnl: 9000 })).toContain('걸어 두신 건 아직 +9,000이네요.');
    expect(settleRemark({ ...c, posPnl: -9000 })).toContain('걸어 두신 건 아직 −9,000이네요.');
    expect(settleRemark({ ...c, posPnl: -300 })).toContain('폰 보고 계세요.');
    expect(settleRemark({ ...c })).toContain('폰 보고 계세요.');
  });
});

describe('정산 때 낼 돈이 포지션에 묶이는가', () => {
  it('회차 2 에서 겪은 일: 전부 걸면 손에 0, 알바가 캐 오는 9,335 로는 이자·생활비·일당 19,100 을 못 낸다', () => {
    const s = squeezeOf({ cash: 0, income: 9335, due: 19100, settleIn: 125, holding: false })!;
    expect(s).toMatchObject({ due: 19100, have: 9335, short: 9765 });
    expect(s.text).toBe('거래 후 잔액 9,335, 2:05 뒤 낼 돈 19,100. 그때 잔액이 모자라면 연체');
    expect(squeezeOf({ cash: 0, income: 9335, due: 19100, settleIn: 42, holding: true })!.text).toBe('0:42 뒤 낼 돈 19,100, 손에 9,335. 닫아야 낸다');
  });
  it('낼 돈이 남으면 아무 말도 없다', () => {
    expect(squeezeOf({ cash: 50000, income: 9335, due: 19100, settleIn: 60, holding: false })).toBeNull();
    expect(squeezeOf({ cash: 9765, income: 9335, due: 19100, settleIn: 60, holding: true })).toBeNull();
  });
});

describe('새 대사 (U-39)', () => {
  it('빚 0: 오소리 대부의 두 줄과 지문, 그리고 계속하면 족제비의 할부', () => {
    const c = STORY.clear();
    expect(c.map((l) => l.who)).toEqual(['note', 'hero']); // 개정 대본 장면 34: 문간에 아무도 오지 않는다
    expect(c[1].text).toBe('오늘은 이 문, 내가 닫아도 되네.');
    const h = STORY.act2Hook();
    expect(h.map((l) => l.who)).toEqual(['note', 'weasel', 'hero']);
    expect(h[1].text).toContain('할부');
    expect(h[2]).toMatchObject({ who: 'hero', text: '…이제야 빚을 다 갚았는데, 첫 장부터 할부네.' });
  });
  it('연체 장면: 돈이 거래소에 묶여 있었으면 그렇다고 말하고, 생활비가 장부에 얹혔으면 그것도 말한다', () => {
    const base = { interest: 14500, nth: 1, tagged: false, seized: false, nothingLeft: false };
    expect(STORY.overdue(base)).toHaveLength(3);
    const locked = STORY.overdue({ ...base, locked: 96583 });
    expect(locked[1].text).toBe('96,583은 아직 거래에 걸려 있잖아요. 그건 지금 받을 수가 없어요.'); // 개정 대본 장면 23
    expect(STORY.overdue({ ...base, locked: 3000 })).toHaveLength(3); // 묶인 돈이 이자보다 작으면 그 줄이 없다
    expect(STORY.overdue({ ...base, locked: 168209 })[1].text).toContain('168,209는 아직'); // 조사
    const living = STORY.overdue({ ...base, living: 1000 });
    expect(living.some((l) => l.text === '못 받은 이자하고 생활비 1,000은 원금에 보탰습니다.')).toBe(true);
    for (const l of [...locked, ...living]) expect(l.who).toBe('collector');
  });
  it('숲속 캐피탈: 너구리가 자동이체와 압류 순서를 말한다. 지도와 데이터의 이름이 같다', () => {
    const t = STORY.capitalIntro({ amount: 50000, ratePct: 2 }).map((l) => l.text).join(' ');
    expect(t).toContain('자동이체');
    expect(t).toContain('값나가는 바퀴부터');
    expect(PLACE.capital.name).toBe(lenderById.capital.name);
    expect(PLACE.capital.npc).toBe(lenderById.capital.npc);
    expect(PLACE.shark1.npc).toBe(lenderById.shark1.npc);
    expect(WHO_NAME.raccoon).toBe(lenderById.capital.npc);
  });
});

describe('엄마 이야기의 단서 셋: 한 번에 하나, 내 진행에 묶인다 (U-39 ⑫)', () => {
  const none = { reborrowed: false, shownThisVisit: false };
  const pay = (g: ReturnType<typeof fresh>, amt: number) => { g.run.cash += amt; for (let i = 0; i < amt / 10000; i++) A(g, { type: 'stamp', lender: 'shark1', mult: 1 }); };
  it('갚은 것이 없으면 아무것도 없다. 첫 금박 도장(5만)에 지워진 사유 칸', async () => {
    const { momClueDue } = await import('../../src/ui/proto/ledger');
    const g = fresh();
    A(g, { type: 'borrow', lender: 'shark1' });
    expect(momClueDue(g, {}, none)).toBeNull();
    pay(g, 40000);
    expect(momClueDue(g, {}, none)).toBeNull();
    pay(g, 10000);
    expect(momClueDue(g, {}, none)).toBe('reason');
    expect(momClueDue(g, { reason: true }, none)).toBeNull(); // 빌린 돈 줄을 갚는 중: 엄마 빚 줄에는 아직 손이 안 닿았다
  });
  it('거울: 갚다가 다시 빌리는 바로 그때 "10만까지 갚았다가, 다시 30만"', async () => {
    const { momClueDue } = await import('../../src/ui/proto/ledger');
    const g = fresh();
    A(g, { type: 'borrow', lender: 'shark1' });
    pay(g, 20000);
    A(g, { type: 'borrow', lender: 'shark1' });
    expect(momClueDue(g, {}, { reborrowed: true, shownThisVisit: false })).toBe('mirror');
    expect(momClueDue(g, { mirror: true }, { reborrowed: true, shownThisVisit: false })).toBeNull();
    // 갚은 적 없이 더 빌리는 것은 거울이 아니다(튜토리얼의 두 번째 대출)
    const h = fresh();
    A(h, { type: 'borrow', lender: 'shark1' });
    A(h, { type: 'borrow', lender: 'shark1' });
    expect(momClueDue(h, {}, { reborrowed: true, shownThisVisit: false })).toBeNull();
  });
  it('엄마 빚 줄에 처음 손이 닿으면 뒤집힌 액자. 한 번 들를 때 하나만', async () => {
    const { momClueDue } = await import('../../src/ui/proto/ledger');
    const g = fresh();
    A(g, { type: 'borrow', lender: 'shark1' });
    pay(g, 110000); // 빌린 10만을 다 갚고 엄마 빚 1만
    expect(momClueDue(g, {}, none)).toBe('reason'); // 먼저 첫 금박 도장의 것
    expect(momClueDue(g, { reason: true }, { reborrowed: false, shownThisVisit: true })).toBeNull(); // 같은 방문에는 더 없다
    expect(momClueDue(g, { reason: true }, none)).toBe('frame'); // 다음에 들르면
    expect(momClueDue(g, { reason: true, frame: true }, none)).toBeNull();
  });
  it('단서는 지문 한 줄씩이고 설명하지 않는다', () => {
    for (const k of ['reason', 'mirror', 'frame'] as const) {
      const l = STORY.momClue(k);
      expect(l.length).toBeLessThanOrEqual(2);
      expect(l.every((x) => x.who === 'note')).toBe(true);
      expect(l[0].text).not.toMatch(/때문|그래서|왜냐/);
    }
    expect(STORY.momClue('mirror').map((l) => l.text).join(' ')).toContain('남은 돈 10만, 추가로 빌린 돈 20만');
    // 장부의 고비 장면은 단서를 다시 말하지 않는다
    const all = ['mom20', 'mom10', 'momCleared'].flatMap((b) => STORY.ledger(b, { cut: 0, otherDebt: 0 })).map((l) => l.text).join(' ');
    expect(all).not.toMatch(/먹으로|다시 30만|뒤집힌/);
    expect(STORY.ledger('momCleared', { cut: 0, otherDebt: 0, frame: true }).some((l) => /액자/.test(l.text))).toBe(true);
  });
});

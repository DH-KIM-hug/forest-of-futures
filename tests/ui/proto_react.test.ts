// U-38: 세상이 반응한다(react.ts) · 오소리 장부(ledger.ts) · 친구 규칙 끄기 · 조사.
import { afterEach, describe, expect, it } from 'vitest';
import { A, fresh, settleOnce } from '../engine/helpers';
import { tradeReaction, settleRemark, wheelWorth, worthCertificate, isTiny, type TradeCtx, type TradeEnd } from '../../src/ui/proto/react';
import { ledgerRows, ledgerGoal, ledgerBeat, goldStamps, interestCut, repaidOffice, STAMP_STEP } from '../../src/ui/proto/ledger';
import { STORY, WHO_NAME } from '../../src/ui/proto/text';
import { VOICES, voiceOf } from '../../src/ui/proto/babble';
import { balance, endingById, endings, skillMeta } from '../../src/engine/data';
import { act1Coherent } from '../../src/engine/endings';
import { clone } from '../../src/engine/game';
import { interestDue } from '../../src/engine/selectors';
import { friendsOn } from '../../src/engine/friends';
import { josa } from '../../src/engine/util';

const T = (o: Partial<TradeEnd> = {}): TradeEnd => ({ pnl: 0, margin: 20000, lev: 10, liq: false, heldSec: 30, fundedBy: null, allIn: false, ...o });
const C = (o: Partial<TradeCtx> = {}): TradeCtx => ({ claim: 15500, wheelNet: 4667, cashAfter: 50000, liqs: 0, winStreak: 0, lossStreak: 0, tinyStreak: 0, feesLife: 0, seen: {}, ...o });

describe('거래에 대한 반응 (tradeReaction)', () => {
  it('잔돈 손익에는 아무도 말하지 않는다(58도토리 잃었다고 추심원이 오지 않는다)', () => {
    expect(tradeReaction(T({ pnl: -58 }), C())).toBeNull();
    expect(tradeReaction(T({ pnl: +88 }), C())).toBeNull();
    expect(isTiny(-58, 15500)).toBe(true);
  });
  it('첫 이익·첫 손실 대사는 청구액의 10%를 넘는 거래에만, 한 생에 한 번', () => {
    const w = tradeReaction(T({ pnl: 2000 }), C())!;
    expect(w).toMatchObject({ key: 'firstWin', who: 'boss', scene: false, once: true });
    expect(tradeReaction(T({ pnl: 2000 }), C({ seen: { firstWin: true } }))).toBeNull();
    expect(tradeReaction(T({ pnl: -2000 }), C())!.key).toBe('firstLoss');
  });
  it('이자 한 번 치를 따거나 잃으면 그 크기를 말한다(쳇바퀴로 치면 얼마)', () => {
    const w = tradeReaction(T({ pnl: 20000 }), C())!;
    expect(w.who).toBe('boss');
    expect(w.lines[0]).toContain('이자 한 번 치');
    expect(w.lines[0]).toContain('쳇바퀴 한 대 4.3정산치');
    // U-41: 이번 생 처음은 장면(한 번), 그 뒤로는 오소리 대부 · 추심원 · 족제비가 번갈아 한 줄(되풀이)
    expect(w).toMatchObject({ key: 'winClaim1', scene: true, once: true });
    const seen = { winClaim1: true };
    const again = [2, 3, 4].map((k) => tradeReaction(T({ pnl: 20000 }), C({ seen, claimWins: k }))!);
    expect(again.map((r) => r.who)).toEqual(['boss', 'collector', 'weasel']);
    expect(again.every((r) => !r.scene && !r.once)).toBe(true);
    expect(again[0].lines[0]).toContain('쳇바퀴 한 대 4.3정산치');
    expect(tradeReaction(T({ pnl: -16000 }), C())!).toMatchObject({ who: 'collector', key: 'lossClaim' });
  });
  it('크게 딴 날은 오소리 대부가 장면으로 나온다(한 생에 한 번)', () => {
    const r = tradeReaction(T({ pnl: 50000 }), C())!;
    expect(r).toMatchObject({ key: 'bigWin', who: 'boss', scene: true });
    expect(r.lines).toHaveLength(2);
    expect(tradeReaction(T({ pnl: 50000 }), C({ seen: { bigWin: true } }))!.key).toBe('winClaim1');
  });
  it('청산: 전부 걸고 빈털터리 > 빌린 돈으로 > 세 번째 > 첫 청산 > 번갈아 한 줄', () => {
    expect(tradeReaction(T({ liq: true, allIn: true, pnl: -90000 }), C({ cashAfter: 0, liqs: 1 }))!).toMatchObject({ key: 'liqAllIn', scene: true, who: 'boss' });
    const f = tradeReaction(T({ liq: true, fundedBy: 'shark1', heldSec: 12, pnl: -30000 }), C({ liqs: 1 }))!;
    expect(f.key).toBe('liqFunded');
    expect(f.lines[0]).toContain('12초');
    expect(tradeReaction(T({ liq: true, pnl: -30000 }), C({ liqs: 3, seen: { liqFirst: true } }))!.key).toBe('liq3');
    expect(tradeReaction(T({ liq: true, pnl: -30000 }), C({ liqs: 1 }))!.key).toBe('liqFirst');
    const seen = { liqFirst: true, liq3: true, liqAllIn: true, liqFunded: true };
    expect(tradeReaction(T({ liq: true, pnl: -30000 }), C({ liqs: 4, seen }))!.key).toBe('liqB');
    expect(tradeReaction(T({ liq: true, pnl: -30000 }), C({ liqs: 5, seen }))!.key).toBe('liqA');
  });
  it('본전치기를 세 번 잇따라 하면 수수료를 짚는다', () => {
    const r = tradeReaction(T({ pnl: -90 }), C({ tinyStreak: 3, feesLife: 1234 }))!;
    expect(r.key).toBe('feeBleed');
    expect(r.lines[0]).toContain('1,234');
  });
  it('세 번 잇따라 따거나 잃으면 주인공 속마음', () => {
    expect(tradeReaction(T({ pnl: 1000 }), C({ winStreak: 3, seen: { firstWin: true } }))!.who).toBe('hero');
    expect(tradeReaction(T({ pnl: -1000 }), C({ lossStreak: 3, seen: { firstLoss: true } }))!.who).toBe('hero');
  });
  it('쳇바퀴로 치면: 0.2정산치 아래는 말하지 않는다', () => {
    expect(wheelWorth(500, 4667)).toBeNull();
    expect(wheelWorth(-30120, 4667)).toBe('쳇바퀴 한 대 6.5정산치');
    expect(wheelWorth(228514, 4667)).toBe('쳇바퀴 한 대 49정산치');
  });
  it('수익 인증서는 볼 만한 이익에만 묻는다', () => {
    expect(worthCertificate(88, 11000, 15500)).toBe(false);
    expect(worthCertificate(5000, 100000, 15500)).toBe(true);
    expect(worthCertificate(3000, 5000, 15500)).toBe(true);
    expect(worthCertificate(-1, 5000, 15500)).toBe(false);
  });
});

describe('정산 한 줄 (settleRemark)', () => {
  const S = { interest: 14500, other: 0, net: -5800, cashAfter: 80000, nextClaim: 15500, nextNet: -5800, overdue: false, posOpen: false, negStreak: 1, firstPositive: false };
  it('추심원은 오소리 이자만 걷는다. 다른 곳 이자는 자동이체로 적는다', () => {
    expect(settleRemark(S)).toBe('추심원: 이자 14,500 수금 완료요오. (내 정산 −5,800)');
    expect(settleRemark({ ...S, other: 5000 })).toContain('다른 곳 이자 5,000은 자동이체');
    const none = settleRemark({ ...S, interest: 0, other: 5000, net: 18000 });
    expect(none).not.toContain('추심원');
    expect(none).toContain('[자동이체] 이자 5,000');
  });
  it('바닥이 가까우면 몇 번 남았는지 미리 말한다', () => {
    expect(settleRemark({ ...S, cashAfter: 12000 })).toContain('이대로면 2번 뒤에 바닥');
    expect(settleRemark({ ...S, cashAfter: 3000 })).toContain('다음엔 모자라겠네요오');
    expect(settleRemark({ ...S, overdue: true })).toContain('모자라네요오');
  });
  it('남기 시작한 정산 · 세 번째 적자 · 거래 중', () => {
    expect(settleRemark({ ...S, net: 900, nextNet: 900, firstPositive: true })).toContain('남기 시작했네요오');
    expect(settleRemark({ ...S, negStreak: 3 })).toContain('세 번째 적자');
    expect(settleRemark({ ...S, posOpen: true })).toContain('거래 중이시네요오');
  });
});

describe('오소리 장부 (ledger.ts)', () => {
  const afterTutorial = () => {
    const g = fresh();
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'borrow', lender: 'shark1' });
    g.run.cash = 600_000;
    return g;
  };
  it('줄 셋: 더 빌린 돈 6% · 처음 빌린 돈 4% · 엄마 빚 1.5%. 줄의 이자를 더하면 엔진의 이자다', () => {
    const g = afterTutorial();
    const rows = ledgerRows(g);
    expect(rows.map((r) => [r.key, r.ratePct, r.left, r.interest])).toEqual([['repeat', 6, 100000, 6000], ['first', 4, 100000, 4000], ['mom', 1.5, 300000, 4500]]);
    expect(rows.reduce((a, r) => a + r.interest, 0)).toBe(interestDue(g, 'shark1'));
    expect(ledgerRows(fresh()).map((r) => r.key)).toEqual(['mom']);
  });
  it('갚으면 위(비싼) 줄부터 지워지고, 5만마다 금박 도장 하나(스킬트리 재화의 기준과 같다)', () => {
    const g = afterTutorial();
    expect(STAMP_STEP).toBe(skillMeta.award.per);
    expect(ledgerGoal(g)).toMatchObject({ cur: 0, need: 50000, cut: 3000 });
    for (let i = 0; i < 5; i++) A(g, { type: 'stamp', lender: 'shark1', mult: 1 });
    expect(repaidOffice(g)).toBe(50000);
    expect(goldStamps(g)).toBe(1);
    expect(ledgerRows(g)[0]).toMatchObject({ key: 'repeat', left: 50000, interest: 3000 });
    expect(ledgerGoal(g)).toMatchObject({ cur: 0, need: 50000, cut: 3000 });
    expect(interestCut(g, 100000)).toBe(3000 + 2000);
  });
  it('장부의 이야기: 6% 지움 → 빌린 돈 다 갚음 → 엄마 빚 20만 → 10만 → 완납', () => {
    const g = afterTutorial();
    const pay = (amount: number) => { const before = clone(g); for (let i = 0; i < amount / 10000; i++) A(g, { type: 'stamp', lender: 'shark1', mult: 1 }); return ledgerBeat(before, g); };
    expect(pay(50000)).toBeNull();
    expect(pay(50000)).toBe('repeatCleared');
    expect(pay(100000)).toBe('firstCleared');
    expect(ledgerGoal(g)!.label).toContain('엄마 빚 30만 남음');
    expect(pay(50000)).toBeNull();
    expect(pay(50000)).toBe('mom20');
    expect(pay(100000)).toBe('mom10');
    expect(pay(100000)).toBe('momCleared');
    expect(ledgerGoal(g)).toBeNull();
    expect(goldStamps(g)).toBe(10);
    for (const b of ['repeatCleared', 'firstCleared', 'mom20', 'mom10', 'momCleared']) expect(STORY.ledger(b, { cut: 6000, otherDebt: 0 }).length).toBeGreaterThanOrEqual(1); // 엄마 빚 20만·10만은 한 줄(단서는 momClue 가 따로, U-39 ⑫)
    expect(STORY.ledger('momCleared', { cut: 0, otherDebt: 50000 }).at(-1)!.who).toBe('hero');
  });
  it('남은 빚이 5만보다 적으면 목표는 남은 만큼', () => {
    const g = fresh();
    g.run.cash = 300_000;
    for (let i = 0; i < 27; i++) A(g, { type: 'stamp', lender: 'shark1', mult: 1 });
    expect(ledgerGoal(g)).toMatchObject({ cur: 20000, need: 50000 });
    for (let i = 0; i < 2; i++) A(g, { type: 'stamp', lender: 'shark1', mult: 1 });
    expect(ledgerGoal(g)).toMatchObject({ cur: 40000, need: 50000 });
  });
});

describe('새 인물과 규칙', () => {
  afterEach(() => { delete (balance as { act1?: unknown }).act1; });
  it('너구리·독사·부엉이는 저마다 목소리가 있다(U-37). 속보는 소리가 없다', () => {
    for (const w of ['raccoon', 'viper', 'owl'] as const) { expect(WHO_NAME[w]).toBeTruthy(); expect(voiceOf(w)).toBe(VOICES[w]); }
    expect(VOICES.viper.rate).toBeLessThan(VOICES.boss.rate);
    expect(voiceOf('news')).toBeNull();
  });
  it('새 장면의 줄은 전부 아는 사람이 말하고, 숫자가 들어간다', () => {
    const all = [
      ...STORY.overdue({ interest: 14500, nth: 1, tagged: true, seized: false, nothingLeft: false }), ...STORY.hamstersQuit(2), ...STORY.seize({ what: 'mom', off: 4000 }), ...STORY.seize({ what: 'wheel', off: 25000 }),
      ...STORY.waiver(), ...STORY.rateHike({ text: '금리 인상', from: 14500, to: 29000, times: 2 }), ...STORY.capitalSms(), ...STORY.capitalIntro({ amount: 50000, ratePct: 2 }),
      ...STORY.viperSms(), ...STORY.viperOffer({ unit: 200000, got: 120000, ratePct: 8 }), ...STORY.owlRefuse(), ...STORY.marginCall({ name: '도토코인', dir: 1, lev: 50, broke: false }),
    ];
    for (const l of all) { expect(Object.keys(WHO_NAME)).toContain(l.who); expect(l.text.length).toBeGreaterThan(3); }
    expect(STORY.viperOffer({ unit: 200000, got: 120000, ratePct: 8 })[1].text).toBe('20만을 적고, 12만을 드리지. 나머지는 선이자일세.');
    expect(STORY.rateHike({ text: 'x', from: 14500, to: 29000, times: 2 })[1].text).toContain('14,500에서 29,000');
  });
  it('1막 시제품은 친구 규칙을 끈다: 뒷골목 두 번째 대출에 연락처를 묻지 않고, 연체해도 절교가 없다', () => {
    const g = fresh();
    g.run.shark2Open = true;
    expect(friendsOn()).toBe(true);
    A(g, { type: 'borrow', lender: 'shark2' });
    expect(A(g, { type: 'borrow', lender: 'shark2' }).code).toBe('consent');
    (balance as { act1?: unknown }).act1 = { friends: false };
    expect(friendsOn()).toBe(false);
    expect(A(g, { type: 'borrow', lender: 'shark2' }).ok).toBe(true);
    expect(g.run.stats.contacts).not.toBe(true);
    g.run.cash = 0;
    for (let i = 0; i < 2 && !g.run.over; i++) settleOnce(g);
    expect(Object.values(g.run.friends).every((f) => !f.broken)).toBe(true);
    if (g.run.bankruptcy) expect(g.run.bankruptcy.cause).not.toBe('FRIEND');
  });
  it('1막 시제품의 엔딩은 하지 않은 일을 말하지 않는다: 친구·독사·조합이 나오는 엔딩과 대물림 갈래를 거른다', () => {
    (balance as { act1?: unknown }).act1 = { friends: false };
    const g = fresh();
    A(g, { type: 'borrow', lender: 'shark1' });
    g.run.cash = 0;
    for (let i = 0; i < 6 && !g.run.over; i++) settleOnce(g);
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy!.cause).not.toBe('LEGACY');
    expect(g.run.bankruptcy!.cause).not.toBe('FRIEND');
    const e = endingById[g.pendingEnding!.id];
    expect(act1Coherent(e, g)).toBe(true);
    expect(e.title + e.line).not.toMatch(/독사|친구|절교|조합|세무서/);
    // 독사에게 빌린 생에는 독사 엔딩이 다시 후보가 된다
    const viper = endings.find((x) => /독사/.test(x.title + x.line) && !/친구|절교|추천인|세대|가문|유산/.test(x.title + x.line))!;
    expect(act1Coherent(viper, g)).toBe(false);
    g.run.stats['borrow.shark2'] = 1;
    expect(act1Coherent(viper, g)).toBe(true);
  });
  it('조사: 받침에 맞게 붙인다', () => {
    expect(josa('보조 쳇바퀴', '이', '가')).toBe('보조 쳇바퀴가');
    expect(josa('지갑', '이', '가')).toBe('지갑이');
    expect(josa('30,000', '이', '가')).toBe('30,000이');
    expect(josa('944,932', '이', '가')).toBe('944,932가');
  });
});

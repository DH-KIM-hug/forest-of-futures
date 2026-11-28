// 라이트 대출(docs/gdd/LITE_LOANS.md, U-64, U-65): 돈줄마다 금리 하나(오소리 < 캐피탈 < 까마귀), 갚기는 누른 돈줄만,
// 못 낸 돈은 연체 대신 다음 돈줄이 대신 낸다(소개). 소개가 곧 봐주기라 까마귀를 못 내거나 다음 돈줄 한도가 모자라면 연체 없이 그 정산에 파산
import { afterEach, describe, expect, it } from 'vitest';
import { createLiteGame, liteAfterLoan } from '../../src/engine/lite';
import { createGame } from '../../src/engine/game';
import { act } from '../../src/engine/actions';
import { settle, forecast } from '../../src/engine/settlement';
import { interestDue, lenderLimit, lenderRate } from '../../src/engine/selectors';
import { balance, lenderById } from '../../src/engine/data';
import { useGame } from '../../src/store/gameStore';
import { borrowExtra, borrowRoom, knownLenders, payAllLabel, payAllWarn, payAt } from '../../src/ui/proto/loanActs';

const act1 = (on: boolean) => { if (on) (balance as { act1?: unknown }).act1 = { friends: false }; else delete (balance as { act1?: unknown }).act1; };
afterEach(() => act1(false));
const fresh = () => { const g = createLiteGame({ seed: 7 }); liteAfterLoan(g); return g; };
/** 사용자 화면의 자리: 오소리 사무소 20만, 캐피탈 20만(한도), 손에 118,516 */
function shot() {
  const g = fresh();
  for (let i = 0; i < 4; i++) expect(act(g, { type: 'borrow', lender: 'capital' }).ok).toBe(true);
  for (let i = 0; i < 20; i++) act(g, { type: 'stamp', lender: 'shark1', mult: 1 });
  g.run.cash = 118516;
  return g;
}

describe('금리 사다리(U-65)', () => {
  it('라이트: 오소리 0.8% < 캐피탈 1.5% < 까마귀 8%, 본편은 lenders.json 그대로', () => {
    const g = fresh();
    expect(lenderRate(g, 'shark1')).toBe(0.008);
    expect(lenderRate(g, 'capital')).toBe(0.015);
    expect(lenderRate(g, 'shark2')).toBe(0.08);
    const m = createGame({ seed: 7 });
    for (const id of ['shark1', 'capital', 'shark2'] as const) expect(lenderRate(m, id)).toBe(lenderById[id].rate);
  });
  it('돈줄마다 금리 하나: 코인 빚도 새로 빌린 돈도 0.8%, 몫이 갈리지 않는다', () => {
    const g = fresh();
    expect(g.run.debts.shark1.principal).toBe(400000);
    expect(interestDue(g, 'shark1')).toBe(3200);
    expect(borrowExtra(g, 'shark1')).toEqual({ amt: 100000, extra: 800 });
    act(g, { type: 'borrow', lender: 'shark1' });
    expect(g.run.debts.shark1.tranches ?? []).toEqual([]);
    expect(interestDue(g, 'shark1')).toBe(4000);
  });
  it('라이트에는 조합이 없다', () => {
    const g = fresh();
    expect(knownLenders(g, { loanTaken: true, capitalKnown: true, viperKnown: false })).toEqual(['shark1', 'capital']);
  });
});

describe('갚기와 화면 숫자', () => {
  it('오소리에서 갚으면 오소리 빚만 준다', () => {
    const g = fresh();
    for (let i = 0; i < 4; i++) act(g, { type: 'borrow', lender: 'capital' });
    act(g, { type: 'stamp', lender: 'shark1', mult: 1 });
    expect(g.run.debts.shark1.principal).toBe(390000);
    expect(g.run.debts.capital.principal).toBe(200000);
    expect(interestDue(g, 'shark1')).toBe(3120);
  });
  it('사용자 화면의 자리: 이자 1,600 + 3,000, 캐피탈은 한도, 「있는 만큼 갚기」와 경고', () => {
    const g = shot();
    expect(interestDue(g, 'shark1')).toBe(1600);
    expect(interestDue(g, 'capital')).toBe(3000);
    expect(forecast(g).interest).toBe(4600);
    expect(lenderLimit(g, 'capital')).toBe(200000);
    expect(borrowRoom(g, 'capital')).toMatchObject({ room: 0, amt: 0 });
    expect(borrowExtra(g, 'capital')).toBeNull();
    expect(borrowRoom(g, 'shark1').room).toBe(300000);
    expect(payAllLabel(g, 'shark1')).toBe('있는 만큼 갚기');
    // 오소리에 118,516 → 남은 81,484 × 0.8% = 652, 캐피탈 3,000, 생활비 1,000
    expect(payAllWarn(g, 'shark1')).toEqual({ left: 0, short: 652 + 3000 + 1000 });
    // 캐피탈에 → 남은 81,484 × 1.5% = 1,223, 오소리 1,600, 생활비 1,000
    expect(payAllWarn(g, 'capital')).toEqual({ left: 0, short: 1223 + 1600 + 1000 });
    g.run.cash = 250000;
    expect(payAllLabel(g, 'shark1')).toBe('전부 갚기');
  });
  it('갚기 한 줄은 남은 빚을 말한다', () => {
    useGame.getState().setGame(shot());
    let msg = '';
    payAt('shark1', 1, (m) => { msg = m; });
    expect(useGame.getState().g.run.debts.capital.principal).toBe(200000);
    expect(msg).toBe('오소리 사무소에 10,000 갚았다. 남은 빚 190,000');
  });
});

describe('소개(U-65): 못 낸 돈은 다음 돈줄이 대신 낸다', () => {
  it('오소리를 못 내면 캐피탈이 이자와 생활비를 빌려 대신 낸다. 오소리는 깨끗하다', () => {
    const g = fresh();
    g.run.cash = 0;
    settle(g);
    const r = g.run.lastSettlement!;
    expect(g.run.debts.shark1.overdue).toBe(0);
    expect(g.run.debts.shark1.principal).toBe(400000);
    expect(g.run.debts.capital.principal).toBe(4200);
    expect(r.refer).toEqual([{ from: 'shark1', to: 'capital', paid: 4200, signed: 4200, first: true }]);
    expect(r.unpaid).toBe(4200); // 모자랐던 돈은 그대로 적는다
    expect(g.run.over).toBe(false);
  });
  it('캐피탈을 못 내면 까마귀(불법 사채)가 선이자 떼고 대신 낸다', () => {
    const g = fresh();
    act(g, { type: 'borrow', lender: 'capital' }); act(g, { type: 'borrow', lender: 'capital' });
    g.run.cash = 3200; // 오소리 이자만 낸다. 캐피탈 1,500 과 생활비 1,000 이 모자란다
    settle(g);
    const r = g.run.lastSettlement!;
    expect(r.refer).toEqual([
      { from: 'shark1', to: 'capital', paid: 1000, signed: 1000, first: false },
      { from: 'capital', to: 'shark2', paid: 1500, signed: 2500, first: true },
    ]);
    expect(g.run.debts.capital.overdue).toBe(0);
    expect(g.run.debts.shark2.principal).toBe(2500);
    expect(g.run.shark2Open).toBe(true);
  });
  it('까마귀를 못 내면 연체 없이 그 정산에 파산. 엔딩은 까마귀 빚 쪽으로 기운다', () => {
    act1(true);
    const g = fresh();
    g.run.debts.shark1.principal = 0; g.run.debts.shark1.inherited = 0;
    g.run.debts.shark2.principal = 100000;
    g.run.cash = 0;
    settle(g);
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy?.lastLender).toBe('shark2');
    expect(g.pendingEnding?.lite?.tags).toContain('lender:crow');
  });
  it('다음 돈줄의 한도가 모자라 소개가 안 되면 연체 없이 그 정산에 파산', () => {
    act1(true);
    const g = fresh();
    while (act(g, { type: 'borrow', lender: 'capital' }).ok) { /* 캐피탈 한도까지 */ }
    g.run.cash = 0;
    settle(g);
    expect((g.run.lastSettlement?.refer ?? []).some((x) => x.from === 'shark1')).toBe(false);
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy?.lastLender).toBe('shark1');
  });
});

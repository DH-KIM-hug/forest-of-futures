// 라이트 대출 계산(docs/gdd/LITE_LOANS.md): 갚기는 누른 그 돈줄의 빚만 줄이고, 그 안에서는 비싼 몫부터. 이자, 한도, 「있는 만큼 갚기」, 정산 경고의 숫자
import { describe, expect, it } from 'vitest';
import { createLiteGame, liteAfterLoan } from '../../src/engine/lite';
import { act } from '../../src/engine/actions';
import { interestDue, lenderLimit } from '../../src/engine/selectors';
import { forecast } from '../../src/engine/settlement';
import { useGame } from '../../src/store/gameStore';
import { borrowExtra, borrowRoom, payAllLabel, payAllWarn, payAt } from '../../src/ui/proto/loanActs';

/** 사용자 화면의 자리: 오소리 사무소 20만, 캐피탈 20만(한도), 손에 118,516 */
function shot() {
  const g = createLiteGame({ seed: 7 }); liteAfterLoan(g);
  for (let i = 0; i < 4; i++) expect(act(g, { type: 'borrow', lender: 'capital' }).ok).toBe(true);
  for (let i = 0; i < 20; i++) act(g, { type: 'stamp', lender: 'shark1', mult: 1 });
  g.run.cash = 118516;
  return g;
}

describe('라이트 대출 계산', () => {
  it('시작: 코인 빚 30만은 1%, 첫 10만은 1.3%, 다음에 빌리는 10만은 2%', () => {
    const g = createLiteGame({ seed: 7 }); liteAfterLoan(g);
    expect(g.run.debts.shark1.principal).toBe(400000);
    expect(interestDue(g, 'shark1')).toBe(3000 + 1300);
    expect(borrowExtra(g, 'shark1')).toEqual({ amt: 100000, extra: 2000 });
  });
  it('오소리 사무소에서 갚으면 오소리 빚만 준다(캐피탈은 그대로). 비싼 1.3% 몫이 먼저', () => {
    const g = createLiteGame({ seed: 7 }); liteAfterLoan(g);
    for (let i = 0; i < 4; i++) act(g, { type: 'borrow', lender: 'capital' });
    act(g, { type: 'stamp', lender: 'shark1', mult: 1 });
    expect(g.run.debts.shark1.principal).toBe(390000);
    expect(g.run.debts.capital.principal).toBe(200000);
    expect(interestDue(g, 'shark1')).toBe(3000 + 1170);
    for (let i = 0; i < 19; i++) act(g, { type: 'stamp', lender: 'shark1', mult: 1 });
    expect(interestDue(g, 'shark1')).toBe(2000); // 남은 20만은 전부 코인 빚(1%)
  });
  it('사용자 화면의 숫자: 이자 2,000 + 1,340, 한도, 더 빌리면 늘어나는 이자', () => {
    const g = shot();
    expect(interestDue(g, 'shark1')).toBe(2000);
    expect(interestDue(g, 'capital')).toBe(1340);
    expect(forecast(g).interest).toBe(3340);
    expect(lenderLimit(g, 'capital')).toBe(200000);
    expect(borrowRoom(g, 'capital')).toMatchObject({ room: 0, amt: 0 });
    expect(borrowExtra(g, 'capital')).toBeNull();
    expect(borrowRoom(g, 'shark1').room).toBe(300000);
    expect(borrowExtra(g, 'shark1')).toEqual({ amt: 100000, extra: 2000 });
  });
  it('손의 돈이 빚보다 적으면 「있는 만큼 갚기」, 경고는 갚고 난 뒤 이자 + 생활비', () => {
    const g = shot();
    expect(payAllLabel(g, 'shark1')).toBe('있는 만큼 갚기');
    // 오소리에 118,516 → 남은 81,484 × 1% = 815, 캐피탈 1,340, 생활비 1,000
    expect(payAllWarn(g, 'shark1')).toEqual({ left: 0, short: 815 + 1340 + 1000 });
    // 캐피탈에 118,516 → 남은 81,484 × 0.67% = 546, 오소리 2,000, 생활비 1,000
    expect(payAllWarn(g, 'capital')).toEqual({ left: 0, short: 546 + 2000 + 1000 });
    g.run.cash = 250000;
    expect(payAllLabel(g, 'shark1')).toBe('전부 갚기');
  });
  it('갚기 한 줄은 남은 빚을 말한다', () => {
    const g = shot();
    useGame.getState().setGame(g);
    let msg = '';
    payAt('shark1', 1, (m) => { msg = m; });
    expect(useGame.getState().g.run.debts.shark1.principal).toBe(190000);
    expect(useGame.getState().g.run.debts.capital.principal).toBe(200000);
    expect(msg).toBe('오소리 사무소에 10,000 갚았다. 남은 빚 190,000');
  });
});

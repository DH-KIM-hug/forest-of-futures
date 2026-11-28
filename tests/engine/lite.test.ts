// 라이트 모드(?proto=1&lite=1): 선물과 빚만 남긴 생. 쳇바퀴 · 알바 · 채굴 · 집 없이 엔진이 돈다(engine/lite.ts, data/lite.json).
import { afterEach, describe, expect, it } from 'vitest';
import { A, settleOnce, tickN } from './helpers';
import { balance } from '../../src/engine/data';
import { createLiteGame, liteAfterLoan, LITE } from '../../src/engine/lite';
import { createGame } from '../../src/engine/game';
import { forecast } from '../../src/engine/settlement';
import { interestDue, livingDue, stage, totalDebt } from '../../src/engine/selectors';
import { tradeGate } from '../../src/engine/progression';
import { processPrice } from '../../src/engine/futures';
import { canRetireAct1 } from '../../src/engine/act1Retire';

const act1 = (on: boolean) => { if (on) (balance as { act1?: unknown }).act1 = { friends: false }; else delete (balance as { act1?: unknown }).act1; };
afterEach(() => act1(false));

describe('라이트의 시작', () => {
  it('손에 0, 코인 빚 30만(오소리 금리 0.8%, U-65), 쳇바퀴 · 지갑 · 설비가 없다', () => {
    const g = createLiteGame({ seed: 3 });
    const r = g.run;
    expect(r.lite).toBe(true);
    expect(r.cash).toBe(0);
    expect(Object.keys(r.coinWheels)).toEqual([]);
    expect(r.equipment).toEqual([]);
    expect(r.debts.shark1.principal).toBe(300_000);
    expect(totalDebt(r)).toBe(300_000);
    expect(interestDue(g, 'shark1')).toBe(2_400);
    expect(livingDue(g)).toBe(LITE.livingPerSettle);
    expect(r.settleIn).toBe(LITE.firstVisitSec);
    expect(r.intro).toBe(false);
  });
  it('공용 시작은 그대로다(엄마의 쳇바퀴 한 대, 생활비 330)', () => {
    const g = createGame({ seed: 3 });
    expect(g.run.lite).toBeUndefined();
    expect(Object.keys(g.run.coinWheels)).toEqual(['DTC']);
    expect(livingDue(g)).toBe(330);
  });
  it('쳇바퀴가 없어도 시세는 열린다: 폰(FRX 계좌)이 없으면 읽기, 열면 주문', () => {
    const g = createLiteGame();
    expect(stage(g.run)).toBe(1);
    expect(tradeGate(g).mode).toBe('readonly');
    A(g, { type: 'borrow', lender: 'shark1' });
    expect(A(g, { type: 'openAccount', sponsor: true }).ok).toBe(true);
    expect(tradeGate(g).mode).toBe('orders');
  });
});

describe('라이트의 돈은 빌리기와 거래로만 들어온다', () => {
  it('정산을 몇 번 넘겨도 캔 값은 0, 손의 돈은 청구액만큼만 준다', () => {
    const g = createLiteGame();
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    const f = forecast(g);
    expect(f.mined).toBe(0);
    expect(f.wages).toBe(0);
    const claim = Math.round(f.interest + f.living);
    expect(claim).toBe(2_400 + 800 + 1_000);
    const before = g.run.cash;
    settleOnce(g);
    expect(g.run.lastSettlement!.mined).toBe(0);
    expect(g.run.cash).toBe(before - claim);
    settleOnce(g, 3);
    expect(g.run.cash).toBe(before - claim * 4);
    expect(g.run.over).toBe(false);
  });
  it('거래 없이 버티면 23분쯤 산다(손에 95,800, 정산마다 4,200)', () => {
    const g = createLiteGame();
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    settleOnce(g);
    expect(g.run.cash).toBe(95_800);
    expect(Math.floor(g.run.cash / 4_200)).toBe(22);
  });
  it('200배 한 판이 이기면 이자 몇 번 치가 한 번에 들어온다(시세는 엔진에 넣은 값 그대로)', () => {
    const g = createLiteGame();
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    A(g, { type: 'signWaiver' });
    const r = A(g, { type: 'open', market: 'FLY', dir: 1, lev: 200, marginPct: 25, sl: null, tp: null });
    expect(r.ok).toBe(true);
    const p0 = g.run.prices.FLY;
    g.run.prices.FLY = p0 * 1.004;
    processPrice(g, 'FLY', g.run.prices.FLY);
    const cash0 = g.run.cash;
    expect(A(g, { type: 'close', market: 'FLY' }).ok).toBe(true);
    expect(g.run.cash - cash0).toBeGreaterThan(5_300 * 5);
  });
});

describe('라이트의 정산 · 연체 · 파산', () => {
  it('손에 0으로 버티면 소개의 사다리를 내려간다(U-65): 캐피탈, 까마귀, 그다음 밀리면 끝(3분)', () => {
    act1(true);
    const g = createLiteGame();
    settleOnce(g); // 오소리 이자 + 생활비 3,400 → 캐피탈이 대신 낸다
    expect(g.run.debts.shark1.overdue).toBe(0);
    expect(g.run.debts.capital.principal).toBe(3_400);
    settleOnce(g); // 또 3,400 캐피탈, 캐피탈 이자 51 → 까마귀(선이자 40%라 장부엔 85)
    expect(g.run.debts.capital.principal).toBe(6_800);
    expect(g.run.debts.shark2.principal).toBe(85);
    expect(g.run.debts.capital.overdue).toBe(0);
    expect(g.run.over).toBe(false);
    settleOnce(g); // 까마귀는 넘길 곳이 없다: 연체 없이 파산(소개가 곧 봐주기)
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy?.lastLender).toBe('shark2');
    expect(g.run.bankruptcy).not.toBeNull();
    expect(g.pendingEnding).not.toBeNull();
  });
  it('200배 몰빵이 청산되고 오소리와 캐피탈 한도까지 다 빌려 쓰면, 소개할 곳이 없어 그 정산에 바로 파산한다(U-65: 연체 없음)', () => {
    act1(true);
    const g = createLiteGame();
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    A(g, { type: 'signWaiver' });
    expect(A(g, { type: 'open', market: 'FLY', dir: 1, lev: 200, marginPct: 100, sl: null, tp: null }).ok).toBe(true);
    const px = g.run.prices.FLY;
    for (let k = 1; k <= 20 && g.run.positions.FLY; k++) { g.run.prices.FLY = px * (1 - 0.001 * k); processPrice(g, 'FLY', g.run.prices.FLY); }
    expect(g.run.positions.FLY).toBeUndefined();
    expect(g.run.cash).toBeLessThan(1_000);
    // 오소리가 아직 더 빌려주니 그 자리 파산은 아니다
    expect(g.run.over).toBe(false);
    g.run.prices.FLY = px;
    // 한도(50만)까지 더 빌려 다 잃었다고 치고 손을 비운다
    while (A(g, { type: 'borrow', lender: 'shark1' }).ok) { /* 한도까지 */ }
    while (A(g, { type: 'borrow', lender: 'capital' }).ok) { /* 캐피탈도 한도까지: 소개가 안 된다 */ }
    g.run.cash = 0;
    settleOnce(g);
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy?.lastLender).toBe('shark1');
    expect(g.pendingEnding?.title).toBeTruthy();
  });
  it('오소리 한도까지 다 쓴 뒤의 몰빵 청산은 그 자리에서 파산이다', () => {
    act1(true);
    const g = createLiteGame();
    while (A(g, { type: 'borrow', lender: 'shark1' }).ok) { /* 한도까지 */ }
    A(g, { type: 'openAccount', sponsor: true });
    A(g, { type: 'signWaiver' });
    expect(A(g, { type: 'open', market: 'FLY', dir: -1, lev: 200, marginPct: 100, sl: null, tp: null }).ok).toBe(true);
    const px = g.run.prices.FLY;
    for (let k = 1; k <= 20 && !g.run.over; k++) { g.run.prices.FLY = px * (1 + 0.001 * k); processPrice(g, 'FLY', g.run.prices.FLY); }
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy?.immediate).toBe(true);
  });
  it('빚을 다 갚으면 은퇴할 수 있다(성공의 길)', () => {
    act1(true);
    const g = createLiteGame();
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    g.run.cash += 600_000; // 거래로 딴 셈
    expect(A(g, { type: 'stamp', lender: 'shark1', mult: 'all' }).ok).toBe(true);
    expect(totalDebt(g.run)).toBe(0);
    expect(canRetireAct1(g)).toBe(true);
    tickN(g, 2);
    expect(g.run.over).toBe(false);
  });
});

describe('라이트의 다음 생', () => {
  it('첫 대출을 받은 자리에서 연다: 빚 40만, 손에 10만, 폰 열림, 쳇바퀴 없음', () => {
    const g = createLiteGame();
    liteAfterLoan(g);
    expect(g.run.cash).toBe(100_000);
    expect(totalDebt(g.run)).toBe(400_000);
    expect(g.run.futures.open).toBe(true);
    expect(Object.keys(g.run.coinWheels)).toEqual([]);
    expect(stage(g.run)).toBe(2);
  });
});

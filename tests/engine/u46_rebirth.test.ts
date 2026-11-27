// U-46: 1막의 새 생은 첫 생의 튜토리얼이 끝난 자리에서 시작한다(사용자: "환생할 때 딱 튜토리얼 끝난 시점으로 환생해야 하지 않을까. 알바도 있고 돈도 그때고.")
import { afterEach, describe, expect, it } from 'vitest';
import { A, fresh, settleOnce } from './helpers';
import { balance } from '../../src/engine/data';
import { applyPostTutorial } from '../../src/engine/act1Start';
import { processPrice, marginFromPct } from '../../src/engine/futures';
import { interestDue, totalDebt } from '../../src/engine/selectors';
import { feeEventLeft, feeRate } from '../../src/engine/skilltree';
import { clone } from '../../src/engine/game';
import type { GameState } from '../../src/engine/types';

const act1 = (on: boolean) => { if (on) (balance as { act1?: unknown }).act1 = { friends: false }; else delete (balance as { act1?: unknown }).act1; };
afterEach(() => act1(false));

/** 첫 생의 길 그대로(엔진 행동): 추심원 → 사무소 10만 → 첫 정산 → 알바 → 쳇바퀴 → 알바 → 전재산 10배 롱 → 짜 둔 시세로 청산 → 10만 더(2%, U-47 전 6%) */
function firstLifeAfterTutorial(): GameState {
  const g = fresh();
  A(g, { type: 'borrow', lender: 'shark1' });
  A(g, { type: 'openAccount', sponsor: true });
  settleOnce(g);
  A(g, { type: 'hire', coin: 'DTC' });
  A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' });
  A(g, { type: 'hire', uid: g.run.equipment[0].uid });
  const margin = marginFromPct(g.run.cash, 10, 100, feeRate(g, 10, { allIn: true }));
  expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin, sl: null, tp: null }).ok).toBe(true);
  const real = g.run.prices.DTC;
  for (let k = 1; k <= 24 && g.run.positions.DTC; k++) { const px = real * (1 - 0.0075 * k); g.run.prices.DTC = px; processPrice(g, 'DTC', px); }
  expect(g.run.positions.DTC).toBeUndefined();
  g.run.prices.DTC = real;
  if (g.run.cash < 1) g.run.cash = 0;
  A(g, { type: 'borrow', lender: 'shark1' });
  return g;
}
const view = (g: GameState) => ({
  cash: Math.round(g.run.cash), debt: totalDebt(g.run), shark1: g.run.debts.shark1.principal, inherited: g.run.debts.shark1.inherited,
  interest: interestDue(g, 'shark1'), phone: g.run.futures.open, mom: !!g.run.coinWheels.DTC?.staffed,
  extras: g.run.equipment.map((u) => `${u.tier}:${u.staffed ? 'staffed' : 'idle'}`), wheels: Object.keys(g.run.coinWheels),
});

describe('새 생 = 튜토리얼이 끝난 자리 (U-46)', () => {
  it('엔진 길로 만든 첫 생의 튜토리얼 끝과 같다: 손에 100,000 · 빚 50만(엄마 30만 + 1.3% 10만 + 2% 10만) · 이자 4,800(U-47) · 폰 · 쳇바퀴 둘에 알바 둘', () => {
    act1(true);
    const a = firstLifeAfterTutorial();
    const b = fresh(); applyPostTutorial(b);
    expect(view(b)).toEqual(view(a));
    expect(view(b)).toMatchObject({ cash: 100_000, debt: 500_000, interest: 4_800, phone: true, mom: true, extras: ['wheel2:staffed'] });
  });
  it('다른 것은 둘: 정산 시계와 오픈 기념(정산 60번, U-47)이 새로 시작한다. 튜토리얼의 청산은 기록에 없다', () => {
    act1(true);
    const a = firstLifeAfterTutorial();
    const b = fresh(); applyPostTutorial(b);
    expect(feeEventLeft(b.run)).toBe(60);
    expect(feeEventLeft(a.run)).toBe(59);
    expect(b.run.settleIn).toBe(balance.settlement.intervalSec);
    expect((b.run.stats.liqCount as number | undefined) ?? 0).toBe(0);
  });
  it('환생(startNextGeneration)이 그 자리를 만든다', async () => {
    act1(true);
    const { startNextGeneration, BRANCHES_AFTER_BANKRUPT } = await import('../../src/engine/generation');
    const g = fresh();
    const b = clone(g); applyPostTutorial(b);
    // 파산 → 명세서 → 갈래 → 나무: 엔진의 환생 단계를 그대로 밟는다
    g.run.cash = 0; A(g, { type: 'borrow', lender: 'shark1' }); g.run.cash = 0;
    for (let i = 0; i < 12 && !g.run.over; i++) settleOnce(g);
    expect(g.run.over).toBe(true);
    expect(A(g, { type: 'estateNext' }).ok).toBe(true);
    const br = g.estate!.kind === 'retire' ? 'gift' : (BRANCHES_AFTER_BANKRUPT[0] as string);
    expect(A(g, { type: 'inherit', branch: br as never }).ok).toBe(true);
    expect(startNextGeneration(g).ok).toBe(true);
    expect(view(g)).toMatchObject({ cash: 100_000, debt: 500_000, phone: true, mom: true, extras: ['wheel2:staffed'] });
  });
});

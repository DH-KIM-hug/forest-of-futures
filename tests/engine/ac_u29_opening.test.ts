// U-29·U-30·U-31 새 시작: 줍기 없이 쳇바퀴에서. 현금 0, 엄마 빚 30만(오소리, 옛 이자 1.5%). 아무리 굴려도 첫 정산의 이자 + 생활비를 못 낸다.
// 추심원의 권유(오소리 10만 더, 4%)를 받으면 그 돈에서 이자가 나가고 중고폰(선물 계좌)이 딸려 온다. 폰이 있어야 알바를 부른다.
// 빌린 돈으로 보조 쳇바퀴(50,000 고정)를 놓고 알바(일당 1,600 고정)를 쓴다. 거절하면 연체 -> 딱지 -> 쳇바퀴 압류 -> 파산.
// 오소리의 두 번째 대출부터는 6%(U-31): 첫 대출 뒤에는 조금 남고, 거래로 잃고 한 번 더 빌리면 정산마다 모자란다.
// 엔진 행동만 쓴다(tap · borrow · openAccount · buyEquip · hire · stamp · 틱). 현금을 쥐여 주는 곳은 '기준판'이라고 적었다.
import { afterEach, describe, expect, it } from 'vitest';
import { A, fresh, tickN, tickOf } from './helpers';
import { stepMut } from '../../src/engine/game';
import { balance, lenderById, upgradeTracks } from '../../src/engine/data';
import { interestDue, livingDue, ownedCoins, stage, totalDebt } from '../../src/engine/selectors';
import { forecast } from '../../src/engine/settlement';
import { affordableUpgrades } from '../../src/engine/upgrades';
import { nextTierCost, tapValue, tierBlockReason } from '../../src/engine/equipment';
import { seizeFor } from '../../src/engine/seizure';
import type { GameState } from '../../src/engine/types';
import { marginFromPct, processPrice } from '../../src/engine/futures';
import { feeRate } from '../../src/engine/skilltree';

const NORMAL = balance.settlement.intervalSec as number;
const MAX_TAPS = balance.progression.maxTapsPerSec as number;
afterEach(() => { balance.settlement.intervalSec = NORMAL; });

/** 정산 직전(마지막 틱만 남김)까지 초당 perSec 번 굴린다. each 는 탭마다 부른다(무엇을 사 보는 시험용). */
function grind(g: GameState, perSec = MAX_TAPS, each?: () => void): void {
  const sec = g.run.settleIn;
  for (let t = 0; t < sec; t++) {
    for (let i = 0; i < perSec; i++) { A(g, { type: 'tap' }); each?.(); }
    if (t < sec - 1) tickN(g, 1);
  }
}
const claimOf = (g: GameState) => interestDue(g, 'shark1') + interestDue(g, 'capital') + livingDue(g);
const debts = (g: GameState) => Object.fromEntries(Object.entries(g.run.debts).map(([id, d]) => [id, d.principal]));
/** 추심원의 권유를 받는다: 정산 직전에 오소리 10만 + 중고폰(선물 계좌). */
function acceptLoan(g: GameState): void {
  expect(A(g, { type: 'borrow', lender: 'shark1' })).toMatchObject({ ok: true, amount: 100000 });
  expect(A(g, { type: 'openAccount', sponsor: true }).ok).toBe(true);
}

describe('U-29·U-30·U-31 시작: 쳇바퀴 · 현금 0 · 오소리 30만 -> 빌려서 쳇바퀴와 알바', () => {
  it('a. 시작 상태: 현금 0, 도토코인 쳇바퀴(바로 팔기·타는 중), 빚은 물려받은 오소리 30만뿐, 정산마다 이자 4,500 + 생활비 1,000', () => {
    const g = fresh();
    expect(g.run.cash).toBe(0);
    expect(stage(g.run)).toBe(1);
    expect(ownedCoins(g.run)).toEqual(['DTC']);
    expect(g.run.coinWheels.DTC).toMatchObject({ on: true, autoSell: true, tagBy: null });
    expect(g.run.coinWheels.DTC.staffed ?? false).toBe(false);
    expect(g.run.riding).toBe('DTC');
    expect(g.run.equipment).toEqual([]);
    expect(debts(g)).toEqual({ bank: 0, capital: 0, shark1: 300000, shark2: 0, tax: 0 });
    expect(g.run.debts.shark1).toMatchObject({ inherited: 300000, rateCap: 0.015, overdue: 0 });
    expect(interestDue(g, 'shark1')).toBe(4500); // 300,000 × 1.5%
    expect(livingDue(g)).toBe(1000);
    expect(claimOf(g)).toBe(5500);
    expect(forecast(g)).toMatchObject({ mined: 0, power: 0, wages: 0, interest: 4500, living: 1000, net: -5500 });
    expect(tapValue(g, 'DTC')).toBe(2);
    expect(g.run.futures.open).toBe(false);
    console.log('[a] 시작: 현금 0 · 오소리 300,000(옛 이자 1.5%) · 첫 청구 = 이자 4,500 + 생활비 1,000 = 5,500 · 탭 1번 = 2');
  });

  for (const sec of [180, 20]) {
    it(`b. 정산 ${sec}초: 초당 12번으로 끝까지 굴려도 첫 청구 5,500 에 못 미치고, 현금 0 에서 이를 바꿀 길이 없다`, () => {
      balance.settlement.intervalSec = sec;
      const g = fresh();
      expect(g.run.settleIn).toBe(sec);
      // 시작할 때: 알바는 폰이 없어 못 부르고, 폰(계좌)은 빌려야 생기고, 보조 쳇바퀴는 돈이 없다
      expect(A(g, { type: 'hire', coin: 'DTC' })).toMatchObject({ ok: false, code: 'nophone' });
      expect(A(g, { type: 'openAccount', sponsor: true })).toMatchObject({ ok: false, code: 'sponsor' });
      expect(A(g, { type: 'openAccount' }).ok).toBe(false);
      expect(tierBlockReason(g, 'wheel2', 'DTC')).toBe('현금 부족');
      expect(upgradeTracks.some((t) => t.scope === 'body' || t.effect.stat === 'mineTap')).toBe(false); // 탭을 올리는 강화는 없다
      grind(g);
      const taps = sec * MAX_TAPS;
      expect(g.run.stats.laborTaps).toBe(taps);
      expect(g.run.settleNo).toBe(0);
      const best = g.run.cash;
      expect(best).toBe(Math.floor(taps * 2 * 0.995)); // 탭 수 × 2 × (1 − 수수료 0.5%)
      expect(best).toBe(sec === 180 ? 4298 : 477);
      const claim = claimOf(g);
      expect(claim).toBe(5500);
      expect(best).toBeLessThan(claim * 0.8);
      expect(A(g, { type: 'hire', coin: 'DTC' })).toMatchObject({ ok: false, code: 'nophone' });
      expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(false);
      // 번 돈으로 살 수 있는 강화를 사는 족족 사 봐도(기름칠·관성 바퀴·절전) 정산 때 들어올 것까지 쳐서 청구에 못 미친다
      const tried: string[] = [];
      for (const track of ['oil', 'spokes', 'power']) {
        const h = fresh();
        grind(h, MAX_TAPS, () => { if (affordableUpgrades(h.run).some((u) => u.track === track)) { A(h, { type: 'upgrade', track, target: 'DTC' }); } });
        const lv = h.run.upgrades.coinWheel.DTC?.[track] ?? 0;
        tried.push(`${track} Lv${lv}: ${h.run.cash} + 정산 채굴 ${forecast(h).mined}`);
        expect(h.run.cash + forecast(h).mined).toBeLessThan(claimOf(h));
        expect(h.run.cash + forecast(h).mined).toBeLessThanOrEqual(best);
      }
      console.log(`[b] 정산 ${sec}초: 최대 탭 ${taps}번 × 2 × 0.995 = ${best} < 청구 ${claim} (${((best / claim) * 100).toFixed(0)}%). 강화를 사 보면 더 적다 -> ${tried.join(' / ')}`);
      // 그대로 정산을 맞으면 연체
      tickN(g, 1);
      expect(g.run.settleNo).toBe(1);
      expect(g.run.cash).toBe(0);
      expect(g.run.debts.shark1).toMatchObject({ principal: 300000 + 4500 - best, overdue: 1 });
    });
  }

  it('c. 받는다: 정산 직전에 오소리 10만 -> 빚 40만, 그 정산 이자 8,500(옛 30만 4,500 + 새 10만 4,000) + 생활비 1,000 을 다 내고, 폰(계좌)이 딸려 온다', () => {
    const g = fresh();
    grind(g);
    const taps = g.run.cash; // 4,298
    expect(lenderById.shark1.borrowUnit).toBe(100000);
    expect(A(g, { type: 'openAccount', sponsor: true })).toMatchObject({ ok: false, code: 'sponsor' }); // 빌리기 전에는 폰이 없다
    expect(A(g, { type: 'borrow', lender: 'shark1' })).toMatchObject({ ok: true, amount: 100000 });
    expect(g.run.debts.shark1).toMatchObject({ principal: 400000, inherited: 300000 });
    expect(interestDue(g, 'shark1')).toBe(8500);
    expect(A(g, { type: 'openAccount', sponsor: true }).ok).toBe(true);
    expect(g.run.futures).toMatchObject({ open: true, levCap: 10 });
    expect(A(g, { type: 'openAccount', sponsor: true }).ok).toBe(false); // 한 번만
    tickN(g, 1);
    expect(g.run.settleNo).toBe(1);
    expect(g.run.lastSettlement).toMatchObject({ interest: 8500, living: 1000, paid: 9500, unpaid: 0, wages: 0 });
    expect(g.run.cash).toBe(taps + 100000 - 9500);
    expect(g.run.debts.shark1).toMatchObject({ principal: 400000, overdue: 0 });
    expect(g.run.debts.capital.principal).toBe(0);
    expect(g.run.coinWheels.DTC.tagBy).toBeNull();
    expect(stage(g.run)).toBe(2);
    console.log(`[c] 받는다: 탭 ${taps} + 100,000 − (이자 8,500 + 생활비 1,000) = ${g.run.cash} · 빚 400,000 · 다음 이자 ${interestDue(g, 'shark1')}`);
  });

  /** 주인의 각본: 초당 3번 굴리다 첫 정산에 빌리고, 보조 쳇바퀴 1대 + 알바 2마리. 그 상태로 한 정산을 더 돈 판을 돌려준다. */
  function phaseA() {
    const g = fresh();
    grind(g, 3);
    acceptLoan(g);
    tickN(g, 1);
    const afterLoan = g.run.cash; // 1,074 + 100,000 − 9,500
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' })).toMatchObject({ ok: true, amount: 50000 });
    const w2 = g.run.equipment[0];
    expect(w2.staffed).toBe(false);
    expect(forecast(g).mined).toBe(0); // 알바가 없으면 놓아만 둔 쳇바퀴
    expect(A(g, { type: 'hire', coin: 'DTC' })).toMatchObject({ ok: true, amount: 1600 });
    expect(A(g, { type: 'hire', uid: w2.uid })).toMatchObject({ ok: true, amount: 1600 });
    expect(A(g, { type: 'hire', uid: w2.uid })).toMatchObject({ ok: false, code: 'staffed' });
    const afterBuy = g.run.cash;
    return { g, afterLoan, afterBuy };
  }
  /** 한 정산을 돈다. 쳇바퀴 둘에 다 알바가 들어 있어 주인공은 굴릴 수 없다(U-43: 굴리기는 'staffed' 로 거절된다 → tapped 0).
   *  캐는 값은 틱마다 조금씩 들어오고(U-43), 정산은 걷어 가기만 한다. sold = 그 구간에 캐서 판 돈 = 현금 변화 + 낸 돈 + 일당. */
  function oneSettle(g: GameState) {
    const c0 = g.run.cash;
    const taps0 = (g.run.stats.laborTaps as number | undefined) ?? 0;
    expect(A(g, { type: 'tap' })).toMatchObject({ ok: false, code: 'staffed' });
    grind(g, 3);
    const tapped = (((g.run.stats.laborTaps as number | undefined) ?? 0) - taps0) * 2;
    expect(tapped).toBe(0);
    const mid = g.run.cash; // 정산 직전: 캐는 값이 벌써 거의 다 들어와 있다
    tickN(g, 1);
    const rep = g.run.lastSettlement!;
    const sold = g.run.cash - c0 + rep.paid + rep.wages;
    expect(mid - c0).toBeGreaterThan(sold * 0.98); expect(mid - c0).toBeLessThanOrEqual(sold);
    return { tapped, rep, delta: g.run.cash - c0, sold };
  }

  it('d-A. 첫 대출 뒤(빚 40만): 보조 쳇바퀴 1대(50,000) + 알바 2마리면(탭 없이, U-43) 한 정산 수입이 이자 8,500 + 생활비 1,000 을 조금 넘고, 사고 난 직후 현금은 3만 이상', () => {
    const { g, afterLoan, afterBuy } = phaseA();
    expect(afterLoan).toBe(Math.floor(540 * 2 * 0.995) + 100000 - 9500);
    expect(afterBuy).toBe(afterLoan - 50000); // 알바를 들이는 값은 없다
    expect(afterBuy).toBeGreaterThanOrEqual(30000);
    expect(forecast(g)).toMatchObject({ mined: 13000, power: 0, wages: 3200, interest: 8500, living: 1000, net: 300 }); // 알바가 든 쳇바퀴는 내가 못 굴린다: 탭 없이 +300(바로 팔기 수수료를 떼면 +235)
    const r = oneSettle(g);
    expect(r.rep).toMatchObject({ mined: 13000, wages: 3200, quit: 0, interest: 8500, living: 1000, unpaid: 0 });
    expect(r.sold).toBeGreaterThanOrEqual(12934);
    expect(r.sold).toBeLessThanOrEqual(12935); // 13,000 × 0.995 — 틱마다 나눠 들어와도 한 구간의 합은 예전과 같다(U-43)
    { const r2 = oneSettle(g); expect(r2.rep.mined).toBeCloseTo(13000, 3); expect(r2.sold).toBeGreaterThanOrEqual(12934); expect(r2.sold).toBeLessThanOrEqual(12935); expect(r2.delta).toBe(r2.sold - 3200 - 9500); expect(r2.delta).toBeGreaterThanOrEqual(234); }
    const income = r.sold - 3200 + r.tapped;
    expect(income).toBeGreaterThan(9500);
    expect(income - 9500).toBeLessThan(2000); // '조금' 넘는다(+235)
    expect(income - 9500).toBeGreaterThanOrEqual(200);
    expect(r.delta).toBe(income - 9500);
    console.log(`[d-A] 대출 직후 ${afterLoan} -> 보조 쳇바퀴 −50,000 = ${afterBuy}(≥ 30,000). 한 정산: 알바 2마리 ${r.sold} − 일당 3,200 + 탭 ${r.tapped} = ${income} > 이자 8,500 + 생활비 1,000 = 9,500 -> 정산당 +${r.delta} (초당 +${(r.delta / 180).toFixed(1)}), 현금 ${afterBuy} -> ${g.run.cash}`);
  });

  it('d-B. 튜토리얼 거래에 전재산을 걸어 잃고(U-43) 한 번 더 빌리면(빚 50만 · 두 번째 10만은 6%): 손에 꼭 100,000. 이자 14,500 + 생활비 1,000 에 정산마다 모자라 15~25번의 정산 뒤 바닥난다', () => {
    const { g } = phaseA();
    oneSettle(g);
    // 튜토리얼 거래(시제품 tutorial.ts 와 같은 식, U-43 사용자: "걍 전재산 넣으면 되잖아"): 도토코인 10배 롱, 증거금 = 가진 돈 전부(들어갈 때 수수료만큼 뺀다).
    // 시제품은 그동안 시계를 멈추고 짜 둔 시세를 processPrice 로 먹인다(틱이 없으니 알바가 캔 돈도 그 사이엔 안 들어온다).
    const c0 = g.run.cash;
    const margin = marginFromPct(c0, 10, 100, feeRate(g, 10, { allIn: true }));
    expect(margin).toBeGreaterThan(40000);
    const p0 = g.run.prices.DTC;
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin, sl: null, tp: null }).ok).toBe(true);
    processPrice(g, 'DTC', p0 * 0.85);
    g.run.prices.DTC = p0;
    expect(Object.keys(g.run.positions)).toEqual([]);
    expect(g.run.lastClose).toMatchObject({ market: 'DTC', liq: true });
    expect(g.run.cash).toBeLessThan(1); // 남은 것은 1초씩 들어온 돈의 끝자리뿐
    if (g.run.cash < 1) g.run.cash = 0; // tutorial.ts finish 와 같다
    const lost = c0;
    expect(g.run.over).toBe(false);
    // 두 번째 대출
    expect(A(g, { type: 'borrow', lender: 'shark1' })).toMatchObject({ ok: true, amount: 100000 });
    expect(g.run.cash).toBe(100000); // 손에 꼭 10만
    expect(g.run.debts.shark1).toMatchObject({ principal: 500000, inherited: 300000, tranches: [{ amount: 100000, rate: 0.06 }] });
    expect(interestDue(g, 'shark1')).toBe(14500); // 4,500 + 4,000 + 6,000
    expect(claimOf(g)).toBe(15500);
    expect(lenderById.shark1.limitByHouse![0]).toBe(500000); // 빈 오두막 한도 끝: 오소리에서는 더 못 빌린다
    expect(A(g, { type: 'borrow', lender: 'shark1' }).ok).toBe(false);
    const start = g.run.cash;
    const first = oneSettle(g);
    expect(first.rep).toMatchObject({ interest: 14500, living: 1000, wages: 3200, quit: 0, unpaid: 0 });
    const income = first.sold - 3200 + first.tapped;
    expect(income).toBeLessThan(15500);
    expect(first.delta).toBe(income - 15500);
    let n = 1;
    let why = '';
    while (n < 60) {
      const r = oneSettle(g);
      if (r.rep.unpaid > 0 || r.rep.quit > 0) { why = r.rep.unpaid > 0 ? `이자·생활비 ${r.rep.unpaid} 미납` : `알바 ${r.rep.quit}마리 나감`; break; }
      n += 1;
    }
    // "살짝 조여짐"(U-31): 거래 없이 15~25번의 정산(45~75분)
    expect(n).toBeGreaterThanOrEqual(15);
    expect(n).toBeLessThanOrEqual(25);
    console.log(`[d-B] 튜토리얼 거래에 전재산 ${margin}(현금 ${Math.round(lost)}) -> 청산, 손에 0 -> 두 번째 대출 +100,000 = 현금 ${start}, 빚 500,000, 이자 14,500(4,500 + 4,000 + 6,000). 한 정산 수입 ${income} < 청구 15,500 -> 정산당 ${first.delta} (초당 ${(first.delta / 180).toFixed(1)}). 거래도 구입도 없이 N = ${n}번의 정산을 다 내고 ${n + 1}번째에 ${why} (약 ${((n + 1) * 3)}분)`);
  });

  it('e. 값과 일당은 늘지 않는다: 보조 쳇바퀴 1~5대째 모두 50,000 · 6대째는 자리 없음 · 일당 한 마리 1,800. 일당을 못 주면 나가고, 압류된 쳇바퀴는 알바째 사라지고, 다시 부를 수 있다', () => {
    const g = fresh();
    acceptLoan(g);
    g.run.cash = 300000; // 기준판: 다섯 대 값을 쥐여 준다
    for (let i = 1; i <= 5; i++) {
      expect(nextTierCost(g.run, 'wheel2')).toBe(50000);
      expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' })).toMatchObject({ ok: true, amount: 50000 });
    }
    expect(g.run.cash).toBe(50000);
    expect(tierBlockReason(g, 'wheel2', 'DTC')).toBe('놓을 자리가 없습니다');
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(false);
    expect(A(g, { type: 'buyEquip', tier: 'helper', coin: 'DTC' })).toMatchObject({ ok: false, msg: '집에 들일 수 없는 설비입니다' });
    expect(forecast(g).wages).toBe(0);
    expect(A(g, { type: 'hire', coin: 'DTC' }).ok).toBe(true);
    for (let i = 0; i < 5; i++) {
      expect(forecast(g).wages).toBe(1600 * (i + 1)); // 한 마리마다 꼭 1,800
      expect(A(g, { type: 'hire', uid: g.run.equipment[i].uid })).toMatchObject({ ok: true, amount: 1600 });
    }
    expect(g.run.cash).toBe(50000); // 들이는 값 없음
    expect(forecast(g)).toMatchObject({ mined: 39000, wages: 9600, power: 0 });
    // 코인을 팔지 않고 쌓는 채(바로 팔기 끔) 현금이 이자 + 생활비 + 일당 두 마리분뿐이면 넷이 나간다
    A(g, { type: 'autoSell', coin: 'DTC', on: false });
    g.run.cash = 8500 + 1000 + 1600 * 2 + 100; // 기준판
    tickN(g, g.run.settleIn);
    expect(g.run.lastSettlement).toMatchObject({ mined: 39000, wages: 3200, quit: 4, unpaid: 0 });
    expect(g.run.cash).toBe(100);
    expect(g.run.stats.hamstersQuit).toBe(4);
    expect(totalDebt(g.run)).toBe(400000); // 못 준 일당은 빚으로 남지 않는다
    expect(g.run.coinWheels.DTC.staffed).toBe(true);
    expect(g.run.equipment.map((u) => u.staffed)).toEqual([true, false, false, false, false]);
    expect(forecast(g)).toMatchObject({ mined: 13000, wages: 3200 }); // 빈 쳇바퀴는 돌지 않는다
    // 다시 부른다
    expect(A(g, { type: 'hire', uid: g.run.equipment[1].uid }).ok).toBe(true);
    expect(forecast(g)).toMatchObject({ mined: 19500, wages: 4800 });
    // 압류: 지갑(쌓아 둔 코인) 다음에 싼 설비부터. 실려 간 보조 쳇바퀴는 알바째 사라진다
    g.run.wallet.DTC.qty = 0; // 기준판: 지갑을 비워 설비 차례로
    const first = g.run.equipment[0].uid;
    const r = seizeFor(g, 'shark1')!;
    expect(r).toMatchObject({ what: 'equipment', value: 25000 }); // 50,000 의 50%
    expect(g.run.equipment).toHaveLength(4);
    expect(r.id).toBe(first); // 같은 단계면 잘 도는 것(알바가 붙은 것)부터 가져간다
    expect(g.run.equipment.some((u) => u.uid === first)).toBe(false);
    const staffedLeft = g.run.equipment.filter((u) => u.staffed).length + 1;
    expect(forecast(g).wages).toBe(1600 * staffedLeft);
    expect(nextTierCost(g.run, 'wheel2')).toBe(50000); // 다시 사도 같은 값
    console.log(`[e] 보조 쳇바퀴 5대 = 5 × 50,000 · 6대째 '놓을 자리가 없습니다' · 알바 6마리 일당 ${1600 * 6} (채굴 39,000) · 일당 2마리분만 있으면 4마리 나감(빚 0) · 압류 1대(−25,000, 실려 간 것: ${r.id}) 뒤 일당 ${forecast(g).wages}`);
  });

  for (const loans of [1, 2]) {
    it(`f. 꽉 찬 집(쳇바퀴 6대 · 알바 6마리), 탭·거래 없이 남는 현금을 정산마다 전부 오소리에 갚으면 빚 ${loans === 1 ? '40만' : '50만(두 번째 10만은 6%)'}은 N 번째 정산에 0`, () => {
      const g = fresh();
      acceptLoan(g);
      if (loans === 2) expect(A(g, { type: 'borrow', lender: 'shark1' }).ok).toBe(true);
      const debt0 = totalDebt(g.run);
      const interest0 = interestDue(g, 'shark1');
      expect([debt0, interest0]).toEqual(loans === 1 ? [400000, 8500] : [500000, 14500]);
      g.run.cash = 250000; // 기준판: 꽉 찬 집을 쥐여 준다
      for (let i = 0; i < 5; i++) A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' });
      A(g, { type: 'hire', coin: 'DTC' });
      for (const u of g.run.equipment) A(g, { type: 'hire', uid: u.uid });
      expect(g.run.cash).toBe(0);
      expect(forecast(g)).toMatchObject({ mined: 39000, wages: 9600, interest: interest0, living: 1000, net: 39000 - 9600 - interest0 - 1000 });
      const trail: string[] = [];
      let n = 0;
      while (totalDebt(g.run) > 0 && n < 200) {
        tickN(g, g.run.settleIn);
        n += 1;
        expect(g.run.over).toBe(false);
        expect(g.run.lastSettlement).toMatchObject({ quit: 0, unpaid: 0 });
        for (const id of ['shark1', 'capital'] as const) if (g.run.debts[id].principal > 0 && g.run.cash > 0) A(g, { type: 'stamp', lender: id, mult: 'all' });
        if (n <= 3 || totalDebt(g.run) === 0) trail.push(`${n}회 ${totalDebt(g.run)}`);
      }
      expect(totalDebt(g.run)).toBe(0);
      expect(n).toBeGreaterThan(10);
      expect(n).toBeLessThan(40);
      console.log(`[f] 꽉 찬 집, 빚 ${debt0}: 정산당 채굴 39,000 × 0.995 − 일당 9,600 − 생활비 1,000 − 이자(${interest0}부터 줄어듦). 빚 -> 0 까지 정산 N = ${n}회 (${n * 3}분, 탭·거래 없음). 남은 빚: ${trail.join(' -> ')}. 다 갚은 뒤 현금 ${g.run.cash}`);
    });
  }

  it('g. 거절한다: ① 연체 1 · 못 낸 이자는 원금에 · 쳇바퀴에 딱지(수입 30% 가압류) · 생활비는 캐피탈로 ② 쳇바퀴 압류 ③ 파산', () => {
    const g = fresh();
    grind(g);
    const taps = g.run.cash; // 4,298
    tickN(g, 1);
    // ① 번 돈은 전부 이자로 가고, 못 낸 202 가 원금에 얹힌다
    expect(g.run.settleNo).toBe(1);
    expect(g.run.cash).toBe(0);
    expect(g.run.debts.shark1).toMatchObject({ principal: 300000 + (4500 - taps), inherited: 300000, overdue: 1 });
    expect(g.run.debts.capital).toMatchObject({ principal: 1000, overdue: 0 });
    expect(g.run.coinWheels.DTC.tagBy).toBe('shark1');
    expect(g.run.over).toBe(false);
    const p1 = g.run.debts.shark1.principal;
    // 딱지가 붙은 뒤 탭 수입의 30% 는 원금에서 깎인다(10번 = 20어치 -> 6 은 원금, 14 가 팔린다)
    const c0 = g.run.cash;
    const f0 = g.run.sellFrac;
    for (let i = 0; i < 10; i++) A(g, { type: 'tap' });
    expect(g.run.cash - c0).toBe(Math.floor(f0 + 10 * 2 * 0.7 * 0.995));
    expect(p1 - g.run.debts.shark1.principal).toBe(Math.floor(10 * 2 * 0.3));
    // ② 한 번 더 못 내면(오소리는 2회) 엄마의 쳇바퀴가 실려 간다(값 10,000 의 50% 만 원금에서 빠진다)
    tickN(g, g.run.settleIn);
    expect(g.run.settleNo).toBe(2);
    expect(g.run.over).toBe(false);
    expect(ownedCoins(g.run)).toEqual([]);
    expect(stage(g.run)).toBe(0);
    expect(g.run.stats.assetsSeized).toBe(1);
    expect(g.run.debts.shark1.overdue).toBe(1);
    expect(A(g, { type: 'tap' })).toMatchObject({ ok: false, code: 'nowheel' });
    const p2 = g.run.debts.shark1.principal;
    const c2 = g.run.debts.capital.principal;
    // ③ 가져갈 것이 없는 채로 또 못 내면 파산
    tickN(g, g.run.settleIn);
    expect(g.run.over).toBe(true);
    expect(g.run.settleNo).toBe(3);
    expect(g.run.bankruptcy?.cause).toBeTruthy();
    console.log(`[g] 거절만 하면: ① 오소리 ${p1}(300,000 + 못 낸 ${4500 - taps}) · 연체 1 · 딱지 · 캐피탈 1,000 ② 쳇바퀴 압류 뒤 오소리 ${p2} · 캐피탈 ${c2} ③ 정산 3회째 파산, 원인 ${g.run.bankruptcy?.cause}, 오소리 ${g.run.debts.shark1.principal}`);
  });

  it('g. 거절한 뒤 다음 정산에 받아도 된다: 연체가 풀리고 딱지가 떨어진다', () => {
    const g = fresh();
    tickN(g, g.run.settleIn); // 첫 정산을 그냥 맞는다
    expect(g.run.debts.shark1).toMatchObject({ principal: 304500, overdue: 1 });
    tickN(g, g.run.settleIn - 1);
    acceptLoan(g);
    expect(interestDue(g, 'shark1')).toBe(4500 + 4180); // 옛 30만 × 1.5% + (얹힌 4,500 + 새 10만) × 4%
    tickN(g, 1);
    // 첫 정산에 못 낸 생활비 1,000 이 캐피탈 빚이 되어 그 이자 20 도 같이 나간다
    expect(g.run.lastSettlement).toMatchObject({ interest: 8700, living: 1000, unpaid: 0 });
    expect(g.run.debts.shark1).toMatchObject({ principal: 404500, overdue: 0 });
    expect(g.run.coinWheels.DTC.tagBy).toBeNull();
    expect(g.run.cash).toBe(100000 - 8680 - 20 - 1000);
  });
});

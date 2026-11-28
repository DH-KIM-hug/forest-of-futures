// U-61: 라이트에서 지도 탭을 없애고 대출은 거래소 안 「대출」. 빌리고 갚는 길은 지도와 같은 loanActs.ts, 급할 때 빌리기 말풍선의 조건
import { beforeEach, describe, expect, it } from 'vitest';
import { createLiteGame, liteAfterLoan } from '../../src/engine/lite';
import { clone } from '../../src/engine/game';
import { lenderById } from '../../src/engine/data';
import { nextBorrowRate } from '../../src/engine/selectors';
import { useGame } from '../../src/store/gameStore';
import { useProto } from '../../src/ui/proto/protoStore';
import { borrowAt, borrowRoom, cheapestOpen, knownLenders, payAllWarn, payAt, quickBorrowWhy } from '../../src/ui/proto/loanActs';
import { FT_STEPS } from '../../src/ui/proto/lite/flyTutSteps';

const fresh = () => { const g = createLiteGame({ seed: 7 }); liteAfterLoan(g); return g; };

describe('U-61 아는 돈줄과 가장 싼 열린 곳', () => {
  it('처음엔 오소리 사무소뿐, 캐피탈 문자 뒤 캐피탈과 조합, 뒷골목은 문자와 골목이 열린 뒤', () => {
    const g = fresh();
    expect(knownLenders(g, { loanTaken: false, capitalKnown: true, viperKnown: true })).toEqual(['shark1']);
    expect(knownLenders(g, { loanTaken: true, capitalKnown: false, viperKnown: false })).toEqual(['shark1']);
    expect(knownLenders(g, { loanTaken: true, capitalKnown: true, viperKnown: true })).toEqual(['shark1', 'capital', 'bank']);
    g.run.shark2Open = true;
    expect(knownLenders(g, { loanTaken: true, capitalKnown: true, viperKnown: true })).toEqual(['shark1', 'capital', 'bank', 'shark2']);
  });
  it('조합은 집이 없으면 닫혀 있고, 가장 싼 곳은 남은 한도가 있는 곳 가운데 다음 금리가 낮은 곳', () => {
    const g = fresh();
    if (g.run.house <= 0) expect(borrowRoom(g, 'bank').open).toBe(false);
    const ids = ['shark1', 'capital'] as const;
    const c = cheapestOpen(g, ids)!;
    const open = ids.filter((id) => borrowRoom(g, id).amt > 0);
    const min = Math.min(...open.map((id) => nextBorrowRate(g, id)));
    expect(nextBorrowRate(g, c.id)).toBe(min);
    expect(c.amt).toBe(Math.min(lenderById[c.id].borrowUnit!, borrowRoom(g, c.id).room));
    // 한도를 다 쓰면 그곳은 빠지고, 전부 막히면 없다
    const g2 = clone(g);
    for (const id of ids) g2.run.debts[id].principal = 1e9;
    expect(cheapestOpen(g2, ids)).toBeNull();
  });
});

describe('U-61 급할 때 빌리기 말풍선', () => {
  it('정산 10초 안인데 모자라면 settle, 증거금이 모자라면 order, 아니면 없음', () => {
    const g = fresh();
    expect(quickBorrowWhy(g, { orderShort: false })).toBeNull();
    expect(quickBorrowWhy(g, { orderShort: true })).toBe('order');
    g.run.cash = 0; g.run.settleIn = 8;
    expect(quickBorrowWhy(g, { orderShort: false })).toBe('settle');
    g.run.settleIn = 30;
    expect(quickBorrowWhy(g, { orderShort: false })).toBeNull();
    g.run.over = true;
    expect(quickBorrowWhy(g, { orderShort: true })).toBeNull();
  });
});

describe('U-61 대출 판의 빌리기와 갚기(지도와 같은 엔진 행동)', () => {
  beforeEach(() => {
    useGame.getState().setGame(fresh());
    useProto.getState().patch({ loanTaken: true, scenes: [] });
  });
  it('[빌리기]는 한 단위를 빌리고 이자를 한 줄로 말한다', () => {
    const before = useGame.getState().g;
    const d0 = before.run.debts.shark1.principal, c0 = before.run.cash;
    const unit = borrowRoom(before, 'shark1').amt;
    let msg = '';
    borrowAt('shark1', (m) => { msg = m; });
    const g = useGame.getState().g;
    if (unit > 0) {
      expect(g.run.debts.shark1.principal).toBe(d0 + unit);
      expect(g.run.cash).toBeGreaterThan(c0);
      expect(msg).toMatch(/오소리 사무소: \+.*정산마다 이자/);
    } else expect(msg.length).toBeGreaterThan(0);
  });
  it('[갚기]와 [전부 갚기]는 원금을 줄인다, 전부 갚아 정산에 모자라면 경고', () => {
    const g0 = useGame.getState().g;
    const d0 = g0.run.debts.shark1.principal;
    payAt('shark1', 1, () => {});
    const d1 = useGame.getState().g.run.debts.shark1.principal;
    expect(d1).toBe(d0 - Math.min(lenderById.shark1.stampUnit, d0));
    // 손의 돈이 원금보다 적으면 전부 갚기는 손을 비우고 다음 정산에 모자란다
    const w = payAllWarn(useGame.getState().g, 'shark1');
    expect(w === null || (w.short > 0 && w.left >= 0)).toBe(true);
    payAt('shark1', 'all', () => {});
    const g2 = useGame.getState().g;
    expect(g2.run.debts.shark1.principal).toBeLessThan(d1);
  });
  it('뒷골목의 처음은 독사가 조건부터 말한다(빌리지 않고 장면)', () => {
    const g = clone(useGame.getState().g); g.run.shark2Open = true; useGame.getState().setGame(g);
    const d0 = g.run.debts.shark2.principal;
    borrowAt('shark2', () => {});
    expect(useGame.getState().g.run.debts.shark2.principal).toBe(d0);
    expect(useProto.getState().scenes.some((s) => s.id === 'viperOffer')).toBe(true);
  });
});

describe('U-61 날다람쥐 길잡이의 끝 걸음은 「대출」을 비춘다', () => {
  it('지도 말이 없고 대출 단추를 가리킨다', () => {
    const st = FT_STEPS.find((s) => s.id === 'loan')!;
    expect(st.target).toBe('loan');
    const line = st.line({} as never);
    expect(line).toContain('대출');
    expect(FT_STEPS.some((s) => s.line({} as never).includes('지도'))).toBe(false);
  });
});

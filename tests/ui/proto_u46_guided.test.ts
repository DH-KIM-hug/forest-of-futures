// U-46 이끄는 길: 첫 생의 튜토리얼 사슬에서 걸음마다 열린 것이 정확히 한 가지(같은 걸음의 다른 길 — 예: 롱 · 숏 — 은 한 가지로 센다)
import { describe, it, expect } from 'vitest';
import { guideStep, type GuideIn } from '../../src/ui/proto/guided';

const base: GuideIn = { life: 1, prologue: false, tutorial: 'none', tab: 'lot', waiting: false, loanTaken: false, forceTrade: false, panelOpen: false, momStaffed: false, extras: 0, extrasStaffed: 0, canPlace: true };
const at = (o: Partial<GuideIn>) => guideStep({ ...base, ...o });

describe('이끄는 길 (U-46)', () => {
  it('사슬의 걸음마다 다음 한 가지만 열린다', () => {
    const chain: [Partial<GuideIn>, string, string[]][] = [
      [{}, 'roll', ['[data-tap]', '[data-tap2]']],
      [{ waiting: true }, 'toMap', ['[data-choice="go"]', '[data-wait-go]', '[data-tab="map"]']],
      [{ waiting: true, tab: 'map' }, 'borrow', ['[data-borrow="shark1"]']],
      [{ loanTaken: true, tutorial: 'await', tab: 'map' }, 'toLot', ['[data-tab="lot"]']],
      [{ loanTaken: true, tutorial: 'await' }, 'openPanel', ['[data-strip]']],
      [{ loanTaken: true, tutorial: 'await', panelOpen: true }, 'hire', ['[data-tile="0"]']],
      [{ loanTaken: true, tutorial: 'await', panelOpen: true, momStaffed: true }, 'place', ['.pr-tile[data-act="place"]']],
      [{ loanTaken: true, tutorial: 'await', panelOpen: true, momStaffed: true, extras: 1 }, 'hire2', ['.pr-tile[data-act="hire"]']],
      [{ loanTaken: true, tutorial: 'await', panelOpen: true, momStaffed: true, extras: 1, extrasStaffed: 1, forceTrade: true }, 'phone', ['[data-tab="phone"]']],
      [{ loanTaken: true, tutorial: 'await', tab: 'phone', momStaffed: true, extras: 1, extrasStaffed: 1 }, 'order', ['.pt-orders .pt-btn.long', '.pt-orders .pt-btn.short']],
      [{ loanTaken: true, tutorial: 'lost', tab: 'phone' }, 'scene', ['[data-choice="borrow"]', '[data-choice="ok"]', '[data-notice-ok]']],
    ];
    for (const [o, step, allow] of chain) {
      const g = at(o);
      expect(g?.step, JSON.stringify(o)).toBe(step);
      expect(g?.allow).toEqual(allow);
    }
  });
  it('쳇바퀴를 놓을 돈이 없으면 알바 하나 뒤에 바로 폰', () => {
    expect(at({ loanTaken: true, tutorial: 'await', panelOpen: true, momStaffed: true, canPlace: false })?.step).toBe('phone');
  });
  it('추심원 앞에서 [돌려보낸다]는 열리지 않는다(사무소로 간다 한 가지)', () => {
    expect(at({ waiting: true })?.allow).not.toContain('[data-choice="away"]');
  });
  it('튜토리얼이 끝나면 · 다음 생 · 프롤로그 중에는 길이 없다(다 열린다)', () => {
    expect(at({ loanTaken: true, tutorial: 'done' })).toBeNull();
    expect(at({ life: 2 })).toBeNull();
    expect(at({ prologue: true })).toBeNull();
  });
});

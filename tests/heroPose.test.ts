import { describe, it, expect } from 'vitest';
import { heroPose, type HeroPoseInput } from '../src/ui/village/heroPose';

const base: HeroPoseInput = { over: false, anyOverdue: false, nearLiq: false, tick: 100, tradeFlash: null, stampFlash: null, workHop: false };

describe('heroPose', () => {
  it('평소는 idle', () => expect(heroPose(base)).toBe('idle'));
  it('파산이 가장 우선', () => expect(heroPose({ ...base, over: true, anyOverdue: true, workHop: true })).toBe('dazed'));
  it('연체나 청산 근접은 sweat, 기쁨보다 우선', () => {
    const f = { tick: 100, kind: 'tp', amount: 500 };
    expect(heroPose({ ...base, anyOverdue: true, tradeFlash: f })).toBe('sweat');
    expect(heroPose({ ...base, nearLiq: true })).toBe('sweat');
  });
  it('수익 청산 직후 joy, 손실이나 오래된 것은 아님', () => {
    expect(heroPose({ ...base, tradeFlash: { tick: 99, kind: 'close', amount: 10 } })).toBe('joy');
    expect(heroPose({ ...base, tradeFlash: { tick: 99, kind: 'close', amount: -10 } })).toBe('idle');
    expect(heroPose({ ...base, tradeFlash: { tick: 90, kind: 'tp', amount: 10 } })).toBe('idle');
    expect(heroPose({ ...base, tradeFlash: { tick: 100, kind: 'liq', amount: 10 } })).toBe('idle');
  });
  it('완납 직후 joy, 일하기보다 우선', () => expect(heroPose({ ...base, stampFlash: { tick: 100 }, workHop: true })).toBe('joy'));
  it('노동 직후 work', () => expect(heroPose({ ...base, workHop: true })).toBe('work'));
});

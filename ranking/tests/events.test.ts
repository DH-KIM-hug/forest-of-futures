// U-59 파산 소식(「오늘 망한 자들」): 모양 검사, 이름 다듬기, 범위 자르기, 기기당 간격. 라이트 생의 자산 상한.
import { describe, expect, it } from 'vitest';
import { EVENT_LIMITS, eventTooSoon, parseEvent } from '../src/events';
import { LIFE, checkLifeAgainstCandles, type TradeDetail } from '../src/verify';

const ok = { deviceId: 'fof_abcdefghij0123456789', name: '도토리부자', cause: 'liq', coin: 'FLY', dir: 1, lev: 200, loss: 84000, peak: 120000, ending: '딱 맞는 드럼통', lite: true };

describe('U-59 파산 소식 모양', () => {
  it('맞는 모양은 그대로 받는다', () => {
    const p = parseEvent(ok);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.e).toEqual({ deviceId: ok.deviceId, name: '도토리부자', cause: 'liq', coin: 'FLY', dir: 1, lev: 200, loss: 84000, peak: 120000, ending: '딱 맞는 드럼통', lite: true });
  });
  it('코인 · 방향 · 배율 · 엔딩은 없어도 된다(이자 미납 파산)', () => {
    const p = parseEvent({ ...ok, cause: 'interest', coin: null, dir: null, lev: null, ending: null, lite: false });
    expect(p.ok && p.e.coin === null && p.e.lev === null && p.e.ending === null && p.e.lite === false).toBe(true);
  });
  it('이상한 값은 거절: 기기 번호, 이름, 원인, 종목, 방향, 배율', () => {
    expect(parseEvent({ ...ok, deviceId: 'x' })).toEqual({ ok: false, why: 'deviceId' });
    expect(parseEvent({ ...ok, name: '' })).toEqual({ ok: false, why: 'name' });
    expect(parseEvent({ ...ok, name: '가'.repeat(19) })).toEqual({ ok: false, why: 'name' });
    expect(parseEvent({ ...ok, cause: 'murder' })).toEqual({ ok: false, why: 'cause' });
    expect(parseEvent({ ...ok, coin: 'XXX' })).toEqual({ ok: false, why: 'coin' });
    expect(parseEvent({ ...ok, dir: 2 })).toEqual({ ok: false, why: 'dir' });
    expect(parseEvent({ ...ok, lev: 500 })).toEqual({ ok: false, why: 'lev' });
    expect(parseEvent({ ...ok, loss: 'NaN' })).toEqual({ ok: false, why: 'loss' });
    expect(parseEvent(null)).toEqual({ ok: false, why: 'body' });
  });
  it('이름은 꺾쇠 · 제어 문자를 빼고, 돈은 범위 안으로 자르고, 엔딩 제목은 24자까지', () => {
    const p = parseEvent({ ...ok, name: '<b>망함</b>', loss: 9e15, peak: -9e15, ending: '가'.repeat(40) + '<x>' });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.e.name).toBe('b망함/b');
    expect(p.e.loss).toBe(EVENT_LIMITS.maxLoss);
    expect(p.e.peak).toBe(EVENT_LIMITS.minPeak);
    expect([...p.e.ending!].length).toBe(24);
    expect(parseEvent({ ...ok, loss: -5 }).ok && (parseEvent({ ...ok, loss: -5 }) as any).e.loss).toBe(0);
  });
  it('기기당 1분에 하나', () => {
    expect(eventTooSoon(null, 1000)).toBe(false);
    expect(eventTooSoon(1000, 1000 + EVENT_LIMITS.minIntervalMs - 1)).toBe(true);
    expect(eventTooSoon(1000, 1000 + EVENT_LIMITS.minIntervalMs)).toBe(false);
  });
});

describe('U-59 라이트 생의 자산 상한', () => {
  const T0 = 1_800_000_000_000;
  const win: TradeDetail = { market: 'FLY', dir: 1, lev: 200, margin: 50000, entryTs: T0, exitTs: T0 + 180_000, roe: 31, pnl: 15500 };
  const cs = [{ t: T0, h: 100.1, l: 100 }];
  it('라이트는 생마다 −30만(빚 40만, 손에 10만)에서 잰다: 다음 생도 본편의 −40만이 아니다', () => {
    expect(LIFE.liteStart).toBe(-300_000);
    const life = { lifeNo: 3, settles: 1, peak: 0, trades: [win], lite: true };
    // −300,000 + 15,500 × 1.1 + 1 × 18,000 = −264,950 이 상한(값은 0 보다 커야 하지만, 여기서는 상한 셈만 본다)
    const bound = -300_000 + 15_500 * 1.1 + 18_000;
    expect(checkLifeAgainstCandles(life, bound - 1, () => cs)).toBeNull();
    expect(checkLifeAgainstCandles({ ...life, lite: undefined } as any, bound - 1, () => cs)).toMatch(/tooHigh/); // 본편 다음 생이면 −40만에서
  });
});

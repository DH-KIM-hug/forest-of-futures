import { describe, expect, it } from 'vitest';
import { checkLifeAgainstCandles, checkLifeShape, checkTradeAgainstCandles, checkTradeShape, cleanName, maxFavorablePct, parseSubmit, type TradeDetail } from '../src/verify';

const T0 = 1_800_000_000_000;
const trade = (o: Partial<TradeDetail> = {}): TradeDetail => ({ market: 'DTC', dir: 1, lev: 200, margin: 50000, entryTs: T0, exitTs: T0 + 180_000, roe: 31, pnl: 15500, ...o });

describe('랭킹 제출 검사', () => {
  it('닉네임: 1~12자, 제어문자·꺾쇠 제거', () => {
    expect(cleanName('칩멍크')).toBe('칩멍크');
    expect(cleanName('<b>a</b>')).toBe('ba/b');
    expect(cleanName('')).toBeNull();
    expect(cleanName('가'.repeat(13))).toBeNull();
  });
  it('모양: 이긴 거래만, pnl = 증거금 × roe', () => {
    expect(checkTradeShape(trade(), 'roe', 31, T0 + 200_000)).toBeNull();
    expect(checkTradeShape(trade({ roe: -5, pnl: -2500 }), 'roe', -5, T0 + 200_000)).toBe('notWin');
    expect(checkTradeShape(trade({ pnl: 99999 }), 'pnl', 99999, T0 + 200_000)).toBe('pnlRoe');
    expect(checkTradeShape(trade({ lev: 500 }), 'roe', 31, T0 + 200_000)).toBe('lev');
    expect(checkTradeShape(trade({ market: 'XXX' }), 'roe', 31, T0 + 200_000)).toBe('market');
  });
  it('최대 유리 폭: 롱은 앞선 최저에서 뒤의 최고까지, 숏은 반대', () => {
    const cs = [{ t: 0, h: 101, l: 99 }, { t: 1, h: 103, l: 100 }, { t: 2, h: 102, l: 98 }];
    expect(maxFavorablePct(cs, 1)).toBeCloseTo((102 / 98 - 1) * 100, 6); // 같은 봉 안의 순서는 모르니 넉넉하게(상한)
    expect(maxFavorablePct(cs, -1)).toBeCloseTo((1 - 98 / 103) * 100, 6);
  });
  it('시세 대조: 200배 · 실제 폭 0.1% 면 수익률 상한 = 200 × (0.1 + 0.15) = 50%', () => {
    const cs = [{ t: 0, h: 100.1, l: 100 }];
    expect(checkTradeAgainstCandles(trade({ roe: 31, pnl: 15500 }), cs)).toBeNull();
    expect(checkTradeAgainstCandles(trade({ roe: 80, pnl: 40000 }), cs)).toMatch(/roeTooHigh/);
    expect(checkTradeAgainstCandles(trade(), [])).toBe('noCandles');
  });
  it('한 생 재산: 상한 = −30만 + 검증된 이긴 거래 합 + 정산 × 53,000', () => {
    const cs = [{ t: T0, h: 100.1, l: 100 }];
    const win = trade({ roe: 31, pnl: 15500 });
    const lose = trade({ roe: -40, pnl: -20000 });
    const life = { lifeNo: 1, settles: 10, peak: 0, trades: [win, lose] };
    expect(checkLifeShape(life, 200000, T0 + 300_000)).toBeNull();
    // −300,000 + 15,500 + 10 × 53,000 = 245,500
    expect(checkLifeAgainstCandles(life, 245000, () => cs)).toBeNull();
    expect(checkLifeAgainstCandles(life, 246000, () => cs)).toMatch(/tooHigh/);
    // U-46: 둘째 생부터는 튜토리얼이 끝난 자리(손에 10만, 빚 50만)에서 시작한다 → 상한도 −40만에서
    const reborn = { ...life, lifeNo: 2 };
    expect(checkLifeAgainstCandles(reborn, 145000, () => cs)).toBeNull();
    expect(checkLifeAgainstCandles(reborn, 146000, () => cs)).toMatch(/tooHigh/);
    // 이긴 거래를 부풀리면 그 거래에서 걸린다
    const fake = { ...life, trades: [trade({ roe: 900, pnl: 450000 })] };
    expect(checkLifeAgainstCandles(fake, 600000, () => cs)).toMatch(/trade:roeTooHigh/);
    expect(checkLifeShape({ ...life, trades: 'x' as any }, 1, T0)).toBe('trades');
  });
  it('제출 파싱: 기기 번호 형식', () => {
    expect(parseSubmit({ deviceId: 'abc', name: 'a', board: 'roe', value: 1, detail: {} }).ok).toBe(false);
    expect(parseSubmit({ deviceId: 'abcdefgh12', name: 'a', board: 'roe', value: 1, detail: {} }).ok).toBe(true);
  });
});

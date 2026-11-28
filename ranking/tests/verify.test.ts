import { describe, expect, it } from 'vitest';
import { flyCandles, FLY_V2_FROM } from '../../src/engine/feed/fly';
import { flyCandlesV1 } from '../../src/engine/feed/flyV1';
import { flyCandlesVerified, FLY_GRACE_SEC } from '../src/flyVersions';
import { LIFE, checkLifeAgainstCandles, checkLifeShape, checkTradeAgainstCandles, checkTradeShape, cleanName, maxFavorablePct, parseSubmit, popAllowance, type TradeDetail } from '../src/verify';

const T0 = 1_800_000_000_000;
const trade = (o: Partial<TradeDetail> = {}): TradeDetail => ({ market: 'DTC', dir: 1, lev: 200, margin: 50000, entryTs: T0, exitTs: T0 + 180_000, roe: 31, pnl: 15500, ...o });

describe('랭킹 제출 검사', () => {
  it('닉네임: 1~12자, 제어문자·꺾쇠 제거', () => {
    expect(cleanName('칩멍크')).toBe('칩멍크');
    expect(cleanName('<b>a</b>')).toBe('ba/b');
    expect(cleanName('')).toBeNull();
    expect(cleanName('가'.repeat(19))).toBeNull();
    expect(cleanName('몰빵다람쥐몰빵다람쥐몰빵 #0417')).toBe('몰빵다람쥐몰빵다람쥐몰빵 #0417');
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
  it('한 생 재산: 상한 = −30만 + 검증된 이긴 거래 합 × 1.1(축하금) + 정산 × 18,000', () => {
    const cs = [{ t: T0, h: 100.1, l: 100 }];
    const win = trade({ roe: 31, pnl: 15500 });
    const lose = trade({ roe: -40, pnl: -20000 });
    const life = { lifeNo: 1, settles: 30, peak: 0, trades: [win, lose] };
    expect(checkLifeShape(life, 200000, T0 + 300_000)).toBeNull();
    // U-47: 정산이 60초 → 정산당 상한 17,000 + 1,000. −300,000 + 15,500 × 1.1 + 30 × 18,000 = 257,050, U-65 의뢰 사례금 +150,000 → 407,050
    // (U-51: 진 거래의 고비 몫은 따로 본다 — 여기서는 진 거래의 봉을 주지 않는다)
    const nopop = (t: TradeDetail) => (t.pnl > 0 ? cs : []);
    expect(checkLifeAgainstCandles({ ...life, trades: [win] }, 407000, () => cs)).toBeNull();
    expect(checkLifeAgainstCandles(life, 407000, nopop)).toBeNull();
    expect(checkLifeAgainstCandles(life, 408000, nopop)).toMatch(/tooHigh/);
    // U-46: 둘째 생부터는 튜토리얼이 끝난 자리(손에 10만, 빚 50만)에서 시작한다 → 상한도 −40만에서
    const reborn = { ...life, lifeNo: 2 };
    expect(checkLifeAgainstCandles(reborn, 307000, nopop)).toBeNull();
    expect(checkLifeAgainstCandles(reborn, 308000, nopop)).toMatch(/tooHigh/);
    // 이긴 거래를 부풀리면 그 거래에서 걸린다
    const fake = { ...life, trades: [trade({ roe: 900, pnl: 450000 })] };
    expect(checkLifeAgainstCandles(fake, 600000, () => cs)).toMatch(/trade:roeTooHigh/);
    expect(checkLifeShape({ ...life, trades: 'x' as any }, 1, T0)).toBe('trades');
  });
  it('날다람쥐코인(FLY): 실제 시장이 없어도 같은 함수로 다시 셈한 봉에 대조한다', () => {
    const e = (FLY_V2_FROM + FLY_GRACE_SEC + 3600) * 1000, x = e + 10 * 60_000;
    const cs = flyCandlesVerified(e / 1000, x / 1000);
    expect(cs).toEqual(flyCandles(e / 1000, x / 1000).map((c) => ({ t: c.t, h: c.h, l: c.l })));
    const fav = maxFavorablePct(cs, 1);
    const ok = trade({ market: 'FLY', entryTs: e, exitTs: x, lev: 50, margin: 10000, roe: 50 * fav * 0.9, pnl: (10000 * 50 * fav * 0.9) / 100 });
    expect(checkTradeShape(ok, 'roe', ok.roe, x + 1000)).toBeNull();
    expect(checkTradeAgainstCandles(ok, cs)).toBeNull();
    const fake = { ...ok, roe: 50 * (fav + 1), pnl: (10000 * 50 * (fav + 1)) / 100 };
    expect(checkTradeAgainstCandles(fake, cs)).toMatch(/roeTooHigh/);
    expect(checkLifeShape({ lifeNo: 1, settles: 3, peak: 0, trades: [ok] }, 1000, x + 1000)).toBeNull();
  });
  it('U-51 고비 보상: 거래마다 봉으로 닿을 수 있던 고비 수 × 넣은 돈 × 3% 를 상한에 더한다(진 거래도)', () => {
    // 200배 · 실제 폭 0.12% → 닿을 수 있는 ROE 200 × (0.12 + 0.15) = 54% → 고비 +50% 하나
    const cs = [{ t: T0, h: 100.12, l: 100 }];
    expect(popAllowance(trade(), cs)).toBeCloseTo(50000 * 0.03, 6);
    // 폭 0.6% → 150% → +50%, 두 배 둘
    expect(popAllowance(trade(), [{ t: T0, h: 100.6, l: 100 }])).toBeCloseTo(50000 * 0.03 * 2, 6);
    // 10배 · 폭 0.12% → 2.7% → 고비 없음. 봉이 없으면 0
    expect(popAllowance(trade({ lev: 10 }), cs)).toBe(0);
    expect(popAllowance(trade(), [])).toBe(0);
    const win = trade({ roe: 31, pnl: 15500 });
    const lose = trade({ roe: -40, pnl: -20000 });
    const life = { lifeNo: 1, settles: 30, peak: 0, trades: [win, lose] };
    // −300,000 + 15,500 × 1.1 + (1,500 + 1,500) + 30 × 18,000 + 150,000(사례금) = 410,050 (진 거래도 +50% 를 지났을 수 있다)
    expect(checkLifeAgainstCandles(life, 410000, () => cs)).toBeNull();
    expect(checkLifeAgainstCandles(life, 411000, () => cs)).toMatch(/tooHigh/);
    // 진 거래의 봉을 못 받았으면 그 몫은 0(거절되지 않고 상한만 준다)
    expect(checkLifeAgainstCandles(life, 408500, (t) => (t.pnl > 0 ? cs : []))).toBeNull();
    expect(checkLifeAgainstCandles(life, 408600, (t) => (t.pnl > 0 ? cs : []))).toMatch(/tooHigh/);
    // 한 생에서 실제로 받을 수 있는 최대(Lv 끝없이 = 3%)보다 넉넉하다: 고비 여섯을 다 넘긴 판
    expect(LIFE.popAt.length * LIFE.popRateMax).toBeCloseTo(0.18, 6);
  });
  it('U-51 반 익절: 나눠 닫은 두 거래(같은 진입)의 고비 몫 합은 처음 넣은 돈 전부의 몫과 같다', () => {
    const cs = [{ t: T0, h: 100.6, l: 100 }];
    const half1 = trade({ margin: 25000, roe: 60, pnl: 15000, exitTs: T0 + 60_000 });
    const half2 = trade({ margin: 25000, roe: 40, pnl: 10000 });
    expect(popAllowance(half1, cs) + popAllowance(half2, cs)).toBeCloseTo(popAllowance(trade(), cs), 6);
  });
  it('제출 파싱: 기기 번호 형식', () => {
    expect(parseSubmit({ deviceId: 'abc', name: 'a', board: 'roe', value: 1, detail: {} }).ok).toBe(false);
    expect(parseSubmit({ deviceId: 'abcdefgh12', name: 'a', board: 'roe', value: 1, detail: {} }).ok).toBe(true);
  });
});

describe('U-57 날다람쥐 시세 함수의 판', () => {
  const cut = FLY_V2_FROM;
  it('바꾼 시각 앞의 거래는 1판 봉으로 다시 센다(지난 전광판 기록이 그대로 맞는다)', () => {
    const e = (cut - 7200) * 1000, x = e + 10 * 60_000;
    const cs = flyCandlesVerified(e / 1000, x / 1000);
    expect(cs).toEqual(flyCandlesV1(e / 1000, x / 1000).map((c) => ({ t: c.t, h: c.h, l: c.l })));
    const fav = maxFavorablePct(cs, -1);
    const ok = trade({ market: 'FLY', dir: -1, entryTs: e, exitTs: x, lev: 20, margin: 10000, roe: 20 * fav * 0.9, pnl: (10000 * 20 * fav * 0.9) / 100 });
    expect(checkTradeAgainstCandles(ok, cs)).toBeNull();
  });
  it('바꾼 뒤 사흘은 두 판 중 넓은 쪽(옛 앱이 낸 거래도 받는다), 그 뒤는 2판만', () => {
    const a = cut + 600;
    const cs = flyCandlesVerified(a, a + 300), v1 = flyCandlesV1(a, a + 300), v2 = flyCandles(a, a + 300);
    cs.forEach((c, i) => { expect(c.h).toBe(Math.max(v1[i].h, v2[i].h)); expect(c.l).toBe(Math.min(v1[i].l, v2[i].l)); });
    // 경계를 걸친 구간도 분마다 이어진다(빠지거나 겹치는 분이 없다)
    const b = flyCandlesVerified(cut - 300, cut + 300);
    expect(b.length).toBe(11);
    for (let i = 1; i < b.length; i++) expect(b[i].t - b[i - 1].t).toBe(60_000);
    const g = flyCandlesVerified(cut + FLY_GRACE_SEC - 120, cut + FLY_GRACE_SEC + 120);
    expect(g.length).toBe(5);
    expect(g[4]).toEqual((({ t, h, l }) => ({ t, h, l }))(flyCandles(cut + FLY_GRACE_SEC + 120, cut + FLY_GRACE_SEC + 120)[0]));
  });
});

describe('U-65 의뢰 사례금', () => {
  it('한 생에 사례금 15만까지를 상한에 더한다(본편, 라이트 모두). 게임의 상한과 같은 숫자', async () => {
    const { QUEST_TIP } = await import('../../src/engine/questTip');
    expect(LIFE.questMaxPerLife).toBe(QUEST_TIP.lifeMax);
    const life = { lifeNo: 1, settles: 1, peak: 0, trades: [] as TradeDetail[] };
    const base = -300_000 + 18_000;
    expect(checkLifeAgainstCandles(life, base + 150_000, () => [])).toBeNull();
    expect(checkLifeAgainstCandles(life, base + 150_001, () => [])).toMatch(/tooHigh/);
    const lite = { ...life, lite: true, lifeNo: 2 };
    expect(checkLifeAgainstCandles(lite, -290_000 + 18_000 + 150_000, () => [])).toBeNull();
    expect(checkLifeAgainstCandles(lite, -290_000 + 18_000 + 150_001, () => [])).toMatch(/tooHigh/);
  });
});

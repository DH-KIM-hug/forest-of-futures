// U-47: 정산 한 번 = 60초(첫 생의 튜토리얼 동안은 20초), 정산당 돈은 1/3(초당 흐름은 그대로).
// 배율은 처음부터 50배, 위험 고지 확인서에 발도장을 찍는 순간 200배. B1 = 한 번 버티기, B3a = 고배율 축하금.
// 날다람쥐코인(FLY)이 여섯째 종목으로 들어오고, 포지션은 종목마다 하나씩 거래할 수 있는 종목 수(6)만큼.
import { describe, expect, it } from 'vitest';
import { A, bare, giveEquip, giveWheel, openFutures, settleOnce, tickN } from './helpers';
import { balance, marketDefs } from '../../src/engine/data';
import { endIntro, settleSec } from '../../src/engine/pace';
import { forecast } from '../../src/engine/settlement';
import { MAX_POSITIONS, levCapNow, liqPrice, waiverAvailable } from '../../src/engine/futures';
import { holdBuffer } from '../../src/engine/skilltree';
import { SimFeed, SIM_FLY_EPOCH } from '../../src/engine/feed/simFeed';
import { flyPrice } from '../../src/engine/feed/fly';
import type { GameState } from '../../src/engine/types';

/** 거래만 보는 판: 현금 100만, 계좌 열림(상한 50, 확인서 없음) */
function trader(): GameState {
  const g = bare();
  g.run.cash = 1_000_000;
  openFutures(g, 50);
  g.run.futures.waiver = false;
  return g;
}

describe('정산 간격 (U-47)', () => {
  it('보통은 60초, 튜토리얼(run.intro) 동안은 20초', () => {
    const g = bare();
    expect(balance.settlement.intervalSec).toBe(60);
    expect(balance.settlement.introSec).toBe(20);
    expect(g.run.intro).toBeFalsy(); // createGame 은 튜토리얼 표시를 켜지 않는다
    expect(settleSec(g.run)).toBe(60);
    g.run.intro = true;
    expect(settleSec(g.run)).toBe(20);
  });

  it('튜토리얼 동안은 20틱마다 정산, endIntro 뒤에는 60틱마다', () => {
    const g = bare();
    g.run.intro = true;
    g.run.settleIn = 20;
    tickN(g, 20);
    expect(g.run.settleNo).toBe(1);
    expect(g.run.settleIn).toBe(20);
    A(g, { type: 'endIntro' });
    expect(g.run.intro).toBe(false);
    expect(g.run.settleIn).toBe(60);
    tickN(g, 59);
    expect(g.run.settleNo).toBe(1);
    tickN(g, 1);
    expect(g.run.settleNo).toBe(2);
    expect(g.run.settleIn).toBe(60);
  });

  it('endIntro 는 이번 구간에서 지난 몫을 지키며 남은 시간과 이미 넣은 캐는 값의 초를 3배로 늘린다', () => {
    const g = bare();
    giveWheel(g, 'DTC', { autoSell: true });
    g.run.coinWheels.DTC.staffed = true;
    g.run.intro = true;
    g.run.settleIn = 20;
    tickN(g, 5); // 20초 중 5초가 지났다(1/4)
    expect(g.run.settleIn).toBe(15);
    expect(g.run.stats.creditedSec).toBeCloseTo(5, 9);
    endIntro(g);
    expect(g.run.settleIn).toBe(45);
    expect(g.run.stats.creditedSec).toBeCloseTo(15, 9); // 60초 중 1/4 = 15초어치가 이미 들어왔다
    // 한 번 더 불러도 아무 일 없다
    expect(endIntro(g).ok).toBe(true);
    expect(g.run.settleIn).toBe(45);
  });

  it('알바 햄스터의 초당 수입은 그대로(2% 안): 2,170/60 ≈ 6,500/180', () => {
    expect(balance.labor.grossPerSettle).toBe(2170);
    const perSecNow = balance.labor.grossPerSettle / balance.settlement.intervalSec;
    const perSecOld = 6500 / 180;
    expect(Math.abs(perSecNow / perSecOld - 1)).toBeLessThan(0.02);
    // 엔진으로도: 쳇바퀴 둘(알바 둘)을 60초 돌리면 2,170 × 2어치
    const g = bare();
    giveWheel(g, 'DTC', { autoSell: true });
    g.run.coinWheels.DTC.staffed = true; // 엄마의 쳇바퀴에도 알바
    giveEquip(g, 'wheel2', 'DTC', 50000);
    g.run.settleIn = 60;
    expect(forecast(g).mined).toBeCloseTo(2170 * 2, 6);
    const wageOld = 1600 / 180, wageNow = balance.labor.wage / 60;
    expect(Math.abs(wageNow / wageOld - 1)).toBeLessThan(0.02);
  });
});

describe('배율 (U-47): 처음 50배, 확인서 발도장으로 바로 200배', () => {
  it('끝난 거래 0건이어도 확인서만 찍으면 200배, 찍기 전엔 100배 · 200배가 막힌다', () => {
    const g = trader();
    expect(g.run.futures.closedTrades).toBe(0);
    expect(levCapNow(g.run)).toBe(50);
    expect(A(g, { type: 'open', market: 'BTH', dir: 1, lev: 200, margin: 10000 }).ok).toBe(false);
    expect(A(g, { type: 'open', market: 'BTH', dir: 1, lev: 100, margin: 10000 }).ok).toBe(false);
    expect(A(g, { type: 'open', market: 'BTH', dir: 1, lev: 50, margin: 10000 }).ok).toBe(true);
    expect(waiverAvailable(g.run)).toBe(true);
    expect(A(g, { type: 'signWaiver' }).ok).toBe(true);
    expect(levCapNow(g.run)).toBe(200);
    expect(waiverAvailable(g.run)).toBe(false);
    expect(A(g, { type: 'open', market: 'SMS', dir: 1, lev: 200, margin: 10000 }).ok).toBe(true);
    expect(g.run.futures.closedTrades).toBe(0);
  });
});

describe('B1 한 번 버티기 (U-47)', () => {
  const setup = (lvl = 10) => {
    const g = trader();
    g.run.skill = { R: 1, B1: lvl };
    const p0 = g.run.prices.BTH;
    expect(A(g, { type: 'open', market: 'BTH', dir: 1, lev: 50, margin: 10000 }).ok).toBe(true);
    const p = g.run.positions.BTH;
    const buf = holdBuffer(g.run, 10000);
    return { g, p0, p, buf, liq0: liqPrice(p) };
  };

  it('나무가 없으면 청산가에 닿는 틱에 청산된다', () => {
    const g = trader();
    A(g, { type: 'open', market: 'BTH', dir: 1, lev: 50, margin: 10000 });
    const liq0 = liqPrice(g.run.positions.BTH);
    tickN(g, 1, { BTH: liq0 * 0.9999 });
    expect(g.run.positions.BTH).toBeUndefined();
  });

  it('처음 닿을 때 증거금 × 효과만큼 대신 넣어 버티고(포지션마다 한 번), 두 번째로 닿으면 청산된다', () => {
    const { g, p, buf, liq0 } = setup();
    expect(buf).toBe(Math.floor(10000 * 0.3 * (1 - 0.85 ** 10)));
    expect(buf).toBeGreaterThan(0);
    tickN(g, 1, { BTH: liq0 * 0.9999 }); // 첫 청산가는 지났지만, 버틴 뒤의 청산가보다는 위
    const q = g.run.positions.BTH;
    expect(q).toBeDefined();
    expect(q.held).toBe(true);
    expect(q.buf).toBe(buf);
    expect(q.margin).toBe(10000 + buf);
    expect(liqPrice(q)).toBeLessThan(liq0);
    expect(g.run.stats.holdSaves).toBe(1);
    void p;
    tickN(g, 1, { BTH: liqPrice(q) * 0.9999 });
    expect(g.run.positions.BTH).toBeUndefined(); // 두 번째는 버티지 않는다
    expect(g.run.stats.holdSaves).toBe(1);
  });

  it('버틴 뒤 정리하면 대신 넣은 돈을 먼저 돌려준다: 받는 돈 = 버티기가 없던 것과 같다', () => {
    const { g, p0, buf, liq0 } = setup();
    tickN(g, 1, { BTH: liq0 * 0.9999 });
    expect(g.run.positions.BTH.buf).toBe(buf);
    tickN(g, 1, { BTH: p0 });
    const q = g.run.positions.BTH;
    const exitFee = Math.ceil(q.notional * (q.feeRate ?? balance.trading.feeRate) - 1e-9);
    const c0 = g.run.cash;
    expect(A(g, { type: 'close', market: 'BTH' }).ok).toBe(true);
    const back = g.run.cash - c0;
    expect(back).toBeGreaterThanOrEqual(10000 - exitFee - 1);
    expect(back).toBeLessThanOrEqual(10000 - exitFee + 1);
    expect(back).toBeLessThan(10000 + buf - exitFee); // 오소리 몫은 돌려줬다
  });

  it('한 번에 크게 지나 버틴 청산가까지 넘으면 그 틱에 청산된다(버티기는 시세를 이기게 해 주지 않는다)', () => {
    const { g, liq0 } = setup(1);
    tickN(g, 1, { BTH: liq0 * 0.98 });
    expect(g.run.positions.BTH).toBeUndefined();
  });
});

describe('B3a 고배율 축하금 (U-47)', () => {
  /** 오르는 판에 lev 배율로 들어가 +0.5% 에 정리. 축하금 · 현금 변화를 돌려준다 */
  const win = (lev: number, skill: Record<string, number>) => {
    const g = trader();
    A(g, { type: 'signWaiver' });
    g.run.skill = skill;
    const p0 = g.run.prices.BTH;
    expect(A(g, { type: 'open', market: 'BTH', dir: 1, lev, margin: 10000 }).ok).toBe(true);
    tickN(g, 1, { BTH: p0 * 1.005 });
    const c0 = g.run.cash;
    A(g, { type: 'close', market: 'BTH' });
    return { g, got: g.run.cash - c0, bonus: (g.run.stats.winBonus as number | undefined) ?? 0 };
  };

  it('100배 이상으로 이기면 수익 × 꼬리만큼 현금에 더 얹는다(거래 손익은 그대로)', () => {
    const plain = win(100, {});
    const withB = win(100, { B3a: 1 });
    expect(plain.bonus).toBe(0);
    const pnl = plain.got - 10000; // 받은 돈 − 넣은 증거금(나올 때 수수료는 이미 빠졌다)
    expect(pnl).toBeGreaterThan(0);
    expect(withB.bonus).toBeGreaterThan(0);
    expect(withB.got - plain.got).toBe(withB.bonus);
    expect(withB.g.run.stats.lastBonus).toEqual(expect.objectContaining({ market: 'BTH', amount: withB.bonus }));
    const w200 = win(200, { B3a: 1 });
    expect(w200.bonus).toBeGreaterThan(withB.bonus);
  });

  it('50배로 이기면 없다, 진 판도 없다, 청산도 없다', () => {
    expect(win(50, { B3a: 1 }).bonus).toBe(0);
    const g = trader();
    A(g, { type: 'signWaiver' });
    g.run.skill = { B3a: 1 };
    const p0 = g.run.prices.BTH;
    A(g, { type: 'open', market: 'BTH', dir: 1, lev: 100, margin: 10000 });
    tickN(g, 1, { BTH: p0 * 0.997 });
    A(g, { type: 'close', market: 'BTH' });
    A(g, { type: 'open', market: 'SMS', dir: 1, lev: 100, margin: 10000 });
    tickN(g, 1, { SMS: g.run.prices.SMS * 0.98 });
    expect(g.run.positions.SMS).toBeUndefined();
    expect(g.run.stats.winBonus ?? 0).toBe(0);
  });
});

describe('여섯 종목 동시에 (U-47)', () => {
  it('거래할 수 있는 종목은 6개(날다람쥐코인 포함), 포지션도 6개까지', () => {
    const tradable = marketDefs.filter((m) => m.tradable).map((m) => m.id);
    expect(tradable).toContain('FLY');
    expect(tradable.length).toBe(6);
    expect(MAX_POSITIONS).toBe(6);
  });

  it('6종목에 한꺼번에 들고, 하나가 청산돼도 나머지는 그대로(격리 마진). 여럿 든 채로 정산도 돈다', () => {
    const g = trader();
    const ids = marketDefs.filter((m) => m.tradable).map((m) => m.id);
    for (const m of ids) expect(A(g, { type: 'open', market: m, dir: 1, lev: 50, margin: 10000 }).ok, m).toBe(true);
    expect(Object.keys(g.run.positions).sort()).toEqual([...ids].sort());
    // 같은 종목 반대 방향은 안 되고, 일곱째 자리는 없다
    expect(A(g, { type: 'open', market: 'BTH', dir: -1, lev: 50, margin: 10000 }).ok).toBe(false);
    const cash = g.run.cash;
    const liq = liqPrice(g.run.positions.SMS);
    tickN(g, 1, { SMS: liq * 0.999 });
    expect(g.run.positions.SMS).toBeUndefined();
    expect(Object.keys(g.run.positions).length).toBe(5);
    for (const m of ids.filter((x) => x !== 'SMS')) expect(g.run.positions[m].margin).toBe(10000);
    expect(g.run.cash).toBe(cash); // 청산은 그 포지션의 증거금만 가져간다
    const no = g.run.settleNo;
    settleOnce(g);
    expect(g.run.settleNo).toBe(no + 1);
    expect(g.run.over).toBeFalsy();
    expect(Object.keys(g.run.positions).length).toBe(5);
  });
});

describe('날다람쥐코인(FLY) 시세 (U-47)', () => {
  it('SimFeed 는 틱마다 FLY = flyPrice(기준 시각 + n) 을 낸다', () => {
    const f = new SimFeed(7);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = f.next();
      expect(t.p.FLY).toBeDefined();
      expect(t.p.FLY[0]).toBeCloseTo(flyPrice(SIM_FLY_EPOCH + t.n), 9);
      seen.push(t.p.FLY[0]);
    }
    expect(seen.every((v) => v > 0 && Number.isFinite(v))).toBe(true);
    // 씨앗이 달라도 FLY 는 같다(시각만의 함수)
    const g2 = new SimFeed(99).next();
    expect(g2.p.FLY[0]).toBeCloseTo(flyPrice(SIM_FLY_EPOCH + g2.n), 9);
  });
});

// U-41(회차 4) 화면 쪽: 출구를 도토리로 거는 셈 · 그 폭이 실제로 몇 번 나왔는가 · 정산을 넘겨 들고 있기 · 이번 생의 길 · 도토리일보 시세면.
// 전부 순수 함수다. 엔진의 손절·익절 공식(stopPrice)과 맞물리는지는 진짜 엔진에 걸어서 본다.
import { afterEach, describe, expect, it } from 'vitest';
import { A, bare, openFutures, tickN } from '../engine/helpers';
import { balance } from '../../src/engine/data';
import { exitFee, liqPrice, stopPrice } from '../../src/engine/futures';
import { acornStops, carryOf, chipCount, halfHint, journeyOf, liqRoe, netForRoe, orderCtx, planLine, roeForNet, stopLabel, swingCount, swingText, type StopCtx } from '../../src/ui/proto/stops';
import { cell, dayNote, noteToast, type MinBar } from '../../src/ui/proto/daynote';
import { pushDayPrice, dayBars, resetDay, setDayHistory } from '../../src/ui/dayHistory';
import { STORY } from '../../src/ui/proto/text';
import { ctxOfPosition } from '../../src/ui/proto/exitPlan';
import { MAP_SPOTS, RETIRE_PHOTO, sprite } from '../../src/ui/proto/sprites';
import { specialEndings } from '../../src/engine/act1';
import type { GameState, Position } from '../../src/engine/types';

const T = balance.trading;
const act1 = (on: boolean) => { if (on) (balance as { act1?: unknown }).act1 = { friends: false }; else delete (balance as { act1?: unknown }).act1; };
afterEach(() => act1(false));
const ctxOf = (p: Position): StopCtx => ({ notional: p.notional, lev: p.lev, margin: p.margin, feesIn: p.feesPaid, feeOut: exitFee(p), feeOutSl: exitFee(p), maint: T.maintenanceRate });
function trader(cash = 1_000_000): GameState {
  const g = bare();
  openFutures(g);
  g.run.cash = cash;
  g.run.futures.waiver = true; g.run.futures.closedTrades = 20;
  g.run.debts.shark1.principal = 0; g.run.debts.capital.principal = 0;
  return g;
}

describe('출구를 도토리로 (U-41)', () => {
  it('셈: 5만 · 200배 · 수수료 0 에서 이자 15,500 은 시세 0.155%, 청산은 0.4% — 손절도 걸린다', () => {
    const c = orderCtx({ margin: 50_000, lev: 200, feeRate: 0, maint: 0.001 });
    const st = acornStops(c, 15_500, 15_500);
    expect(st.tpMove!).toBeCloseTo(0.155, 2);
    expect(st.slMove!).toBeCloseTo(-0.155, 2);
    expect(liqRoe(c)).toBeCloseTo(-80, 5);
    expect(st.sl!).toBeGreaterThan(liqRoe(c));
    expect(netForRoe(st.tp!, c, 'tp')).toBeGreaterThanOrEqual(15_500);
    expect(netForRoe(st.tp!, c, 'tp')).toBeLessThan(15_503);
    expect(netForRoe(st.sl!, c, 'sl')).toBeCloseTo(-15_500, 3);
  });
  it('수수료가 있으면 익절은 더 멀고 손절은 더 가깝다(같은 도토리가 되게)', () => {
    const free = acornStops(orderCtx({ margin: 50_000, lev: 200, feeRate: 0, maint: 0.001 }), 15_500, 15_500);
    const paid = acornStops(orderCtx({ margin: 50_000, lev: 200, feeRate: 0.0002, maint: 0.001 }), 15_500, 15_500);
    expect(paid.tpMove!).toBeGreaterThan(free.tpMove!);
    expect(Math.abs(paid.slMove!)).toBeLessThan(Math.abs(free.slMove!));
    expect(paid.tpMove!).toBeCloseTo(0.155 + 0.04, 2); // 들어갈 때 · 나올 때 0.02% 씩
  });
  it('손절을 못 거는 두 경우: 증거금이 이자보다 작으면 청산이 먼저, 수수료만으로 그만큼 잃으면 수수료', () => {
    const small = acornStops(orderCtx({ margin: 10_000, lev: 200, feeRate: 0, maint: 0.001 }), 15_500, 15_500);
    expect(small).toMatchObject({ sl: null, slWhy: 'liq' });
    expect(small.tp).not.toBeNull();
    const fee = acornStops(orderCtx({ margin: 100_000, lev: 200, feeRate: 0.0004, maint: 0.001 }), 15_500, 15_500); // 왕복 수수료 16,000
    expect(fee).toMatchObject({ sl: null, slWhy: 'fee' });
    expect(acornStops(orderCtx({ margin: 50_000, lev: 200, feeRate: 0, maint: 0.001 }), null, null)).toMatchObject({ tp: null, sl: null, slWhy: null });
  });
  it('진짜 엔진에 걸면 그 돈에서 닫힌다: 익절 = +15,500(수수료 포함), 손절 = −15,500', () => {
    for (const fee of [true, false]) {
      act1(!fee); // act1 = 오픈 기념(수수료 0), 아니면 0.04%
      for (const dir of [1, -1] as const) {
        for (const hit of ['tp', 'sl'] as const) {
          const g = trader();
          const cash0 = g.run.cash;
          expect(A(g, { type: 'open', market: 'DTC', dir, lev: 100, margin: 50_000 }).ok).toBe(true);
          const p = g.run.positions.DTC;
          const st = acornStops(ctxOf(p), 15_500, 15_500);
          expect(st.sl).not.toBeNull();
          expect(A(g, { type: 'stops', market: 'DTC', sl: st.sl, tp: st.tp }).ok).toBe(true);
          const level = stopPrice(p, hit === 'tp' ? st.tp! : st.sl!);
          // 청산가보다 앞에 있다
          if (hit === 'sl') expect(dir === 1 ? level > liqPrice(p) : level < liqPrice(p)).toBe(true);
          tickN(g, 1, { DTC: level * (1 + (hit === 'tp' ? 1 : -1) * dir * 0.0001) });
          expect(g.run.positions.DTC).toBeUndefined();
          const net = g.run.cash - cash0;
          if (hit === 'tp') { expect(net).toBeGreaterThanOrEqual(15_500); expect(net).toBeLessThan(15_506); }
          else { expect(net).toBeLessThanOrEqual(-15_498); expect(net).toBeGreaterThan(-15_506); }
          expect(g.run.lastClose!.liq).toBe(false);
        }
      }
    }
  });
  it('단추의 글: 건 값을 도토리로 되읽는다. 없으면 "없음"', () => {
    const c = orderCtx({ margin: 50_000, lev: 200, feeRate: 0, maint: 0.001 });
    const st = acornStops(c, 15_500, 7_750);
    expect(stopLabel(st.tp, c, 'tp')).toBe('+15,501');
    expect(stopLabel(st.sl, c, 'sl')).toBe('−7,750');
    expect(stopLabel(null, c, 'tp')).toBe('없음');
    expect(stopLabel(-25, null, 'sl')).toBe('−25%');
    expect(roeForNet(0, c, 'tp')).toBe(0);
  });
  it('그 폭이 실제로 몇 번 나왔는가: 겹쳐 세지 않고, 오르든 내리든 센다', () => {
    const up = Array.from({ length: 120 }, (_, i) => 100 * (1 + i * 0.0001)); // 2분에 1.19% 오름
    expect(swingCount(up, 0.3)).toBe(3);
    expect(swingCount(up, 5)).toBe(0);
    const saw = Array.from({ length: 240 }, (_, i) => 100 + (i % 40 < 20 ? i % 20 : 20 - (i % 20)) * 0.02); // 0.4% 톱니
    expect(swingCount(saw, 0.35)).toBeGreaterThanOrEqual(10);
    expect(swingCount([], 0.1)).toBe(0);
    expect(swingCount(up, 0)).toBe(0);
    expect(swingText(up.slice(0, 30), 0.1)).toBeNull(); // 1분이 안 되면 말하지 않는다
    expect(swingText(up, 0.3)).toBe('지난 2분에 3번');
    expect(swingText(up, 5)).toBe('지난 2분엔 없었다');
  });
  it('주문 줄: 익절 · 손절의 도토리와 시세 폭, 지난 몇 분에 몇 번. 손절을 못 걸면 까닭', () => {
    const hist = Array.from({ length: 600 }, (_, i) => 100 * (1 + Math.sin(i / 30) * 0.002));
    const c = orderCtx({ margin: 50_000, lev: 200, feeRate: 0, maint: 0.001 });
    const line = planLine({ tpNet: 15_500, slNet: 15_500, st: acornStops(c, 15_500, 15_500), hist })!;
    expect(line).toMatch(/^익절 \+15,500 \(유리한 쪽 0\.1[56]%, 지난 10분에 \d+번\), 손절 −15,500 \(반대쪽 0\.1[56]%\)$/);
    const small = orderCtx({ margin: 10_000, lev: 200, feeRate: 0, maint: 0.001 });
    expect(planLine({ tpNet: 15_500, slNet: 15_500, st: acornStops(small, 15_500, 15_500), hist })).toContain('손절 −15,500보다 청산이 먼저다');
    expect(planLine({ tpNet: null, slNet: null, st: acornStops(c, null, null), hist })).toBeNull();
  });
  it('조용한 장: 익절 폭이 한 번도 안 나왔으면 절반 폭은 몇 번 나왔는지 덧붙인다. 칩마다 횟수', () => {
    // 10분 동안 ±0.06% 안에서만 출렁인 장(회차 4 의 새벽): 0.17% 는 0번, 0.085% 는 여러 번
    const quiet = Array.from({ length: 600 }, (_, i) => 100 * (1 + Math.sin(i / 25) * 0.0006));
    expect(halfHint(quiet, 0.17)).toMatch(/^반 번 폭은 \d+번$/);
    expect(halfHint(quiet, 0.05)).toBeNull(); // 그 폭이 이미 나왔으면 덧붙이지 않는다
    expect(halfHint(quiet, 5)).toBeNull(); //    절반 폭도 안 나왔으면 말하지 않는다
    expect(halfHint(quiet.slice(0, 30), 0.17)).toBeNull();
    expect(halfHint(quiet, null)).toBeNull();
    const c = orderCtx({ margin: 45_000, lev: 200, feeRate: 0, maint: 0.001 });
    const st = acornStops(c, 15_500, 15_500);
    expect(planLine({ tpNet: 15_500, slNet: 15_500, st, hist: quiet, hint: halfHint(quiet, st.tpMove) })).toMatch(/^익절 \+15,500 \(유리한 쪽 0\.17%, 지난 10분엔 없었다\), 손절 −15,500 \(반대쪽 0\.17%\)$/); // U-44: 반 번 폭의 덧말은 뺐다(halfHint 셈은 남는다)
    expect(chipCount(quiet, 0.05)).toMatch(/^\d+번$/);
    expect(chipCount(quiet, -0.17)).toBe('0번');
    expect(chipCount(quiet.slice(0, 30), 0.05)).toBeNull();
    expect(chipCount(quiet, null)).toBeNull();
  });
});

describe('정산을 넘겨 들고 있기 (U-41)', () => {
  it('손에 낼 돈이 있으면: 손에서 나가는 돈 · 포지션은 그대로 · 펀딩비 · 남는 돈', () => {
    const c = carryOf({ cash: 56_800, income: 0, due: 19_100, settleIn: 20, notional: 10_000_000, fundingRate: 0.00001 })!;
    expect(c).toMatchObject({ due: 19_100, left: 37_700, funding: 100 });
    expect(c.text).toBe('0:20 뒤 정산 −19,100, 포지션은 그대로, 37,700 남음');
  });
  it('손에 낼 돈이 모자라면 null(붉은 줄이 대신 말한다) · 낼 돈이 없으면 null', () => {
    expect(carryOf({ cash: 5_000, income: 0, due: 19_100, settleIn: 20, notional: 1e7, fundingRate: 1e-5 })).toBeNull();
    expect(carryOf({ cash: 5_000, income: 0, due: 0, settleIn: 20, notional: 1e7, fundingRate: 1e-5 })).toBeNull();
  });
  it('엔진: 포지션을 든 채 정산을 넘기면 증거금에서 펀딩비만 빠지고 포지션은 그대로다', () => {
    act1(true);
    const g = trader(200_000);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 50_000 });
    const before = { ...g.run.positions.DTC };
    tickN(g, g.run.settleIn);
    const p = g.run.positions.DTC;
    expect(p).toBeDefined();
    expect(p.notional).toBe(before.notional);
    expect(p.entry).toBe(before.entry);
    expect(before.margin - p.margin).toBe(0); // U-46: 1막은 펀딩비가 없다(사용자: 펀딩비까지 하면 어렵고, 대신 거래세를 낮추는 방안)
    act1(false);
    const h = trader(200_000);
    A(h, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 50_000 });
    const m0 = h.run.positions.DTC.margin; tickN(h, h.run.settleIn);
    expect(m0 - h.run.positions.DTC.margin).toBe(33); // 1막 밖(엔진 기본): 명목 1,000만의 0.00033%(U-47: 정산 60초)
    expect(STORY.carried({ paid: 6_100 })).toBe('현금에서 6,100 납부. 포지션 유지.');
  });
});

describe('펀딩비까지 넣은 출구 (U-41: 실시간 판에서 +7,750 익절이 +7,563 으로 닫혔다)', () => {
  it('정산을 두 번 넘긴 뒤 다시 건 익절은 펀딩비를 빼고도 그 돈이 된다. 다시 걸지 않으면 펀딩비만큼 모자란다', () => {
    act1(false); // U-46: 1막은 펀딩비가 없다 — 이 셈은 엔진 기본(1막 밖)에서 본다
    const fee0 = (balance.trading as { feeRate: number }).feeRate; (balance.trading as { feeRate: number }).feeRate = 0; // 예전 판(오픈 기념 중 수수료 0)과 같게
    for (const redo of [true, false]) {
      const g = trader(400_000);
      const cash0 = g.run.cash;
      A(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 50_000 });
      let p = g.run.positions.DTC;
      const st0 = acornStops(ctxOfPosition(g.run, p), 15_500, 15_500);
      A(g, { type: 'stops', market: 'DTC', sl: st0.sl, tp: st0.tp });
      tickN(g, g.run.settleIn); tickN(g, g.run.settleIn); // 정산 두 번: 펀딩비 33 × 2
      p = g.run.positions.DTC;
      expect(p.fundingPaid).toBe(66);
      const paid = cash0 - 50_000 - g.run.cash; // 그 사이 정산이 걷어 간 돈(이자는 0 으로 두었지만 생활비가 있다)
      const st1 = acornStops(ctxOfPosition(g.run, p), 15_500, 15_500);
      expect(st1.tp!).toBeGreaterThan(st0.tp!); // 펀딩비만큼 더 가야 한다
      if (redo) A(g, { type: 'stops', market: 'DTC', sl: st1.sl, tp: st1.tp });
      const tp = g.run.positions.DTC.tpRoe!;
      tickN(g, 1, { DTC: stopPrice(p, tp) * 1.00001 });
      expect(g.run.positions.DTC).toBeUndefined();
      const net = g.run.cash - cash0 + paid;
      if (redo) { expect(net).toBeGreaterThanOrEqual(15_500); expect(net).toBeLessThan(15_506); }
      else { expect(net).toBeLessThan(15_500); expect(net).toBeGreaterThan(15_290); }
    }
    (balance.trading as { feeRate: number }).feeRate = fee0;
  });
});

describe('이번 생의 길 (U-41)', () => {
  it('거래가 벌어 온 돈을 돈으로만 읽는다(U-67: 「이자 n번 치」는 뺐다)', () => {
    const j = journeyOf({ tradeNet: 31_000, claim: 15_500, settles: 14, paid: 85_400, claimWins: 1 });
    expect(j.share).toBe(2);
    expect(j.text).toBe('이번 생 낸 돈 85,400, 거래로 +31,000');
    expect(journeyOf({ tradeNet: -8_000, claim: 15_500, settles: 3, paid: 18_300, claimWins: 0 }).text).toBe('이번 생 낸 돈 18,300, 거래로 −8,000');
    expect(journeyOf({ tradeNet: 500, claim: 15_500, settles: 3, paid: 18_300, claimWins: 0 }).short).toBe('거래 +500');
  });
  it('넣은 돈만큼 넘게 딴 판(이번 생 처음)의 장면: 추심원 → 주인공, 숫자는 받은 것 그대로', () => {
    const L = STORY.winClaim({ first: '15,500은 따로 두세요. 그럼 이번 이자랑 생활비는 돼요.', pnl: 15_812, spins: 3, stampLeft: 50_000, momLeft: 300_000 });
    expect(L.map((l) => l.who)).toEqual(['collector', 'hero', 'hero', 'hero']); // 개정 대본 장면 20: 추심원 → 다로미
    expect(L[0].text).toContain('15,500');
    expect(L[1].text).toContain('15,812');
    expect(L[3].text).toContain('황금 도토코인까지 50,000');
    // 오소리 빚을 다 갚았으면 「지금 갚으면…」도 도토코인 줄도 없다(고르기도 없다)
    const paid = STORY.winClaim({ first: 'x', pnl: 15_812, spins: null, stampLeft: null, momLeft: 0 });
    expect(paid).toHaveLength(2);
    expect(paid.map((l) => l.text).join(' ')).not.toMatch(/갚/);
  });
});

describe('도토리일보 시세면 (U-41)', () => {
  const NOW = Date.UTC(2026, 10, 26, 18, 0); // 한국 시간 27일 03:00
  const mk = (len: number, f: (i: number) => number, wig: (i: number) => number = () => 0.0005): MinBar[] =>
    Array.from({ length: len }, (_, i) => { const c = f(i); const w = c * wig(i); return { t: NOW - (len - i) * 60000, o: c, h: c + w, l: c - w, c }; });
  const M = [{ id: 'A', name: '가코인' }, { id: 'B', name: '나코인' }, { id: 'C', name: '다코인' }];
  it('지난 1 · 6 · 24시간의 오르내림과 고저 폭, 가장 시끄러웠던 시(한국 시간)', () => {
    const bars = {
      A: mk(1440, (i) => 100 + i * 0.01), //                오르기만 한다: 하루 +14%
      B: mk(1440, () => 50, (i) => (i >= 1380 ? 0.00005 : 0.001)), // 지금은 평소의 1/20
      C: mk(1440, (i) => 10 * (1 + Math.sin(i / 100) * 0.01), (i) => (Math.floor((NOW - (1440 - i) * 60000) / 3600000 + 9) % 24 === 23 ? 0.004 : 0.0003)),
    };
    const n = dayNote(M, bars, NOW);
    const [a, b, c] = n.rows;
    expect(a.h1!).toBeCloseTo((114.39 / 113.8 - 1) * 100, 1);
    expect(a.h24!).toBeGreaterThan(13);
    expect(a.range!).toBeGreaterThan(3);
    expect(b.h1!).toBeCloseTo(0, 5);
    expect(b.ratio!).toBeLessThan(0.1);
    expect(c.loudHour).toBe(23);
    expect(c.loud1m!).toBeCloseTo(0.8, 1);
    expect(n.headline).toBe('지난 6시간, 가코인이 제일 크게 출렁였다');
    expect(n.sub).toContain('나코인');
    expect(n.boss).toMatch(/^(오늘은|지금은)/);
    expect(n.boss).toContain('어제 다코인이 크게 움직인 게 23시 무렵');
    expect(noteToast(n)).toMatch(/^\[도토리일보\] 지난 6시간 제일 크게 출렁인 곳은 가코인/);
    expect(Math.round(n.spanMin)).toBe(1440);
  });
  it('기록이 모자라면 모자란 대로: 빈 칸은 "–", 30분 치면 30분이라고 말한다', () => {
    const n = dayNote(M, { A: mk(30, (i) => 100 + i * 0.1), B: [], C: mk(2, () => 1) }, NOW);
    expect(n.rows[0].h1).toBeNull();
    expect(n.rows[0].range).not.toBeNull();
    expect(n.rows[1].range).toBeNull();
    expect(n.headline).toContain('지난 30분');
    expect(n.boss).toContain('한 시간쯤 지나면');
    expect(cell(null)).toBe('–');
    expect(cell(0.421)).toBe('+0.42%');
    expect(cell(-12.34)).toBe('−12.3%');
    expect(dayNote(M, {}, NOW).headline).toBe('아직 실을 시세가 없습니다.');
  });
  it('지난 하루의 봉 위에 실시간 값이 분마다 쌓인다(같은 분은 고저만 넓힌다, 1440분을 넘지 않는다)', () => {
    resetDay();
    setDayHistory({ A: mk(1440, () => 100) });
    pushDayPrice('A', 101, NOW + 5_000);
    pushDayPrice('A', 99, NOW + 20_000);
    pushDayPrice('A', 100.5, NOW + 61_000);
    const b = dayBars('A');
    expect(b).toHaveLength(1440);
    expect(b[b.length - 2]).toMatchObject({ t: NOW, o: 101, h: 101, l: 99, c: 99 });
    expect(b[b.length - 1]).toMatchObject({ t: NOW + 60_000, c: 100.5 });
    pushDayPrice('A', 0, NOW + 62_000); // 값이 없으면 넣지 않는다
    expect(dayBars('A')[1439].c).toBe(100.5);
    setDayHistory({ A: mk(10, () => 7) }); // 늦게 온 지난 봉: 그 뒤의 실시간 분은 남는다
    expect(dayBars('A').slice(-2).map((x) => x.c)).toEqual([99, 100.5]);
    resetDay();
  });
});

describe('새 그림 8장 (U-41)', () => {
  it('빈 쳇바퀴 · 빈손으로 걷는 주인공 · 굳은 주인공 · 은퇴 사진 넷 · 누를 수 있는 지도가 등록돼 있다', () => {
    for (const id of ['wheelEmpty', 'heroWalkEmpty', 'heroFrozen', 'endRetire1', 'endRetire2', 'endRetire3', 'endRetire4', 'village2'] as const) expect(sprite(id)).not.toBeNull();
  });
  it('은퇴 엔딩 넷(END-R01~R04)마다 사진이 하나씩 — 데이터의 은퇴 엔딩과 빠짐없이 맞는다', () => {
    const ids = (specialEndings as unknown as { id: string }[]).filter((e) => e.id.startsWith('END-R')).map((e) => e.id);
    expect(ids.sort()).toEqual(Object.keys(RETIRE_PHOTO).sort());
    expect(new Set(Object.values(RETIRE_PHOTO)).size).toBe(4);
  });
  it('지도의 빈터 다섯: 가게 넷 + 내 집, 전부 그림 안에 있고 서로 떨어져 있다', () => {
    expect(Object.keys(MAP_SPOTS).sort()).toEqual(['bank', 'capital', 'home', 'shark1', 'shark2']);
    const pts = Object.values(MAP_SPOTS);
    for (const p of pts) { expect(p.x).toBeGreaterThan(0.05); expect(p.x).toBeLessThan(0.95); expect(p.y).toBeGreaterThan(0.05); expect(p.y).toBeLessThan(0.88); }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, (pts[i].y - pts[j].y) * 1.77)).toBeGreaterThan(0.25);
  });
});

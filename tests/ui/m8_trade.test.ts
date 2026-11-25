// M8 화면(거래 탭·선물 계좌 개설·시간표)의 읽기 모델 시험.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { A, fresh, giveWheel, openFutures, settleOnce } from '../engine/helpers';
import { chartModel, awayModel, awayDuration, gateLines, levRuler, orderPreview, positionView, shortLine, tradeMode, tutorialLine, fmtPrice } from '../../src/ui/vm/trade';
import { tickerNotice } from '../../src/ui/vm/village';
import { ChartBox } from '../../src/ui/trade/Chart';
import { onBackground } from '../../src/engine/offline';
import { EDU_PAGES } from '../../src/ui/trade/FuturesOpen';
import type { AwayReport } from '../../src/engine/types';

describe('AC-v2-24 거래 탭 잠금 3단계', () => {
  it('단계 0: 자물쇠와 문구, 차트 자리는 비어 있다', () => {
    const g = fresh();
    const m = tradeMode(g);
    expect(m.mode).toBe('locked');
    expect(m.text).toBe('쳇바퀴를 사면 시세가 보입니다');
    expect(m.lines).toEqual([]);
  });
  it('단계 1: 읽기 전용 + 조건 3줄과 현재 값', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    g.run.minedValue = 31_200;
    const m = tradeMode(g);
    expect(m.mode).toBe('readonly');
    expect(m.lines.map((l) => l.id)).toEqual(['mined', 'edu', 'deposit']);
    expect(m.lines[0]).toMatchObject({ ok: false, text: '누적 채굴 50,000어치 (지금 31,200)' });
    expect(m.lines[1].text).toContain('사전교육·모의거래');
    expect(m.lines[2]).toMatchObject({ ok: true, text: '예탁금 30,000 확인' });
    expect(m.ready).toBe(false);
  });
  it('조건이 다 차면 창구에서 열 수 있다는 안내, 계좌가 열리면 주문 단계', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    g.run.minedValue = 60_000;
    for (let i = 0; i < 3; i++) A(g, { type: 'eduPage' });
    A(g, { type: 'mockTrade' });
    expect(tradeMode(g).ready).toBe(true);
    expect(gateLines(g).every((l) => l.ok)).toBe(true);
    expect(A(g, { type: 'openAccount' }).ok).toBe(true);
    expect(tradeMode(g).mode).toBe('orders');
  });
  it('사전교육은 3장', () => {
    expect(EDU_PAGES).toHaveLength(3);
    expect(EDU_PAGES[2].t).toContain('내려도 벌 수 있습니다');
  });
});

describe('AC-v2-145 차트 세로축', () => {
  it('68,000 ~ 68,040 이면 그 범위(여백 포함)에 맞추고 "화면 전체 0.06%"', () => {
    const prices = Array.from({ length: 120 }, (_, i) => 68000 + (i % 2 === 0 ? 0 : 40));
    const m = chartModel(prices);
    expect(m.dataLo).toBe(68000);
    expect(m.dataHi).toBe(68040);
    expect(m.lo).toBeLessThan(68000);
    expect(m.hi).toBeGreaterThan(68040);
    expect(m.hi - m.lo).toBeLessThan(60); // 범위에 맞춘다(전체 가격대가 아님)
    expect(m.label).toBe('화면 전체 0.06%');
  });
  it('최근 120초만 본다, 평평해도 최소 폭이 있다', () => {
    const m = chartModel([1, 1, 1, ...Array.from({ length: 120 }, () => 100)]);
    expect(m.dataLo).toBeLessThan(m.dataHi);
    expect(m.n).toBe(120);
  });
});

describe('AC-v2-144 차트 사각형은 깨끗하다', () => {
  it('차트 상자 안에는 캔버스 하나뿐(얼굴·잎·말풍선·문구 없음)', () => {
    const html = renderToStaticMarkup(createElement(ChartBox, { market: 'DTC', prices: [1, 2, 3], lines: [], up: '#f00', down: '#00f' }));
    expect(html).toMatch(/^<div class="chartbox" data-chart="DTC"><canvas[^>]*><\/canvas><\/div>$/);
    expect(html).not.toMatch(/<img|<span|<p|<svg|<i /);
  });
  it('차트 CSS 에 장식(가상 요소·배경 그림)이 없다', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync('src/ui/styles.css', 'utf8');
    expect(css).not.toMatch(/\.chartbox[^{]*::(before|after)/);
    const rules = css.match(/\.chartbox[^{}]*\{[^}]*\}/g) ?? [];
    for (const r of rules) expect(r).not.toMatch(/url\(/);
  });
});

describe('배율 눈금자와 주문 미리보기', () => {
  it('상한 위는 잠기고 조건 한 줄이 나온다', () => {
    const g = fresh();
    openFutures(g, 10);
    g.run.futures.closedTrades = 1;
    const r = levRuler(g);
    expect(r.map((n) => n.lev)).toEqual([1, 2, 5, 10, 25, 50, 100, 200]);
    expect(r.filter((n) => n.locked).map((n) => n.lev)).toEqual([25, 50, 100, 200]);
    expect(r.find((n) => n.lev === 50)!.lockText).toBe('끝난 거래 3건 뒤 50배 — 지금 1건');
    expect(r.find((n) => n.lev === 100)!.hot).toBe(true);
    g.run.futures.closedTrades = 10;
    expect(levRuler(g).find((n) => n.lev === 200)!.lockText).toContain('확인서');
  });
  it('안내 한 줄: 증거금 · 수수료 · 청산가(%)', () => {
    const g = fresh();
    openFutures(g, 50);
    g.run.cash = 100_000;
    const p = orderPreview(g, 'DTC', 1, 25, 25);
    expect(p.margin).toBe(25_000);
    expect(p.fee).toBe(250);
    expect(p.info).toBe('증거금 25,000 · 수수료 250 · 청산가 65,348(−3.9%)'.replace('65,348', fmtPrice('DTC', p.liq)));
    expect(p.info).toMatch(/청산가 65,3\d\d\(−3\.9%\)/);
    expect(p.reason).toBeNull();
  });
  it('지연·정지·현금 부족이면 이유가 나온다', () => {
    const g = fresh();
    openFutures(g, 50);
    g.run.marketStatus = 'delayed';
    expect(orderPreview(g, 'DTC', 1, 10, 25).reason).toContain('지연');
    g.run.marketStatus = 'halted';
    expect(orderPreview(g, 'DTC', 1, 10, 25).reason).toContain('정지');
    g.run.marketStatus = 'open';
    g.run.cash = 500;
    expect(orderPreview(g, 'DTC', 1, 10, 25).reason).toBeTruthy();
  });
});

describe('포지션 줄·숏 보험 줄·처음 세 번 설명', () => {
  it('ROE·꼬리표(출처·빌린 돈)', () => {
    const g = fresh();
    openFutures(g, 50);
    g.run.cash = 100_000;
    expect(A(g, { type: 'open', market: 'DTC', dir: 1, lev: 25, marginPct: 25 }).ok).toBe(true);
    const p = g.run.positions.DTC;
    p.tipSource = 'friend:fox';
    p.fundedBy = 'capital';
    const v = positionView(g, 'DTC')!;
    expect(v.dirText).toBe('롱');
    expect(v.lev).toBe(25);
    expect(v.tags).toEqual(['출처 여우 선배', '캐피탈에서 빌린 돈']);
    expect(v.liq).toBeLessThan(v.entry);
    expect(positionView(g, 'BTH')).toBeNull();
  });
  it('지갑 도토코인 N어치 — 숏으로 지킨 비율 N%', () => {
    const g = fresh();
    openFutures(g, 50);
    giveWheel(g, 'DTC');
    g.run.wallet.DTC.qty = 12_400 / g.run.prices.DTC;
    expect(shortLine(g, 'DTC')).toBe('지갑 도토코인 12,400어치 — 숏으로 지킨 비율 0%');
    expect(shortLine(g, 'JQQ')).toBeNull();
  });
  it('끝난 거래가 3건이 되기 전까지만 칩멍크 설명', () => {
    const g = fresh();
    expect(tutorialLine(g)).toBeNull();
    openFutures(g, 10);
    expect(tutorialLine(g)).toContain('배율');
    g.run.futures.closedTrades = 3;
    expect(tutorialLine(g)).toBeNull();
  });
});

describe('AC-v2-98 앱이 가려질 때 속보 띠', () => {
  it('포지션 수와 가장 가까운 청산가까지의 거리가 사실 문장으로 한 번', () => {
    const g = fresh();
    openFutures(g, 50);
    g.run.cash = 100_000;
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, marginPct: 25 });
    onBackground(g);
    const n = tickerNotice(g.run)!;
    expect(n.kind).toBe('wire');
    expect(n.text).toMatch(/포지션 1개/);
    expect(n.text).toMatch(/청산가까지 \d+\.\d%/);
    settleOnce(g, 1);
    expect(tickerNotice(g.run)?.text ?? '').not.toMatch(/청산가까지/);
  });
});

describe('자리를 비운 사이 시간표', () => {
  const rep: AwayReport = {
    awayHours: 7.87, awaySec: 7 * 3600 + 52 * 60, fromTick: 100, toTick: 100 + 28320, economySettlements: 2,
    openAtLeave: [{ market: 'BTH', dir: 1, lev: 200, margin: 42000 }],
    entries: [
      { tick: 100 + 7980, kind: 'liq', text: '밤더리움 강제 청산', amount: -42000, market: 'BTH' },
      { tick: 100 + 7980, kind: 'tp', text: '도토코인 숏 100배 익절', amount: 18600 },
    ],
    bankrupt: false, settlementSummary: { mined: 11400, power: 7980, interest: 18000 },
  };
  it('제목·나간 지 N시간·정산 한 줄', () => {
    const m = awayModel(rep, Date.UTC(2026, 10, 25, 12, 0, 0));
    expect(m.title).toBe('자리를 비운 사이 — 7시간 52분');
    expect(m.rows).toHaveLength(2);
    expect(m.rows[0].sinceLeave).toBe('나간 지 2시간 13분');
    expect(m.rows[0].tone).toBe('loss');
    expect(m.rows[1].tone).toBe('gain');
    expect(m.footer).toBe('정산은 2회만 돌았습니다: 캔 값 +11,400 / 전기세 −7,980 / 이자 −18,000');
    expect(m.openAtLeave[0]).toBe('밤더리움 롱 200배 (증거금 42,000)');
    expect(m.marks).toHaveLength(2);
  });
  it('시간 표기', () => {
    expect(awayDuration(45 * 60)).toBe('45분');
    expect(awayDuration(26 * 3600)).toBe('1일 2시간');
  });
});

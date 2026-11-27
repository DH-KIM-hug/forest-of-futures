// U-57(회차 16): 날다람쥐 교과서 모양의 화면 쪽(끝난 뒤에만 이름), 숲 소문 걷기, 장면 순서, 튜토리얼 계단, 나무 화폐 이름
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { donePatterns, windNow, PATTERN_ODDS_TEXT, FLY_1M_PCT } from '../../src/ui/proto/flyWind';
import { flyEpisodesBetween, flyCandles } from '../../src/engine/feed/fly';
import { collapseHeld, LIQ_QUIET_MS, liqQuietLeft } from '../../src/ui/proto/watch';
import { historyOf, pushPrices, pushOne, dropLast, beginScript, endScript, resetHistory } from '../../src/ui/priceHistory';
import type { Scene } from '../../src/ui/proto/protoStore';

const T0 = 1_764_000_000;

describe('끝난 차트 모양(앞일은 말하지 않는다)', () => {
  it('이름은 끝난 모양에만 붙는다: 지금 생기는 중인 모양은 목록에 없다', () => {
    for (let k = 0; k < 200; k++) {
      const now = T0 + k * 997;
      const done = donePatterns(now - 1800, now);
      for (const e of done) expect(e.t1).toBeLessThanOrEqual(now);
      const live = flyEpisodesBetween(now, now).filter((e) => e.t0 <= now && e.t1 > now);
      for (const e of live) expect(done.some((d) => d.t0 === e.t0)).toBe(false);
    }
  });
  it('바람 줄의 「방금」은 끝난 지 4분 안의 모양, 지난 하루 성적은 열에 일곱쯤 교과서대로', () => {
    let seen = 0;
    for (let k = 0; k < 100; k++) {
      const w = windNow(T0 + 50_000 + k * 613);
      if (w.done) { seen++; expect(w.done.ago).toBeGreaterThanOrEqual(0); expect(w.done.ago).toBeLessThanOrEqual(240); }
      expect(w.rec.n).toBeGreaterThan(60);
      expect(w.rec.ok / w.rec.n).toBeGreaterThan(0.55);
      expect(w.rec.ok / w.rec.n).toBeLessThan(0.85);
    }
    expect(seen).toBeGreaterThan(10);
    expect(PATTERN_ODDS_TEXT).toMatch(/열에 7쯤 교과서대로/);
    expect(PATTERN_ODDS_TEXT).not.toMatch(/·/);
  });
  it('평소 1분 폭(화면의 말)은 시세 함수의 1분 봉 폭과 맞는다', () => {
    const cs = flyCandles(T0, T0 + 48 * 3600);
    const r = cs.map((c) => (c.h - c.l) / c.l * 100).sort((a, b) => a - b)[cs.length >> 1];
    expect(Math.abs(r - FLY_1M_PCT)).toBeLessThan(0.15);
  });
});

describe('숲 소문은 걷었다(U-57 사용자 결정)', () => {
  it('화면 코드에 소문이 남지 않는다', () => {
    for (const f of ['src/ui/proto/Trade.tsx', 'src/ui/proto/watch.ts', 'src/ui/proto/flyWind.ts', 'src/engine/feed/fly.ts', 'src/ui/proto/trade.css']) {
      const s = readFileSync(f, 'utf8');
      expect(s).not.toMatch(/숲 소문|flyTell|TELL_|data-rumor/);
    }
  });
});

describe('들고 있는 동안 밀린 장면의 순서(회차 15 평가)', () => {
  const sc = (id: string): Scene => ({ id, lines: [] } as unknown as Scene);
  it('연체는 마지막 것 하나만, 사채 문자는 연체가 있으면 빼고, 압류가 먼저', () => {
    const out = collapseHeld([sc('overdue5'), sc('sms'), sc('overdue6'), sc('seize2'), sc('quit')]).map((x) => x.id);
    expect(out).toEqual(['seize2', 'overdue6', 'quit']);
    expect(collapseHeld([sc('sms')]).map((x) => x.id)).toEqual(['sms']);
  });
  it('청산 도장이 떠 있는 동안 승급 카드는 기다린다(시간)', () => {
    expect(LIQ_QUIET_MS).toBeGreaterThanOrEqual(1800);
    expect(liqQuietLeft()).toBe(0);
  });
});

describe('튜토리얼의 짜 둔 계단은 끝나면 남지 않는다(회차 15 평가)', () => {
  it('계단이 도는 동안 온 틱의 값은 쌓지 않고, 끝나면 계단만 걷힌다', () => {
    resetHistory();
    pushPrices({ DTC: 100, FLY: 50 }, 1);
    pushPrices({ DTC: 101, FLY: 51 }, 2);
    beginScript('DTC');
    pushOne('DTC', 110); pushOne('DTC', 120);
    pushPrices({ DTC: 125, FLY: 52 }, 3); // 그 사이 실제 틱(값은 짜 둔 값)
    pushOne('DTC', 130);
    dropLast('DTC', 3);
    endScript('DTC');
    expect(historyOf('DTC')).toEqual([100, 101]);
    expect(historyOf('FLY')).toEqual([50, 51, 52]);
    pushPrices({ DTC: 102, FLY: 53 }, 4);
    expect(historyOf('DTC')).toEqual([100, 101, 102]);
  });
});

describe('나무 화폐의 이름은 하나(황금 도토코인)', () => {
  it('화면 글에 「금박 도장」, 「금박 +」, 맨 「황금 +」가 없다', () => {
    for (const f of ['src/ui/proto/Tabs.tsx', 'src/ui/proto/watch.ts', 'src/ui/proto/text.ts', 'src/ui/proto/Ending.tsx', 'src/ui/proto/ledger.ts', 'src/ui/proto/ProtoApp.tsx']) {
      const code = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
      expect(code).not.toMatch(/['`>]금박 도장|금박 \+|황금 \+|황금 \$\{/);
    }
  });
});

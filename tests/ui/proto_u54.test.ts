// U-54(회차 13): 거래소가 넘어져 화면이 꺼지던 것(훅 순서), 접속하자마자 뜨는 "지금 출렁이는 곳"(거래소의 진짜 1분 봉).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { barSwing, swingRank } from '../../src/ui/proto/market';

describe('거래소 화면의 훅 순서', () => {
  it('ProtoTrade 는 잠김, 계좌 없음 화면으로 일찍 돌아가기 전에 훅을 모두 부른다', () => {
    const src = readFileSync(new URL('../../src/ui/proto/Trade.tsx', import.meta.url), 'utf8');
    const start = src.indexOf('export function ProtoTrade()');
    const body = src.slice(start);
    const firstReturn = body.search(/\n  if \(mode\.mode === '(locked|readonly)'\) \{/);
    expect(firstReturn).toBeGreaterThan(0);
    // 함수 몸 안쪽 첫 단(두 칸 들여쓰기)의 훅 부름만 본다
    const end = body.indexOf('\n}\n');
    const after = body.slice(firstReturn, end).split('\n').filter((l) => /^ {2}(const|let)?.*\buse[A-Z]\w*\(/.test(l) && /^ {2}\S/.test(l));
    expect(after).toEqual([]);
  });
});

describe('지금 출렁이는 곳 — 진짜 1분 봉으로 바로', () => {
  const now = 10 * 60_000 + 5_000;
  const bar = (min: number, pct: number) => ({ t: min * 60_000, h: 100 * (1 + pct / 100), l: 100, c: 100 });
  it('끝난 분의 봉만, 끝에서부터 셋을 평균한다', () => {
    const s = barSwing([bar(5, 5), bar(7, 1), bar(8, 2), bar(9, 3), bar(10, 9)], now)!;
    expect(s.bars).toBe(3);
    expect(s.pct).toBeCloseTo(2, 5);
  });
  it('오래된 봉뿐이면 재지 않는다', () => {
    expect(barSwing([bar(2, 1), bar(3, 1)], now)).toBeNull();
    expect(barSwing([], now)).toBeNull();
  });
  it('실시간 값이 3분 모이기 전에는 봉으로 줄 세우고, 다 모이면 실시간 값이 먼저다', () => {
    const r = swingRank([
      { id: 'A', live: [], bars: [bar(7, 0.2), bar(8, 0.2), bar(9, 0.2)] },
      { id: 'B', live: [], bars: [bar(7, 1), bar(8, 1), bar(9, 1)] },
      { id: 'C', live: [], bars: [bar(9, 3)], shut: true },
    ], 3, 3, now);
    expect(r.map((x) => x.id)).toEqual(['B', 'A']);
    expect(r[0].bars).toBe(3);
    const saw = Array.from({ length: 180 }, (_, i) => 100 * (1 + 0.005 * ((i % 60) / 60)));
    const r2 = swingRank([{ id: 'A', live: saw, bars: [bar(7, 9), bar(8, 9), bar(9, 9)] }], 3, 3, now);
    expect(r2[0].pct).toBeLessThan(1);
  });
});

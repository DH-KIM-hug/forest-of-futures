// U-53(회차 12): 지금 출렁이는 곳(1분 봉 폭 순위), 되풀이 정산 한 줄, 등급의 폰(꾸밈).
import { describe, expect, it } from 'vitest';
import { candleSwing, swingRank } from '../../src/ui/proto/market';
import { remarkIsRoutine, settleRemark } from '../../src/ui/proto/react';
import { lookOf, RANK_LOOKS, rankOf } from '../../src/ui/proto/frxRank';

/** 1초에 하나, 분마다 폭이 pct(%)인 톱니 */
const saw = (mins: number, pct: number, base = 100): number[] => Array.from({ length: mins * 60 }, (_, i) => base * (1 + (pct / 100) * (i % 60 < 30 ? (i % 30) / 30 : 1 - (i % 30) / 30)));

describe('지금 출렁이는 곳', () => {
  it('다 찬 1분 봉이 없으면 재지 않는다', () => {
    expect(candleSwing(saw(1, 1).slice(0, 59))).toBeNull();
  });
  it('끝에서부터 다 찬 봉의 높낮이 폭을 평균한다(최대 3개)', () => {
    const s = candleSwing([...saw(5, 0.1), ...saw(3, 1)])!;
    expect(s.bars).toBe(3);
    expect(s.pct).toBeGreaterThan(0.9);
    expect(s.pct).toBeLessThan(1.05);
  });
  it('폭이 큰 순서, 쉬는 종목과 못 잰 종목은 뺀다', () => {
    const r = swingRank([
      { id: 'A', live: saw(3, 0.2) },
      { id: 'B', live: saw(3, 2) },
      { id: 'C', live: saw(3, 5), shut: true },
      { id: 'D', live: saw(0, 1) },
      { id: 'E', live: saw(3, 0.8) },
    ]);
    expect(r.map((x) => x.id)).toEqual(['B', 'E', 'A']);
  });
});

describe('되풀이 정산 한 줄', () => {
  const base = { interest: 4800, other: 0, net: -1800, cashAfter: 90_000, nextClaim: 5130, nextNet: -1800, overdue: false, posOpen: false, negStreak: 1, firstPositive: false, nth: 2 };
  it('"이자 받았어요"는 되풀이다', () => {
    expect(remarkIsRoutine(base)).toBe(true);
    expect(settleRemark(base)).toMatch(/추심원/);
  });
  it('연체, 곧 밀린다는 경고, 처음 남은 정산, 세 번째 적자는 이야기라 늘 말한다', () => {
    expect(remarkIsRoutine({ ...base, overdue: true })).toBe(false);
    expect(remarkIsRoutine({ ...base, cashAfter: 3000 })).toBe(false);
    expect(remarkIsRoutine({ ...base, firstPositive: true })).toBe(false);
    expect(remarkIsRoutine({ ...base, negStreak: 3 })).toBe(false);
  });
});

describe('등급의 폰', () => {
  it('오를 때마다 무언가 하나 바뀐다(케이스나 고리)', () => {
    for (let r = 1; r < 9; r++) {
      const a = lookOf(r - 1), b = lookOf(r);
      expect(a.case !== b.case || a.bow !== b.bow).toBe(true);
      expect(b.gift.length).toBeGreaterThan(0);
    }
  });
  it('새싹은 원래 폰이다', () => {
    expect(lookOf(rankOf(0, 0).r)).toBe(RANK_LOOKS[0]);
    expect(RANK_LOOKS[0].case).toBe('teal');
  });
});

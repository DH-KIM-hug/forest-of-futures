import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Recording } from '../src/engine/feed/replayFeed';
import { ARCHETYPES, buildCache, median, simulate, type GenRec } from '../scripts/sim/sim_v3_lib';

const rec: Recording = JSON.parse(readFileSync(join(__dirname, '../docs/gdd/v2/sim/data/hl_3m.json'), 'utf8'));

describe('sim_v3 (엔진 직접 호출)', () => {
  it('AC-v2-119 sim_v3: 포기를 이어 가며 한을 3.14 (5) 순서로 써서, 플레이한 세대 1~5의 빚 청산 시간을 모은다(수치 판정은 SIM_v3.md)', async () => {
    const cache = buildCache(rec);
    const a = ARCHETYPES.find((x) => x.id === 'engine_normal')!;
    const runs: GenRec[][] = [];
    for (let r = 0; r < 4; r++) runs.push(await simulate(cache, { archetype: a, seed: r + 1, offsetSec: 1 + Math.floor((r / 4) * cache.L), branch: 'renounce', holdHours: 6, genHours: 72, maxHours: 336 }));
    const med: (number | null)[] = [];
    for (let p = 1; p <= 5; p++) {
      const xs = runs.map((r) => r[p - 1]?.debtFreeH).filter((x): x is number => typeof x === 'number');
      expect(xs.length).toBeGreaterThan(0);
      med.push(median(xs));
    }
    // 세대를 거듭할수록 빨라진다(가훈이 쌓여 다음 세대가 빨라진다는 프레스티지 구조)
    expect(med[2]!).toBeLessThan(med[0]!);
    expect(med[4]!).toBeLessThanOrEqual(med[2]!);
    // 한이 실제로 쌓이고 쓰였다
    expect(runs.every((r) => r[0].han > 0 && Object.keys(r[0].treeAfter).length > 0)).toBe(true);
    // 첫 쳇바퀴·선물 계좌 측정이 들어 있다
    expect(runs.every((r) => r[0].firstWheelOnlineSec! > 100 && r[0].futuresH !== null)).toBe(true);
  }, 60000);

  it('같은 시드·같은 입력이면 같은 결과', async () => {
    const cache = buildCache(rec);
    const a = ARCHETYPES.find((x) => x.id === 'engine_normal')!;
    const o = { archetype: { ...a, maxGens: 2 }, seed: 3, offsetSec: 5000, branch: 'limited' as const, holdHours: 6, genHours: 72, maxHours: 200 };
    expect(JSON.stringify(await simulate(cache, o))).toBe(JSON.stringify(await simulate(cache, o)));
  }, 60000);
});

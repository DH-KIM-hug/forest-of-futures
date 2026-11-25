import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as D from '../../src/engine/data';

const dataDir = join(__dirname, '../../data');
const files = readdirSync(dataDir).filter((f) => f.endsWith('.json'));

describe('M0 데이터 스키마 (GDD_v2 4장)', () => {
  it('v1 파일(jobs/loans)은 없고 v2 파일이 모두 있다', () => {
    for (const f of ['balance', 'markets', 'equipment', 'upgrades', 'legacy', 'lenders', 'friends', 'housing', 'tips', 'events', 'traits', 'heirlooms', 'endings'])
      expect(files).toContain(f + '.json');
    expect(files).not.toContain('jobs.json');
    expect(files).not.toContain('loans.json');
  });

  it('모든 data/*.json 에 version: 2 가 있다 (endings 는 meta.version)', () => {
    for (const f of files) {
      const j = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
      expect(f === 'endings.json' ? j.meta.version : j.version, f).toBe(2);
    }
  });

  it('balance.json: 4.1 의 값 그대로', () => {
    const b = D.balance;
    expect(b.start).toEqual({ generation: 2, cash: 100000, debts: { capital: 150000, shark1: 150000 }, house: 0 });
    expect(b.settlement.intervalSec).toBe(180);
    expect(b.settlement.dayCycleSettlements).toBe(4);
    expect(b.settlement.payOrder).toEqual(['shark2', 'shark1', 'capital', 'bank', 'tax', 'upkeep']);
    expect(b.living.byHouse).toEqual([1000, 8000, 30000, 140000, 650000]);
    expect(b.progression.acornPerTap).toBe(27);
    expect(b.progression.maxTapsPerSec).toBe(12);
    expect(b.progression.firstWheelUnlockTaps).toBe(30);
    expect(b.progression.stage0OfflineSettlements).toBe(0);
    expect(b.progression.futures.levCaps.map((c: any) => c.cap)).toEqual([10, 50, 200]);
    expect(b.mining.autoShare).toBe(0);
    expect(b.assets.costGrowth).toBe(1.25);
    expect(b.seizure.garnishRate).toBe(0.3);
    expect(b.trading.leverageOptions).toEqual([1, 2, 5, 10, 25, 50, 100, 200]);
    expect(b.inheritance.minStartDebt).toBe(200000);
    expect(b.ranking.npcs).toHaveLength(9);
    // 폐지된 v2-draft 항목은 옮기지 않았다
    for (const k of ['economy', 'labor', 'humanPattern', 'policyReserve', 'regularPerGen']) expect(b[k]).toBeUndefined();
  });

  it('markets.json: 5종목, 실제 종목 이름이 없다(서버 설정에만)', () => {
    expect(D.marketDefs.map((m) => m.id)).toEqual(['DTC', 'BTH', 'SMS', 'MDT', 'JQQ']);
    expect(D.marketById.DTC.startPrice).toBe(68000);
    expect(D.marketById.JQQ.minable).toBe(false);
    const txt = readFileSync(join(dataDir, 'markets.json'), 'utf8');
    expect(txt).not.toMatch(/BTC|ETH|SOL|DOGE|XRP|Hyperliquid|BTCUSDT/);
    for (const m of D.marketDefs) expect(D.simFeedCfg.params[m.id]).toBeTruthy();
  });

  it('equipment.json: 종목 쳇바퀴 4종과 설비 사다리 7단계가 3.3·3.4 표와 같다', () => {
    expect(D.coinWheelDefs.map((w) => [w.id, w.cost, w.yieldMul, w.powerMul, w.tapMul])).toEqual([
      ['wheel:DTC', 10000, 1.0, 0.7, 1.0],
      ['wheel:BTH', 30000, 1.1, 0.78, 1.07],
      ['wheel:MDT', 15000, 1.3, 0.95, 1.17],
      ['wheel:SMS', 60000, 1.2, 0.86, 1.13],
    ]);
    expect(D.tierDefs.map((t) => [t.id, t.cost, t.grossPerSettle, t.needHouse])).toEqual([
      ['wheel2', 20000, 5700, 0], ['helper', 60000, 14700, 0], ['row', 150000, 32250, 0], ['generator', 400000, 75000, 0],
      ['shed', 1500000, 240000, 1], ['powerroom', 8000000, 1020000, 2], ['farm', 40000000, 3900000, 3],
    ]);
    // 표의 초당 순수입 = grossPerSettle × (1 − 0.70) ÷ 180
    for (const t of D.tierDefs) expect(t.netPerSec).toBeCloseTo((t.grossPerSettle * 0.3) / 180, 2);
    expect(D.tierDefs.filter((t) => t.bankCollateral).map((t) => t.id)).toEqual(['shed', 'powerroom', 'farm']);
  });

  it('upgrades.json: 7줄, 비용식 변수가 3.4a 표와 같다', () => {
    expect(D.upgradeTracks.map((t) => [t.id, t.maxLevel, t.r])).toEqual([
      ['glove', 10, 1.15], ['shoes', 30, 1.15], ['oil', 20, 1.1], ['spokes', 10, 1.15], ['power', 15, 1.12], ['tier', 10, 1.12], ['fee', 10, 1.15],
    ]);
    expect(D.trackById.glove.baseCost).toBe(4000);
    expect(D.trackById.oil.baseCostOfWheel).toBe(0.2);
    expect(D.trackById.power.baseCostOfWheel).toBe(0.3);
    expect(D.trackById.tier.baseCostOfTier).toBe(0.05);
    expect(D.trackById.fee.effect.addPctPoint).toBe(-0.03);
    expect(Object.keys(D.upgradesMeta.onSeize)).toEqual(['coinWheel', 'tier', 'body', 'run']);
  });

  it('legacy.json: 가훈(표시 이름)과 12줄 트리', () => {
    expect(D.legacy.currency.id).toBe('han');
    expect(D.legacy.currency.name).toBe('가훈');
    expect(Object.keys(D.legacy.maxims.byCause)).toHaveLength(8);
    expect(D.treeDefs.map((t) => [t.id, t.baseCost, t.r, t.maxLevel])).toEqual([
      ['grip', 5, 1.5, 10], ['craft', 6, 1.5, 10], ['seed', 8, 1.6, 5], ['heirwheel', 15, 2.6, 3], ['prep', 10, 1.6, 5], ['nerve', 30, 4, 2],
      ['haggle', 12, 1.7, 5], ['exempt', 10, 1.6, 5], ['lastwheel', 40, 3.5, 2], ['idle', 25, 2, 4], ['thickskin', 20, 3, 2], ['crest', 10, 1.5, 10],
    ]);
    expect(D.legacy.score.newEnding).toBe(5);
    expect(D.legacy.crestTiers).toEqual([10, 50, 200, 1000]);
  });

  it('lenders/friends/housing/events/traits/heirlooms/tips 의 개수와 핵심 값', () => {
    expect(D.lenderDefs.map((l) => [l.id, l.rate, l.maxOverdue])).toEqual([['bank', 0.01, 3], ['capital', 0.02, 3], ['shark1', 0.04, 2], ['shark2', 0.08, 2], ['tax', 0, 1]]);
    expect(D.lenderById.shark2.upfront).toBe(0.4);
    expect(D.lenderById.tax.deadlineSettlements).toBe(8);
    expect(D.friendDefs).toHaveLength(5);
    expect(D.friendDefs.every((f) => f.tipRole)).toBe(true);
    expect(D.housePrice).toEqual([0, 500000, 2000000, 10000000, 50000000]);
    expect(D.houseDefs.every((h) => (h as any).upkeepPerSettlement === undefined)).toBe(true);
    expect(D.eventDefs.map((e) => e.id)).toEqual(['rate_hike', 'housing_slump', 'housing_crash', 'subsidy']);
    expect(D.eventsMeta.rollProbPerSettlement).toBe(0.35);
    expect(D.traitDefs).toHaveLength(9);
    expect(D.heirloomDefs).toHaveLength(8);
    expect(D.tipsData.sources).toHaveLength(11);
  });
});

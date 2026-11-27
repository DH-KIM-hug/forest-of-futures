// U-43(회차 5b): 캐는 돈은 틱(1초)마다 들어오고, 정산은 걷어 가기만 한다. 한 쳇바퀴는 한 명이 돌린다(알바가 든 쳇바퀴는 주인공이 못 굴린다).
// 사용자: "알바로 버는 돈은 거의 0.1초당 올라가고 정산은 20초당 되고 이런 식이 되어야지?", "알바 고용하면 그때부터 탭은 안 되어야 하는데 되네?"
import { describe, expect, it } from 'vitest';
import { A, bare, giveEquip, giveWheel, settleOnce, tickN, clone } from './helpers';
import { balance } from '../../src/engine/data';
import { forecast, settle } from '../../src/engine/settlement';
import { rollTarget } from '../../src/engine/mining';
import { walletValueOf } from '../../src/engine/selectors';
import type { GameState } from '../../src/engine/types';

const I = balance.settlement.intervalSec;
/** 도토코인 쳇바퀴(알바) + 보조 쳇바퀴 n대(알바). 바로 팔기 */
function staffedHouse(n: number, autoSell = true): GameState {
  const g = bare();
  giveWheel(g, 'DTC', { autoSell });
  g.run.coinWheels.DTC.staffed = true;
  for (let i = 0; i < n; i++) giveEquip(g, 'wheel2', 'DTC', 50000);
  g.run.settleIn = I;
  return g;
}

describe('U-43 캐는 돈은 1초마다', () => {
  it('정산 사이에도 틱마다 현금이 오르고, 한 정산 동안 들어온 합은 예전(정산 때 한꺼번에)과 같다', () => {
    const g = staffedHouse(2);
    const mined = forecast(g).mined;
    expect(mined).toBe(6500 * 3);
    const c0 = g.run.cash;
    const seen: number[] = [];
    for (let k = 0; k < I - 1; k++) { tickN(g, 1); seen.push(g.run.cash); }
    // 정산 전인데 벌써 들어왔다: 매 틱 오른다(바로 팔기의 1도토리 내림 때문에 한두 틱은 같을 수 있다)
    const ups = seen.filter((v, i) => v > (i ? seen[i - 1] : c0)).length;
    expect(ups).toBeGreaterThanOrEqual(I - 3);
    const perSec = (mined * (1 - 0.005)) / I;
    expect(seen[9] - c0).toBeGreaterThan(perSec * 10 - 2);
    expect(seen[9] - c0).toBeLessThan(perSec * 10 + 2);
    tickN(g, 1); // 정산
    const rep = g.run.lastSettlement!;
    expect(rep.mined).toBeCloseTo(mined, 6);
    // 견줌: 같은 판에서 틱 없이 정산만 부르면(따라잡기 길) 한 구간 전체가 정산에서 들어온다 — 캔 값은 같다
    const h = staffedHouse(2);
    settle(h);
    expect(h.run.lastSettlement!.mined).toBeCloseTo(rep.mined, 6);
  });

  it('바로 팔기를 끄면 지갑의 코인도 1초마다 쌓이고, 한 구간의 합은 같다', () => {
    const g = staffedHouse(1, false);
    tickN(g, 30);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo((13000 * 30) / I, 6);
    tickN(g, g.run.settleIn);
    expect(g.run.lastSettlement!.mined).toBeCloseTo(13000, 6);
    expect(walletValueOf(g.run, 'DTC')).toBeCloseTo(13000, 6);
  });

  it('정산은 걷어 가기만 한다: 정산 틱의 현금 변화 = 그 1초어치 − (이자 + 생활비 + 일당)', () => {
    const g = staffedHouse(2);
    tickN(g, I - 1);
    const before = g.run.cash;
    const fc = forecast(g);
    tickN(g, 1);
    const rep = g.run.lastSettlement!;
    const lastSec = (fc.mined * 0.995) / I;
    const charged = rep.interest + rep.living + rep.wages;
    expect(rep.unpaid).toBe(0);
    expect(g.run.cash - before).toBeGreaterThan(lastSec - charged - 2);
    expect(g.run.cash - before).toBeLessThan(lastSec - charged + 2);
  });

  it('가압류(딱지 30%)는 1초마다 들어오는 돈에도 붙고, 정산마다 떼인 몫(garnishBySettle)은 그 구간 전체를 센다', () => {
    const g = staffedHouse(2);
    g.run.coinWheels.DTC.tagBy = 'shark1';
    const p0 = g.run.debts.shark1.principal;
    tickN(g, 60);
    const cut = p0 - g.run.debts.shark1.principal;
    expect(cut).toBeGreaterThan(19500 * 60 / I * 0.3 - 3); // 1분 동안 이미 원금에서 깎였다
    tickN(g, g.run.settleIn);
    const rep = g.run.lastSettlement!;
    const gar = (g.run.stats.garnishBySettle as number[]).slice(-1)[0];
    expect(gar).toBeGreaterThan(rep.mined * 0.3 - 3);
    expect(gar).toBeLessThanOrEqual(rep.mined * 0.3 + 1);
    // 다음 정산 몫은 다시 0 에서 센다(이자를 다 내면 딱지가 떨어지니, 기준판으로 다시 붙인다)
    g.run.coinWheels.DTC.tagBy = 'shark1';
    tickN(g, g.run.settleIn);
    const gar2 = (g.run.stats.garnishBySettle as number[]).slice(-1)[0];
    expect(gar2).toBeGreaterThan(rep.mined * 0.3 - 3);
    expect(gar2).toBeLessThanOrEqual(rep.mined * 0.3 + 1);
  });

  it('실려 간(압류된) 쳇바퀴는 그 틱부터 캐지 않는다', () => {
    const g = staffedHouse(1);
    tickN(g, 10);
    const uid = g.run.equipment[0].uid;
    g.run.equipment = g.run.equipment.filter((u) => u.uid !== uid); // 압류로 실려 갔다
    const c = g.run.cash;
    tickN(g, 10);
    expect(g.run.cash - c).toBeGreaterThan((6500 * 0.995 * 10) / I - 2);
    expect(g.run.cash - c).toBeLessThan((6500 * 0.995 * 10) / I + 2);
  });

  it('따라잡기(정산만 부름)는 그 구간의 남은 몫만 넣는다: 틱 60번 + 정산 = 정산 한 번', () => {
    const a = staffedHouse(2);
    const b = clone(a);
    tickN(a, 60);
    settle(a);
    settle(b);
    expect(a.run.lastSettlement!.mined).toBeCloseTo(b.run.lastSettlement!.mined, 6);
    expect(Math.abs(a.run.cash - b.run.cash)).toBeLessThanOrEqual(2);
    settleOnce(a);
    expect(a.run.lastSettlement!.mined).toBeCloseTo(19500, 6);
  });
});

describe('U-43 쳇바퀴 한 대는 한 명이 돌린다', () => {
  it('엄마의 쳇바퀴에 알바가 없으면 주인공이 굴린다(mom). 알바를 들이면 알바 없는 보조 쳇바퀴로 간다. 다 들면 굴리기는 거절된다', () => {
    const g = bare();
    giveWheel(g, 'DTC', { autoSell: true });
    expect(rollTarget(g.run)).toBe('mom');
    expect(A(g, { type: 'tap' }).ok).toBe(true);
    g.run.coinWheels.DTC.staffed = true;
    expect(rollTarget(g.run)).toBe(null);
    expect(A(g, { type: 'tap' })).toMatchObject({ ok: false, code: 'staffed' });
    const u = giveEquip(g, 'wheel2', 'DTC', 50000, true, false);
    expect(rollTarget(g.run)).toBe(u.uid);
    tickN(g, 1);
    const c = g.run.cash;
    expect(A(g, { type: 'tap' }).ok).toBe(true);
    expect(g.run.cash).toBeGreaterThanOrEqual(c);
    u.staffed = true;
    expect(A(g, { type: 'tap' })).toMatchObject({ ok: false, code: 'staffed' });
  });
});

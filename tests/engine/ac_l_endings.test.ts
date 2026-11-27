import { describe, it, expect } from 'vitest';
import { A, bare, giveEquip, giveWheel, noDebts, openFutures, pushBar, settleOnce, tickN } from './helpers';
import { archiveEntry, candidatesFor, chooseEnding, fillLine, neighborsOf, previewEnding, finalizeEnding, evalCond } from '../../src/engine/endings';
import { buildSnapshot, missingKeys } from '../../src/engine/snapshot';
import { runTips } from '../../src/engine/tips';
import { determineCause, declareBankruptcy } from '../../src/engine/bankruptcy';
import { endingById, endings, endingsMeta } from '../../src/engine/data';
import type { GameState } from '../../src/engine/types';

const P = 68000;
const snapOf = (g: GameState, cause: string, lastLender: any = null, shortfall = 0) => buildSnapshot(g, { cause, lastLender, shortfall });

/** 오소리 연체를 한도에 닿게 해서 다음 정산에 파산시킨다(가져갈 것 없음). */
function bustOnShark(g: GameState) {
  g.run.cash = 0;
  g.run.debts.capital.principal = 0;
  g.run.debts.shark1.overdue = 1;
}

describe('L. 엔딩', () => {
  it('AC-v2-120 절교 3명과 오소리 연체 한도가 같은 정산에 겹치면 FRIEND', () => {
    const g = bare();
    bustOnShark(g);
    for (const id of ['squirrel', 'raccoon', 'rabbit']) g.run.friends[id].broken = true;
    settleOnce(g);
    expect(g.run.bankruptcy!.cause).toBe('FRIEND');
    expect(g.pendingEnding!.cause).toBe('FRIEND');
    expect(endingById[g.pendingEnding!.id].causes).toContain('FRIEND');
  });

  it('AC-v2-121 족제비 추천을 보고 8초 뒤 진입한 포지션이 청산돼 미납액 이상 손실, 오소리 한도, 가져갈 것 없음: TIP, tipSource=weasel, 미수집이면 END-181', () => {
    const g = bare();
    openFutures(g);
    noDebts(g);
    g.run.debts.shark1.principal = 400000; // 이자 5,200 이 청산 뒤 남은 현금보다 크게(U-47: 오소리 1.3%)
    g.run.cash = 100000;
    // 직전 15정산(15분, U-47) 동안 크게 올랐다 -> 족제비 "올라갑니다". 15분 평소 폭 = 60초 봉 폭 × √15
    const avg15 = g.run.mkt.avg.DTC.range180 * Math.sqrt(60 / 180) * Math.sqrt(15);
    let p = P;
    for (let i = 0; i < 15; i++) {
      const next = p * (1 + (avg15 * 1.5) / 15);
      pushBar(g, 'DTC', { o: p, h: next, l: p, c: next });
      p = next;
    }
    g.run.prices.DTC = P;
    runTips(g);
    expect(g.run.recentTips.some((t) => t.source === 'weasel' && t.dir === 1)).toBe(true);
    tickN(g, 8);
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 95000 });
    expect(g.run.positions.DTC.tipSource).toBe('weasel');
    tickN(g, 1, { DTC: P * 0.5 }); // 청산. 현금 남은 것: 100000 − 95000 − 수수료 = 3,620
    expect(g.run.over).toBe(false);
    g.run.debts.shark1.overdue = 1;
    settleOnce(g); // 현금 3,620 < 오소리 이자 5,200(40만 × 1.3%, U-47) -> 연체 한도, 압류할 것 없음
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy).toMatchObject({ cause: 'TIP', lastLender: 'shark1' });
    expect(g.run.lastPos!.tipSource).toBe('weasel');
    expect(g.pendingEnding!.id).toBe('END-181');
    expect(g.pendingEnding!.isNew).toBe(true);
  });

  it('AC-v2-121 꼬리표가 없으면 LIQ', () => {
    const g = bare();
    openFutures(g);
    noDebts(g);
    g.run.debts.shark1.principal = 400000; // 이자 5,200 이 청산 뒤 남은 현금보다 크게(U-47: 오소리 1.3%)
    g.run.cash = 100000;
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 95000 });
    tickN(g, 1, { DTC: P * 0.5 });
    g.run.debts.shark1.overdue = 1;
    settleOnce(g);
    expect(g.run.bankruptcy!.cause).toBe('LIQ');
  });

  it('AC-v2-122 남은 빚 40만 중 승계 빚 25만이면 캐피탈 연체로 파산해도 LEGACY', () => {
    const g = bare();
    g.run.cash = 0;
    g.run.debts.shark1.principal = 150000;
    g.run.debts.capital.principal = 250000;
    g.run.debts.capital.inherited = 250000;
    g.run.debts.capital.overdue = 2;
    settleOnce(g);
    expect(g.run.over).toBe(true);
    expect(g.run.bankruptcy).toMatchObject({ cause: 'LEGACY', lastLender: 'capital' });
    expect(g.pendingEnding!.id).toBeTruthy();
  });

  it('AC-v2-123 최근 정산 3회 안에 압류가 있었고 그로 준 정산 수입이 미납액 이상이면 SEIZE', () => {
    const g = bare();
    bustOnShark(g);
    g.run.stats.lastSeizeSettleNo = g.run.settleNo - 1;
    g.run.stats.garnishBySettle = [0, 7000, 0];
    settleOnce(g);
    expect(g.run.bankruptcy!.cause).toBe('SEIZE');
    const h = bare();
    bustOnShark(h);
    h.run.stats.lastSeizeSettleNo = h.run.settleNo - 1;
    h.run.stats.garnishBySettle = [0, 100, 0];
    settleOnce(h);
    expect(h.run.bankruptcy!.cause).toBe('SHARK');
    const k = bare();
    k.run.cash = 0;
    k.run.house = 1;
    noDebts(k);
    settleOnce(k, 3);
    expect(k.run.bankruptcy!.cause).toBe('UPKEEP');
  });

  it('AC-v2-124 후보 END-158(조건 0), END-155(조건 1, ★1), END-157(조건 1, ★2)이 모두 미수집이면 END-157, 전부 수집이면 같은 순서로 다시', () => {
    const c = ['END-158', 'END-155', 'END-157'].map((i) => endingById[i]);
    expect(chooseEnding(c, new Set())).toMatchObject({ ending: { id: 'END-157' }, via: 'normal' });
    expect(chooseEnding(c, new Set(['END-157']))).toMatchObject({ ending: { id: 'END-155' } });
    expect(chooseEnding(c, new Set(['END-157', 'END-155']))).toMatchObject({ ending: { id: 'END-158' } });
    expect(chooseEnding(c, new Set(c.map((e) => e.id)))).toMatchObject({ ending: { id: 'END-157' }, via: 'repeat' });
    // 조건이 거짓인 엔딩은 후보에 들지 않는다
    const g = bare();
    const snap = snapOf(g, 'LIQ');
    const ids = candidatesFor(snap, 'LIQ').map((e) => e.id);
    expect(ids).toContain('END-158');
    expect(ids).not.toContain('END-155');
    snap.adds = 1;
    expect(candidatesFor(snap, 'LIQ').map((e) => e.id)).toContain('END-155');
  });

  it('AC-v2-125 조건에 쓰인 모든 키와 meta.stats 의 모든 키를 엔진 스냅샷이 만든다', () => {
    const g = bare();
    const snap = snapOf(g, 'LIQ');
    expect(missingKeys(snap)).toEqual([]);
    for (const e of endings) for (const [k] of e.conditions) expect(k in snap, `${e.id} ${k}`).toBe(true);
    expect(Object.keys(endingsMeta.stats).length).toBeGreaterThan(140);
  });

  it('AC-v2-126 설비의 80% 이상(캐는 값 기준)을 멍도토에 붙였고 멍도토 -12%, SEIZE 면 END-131 후보. 비중 60% 면 아니다', () => {
    const mk = (mdt: [string, number][], dtc: [string, number][]) => {
      const g = bare();
      giveWheel(g, 'DTC');
      giveWheel(g, 'MDT');
      for (const [t, c] of mdt) giveEquip(g, t, 'MDT', c);
      for (const [t, c] of dtc) giveEquip(g, t, 'DTC', c);
      g.run.prices.MDT = g.run.refPrice.MDT * 0.88;
      return snapOf(g, 'SEIZE', 'shark1');
    };
    const hi = mk([['row', 150000]], [['wheel2', 20000]]);
    expect(hi.mineConcentration).toBeGreaterThanOrEqual(80);
    expect(hi.econ).toBe('slump');
    expect(candidatesFor(hi, 'SEIZE').map((e) => e.id)).toContain('END-131');
    const lo = mk([['helper', 60000]], [['helper', 60000]]);
    expect(lo.mineConcentration).toBeLessThan(80);
    expect(candidatesFor(lo, 'SEIZE').map((e) => e.id)).not.toContain('END-131');
    const ok = mk([['row', 150000]], [['wheel2', 20000]]);
    ok.econ = 'normal';
    expect(candidatesFor(ok, 'SEIZE').map((e) => e.id)).not.toContain('END-131');
  });

  it('AC-v2-127 지금 파산하면 미수집 엔딩이 선택될 때 등불이 켜지고 번호와 단서가 보인다', () => {
    const g = bare();
    const pv = previewEnding(g);
    expect(pv.lantern).toBe(true);
    expect(pv.ending.id).toMatch(/^END-\d{3}$/);
    expect(pv.ending.clue.length).toBeGreaterThan(5);
    g.family.ledger[pv.ending.id] = { count: 1, holders: [{ gen: 2, name: 'x' }], firstAt: 2, scenes: [] };
    // 같은 조건이면 다른 후보(미수집)가 있으면 그쪽, 없으면 다시 보여 주며 등불은 꺼진다
    const pv2 = previewEnding(g);
    expect(pv2.isNew).toBe(!g.family.ledger[pv2.ending.id]);
    for (const e of endings) if (e.causes.includes(pv.cause) && !g.family.ledger[e.id]) g.family.ledger[e.id] = { count: 1, holders: [], firstAt: 2, scenes: [] };
    expect(previewEnding(g).lantern).toBe(false);
    // 미리보기는 상태를 바꾸지 않는다
    expect(g.run.over).toBe(false);
    expect(g.pendingEnding).toBeNull();
  });

  it('AC-v2-128 파산하면 엔딩 카드에 마지막 3개 사건(시각 포함), 한 끗 차이 최대 2개, 다음 세대에 남는 것이 있다', () => {
    const g = bare();
    openFutures(g);
    noDebts(g);
    g.run.debts.shark1.principal = 400000; // 이자 5,200 이 청산 뒤 남은 현금보다 크게(U-47: 오소리 1.3%)
    g.run.cash = 100000;
    A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, margin: 95000 });
    A(g, { type: 'add', market: 'DTC', margin: 1000 });
    tickN(g, 1, { DTC: P * 0.5 });
    g.run.debts.shark1.overdue = 1;
    settleOnce(g);
    const pe = g.pendingEnding!;
    expect(pe.lastThree).toHaveLength(3);
    expect(pe.lastThree.every((e) => typeof e.at.tick === 'number' && e.text)).toBe(true);
    expect(pe.lastThree[pe.lastThree.length - 1].kind).not.toBe('bankrupt');
    expect(pe.nearMisses.length).toBeLessThanOrEqual(2);
    for (const m of pe.nearMisses) {
      expect(g.family.ledger[m.id]).toBeUndefined();
      expect(m.hint).toBeTruthy();
    }
    expect(pe.nextGen.trace).toBeTruthy();
    expect(pe.nextGen.trait).toBe('한 방 체질');
    expect(pe.collected).toBe(1);
    expect(g.family.lineage).toHaveLength(1);
    expect(g.family.stats.bankruptcies).toBe(1);
  });

  it('AC-v2-128 조건 하나만 달랐던 엔딩이 있으면 "한 끗 차이"에 오른다', () => {
    const g = bare();
    const snap = snapOf(g, 'LIQ');
    snap.sl = 'set'; // END-191: sl=set & viaJump=true — viaJump 만 모자란다
    snap.viaJump = false;
    snap.lev = 10;
    const e = endingById['END-191'];
    expect(e.conditions.filter((c) => !evalCond(c, snap)).map((c) => c[0])).toEqual(['viaJump']);
    // 다른 LIQ 엔딩을 다 모았다고 치고 finalize 로 직접 확인
    for (const x of endings) if (x.causes.includes('LIQ') && x.id !== 'END-191' && x.id !== 'END-158') g.family.ledger[x.id] = { count: 1, holders: [], firstAt: 2, scenes: [] };
    g.run.lastPos = { market: 'DTC', dir: 1, lev: 10, margin0: 1000, marginPct: 10, holdSettles: 1, holdTicks: 10, sl: 'set', tp: 'none', tpRoe: null, adds: 0, viaJump: false, viaFunding: false, fundedBy: null, tipSource: null, tipWasRight: false, tipAgree: 0, revenge: null, entryAtHigh: false, entryAtLow: false, fadedWire: false, newsAfterEntry: null, maxRoe: 0, roeLowMin: 0, fundingPaid: 0, pnl: -1000, ended: 'liq', settleNo: 0, tick: 1 };
    const pe = finalizeEnding(g, { cause: 'LIQ', lastLender: null, shortfall: 0 });
    expect(pe.nearMisses.map((m) => m.id)).toContain('END-191');
    expect(pe.nearMisses.find((m) => m.id === 'END-191')!.missing).toContain('viaJump');
  });

  it('AC-v2-129 END-054 의 대사 {laborTaps} 는 그 세대의 탭 수로 채워진다', () => {
    const e = endingById['END-054'];
    expect(fillLine(e.line, { laborTaps: 1234 })).toContain('1234번');
    expect(fillLine(e.line, { laborTaps: 1234 })).not.toContain('{');
    const g = bare();
    g.run.stats.laborTaps = 321;
    g.run.stats.garnished = 60000;
    g.run.cash = 0;
    g.run.debts.capital.principal = 0;
    g.run.debts.shark1.overdue = 1;
    g.run.stats.lastSeizeSettleNo = g.run.settleNo; // SEIZE/SHARK 둘 다 허용되는 END-054
    g.run.stats.garnishBySettle = [0, 0, 0];
    settleOnce(g);
    expect(g.pendingEnding!.line).not.toContain('{');
    if (g.pendingEnding!.id === 'END-054') expect(g.pendingEnding!.line).toContain('321번');
    expect(g.pendingEnding!.snapshot.laborTaps).toBe(321);
  });

  it('AC-v2-130 미수집 칸은 ???, 원인 아이콘, 행동 문장 단서. ★3 은 조건 하나가 ? 이고 같은 원인의 이웃 엔딩을 하나 모으면 열린다', () => {
    const g = bare();
    const star2 = archiveEntry(g, endingById['END-155']);
    expect(star2).toMatchObject({ collected: false, title: '???', causes: ['LIQ'], clueVisible: true });
    expect(star2.clue).toContain('추가 진입');
    const e3 = endings.find((e) => e.rarity === 3 && e.conditions.length >= 2 && neighborsOf(e).length > 0)!;
    const locked = archiveEntry(g, e3);
    expect(locked.clueVisible).toBe(false);
    expect(locked.conditionsView[e3.hiddenCondIndex!]).toContain('?');
    expect(locked.hiddenIndex).toBe(e3.hiddenCondIndex);
    const nb = neighborsOf(e3)[0];
    g.family.ledger[nb.id] = { count: 1, holders: [{ gen: 2, name: 'x' }], firstAt: 2, scenes: [] };
    const open = archiveEntry(g, e3);
    expect(open.clueVisible).toBe(true);
    expect(open.hiddenIndex).toBeNull();
    expect(open.unlockedByNeighbor).toBe(true);
  });

  it('AC-v2-131 같은 엔딩을 다른 세대가 다시 얻으면 그 쪽에 두 세대가 모두 적힌다', () => {
    const g = bare();
    const a = finalizeEnding(g, { cause: 'FRIEND', lastLender: null, shortfall: 0 });
    expect(a.isNew).toBe(true);
    g.family.generation = 3;
    g.settings.name = '둘째';
    const b = finalizeEnding(g, { cause: 'FRIEND', lastLender: null, shortfall: 0 });
    if (b.id === a.id) {
      expect(b.isNew).toBe(false);
      expect(b.nth).toBe(2);
      expect(g.family.ledger[a.id].holders.map((h) => h.gen)).toEqual([2, 3]);
    } else {
      expect(g.family.ledger[b.id].holders).toHaveLength(1);
    }
    // 같은 조건의 기본 엔딩만 남기면 반드시 겹친다
    // 그 원인의 엔딩을 다 모은 뒤에는 같은 엔딩이 반복해 나온다
    const h = bare();
    for (const e of endings) if (e.causes.includes('UPKEEP')) h.family.ledger[e.id] = { count: 1, holders: [], firstAt: 1, scenes: [] };
    const r1 = finalizeEnding(h, { cause: 'UPKEEP', lastLender: null, shortfall: 0 });
    h.family.generation = 5;
    const r = finalizeEnding(h, { cause: 'UPKEEP', lastLender: null, shortfall: 0 });
    expect(r.id).toBe(r1.id);
    expect(r.via).toBe('repeat');
    expect(r.nth).toBe(3);
    expect(h.family.ledger[r.id].holders.map((x) => x.gen)).toEqual([2, 5]);
  });

  it('원인 순서 4: 같은 정산에 겹치면 위의 원인이 이긴다(FRIEND > LIQ > LEGACY > SEIZE > UPKEEP > BANK/SHARK)', () => {
    const g = bare();
    g.run.debts.capital.inherited = 150000;
    g.run.debts.shark1.inherited = 150000;
    expect(determineCause(g, { lastLender: 'capital', shortfall: 100 })).toBe('LEGACY');
    g.run.stats.liqLossCur = 5000;
    expect(determineCause(g, { lastLender: 'capital', shortfall: 100 })).toBe('LIQ');
    for (const id of ['squirrel', 'raccoon', 'rabbit']) g.run.friends[id].broken = true;
    expect(determineCause(g, { lastLender: 'capital', shortfall: 100 })).toBe('FRIEND');
    void declareBankruptcy;
  });
});

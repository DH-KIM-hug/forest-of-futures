// M7 화면(마을·일터)의 읽기 모델 시험. 픽셀이 아니라 화면이 읽는 값만 본다.
import { describe, expect, it } from 'vitest';
import { A, fresh, giveWheel, giveEquip, setRatio, settleOnce, tapN } from '../engine/helpers';
import { ART_FALLBACK, ART_IDS, HOUSE_ART, NPC_ART, WHEEL_ART } from '../../src/ui/assets';
import { buildingBadge, heroPose, hudModel, lenderModel, standingCreditors, stageModel, visitModel, workModel, short, friendViews, houseRows } from '../../src/ui/vm/village';
import { abbrev } from '../../src/engine/util';

describe('자산 목록(한 곳)', () => {
  it('모든 그림 id 에 대체 이름·색이 있고 경로가 public/art/v2 아래다', () => {
    expect(ART_IDS.length).toBe(34);
    for (const id of ART_IDS) expect(ART_FALLBACK[id].color).toMatch(/^#/);
    expect(HOUSE_ART.length).toBe(5);
    expect(Object.values(WHEEL_ART).length).toBe(4);
    for (const id of ['bank', 'capital', 'shark1', 'shark2', 'squirrel', 'raccoon', 'rabbit', 'fox', 'bear']) expect(NPC_ART[id]).toBeTruthy();
  });
});

describe('AC-v2-146 종목 쳇바퀴 나란히 · 역마진 딱지', () => {
  it('쳇바퀴 3대는 색·간판이 다르게 나오고 역마진인 것에만 딱지가 있다', () => {
    const g = fresh();
    g.run.cash = 10_000_000;
    g.run.house = 1;
    for (const c of ['DTC', 'BTH', 'MDT'] as const) giveWheel(g, c);
    A(g, { type: 'buyEquip', tier: 'helper', coin: 'BTH' });
    A(g, { type: 'buyEquip', tier: 'helper', coin: 'MDT' });
    setRatio(g, 'BTH', 0.05); // 밤더리움 폭락 -> 역마진
    const m = stageModel(g);
    expect(m.stage).toBe(1);
    expect(m.wheels.map((w) => w.coin)).toEqual(['DTC', 'BTH', 'MDT']);
    expect(new Set(m.wheels.map((w) => w.color)).size).toBe(3);
    expect(new Set(m.wheels.map((w) => w.sign)).size).toBe(3);
    expect(m.wheels.map((w) => w.reverse)).toEqual([false, true, false]);
  });
  it('설비가 없는 쳇바퀴에는 역마진 딱지가 없다', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    setRatio(g, 'DTC', 0.1);
    expect(stageModel(g).wheels[0].reverse).toBe(false);
  });
  it('단계 0 은 줍기 무대, 200회를 채우면 쳇바퀴 팻말과 구매 버블', () => {
    const g = fresh();
    expect(stageModel(g).stage).toBe(0);
    expect(stageModel(g).offer).toBeNull();
    tapN(g, 200);
    const m = stageModel(g);
    expect(m.signUp).toBe(true);
    expect(m.offer?.cost).toBe(10_000);
  });
});

describe('AC-v2-147 채권자의 방문', () => {
  it('제안이 생기면 그 인물이 말풍선과 [받는다] [거절]로 온다', () => {
    const g = fresh();
    g.run.debts.shark1.principal = 200_000;
    g.run.offers = [{ id: 'waive', from: 0, by: 'shark1' }];
    const v = visitModel(g)!;
    expect(v.by).toBe('shark1');
    expect(v.npcArt).toBe('shark1');
    expect(NPC_ART[v.by]).toBe('npc_badger');
    expect(v.text).toContain('이자는 안 받는다');
    expect(v.accept).toBeTruthy();
    expect(v.decline).toBe('거절');
    expect(A(g, { type: 'declineOffer', id: 'waive' }).ok).toBe(true);
    expect(visitModel(g)).toBeNull();
  });
  it('연체 직전의 오소리·독사는 일터 앞에 서 있다', () => {
    const g = fresh();
    g.run.debts.shark1.principal = 100_000;
    g.run.debts.shark1.overdue = 1;
    expect(standingCreditors(g)).toEqual(['shark1']);
    g.run.debts.shark1.overdue = 0;
    expect(standingCreditors(g)).toEqual([]);
  });
});

describe('AC-v2-53 업그레이드 초록 점과 줄여 쓴 숫자', () => {
  it('살 수 있는 줄에 점, 일터 팻말에도 점', () => {
    const g = fresh();
    g.run.cash = 100;
    expect(workModel(g).affordableDot).toBe(false);
    g.run.cash = 2000;
    const w = workModel(g);
    expect(w.affordableDot).toBe(true);
    expect(w.upgrades.find((u) => u.track === 'glove')!.afford).toBe(false);
    expect(w.upgrades.find((u) => u.track === 'shoes')!.afford).toBe(true);
  });
  it('줄여 쓰기: 12,345 -> 1.2만 · 9,500 -> 9,500 · 150,000,000 -> 1.5억', () => {
    expect(short(12345)).toBe('1.2만');
    expect(short(9500)).toBe('9,500');
    expect(short(150_000_000)).toBe('1.5억');
    expect(short).toBe(abbrev);
  });
  it('업그레이드 효과 문구는 현재 -> 다음', () => {
    const g = fresh();
    const r = workModel(g).upgrades.find((u) => u.track === 'glove')!;
    expect(r.effect).toBe('+0% → +4%');
    expect(r.level).toBe(0);
  });
});

describe('HUD', () => {
  it('지갑 알약은 1단계부터, 빚 알약은 물려받은 빚·가압류를 띠로', () => {
    const g = fresh();
    expect(hudModel(g).wallet.show).toBe(false);
    giveWheel(g, 'DTC');
    expect(hudModel(g).wallet.show).toBe(true);
    expect(hudModel(g).debt.garnish).toBeNull();
    g.run.coinWheels.DTC.tagBy = 'bank';
    expect(hudModel(g).debt.garnish?.pct).toBe(30);
  });
  it('지갑 등락은 세대 시작가 대비 평가액 가중', () => {
    const g = fresh();
    giveWheel(g, 'DTC');
    g.run.wallet.DTC.qty = 0.1;
    setRatio(g, 'DTC', 0.969);
    expect(hudModel(g).wallet.pct).toBeCloseTo(-3.1, 1);
  });
  it('정산 알약: 10초 남으면 강조', () => {
    const g = fresh();
    g.run.settleIn = 10;
    expect(hudModel(g).settle.warn).toBe(true);
    g.run.settleIn = 11;
    expect(hudModel(g).settle.warn).toBe(false);
  });
});

describe('주인공 자세 우선순위', () => {
  const base = { over: false, overdueNear: false, nearLiq: false, tapping: false, stage: 0 as 0 | 1 | 2, flashJoy: false, greedy: false };
  it('파산 > 위험 > 기쁨 > 일 > 평소', () => {
    expect(heroPose({ ...base, over: true, tapping: true })).toBe('dazed');
    expect(heroPose({ ...base, overdueNear: true, flashJoy: true })).toBe('sweat');
    expect(heroPose({ ...base, flashJoy: true, tapping: true })).toBe('joy');
    expect(heroPose({ ...base, tapping: true })).toBe('pick');
    expect(heroPose({ ...base, tapping: true, stage: 1 })).toBe('run');
    expect(heroPose(base)).toBe('idle');
  });
});

describe('창구·건물 표시', () => {
  it('연체 딱지는 건물 이름표·창구 모델이 같은 값', () => {
    const g = fresh();
    g.run.debts.shark1.principal = 150_000;
    g.run.debts.shark1.overdue = 1;
    expect(buildingBadge(g, 'shark1')).toEqual({ debt: '15만', od: '연체 1/2' });
    expect(lenderModel(g, 'shark1').overdue).toBe(1);
  });
  it('밤에는 조합이 닫힌다(말과 행동 모두)', () => {
    const g = fresh();
    settleOnce(g, 3);
    expect(lenderModel(g, 'bank').closed).toBe(true);
    expect(lenderModel(g, 'capital').closed).toBe(false);
  });
  it('독사 골목은 열리기 전엔 잠김', () => {
    const g = fresh();
    expect(lenderModel(g, 'shark2').locked).toBe(true);
    g.run.shark2Open = true;
    expect(lenderModel(g, 'shark2').locked).toBe(false);
  });
  it('친구 5명, 집 5단계(막힌 이유 표시)', () => {
    const g = fresh();
    expect(friendViews(g)).toHaveLength(5);
    const rows = houseRows(g);
    expect(rows).toHaveLength(5);
    expect(rows[0].current).toBe(true);
    expect(rows[4].reason).toBeTruthy();
  });
  it('설비 사다리: 대수 n/3 과 종목 고르기', () => {
    const g = fresh();
    g.run.cash = 1_000_000;
    giveWheel(g, 'DTC');
    giveEquip(g, 'wheel2', 'DTC', 20000);
    const t = workModel(g).tiers[0];
    expect(t.units).toBe(1);
    expect(t.max).toBe(3);
    expect(t.targets.map((x) => x.coin)).toEqual(['DTC']);
  });
});

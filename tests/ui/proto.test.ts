// 시제품(?proto=1) 읽기 모델과, 시제품이 부르는 행동만으로 한 바퀴(쳇바퀴 → 추심원 → 대출·폰 → 알바 → 튜토리얼 청산 → 두 번째 대출 → 파산 → 환생)가 도는지 시험.
import { describe, expect, it } from 'vitest';
import { A, fresh, settleOnce, tapN, tickN } from '../engine/helpers';
import { claim, currentGoal, goalAt, hamsterMath, homeSummary, lifeNo, maxWheels, officeOffer, perSec, perSettle, tiles, TUT, tutorialPrice } from '../../src/ui/proto/model';
import { HOME_IMG, PANEL_KEY, SLOT_COUNT, TAP_AREA, TILE_GRID, WHEEL_SLOTS, HERO_SPOT, VISITOR_SPOT, afterDrag, assignSlots, homeCam, loadPanel, savePanel } from '../../src/ui/proto/home';
import { useProto } from '../../src/ui/proto/protoStore';
import { balance } from '../../src/engine/data';
import { processPrice } from '../../src/engine/futures';
import { interestDue, nextBorrowRate } from '../../src/engine/selectors';

const F0 = { everOpened: false, waiting: false, loanTaken: false };

describe('시제품 읽기 모델 (U-29·U-30)', () => {
  it('처음: 칸 여섯 = 엄마의 쳇바퀴 + 빈 자리 다섯. 폰이 없어 알바를 못 부르고(흐린 칸 + 까닭), 돈이 없어 [놓기]는 꺼져 있다', () => {
    const g = fresh();
    const t = tiles(g);
    expect(t.map((x) => x.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(t.map((x) => x.state)).toEqual(['idle', 'empty', 'empty', 'empty', 'empty', 'empty']);
    expect(t[0]).toMatchObject({ action: null, locked: true, canAct: false });
    expect(t[0].text).toBe('수금폰 필요');
    expect(t[1]).toMatchObject({ action: 'place', btn: '놓기', btnSub: '50,000', canAct: false, locked: false });
    expect(maxWheels()).toBe(SLOT_COUNT);
    expect(claim(g)).toEqual({ interest: 1500, living: 330, total: 1830 }); // U-47: 정산 60초, 정산당 1/3
    expect(perSettle(g)).toBe(-1830);
    expect(homeSummary(g)).toMatchObject({ idle: 0, hamsters: 0, claim: 1830 });
    expect(A(g, { type: 'hire', coin: 'DTC' }).code).toBe('nophone');
  });
  it('목표 사슬: 이자 벌기 → 사무소에서 빌리기 → 알바 부르기 → 첫 포지션 → 첫 상환', () => {
    const g = fresh();
    expect(currentGoal(g, 0, F0)).toBe(0);
    expect(goalAt(g, 0, F0)).toMatchObject({ need: 1830, cur: 0, done: false });
    expect(currentGoal(g, 0, { ...F0, waiting: true })).toBe(1); // 추심원이 기다리면 다음 목표는 사무소
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    expect(currentGoal(g, 0, F0)).toBe(2);
    A(g, { type: 'hire', coin: 'DTC' });
    expect(currentGoal(g, 0, F0)).toBe(3);
    expect(currentGoal(g, 0, { ...F0, everOpened: true })).toBe(4);
  });
  it('빌린 뒤: 알바를 부르면 줄에 초당 수입이 뜨고, 쳇바퀴를 놓으면 줄이 는다. 값과 일당은 대수와 무관', () => {
    const g = fresh();
    expect(officeOffer(g)).toMatchObject({ lend: 100000, ratePct: 1.3 });
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    expect(interestDue(g, 'shark1')).toBe(2800);
    const hm = hamsterMath(g);
    expect(hm).toEqual({ sold: 2159, wage: 530, net: 1629 });
    expect(tiles(g)[0]).toMatchObject({ state: 'idle', action: 'hire', btn: '알바 부르기', btnSub: '정산 때 일당 530', canAct: true, locked: false });
    expect(A(g, { type: 'hire', coin: 'DTC' }).ok).toBe(true);
    expect(tiles(g)[0]).toMatchObject({ state: 'run', net: 1629, action: null });
    // U-46: 칸은 1초에 캐서 판 돈(쳇바퀴 위에 떠서 채굴기로 가는 숫자와 같다). 일당은 정산 때 나간다고 작은 줄에
    expect(tiles(g)[0].text).toBe(`초당 +${(2159 / balance.settlement.intervalSec).toFixed(1)}`);
    expect(tiles(g)[0].sub).toBe('일당 530은 정산 때');
    expect(tiles(g)[1]).toMatchObject({ state: 'empty', action: 'place', canAct: true });
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(true);
    const uid = g.run.equipment[0].uid;
    let t = tiles(g);
    expect(t.map((x) => x.state)).toEqual(['run', 'idle', 'empty', 'empty', 'empty', 'empty']); // 고른 자리가 없으면 번호순
    expect(t[1]).toMatchObject({ uid, action: 'hire', canAct: true, net: null });
    // 칸을 눌러 놓은 자리(uid → 자리)를 따른다
    t = tiles(g, { [uid]: 3 });
    expect(t.map((x) => x.state)).toEqual(['run', 'empty', 'empty', 'idle', 'empty', 'empty']);
    expect(t[3].uid).toBe(uid);
    expect(A(g, { type: 'hire', uid }).ok).toBe(true);
    t = tiles(g, { [uid]: 3 });
    expect(t[3]).toMatchObject({ state: 'run', action: null });
    expect(t[1].btnSub).toBe('50,000'); // 두 번째도 같은 값
    expect(homeSummary(g)).toMatchObject({ idle: 3258, hamsters: 2, claim: 3130, mined: 4318, wages: 1060, due: 4190 }); // U-46: 들어오는 돈(캐서 판 값) / 정산 때 나가는 돈 전부
    // 초당 환산은 이 생의 지금 정산 간격을 쓴다(U-47: 보통 60초, 튜토리얼 동안 20초)
    expect(perSec(3258, g.run)).toBeCloseTo(3258 / 60, 9);
    expect(perSec(3258, { ...g.run, intro: true })).toBeCloseTo(3258 / 20, 9);
  });
  it('쳇바퀴가 실려 가면 그 칸이 [다시 사기]가 되고, 빈 자리는 엄마 쳇바퀴부터라고 잠긴다', () => {
    const g = fresh();
    g.run.coinWheels = {};
    g.run.riding = null;
    const t = tiles(g);
    expect(t[0]).toMatchObject({ state: 'lost', action: 'rebuy', btn: '다시 사기', btnSub: '10,000', canAct: false });
    expect(t.slice(1).every((x) => x.state === 'empty' && x.locked && x.action === null && x.text === '엄마 쳇바퀴부터')).toBe(true);
    expect(A(g, { type: 'tap' }).code).toBe('nowheel');
  });
  it('꽉 찬 집: 여섯 칸이 전부 돈다. 딱지가 붙으면 칸에 딱지', () => {
    const g = fresh();
    g.run.cash = 500000;
    A(g, { type: 'borrow', lender: 'shark1' });
    A(g, { type: 'openAccount', sponsor: true });
    A(g, { type: 'hire', coin: 'DTC' });
    for (let i = 0; i < 5; i++) { expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(true); A(g, { type: 'hire', uid: g.run.equipment[i].uid }); }
    g.run.equipment[2].tagBy = 'shark1';
    const t = tiles(g);
    expect(t.every((x) => x.state === 'run' && x.action === null)).toBe(true);
    expect(t.map((x) => x.tagged)).toEqual([false, false, false, true, false, false]);
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(false);
  });
});

describe('집 화면 배치 (U-34): 바닥 자리 · 칸 순서 · 구도 · 접힘 기억', () => {
  it('자리 여섯은 그림 바닥 안에 있고 서로·주인공·손님 자리와 겹치지 않는다. 칸 2×3 은 자리 여섯을 한 번씩 담는다', () => {
    expect(WHEEL_SLOTS.length).toBe(6);
    expect([...TILE_GRID].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(TILE_GRID[1]).toBe(0); // 엄마의 쳇바퀴 = 뒷줄 가운데
    for (const [x, y] of WHEEL_SLOTS) { expect(x).toBeGreaterThan(120); expect(x).toBeLessThan(HOME_IMG.w - 120); expect(y).toBeGreaterThan(800); expect(y).toBeLessThan(1260); }
    const pts = [...WHEEL_SLOTS, HERO_SPOT, VISITOR_SPOT];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i][0] - pts[j][0], (pts[i][1] - pts[j][1]) * 2), `${i}-${j}`).toBeGreaterThan(110);
    // 앞줄 칸의 자리는 뒷줄 칸의 자리보다 앞(아래)에, 같은 줄에서는 왼쪽 칸이 왼쪽 자리
    const [b0, b1, b2, f0, f1, f2] = TILE_GRID.map((s) => WHEEL_SLOTS[s]);
    expect(b0[0]).toBeLessThan(b1[0]); expect(b1[0]).toBeLessThan(b2[0]);
    expect(f0[0]).toBeLessThan(f1[0]); expect(f1[0]).toBeLessThan(f2[0]);
    expect(Math.max(b0[1], b1[1], b2[1])).toBeLessThan(Math.min(f0[1], f1[1], f2[1]));
    // 굴리기 탭이 먹는 네모는 엄마의 쳇바퀴와 주인공을 품는다
    const [tx, ty, tw, th] = TAP_AREA;
    for (const [x, y] of [WHEEL_SLOTS[0], HERO_SPOT]) { expect(x).toBeGreaterThan(tx); expect(x).toBeLessThan(tx + tw); expect(y).toBeGreaterThan(ty); expect(y).toBeLessThan(ty + th); }
  });
  it('자리 앉히기: 고른 자리를 따르고, 없거나 겹치면 빈 자리 번호순. 0번은 엄마의 쳇바퀴 몫', () => {
    expect(assignSlots([])).toEqual([null, null, null, null, null, null]);
    expect(assignSlots(['a', 'b'])).toEqual([null, 'a', 'b', null, null, null]);
    expect(assignSlots(['a', 'b'], { a: 4 })).toEqual([null, 'b', null, null, 'a', null]);
    expect(assignSlots(['a', 'b'], { a: 4, b: 4 })).toEqual([null, 'b', null, null, 'a', null]);
    expect(assignSlots(['a'], { a: 0 })).toEqual([null, 'a', null, null, null, null]);
    expect(assignSlots(['a', 'b', 'c', 'd', 'e', 'f']).filter(Boolean).length).toBe(5);
  });
  it('구도: 그림을 화면 너비에 맞춘다. 접히면 그림 위에 붙고(HUD 아래로 30%부터 보인다), 펴지면 바닥이 HUD 와 판 사이에 오게 올라간다', () => {
    const closed = homeCam({ w: 390, h: 730, hud: 180, cover: 44 });
    expect(closed.imgH).toBeCloseTo(390 * 1586 / 992, 5);
    expect(closed.top).toBe(0);
    expect(180 / closed.imgH).toBeGreaterThan(0.27); expect(180 / closed.imgH).toBeLessThan(0.33);
    const open = homeCam({ w: 390, h: 730, hud: 180, cover: 270 });
    expect(open.top).toBeLessThan(0);
    // 펴졌을 때 자리 여섯의 발밑은 전부 판 위에 보인다
    for (const [, y] of WHEEL_SLOTS) { const sy = (y * 390) / 992 + open.top; expect(sy).toBeLessThan(730 - 270); expect(sy).toBeGreaterThan(180); }
    // 작은 화면: 그림 아래를 넘겨 올리지 않는다
    const small = homeCam({ w: 360, h: 526, hud: 180, cover: 230 });
    expect(small.top).toBeGreaterThanOrEqual(526 - 230 - small.imgH);
    expect(small.top).toBeLessThan(0);
  });
  it('접힘 기억: 적힌 것이 없으면 접힌 채, 펴면 open 으로 적히고 다음에 그대로 읽힌다. 저장소가 막혀도 죽지 않는다', () => {
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    expect(loadPanel(st)).toBe(false);
    savePanel(true, st);
    expect(mem.get(PANEL_KEY)).toBe('open');
    expect(loadPanel(st)).toBe(true);
    savePanel(false, st);
    expect(loadPanel(st)).toBe(false);
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadPanel(broken)).toBe(false);
    expect(() => savePanel(true, broken)).not.toThrow();
    expect(loadPanel(null)).toBe(false);
    // 화면 상태: setPanel 이 저장소에 적는다(다음 생으로 넘어가도 그대로)
    (globalThis as { localStorage?: unknown }).localStorage = st;
    try {
      useProto.getState().setPanel(true);
      expect(useProto.getState().panelOpen).toBe(true);
      expect(mem.get(PANEL_KEY)).toBe('open');
      useProto.getState().resetLife(3, false);
      expect(useProto.getState().panelOpen).toBe(true);
      useProto.getState().setPanel(false);
      expect(mem.get(PANEL_KEY)).toBe('closed');
    } finally { delete (globalThis as { localStorage?: unknown }).localStorage; }
  });
  it('머리 줄 끌기: 위로 끌면 펴지고 아래로 끌면 접힌다. 조금 움직인 것은 탭(뒤집기)', () => {
    expect(afterDrag(-40, false)).toBe(true);
    expect(afterDrag(-40, true)).toBe(true);
    expect(afterDrag(40, true)).toBe(false);
    expect(afterDrag(40, false)).toBe(false);
    expect(afterDrag(3, false)).toBe(true);
    expect(afterDrag(-3, true)).toBe(false);
  });
});

describe('튜토리얼 거래 (U-31): 짜 둔 시세는 고른 쪽의 반대로만 간다', () => {
  for (const dir of [1, -1] as const) {
    it(`${dir === 1 ? '롱' : '숏'}을 골라도 ${TUT.maxSteps}걸음 안에 엔진이 청산한다`, () => {
      const g = fresh();
      A(g, { type: 'borrow', lender: 'shark1' });
      A(g, { type: 'openAccount', sponsor: true });
      const cash0 = g.run.cash;
      expect(A(g, { type: 'open', market: TUT.market, dir, lev: TUT.lev, margin: TUT.margin, sl: null, tp: null }).ok).toBe(true);
      const real = g.run.prices[TUT.market];
      let k = 0;
      while (g.run.positions[TUT.market] && k < TUT.maxSteps) {
        k += 1;
        const px = tutorialPrice(real, dir, k);
        expect(dir === 1 ? px < real : px > real).toBe(true);
        g.run.prices[TUT.market] = px;
        processPrice(g, TUT.market, px);
      }
      expect(g.run.positions[TUT.market]).toBeUndefined();
      expect(g.run.lastClose?.liq).toBe(true);
      expect(k).toBeLessThanOrEqual(TUT.maxSteps);
      expect(g.run.over).toBe(false); // 쳇바퀴가 있으니 그 자리에서 파산하지 않는다
      expect(cash0 - g.run.cash).toBeGreaterThanOrEqual(TUT.margin); // 넣은 돈(과 수수료)만 잃는다
      expect(cash0 - g.run.cash).toBeLessThan(TUT.margin + 500);
      console.log(`튜토리얼 ${dir === 1 ? '롱' : '숏'}: ${k}걸음(${(k * TUT.stepMs) / 1000}초)에 청산, 잃은 돈 ${Math.round(cash0 - g.run.cash)}`);
      // 두 번째 대출은 더 높은 금리
      expect(nextBorrowRate(g, 'shark1')).toBe(0.02);
      A(g, { type: 'borrow', lender: 'shark1' });
      expect(g.run.debts.shark1.principal).toBe(500000);
      expect(interestDue(g, 'shark1')).toBe(4800);
    });
  }
});

describe('시제품 한 바퀴', () => {
  it('쳇바퀴 -> 못 낸 이자 -> 대출·폰 -> 알바 -> 포지션 -> 청산 -> 파산 -> 환생', () => {
    const g = fresh(7);
    expect(lifeNo(g)).toBe(1);
    tapN(g, 60);
    expect(g.run.cash).toBeLessThan(claim(g).total);
    expect(A(g, { type: 'borrow', lender: 'shark1' }).ok).toBe(true);
    expect(A(g, { type: 'openAccount', sponsor: true }).ok).toBe(true);
    settleOnce(g);
    expect(g.run.debts.shark1.overdue).toBe(0);
    expect(A(g, { type: 'hire', coin: 'DTC' }).ok).toBe(true);
    expect(A(g, { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' }).ok).toBe(true);
    const r = A(g, { type: 'open', market: 'DTC', dir: 1, lev: 10, marginPct: 100, sl: null, tp: null });
    expect(r.ok).toBe(true);
    g.run.prices.DTC = g.run.refPrice.DTC * 0.8; // 급락 -> 10배 롱 청산
    tickN(g, 1, { DTC: g.run.prices.DTC });
    expect(Object.keys(g.run.positions)).toHaveLength(0);
    let n = 0;
    while (!g.run.over && n < 40) { settleOnce(g); n++; }
    expect(g.run.over).toBe(true);
    console.log('청산 뒤 파산까지 정산 횟수', n);
    expect(g.estate?.step).toBe('card');
    expect(A(g, { type: 'estateNext' }).ok).toBe(true);
    expect(A(g, { type: 'inherit', branch: 'renounce' }).ok).toBe(true);
    expect(g.estate?.step).toBe('tree');
    expect(A(g, { type: 'nextGeneration' }).ok).toBe(true);
    expect(g.run.over).toBe(false);
  });
});

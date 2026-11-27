// U-43(회차 5b) 화면 쪽: 구르는 쳇바퀴의 빠르기 · 구르는 돈 숫자 · 살아 있는 인물의 박자 · 바닥을 따라 깔린 전선 · 알바가 다 돌릴 때의 속마음 · 중고폰이 울리는 줄 · 프롤로그의 채굴기 줄 · 튜토리얼의 쳇바퀴 → 전선 → 채굴기 → 지갑.
import { describe, expect, it } from 'vitest';
import { heroSpinRate, floorCorner } from '../../src/ui/proto/World';
import { rollNext, rollSteps, ROLL_STEP_MS } from '../../src/ui/proto/Money';
import { aliveVars, nextBlinkIn, isSyllable, BLINK_MS } from '../../src/ui/proto/alive';
import { STAFFED_THINK, FORCE_NUDGE } from '../../src/ui/proto/roll';
import { STORY, prologueTalk } from '../../src/ui/proto/text';
import { TIPS, HL } from '../../src/ui/proto/guide';
import { blinkOf } from '../../src/ui/proto/sprites';

describe('U-43 주인공이 굴리는 쳇바퀴: 누르는 동안 돌고 0.6초에 걸쳐 멈춘다', () => {
  it('안 누르면 0, 누르면 돈다, 빨리 누를수록 빠르다', () => {
    expect(heroSpinRate([], 1000)).toBe(0);
    const one = heroSpinRate([1000], 1050);
    const many = heroSpinRate([200, 350, 500, 650, 800, 950, 1000], 1050);
    expect(one).toBeGreaterThan(0.5);
    expect(many).toBeGreaterThan(one);
    expect(many).toBeLessThanOrEqual(2.8);
  });
  it('마지막으로 누른 뒤 0.15초까지는 그대로, 0.75초면 멈춘다(사이는 줄어든다)', () => {
    const t = [1000];
    const r0 = heroSpinRate(t, 1100), r1 = heroSpinRate(t, 1400), r2 = heroSpinRate(t, 1760);
    expect(r1).toBeLessThan(r0);
    expect(r1).toBeGreaterThan(0);
    expect(r2).toBe(0);
  });
});

describe('U-43 도토리 숫자가 0.1초 걸음으로 굴러간다(엔진에 없는 숫자는 없다: 지금 값 → 엔진 값)', () => {
  it('걸음은 0.1초, 알바의 1초어치는 열 걸음, 큰돈은 더 길게', () => {
    expect(ROLL_STEP_MS).toBe(100);
    expect(rollSteps(26, 26)).toBe(10);
    expect(rollSteps(3_000, 26)).toBe(14);
    expect(rollSteps(20_000, 26)).toBe(18);
    expect(rollSteps(-100_000, 26)).toBe(22);
  });
  it('열 걸음이면 끝 값에 정확히 닿고, 목표를 지나치지 않는다(오를 때도 내릴 때도)', () => {
    for (const [a, b] of [[1000, 1026], [5000, 4100], [0, 7], [10, 100_010]]) {
      let cur = a, left = rollSteps(b - a, 26);
      const seen: number[] = [];
      while (cur !== b && seen.length < 40) { cur = rollNext(cur, b, left); left = Math.max(1, left - 1); seen.push(cur); }
      expect(cur).toBe(b);
      expect(seen.length).toBeLessThanOrEqual(rollSteps(b - a, 26));
      expect(seen.every((v) => (b > a ? v <= b && v > a : v >= b && v < a))).toBe(true);
    }
  });
});

describe('U-43 살아 있는 인물', () => {
  it('숨은 2.2~3.2초, 인물마다 다르고 같은 이름이면 같다', () => {
    const names = ['hero', 'collector', 'boss', 'weasel', 'owl', 'raccoon', 'viper'];
    const vs = names.map(aliveVars);
    expect(vs.every((v) => v.dur >= 1.3 && v.dur <= 1.8)).toBe(true); // U-46: 머리가 보이게 내려앉는 숨
    expect(new Set(vs.map((v) => v.dur + ':' + v.delay)).size).toBe(names.length);
    expect(aliveVars('hero')).toEqual(aliveVars('hero'));
  });
  it('깜빡임은 2.5~6초마다, 0.12초 감는다', () => {
    expect(nextBlinkIn(0)).toBe(2500);
    expect(nextBlinkIn(1)).toBe(6000);
    expect(BLINK_MS).toBe(120);
  });
  it('눈 감은 그림이 있는 인물: 주인공(폰 · 빈손) · 추심원 · 족제비 · 너구리 · 부엉이', () => {
    for (const id of ['hero', 'heroEmpty', 'cCollector', 'cWeasel', 'cRaccoon', 'cOwl'] as const) expect(blinkOf(id), id).toBeTruthy();
  });
  it('말할 때 들썩이는 글자는 소리 내는 글자뿐(띄어쓰기 · 부호는 아니다)', () => {
    expect(['가', '힣', '3', 'A'].every(isSyllable)).toBe(true);
    expect([' ', '.', '…', ','].some(isSyllable)).toBe(false);
  });
});

describe('U-43 전선은 아이소 바닥을 따라 한 번 꺾인다', () => {
  it('꺾이는 곳에서 끝까지는 다른 바닥 축(왼아래 30°) 위에 있다', () => {
    const a: [number, number] = [100, 400], b: [number, number] = [220, 300];
    const c = floorCorner(a, b);
    // a → c 는 오른아래 축(기울기 tan30°)
    expect((c[1] - a[1]) / (c[0] - a[0])).toBeCloseTo(Math.tan(Math.PI / 6), 6);
    // c → b 는 왼아래 축(기울기 −tan30°)
    expect((b[1] - c[1]) / (b[0] - c[0])).toBeCloseTo(-Math.tan(Math.PI / 6), 6);
  });
});

describe('U-43 글', () => {
  it('알바가 쳇바퀴를 다 돌릴 때 주인공의 속마음 · 중고폰이 울린 뒤의 한 줄', () => {
    expect(STAFFED_THINK).toBe('아, 내릴 필요 없어. 내가 비켜 줄게.'); // 개정 대본 장면 12
    expect(FORCE_NUDGE).toMatch(/앱/); expect(FORCE_NUDGE).not.toMatch(/거래소(로|에서|에 가)/);
  });
  it('중고폰이 울린다: 오소리 대부가 폰의 FRX 앱을 켜 보라고 한다(거래소는 앱이다, 사용자: "거래소는 MTS라 거래소로 가는 건 아냐.")', () => {
    const l = STORY.phoneRing({ paid: 9500, repaid: 0, income: 12924, wages: 3200, claim: 9500, net: 224, left: 400000 });
    expect(l.some((x) => x.text.includes('폰이 울린다'))).toBe(true); // 개정 대본 장면 13: 영수증과 그 밑의 도토코인 값
    expect(l.some((x) => x.text === '바퀴 예상 수입 12,924 − 일당 3,200 − 이자와 생활비 9,500 = 224')).toBe(true);
    expect(l.every((x) => !/거래소(로|에서|에 가)/.test(x.text))).toBe(true);
  });
  it('튜토리얼 거래는 전재산: "처음이니까 크게 가 보세요."', () => {
    const l = STORY.tutIntro(41_642, 10, { tap: 2, claim: 5500, living: 1000, wage: 1600, wheel: 50000, lend: 100000, rate: 4, debt: 400000, lev: 10 });
    expect(l.some((x) => x.text === '손에 있던 돈이 다 들어가요.')).toBe(true); // 개정 대본 장면 14
    expect(l.some((x) => /41,642가 전부/.test(x.text))).toBe(true);
  });
  it('프롤로그의 추심원: 채굴기도 어머님 것(사용자의 줄 그대로)', () => {
    const t = prologueTalk({ debt: 300000, interest: 4500 });
    expect(t.some((l) => l.text === '돌아가요. 어머님도 저거 밟아서 이자 주셨어요.')).toBe(true); // 개정 대본 장면 3
    expect(t.some((l) => l.who === 'hero' && /내 이름 써요/.test(l.text))).toBe(true);
  });
  it('집의 설명은 쳇바퀴 → 전선 → 채굴기 → 지갑 순서로 그 자리를 비춘다', () => {
    const ids = Object.keys(TIPS);
    const order = ['home.tap', 'home.acorn', 'home.claim'];
    expect(order.map((k) => ids.indexOf(k))).toEqual([...order.map((k) => ids.indexOf(k))].sort((x, y) => x - y));
    expect(order.map((k) => (TIPS as Record<string, { hl?: string }>)[k].hl)).toEqual(['rig', 'acorn', 'goal']); // 개정 대본 장면 5: 채굴기 → 도토리 → 정산 목표
    expect(['rig', 'acorn', 'goal'].every((k) => k in HL)).toBe(true);
  });
  it('알바의 돈은 1초마다 들어온다고 말한다(정산은 걷어 가기만)', () => {
    expect((TIPS as Record<string, { text: (o: unknown) => string }>)['hud.ps'].text({})).toMatch(/초당은 알바가 버는 돈/);
  });
});

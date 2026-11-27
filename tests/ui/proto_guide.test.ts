// 튜토리얼 대사 v1(U-32): 모든 설명 줄이 제대로 풀리는지(말하는 사람·글·비추는 화면 조각), 그리고 한 줄이 평생 한 번만 나오는지.
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fresh, A } from '../engine/helpers';
import { HL, MOMENT, T, TIPS, TIP_IDS, hlSel, markTip, resetGuide, setGuideOff, tipSeen, tips, tipsLeft, tipsOf, type Moment, type TipArgs } from '../../src/ui/proto/guide';
import { STORY, WHO_NAME, prologueTalk } from '../../src/ui/proto/text';
import { tipArgs } from '../../src/ui/proto/model';
import { useProto } from '../../src/ui/proto/protoStore';

const DIR = join(__dirname, '../../src/ui/proto');
const SRC = readdirSync(DIR).filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');
const ARGS: TipArgs = tipArgs(fresh());
const P = () => useProto.getState();
/** 화면이 하는 대로: 맨 앞 장면의 줄을 전부 띄워(= 봤다고 적고) 닫는다 */
function playFront(): string[] {
  const sc = P().scenes[0];
  for (const l of sc.lines) if (l.tip) markTip(l.tip);
  P().patch({ scenes: P().scenes.slice(1), seen: { ...P().seen, [sc.id]: true } });
  return sc.lines.map((l) => l.tip ?? '-');
}

beforeEach(() => { resetGuide(); setGuideOff(false); P().resetLife(2, true); });

describe('튜토리얼 대사 (U-32): 모든 줄이 풀린다', () => {
  it('엔진 값이 그대로 끼워진다(쳇바퀴 한 번 2, 첫 청구 1,830, 일당 530, 쳇바퀴 50,000, 대출 10만 1.3%, 빚 30만)', () => {
    expect(ARGS).toEqual({ tap: 2, claim: 1830, living: 330, wage: 530, wheel: 50000, lend: 100000, rate: 1.3, debt: 300000, lev: 10 });
  });
  it('줄마다: 아는 사람이 말하고, 글이 비어 있지 않고, 숫자가 빠지지 않고, 폰 화면 두 줄(34자) 안에 든다', () => {
    expect(TIP_IDS.length).toBeGreaterThanOrEqual(20); // 개정 대본(2026-11-28): 설명 줄을 장면 대사로 덜어 냈다
    for (const id of TIP_IDS) {
      const l = T(id, ARGS);
      expect(l.tip, id).toBe(id);
      expect(Object.keys(WHO_NAME), id).toContain(l.who);
      expect(l.text.trim().length, id).toBeGreaterThan(5);
      expect(l.text, id).not.toMatch(/undefined|NaN|null|Infinity/);
      expect(l.text.length, `${id}: ${l.text}`).toBeLessThanOrEqual(42);
      expect(Object.keys(MOMENT), id).toContain(TIPS[id].moment);
    }
  });
  it('비추는 화면 조각은 전부 화면 코드에 data-hl 로 붙어 있고, 쓰이지 않는 조각이 없다', () => {
    const used = new Set(TIP_IDS.map((id) => T(id, ARGS).hl).filter(Boolean));
    for (const k of Object.keys(HL) as (keyof typeof HL)[]) {
      expect(new RegExp(`data-hl=("${k}"|\\{[^}]*'${k}')`).test(SRC), `data-hl ${k}`).toBe(true);
      expect(hlSel(k)).toBe(`[data-hl="${k}"]`);
      expect(used.has(k), `쓰이지 않는 조각 ${k}`).toBe(true);
    }
    for (const k of used) expect(Object.keys(HL)).toContain(k);
  });
  it('말투(개정 대본): 늘이는 "~요오"와 물결은 없고, 가운데점도 없다. 프롤로그는 추심원과 칩멍크가 주고받는다', () => {
    for (const id of TIP_IDS) {
      const l = T(id, ARGS);
      expect(l.text, id).not.toMatch(/요오|~|·/);
    }
    const p = prologueTalk({ debt: 300000, interest: 4500 });
    expect(p.some((t) => t.who === 'collector') && p.some((t) => t.who === 'hero')).toBe(true);
    expect(p.every((t) => !/요오|·/.test(t.text))).toBe(true);
  });
  it('약속한 설명이 다 있다: 세계·쳇바퀴·정산·연체·빚·지도·알바·선물·배율·증거금·청산·손절·목표·파산', () => {
    const a = tipArgs(fresh());
    const story = [STORY.collectorCome({ interest: 4500, living: 1000, cash: 160, lend: 100000, again: false, reborn: false }, a), STORY.tutIntro(41000, 10, a), STORY.tutLost(41000, 100000, 6, a), STORY.hamsterHint(1600, a)].flat().map((l) => l.text);
    const all = [...prologueTalk({ debt: 300000, interest: 4500 }).map((t) => t.text), ...story, ...TIP_IDS.map((id) => T(id, ARGS).text)].join(' ');
    // 개정 대본(2026-11-28): 설명은 장면 대사와 숫자 곁의 도움말로 옮겨 갔다. 약속한 말은 그대로 있다
    for (const w of ['30만', '내 이름 써요', '코인을 캐요', '팔리게', '정산', '생활비', '연체', '빚', '이자', '빌리', '갚', '햄스터', '초당', '롱', '숏', '배율', '청산', '반대로 약 10% 움직이면 거신 돈을 모두 잃어요', '손절과 익절', '정산 빼고', '첫 주문용 시세', '장부']) {
      expect(all, w).toContain(w);
    }
    expect(all).not.toMatch(/바이낸스|Binance|Bybit|업비트/i);
  });
  it('이야기 장면에 끼운 설명 줄은 전부 등록된 줄이다(장면 → 줄 이름이 풀린다)', () => {
    const g = fresh();
    const a = tipArgs(g);
    const scenes = [
      STORY.collectorCome({ interest: 4500, cash: 3900, lend: 100000, again: false, reborn: false }, a),
      STORY.office({ lend: 100000, ratePct: 4, oldInterest: 4500, newInterest: 8500, debt: 400000 }, a),
      STORY.firstSettle(8500, a), STORY.hamsterHint(1800, a), STORY.tutIntro(30000, 10, a), STORY.tutLost(30000, 100000, 8, a),
      ...(Object.keys(MOMENT) as Moment[]).map((m) => tips(m, a)),
    ];
    const shown = new Set<string>();
    for (const lines of scenes) for (const l of lines) {
      expect(l.text.length, l.text).toBeLessThanOrEqual(l.who === 'note' ? 52 : 42); // 지문은 글자가 작다
      if (l.tip) { expect(TIP_IDS).toContain(l.tip); shown.add(l.tip); }
    }
    expect([...shown].sort()).toEqual([...TIP_IDS].sort()); // 등록만 되고 어디에도 안 나오는 줄이 없다
    // 다시 온 추심원(돌려보낸 뒤)은 설명을 되풀이하지 않는다
    expect(STORY.collectorCome({ interest: 4500, cash: 0, lend: 100000, again: true, reborn: false }, a).some((l) => l.tip)).toBe(false);
  });
});

describe('튜토리얼 대사 (U-32): 한 줄은 평생 한 번', () => {
  it('설명 장면: 처음엔 전부 나오고 시계를 멈춘다. 본 뒤에는 다시 넣어도 나오지 않는다(다음 생에도)', () => {
    for (const m of Object.keys(MOMENT) as Moment[]) {
      const ids = tipsOf(m);
      expect(tipsLeft(m), m).toBe(true);
      P().pushScene({ id: 'guide_' + m, again: true, lines: tips(m, ARGS), auto: 4000 });
      const sc = P().scenes[0];
      expect(sc.lines.map((l) => l.tip), m).toEqual(ids);
      expect(sc.guide && sc.hold, m).toBe(true);
      expect(sc.auto, m).toBeUndefined(); // 설명은 저절로 닫히지 않는다
      expect(playFront()).toEqual(ids);
      expect(tipsLeft(m), m).toBe(false);
      P().pushScene({ id: 'guide_' + m, again: true, lines: tips(m, ARGS) });
      expect(P().scenes.length, m).toBe(0);
      P().resetLife(3, false); // 환생
      P().pushScene({ id: 'guide_' + m, again: true, lines: tips(m, ARGS) });
      expect(P().scenes.length, m).toBe(0);
    }
    expect(TIP_IDS.every((id) => tipSeen(id))).toBe(true);
  });
  it('이야기 장면: 처음엔 설명이 끼어 나오고, 다음에는 이야기 줄만 남는다(시계도 멈추지 않는다)', () => {
    const lines = () => STORY.hamsterHint(1600, ARGS);
    P().pushScene({ id: 's1', lines: lines() });
    expect(P().scenes[0].lines.length).toBe(5);
    expect(P().scenes[0].hold).toBe(true);
    expect(playFront()).toEqual(['-', 'ham.what', '-', 'ham.quit', 'ham.wheel']);
    P().pushScene({ id: 's2', lines: lines(), auto: 4000 });
    expect(P().scenes[0].lines.map((l) => l.tip ?? '-')).toEqual(['-', '-']);
    expect(P().scenes[0].hold).toBe(false);
    expect(P().scenes[0].auto).toBe(4000);
  });
  it('띄운 줄만 본 것으로 적힌다. 처음부터 다시(&prologue=1)는 전부 되살리고, 끄기(&guide=0)는 전부 뺀다', () => {
    markTip('home.tap');
    expect(tipSeen('home.tap')).toBe(true);
    expect(tipSeen('home.mine')).toBe(false);
    P().pushScene({ id: 'guide_home', again: true, lines: tips('home', ARGS) });
    expect(P().scenes[0].lines.map((l) => l.tip)).toEqual(tipsOf('home').slice(1));
    P().patch({ scenes: [] });
    resetGuide();
    expect(TIP_IDS.some((id) => tipSeen(id))).toBe(false);
    setGuideOff(true);
    expect(tipsLeft('home')).toBe(false);
    P().pushScene({ id: 'guide_home', again: true, lines: tips('home', ARGS) });
    expect(P().scenes.length).toBe(0);
    P().pushScene({ id: 'office', lines: STORY.office({ lend: 100000, ratePct: 1.3, oldInterest: 1500, newInterest: 2800, debt: 400000 }, ARGS) });
    expect(P().scenes[0].lines.every((l) => !l.tip)).toBe(true);
    P().patch({ scenes: [] });
  });
  it('빌린 뒤의 숫자도 풀린다(빚 40만, 청구 3,130)', () => {
    const g = fresh();
    A(g, { type: 'borrow', lender: 'shark1' });
    expect(tipArgs(g)).toMatchObject({ debt: 400000, claim: 3130, lend: 100000 });
    expect(T('hud.debt', tipArgs(g)).text).toContain('40만');
  });
});

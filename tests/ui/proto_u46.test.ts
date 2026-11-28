// 회차 6 (U-46): 말이 되는가 — 줄 · 숫자 · 때가 화면과 세상에 맞는지. 그리고 5b 의 남은 흠(떠오르는 숫자와 칸의 숫자, 전선이 발밑을 지나감).
import { describe, it, expect } from 'vitest';
import { STORY } from '../../src/ui/proto/text';
import { tradeReaction } from '../../src/ui/proto/react';
import { TIPS } from '../../src/ui/proto/guide';
import { cableRoute, offFloor, WHEEL_SLOTS, HERO_SPOT, VISITOR_SPOT, RIG_SPOT, RIG_H, RIG_ART, type Pt } from '../../src/ui/proto/home';
import { floorCorner } from '../../src/ui/proto/World';
import { eventById } from '../../src/engine/data';
import { hamsterMath, homeSummary, tiles, perSec, rateTxt } from '../../src/ui/proto/model';
import { A, fresh } from '../engine/helpers';
import type { GameState } from '../../src/engine/types';

const ARGS = { tap: 2, claim: 5500, living: 1000, wage: 1600, wheel: 50000, lend: 100000, rate: 4, debt: 300000, lev: 10 };
const text = (ls: { text: string }[]) => ls.map((l) => l.text).join(' / ');

describe('말이 되는 줄 (U-46)', () => {
  it('사무소: "어머님 빚 4,500"이 아니라 이자 4,500 (빚은 30만이다)', () => {
    const t = text(STORY.office({ lend: 100000, ratePct: 4, oldInterest: 4500, newInterest: 8500, debt: 400000 }, ARGS));
    expect(t).toContain('집에 가시면 이자 8,500부터 떼어 주시고요.'); // 개정 대본 장면 9: 합친 뒤의 이자
    expect(t).not.toMatch(/어머님 빚 4,500/);
  });
  it('추심원이 걷으러 온 돈은 목표 막대의 숫자(이자 + 생활비)와 같다', () => {
    const t = text(STORY.collectorCome({ interest: 4500, living: 1000, cash: 143, lend: 100000, again: false, reborn: false }, ARGS));
    expect(t).toContain('143. 두 알씩 꼬박 밟았는데.');
    expect(t).toContain('오늘 받을 게 5,500인데');
    expect(STORY.collectorCome({ interest: 4500, living: 1000, cash: 0, lend: 100000, again: false, reborn: true }, ARGS)[0].text).toBe('오소리 사무소에서 왔습니다. 이자 4,500에 생활비 1,000이요.');
  });
  it('다음 생: "처음 뵙네요오" 한 추심원이 "또" 바꿔 적었다고 하지 않는다', () => {
    expect(text(STORY.rebornSettle(8500))).not.toMatch(/또/);
  });
  it('오픈 기념 문자의 속마음은 아무도 안 한 말을 끌어오지 않는다', () => {
    const t = text(STORY.feeEventSms({ left: 19, reborn: false }));
    expect(t).not.toMatch(/사무소에서도 들었다/);
    expect(t).toContain('무료라는 글씨가 금액보다 크네.');
    expect(t).toContain('수수료 무료');
  });
  it('금리 인상은 예고 다음 정산이 끝난 뒤부터 붙는다: 속보와 추심원이 그렇게 말한다(엔진 decayEffects 의 차례)', () => {
    expect(eventById.rate_hike.text).toContain('다음 정산이 지나면');
    expect(eventById.rate_hike.text).not.toContain('다음 정산부터');
    expect(STORY.rateHike({ text: 'x', from: 14500, to: 24500, times: 2, fixed: 4500 })[1].text).toBe('이번엔 14,500 그대로 준비하세요. 그다음 2번은 24,500씩이에요.');
  });
  it('거래소는 폰의 앱: 연체 장면은 "앱 속에" 묶였다고 한다', () => {
    const t = text(STORY.overdue({ interest: 14500, nth: 1, tagged: false, seized: false, nothingLeft: false, locked: 100000 }));
    expect(t).toContain('100,000은 아직 거래에 걸려 있잖아요');
    expect(t).not.toMatch(/거래소에/);
  });
  it('엄마의 줄은 오소리 장부의 것: 캐피탈 창구 장면 뒤에 떠도 어느 장부인지 말한다', () => {
    expect(STORY.momClue('mirror')[0].text.startsWith('대부가 장부를 넘기자')).toBe(true);
  });
  it('크게 딴 판에 추심원은 이자 단위로 말하지 않는다(U-67)', () => {
    const r = tradeReaction({ pnl: 22000, margin: 9000, lev: 10, liq: false, heldSec: 3, fundedBy: null, allIn: false }, { claim: 12500, wheelNet: 4867, cashAfter: 50000, liqs: 0, winStreak: 0, lossStreak: 0, tinyStreak: 0, feesLife: 0, seen: {} });
    expect(r?.lines[0]).toBe('많이 버셨네요. 종 칠 때 들를게요.');
  });
  it('세 판째 본전: 서로 다른 종목이어도 맞는 말(수수료가 공짜였던 것만 말한다)', () => {
    const r = tradeReaction({ pnl: 0, margin: 9000, lev: 10, liq: false, heldSec: 3, fundedBy: null, allIn: false }, { claim: 15500, wheelNet: 4867, cashAfter: 50000, liqs: 0, winStreak: 0, lossStreak: 0, tinyStreak: 3, feesLife: 0, seen: {} });
    expect(r?.lines[0]).toBe('세 번이나 사고파셨는데 본전이네요. 지금 수수료 안 받을 때라 다행이죠.');
  });
  it('튜토리얼 뒤 "이제부터 시세는" 줄은 실제 시세 · 연습 시세 둘 다에서 맞다', () => {
    expect(TIPS['goal.real'].text(ARGS)).toBe('이번엔 수금할 돈부터 빼 두자.');
  });
});

describe('떠오르는 숫자와 칸의 숫자 (U-46, 5b 의 남은 흠 a)', () => {
  const borrowed = (): GameState => { const g = fresh(); A(g, { type: 'borrow', lender: 'shark1' }); A(g, { type: 'openAccount', sponsor: true }); A(g, { type: 'hire', coin: 'DTC' }); return g; };
  it('도는 칸의 초당 = 쳇바퀴 위에 떠서 채굴기로 가는 "+n"(1초에 캐서 판 돈). 일당은 정산 때라고 작은 줄에', () => {
    const g = borrowed();
    const hm = hamsterMath(g);
    const floater = Math.round(perSec(hm.sold, g.run)); // World.tsx secGain
    expect(tiles(g)[0].text).toBe(`초당 +${rateTxt(perSec(hm.sold, g.run))}`);
    expect(Math.round(Number(tiles(g)[0].text.replace(/[^\d.]/g, '')))).toBe(floater);
    expect(tiles(g)[0].sub).toBe('일당 530은 정산 때');
  });
  it('접힌 한 줄: 초록 = 1초마다 들어오는 돈, 빨강 = 정산 때 나가는 돈 전부(이자 + 생활비 + 일당). 견줌(어느 쪽이 큰가)은 예전과 같다', () => {
    const g = borrowed();
    const s = homeSummary(g);
    expect(s.mined).toBe(hamsterMath(g).sold);
    expect(s.due).toBe(s.claim + s.wages);
    expect(s.mined >= s.due).toBe(s.idle >= s.claim);
  });
});

describe('전선이 발밑을 지나지 않는다 (U-46, 5b 의 남은 흠 d)', () => {
  const u = RIG_H / RIG_ART.h;
  const sock: Pt = [RIG_SPOT[0] - (RIG_ART.w * u) / 2 + RIG_ART.socket[0] * u, RIG_SPOT[1] - RIG_H + RIG_ART.socket[1] * u];
  const start = (s: number): Pt => { const f = WHEEL_SLOTS[s]; return [f[0] + (f[0] < sock[0] ? 51 : -51), f[1] - 10]; };
  const under = (pl: Pt[], foot: Pt, w: number): boolean => {
    for (let i = 0; i + 1 < pl.length; i++) for (let k = 0; k <= 40; k++) {
      const x = pl[i][0] + ((pl[i + 1][0] - pl[i][0]) * k) / 40, y = pl[i][1] + ((pl[i + 1][1] - pl[i][1]) * k) / 40;
      if (Math.abs(x - foot[0]) < w && y > foot[1] - 12 && y < foot[1] + 20) return true;
    }
    return false;
  };
  it('예전 길(한 번 꺾기)은 앞 오른쪽 쳇바퀴의 전선이 주인공 발밑을 지났다', () => {
    const a = start(3);
    expect(under([a, floorCorner(a, sock), sock], HERO_SPOT, 45)).toBe(true);
  });
  it('집이 꽉 차도: 어느 쳇바퀴의 전선도 주인공 · 손님의 발밑을 지나지 않고(다른 쳇바퀴 받침 앞은 많아야 하나), 바닥 밖(상자 위 · 계단)으로 나가지 않는다', () => {
    for (let s = 0; s < WHEEL_SLOTS.length; s++) {
      const feet = [{ p: HERO_SPOT, w: 45 }, { p: VISITOR_SPOT, w: 40 }, ...WHEEL_SLOTS.filter((_, i) => i !== s).map((p) => ({ p, w: 80 }))];
      const r = cableRoute(start(s), sock, feet);
      expect(r[0]).toEqual(start(s));
      expect(r[r.length - 1]).toEqual(sock);
      expect(under(r, HERO_SPOT, 45), `자리 ${s}: 주인공 발밑`).toBe(false);
      expect(under(r, VISITOR_SPOT, 40), `자리 ${s}: 손님 자리`).toBe(false);
      // 다른 쳇바퀴의 받침 앞: 꽉 찬 집에서는 다 피할 수 없을 때가 있다(앞 오른쪽 → 뒤 왼쪽 받침 앞). 예전 길보다 많이 지나지는 않는다
      const crossings = (pl: Pt[]) => WHEEL_SLOTS.filter((f, i) => i !== s && under(pl, f, 80)).length;
      expect(crossings(r), `자리 ${s}: 쳇바퀴 받침`).toBeLessThanOrEqual(crossings([start(s), floorCorner(start(s), sock), sock]));
      expect(crossings(r), `자리 ${s}: 쳇바퀴 받침`).toBeLessThanOrEqual(1);
      for (let i = 1; i < r.length - 1; i++) expect(offFloor(r[i][0], r[i][1]), `자리 ${s}: 꺾는 곳 ${r[i]}`).toBe(false);
      // 바닥의 두 축만 따라 간다(기울기 ±30°)
      for (let i = 0; i + 1 < r.length; i++) { const dx = r[i + 1][0] - r[i][0], dy = r[i + 1][1] - r[i][1]; expect(Math.abs(Math.abs(dy) - Math.abs(dx) * Math.tan(Math.PI / 6))).toBeLessThan(2); }
    }
  });
});

describe('대본 받아쓰기에서 찾은 것 (U-46)', () => {
  it('이름을 바꾸면 조사도 맞춘다: "오소리 소장은" → "오소리 대부는"', async () => {
    const { storyNames } = await import('../../src/engine/act1');
    const { balance } = await import('../../src/engine/data');
    (balance as { act1?: unknown }).act1 = { friends: false };
    expect(storyNames('오소리 소장은 싼 것부터 가져갑니다.')).toBe('오소리 대부는 싼 것부터 가져갑니다.');
    delete (balance as { act1?: unknown }).act1;
  });
  it('1막에 없는 장치(집 · 속보 · 연락처 · 꺾기 · 미루기)를 조건으로 건 엔딩은 1막에서 빠진다', async () => {
    const { act1Unreachable } = await import('../../src/engine/endings');
    const { endingById } = await import('../../src/engine/data');
    for (const id of ['END-010', 'END-015', 'END-034', 'END-073', 'END-130', 'END-156', 'END-162', 'END-179', 'END-042', 'END-089', 'END-056', 'END-060', 'END-061', 'END-091', 'END-098']) expect(act1Unreachable(endingById[id]), id).toBe(true);
    expect(act1Unreachable(endingById['END-051'])).toBe(false);
  });
  it('오소리 대부는 존댓말로 거절한다 · 금리 인상은 숲속중앙조합 · 뒷골목 문자는 막힌 까닭으로 시작한다', async () => {
    const { lenderById, eventById: ev } = await import('../../src/engine/data');
    const lines = (lenderById.shark1 as unknown as { lines: Record<string, string> }).lines;
    for (const t of Object.values(lines)) expect(t).toMatch(/요|다|까|죠/);
    expect(lines.refuseLimit).toBe('더는 못 드려요. 먼저 빌리신 것부터 좀 갚으셔야 돼요.');
    expect(ev.rate_hike.text.startsWith('숲속중앙조합')).toBe(true);
    expect(STORY.viperSms()[0].text.startsWith('돈 더 쓸 데가 있거든')).toBe(true);
    expect(text(STORY.collectorCome({ interest: 4500, living: 1000, cash: 0, lend: 100000, again: true, reborn: false }, ARGS))).toContain('지난번에 드린 지도 아직 있어요?');
    expect(text(STORY.phoneRing({ paid: 9500, repaid: 50000, income: 12924, wages: 3200, claim: 9500, net: 224, left: 350000 }))).toContain('남은 350,000을 언제 다 갚지');
  });
});

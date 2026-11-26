// 웅얼거림 대사(U-36): 한글 한 글자 → 음절 고르기(make.py 와 같은 규칙), 줄의 시간표(글자 = 음절, 띄어쓰기·부호 = 쉼), 글자가 보이는 때.
import { describe, expect, it } from 'vitest';
import sprite from '../../src/ui/proto/audio/babble.json';
import { SYLLABLES, VOICES, pickSyllable, planSpeech, shownAt, voiceOf } from '../../src/ui/proto/babble';
import { STORY, prologueTalk } from '../../src/ui/proto/text';
import { tipArgs } from '../../src/ui/proto/model';
import { fresh } from '../engine/helpers';

const LINE = '이자 못 내시네요오. 사무소로 오세요오.';

describe('음절 고르기 (make.py pick)', () => {
  it('음절 이름은 묶음 구간표(babble.json)와 같고, 구간은 0.16초씩 겹치지 않는다', () => {
    expect(Object.keys(sprite).sort()).toEqual([...SYLLABLES].sort());
    const segs = Object.values(sprite as unknown as Record<string, [number, number]>).sort((a, b) => a[0] - b[0]);
    segs.forEach(([s, d], k) => { expect(d).toBeCloseTo(0.16, 2); if (k) expect(s).toBeGreaterThanOrEqual(segs[k - 1][0] + segs[k - 1][1]); });
  });
  it('모음 갈래: ㅏㅑㅘ=a · ㅐㅔㅚ…=e · ㅓㅕㅗㅛㅝ=o · ㅜㅠㅡ=u · ㅣㅟㅢ=i (첫소리 ㅇ·ㅎ 은 모음만)', () => {
    expect(['아', '야', '와', '하'].map(pickSyllable)).toEqual(['a', 'a', 'a', 'a']);
    expect(['애', '에', '외', '예'].map(pickSyllable)).toEqual(['e', 'e', 'e', 'e']);
    expect(['어', '여', '오', '요', '워'].map(pickSyllable)).toEqual(['o', 'o', 'o', 'o', 'o']);
    expect(['우', '유', '으'].map(pickSyllable)).toEqual(['u', 'u', 'u']);
    expect(['이', '위', '의'].map(pickSyllable)).toEqual(['i', 'i', 'i']);
  });
  it('첫소리 갈래: ㄴ=n ㄹ=r ㅁ=m ㅂㅃㅍ=b ㄷㄸㅌ=d, 묶음에 없는 짝은 b+모음으로, 받침은 무시', () => {
    expect(pickSyllable('나')).toBe('na'); expect(pickSyllable('니')).toBe('ni');
    expect(pickSyllable('네')).toBe('be'); // ne 는 없다
    expect(pickSyllable('로')).toBe('ro'); expect(pickSyllable('루')).toBe('ru'); expect(pickSyllable('라')).toBe('ba');
    expect(pickSyllable('마')).toBe('ma'); expect(pickSyllable('못')).toBe('mo'); expect(pickSyllable('무')).toBe('mu');
    expect(pickSyllable('바')).toBe('ba'); expect(pickSyllable('빠')).toBe('ba'); expect(pickSyllable('피')).toBe('bi');
    expect(pickSyllable('다')).toBe('da'); expect(pickSyllable('도')).toBe('bo'); expect(pickSyllable('탈')).toBe('da');
  });
  it('그 밖의 첫소리는 자리 번호 홀짝으로 b / d (make.py 그대로): ㄱ·ㅆ·ㅈ·ㅊ → d, ㄲ·ㅅ·ㅉ·ㅋ → b', () => {
    expect(pickSyllable('가')).toBe('da'); expect(pickSyllable('싸')).toBe('da'); expect(pickSyllable('자')).toBe('da'); expect(pickSyllable('차')).toBe('da');
    expect(pickSyllable('까')).toBe('ba'); expect(pickSyllable('사')).toBe('ba'); expect(pickSyllable('짜')).toBe('ba'); expect(pickSyllable('카')).toBe('ba');
    expect(pickSyllable('지')).toBe('bi'); // di 는 없다 → b+모음
    expect(pickSyllable('소')).toBe('bo');
  });
  it('승인받은 시험 문장의 음절 줄', () => {
    expect([...LINE].map(pickSyllable).filter(Boolean).join(' ')).toBe('i da mo be bi be o o ba mu bo ro o be o o');
  });
  it('한글 11,172자 전부 묶음에 있는 음절로 간다. 숫자·영문은 소리가 있고 부호·빈칸은 없다', () => {
    for (let c = 0xac00; c <= 0xd7a3; c++) expect(SYLLABLES).toContain(pickSyllable(String.fromCharCode(c)));
    for (const ch of '0123456789abXYZ') expect(SYLLABLES).toContain(pickSyllable(ch));
    for (const ch of ' .?!,~…「」()%+−') expect(pickSyllable(ch)).toBeNull();
  });
});

describe('목소리', () => {
  it('승인받은 세 목소리의 값', () => {
    expect(VOICES.collector).toEqual({ rate: 1.45, blip: 0.085, gap: 0.018, pause: 0.22, detune: 0.06 });
    expect(VOICES.boss).toEqual({ rate: 1.15, blip: 0.10, gap: 0.025, pause: 0.26, detune: 0.04 });
    expect(VOICES.weasel).toEqual({ rate: 1.9, blip: 0.07, gap: 0.012, pause: 0.18, detune: 0.10 });
  });
  it('지문·문자·알림은 소리가 없고, 모르는 사람은 기본 목소리로 말한다', () => {
    expect(voiceOf('note')).toBeNull(); expect(voiceOf('sms')).toBeNull(); expect(voiceOf('system')).toBeNull();
    expect(voiceOf('hero')).toBe(VOICES.hero); expect(voiceOf('owl')).toBe(VOICES.other);
  });
});

describe('줄의 시간표 (planSpeech · shownAt)', () => {
  const v = VOICES.collector;
  const sp = planSpeech(LINE, v);
  it('글자 하나 = 음절 하나, 띄어쓰기 = 쉼의 절반, 마침표 = 쉼 → 추심원 줄은 약 2.5초(승인 클립과 같다)', () => {
    expect(sp.blips.length).toBe(16);
    expect(sp.total).toBeCloseTo(16 * (v.blip + v.gap) + 4 * v.pause * 0.5 + 2 * v.pause, 6);
    expect(sp.total).toBeCloseTo(2.53, 1);
    expect(planSpeech(LINE, VOICES.boss).total).toBeCloseTo(3.04, 1);
    expect(planSpeech('할부도 돼요~ 쳇바퀴 하나 더 들이세요.', VOICES.weasel).total).toBeCloseTo(2.04, 1);
  });
  it('음절은 제 글자가 보이는 바로 그때 나고, 서로 겹치지 않는다', () => {
    sp.blips.forEach((b, k) => {
      expect(b.at).toBe(sp.at[b.i]);
      expect(b.dur).toBe(v.blip);
      if (k) expect(b.at).toBeGreaterThanOrEqual(sp.blips[k - 1].at + v.blip + v.gap - 1e-9);
    });
  });
  it('높이는 rate ± detune 안에서 흔들리고, . ? ! 바로 앞 음절은 0.9배로 내린다. 같은 글은 늘 같은 소리', () => {
    for (const b of sp.blips) {
      const end = '.?!'.includes(LINE[b.i + 1] ?? '');
      const base = b.rate / (end ? 0.9 : 1);
      expect(base).toBeGreaterThanOrEqual(v.rate * (1 - v.detune) - 1e-9);
      expect(base).toBeLessThanOrEqual(v.rate * (1 + v.detune) + 1e-9);
      // 음절 조각(0.16초) 안에서 끝난다
      expect(b.dur * b.rate).toBeLessThanOrEqual(0.16);
    }
    expect(new Set(sp.blips.map((b) => b.rate.toFixed(4))).size).toBeGreaterThan(8);
    expect(planSpeech(LINE, v)).toEqual(sp);
  });
  it('글자가 보이는 때: 0초에 첫 글자, 시간이 갈수록 늘기만 하고, 다 말하면 전부', () => {
    expect(shownAt(sp, -0.1)).toBe(0);
    expect(shownAt(sp, 0)).toBe(1);
    expect(shownAt(sp, v.blip + v.gap + 1e-6)).toBe(2);
    // "이자" 뒤 빈칸은 두 음절 뒤에 보이고, 그 다음 글자는 쉼의 절반 뒤
    expect(sp.at[3] - sp.at[2]).toBeCloseTo(v.pause * 0.5, 9);
    let prev = 0;
    for (let t = 0; t <= sp.total; t += 0.01) { const n = shownAt(sp, t); expect(n).toBeGreaterThanOrEqual(prev); prev = n; }
    expect(shownAt(sp, sp.typed)).toBe(LINE.length);
    expect(sp.typed).toBeLessThan(sp.total);
  });
  it('숫자는 읽되 숫자 사이 쉼표는 쉬지 않고, 잇따른 부호·따옴표는 한 번만 쉰다', () => {
    const a = planSpeech('이자 5,500요.', v);
    expect(a.blips.length).toBe(2 + 4 + 1);
    expect(a.total).toBeCloseTo(7 * (v.blip + v.gap) + v.pause * 0.5 + v.pause, 6);
    expect(planSpeech('네…?!', v).total).toBeCloseTo(v.blip + v.gap + v.pause, 6);
    expect(planSpeech('「네」', v).total).toBeCloseTo(v.blip + v.gap, 6);
  });
  it('속마음은 두 음절에 하나만, 작게', () => {
    const h = planSpeech('엄마가 쓰던 쳇바퀴다', VOICES.hero);
    expect(h.blips.length).toBe(5);
    expect(h.blips.every((b) => b.gain < 0.4)).toBe(true);
    expect(h.at[1] - h.at[0]).toBeCloseTo(VOICES.hero.blip + VOICES.hero.gap, 9);
  });
  it('게임의 말하는 줄은 모두 5초 안에 다 나온다(프롤로그 + 사무소·정산·튜토리얼 장면)', () => {
    const g = fresh();
    const lines = [
      ...prologueTalk({ debt: 300000, interest: 4500 }).map((text) => ({ who: 'collector', text })),
      ...STORY.settleWin(5500), ...STORY.settleLose(5500), ...STORY.tutIntro(30000, 10, tipArgs(g)), ...STORY.tutLost(30000, 100000, 6, tipArgs(g)),
    ];
    expect(lines.length).toBeGreaterThan(15);
    for (const l of lines) { const vo = voiceOf(l.who); if (vo) expect(planSpeech(l.text, vo).typed, l.text).toBeLessThan(5); }
  });
});

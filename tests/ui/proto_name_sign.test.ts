// 첫 이름 적기(사용자: "그럼 처음에 이름 정하기도 있어야겠네"): 차용증 서명 규칙, 이름이 있으면 건너뛰기, 저장, 장부 번호.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHIP_COUNT, NAME_ERR, SUGGEST, checkName, firstChips, needsSign, pickSuggest, signName } from '../../src/ui/proto/loanSign';
import { savedName, sendName, useRank, fallbackName, setRankName } from '../../src/ui/proto/ranking';
import { cleanName, ledgerNo, withLedgerNo } from '../../src/ui/proto/rankingCore';
import { cleanName as serverClean } from '../../ranking/src/verify';

const store = new Map<string, string>();
const fakeWindow = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } }, location: { search: '' }, setTimeout, clearTimeout };

describe('서명 칸 규칙(cleanName 과 같다)', () => {
  it('1~12글자 별명은 받는다, 앞뒤 빈칸은 지운다', () => {
    expect(checkName('몰빵다람쥐')).toEqual({ ok: true, name: '몰빵다람쥐' });
    expect(checkName('  존버개미 ')).toEqual({ ok: true, name: '존버개미' });
    expect(checkName('가'.repeat(12))).toEqual({ ok: true, name: '가'.repeat(12) });
  });
  it('비었거나, 13글자거나, 꺾쇠가 있으면 말해 준다', () => {
    expect(checkName('')).toEqual({ ok: false, why: 'empty' });
    expect(checkName('   ')).toEqual({ ok: false, why: 'empty' });
    expect(checkName('가'.repeat(13))).toEqual({ ok: false, why: 'long' });
    expect(checkName('<b>개미')).toEqual({ ok: false, why: 'bad' });
    expect(checkName('줄\n바꿈')).toEqual({ ok: false, why: 'bad' });
    for (const k of ['empty', 'long', 'bad'] as const) expect(NAME_ERR[k]).not.toContain('·');
  });
  it('받은 이름은 cleanName 도 받는다', () => {
    for (const s of ['몰빵다람쥐', '200배인생', ' a b ', '가'.repeat(12)]) {
      const c = checkName(s);
      expect(c.ok).toBe(true);
      if (c.ok) expect(cleanName(c.name)).toBe(c.name);
    }
  });
});

describe('별명 칩', () => {
  it('전부 12글자 안, 몰빵다람쥐는 있고 도토리개미는 없다, 개미가 셋 넘게', () => {
    for (const s of SUGGEST) expect(checkName(s).ok).toBe(true);
    expect(SUGGEST).toContain('몰빵다람쥐');
    expect(SUGGEST).not.toContain('도토리개미');
    expect(SUGGEST.filter((s) => s.endsWith('개미')).length).toBeGreaterThanOrEqual(3);
    expect(new Set(SUGGEST).size).toBe(SUGGEST.length);
  });
  it('처음 여섯, 섞으면 겹치지 않는 여섯이고 되도록 새것', () => {
    const a = firstChips();
    expect(a.length).toBe(CHIP_COUNT);
    let r = 0.13;
    const b = pickSuggest(CHIP_COUNT, () => (r = (r * 9301 + 0.49297) % 1), a);
    expect(new Set(b).size).toBe(CHIP_COUNT);
    expect(b.filter((x) => a.includes(x)).length).toBe(Math.max(0, CHIP_COUNT - (SUGGEST.length - a.length)));
  });
});

describe('이름이 있으면 서류를 건너뛴다, 찍으면 남는다', () => {
  beforeEach(() => { store.clear(); (globalThis as any).window = fakeWindow; useRank.setState({ name: null }); });
  afterEach(() => { delete (globalThis as any).window; });

  it('이름이 없으면 묻고, 있으면 묻지 않는다. 장면 건너뛰기(pdev)는 묻지 않는다, 확인용 장면은 늘 묻는다', () => {
    expect(needsSign(null, null, false)).toBe(true);
    expect(needsSign('몰빵다람쥐', null, false)).toBe(false);
    expect(needsSign(null, 'clear', false)).toBe(false);
    expect(needsSign('몰빵다람쥐', 'sign', true)).toBe(true);
  });
  it('발도장을 찍으면 fof.rank.name 에 별명만 남고, 전광판 상태도 바뀐다', () => {
    const c = signName('  풀매수개미 ');
    expect(c).toEqual({ ok: true, name: '풀매수개미' });
    expect(store.get('fof.rank.name')).toBe('풀매수개미');
    expect(savedName()).toBe('풀매수개미');
    expect(useRank.getState().name).toBe('풀매수개미');
    expect(needsSign(savedName(), null, false)).toBe(false);
  });
  it('틀린 이름은 저장하지 않는다', () => {
    expect(signName('').ok).toBe(false);
    expect(signName('가'.repeat(13)).ok).toBe(false);
    expect(store.has('fof.rank.name')).toBe(false);
  });
  it('확인용 장면(persist=false)은 저장하지 않는다', () => {
    expect(signName('새벽개미', false).ok).toBe(true);
    expect(store.has('fof.rank.name')).toBe(false);
  });
  it('전광판에서 고치기는 그대로 된다(같은 자리)', () => {
    signName('몰빵다람쥐');
    expect(setRankName('손절못개미')).toBe(true);
    expect(store.get('fof.rank.name')).toBe('손절못개미');
  });
});

describe('장부 번호', () => {
  beforeEach(() => { store.clear(); (globalThis as any).window = fakeWindow; });
  afterEach(() => { delete (globalThis as any).window; });
  it('기기 번호마다 같은 네 자리', () => {
    expect(ledgerNo('fof_abc123def456ghi789jk')).toMatch(/^\d{4}$/);
    expect(ledgerNo('fof_abc123def456ghi789jk')).toBe(ledgerNo('fof_abc123def456ghi789jk'));
    expect(withLedgerNo('몰빵다람쥐', 'fof_x1234567')).toBe(`몰빵다람쥐 #${ledgerNo('fof_x1234567')}`);
  });
  it('보내는 이름 = 별명 #번호, 12글자 별명에 붙여도 서버가 받는다', () => {
    store.set('fof.rank.device', 'fof_testdevice0001');
    store.set('fof.rank.name', '가'.repeat(12));
    const n = sendName();
    expect(n).toBe(`${'가'.repeat(12)} #${ledgerNo('fof_testdevice0001')}`);
    expect(serverClean(n)).toBe(n);
    expect(fallbackName()).toBe(`다람쥐 #${ledgerNo('fof_testdevice0001')}`);
    store.delete('fof.rank.name');
    expect(sendName()).toBe(fallbackName());
  });
});

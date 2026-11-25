import { describe, it, expect } from 'vitest';
import { endings, endingsMeta } from '../../src/engine/data';

// 낱말 단위 검사: '피'는 단독 낱말·조사 결합(피가/피를/피투성이)만 막고 '캐피탈' 같은 글자 일부는 허용한다.
const FORBIDDEN: RegExp[] = [
  /(^|[^가-힣])피([^가-힣]|$)/, /피(가|를|는|도|에)\s/, /피투성/, /시신/, /시체/, /자살/, /자해/, /목을?\s?매/, /투신/, /유서/, /손목/, /핏/, /출혈/, /상처(?!받)/, /부상/,
];
const OPS = ['=', '!=', '>=', '<=', '>', '<', 'has', 'in'];

describe('M0 엔딩 데이터 (AC-v2-125, 132)', () => {
  it('AC-v2-125 200개, 번호 중복 없음', () => {
    expect(endings).toHaveLength(200);
    expect(new Set(endings.map((e) => e.id)).size).toBe(200);
    expect(endings.map((e) => e.no)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(endingsMeta.count).toBe(200);
  });

  it('AC-v2-125 모든 조건 키(와 식 안의 키)가 meta.stats 에 있다', () => {
    const stats = endingsMeta.stats as Record<string, { label: string; scope: string; type: string }>;
    for (const k of Object.keys(stats)) {
      expect(stats[k].label, k).toBeTruthy();
      expect(['moment', 'run', 'family'], k).toContain(stats[k].scope);
      expect(['number', 'bool', 'enum', 'set'], k).toContain(stats[k].type);
    }
    for (const e of endings) {
      for (const [key, op, val] of e.conditions) {
        expect(stats[key], `${e.id} ${key}`).toBeTruthy();
        expect(OPS).toContain(op);
        if (val && typeof val === 'object' && 'expr' in val) for (const tok of String(val.expr).match(/[A-Za-z][\w.]*/g) ?? []) expect(stats[tok], `${e.id} expr ${tok}`).toBeTruthy();
      }
    }
    // 4.8 의 새 통계 키는 조건에 아직 안 쓰였어도 목록에 있다
    for (const k of ['stage', 'acctAgeSettles', 'levCap', 'mineConcentration', 'mineTopCoin', 'walletTopShare', 'wheelsOwned', 'upgradesBought', 'han', 'branch'])
      expect(stats[k], k).toBeTruthy();
  });

  it('AC-v2-125 원인 + 조건 문자열이 같은 쌍이 없다', () => {
    const seen = new Set<string>();
    for (const e of endings) {
      const key = [...e.causes].sort().join('|') + '::' + JSON.stringify(e.conditions);
      expect(seen.has(key), e.id).toBe(false);
      seen.add(key);
    }
  });

  it('AC-v2-125 원인마다 기본 엔딩(조건 0개, 사채는 END-041+097 한 쌍)이 있다', () => {
    for (const c of endingsMeta.causes) expect(endings.some((e) => e.causes.includes(c) && e.base), c).toBe(true);
    const base = (c: string) => endings.filter((e) => e.causes.includes(c) && e.conditions.length === 0).map((e) => e.id);
    expect(base('LIQ')).toContain('END-158');
    expect(base('TIP')).toContain('END-163');
    expect(base('BANK')).toContain('END-018');
    expect(base('UPKEEP')).toContain('END-039');
    expect(base('SEIZE')).toContain('END-087');
    expect(base('FRIEND')).toContain('END-101');
    expect(base('LEGACY')).toContain('END-024');
    const s1 = endings.find((e) => e.id === 'END-041')!, s2 = endings.find((e) => e.id === 'END-097')!;
    expect(s1.conditions).toEqual([['lastLender', '=', 'shark1']]);
    expect(s2.conditions).toEqual([['lastLender', '=', 'shark2']]);
  });

  it('조건 패치 4.8: END-131·END-183, END-020 은 그대로', () => {
    const e131 = endings.find((e) => e.id === 'END-131')!;
    expect(e131.conditions).toEqual([['econ', 'in', ['slump', 'crash']], ['mineConcentration', '>=', 80]]);
    const e183 = endings.find((e) => e.id === 'END-183')!;
    expect(e183.conditions.map((c) => c[0])).toEqual(['walletDrawdown', 'walletShare', 'walletTopShare']);
    expect(e183.conditions[2]).toEqual(['walletTopShare', '>=', 80]);
    expect(endings.find((e) => e.id === 'END-020')!.conditions).toEqual([['laborTaps', '<', 100], ['assetsEver', '=', 0]]);
  });

  it('★3 은 가릴 조건 번호가 있고 그 밖은 null', () => {
    for (const e of endings) {
      if (e.rarity === 3 && e.conditions.length) expect(e.hiddenCondIndex, e.id).toBe(0);
      else expect(e.hiddenCondIndex, e.id).toBeNull();
    }
  });

  it('AC-v2-132 200개 모두 sceneType·shot·action 이 있다', () => {
    for (const e of endings) {
      expect(e.direction.sceneType, e.id).toBeTruthy();
      expect(e.direction.shot, e.id).toBeTruthy();
      expect(e.direction.action, e.id).toBeTruthy();
      expect(e.direction.promptEn, e.id).toBeTruthy();
    }
    expect(new Set(endings.map((e) => e.direction.sceneType))).toEqual(
      new Set(['결과 뒤의 삶', '사채업자 처리 직전', '빈자리(죽음 암시)', '영원한 노역', '대물림(아이)']),
    );
  });

  it('AC-v2-132 deathImplied 는 10~20개(5~10%)', () => {
    const n = endings.filter((e) => e.direction.deathImplied).length;
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(20);
  });

  it('AC-v2-132 제목·대사·action 에 금지어가 없다', () => {
    for (const e of endings) {
      for (const field of [e.title, e.line, e.direction.action as string]) {
        for (const re of FORBIDDEN) expect(re.test(field), `${e.id} ${re} in ${field}`).toBe(false);
      }
    }
  });

  it('END-054 의 대사에 {laborTaps} 자리표시자가 있다', () => {
    expect(endings.find((e) => e.id === 'END-054')!.line).toContain('{laborTaps}');
  });
});

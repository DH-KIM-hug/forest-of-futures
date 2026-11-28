// 날다람쥐코인 길잡이(라이트, 프롤로그 뒤): 걸음 순서, 행동 걸음은 진짜 누름이 있어야 넘어감, 판이 닫히면 결과로, 저장 칸, 화면 글 규칙
import { describe, it, expect } from 'vitest';
import { FT_STEPS, FT_IDS, FT_LEV, FT_PCT, FT_RESULT, FT_FIRST_HOLD, ftActDone, ftNext, ftJump, ftResume, type FtCtx } from '../../src/ui/proto/lite/flyTutSteps';
import { PROTO_KEEP, pickProto } from '../../src/ui/proto/protoSave';

const base: FtCtx = { lev: FT_LEV, liqPct: 1.9, interest: 4300, living: 1000, claim: 5300, up: true, pc: 'kr', candles: false, net: null, closed: null, settled: false };
const allLines = (c: FtCtx) => FT_STEPS.map((s) => s.line(c));
const ctxs: FtCtx[] = [
  base, { ...base, up: false, net: -1234 }, { ...base, net: 800, pc: 'intl', candles: true },
  { ...base, closed: { kind: 'tp', pnl: 5300 }, settled: true }, { ...base, closed: { kind: 'sl', pnl: -5300 } },
  { ...base, closed: { kind: 'close', pnl: 120 } }, { ...base, closed: { kind: 'close', pnl: -90 } }, { ...base, closed: { kind: 'liq', pnl: -25000 } },
];

describe('날다람쥐 길잡이 걸음', () => {
  it('가르치는 순서: 날다람쥐 → 차트 → 롱 숏 → 배율과 청산선 → 증거금 → 익절 손절 → 주문 → 손익 → 닫기 → 정산 → 대출', () => {
    const at = (id: string) => FT_IDS.indexOf(id);
    const order = ['fly', 'fake', 'shape', 'chart', 'color', 'dir', 'lev', 'lev200', 'liq', 'mg', 'stops', 'order', 'pnl', 'posLiq', 'wait', 'result', 'settle', 'loan', 'bye'];
    for (const id of order) expect(at(id), id).toBeGreaterThanOrEqual(0);
    for (let k = 1; k < order.length; k++) expect(at(order[k]), order[k]).toBeGreaterThan(at(order[k - 1]));
    expect(FT_IDS[FT_IDS.length - 1]).toBe('bye');
    expect(new Set(FT_IDS).size).toBe(FT_IDS.length);
  });
  it('행동 걸음은 넷(배율, 증거금, 익절 손절, 주문)과 기다림 하나, 나머지는 말', () => {
    expect(FT_STEPS.filter((s) => s.kind === 'act').map((s) => s.id)).toEqual(['lev', 'mg', 'stops', 'order']);
    expect(FT_STEPS.filter((s) => s.kind === 'wait').map((s) => s.id)).toEqual(['wait']);
    for (const s of FT_STEPS.filter((x) => x.kind !== 'text')) expect(s.target, s.id).toBeTruthy();
  });
  it('행동 걸음은 비춘 단추를 진짜로 눌러야 넘어간다(이미 맞는 값이어도)', () => {
    const u = { lev: FT_LEV, pct: FT_PCT, keep: false, tpK: 1, slK: 1, hasPos: false, closed: false };
    expect(ftActDone('lev', u, false)).toBe(false);
    expect(ftActDone('lev', u, true)).toBe(true);
    expect(ftActDone('lev', { ...u, lev: 10 }, true)).toBe(false);
    expect(ftActDone('mg', u, false)).toBe(false);
    expect(ftActDone('mg', u, true)).toBe(true);
    expect(ftActDone('mg', { ...u, keep: true }, true)).toBe(false);
    expect(ftActDone('mg', { ...u, pct: 100 }, true)).toBe(false);
    expect(ftActDone('stops', { ...u, tpK: null }, true)).toBe(false);
    expect(ftActDone('stops', u, true)).toBe(true);
    expect(ftActDone('order', u, true)).toBe(false);
    expect(ftActDone('order', { ...u, hasPos: true }, true)).toBe(true);
    expect(ftActDone('wait', { ...u, hasPos: true }, false)).toBe(false);
    expect(ftActDone('wait', { ...u, closed: true }, false)).toBe(true); // 익절 손절이 알아서 닫아도
  });
  it('판이 닫히면 들고 있던 걸음에서 결과로 뛴다. 주문 전이나 결과 뒤에서는 그대로', () => {
    const hold = FT_STEPS.map((s, i) => [s, i] as const).filter(([s]) => s.phase === 'hold').map(([, i]) => i);
    expect(hold.length).toBe(3);
    for (const i of hold) { expect(ftJump(i, true)).toBe(FT_RESULT); expect(ftNext(i, true)).toBe(FT_RESULT); expect(ftJump(i, false)).toBe(i); }
    expect(ftJump(0, true)).toBe(0);
    expect(ftJump(FT_RESULT + 1, true)).toBe(FT_RESULT + 1);
    expect(ftNext(FT_STEPS.length - 1, false)).toBe(-1);
    expect(ftNext(0, false)).toBe(1);
  });
  it('다시 열면: 판을 들고 있으면 손익부터, 아니면 처음부터', () => {
    expect(ftResume(false)).toBe(0);
    expect(ftResume(true)).toBe(FT_FIRST_HOLD);
    expect(FT_IDS[FT_FIRST_HOLD]).toBe('pnl');
  });
  it('끝까지 봤는지 건너뛰었는지는 라이트 저장에 남는다(flyTut)', () => {
    expect(PROTO_KEEP).toContain('flyTut');
    expect(pickProto({ flyTut: 'skip', toast: 'x' })).toEqual({ flyTut: 'skip' });
    expect(pickProto({ flyTut: 'done' }).flyTut).toBe('done');
  });
});

describe('날다람쥐 길잡이 대사', () => {
  it('짧고, 가운데점이 없고, 게임 밖 말이 없다', () => {
    for (const c of ctxs) for (const t of allLines(c)) {
      expect(t.length, t).toBeLessThanOrEqual(64);
      expect(t, t).not.toMatch(/[·•]/);
      expect(t, t).not.toMatch(/튜토리얼|단계|클릭|버튼|UI|가이드|tutorial/i);
      expect(t, t).not.toMatch(/undefined|NaN|null/);
    }
  });
  it('숫자는 받은 값: 배율, 이자와 생활비(쉬운 말로 줄여 청산 거리와 익절 폭 숫자는 뺐다)', () => {
    const t = allLines(base).join('\n');
    expect(t).toContain(`${FT_LEV}배`);
    expect(t).toContain('이자 4,300');
    expect(t).toContain('생활비 1,000');
    expect(t).toContain(`${FT_PCT}%`);
    expect(t).toContain('200배');
  });
  it('지고 있으면 지고 있다고 말한다(가짜 위로 없음)', () => {
    const lose = { ...base, net: -1234 };
    const pnl = FT_STEPS.find((s) => s.id === 'pnl')!.line(lose);
    expect(pnl).toContain('−1,234');
    expect(pnl).toContain('그런 날도 있죠');
    expect(FT_STEPS.find((s) => s.id === 'pnl')!.line({ ...base, net: 500 })).toContain('+500');
    const res = FT_STEPS.find((s) => s.id === 'result')!;
    expect(res.line({ ...base, closed: { kind: 'sl', pnl: -5300 } })).toMatch(/^손절\. −5,300/);
    expect(res.line({ ...base, closed: { kind: 'tp', pnl: 5300 } })).toMatch(/^익절\. \+5,300/);
  });
  it('값 색은 설정을 따른다', () => {
    const c = FT_STEPS.find((s) => s.id === 'color')!;
    expect(c.line(base)).toContain('오르면 빨강');
    expect(c.line({ ...base, pc: 'intl' })).toContain('오르면 초록');
  });
});

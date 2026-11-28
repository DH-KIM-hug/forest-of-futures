// 라이트 모드의 만화 데이터와 대사(LITE_CONTI.md): 숫자는 엔진 값, 화면 글에 가운데점이 없고, 엄마 · 쳇바퀴 이야기가 새지 않는다.
import { describe, it, expect } from 'vitest';
import { introPanels, rebirthPanels, temptPanels, despairPanel } from '../../src/ui/proto/lite/manga';
import { LITE_STORY } from '../../src/ui/proto/lite/liteText';
import { clockCaption, PRAY_ROE, LEV_CUT_OVER } from '../../src/ui/proto/lite/MangaCut';
import { liqPctAt } from '../../src/ui/proto/lite/LeverageNote';
import { protoSaveKey } from '../../src/ui/proto/protoSave';
import { lenderById } from '../../src/engine/data';
import { LITE } from '../../src/engine/lite';

const textsOf = (ps: ReturnType<typeof introPanels>) => ps.flatMap((p) => [...p.balloons.map((b) => b.text), ...(p.sfx ?? []).map((s) => s.text), p.card ?? '', ...(p.spread ? [p.spread.left, p.spread.right, ...p.spread.nar, p.spread.sub] : [])]);

describe('라이트 도입 만화', () => {
  const ps = introPanels();
  it('콘티 순서: 절망의 표지 → 사흘 전 → 장부 → 쳇바퀴 → 유혹 셋 → 공책 둘 → 꿈 → FRX', () => {
    expect(ps.map((p) => p.id)).toEqual(['x', 'flash', 'm2', 'm3', 't1', 't2', 't3', 'n0', 'n1', 'm6', 'm7']);
    expect(ps[1].card).toBe('사흘 전');
    expect(ps[0].spread?.sub).toBe('제1화 기도');
  });
  it('숫자는 엔진 값: 코인 빚 30만과 이자, 첫 대출과 그 이자', () => {
    const all = textsOf(ps).join('\n');
    const per = Math.ceil(LITE.start.debts.shark1 * LITE.start.rateCap.shark1);
    expect(all).toContain(`정산마다 이자 ${per.toLocaleString('ko-KR')}`);
    const unit = lenderById.shark1.borrowUnit!;
    expect(all).toContain(`빌린 돈 +${unit.toLocaleString('ko-KR')}`);
    expect(all).toContain(`+${Math.ceil(unit * lenderById.shark1.rate).toLocaleString('ko-KR')}`);
  });
  it('풍선은 그림 안에 있다', () => {
    for (const p of ps) for (const b of p.balloons) {
      expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= 100 && b.y + b.h <= 100, `${p.id} ${b.text}`).toBe(true);
    }
  });
  it('화면 글에 가운데점이 없고, 엄마 이야기가 없다', () => {
    const all = [...textsOf(ps), ...textsOf(rebirthPanels()), ...textsOf(temptPanels({ lender: 'capital', unit: 50_000, got: 50_000, perSettle: 335, ratePct: 0.67 })), ...textsOf(temptPanels({ lender: 'shark2', unit: 100_000, got: 90_000, perSettle: 2_700, ratePct: 2.7 }))];
    for (const t of all) { expect(t).not.toMatch(/·/); expect(t).not.toMatch(/엄마|어머님/); }
  });
  it('200배의 청산 거리는 엔진 식으로 0.4%', () => {
    expect(liqPctAt(200)).toBeCloseTo(0.4, 6);
  });
});

describe('라이트 대사와 컷', () => {
  it('쳇바퀴 · 알바 · 엄마 장면은 줄이 없다(장면이 뜨지 않는다)', () => {
    expect(LITE_STORY.hamsterHint!(1000, {} as never)).toEqual([]);
    expect(LITE_STORY.momClue!('frame')).toEqual([]);
    expect(LITE_STORY.reborn!()).toEqual([]);
  });
  it('완납 장면은 추심원의 「완납입니다.」', () => {
    expect(LITE_STORY.clear!().map((l) => l.text)).toContain('완납입니다.');
  });
  it('파산 표지는 진짜 숫자를 해설 칸에 싣는다', () => {
    const p = despairPanel({ sub: '제2화 파산', nar: ['빌린 돈 512,300', '남은 돈 0'] });
    expect(p.spread?.nar).toEqual(['빌린 돈 512,300', '남은 돈 0']);
  });
  it('기도 컷의 날짜는 기기 시계의 말로', () => {
    expect(clockCaption(new Date(2026, 10, 28, 3, 10))).toBe('2026년 11월 28일 새벽 3시');
    expect(clockCaption(new Date(2026, 10, 28, 15, 0))).toBe('2026년 11월 28일 오후 3시');
    expect(PRAY_ROE).toBe(-50);
    expect(LEV_CUT_OVER).toBe(50);
  });
  it('라이트는 저장을 따로 둔다', () => {
    expect(protoSaveKey('?proto=1&lite=1')).not.toBe(protoSaveKey('?proto=1'));
    expect(protoSaveKey('?proto=1&lite=1')).toMatch(/:lite$/);
  });
});

// 라이트 모드의 만화 데이터와 대사(LITE_CONTI.md): 숫자는 엔진 값, 화면 글에 가운데점이 없고, 엄마 · 쳇바퀴 이야기가 새지 않는다.
import { describe, it, expect } from 'vitest';
import { prologuePages, rebirthPanels, temptPanels, despairPanel } from '../../src/ui/proto/lite/manga';
import { LITE_STORY } from '../../src/ui/proto/lite/liteText';
import { clockCaption, PRAY_ROE, LEV_CUT_OVER } from '../../src/ui/proto/lite/MangaCut';
import { liqPctAt } from '../../src/ui/proto/lite/LeverageNote';
import { protoSaveKey } from '../../src/ui/proto/protoSave';
import { lenderById } from '../../src/engine/data';
import { LITE } from '../../src/engine/lite';

const textsOf = (ps: ReturnType<typeof prologuePages>) => ps.flatMap((p) => [...p.balloons.map((b) => b.text), ...(p.sfx ?? []).map((s) => s.text), p.card ?? '', ...(p.words ?? []).map((w) => w.t), ...(p.twist ? [p.twist.beat, p.twist.stamp, ...p.twist.lines] : [])]);

describe('라이트 도입 만화(패러디 일곱 쪽)', () => {
  const ps = prologuePages();
  it('쪽 순서: 6 기도 → 1 청산 직전 → 2 청산 → 7 절망의 표제지 → 5 대부의 유혹 → 4 배율 공책 → 3 다짐', () => {
    expect(ps.map((p) => p.id)).toEqual(['p6', 'p1', 'p2', 'x', 'p5', 'p4', 'p3']);
    expect(ps[0].words?.some((w) => w.t === '어느 날')).toBe(true);
    expect(ps[3].words?.find((w) => w.k === 'logo')?.t).toBe('제1화 기도');
    for (const p of ps) { expect(p.src).toBeTruthy(); expect(p.ar).toBeGreaterThan(0); }
  });
  it('숫자는 엔진 값: 코인 빚 30만, 첫 대출과 그 이자, 시작 잔액, 빚 전부', () => {
    const all = textsOf(ps).join('\n');
    const coin = LITE.start.debts.shark1, unit = lenderById.shark1.borrowUnit!;
    expect(all).toContain(`${coin / 10000}만쯤이야!!`);
    expect(all).toContain(`빌린 돈 +${unit.toLocaleString('ko-KR')}`);
    expect(all).toContain(`이자 +${Math.ceil(unit * lenderById.shark1.rate).toLocaleString('ko-KR')}`);
    expect(all).toContain(`${unit.toLocaleString('ko-KR')} 도토리`);
    expect(all).toContain(`빚 ${(coin + unit).toLocaleString('ko-KR')}`);
  });
  it('다짐 쪽은 승리가 아니다(WIN 상자 없음)', () => {
    const t = textsOf([ps[6]]).join('\n');
    expect(t).not.toMatch(/WIN|이익확정/);
    expect(t).toContain('반드시');
  });
  it('글은 그림 안에 있다', () => {
    for (const p of ps) for (const w of p.words ?? []) {
      expect(w.x >= 0 && w.y >= 0 && w.x + w.w <= 100.01 && w.y + w.h <= 100.01, `${p.id} ${w.t}`).toBe(true);
    }
  });
  it('화면 글에 가운데점이 없고, 엄마 이야기와 일본어가 없다', () => {
    const all = [...textsOf(ps), ...textsOf(rebirthPanels()), ...textsOf(temptPanels({ lender: 'capital', unit: 50_000, got: 50_000, perSettle: 335, ratePct: 0.67 })), ...textsOf(temptPanels({ lender: 'shark2', unit: 100_000, got: 90_000, perSettle: 2_700, ratePct: 2.7 }))];
    for (const t of all) { expect(t).not.toMatch(/·/); expect(t).not.toMatch(/엄마|어머님/); expect(t).not.toMatch(/[\u3040-\u30ff円]/); }
  });
  it('5쪽의 「빌렸다」는 그림 위 글이 아니라 넘길 때 뜨는 반전 카드(엔진 숫자)', () => {
    const p5 = ps.find((p) => p.id === 'p5')!;
    const unit = lenderById.shark1.borrowUnit!;
    expect(p5.words?.some((w) => /빌렸다/.test(w.t))).toBe(false);
    expect(p5.twist?.stamp).toBe('빌렸다.');
    expect(p5.twist?.lines).toEqual([`빌린 돈 +${unit.toLocaleString('ko-KR')}`, `정산마다 이자 +${Math.ceil(unit * lenderById.shark1.rate).toLocaleString('ko-KR')}`]);
    expect(ps.filter((p) => p.twist).map((p) => p.id)).toEqual(['p5']);
  });
  it('한글은 세로쓰기를 하지 않고(세로 표지 띠 없음), 마침표는 한국식', () => {
    const all = textsOf(ps).join('\n') + textsOf([despairPanel({ sub: '제2화 파산', nar: ['a', 'b'] })]).join('\n');
    expect(all).not.toMatch(/。/);
    expect(all).not.toContain('어리바리 다람쥐의');
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
    const t = (p.words ?? []).map((w) => w.t);
    expect(t).toContain('빌린 돈 512,300');
    expect(t).toContain('남은 돈 0');
    expect(t).toContain('제2화 파산');
    expect(t).not.toContain('신연재!!!');
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

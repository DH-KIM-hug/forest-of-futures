// U-65 추심원 줄(사용자 결정 「두 군데 하면 추심원 두 명, 세 군데 빌리면 추심원 세 명」, 「까마귀 사장과 독사 추심원」)
// 소개가 곧 봐주기(「그다음에 바로 연체하면 끝」): 손에 0이면 캐피탈, 까마귀, 그다음 정산에 파산
import { describe, expect, it } from 'vitest';
import { createLiteGame, liteAfterLoan } from '../../src/engine/lite';
import { act } from '../../src/engine/actions';
import { settle } from '../../src/engine/settlement';
import { COLLECTOR_OF, doorLine, owedLenders } from '../../src/ui/proto/lite/Collectors';
import { LITE_STORY } from '../../src/ui/proto/lite/liteText';
import endings from '../../data/endings_lite.json';

const fresh = () => { const g = createLiteGame({ seed: 7 }); liteAfterLoan(g); return g; };

describe('추심원 수 = 빚진 돈줄 수', () => {
  it('오소리만 → 하나, 캐피탈을 빌리면 둘, 소개로 까마귀까지 → 셋, 다 갚으면 빠진다', () => {
    const g = fresh();
    expect(owedLenders(g)).toEqual(['shark1']);
    act(g, { type: 'borrow', lender: 'capital' });
    expect(owedLenders(g)).toEqual(['shark1', 'capital']);
    g.run.cash = 3200; // 오소리만 낸다: 생활비는 캐피탈이, 캐피탈 이자는 까마귀가
    settle(g);
    expect(owedLenders(g)).toEqual(['shark1', 'capital', 'shark2']);
    g.run.debts.capital.principal = 0;
    expect(owedLenders(g)).toEqual(['shark1', 'shark2']);
  });
  it('까마귀의 추심원은 독사, 문 앞 한 줄은 제 몫의 이자', () => {
    expect(COLLECTOR_OF.shark2.name).toBe('독사 추심원');
    expect(doorLine('shark1', 3200, 1000)).toBe('이자 3,200, 생활비 1,000 받아 갑니다.');
    expect(doorLine('capital', 1500)).toBe('1,500 자동이체 됐어요 ♥');
    expect(doorLine('shark2', 200)).toBe('200. 사장님이 반짝이는 걸 기다리세요.');
    for (const id of ['shark1', 'capital', 'shark2'] as const) expect(doorLine(id, 1234, 1000)).not.toMatch(/·/);
  });
  it('캐피탈이 까마귀를 소개하는 장면에 독사 추심원이 한 줄', () => {
    const lines = LITE_STORY.refer!({ from: 'capital', to: 'shark2', paid: 1500, signed: 2500, first: true });
    expect(lines.map((l) => l.who)).toEqual(['raccoon', 'viper', 'snake', 'note']);
  });
});

describe('독사가 나오는 엔딩은 까마귀 빚 쪽', () => {
  it('cast 에 snake 가 있는 엔딩 6개는 lender:crow 로 기운다', () => {
    const snake = (endings as unknown as { endings: { cast: string[]; w: Record<string, number> }[] }).endings.filter((e) => e.cast.includes('snake'));
    expect(snake.length).toBe(6);
    for (const e of snake) { expect(e.w['lender:crow']).toBeGreaterThan(0); expect(e.w['lender:shark2']).toBeUndefined(); }
  });
});

describe('소개가 곧 봐주기', () => {
  it('손에 0: 1분 캐피탈, 2분 까마귀, 3분 파산', () => {
    const g = fresh();
    g.run.cash = 0;
    settle(g); expect(g.run.over).toBe(false);
    settle(g); expect(g.run.over).toBe(false); expect(g.run.debts.shark2.principal).toBeGreaterThan(0);
    settle(g); expect(g.run.over).toBe(true);
  });
});

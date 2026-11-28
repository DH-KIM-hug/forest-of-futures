// U-65 FRX 회원 등급(사용자 결정 「예탁금과 거래액으로 종합 판단」)과 의뢰 사례금(「의뢰로는 돈을 좀 받을까」)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as frx from '../../src/ui/proto/frxRank';
import { barOf, bigWord, depositOf, goalShort, goalText, rankName, rankOf, rankOfRun, tierBy, volumeOf, whyOf, whyText, RANK_BARS } from '../../src/ui/proto/frxRank';
import { applyClose, newBoard, questById, QUESTS, GUST_QUEST, stakeMin, tipOf, type CloseInfo } from '../../src/ui/proto/quests';
import { QUEST_TIP, questTip, tipRoom } from '../../src/engine/questTip';
import { bare, openFutures } from '../engine/helpers';
import { act } from '../../src/engine/actions';
import { pack, pickProto, unpack } from '../../src/ui/proto/protoSave';
import type { GameState } from '../../src/engine/types';

function game(cash = 100_000): GameState {
  const g = bare();
  openFutures(g);
  g.run.cash = cash;
  return g;
}

describe('등급 문턱', () => {
  it('단골 1천만 또는 20만, 큰손 1억 또는 50만, 고래 10억 또는 200만, 숲의 고래 100억 또는 1천만, 전설 1천억 또는 1억, 그 뒤로 두 배씩', () => {
    expect(RANK_BARS.slice(1)).toEqual([
      { vol: 1e7, dep: 2e5 }, { vol: 1e8, dep: 5e5 }, { vol: 1e9, dep: 2e6 }, { vol: 1e10, dep: 1e7 }, { vol: 1e11, dep: 1e8 },
    ]);
    expect(barOf(6)).toEqual({ vol: 2e11, dep: 2e8 });
    expect(barOf(7)).toEqual({ vol: 4e11, dep: 4e8 });
    expect([0, 1, 5, 6, 7].map(rankName)).toEqual(['새싹', '단골', '전설', '전설 2', '전설 3']);
  });
  it('예탁금만으로', () => {
    expect(tierBy(199_999, 0)).toBe(0);
    expect(tierBy(200_000, 0)).toBe(1);
    expect(tierBy(2_000_000, 0)).toBe(3);
    expect(tierBy(1e8, 0)).toBe(5);
  });
  it('거래액만으로', () => {
    expect(tierBy(0, 9_999_999)).toBe(0);
    expect(tierBy(0, 1e7)).toBe(1);
    expect(tierBy(0, 1e9)).toBe(3);
    expect(tierBy(0, 4e11)).toBe(7);
  });
  it('둘 중 하나만 넘어도 된다: 높은 쪽으로', () => {
    expect(tierBy(500_000, 1e9)).toBe(3); // 거래액이 더 높다
    expect(tierBy(1e7, 1e8)).toBe(4); // 예탁금이 더 높다
    expect(rankOf(100_000, 5e6).r).toBe(0);
  });
  it('이번 생에 오른 등급은 지킨다(예탁금이 줄어도)', () => {
    expect(rankOf(0, 0, 3).r).toBe(3);
    expect(rankOf(0, 0, 3).next).toBe('숲의 고래');
    expect(rankOf(2e7, 0, 1).r).toBe(4);
  });
  it('까닭: 거래액이 넘었으면 거래액, 아니면 예탁금', () => {
    expect(whyText(whyOf(1, 0, 1e7))).toBe('거래액 1천만 돌파');
    expect(whyText(whyOf(1, 200_000, 0))).toBe('예탁금 20만 돌파');
    expect(whyText(whyOf(3, 2e6, 1e9))).toBe('거래액 10억 돌파');
    expect(whyText(whyOf(5, 0, 1e11))).toBe('거래액 1천억 돌파');
    expect(['2천억', '200만', '1억', '1조', '50만'].join()).toBe([bigWord(2e11), bigWord(2e6), bigWord(1e8), bigWord(1e12), bigWord(5e5)].join());
  });
});

describe('다음 목표의 말', () => {
  it('둘 다: 「단골까지 거래액 6,200,000 더, 또는 예탁금 80,000 더」', () => {
    const k = rankOf(120_000, 3_800_000);
    expect(goalText(k)).toBe('단골까지 거래액 6,200,000 더, 또는 예탁금 80,000 더');
  });
  it('짧게: 더 가까운 쪽 하나', () => {
    expect(goalShort(rankOf(120_000, 3_800_000))).toBe('단골까지 예탁금 8만'); // 60% 대 38%
    expect(goalShort(rankOf(100_000, 9_000_000))).toBe('단골까지 거래액 100만');
    expect(goalShort(rankOf(0, 0, 2))).toBe('고래까지 거래액 10억');
  });
  it('가운데점이 없다', () => {
    expect(goalText(rankOf(120_000, 3_800_000))).not.toContain('·');
  });
});

describe('예탁금과 거래액의 셈', () => {
  it('예탁금 = 손의 돈 + 열린 포지션의 증거금. 빚은 빼지 않는다', () => {
    const g = game(150_000);
    g.run.debts.shark1.principal = 900_000;
    expect(depositOf(g.run)).toBe(150_000);
    const r = act(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 25_000 });
    expect(r.ok).toBe(true);
    const p = g.run.positions.DTC;
    expect(depositOf(g.run)).toBe(Math.floor(g.run.cash + p.margin));
  });
  it('거래액 = 진입과 추가 진입의 증거금 × 배율 합(25,000 × 200 = 500만)', () => {
    const g = game(150_000);
    expect(volumeOf(g.run)).toBe(0);
    act(g, { type: 'open', market: 'DTC', dir: 1, lev: 200, margin: 25_000 });
    expect(volumeOf(g.run)).toBe(5_000_000);
    act(g, { type: 'add', market: 'DTC', margin: 25_000 });
    expect(volumeOf(g.run)).toBe(10_000_000);
    act(g, { type: 'close', market: 'DTC' });
    expect(volumeOf(g.run)).toBe(10_000_000); // 닫는 쪽은 넣지 않는다
    expect(rankOfRun(g.run).r).toBe(1); // 200배 두 번이면 단골
  });
});

describe('도장은 없다', () => {
  it('등급 모듈에 도장 셈이 없다', () => {
    expect('stampsFor' in frx).toBe(false);
    expect('stampsOf' in frx).toBe(false);
  });
  it('의뢰는 도장 대신 사례금(난이도)을 갖는다', () => {
    for (const q of [...QUESTS, GUST_QUEST]) {
      expect('reward' in q).toBe(false);
      expect([1, 2, 3]).toContain(q.tip);
    }
  });
  it('화면 글에 거래 도장이 없다', () => {
    for (const f of ['ForestBoard.tsx', 'forestWatch.ts', 'Trade.tsx', 'watch.ts', 'quests.ts', 'dev.ts', 'protoStore.ts']) {
      const src = readFileSync(new URL(`../../src/ui/proto/${f}`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/도장 \+|거래 도장 \$|frxStamps|stampsOf|stampsFor/);
    }
  });
  it('옛 저장의 도장은 버리고, 등급은 그 생의 예탁금과 거래액으로 다시 셈한다', () => {
    const g = game(300_000);
    const raw = pack({ g, p: pickProto({ tutorial: 'done' }), trade: null, feed: { kind: 'sim', n: g.run.lastSeenTick, mids: {} }, now: 1 });
    const old = JSON.parse(raw);
    old.p.frxStamps = 40;
    const u = unpack(JSON.stringify(old));
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect('frxStamps' in u.env.p).toBe(false);
    expect(u.env.p.frxBest).toBe(1); // 예탁금 30만
  });
});

const C = (o: Partial<CloseInfo>): CloseInfo => ({ market: 'DTC', dir: 1, lev: 200, pnl: 100, roe: 5, heldSec: 40, kind: 'close', claim: 5000, fly: false, margin: 25_000, ...o });
describe('의뢰 사례금', () => {
  it('다음 수금 × 난이도(500 단위): 쉬운 의뢰 5,000, 어려운 의뢰 15,000, 돌풍도 15,000', () => {
    expect(tipOf(questById.five, 5000)).toBe(5000);
    expect(tipOf(questById.short, 5000)).toBe(10_000);
    expect(tipOf(questById.double, 5000)).toBe(15_000);
    expect(tipOf(GUST_QUEST, 5000)).toBe(15_000);
    expect(tipOf(questById.double, 1e6)).toBe(QUEST_TIP.max);
    expect(tipOf(questById.five, 0)).toBe(1000);
  });
  it('판돈이 다음 수금의 절반에 못 미치는 판은 세지 않는다(1배 작은 판 쌓기 막기)', () => {
    expect(stakeMin(5000)).toBe(2500);
    const b = { ...newBoard(3, 200), slots: [{ id: 'five', prog: 4 }, { id: 'sl', prog: 0 }, { id: 'short', prog: 0 }] };
    const tiny = applyClose(b, C({ margin: 1000, lev: 1 }), 200);
    expect(tiny.finished).toEqual([]);
    expect(tiny.board).toBe(b);
    const ok = applyClose(b, C({ margin: 2500 }), 200);
    expect(ok.finished).toEqual(['five']);
    expect(ok.tips).toEqual([{ id: 'five', amount: 5000 }]);
  });
  it('엔진: 손에 든 돈으로, 한 번 3만, 한 생 15만까지', () => {
    const g = game(10_000);
    expect(questTip(g, 5000, '족제비 상인').ok).toBe(true);
    expect(g.run.cash).toBe(15_000);
    expect(act(g, { type: 'questTip', amount: 99_999 }).amount).toBe(30_000);
    for (let i = 0; i < 10; i++) act(g, { type: 'questTip', amount: 30_000 });
    expect(g.run.stats.questTip).toBe(QUEST_TIP.lifeMax);
    expect(tipRoom(g)).toBe(0);
    expect(act(g, { type: 'questTip', amount: 5000 }).ok).toBe(false);
    expect(g.run.cash).toBe(10_000 + QUEST_TIP.lifeMax);
  });
});

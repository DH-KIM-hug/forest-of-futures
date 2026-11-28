// U-68 라이트 첫 경험 줄이기: 처음에는 날다람쥐코인 하나. 판을 닫을 때마다 종목, 도토리일보, 의뢰가 열린다.
// 센 판 수는 이 기기에 남고(생을 넘어), 길잡이 판은 세지 않는다. FRX 첫 실전 카드는 없다.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LITE_LADDER, LITE_UNLOCK_KEY, LITE_ALL_OPEN, featureOpen, marketOpen, newlyOpened, lockedHint, unlockStamp,
  useLiteUnlock, liteTradeClosed, liteUnlockBoot, liteTrades, shiftStamp,
} from '../../src/ui/proto/lite/liteUnlock';
import { FT_STEPS } from '../../src/ui/proto/lite/flyTutSteps';

const ALL = ['FLY', 'DTC', 'BTH', 'MDT', 'SMS', 'JQQ'];
const open = (n: number) => ALL.filter((id) => marketOpen(id, n));

describe('여는 차례', () => {
  it('0판: 날다람쥐코인만. 도토리일보도 의뢰도 닫혀 있다', () => {
    expect(open(0)).toEqual(['FLY']);
    expect(featureOpen('news', 0)).toBe(false);
    expect(featureOpen('quests', 0)).toBe(false);
  });
  it('1판: 도토코인, 밤더리움, 멍도토 + 도토리일보. 의뢰는 아직', () => {
    expect(open(1)).toEqual(['FLY', 'DTC', 'BTH', 'MDT']);
    expect(featureOpen('news', 1)).toBe(true);
    expect(featureOpen('quests', 2)).toBe(false);
  });
  it('3판: 의뢰. 5판: 삼솔전자, 잣스닥', () => {
    expect(featureOpen('quests', 3)).toBe(true);
    expect(open(4)).not.toContain('SMS');
    expect(open(5)).toEqual(ALL);
    expect(LITE_ALL_OPEN).toBe(5);
  });
  it('무엇이 언제 새로 열리나(한 판씩 늘 때만, 같은 판의 둘은 적힌 순서)', () => {
    expect(newlyOpened(0, 1).map((s) => s.id)).toEqual(['coins1', 'news']);
    expect(newlyOpened(1, 2)).toEqual([]);
    expect(newlyOpened(2, 3).map((s) => s.id)).toEqual(['quests']);
    expect(newlyOpened(4, 5).map((s) => s.id)).toEqual(['coins2']);
    expect(newlyOpened(5, 6)).toEqual([]);
  });
  it('잠긴 칩의 한 줄과 열림 도장은 짧고 가운데점이 없다', () => {
    expect(lockedHint('DTC', 0)).toBe('한 판만 더 끝내면 열려요.');
    expect(lockedHint('SMS', 1)).toBe('4판 더 끝내면 열려요.');
    const nm = (id: string) => ({ DTC: '도토코인', BTH: '밤더리움', MDT: '멍도토', SMS: '삼솔전자', JQQ: '잣스닥' } as Record<string, string>)[id] ?? id;
    expect(unlockStamp(LITE_LADDER[0], nm).big).toBe('도토코인, 밤더리움, 멍도토 열림!');
    for (const s of LITE_LADDER) { const t = unlockStamp(s, nm); expect(t.big.length).toBeLessThanOrEqual(24); expect(t.big + t.small).not.toContain('·'); }
  });
});

/** 시험용 저장소(node 에는 localStorage 가 없다) */
function memStorage(): Storage {
  const m = new Map<string, string>();
  return { get length() { return m.size; }, clear: () => m.clear(), getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null };
}
const G = globalThis as unknown as { window?: { localStorage: Storage }; localStorage?: Storage };

describe('판 세기와 저장(이 기기 전체)', () => {
  beforeEach(() => { const st = memStorage(); G.localStorage = st; G.window = { localStorage: st }; localStorage.clear(); useLiteUnlock.setState({ trades: null, queue: [] }); });
  it('길잡이 판은 세지 않는다. 판을 닫으면 저장에 남고, 새로 열린 것은 도장 차례에 들어간다', () => {
    liteUnlockBoot({ life: 1, closes: 0 });
    expect(liteTrades()).toBe(0);
    expect(liteTradeClosed({ tutorial: true })).toEqual([]);
    expect(liteTrades()).toBe(0);
    expect(liteTradeClosed({ tutorial: false }).map((s) => s.id)).toEqual(['coins1', 'news']);
    expect(JSON.parse(localStorage.getItem(LITE_UNLOCK_KEY)!)).toEqual({ trades: 1 });
    expect(useLiteUnlock.getState().queue.map((s) => s.id)).toEqual(['coins1', 'news']);
    shiftStamp();
    expect(useLiteUnlock.getState().queue.map((s) => s.id)).toEqual(['news']);
  });
  it('다시 태어나도 다시 잠기지 않는다: 기록이 있으면 시작할 때 손대지 않는다', () => {
    localStorage.setItem(LITE_UNLOCK_KEY, JSON.stringify({ trades: 3 }));
    useLiteUnlock.setState({ trades: 3 });
    liteUnlockBoot({ life: 2, closes: 0 });
    expect(liteTrades()).toBe(3);
  });
  it('기록이 없는 옛 기기: 두 번째 생 이상이면 다 열고, 첫 생이면 이번 생에 닫은 판만큼(도장은 없이)', () => {
    liteUnlockBoot({ life: 2, closes: 0 });
    expect(liteTrades()).toBe(LITE_ALL_OPEN);
    useLiteUnlock.setState({ trades: null, queue: [] });
    liteUnlockBoot({ life: 1, closes: 2 });
    expect(liteTrades()).toBe(2);
    expect(useLiteUnlock.getState().queue).toEqual([]);
  });
  it('&new=1 이 지우는 fof.* 아래에 있다', () => {
    expect(LITE_UNLOCK_KEY.startsWith('fof.')).toBe(true);
    expect(readFileSync('index.html', 'utf8')).toContain("k.indexOf('fof.') === 0");
  });
});

describe('화면이 잠긴 것을 보이지 않는다(소스 검사)', () => {
  const trade = readFileSync('src/ui/proto/Trade.tsx', 'utf8');
  const hud = readFileSync('src/ui/proto/lite/LiteHud.tsx', 'utf8');
  const forest = readFileSync('src/ui/proto/forestWatch.ts', 'utf8');
  it('FRX 첫 실전 카드(오소리 대부 말풍선)는 없다', () => {
    expect(trade).not.toMatch(/data-first-go|className=\{'pt-first|이대로 맞추기/);
    expect(readFileSync('src/ui/proto/trade.css', 'utf8')).not.toContain('.pt-first');
    expect(FT_STEPS.some((s) => (s.target as string) === 'firstGo')).toBe(false);
  });
  it('길잡이의 출구 걸음은 손절과 익절 칸과 칩을 비춘다', () => {
    const ft = readFileSync('src/ui/proto/lite/FlyTutorial.tsx', 'utf8');
    expect(ft).toContain("cond: '.pt-condrow .pt-cond'");
    expect(ft).toContain('[data-ak="tp${FT_TP_K}"]');
    expect(ft).toContain('[data-ak="sl${FT_SL_K}"]');
  });
  it('잠긴 종목은 자물쇠 칩, 의뢰 줄은 열린 뒤에만, 도토리일보 링크도 열린 뒤에만', () => {
    expect(trade).toMatch(/if \(!lk\.coin\(t\.id\)\) return \(/);
    expect(trade).toContain('data-locked={t.id}');
    expect(trade).toContain('lk.quests && <ForestLine />');
    expect(trade).toMatch(/tutSt === 'done' && lk\.news\) dayNoteOpen\(true\)/);
    expect(forest).toContain("if (isLite && !featureOpen('quests', liteTrades())) return;");
  });
  it('머리: 전광판은 처음 다 갚기 전에는 칸이 없고, 도감은 엔딩을 본 뒤, 도토리일보는 첫 판 뒤', () => {
    expect(hud).toMatch(/\{rank && \(\s*<button data-hud-rank/);
    expect(hud).toMatch(/\{book && \(\s*<button data-hud-book/);
    expect(hud).toMatch(/\{news && \(\s*<button data-hud-news/);
    expect(hud).not.toContain("'locked'");
  });
});

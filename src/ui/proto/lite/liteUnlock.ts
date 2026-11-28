// 라이트 첫 경험 줄이기(U-68, 사용자: "처음에 너무 복잡하다", "처음엔 다른 코인들 닫혀 있고. 의뢰도 닫혀 있음. 도토리일보 닫혀 있고 전광판은 아예 칸이 안 보임").
// 처음에는 날다람쥐코인 하나만. 판을 닫을 때마다(길잡이 판은 빼고) 하나씩 열린다:
//   - 1판: 도토코인, 밤더리움, 멍도토 + 도토리일보(머리 아이콘, 시세 줄의 바람 › 링크)
//   - 3판: 의뢰(거래소의 의뢰 줄과 단타방 순위, 숲 게시판)
//   - 5판: 삼솔전자, 잣스닥
// 전광판은 처음 다 갚을 때까지 칸도 없다(rankUnlock.ts 가 그대로 정한다). 엔딩 도감은 엔딩을 하나라도 본 뒤에(family.liteBook).
// 센 판 수는 이 기기 전체에 남는다(생을 넘어, localStorage 'fof.lite.unlock.v1', &new=1 이면 fof.* 와 함께 지워진다).
// 장면 건너뛰기(&pdev)와 치트는 저장을 읽지도 쓰지도 않는다: 기본은 전부 열린 채, &punl=N 이면 N판 닫은 기기처럼(메모리에서만), &punlfx=1 이면 그 판에 막 닿은 도장까지.
// 이 파일은 게임 상태를 모른다: watch.ts 의 noteClose 가 판이 닫혔다고 알려 준다.
import { create } from 'zustand';

export const LITE_UNLOCK_KEY = 'fof.lite.unlock.v1';
export type LiteFeature = 'coins1' | 'news' | 'quests' | 'coins2';
export interface LiteStep { id: LiteFeature; trades: number; markets?: string[] }
/** 여는 차례. 같은 판 수에 둘이면 적힌 순서로 알린다 */
export const LITE_LADDER: LiteStep[] = [
  { id: 'coins1', trades: 1, markets: ['DTC', 'BTH', 'MDT'] },
  { id: 'news', trades: 1 },
  { id: 'quests', trades: 3 },
  { id: 'coins2', trades: 5, markets: ['SMS', 'JQQ'] },
];
/** 처음부터 열린 종목 */
export const LITE_FIRST_MARKET = 'FLY';
/** 다 열리는 판 수 */
export const LITE_ALL_OPEN = Math.max(...LITE_LADDER.map((s) => s.trades));

export const featureOpen = (f: LiteFeature, trades: number): boolean => trades >= (LITE_LADDER.find((s) => s.id === f)?.trades ?? 0);
/** 그 종목이 열렸나. 사다리에 없는 종목(날다람쥐코인, 새로 생긴 종목)은 늘 열려 있다 */
export function marketOpen(id: string, trades: number): boolean {
  const st = LITE_LADDER.find((s) => s.markets?.includes(id));
  return !st || trades >= st.trades;
}
/** 판 수가 before 에서 after 로 늘 때 새로 열리는 것 */
export const newlyOpened = (before: number, after: number): LiteStep[] => LITE_LADDER.filter((s) => before < s.trades && after >= s.trades);
/** 잠긴 종목 칩을 누르면 뜨는 한 줄: 몇 판 더 닫으면 열리나 */
export function lockedHint(id: string, trades: number): string {
  const st = LITE_LADDER.find((s) => s.markets?.includes(id));
  const left = st ? Math.max(1, st.trades - trades) : 1;
  return left === 1 ? '한 판만 더 끝내면 열려요.' : `${left}판 더 끝내면 열려요.`;
}
/** 열릴 때 뜨는 도장 글(짧게) */
export const unlockStamp = (s: LiteStep, name: (id: string) => string): { big: string; small: string } =>
  s.id === 'news' ? { big: '도토리일보 도착!', small: '오늘 숲 소식은 머리의 신문에서' }
    : s.id === 'quests' ? { big: '의뢰 열림!', small: '숲 손님들이 일을 맡겨요' }
      : { big: `${s.markets!.map(name).join(', ')} 열림!`, small: '위 종목 줄에서 골라요' };

const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const memOnly = !!q.get('pdev') || q.get('cheat') === '1';

interface Rec { trades: number }
function readRec(): Rec | null {
  if (memOnly) { const n = q.get('punl'); return { trades: n !== null && n !== '' && Number.isFinite(+n) ? Math.max(0, +n) : 99 }; }
  try {
    const s = window.localStorage.getItem(LITE_UNLOCK_KEY);
    if (!s) return null;
    const x = JSON.parse(s);
    return x && typeof x.trades === 'number' ? { trades: Math.max(0, Math.floor(x.trades)) } : null;
  } catch { return null; }
}
function writeRec(r: Rec): void {
  if (memOnly) return;
  try { window.localStorage.setItem(LITE_UNLOCK_KEY, JSON.stringify(r)); } catch { /* 저장이 막혀도 이번 판은 열린다 */ }
}

interface UnlockUi {
  /** 이 기기에서 닫은 판 수(길잡이 판은 빼고). null = 아직 기록이 없다(liteUnlockBoot 가 정한다) */
  trades: number | null;
  /** 띄울 차례를 기다리는 열림 도장 */
  queue: LiteStep[];
}
const t0 = typeof window !== 'undefined' ? readRec()?.trades ?? null : null;
/** 확인용 &punlfx=1: 방금 그 판 수에 닿은 것처럼 열림 도장을 띄운다(&pdev 와 함께) */
const q0 = memOnly && q.get('punlfx') === '1' && t0 !== null ? newlyOpened(t0 - 1, t0) : [];
export const useLiteUnlock = create<UnlockUi>(() => ({ trades: t0, queue: q0 }));
/** 지금 센 판 수(기록이 없으면 0) */
export const liteTrades = (): number => useLiteUnlock.getState().trades ?? 0;

/** 시작할 때 한 번: 기록이 없는 기기인데 이미 놀던 저장(두 번째 생 이상, 이번 생에 닫은 판)이 있으면 조용히 그만큼 열어 둔다 */
export function liteUnlockBoot(o: { life: number; closes: number }): void {
  if (useLiteUnlock.getState().trades !== null) return;
  const trades = o.life > 1 ? LITE_ALL_OPEN : Math.max(0, o.closes);
  writeRec({ trades });
  useLiteUnlock.setState({ trades });
}

/** 판 하나가 닫혔다(watch.ts noteClose). 길잡이 판이면 세지 않는다. 새로 열린 것은 도장 차례에 넣는다 */
export function liteTradeClosed(o: { tutorial: boolean }): LiteStep[] {
  if (o.tutorial) return [];
  const before = liteTrades();
  const after = before + 1;
  writeRec({ trades: after });
  const fresh = newlyOpened(before, after);
  useLiteUnlock.setState((s) => ({ trades: after, queue: [...s.queue, ...fresh] }));
  return fresh;
}
/** 도장 하나를 띄웠다 */
export const shiftStamp = (): void => useLiteUnlock.setState((s) => ({ queue: s.queue.slice(1) }));

/** 화면이 쓰는 묶음 */
export function useLiteOpen(on: boolean): { trades: number; coin: (id: string) => boolean; news: boolean; quests: boolean } {
  const t = useLiteUnlock((s) => s.trades ?? 0);
  if (!on) return { trades: LITE_ALL_OPEN, coin: () => true, news: true, quests: true };
  return { trades: t, coin: (id) => marketOpen(id, t), news: featureOpen('news', t), quests: featureOpen('quests', t) };
}

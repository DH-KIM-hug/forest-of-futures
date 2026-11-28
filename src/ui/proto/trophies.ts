// 트로피 장(U-56, 회차 15): 생을 넘어 남는 수집. 의뢰마다 기념품 하나, 그리고 단타방에서 생긴 일 몇 가지.
// 돈, 수수료, 확률은 그대로(꾸밈뿐). 브라우저 저장(fof.trophies)에 생과 상관없이 남는다. 읽고 쓰기가 막혀도 게임은 그대로 간다.
import { QUESTS, GUST_QUEST } from './quests';
import type { Who } from './protoStore';

export interface TrophyDef { id: string; name: string; how: string; who: Who }
export const EXTRA_TROPHIES: TrophyDef[] = [
  { id: 'rival_top', name: '단타방 1위 현수막', how: '단타방 1위 하기', who: 'boss' },
  { id: 'rival_opp', name: '반대편의 눈물', how: '같은 종목 반대편에 든 라이벌이 지고, 나는 이긴 판', who: 'viper' },
  { id: 'rival_bust', name: '너구리의 찢긴 장부', how: '창구 너구리가 파산하는 것을 보기', who: 'raccoon' },
];
export const TROPHIES: TrophyDef[] = [
  ...[...QUESTS, GUST_QUEST].map((q) => ({ id: 'q_' + q.id, name: q.trophy, how: `${q.name}의 의뢰: ${q.title}`, who: q.who })),
  ...EXTRA_TROPHIES,
];
export const trophyById: Record<string, TrophyDef> = Object.fromEntries(TROPHIES.map((t) => [t.id, t]));

export const TROPHY_KEY = 'fof.trophies';
export interface TrophyRec { gen: number; at: number }
export type TrophyBook = Record<string, TrophyRec>;

let mem: TrophyBook | null = null;
const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
/** 장면 건너뛰기와 치트 판은 남기지 않는다(진짜 수집만) */
const noWrite = (): boolean => !!q.get('pdev') || q.get('cheat') === '1';

export function loadTrophies(): TrophyBook {
  if (mem) return mem;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(TROPHY_KEY) : null;
    const x = raw ? JSON.parse(raw) : {};
    mem = x && typeof x === 'object' ? (x as TrophyBook) : {};
  } catch { mem = {}; }
  // 화면 확인용: &ptrophy=n → 앞에서부터 n개를 가진 것으로
  const n = +(q.get('ptrophy') ?? 0);
  if (n > 0) mem = { ...Object.fromEntries(TROPHIES.slice(0, n).map((t) => [t.id, { gen: 1, at: 0 }])), ...mem };
  return mem!;
}
/** 처음 얻으면 true */
export function earnTrophy(id: string, gen: number): boolean {
  const b = loadTrophies();
  if (!trophyById[id] || b[id]) return false;
  mem = { ...b, [id]: { gen, at: Date.now() } };
  if (!noWrite()) { try { localStorage.setItem(TROPHY_KEY, JSON.stringify(mem)); } catch { /* 막혀도 그대로 */ } }
  listeners.forEach((f) => f());
  return true;
}
const listeners = new Set<() => void>();
export function onTrophies(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }
/** 시험용 */
export function resetTrophyMemo(): void { mem = null; }

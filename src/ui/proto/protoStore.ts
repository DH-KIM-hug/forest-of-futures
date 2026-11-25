// 시제품 화면 상태(저장하지 않음). 게임 상태(엔진)는 store/gameStore 가 가진다.
import { create } from 'zustand';
import type { CardData } from './shareCard';

export type Tab = 'lot' | 'people' | 'upg' | 'phone' | 'map';
export interface Tip { coin: string; dir: 1 | -1; price: number; no: number }
export interface Collector { interest: number; fill: number; overdue: boolean; at: number }

/** 컷인에 나오는 사람(§7.7). hero = 주인공 속마음, sms = 폰 문자, note = 지문 */
export type Who = 'collector' | 'boss' | 'squirrel' | 'bear' | 'weasel' | 'raccoon' | 'hero' | 'sms' | 'note';
export interface Line { who: Who; text: string; mood?: 'smile' | 'flat' }
/** 컷인 한 장면: 줄을 탭으로 넘긴다. settle 이 있으면 정산 합계를 같이 보여 준다. unlock 은 끝날 때 열리는 탭. */
export interface Scene {
  id: string;
  lines: Line[];
  settle?: { net: number; interest: number; win: boolean; no: number };
  unlock?: Tab;
  /** 한 줄짜리 정산 컷인은 가만두면 사라진다(ms) */
  auto?: number;
}

/** 이번 생에서 이미 지나간 이야기 사건(다음 생에서는 다시 나오지 않는 것들) */
export const KNOWN_AFTER_FIRST_LIFE = ['sign', 'wheel', 'friend', 'upg', 'helperHint', 'bear', 'firstWin', 'firstLoss', 'sms', 'repay'];

interface P {
  tab: Tab;
  visited: Partial<Record<Tab, boolean>>;
  everUnlocked: Partial<Record<Tab, boolean>>;
  /** 곰 형을 만났다(인맥 탭에 카드가 생긴다) */
  bearMet: boolean;
  tip: Tip | null;
  goalIdx: number;
  everOpened: boolean;
  scenes: Scene[];
  seen: Record<string, boolean>;
  cutCount: number;
  /** 쳇바퀴를 산 정산 번호(단짝이 그다음 정산에 온다) */
  wheelAt: number | null;
  negSettles: number;
  toast: string | null;
  collector: Collector | null;
  tapping: boolean;
  wallet: boolean;
  tapUp: string | null;
  gen: number;
  profit: CardData | null;
  wins: number;
  closes: number;
  /** 프롤로그가 떠 있는 동안에는 게임 시계와 이야기 사건을 멈춘다 */
  prologue: boolean;
  /** 지도에서 강조할 장소(체크리스트에서 넘어왔을 때) */
  mapFocus: string | null;
  setTab: (t: Tab) => void;
  patch: (p: Partial<P>) => void;
  pushScene: (s: Scene) => void;
  resetLife: (gen: number, first: boolean) => void;
}

const fresh = () => ({
  tab: 'lot' as Tab, tip: null, goalIdx: 0, everOpened: false, scenes: [] as Scene[], cutCount: 0, wheelAt: null, negSettles: 0,
  toast: null, collector: null, tapping: false, wallet: false, tapUp: null, profit: null, wins: 0, closes: 0, mapFocus: null,
});

export const useProto = create<P>((set) => ({
  ...fresh(), visited: { lot: true }, everUnlocked: { lot: true }, bearMet: false, seen: {}, gen: 0, prologue: false,
  setTab: (tab) => set((s) => ({ tab, visited: { ...s.visited, [tab]: true } })),
  patch: (p) => set(p as any),
  pushScene: (sc) => set((s) => (s.seen[sc.id] || s.scenes.some((x) => x.id === sc.id) ? s : { scenes: [...s.scenes, sc] })),
  // 다음 생: 길과 사람은 이미 안다(탭은 열린 채로 시작). 계좌는 다시 열어야 한다.
  resetLife: (gen, first) => set(first
    ? { ...fresh(), visited: { lot: true }, everUnlocked: { lot: true }, bearMet: false, seen: {}, gen }
    : { ...fresh(), visited: { lot: true, people: true, upg: true, phone: true, map: true }, everUnlocked: { lot: true, people: true, upg: true, phone: true, map: true }, bearMet: true,
        seen: Object.fromEntries(KNOWN_AFTER_FIRST_LIFE.map((k) => [k, true])), gen }),
}));

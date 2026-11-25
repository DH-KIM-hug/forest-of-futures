// 시제품 화면 상태(저장하지 않음). 게임 상태(엔진)는 store/gameStore 가 가진다.
import { create } from 'zustand';
import type { CardData } from './shareCard';

export type Tab = 'lot' | 'people' | 'upg' | 'phone' | 'map';
export interface Tip { coin: string; dir: 1 | -1; price: number; no: number }
export interface Cutin { win: boolean; net: number; interest: number; no: number; full: boolean }
export interface Collector { interest: number; fill: number; overdue: boolean; at: number }

interface P {
  tab: Tab;
  visited: Partial<Record<Tab, boolean>>;
  everUnlocked: Partial<Record<Tab, boolean>>;
  mapBought: boolean;
  peopleBought: boolean;
  bearBought: boolean;
  tip: Tip | null;
  goalIdx: number;
  everOpened: boolean;
  cutin: Cutin | null;
  cutCount: number;
  toast: string | null;
  collector: Collector | null;
  tapping: boolean;
  wallet: boolean;
  tapUp: string | null;
  gen: number;
  profit: CardData | null;
  wins: number;
  closes: number;
  setTab: (t: Tab) => void;
  patch: (p: Partial<P>) => void;
  resetLife: (gen: number) => void;
}

export const useProto = create<P>((set) => ({
  tab: 'lot', visited: { lot: true }, everUnlocked: { lot: true }, mapBought: false, peopleBought: false, bearBought: false, tip: null, goalIdx: 0, everOpened: false,
  cutin: null, cutCount: 0, toast: null, collector: null, tapping: false, wallet: false, tapUp: null, gen: 0, profit: null, wins: 0, closes: 0,
  setTab: (tab) => set((s) => ({ tab, visited: { ...s.visited, [tab]: true } })),
  patch: (p) => set(p as any),
  resetLife: (gen) => set({ tab: 'lot', visited: { lot: true }, everUnlocked: { lot: true }, mapBought: false, peopleBought: false, bearBought: false, tip: null, goalIdx: 0, everOpened: false, cutin: null, collector: null, toast: null, wallet: false, tapUp: null, gen, profit: null, wins: 0, closes: 0 }),
}));

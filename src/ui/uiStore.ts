// 화면 상태(저장하지 않음): 열린 창구·패널·전체 화면. 게임 상태(엔진)는 store/gameStore 가 가진다.
import { create } from 'zustand';
import type { LenderId } from '../engine/types';

export type Sheet =
  | { k: 'lender'; id: LenderId }
  | { k: 'friends' }
  | { k: 'home' }
  | { k: 'work'; tab?: 'wallet' | 'equip' | 'upgrade' }
  | { k: 'visit' }
  | { k: 'futuresOpen' }
  | null;
export type Overlay = null | 'archive' | 'board' | 'tree' | 'away';

interface UI {
  sheet: Sheet;
  overlay: Overlay;
  seenVisit: string | null; // 닫은 제안(key)
  toast: string | null;
  shake: number;
  open: (s: Sheet) => void;
  close: () => void;
  setOverlay: (o: Overlay) => void;
  dismissVisit: (key: string) => void;
  say: (t: string | null) => void;
  doShake: () => void;
}

export const useUI = create<UI>((set) => ({
  sheet: null,
  overlay: null,
  seenVisit: null,
  toast: null,
  shake: 0,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
  setOverlay: (overlay) => set({ overlay }),
  dismissVisit: (key) => set({ seenVisit: key, sheet: null }),
  say: (toast) => set({ toast }),
  doShake: () => set((s) => ({ shake: s.shake + 1 })),
}));

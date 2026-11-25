// 화면 상태(저장하지 않음): 열린 창구·패널·전체 화면. 게임 상태(엔진)는 store/gameStore 가 가진다.
import { create } from 'zustand';
import type { LenderId } from '../engine/types';

const PKEY = 'fof.prologue.v2';
const seen = (): boolean => { try { return typeof localStorage !== 'undefined' && localStorage.getItem(PKEY) === '1'; } catch { return true; } };

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
  trade: { market: string; lev: number | null; pct: number; sl: number | null; tp: number | null };
  awayDismissed: number;
  awayAt: number;
  prologue: boolean;
  finishPrologue: () => void;
  open: (s: Sheet) => void;
  close: () => void;
  setOverlay: (o: Overlay) => void;
  dismissVisit: (key: string) => void;
  say: (t: string | null) => void;
  doShake: () => void;
  setTrade: (t: Partial<UI['trade']>) => void;
  dismissAway: () => void;
  markAway: (at: number) => void;
}

export const useUI = create<UI>((set) => ({
  sheet: null,
  overlay: null,
  seenVisit: null,
  toast: null,
  shake: 0,
  trade: { market: 'DTC', lev: null, pct: 25, sl: null, tp: null },
  awayDismissed: 0,
  awayAt: 0,
  prologue: !seen(),
  finishPrologue: () => { try { localStorage.setItem(PKEY, '1'); } catch { /* 저장 못 해도 진행 */ } set({ prologue: false }); },
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
  setOverlay: (overlay) => set({ overlay }),
  dismissVisit: (key) => set({ seenVisit: key, sheet: null }),
  say: (toast) => set({ toast }),
  doShake: () => set((s) => ({ shake: s.shake + 1 })),
  setTrade: (t) => set((s) => ({ trade: { ...s.trade, ...t } })),
  dismissAway: () => set((s) => ({ awayDismissed: s.awayAt })),
  markAway: (awayAt) => set({ awayAt }),
}));

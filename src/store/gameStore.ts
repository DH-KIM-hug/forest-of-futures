import { create } from 'zustand';
import { createGame, clone, tickMut } from '../engine/game';
import { catchUp } from '../engine/offline';
import { clock } from '../engine/clock';
import * as A from '../engine/actions';
import { balance, T } from '../engine/data';
import type { Mult } from '../engine/loans';
import type { Digest, GameState, LenderId } from '../engine/types';
import { loadGame, localStorageAdapter, saveGame, BROKEN_KEY, SAVE_KEY } from './persistence';

const adapter = localStorageAdapter();

export interface UiState {
  notice: string | null;
  say: { where: string; text: string; at: number } | null;
  mult: Mult;
  consent: boolean;
  termsOpen: boolean;
  friend: string;
  overlay: null | 'archive' | 'board' | 'prologue';
  digest: Digest | null;
  saveFailed: boolean;
  // 거래 입력값
  market: string;
  lev: number;
  pctIdx: number;
  slIdx: number;
  tpIdx: number;
  fatal: boolean;
}

interface Store {
  g: GameState;
  ui: UiState;
  patchUi: (p: Partial<UiState>) => void;
  labor: () => number;
  borrow: (id: LenderId) => void;
  stamp: (id: LenderId) => void;
  borrowFriend: (id: string) => void;
  stampFriend: (id: string) => void;
  move: (stage: number) => void;
  open: (dir: 1 | -1) => void;
  addToPosition: () => void;
  close: () => void;
  setStops: (sl: number | null, tp: number | null) => void;
  viewTerms: (id: string) => void;
  go: (v: { tab?: 'village' | 'trade'; location?: string }) => void;
  newLife: () => void;
  retire: () => void;
  rename: (name: string) => void;
  setColors: (c: 'kr' | 'intl') => void;
  finishPrologue: () => void;
  resetAll: () => void;
  advance: (seconds: number) => void;
}

function initial(): { g: GameState; notice: string | null; digest: Digest | null } {
  const loaded = loadGame(adapter);
  if (!loaded.state) return { g: createGame(), notice: loaded.notice ?? null, digest: null };
  const elapsed = Math.max(0, (clock.now() - loaded.state.savedAt) / 1000);
  const r = catchUp(loaded.state, elapsed);
  return { g: r.s, notice: null, digest: r.digest && r.ticks > 0 ? r.digest : null };
}

const boot = initial();
const slOpts: (number | null)[] = T.slRoeOptions;
const tpOpts: (number | null)[] = T.tpRoeOptions;

export const useGame = create<Store>((set, get) => {
  const persist = (g: GameState) => {
    const ok = saveGame(adapter, g);
    if (!ok !== get().ui.saveFailed) set((s) => ({ ui: { ...s.ui, saveFailed: !ok } }));
  };
  const commit = (g: GameState) => {
    set({ g });
    persist(g);
  };
  const say = (where: string, text?: string) =>
    set((s) => ({ ui: { ...s.ui, say: text ? { where, text, at: Date.now() } : s.ui.say } }));

  return {
    g: boot.g,
    ui: {
      notice: boot.notice,
      say: null,
      mult: 1,
      consent: false,
      termsOpen: false,
      friend: 'squirrel',
      overlay: boot.g.settings.prologueSeen ? null : 'prologue',
      digest: boot.digest,
      saveFailed: false,
      market: 'DTC',
      lev: T.defaultLeverage,
      pctIdx: T.marginPctOptions.indexOf(T.defaultMarginPct),
      slIdx: 0,
      tpIdx: 0,
      fatal: false,
    },
    patchUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),

    labor: () => {
      const r = A.doLabor(get().g, Date.now());
      if (r.ok) set({ g: r.s });
      return r.ok ? (r.gained ?? 0) : -1;
    },
    borrow: (id) => {
      const { g, ui } = get();
      const r = A.doBorrow(g, id, ui.consent);
      commit(r.s);
      say(id, r.msg);
      if (r.ok) set((s) => ({ ui: { ...s.ui, consent: false, say: null } }));
    },
    stamp: (id) => {
      const r = A.doStamp(get().g, id, get().ui.mult);
      commit(r.s);
      say(id, r.ok ? undefined : r.msg);
    },
    borrowFriend: (id) => {
      const r = A.doBorrowFriend(get().g, id);
      commit(r.s);
      say(id, r.msg);
    },
    stampFriend: (id) => {
      const r = A.doStampFriend(get().g, id, get().ui.mult);
      commit(r.s);
      say(id, r.ok ? undefined : r.msg);
    },
    move: (stage) => {
      const r = A.doMove(get().g, stage);
      commit(r.s);
      say('home', r.msg);
    },
    open: (dir) => {
      const { g, ui } = get();
      const r = A.doOpen(g, {
        market: ui.market,
        dir,
        lev: ui.lev,
        marginPct: T.marginPctOptions[ui.pctIdx],
        sl: slOpts[ui.slIdx],
        tp: tpOpts[ui.tpIdx],
      });
      commit(r.s);
    },
    addToPosition: () => {
      const { g, ui } = get();
      const pos = g.run.positions[ui.market];
      if (!pos) return;
      const r = A.doOpen(g, { market: ui.market, dir: pos.dir, lev: pos.lev, marginPct: T.marginPctOptions[ui.pctIdx] });
      commit(r.s);
    },
    close: () => commit(A.doClose(get().g, get().ui.market).s),
    setStops: (sl, tp) => commit(A.doStops(get().g, get().ui.market, sl, tp).s),
    viewTerms: (id) => commit(A.doViewTerms(get().g, id).s),
    go: (v) => {
      set((s) => ({ ui: { ...s.ui, termsOpen: false, say: null, consent: false } }));
      commit(A.doView(get().g, v).s);
    },
    newLife: () => {
      commit(A.doNewLife(get().g));
      set((s) => ({ ui: { ...s.ui, digest: null, say: null } }));
    },
    retire: () => {
      const r = A.doRetire(get().g);
      if (r.ok) commit(r.s);
      else say('board', r.msg);
    },
    rename: (name) => commit(A.doRename(get().g, name)),
    setColors: (c) => commit(A.doSettings(get().g, { priceColors: c })),
    finishPrologue: () => {
      commit(A.doSettings(get().g, { prologueSeen: true }));
      set((s) => ({ ui: { ...s.ui, overlay: null } }));
    },
    resetAll: () => {
      adapter.remove(SAVE_KEY);
      adapter.remove(BROKEN_KEY);
      const g = createGame();
      set((s) => ({ g, ui: { ...s.ui, overlay: 'prologue', digest: null } }));
      persist(g);
    },
    advance: (seconds) => {
      const cur = get().g;
      if (cur.run.over) return;
      const before = cur.run.cycles;
      if (seconds > 10) {
        const r = catchUp(cur, seconds);
        set((s) => ({ g: r.s, ui: { ...s.ui, digest: r.digest && r.ticks > 0 ? r.digest : s.ui.digest } }));
        persist(r.s);
        return;
      }
      const g = clone(cur);
      for (let i = 0; i < seconds && !g.run.over; i++) tickMut(g);
      set({ g });
      if (g.run.cycles !== before || g.run.over) persist(g);
    },
  };
});

export const slOptions = slOpts;
export const tpOptions = tpOpts;

/** 1초 루프 + 앱이 가려질 때 저장 + 돌아왔을 때 따라잡기. */
export function startLoop(): () => void {
  let last = Date.now();
  const step = () => {
    const now = Date.now();
    const elapsed = Math.floor((now - last) / 1000);
    if (elapsed >= 1) {
      last += elapsed * 1000;
      useGame.getState().advance(elapsed);
    }
  };
  const id = setInterval(step, 250);
  const saver = setInterval(() => {
    const g = useGame.getState().g;
    if (!g.run.over) saveGame(adapter, g);
  }, 5000);
  const onVis = () => {
    if (document.hidden) {
      saveGame(adapter, useGame.getState().g);
      step();
    } else {
      step();
    }
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', onVis);
  return () => {
    clearInterval(id);
    clearInterval(saver);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', onVis);
  };
}
void balance;

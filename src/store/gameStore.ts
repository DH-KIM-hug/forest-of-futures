// 임시 디버그용 스토어(M7 전). 엔진은 순수라 여기서만 시계(setInterval)와 가짜 시세를 붙인다.
import { create } from 'zustand';
import { createGame, step } from '../engine/game';
import type { Action } from '../engine/actions';
import { SimFeed } from '../engine/feed/simFeed';
import type { GameState } from '../engine/types';
import { loadGame, localStorageAdapter, saveGame } from '../engine/save';

const adapter = localStorageAdapter();
let lastSaved = 0;
const persist = (g: GameState) => {
  // 저장 시점: 행동 직후, 정산 뒤(약 3분마다)
  void saveGame(adapter, g, Date.now());
  lastSaved = g.run.settleNo;
};

const feed = new SimFeed(Date.now() & 0xffff);
const first = feed.snapshot();

interface Store {
  g: GameState;
  speed: number;
  act: (a: Action) => void;
  advance: (seconds: number) => void;
  reset: () => void;
  hydrate: () => Promise<string | null>;
  setSpeed: (n: number) => void;
}

export const useGame = create<Store>((set, get) => ({
  g: createGame({ seed: 1, prices: Object.fromEntries(Object.entries(first.p).map(([k, v]) => [k, v[0]])) }),
  speed: 1,
  act: (action) => {
    const g = step(get().g, { type: 'action', action });
    set({ g });
    persist(g);
  },
  advance: (seconds) => {
    let g = get().g;
    for (let i = 0; i < seconds; i++) g = step(g, { type: 'tick', tick: feed.next() });
    set({ g });
    if (g.run.settleNo !== lastSaved) persist(g);
  },
  hydrate: async () => {
    const r = await loadGame(adapter);
    set({ g: r.g });
    return r.notice;
  },
  reset: () => set({ g: createGame({ seed: 1, prices: Object.fromEntries(Object.entries(feed.snapshot().p).map(([k, v]) => [k, v[0]])) }) }),
  setSpeed: (speed) => set({ speed }),
}));

export function startLoop(): void {
  setInterval(() => {
    const { speed, advance, g } = useGame.getState();
    if (!g.run.over) advance(speed);
  }, 1000);
}

// 임시 디버그용 스토어(M7 전). 엔진은 순수라 여기서만 시계와 시세 출처를 붙인다.
// 시세 출처: 기본 게임 서버(ServerFeed). ?feed=sim|replay 면 서버 없이 SimFeed·ReplayFeed (개발용).
import { create } from 'zustand';
import { clone, createGame, step, stepMut } from '../engine/game';
import type { Action } from '../engine/actions';
import { SimFeed } from '../engine/feed/simFeed';
import { ReplayFeed, type Recording } from '../engine/feed/replayFeed';
import type { Tick } from '../engine/feed/types';
import type { AwayReport, GameState, Res } from '../engine/types';
import { loadGame, localStorageAdapter, saveGame } from '../engine/save';
import { pickFeedMode, serverUrl, type FeedMode } from '../net/feedMode';
import { ServerFeed, type FeedStatus } from '../net/serverFeed';
import { attachServerFeed, type Session } from '../net/session';

const adapter = localStorageAdapter();
let lastSaved = 0;
export const persistFlag = { on: true };
const persist = (g: GameState) => {
  if (!persistFlag.on) return;
  void saveGame(adapter, g, Date.now());
  lastSaved = g.run.settleNo;
};

const hasWindow = typeof window !== 'undefined';
// 시제품(?proto=1)은 feed 값이 없으면 서버 없이 도는 sim 을 쓴다.
const feedSearch = (): string => {
  const s = window.location.search;
  const q = new URLSearchParams(s);
  return q.get('proto') === '1' && !q.get('feed') ? s + (s ? '&' : '?') + 'feed=sim' : s;
};
export const feedMode: FeedMode = hasWindow ? pickFeedMode(feedSearch(), (import.meta as any).env?.VITE_FEED) : 'sim';

const simFeed = new SimFeed(Date.now() & 0xffff);
const first = simFeed.snapshot();
const pricesOf = (t: Tick) => Object.fromEntries(Object.entries(t.p).map(([k, v]) => [k, v[0]]));

let serverFeed: ServerFeed | null = null;
let replayFeed: ReplayFeed | null = null;
let session: Session | null = null;

export interface NetInfo {
  source: FeedMode;
  conn: FeedStatus['conn'] | 'local';
  market: FeedStatus['market'];
  stale: boolean;
  everConnected: boolean;
  url?: string;
  away: AwayReport | null;
}

interface Store {
  g: GameState;
  speed: number;
  net: NetInfo;
  act: (a: Action) => Res;
  setGame: (g: GameState) => void;
  advance: (seconds: number) => void;
  reset: () => void;
  hydrate: () => Promise<string | null>;
  setSpeed: (n: number) => void;
}

const baseNet = (): NetInfo => ({ source: feedMode, conn: feedMode === 'server' ? 'idle' : 'local', market: 'open', stale: false, everConnected: false, away: null });

export const useGame = create<Store>((set, get) => ({
  g: createGame({ seed: 1, prices: pricesOf(first) }),
  speed: 1,
  net: baseNet(),
  act: (action) => {
    const g = clone(get().g);
    const res = stepMut(g, { type: 'action', action });
    set({ g });
    if (action.type !== 'tap') persist(g);
    return res;
  },
  setGame: (g) => set({ g }),
  advance: (seconds) => {
    if (feedMode === 'server') return; // 서버 시계는 앞당길 수 없다
    let g = get().g;
    for (let i = 0; i < seconds; i++) g = step(g, { type: 'tick', tick: (replayFeed ?? simFeed).next() });
    set({ g });
    if (g.run.settleNo !== lastSaved) persist(g);
  },
  hydrate: async () => {
    const r = await loadGame(adapter);
    set({ g: r.g });
    return r.notice;
  },
  reset: () => set({ g: createGame({ seed: 1, prices: pricesOf(simFeed.snapshot()) }) }),
  setSpeed: (speed) => set({ speed }),
}));

export async function startLoop(): Promise<void> {
  if (feedMode === 'server') {
    const url = serverUrl(window.location, (import.meta as any).env?.VITE_SERVER_URL);
    const feed = new ServerFeed({ baseUrl: url });
    serverFeed = feed;
    session = attachServerFeed(feed, {
      get: () => useGame.getState().g,
      set: (g) => {
        useGame.setState({ g });
        if (g.run.settleNo !== lastSaved) persist(g);
      },
      onAway: (away) => useGame.setState((s) => ({ net: { ...s.net, away } })),
    });
    const sync = (s: FeedStatus) =>
      useGame.setState((st) => ({ net: { ...st.net, conn: !s.everConnected && s.conn !== 'idle' && session?.localTicksRan() ? 'local' : s.conn, market: s.market, stale: s.stale, everConnected: s.everConnected, url } }));
    feed.onStatus(sync);
    sync(feed.status);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) session?.background();
      else session?.foreground();
    });
    window.addEventListener('pagehide', () => persist(useGame.getState().g));
    feed.connect();
    return;
  }
  if (feedMode === 'replay') {
    const rec: Recording = (await import('../../docs/gdd/v2/sim/data/hl_3m.json')).default as unknown as Recording;
    replayFeed = new ReplayFeed(rec, 0, 0);
  }
  setInterval(() => {
    const { speed, advance, g } = useGame.getState();
    if (!g.run.over) advance(speed);
  }, 1000);
}

export const feedHandles = () => ({ serverFeed, session });

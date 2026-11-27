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
import { HlDirectFeed } from '../net/hlDirect/feed';
import { attachHlFeed, type HlSession } from '../net/hlDirect/attach';
import { openSocket, postJson } from '../net/hlDirect/io';
import { prependHistory } from '../ui/priceHistory';
import { setDayHistory } from '../ui/dayHistory';

const adapter = localStorageAdapter();
let lastSaved = 0;
export const persistFlag = { on: true };
const persist = (g: GameState) => {
  if (!persistFlag.on) return;
  void saveGame(adapter, g, Date.now());
  lastSaved = g.run.settleNo;
};

const hasWindow = typeof window !== 'undefined';
// 시제품(?proto=1)은 feed 값이 없으면 서버 없이 브라우저가 직접 받는 실시간 시세(hl)를 쓴다. &feed=sim 은 오프라인용 난수 시세.
const feedSearch = (): string => {
  const s = window.location.search;
  const q = new URLSearchParams(s);
  return q.get('proto') === '1' && !q.get('feed') ? s + (s ? '&' : '?') + 'feed=hl' : s;
};
export const feedMode: FeedMode = hasWindow ? pickFeedMode(feedSearch(), (import.meta as any).env?.VITE_FEED) : 'sim';

// 화면 확인용(U-52): &pfly=초 → 연습 시세가 그 번호에서 시작한다(날다람쥐코인의 숲 소문이 도는 때로 건너뛰기)
const simStartN = hasWindow ? Math.max(0, Math.floor(+(new URLSearchParams(window.location.search).get('pfly') ?? 0)) || 0) : 0;
const simFeed = new SimFeed(Date.now() & 0xffff, simStartN);
const first = simFeed.snapshot();
const pricesOf = (t: Tick) => Object.fromEntries(Object.entries(t.p).map(([k, v]) => [k, v[0]]));

let serverFeed: ServerFeed | null = null;
let replayFeed: ReplayFeed | null = null;
let session: Session | null = null;
let hlFeed: HlDirectFeed | null = null;
let hlSession: HlSession | null = null;
/** 이 시간 안에 첫 시세가 안 오면 연습 시세(sim)로 바꾼다. */
const HL_GIVE_UP_MS = 8000;

export interface NetInfo {
  source: FeedMode;
  conn: FeedStatus['conn'] | 'local';
  market: FeedStatus['market'];
  stale: boolean;
  everConnected: boolean;
  url?: string;
  away: AwayReport | null;
  /** hl 모드에서 실시간 시세를 못 받아 연습 시세(sim)로 돌고 있다. */
  fallback?: boolean;
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

const baseNet = (): NetInfo => ({ source: feedMode, conn: feedMode === 'server' ? 'idle' : feedMode === 'hl' ? 'connecting' : 'local', market: 'open', stale: false, everConnected: false, away: null });

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
    if (feedMode === 'hl' && !get().net.fallback) return; // 실시간 시세도 앞당길 수 없다
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
  if (feedMode === 'hl') startHl();
  if (feedMode === 'replay') {
    const rec: Recording = (await import('../../docs/gdd/v2/sim/data/hl_3m.json')).default as unknown as Recording;
    replayFeed = new ReplayFeed(rec, 0, 0);
  }
  setInterval(() => {
    const { speed, advance, g } = useGame.getState();
    if (!g.run.over) advance(speed);
  }, 1000);
}

/** 브라우저 직결 실시간 시세. 못 붙으면 연습 시세로 내려간다. */
function startHl(): void {
  const feed = new HlDirectFeed({ socketFactory: openSocket, post: postJson });
  hlFeed = feed;
  hlSession = attachHlFeed(
    feed,
    {
      get: () => useGame.getState().g,
      set: (g) => {
        useGame.setState({ g });
        if (g.run.settleNo !== lastSaved) persist(g);
      },
      onAway: (away) => useGame.setState((s) => ({ net: { ...s.net, away } })),
      paused: () => useGame.getState().speed === 0,
    },
    (h, day) => { prependHistory(h); if (day) setDayHistory(day); },
  );
  feed.onStatus((s) =>
    useGame.setState((st) => (st.net.fallback ? st : { net: { ...st.net, conn: s.conn === 'idle' ? 'idle' : s.conn === 'live' ? 'open' : s.conn, market: s.market, stale: s.conn === 'down', everConnected: s.everConnected } })),
  );
  document.addEventListener('visibilitychange', () => {
    if (useGame.getState().net.fallback) return;
    if (document.hidden) hlSession?.background();
    else hlSession?.foreground();
  });
  feed.connect();
  setTimeout(() => {
    if (feed.status.everConnected) return;
    hlSession?.detach();
    feed.disconnect();
    useGame.setState((s) => ({ net: { ...s.net, source: 'sim', conn: 'local', market: 'open', stale: false, fallback: true } }));
  }, HL_GIVE_UP_MS);
}

export const feedHandles = () => ({ serverFeed, session, hlFeed, hlSession });

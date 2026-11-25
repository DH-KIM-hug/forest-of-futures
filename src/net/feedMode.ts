// 시세 출처 고르기. 기본은 게임 서버. 개발용으로 ?feed=sim | replay | server (또는 VITE_FEED) 로 서버 없이 돌린다.
export type FeedMode = 'server' | 'sim' | 'replay';

export function pickFeedMode(search: string, envFeed?: string): FeedMode {
  const q = new URLSearchParams(search).get('feed') ?? envFeed;
  return q === 'sim' || q === 'replay' ? q : 'server';
}

/** 게임 서버 주소: VITE_SERVER_URL, 없으면 이 페이지와 같은 호스트의 8787 포트. */
export function serverUrl(loc: { protocol: string; hostname: string }, env?: string): string {
  return env && env.length ? env : `${loc.protocol}//${loc.hostname}:8787`;
}

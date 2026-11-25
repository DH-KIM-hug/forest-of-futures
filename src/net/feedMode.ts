// 시세 출처 고르기. 기본은 게임 서버. ?feed=sim | replay | server | hl (또는 VITE_FEED).
// hl = 브라우저가 출처 공개 소켓에 직접 붙는다(시제품, 게임 서버 없음). 시제품은 feed 가 없으면 hl.
export type FeedMode = 'server' | 'sim' | 'replay' | 'hl';

export function pickFeedMode(search: string, envFeed?: string): FeedMode {
  const q = new URLSearchParams(search).get('feed') ?? envFeed;
  return q === 'sim' || q === 'replay' || q === 'hl' ? q : 'server';
}

/** 게임 서버 주소: VITE_SERVER_URL, 없으면 이 페이지와 같은 호스트의 8787 포트. */
export function serverUrl(loc: { protocol: string; hostname: string }, env?: string): string {
  return env && env.length ? env : `${loc.protocol}//${loc.hostname}:8787`;
}

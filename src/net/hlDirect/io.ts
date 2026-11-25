// 이 폴더에서 네트워크를 여는 유일한 곳(WebSocket 하나, 조회 POST 하나). 테스트에서는 가짜로 갈아 끼운다.
import type { SocketLike } from '../../../server/src/shared';

export const openSocket = (url: string): SocketLike => new WebSocket(url) as unknown as SocketLike;

export type PostJson = (url: string, body: unknown) => Promise<any>;
export const postJson: PostJson = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`info ${r.status}`);
  return r.json();
};

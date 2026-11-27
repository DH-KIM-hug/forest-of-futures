// 전광판(랭킹 Worker, U-45)과 말하는 유일한 곳: 기록 올리기 POST 하나, 읽기 GET 둘. 주소는 ranking/client.json(앱 소스 밖)에서 읽는다.
// &rankapi=<주소> 로 바꿀 수 있다(시험용 Worker). 시험에서는 보내는 함수를 가짜로 갈아 끼운다.
import client from '../../ranking/client.json';

const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
export const RANK_API: string = (q.get('rankapi') || client.url).replace(/\/+$/, '');

export interface RankReply { status: number; body: any }
/** POST /submit. 그물이 끊기면 던진다(부르는 쪽이 다시 보낸다). */
export async function postRank(body: unknown, base = RANK_API): Promise<RankReply> {
  const r = await fetch(`${base}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let j: unknown = null;
  try { j = await r.json(); } catch { /* 빈 몸 */ }
  return { status: r.status, body: j };
}
/** GET /top · /me */
export async function getRank(path: string, base = RANK_API): Promise<any> {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(`rank ${r.status}`);
  return r.json();
}

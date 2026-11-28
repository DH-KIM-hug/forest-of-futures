// 전광판 잠금(U-59, 사용자 결정: "한 번이라도 다 갚으면 축하합니다. 랭킹 오픈").
//   - 빚을 한 번이라도 다 갚기 전(어느 생이든)에는 전광판이 잠겨 있다: 지도 게시판과 전광판 단추는 자물쇠 판, 기록은 올리지 않는다
//   - 처음 다 갚은 순간 풀린다. 이 기기 전체(본편과 라이트, 생과 저장을 넘어)에 남는다: localStorage 'fof.rank.unlock'
//   - 처음 풀릴 때만 큰 축하(「축하합니다!」), 그 뒤의 완납은 늘 하던 완납 장면만
//   - 장면 건너뛰기(&pdev) · 치트(&cheat)는 저장을 읽지도 쓰지도 않는다(메모리에서만 풀린다). &pdev=rank 는 풀린 채로 본다
// 이 파일은 게임 상태를 모른다(watch.ts 가 완납을 알려 주고, ranking.ts 가 풀림을 듣는다).
import { create } from 'zustand';

export const UNLOCK_KEY = 'fof.rank.unlock';
export interface UnlockRec { at: number; /** 큰 축하를 이미 보여 줬다 */ cheered: boolean; /** 풀린 까닭: clear = 이 판에서 다 갚았다, past = 예전 저장에 이미 다 갚은 생이 있었다 */ why: 'clear' | 'past' }

const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
/** 저장을 건드리지 않는 판(장면 건너뛰기, 치트, 다시 보기) */
const memOnly = !!q.get('pdev') || q.get('cheat') === '1';

function readRec(): UnlockRec | null {
  if (memOnly) {
    if (q.get('pdev') === 'rank' || q.get('punlock') === '1') return { at: 1, cheered: true, why: 'past' };
    return null;
  }
  try {
    const s = window.localStorage.getItem(UNLOCK_KEY);
    if (!s) return null;
    const x = JSON.parse(s);
    return x && typeof x.at === 'number' ? { at: x.at, cheered: !!x.cheered, why: x.why === 'past' ? 'past' : 'clear' } : null;
  } catch { return null; }
}
function writeRec(r: UnlockRec): void {
  if (memOnly) return;
  try { window.localStorage.setItem(UNLOCK_KEY, JSON.stringify(r)); } catch { /* 저장이 막혀도 이번 판은 풀린다 */ }
}

interface UnlockUi { rec: UnlockRec | null; /** 큰 축하가 떠 있다 */ cheer: boolean; /** 완납 장면이 고르는 줄까지 와서 축하를 띄울 차례다 */ due: boolean }
export const useUnlock = create<UnlockUi>(() => ({ rec: typeof window !== 'undefined' ? readRec() : null, cheer: false, due: false }));

export const isRankUnlocked = (): boolean => !!useUnlock.getState().rec;

type L = () => void;
const listeners = new Set<L>();
/** 풀리는 순간 한 번(ranking.ts: 이번 생 최고 재산을 이 순간부터 다시 잰다) */
export const onRankUnlock = (f: L): (() => void) => { listeners.add(f); return () => listeners.delete(f); };

/** 다 갚았다(watch.ts 가 빚이 0 이 된 순간 부른다). 처음이면 풀고 축하를 걸어 둔다: true */
export function rankCleared(now = Date.now()): boolean {
  const s = useUnlock.getState();
  if (s.rec) return false;
  const rec: UnlockRec = { at: now, cheered: false, why: 'clear' };
  writeRec(rec);
  useUnlock.setState({ rec, due: true });
  for (const f of listeners) { try { f(); } catch { /* 듣는 쪽 문제로 막지 않는다 */ } }
  return true;
}
/** 예전 저장에 이미 다 갚은 생이 있다(은퇴한 적이 있거나, 빚 없이 이어 가는 생): 축하 없이 조용히 푼다 */
export function rankGrandfather(past: boolean, now = Date.now()): boolean {
  if (!past || useUnlock.getState().rec) return false;
  const rec: UnlockRec = { at: now, cheered: true, why: 'past' };
  writeRec(rec);
  useUnlock.setState({ rec });
  for (const f of listeners) { try { f(); } catch { /* */ } }
  return true;
}
/** 완납 장면의 고르는 줄이 떴다(CutIn): 걸어 둔 축하가 있으면 띄운다 */
export function choicesShown(sceneId: string): void {
  const s = useUnlock.getState();
  if (sceneId !== 'clear' || !s.due || !s.rec || s.rec.cheered) return;
  useUnlock.setState({ due: false, cheer: true });
}
/** 축하를 닫는다(본 것으로 적는다) */
export function endCheer(): void {
  const s = useUnlock.getState();
  const rec = s.rec ? { ...s.rec, cheered: true } : null;
  if (rec) writeRec(rec);
  useUnlock.setState({ cheer: false, due: false, rec });
}

/** 시험용 */
export function __setUnlockForTest(rec: UnlockRec | null): void { useUnlock.setState({ rec, cheer: false, due: false }); }
export const __readUnlockRec = readRec;

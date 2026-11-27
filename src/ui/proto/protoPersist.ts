// 시제품 저장의 배선(U-55): 켤 때 읽고, 놀면서 쓴다. 봉투 모양과 따라잡기는 protoSave.ts(순수).
//   - 판이 바뀌는 순간(포지션이 열리고 닫힘, 정산, 생의 끝, 새 생)에는 바로 쓴다: 새로 고쳐 닫힌 판을 되돌리거나 같은 거래를 두 번 올리지 못하게
//   - 그 밖에는 5초에 한 번까지, 탭이 가려질 때와 떠날 때 한 번 더
import { feedHandles, feedMode, resumeHint, useGame } from '../../store/gameStore';
import { totalDebt } from '../../engine/selectors';
import type { GameState } from '../../engine/types';
import { useUI } from '../uiStore';
import { historyOf, markLive, prependHistory } from '../priceHistory';
import { useProto } from './protoStore';
import { lifeNo } from './model';
import { PROTO_BROKEN_KEY, SAVE_BROKEN_NOTICE, SAVE_OLD_NOTICE, canSaveNow, pack, pickProto, unpack, type FeedMark } from './protoSave';

export const SAVE_EVERY_MS = 5000;
const ls = {
  get(k: string): string | null { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): boolean { try { window.localStorage.setItem(k, v); return true; } catch { return false; } },
  remove(k: string): void { try { window.localStorage.removeItem(k); } catch { /* 저장소 막힘 */ } },
};

/** 저장을 읽어 판을 깐다. restored = 이어 간다. notice = 못 읽어 새로 시작할 때 한 줄 */
export function restoreProto(key: string): { restored: boolean; notice: string | null } {
  const raw = ls.get(key);
  const u = unpack(raw);
  if (!u.ok) {
    if (u.why === 'none') return { restored: false, notice: null };
    if (raw !== null) ls.set(PROTO_BROKEN_KEY, raw);
    ls.remove(key);
    return { restored: false, notice: u.why === 'old' ? SAVE_OLD_NOTICE : SAVE_BROKEN_NOTICE };
  }
  const { env } = u;
  useGame.getState().setGame(env.g);
  useProto.getState().patch(env.p as never);
  if (env.trade) useUI.getState().setTrade(env.trade as never);
  // 연습 시세의 차트: 잠깐 비웠으면 지난 몇 분을 그대로 다시 그린다(실시간 시세는 거래소에서 다시 받는다)
  if (env.hist && env.feed.kind === 'sim' && Date.now() - env.at < 10 * 60_000) { prependHistory(env.hist); for (const m of Object.keys(env.hist)) markLive(m); }
  resumeHint.r = { at: env.at, feed: env.feed, purse: { cash: env.g.run.cash, debt: totalDebt(env.g.run) } };
  return { restored: true, notice: null };
}

function markOf(g: GameState): FeedMark {
  const net = useGame.getState().net;
  const hl = feedHandles().hlFeed;
  const kind: FeedMark['kind'] = net.fallback ? 'sim' : feedMode;
  return { kind, n: g.run.lastSeenTick, mids: kind === 'hl' && hl ? { ...hl.core.lastMids } : {} };
}

/** 지금 쓴다(못 쓰는 순간이면 false) */
export function saveNow(key: string): boolean {
  const g = useGame.getState().g;
  const P = useProto.getState();
  if (feedHandles().hlFeed?.resuming) return false; // 떠난 사이를 아직 메우지 않았다
  if (!canSaveNow(g, P, lifeNo(g))) return false;
  const feed = markOf(g);
  const hist = feed.kind === 'sim' ? Object.fromEntries(Object.keys(g.run.prices).map((m) => [m, historyOf(m)])) : undefined;
  return ls.set(key, pack({ g, p: pickProto(P as unknown as Record<string, unknown>), trade: { ...useUI.getState().trade }, feed, now: Date.now(), hist }));
}

/** 판이 바뀌는 순간의 표(이것이 바뀌면 바로 쓴다) */
const beat = (g: GameState): string => {
  const ps = Object.values(g.run.positions).map((p) => `${p.market}:${p.openTick}:${p.halfs?.length ?? 0}`).join(',');
  return `${ps}|${g.run.settleNo}|${g.run.over ? 1 : 0}|${g.family.generation}|${g.estate?.step ?? ''}`;
};

let started = false;
export function startAutosave(key: string): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  let last = 0;
  let timer: number | undefined;
  let sig = beat(useGame.getState().g);
  const later = () => {
    if (timer !== undefined) return;
    timer = window.setTimeout(write, Math.max(250, last + SAVE_EVERY_MS - Date.now()));
  };
  // 못 쓰는 순간(고르는 장면, 메우기 전)이면 조금 뒤에 다시
  function write(): void { window.clearTimeout(timer); timer = undefined; const ok = saveNow(key); last = Date.now(); if (!ok) later(); }
  useGame.subscribe((s) => {
    const k = beat(s.g);
    if (k !== sig) { sig = k; write(); } else later();
  });
  useProto.subscribe(() => later());
  document.addEventListener('visibilitychange', () => { if (document.hidden) write(); });
  window.addEventListener('pagehide', write);
}

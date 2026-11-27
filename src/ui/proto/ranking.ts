// 전광판(랭킹, U-45): 게임 상태를 지켜보다가 기록을 Cloudflare Worker(ranking/)에 올린다. 게임을 막지 않는다.
//   - 실제 시세(실시간 직결 시세)로 이긴 거래 → 한 번에 최고 수익률(roe) · 수익금(pnl) 판
//   - 생이 끝날 때(파산 · 은퇴), 그리고 정산 때 이번 생 최고 재산이 새로 나오면(정산 5번에 한 번까지) → 한 생 최고 재산(networth) 판
//   - 연습 시세(&feed=sim, 실시간을 못 받아 내려간 판) · 튜토리얼 거래 · 개발 판(&pdev 장면 건너뛰기 · &cheat 치트)은 올리지 않는다
//   - 서버와 말하는 곳은 src/net/rankingIo.ts 하나(&rankapi=<주소> 로 바꾼다, 기본 = 운영 Worker)
import { create } from 'zustand';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { closedMath, say } from './watch';
import { lifeNo } from './model';
import { isCheat, pdev } from './config';
import { totalDebt, walletValue } from '../../engine/selectors';
import type { GameState } from '../../engine/types';
import type { NetInfo } from '../../store/gameStore';
import {
  BOARD_LABEL, cleanName, emptyQueue, enqueue, isWinningEntry, eligible, lifeDetail, lifeNetWorth, newDeviceId, pumpOnce, tradeDetail,
  type Board, type ClosedTrade, type OpenMeta, type QueueState, type Sender, type TradeDetail,
} from './rankingCore';

import { RANK_API, getRank, postRank } from '../../net/rankingIo';
export { RANK_API };
/** 개발 판(장면 건너뛰기 · 치트)은 전광판에 올리지 않는다. 빠른 정산(&fast)은 시세가 진짜라 막지 않는다(재산 상한은 정산 수로 잰다) */
export const rankDevOff = !!pdev || isCheat;

// ── 저장(이 기기의 브라우저에만) ─────────────────────────────────────────
const K = { device: 'fof.rank.device', name: 'fof.rank.name', queue: 'fof.rank.queue', life: 'fof.rank.life' };
const ls = {
  get(k: string): string | null { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { window.localStorage.setItem(k, v); } catch { /* 저장이 막혀도 게임은 간다 */ } },
};
const readJson = <T,>(k: string, fb: T): T => { try { const s = ls.get(k); return s ? { ...fb, ...JSON.parse(s) } : fb; } catch { return fb; } };

export function deviceId(): string {
  let id = ls.get(K.device);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) { id = newDeviceId(); ls.set(K.device, id); }
  return id;
}
/** 장부에 적은 이름(아직 안 적었으면 null) */
export const savedName = (): string | null => { const n = ls.get(K.name); return n ? cleanName(n) : null; };
/** 이름을 적기 전에 올라가는 기록의 이름: "다람쥐 K3F9" */
export const fallbackName = (): string => `다람쥐 ${deviceId().slice(-4).toUpperCase()}`;

// ── 전광판 화면 상태 ─────────────────────────────────────────────────────
interface RankUi { open: boolean; tab: Board; name: string | null; rejected: number; posts: number; queued: number }
export const useRank = create<RankUi>(() => ({ open: false, tab: 'networth', name: typeof window !== 'undefined' ? savedName() : null, rejected: 0, posts: 0, queued: 0 }));
export const openBoard = (tab?: Board): void => useRank.setState((s) => ({ open: true, tab: tab ?? s.tab }));
export const closeBoard = (): void => useRank.setState({ open: false });

/** 이름을 적는다(고친다). 이미 올라간 기록에도 새 이름이 붙게, 판마다 마지막 기록을 한 번 다시 보낸다(서버가 이름만 고친다). */
export function setRankName(raw: string): boolean {
  const n = cleanName(raw);
  if (!n) return false;
  const was = savedName();
  ls.set(K.name, n);
  useRank.setState({ name: n });
  if (was !== n && !rankDevOff) {
    for (const b of Object.keys(sent) as Board[]) {
      const x = sent[b]!;
      if (!queue.items.some((i) => i.board === b)) queue.items.push({ board: b, value: x.value, detail: x.detail as any, tries: 0, nextAt: Date.now(), at: Date.now(), rename: true });
    }
    saveQueue(); kick();
  }
  return true;
}

// ── 실제 시세인가 ─────────────────────────────────────────────────────────
/** 지금 거래소 시세가 실제 시세(실시간 직결)인가 */
export const liveNet = (n: NetInfo): boolean => n.source === 'hl' && !n.fallback && n.everConnected;
/** 전광판에 올라가지 않는 까닭(올라가면 null) */
export function rankOffReason(n: NetInfo = useGame.getState().net): 'dev' | 'sim' | null {
  if (rankDevOff) return 'dev';
  if (n.source !== 'hl' || n.fallback) return 'sim';
  return null;
}

// ── 줄(보내기) ────────────────────────────────────────────────────────────
let queue: QueueState = emptyQueue();
/** 판마다 마지막으로 받아 준 기록(이름을 고칠 때 다시 보낸다) */
let sent: Partial<Record<Board, { value: number; detail: unknown }>> = {};
const saveQueue = () => {
  ls.set(K.queue, JSON.stringify({ ...queue, sent }));
  useRank.setState({ rejected: queue.rejected.length, posts: queue.posts, queued: queue.items.length });
};
export const defaultSender = (base = RANK_API): Sender => (body) => postRank(body, base);
let sender: Sender = defaultSender();
let timer: number | undefined;
let pumping = false;
function kick(ms = 0): void {
  if (typeof window === 'undefined') return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { void pump(); }, Math.max(0, ms));
}
async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    const out = await pumpOnce(queue, sender, { deviceId: deviceId(), name: savedName() ?? fallbackName() }, () => Date.now());
    if (out.kind === 'ok') {
      sent[out.board] = { value: out.item.value, detail: out.item.detail };
      // 순위가 올랐다: 짧게 한 줄(주인공 목소리)
      if (!out.item.rename && !out.kept && out.rank !== null && (out.prevRank === null || out.rank < out.prevRank)) say(`전광판 ${BOARD_LABEL[out.board].toast} 판 ${out.rank}위에 올랐다.`, 4000);
    }
    // 겁주지 않는다: 조용히 적어 두고, 전광판을 열면 한 줄로 말한다(이름 고치기용 다시 보내기는 세지 않는다)
    if (out.kind === 'rejected' && !out.item.rename) console.info('[전광판] 받아 주지 않은 기록', out.board, out.why);
    saveQueue();
    if (queue.items.length) {
      const next = queue.items.reduce((a, x) => Math.min(a, x.nextAt), Infinity);
      kick(Math.max(next - Date.now(), queue.lastSentAt + 10_500 - Date.now(), 200));
    }
  } finally { pumping = false; }
}
function submit(board: Board, value: number, detail: unknown): void {
  if (rankDevOff) return;
  if (enqueue(queue, board, value, detail as any, Date.now())) { saveQueue(); kick(); }
}

// ── 한 생의 기록 ──────────────────────────────────────────────────────────
interface Life {
  /** 판 열쇠(seed:세대) */ id: string;
  lifeNo: number; settles: number;
  trades: TradeDetail[];
  peak: number;
  /** 연습 시세 · 진입 시각을 모르는 이긴 거래가 섞였다: 이 생의 재산은 올리지 않는다 */ tainted: boolean;
  /** 재산 판에 마지막으로 넣은 정산 번호 · 값 */ subSettle: number; subPeak: number;
  /** 열린 포지션마다(종목:열린 틱) 진입 때 적은 것 */ open: Record<string, OpenMeta>;
  done: boolean;
  /** 이미 넣은 닫힌 거래(종목:열린 틱, 반 익절은 :h 번호). 저장에서 이어 간 뒤 같은 판이 다시 닫혀도 두 번 넣지 않는다(U-55) */ closed?: string[];
}
const CLOSED_KEEP = 60;
/** 처음 보는 닫힌 거래면 적고 true */
function firstClose(L: Life, k: string): boolean {
  const c = (L.closed ??= []);
  if (c.includes(k)) return false;
  c.push(k);
  if (c.length > CLOSED_KEEP) c.splice(0, c.length - CLOSED_KEEP);
  return true;
}
const lifeId = (g: GameState): string => `${g.run.seed}:${g.family.generation}`;
const newLife = (g: GameState): Life => ({ id: lifeId(g), lifeNo: lifeNo(g), settles: g.run.settleNo, trades: [], peak: -Infinity, tainted: false, subSettle: -99, subPeak: -Infinity, open: {}, done: false });
let life: Life | null = null;
const saveLife = () => { if (life) ls.set(K.life, JSON.stringify(life)); };
const posKey = (m: string, openTick: number) => `${m}:${openTick}`;

/** 전광판 셈의 재산(현금 + 지갑 + 열린 포지션 증거금 − 빚) */
export const rankNetWorth = (g: GameState): number => lifeNetWorth({
  cash: g.run.cash, wallet: walletValue(g.run), positionsMargin: Object.values(g.run.positions).reduce((a, p) => a + p.margin, 0), debt: totalDebt(g.run),
});
/** 재산 판에 넣는다(값이 0 보다 커야 한다) */
function submitLife(L: Life): void {
  if (L.tainted || !(L.peak > 0) || L.settles < 1 || L.peak <= L.subPeak) return;
  L.subPeak = L.peak; L.subSettle = L.settles;
  submit('networth', Math.floor(L.peak), lifeDetail(L.lifeNo, L.settles, L.peak, L.trades));
}
/** 정산 몇 번에 한 번까지 생 중간 기록을 넣는가 */
export const LIFE_SUBMIT_EVERY = 15; // U-47: 정산이 60초 — 15분에 한 번

/** 한 번 지켜본 것(시험용으로 따로 부른다): 두 상태 사이에 생긴 일을 기록한다 */
export function observe(prev: GameState, g: GameState, net: NetInfo, now = Date.now()): void {
  if (rankDevOff) return;
  const live = liveNet(net);
  if (!life || life.id !== lifeId(g)) {
    // 끝맺지 못한 지난 생(저장을 못 읽어 새로 시작했다): 그때까지의 최고 재산을 넣는다. 저장에서 이어 가면 같은 생이라 여기로 오지 않는다(U-55)
    if (life && !life.done) submitLife(life);
    life = newLife(g);
    if (lifeId(prev) !== life.id) prev = g;
  }
  const L = life;
  const tutNow = useProto.getState().tutorial;
  const run = g.run;
  // 새로 열린 포지션: 진입 시각과 그때의 시세 출처를 적는다
  for (const p of Object.values(run.positions)) {
    const k = posKey(p.market, p.openTick);
    if (!L.open[k]) L.open[k] = { entryTs: now, real: live, tutorial: tutNow !== 'done' };
    else if (!live) L.open[k].real = false; // 들고 있는 사이 연습 시세로 내려갔다
  }
  // 반 익절(나무 A1, U-51): 나눠 닫은 몫은 같은 진입 시각의 거래 하나로 넣는다(서버의 재산 상한이 그 몫을 센다)
  for (const p of Object.values(run.positions)) {
    const pp = prev.run.positions[p.market];
    const was = pp && pp.openTick === p.openTick ? pp.halfs?.length ?? 0 : 0;
    const hs = p.halfs ?? [];
    if (hs.length <= was) continue;
    const meta = L.open[posKey(p.market, p.openTick)] ?? null;
    for (const [hi, h] of hs.slice(was).entries()) {
      if (!firstClose(L, `${posKey(p.market, p.openTick)}:h${was + hi}`)) continue;
      const c: ClosedTrade = { market: p.market, dir: p.dir, lev: p.lev, margin0: h.margin, pnl: h.pnl, open: meta, exitTs: now, realAtExit: live, tutorialAtExit: tutNow === 'run' };
      if (meta?.tutorial || tutNow === 'run') continue;
      if (!eligible(c)) { if (h.pnl > 0) L.tainted = true; continue; }
      const d = tradeDetail(c);
      L.trades.push(d);
      if (isWinningEntry(c)) { submit('roe', d.roe, d); submit('pnl', d.pnl, d); }
    }
  }
  // 닫힌 포지션
  for (const p of Object.values(prev.run.positions)) {
    const cur = run.positions[p.market];
    if (cur && cur.openTick === p.openTick) continue;
    const k = posKey(p.market, p.openTick);
    const meta = L.open[k] ?? null;
    delete L.open[k];
    if (!firstClose(L, k)) continue;
    const { pnl } = closedMath(run, p);
    const c: ClosedTrade = { market: p.market, dir: p.dir, lev: p.lev, margin0: p.margin0, pnl, open: meta, exitTs: now, realAtExit: live, tutorialAtExit: tutNow === 'run' };
    const tut = meta?.tutorial || tutNow === 'run';
    if (tut) continue; // 튜토리얼 거래는 어디에도 넣지 않는다
    if (!eligible(c)) { if (pnl > 0) L.tainted = true; continue; }
    const d = tradeDetail(c);
    L.trades.push(d);
    if (isWinningEntry(c)) { submit('roe', d.roe, d); submit('pnl', d.pnl, d); }
  }
  L.settles = run.settleNo;
  // 정산: 연습 시세로 돈 정산이 지나갔으면 이 생은 섞였다. 이번 생 최고 재산이 새로 나오면 몇 번에 한 번 넣는다
  if (run.settleNo > prev.run.settleNo) {
    if (!live) L.tainted = true;
    const nw = rankNetWorth(g);
    if (nw > L.peak) L.peak = nw;
    if (!run.over && L.peak > L.subPeak && run.settleNo - L.subSettle >= LIFE_SUBMIT_EVERY) submitLife(L);
  }
  // 생이 끝났다(파산 · 은퇴)
  if (run.over && !prev.run.over && !L.done) {
    const nw = rankNetWorth(g);
    if (nw > L.peak) L.peak = nw;
    L.done = true;
    submitLife(L);
  }
  saveLife();
}

let started = false;
/** 시제품이 켜질 때 한 번 */
export function startRanking(opts: { sender?: Sender } = {}): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (opts.sender) sender = opts.sender;
  const saved = readJson<QueueState & { sent?: typeof sent }>(K.queue, { ...emptyQueue(), sent: {} });
  sent = saved.sent ?? {};
  queue = { items: saved.items ?? [], lastSentAt: saved.lastSentAt ?? 0, best: saved.best ?? {}, rank: saved.rank ?? {}, rejected: saved.rejected ?? [], posts: saved.posts ?? 0 };
  try { const s = ls.get(K.life); life = s ? (JSON.parse(s) as Life) : null; } catch { life = null; }
  useRank.setState((s) => ({ name: savedName() ?? s.name, rejected: queue.rejected.length, posts: queue.posts, queued: queue.items.length }));
  if (/[?&]e2e=1/.test(window.location.search)) {
    (window as unknown as { __fofRank?: () => unknown }).__fofRank = () => ({ off: rankOffReason(), posts: queue.posts, queued: queue.items.length, rejected: queue.rejected.length, lifeTrades: life?.trades.length ?? 0, tainted: life?.tainted ?? null, api: RANK_API });
  }
  if (rankDevOff) return;
  let prev = useGame.getState().g;
  useGame.subscribe((s) => { const g = s.g; if (g !== prev) { const p = prev; prev = g; try { observe(p, g, s.net); } catch (e) { console.info('[전광판]', e); } } });
  window.addEventListener('online', () => kick());
  if (queue.items.length) kick(1500);
}

// ── 읽기(전광판 화면) ───────────────────────────────────────────────────
export interface TopRow { rank: number; name: string; value: number; detail: any; at: number }
export interface MeRow { rank: number; name: string; value: number; detail: any }
export async function fetchTop(board: Board, limit = 50): Promise<TopRow[]> {
  return ((await getRank(`/top?board=${board}&limit=${limit}`)) as { rows: TopRow[] }).rows ?? [];
}
export async function fetchMe(board: Board): Promise<MeRow | null> {
  try { return ((await getRank(`/me?board=${board}&deviceId=${encodeURIComponent(deviceId())}`)) as { me: MeRow | null }).me ?? null; } catch { return null; }
}

/** 시험용: 상태를 비운다 */
export function __resetRankingForTest(s: Sender): void { queue = emptyQueue(); sent = {}; life = null; sender = s; }
export const __rankState = () => ({ queue, life, sent });
export const __pump = pump;

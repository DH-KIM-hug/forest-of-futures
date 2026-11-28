// 「오늘 망한 자들」(U-59, 사용자: "뉴스에서 누구 망했는지 뜨기"): 도토리일보에 숲에서 망한 이들의 소식을 싣는다.
//   - 진짜 사람: 전광판에 이름을 적은(빚을 한 번 다 갚아 전광판이 풀린) 기기가 파산하면 소식 한 건을 랭킹 Worker 에 올린다(POST /event).
//     이름 없는 기기, 장면 건너뛰기(&pdev), 치트(&cheat), 자동 시험(&e2e)은 올리지 않는다(부르는 쪽 ranking.ts 가 거른다)
//   - 신문은 GET /recent 로 최근 소식을 받아 웃긴 제목으로 만든다. 진짜 소식이 적으면 숲 단타방(rivals.ts)의 마을 사람들이 청산한 이야기로 채운다
//     (이름은 늘 그 마을 사람의 이름이다. 진짜 사람 이름을 지어내지 않는다)
import { create } from 'zustand';
import { marketById } from '../../engine/data';
import { lenderLimit } from '../../engine/selectors';
import { comma } from '../../engine/util';
import { getRank, postEvent } from '../../net/rankingIo';
import { RIVALS, rivalById, pickLine, type RivalEvent } from './rivals';
import type { GameState } from '../../engine/types';
import type { Who } from './protoStore';

export type BustCause = 'liq' | 'interest' | 'overdue' | 'noLender';
export const BUST_CAUSE_LABEL: Record<BustCause, string> = { liq: '청산', interest: '이자 미납', overdue: '연체 한도', noLender: '빌릴 곳 막힘' };
/** 마지막으로 닫힌 판 */
export interface LastTrade { market: string; dir: 1 | -1; lev: number; pnl: number; liq: boolean }
/** 올리는 소식(서버 ranking/src/events.ts parseEvent 와 같은 모양) */
export interface BustEvent {
  deviceId: string; name: string; cause: BustCause;
  coin: string | null; dir: 1 | -1 | null; lev: number | null;
  /** 마지막 판에서 잃은 돈(없으면 0) */ loss: number;
  /** 이번 생 가장 많았던 자산 */ peak: number;
  /** 라이트 엔딩 제목(있으면) */ ending: string | null;
  lite: boolean; ts: number;
}
/** 받아 온 소식 한 줄 */
export interface BustRow { name: string; cause: BustCause; coin: string | null; dir: 1 | -1 | null; lev: number | null; loss: number; peak: number; ending: string | null; lite: boolean; at: number }

/** 엔진의 파산 원인 → 신문의 원인 */
export function bustCause(g: GameState): BustCause {
  const b = g.run.bankruptcy;
  const c = b?.cause ?? g.pendingEnding?.cause ?? '';
  if (b?.immediate || c === 'LIQ' || c === 'TIP') return 'liq';
  if (c === 'FRIEND') return 'noLender';
  if (c === 'UPKEEP' || c === 'SEIZE') return 'interest';
  // 라이트: 오소리 한도를 다 쓴 채 연체로 끝났다 = 더 빌릴 곳이 없었다
  if (g.run.lite && lenderLimit(g, 'shark1') - g.run.debts.shark1.principal <= 0) return 'noLender';
  return 'overdue';
}

/** 파산한 게임 상태에서 올릴 소식 하나(이름이 없으면 null) */
export function bustFromGame(g: GameState, last: LastTrade | null, name: string | null, deviceId: string, now = Date.now()): BustEvent | null {
  if (!name || !g.run.over) return null;
  const p = g.pendingEnding;
  return {
    deviceId, name, cause: bustCause(g),
    coin: last?.market ?? null, dir: last?.dir ?? null, lev: last?.lev ?? null,
    loss: last && last.pnl < 0 ? Math.min(3e9, Math.round(-last.pnl)) : 0,
    peak: Math.max(-1e9, Math.min(3e9, Math.round(Math.max(g.run.peakNetWorth ?? 0, p?.peakNetWorth ?? 0)))),
    ending: p?.lite ? p.title.slice(0, 24) : null,
    lite: !!g.run.lite, ts: now,
  };
}

// ── 제목 만들기(순수) ──────────────────────────────────────────────────
function h(s: string, n: number): number { let x = 2166136261 ^ n; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return (x >>> 0); }
const coinShort = (id: string | null): string => (id ? marketById[id]?.short ?? marketById[id]?.name ?? id : '코인');
const dirWord = (d: 1 | -1 | null): string => (d === 1 ? '롱' : d === -1 ? '숏' : '');
const man = (v: number): string => (v >= 10_000 ? `${comma(Math.round(v / 10_000))}만` : comma(Math.round(v)));

/** 진짜 사람의 파산 소식 → 신문 제목 한 줄 */
export function bustHeadline(r: BustRow): string {
  const k = h(r.name + r.at, r.lev ?? 0);
  const bet = r.coin ? `${coinShort(r.coin)} ${r.lev ?? ''}배 ${dirWord(r.dir)}`.replace(/\s+/g, ' ').trim() : '';
  const big = r.peak >= 300_000;
  // 라이트 엔딩 제목이 있으면 그 뒤 소식으로 섞는다
  if (r.ending && k % 3 === 0) return `${big ? '어제의 큰손' : '어제의 개미'} ${r.name}, 오늘은 「${r.ending}」`;
  switch (r.cause) {
    case 'liq': {
      const xs = [
        `[속보] ${r.name}, ${bet || '200배'}으로 전 재산 증발`,
        `${r.name}, ${bet || '고배율'} 한 방에 ${r.loss > 0 ? `${man(r.loss)} 도토리` : '전 재산'} 청산`,
        big ? `어제의 큰손 ${r.name}, ${bet}으로 하루아침에 빈손` : `${r.name}, 「이번엔 진짜」라며 ${bet || '200배'}. 이번에도 진짜 청산`,
      ];
      return xs[k % xs.length] + (r.ending ? `. 이후 「${r.ending}」` : '');
    }
    case 'interest': return `${r.name}, 오소리 이자 못 내고 드럼통 대기 번호 ${(k % 40) + 3}번` + (r.ending ? `. 「${r.ending}」` : '');
    case 'noLender': return `${r.name}, 숲의 모든 대부가 문을 닫았다. 빌릴 곳 없음` + (r.ending ? `. 「${r.ending}」` : '');
    default: {
      const xs = [`${r.name}, 연체 도장 끝에 장부에서 이름이 지워졌다`, `${r.name}, 추심원 방문 세 번째 날 사라져`, big ? `어제의 큰손 ${r.name}, 오늘은 대부의 빨대 담당` : `${r.name}, 이자 날짜를 세다 숫자를 잊었다`];
      return xs[k % xs.length] + (r.ending ? `. 「${r.ending}」` : '');
    }
  }
}

/** 숲 단타방 마을 사람의 청산 · 파산 → 제목 한 줄(이름은 그 마을 사람) */
export function rivalHeadline(e: RivalEvent): string | null {
  const d = rivalById[e.id];
  if (!d) return null;
  if (e.kind === 'liq') return `[숲 단타방] ${d.name}, ${coinShort(e.market)} ${e.lev}배 ${dirWord(e.dir)} 청산. 「${e.line}」`;
  if (e.kind === 'bust') return `[숲 단타방] ${d.name} 파산. 「${e.line}」`;
  return null;
}
/** 그날의 단타방 청산(정해진 이야기, 날짜로 고른다): 진짜 소식도 방금 일도 없을 때 신문이 비지 않게 */
export function dailyRivalHeadlines(day: number, n = 2): { who: Who; text: string }[] {
  const pool = RIVALS.filter((d) => d.lev >= 50);
  const out: { who: Who; text: string }[] = [];
  for (let i = 0; i < n && i < pool.length; i++) {
    const d = pool[(day + i) % pool.length];
    const fly = (h(d.id, day) % 100) / 100 < d.fly;
    const coin = fly ? '날다람쥐' : ['도토코인', '밤더리움', '멍도토'][h(d.id, day + 7) % 3];
    const dir = d.dir === 'short' ? '숏' : d.dir === 'long' ? '롱' : h(d.id, day + 3) % 2 ? '롱' : '숏';
    out.push({ who: d.who, text: `[숲 단타방] ${d.name}, ${coin} ${d.lev}배 ${dir} 청산. 「${pickLine(d.lines.liq, day, i + 1)}」` });
  }
  return out;
}

export interface NewsItem { key: string; text: string; real: boolean; who: Who | null }
/** 신문에 실을 줄: 진짜 소식(최근 것부터) 먼저, 모자라면 단타방 마을 사람들로 채운다. 늘 min 줄 이상 */
export function bustNewsItems(rows: BustRow[], rivalLog: RivalEvent[], day: number, max = 5, min = 3): NewsItem[] {
  const out: NewsItem[] = rows.slice(0, max).map((r, i) => ({ key: `r${r.at}:${i}`, text: bustHeadline(r), real: true, who: null }));
  for (const e of rivalLog) {
    if (out.length >= min) break;
    const t = rivalHeadline(e);
    if (t && !out.some((x) => x.text === t)) out.push({ key: `v${e.at}${e.id}`, text: t, real: false, who: rivalById[e.id].who });
  }
  if (out.length < min) for (const x of dailyRivalHeadlines(day, min - out.length)) out.push({ key: `d${day}${x.who}`, text: x.text, real: false, who: x.who });
  return out.slice(0, max);
}

// ── 받기 · 올리기 ─────────────────────────────────────────────────────
interface BustUi { rows: BustRow[]; at: number }
export const useBust = create<BustUi>(() => ({ rows: [], at: 0 }));
const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const FRESH_MS = 120_000;
/** 화면 확인용(장면 건너뛰기 + &pnews=1): 서버에 닿지 않는 시험 줄 */
const DEV_ROWS = (now: number): BustRow[] => [
  { name: '시험 다람쥐 A1', cause: 'liq', coin: 'FLY', dir: 1, lev: 200, loss: 84_000, peak: 120_000, ending: null, lite: true, at: now - 60_000 },
  { name: '시험 토끼 B2', cause: 'interest', coin: null, dir: null, lev: null, loss: 0, peak: 40_000, ending: '딱 맞는 드럼통', lite: true, at: now - 600_000 },
];
/** 최근 소식을 받는다(2분에 한 번까지). 실패하면 그대로 둔다 */
export async function refreshBusts(force = false): Promise<void> {
  const s = useBust.getState();
  const now = Date.now();
  if (!force && now - s.at < FRESH_MS) return;
  useBust.setState({ at: now });
  if (q.get('pdev')) { if (q.get('pnews') === '1') useBust.setState({ rows: DEV_ROWS(now) }); return; }
  try {
    const j = (await getRank('/recent?limit=20')) as { rows?: BustRow[] };
    if (Array.isArray(j.rows)) useBust.setState({ rows: j.rows.filter((r) => r && typeof r.name === 'string') });
  } catch { /* 신문은 단타방 소식으로 버틴다 */ }
}
/** 소식 하나를 올린다(한 번 실패하면 20초 뒤 한 번 더) */
export function postBust(ev: BustEvent, send: (b: BustEvent) => Promise<{ status: number }> = postEvent): void {
  const go = (n: number) => { send(ev).then((r) => { if (r.status >= 500 && n < 1) setTimeout(() => go(n + 1), 20_000); }).catch(() => { if (n < 1) setTimeout(() => go(n + 1), 20_000); }); };
  go(0);
}

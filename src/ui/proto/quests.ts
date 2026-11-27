// FRX 의뢰판(U-56, 회차 15): 거래를 열 번째, 서른 번째에도 새롭게 하는 되풀이 고리.
// 마을 사람(돈을 빌려준 사람들)이 거래 의뢰를 건다. 늘 셋이 걸려 있고, 하나를 끝내면 다음 의뢰가 그 자리에 붙는다.
// 보상은 FRX 거래 도장(등급, 꾸밈뿐: 돈, 수수료, 확률은 그대로)과 집의 트로피 장에 남는 기념품. 경제 숫자는 건드리지 않는다.
// 돌풍(날다람쥐의 10분 마디 바람 세기가 1.9 넘게, 시세 함수와 같은 씨앗)이 부는 동안에는 「돌풍 특보」 의뢰가 하나 더 붙는다.
// 순수 함수만(화면, 저장, 시계 없음). 시험: tests/ui/proto_u56.test.ts
import type { Who } from './protoStore';

/** 닫힌 판 하나(튜토리얼 거래는 넣지 않는다) */
export interface CloseInfo {
  market: string; dir: 1 | -1; lev: number; pnl: number;
  /** 넣은 돈 대비 %(청산은 −100) */ roe: number;
  heldSec: number; kind: 'liq' | 'sl' | 'tp' | 'close';
  /** 다음 수금(이자 + 생활비), 이자 한 번 치 */ claim: number;
  /** 날다람쥐코인(시세 함수 종목) */ fly: boolean;
  /** 닫힌 순간 날다람쥐에 돌풍이 불고 있었다 */ gust?: boolean;
}

export interface Slot { id: string; prog: number; /** 서로 다른 종목(q_three) */ set?: string[]; /** 청산 뒤 다음 판(q_comeback) */ armed?: boolean }
export interface Board {
  /** 지금 걸린 의뢰 셋 */ slots: Slot[];
  /** 다음에 붙일 의뢰의 순번(생의 씨앗으로 섞은 차례에서) */ seq: number;
  /** 이번 생에 끝낸 의뢰 수 */ done: number;
  /** 돌풍 특보 의뢰: 그 돌풍이 끝나는 날다람쥐 시각(초)과 끝냈는가 */ gust: { endsAt: number; done: boolean } | null;
  /** 섞는 씨앗 */ seed: number;
}

export interface QuestDef {
  id: string; who: Who; name: string;
  /** 의뢰 글(무엇을) */ title: string;
  /** 의뢰인이 하는 말 */ line: string;
  need: number; reward: number;
  /** 트로피 장에 남는 것 */ trophy: string;
  /** 이 배율을 쓸 수 있어야 붙는다 */ minCap?: number;
}

export const QUESTS: QuestDef[] = [
  { id: 'short', who: 'weasel', name: '족제비 상인', title: '숏으로 한 판에 이자 한 번 치 벌기', line: '남이 망할 때 버는 돈이 제일 달아.', need: 1, reward: 3, trophy: '족제비의 숏 증서' },
  { id: 'hold50', who: 'viper', name: '독사 대부', title: '50배 넘게, 30초 넘게 들고 이익으로 닫기', line: '버티는 놈이 먹어. 대개는 못 버티지만.', need: 1, reward: 3, trophy: '독사의 모래시계', minCap: 50 },
  { id: 'flytp', who: 'raccoon', name: '창구 너구리', title: '날다람쥐코인 익절에 닿기', line: '날다람쥐는 회사 돈으로 하면 더 재밌어요. 손님 돈이면 더더욱.', need: 1, reward: 2, trophy: '너구리의 날다람쥐 깃털' },
  { id: 'three', who: 'raccoon', name: '창구 너구리', title: '서로 다른 세 종목에서 이익 한 판씩', line: '분산 투자 몰라요? 저는 망할 때도 나눠서 망해요.', need: 3, reward: 3, trophy: '너구리의 분산 바구니' },
  { id: 'sl', who: 'owl', name: '부엉이 지점장', title: '걸어 둔 손절로 판 하나 막기', line: '잘 지는 법을 배우면 오래 집니다. 우리 조합의 영업 비밀이죠.', need: 1, reward: 2, trophy: '부엉이의 손절 안경' },
  { id: 'double', who: 'boss', name: '오소리 대부', title: '넣은 돈을 한 판에 두 배로', line: '두 배로 불려 와. 그럼 이자도 두 배로 받아 주지.', need: 1, reward: 4, trophy: '오소리의 두 배 영수증' },
  { id: 'streak', who: 'weasel', name: '족제비 상인', title: '세 판 연달아 이익(지면 처음부터)', line: '세 번 연달아 이기면 다들 천재라고 불러. 네 번째에 다 잃지.', need: 3, reward: 3, trophy: '족제비의 3연승 리본' },
  { id: 'quick', who: 'viper', name: '독사 대부', title: '20초 안에 +20% 넘게 닫기', line: '빠른 돈이 깨끗한 돈이야. 아무도 못 봤으니까.', need: 1, reward: 3, trophy: '독사의 번개 영수증' },
  { id: 'long2', who: 'owl', name: '부엉이 지점장', title: '롱으로 한 판에 이자 두 번 치', line: '길게 보고 롱. 조합 전단지에는 늘 오른다고 적혀 있죠.', need: 1, reward: 4, trophy: '부엉이의 롱 지팡이' },
  { id: 'lev100', who: 'viper', name: '독사 대부', title: '100배 넘게 걸고 이익으로 닫기', line: '100배 아래는 거래가 아니라 저금이야.', need: 1, reward: 3, trophy: '독사의 100배 송곳니', minCap: 100 },
  { id: 'five', who: 'weasel', name: '족제비 상인', title: '판 다섯 번 닫기(이기든 지든)', line: '수수료는 내가 먹는 게 아니야. 그래도 많이 내 줘.', need: 5, reward: 2, trophy: '족제비의 수수료 장부' },
  { id: 'comeback', who: 'boss', name: '오소리 대부', title: '청산 맞은 다음 판을 이익으로', line: '청산 맞고 바로 다시 들어오는 놈이 내 단골이지.', need: 1, reward: 3, trophy: '오소리의 단골 카드' },
];
/** 돌풍 특보(돌풍이 부는 10분 동안만) */
export const GUST_QUEST: QuestDef = { id: 'gust', who: 'news', name: '도토리일보', title: '돌풍이 부는 동안 날다람쥐코인으로 이익 한 판', line: '돌풍 특보. 오늘 숲에서 날아가는 것은 날다람쥐만이 아니다.', need: 1, reward: 4, trophy: '도토리일보 돌풍 호외' };
export const questById: Record<string, QuestDef> = Object.fromEntries([...QUESTS, GUST_QUEST].map((q) => [q.id, q]));
/** 돌풍의 바람 세기(flyWind.ts gustWord 와 같은 문턱) */
export const GUST_MUL = 1.9;

/** 32비트 섞기 */
function mix(a: number, b: number): number {
  let x = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ 0x27d4eb2f) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return x >>> 0;
}
/** 씨앗과 회차(seq 를 열둘로 나눈 몫)로 섞은 의뢰 차례 */
export function questOrder(seed: number, round: number): string[] {
  const ids = QUESTS.map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = mix(seed + round * 7919, i) % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids;
}
/** 다음에 붙일 의뢰(지금 걸린 것, 이 배율로 못 하는 것은 건너뛴다) */
function nextId(b: Board, cap: number, taken: string[]): { id: string; seq: number } {
  let seq = b.seq;
  for (let k = 0; k < QUESTS.length * 3; k++, seq++) {
    const id = questOrder(b.seed, Math.floor(seq / QUESTS.length))[seq % QUESTS.length];
    const q = questById[id];
    if (taken.includes(id) || (q.minCap && cap < q.minCap)) continue;
    return { id, seq: seq + 1 };
  }
  // 배율이 낮아 붙일 것이 모자라다: 배율이 필요 없는 것 가운데 아직 안 걸린 것
  const id = QUESTS.find((q) => !q.minCap && !taken.includes(q.id))!.id;
  return { id, seq: seq + 1 };
}
/** 새 의뢰판(생마다) */
export function newBoard(seed: number, cap: number): Board {
  let b: Board = { slots: [], seq: 0, done: 0, gust: null, seed: seed >>> 0 };
  for (let i = 0; i < 3; i++) { const n = nextId(b, cap, b.slots.map((s) => s.id)); b = { ...b, slots: [...b.slots, { id: n.id, prog: 0 }], seq: n.seq }; }
  return b;
}
/** 배율 상한이 낮아 못 하는 의뢰가 걸려 있으면(예: 환생 뒤) 다른 것으로 바꾼다 */
export function fitBoard(b: Board, cap: number): Board {
  if (!b.slots.some((s) => (questById[s.id]?.minCap ?? 0) > cap)) return b;
  let out = { ...b, slots: [...b.slots] };
  for (let i = 0; i < out.slots.length; i++) {
    if ((questById[out.slots[i].id]?.minCap ?? 0) <= cap) continue;
    const n = nextId(out, cap, out.slots.map((s) => s.id));
    out = { ...out, slots: out.slots.map((s, k) => (k === i ? { id: n.id, prog: 0 } : s)), seq: n.seq };
  }
  return out;
}

/** 의뢰 하나가 이 판으로 얼마나 나아가는가. 'reset' = 처음부터(연승이 끊김) */
export function judge(id: string, c: CloseInfo, slot: Slot): { add: number; reset?: boolean; set?: string[]; armed?: boolean } {
  const win = c.pnl > 0;
  switch (id) {
    case 'short': return { add: c.dir === -1 && c.claim > 0 && c.pnl >= c.claim ? 1 : 0 };
    case 'hold50': return { add: c.lev >= 50 && c.heldSec >= 30 && win ? 1 : 0 };
    case 'flytp': return { add: c.fly && c.kind === 'tp' && win ? 1 : 0 };
    case 'three': { const set = slot.set ?? []; return win && !set.includes(c.market) ? { add: 1, set: [...set, c.market] } : { add: 0 }; }
    case 'sl': return { add: c.kind === 'sl' ? 1 : 0 };
    case 'double': return { add: c.roe >= 100 ? 1 : 0 };
    case 'streak': return win ? { add: 1 } : c.pnl < 0 ? { add: 0, reset: true } : { add: 0 };
    case 'quick': return { add: c.heldSec <= 20 && c.roe >= 20 ? 1 : 0 };
    case 'long2': return { add: c.dir === 1 && c.claim > 0 && c.pnl >= c.claim * 2 ? 1 : 0 };
    case 'lev100': return { add: c.lev >= 100 && win ? 1 : 0 };
    case 'five': return { add: 1 };
    case 'comeback': return c.kind === 'liq' ? { add: 0, armed: true } : slot.armed && win ? { add: 1, armed: false } : { add: 0, armed: false };
    case 'gust': return { add: c.fly && !!c.gust && win ? 1 : 0 };
    default: return { add: 0 };
  }
}

export interface QuestNews { id: string; prog: number; need: number; done: boolean }
/** 닫힌 판 하나를 의뢰판에 대 본다: 나아간 의뢰, 끝난 의뢰(보상 도장의 합), 새 판 */
export function applyClose(b: Board, c: CloseInfo, cap: number): { board: Board; news: QuestNews[]; stamps: number; finished: string[] } {
  const news: QuestNews[] = [];
  const finished: string[] = [];
  let stamps = 0;
  let out: Board = { ...b, slots: b.slots.map((s) => ({ ...s })) };
  for (let i = 0; i < out.slots.length; i++) {
    const s = out.slots[i];
    const q = questById[s.id];
    if (!q) continue;
    const j = judge(s.id, c, s);
    if (j.set) s.set = j.set;
    if (j.armed !== undefined) s.armed = j.armed;
    if (j.reset && s.prog > 0) { s.prog = 0; news.push({ id: s.id, prog: 0, need: q.need, done: false }); continue; }
    if (j.add <= 0) continue;
    s.prog = Math.min(q.need, s.prog + j.add);
    const done = s.prog >= q.need;
    news.push({ id: s.id, prog: s.prog, need: q.need, done });
    if (done) { stamps += q.reward; finished.push(s.id); }
  }
  // 끝난 자리에 다음 의뢰를 붙인다
  for (const id of finished) {
    const i = out.slots.findIndex((s) => s.id === id);
    const n = nextId(out, cap, out.slots.map((s) => s.id));
    out = { ...out, slots: out.slots.map((s, k) => (k === i ? { id: n.id, prog: 0 } : s)), seq: n.seq, done: out.done + 1 };
  }
  // 돌풍 특보
  if (out.gust && !out.gust.done) {
    const j = judge('gust', c, { id: 'gust', prog: 0 });
    if (j.add > 0) { out = { ...out, gust: { ...out.gust, done: true }, done: out.done + 1 }; stamps += GUST_QUEST.reward; finished.push('gust'); news.push({ id: 'gust', prog: 1, need: 1, done: true }); }
  }
  return { board: out, news, stamps, finished };
}

/** 돌풍 특보를 건다(그 돌풍이 끝나는 시각). 이미 같은 돌풍이면 그대로 */
export function setGust(b: Board, endsAt: number | null): Board {
  if (endsAt === null) return b.gust ? { ...b, gust: null } : b;
  if (b.gust && b.gust.endsAt === endsAt) return b;
  return { ...b, gust: { endsAt, done: false } };
}

/** 화면에 보일 한 줄의 진행: "0/1" */
export const progText = (s: { prog: number }, q: QuestDef): string => `${s.prog}/${q.need}`;
/** 결과 카드나 알림에 쓸 짧은 말 */
export function newsLine(n: QuestNews): string {
  const q = questById[n.id];
  if (!q) return '';
  if (n.done) return `${q.name}의 의뢰 완료, 도장 +${q.reward}`;
  if (n.prog === 0) return `${q.name}의 의뢰 처음부터`;
  return `${q.name}의 의뢰 ${n.prog}/${n.need}`;
}

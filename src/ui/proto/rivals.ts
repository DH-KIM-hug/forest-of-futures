// 숲 단타방(U-56, 회차 15): 돈을 빌려준 마을 사람들도 몰래 선물을 한다. 같은 시세, 같은 순간에 그들의 판이 열리고 터진다.
//   창구 너구리: 회사 돈 200배, 오른 쪽을 쫓는다. 족제비 상인: 숏만 50배. 부엉이 지점장: 롱만 5배, 손절은 칼같이. 독사 대부: 100배, 움직인 반대로.
// 그들의 돈은 내 게임의 돈과 섞이지 않는다(경제 숫자, 전광판 그대로). 판을 열 때의 방향과 기다림은 틱 번호의 해시로 정한다(같은 시세면 같은 판).
// 순수 함수만. 시험: tests/ui/proto_u56.test.ts
import type { Who } from './protoStore';

export interface RivalDef {
  id: 'raccoon' | 'weasel' | 'owl' | 'viper'; who: Who; name: string;
  lev: number; dir: 'chase' | 'fade' | 'long' | 'short'; marginPct: number;
  /** 익절 · 손절 ROE %(null = 없음) */ tp: number; sl: number | null;
  /** 이만큼 들면 그냥 닫는다(초) */ maxHold: number;
  /** 날다람쥐코인을 고르는 몫 */ fly: number;
  lines: { open: string[]; win: string[]; liq: string[]; sl: string[]; bust: string[]; vsWin: string[]; vsLoss: string[] };
}

export const RIVALS: RivalDef[] = [
  { id: 'raccoon', who: 'raccoon', name: '창구 너구리', lev: 200, dir: 'chase', marginPct: 0.3, tp: 60, sl: null, maxHold: 150, fly: 0.75,
    lines: {
      open: ['점심시간이라 회사 돈으로 잠깐만요.', '오르는 건 더 오르죠. 교과서에 그렇게 적혀 있어요.', '이번 건 확실해요. 지난번 것도 확실했고요.'],
      win: ['보셨죠? 실력이에요.', '이 돈으로 지난달 구멍 메워요.', '저 오늘 승진할지도 몰라요.'],
      liq: ['점심값이었는데.', '회사 돈이라 괜찮아요. 아마도요.', '방금 건 연습이었어요.'],
      sl: ['손절은 겁쟁이나 하는 거죠.'],
      bust: ['장부를 한 장 찢었어요. 내일은 새 장부로.', '지점에서 또 빌려 왔어요. 지점장님이 모르시게.'],
      vsWin: ['다람쥐 씨 운이 좋네요. 운도 실력이라던데, 저한텐 없나 봐요.'],
      vsLoss: ['다람쥐 씨도 날렸네요. 우리 같이 회사 다닐래요?'],
    } },
  { id: 'weasel', who: 'weasel', name: '족제비 상인', lev: 50, dir: 'short', marginPct: 0.2, tp: 30, sl: -30, maxHold: 220, fly: 0.5,
    lines: {
      open: ['떨어지는 쪽에 걸었어. 늘 그래.', '남의 눈물로 숏.', '이 숲에 오르는 건 이자뿐이야.'],
      win: ['내려갔지? 내 말이 맞지.', '남이 울 때 나는 웃어. 장사란 그런 거야.'],
      liq: ['어떤 놈이 이걸 올려?', '오늘은 숲이 이상해.'],
      sl: ['손절. 내일 또 숏.', '잘라 냈어. 꼬리는 또 자라.'],
      bust: ['가게 물건을 팔았어. 숏할 밑천이 생겼지.'],
      vsWin: ['너 같은 놈이 오르면 내가 내려가.'],
      vsLoss: ['어이, 같이 울자. 아니, 너만 울어.'],
    } },
  { id: 'owl', who: 'owl', name: '부엉이 지점장', lev: 5, dir: 'long', marginPct: 0.5, tp: 6, sl: -4, maxHold: 600, fly: 0.2,
    lines: {
      open: ['조합 규정상 5배까지만 합니다. 규정은 제가 만들었죠.', '길게 봅니다. 아주 길게.'],
      win: ['연 이자보다 낫군요. 손님들 이자보다는 못하지만.', '규정대로 익절했습니다.'],
      liq: ['5배인데 이게 되나요?'],
      sl: ['규정대로 손절. 감정은 없습니다.', '손절은 조합의 자랑입니다.'],
      bust: ['예금 이자를 조금 덜 드리기로 했습니다.'],
      vsWin: ['젊은 분은 배율이 높군요. 대출 한도도 높여 드릴까요?'],
      vsLoss: ['그 배율이면 그렇게 됩니다. 상담은 창구로.'],
    } },
  { id: 'viper', who: 'viper', name: '독사 대부', lev: 100, dir: 'fade', marginPct: 0.4, tp: 100, sl: null, maxHold: 260, fly: 0.65,
    lines: {
      open: ['다들 오른다길래 반대로.', '군중이 가는 길 반대편에 돈이 떨어져 있지.', '100배. 그 아래는 저금이야.'],
      win: ['봤어? 두 배. 남의 돈으로.', '이 숲의 돈은 결국 내게로 와.'],
      liq: ['…아무도 못 봤지?', '오늘 일은 없던 일이다.'],
      sl: ['칫.'],
      bust: ['뒷골목 금고를 하나 더 열었다.', '빚진 놈들한테 이자를 올렸다. 밑천은 그렇게 생기는 거야.'],
      vsWin: ['다람쥐가 이기는 날도 있군. 기억해 두지.'],
      vsLoss: ['청산 맞았다며? 뒷골목은 늘 열려 있어.'],
    } },
];
export const rivalById: Record<string, RivalDef> = Object.fromEntries(RIVALS.map((r) => [r.id, r]));
/** 생마다 받는 밑천(그들의 장부, 내 돈과 섞이지 않는다) */
export const RIVAL_BANK = 100_000;
/** 청산으로 보는 손실(ROE %) */
export const RIVAL_LIQ_ROE = -90;
const MIN_MARGIN = 1_000;

export interface RivalPos { market: string; dir: 1 | -1; lev: number; entry: number; margin: number; at: number }
export interface RivalOne { bank: number; pos: RivalPos | null; nextAt: number; wins: number; losses: number; liqs: number; busts: number; best: number }
export interface RivalState { t: number; r: Record<string, RivalOne>; seed: number }
export type RivalEventKind = 'open' | 'win' | 'liq' | 'sl' | 'close' | 'bust';
export interface RivalEvent { id: string; kind: RivalEventKind; market: string; dir: 1 | -1; lev: number; pnl: number; roe: number; at: number; line: string }

function mix(a: number, b: number, c = 0): number {
  let x = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d) ^ 0x27d4eb2f) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return x >>> 0;
}
const u = (a: number, b: number, c = 0): number => (mix(a, b, c) + 0.5) / 4294967296;
const RID: Record<string, number> = { raccoon: 1, weasel: 2, owl: 3, viper: 4 };
export const pickLine = (xs: string[], a: number, b: number): string => xs[mix(a, b, 9) % xs.length];

export function newRivals(seed: number, t: number): RivalState {
  const r: Record<string, RivalOne> = {};
  for (const d of RIVALS) r[d.id] = { bank: RIVAL_BANK, pos: null, nextAt: t + 8 + Math.floor(u(seed, RID[d.id], t) * 40), wins: 0, losses: 0, liqs: 0, busts: 0, best: 0 };
  return { t, r, seed: seed >>> 0 };
}
/** 이번 생 그들이 거래로 번 돈(파산해 다시 빌린 밑천은 뺀다) */
export const rivalPnl = (o: RivalOne): number => o.bank - RIVAL_BANK * (1 + o.busts) + (o.pos ? o.pos.margin : 0);
export const roeOf = (p: RivalPos, px: number): number => (px / p.entry - 1) * p.dir * p.lev * 100;

/**
 * 한 틱. prices = 지금 값, moves = 종목마다 지난 30초 값의 쪽(+1 오름, −1 내림, 0), markets = 지금 열 수 있는 종목(날다람쥐가 있으면 그것 먼저)
 * 시간 t 는 게임 틱(초). 열린 판은 틱마다 값에 대 보고, 빈 손이면 nextAt 에 새 판.
 */
export function stepRivals(s: RivalState, t: number, prices: Record<string, number>, moves: Record<string, number>, markets: string[]): { state: RivalState; events: RivalEvent[] } {
  const events: RivalEvent[] = [];
  const r: Record<string, RivalOne> = {};
  for (const d of RIVALS) {
    const o0 = s.r[d.id];
    if (!o0) continue;
    const o: RivalOne = { ...o0, pos: o0.pos ? { ...o0.pos } : null };
    const salt = RID[d.id];
    if (o.pos) {
      const px = prices[o.pos.market];
      if (px > 0) {
        const roe = roeOf(o.pos, px);
        const held = t - o.pos.at;
        const kind: RivalEventKind | null = roe <= RIVAL_LIQ_ROE ? 'liq' : roe >= d.tp ? 'win' : d.sl !== null && roe <= d.sl ? 'sl' : held >= d.maxHold ? 'close' : null;
        if (kind) {
          const pnl = kind === 'liq' ? -o.pos.margin : o.pos.margin * roe / 100;
          o.bank += o.pos.margin + pnl;
          if (pnl > 0) o.wins++; else o.losses++;
          if (kind === 'liq') o.liqs++;
          o.best = Math.max(o.best, pnl);
          const lines = kind === 'liq' ? d.lines.liq : kind === 'sl' ? d.lines.sl : pnl > 0 ? d.lines.win : d.lines.sl;
          events.push({ id: d.id, kind: kind === 'close' && pnl > 0 ? 'win' : kind, market: o.pos.market, dir: o.pos.dir, lev: o.pos.lev, pnl, roe: kind === 'liq' ? -100 : roe, at: t, line: pickLine(lines, s.seed + t, salt) });
          o.pos = null;
          o.nextAt = t + 15 + Math.floor(u(s.seed, salt, t) * 55);
          if (o.bank < MIN_MARGIN * 2) {
            o.busts++; o.bank += RIVAL_BANK;
            events.push({ id: d.id, kind: 'bust', market: '', dir: 1, lev: 0, pnl: 0, roe: 0, at: t, line: pickLine(d.lines.bust, s.seed + t, salt + 5) });
          }
        }
      }
    } else if (t >= o.nextAt && markets.length) {
      const fly = markets.includes('FLY') && u(s.seed, salt * 31, t) < d.fly;
      const others = markets.filter((m) => m !== 'FLY');
      const market = fly || !others.length ? (markets.includes('FLY') ? 'FLY' : markets[0]) : others[mix(s.seed, salt, t) % others.length];
      const px = prices[market];
      if (px > 0) {
        const mv = moves[market] ?? 0;
        const coin: 1 | -1 = u(s.seed, salt * 17, t) < 0.5 ? 1 : -1;
        const dir: 1 | -1 = d.dir === 'long' ? 1 : d.dir === 'short' ? -1 : d.dir === 'chase' ? (mv !== 0 ? (mv > 0 ? 1 : -1) : coin) : (mv !== 0 ? (mv > 0 ? -1 : 1) : coin);
        const margin = Math.max(MIN_MARGIN, Math.floor(o.bank * d.marginPct));
        o.bank -= margin;
        o.pos = { market, dir, lev: d.lev, entry: px, margin, at: t };
        events.push({ id: d.id, kind: 'open', market, dir, lev: d.lev, pnl: 0, roe: 0, at: t, line: pickLine(d.lines.open, s.seed + t, salt) });
      } else o.nextAt = t + 10;
    }
    r[d.id] = o;
  }
  return { state: { ...s, t, r }, events };
}

/** 단타방 순위: 나(이번 생 거래 손익)와 그들. 높은 순 */
export function standings(s: RivalState, me: number, prices: Record<string, number>): { id: string; name: string; pnl: number; me: boolean }[] {
  const rows: { id: string; name: string; pnl: number; me: boolean }[] = RIVALS.filter((d) => s.r[d.id]).map((d) => {
    const o = s.r[d.id];
    const open = o.pos && prices[o.pos.market] > 0 ? Math.max(-o.pos.margin, o.pos.margin * roeOf(o.pos, prices[o.pos.market]) / 100) : 0;
    return { id: d.id, name: d.name, pnl: rivalPnl(o) + open, me: false };
  });
  rows.push({ id: 'me', name: '나', pnl: me, me: true });
  // 같은 손익이면 내가 앞(아직 아무도 안 움직였을 때 꼴찌로 시작하지 않게)
  return rows.sort((a, b) => b.pnl - a.pnl || (a.me ? -1 : b.me ? 1 : 0));
}

/** 내 판과 같은 종목에서 반대로 든 라이벌(있으면 한 명) */
export function opposite(s: RivalState, market: string, dir: 1 | -1): RivalDef | null {
  for (const d of RIVALS) { const p = s.r[d.id]?.pos; if (p && p.market === market && p.dir !== dir) return d; }
  return null;
}

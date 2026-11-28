// 장의 상태를 읽어 준다(U-40). 순수 함수다 — 시세는 건드리지 않는다. 있는 그대로를 말로 옮길 뿐이다.
//   - 종목마다 지난 1분의 출렁임(초 단위 실시간 기록으로만 잰다)
//   - 삼솔전자 · 잣스닥은 주식 시세를 따라가는 종목이라 본장 시간 밖에는 조용하다: "장 마감 · 조용함"
//     본장 시간은 달력으로 알고(삼솔전자 = 서울 09:00~15:30, 잣스닥 = 뉴욕 09:30~16:00, 평일), 정말 조용한지는 시세로 확인한다
//     (휴일은 달력으로 모른다 — 장중인데 안 움직이면 "휴장인 듯"이라고 말한다. 장 마감인데 움직이면 움직인다고 말한다).
//   - 오픈 기념 수수료 무료(엔진 skilltree.ts feeEventLeft)의 화면 글

/** 지난 1분 폭(%)이 이만큼 아래면 "조용함". 초 단위 중간값 기준(회차 2 실측: 조용한 밤의 가운데 값 0.028%) */
export const QUIET_PCT = 0.02;
/** 이만큼 위면 "출렁" */
export const LIVELY_PCT = 0.08;
/** 주식을 따라가는 종목(삼솔전자 · 잣스닥)이 "조용하다"고 볼 문턱. 본장 밖 · 휴장일의 1분 폭은 0.00~0.03%, 본장 중은 0.09% 이상이었다(회차 3 실측, 1분 봉 사흘 반) */
export const SESSION_QUIET_PCT = 0.04;

export type Swing = 'wait' | 'still' | 'calm' | 'lively';
/** 지난 1분 폭 → 네 단계. wait = 아직 재는 중 */
export const swingOf = (rangePct: number | null): Swing => (rangePct === null ? 'wait' : rangePct < QUIET_PCT ? 'still' : rangePct < LIVELY_PCT ? 'calm' : 'lively');
/** 종목 꼬리표에 넣는 짧은 글: "1분 0.08%" */
export const swingText = (rangePct: number | null): string => (rangePct === null ? '계산 중' : `1분 ${rangePct < 0.095 ? rangePct.toFixed(2) : rangePct.toFixed(1)}%`);

// ── 본장 시간(주식을 따라가는 종목) ─────────────────────────────────────
interface SessionDef { tz: string; open: [number, number]; close: [number, number]; home: string }
export const SESSIONS: Record<string, SessionDef> = {
  SMS: { tz: 'Asia/Seoul', open: [9, 0], close: [15, 30], home: '서울' },
  JQQ: { tz: 'America/New_York', open: [9, 30], close: [16, 0], home: '뉴욕' },
};
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/** 그 시간대의 요일 · 시 · 분 */
function wallClock(now: Date, tz: string): { day: number; min: number } {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { day: WD[get('weekday')] ?? 0, min: (+get('hour') % 24) * 60 + +get('minute') };
}
const hm = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String((((m % 1440) + 1440) % 1440) % 60).padStart(2, '0')}`;
/** 본장 시간을 한국 시간으로: 삼솔전자 "09:00~15:30", 잣스닥 "23:30~06:00"(미국 여름 시간에는 "22:30~05:00"). */
export function sessionHoursKst(id: string, now: Date): string | null {
  const s = SESSIONS[id];
  if (!s) return null;
  // 그 시간대와 서울의 시차(분)를 지금 시각으로 잰다(여름 시간이 저절로 들어간다)
  const a = wallClock(now, s.tz), k = wallClock(now, 'Asia/Seoul');
  let diff = k.min - a.min + (k.day - a.day) * 1440;
  diff = ((diff % 1440) + 1440) % 1440; // 요일이 주를 넘겨도 하루 안의 시차만 본다
  return `${hm(s.open[0] * 60 + s.open[1] + diff)}~${hm(s.close[0] * 60 + s.close[1] + diff)}`;
}
/** 달력으로 본장 시간 안인가(평일 · 개장~마감). 휴일은 모른다. */
export function sessionOpen(id: string, now: Date): boolean | null {
  const s = SESSIONS[id];
  if (!s) return null;
  const c = wallClock(now, s.tz);
  if (c.day === 0 || c.day === 6) return false;
  return c.min >= s.open[0] * 60 + s.open[1] && c.min < s.close[0] * 60 + s.close[1];
}

export interface Session {
  /** 달력으로 본장 시간 안 */ open: boolean;
  /** 시세로 본 지난 1분: 조용한가 */ quiet: boolean;
  /** closed = 장 마감 · 조용함 / after = 장 마감인데 움직인다 / holiday = 장중인데 안 움직인다(휴장인 듯) / open = 장중 */
  state: 'closed' | 'after' | 'holiday' | 'open';
  /** 종목 꼬리표의 짧은 딱지(없으면 null) */ badge: string | null;
  /** 시세 줄의 한 줄 */ text: string;
  /** 본장 시간(한국 시간) */ hours: string;
}
/** 주식을 따라가는 종목의 지금 상태. 코인(늘 열려 있다)은 null. rangePct = 지난 1분 폭(%), 아직 못 쟀으면 null → 달력만 믿는다. */
export function sessionOf(id: string, now: Date, rangePct: number | null): Session | null {
  const open = sessionOpen(id, now);
  if (open === null) return null;
  const hours = sessionHoursKst(id, now)!;
  const quiet = rangePct === null ? !open : rangePct < SESSION_QUIET_PCT;
  const state: Session['state'] = open ? (quiet && rangePct !== null ? 'holiday' : 'open') : quiet ? 'closed' : 'after';
  const home = SESSIONS[id].home;
  const text = state === 'closed' ? `본장 마감 (본장 ${hours})`
    : state === 'after' ? `본장 마감, 그래도 움직인다 (본장 ${hours})`
    : state === 'holiday' ? `장중인데 조용함, ${home} 휴장인 듯`
    : `장중 (본장 ${hours})`;
  return { open, quiet, state, badge: state === 'closed' ? '장 마감' : state === 'holiday' ? '휴장?' : null, text, hours };
}

// ── 장 전체가 조용한가 ───────────────────────────────────────────────────
/** 잰 종목이 셋 이상이고 전부 조용하면 true(주인공 · 오소리 대부가 그렇다고 말한다) */
export function allQuiet(ranges: (number | null)[]): boolean {
  const got = ranges.filter((r): r is number => r !== null);
  return got.length >= 3 && got.every((r) => r < QUIET_PCT);
}
/** 가장 출렁이는 종목(전부 조용하거나 아직 못 쟀으면 null) */
export function liveliest(ranges: { id: string; r: number | null }[]): { id: string; r: number } | null {
  let best: { id: string; r: number } | null = null;
  for (const x of ranges) if (x.r !== null && x.r >= QUIET_PCT && (!best || x.r > best.r)) best = { id: x.id, r: x.r };
  return best;
}

// ── 지금 출렁이는 곳(U-53) ─────────────────────────────────────────────
/** 초 단위 실시간 값(1초에 하나)을 1분 봉으로 묶어, 끝에서부터 다 찬 봉 mins 개의 높낮이 폭(%, 봉의 종가 대비) 평균. 다 찬 봉이 하나도 없으면 null */
export function candleSwing(live: number[], mins = 3): { pct: number; bars: number } | null {
  const bars = Math.min(mins, Math.floor(live.length / 60));
  if (bars < 1) return null;
  let sum = 0;
  for (let k = 0; k < bars; k++) {
    const c = live.slice(live.length - 60 * (k + 1), live.length - 60 * k);
    const last = c[c.length - 1];
    if (!(last > 0)) return null;
    sum += ((Math.max(...c) - Math.min(...c)) / last) * 100;
  }
  return { pct: sum / bars, bars };
}
/** 거래소에서 받은 진짜 1분 봉(시작할 때 받아 온 지난 하루 봉 + 그 뒤 실시간으로 채운 봉, dayHistory)으로 같은 셈을 한다(회차 13).
 *  다 찬 봉(끝난 분)만, 끝에서부터 mins 개. 맨 끝 봉이 지금에서 3분 넘게 떨어져 있으면(오래된 봉) null — 지금의 출렁임이 아니다. */
export function barSwing(bars: { t: number; h: number; l: number; c: number }[], nowMs: number, mins = 3): { pct: number; bars: number } | null {
  const done = bars.filter((b) => b.t + 60_000 <= nowMs);
  const use = done.slice(-mins);
  if (!use.length || nowMs - (use[use.length - 1].t + 60_000) > 3 * 60_000) return null;
  let sum = 0;
  for (const b of use) { if (!(b.c > 0) || !(b.h >= b.l)) return null; sum += ((b.h - b.l) / b.c) * 100; }
  return { pct: sum / use.length, bars: use.length };
}
/** 실제 시세 종목의 순위: 1분 봉 폭이 큰 순서로 n 개. 못 잰 종목, 쉬는 종목(본장 마감)은 뺀다.
 *  초 단위 실시간 값으로 다 찬 봉이 mins 개 모이기 전에는 거래소의 진짜 1분 봉(bars)으로 잰다(회차 13: 접속하자마자 뜬다). 둘 다 진짜 시세의 봉이다 */
export function swingRank(xs: { id: string; live: number[]; shut?: boolean; bars?: { t: number; h: number; l: number; c: number }[] }[], n = 3, mins = 3, nowMs = Date.now()): { id: string; pct: number; bars: number }[] {
  const pick = (x: (typeof xs)[number]) => {
    const a = candleSwing(x.live, mins);
    if (a && a.bars >= mins) return a;
    const b = x.bars ? barSwing(x.bars, nowMs, mins) : null;
    return b && (!a || b.bars > a.bars) ? b : a;
  };
  return xs.filter((x) => !x.shut).map((x) => ({ id: x.id, s: pick(x) })).filter((x): x is { id: string; s: { pct: number; bars: number } } => x.s !== null)
    .map((x) => ({ id: x.id, pct: x.s.pct, bars: x.s.bars })).sort((a, b) => b.pct - a.pct).slice(0, n);
}

// ── 오픈 기념 수수료 무료 ────────────────────────────────────────────────
/** 주문 판의 딱지: 남은 정산 수 → 글. 끝났으면 지금 수수료율을 말한다. */
export function feeEventChip(left: number, ratePct: number): { on: boolean; text: string } {
  return left > 0
    ? { on: true, text: `오픈 기념 수수료 무료, 정산 ${left}번 남음` }
    : { on: false, text: `거래 수수료 ${ratePct.toFixed(ratePct < 0.01 ? 3 : 2)}%` };
}
/** 이벤트 동안 수수료 없이 오간 크기(명목) → 끝난 뒤의 수수료율로 쳤다면 냈을 돈(들어갈 때 + 나올 때) */
export const feeSaved = (eventNotional: number, afterRate: number): number => Math.round(eventNotional * afterRate * 2);

// ── 본장까지 남은 시간(U-42, 회차 5): 달력으로 아는 것만 말한다(평일 개장 시각). 휴장일은 달력으로 모른다 ─────────
/** 다음 본장 개장까지 남은 분(달력: 평일 · 그 시간대의 개장 시각). 지금 본장 중이면 0, 주식을 따라가지 않는 종목은 null */
export function opensInMin(id: string, now: Date): number | null {
  const s = SESSIONS[id];
  if (!s) return null;
  const c = wallClock(now, s.tz);
  const open = s.open[0] * 60 + s.open[1], close = s.close[0] * 60 + s.close[1];
  const weekday = (d: number) => d >= 1 && d <= 5;
  if (weekday(c.day) && c.min >= open && c.min < close) return 0;
  if (weekday(c.day) && c.min < open) return open - c.min;
  // 오늘은 끝났다(또는 주말): 다음 평일의 개장 시각까지
  let days = 1;
  while (!weekday((c.day + days) % 7)) days++;
  return days * 1440 - c.min + open;
}
/** "2시간 13분" · "41분" · "이틀 3시간" */
export function spanText(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m >= 2880) return `${Math.floor(m / 1440)}일 ${Math.floor((m % 1440) / 60)}시간`;
  if (m >= 60) return `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`;
  return `${m}분`;
}
/** 시세 줄 · 조용한 장의 한 줄에 붙이는 글: "본장까지 2시간 13분". 본장 중이거나 주식을 따라가지 않으면 null */
export function opensInText(id: string, now: Date): string | null {
  const m = opensInMin(id, now);
  return m === null || m <= 0 ? null : `본장까지 ${spanText(m)}`;
}
/** 개장을 미리 알리는 때(분 전). 달력으로 아는 것이라 "달력으로는"을 붙여 말한다 */
export const OPEN_HEADS_UP = [30, 10, 1];
/** 지금 알릴 것이 있는가: 남은 분이 문턱에 막 닿았으면 그 문턱. said = 이미 알린 열쇠("SMS:30@날짜") */
export function openHeadsUp(id: string, now: Date, said: Set<string>): { min: number; key: string } | null {
  const m = opensInMin(id, now);
  if (m === null || m <= 0) return null;
  const thr = OPEN_HEADS_UP.find((t) => m === t);
  if (thr === undefined) return null;
  const key = `${id}:${thr}@${Math.floor((now.getTime() + m * 60000) / 3600000)}`;
  return said.has(key) ? null : { min: thr, key };
}
/** 어제 그 시(한국 시간)까지 남은 분: 지금이 그 시 안이면 0 */
export function untilHourMin(hourKst: number, now: Date): number {
  const k = wallClock(now, 'Asia/Seoul');
  const d = hourKst * 60 - k.min;
  return d <= 0 && d > -60 ? 0 : (d + 1440) % 1440;
}

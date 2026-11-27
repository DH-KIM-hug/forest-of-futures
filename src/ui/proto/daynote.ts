// 도토리일보 시세면(U-41, 회차 4): 지난 몇 시간 동안 다섯 종목이 실제로 얼마나 움직였는지를 한 장으로 읽어 준다.
// 숫자는 전부 받은 시세에서 센 것이다(실시간 판 = 시작할 때 받아 온 지난 24시간의 1분 봉 + 그 뒤의 실시간 값, 연습 시세 판 = 이 판이 시작된 뒤의 값).
// 시세는 건드리지 않는다. 예측도 하지 않는다 — "지난 하루 중 가장 시끄러웠던 때"와 "지금은 평소의 몇 배인가"를 말할 뿐이다.
import { josa } from '../../engine/util';
import { useProto } from './protoStore';

import { type MinBar } from '../dayHistory';
export { setDayHistory, pushDayPrice, dayBars, resetDay, DAY_MINUTES, type MinBar } from '../dayHistory';
export const dayNoteOpen = (on: boolean): void => useProto.getState().patch({ dayNote: on });

// ── 읽기(순수 함수) ─────────────────────────────────────────────────────
const med = (a: number[]): number => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const kstHour = (t: number): number => (new Date(t).getUTCHours() + 9) % 24;

export interface NoteRow {
  id: string; name: string;
  /** 지난 1시간 · 6시간 · 24시간의 오르내림(%). 기록이 모자라면 null */ h1: number | null; h6: number | null; h24: number | null;
  /** 지난 6시간(모자라면 있는 만큼)의 고저 폭(%) */ range: number | null;
  /** 지금(지난 30분)의 1분 폭 가운데 값(%) · 지난 하루 전체의 가운데 값(%) */ now1m: number | null; day1m: number | null;
  /** 지금이 평소의 몇 배인가 */ ratio: number | null;
  /** 지난 하루 중 가장 시끄러웠던 시(한국 시간)와 그때의 1분 폭 가운데 값(%) */ loudHour: number | null; loud1m: number | null;
}
export interface DayNote {
  /** 기록의 길이(분) */ spanMin: number;
  rows: NoteRow[];
  /** 머리기사 · 버금 기사 */ headline: string; sub: string;
  /** 오소리 대부의 한마디(숫자에서 나온 것만) */ boss: string;
}

function rowOf(id: string, name: string, bars: MinBar[], now: number): NoteRow {
  const out: NoteRow = { id, name, h1: null, h6: null, h24: null, range: null, now1m: null, day1m: null, ratio: null, loudHour: null, loud1m: null };
  if (bars.length < 3) return out;
  const last = bars[bars.length - 1];
  const chg = (min: number): number | null => {
    const from = now - min * 60000;
    if (bars[0].t > from + min * 60000 * 0.1) return null; // 그 창의 9할은 있어야 한다
    const b = bars.find((x) => x.t >= from) ?? bars[0];
    return (last.c / b.o - 1) * 100;
  };
  out.h1 = chg(60); out.h6 = chg(360); out.h24 = chg(1380);
  const win = bars.filter((b) => b.t >= now - 360 * 60000);
  if (win.length >= 3) out.range = ((Math.max(...win.map((b) => b.h)) - Math.min(...win.map((b) => b.l))) / last.c) * 100;
  const r1 = (b: MinBar) => ((b.h - b.l) / b.c) * 100;
  const recent = bars.filter((b) => b.t >= now - 30 * 60000);
  if (recent.length >= 5) out.now1m = med(recent.map(r1));
  if (bars.length >= 60) out.day1m = med(bars.map(r1));
  if (out.now1m !== null && out.day1m !== null && out.day1m > 0) out.ratio = out.now1m / out.day1m;
  // 가장 시끄러웠던 시: 그 시에 봉이 20개는 있어야 센다
  const by: Record<number, number[]> = {};
  for (const b of bars) (by[kstHour(b.t)] ??= []).push(r1(b));
  let best = -1, bestV = 0;
  for (const [h, v] of Object.entries(by)) { if (v.length < 20) continue; const m = med(v); if (m > bestV) { bestV = m; best = +h; } }
  if (best >= 0 && bars.length >= 180) { out.loudHour = best; out.loud1m = bestV; }
  return out;
}

const pc = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(Math.abs(x) >= 10 ? 1 : d)}%`;
const span = (min: number) => (min >= 90 ? `${Math.round(min / 60)}시간` : `${Math.max(1, Math.round(min))}분`);

/** 시세면 한 장. markets = [{id, name}] (화면 순서), bars = 종목마다 1분 봉(시간순) */
export function dayNote(markets: { id: string; name: string }[], bars: Record<string, MinBar[]>, now: number): DayNote {
  const rows = markets.map((m) => rowOf(m.id, m.name, bars[m.id] ?? [], now));
  const spanMin = Math.max(0, ...markets.map((m) => { const b = bars[m.id] ?? []; return b.length ? (now - b[0].t) / 60000 : 0; }));
  const got = rows.filter((r) => r.range !== null);
  if (!got.length) return { spanMin, rows, headline: '아직 실을 시세가 없습니다.', sub: '몇 분 뒤에 다시 펴 보세요.', boss: '시세가 한 시간 치 모이면 첫 호가 나옵니다.' };
  const win = span(Math.min(360, spanMin));
  const top = got.reduce((a, b) => (b.range! > a.range! ? b : a));
  const low = got.reduce((a, b) => (b.range! < a.range! ? b : a));
  const headline = `지난 ${win}, ${top.name}의 고저 폭 ${top.range!.toFixed(2)}%`;
  const sub = top.id === low.id ? '다른 종목은 아직 기록이 모자랍니다.' : `가장 조용했던 곳은 ${low.name} (${low.range!.toFixed(2)}%)`;
  // 오소리 대부: 지금이 평소보다 조용한가 시끄러운가(가운데 값의 비), 하루 중 언제가 시끄러웠는가
  const rs = rows.filter((r) => r.ratio !== null);
  const loud = rows.filter((r) => r.loudHour !== null);
  let boss: string;
  if (rs.length >= 3) {
    const avg = rs.reduce((a, r) => a + r.ratio!, 0) / rs.length;
    const hot = rs.reduce((a, b) => (b.now1m! > a.now1m! ? b : a));
    const lt = loud.length ? loud.reduce((a, b) => (b.loud1m! > a.loud1m! ? b : a)) : null;
    const when = lt ? ` 어제는 ${lt.loudHour}시 무렵 ${josa(lt.name, '이었고요.', '였고요.')}` : '';
    boss = avg < 0.6 ? `오늘은 조용한 편입니다.${when}`
      : `지금 제일 뛰는 건 ${hot.name}입니다.${when}`;
  } else boss = spanMin < 60 ? '시세가 한 시간 치 모이면 첫 호가 나옵니다.' : '기록이 모자란 종목은 뺐습니다.';
  return { spanMin, rows, headline, sub, boss };
}
/** 표의 한 칸: "+0.42%" 또는 "–" */
export const cell = (x: number | null): string => (x === null ? '–' : pc(x));
/** 한 줄 알림용(거래소를 처음 펼 때): "[도토리일보 시세면] 지난 6시간, 삼솔전자의 고저 폭 2.10% · 가장 조용했던 곳은 멍도토 (0.31%)" */
export const noteToast = (n: DayNote): string => `[도토리일보 시세면] ${n.headline}. ${n.sub}`;

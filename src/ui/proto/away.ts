// 자리를 비운 사이 보고서(U-39 ④ → U-58). 엔진의 따라잡기(offline.ts catchUp)가 돌려준 기록을 한 장으로 읽는다. 순수 함수다. 새 규칙은 없다.
// 엔진 규칙(U-58): 포지션은 비운 시간 전부 진짜 시세를 탄다(봉마다 청산 → 손절 → 익절). 정산 시계는 멈춘다(이자, 생활비, 일당, 연체, 압류 없음).
// 그래서 이 장에는 포지션에 일어난 일만 적고, 추심원은 한 줄로 기다렸다고만 한다.
import type { AwayReport } from '../../engine/types';

const n = (x: number) => Math.round(Math.abs(x)).toLocaleString('ko-KR');
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${n(x)}`;
export function awayDur(sec: number): string {
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간` : h >= 1 ? `${h}시간 ${m % 60}분` : m >= 1 ? `${m}분` : `${Math.max(1, Math.round(sec))}초`;
}

export interface AwayPurse { cash: number; debt: number }
export interface AwayRow { key: string; text: string; amount: number | null; tone: 'plain' | 'loss' | 'gain'; /** 나간 지 얼마 만에 */ after: string | null }
export interface AwayCard {
  title: string;
  /** 추심원의 쪽지 한 줄: 문 앞에서 기다렸고 이자는 안 붙었다(U-58). 정산 한 번 길이도 안 비웠으면 없다 */ note: string | null;
  rows: AwayRow[];
  /** 떠날 때 열려 있던 포지션(이름) */ left: string[];
  /** 아직 열려 있는 포지션 수 */ stillOpen: number;
  cashDelta: number; debtDelta: number;
  bankrupt: boolean;
}
const END = /^(liq|sl|tp|close)$/;

/** 추심원이 문 앞에서 기다렸다는 한 줄(U-58). 정산 한 번 길이도 안 비웠으면 없다. 오래 비울수록 말만 바뀐다 */
export function waitedNote(awaySec: number, interval: number): string | null {
  if (awaySec < interval) return null;
  if (awaySec < 3600) return '문 앞에서 기다렸어요. 안 계시면 안 받아요. 이자도 안 붙였어요.';
  if (awaySec < 12 * 3600) return '문 앞에 쭈그려 앉아 기다렸어요. 다리 저려요. 이자는 안 붙였어요.';
  return '문 앞에서 밤을 샜어요. 이자는 안 붙였어요. 대신 이제 놓치지 않아요.';
}

/** names = 종목 id → 이름. before/after = 떠날 때와 돌아왔을 때의 현금, 빚. openNow = 지금 열려 있는 포지션 수. interval = 정산 간격(초) */
export function awayCard(r: AwayReport, before: AwayPurse, after: AwayPurse, o: { names: Record<string, string>; openNow: number; interval: number }): AwayCard {
  const rows: AwayRow[] = [];
  for (const e of r.entries ?? []) {
    if (!END.test(e.kind)) continue; // 포지션에 일어난 일만(U-58: 정산, 연체, 압류는 비운 사이에 없다)
    const amt = e.amount ?? null;
    rows.push({
      key: `${e.tick}:${e.kind}:${rows.length}`, text: e.text, amount: amt,
      tone: e.kind === 'liq' || (amt ?? 0) < 0 ? 'loss' : (amt ?? 0) > 0 ? 'gain' : 'plain',
      after: `나간 지 ${awayDur(Math.max(0, e.tick - r.fromTick))}`,
    });
  }
  const note = waitedNote(r.awaySec, Math.max(1, o.interval));
  return {
    title: `자리를 비운 ${awayDur(r.awaySec)}`, note, rows,
    left: r.openAtLeave.map((p) => `${o.names[p.market] ?? p.market} ${p.dir === 1 ? '롱' : '숏'} ${p.lev}배`),
    stillOpen: o.openNow, cashDelta: after.cash - before.cash, debtDelta: after.debt - before.debt, bankrupt: r.bankrupt,
  };
}
export const awayMoney = signed;

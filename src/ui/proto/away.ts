// 자리를 비운 사이 보고서(U-39 ④). 엔진의 따라잡기(offline.ts catchUp)가 돌려준 기록을 한 장으로 읽는다. 순수 함수다. 새 규칙은 없다.
// 엔진 규칙: 포지션은 비운 시간 전부 움직이고(봉마다 청산 → 손절 → 익절), 정산은 2번까지만 돈다(연체로 파산하기 직전에서 멈춘다).
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
  /** 추심원의 쪽지 한 줄(정산이 돌았거나, 돌 만큼 비웠을 때) */ note: string | null;
  rows: AwayRow[];
  /** 떠날 때 열려 있던 포지션(이름) */ left: string[];
  /** 아직 열려 있는 포지션 수 */ stillOpen: number;
  cashDelta: number; debtDelta: number;
  bankrupt: boolean;
}
const END = /^(liq|sl|tp|close)$/;

/** names = 종목 id → 이름. before/after = 떠날 때와 돌아왔을 때의 현금·빚. openNow = 지금 열려 있는 포지션 수. interval = 정산 간격(초) */
export function awayCard(r: AwayReport, before: AwayPurse, after: AwayPurse, o: { names: Record<string, string>; openNow: number; interval: number }): AwayCard {
  const rows: AwayRow[] = [];
  for (const e of r.entries ?? []) {
    if (!END.test(e.kind) && e.kind !== 'quit:hamster' && !e.kind.startsWith('seize:') && !e.kind.startsWith('overdue:')) continue;
    const amt = e.amount ?? null;
    const isEnd = END.test(e.kind);
    rows.push({
      key: `${e.tick}:${e.kind}:${rows.length}`, text: e.text, amount: isEnd ? amt : null,
      tone: e.kind === 'liq' || (isEnd && (amt ?? 0) < 0) || !isEnd ? 'loss' : (amt ?? 0) > 0 ? 'gain' : 'plain',
      after: `나간 지 ${awayDur(Math.max(0, e.tick - r.fromTick))}`,
    });
  }
  const s = r.settlementSummary;
  const could = Math.floor(r.awaySec / Math.max(1, o.interval));
  let note: string | null = null;
  if (r.economySettlements > 0) {
    note = `안 계셔서 ${r.economySettlements}번만 걷고 갔어요오. 이자 ${n(s.interest)}.`;
    if (could > r.economySettlements) note += ' 빈 집에선 더 안 걷어요오.';
  } else if (could >= 1) note = '안 계셔서 그냥 갔어요오. 다음 정산에 봬요오.';
  return {
    title: `자리를 비운 사이 · ${awayDur(r.awaySec)}`, note, rows,
    left: r.openAtLeave.map((p) => `${o.names[p.market] ?? p.market} ${p.dir === 1 ? '롱' : '숏'} ${p.lev}배`),
    stillOpen: o.openNow, cashDelta: after.cash - before.cash, debtDelta: after.debt - before.debt, bankrupt: r.bankrupt,
  };
}
export const awayMoney = signed;

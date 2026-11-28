// 빌리기와 갚기(지도의 가게 카드와 라이트 거래소의 「대출」이 같이 쓴다, U-61).
// 엔진 행동(borrow, stamp)과 그 둘레의 이야기(독사의 선이자 조건, 첫 대출의 차용증, 라이트의 빚의 유혹 만화, 캐피탈의 조건 설명)는 한 곳에만 있다.
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { onFirstOfficeLoan, shortAtSettle } from './watch';
import { clone } from '../../engine/game';
import { act as engineAct } from '../../engine/actions';
import { lenderById } from '../../engine/data';
import { interestDue, lenderLimit, nextBorrowRate } from '../../engine/selectors';
import type { GameState, LenderId } from '../../engine/types';
import { comma } from '../../engine/util';
import { forecast } from '../../engine/settlement';
import { ratePct } from './model';
import { PLACE, STORY } from './text';
import { isLite } from './config';
import { temptOnBorrow } from './lite/liteBeats';
import { play } from './audio';
import { needsSign, openMainSign } from './loanSign';
import { useRank } from './ranking';

export const LENDER_IDS = ['shark1', 'capital', 'bank', 'shark2'] as const;
export const manTxt = (x: number) => (x >= 10000 && x % 10000 === 0 ? `${x / 10000}만` : comma(x));

/** 아는 돈줄: 오소리 사무소는 늘, 캐피탈과 조합은 캐피탈의 문자 뒤, 뒷골목은 모르는 번호의 문자 뒤(U-38) */
export function knownLenders(g: GameState, s: { loanTaken: boolean; capitalKnown: boolean; viperKnown: boolean }): LenderId[] {
  return LENDER_IDS.filter((id) => id === 'shark1' || (s.loanTaken && (id === 'shark2' ? s.viperKnown && g.run.shark2Open : s.capitalKnown)));
}
export const knownNow = (g: GameState): LenderId[] => {
  const P = useProto.getState();
  return knownLenders(g, { loanTaken: P.loanTaken, capitalKnown: !!P.seen.capitalSms, viperKnown: !!P.seen.viperSms });
};

/** 한 돈줄에서 지금 빌릴 수 있는 한 단위(남은 한도 안), 받는 돈(선이자 뺀 것). 조합은 집이 있어야 문이 열린다 */
export function borrowRoom(g: GameState, id: LenderId): { room: number; amt: number; got: number; open: boolean } {
  const l = lenderById[id];
  const room = Math.max(0, lenderLimit(g, id) - g.run.debts[id].principal);
  const amt = Math.min(l.borrowUnit!, room);
  const open = !(id === 'bank' && g.run.house <= 0);
  return { room, amt: open ? amt : 0, got: open ? Math.floor(amt * (1 - (l.upfront ?? 0))) : 0, open };
}

/** 급할 때 한 번 누르면 빌리는 곳(U-61): 아는 곳 가운데 지금 빌릴 수 있고 다음 금리가 가장 싼 곳 */
export function cheapestOpen(g: GameState, known: readonly LenderId[]): { id: LenderId; amt: number; got: number; ratePct: number } | null {
  let best: { id: LenderId; amt: number; got: number; ratePct: number; rate: number } | null = null;
  for (const id of known) {
    const b = borrowRoom(g, id);
    if (b.amt <= 0) continue;
    const rate = nextBorrowRate(g, id);
    if (!best || rate < best.rate) best = { id, amt: b.amt, got: b.got, ratePct: ratePct(rate), rate };
  }
  return best && { id: best.id, amt: best.amt, got: best.got, ratePct: best.ratePct };
}

/** 빌리라고 한 번 묻는 때(U-61): 주문할 증거금이 모자라다(order), 또는 정산이 10초 안인데 손의 돈이 모자라다(settle). 판이 이어지는 동안만 */
export type QuickWhy = 'order' | 'settle';
export function quickBorrowWhy(g: GameState, o: { orderShort: boolean }): QuickWhy | null {
  const run = g.run;
  if (run.over) return null;
  if (run.settleIn <= 10 && run.settleIn >= 0 && shortAtSettle(g) > 0) return 'settle';
  if (o.orderShort) return 'order';
  return null;
}

/** 다음 정산에 낼 돈(이자 + 생활비 + 일당) */
export const dueNext = (g: GameState): number => { const f = forecast(g); return f.interest + f.living + f.wages; };

/** 빌린다. 처음 오소리 사무소: 이름이 없으면 차용증부터. 뒷골목의 처음: 독사가 조건부터 말한다. 결과 한 줄을 돌려준다(장면으로 넘어갔으면 null) */
export function borrowAt(id: LenderId, onMsg: (m: string) => void, agreed = false): void {
  const before = useGame.getState().g;
  const firstAt = ((before.run.stats[`borrow.${id}`] as number | undefined) ?? 0) === 0;
  if (id === 'shark2' && firstAt && !agreed) {
    const l2 = lenderById.shark2;
    const unit = Math.min(l2.borrowUnit!, Math.max(0, lenderLimit(before, 'shark2') - before.run.debts.shark2.principal));
    const got = Math.floor(unit * (1 - (l2.upfront ?? 0)));
    useProto.getState().pushScene({ id: 'viperOffer', again: true, lines: STORY.viperOffer({ unit, got, ratePct: ratePct(l2.rate) }),
      choices: [
        { id: 'take', label: `${manTxt(got)} 받기`, sub: `빚 +${manTxt(unit)}`, primary: true, run: () => borrowAt('shark2', onMsg, true) },
        { id: 'leave', label: '돌아선다', run: () => onMsg('뒷골목: 등 뒤로 문고리가 제자리로 돌아간다.') },
      ] });
    return;
  }
  if (id === 'shark1' && !useProto.getState().loanTaken && !agreed && needsSign(useRank.getState().name)) { play('ui_tap'); openMainSign(() => borrowAt('shark1', onMsg, true)); return; }
  const r = useGame.getState().act({ type: 'borrow', lender: id, consent: true });
  play(r.ok ? 'collector_paid' : 'insufficient');
  onMsg(r.ok ? `${PLACE[id].name}: +${comma(r.amount ?? 0)}. 이제 정산마다 이자 ${comma(interestDue(useGame.getState().g, id))}.` : r.msg ?? '지금은 처리할 수 없어요');
  if (r.ok && id === 'shark1') onFirstOfficeLoan(before);
  if (r.ok && isLite) temptOnBorrow(before, id, r.amount ?? 0);
  if (r.ok && id === 'capital' && firstAt) useProto.getState().pushScene({ id: 'capitalIntro', lines: STORY.capitalIntro({ amount: r.amount ?? 0, ratePct: ratePct(lenderById.capital.rate) }) });
}

/** 갚는다(도장 한 번 = stampUnit, 'all' = 손에 있는 만큼 전부). 처음 다 갚은 축하는 watch.ts 가 빚이 0 이 되는 것을 보고 띄운다 */
export function payAt(id: LenderId, mult: number | 'all', onMsg: (m: string) => void): void {
  const r = useGame.getState().act({ type: 'stamp', lender: id, mult });
  play(r.ok ? 'collector_paid' : 'insufficient');
  onMsg(r.ok ? `${PLACE[id].name}: 원금 ${comma(r.paid ?? 0)} 갚았다` : r.msg === '현금 부족' ? '도토리가 부족해요' : r.msg ?? '지금은 처리할 수 없어요');
}

/** 전부 갚기 경고(회차 15): 전부 갚으면 다음 정산에 모자라 연체가 되는가. 모자라는 돈, 아니면 null */
export function payAllWarn(g: GameState, id: LenderId): { left: number; short: number } | null {
  const run = g.run, d = run.debts[id];
  if (d.principal <= 0) return null;
  const all = Math.min(d.principal, Math.floor(run.cash));
  const left = Math.floor(run.cash) - all;
  if (all <= 0 || left >= dueNext(g)) return null;
  const g2 = clone(g);
  if (!engineAct(g2, { type: 'stamp', lender: id, mult: 'all' }).ok) return null;
  const short = shortAtSettle(g2);
  return short > 0 ? { left, short } : null;
}

// 라이트의 「대출」(U-61, 사용자 결정): 지도 탭을 없애고 빌리고 갚는 곳을 거래소 안으로. 만화 지면(시안 A) 한 장에 돈줄마다 얼굴 칸 하나.
// 행동과 이야기(차용증, 빚의 유혹, 독사의 조건, 전부 갚기 경고, 처음 다 갚은 축하)는 지도와 같은 길(loanActs.ts)을 쓴다.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useGame } from '../../../store/gameStore';
import { useProto } from '../protoStore';
import { lenderById } from '../../../engine/data';
import { interestDue, nextBorrowRate } from '../../../engine/selectors';
import type { LenderId } from '../../../engine/types';
import { comma } from '../../../engine/util';
import { ratePct } from '../model';
import { PLACE, STORY } from '../text';
import { sprite, type SpriteId } from '../sprites';
import { play } from '../audio';
import { say } from '../watch';
import { LENDER_IDS, borrowAt, borrowRoom, cheapestOpen, knownLenders, manTxt, payAllWarn, payAt, type QuickWhy } from '../loanActs';
import './liteLoan.css';

interface LoanUi { open: boolean; focus: LenderId | null }
export const useLoanUi = create<LoanUi>(() => ({ open: false, focus: null }));
export const openLoan = (focus: LenderId | null = null): void => { useLoanUi.setState({ open: true, focus }); };
export const closeLoan = (): void => useLoanUi.setState({ open: false, focus: null });

/** 돈줄의 얼굴(반신): 오소리 대부, 창구 너구리, 부엉이 지점장, 독사 대부 */
export const LENDER_FACE: Record<LenderId, SpriteId> = { shark1: 'boss', capital: 'raccoon', bank: 'owl', shark2: 'viper' } as Record<LenderId, SpriteId>;

/** 머리의 「대출」 단추(빚 칩 옆). FLY 길잡이가 비추는 자리 */
export function LoanButton() {
  const od = useGame((s) => Object.values(s.g.run.debts).some((d) => d.overdue > 0));
  return (
    <button className={'lt-loanbtn' + (od ? ' hot' : '')} data-loan-open data-hl="loan" onClick={() => { play('ui_tap'); openLoan(); }} aria-label="대출: 빌리기와 갚기">대출</button>
  );
}

export function LiteLoan() {
  const open = useLoanUi((s) => s.open);
  const focus = useLoanUi((s) => s.focus);
  const g = useGame((s) => s.g);
  const loanTaken = useProto((s) => s.loanTaken);
  const capitalKnown = useProto((s) => !!s.seen.capitalSms);
  const viperKnown = useProto((s) => !!s.seen.viperSms);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!open) setMsg(null); }, [open]);
  useEffect(() => {
    if (!open || !focus) return;
    const t = window.setTimeout(() => document.querySelector(`[data-loan-row="${focus}"]`)?.scrollIntoView({ block: 'nearest' }), 60);
    return () => window.clearTimeout(t);
  }, [open, focus]);
  if (!open) return null;
  const run = g.run;
  const ids = knownLenders(g, { loanTaken, capitalKnown, viperKnown });
  const total = LENDER_IDS.reduce((a, id) => a + run.debts[id].principal, 0);
  return (
    <div className="lt-loan" role="dialog" aria-label="대출" data-loan onClick={closeLoan}>
      <div className="ll-page" onClick={(e) => e.stopPropagation()}>
        <div className="ll-head"><b>대출</b><span>빚 {comma(total)}, 손에 {comma(Math.floor(run.cash))}</span><button className="ll-x" data-loan-close aria-label="대출 닫기" onClick={() => { play('ui_tap'); closeLoan(); }}>닫기</button></div>
        {msg && <div className="ll-msg" role="status" data-loan-msg>{msg}</div>}
        <div className="ll-list">
          {ids.map((id) => {
            const l = lenderById[id], d = run.debts[id], pl = PLACE[id];
            const face = sprite(LENDER_FACE[id]);
            const b = borrowRoom(g, id);
            if (!b.open) {
              return (
                <div key={id} className="ll-row locked" data-loan-row={id} onClick={() => useProto.getState().pushScene({ id: 'owlRefuse', again: true, auto: 3500, lines: STORY.owlRefuse() })}>
                  {face && <img className="ll-face" src={face.src} alt="" />}
                  <div className="ll-mid"><b>{pl.name} <small>{pl.npc}</small></b><p>담보로 맡길 본인 명의의 집이 필요해요.</p></div>
                </div>
              );
            }
            const payAmt = Math.min(l.stampUnit, d.principal);
            const w = loanTaken ? payAllWarn(g, id) : null;
            return (
              <div key={id} className={'ll-row' + (focus === id ? ' focus' : '') + (d.overdue > 0 ? ' od' : '')} data-loan-row={id}>
                {face && <img className="ll-face" src={face.src} alt="" />}
                <div className="ll-mid">
                  <b>{pl.name} <small>{pl.npc}</small></b>
                  <p className="ll-debt"><em>빚 {comma(d.principal)}</em>정산마다 이자 {comma(interestDue(g, id))}{d.overdue > 0 && <i className="ll-od" data-loan-od={d.overdue}>연체 {d.overdue}회</i>}</p>
                  <p>더 빌리면 금리 {ratePct(nextBorrowRate(g, id))}%, 한도 {comma(b.room)} 남음{l.upfront ? `, 선이자 ${l.upfront * 100}%` : ''}</p>
                </div>
                <div className="ll-btns">
                  <button className="borrow" disabled={b.amt <= 0} data-borrow={id} onClick={() => borrowAt(id, setMsg)}><span>{b.amt > 0 ? '빌리기' : '한도 다 씀'}</span><small>{b.amt > 0 ? '+' + comma(b.got) : ''}</small></button>
                  <button className="pay" disabled={d.principal <= 0} data-pay={id} onClick={() => payAt(id, 1, setMsg)}><span>갚기</span><small>−{comma(payAmt)}</small></button>
                  <button className="pay all" disabled={d.principal <= 0} data-payall={id} onClick={() => payAt(id, 'all', setMsg)}><span>전부 갚기</span><small>−{comma(Math.min(d.principal, Math.floor(run.cash)))}</small></button>
                </div>
                {w && <p className="ll-warn" data-pay-warn={w.short}>전부 갚으면 손에 {comma(w.left)}. {run.settleIn}초 뒤 정산에 {comma(w.short)} 모자라 연체</p>}
              </div>
            );
          })}
        </div>
        <p className="ll-foot">갚을 때는 금리가 높은 빚부터 줄어요. 빌린 날부터 정산마다 이자가 붙어요.</p>
      </div>
    </div>
  );
}

/** 급할 때 빌리기 말풍선(U-61): 증거금이 모자라거나 정산이 10초 안인데 모자랄 때. 가장 싼 열린 곳의 한 단위. 한 번 누르면 빌린다(같은 길) */
export function QuickBorrow({ why }: { why: QuickWhy }) {
  const g = useGame((s) => s.g);
  const loanTaken = useProto((s) => s.loanTaken);
  const capitalKnown = useProto((s) => !!s.seen.capitalSms);
  const viperKnown = useProto((s) => !!s.seen.viperSms);
  const c = cheapestOpen(g, knownLenders(g, { loanTaken, capitalKnown, viperKnown }));
  if (!c) return null;
  const face = sprite(LENDER_FACE[c.id]);
  return (
    <div className={'lt-qb w-' + why} data-quick-borrow={c.id} data-quick-why={why}>
      {face && <img className="qb-face" src={face.src} alt="" />}
      <div className="qb-bal">
        <span>{why === 'settle' ? `정산 ${Math.max(0, g.run.settleIn)}초 전, 모자라요.` : '증거금이 모자라요.'} <small>{PLACE[c.id].npc}, 금리 {c.ratePct}%</small></span>
        <button className="qb-go" data-quick-go onClick={() => borrowAt(c.id, (m) => say(m, 3500))}>{manTxt(c.amt)} 더 빌리기</button>
      </div>
    </div>
  );
}

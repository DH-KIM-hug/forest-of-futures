// 라이트의 「대출」 탭(U-63, 사용자 결정): 거래소 옆 아래 탭 하나. 겹쳐 뜨는 판이 아니라 한 화면 전체가 만화 지면(시안 A).
// 맨 위 표제 칸(빚 합계, 다음 정산), 그 아래 돈줄마다 큰 칸 하나. 모르는 곳과 닫힌 곳은 흐리게, 한 줄 귀띔만.
// 행동과 이야기(차용증, 빚의 유혹, 독사의 조건, 전부 갚기 경고, 처음 다 갚은 축하)는 지도와 같은 길(loanActs.ts)을 쓴다.
import { useEffect, useState } from 'react';
import { useGame } from '../../../store/gameStore';
import { useProto } from '../protoStore';
import { lenderById } from '../../../engine/data';
import { interestDue } from '../../../engine/selectors';
import { settleSec } from '../../../engine/pace';
import type { LenderId } from '../../../engine/types';
import { comma } from '../../../engine/util';
import { PLACE, STORY } from '../text';
import { sprite, type SpriteId } from '../sprites';
import { say } from '../watch';
import { LENDER_IDS, borrowAt, borrowExtra, borrowRoom, payAllLabel, cheapestOpen, knownLenders, manTxt, payAllWarn, payAt, type QuickWhy } from '../loanActs';
import './liteLoan.css';

/** 대출 탭으로 간다. focus 가 있으면 그 돈줄의 칸으로 굴리고 잠깐 빛낸다(사무소로 간다, 갚으러 간다, 정산 추심원) */
export const openLoan = (focus: LenderId | null = null): void => {
  const P = useProto.getState();
  P.patch({ mapFocus: focus });
  P.setTab('map');
};

/** 돈줄의 얼굴(반신): 오소리 대부, 창구 너구리, 부엉이 지점장, 독사 대부 */
export const LENDER_FACE: Record<LenderId, SpriteId> = { shark1: 'boss', capital: 'raccoon', bank: 'owl', shark2: 'viper' } as Record<LenderId, SpriteId>;

/** 아래 탭의 대출 그림: 도장 찍힌 차용증 */
export function LoanIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M9 5h17l6 6v24H9z" fill="#FFF6E2" stroke="#1E140E" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M26 5v6h6" fill="none" stroke="#1E140E" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13.5 14h9M13.5 19h13M13.5 24h7" stroke="#1E140E" strokeWidth="2" strokeLinecap="round" />
      <circle cx="26" cy="28.5" r="6" fill="#C8553D" stroke="#1E140E" strokeWidth="2" />
      <path d="M23.2 28.5h5.6M26 25.7v5.6" stroke="#FFF6E2" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** 모르는 곳, 닫힌 곳의 한 줄 */
const LOCK_HINT: Record<LenderId, string> = {
  shark1: '',
  capital: '오소리에서 밀리면 오는 곳',
  bank: '',
  shark2: '캐피탈에서 밀리면 오는 곳',
};
/** 이름 옆 작은 꼬리표(U-65): 금리 사다리 */
const ROLE: Partial<Record<LenderId, string>> = { shark1: '제일 싼 곳', shark2: '불법 사채' };
/** 라이트의 돈줄 사다리: 오소리 → 캐피탈 → 까마귀(엔진 shark2). 조합은 없다 */
const LITE_IDS = LENDER_IDS.filter((id) => id !== 'bank');

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

export function LiteLoan() {
  const g = useGame((s) => s.g);
  const focus = useProto((s) => s.mapFocus) as LenderId | null;
  const loanTaken = useProto((s) => s.loanTaken);
  const capitalKnown = useProto((s) => !!s.seen.capitalSms);
  const viperKnown = useProto((s) => !!s.seen.viperSms);
  const [msg, setMsg] = useState<string | null>(null);
  // 장면이 가리킨 돈줄로 굴리고, 잠깐 빛낸 뒤 놓는다
  useEffect(() => {
    if (!focus) return;
    const t0 = window.setTimeout(() => document.querySelector(`[data-loan-row="${focus}"]`)?.scrollIntoView({ block: 'center' }), 60);
    const t1 = window.setTimeout(() => useProto.getState().patch({ mapFocus: null }), 2500);
    return () => { window.clearTimeout(t0); window.clearTimeout(t1); };
  }, [focus]);
  const run = g.run;
  const known = knownLenders(g, { loanTaken, capitalKnown, viperKnown });
  const total = LITE_IDS.reduce((a, id) => a + run.debts[id].principal, 0);
  const od = LITE_IDS.reduce((a, id) => a + run.debts[id].overdue, 0);
  const sec = settleSec(run);
  const per = sec % 60 === 0 ? `${sec / 60}분마다` : `${sec}초마다`;
  return (
    <section className="lt-loan" aria-label="대출" data-loan>
      <header className="ll-head">
        <b>대출</b>
        <span className="ll-sum"><small>빚</small><em data-loan-total={total}>{comma(total)}</em>{od > 0 && <i className="ll-od">연체 {od}회</i>}</span>
        <span className="ll-clock" data-loan-settle={run.settleIn}><small>정산</small>{mmss(run.settleIn)}</span>
      </header>
      {msg && <div className="ll-msg" role="status" data-loan-msg>{msg}</div>}
      <div className="ll-list">
        {LITE_IDS.map((id) => {
          const l = lenderById[id], d = run.debts[id], pl = PLACE[id];
          const face = sprite(LENDER_FACE[id]);
          const isKnown = known.includes(id);
          const b = borrowRoom(g, id);
          if (!isKnown || !b.open) {
            const hint = isKnown ? '담보로 맡길 집이 있어야 해요.' : LOCK_HINT[id];
            return (
              <div key={id} className={'ll-row locked' + (isKnown ? '' : ' unknown')} data-loan-row={id} data-loan-locked
                onClick={isKnown ? () => useProto.getState().pushScene({ id: 'owlRefuse', again: true, auto: 3500, lines: STORY.owlRefuse() }) : undefined}>
                {face && <img className="ll-face" src={face.src} alt="" />}
                <div className="ll-mid"><b>{isKnown ? pl.name : '???'}{isKnown && <small> {pl.npc}</small>}</b><p>{hint}</p></div>
              </div>
            );
          }
          const payAmt = Math.min(l.stampUnit, d.principal);
          const w = loanTaken ? payAllWarn(g, id) : null;
          const more = borrowExtra(g, id);
          return (
            <div key={id} className={'ll-row' + (focus === id ? ' focus' : '') + (d.overdue > 0 ? ' od' : '')} data-loan-row={id}>
              {face && <img className="ll-face" src={face.src} alt="" />}
              <div className="ll-mid">
                <b>{pl.name} <small>{pl.npc}</small>{ROLE[id] && <i className={'ll-role r-' + id}>{ROLE[id]}</i>}</b>
                <p className="ll-debt"><em>빚 {comma(d.principal)}</em>{d.overdue > 0 && <i className="ll-od" data-loan-od={d.overdue}>연체 {d.overdue}회</i>}</p>
                <p data-loan-int={interestDue(g, id)}>이자 {per} {comma(interestDue(g, id))}</p>
                {more && <p data-loan-more={more.extra}>더 빌리면 {manTxt(more.amt)}에 이자 +{comma(more.extra)}{l.upfront ? `, 선이자 ${l.upfront * 100}%` : ''}</p>}
                {more && <p data-loan-room={b.room}>남은 한도 {comma(b.room)}</p>}
              </div>
              <div className="ll-btns">
                <button className="borrow" disabled={b.amt <= 0} data-borrow={id} onClick={() => borrowAt(id, setMsg)}><span>{b.amt > 0 ? '빌리기' : '한도 다 씀'}</span><small>{b.amt > 0 ? '+' + comma(b.got) : ''}</small></button>
                <button className="pay" disabled={d.principal <= 0} data-pay={id} onClick={() => payAt(id, 1, setMsg)}><span>갚기</span><small>−{comma(payAmt)}</small></button>
                <button className="pay all" disabled={d.principal <= 0} data-payall={id} onClick={() => payAt(id, 'all', setMsg)}><span>{payAllLabel(g, id)}</span><small>−{comma(Math.min(d.principal, Math.floor(run.cash)))}</small></button>
              </div>
              {w && <p className="ll-warn" data-pay-warn={w.short}>다 내면 정산 때 {comma(w.short)} 모자라요</p>}
            </div>
          );
        })}
      </div>
    </section>
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

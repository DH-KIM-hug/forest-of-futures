import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import {
  jobs, lenderById, friendDefs, friendById, houses, friendRules, loansMeta,
} from '../../engine/data';
import {
  currentJob, interestDue, lenderLimit, rateMult, appraisal, upkeepDue, isShark2Unlocked, jobById,
} from '../../engine/selectors';
import { isGarnishing } from '../../engine/labor';
import { stampAmount } from '../../engine/loans';
import { moveBlockReason, moveCost } from '../../engine/housing';
import { limitOf } from '../../engine/settlement';
import { fmt, short } from '../common/format';
import { Face } from './Face';

const HOUSE_IMG = ['0_tent', '1_cabin', '2_warehouse', '3_villa', '4_mansion'];
const IC = (n: string) => `/ui/icons/${n}.webp`;
import type { LenderId } from '../../engine/types';

const QUOTES: Record<string, string> = {
  bank: '고객님, 어서 오십시오. 상담 도와드리겠습니다.',
  capital: '고객님~ 어서 오세요! 오늘도 좋은 조건으로 모실게요!',
  shark1: '왔냐. 급하면 말해라. 이자는 알지?',
  shark2: '어서 오십시오. 필요하신 만큼 준비해 두었습니다.',
};
const NO_DEBT: Record<string, string> = {
  bank: '고객님, 현재 이용 중인 대출이 없습니다.',
  capital: '어머, 빚이 없으시네요! 또 이용해 주세요~',
  shark1: '깨끗하네. 또 급하면 와라.',
  shark2: '정리하셨군요. 인연은 계속됩니다.',
};

/** 일터 무대: 칩멍크와 그 발밑 전체가 누르는 영역. 자루는 다음 일자리까지의 진행. */
export function WorkStage({ onWork }: { onWork: () => void }) {
  const g = useGame((s) => s.g);
  const labor = useGame((s) => s.labor);
  const run = g.run;
  const job = currentJob(run);
  const next = jobs.find((j) => j.order > job.order && j.unlock.type === 'stat' && j.unlock.stat === 'laborTaps');
  const taps = run.stats.laborTaps;
  const [floats, setFloats] = useState<{ id: number; v: number; x: number; dx: number }[]>([]);
  const seq = useRef(0);
  const press = () => {
    onWork();
    const gained = labor();
    if (gained < 0) return;
    const id = ++seq.current;
    const x = 26 + Math.random() * 22;
    const dx = Math.round((Math.random() - 0.3) * 60);
    setFloats((f) => [...f.slice(-5), { id, v: gained, x, dx }]);
    setTimeout(() => setFloats((f) => f.filter((q) => q.id !== id)), 800);
  };
  const garnish = isGarnishing(run);
  const need = next ? (next.unlock.value as number) : 0;
  const prog = next ? Math.min(1, taps / need) : 1;
  const noNext = job.order < jobs.length ? (job.id === 'logistics' ? '다음 일거리는 집 단계가 올라가야 열립니다.' : '집 단계가 올라가면 더 좋은 일이 열립니다.') : '더 좋은 일은 없습니다.';
  return (
    <button
      className="stage"
      onPointerDown={(e) => {
        e.preventDefault();
        press();
      }}
      onClick={(e) => {
        if (e.detail === 0) press(); // 키보드·보조기기 활성화
      }}
      aria-label={`${job.buttonLabel}, 1회 ${fmt(job.payPerTap)} 도토리. ${next ? `다음 일거리(${next.name})까지 ${Math.max(0, need - taps)}회` : noNext}`}
    >
      <span className="sign">
        <b>{job.name}</b>
        <span>1회 +{fmt(job.payPerTap)} · 정산 급여 {fmt(job.wagePerSettlement)}</span>
        {garnish && <span className="garnish">수입의 30% 차압 중</span>}
      </span>
      {next ? (
        <span className="sack">
          <span className="img">
            <img src={IC('sack_empty')} alt="" draggable={false} />
            <img className="full" src={IC('sack_full')} alt="" draggable={false} style={{ clipPath: `inset(${(1 - prog) * 100}% 0 0 0)` }} />
          </span>
          <span className="cnt">{Math.min(taps, need)}/{need}</span>
        </span>
      ) : (
        <span className="note">{noNext}</span>
      )}
      {floats.map((f) => (
        <span key={f.id}>
          <span className="float" style={{ left: `${f.x}%`, top: '-6%' }}>+{fmt(f.v)}</span>
          <img className="pop" src={IC('acorn')} alt="" style={{ left: `${f.x + 6}%`, bottom: 18, ['--dx' as any]: `${f.dx}px` }} />
        </span>
      ))}
    </button>
  );
}

function Head({ title, sub }: { title: string; sub?: string }) {
  const go = useGame((s) => s.go);
  return (
    <div className="head">
      <button className="back" onClick={() => go({ location: 'work' })} aria-label="마을로 돌아가기">
        <img src={IC('back')} alt="" draggable={false} />마을
      </button>
      <h3>{title}{sub && <span className="sub">{sub}</span>}</h3>
    </div>
  );
}

export function LockedSheet() {
  return (
    <div className="sheet">
      <Head title="어두운 골목" />
      <div className="lockedmsg">
        <img src={IC('lock')} alt="" />
        <b style={{ fontFamily: 'var(--display)', fontWeight: 400, fontSize: 16 }}>아직 갈 일이 없는 골목입니다.</b>
        <span className="sub">연체가 생기거나 빚이 50만 이상이 되거나, 친구가 채권을 넘기면 열립니다.</span>
      </div>
    </div>
  );
}

export function LenderSheet({ id }: { id: LenderId }) {
  const g = useGame((s) => s.g);
  const ui = useGame((s) => s.ui);
  const { borrow, stamp, patchUi, viewTerms } = useGame.getState();
  const run = g.run;
  const l = lenderById[id];
  const principal = run.debts[id];
  const limit = lenderLimit(run, id);
  const rate = l.ratePerSettlement * rateMult(run);
  const due = interestDue(run, id);
  const streak = run.streak[id];
  const maxS = limitOf(id);
  const unitStamp = l.stampUnit;
  const amt = stampAmount(run.cash, principal, unitStamp, ui.mult);
  const needConsent = id === 'shark2' && run.stats.borrowShark2 >= 1;
  const sayMsg = ui.say && ui.say.where === id && Date.now() - ui.say.at < 6000 ? ui.say.text : null;
  const [shake, setShake] = useState(0);
  useEffect(() => {
    if (sayMsg) setShake((s) => s + 1);
  }, [ui.say?.at]);
  const quote = ui.termsOpen ? l.terms : sayMsg ?? (principal === 0 ? NO_DEBT[id] : QUOTES[id]);
  const loanCanTap = !(needConsent && !ui.consent);
  const loanLabel =
    id === 'shark2'
      ? `대출 받는 돈 ${short(l.borrowUnit * (1 - l.upfrontRate))} / 장부 ${short(l.borrowUnit)}`
      : `대출 +${short(l.borrowUnit)}`;
  const stampLabel = principal === 0 ? '빚 없음' : amt <= 0 ? '현금 부족' : `도장 -${short(ui.mult === 1 ? Math.min(unitStamp, principal) : amt)}`;
  const showStamp = run.stampFlash && run.stampFlash.lender === id && run.tick - run.stampFlash.tick < 2;
  void isShark2Unlocked;
  return (
    <div className={'sheet' + (shake && sayMsg ? ' shake' : '')} key={id + shake}>
      <Head title={l.name} sub={l.kind} />
      <div className="npc">
        <Face who={id} />
        <div className={'bubble' + (ui.termsOpen ? ' terms' : '')} aria-live="polite">{quote}</div>
      </div>
      <div className="ledger">
        <div className="row sb">
          <span className="stat">원금 <b>{fmt(principal)}</b></span>
          <span className="sub">한도 {fmt(limit)}</span>
        </div>
        <div className="row sb">
          <span className="stat">정산 이자 {(rate * 100).toFixed(rate * 100 % 1 ? 1 : 0)}% = {fmt(due)}</span>
          <span>
            {streak > 0 && <span className="od-tag">연체 {streak}/{maxS}</span>}{' '}
            <span className="cells" aria-label={`연체 ${streak}회, 한도 ${maxS}회`}>
              {Array.from({ length: maxS }).map((_, i) => <i key={i} className={i < streak ? 'on' : ''} />)}
            </span>
          </span>
        </div>
      </div>
      {needConsent && (
        <label className="check">
          <input type="checkbox" checked={ui.consent} onChange={(e) => patchUi({ consent: e.target.checked })} />
          지인 연락처 제출에 동의
        </label>
      )}
      <div className="btns" style={{ position: 'relative' }}>
        <button className="act" disabled={!loanCanTap} onClick={() => borrow(id)} aria-label={`${l.name} ${loanLabel}`}>{loanLabel}</button>
        <button className="act" disabled={principal === 0 || amt <= 0} onClick={() => stamp(id)} aria-label={`${l.name} 원금 탕감 도장 ${short(unitStamp)} 도토리`}>
          {stampLabel}
        </button>
        {showStamp && <div className="stampmark"><img src={IC('paid')} alt="완납" /></div>}
      </div>
      <div className="chips">
        {([1, 10, 'all'] as const).map((m) => (
          <button key={String(m)} className={'chip' + (ui.mult === m ? ' on' : '')} onClick={() => patchUi({ mult: m })} aria-pressed={ui.mult === m}>
            {m === 'all' ? '전액' : `×${m}`}
          </button>
        ))}
        <button
          className="chip terms"
          onClick={() => {
            patchUi({ termsOpen: !ui.termsOpen });
            if (!ui.termsOpen) viewTerms(id);
          }}
        >
          <img src={IC('terms')} alt="" />{ui.termsOpen ? '약관 닫기' : '약관 보기'}
        </button>
      </div>
    </div>
  );
}
void loansMeta;

export function FriendsSheet() {
  const g = useGame((s) => s.g);
  const ui = useGame((s) => s.ui);
  const { borrowFriend, stampFriend, patchUi } = useGame.getState();
  const run = g.run;
  const f = friendById[ui.friend];
  const fs = run.friends[f.id];
  const amt = stampAmount(run.cash, fs.debt, f.stampUnit, ui.mult);
  const sayMsg = ui.say && ui.say.where === f.id && Date.now() - ui.say.at < 6000 ? ui.say.text : null;
  const dueLeft = fs.dueAt === null ? null : fs.dueAt - run.cycles;
  const refuseNow = fs.broken || fs.trust < friendRules.minTrustToBorrow || fs.debt + f.borrowUnit > f.maxLoan;
  return (
    <div className="sheet">
      <Head title="친구네 골목" sub={`신뢰 ${fs.trust}`} />
      <div className="fchips">
        {friendDefs.map((d) => {
          const s = run.friends[d.id];
          return (
            <button key={d.id} className={ui.friend === d.id ? 'on' : ''} onClick={() => patchUi({ friend: d.id, say: null })} aria-label={`${d.name} 신뢰 ${s.trust}${s.broken ? ' 절교' : ''}`}>
              <Face who={d.id} gone={s.broken} />
              <span className="mini"><i style={{ width: `${s.trust}%` }} /></span>
              {s.broken && <span className="x">X</span>}
            </button>
          );
        })}
      </div>
      <div className="npc">
        <Face who={f.id} gone={fs.broken} />
        <div className="bubble">
          {fs.broken ? `${f.breakLine} 문이 닫혀 있습니다.` : sayMsg ?? (fs.debt > 0 ? '갚을 건 갚자.' : `${f.relation}. 필요하면 말해.`)}
        </div>
      </div>
      <div className="ledger">
        <div className="row sb">
          <span className="stat">{f.name}</span>
          <span className="sub">{fs.broken ? '절교' : dueLeft === null ? '빚 없음' : dueLeft >= 0 ? `갚기로 한 날까지 ${dueLeft}회` : '기한 지남'}</span>
        </div>
        <div className="stat">빌린 돈 <b>{fmt(fs.debt)}</b> <span className="sub">/ 한도 {fmt(f.maxLoan)}</span></div>
      </div>
      <div className="btns">
        <button className="act" disabled={fs.broken} onClick={() => borrowFriend(f.id)} aria-label={`${f.name}에게 ${fmt(f.borrowUnit)} 도토리 빌리기`}>
          {refuseNow && !fs.broken ? '빌리기(어렵다)' : `빌리기 +${short(f.borrowUnit)}`}
        </button>
        <button className="act" disabled={fs.debt === 0 || amt <= 0} onClick={() => stampFriend(f.id)} aria-label={`${f.name} 갚기 도장 ${fmt(f.stampUnit)} 도토리`}>
          {fs.debt === 0 ? '빚 없음' : amt <= 0 ? '현금 부족' : `갚기 도장 -${short(Math.min(f.stampUnit, fs.debt))}`}
        </button>
      </div>
      <div className="chips">
        {([1, 10, 'all'] as const).map((m) => (
          <button key={String(m)} className={'chip' + (ui.mult === m ? ' on' : '')} onClick={() => patchUi({ mult: m })} aria-pressed={ui.mult === m}>
            {m === 'all' ? '전액' : `×${m}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HomeSheet() {
  const g = useGame((s) => s.g);
  const ui = useGame((s) => s.ui);
  const move = useGame((s) => s.move);
  const run = g.run;
  const cur = houses[run.houseStage];
  const blockedMsg = ui.say && ui.say.where === 'home' && Date.now() - ui.say.at < 6000 ? ui.say.text : null;
  return (
    <div className="sheet">
      <Head title={cur.name} sub={`평가액 ${fmt(appraisal(run))}`} />
      <div className="row sb sub">
        <span>정산 유지비 {fmt(cur.upkeepPerSettlement)}{run.upkeepArrears > 0 ? ` (밀린 ${fmt(run.upkeepArrears)})` : ''}</span>
        <span>{run.streak.upkeep > 0 ? <span className="od-tag">유지비 연체 {run.streak.upkeep}/{limitOf('upkeep')}</span> : `다음 청구 ${fmt(upkeepDue(run))}`}</span>
      </div>
      <div className="houselist">
        {houses.map((h) => {
          const here = h.stage === run.houseStage;
          const cost = moveCost(g, h.stage);
          const why = here ? null : moveBlockReason(g, h.stage);
          return (
            <div key={h.stage} className={'hr' + (here ? ' cur' : '')}>
              <img className="th" src={`/art/house_${HOUSE_IMG[h.stage] ?? HOUSE_IMG[0]}.webp`} alt="" draggable={false} />
              <span className="n">{h.name}<br /><span className="sub">{fmt(h.price)} · 유지비 {fmt(h.upkeepPerSettlement)}</span></span>
              {here ? (
                <span className="sub" style={{ minWidth: 84, textAlign: 'center' }}>지금 사는 곳</span>
              ) : (
                <button className="act" onClick={() => move(h.stage)} aria-label={`${h.name}(으)로 이사 ${cost >= 0 ? '드는 돈' : '받는 돈'} ${fmt(Math.abs(cost))}`} style={why ? { opacity: 0.55 } : undefined}>
                  이사 {cost >= 0 ? '-' : '+'}{short(Math.abs(cost))}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="sub" style={{ minHeight: 16, color: 'var(--danger)', fontWeight: 800 }}>
        {blockedMsg ?? ''}
      </div>
    </div>
  );
}
void jobById;

// 오소리 사무소 차용증(첫 이름 적기, loanSign.ts). 크림 종이 서류 한 장: 대부 반신과 한마디, 서명 칸, 별명 칩, 깨알 글씨, [발도장 찍기].
import { GIcon } from './icons';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { myLedgerNo, useRank } from './ranking';
import { isLite } from './config';
import { comma } from '../../engine/util';
import { officeOffer } from './model';
import { sprite } from './sprites';
import { play } from './audio';
import { reduced } from './fx';
import { NAME_ERR, NAME_MAX, SIGN_LINES, CHIP_COUNT, checkName, closeSign, firstChips, needsSign, pickSuggest, signName, useSign } from './loanSign';
import './nameSign.css';

/** 라이트: 만화를 덮고 길잡이가 막 시작할 자리에서, 이름이 없으면 서류가 먼저 뜬다(새로 고쳐도 같은 자리에서 다시 뜬다) */
export function useLiteSignOn(): boolean {
  const name = useRank((s) => s.name);
  const run = useProto((s) => s.flyTut === 'run' && !s.prologue);
  const done = useSign((s) => s.signedDev);
  return isLite && run && !done && needsSign(name);
}

export function NameSign() {
  const lite = useLiteSignOn();
  const main = useSign((s) => s.main);
  if (!lite && !main) return null;
  return <SignPaper lite={lite} />;
}

const PAW = (
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="40" rx="15" ry="12.5" />
    <ellipse cx="14" cy="24" rx="6" ry="7.5" transform="rotate(-24 14 24)" />
    <ellipse cx="25" cy="14" rx="6" ry="8" transform="rotate(-8 25 14)" />
    <ellipse cx="39" cy="14" rx="6" ry="8" transform="rotate(8 39 14)" />
    <ellipse cx="50" cy="24" rx="6" ry="7.5" transform="rotate(24 50 24)" />
  </svg>
);

function SignPaper({ lite }: { lite: boolean }) {
  const g = useGame((s) => s.g);
  const [chips, setChips] = useState(firstChips);
  const [v, setV] = useState(() => chips[0]);
  const [no] = useState(myLedgerNo);
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [stamped, setStamped] = useState<string | null>(null);
  const inp = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // 서류를 읽는 동안 시계는 멈춘다(라이트: 정산이 서명 중에 오지 않게). 본편은 추심원이 기다리는 동안이라 이미 멈춰 있다
  useEffect(() => {
    const st = useGame.getState();
    const was = st.speed;
    if (was !== 0) st.setSpeed(0);
    return () => { if (was !== 0) useGame.getState().setSpeed(was); };
  }, []);
  // 폰 자판이 올라오면 서명 칸이 가리지 않게 굴린다
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => { if (document.activeElement === inp.current) inp.current?.scrollIntoView({ block: 'center' }); };
    vv.addEventListener('resize', on);
    return () => vv.removeEventListener('resize', on);
  }, []);
  const lend = officeOffer(g);
  const debt = Object.values(g.run.debts).reduce((a, d) => a + d.principal, 0);
  const left = NAME_MAX - [...v.trim()].length;
  const stamp = () => {
    if (stamped) return;
    const c = signName(v);
    if (!c.ok) { play('insufficient'); setErr(NAME_ERR[c.why]); setShake((k) => k + 1); inp.current?.focus(); return; }
    inp.current?.blur();
    setErr(null);
    setStamped(c.name);
    play('paw_stamp');
    window.setTimeout(() => closeSign(), reduced() ? 900 : 1700);
  };
  const boss = sprite('boss');
  return (
    <div className="pr-notice pr-sign" role="dialog" aria-label={lite ? 'FRX 계좌 개설 신청서' : '오소리 사무소 차용증'} data-sign={lite ? 'lite' : 'main'} data-signed={stamped ? 1 : undefined}>
      <div className="sg-wrap" ref={box}>
        <div className="sg-boss">
          {boss && <img src={boss.src} alt="" draggable={false} />}
          <p className="say" data-sign-say><b>오소리 대부</b>{stamped ? SIGN_LINES.done : err ? SIGN_LINES.oops : SIGN_LINES.ask}</p>
        </div>
        <form key={shake} className={'box sg-paper' + (shake ? ' no' : '')} noValidate onSubmit={(e) => { e.preventDefault(); stamp(); }}>
          <div className="sg-mast"><b>{lite ? 'FRX 계좌 개설 신청서' : '차용증'}</b><span>{lite ? '겸 차용증, 오소리 사무소' : '오소리 사무소'}</span></div>
          <dl className="sg-rows">
            {lite
              ? <><div><dt>빚</dt><dd>{comma(debt)} 도토리</dd></div><div><dt>배율</dt><dd>최대 200배</dd></div></>
              : <><div><dt>빌리는 돈</dt><dd>{comma(lend.lend)} 도토리</dd></div><div><dt>이자</dt><dd>정산마다 {lend.ratePct}%</dd></div></>}
            <div><dt>담보</dt><dd>볼주머니와 앞니 두 개</dd></div>
            <div><dt>장부 번호</dt><dd data-sign-no={no}>{no}</dd></div>
          </dl>
          <label className="sg-lab" htmlFor="sg-name">채무자 서명 <small data-sign-left={left}>{left >= 0 ? `${left}글자 더` : `${-left}글자 넘침`}</small></label>
          <div className="sg-line">
            <input id="sg-name" ref={inp} data-sign-input value={stamped ?? v} maxLength={24} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="done" disabled={!!stamped}
              aria-invalid={!!err} aria-describedby={err ? 'sg-err' : undefined}
              onFocus={() => window.setTimeout(() => inp.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320)}
              onChange={(e) => { setV(e.target.value); if (err) { const c = checkName(e.target.value); if (c.ok) setErr(null); } }} />
            <b className="sg-no" aria-label={`장부 번호 ${no}`}>#{no}</b>
            {stamped && <i className="sg-paw" data-sign-paw aria-hidden="true">{PAW}</i>}
          </div>
          <p className="sg-prev" data-sign-preview>장부에는 <b>{(stamped ?? (checkName(v).ok ? v.trim() : '…'))} #{no}</b> 로 적힌다</p>
          {err && <p className="sg-err" id="sg-err" role="alert" data-sign-err>{err}</p>}
          {!stamped && (
            <div className="sg-chips" aria-label="별명 고르기">
              {chips.map((c) => <button type="button" key={c} className={'sg-chip' + (v === c ? ' on' : '')} data-sign-chip={c} onClick={() => { play('ui_tap'); setV(c); setErr(null); }}>{c}</button>)}
              <button type="button" className="sg-chip more" data-sign-more onClick={() => { play('ui_tap'); setChips((x) => pickSuggest(CHIP_COUNT, Math.random, x)); }} aria-label="다른 별명 섞기"><GIcon name="dice" size={20} />섞기</button>
            </div>
          )}
          <button type="submit" className={'buy wide' + (stamped ? '' : ' on')} data-sign-stamp disabled={!!stamped}><span>{stamped ? '찍었다' : '발도장 찍기'}</span></button>
        </form>
      </div>
    </div>
  );
}

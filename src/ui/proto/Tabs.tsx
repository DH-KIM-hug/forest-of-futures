import { useEffect, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { onFirstOfficeLoan, retireNow, say } from './watch';
import { canRetireAct1 } from '../../engine/act1Retire';
import { treeAward } from '../../engine/skilltree';
import { balance } from '../../engine/data';
import { hamsterMath, ratePct } from './model';
import { comma } from '../../engine/util';
import { lenderById } from '../../engine/data';
import { interestDue, lenderLimit, nextBorrowRate } from '../../engine/selectors';
import type { LenderId } from '../../engine/types';
import { ProtoTrade } from './Trade';
import { PLACE, STORY } from './text';
import { forecast } from '../../engine/settlement';
import { ledgerRows, goldStamps, repaidOffice, repayBuys, STAMP_STEP } from './ledger';
import { RowIcon } from './art';
import { sprite, PLACE_ART, MAP_SPOTS } from './sprites';
import { aliveStyle } from './alive';
import { journeyOf } from './stops';
import { claim } from './model';
import { RankSign } from './RankingBoard';

/** 가게 안 그림 한 띠(U-40): 그 가게의 방과 거기 서 있는 사람. 지도 카드 맨 위에 붙는다. */
function PlaceArt({ id }: { id: string }) {
  const a = PLACE_ART[id];
  const bg = a && sprite(a.scene), npc = a && sprite(a.npc);
  if (!bg) return null;
  return (
    <div className={'plc-art a-' + id} data-art={a.scene} aria-hidden="true">
      <img className="bg" src={bg.src} alt="" draggable={false} />
      {npc && <img className="npc al-html" data-art={a.npc} src={npc.src} alt="" draggable={false} style={aliveStyle('map-' + a.npc)} />}
    </div>
  );
}
import { play } from './audio';

/** 지도 탭: 추심원이 꽂고 간 쪽지. 처음엔 오소리 사무소만 그려져 있다. 빌리고 갚는 곳. */
export function MapTab() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const focus = useProto((s) => s.mapFocus);
  const smsSeen = useProto((s) => !!s.seen.sms);
  const capitalKnown = useProto((s) => !!s.seen.capitalSms);
  const viperKnown = useProto((s) => !!s.seen.viperSms);
  const waiting = useProto((s) => s.waiting);
  const loanTaken = useProto((s) => s.loanTaken);
  const [msg, setMsg] = useState<string | null>(null);
  const run = g.run;
  useEffect(() => {
    if (!focus) return;
    document.querySelector(`[data-place="${focus}"]`)?.scrollIntoView({ block: 'start' });
    const t = window.setTimeout(() => useProto.getState().patch({ mapFocus: null }), 2500);
    return () => window.clearTimeout(t);
  }, [focus]);
  // 폰을 받기 전에는 쪽지에 그려진 오소리 사무소뿐. 폰이 생기면 다른 곳도 보인다.
  // 다른 돈줄은 사건으로 지도에 그려진다(U-38): 숲속 캐피탈·조합 = 캐피탈의 문자를 받은 뒤, 뒷골목 = 모르는 번호의 문자를 받은 뒤
  const ids = (['shark1', 'capital', 'bank', 'shark2'] as const).filter((id) => id === 'shark1' || (loanTaken && (id === 'shark2' ? viperKnown && run.shark2Open : capitalKnown)));
  const doBorrow = (id: LenderId, agreed = false) => {
    const before = useGame.getState().g;
    const firstAt = ((before.run.stats[`borrow.${id}`] as number | undefined) ?? 0) === 0;
    // 뒷골목의 첫 대출은 독사 대부가 조건을 먼저 말한다: 적는 돈과 받는 돈이 다르다(선이자). 듣고 나서 고른다.
    if (id === 'shark2' && firstAt && !agreed) {
      const l2 = lenderById.shark2;
      const unit = Math.min(l2.borrowUnit!, Math.max(0, lenderLimit(before, 'shark2') - before.run.debts.shark2.principal));
      const got = Math.floor(unit * (1 - (l2.upfront ?? 0)));
      useProto.getState().pushScene({ id: 'viperOffer', again: true, lines: STORY.viperOffer({ unit, got, ratePct: ratePct(l2.rate) }),
        choices: [
          { id: 'take', label: `${manTxt(got)} 받기`, sub: `빚 +${manTxt(unit)}`, primary: true, run: () => doBorrow('shark2', true) },
          { id: 'leave', label: '돌아선다', run: () => setMsg('뒷골목: 등 뒤로 문고리가 제자리로 돌아간다.') },
        ] });
      return;
    }
    const r = act({ type: 'borrow', lender: id, consent: true });
    play(r.ok ? 'collector_paid' : 'insufficient');
    setMsg(r.ok ? `${PLACE[id].name}: +${comma(r.amount ?? 0)}. 이제 정산마다 이자 ${comma(interestDue(useGame.getState().g, id))}.` : r.msg ?? '지금은 처리할 수 없어요');
    if (r.ok && id === 'shark1') onFirstOfficeLoan(before);
    // 숲속 캐피탈에서 처음 빌렸다: 창구 너구리가 조건을 말한다(한도가 왜 그 숫자인지, 밀리면 어떻게 되는지)
    if (r.ok && id === 'capital' && firstAt) useProto.getState().pushScene({ id: 'capitalIntro', lines: STORY.capitalIntro({ amount: r.amount ?? 0, ratePct: ratePct(lenderById.capital.rate) }) });
  };
  const doPay = (id: LenderId, mult: number | 'all') => { const r = act({ type: 'stamp', lender: id, mult }); play(r.ok ? 'collector_paid' : 'insufficient'); setMsg(r.ok ? `${PLACE[id].name}: 원금 ${comma(r.paid ?? 0)} 갚았다` : r.msg === '현금 부족' ? '도토리가 부족해요' : r.msg ?? '지금은 처리할 수 없어요'); };
  const fcN = forecast(g);
  const dueNext = fcN.interest + fcN.living + fcN.wages;
  const keepPay = repayBuys(g, dueNext);
  const total = (['bank', 'capital', 'shark1', 'shark2'] as const).reduce((a, id) => a + run.debts[id].principal, 0);
  return (
    <div className="pr-pane">
      <div className="pr-title"><b>마을 지도</b><span>빚 {comma(total)}</span></div>
      {sprite('village2')
        ? <VillageMap known={ids} onPick={(id) => { if (id === 'home') { play('ui_tap'); useProto.getState().setTab('lot'); } else { play('ui_tap'); useProto.getState().patch({ mapFocus: id }); } }} />
        : sprite('village') && <div className="pr-village" data-art="village" aria-hidden="true"><img src={sprite('village')!.src} alt="" draggable={false} /></div>}
      {waiting && <p className="pr-note left">추심원이 집 앞에서 기다린다.</p>}
      {msg && <div className="pr-msg" role="status">{msg}</div>}
      {ids.map((id) => {
        const l = lenderById[id];
        const d = run.debts[id];
        const pl = PLACE[id];
        if (id === 'bank' && run.house <= 0) {
          return (
            <div key={id} className="pr-card plc locked" data-place={id} onClick={() => useProto.getState().pushScene({ id: 'owlRefuse', again: true, auto: 3500, lines: STORY.owlRefuse() })}>
              <PlaceArt id={id} />
              <div className="plc-top"><div className="ic"><RowIcon kind={id} /></div><div className="mid"><div className="nm">{pl.name} <small>{pl.npc}</small></div><div className="sb">담보로 맡길 본인 명의의 집이 필요해요.</div></div></div>
            </div>
          );
        }
        const room = Math.max(0, lenderLimit(g, id) - d.principal);
        const amt = Math.min(l.borrowUnit!, room);
        const got = Math.floor(amt * (1 - (l.upfront ?? 0)));
        const payAmt = Math.min(l.stampUnit, d.principal);
        const first = id === 'shark1' && !loanTaken;
        return (
          <div key={id} className={'pr-card plc' + (id === 'shark1' ? ' ring' : '') + (id === 'shark1' && (smsSeen || waiting) ? ' blink' : '') + (focus === id ? ' focus' : '')} data-place={id} data-hl={id === 'shark1' ? 'office' : undefined}>
            <PlaceArt id={id} />
            <div className="plc-top"><div className="ic"><RowIcon kind={id} /></div><div className="mid">
              <div className="nm">{pl.name} <small>{pl.npc}</small></div>
              <div className="sb"><b>빚 {comma(d.principal)}</b>, 정산마다 이자 {comma(interestDue(g, id))}{d.overdue > 0 ? <em className="od">, 연체 {d.overdue}회</em> : ''}</div>
              <div className="sb">더 빌리면 금리 {ratePct(nextBorrowRate(g, id))}%, 한도 {comma(room)} 남음{l.upfront ? `, 선이자 ${l.upfront * 100}%` : ''}</div>
              {first && <div className="sq">{pl.npc} 「개울 건너오셨죠? 앉으세요. 오늘 수금 때문에 오셨다면서요.」</div>}
            </div></div>
            {id === 'capital' && <CapitalTerms room={room} />}
            {id === 'shark1' && loanTaken && <Ledger />}
            <div className="btns">
              <button className={'buy' + (amt > 0 ? ' on' : '')} disabled={amt <= 0} data-borrow={id} data-hl={id === 'shark1' ? 'borrow' : undefined} onClick={() => doBorrow(id)}><span>{amt > 0 ? '빌리기' : '한도 다 씀'}</span><small>{amt > 0 ? '+' + comma(got) : ''}</small></button>
              <button className={'buy' + (d.principal > 0 ? ' pay' : '')} disabled={d.principal <= 0} data-pay={id} data-hl={id === 'shark1' ? 'pay' : undefined} onClick={() => doPay(id, 1)}><span>갚기</span><small>−{comma(payAmt)}</small></button>
              <button className={'buy' + (d.principal > 0 ? ' pay' : '')} disabled={d.principal <= 0} data-payall={id} onClick={() => doPay(id, 'all')}><span>전부 갚기</span><small>−{comma(Math.min(d.principal, Math.floor(run.cash)))}</small></button>
            </div>
            {/* 정산 빼고 갚기(U-42): 다음 정산에 낼 돈은 손에 남기고 갚는다. [전부]는 그 돈까지 갚아 버린다 — 둘의 차이가 단추에 보인다 */}
            {id === 'shark1' && loanTaken && keepPay && keepPay.amount > payAmt && keepPay.amount < Math.min(d.principal, Math.floor(run.cash)) && (
              <button className="buy pay keeppay" data-paykeep={keepPay.amount} onClick={() => doPay(id, keepPay.amount >= d.principal ? 'all' : keepPay.mult)}><span>정산 빼고 갚기 −{comma(keepPay.amount)}</span><small>남길 돈 {comma(Math.round(dueNext))}, 이자 −{comma(keepPay.cut)}{keepPay.stamps > 0 ? `, 금박 +${keepPay.stamps}` : ''}</small></button>
            )}
            {/* 빚을 다 갚은 생은 여기서 닫을 수 있다(U-39 ⑧): 은퇴 = 엔딩 카드 → 환생 */}
            {id === 'shark1' && canRetireAct1(g) && (
              <button className="buy on retire" data-retire onClick={retireNow}><span>은퇴한다</span><small>이번 생 마치기, 황금 +{treeAward(run)}</small></button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 지도 그림에서 잘라 보여 주는 세로 구간(위 4% · 아래 12%는 숲뿐이다) */
const MAP_CROP = { top: 0.04, h: 0.84 };
const manTxt = (x: number) => (x >= 10000 && x % 10000 === 0 ? `${x / 10000}만` : comma(x));
/** 누를 수 있는 마을 지도(U-41): 빈터 다섯에 이름표. 아는 곳을 누르면 그 가게의 카드로 내려가고, 내 집을 누르면 집 탭으로 간다. 모르는 곳은 물음표다. */
function VillageMap({ known, onPick }: { known: readonly string[]; onPick: (id: string) => void }) {
  const g = useGame((s) => s.g);
  const waiting = useProto((s) => s.waiting);
  const img = sprite('village2')!;
  const run = g.run;
  const cheer = useProto((s) => !!s.burst && s.burst.pnl > 0);
  return (
    <div className="pr-vmap" data-art="village2" style={{ aspectRatio: `${img.w} / ${Math.round(img.h * MAP_CROP.h)}` }}>
      <img src={img.src} alt="" draggable={false} style={{ top: `${(-MAP_CROP.top / MAP_CROP.h) * 100}%` }} />
      {Object.entries(MAP_SPOTS).map(([id, p]) => {
        const home = id === 'home';
        const ok = home || known.includes(id);
        const d = home ? null : run.debts[id as LenderId];
        const sub = home ? `정산 ${Math.floor(Math.max(0, run.settleIn) / 60)}:${String(Math.max(0, run.settleIn) % 60).padStart(2, '0')}`
          : !ok ? '' : id === 'shark1' && waiting ? '추심원이 기다린다' : d!.overdue > 0 ? `연체 ${d!.overdue}회` : d!.principal > 0 ? `빚 ${manTxt(d!.principal)}` : id === 'bank' && run.house <= 0 ? '문이 닫혀 있다' : '빚 없음';
        return (
          <button key={id} className={'pin' + (ok ? '' : ' fog') + (home ? ' home' : '') + (!home && ok && (d!.overdue > 0 || (id === 'shark1' && waiting)) ? ' hot' : '')} data-pin={id} data-known={ok ? '1' : '0'}
            style={{ left: `${p.x * 100}%`, top: `${((p.y - MAP_CROP.top) / MAP_CROP.h) * 100}%` }} disabled={!ok}
            aria-label={ok ? `${home ? '내 집' : PLACE[id as LenderId].name}${sub ? `, ${sub}` : ''}` : '아직 모르는 곳'} onClick={() => onPick(id)}>
            <b>{ok ? (home ? '내 집' : PLACE[id as LenderId].name) : '?'}</b>{sub && <small>{sub}</small>}
          </button>
        );
      })}
      {/* 지도 위의 주인공(U-50): 내 집 팻말 옆에 작게. 집에 없을 때 터진 판의 도토리가 여기서 머리의 숫자로 날아가고, 이긴 판이면 뛴다 */}
      {(() => { const hp = MAP_SPOTS.home; const art = sprite(cheer ? 'heroHappy' : 'hero'); return art ? <img id="pr-map-hero" className={'mhero' + (cheer ? ' hop' : '')} data-map-hero={cheer ? 'hop' : 'idle'} src={art.src} alt="" draggable={false} style={{ left: `${hp.x * 100}%`, top: `${((hp.y - MAP_CROP.top) / MAP_CROP.h) * 100}%` }} /> : null; })()}
      <RankSign />
    </div>
  );
}

/** 오소리 사무소의 장부(U-38): 빚을 금리별 줄로 보여 준다. 갚으면 맨 위(비싼) 줄부터 지워지고, 5만을 갚을 때마다 금박 도장이 하나 찍힌다. */
function Ledger() {
  const g = useGame((s) => s.g);
  const rows = ledgerRows(g);
  const stamps = goldStamps(g);
  const top = rows.find((r) => r.left > 0)?.key;
  const toNext = STAMP_STEP - (repaidOffice(g) % STAMP_STEP);
  // 이번 생의 길(U-41): 거래가 벌어 온 돈을 "이자 몇 번 치 · 금박 도장의 몇 %"로 읽어 준다
  const tradeLife = useProto((s) => s.tradeLife), claimWins = useProto((s) => s.claimWins), paidLife = useProto((s) => s.paidLife), closes = useProto((s) => s.closes);
  const jr = journeyOf({ tradeNet: tradeLife, claim: claim(g).total, settles: g.run.settleNo, paid: paidLife, claimWins });
  return (
    <div className="pr-ledger" data-ledger aria-label="오소리 장부">
      <div className="lg-h"><b>상환 장부</b><span>위에서부터 갚아요</span></div>
      {rows.map((r) => (
        <div key={r.key} className={'lg-row' + (r.left <= 0 ? ' done' : '') + (r.key === top ? ' top' : '')} data-row={r.key}>
          <i className="rt">{r.ratePct}%</i>
          <span className="nm">{r.label}</span>
          <span className="bar"><u style={{ width: `${r.start > 0 ? (r.left / r.start) * 100 : 0}%` }} /></span>
          <b className="amt">{r.left <= 0 ? '지움' : comma(r.left)}</b>
          <small className="iv">{r.left <= 0 ? '' : r.fixed ? `고정금리 ${r.ratePct}%, 정산 이자 ${comma(r.interest)}` : `이자 ${comma(r.interest)}`}</small>
        </div>
      ))}
      {closes > 0 && <div className="lg-jr" data-journey="ledger">{jr.text}</div>}
      <div className="lg-st" data-stamps={stamps}>
        <span className="dots">{Array.from({ length: Math.min(10, stamps + 1) }, (_, i) => <i key={i} className={i < stamps ? 'on' : ''} />)}{stamps > 9 && <em>×{stamps}</em>}</span>
        <small>금박 도장 {stamps}개{g.run.debts.shark1.principal > 0 ? `, 다음 도장까지 ${comma(Math.min(toNext, g.run.debts.shark1.principal))} (5만마다 한 개)` : ', 장부가 깨끗하다'}</small>
      </div>
    </div>
  );
}

/** 숲속 캐피탈의 조건(U-39 ⑩): 싸게 빌리는 길을 막지 않되, 값과 조건이 카드에서 읽히게 한다. 숫자는 전부 엔진 값이다. */
function CapitalTerms({ room }: { room: number }) {
  const g = useGame((s) => s.g);
  const l = lenderById.capital;
  const unit = Math.min(l.borrowUnit!, Math.max(room, 0)) || l.borrowUnit!;
  const perUnit = Math.ceil(unit * l.rate - 1e-9);
  const hm = hamsterMath(g);
  const A = balance.assets as { appraisalRate: number; collateralLtvCapital: number };
  const perWheel = Math.floor(50_000 * A.appraisalRate * A.collateralLtvCapital);
  const od = g.run.debts.capital.overdue;
  return (
    <div className="pr-terms" data-terms="capital" aria-label="숲속 캐피탈 조건">
      <div><i>값</i>{manTxt(unit)} 대출, 정산 이자 <b>+{comma(perUnit)}</b> <small>(바퀴 한 대의 정산당 예상 순수입 {comma(hm.net)})</small></div>
      <div><i>한도</i>기본 {comma(l.limitByHouse![g.run.house])} + 쳇바퀴 한 대당 <b>+{comma(perWheel)}</b></div>
      <div><i>걷기</i>정산 때 자동이체, 잔액 부족 시 연체</div>
      <div className={od > 0 ? 'hot' : ''}><i>밀리면</i>{l.maxOverdue}회 연체 시 <b>비싼 바퀴부터</b> 압류{od > 0 ? `, 현재 ${od}회` : ''}</div>
    </div>
  );
}

/** 거래소 탭: 오소리 대부가 준 중고폰 속 FRX 숲거래소(Trade.tsx). 폰을 받으면 바로 거래할 수 있다. */
export function PhoneTab() {
  const open = useGame((s) => s.g.run.futures.open);
  if (!open) return <div className="pr-pane"><p className="pr-note">수금폰이 없다.</p></div>;
  return <ProtoTrade />;
}
void say;

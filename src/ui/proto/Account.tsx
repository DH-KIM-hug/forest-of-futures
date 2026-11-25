// 폰 탭(계좌 개설 전): 곰 형이 보내 준 'FRX 숲거래소' 앱. 거래가 아니라 계좌 개설 체크리스트가 먼저 뜬다(STORY_ACT1 3장, U-22).
//   ① 채굴 실적 → 공터   ② 사전 교육 3장 → 앱 안에서 넘긴다(엔진 eduPage)   ③ 모의 거래 1번 → 실시간 시세·가짜 돈(엔진 mockTrade)
//   ④ 예탁금 확인 → 지도의 숲속 캐피탈 창구(엔진 openAccount)
import { useRef, useState, type ReactNode } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { checklist, type CheckRow } from './model';
import { say } from './watch';
import { comma } from '../../engine/util';
import { balance, marketById } from '../../engine/data';
import { price } from '../../engine/selectors';
import { historyOf } from '../priceHistory';
import { fmtPrice, type PositionView } from '../vm/trade';
import { Acorn } from './art';
import { play } from './audio';
import { Charm, Coin, EXCHANGE_NAME, PChart, Tri } from './Trade';
import './trade.css';

type View = 'list' | 'edu' | 'mock';
const MOCK_MARKET = 'DTC';
const MOCK_LEV = 10;
const MOCK_CASH = 100_000;
const MOCK_MARGIN = 25_000;

const Check = () => <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.4l2.8 2.8L10 3.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function Frame({ tag, children, cls = '' }: { tag: string; children: ReactNode; cls?: string }) {
  const charm = useRef<SVGSVGElement>(null);
  return (
    <div className="pt-wrap">
      <div className={'pt pa' + cls} data-pc="kr">
        <Charm r={charm} />
        <header className="pt-bar"><span className="logo"><Acorn size={17} /></span><b>{EXCHANGE_NAME}</b><em>{tag}</em></header>
        {children}
      </div>
    </div>
  );
}

// ── 사전 교육 3장 ────────────────────────────────────────────────────────
const EDU: { title: string; body: ReactNode; fine: string }[] = [
  { title: '1. 선물이란', body: <>오를지 내릴지에 거는 약속입니다. <b className="up">롱</b>은 오르면 벌고, <b className="down">숏</b>은 내리면 법니다.</>, fine: '반대로 가면 같은 만큼 잃습니다.' },
  { title: '2. 레버리지', body: <>레버리지는 수익과 <span className="tiny">손실</span>을 키웁니다. 10배면 시세가 1% 움직일 때 내 돈은 10% 움직입니다.</>, fine: '방금 한 단어가 작게 보였다면 화면 탓이 아닙니다.' },
  { title: '3. 청산', body: <>시세가 청산가에 닿으면 넣은 증거금을 <b>전부</b> 잃습니다. 10배 롱은 약 −10%에서 청산됩니다.</>, fine: '청산된 돈은 돌아오지 않습니다. 빌린 돈이어도 같습니다.' },
];
function Edu({ onBack }: { onBack: () => void }) {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const need = balance.progression.futures.eduPages as number;
  const page = Math.min(g.run.futures.edu, need - 1);
  const [agree, setAgree] = useState(false);
  const last = page >= need - 1;
  const e = EDU[Math.min(page, EDU.length - 1)];
  const next = () => {
    if (last && !agree) { say('아래 작은 네모에 체크해야 한다'); play('insufficient'); return; }
    const r = act({ type: 'eduPage' });
    play(r.ok ? 'ui_tap' : 'insufficient');
    if (last) { play('goal_complete'); say('사전 교육 3장을 마쳤다'); onBack(); }
  };
  return (
    <Frame tag="사전 교육">
      <div className="pa-edu" data-edu={page + 1}>
        <div className="pg">{page + 1} / {need}</div>
        <h3>{e.title}</h3>
        <p>{e.body}</p>
        <small className="fine">{e.fine}</small>
        {last && (
          <label className="agree"><input type="checkbox" checked={agree} onChange={(ev) => setAgree(ev.target.checked)} aria-label="위 내용을 이해했습니다" /><span>위 내용을 이해했습니다</span></label>
        )}
      </div>
      <div className="pt-orders">
        <button className="pt-btn" onClick={onBack}><span>목록으로</span><small>읽은 곳은 남는다</small></button>
        <button className={'pt-btn cta'} onClick={next}><span>{last ? '교육 마치기' : '다음 장'}</span><small>{page + 1}장 읽음</small></button>
      </div>
    </Frame>
  );
}

// ── 모의 거래 ────────────────────────────────────────────────────────────
interface MockPos { dir: 1 | -1; entry: number; tick: number }
function Mock({ onBack }: { onBack: () => void }) {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const [pos, setPos] = useState<MockPos | null>(null);
  const [res, setRes] = useState<number | null>(null);
  const run = g.run;
  const px = price(run, MOCK_MARKET);
  const hist = historyOf(MOCK_MARKET);
  const m = marketById[MOCK_MARKET];
  const roe = pos ? (px / pos.entry - 1) * pos.dir * MOCK_LEV * 100 : 0;
  const pnl = Math.round(MOCK_MARGIN * Math.max(-100, roe) / 100);
  const liq = pos ? pos.entry * (1 - pos.dir / MOCK_LEV) : 0;
  const view: PositionView | null = pos ? {
    market: MOCK_MARKET, name: m.name, dir: pos.dir, dirText: pos.dir === 1 ? '롱' : '숏', lev: MOCK_LEV, roe, pnl, margin: MOCK_MARGIN,
    entry: pos.entry, liq, sl: null, tp: null, slRoe: null, tpRoe: null, tags: [], liqDistPct: (Math.abs(px - liq) / px) * 100, back: MOCK_MARGIN + pnl, reserved: false,
  } : null;
  const open = (dir: 1 | -1) => { play(dir === 1 ? 'order_long' : 'order_short'); setRes(null); setPos({ dir, entry: px, tick: run.tick }); };
  const close = () => {
    if (!pos) return;
    const r = act({ type: 'mockTrade' });
    play(pnl >= 0 ? 'close_profit' : 'close_loss');
    setRes(pnl);
    setPos(null);
    if (r.ok) say(pnl >= 0 ? '곰 형: 봐, 쉽지?' : '곰 형: …모의니까 괜찮아. 진짜는 다를 거야.', 4500);
  };
  const done = run.futures.mock;
  const sign = (x: number) => (x >= 0 ? '+' : '−');
  return (
    <Frame tag="모의" cls=" mock">
      <div className="pa-band" role="status"><b>모의</b> 가짜 돈 {comma(MOCK_CASH)} · 진짜 도토리는 움직이지 않습니다</div>
      <div className="pt-quote">
        <div className="px"><Coin id={MOCK_MARKET} size={22} /><b>{fmtPrice(MOCK_MARKET, px)}</b><span>{m.name}</span></div>
        <div className="mood"><span>배율</span>{MOCK_LEV}배</div>
      </div>
      <PChart market={MOCK_MARKET} hist={hist} pos={view} />
      {pos ? (
        <div className={'pt-pl ' + (roe >= 0 ? 'plus' : 'minus')} aria-label="모의 포지션">
          <div className="pl-top">
            <div className="big"><div className="roe">{sign(roe)}{Math.abs(roe).toFixed(1)}%</div><div className="sub"><b>{sign(pnl)}{comma(Math.abs(pnl))}</b> 가짜 도토리</div></div>
            <div className="liq"><small>청산까지</small><b>{pos.dir === 1 ? '−' : '+'}{view!.liqDistPct.toFixed(1)}%</b></div>
          </div>
        </div>
      ) : res !== null ? (
        <div className={'pt-pl res ' + (res >= 0 ? 'win' : 'lose')} role="status">
          <div className="big"><div className="roe">{sign(res)}{comma(Math.abs(res))}</div><div className="sub">가짜 돈이라 지갑은 그대로다</div></div>
          <div className="stamp">모의 완료</div>
        </div>
      ) : (
        <p className="pt-tut">오를 것 같으면 롱, 내릴 것 같으면 숏. 열었다가 닫으면 한 번이다.</p>
      )}
      <div className="pt-orders">
        {pos ? (
          <>
            <button className="pt-btn" disabled><span>{pos.dir === 1 ? '롱' : '숏'} {MOCK_LEV}배</span><small>증거금 {comma(MOCK_MARGIN)}(가짜)</small></button>
            <button className={'pt-btn close' + (pnl >= 0 ? ' gain' : '')} onClick={close}><span>정리하기</span><small>{sign(pnl)}{comma(Math.abs(pnl))}</small></button>
          </>
        ) : done ? (
          <>
            <button className="pt-btn" onClick={() => open(1)}><span>한 번 더</span><small>연습은 공짜</small></button>
            <button className="pt-btn cta" onClick={onBack}><span>목록으로</span><small>모의 거래 완료</small></button>
          </>
        ) : (
          <>
            <button className="pt-btn long" onClick={() => open(1)}><span><Tri up size={13} />롱</span><small>오른다 · {MOCK_LEV}배</small></button>
            <button className="pt-btn short" onClick={() => open(-1)}><span><Tri up={false} size={13} />숏</span><small>내린다 · {MOCK_LEV}배</small></button>
          </>
        )}
      </div>
      {!pos && !done && <button className="pa-back" onClick={onBack}>← 목록으로</button>}
    </Frame>
  );
}

// ── 체크리스트 ───────────────────────────────────────────────────────────
export function AccountApp() {
  const g = useGame((s) => s.g);
  const setTab = useProto((s) => s.setTab);
  const [view, setView] = useState<View>('list');
  if (view === 'edu') return <Edu onBack={() => setView('list')} />;
  if (view === 'mock') return <Mock onBack={() => setView('list')} />;
  const rows = checklist(g);
  const doneN = rows.filter((r) => r.ok).length;
  const ready = rows.slice(0, 3).every((r) => r.ok);
  const go = (r: CheckRow) => {
    play('ui_tap');
    if (r.id === 'mined') { setTab('lot'); say(r.ok ? '채굴 실적은 채웠다' : `쳇바퀴를 돌려 ${comma(r.need)}어치를 채우자 (지금 ${comma(r.cur)})`, 4000); }
    else if (r.id === 'edu') { if (r.ok) say('사전 교육은 마쳤다'); else setView('edu'); }
    else if (r.id === 'mock') setView('mock');
    else { useProto.getState().patch({ mapFocus: 'capital' }); setTab('map'); if (!ready) say('①②③을 먼저 마치면 창구에서 열어 준다', 4000); }
  };
  const val = (r: CheckRow) => r.id === 'mined' || r.id === 'deposit' ? `${comma(r.cur)} / ${comma(r.need)}` : r.id === 'edu' ? `${r.cur} / ${r.need}장` : `${r.cur} / ${r.need}번`;
  return (
    <Frame tag="계좌 개설">
      <div className="pa-head">
        <b>선물 계좌 개설</b>
        <span>네 가지를 마치면 열립니다 · {doneN}/4</span>
      </div>
      <div className="pa-list">
        {rows.map((r, i) => (
          <button key={r.id} className={'pa-row' + (r.ok ? ' ok' : '') + (r.id === 'deposit' && !ready ? ' wait' : '')} data-check={r.id} onClick={() => go(r)}>
            <i className="ck">{r.ok ? <Check /> : i + 1}</i>
            <span className="tx"><b>{r.label}</b><small>{r.where}</small></span>
            <span className="vl">{r.ok && r.id !== 'mined' ? '완료' : val(r)}</span>
            <span className="bar"><i style={{ width: `${Math.min(100, (r.cur / Math.max(1, r.need)) * 100)}%` }} /></span>
          </button>
        ))}
      </div>
      <p className="pa-foot">곰 형 「넷 다 하면 진짜야. 형은 10분 만에 했어.」</p>
    </Frame>
  );
}

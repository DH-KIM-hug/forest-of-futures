import '@fontsource/jua/korean-400.css';
import '@fontsource/jua/latin-400.css';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto, type Tab } from './protoStore';
import { currentGoal, goalAt, perSettle, debtLine, GOAL_COUNT, isNearLiq, perSec, rateTxt, firstVisitSec, lifeNo } from './model';
import { tensionOf } from './tension';
import { awayMoney } from './away';
import { liveHistoryOf } from '../priceHistory';
import { startWatch, SAVINGS_STEPS, savingsStep } from './watch';
import { startHistory } from '../priceHistory';
import { Lot, useOpenPositions } from './Lot';
import { MapTab, PhoneTab } from './Tabs';
import { EndingFlow } from './Ending';
import { CutIn } from './CutIn';
import { Prologue, prologueSeen } from './Prologue';
import { endPrologue } from './dev';
import { ProfitPrompt } from './ProfitPrompt';
import { WalletSheet } from './Wallet';
import { DayNoteSheet } from './NewsSheet';
import { dayBars } from './daynote';
import { tutorialEnd } from './tutorial';
import { isFast, isCheat } from './config';
import { clone } from '../../engine/game';
import { comma } from '../../engine/util';
import { interestDue, lenderDebtTotal, ownedCoins, walletValue } from '../../engine/selectors';
import { ledgerGoal } from './ledger';
import { has } from '../../engine/skilltree';
import { useUI } from '../uiStore';
import { forecast } from '../../engine/settlement';
import { balance, DEBT_IDS } from '../../engine/data';
import { Acorn, RowIcon } from './art';
import { LiveBadge } from '../../net/hlDirect/LiveBadge';
import { SoundBtn, SoundLab, useAudioDirector } from './AudioUi';
import { pdev } from './config';
import { clockText, useClock, useCountUp, useFx, reduced } from './fx';
import './proto.css';

const TABS: { id: Tab; label: string; col: string }[] = [
  // 탭 셋(U-29·U-30): 집이 가운데(늘 한 단 높다). 지도와 거래소는 이야기 사건으로 열린다.
  { id: 'map', label: '지도', col: '#F3E7C6' },
  { id: 'lot', label: '집', col: '#E9C99A' },
  { id: 'phone', label: '거래소', col: '#9AD0C2' },
];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function Hud() {
  const g = useGame((s) => s.g);
  const tab = useProto((s) => s.tab);
  const goalIdx = useProto((s) => s.goalIdx);
  const everOpened = useProto((s) => s.everOpened);
  const waiting = useProto((s) => s.waiting);
  const loanTaken = useProto((s) => s.loanTaken);
  const flags = { everOpened, waiting, loanTaken };
  const now = useClock();
  const run = g.run;
  const ps = perSettle(g);
  // 첫 생의 첫 추심원은 60초 뒤에 온다(U-39 ⑤): 그 막대는 60초짜리다
  const total = run.settleNo === 0 && lifeNo(g) <= 1 ? Math.max(firstVisitSec(balance.settlement.intervalSec), run.settleIn) : balance.settlement.intervalSec;
  const left = Math.max(0, run.settleIn);
  const gi = currentGoal(g, goalIdx, flags);
  const fc0 = forecast(g);
  // 빚이 0 이면 남은 튜토리얼 목표(첫 포지션 · 첫 상환)는 뜻이 없다: 장부가 깨끗하다고만 적는다(U-39 ⑧)
  const goal0 = gi < GOAL_COUNT && lenderDebtTotal(run) > 0 ? goalAt(g, gi, flags) : null;
  // 튜토리얼 목표가 끝나면 오소리 장부가 목표다(U-38): 5만을 갚을 때마다 금박 도장 하나, 이자가 얼마 주는지도 같이
  const lg = goal0 ? null : ledgerGoal(g);
  const seenP = useProto((st) => st.seen);
  // 빚 없는 생을 이어 가는 동안([계속한다], U-40): 모은 돈의 다음 고비가 목표다. 다 넘으면 언제든 닫을 수 있다고만 적는다
  const sv = seenP.continued && lenderDebtTotal(run) === 0 ? savingsStep(seenP) : -1;
  const goalSave = sv >= 0 && sv < SAVINGS_STEPS.length ? { label: '빚 없는 아침 · 모은 돈', cur: Math.min(Math.floor(run.cash), SAVINGS_STEPS[sv]), need: SAVINGS_STEPS[sv] } : null;
  const otherDebt = lenderDebtTotal(run) - run.debts.shark1.principal;
  const goal: { label: string; cur: number; need: number; sub?: string } | null = goal0 ?? (lg ? { label: lg.label, cur: lg.cur, need: lg.need, sub: `이자 −${comma(lg.cut)}` } : goalSave);
  // 손에 든 돈으로 지금 갚으면 금박 도장 막대가 어디까지 차는가(U-41): 다음 정산에 낼 돈은 남겨 두고 센다. 거래로 딴 돈이 장부에 얼마나 가까운지가 집에서 보인다
  const spare = lg ? Math.max(0, Math.min(lg.need - lg.cur, Math.floor(run.cash - (fc0.interest + fc0.living + fc0.wages)))) : 0;
  const ghost = lg && spare >= 1000 ? Math.min(1, (lg.cur + spare) / lg.need) : null;
  const goalEnd = sv >= SAVINGS_STEPS.length ? '도토리 100만 · 사무소에서 언제든 이 생을 닫을 수 있다' : otherDebt > 0 ? `오소리 장부는 깨끗하다 · 다른 빚 ${comma(otherDebt)} (지도)` : '빚 0 · 장부가 깨끗하다';
  const interest = (['bank', 'capital', 'shark1', 'shark2'] as const).reduce((a, id) => a + interestDue(g, id), 0);
  const cash = useCountUp(run.cash);
  void 0;
  // 숫자가 오르면 통, 내리면 움찔
  const prevCash = useRef(run.cash);
  const [bump, setBump] = useState<{ k: number; dir: 'up' | 'down' }>({ k: 0, dir: 'up' });
  useEffect(() => {
    if (run.cash !== prevCash.current) setBump((b) => ({ k: b.k + 1, dir: run.cash > prevCash.current ? 'up' : 'down' }));
    prevCash.current = run.cash;
  }, [run.cash]);
  const lot = tab === 'lot';
  const [brk, setBrk] = useState(() => pdev === 'wallet' && /pbrk=1/.test(window.location.search));
  const fc = forecast(g);
  const rd = (n: number) => comma(Math.round(n));
  const sec = (n: number) => rateTxt(perSec(n));
  const hasWheel = ownedCoins(run).length > 0;
  const rate = run.effects.find((e) => e.type === 'rateMultiplier') ?? null;
  return (
    <header className={'pr-hud' + (lot ? ' over' : '')}>
      <div className="r1">
        <div className="lt">
          <div className="clock">{clockText(now)} <SoundBtn /><LiveBadge /></div>
          {debtLine(g) > 0 && <div className="debt" data-hl="debt"><b>빚 {comma(debtLine(g))}</b><span key={interest} className={'int' + (run.settleNo > 0 || loanTaken ? ' bumped' : '')}>정산마다 이자 {comma(interest)}</span>{rate && <span className="hike">금리 {rate.multiplier}배 · {rate.remaining}회 남음{run.debts.shark1.inherited > 0 ? ' · 엄마 빚 빼고' : ''}</span>}{fc.living > 0 && <span>생활비 {rd(fc.living)}</span>}</div>}
        </div>
        <DevBar />
        <div className="acorn">
          <div className="n" data-hl="acorn"><span key={bump.k} className={bump.k ? 'v n-' + bump.dir : 'v'}>{comma(cash)}</span><i id="pr-acorn-ic"><Acorn size={26} /></i></div>
          <button className={'ps' + (ps < 0 ? ' neg' : '') + (brk ? ' open' : '')} aria-expanded={brk} data-ps data-hl="ps" onClick={() => setBrk((b) => !b)}>초당 {ps >= 0 ? '+' : '−'}{rateTxt(perSec(ps))} <i>{brk ? '▴\uFE0E' : '▾\uFE0E'}</i></button>
          {hasWheel && <button className="walbtn" data-hl="wallet" onClick={() => useProto.getState().patch({ wallet: true })} aria-label="콜드월렛 열기"><Acorn size={15} />지갑 {comma(Math.round(walletValue(run)))}</button>}
        </div>
      </div>
      {brk && (
        <div className="brk" role="status"><i>초당 (탭은 빼고)</i> 알바 채굴 <b className="up">+{sec(fc.mined)}</b> · 일당 <b className="dn">−{sec(fc.wages)}</b> · 이자 <b className="dn">−{sec(fc.interest)}</b> · 생활비 <b className="dn">−{sec(fc.living)}</b> = <b className={fc.net >= 0 ? 'up' : 'dn'}>{fc.net >= 0 ? '+' : '−'}{sec(Math.abs(fc.net))}</b><br /><i>정산 때 걷는 돈</i> 이자 {rd(fc.interest)} + 생활비 {rd(fc.living)} + 일당 {rd(fc.wages)}</div>
      )}
      {lot && (
        <>
          <div key={'g' + gi + (lg ? ':' + Math.floor(lg.cur / lg.need) : '')} className="goal" data-hl="goal" role="progressbar" aria-valuenow={goal?.cur ?? 1} aria-valuemax={goal?.need ?? 1} aria-label="목표">
            {ghost !== null && <div className="fill ghost" data-ghost style={{ width: `${ghost * 100}%` }} />}
            <div className="fill" style={{ width: goal ? `${(goal.cur / goal.need) * 100}%` : '100%' }} />
            <span><small>목표</small> {goal ? goal.label : goalEnd}</span>{goal && <em>{ghost !== null ? <i className="gsub gh">{ghost >= 1 ? '갚으면 도장' : `손에 +${comma(spare)}`}</i> : goal.sub && <i className="gsub">{goal.sub}</i>}{comma(goal.cur)}/{comma(goal.need)}</em>}
          </div>
          <div key={'s' + run.settleNo} className={'settle' + (run.settleNo > 0 ? ' rang' : '') + (left <= 5 ? ' soon' : '') + (waiting ? ' held' : '')} data-hl="settle">
            <div className="fill" style={{ width: `${((total - left) / total) * 100}%` }} /><span>{waiting ? '정산 · 추심원이 기다린다' : '정산 (이자 걷는 시간)'}</span><em>{mmss(left)}</em>
          </div>
        </>
      )}
    </header>
  );
}

function TabBar() {
  const tab = useProto((s) => s.tab);
  const setTab = useProto((s) => s.setTab);
  const un = useProto((s) => s.everUnlocked);
  const visited = useProto((s) => s.visited);
  const g = useGame((s) => s.g);
  const waiting = useProto((s) => s.waiting);
  const cheer = useProto((s) => !!s.cheer);
  const pos = useOpenPositions();
  const [shake, setShake] = useState<string | null>(null);
  const open = (id: Tab) => id === 'lot' || !!un[id];
  const near = pos.find((p) => isNearLiq(p));
  const overdue = DEBT_IDS.some((id) => g.run.debts[id].overdue > 0);
  const badge = (id: Tab): { t: string; hot: boolean } | null => {
    // 방금 크게 땄다(U-41): 집이 들썩이는 동안 집 탭에 꼬리표
    if (id === 'lot' && tab !== 'lot' && cheer) return { t: '잔치 중', hot: false };
    if (id === 'lot' && tab !== 'lot') return { t: mmss(Math.max(0, g.run.settleIn)), hot: g.run.settleIn <= 10 };
    if (id === 'phone' && near) return { t: `▼청산 ${near.liqDistPct.toFixed(1)}%`, hot: true };
    // 청산이 지난 1분 폭의 세 배 안으로 들어오면 탭 꼬리표가 붉어진다(U-39 ①)
    if (id === 'phone' && pos.length && ['tight', 'edge'].includes(tensionOf(pos[0].liqDistPct, liveHistoryOf(pos[0].market)).reach)) return { t: `${pos[0].netRoe >= 0 ? '▲+' : '▼−'}${Math.abs(pos[0].netRoe).toFixed(0)}% !`, hot: true };
    if (id === 'phone' && pos.length) return { t: `${pos[0].netRoe >= 0 ? '▲+' : '▼−'}${Math.abs(pos[0].netRoe).toFixed(0)}%`, hot: false };
    if (id === 'map' && waiting) return { t: '사무소', hot: true };
    if (id === 'map' && overdue) return { t: '연체', hot: true };
    return null;
  };
  return (
    <nav className="pr-tabs" aria-label="탭">
      {TABS.map((t) => {
        const ok = open(t.id);
        const on = tab === t.id;
        const b = ok ? badge(t.id) : null;
        return (
          <button key={t.id} data-tab={t.id} data-hl={t.id === 'map' ? 'tabMap' : undefined} className={'st' + (t.id === 'lot' ? ' home' : '') + (on ? ' on' : '') + (ok ? '' : ' lock') + (shake === t.id ? ' no' : '')} aria-current={on ? 'page' : undefined}
            onClick={() => { if (ok) setTab(t.id); else { setShake(t.id); window.setTimeout(() => setShake(null), 400); } }} aria-label={ok ? t.label : '잠긴 탭'}>
            {on && <i className="base" />}
            <span className="c" style={ok ? { background: t.col } : undefined}>{ok ? <RowIcon kind={t.id} size={t.id === 'lot' ? 44 : on ? 38 : 32} /> : '?'}</span>
            <small>{ok ? t.label : ''}</small>
            {ok && !visited[t.id] && <i className="dot" />}
            {b && <i className={'bdg' + (b.hot ? ' hot' : '')}>{b.t}</i>}
          </button>
        );
      })}
    </nav>
  );
}

/** 강제 청산: 장면 흔들림 + 붉은 '청산' 도장(대 등급) */
function LiqStamp({ onShake }: { onShake: () => void }) {
  const [hit, setHit] = useState<{ k: number; name: string } | null>(null);
  const legend = useGame((s) => has(s.g, 'B4'));
  useFx((e) => {
    if (e.kind !== 'liq') return;
    setHit((h) => ({ k: (h?.k ?? 0) + 1, name: e.market }));
    if (!reduced()) onShake();
    window.setTimeout(() => setHit(null), 1800);
  });
  if (!hit) return null;
  return (
    <div key={hit.k} className="pr-liq" aria-live="assertive">
      <div className={'stamp' + (legend ? ' legend' : '')}>청산</div>
      <p>{legend ? `${hit.name} 몰빵이 전설로 남았다` : `${hit.name} 포지션이 강제로 정리됐다`}</p>
    </div>
  );
}

function DevBar() {
  const setGame = useGame((s) => s.setGame);
  if (!isCheat) return null;
  const mut = (f: (g: ReturnType<typeof clone<ReturnType<typeof useGame.getState>['g']>>) => void) => { const g = clone(useGame.getState().g); f(g); setGame(g); };
  return (
    <div className="pr-dev" aria-label="개발 단추">
      <b>FAST {balance.settlement.intervalSec}s</b>
      <span>
        <button onClick={() => mut((g) => { g.run.cash += 100000; g.run.minedValue += 100000; })}>+10만</button>
        <button onClick={() => mut((g) => { g.run.settleIn = 1; })}>정산</button>
      </span>
    </div>
  );
}

/** 자리를 비운 사이(U-39 ④): 돌아왔을 때 한 장. 엔진이 따라잡은 기록(포지션은 전부, 정산은 2번까지)을 그대로 읽는다. */
function AwayNote() {
  const a = useProto((s) => s.away);
  const scene = useProto((s) => s.scenes.length > 0);
  const over = useGame((s) => s.g.run.over);
  if (!a || scene || over) return null;
  const close = () => { useProto.getState().patch({ away: null }); useGame.setState((s) => ({ net: { ...s.net, away: null } })); };
  return (
    <div className="pr-notice pr-away" role="dialog" aria-label="자리를 비운 사이" data-away>
      <div className="box">
        <h3>{a.title}</h3>
        {a.note && <p className="col"><b>추심원의 쪽지</b>「{a.note}」</p>}
        {a.left.length > 0 && <p className="sub">나갈 때 열어 둔 포지션: {a.left.join(', ')}{a.stillOpen > 0 ? ` · 아직 ${a.stillOpen}개 열려 있다` : ''}</p>}
        {a.rows.length > 0 && (
          <div className="rows">
            {a.rows.map((r) => <div key={r.key} className={'rw ' + r.tone}><span>{r.text}{r.after && <small>{r.after}</small>}</span>{r.amount !== null && <b>{awayMoney(r.amount)}</b>}</div>)}
          </div>
        )}
        {a.rows.length === 0 && !a.note && <p className="sub">아무 일도 없었다. 시세만 움직였다.</p>}
        <div className="sum"><span>가진 돈 <b className={a.cashDelta >= 0 ? 'up' : 'dn'}>{awayMoney(a.cashDelta)}</b></span><span>빚 <b className={a.debtDelta > 0 ? 'dn' : 'up'}>{awayMoney(a.debtDelta)}</b></span></div>
        <button className="buy on wide" data-away-ok onClick={close}><span>확인</span></button>
      </div>
    </div>
  );
}

/** 튜토리얼 끝 알림(U-31): 방금 그 거래는 짜 둔 시세였고, 지금부터는 실제 시세라는 것을 그대로 말한다. */
function TutorialNotice() {
  const on = useProto((s) => s.tutorial === 'notice');
  const scene = useProto((s) => s.scenes.length > 0);
  const net = useGame((s) => s.net);
  if (!on || scene) return null;
  const live = net.source === 'hl' && !net.fallback;
  return (
    <div className="pr-notice" role="dialog" aria-label="튜토리얼 끝" data-notice>
      <div className="box">
        <h3>튜토리얼 끝</h3>
        <p>방금 그 거래는 <b>연습용으로 짜 둔 시세</b>였습니다. 어느 쪽을 골라도 청산되게 되어 있었습니다.</p>
        <p>{live ? <>지금부터 거래소 시세는 <b>실제 시세</b>(실시간)로 움직입니다.</> : <>지금부터 거래소 시세는 짜 둔 길 없이 움직입니다. <b>이 판은 오프라인 연습 시세</b>이고, 온라인이면 실제 시세(실시간)를 씁니다.</>}</p>
        <p className="sub">빚과 이자, 쳇바퀴와 알바는 아까 그대로입니다.</p>
        <button className="buy on wide" data-notice-ok onClick={tutorialEnd}><span>확인</span></button>
      </div>
    </div>
  );
}

export function ProtoApp() {
  const tab = useProto((s) => s.tab);
  const toast = useProto((s) => s.toast);
  const prologue = useProto((s) => s.prologue);
  const [skip] = useState(() => prologueSeen());
  const openPos = useOpenPositions();
  const dark = openPos.some((p) => isNearLiq(p));
  // 심장 소리: 청산 임박, 또는 청산이 지난 1분 폭의 세 배 안으로 들어왔을 때(U-39 ①)
  const tense = openPos.some((p) => ['tight', 'edge'].includes(tensionOf(p.liqDistPct, liveHistoryOf(p.market)).reach));
  useAudioDirector(dark || tense);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { startHistory(); startWatch(); }, []);
  // 자동 플레이 검증용 읽기 전용 창(&e2e=1): 상태를 읽기만 한다. 바꾸는 길은 없다.
  useEffect(() => {
    if (!/[?&]e2e=1/.test(window.location.search)) return;
    (window as unknown as { __fofRead?: () => unknown }).__fofRead = () => {
      const g = useGame.getState().g, r = g.run, P = useProto.getState();
      return { cash: r.cash, settleNo: r.settleNo, settleIn: r.settleIn, mined: r.minedValue, taps: r.stats.laborTaps ?? 0, wheels: Object.keys(r.coinWheels), equip: r.equipment.map((u) => u.tier), staffed: (r.coinWheels.DTC?.staffed ? 1 : 0) + r.equipment.filter((u) => u.staffed).length, speed: useGame.getState().speed, waiting: P.waiting, loanTaken: P.loanTaken, tutorial: P.tutorial, interest: (['bank', 'capital', 'shark1', 'shark2'] as const).reduce((a, id) => a + interestDue(g, id), 0), overdue: r.debts.shark1.overdue, wheelTag: r.coinWheels.DTC?.tagBy ?? null, last: r.lastSettlement, over: r.over,
        fut: r.futures, pos: Object.values(r.positions).map((p) => ({ m: p.market, dir: p.dir, lev: p.lev, margin: p.margin0 })), debts: Object.fromEntries(Object.entries(r.debts).map(([k, v]) => [k, v.principal])), friend: r.friends.squirrel.debt,
        gen: g.family.generation, han: g.family.han, estate: g.estate?.step ?? null, lastClose: r.lastClose, tab: P.tab, unlocked: P.everUnlocked, scene: P.scenes[0]?.id ?? null, prologue: P.prologue, prices: r.prices, stamps: r.stats.stamps ?? 0, walletOn: P.wallet,
        repaid: r.stats['repaid.shark1'] ?? 0, gold: g.family.gold ?? 0, skill: g.family.skill ?? {}, runSkill: r.skill ?? {}, seen: Object.keys(P.seen), marginCall: r.marginCall ?? null, liqs: r.stats.liqCount ?? 0, cause: r.bankruptcy?.cause ?? null, ending: g.pendingEnding?.title ?? null, endingId: g.pendingEnding?.id ?? null, tradeUi: useUI.getState().trade,
        think: P.think?.text ?? null, cheer: P.cheer, tradeLife: P.tradeLife, claimWins: P.claimWins, paidLife: P.paidLife, dayNote: P.dayNote, day: Object.fromEntries(Object.keys(r.prices).map((k) => { const b = dayBars(k); return [k, [b.length, b[0]?.t ?? 0, b[b.length - 1]?.t ?? 0]]; })), posStops: Object.values(r.positions).map((p) => ({ m: p.market, sl: p.slRoe, tp: p.tpRoe, notional: p.notional, fees: p.feesPaid })), away: P.away, capOverdue: r.debts.capital.overdue, effects: r.effects.map((e) => e.type + ':' + e.multiplier + ':' + e.remaining), ledger: Object.keys(g.family.ledger), tick: r.tick };
    };
  }, []);
  // 흔들림: 감싸개만, 감쇠하는 사인 합(무작위 떨림 아님)
  const shake = () => root.current?.animate(
    [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => { const k = (1 - i / 8) ** 2; return { transform: `translate(${(10 * k * Math.sin(i * 1.7)).toFixed(1)}px, ${(7 * k * Math.sin(i * 2.3)).toFixed(1)}px) rotate(${(1.2 * k * Math.sin(i * 1.1)).toFixed(2)}deg)` }; }),
    { duration: 480, easing: 'linear' },
  );
  return (
    <div ref={root} className={'pr' + (dark ? ' dark' : '') + ' tab-' + tab}>
      <Hud />
      <main className="pr-main">
        {tab === 'lot' && <Lot />}
        {tab === 'map' && <MapTab />}
        {tab === 'phone' && <PhoneTab />}
        {toast && <div className="pr-toast" role="status">{toast}</div>}
      </main>
      <TabBar />
      <CutIn />
      <LiqStamp onShake={shake} />
      <EndingFlow />
      <ProfitPrompt />
      <WalletSheet />
      <TutorialNotice />
      <AwayNote />
      <DayNoteSheet />
      {prologue && <Prologue onDone={endPrologue} canSkip={skip} />}
      {pdev === 'sounds' && <SoundLab />}
    </div>
  );
}

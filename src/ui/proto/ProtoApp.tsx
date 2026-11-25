import '@fontsource/jua/korean-400.css';
import '@fontsource/jua/latin-400.css';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto, type Tab } from './protoStore';
import { currentGoal, goalAt, perSettle, debtLine, GOAL_COUNT, isNearLiq } from './model';
import { startWatch } from './watch';
import { startHistory } from '../priceHistory';
import { Lot, useOpenPositions } from './Lot';
import { UpgTab, MapTab, PhoneTab } from './Tabs';
import { PeopleTab } from './People';
import { EndingFlow } from './Ending';
import { CutIn } from './CutIn';
import { Prologue, prologueSeen } from './Prologue';
import { endPrologue } from './dev';
import { ProfitPrompt } from './ProfitPrompt';
import { WalletSheet } from './Wallet';
import { isFast, isCheat } from './config';
import { clone } from '../../engine/game';
import { comma } from '../../engine/util';
import { interestDue, ownedCoins, walletValue } from '../../engine/selectors';
import { forecast } from '../../engine/settlement';
import { balance, DEBT_IDS } from '../../engine/data';
import { Acorn, RowIcon } from './art';
import { LiveBadge } from '../../net/hlDirect/LiveBadge';
import { SoundBtn, SoundLab, useAudioDirector } from './AudioUi';
import { pdev } from './config';
import { clockText, useClock, useCountUp, useFx, reduced } from './fx';
import './proto.css';

const TABS: { id: Tab; label: string; col: string }[] = [
  { id: 'lot', label: '공터', col: '#BCD48E' },
  { id: 'people', label: '인맥', col: '#F2C9A0' },
  { id: 'upg', label: '강화', col: '#E7D27A' },
  { id: 'phone', label: '폰', col: '#9AD0C2' },
  { id: 'map', label: '지도', col: '#F3E7C6' },
];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function Hud() {
  const g = useGame((s) => s.g);
  const tab = useProto((s) => s.tab);
  const goalIdx = useProto((s) => s.goalIdx);
  const everOpened = useProto((s) => s.everOpened);
  const now = useClock();
  const run = g.run;
  const ps = perSettle(g);
  const total = balance.settlement.intervalSec;
  const left = Math.max(0, run.settleIn);
  const gi = currentGoal(g, goalIdx, { everOpened });
  const goal = gi < GOAL_COUNT ? goalAt(g, gi, { everOpened }) : null;
  const interest = (['bank', 'capital', 'shark1', 'shark2'] as const).reduce((a, id) => a + interestDue(g, id), 0);
  const cash = useCountUp(run.cash);
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
  const hasWheel = ownedCoins(run).length > 0;
  const rate = run.effects.find((e) => e.type === 'rateMultiplier') ?? null;
  return (
    <header className={'pr-hud' + (lot ? ' over' : '')}>
      <div className="r1">
        <div className="lt">
          <div className="clock">{clockText(now)} <SoundBtn /><LiveBadge /></div>
          {debtLine(g) > 0 && <div className="debt"><b>빚 {comma(debtLine(g))}</b><span>정산마다 이자 {comma(interest)}</span>{rate && <span className="hike">금리 {rate.multiplier}배 · {rate.remaining}회 남음</span>}{fc.living > 0 && <span>생활비 {rd(fc.living)}</span>}</div>}
        </div>
        <DevBar />
        <div className="acorn">
          <div className="n"><span key={bump.k} className={bump.k ? 'v n-' + bump.dir : 'v'}>{comma(cash)}</span><i id="pr-acorn-ic"><Acorn size={26} /></i></div>
          {ps === null && run.settleNo === 0 && <div className="memo">엄마 비상금 「급할 때」</div>}
          {ps !== null && <button className={'ps' + (ps < 0 ? ' neg' : '') + (brk ? ' open' : '')} aria-expanded={brk} data-ps onClick={() => setBrk((b) => !b)}>정산당 {ps >= 0 ? '+' : '−'}{comma(Math.abs(ps))} <i>{brk ? '▴\uFE0E' : '▾\uFE0E'}</i></button>}
          {hasWheel && <button className="walbtn" onClick={() => useProto.getState().patch({ wallet: true })} aria-label="콜드월렛 열기"><Acorn size={15} />지갑 {comma(Math.round(walletValue(run)))}</button>}
        </div>
      </div>
      {brk && ps !== null && (
        <div className="brk" role="status"><i>다음 정산 예상</i> 채굴 <b className="up">+{rd(fc.mined)}</b> · 전기 <b className="dn">−{rd(fc.power)}</b> · 이자 <b className="dn">−{rd(fc.interest)}</b> · 생활비 <b className="dn">−{rd(fc.living)}</b> = <b className={fc.net >= 0 ? 'up' : 'dn'}>{fc.net >= 0 ? '+' : '−'}{rd(Math.abs(fc.net))}</b></div>
      )}
      {lot && (
        <>
          <div key={'g' + gi} className="goal" role="progressbar" aria-valuenow={goal?.cur ?? 1} aria-valuemax={goal?.need ?? 1} aria-label="목표">
            <div className="fill" style={{ width: goal ? `${(goal.cur / goal.need) * 100}%` : '100%' }} />
            <span><small>목표</small> {goal ? goal.label : '1막 끝. 이제 빚과 거래뿐'}</span>{goal && <em>{comma(goal.cur)}/{comma(goal.need)}</em>}
          </div>
          <div key={'s' + run.settleNo} className={'settle' + (run.settleNo > 0 ? ' rang' : '') + (left <= 5 ? ' soon' : '')}>
            <div className="fill" style={{ width: `${((total - left) / total) * 100}%` }} /><span>정산</span><em>{mmss(left)}</em>
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
  const pos = useOpenPositions();
  const [shake, setShake] = useState<string | null>(null);
  const open = (id: Tab) => id === 'lot' || !!un[id];
  const near = pos.find((p) => isNearLiq(p));
  const overdue = DEBT_IDS.some((id) => g.run.debts[id].overdue > 0);
  const badge = (id: Tab): { t: string; hot: boolean } | null => {
    if (id === 'lot' && tab !== 'lot') return { t: mmss(Math.max(0, g.run.settleIn)), hot: g.run.settleIn <= 10 };
    if (id === 'phone' && near) return { t: `▼청산 ${near.liqDistPct.toFixed(1)}%`, hot: true };
    if (id === 'phone' && pos.length) return { t: `${pos[0].roe >= 0 ? '▲+' : '▼−'}${Math.abs(pos[0].roe).toFixed(0)}%`, hot: false };
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
          <button key={t.id} className={'st' + (on ? ' on' : '') + (ok ? '' : ' lock') + (shake === t.id ? ' no' : '')} aria-current={on ? 'page' : undefined}
            onClick={() => { if (ok) setTab(t.id); else { setShake(t.id); window.setTimeout(() => setShake(null), 400); } }} aria-label={ok ? t.label : '잠긴 탭'}>
            {on && <i className="base" />}
            <span className="c" style={ok ? { background: t.col } : undefined}>{ok ? <RowIcon kind={t.id} size={on ? 38 : 32} /> : '?'}</span>
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
  useFx((e) => {
    if (e.kind !== 'liq') return;
    setHit((h) => ({ k: (h?.k ?? 0) + 1, name: e.market }));
    if (!reduced()) onShake();
    window.setTimeout(() => setHit(null), 1800);
  });
  if (!hit) return null;
  return (
    <div key={hit.k} className="pr-liq" aria-live="assertive">
      <div className="stamp">청산</div>
      <p>{hit.name} 포지션이 강제로 정리됐다</p>
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

export function ProtoApp() {
  const tab = useProto((s) => s.tab);
  const toast = useProto((s) => s.toast);
  const prologue = useProto((s) => s.prologue);
  const [skip] = useState(() => prologueSeen());
  const dark = useOpenPositions().some((p) => isNearLiq(p));
  useAudioDirector(dark);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { startHistory(); startWatch(); }, []);
  // 자동 플레이 검증용 읽기 전용 창(&e2e=1): 상태를 읽기만 한다. 바꾸는 길은 없다.
  useEffect(() => {
    if (!/[?&]e2e=1/.test(window.location.search)) return;
    (window as unknown as { __fofRead?: () => unknown }).__fofRead = () => {
      const g = useGame.getState().g, r = g.run, P = useProto.getState();
      return { cash: r.cash, settleNo: r.settleNo, settleIn: r.settleIn, mined: r.minedValue, taps: r.acornTaps, wheels: Object.keys(r.coinWheels), equip: r.equipment.map((u) => u.tier), over: r.over,
        fut: r.futures, pos: Object.values(r.positions).map((p) => ({ m: p.market, dir: p.dir, lev: p.lev, margin: p.margin0 })), debts: Object.fromEntries(Object.entries(r.debts).map(([k, v]) => [k, v.principal])), friend: r.friends.squirrel.debt,
        gen: g.family.generation, han: g.family.han, estate: g.estate?.step ?? null, lastClose: r.lastClose, tab: P.tab, unlocked: P.everUnlocked, scene: P.scenes[0]?.id ?? null, prologue: P.prologue, prices: r.prices, stamps: r.stats.stamps ?? 0, walletOn: P.wallet };
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
        {tab === 'upg' && <UpgTab />}
        {tab === 'map' && <MapTab />}
        {tab === 'phone' && <PhoneTab />}
        {tab === 'people' && <PeopleTab />}
        {toast && <div className="pr-toast" role="status">{toast}</div>}
      </main>
      <TabBar />
      <CutIn />
      <LiqStamp onShake={shake} />
      <EndingFlow />
      <ProfitPrompt />
      <WalletSheet />
      {prologue && <Prologue onDone={endPrologue} canSkip={skip} />}
      {pdev === 'sounds' && <SoundLab />}
    </div>
  );
}

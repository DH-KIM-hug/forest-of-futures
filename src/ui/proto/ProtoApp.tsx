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
import { ProfitPrompt } from './ProfitPrompt';
import { WalletSheet } from './Wallet';
import { BOSS_NAME } from './text';
import { isFast, isCheat } from './config';
import { clone } from '../../engine/game';
import { comma } from '../../engine/util';
import { interestDue, ownedCoins, walletValue } from '../../engine/selectors';
import { forecast } from '../../engine/settlement';
import { balance, DEBT_IDS } from '../../engine/data';
import { Acorn, RowIcon, O } from './art';
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
  return (
    <header className={'pr-hud' + (lot ? ' over' : '')}>
      <div className="r1">
        <div className="lt">
          <div className="clock">{clockText(now)} <SoundBtn /><LiveBadge /></div>
          {debtLine(g) > 0 && <div className="debt"><b>빚 {comma(debtLine(g))}</b><span>이자 {comma(interest)}/정산</span>{fc.living > 0 && <span>생활비 {rd(fc.living)}</span>}</div>}
        </div>
        <DevBar />
        <div className="acorn">
          <div className="n"><span key={bump.k} className={bump.k ? 'v n-' + bump.dir : 'v'}>{comma(cash)}</span><i id="pr-acorn-ic"><Acorn size={26} /></i></div>
          {ps !== null && <button className={'ps' + (ps < 0 ? ' neg' : '') + (brk ? ' open' : '')} aria-expanded={brk} onClick={() => setBrk((b) => !b)}>정산당 {ps >= 0 ? '+' : '−'}{comma(Math.abs(ps))} <i>{brk ? '▴\uFE0E' : '▾\uFE0E'}</i></button>}
          {hasWheel && <button className="walbtn" onClick={() => useProto.getState().patch({ wallet: true })} aria-label="콜드월렛 열기"><Acorn size={15} />지갑 {comma(Math.round(walletValue(run)))}</button>}
        </div>
      </div>
      {brk && ps !== null && (
        <div className="brk" role="status">채굴 <b className="up">+{rd(fc.mined)}</b> · 전기 <b className="dn">−{rd(fc.power)}</b> · 이자 <b className="dn">−{rd(fc.interest)}</b> · 생활비 <b className="dn">−{rd(fc.living)}</b> = <b className={fc.net >= 0 ? 'up' : 'dn'}>{fc.net >= 0 ? '+' : '−'}{rd(Math.abs(fc.net))}</b></div>
      )}
      {lot && (
        <>
          <div key={'g' + gi} className="goal" role="progressbar" aria-valuenow={goal?.cur ?? 1} aria-valuemax={goal?.need ?? 1} aria-label="목표">
            <div className="fill" style={{ width: goal ? `${(goal.cur / goal.need) * 100}%` : '100%' }} />
            <span><small>목표</small> {goal ? goal.label : '다 했다! 이제 빚과 거래뿐'}</span>{goal && <em>{comma(goal.cur)}/{comma(goal.need)}</em>}
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

/** 오소리 대부 반신(와이어프레임 컷인 그림을 옮김). win=웃음, 아니면 정색 */
function BossBust({ win }: { win: boolean }) {
  return (
    <svg className="bust" viewBox="20 300 350 430" aria-hidden="true">
      <polygon points="40,844 70,640 320,640 350,844" fill="#5d5446" stroke={O} strokeWidth={3} strokeLinejoin="round" />
      <polygon points="170,640 195,720 220,640" fill="#E9D9B4" stroke={O} strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={85} cy={360} r={46} fill="#8C8478" stroke={O} strokeWidth={3} /><circle cx={305} cy={360} r={46} fill="#8C8478" stroke={O} strokeWidth={3} />
      <circle cx={85} cy={360} r={24} fill="#5d5446" stroke={O} strokeWidth={2} /><circle cx={305} cy={360} r={24} fill="#5d5446" stroke={O} strokeWidth={2} />
      <ellipse cx={195} cy={470} rx={150} ry={150} fill="#8C8478" stroke={O} strokeWidth={3} />
      <ellipse cx={195} cy={488} rx={100} ry={98} fill="#EFE8DA" stroke={O} strokeWidth={2.5} />
      <polygon points="160,330 185,330 178,400 150,396" fill="#3d3a36" stroke={O} strokeWidth={2} /><polygon points="205,330 230,330 240,396 212,400" fill="#3d3a36" stroke={O} strokeWidth={2} />
      <circle cx={152} cy={470} r={6} fill={O} /><circle cx={238} cy={470} r={6} fill={O} />
      {win
        ? <path d="M138 454 q14 -8 28 -2 M224 452 q14 -6 28 2" fill="none" stroke={O} strokeWidth={3} strokeLinecap="round" />
        : <path d="M136 446 l30 10 M254 446 l-30 10" fill="none" stroke={O} strokeWidth={4} strokeLinecap="round" />}
      <ellipse cx={195} cy={512} rx={13} ry={9} fill={O} />
      {win
        ? <path d="M158 538 q37 28 74 0" fill="none" stroke={O} strokeWidth={3.5} strokeLinecap="round" />
        : <path d="M166 548 h58" fill="none" stroke={O} strokeWidth={3.5} strokeLinecap="round" />}
      {/* 장부 */}
      <g transform="rotate(-10 300 690)"><rect x={262} y={640} width={78} height={96} rx={6} fill="#F3E7C6" stroke={O} strokeWidth={3} /><path d="M276 666 h50 M276 684 h50 M276 702 h34" stroke={O} strokeWidth={2.5} strokeLinecap="round" /></g>
    </svg>
  );
}

function CutIn() {
  const c = useProto((s) => s.cutin);
  const g = useGame((s) => s.g);
  useEffect(() => {
    if (!c) return;
    const t = window.setTimeout(() => useProto.getState().patch({ cutin: null }), 4000);
    return () => window.clearTimeout(t);
  }, [c]);
  if (!c || g.run.over) return null;
  return (
    <div className={'pr-cutin' + (c.win ? ' win' : ' lose')} onClick={() => useProto.getState().patch({ cutin: null })} role="dialog" aria-label="정산 컷인">
      <BossBust win={c.win} />
      {!c.win && <div className="stamp">증거금 부족</div>}
      <div className="say">
        <div className="tag">{BOSS_NAME}</div>
        <p>{c.win ? `이자 ${comma(c.interest)} 수금 완료!` : `이자 ${comma(c.interest)}… 장부에 적어 두죠.`}</p>
        <div className="meta"><span>내 정산 합계 <b className={c.net >= 0 ? 'up' : 'dn'}>{c.net >= 0 ? '+' : '−'}{comma(Math.abs(c.net))}</b></span><span>채굴·전기·이자·생활비 합</span></div>
        <div className="dots" aria-label={`정산 ${c.no}회째`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= c.no ? 'on' : ''} />)}</div>
        <em>탭하면 계속</em>
      </div>
    </div>
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
  const dark = useOpenPositions().some((p) => isNearLiq(p));
  useAudioDirector(dark);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { startHistory(); startWatch(); }, []);
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
      {pdev === 'sounds' && <SoundLab />}
    </div>
  );
}

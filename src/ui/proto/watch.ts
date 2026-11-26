// 게임 상태 변화를 보고 시제품 화면 사건(추심원·정산 컷인·탭 해금·목표)을 만든다. 규칙은 엔진의 것만 쓴다.
import { useGame } from '../../store/gameStore';
import { useProto, type Scene } from './protoStore';
import { currentGoal, lifeNo, officeOffer, claim, hamsterMath } from './model';
import { STORY } from './text';
import { comma } from '../../engine/util';
import { DEBT_IDS, marketById } from '../../engine/data';
import { ownedCoins, lenderDebtTotal, interestDue } from '../../engine/selectors';
import { settle } from '../../engine/settlement';
import { clone } from '../../engine/game';
import { fx } from './fx';
import { play, later } from './audio';
import { closeBack, roePct } from '../../engine/futures';
import type { GameState } from '../../engine/types';

/** 포지션이 닫힌 것을 보고 이번 생 승률을 올리고, 이익이면 수익 인증서 물음을 띄운다(한 번 닫을 때 한 번). */
export function noteClose(c: { market: string; dir: 1 | -1; lev: number; roe: number; pnl: number; entry: number; exit: number; heldSec: number; gen: number }): void {
  const P = useProto.getState();
  const win = c.pnl > 0;
  const wins = P.wins + (win ? 1 : 0);
  const closes = P.closes + 1;
  P.patch({ wins, closes, profit: win ? { coin: marketById[c.market]?.name ?? c.market, dir: c.dir, lev: c.lev, roe: c.roe, pnl: c.pnl, entry: c.entry, exit: c.exit, heldSec: c.heldSec, wins, closes, gen: c.gen, date: new Date() } : P.profit });
}

const overdueSum = (g: GameState): number => DEBT_IDS.reduce((a, id) => a + g.run.debts[id].overdue, 0);
const FULL_CUTINS = 5;
let toastTimer: number | undefined;
let collTimer: number | undefined;

export function say(text: string, ms = 3000): void {
  useProto.getState().patch({ toast: text });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => useProto.getState().patch({ toast: null }), ms);
}

/** 이야기 장면을 줄 세운다(이번 생에 이미 본 것은 다시 나오지 않는다). */
function scene(sc: Scene): void { useProto.getState().pushScene(sc); }

/** 지금 이대로 정산하면 못 내는 돈이 생기는가: 엔진의 정산을 복사본에 돌려 본다(추측하지 않는다). */
export function wouldBeShort(g: GameState): boolean {
  const p = clone(g);
  settle(p);
  return (p.run.lastSettlement?.unpaid ?? 0) > 0;
}

/** 추심원을 돌려보낸다: 시계가 다시 돌고 이번 정산은 엔진 규칙대로 연체가 된다. */
export function sendAway(): void {
  const g = useGame.getState().g;
  useProto.getState().patch({ waiting: false, sentAwayAt: g.run.settleNo });
  useGame.getState().setSpeed(1);
  say('추심원: 그럼 연체로 적을게요오.', 3500);
}

/** 오소리 사무소에서 이번 생 처음 빌렸다(Tabs.tsx 가 엔진 borrow 가 성공한 뒤 부른다): 중고폰 = 선물 계좌(엔진 sponsor 개설) + 거래소 탭. */
export function onFirstOfficeLoan(before: GameState): void {
  const st = useGame.getState();
  const P = useProto.getState();
  if (P.loanTaken) return;
  const oldInterest = interestDue(before, 'shark1');
  const o = officeOffer(before);
  st.act({ type: 'openAccount', sponsor: true });
  const g = useGame.getState().g;
  P.patch({ loanTaken: true, tutorial: P.tutorial === 'none' ? 'await' : P.tutorial });
  scene({
    id: 'office', unlock: 'phone',
    lines: STORY.office({ lend: o.lend, ratePct: o.ratePct, oldInterest, newInterest: interestDue(g, 'shark1'), debt: g.run.debts.shark1.principal }),
    // 대화가 끝나면 기다리던 추심원이 오늘 이자를 떼어 간다(시계가 다시 돈다)
    onEnd: () => { if (useProto.getState().waiting) { useProto.getState().patch({ waiting: false }); useProto.getState().setTab('lot'); } useGame.getState().setSpeed(1); },
  });
}

let started = false;
export function startWatch(): void {
  if (started) return;
  started = true;
  let prev = useGame.getState().g;
  useProto.getState().patch({ gen: prev.family.generation });
  useGame.subscribe((s) => {
    const g = s.g;
    if (useProto.getState().prologue) { prev = g; return; }
    if (g.family.generation !== useProto.getState().gen) {
      useProto.getState().resetLife(g.family.generation, lifeNo(g) <= 1);
      if (lifeNo(g) > 1) scene({ id: 'reborn', lines: STORY.reborn(), auto: 6000 });
      prev = g;
      return;
    }
    const run = g.run;
    const sameLife = g.family.generation === prev.family.generation;
    const settled = run.settleNo > prev.run.settleNo && !!run.lastSettlement && !run.over && sameLife;

    // ── 정산 직전: 추심원이 걷으러 왔는데 낼 돈이 없다(아직 사무소에서 빌린 적 없는 생) ──
    // 시계를 멈추고 기다린다. 사무소에서 빌리면 거기서 이자를 떼고, 돌려보내면 엔진 규칙대로 연체.
    {
      const P = useProto.getState();
      if (!run.over && sameLife && run.settleIn <= 1 && s.speed !== 0 && !P.waiting && !P.loanTaken && P.sentAwayAt !== run.settleNo && officeOffer(g).lend > 0 && wouldBeShort(g)) {
        useGame.getState().setSpeed(0);
        P.patch({ waiting: true });
        play('collector_steps');
        const c = claim(g);
        scene({
          id: `come${run.settleNo}`, unlock: 'map', again: true,
          lines: STORY.collectorCome({ interest: c.interest, cash: Math.floor(run.cash), lend: officeOffer(g).lend, again: P.sentAwayAt >= 0, reborn: lifeNo(g) > 1 }),
          choices: [
            { id: 'go', label: '사무소로 간다', sub: '지도가 열린다', primary: true, run: () => { useProto.getState().patch({ mapFocus: 'shark1' }); useProto.getState().setTab('map'); } },
            { id: 'away', label: '돌려보낸다', sub: '연체로 적힌다', run: sendAway },
          ],
        });
      }
    }

    // 정산이 끝났다
    if (settled) {
      const r = run.lastSettlement!;
      const od = overdueSum(g) > overdueSum(prev);
      const net = Math.round(r.mined - r.power - (r.wages ?? 0) - r.interest - r.living);
      play('settle_bell');
      if (r.mined > 0) fx.emit({ kind: 'settle', mined: r.mined, sold: ownedCoins(run).some((c) => run.coinWheels[c].autoSell) });
      if (net < 0) useProto.getState().patch({ negSettles: useProto.getState().negSettles + 1 });
      if ((r.quit ?? 0) > 0) later(1500, () => say(`알바 햄스터 ${r.quit}마리가 일당을 못 받고 나갔다. 빈 쳇바퀴는 돌지 않는다.`, 5000));
      if (r.interest > 0) {
        useProto.getState().patch({ collector: { interest: r.interest, fill: od ? Math.min(0.85, r.paid / Math.max(1, r.interest)) : 1, overdue: od, at: Date.now() } });
        later(700, () => play('collector_steps'));
        later(2400, () => play(od ? 'overdue_stamp' : 'collector_paid'));
        window.clearTimeout(collTimer);
        collTimer = window.setTimeout(() => useProto.getState().patch({ collector: null }), 9000);
        const P = useProto.getState();
        const no = P.cutCount + 1;
        P.patch({ cutCount: no });
        const meta = { net, interest: r.interest, win: !od, no };
        const tagged = !!run.coinWheels.DTC?.tagBy;
        if (od && !P.loanTaken) scene({ id: `refused${run.settleNo}`, lines: STORY.refused(r.interest, tagged), settle: meta });
        else if (no === 1 && !od) scene({ id: 'firstSettle', lines: lifeNo(g) <= 1 ? STORY.firstSettle(r.interest) : STORY.rebornSettle(r.interest), settle: meta });
        else if (no <= FULL_CUTINS && Object.keys(run.positions).length === 0 && P.tab !== 'phone') scene({ id: `settle${run.settleNo}`, lines: od ? STORY.settleLose(r.interest) : STORY.settleWin(r.interest), settle: meta, auto: 4000 });
        else { const iv = comma(Math.round(r.interest)); say(od ? `추심원: 이자 ${iv}… 모자라네요오. (내 정산 ${net >= 0 ? '+' : '−'}${comma(Math.abs(net))})` : `추심원: 이자 ${iv} 수금 완료요오. (내 정산 ${net >= 0 ? '+' : '−'}${comma(Math.abs(net))})`); }
        // 빌린 뒤에도 이자를 못 낸 정산: 사채 문자
        if (od && P.loanTaken) { scene({ id: 'sms', lines: STORY.sms() }); if (!useProto.getState().seen.sms) useProto.getState().patch({ visited: { ...useProto.getState().visited, map: false } }); }
        // 폰을 받은 뒤 첫 정산: 족제비가 알바를 권한다(막지 않는 한 줄)
        if (P.loanTaken && !od) scene({ id: 'hamsterHint', lines: STORY.hamsterHint(hamsterMath(g).wage), auto: 7000 });
      } else say(`땡! 정산 ${net >= 0 ? '+' : '−'}${comma(Math.abs(net))}`);
    }
    // 엔진의 마을 사건(금리 인상·지원금 등)은 속보 한 장으로 알린다. 모르는 사이에 이자가 바뀌지 않게.
    if (sameLife) {
      const had = new Set(prev.run.notices.map((x) => x.id + '@' + x.tick));
      for (const x of run.notices) {
        if (!x.id.startsWith('event:') || had.has(x.id + '@' + x.tick)) continue;
        if (x.id.includes('housing') && run.house <= 0) continue; // 딱지 붙은 빈 오두막에 사는 처지에 집값 소식은 남의 일
        later(5200, () => say(`[도토리일보 속보] ${x.text}`, 6500));
      }
    }
    // 압류: 실려 간 것을 한 줄로 알린다(집에서 그 줄과 물건이 사라진다)
    if (sameLife && (run.stats.assetsSeized ?? 0) > (prev.run.stats.assetsSeized ?? 0)) {
      const ev = [...run.eventLog].reverse().find((e) => e.kind.startsWith('seize:'));
      later(1200, () => { play('overdue_stamp'); say(`압류: ${ev?.text ?? '쳇바퀴가 실려 갔다'}`, 5000); });
    }
    // 강제 청산: 흔들림 + 도장
    const lc = run.lastClose;
    const closedNow = !!lc && (!prev.run.lastClose || prev.run.lastClose.tick !== lc.tick || prev.run.lastClose.market !== lc.market);
    if (lc && lc.liq && closedNow) {
      play('liquidation');
      fx.emit({ kind: 'liq', market: marketById[lc.market]?.name ?? lc.market });
    }
    // 포지션이 닫혔다(청산 제외 이익 판정은 noteClose 가 한다)
    if (lc && closedNow && sameLife) {
      const p = prev.run.positions[lc.market];
      if (p && !run.positions[lc.market]) {
        const log = run.tradeLog[run.tradeLog.length - 1] as { price?: number } | undefined;
        const exit = log?.price ?? run.prices[lc.market];
        const pnl = lc.liq ? -p.margin0 : closeBack(p, exit) - p.margin0 - p.feesPaid;
        const tut = useProto.getState().tutorial === 'run';
        if (!tut) noteClose({ market: lc.market, dir: p.dir, lev: p.lev, roe: lc.liq ? -100 : roePct(p, exit), pnl, entry: p.entry, exit, heldSec: lc.tick - p.openTick, gen: lifeNo(g) });
        const P = useProto.getState();
        if (tut) { /* 튜토리얼 거래는 승률·인증서·첫 손실 대사에 넣지 않는다 */ }
        else if (pnl > 0 && !P.seen.firstWin) { P.patch({ seen: { ...P.seen, firstWin: true } }); later(900, () => say('오소리 대부: 거 보세요. 쳇바퀴보다 빠르죠?', 4000)); }
        else if (pnl <= 0 && !P.seen.firstLoss) { P.patch({ seen: { ...P.seen, firstLoss: true } }); later(2200, () => say('추심원: …그냥 지나가다 들렀어요오.', 4500)); }
      }
    }
    // ── 이야기 사건 ──
    if (!run.over && sameLife) {
      if ((run.stats.stamps ?? 0) > 0 && !(prev.run.stats.stamps > 0) && run.debts.shark1.principal < prev.run.debts.shark1.principal) scene({ id: 'repay', lines: STORY.repay() });
      if (lenderDebtTotal(run) === 0 && lenderDebtTotal(prev.run) > 0) scene({ id: 'clear', lines: STORY.clear() });
    }
    const P = useProto.getState();
    const everOpened = P.everOpened || Object.keys(run.positions).length > 0;
    if (everOpened !== P.everOpened) P.patch({ everOpened });
    const gi = currentGoal(g, useProto.getState().goalIdx, { everOpened, waiting: useProto.getState().waiting, loanTaken: useProto.getState().loanTaken });
    if (gi !== useProto.getState().goalIdx) { if (gi > useProto.getState().goalIdx) play('goal_complete'); useProto.getState().patch({ goalIdx: gi }); }
    prev = g;
  });
}

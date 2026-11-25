// 게임 상태 변화를 보고 시제품 화면 사건(정산 컷인·추심원·탭 해금·목표)을 만든다. 엔진은 건드리지 않는다.
import { useGame } from '../../store/gameStore';
import { useProto, type Scene } from './protoStore';
import { currentGoal, TIP_EVERY, BEAR_MINED, lifeNo } from './model';
import { STORY } from './text';
import { comma } from '../../engine/util';
import { makeTip } from './bearTip';
import { DEBT_IDS, marketById, friendById } from '../../engine/data';
import { ownedCoins, lenderDebtTotal } from '../../engine/selectors';
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
    // 정산이 끝났다
    if (settled) {
      const r = run.lastSettlement!;
      const od = overdueSum(g) > overdueSum(prev);
      const net = Math.round(r.mined - r.power - r.interest - r.living);
      play('settle_bell');
      if (r.mined > 0) fx.emit({ kind: 'settle', mined: r.mined, sold: ownedCoins(run).some((c) => run.coinWheels[c].autoSell) });
      if (net < 0) useProto.getState().patch({ negSettles: useProto.getState().negSettles + 1 });
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
        if (no === 1 && lifeNo(g) <= 1) scene({ id: 'firstSettle', lines: STORY.firstSettle(r.interest), settle: meta, unlock: 'map' });
        else if (no === 1) scene({ id: 'rebornSettle', lines: STORY.rebornSettle(r.interest), settle: meta });
        else if (no <= FULL_CUTINS && Object.keys(run.positions).length === 0 && P.tab !== 'phone') scene({ id: `settle${run.settleNo}`, lines: od ? STORY.settleLose(r.interest) : STORY.settleWin(r.interest), settle: meta, auto: 4000 });
        else { const iv = comma(Math.round(r.interest)); say(od ? `추심원: 이자 ${iv}… 모자라네요오. (내 정산 ${net >= 0 ? '+' : '−'}${comma(Math.abs(net))})` : `추심원: 이자 ${iv} 수금 완료요오. (내 정산 ${net >= 0 ? '+' : '−'}${comma(Math.abs(net))})`); }
        // 4-4 이자를 못 낸 첫 정산: 사채 문자
        if (od) { scene({ id: 'sms', lines: STORY.sms() }); if (!useProto.getState().seen.sms) useProto.getState().patch({ visited: { ...useProto.getState().visited, map: false } }); }
      } else say(`땡! 정산 ${net >= 0 ? '+' : '−'}${comma(Math.abs(net))}`);
      // 2-1 첫 쳇바퀴 뒤 다음 정산: 단짝이 찾아온다
      const P = useProto.getState();
      if (P.wheelAt !== null && run.settleNo > P.wheelAt && P.cutCount > 1 && !P.everUnlocked.people) {
        const f = friendById.squirrel;
        scene({ id: 'friend', lines: STORY.friend(f.borrowUnit, f.maxLoan), unlock: 'people' });
      }
      // 2-2 벌어도 이자가 더 빠진다 → 알바 권유(막지 않는 한 줄)
      if (P.negSettles >= 3 && !P.seen.helperHint && ownedCoins(run).length > 0 && !run.equipment.some((u) => u.tier === 'helper')) {
        P.patch({ seen: { ...useProto.getState().seen, helperHint: true } });
        later(4500, () => say('족제비: 벌어도 이자가 더 빠지죠? 알바 햄스터들 일당 싸요~', 4500));
      }
    }
    // 엔진의 마을 사건(금리 인상·지원금 등)은 속보 한 장으로 알린다. 모르는 사이에 이자가 바뀌지 않게.
    if (sameLife) {
      const had = new Set(prev.run.notices.map((x) => x.id + '@' + x.tick));
      for (const x of run.notices) {
        if (!x.id.startsWith('event:') || had.has(x.id + '@' + x.tick)) continue;
        if (x.id.includes('housing') && run.house <= 0) continue; // 텐트살이에게 집값 소식은 남의 일
        later(5200, () => say(`[도토리일보 속보] ${x.text}`, 6500));
      }
    }
    // 압류: 실려 간 것을 한 줄로 알린다(공터에서 그 줄과 물건이 사라진다)
    if (sameLife && (run.stats.assetsSeized ?? 0) > (prev.run.stats.assetsSeized ?? 0)) {
      const ev = [...run.eventLog].reverse().find((e) => e.kind.startsWith('seize:'));
      later(1200, () => { play('overdue_stamp'); say(`압류: ${ev?.text ?? '설비가 실려 갔다'}`, 5000); });
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
        noteClose({ market: lc.market, dir: p.dir, lev: p.lev, roe: lc.liq ? -100 : roePct(p, exit), pnl, entry: p.entry, exit, heldSec: lc.tick - p.openTick, gen: lifeNo(g) });
        const P = useProto.getState();
        if (pnl > 0 && !P.seen.firstWin) { P.patch({ seen: { ...P.seen, firstWin: true } }); later(900, () => say('곰 형: 그치? 형 말 듣길 잘했지.', 4000)); }
        if (pnl <= 0 && !P.seen.firstLoss) { P.patch({ seen: { ...P.seen, firstLoss: true } }); later(2200, () => say('추심원: …그냥 지나가다 들렀어요오.', 4500)); }
      }
    }
    // ── 이야기 사건(탭은 물건이 아니라 사건으로 열린다, U-22) ──
    if (!run.over && sameLife) {
      const P = useProto.getState();
      const wheels = ownedCoins(run).length;
      if (run.stats.signSeen && wheels === 0 && !prev.run.stats.signSeen) scene({ id: 'sign', lines: STORY.sign(), auto: 6000 });
      if (wheels > 0 && ownedCoins(prev.run).length === 0) {
        P.patch({ wheelAt: run.settleNo });
        scene({ id: 'wheel', lines: STORY.wheel() });
      }
      if (wheels + run.equipment.length >= 2 && !P.everUnlocked.upg) scene({ id: 'upg', lines: STORY.upg(), unlock: 'upg' });
      if (run.minedValue >= BEAR_MINED && !P.everUnlocked.phone) {
        if (!P.bearMet) P.patch({ bearMet: true, tip: makeTip(g) });
        scene({ id: 'bear', lines: STORY.bear(), unlock: 'phone' });
      }
      if (run.futures.open && !prev.run.futures.open) {
        scene({ id: 'account', lines: STORY.account(run.futures.levCap) });
        P.patch({ visited: { ...useProto.getState().visited, phone: false } });
      }
      if ((run.stats.stamps ?? 0) > 0 && !(prev.run.stats.stamps > 0) && run.debts.shark1.principal < prev.run.debts.shark1.principal) scene({ id: 'repay', lines: STORY.repay() });
      if (lenderDebtTotal(run) === 0 && lenderDebtTotal(prev.run) > 0) scene({ id: 'clear', lines: STORY.clear() });
    }
    // 곰 형의 확실한 정보(화면에서만: 규칙은 건드리지 않는다)
    if (settled && useProto.getState().bearMet && run.settleNo % TIP_EVERY === 0) useProto.getState().patch({ tip: makeTip(g) });
    const everOpened = useProto.getState().everOpened || Object.keys(run.positions).length > 0;
    if (everOpened !== useProto.getState().everOpened) useProto.getState().patch({ everOpened });
    const gi = currentGoal(g, useProto.getState().goalIdx, { everOpened });
    if (gi !== useProto.getState().goalIdx) { if (gi > useProto.getState().goalIdx) play('goal_complete'); useProto.getState().patch({ goalIdx: gi }); }
    prev = g;
  });
}

// 게임 상태 변화를 보고 시제품 화면 사건(정산 컷인·추심원·탭 해금·목표)을 만든다. 엔진은 건드리지 않는다.
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { currentGoal, TIP_EVERY } from './model';
import { makeTip } from './bearTip';
import { perSettle } from './model';
import { DEBT_IDS, marketById } from '../../engine/data';
import { fx } from './fx';
import { play, later } from './audio';
import { closeBack, pnlOf, roePct } from '../../engine/futures';
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

let started = false;
export function startWatch(): void {
  if (started) return;
  started = true;
  let prev = useGame.getState().g;
  useProto.getState().patch({ gen: prev.family.generation });
  useGame.subscribe((s) => {
    const g = s.g;
    const P = useProto.getState();
    if (g.family.generation !== P.gen) {
      useProto.getState().resetLife(g.family.generation);
    }
    // 정산이 끝났다
    if (g.run.settleNo > prev.run.settleNo && g.run.lastSettlement && !g.run.over && g.family.generation === prev.family.generation) {
      const r = g.run.lastSettlement;
      const od = overdueSum(g) > overdueSum(prev);
      const net = Math.round(r.mined - r.power - r.interest - r.living);
      play('settle_bell');
      if (r.interest > 0) {
        useProto.getState().patch({ collector: { interest: r.interest, fill: od ? Math.min(0.85, r.paid / Math.max(1, r.interest)) : 1, overdue: od, at: Date.now() } });
        later(300, () => play('cutin_whoosh'));
        later(700, () => play('collector_steps'));
        later(2400, () => play(od ? 'overdue_stamp' : 'collector_paid'));
        window.clearTimeout(collTimer);
        collTimer = window.setTimeout(() => useProto.getState().patch({ collector: null }), 9000);
        const no = useProto.getState().cutCount + 1;
        const full = no <= FULL_CUTINS;
        useProto.getState().patch({ cutCount: no, cutin: full ? { win: !od, net, interest: r.interest, no, full } : null });
        if (!full) say(od ? `오소리: …장부에 적어 두죠. (정산 ${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('ko-KR')})` : `오소리: 이자 수금 완료! (정산 ${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('ko-KR')})`);
      } else say(`땡! 정산 ${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('ko-KR')}`);
    }
    // 강제 청산: 흔들림 + 도장
    const lc = g.run.lastClose;
    if (lc && lc.liq && (!prev.run.lastClose || prev.run.lastClose.tick !== lc.tick || prev.run.lastClose.market !== lc.market)) {
      play('liquidation');
      fx.emit({ kind: 'liq', market: marketById[lc.market]?.name ?? lc.market });
    }
    // 포지션이 닫혔다(청산 제외 이익 판정은 noteClose 가 한다)
    if (lc && (!prev.run.lastClose || prev.run.lastClose.tick !== lc.tick || prev.run.lastClose.market !== lc.market)) {
      const p = prev.run.positions[lc.market];
      if (p && !g.run.positions[lc.market]) {
        const log = g.run.tradeLog[g.run.tradeLog.length - 1] as { price?: number } | undefined;
        const exit = log?.price ?? g.run.prices[lc.market];
        const pnl = lc.liq ? -p.margin0 : closeBack(p, exit) - p.margin0 - p.feesPaid;
        noteClose({ market: lc.market, dir: p.dir, lev: p.lev, roe: lc.liq ? -100 : roePct(p, exit), pnl, entry: p.entry, exit, heldSec: lc.tick - p.openTick, gen: g.family.generation });
      }
    }
    // 곰 형의 확실한 정보(화면에서만: 규칙은 건드리지 않는다)
    if (g.run.settleNo > prev.run.settleNo && useProto.getState().bearBought && g.run.settleNo % TIP_EVERY === 0) useProto.getState().patch({ tip: makeTip(g) });
    // 탭 해금·목표
    const un = { ...useProto.getState().everUnlocked };
    const before = JSON.stringify(un);
    if (g.run.equipment.length > 0 && !un.upg) { un.upg = true; say('강화 탭이 열렸다!'); play('unlock_tab'); }
    if (g.run.futures.open && !un.phone) { un.phone = true; say('폰 탭이 열렸다!'); play('unlock_tab'); }
    if (useProto.getState().mapBought && !un.map) { un.map = true; say('지도 탭이 열렸다!'); play('unlock_tab'); }
    if (useProto.getState().peopleBought && !un.people) { un.people = true; say('인맥 탭이 열렸다!'); play('unlock_tab'); }
    if (JSON.stringify(un) !== before) useProto.getState().patch({ everUnlocked: un });
    const everOpened = useProto.getState().everOpened || Object.keys(g.run.positions).length > 0;
    if (everOpened !== useProto.getState().everOpened) useProto.getState().patch({ everOpened });
    const gi = currentGoal(g, useProto.getState().goalIdx, { everOpened });
    if (gi !== useProto.getState().goalIdx) { if (gi > useProto.getState().goalIdx) play('goal_complete'); useProto.getState().patch({ goalIdx: gi }); }
    prev = g;
  });
}
void perSettle;
void pnlOf;

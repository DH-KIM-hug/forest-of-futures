// 의뢰판, 숲 단타방, 트로피 장, 등급 수수료(U-56)를 게임 시계에 붙이는 곳. watch.ts 가 부른다.
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { marketById } from '../../engine/data';
import { levCapNow } from '../../engine/progression';
import { liveHistoryOf } from '../priceHistory';
import { flySecOf } from './flyWind';
import { flyGust } from '../../engine/feed/fly';
import { sessionOpen, SESSIONS } from './market';
import { rankOfRun, whyOf, whyText } from './frxRank';
import { flyAcorns } from './fx';
import { josa } from '../../engine/util';
import { applyClose, fitBoard, newBoard, newsLine, questById, setGust, GUST_MUL, GUST_QUEST, type CloseInfo } from './quests';
import { newRivals, opposite, rivalById, standings, stepRivals, type RivalEvent } from './rivals';
import { earnTrophy, trophyById } from './trophies';
import { play, later } from './audio';
import { comma } from '../../engine/util';
import type { GameState } from '../../engine/types';
import { isLite } from './config';
import { featureOpen, liteTrades } from './lite/liteUnlock';
import { isBigLoss, isBigWin } from './react';

type Say = (text: string, ms?: number, keep?: boolean) => void;
const gen = (g: GameState): number => g.family.generation ?? 1;
let tierQueued = false;
const st = { gustSaid: -1, foreSaid: -1, liqSaidAt: -9999, oppSaidAt: -9999, top: false };
const dirWord = (d: 1 | -1) => (d === 1 ? '롱' : '숏');
const mName = (id: string) => marketById[id]?.short ?? marketById[id]?.name ?? id;

/** 생이 바뀌면 단타방의 기억을 지운다(watch 가 부른다) */
export function forestNewLife(): void { st.gustSaid = -1; st.foreSaid = -1; st.top = false; }

/** 트로피를 처음 얻으면 한 줄 */
function trophy(id: string, g: GameState, say: Say): void {
  if (earnTrophy(id, gen(g))) later(1800, () => { play('paw_stamp'); say(`[트로피 장] 「${trophyById[id].name}」 집 벽에 걸었다.`, 4500); });
}

/** 판이 닫혔다(튜토리얼 거래 빼고): 의뢰판에 대 보고, 끝난 의뢰의 사례금을 손에 넣는다. 받은 사례금의 합을 돌려준다 */
export function forestClose(g: GameState, c: Omit<CloseInfo, 'gust'>, say: Say): number {
  const P = useProto.getState();
  const fs = c.fly ? flySecOf(g.run) : null;
  const info: CloseInfo = { ...c, gust: fs !== null && flyGust(fs).mul >= GUST_MUL };
  // 반대편 라이벌(같은 종목에서 반대쪽에 든 채)이 있는데 내가 이겼다
  if (P.rivals && c.pnl > 0 && opposite(P.rivals, c.market, c.dir)) trophy('rival_opp', g, say);
  if (!P.quests) return 0;
  const r = applyClose(P.quests, info, levCapNow(g.run));
  if (!r.news.length) { P.patch({ quests: r.board }); return 0; }
  const lines = r.news.map(newsLine);
  P.patch({ quests: r.board, questFx: { k: (P.questFx?.k ?? 0) + 1, lines, done: r.finished.length > 0, market: c.market, tick: g.run.tick } });
  let got = 0;
  for (const t of r.tips) {
    const q = questById[t.id];
    got += t.amount;
    // 지켜보는 중에 엔진을 바로 바꾸면 같은 틱이 한 번 더 지켜진다(닫힌 판을 두 번 센다): 한 줄과 함께 나중에 넣는다
    later(1400, () => {
      const res = useGame.getState().act({ type: 'questTip', amount: t.amount, who: q.name });
      const n = res.ok ? Math.round(res.amount ?? t.amount) : 0;
      play('goal_complete');
      say(n > 0 ? `[FRX 의뢰] ${josa(q.name, '이', '가')} 사례금 ${comma(n)}을 줬다.` : `[FRX 의뢰] ${q.name}: 「${q.title}」 끝. 이번 생 사례금은 다 받았다.`, 5000, true);
      if (n > 0 && typeof document !== 'undefined') flyAcorns((document.querySelector('[data-forestline]') ?? document.querySelector('.pr-toast') ?? document.body).getBoundingClientRect(), 6);
    });
    trophy('q_' + t.id, g, say);
  }
  return got;
}

/** 틱마다: 등급 수수료 맞추기, 의뢰판 · 단타방 시작, 돌풍 특보, 라이벌의 판 */
export function forestTick(g: GameState, say: Say): void {
  const run = g.run;
  const P = useProto.getState();
  // FRX 회원 등급(U-65): 예탁금과 거래액으로 셈한 등급. 오르면 지킨다(이번 생 가장 높은 등급), 수수료는 그 등급으로
  const rk = rankOfRun(run, P.frxBest);
  if (rk.r > P.frxBest && P.tutorial === 'done' && !run.over) {
    const w = whyOf(rk.r, rk.dep, rk.vol);
    P.patch({ frxBest: rk.r, rankUp: { k: (P.rankUp?.k ?? 0) + 1, r: rk.r, name: rk.name, why: whyText(w) } });
    // 승급 한 줄은 거래소 밖에서만(거래소에서는 승급 카드가 같은 말을 한다)
    if (P.tab !== 'phone') later(700, () => { play('win_fanfare'); say(`[FRX 숲거래소] ${whyText(w)}. ${rk.name} 회원이 되셨어요 ♥ 수수료를 깎아 드릴게요.`, 5500, true); });
  }
  const tier = Math.max(P.frxBest, rk.r);
  // 지켜보는 중에 엔진을 바로 바꾸면 같은 틱이 한 번 더 지켜진다(닫힌 판을 두 번 센다): 지켜보기가 끝난 뒤에 넣는다
  if ((run.feeTier ?? 0) !== tier && !run.over && !tierQueued) { tierQueued = true; window.setTimeout(() => { tierQueued = false; const g2 = useGame.getState().g; const t2 = Math.max(useProto.getState().frxBest, rankOfRun(g2.run, useProto.getState().frxBest).r); if (!g2.run.over && (g2.run.feeTier ?? 0) !== t2) useGame.getState().act({ type: 'setFeeTier', tier: t2 }); }, 0); }
  if (P.tutorial !== 'done' || run.over || !run.futures.open) return;
  // 라이트 첫 경험(U-68): 의뢰판, 돌풍 특보, 단타방은 세 판을 닫은 뒤에 붙는다
  if (isLite && !featureOpen('quests', liteTrades())) return;
  const seed = ((run.seed ?? 1) * 31 + gen(g)) >>> 0;
  const cap = levCapNow(run);
  let board = P.quests ? fitBoard(P.quests, cap) : newBoard(seed, cap);
  // 돌풍 특보(시세 함수의 10분 마디 바람 세기에서 센다. 값은 그대로)
  const fs = marketById.FLY?.tradable ? flySecOf(run) : null;
  if (fs !== null) {
    const gw = flyGust(fs);
    if (gw.mul >= GUST_MUL) {
      board = setGust(board, gw.endsAt);
      if (st.gustSaid !== gw.endsAt && P.scenes.length === 0) {
        st.gustSaid = gw.endsAt;
        play('news_alarm', { vol: 0.7 });
        say(`[도토리일보 돌풍 특보] ${Math.max(1, Math.ceil((gw.endsAt - fs) / 60))}분 동안 날다람쥐코인에 돌풍! 이익 한 판이면 사례금!`, 7000, true);
      }
    } else {
      if (board.gust && fs >= board.gust.endsAt) board = setGust(board, null);
      const nx = flyGust(gw.endsAt);
      if (nx.mul >= GUST_MUL && gw.endsAt - fs <= 60 && st.foreSaid !== gw.endsAt && P.scenes.length === 0) {
        st.foreSaid = gw.endsAt;
        say('[도토리일보 예보] 1분 뒤 날다람쥐코인에 돌풍. 날다람쥐들이 나뭇가지를 꽉 붙든다.', 6500);
      }
    }
  }
  if (board !== P.quests) P.patch({ quests: board });
  // 숲 단타방
  if (!P.rivals) { useProto.getState().patch({ rivals: newRivals(seed, run.tick) }); return; }
  let rv = P.rivals;
  if (run.tick <= rv.t) { if (run.tick < rv.t - 5) useProto.getState().patch({ rivals: { ...rv, t: run.tick } }); return; }
  const now = new Date();
  const markets = Object.values(marketById).filter((m) => m.tradable && run.prices[m.id] > 0 && (m.synthetic || !SESSIONS[m.id] || !!sessionOpen(m.id, now))).map((m) => m.id);
  const moves: Record<string, number> = {};
  for (const id of markets) { const h = liveHistoryOf(id).slice(-30); moves[id] = h.length >= 10 ? Math.sign(h[h.length - 1] - h[0]) : 0; }
  const out = stepRivals(rv, run.tick, run.prices, moves, markets);
  rv = out.state;
  const log = out.events.length ? [...out.events, ...P.rivalLog].slice(0, 12) : P.rivalLog;
  useProto.getState().patch({ rivals: rv, rivalLog: log });
  for (const e of out.events) rivalSay(e, g, say);
  // 단타방 1위(거래 다섯 판 넘게)
  const closes = useProto.getState().closes;
  const rows = standings(rv, useProto.getState().tradeLife, run.prices);
  const top = rows[0]?.me && closes >= 5 && rows[0].pnl > 0;
  if (top && !st.top) { st.top = true; trophy('rival_top', g, say); if (P.tab === 'phone') say(`[숲 단타방] 손익 1위! ${rows[1] ? `${rows[1].name}: 「운이야, 운.」` : ''}`, 4500); }
  if (!top) st.top = false;
}

function rivalSay(e: RivalEvent, g: GameState, say: Say): void {
  const P = useProto.getState();
  const d = rivalById[e.id];
  const run = g.run;
  if (e.kind === 'bust') {
    if (e.id === 'raccoon') trophy('rival_bust', g, say);
    if (P.scenes.length === 0) say(`[숲 단타방] ${d.name} 파산. 「${e.line}」`, 5000);
    return;
  }
  if (P.scenes.length > 0 || P.tab !== 'phone') return;
  const mine = run.positions[e.market];
  // 내 판의 반대편에 들어왔다
  if (e.kind === 'open' && mine && mine.dir !== e.dir && run.tick - st.oppSaidAt >= 30) {
    st.oppSaidAt = run.tick;
    say(`[숲 단타방] ${d.name}, 네 반대편에 ${mName(e.market)} ${dirWord(e.dir)} ${e.lev}배. 「${e.line}」 둘 중 하나는 운다.`, 5500);
    return;
  }
  // 라이벌의 청산(75초에 한 번)
  if (e.kind === 'liq' && run.tick - st.liqSaidAt >= 75) {
    st.liqSaidAt = run.tick;
    say(`[숲 단타방] ${d.name} ${mName(e.market)} ${e.lev}배 ${dirWord(e.dir)} 청산 −${comma(Math.abs(e.pnl))}. 「${e.line}」`, 4500);
  }
}

/** 내 판이 닫힌 뒤 라이벌 한 명이 한마디(이긴 판, 진 판 가운데 크게 움직인 것만: 넣은 돈만큼 넘게 땄거나 반 넘게 잃었다, 11-28 결정). 결과 카드 밑에 */
export function rivalTaunt(pnl: number, roe: number, tick: number): string | null {
  const P = useProto.getState();
  if (!P.rivals || !(pnl > 0 ? isBigWin(roe) : isBigLoss(roe))) return null;
  const ids = Object.keys(P.rivals.r);
  const d = rivalById[ids[tick % ids.length]];
  const xs = pnl > 0 ? d.lines.vsWin : d.lines.vsLoss;
  return `${d.name}: ${xs[tick % xs.length]}`;
}

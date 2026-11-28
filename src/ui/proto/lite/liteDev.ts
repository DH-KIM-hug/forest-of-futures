// 라이트 모드의 켜기와 화면 확인용 장면(?proto=1&lite=1&pdev=lite_*). 엔진 규칙은 건드리지 않는다: 장면은 엔진 행동과 진입가 옮기기로만 만든다.
import { useGame } from '../../../store/gameStore';
import { useProto } from '../protoStore';
import { clone, stepMut } from '../../../engine/game';
import { balance } from '../../../engine/data';
import { useUI } from '../../uiStore';
import { pdev } from '../config';
import { openLoan } from './LiteLoan';
import { payAt } from '../loanActs';
import { liteDevPick, liteEndingById, liteEndings } from '../../../engine/liteEndings';
import type { GameState } from '../../../engine/types';
import type { Action } from '../../../engine/actions';

export const MANGA_KEY = 'fof.lite.manga.v1';
/** 만화를 끝까지(또는 건너뛰기로) 본 적이 있다: 다음부터 [건너뛰기]가 처음부터 보인다 */
export const mangaSeen = (): boolean => { try { return localStorage.getItem(MANGA_KEY) === '1'; } catch { return false; } };
export const markMangaSeen = (): void => { try { localStorage.setItem(MANGA_KEY, '1'); } catch { /* 저장이 막힌 창 */ } };
const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
/** 새 게임이면 만화부터(이어 하는 생은 protoPersist 가 먼저 돌려 여기까지 오지 않는다). 장면 건너뛰기와 &prologue=0 은 생략. &pmanga=1 은 확인용 */
export const mangaWanted = (): boolean => q.get('pmanga') === '1' || (!pdev && q.get('prologue') !== '0');

/** 라이트의 첫 생 화면 상태: 도입 만화가 첫 대출까지 보여 준 뒤다(LITE_CONTI 컷 7). 탭은 없고 거래소가 한 화면이다(빌리고 갚기는 거래소 안 「대출」, U-61).
 *  짜 둔 시세는 없다(첫 판은 길잡이가 날다람쥐코인으로 맞춰 줄 뿐, 값은 진짜). afterManga = 만화를 막 덮었다: 대부의 한마디(장면 A) */
export function liteBoot(afterManga = false): void {
  useProto.getState().patch({ tab: 'phone', everUnlocked: { map: true, phone: true }, visited: { map: true, phone: true }, loanTaken: true, tutorial: 'done', firstTry: 3, seen: { ...useProto.getState().seen, office: true } });
  useUI.getState().setTrade({ market: 'FLY' });
  // 만화를 막 덮었다: 오소리 대부의 날다람쥐코인 길잡이(lite/FlyTutorial.tsx). 끝까지 보거나 건너뛰면 저장에 남는다(flyTut)
  if (afterManga) {
    // 오픈 기념 수수료 문자는 길잡이가 끝난 뒤로(FlyTutorial 이 끝날 때 풀어 준다). 같은 틱에 문자가 먼저 뜨지 않게 여기서 잡는다
    const seen = { ...useProto.getState().seen };
    if (!seen.feeEventSms) { seen.feeEventSms = true; seen.ftHeldSms = true; }
    useProto.getState().patch({ flyTut: 'run', seen });
  }
}

const A = (g: GameState, action: Action) => stepMut(g, { type: 'action', action });
/** 첫 대출을 받고 거래소를 보는 판 */
function ready(base: GameState): GameState {
  const g = clone(base); // 새 판은 이미 첫 대출 뒤다(dev.ts freshGame)
  useProto.getState().patch({ loanTaken: true, tab: 'phone', everUnlocked: { map: true, phone: true }, visited: { map: true, phone: true }, seen: { office: true, firstSettle: true, feeEventSms: true, flyNews: true }, cutCount: 1 });
  return g;
}
/** FLY 200배 한 판을 연다(발도장 포함). 진입가는 entryK 배 */
function fly200(g: GameState, dir: 1 | -1, pct: number, entryK: number, tp: number | null = null): void {
  A(g, { type: 'signWaiver' });
  const r = A(g, { type: 'open', market: 'FLY', dir, lev: 200, marginPct: pct, sl: null, tp });
  if (!r.ok) return;
  g.run.positions.FLY.entry = g.run.prices.FLY * entryK;
}

export function liteScene(name: string, base: GameState): GameState {
  const P = useProto.getState();
  switch (name) {
    case 'lite_trade': { const g = ready(base); useUI.getState().setTrade({ market: 'FLY' }); return g; }
    // U-61 대출: lite_loan = 거래소 안의 「대출」을 연 자리(캐피탈 문자도 받았다). lite_quick = 손의 돈이 적어 증거금이 모자라다(빌리기 말풍선), lite_quick_settle = 정산 8초 전인데 모자라다
    case 'lite_loan': { const g = ready(base); P.patch({ seen: { ...useProto.getState().seen, capitalSms: true } }); window.setTimeout(() => openLoan(), 600); return g; }
    // U-63 대출 탭: lite_loan_od = 오소리 사무소에 연체 1회, 대출 탭을 보는 자리
    case 'lite_loan_od': { const g = ready(base); g.run.debts.shark1.overdue = 1; P.patch({ tab: 'map', seen: { ...useProto.getState().seen, capitalSms: true }, mapFocus: 'shark1' }); return g; }
    // 대출 계산 확인(LITE_LOANS.md): 캐피탈을 한도(20만)까지, 오소리 사무소는 1만씩 20번 갚아 20만, 손에 118,516, 정산 49초 전
    case 'lite_loan_math': {
      const g = ready(base);
      for (let i = 0; i < 4; i++) A(g, { type: 'borrow', lender: 'capital' });
      for (let i = 0; i < 20; i++) A(g, { type: 'stamp', lender: 'shark1', mult: 1 });
      g.run.cash = 118516; g.run.settleIn = 49;
      P.patch({ tab: 'map', seen: { ...useProto.getState().seen, capitalSms: true }, mapFocus: null });
      return g;
    }
    // 소개(U-65): lite_refer = 손에 0, 정산 2초 전(오소리 추심원이 캐피탈을 소개, 너구리의 유혹 만화). lite_crow = 캐피탈 빚이 있는데 손에 0(너구리가 까마귀를 소개, 인증 사진). &pftat=loan 이면 대출 탭
    case 'lite_refer': case 'lite_crow': {
      const g = ready(base);
      if (name === 'lite_crow') { A(g, { type: 'borrow', lender: 'capital' }); A(g, { type: 'borrow', lender: 'capital' }); P.patch({ seen: { ...useProto.getState().seen, capitalSms: true } }); }
      g.run.cash = 0; g.run.settleIn = 2;
      if (new URLSearchParams(window.location.search).get('pftat') === 'loan') P.patch({ tab: 'map' });
      return g;
    }
    // 추심원 줄(U-65): lite_collectors = 오소리, 캐피탈, 까마귀에 빚(추심원 셋), 손에 20만, 정산 13초 전(10초 전부터 똑똑, 정산에 문 앞 띠). lite_escape = 캐피탈 빚을 3초 뒤 다 갚는다(너구리가 「탈출!」)
    case 'lite_collectors': case 'lite_escape': {
      const g = ready(base);
      A(g, { type: 'borrow', lender: 'capital' });
      P.patch({ seen: { ...useProto.getState().seen, capitalSms: true, viperSms: true } });
      if (name === 'lite_collectors') { g.run.debts.shark2.principal = 2500; g.run.shark2Open = true; g.run.settleIn = 13; }
      g.run.cash = 200000;
      if (name === 'lite_escape') window.setTimeout(() => payAt('capital', 'all', () => {}), 3000);
      return g;
    }
    case 'lite_quick': { const g = ready(base); g.run.cash = 2400; useUI.getState().setTrade({ market: 'FLY', pct: 25, keep: false }); return g; }
    case 'lite_quick_settle': { const g = ready(base); g.run.cash = 2400; g.run.settleIn = 9; useUI.getState().setTrade({ market: 'FLY', pct: 25, keep: false }); return g; }
    case 'lite_tut': case 'lite_sign': {
      // lite_sign = 같은 자리에 차용증(이름 적기)이 먼저 뜬다(이름이 있어도, 찍어도 저장하지 않는다, loanSign.ts)
      // 프롤로그를 막 덮은 자리의 날다람쥐코인 길잡이(확인용). 판은 첫 대출 뒤. &pftskip=1 이면 끝까지 본 적이 있는 기기(건너뛰기가 보인다)
      const g = ready(base);
      P.patch({ firstTry: 3, cutCount: 0, seen: { office: true }, flyTut: 'run' });
      useUI.getState().setTrade({ market: 'FLY', lev: null, pct: 25, keep: false, tpK: null, slK: null });
      try { if (new URLSearchParams(window.location.search).get('pftskip') === '1') localStorage.setItem('fof.lite.flytut.v1', '1'); else localStorage.removeItem('fof.lite.flytut.v1'); } catch { /* 저장 막힘 */ }
      return g;
    }
    case 'lite_settle': { const g = ready(base); g.run.settleIn = 4; P.patch({ cutCount: 0 }); return g; }
    case 'lite_near': {
      // 청산까지 0.1% 남짓: 굳은 화면에서 만화 컷(스~윽, 쿵덕 쿵덕)을 본다. 0.7초 뒤 시계를 멈춘다(연습 시세는 빨라서 곧 청산된다)
      // 먹 차트가 그릴 시세가 1분쯤 모인 뒤(9초 뒤)에 판을 열고 바로 멈춘다
      const g = ready(base);
      P.patch({ closes: 2, wins: 1 });
      window.setTimeout(() => { const g2 = clone(useGame.getState().g); fly200(g2, 1, 25, 1.0034); useGame.getState().setGame(g2); useGame.getState().setSpeed(0); }, 9000);
      return g;
    }
    case 'lite_pray': {
      // 50배 롱이 넣은 돈의 절반 넘게 잃고 있다(청산은 아직 멀다): 평가손 기도. 0.7초 뒤 시계를 멈춘다
      const g = ready(base);
      P.patch({ closes: 2, wins: 1 });
      A(g, { type: 'open', market: 'FLY', dir: 1, lev: 50, marginPct: 50, sl: null, tp: null });
      if (g.run.positions.FLY) g.run.positions.FLY.entry = g.run.prices.FLY * 1.011;
      window.setTimeout(() => { const g2 = clone(useGame.getState().g); const p = g2.run.positions.FLY; if (p) { p.entry = g2.run.prices.FLY * 1.011; useGame.getState().setGame(g2); } useGame.getState().setSpeed(0); }, 700);
      return g;
    }
    case 'lite_cap': {
      // 숲속 캐피탈을 안다(문자를 받았다): 지도에서 처음 빌리면 너구리의 유혹 컷
      const g = ready(base);
      P.patch({ tab: 'map', seen: { ...useProto.getState().seen, capitalSms: true }, mapFocus: 'capital' });
      g.run.settleNo = 4;
      return g;
    }
    case 'lite_vip': {
      // 오소리 한도를 다 쓰고 뒷골목이 열렸다: 처음 빌리면 독사의 조건 → 유혹 컷
      const g = ready(base);
      while (A(g, { type: 'borrow', lender: 'shark1' }).ok) { /* 한도까지 */ }
      g.run.shark2Open = true;
      P.patch({ tab: 'map', seen: { ...useProto.getState().seen, capitalSms: true, viperSms: true }, mapFocus: 'shark2' });
      g.run.settleNo = 6;
      return g;
    }
    case 'lite_clear': {
      // 빚이 1만 남았다: 지도에서 [전부 갚기] → 완납 장면(장면 F)
      const g = ready(base);
      P.patch({ tab: 'map', mapFocus: 'shark1' });
      const d = g.run.debts.shark1;
      d.principal = 10_000; d.inherited = 10_000; d.tranches = [];
      g.run.stats['repaid.shark1'] = 490_000;
      g.run.cash = 250_000;
      return g;
    }
    case 'lite_liq': { const g = ready(base); P.patch({ closes: 2, wins: 1 }); fly200(g, 1, 100, 1.02); return g; }
    case 'lite_win': case 'lite_first': {
      // 익절가를 넘어 있다: 다음 틱에 엔진이 익절로 닫는다. lite_first = 이번 생 처음 이긴 실전 판
      const g = ready(base);
      if (name === 'lite_win') P.patch({ closes: 4, wins: 2, seen: { ...useProto.getState().seen, liteFirstWin: true } });
      else P.patch({ firstTry: 3 });
      // lite_win = 대박(넣은 돈의 네 배 넘게) 익절, lite_first = 두 배쯤
      const tp = name === 'lite_win' ? 450 : 120;
      fly200(g, 1, 25, 1, tp);
      g.run.positions.FLY.entry = g.run.prices.FLY / (1 + (tp / 100 / 200) * 1.8);
      return g;
    }
    case 'lite_lev': {
      // 200배를 막 건다: 다짐 컷(간다…!)
      const g = ready(base);
      P.patch({ closes: 1 });
      window.setTimeout(() => { const g2 = clone(useGame.getState().g); A(g2, { type: 'signWaiver' }); A(g2, { type: 'open', market: 'FLY', dir: -1, lev: 200, marginPct: 25, sl: -50, tp: null }); useGame.getState().setGame(g2); }, 1500);
      return g;
    }
    case 'lite_broke': {
      // 마지막 연체 직전: 손에 0, 오소리 연체 1회, 정산 3초 전. 엔진 정산이 파산을 선언한다
      const g = ready(base);
      while (A(g, { type: 'borrow', lender: 'shark1' }).ok) { /* 한도까지 */ }
      // 판에 전부 걸어 둔 채(10배 롱) 이자를 못 낸다: 걸어 둔 돈은 압류되지도 이자로 나가지도 않는다
      A(g, { type: 'open', market: 'FLY', dir: 1, lev: 10, marginPct: 100, sl: null, tp: null });
      g.run.cash = 0;
      g.run.debts.shark1.overdue = 1;
      g.run.settleIn = 3;
      g.run.settleNo = 6;
      (g.run.stats as Record<string, unknown>).liqCount = 3;
      return g;
    }
    case 'lite_rebirth': {
      const g = ready(base);
      while (A(g, { type: 'borrow', lender: 'shark1' }).ok) { /* 한도까지 */ }
      g.run.cash = 0; g.run.debts.shark1.overdue = 1; g.run.settleIn = 1;
      stepMut(g, { type: 'tick', tick: { n: g.run.tick + 1, st: 'open', p: Object.fromEntries(Object.entries(g.run.prices).map(([k, v]) => [k, [v, 1, 0.5] as [number, number, number]])) } });
      if (g.run.over) { A(g, { type: 'estateNext' }); A(g, { type: 'inherit', branch: 'renounce' }); }
      g.family.fruit = new URLSearchParams(window.location.search).get('pfruit') ? +new URLSearchParams(window.location.search).get('pfruit')! : 4; // 라이트 나무의 열매(U-62)
      return g;
    }
    case 'lite_retire': {
      // 완납(U-62): 빚을 다 갚고 은퇴 → 특별한 결말 「완납 영수증」 카드
      const g = ready(base);
      g.run.cash += 1_000_000;
      for (let k = 0; k < 5; k++) for (const id of ['shark1', 'shark2', 'capital', 'bank'] as const) if (g.run.debts[id].principal > 0) A(g, { type: 'stamp', lender: id, mult: 'all' });
      A(g, { type: 'retireAct1' });
      return g;
    }
    case 'lite_end': case 'lite_book': {
      // 라이트 엔딩 카드(LiteEnding.tsx): 연체 파산을 엔진으로 일으키고, &pend=LE04 면 그 엔딩으로 바꿔 보인다. lite_book = 도감에 14개를 채운 채
      const g = ready(base);
      const q = new URLSearchParams(window.location.search);
      // &pseen=9 = 도감에 미리 9개(LE40 부터 거꾸로, 고른 엔딩은 빼고). 다음 엔딩이 10개째 보상을 받는 자리
      const want = q.get('pend');
      const pre = name === 'lite_book' ? 14 : +(q.get('pseen') ?? 0);
      if (pre > 0) { g.family.liteBook ??= {}; for (const e of [...liteEndings].reverse().filter((x) => x.id !== want).slice(0, pre)) g.family.liteBook[e.id] = { count: 1, firstAt: 1 }; }
      if (want && liteEndingById[want]) liteDevPick.id = want;
      if (want && liteEndingById[want] && q.get('prepeat') === '1') (g.family.liteBook ??= {})[want] = { count: 1, firstAt: 1 }; // 다시 본 엔딩(열매 0)
      g.run.cash = 0; g.run.debts.shark1.overdue = 1; g.run.settleIn = 1;
      stepMut(g, { type: 'tick', tick: { n: g.run.tick + 1, st: 'open', p: Object.fromEntries(Object.entries(g.run.prices).map(([k, v]) => [k, [v, 1, 0.5] as [number, number, number]])) } });
      return g;
    }
    default: return base;
  }
}
void balance;

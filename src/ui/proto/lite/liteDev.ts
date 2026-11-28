// 라이트 모드의 켜기와 화면 확인용 장면(?proto=1&lite=1&pdev=lite_*). 엔진 규칙은 건드리지 않는다: 장면은 엔진 행동과 진입가 옮기기로만 만든다.
import { useGame } from '../../../store/gameStore';
import { useProto } from '../protoStore';
import { clone, stepMut } from '../../../engine/game';
import { balance } from '../../../engine/data';
import { useUI } from '../../uiStore';
import { pdev } from '../config';
import type { GameState } from '../../../engine/types';
import type { Action } from '../../../engine/actions';

export const MANGA_KEY = 'fof.lite.manga.v1';
/** 만화를 끝까지(또는 건너뛰기로) 본 적이 있다: 다음부터 [건너뛰기]가 처음부터 보인다 */
export const mangaSeen = (): boolean => { try { return localStorage.getItem(MANGA_KEY) === '1'; } catch { return false; } };
export const markMangaSeen = (): void => { try { localStorage.setItem(MANGA_KEY, '1'); } catch { /* 저장이 막힌 창 */ } };
const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
/** 새 게임이면 만화부터(이어 하는 생은 protoPersist 가 먼저 돌려 여기까지 오지 않는다). 장면 건너뛰기와 &prologue=0 은 생략. &pmanga=1 은 확인용 */
export const mangaWanted = (): boolean => q.get('pmanga') === '1' || (!pdev && q.get('prologue') !== '0');

/** 라이트의 첫 생 화면 상태: 도입 만화가 첫 대출까지 보여 준 뒤다(LITE_CONTI 컷 7). 탭은 지도와 거래소, 거래소가 집이다.
 *  짜 둔 시세는 없다(첫 판은 FRX 첫 실전 카드가 날다람쥐코인으로 맞춰 줄 뿐, 값은 진짜). afterManga = 만화를 막 덮었다: 대부의 한마디(장면 A) */
export function liteBoot(afterManga = false): void {
  useProto.getState().patch({ tab: 'phone', everUnlocked: { map: true, phone: true }, visited: { map: true, phone: true }, loanTaken: true, tutorial: 'done', firstTry: 3, seen: { ...useProto.getState().seen, office: true } });
  useUI.getState().setTrade({ market: 'FLY' });
  if (afterManga) window.setTimeout(() => void import('../watch').then((m) => m.say('오소리 대부: 오를 것 같으면 롱, 내릴 것 같으면 숏. 배율은 마음대로요.', 7000)), 900);
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
      g.family.gold = 4;
      return g;
    }
    default: return base;
  }
}
void balance;

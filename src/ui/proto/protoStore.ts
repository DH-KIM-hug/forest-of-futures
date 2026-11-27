// 시제품 화면 상태(저장하지 않음). 게임 상태(엔진)는 store/gameStore 가 가진다.
import { create } from 'zustand';
import type { CardData } from './shareCard';
import { tipSeen, type HlKey } from './guide';
import { loadPanel, savePanel } from './home';
import type { AwayCard } from './away';

/** 탭 셋(U-29·U-30): 지도 · 집(가운데) · 거래소. 'phone' 은 거래소 탭의 내부 이름(중고폰 속 FRX 앱). */
export type Tab = 'lot' | 'phone' | 'map';
export interface Collector { interest: number; fill: number; overdue: boolean; at: number }

/** 컷인에 나오는 사람(§7.7). hero = 주인공 속마음, sms = 폰 문자, note = 지문 */
/** raccoon = 숲속 캐피탈 창구 너구리, viper = 뒷골목 독사 대부, owl = 숲속중앙조합 부엉이 지점장, news = 도토리일보 속보(소리 없음) */
export type Who = 'collector' | 'boss' | 'weasel' | 'hero' | 'sms' | 'note' | 'raccoon' | 'viper' | 'owl' | 'news';
/** tip = 튜토리얼 설명 줄의 이름(guide.ts, 평생 한 번만 나온다). hl = 그 줄이 비추는 화면 조각 */
export interface Line { who: Who; text: string; mood?: 'smile' | 'flat'; tip?: string; hl?: HlKey }
export interface Choice { id: string; label: string; sub?: string; primary?: boolean; run: () => void }
/** 컷인 한 장면: 줄을 탭으로 넘긴다. settle 이 있으면 정산 합계를 같이 보여 준다. unlock 은 끝날 때 열리는 탭. */
export interface Scene {
  id: string;
  lines: Line[];
  settle?: { net: number; interest: number; win: boolean; no: number; /** 이번 정산에 나간 것(U-46: 일당이 언제 나가는지 보이게) */ other?: number; living?: number; wages?: number; hamsters?: number; mined?: number };
  unlock?: Tab;
  /** 한 줄짜리 정산 컷인은 가만두면 사라진다(ms) */
  auto?: number;
  /** 마지막 줄에서 고르는 단추(있으면 탭으로 닫히지 않는다) */
  choices?: Choice[];
  /** 장면이 끝난 뒤 한 번(같은 생에 다시 나올 수 있는 장면은 again) */
  onEnd?: () => void;
  again?: boolean;
  /** 떠 있는 동안 게임 시계를 멈춘다(설명 줄이 든 장면은 저절로 켜진다) */
  hold?: boolean;
  /** 설명 줄이 들어 있다(건너뛰기 단추가 붙는다). pushScene 이 채운다 */
  guide?: boolean;
}

/** 이번 생에서 이미 지나간 이야기 사건(다음 생에서는 다시 나오지 않는 것들) */
export const KNOWN_AFTER_FIRST_LIFE = ['firstWin', 'firstLoss', 'sms', 'repay', 'hamsterHint', 'capitalSms'];

interface P {
  tab: Tab;
  visited: Partial<Record<Tab, boolean>>;
  everUnlocked: Partial<Record<Tab, boolean>>;
  goalIdx: number;
  everOpened: boolean;
  scenes: Scene[];
  seen: Record<string, boolean>;
  cutCount: number;
  negSettles: number;
  toast: string | null;
  collector: Collector | null;
  tapping: boolean;
  wallet: boolean;
  gen: number;
  profit: CardData | null;
  wins: number;
  closes: number;
  /** 잇따라 딴·잃은·본전치기한 거래 수, 이번 생에 낸 수수료, 잇따른 적자 정산 수(react.ts 가 읽는다) */
  winStreak: number; lossStreak: number; tinyStreak: number; feesLife: number; negRun: number;
  /** 이번 생에 빌린 뒤 이자를 못 낸 정산 수 */
  odSeen: number;
  /** 프롤로그가 떠 있는 동안에는 게임 시계와 이야기 사건을 멈춘다 */
  prologue: boolean;
  /** 추심원이 이자를 걷으러 왔는데 낼 돈이 없다: 그가 문 앞에서 기다리는 동안 시계가 멈춘다(사무소에서 빌리거나, 돌려보내 연체로 적히거나) */
  waiting: boolean;
  /** 이번 생에 오소리 사무소에서 처음 빌렸다(중고폰·거래소를 받았다) */
  loanTaken: boolean;
  /** 추심원을 돌려보낸 정산 번호(같은 정산에 다시 묻지 않는다) */
  sentAwayAt: number;
  /** 튜토리얼 거래(U-31): none = 아직, await = 거래소에서 롱/숏을 고르길 기다림, run = 짜 둔 시세가 가는 중, lost = 청산됨(더 빌리기 전), notice = '지금부터 실제 시세' 알림, done */
  tutorial: 'none' | 'await' | 'run' | 'lost' | 'notice' | 'done';
  /** 지도에서 강조할 장소 */
  mapFocus: string | null;
  /** 집 아래 판(쳇바퀴 자리 칸)을 펴 두었는가(U-34). 마지막 상태를 기억한다(home.ts PANEL_KEY) */
  panelOpen: boolean;
  /** 더 놓은 쳇바퀴가 앉은 바닥 자리(uid → 자리 1~5). 칸을 눌러 놓은 자리를 기억한다. 적히지 않은 쳇바퀴는 빈 자리 번호순 */
  slotOf: Record<string, number>;
  /** 방금 누른 칸의 자리(세상에서 잠깐 밝힌다) */
  slotHi: number | null;
  /** 포지션을 들고 있는 동안 주인공이 속으로 하는 말(잠깐 떴다 사라진다, tension.ts holdBeat) */
  think: { text: string; k: number } | null;
  /** 엄마 이야기의 단서를 마지막으로 보여 준 정산 번호(한 번 들를 때 하나만) */
  clueAt: number;
  /** 자리를 비운 사이 보고서(돌아왔을 때 한 장, away.ts) */
  away: AwayCard | null;
  /** 도토리일보 시세면이 펴져 있다(daynote.ts) */
  dayNote: boolean;
  /** 이번 생에 거래가 벌어 온 돈(수수료 포함, 튜토리얼 거래는 빼고) · 한 판에 이자 한 번 치를 번 횟수 · 정산 때 낸 돈의 합(U-41: 집 판과 장부의 한 줄) */
  tradeLife: number; claimWins: number; paidLife: number;
  /** 방금 크게 땄다: 집이 잠깐 들썩인다(알바가 뛰고 쳇바퀴에 불이 켜진다). at = 그때(ms), amount = 딴 돈, worth = 이자 몇 번 치 */
  cheer: { at: number; amount: number; worth: number } | null;
  /** 포지션을 든 채 쳇바퀴를 굴려 번 돈(U-42): rolledKey = 그 판의 열쇠(가장 먼저 연 포지션의 틱), rolled = 번 돈, rolledTaps = 굴린 횟수 */
  rolled: number; rolledKey: number | null; rolledTaps: number;
  /** 이자 한 번 치를 연달아 딴 · 잃은 판 수(본전치기는 끊지 않는다)와 그 합(U-42: 연달아 이긴 · 진 판의 장면) */
  claimWinRun: number; claimLossRun: number; claimRunSum: number;
  /** 아래 탭 하나를 잠깐 가리킨다(U-43: 알바가 쳇바퀴를 다 돌리면 주인공은 폰을 본다) */
  pointTab: Tab | null;
  /** 중고폰이 울렸다(U-43): 튜토리얼 거래를 걸 때까지 거래소 탭(폰의 앱)만 열 수 있다(지도 · 집의 할 일은 잠기고 정산 시계가 멈춘다) */
  forceTrade: boolean;
  setPanel: (open: boolean) => void;
  setTab: (t: Tab) => void;
  patch: (p: Partial<P>) => void;
  pushScene: (s: Scene) => void;
  resetLife: (gen: number, first: boolean) => void;
}

const fresh = () => ({
  tab: 'lot' as Tab, goalIdx: 0, everOpened: false, scenes: [] as Scene[], cutCount: 0, negSettles: 0,
  toast: null, collector: null, tapping: false, wallet: false, profit: null, wins: 0, closes: 0, mapFocus: null,
  winStreak: 0, lossStreak: 0, tinyStreak: 0, feesLife: 0, negRun: 0, odSeen: 0,
  waiting: false, loanTaken: false, sentAwayAt: -1, tutorial: 'none' as P['tutorial'],
  slotOf: {} as Record<string, number>, slotHi: null as number | null,
  think: null as P['think'], away: null as P['away'], clueAt: -1,
  dayNote: false, tradeLife: 0, claimWins: 0, paidLife: 0, cheer: null as P['cheer'],
  rolled: 0, rolledKey: null as number | null, rolledTaps: 0, claimWinRun: 0, claimLossRun: 0, claimRunSum: 0, pointTab: null as Tab | null, forceTrade: false,
});

export const useProto = create<P>((set) => ({
  ...fresh(), visited: { lot: true }, everUnlocked: { lot: true }, seen: {}, gen: 0, prologue: false, panelOpen: loadPanel(),
  setPanel: (open) => set((s) => { if (s.panelOpen === open) return s; savePanel(open); return { panelOpen: open }; }),
  setTab: (tab) => set((s) => ({ tab, visited: { ...s.visited, [tab]: true } })),
  patch: (p) => set(p as any),
  pushScene: (sc) => set((s) => {
    if ((!sc.again && s.seen[sc.id]) || s.scenes.some((x) => x.id === sc.id)) return s;
    // 이미 본 설명 줄은 뺀다. 설명 줄이 남은 장면은 읽는 동안 시계를 멈추고, 저절로 닫히지 않는다.
    const lines = sc.lines.filter((l) => !l.tip || !tipSeen(l.tip));
    if (!lines.length) return s;
    const guide = lines.some((l) => !!l.tip);
    return { scenes: [...s.scenes, { ...sc, lines, guide, hold: sc.hold ?? guide, auto: guide ? undefined : sc.auto }] };
  }),
  // 다음 생: 사무소 가는 길은 이미 안다(지도는 열린 채). 폰과 거래소는 다시 빌려야 받는다.
  resetLife: (gen, first) => set(first
    ? { ...fresh(), visited: { lot: true }, everUnlocked: { lot: true }, seen: {}, gen }
    : { ...fresh(), tutorial: 'done' as const, visited: { lot: true, map: true }, everUnlocked: { lot: true, map: true },
        seen: Object.fromEntries(KNOWN_AFTER_FIRST_LIFE.map((k) => [k, true])), gen }),
}));

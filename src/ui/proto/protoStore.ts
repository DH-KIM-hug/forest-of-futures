// 시제품 화면 상태(저장하지 않음). 게임 상태(엔진)는 store/gameStore 가 가진다.
import { create } from 'zustand';
import type { CardData } from './shareCard';
import { tipSeen, type HlKey } from './guide';
import { loadPanel, savePanel } from './home';

/** 탭 셋(U-29·U-30): 지도 · 집(가운데) · 거래소. 'phone' 은 거래소 탭의 내부 이름(중고폰 속 FRX 앱). */
export type Tab = 'lot' | 'phone' | 'map';
export interface Collector { interest: number; fill: number; overdue: boolean; at: number }

/** 컷인에 나오는 사람(§7.7). hero = 주인공 속마음, sms = 폰 문자, note = 지문 */
export type Who = 'collector' | 'boss' | 'weasel' | 'hero' | 'sms' | 'note';
/** tip = 튜토리얼 설명 줄의 이름(guide.ts, 평생 한 번만 나온다). hl = 그 줄이 비추는 화면 조각 */
export interface Line { who: Who; text: string; mood?: 'smile' | 'flat'; tip?: string; hl?: HlKey }
export interface Choice { id: string; label: string; sub?: string; primary?: boolean; run: () => void }
/** 컷인 한 장면: 줄을 탭으로 넘긴다. settle 이 있으면 정산 합계를 같이 보여 준다. unlock 은 끝날 때 열리는 탭. */
export interface Scene {
  id: string;
  lines: Line[];
  settle?: { net: number; interest: number; win: boolean; no: number };
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
export const KNOWN_AFTER_FIRST_LIFE = ['firstWin', 'firstLoss', 'sms', 'repay', 'hamsterHint'];

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
  setPanel: (open: boolean) => void;
  setTab: (t: Tab) => void;
  patch: (p: Partial<P>) => void;
  pushScene: (s: Scene) => void;
  resetLife: (gen: number, first: boolean) => void;
}

const fresh = () => ({
  tab: 'lot' as Tab, goalIdx: 0, everOpened: false, scenes: [] as Scene[], cutCount: 0, negSettles: 0,
  toast: null, collector: null, tapping: false, wallet: false, profit: null, wins: 0, closes: 0, mapFocus: null,
  waiting: false, loanTaken: false, sentAwayAt: -1, tutorial: 'none' as P['tutorial'],
  slotOf: {} as Record<string, number>, slotHi: null as number | null,
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

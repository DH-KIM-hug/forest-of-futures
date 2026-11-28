// 엔딩 카드·재산 명세서·기록관·전광판의 읽기 모델(시험: tests/ui/m9_records.test.ts).
import { endings, endingById, heirloomDefs, houseDefs, legacy, lenderById, tipsData, traitById, wheelByCoin } from '../../engine/data';
import { liteEndingById } from '../../engine/liteEndings';
import { archiveEntry, previewEnding, type ArchiveEntry } from '../../engine/endings';
import { canRetire, hanTotal, statement, treeStatus, type BranchCard } from '../../engine/generation';
import { comma } from '../../engine/util';
import { act1On, ENDING_TOTAL } from '../../engine/act1';
import { totalDebt, netWorth } from '../../engine/selectors';
import type { EventLogItem, GameState } from '../../engine/types';

export const archiveCount = (g: GameState): number => Object.keys(g.family.ledger).length;

export const CAUSE: Record<string, { label: string; color: string }> = {
  LIQ: { label: '청산', color: '#e8a094' }, TIP: { label: '낚임', color: '#d9b0d0' }, SHARK: { label: '사채', color: '#c8b27a' },
  BANK: { label: '제도권', color: '#9db8d4' }, UPKEEP: { label: '생활비', color: '#d4c08a' }, SEIZE: { label: '압류', color: '#c89a80' },
  FRIEND: { label: '절교', color: '#a8c8a8' }, LEGACY: { label: '물려받은 빚', color: '#b4acd4' }, RETIRE: { label: '은퇴', color: '#E8C24A' },
};
export const BRANCH_LABEL: Record<string, string> = { forced: '강제 상속', simple: '단순승인', limited: '한정승인', renounce: '상속포기', gift: '증여' };
const TIME = ['아침', '낮', '저녁', '밤'];

// ── 엔딩 카드 (8.7) ─────────────────────────────────────────────────────
export interface SceneRow { when: string; text: string; amount: number | null }
export const sceneRow = (e: EventLogItem): SceneRow => ({ when: `정산 ${e.at.settleNo}회 · ${TIME[e.at.time] ?? ''}`, text: e.text, amount: e.amount ?? null });
export interface EndingCardModel {
  id: string;
  no: string;
  cause: string;
  causeLabel: string;
  color: string;
  title: string;
  line: string;
  action: string; // 그림이 없을 때 쓰는 연출표 action 문장
  illustration: string | null;
  scenes: SceneRow[];
  misses: { id: string; text: string }[];
  next: { trait: string | null; trace: string; heirloom: string | null };
  status: string; // 새 엔딩 / 이미 수집(3번째)
  isNew: boolean;
  ledger: string; // 37 / 200
  offline: boolean;
  cta: string;
}
export function endingCardModel(g: GameState): EndingCardModel | null {
  const p = g.pendingEnding;
  if (!p) return null;
  const def = endingById[p.id];
  const c = CAUSE[p.cause] ?? { label: p.cause, color: '#ddd' };
  return {
    id: p.id, no: p.id.replace('END-', 'No.'), cause: p.cause, causeLabel: c.label, color: c.color, title: p.title, line: p.line,
    action: def?.direction?.action ?? '', illustration: def?.illustration ?? null,
    scenes: p.lastThree.map(sceneRow),
    misses: p.nearMisses.map((m) => ({ id: m.id, text: `${m.hint} → ${m.id} · ???` })),
    next: p.nextGen,
    status: p.isNew ? '새 엔딩' : `이미 수집(${p.nth}번째)`, isNew: p.isNew, ledger: `${p.collected} / ${act1On() ? ENDING_TOTAL : endings.length}`, offline: p.offline,
    cta: '상속 개시',
  };
}

// ── 재산 명세서 (8.8) ───────────────────────────────────────────────────
export interface StatementModel {
  kind: 'bankrupt' | 'retire' | null;
  parent: { label: string; value: string }[];
  formula: string | null;
  cards: CardView[];
  maxim: string | null;
  hidden: boolean;
}
export interface CardView {
  branch: string; title: string; han: number; keeps: string[]; startDebt: number; tax: number; startCash: number; surplus: number;
  firstNet: number; stage: number; grudge: string[]; tie: string[]; lines: { k: string; v: string }[];
}
const PARENT_TITLES: Record<string, string> = { renounce: '상속포기', limited: '한정승인', simple: '단순승인', gift: '증여' };
export function cardView(c: BranchCard): CardView {
  const sign = c.firstNet >= 0 ? '+' : '−';
  return {
    branch: c.branch, title: PARENT_TITLES[c.branch], han: c.han, keeps: c.keeps, startDebt: c.startDebt, tax: c.tax, startCash: c.startCash, surplus: c.surplus,
    firstNet: c.firstNet, stage: c.stage, grudge: c.grudge, tie: c.tie,
    lines: [
      { k: '받는 ' + legacy.currency.name, v: `+${comma(c.han)}` },
      { k: '남는 것', v: c.keeps.length ? c.keeps.join(', ') : '없음' },
      { k: '시작 빚', v: comma(c.startDebt) + (c.tax > 0 ? ` + 세금 ${comma(c.tax)}` : '') },
      { k: '시작 현금', v: comma(c.startCash) + (c.surplus > 0 ? ` (잉여금 ${comma(c.surplus)} 포함)` : '') },
      { k: '첫 정산 예상 수지', v: `${sign}${comma(Math.abs(c.firstNet))}` },
      { k: '시작 단계', v: String(c.stage) },
    ],
  };
}
export function formulaText(c: BranchCard): string {
  const x = c.calc;
  const f = (n: number) => n.toFixed(2).replace(/0$/, '').replace(/\.0$/, '.0');
  return `성과 ${x.score} × 장부 ${f(x.ledgerMul)} × 반복 ${f(x.repeatMul)} × 족보 ${f(x.crestMul)}`;
}
export function statementModel(g: GameState): StatementModel {
  const st = statement(g);
  const p = st.parent;
  const rows: { label: string; value: string }[] = [
    { label: '현금', value: comma(p.cash) },
    { label: '지갑', value: comma(p.wallet) },
    { label: '종목 쳇바퀴', value: p.coins.length ? p.coins.map((c) => wheelByCoin[c].name.replace(' 쳇바퀴', '')).join(', ') : '없음' },
    { label: '설비', value: `${p.equipment}대` },
    { label: '집', value: houseDefs[p.house].name },
    { label: '빚', value: Object.entries(p.debts).filter(([, v]) => v > 0).map(([k, v]) => `${k === 'tax' ? '세금' : lenderById[k].name} ${comma(v)}`).join(' · ') || '없음' },
  ];
  if (p.friendDebt > 0) rows.push({ label: '친구 빚', value: comma(p.friendDebt) });
  const visible = st.hiddenLine ? rows.map((r, i) => (i === rows.length - 1 ? { label: r.label, value: '???' } : r)) : rows;
  const first = st.cards[0];
  return {
    kind: st.kind, parent: visible, formula: first ? formulaText(first) : null, cards: st.cards.map(cardView), maxim: g.estate?.maxim ?? null, hidden: st.hiddenLine,
  };
}

// ── 가문 특성 트리 ──────────────────────────────────────────────────────
export function treeModel(g: GameState) {
  return { han: g.family.han, spent: g.family.hanSpent, total: hanTotal(g), rows: treeStatus(g), anyBuyable: treeStatus(g).some((t) => t.canBuy), name: legacy.currency.name as string };
}

// ── 기록관 (3.16) ───────────────────────────────────────────────────────
export interface AlbumModel {
  lantern: { on: boolean; text: string };
  entries: ArchiveEntry[];
  filtered: ArchiveEntry[];
  count: string;
}
export function albumModel(g: GameState, filter: string | null = null): AlbumModel {
  const pv = previewEnding(g);
  const lantern = pv.lantern
    ? { on: true, text: `${pv.ending.id.replace('END-', 'No.')} · ${pv.ending.clue}` }
    : { on: false, text: '이대로 가면 이미 모은 엔딩입니다.' };
  const all = endings.map((e) => archiveEntry(g, e));
  return { lantern, entries: all, filtered: filter ? all.filter((e) => e.causes.includes(filter)) : all, count: `${archiveCount(g)} / ${endings.length}` };
}
export function lineageRows(g: GameState) {
  return g.family.lineage.map((l) => ({ gen: l.gen, name: l.name, ending: endingById[l.endedBy]?.title ?? liteEndingById[l.endedBy]?.title ?? l.endedBy, id: l.endedBy, branch: BRANCH_LABEL[l.branch] ?? l.branch, peak: l.peak }));
}
export function tipBookRows(g: GameState) {
  const names: Record<string, string> = {};
  for (const s of tipsData.sources as { id: string; name: string }[]) names[s.id] = s.name;
  return Object.entries(g.family.tipBook).map(([id, b]) => ({ id, name: names[id] ?? id.replace('friend:', ''), said: b.said, hit: b.hit }));
}
export function heirloomRows(g: GameState) {
  return heirloomDefs.map((h) => {
    const cur = g.family.heirlooms[h.id];
    return { id: h.id as string, name: h.name as string, cause: h.cause as string, level: cur?.level ?? 0, max: (h.thresholds as number[]).length, pawnedTo: cur?.pawnedTo ?? null, pawnAmount: cur && cur.level > 0 ? (h.pawn as number[])[cur.level - 1] : null };
  });
}
export const traitRows = (g: GameState) => g.family.traits.map((id) => ({ id, name: traitById[id]?.name ?? id, note: ((traitById[id] as any)?.note as string) ?? '' }));

// ── 전광판 (8.9) ────────────────────────────────────────────────────────
const RESIDENTS: { name: string; peak: number }[] = [
  { name: '다람쥐 반장', peak: 4_200_000 }, { name: '고슴도치 서기', peak: 2_650_000 }, { name: '두더지 목수', peak: 1_800_000 },
  { name: '청설모 장사꾼', peak: 1_120_000 }, { name: '너구리 사공', peak: 760_000 }, { name: '오리 우체부', peak: 430_000 },
  { name: '멧돼지 인부', peak: 260_000 }, { name: '토끼 학생', peak: 120_000 }, { name: '개구리 견습', peak: 40_000 },
];
export interface RankRow { rank: number; name: string; peak: number; me: boolean }
/** 서버 순위는 M10. 지금은 주민 9명 사다리에 우리 집안의 최고 순자산을 끼운다. */
export function ladder(g: GameState): RankRow[] {
  const mine = Math.max(g.family.peakNetWorth, g.run.peakNetWorth, netWorth(g.run), 0);
  const all = [...RESIDENTS.map((r) => ({ ...r, me: false })), { name: g.settings.name, peak: mine, me: true }].sort((a, b) => b.peak - a.peak);
  return all.map((r, i) => ({ rank: i + 1, name: r.name, peak: r.peak, me: r.me }));
}
export function retireInfo(g: GameState): { ok: boolean; reason: string | null } {
  if (g.run.over) return { ok: false, reason: '이미 끝난 세대입니다' };
  if (canRetire(g)) return { ok: true, reason: null };
  const miss: string[] = [];
  if (g.run.house < 1) miss.push('오두막 이상이어야 합니다');
  if (totalDebt(g.run) > 0 || g.run.debts.tax.principal > 0) miss.push('빚(세금 포함)이 0이어야 합니다');
  return { ok: false, reason: miss.join(' · ') };
}

// ── 어느 전체 화면이 뜨는가(AC-v2-148: 저장된 상태만으로 정해지므로 어디서 꺼도 그 화면에서 이어진다) ──
export type Route = 'prologue' | 'away' | 'ending' | 'estate' | 'archive' | 'board' | 'tree' | null;
export function overlayRoute(g: GameState, o: { prologue: boolean; away: boolean; overlay: string | null }): Route {
  if (o.prologue && g.run.tick < 5 && g.family.generation <= 2 && Object.keys(g.family.ledger).length === 0) return 'prologue';
  if (o.away) return 'away';
  if (g.estate) return g.estate.step === 'card' && g.pendingEnding ? 'ending' : 'estate';
  if (o.overlay === 'archive' || o.overlay === 'board' || o.overlay === 'tree') return o.overlay;
  return null;
}

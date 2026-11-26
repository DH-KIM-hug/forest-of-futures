// 집 화면의 배치(U-34): 집 그림(나무 밑동 집, U-33) 위의 쳇바퀴 자리 여섯, 아래 판의 2×3 칸 순서, 그림을 얼마나 올려 보여 줄지, 판을 접었는지 기억하기.
// 순수 함수와 숫자만 있다(그림 파일·엔진·저장소 상태를 부르지 않는다 — 시험이 그대로 읽는다). 그림 파일은 sprites.ts.

/** 집 그림 원본 크기(docs/art/v5/golden/home_stump.png). 아래 좌표는 전부 이 그림의 픽셀이다. */
export const HOME_IMG = { w: 992, h: 1586 };
export type Pt = [number, number];

/** 쳇바퀴 자리 여섯: 받침 앞쪽 가운데(발밑) 좌표. 0 = 그림에 그려져 있는 엄마의 쳇바퀴(바닥 가운데).
 *  1~5 는 빈 바닥(상자 둘·스탠드·계단·이불 자국(왼쪽 옅은 네모)·문 앞 손님 자리를 피한다). 번호 = 따로 고르지 않았을 때 채우는 순서. */
export const WHEEL_SLOTS: Pt[] = [
  [463, 1040], // 0 엄마의 쳇바퀴(그림)
  [575, 860], //  1 뒤 가운데(문과 엄마 쳇바퀴 사이)
  [205, 1125], // 2 앞 왼쪽(이불 자국 앞)
  [800, 1215], // 3 앞 오른쪽(상자 앞)
  [335, 815], //  4 뒤 왼쪽(계단 앞)
  [410, 1225], // 5 앞 가운데
];
export const SLOT_COUNT = WHEEL_SLOTS.length;
/** 아래 판의 2×3 칸(왼쪽 위부터 읽는 순서)에 놓이는 자리 번호. 바닥을 위에서 본 대로다: 뒷줄 [뒤 왼쪽 · 엄마 · 뒤 가운데], 앞줄 [앞 왼쪽 · 앞 가운데 · 앞 오른쪽]. */
export const TILE_GRID: number[] = [4, 0, 1, 2, 5, 3];

/** 쳇바퀴 그림(img/wheel.webp = 집 그림의 쳇바퀴를 오려 낸 것)이 발밑 좌표에서 차지하는 자리 */
export const WHEEL_BOX = { dx: -80, dy: -183, w: 160, h: 196 };
/** 빈 쳇바퀴의 새 그림(img/v5/i_wheel_empty.webp, U-41): 키(집 그림 픽셀)와 발밑에서 내려 그리는 양. 알바가 도는 쳇바퀴(150)보다 조금 크게 — 받침까지 든 그림이다 */
export const EMPTY_WHEEL_H = 172;
export const EMPTY_WHEEL_DY = 12;
/** 새 빈 쳇바퀴 그림의 앞면(도는 바퀴) 가운데와 반지름: 발밑 기준 */
export const EMPTY_WHEEL_FACE = { dx: -16, dy: -92, rx: 44, ry: 54, tilt: -12 };
/** 그림 속 엄마의 쳇바퀴를 덮는 바닥 조각(img/floor_patch.webp)의 자리: [x, y, w, h]. 이 위에 쳇바퀴 그림을 얹어야 눌릴 때 들썩이고, 실려 가면 사라진다. */
export const FLOOR_PATCH: [number, number, number, number] = [350, 825, 270, 270];
/** 쳇바퀴 앞면(도는 바퀴)의 가운데와 반지름: 발밑 기준. 도는 표시와 햄스터를 여기에 맞춘다. */
export const WHEEL_FACE = { dx: -22, dy: -95, rx: 50, ry: 60, tilt: -10 };
/** 주인공이 서는 곳(엄마의 쳇바퀴 오른쪽 앞)과 키(그림 높이의 7%) */
export const HERO_SPOT: Pt = [588, 1098];
export const HERO_H = Math.round(HOME_IMG.h * 0.07);
/** 손님(추심원)이 서는 곳: 뒷벽 둥근 문 앞 */
export const VISITOR_SPOT: Pt = [700, 925];
/** 콜드월렛 기기를 올려 둔 곳: 작은 상자 위 */
export const WALLET_SPOT: Pt = [762, 990];
/** 쳇바퀴 굴리기 탭이 먹는 넉넉한 네모(엄마의 쳇바퀴 + 주인공): [x, y, w, h] */
export const TAP_AREA: [number, number, number, number] = [310, 815, 380, 320];

/** 더 놓은 쳇바퀴(엔진 설비 uid)를 자리 1~5 에 앉힌다. 고른 자리(prefs: uid → 자리)가 있으면 그 자리에, 없거나 겹치면 빈 자리 번호순.
 *  돌려주는 배열의 i 번째 = 자리 i 의 uid(없으면 null). 0번은 엄마의 쳇바퀴라 늘 null. */
export function assignSlots(uids: string[], prefs: Record<string, number> = {}): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: SLOT_COUNT }, () => null);
  const rest: string[] = [];
  for (const u of uids) {
    const s = prefs[u];
    if (Number.isInteger(s) && s >= 1 && s < SLOT_COUNT && out[s] === null) out[s] = u; else rest.push(u);
  }
  for (const u of rest) {
    const s = out.findIndex((v, i) => i >= 1 && v === null);
    if (s < 0) break;
    out[s] = u;
  }
  return out;
}

/** 바닥에서 보여 줄 것들의 세로 가운데(그림 높이 비율): 뒤 쳇바퀴 꼭대기 ~ 앞 쳇바퀴 발밑 */
export const FLOOR_MID = 0.61;
/** 집 그림을 화면 너비에 맞췄을 때의 높이와, 세로로 올리는 양(px, 0 이하).
 *  w·h = 세상 칸 크기, hud = 위를 덮는 HUD 높이, cover = 아래를 덮는 판 높이.
 *  그림이 보이는 칸보다 작으면 위에 붙인다(HUD 가 지붕을 덮어 그림의 30% 아래가 보인다 — 사용자가 고른 구도). 크면 바닥이 HUD 와 판 사이 가운데에 오게 올린다. */
export function homeCam(o: { w: number; h: number; hud: number; cover: number }): { imgH: number; top: number } {
  const imgH = (o.w * HOME_IMG.h) / HOME_IMG.w;
  const vis = Math.max(0, o.h - o.cover);
  if (imgH <= vis) return { imgH, top: 0 };
  const mid = (Math.min(o.hud, vis) + vis) / 2;
  const top = Math.max(vis - imgH, Math.min(0, mid - imgH * FLOOR_MID));
  return { imgH, top: Math.round(top) };
}

// ── 판을 접었는지 기억한다(다음 접속에도) ─────────────────────────────────
export const PANEL_KEY = 'fof.proto.panel.v1';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const store = (): Store | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
/** 마지막에 펴 두었는가. 적힌 것이 없으면 접힌 채(세상이 크게 보이고, 쳇바퀴를 바로 굴릴 수 있다). */
export function loadPanel(s: Store | null = store()): boolean {
  try { return s?.getItem(PANEL_KEY) === 'open'; } catch { return false; }
}
export function savePanel(open: boolean, s: Store | null = store()): void {
  try { s?.setItem(PANEL_KEY, open ? 'open' : 'closed'); } catch { /* 저장소 막힘: 이번 실행 동안만 기억한다 */ }
}

/** 끌기 판정: 손가락이 이만큼(px) 넘게 위·아래로 움직였으면 끌기, 아니면 탭 */
export const DRAG_PX = 14;
export function dragIntent(dy: number, open: boolean): 'open' | 'close' | 'toggle' {
  if (dy <= -DRAG_PX) return 'open';
  if (dy >= DRAG_PX) return 'close';
  return 'toggle';
}
export const afterDrag = (dy: number, open: boolean): boolean => { const k = dragIntent(dy, open); return k === 'toggle' ? !open : k === 'open'; };

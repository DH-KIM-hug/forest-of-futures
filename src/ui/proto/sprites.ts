// 집 화면 그림 한 곳(U-33·U-34): 이름 → 그림 파일. 새 그림이 오면 여기에 한 줄만 더한다.
// 줄이 없는 이름은 화면이 예전 SVG 그림(art.tsx)으로 그린다. 원본은 docs/art/v5/golden/, 여기 것은 웹용으로 줄인 사본(webp)이다.
import homeStump from './img/home_stump.webp';
import heroPhone from './img/hero_phone.webp';
import wheel from './img/wheel.webp';
import floorPatch from './img/floor_patch.webp';

export type SpriteId =
  | 'home' //      집 그림(바닥 전체). 집 단계별 그림이 생기면 HOME_BY_LEVEL 에
  | 'hero' //      주인공(폰을 보는 자세)
  | 'heroRun' //   주인공: 쳇바퀴를 굴리는 자세 [그림 대기]
  | 'heroNear' //  주인공: 청산 임박(폰만 본다) [그림 대기]
  | 'wheel' //     쳇바퀴(집 그림에서 오려 냄)
  | 'floorPatch' // 엄마의 쳇바퀴 자리를 옆 바닥으로 덮은 조각(그 위에 쳇바퀴 그림을 따로 얹는다)
  | 'hamster' //   알바 햄스터 [그림 대기 → SVG]
  | 'collector' // 오소리 추심원 [그림 대기 → SVG]
  | 'wallet' //    콜드월렛 기기 [그림 대기 → SVG]
  | 'boss' //      오소리 대부(컷인 반신) [그림 대기 → SVG]
  | 'weasel'; //   족제비 상인(컷인 반신) [그림 대기 → SVG]

/** src = 파일, w·h = 그림 비율(가로/세로를 재는 데만 쓴다) */
export interface Sprite { src: string; w: number; h: number }

export const SPRITES: Partial<Record<SpriteId, Sprite>> = {
  home: { src: homeStump, w: 992, h: 1586 },
  hero: { src: heroPhone, w: 166, h: 220 },
  wheel: { src: wheel, w: 160, h: 196 },
  floorPatch: { src: floorPatch, w: 270, h: 270 },
};
/** 집 단계(run.house)별 집 그림. 지금은 전부 나무 밑동 집 하나. */
export const HOME_BY_LEVEL: Sprite[] = [SPRITES.home!];

export const sprite = (id: SpriteId): Sprite | null => SPRITES[id] ?? null;
/** 그 이름의 그림이 없으면 대신 쓸 이름들을 차례로 본다(예: 굴리는 자세가 없으면 서 있는 자세) */
export const spriteOr = (...ids: SpriteId[]): Sprite | null => { for (const id of ids) { const s = SPRITES[id]; if (s) return s; } return null; };

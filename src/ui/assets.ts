// 그림 자산 목록(한 곳). 경로는 public/art/v2/<id>.webp. 파일이 없으면 화면이 CSS 모양 + 이름표로 대신한다.
// 개발용: ?art=legacy 이면 옛 부드러운 그림(public/art)을 있는 것만 빌려 쓴다(굵은 선 그림이 오기 전 배치 확인용).

export const ART_IDS = [
  'bld_bank', 'bld_capital', 'bld_board', 'bld_archive', 'bld_friends', 'bld_shark1', 'bld_shark2_locked', 'bld_shark2_open',
  'house_0_tent', 'house_1_cabin', 'house_2_warehouse', 'house_3_villa', 'house_4_mansion',
  'wheel_DTC', 'wheel_BTH', 'wheel_MDT', 'wheel_SMS',
  'hero_idle', 'hero_pick', 'hero_run', 'hero_joy', 'hero_sweat', 'hero_greed', 'hero_dazed',
  'npc_owl', 'npc_weasel', 'npc_badger', 'npc_viper', 'npc_squirrel', 'npc_raccoon', 'npc_rabbit', 'npc_fox', 'npc_bear',
  'bg_village',
] as const;
export type ArtId = (typeof ART_IDS)[number];

export const ART_BASE = '/art/v2/';
const LEGACY_BASE = '/art/';
/** 옛 그림 중 쓸 수 있는 것(없는 것은 CSS 모양으로 떨어진다). */
const LEGACY_MAP: Partial<Record<ArtId, string>> = {
  bld_bank: 'bld_bank', bld_capital: 'bld_capital', bld_board: 'bld_board', bld_archive: 'bld_archive', bld_friends: 'bld_friends',
  bld_shark1: 'bld_shark1', bld_shark2_locked: 'bld_shark2_locked', bld_shark2_open: 'bld_shark2_open',
  house_0_tent: 'house_0_tent', house_1_cabin: 'house_1_cabin', house_2_warehouse: 'house_2_warehouse', house_3_villa: 'house_3_villa', house_4_mansion: 'house_4_mansion',
  hero_idle: 'hero_idle', hero_pick: 'hero_work', hero_run: 'hero_work', hero_joy: 'hero_joy', hero_sweat: 'hero_sweat', hero_dazed: 'hero_dazed', hero_greed: 'hero_idle',
};

const legacy = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('art') === 'legacy';

export function artUrl(id: ArtId): string | null {
  if (!legacy) return `${ART_BASE}${id}.webp`;
  if (id === 'bg_village') return '/ui/bg_village.webp';
  const l = LEGACY_MAP[id];
  return l ? `${LEGACY_BASE}${l}.webp` : null;
}

/** 그림이 없을 때 쓰는 이름과 색. */
export const ART_FALLBACK: Record<ArtId, { label: string; color: string }> = {
  bld_bank: { label: '조합', color: '#cfd8c2' }, bld_capital: { label: '캐피탈', color: '#f4d98a' }, bld_board: { label: '전광판', color: '#d9b38c' },
  bld_archive: { label: '기록관', color: '#c8c3d6' }, bld_friends: { label: '친구네', color: '#f2c6b4' },
  bld_shark1: { label: '오소리', color: '#b9b2a6' }, bld_shark2_locked: { label: '골목', color: '#8a8f96' }, bld_shark2_open: { label: '독사', color: '#9db38a' },
  house_0_tent: { label: '텐트', color: '#e8dcc0' }, house_1_cabin: { label: '오두막', color: '#d9b98b' }, house_2_warehouse: { label: '창고', color: '#e0c48a' },
  house_3_villa: { label: '별장', color: '#f1e3c2' }, house_4_mansion: { label: '저택', color: '#f5cf5b' },
  wheel_DTC: { label: '도토코인', color: '#8B5E3C' }, wheel_BTH: { label: '밤더리움', color: '#7A5BB5' }, wheel_MDT: { label: '멍도토', color: '#E0B52E' }, wheel_SMS: { label: '삼솔전자', color: '#3F7CC4' },
  hero_idle: { label: '칩멍크', color: '#f2b36b' }, hero_pick: { label: '줍기', color: '#f2b36b' }, hero_run: { label: '달리기', color: '#f2b36b' },
  hero_joy: { label: '환희', color: '#f6c97f' }, hero_sweat: { label: '식은땀', color: '#e8b08a' }, hero_greed: { label: '탐욕', color: '#f0a05a' }, hero_dazed: { label: '멍', color: '#cdbba0' },
  npc_owl: { label: '부엉이', color: '#d9cdb0' }, npc_weasel: { label: '족제비', color: '#e8c58a' }, npc_badger: { label: '오소리', color: '#c0bab0' }, npc_viper: { label: '독사', color: '#a9c28f' },
  npc_squirrel: { label: '다람쥐', color: '#e8b98a' }, npc_raccoon: { label: '너구리', color: '#bdb6ae' }, npc_rabbit: { label: '토끼', color: '#f1e6e0' }, npc_fox: { label: '여우', color: '#f0a56a' }, npc_bear: { label: '곰', color: '#b88a62' },
  bg_village: { label: '', color: '#cfe8b4' },
};

export const HOUSE_ART: ArtId[] = ['house_0_tent', 'house_1_cabin', 'house_2_warehouse', 'house_3_villa', 'house_4_mansion'];
export const WHEEL_ART: Record<string, ArtId> = { DTC: 'wheel_DTC', BTH: 'wheel_BTH', MDT: 'wheel_MDT', SMS: 'wheel_SMS' };
export const NPC_ART: Record<string, ArtId> = {
  bank: 'npc_owl', capital: 'npc_weasel', shark1: 'npc_badger', shark2: 'npc_viper',
  squirrel: 'npc_squirrel', raccoon: 'npc_raccoon', rabbit: 'npc_rabbit', fox: 'npc_fox', bear: 'npc_bear',
};
export type HeroPose = 'idle' | 'pick' | 'run' | 'joy' | 'sweat' | 'greed' | 'dazed';
export const heroArt = (p: HeroPose): ArtId => `hero_${p}` as ArtId;

/** 마을 건물 자리(장면 대비 %). 배경 그림의 빈터에 맞춘 값. 배경이 바뀌면 여기만 고친다. */
export const COL = [17.5, 50.5, 83];
export const ROW = [34.5, 50, 65.5];

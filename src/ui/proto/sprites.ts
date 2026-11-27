// 집 화면 그림 한 곳(U-33·U-34): 이름 → 그림 파일. 새 그림이 오면 여기에 한 줄만 더한다.
// 줄이 없는 이름은 화면이 예전 SVG 그림(art.tsx)으로 그린다. 원본은 docs/art/v5/golden/, 여기 것은 웹용으로 줄인 사본(webp)이다.
import homeStump from './img/home_stump.webp';
import heroPhone from './img/hero_phone.webp';
import wheel from './img/wheel.webp';
import floorPatch from './img/floor_patch.webp';

// 회차 3 그림(U-40): docs/art/v5/raw/ → img/v5/*.webp (docs/art/v5/mkweb_art.py)
import bCollector from './img/v5/b_collector.webp';
import bBoss from './img/v5/b_boss.webp';
import bWeasel from './img/v5/b_weasel.webp';
import bRaccoon from './img/v5/b_raccoon.webp';
import bOwl from './img/v5/b_owl.webp';
import bSnake from './img/v5/b_snake.webp';
import cCollector from './img/v5/c_collector.webp';
import cBoss from './img/v5/c_boss.webp';
import cWeasel from './img/v5/c_weasel.webp';
import cRaccoon from './img/v5/c_raccoon.webp';
import cOwl from './img/v5/c_owl.webp';
import cSnake from './img/v5/c_snake.webp';
import cHamsterWheel from './img/v5/c_hamster_wheel.webp';
import cHeroWheel from './img/v5/c_hero_wheel.webp';
import cHeroEmpty from './img/v5/c_hero_empty.webp';
import cHeroWalk from './img/v5/c_hero_walk.webp';
import cHeroSad from './img/v5/c_hero_sad.webp';
import cHeroHappy from './img/v5/c_hero_happy.webp';
import hQuit from './img/v5/h_quit.webp';
import iWallet from './img/v5/i_wallet.webp';
import iGoldcoin from './img/v5/i_goldcoin.webp';
import pOffice from './img/v5/p_office.webp';
import pCapital from './img/v5/p_capital.webp';
import pBank from './img/v5/p_bank.webp';
import pAlley from './img/v5/p_alley.webp';
import mVillage from './img/v5/m_village.webp';
import sPrologue from './img/v5/s_prologue.webp';
import eBankrupt from './img/v5/e_bankrupt.webp';
import eRetire from './img/v5/e_retire.webp';
// 회차 4 그림(U-41): docs/art/v5/mkweb_art4.py
import iWheelEmpty from './img/v5/i_wheel_empty.webp';
import cHeroWalkEmpty from './img/v5/c_hero_walk_empty.webp';
import cHeroFrozen from './img/v5/c_hero_frozen.webp';
import eRetire1 from './img/v5/e_retire1.webp';
import eRetire2 from './img/v5/e_retire2.webp';
import eRetire3 from './img/v5/e_retire3.webp';
import eRetire4 from './img/v5/e_retire4.webp';
import mVillage2 from './img/v5/m_village2.webp';
// 회차 5b 그림(U-43): docs/art/v5/mkweb_art5.py — 채굴기, 걷는 주인공(뒤 · 앞), 쳇바퀴 두 겹(쳇바퀴 / 달리는 이), 채굴기의 잎 날개
import iMiner from './img/v5/i_miner.webp';
import iMinerFan1 from './img/v5/i_miner_fan1.webp';
import iMinerFan2 from './img/v5/i_miner_fan2.webp';
import cHeroWalkBack from './img/v5/c_hero_walk_back.webp';
import cHeroWalkFront from './img/v5/c_hero_walk_front.webp';
// 걷기 둘째 걸음(U-46: 반대 발, mkweb_art6.py 가 첫 걸음과 같은 판 · 같은 크기로 맞춘다)
import cHeroWalkBackB from './img/v5/c_hero_walk_back_b.webp';
import cHeroWalkFrontB from './img/v5/c_hero_walk_front_b.webp';
import cHeroWalkEmptyB from './img/v5/c_hero_walk_empty_b.webp';
// 쳇바퀴 두 겹(U-47): 앞이 뚫린 비스듬한 쳇바퀴 하나를 주인공과 알바가 같이 쓰고, 안에서 옆모습으로 달리는 이는 칸을 가로로 이은 띠 그림이다
import openDrum from './img/v5/wheel_open_drum.webp';
import heroRunStrip from './img/v5/hero_run_strip.webp';
import hamsterRunStrip from './img/v5/hamster_run_strip.webp';

export type SpriteId =
  | 'home' //      집 그림(바닥 전체). 집 단계별 그림이 생기면 HOME_BY_LEVEL 에
  | 'hero' //      주인공(폰을 보는 자세)
  | 'heroEmpty' // 주인공: 빈손(폰을 받기 전)
  | 'heroWalk' //  주인공: 걷는다(프롤로그 · 잃는 중에 서성일 때)
  | 'heroSad' //   주인공: 주저앉았다(청산 직후)
  | 'heroHappy' // 주인공: 폰을 치켜들었다(크게 따는 중)
  | 'heroWheel' // 주인공이 쳇바퀴 안에서 굴린다(쳇바퀴까지 한 장)
  | 'hamsterWheel' // 알바 햄스터가 도는 쳇바퀴(쳇바퀴까지 한 장)
  | 'hamsterQuit' // 봇짐을 메고 나가는 알바 햄스터
  | 'heroRun' //   (옛 이름) 굴리는 자세 [heroWheel 로 대체]
  | 'heroNear' //  주인공: 청산 임박(폰만 본다) [그림 대기 → hero]
  | 'wheel' //     쳇바퀴(집 그림에서 오려 냄). 알바 없는 빈 쳇바퀴에 쓴다
  | 'floorPatch' // 엄마의 쳇바퀴 자리를 옆 바닥으로 덮은 조각(그 위에 쳇바퀴 그림을 따로 얹는다)
  | 'collector' | 'boss' | 'weasel' | 'raccoon' | 'owl' | 'viper' //       컷인 반신
  | 'cCollector' | 'cBoss' | 'cWeasel' | 'cRaccoon' | 'cOwl' | 'cViper' // 전신(집 · 지도의 가게)
  | 'wallet' //    콜드월렛 기기
  | 'goldcoin' //  황금 실물 도토코인(거래의 나무)
  | 'pOffice' | 'pCapital' | 'pBank' | 'pAlley' // 가게 안(지도에서 들렀을 때)
  | 'village' //   지도 바탕
  | 'prologue' //  프롤로그: 해 질 녘의 나무 밑동 집
  | 'endBankrupt' | 'endRetire' // 엔딩 사진
  | 'wheelEmpty' //   알바도 주인공도 없는 빈 쳇바퀴(새 그림체, U-41)
  | 'heroWalkEmpty' // 주인공: 빈손으로 걷는다(프롤로그)
  | 'heroFrozen' //   주인공: 굳었다(청산이 흔들리는 폭 안 · 청산 임박)
  | 'endRetire1' | 'endRetire2' | 'endRetire3' | 'endRetire4' // 은퇴 엔딩 넷의 사진(END-R01~R04)
  | 'miner' | 'minerFan1' | 'minerFan2' // 채굴기(쳇바퀴의 전기로 코인을 캔다)와 그 잎 날개 둘(돌린다)
  | 'heroWalkBackB' | 'heroWalkFrontB' | 'heroWalkEmptyB' // 걷기 둘째 걸음(U-46)
  | 'heroWalkBack' | 'heroWalkFront' //   주인공: 멀어지며 걷는다(등) · 다가오며 걷는다(앞). 빈손
  | 'hamsterDrum' | 'hamsterRunner' | 'heroDrum' | 'heroRunner' // 쳇바퀴 두 겹: 앞이 뚫린 쳇바퀴 / 옆모습으로 달리는 이의 띠 그림(한 칸이 쳇바퀴와 같은 크기)
  | 'village2'; //    지도 바탕: 빈터 다섯(조합 · 사무소 · 캐피탈 · 집 · 뒷골목)이 떨어져 있어 누를 수 있다

/** src = 파일, w·h = 그림 비율(가로/세로를 재는 데만 쓴다). n = 띠 그림의 칸 수(w·h 는 한 칸) */
export interface Sprite { src: string; w: number; h: number; n?: number }

export const SPRITES: Partial<Record<SpriteId, Sprite>> = {
  home: { src: homeStump, w: 992, h: 1586 },
  hero: { src: heroPhone, w: 166, h: 220 },
  wheel: { src: wheel, w: 160, h: 196 },
  floorPatch: { src: floorPatch, w: 270, h: 270 },
  collector: { src: bCollector, w: 433, h: 420 },
  boss: { src: bBoss, w: 396, h: 420 },
  weasel: { src: bWeasel, w: 254, h: 420 },
  raccoon: { src: bRaccoon, w: 403, h: 420 },
  owl: { src: bOwl, w: 361, h: 420 },
  viper: { src: bSnake, w: 387, h: 420 },
  cCollector: { src: cCollector, w: 269, h: 300 },
  cBoss: { src: cBoss, w: 267, h: 300 },
  cWeasel: { src: cWeasel, w: 160, h: 300 },
  cRaccoon: { src: cRaccoon, w: 249, h: 300 },
  cOwl: { src: cOwl, w: 227, h: 300 },
  cViper: { src: cSnake, w: 223, h: 300 },
  hamsterWheel: { src: cHamsterWheel, w: 264, h: 300 },
  heroWheel: { src: cHeroWheel, w: 271, h: 300 },
  heroEmpty: { src: cHeroEmpty, w: 226, h: 300 },
  heroWalk: { src: cHeroWalk, w: 233, h: 300 },
  heroSad: { src: cHeroSad, w: 233, h: 300 },
  heroHappy: { src: cHeroHappy, w: 270, h: 300 },
  hamsterQuit: { src: hQuit, w: 328, h: 300 },
  wallet: { src: iWallet, w: 193, h: 220 },
  goldcoin: { src: iGoldcoin, w: 211, h: 220 },
  pOffice: { src: pOffice, w: 780, h: 1386 },
  pCapital: { src: pCapital, w: 780, h: 1247 },
  pBank: { src: pBank, w: 780, h: 1386 },
  pAlley: { src: pAlley, w: 780, h: 1247 },
  village: { src: mVillage, w: 780, h: 1386 },
  prologue: { src: sPrologue, w: 780, h: 1386 },
  endBankrupt: { src: eBankrupt, w: 640, h: 640 },
  endRetire: { src: eRetire, w: 640, h: 640 },
  wheelEmpty: { src: iWheelEmpty, w: 238, h: 300 },
  heroWalkEmpty: { src: cHeroWalkEmpty, w: 243, h: 300 },
  heroFrozen: { src: cHeroFrozen, w: 216, h: 300 },
  endRetire1: { src: eRetire1, w: 640, h: 640 },
  endRetire2: { src: eRetire2, w: 640, h: 640 },
  endRetire3: { src: eRetire3, w: 640, h: 640 },
  endRetire4: { src: eRetire4, w: 640, h: 640 },
  village2: { src: mVillage2, w: 780, h: 1385 },
  miner: { src: iMiner, w: 261, h: 300 },
  minerFan1: { src: iMinerFan1, w: 40, h: 40 },
  minerFan2: { src: iMinerFan2, w: 40, h: 40 },
  heroWalkBack: { src: cHeroWalkBack, w: 198, h: 300 },
  heroWalkFront: { src: cHeroWalkFront, w: 229, h: 300 },
  heroWalkBackB: { src: cHeroWalkBackB, w: 198, h: 300 },
  heroWalkFrontB: { src: cHeroWalkFrontB, w: 229, h: 300 },
  heroWalkEmptyB: { src: cHeroWalkEmptyB, w: 243, h: 300 },
  hamsterDrum: { src: openDrum, w: 526, h: 600 },
  hamsterRunner: { src: hamsterRunStrip, w: 526, h: 600, n: 4 },
  heroDrum: { src: openDrum, w: 526, h: 600 },
  heroRunner: { src: heroRunStrip, w: 526, h: 600, n: 12 },
};
/** 컷인에 나오는 사람 → 반신 그림 */
export const BUST_OF: Partial<Record<string, SpriteId>> = { collector: 'collector', boss: 'boss', weasel: 'weasel', raccoon: 'raccoon', owl: 'owl', viper: 'viper' };
/** 지도의 가게(엔진 채권처 id) → 가게 안 그림과 거기 서 있는 사람 */
export const PLACE_ART: Record<string, { scene: SpriteId; npc: SpriteId }> = {
  shark1: { scene: 'pOffice', npc: 'cBoss' },
  capital: { scene: 'pCapital', npc: 'cRaccoon' },
  bank: { scene: 'pBank', npc: 'cOwl' },
  shark2: { scene: 'pAlley', npc: 'cViper' },
};
/** 집 단계(run.house)별 집 그림. 지금은 전부 나무 밑동 집 하나. */
export const HOME_BY_LEVEL: Sprite[] = [SPRITES.home!];

export const sprite = (id: SpriteId): Sprite | null => SPRITES[id] ?? null;
/** 그 이름의 그림이 없으면 대신 쓸 이름들을 차례로 본다(예: 굴리는 자세가 없으면 서 있는 자세) */
export const spriteOr = (...ids: SpriteId[]): Sprite | null => { for (const id of ids) { const s = SPRITES[id]; if (s) return s; } return null; };

/** 은퇴 엔딩(END-R01~R04)마다 사진 한 장(U-41). 없는 엔딩은 예전 사진(endRetire) */
export const RETIRE_PHOTO: Record<string, SpriteId> = { 'END-R01': 'endRetire1', 'END-R02': 'endRetire2', 'END-R03': 'endRetire3', 'END-R04': 'endRetire4' };
/** 지도 그림(village2) 위의 빈터: 그림 너비 · 높이에 대한 비율. home = 내 집(집 탭으로), 나머지는 엔진 채권처 id */
export const MAP_SPOTS: Record<string, { x: number; y: number }> = {
  bank: { x: 0.47, y: 0.215 }, shark1: { x: 0.44, y: 0.455 }, capital: { x: 0.82, y: 0.575 }, home: { x: 0.19, y: 0.755 }, shark2: { x: 0.885, y: 0.105 },
};

// ── 눈 감은 그림(U-43): 눈 뜬 그림 위에 겹쳐 잠깐 보인다(눈 둘레만 든 그림이라 바꿔 껴도 테두리가 안 떤다). 파일이 있는 것만 깜빡인다 ──
const BLINK_FILES = import.meta.glob('./img/v5/blink_*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const BLINK_STEM: Partial<Record<SpriteId, string>> = { hero: 'hero_phone', heroEmpty: 'c_hero_empty', cCollector: 'c_collector', cWeasel: 'c_weasel', cRaccoon: 'c_raccoon', cOwl: 'c_owl' };
/** 그 그림의 눈 감은 겹(없으면 null) */
export const blinkOf = (id: SpriteId): string | null => { const st = BLINK_STEM[id]; return st ? BLINK_FILES[`./img/v5/blink_${st}.webp`] ?? null : null; };

/** 걷기 두 걸음(U-46 사용자: "걷는 거 또 한 발로 걷네…"): 첫 걸음 그림 → 반대 발 그림. 둘째 걸음이 없는 그림은 null(폰을 든 옆걸음) */
export const WALK_PAIR: Partial<Record<SpriteId, SpriteId>> = { heroWalkBack: 'heroWalkBackB', heroWalkFront: 'heroWalkFrontB', heroWalkEmpty: 'heroWalkEmptyB' };
/** 걸음 빠르기: 초당 걸음 수(5~6). 한 걸음에 미끄러지는 거리 = 키의 STRIDE 배 — 거리에 맞춰 걸음 수를 정해 발이 미끄러지지 않게 한다 */
export const STEPS_PER_SEC = 5.5;
export const STRIDE = 0.3;
/** 글라이드(거리 dist, 키 h, 걸리는 초 dur)에 맞는 한 쌍(두 걸음)의 길이(초). 걸음 수는 거리 ÷ 보폭을 반올림(적어도 2), 빠르기는 4~7 걸음/초 안 */
export function walkPeriod(dist: number, h: number, dur: number): number {
  const steps = Math.max(2, Math.round(dist / Math.max(1, h * STRIDE)));
  const rate = Math.min(7, Math.max(4, steps / Math.max(0.1, dur)));
  return 2 / rate;
}

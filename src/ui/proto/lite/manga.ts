// 라이트 모드의 만화(docs/gdd/LITE_CONTI.md 가 원본, docs/gdd/LITE_MANGA.md 가 구현 기록). 그림은 sprite-gen codex 컬러 만화 컷(말풍선은 비어 있다),
// 글은 화면이 풍선 자리에 얹는다. 자리는 그림 폭과 높이에 대한 % (x, y = 왼쪽 위, w, h = 크기). 그림: ui/proto/img/manga/*.webp (원본 docs/art/v5/manga).
// `{ }` 자리의 숫자는 엔진 값이다(첫 대출, 이자, 청산 폭, 파산 때의 빚과 잔액).
import { lenderById } from '../../../engine/data';
import { LITE } from '../../../engine/lite';
import m2 from '../img/manga/m2.webp';
import pg1 from '../img/manga/parody_1.webp';
import pg2 from '../img/manga/parody_2.webp';
import pg3 from '../img/manga/parody_3.webp';
import pg4 from '../img/manga/parody_4.webp';
import pg5 from '../img/manga/parody_5.webp';
import pg6 from '../img/manga/parody_6.webp';
import pg7 from '../img/manga/parody_7.webp';
import tBoss from '../img/manga/t_boss.webp';
import tSilent from '../img/manga/t_silent.webp';
import tGrab from '../img/manga/t_grab.webp';
import tRaccoon from '../img/manga/t_raccoon.webp';
import tViper from '../img/manga/t_viper.webp';

/** say = 말풍선, shout = 뾰족 풍선, think = 생각 풍선, cap = 그림의 해설 상자, tag = 화면이 그리는 작은 흰 상자(장부 아래 글씨 등) */
export interface Balloon { x: number; y: number; w: number; h: number; text: string; /** 글자 크기(그림 폭의 %) */ fs?: number; kind?: 'say' | 'shout' | 'think' | 'cap' | 'tag' }
export interface Sfx { x: number; y: number; text: string; rot?: number; fs?: number }
/**
 * 프롤로그 쪽(패러디)과 파산 표제지에 얹는 글. 자리는 그림의 % (x, y = 왼쪽 위, w, h = 크기), fs 는 그림 폭의 %.
 * say = 빈 풍선 안 대사, out = 흰 테 두른 검은 큰 글, white = 검은 테 흰 글, sfx = 굵은 효과음, hand = 공책 손글씨,
 * box = 그림의 빈 상자 안 글, tag = 화면이 그리는 흰 상자, hollow = 속이 빈 큰 효과음, ghost = 바탕의 흐린 큰 글,
 * wave = 세로로 늘어지는 물결 선(스~~윽의 ~), logo = 표제 로고(text = 부제)
 */
export interface Word {
  x: number; y: number; w: number; h: number; t: string; k: 'say' | 'out' | 'white' | 'sfx' | 'hand' | 'box' | 'tag' | 'hollow' | 'ghost' | 'wave' | 'logo';
  fs: number; rot?: number; /** 세로쓰기 */ v?: boolean; /** 글자 색 */ c?: string; /** 덧붙는 모양: red(빨간 글), ink(검은 테 흰 글), beat(박동), drip(흘러내림) */ cls?: string; /** 나타나는 때(초) */ d?: number;
}
/** card = 그림 없는 흰 칸에 손글씨 한 줄, words = 쪽 위의 글, ar = 그림의 가로/세로(없으면 3:2) */
export interface Twist { beat: string; stamp: string; lines: string[] }
/** twist = 넘길 때 먼저 뜨는 반전 카드 */
export interface Panel { id: string; src?: string; alt: string; balloons: Balloon[]; sfx?: Sfx[]; card?: string; words?: Word[]; ar?: number; twist?: Twist }

const won = (x: number): string => (x >= 10000 && x % 10000 === 0 ? `${x / 10000}만` : Math.round(x).toLocaleString('ko-KR'));
const n = (x: number): string => Math.round(x).toLocaleString('ko-KR');

// ── 절망의 표제지(프롤로그 7쪽, 장면 D 파산): 세로 기도 글, 해설 두 칸, 하아 넷, 표제 로고 ──
export const PAGE7_AR = 1024 / 1536;
export function despairPanel(o: { sub: string; nar?: [string, string]; fresh?: boolean }): Panel {
  // 세로 한 쪽(2:3). 폰에서 자르지도 훑지도 않고 한 화면에 다 보인다
  const nar = ['왜\n끝나기\n전엔', '끝인 줄\n모를까'];
  const broke = !!o.nar;
  // 파산이면 진짜 숫자 두 줄을 읽히는 크기의 상자로(해설 칸은 그대로 두고, 폰 불빛 아래 책상 위에)
  const facts: Word[] = (o.nar ?? []).map((t, i) => ({ x: 40, y: 75.6 + i * 5.8, w: 58, h: 5.3, t, k: 'tag', fs: t.length > 22 ? 2.7 : 3.4, d: 2.6 + i * 0.3 }));
  return {
    id: 'x', src: pg7, ar: PAGE7_AR, alt: '밤의 나무 밑동 집, 어두운 나무 벽. 책상 위 폰 불빛 하나가 아래에서 비추고, 다로미가 두 손으로 머리를 감싸 쥐고 눈물을 줄줄 흘리며 이를 악문다.',
    balloons: [],
    words: [
      { x: 2, y: 2, w: 33, h: 16, t: '시간을\n되돌려\n주세요', k: 'white', fs: 7, d: 0.2 },
      { x: 14.5, y: 20.5, w: 13, h: 12, t: '하아', k: 'say', cls: 'red', fs: 4, d: 0.5 },
      { x: 5.5, y: 41, w: 10.5, h: 9.5, t: '하아', k: 'say', cls: 'red', fs: 3.6, d: 0.7 },
      { x: 86, y: 2, w: 12, h: 22, t: '딱 한 번만', k: 'white', v: true, fs: 5, d: 0.9 },
      { x: 79.5, y: 27, w: 12, h: 12, t: '하아', k: 'say', cls: 'red', fs: 4, d: 1.1 },
      { x: 86, y: 48, w: 9.5, h: 10.5, t: '하아', k: 'say', cls: 'red', fs: 3.6, d: 1.3 },
      { x: 13, y: 73.6, w: 25, h: 9.6, t: nar[0], k: 'tag', fs: 3.2, d: 1.6 },
      { x: 3, y: 83, w: 25, h: 15.5, t: nar[1], k: 'tag', fs: 3.2, d: 2 },
      broke ? { x: 40, y: 89, w: 58, h: 10.5, t: o.sub, k: 'logo', fs: 7, d: 2.3 } : { x: 38, y: 80.5, w: 60, h: 18, t: o.sub, k: 'logo', fs: 11, d: 2.3 },
      ...facts,
    ],
  };
}

/** 오소리 사무소의 첫 대출(엔진 값): 빌리는 돈, 정산마다 붙는 이자 */
function firstLoan(): { unit: number; per: number } {
  const l = lenderById.shark1;
  const unit = l.borrowUnit ?? 100_000;
  return { unit, per: Math.ceil(unit * l.rate - 1e-9) };
}
/** 코인 빚(엔진 값): 원금과 정산마다 이자 */
function coinDebt(): { left: number; per: number } {
  const left = LITE.start.debts.shark1 ?? 0;
  return { left, per: Math.ceil(left * (LITE.start.rateCap.shark1 ?? lenderById.shark1.rate) - 1e-9) };
}

/** 대부의 유혹 세 컷(컷 5~7) */
function temptBoss(unit: number, per: number): Panel[] {
  return [
    {
      id: 't1', src: tBoss, alt: '오소리 대부가 바싹 다가와 빨대로 음료를 홀짝이며 달콤하게 웃는다. 뒤는 어둡고 세로로 긁힌 선.',
      balloons: [
        { x: 4, y: 10, w: 20, h: 24, text: `나한테 ${won(unit)} 빌려서`, kind: 'say', fs: 2.7 },
        { x: 3, y: 47, w: 17, h: 22, text: '그 돈으로 사는 거야.', kind: 'say', fs: 2.6 },
      ],
      sfx: [{ x: 58, y: 56, text: 'ㅅ…!?', rot: -12, fs: 11 }, { x: 72, y: 80, text: '~~~', rot: 22, fs: 8 }],
    },
    {
      id: 't2', src: tSilent, alt: '왼쪽은 곁눈질하며 땀 흘리는 다로미, 오른쪽은 빨대를 문 오소리 대부. 둘 다 말이 없다.',
      balloons: [
        { x: 9, y: 6, w: 32, h: 21, text: '……무슨 소리예요, 빌릴 리가 없잖아요…', kind: 'say', fs: 2.4 },
        { x: 60, y: 6, w: 28, h: 20, text: '……그래…?', kind: 'say', fs: 3.4 },
      ],
    },
    {
      id: 't3', src: tGrab, alt: '눈이 금화가 된 다로미가 이미 돈 봉투와 계약서를 껴안았다. 뒤에서 오소리 대부의 미소가 귀까지 찢어진다.',
      balloons: [
        { x: 7, y: 7, w: 22, h: 18, text: '…얼마까지 돼요?', kind: 'shout', fs: 3.2 },
        { x: 33, y: 88, w: 42, h: 8.5, text: `빌린 돈 +${n(unit)} / 정산마다 이자 +${n(per)}`, kind: 'tag', fs: 2 },
      ],
      sfx: [{ x: 76, y: 3, text: '쭈욱~', rot: 8, fs: 3.6 }],
    },
  ];
}

/**
 * 도입 만화(1부): 원작 FX 개그 만화 일곱 쪽의 패러디. 6 → 1 → 2 → 7 → 5 → 4 → 3 순서로 한 쪽씩 넘긴다.
 * 그림은 원본 쪽의 구도 그대로 다로미와 오소리 대부로 다시 그렸다(docs/art/v5/manga/parody_N.png, 말풍선은 비어 있다).
 * 숫자는 엔진 값: 코인 빚 30만(LITE.start), 첫 대출과 그 이자(오소리 사무소), 시작 잔액(첫 대출), 빚 전부.
 */
export function prologuePages(): Panel[] {
  const d = coinDebt(), f = firstLoan();
  const lost = -Math.round(d.left * 0.9727 / 100) * 100; // 빌린 30만이 거의 다 녹은 평가손익
  return [
    {
      id: 'p6', src: pg6, ar: 1046 / 1503, alt: '컬러 세 칸. 초록빛 모니터에 파란 봉이 떨어진다. 어두운 파란 방, 모니터 앞에 웅크린 다로미의 뒷모습. 분홍빛으로 번쩍이는 칸.',
      balloons: [],
      words: [
        { x: 30, y: 1.2, w: 40, h: 2.6, t: 'FRX Fighter DAROMI', k: 'white', fs: 2, d: 0 },
        { x: 0.6, y: 6, w: 8.6, h: 90, t: '어리바리 다람쥐의 조금 위험한 선물 이야기', k: 'white', v: true, fs: 3.6, c: '#FFE27A', d: 0 },
        { x: 70, y: 8.5, w: 18.8, h: 21, t: '어느 날', k: 'box', fs: 5, d: 0.2 },
        { x: 25.3, y: 13, w: 3.9, h: 3.6, t: '딸깍', k: 'say', fs: 1.25, d: 0.5 },
        { x: 21, y: 19, w: 8.6, h: 11.4, t: '힉', k: 'say', v: true, c: '#E8731A', fs: 6, d: 0.65 },
        { x: 63.1, y: 7, w: 3.8, h: 3.6, t: '딸깍', k: 'say', fs: 1.25, d: 0.8 },
        { x: 54.6, y: 15, w: 7, h: 11.4, t: '힉', k: 'say', v: true, c: '#E8731A', fs: 6, d: 0.95 },
        { x: 39.7, y: 28.4, w: 3.3, h: 3.4, t: '딸깍', k: 'say', fs: 1.25, d: 1.1 },
        { x: 24, y: 40, w: 7, h: 7, t: '힉', k: 'say', v: true, c: '#E8731A', fs: 5, d: 1.3 },
        { x: 59.4, y: 32.4, w: 7.4, h: 7.6, t: '힉', k: 'say', v: true, c: '#E8731A', fs: 5, d: 1.4 },
        { x: 62, y: 41, w: 3.5, h: 3.4, t: '딸깍', k: 'say', fs: 1.25, d: 1.5 },
        { x: 70.5, y: 35, w: 15.8, h: 18.5, t: '신이시여…\n제발', k: 'say', fs: 3.2, d: 1.7 },
        { x: 12.5, y: 47, w: 15.3, h: 15, t: '이 돈은\n안 돼요…', k: 'say', fs: 2.7, d: 2 },
        { x: 33.5, y: 56.7, w: 3.6, h: 3.4, t: '딸깍', k: 'say', fs: 1.25, d: 2.1 },
        { x: 66, y: 60, w: 3.6, h: 3.4, t: '딸깍', k: 'say', fs: 1.25, d: 2.2 },
        { x: 11, y: 67, w: 22, h: 25, t: '절대로\n날리지\n않을\n거예요\n……!', k: 'out', fs: 5.6, d: 2.5 },
        { x: 34, y: 70.5, w: 37, h: 5, t: '평가손익', k: 'out', fs: 3.6, d: 2.8 },
        { x: 32, y: 76.5, w: 41, h: 6, t: `${n(lost)} 도토리`, k: 'out', fs: 4.6, c: '#C0182A', d: 3 },
        { x: 73, y: 74, w: 20, h: 8, t: '이 돈은', k: 'out', fs: 6, d: 3.3 },
        { x: 20, y: 94.2, w: 60, h: 4.6, t: '[ 선물의 숲 ]', k: 'ghost', fs: 6.4, d: 0 },
      ],
    },
    {
      id: 'p1', src: pg1, ar: 1239 / 1269, alt: '왼쪽은 하얗게 질린 다로미의 얼굴과 땀방울. 오른쪽은 마지막 검은 봉이 눈금을 뚫고 길게 내리꽂히는 봉 차트.',
      balloons: [],
      words: [
        { x: 89.4, y: 13, w: 8.4, h: 4, t: '100.3', k: 'box', fs: 2.2, d: 0 },
        { x: 89.4, y: 50.6, w: 8.4, h: 4, t: '100.2', k: 'box', fs: 2.2, d: 0 },
        { x: 89.4, y: 88, w: 8.4, h: 4, t: '100.1', k: 'box', fs: 2.2, d: 0 },
        { x: 77, y: 26, w: 11, h: 8, t: '스', k: 'out', fs: 9, d: 0.3 },
        { x: 78.5, y: 34, w: 8, h: 44, t: '', k: 'wave', fs: 1, d: 0.5 },
        { x: 77, y: 78, w: 11, h: 8, t: '윽', k: 'out', fs: 8, d: 0.9 },
        { x: 51, y: 76, w: 19, h: 6, t: '멈칫…', k: 'out', fs: 5, d: 1.4 },
        { x: 54, y: 85, w: 34, h: 12, t: '??', k: 'out', fs: 14, d: 1.9 },
      ],
    },
    {
      id: 'p2', src: pg2, ar: 1289 / 1221, alt: '다로미가 눈물을 줄줄 흘리며 도토리 지폐 몇 장을 쥐고 떤다. 왼쪽 칸에는 가라앉는 봉 차트와 집중선.',
      balloons: [],
      words: [
        { x: 1, y: 2, w: 13, h: 12, t: `${won(d.left)}이나\n있으면…`, k: 'say', fs: 2.4, d: 0 },
        { x: 76, y: 0.5, w: 13.5, h: 9.5, t: '다 갚고도\n남는데…', k: 'say', fs: 2.3, d: 0.1 },
        { x: 56, y: 1, w: 15, h: 26, t: '쿵덕', k: 'sfx', v: true, fs: 9, cls: 'beat', d: 0.3 },
        { x: 26, y: 33, w: 25, h: 26, t: '진다는 건\n있을 수\n없어…!', k: 'say', fs: 4.2, d: 0.6 },
        { x: 78, y: 27, w: 14, h: 27, t: '쿵덕', k: 'sfx', v: true, fs: 10, cls: 'beat', d: 0.8 },
        { x: 0, y: 19, w: 22, h: 34, t: '쿵덕', k: 'sfx', v: true, fs: 13, cls: 'beat', d: 1 },
        { x: 13, y: 57, w: 24, h: 40, t: '쿵덕!!', k: 'sfx', v: true, fs: 12, cls: 'beat', d: 1.2 },
        { x: 54, y: 33.5, w: 10, h: 5, t: '으흑', k: 'out', fs: 3.6, rot: -8, d: 1.5 },
        { x: 37, y: 68, w: 6, h: 16, t: '주륵 주륵', k: 'out', v: true, fs: 3, rot: 10, d: 1.7 },
        { x: 89.5, y: 58, w: 6, h: 16, t: '주륵 주륵', k: 'out', v: true, fs: 3, rot: -10, d: 1.8 },
        { x: 29, y: 84, w: 12, h: 5, t: '부들…', k: 'out', fs: 3, rot: -6, d: 2 },
        { x: 81, y: 75, w: 12, h: 5, t: '부들…', k: 'out', fs: 3, rot: 6, d: 2.1 },
      ],
    },
    despairPanel({ sub: '제1화 기도', fresh: true }),
    {
      id: 'p5', src: pg5, ar: 1034 / 1497, alt: '오소리 대부가 빨대 컵을 들고 바짝 다가와 달콤하게 웃는다. 아래 두 칸: 웃는 대부, 곁눈질하며 땀 흘리는 다로미.',
      twist: { beat: '그리고…', stamp: '빌렸다.', lines: [`빌린 돈 +${n(f.unit)}`, `정산마다 이자 +${n(f.per)}`] },
      balloons: [],
      words: [
        { x: 1, y: 1, w: 21, h: 17, t: 'ㅅ', k: 'sfx', fs: 22, rot: -8, d: 0.2 },
        { x: 2, y: 18, w: 15, h: 15, t: '!?', k: 'sfx', fs: 13, rot: 82, d: 0.35 },
        { x: 69, y: 10, w: 26, h: 20, t: `나한테\n${won(f.unit)} 더\n빌려서`, k: 'say', fs: 5.4, d: 0.6 },
        { x: 2, y: 38, w: 25, h: 19, t: '그 돈으로\n사는 거야', k: 'say', fs: 4.8, d: 1 },
        { x: 58, y: 36, w: 16, h: 10, t: '~', k: 'sfx', fs: 13, rot: -40, cls: 'drip', d: 1.3 },
        { x: 52, y: 47, w: 14, h: 9, t: '~', k: 'sfx', fs: 11, rot: -40, cls: 'drip', d: 1.4 },
        { x: 45, y: 56.5, w: 12, h: 8, t: '~', k: 'sfx', fs: 9, rot: -36, cls: 'drip', d: 1.5 },
        { x: 37, y: 62.5, w: 10, h: 7, t: '~', k: 'sfx', fs: 7, rot: -30, cls: 'drip', d: 1.6 },
        { x: 29, y: 67, w: 9, h: 6, t: '~', k: 'sfx', fs: 6, rot: -26, cls: 'drip', d: 1.7 },
        { x: 34.5, y: 66.5, w: 4.5, h: 12, t: '……', k: 'white', v: true, fs: 3.6, d: 2 },
        { x: 91, y: 66.5, w: 4.5, h: 12, t: '……', k: 'white', v: true, fs: 3.6, d: 2.1 },
        { x: 45, y: 84.5, w: 12, h: 10, t: '무슨 소리야\n빌릴 리가\n없잖아…', k: 'say', fs: 2.3, d: 2.4 },
        { x: 1.5, y: 88, w: 10.5, h: 9, t: '그래…?', k: 'say', fs: 2.6, d: 2.9 },
      ],
    },
    {
      id: 'p4', src: pg4, ar: 1005 / 1341, alt: '줄 공책의 손그림: 1배는 크게 올라야, 200배는 조금만 올라도 같은 이익. 진지한 다로미. 숲 마을 풍경, 도토리 버거 쟁반과 도토리 간판.',
      balloons: [],
      words: [
        { x: 16, y: 4.6, w: 15, h: 4.6, t: '1배로 산다', k: 'hand', fs: 3.4, d: 0.2 },
        { x: 13, y: 11.6, w: 21, h: 3.4, t: '10% 올라야', k: 'hand', fs: 3.4, d: 0.35 },
        { x: 46.5, y: 3.2, w: 8, h: 3, t: '110', k: 'hand', fs: 3.2, d: 0.45 },
        { x: 47.5, y: 11.5, w: 9, h: 4, t: '+10', k: 'hand', fs: 3.2, d: 0.55 },
        { x: 47, y: 21.4, w: 8, h: 3, t: '100', k: 'hand', fs: 3.2, d: 0.6 },
        { x: 56, y: 0.8, w: 19, h: 10, t: '판돈을\n늘려서', k: 'out', fs: 5.6, d: 0.8 },
        { x: 29.5, y: 26.2, w: 23, h: 3.8, t: '같은 이익!!', k: 'hand', fs: 3.6, d: 1 },
        { x: 0.8, y: 12, w: 14, h: 32, t: '작은\n움직임에도\n이익을\n낼 수\n있게\n조정하는\n수밖에\n……!', k: 'out', fs: 2.9, d: 1.3 },
        { x: 19.5, y: 31.5, w: 17, h: 7.6, t: '200배로\n산다!!', k: 'hand', fs: 3.4, d: 1.6 },
        { x: 15, y: 40.4, w: 23, h: 3.4, t: '0.05%만 올라도', k: 'hand', fs: 3.2, d: 1.75 },
        { x: 46, y: 30.2, w: 11, h: 3, t: '100.05', k: 'hand', fs: 3.0, d: 1.85 },
        { x: 46.5, y: 40.2, w: 10, h: 4, t: '+10', k: 'hand', fs: 3.2, d: 1.95 },
        { x: 46.5, y: 46.4, w: 8, h: 3, t: '100', k: 'hand', fs: 3.2, d: 2 },
        { x: 25.5, y: 76, w: 14, h: 10, t: '맞다 다로미,\n200배까지\n되는 데\n찾았어', k: 'say', fs: 2, d: 2.5 },
        { x: 2.5, y: 87.5, w: 10, h: 8, t: '에!\n정말~?', k: 'say', fs: 2.3, d: 3 },
      ],
    },
    {
      id: 'p3', src: pg3, ar: 1031 / 1526, alt: '위 칸: 활활 타오르는 불길. 아래 칸: 위에서 내려다본 책상 앞, 다로미가 눈에 불을 켜고 이를 악문 채 주먹을 치켜든다.',
      balloons: [],
      words: [
        { x: 2, y: 0.5, w: 44, h: 10, t: '화르륵', k: 'hollow', fs: 13, rot: -6, d: 0 },
        { x: 57, y: 1.5, w: 9, h: 4, t: '파직', k: 'out', fs: 3.6, rot: 12, d: 0.2 },
        { x: 13, y: 12, w: 66, h: 8, t: `${won(d.left)}쯤이야!!`, k: 'out', fs: 9, d: 0.4 },
        { x: 51.5, y: 38.5, w: 8, h: 6, t: '좋아\n…!', k: 'say', fs: 2.8, d: 1 },
        { x: 65, y: 40, w: 11.5, h: 7, t: '간다!!', k: 'say', fs: 3.2, d: 1.15 },
        { x: 39.5, y: 46, w: 6, h: 5, t: '흐흐', k: 'say', fs: 2.8, d: 1.3 },
        { x: 22, y: 57, w: 13, h: 12, t: '할 수\n있어!', k: 'say', fs: 3.8, d: 1.45 },
        { x: 72.5, y: 76.5, w: 7, h: 4, t: '불끈', k: 'out', fs: 2.6, rot: 8, d: 1.75 },
        { x: 84, y: 66, w: 10, h: 15, t: '이긴다!', k: 'say', v: true, fs: 3.8, d: 1.9 },
        { x: 46, y: 81, w: 9, h: 6, t: '후욱', k: 'say', fs: 2.6, d: 2.05 },
        { x: 1.5, y: 40, w: 16, h: 57, t: '이겨주겠어!', k: 'out', v: true, fs: 10.5, d: 2.4 },
        { x: 76, y: 50, w: 22, h: 6.5, t: '반드시', k: 'out', fs: 6.6, d: 2.9 },
        { x: 61, y: 79.4, w: 14, h: 4, t: '목표!', k: 'sfx', fs: 4.4, rot: -4, cls: 'ink', d: 3.2 },
        { x: 61, y: 84.5, w: 25, h: 7, t: `날다람쥐코인 200배\n빚 ${n(d.left + f.unit)} 다 갚기`, k: 'box', fs: 2.6, d: 3.3 },
        { x: 22.5, y: 89.5, w: 35, h: 9.5, t: `다로미\nFRX 잔액\n${n(f.unit)} 도토리`, k: 'box', fs: 3.2, d: 3.6 },
        { x: 8, y: 92, w: 12, h: 6, t: '꽉!', k: 'sfx', fs: 5, rot: -12, d: 3.9 },
      ],
    },
  ];
}


/** 장면 E 환생: 다시, 어느 날 → 문 앞에서 눈을 뜬다 */
export function rebirthPanels(): Panel[] {
  const d = coinDebt();
  return [
    { id: 'again', alt: '다시, 어느 날', balloons: [], card: '다시, 어느 날' },
    {
      id: 'm2r', src: m2, alt: '같은 문 앞. 추심원은 장부를 든 채 그대로 서 있다.',
      balloons: [
        { x: 9, y: 14, w: 17, h: 17, text: '…이번엔 다르다.', kind: 'shout', fs: 2.8 },
        { x: 63, y: 5, w: 32, h: 19, text: `오늘이 이자 날입니다. 정산마다 ${n(d.per)}.`, kind: 'say', fs: 2.4 },
        { x: 30, y: 88.5, w: 42, h: 8, text: '(다르지 않을 수 있다)', kind: 'tag', fs: 1.8 },
      ],
    },
  ];
}

// ── 컷 C6: 새 대부업체에서 처음 빌릴 때(한 컷). 말풍선에 그 업체의 진짜 금액과 금리 ──
export interface Tempt { lender: 'shark1' | 'capital' | 'shark2'; /** 장부에 적힌 돈 */ unit: number; /** 손에 들어온 돈(뒷골목은 선이자를 떼고) */ got: number; /** 정산마다 붙는 이자 */ perSettle: number; ratePct: number }
export function temptPanels(t: Tempt): Panel[] {
  if (t.lender === 'shark1') return temptBoss(t.unit, t.perSettle);
  if (t.lender === 'capital') return [{
    id: 't_cap', src: tRaccoon, alt: '숲속 캐피탈 창구 너구리가 턱을 괴고 빨대를 문 채 웃는다. 다로미는 이미 돈뭉치로 손을 뻗었다.',
    balloons: [
      { x: 5, y: 7, w: 17, h: 20, text: `${won(t.unit)}, 바로 됩니다아~`, kind: 'say', fs: 2.3 },
      { x: 27, y: 7, w: 15, h: 20, text: `정산마다 ${n(t.perSettle)}씩이에요 ♥`, kind: 'say', fs: 2 },
      { x: 82, y: 79, w: 13, h: 14, text: '…얼마까지 돼요?', kind: 'say', fs: 1.8 },
    ],
  }];
  return [{
    id: 't_vip', src: tViper, alt: '뒷골목 독사가 문간에 몸을 감고 빨대를 문 채 혀를 날름거린다. 다로미는 이미 돈다발을 껴안았다.',
    balloons: [
      { x: 5, y: 6, w: 17, h: 21, text: `${won(t.unit)}. 손에는 ${won(t.got)}.`, kind: 'say', fs: 2.2 },
      { x: 31, y: 5, w: 17, h: 18, text: `이자는 ${t.ratePct}%. 싫으면 말고.`, kind: 'say', fs: 2 },
      { x: 83, y: 80, w: 13, h: 14, text: '…얼마까지 돼요?', kind: 'say', fs: 1.8 },
    ],
  }];
}

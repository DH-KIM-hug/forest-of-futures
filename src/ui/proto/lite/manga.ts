// 라이트 모드의 만화(docs/gdd/LITE_CONTI.md 가 원본, docs/gdd/LITE_MANGA.md 가 구현 기록). 그림은 sprite-gen codex 컬러 만화 컷(말풍선은 비어 있다),
// 글은 화면이 풍선 자리에 얹는다. 자리는 그림 폭과 높이에 대한 % (x, y = 왼쪽 위, w, h = 크기). 그림: ui/proto/img/manga/*.webp (원본 docs/art/v5/manga).
// `{ }` 자리의 숫자는 엔진 값이다(첫 대출, 이자, 청산 폭, 파산 때의 빚과 잔액).
import { lenderById } from '../../../engine/data';
import { LITE } from '../../../engine/lite';
import m2 from '../img/manga/m2.webp';
import m3 from '../img/manga/m3.webp';
import m6 from '../img/manga/m6.webp';
import m7 from '../img/manga/m7.webp';
import xDespair from '../img/manga/x_despair.webp';
import tBoss from '../img/manga/t_boss.webp';
import tSilent from '../img/manga/t_silent.webp';
import tGrab from '../img/manga/t_grab.webp';
import tRaccoon from '../img/manga/t_raccoon.webp';
import tViper from '../img/manga/t_viper.webp';

/** say = 말풍선, shout = 뾰족 풍선, think = 생각 풍선, cap = 그림의 해설 상자, tag = 화면이 그리는 작은 흰 상자(장부 아래 글씨 등) */
export interface Balloon { x: number; y: number; w: number; h: number; text: string; /** 글자 크기(그림 폭의 %) */ fs?: number; kind?: 'say' | 'shout' | 'think' | 'cap' | 'tag' }
export interface Sfx { x: number; y: number; text: string; rot?: number; fs?: number }
/** 절망의 표제지(콜드 오픈과 파산): 세로 기도 글, 해설 두 칸, 숨소리 풍선, 표제 로고 */
export interface Spread { left: string; right: string; nar: [string, string]; sub: string; huffs: { x: number; y: number }[] }
/** card = 그림 없는 흰 칸에 손글씨 한 줄(사흘 전), note = 배율 노트 쪽(0 같은 이익, 1 뒷면) */
export interface Panel { id: string; src?: string; alt: string; balloons: Balloon[]; sfx?: Sfx[]; spread?: Spread; card?: string; note?: 0 | 1 }

const won = (x: number): string => (x >= 10000 && x % 10000 === 0 ? `${x / 10000}만` : Math.round(x).toLocaleString('ko-KR'));
const n = (x: number): string => Math.round(x).toLocaleString('ko-KR');

// ── 절망의 표제지(컷 1, 장면 D) ──
export const DESPAIR_HUFFS = [{ x: 22.5, y: 37 }, { x: 20, y: 54.5 }, { x: 73.5, y: 39.5 }, { x: 73, y: 56.5 }];
export function despairPanel(o: { sub: string; nar?: [string, string] }): Panel {
  return {
    id: 'x', src: xDespair, alt: '푸른 보랏빛 어두운 방, 바닥의 폰 불빛 위로 칩멍크가 두 손으로 머리를 감싸 쥐고 눈물이 그렁한 채 이를 악문다.',
    balloons: [],
    spread: { left: '시간을 되돌려 주세요', right: '이루어진다면', nar: o.nar ?? ['어째서 사람은 그 순간이 올 때까지', '절망의 끝에 서 있다는 걸 모르는 걸까'], sub: o.sub, huffs: DESPAIR_HUFFS },
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
        { x: 4, y: 11, w: 20, h: 22, text: `나한테 ${won(unit)} 빌려서`, kind: 'say', fs: 2.7 },
        { x: 3.5, y: 49, w: 18, h: 20, text: '그 돈으로 사는 거야.', kind: 'say', fs: 2.6 },
      ],
      sfx: [{ x: 58, y: 56, text: 'ㅅ…!?', rot: -12, fs: 11 }, { x: 72, y: 80, text: '~~~', rot: 22, fs: 8 }],
    },
    {
      id: 't2', src: tSilent, alt: '왼쪽은 곁눈질하며 땀 흘리는 칩멍크, 오른쪽은 빨대를 문 오소리 대부. 둘 다 말이 없다.',
      balloons: [
        { x: 10, y: 6, w: 29, h: 20, text: '……무슨 소리예요, 빌릴 리가 없잖아요…', kind: 'say', fs: 2.4 },
        { x: 60, y: 6, w: 30, h: 20, text: '……그래…?', kind: 'say', fs: 3.4 },
      ],
    },
    {
      id: 't3', src: tGrab, alt: '눈이 금화가 된 칩멍크가 이미 돈 봉투와 계약서를 껴안았다. 뒤에서 오소리 대부의 미소가 귀까지 찢어진다.',
      balloons: [
        { x: 6, y: 8, w: 23, h: 18, text: '…얼마까지 돼요?', kind: 'shout', fs: 3.2 },
        { x: 33, y: 88, w: 42, h: 8.5, text: `빌린 돈 +${n(unit)} / 정산마다 이자 +${n(per)}`, kind: 'tag', fs: 2 },
      ],
      sfx: [{ x: 76, y: 3, text: '쭈욱~', rot: 8, fs: 3.6 }],
    },
  ];
}

/** 도입 만화(1부): 절망의 표지 → 사흘 전 → 문 앞의 장부 → 쳇바퀴 → 대부의 유혹 셋 → 배율 노트 둘 → 200배의 꿈 → 폰을 켠다 */
export function introPanels(): Panel[] {
  const d = coinDebt(), f = firstLoan();
  return [
    despairPanel({ sub: '제1화 기도' }),
    { id: 'flash', alt: '사흘 전', balloons: [], card: '사흘 전' },
    {
      id: 'm2', src: m2, alt: '나무 밑동 집 앞, 오소리 추심원이 바닥까지 늘어지는 장부를 펼친다. 칩멍크는 폰을 쥔 채 얼어붙었다.',
      balloons: [
        { x: 9, y: 14, w: 17, h: 17, text: '버, 벌써?!', kind: 'shout', fs: 3.2 },
        { x: 63, y: 5, w: 32, h: 19, text: `코인 하다 빌려 가신 ${won(d.left)}, 오늘이 이자 날입니다.`, kind: 'say', fs: 2.4 },
        { x: 36, y: 88.5, w: 31, h: 8, text: `남은 원금 ${n(d.left)} / 정산마다 이자 ${n(d.per)}`, kind: 'tag', fs: 1.75 },
      ],
      sfx: [{ x: 36, y: 56, text: '두둥', rot: -8, fs: 4.6 }],
    },
    {
      id: 'm3', src: m3, alt: '칩멍크가 작은 쳇바퀴를 미친 듯이 굴리고, 도토리 한 알이 툭 떨어진다. 추심원은 회중시계를 본다.',
      balloons: [
        { x: 8.2, y: 5.5, w: 12, h: 14, text: '헉헉', kind: 'say', fs: 2.6 },
        { x: 64, y: 5, w: 30, h: 19, text: `잔액 +2. 이자는 ${n(d.per)}이에요.`, kind: 'say', fs: 2.6 },
        { x: 3, y: 88, w: 37, h: 8.5, text: '…이걸로는 이자도 안 나온다.', kind: 'tag', fs: 2.1 },
      ],
      sfx: [{ x: 22, y: 60, text: '다다다다다', rot: -10, fs: 4.2 }, { x: 62, y: 81, text: '+2', rot: 6, fs: 3.4 }],
    },
    ...temptBoss(f.unit, f.per),
    { id: 'n0', alt: '배율 노트: 1배는 값이 10% 올라야, 200배는 0.05%만 올라도 같은 이익.', balloons: [], note: 0 },
    { id: 'n1', alt: '배율 노트 뒷면: 200배는 반대로 조금만 내려가도 다 날아간다.', balloons: [], note: 1 },
    {
      id: 'm6', src: m6, alt: '별 눈으로 침을 흘리는 칩멍크. 꿈속에서 왕관을 쓰고 도토리 산 위에 눕고, 추심원이 절한다.',
      balloons: [
        { x: 7.5, y: 10, w: 19, h: 18, text: '200배면 하루 만에…!', kind: 'shout', fs: 2.8 },
        { x: 80, y: 80.5, w: 14, h: 12, text: '장부 따위…!', kind: 'say', fs: 2.1 },
      ],
      sfx: [{ x: 33, y: 47, text: '반짝반짝', rot: -12, fs: 3.8 }],
    },
    {
      id: 'm7', src: m7, alt: '밤, 폰 불빛만 켠 집에서 칩멍크가 불타는 눈으로 FRX 앱을 누른다. 창밖에서 오소리 둘이 지켜본다.',
      balloons: [
        { x: 24, y: 7, w: 40, h: 20, text: 'FRX, 켠다!!', kind: 'shout', fs: 5.2 },
        { x: 72.5, y: 84.5, w: 25, h: 11.5, text: '그리고 아무도 말리지 않았다.', kind: 'cap', fs: 1.9 },
      ],
      sfx: [{ x: 42, y: 74, text: '쾅!!', rot: -14, fs: 6 }],
    },
  ];
}

/** 장면 E 환생: 다시, 사흘 전 → 문 앞에서 눈을 뜬다 */
export function rebirthPanels(): Panel[] {
  const d = coinDebt();
  return [
    { id: 'again', alt: '다시, 사흘 전', balloons: [], card: '다시, 사흘 전' },
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
    id: 't_cap', src: tRaccoon, alt: '숲속 캐피탈 창구 너구리가 턱을 괴고 빨대를 문 채 웃는다. 칩멍크는 이미 돈뭉치로 손을 뻗었다.',
    balloons: [
      { x: 5, y: 7, w: 17, h: 20, text: `${won(t.unit)}, 바로 됩니다아~`, kind: 'say', fs: 2.3 },
      { x: 27, y: 7, w: 15, h: 20, text: `정산마다 ${n(t.perSettle)}씩이에요 ♥`, kind: 'say', fs: 2 },
      { x: 82, y: 79, w: 13, h: 14, text: '…얼마까지 돼요?', kind: 'say', fs: 1.8 },
    ],
  }];
  return [{
    id: 't_vip', src: tViper, alt: '뒷골목 독사가 문간에 몸을 감고 빨대를 문 채 혀를 날름거린다. 칩멍크는 이미 돈다발을 껴안았다.',
    balloons: [
      { x: 5, y: 6, w: 17, h: 21, text: `${won(t.unit)}. 손에는 ${won(t.got)}.`, kind: 'say', fs: 2.2 },
      { x: 31, y: 5, w: 17, h: 18, text: `이자는 ${t.ratePct}%. 싫으면 말고.`, kind: 'say', fs: 2 },
      { x: 83, y: 80, w: 13, h: 14, text: '…얼마까지 돼요?', kind: 'say', fs: 1.8 },
    ],
  }];
}

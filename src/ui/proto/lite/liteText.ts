// 라이트 모드의 대사(docs/gdd/LITE_MANGA.md). 엄마 이야기는 없다: 다로미는 오소리 사무소 돈 30만으로 날다람쥐코인을 샀다가 반 토막을 맞았다.
// 쳇바퀴, 알바, 족제비, 엄마의 단서는 나오지 않는다. 라이트일 때만 STORY 의 몇 장면을 이 글로 바꿔 끼운다(applyLiteText). 숫자는 엔진 값을 받는다.
import { STORY, PLACE, WHO_NAME } from '../text';
import { SPRITES } from '../sprites';
import { RIVALS, rivalById } from '../rivals';
import { QUESTS } from '../quests';
import bCrow from '../img/v5/b_crow.webp';
import type { Line, Who } from '../protoStore';
import { josa } from '../../../engine/util';

const n = (x: number) => Math.round(x).toLocaleString('ko-KR');
const man = (x: number) => (x % 10000 === 0 ? `${x / 10000}만` : n(x));
const won = (x: number, a: string, b: string) => josa(n(x), a, b);
const L = (who: Who, text: string, mood?: Line['mood']): Line => ({ who, text, mood });

export const LITE_STORY: Partial<typeof STORY> = {
  /** 만화가 끝나면 바로: 추심원이 오늘 이자를 받으러 왔다. 손에 0 */
  collectorCome: (o) => {
    const claimed = o.interest + (o.living ?? 0);
    const short = Math.max(1, claimed - Math.floor(o.cash));
    if (o.again) return [
      L('collector', `오늘도 ${n(short)} 모자라네요. 사무소는 아까 그 자리예요.`, 'flat'),
      L('collector', '한 번 더 못 받으면 폰 가져갑니다. 폰 없으면 끝인 거 아시죠?', 'flat'),
    ];
    return [
      L('collector', `오소리 사무소예요. 코인 빚 이자 ${n(o.interest)}, 생활비 ${n(o.living ?? 0)}.`),
      L('hero', o.cash < 1 ? '…코인이 반 토막 났다니까요.' : `${n(o.cash)}밖에 없어요.`),
      L('collector', '반 토막은 코인 사정이고요. 이자는 온 토막이에요.', 'flat'),
      L('collector', `사무소 가시면 ${man(o.lend)} 바로 내줘요. 거기서 오늘 거 떼고요.`, 'smile'),
      L('collector', '그냥 가라고 하시면 좋은 데 소개해 드려요. 거긴 좀 비싸요.', 'flat'),
    ];
  },
  /** 오소리 사무소에서 처음 빌렸다: 폰의 FRX 앱이 열린다 */
  office: (o) => [
    L('boss', `자, ${man(o.lend)}. 세어 보세요.`, 'smile'),
    L('boss', `오늘 이자는 ${won(o.newInterest, '이고요', '고요')}. 문 앞에 추심원이 기다려요.`, 'smile'),
    L('boss', '폰 좀 줘 보세요. 「FRX 숲거래소」 깔아 드릴게요.', 'smile'),
    L('note', '대부가 폰을 두 번 톡톡 치고 돌려준다. 화면의 숫자가 오르락내리락한다.'),
    L('boss', '현물로 잃은 건 선물로 찾는 거예요. 오르든 내리든 벌 수 있어요.', 'smile'),
    L('hero', '…내리면 어떻게 벌어요?'),
    L('boss', '숏이요. 반대로 거는 거. 해 보시면 압니다.', 'smile'),
  ],
  firstSettle: (interest, A) => [
    L('collector', `이자 ${n(interest)}, 생활비 ${n(A.living)}. 받았습니다. 다음 종 칠 때 또 와요.`),
    L('hero', '1분마다 오는 거예요?'),
    L('collector', '네. 1분마다요.', 'flat'),
  ],
  rebornSettle: (interest) => [L('collector', `이자 ${n(interest)} 받았습니다. 표정이 어디서 한 번 해 본 얼굴이네요.`)],
  refused: () => [
    L('collector', '못 낸 건 원금에 얹었어요.', 'flat'),
    L('collector', '한 번 더 밀리면 폰 가져갑니다. 걸어 둔 돈은 못 건드리지만 폰은 건드려요.', 'flat'),
  ],
  /** 쳇바퀴, 알바, 엄마 이야기가 없는 장면은 줄이 없다(pushScene 이 버린다) */
  hamsterHint: () => [],
  hamstersQuit: () => [],
  momClue: () => [],
  phoneRing: () => [],
  /** 이자를 못 낸 정산: 라이트에는 바퀴가 없다. 다음에 잃는 것은 폰 */
  overdue: (o) => {
    const short = Math.max(1, Math.round(o.short ?? o.interest));
    return [
      L('collector', `다시 세 봐도 ${n(short)} 모자라요.${o.nth > 1 ? ` 연체 ${o.nth}번째예요.` : ''}`, 'flat'),
      ...(o.locked && o.locked >= short ? [L('collector', `${won(o.locked, '은', '는')} 거래에 걸려 있잖아요. 그건 못 받아요.`, 'flat')] : []),
      L('collector', '못 받은 건 원금에 얹었어요.', 'flat'),
      ...(o.livingCapital ? [L('note', `영수증: 미납 생활비 ${n(o.livingCapital)}, 숲속 캐피탈에 갚을 돈.`)] : []),
      ...(o.seized ? [] : [L('collector', o.nothingLeft ? '이젠 가져갈 것도 없네요. 한 번 더 밀리면 그날로 끝이에요.' : '또 밀리면 폰 가져갑니다.', 'flat')]),
    ];
  },
  repay: () => [
    L('boss', '받았습니다. 원금 갚은 영수증이에요. 이게 제일 귀한 종이예요.', 'smile'),
    L('hero', '처음 받아 보는 종이예요.'),
  ],
  ledger: (beat, o) => {
    switch (beat) {
      case 'repeatCleared': return [L('boss', '비싼 줄 하나 지웠네요. 다음 줄로 가죠.', 'smile')];
      case 'firstCleared': return [L('boss', '새로 빌린 건 다 갚으셨어요. 이제 코인 빚만 남았네요.', 'smile')];
      case 'mom20': return [L('boss', o.momLeft ? `코인 빚 ${won(o.momLeft, '이', '가')} 남았어요. 반 토막보다는 작네요.` : '코인 빚 줄을 반쯤 그었어요.', 'smile')];
      case 'mom10': return [L('boss', '코인 빚이 십만 밑이에요. 이러다 진짜 갚겠어요.', 'smile')];
      default: return [
        L('note', '장부 마지막 줄에 붉은 도장. 「완납」.'),
        L('boss', '날다람쥐코인 사신 날부터 오늘까지, 다 끝났어요.', 'smile'),
        ...(o.otherDebt > 0 ? [L('hero', `다른 데 갚을 돈이 ${won(o.otherDebt, '이', '가')} 남았다.`)] : [L('hero', '이 종이, 액자에 넣을 거예요.')]),
      ];
    }
  },
  /** 장면 F: 마지막 상환. 추심원이 장부를 덮는다 */
  clear: () => [
    L('note', '추심원이 장부를 덮는다.'),
    L('collector', '완납입니다.', 'flat'),
    L('hero', '…한 판만 더 할까.'),
  ],
  act2Hook: () => [
    L('sms', '[FRX 숲거래소] 빚 없는 고객님께만 드리는 혜택. 200배 무료 체험 쿠폰 ♥'),
    L('hero', '…이걸로 시작했었지.'),
  ],
  savings: (k) => k === 0 ? [L('hero', '빚 없는 10만. 이건 아무도 안 걷어 간다.')]
    : k === 1 ? [L('hero', '30만. 처음에 코인 산 돈만큼 모았다.')]
    : [L('collector', '오늘은 걷으러 온 거 아니에요. 지나가다 들렀어요.', 'smile'), L('hero', '차 한 잔 하고 가요.')],
  /** 새 생은 만화(다시, 어느 날)가 연다(lite/liteBeats.ts rebirthSeq) */
  reborn: () => [],
  capitalSms: (o) => [L('sms', `[숲속 캐피탈] 선물 하시는 분께. ${man(o.unit)} 빌리면 1분마다 이자 ${n(o.perUnit)}. 담보 없이 바로요.`)],
  capitalIntro: (o) => [
    L('raccoon', `네, ${man(o.amount)} 들어갔어요. 금액 맞는지 한번 봐 주세요.`, 'smile'),
    L('raccoon', `1분마다 ${n(Math.ceil((o.amount * o.ratePct) / 100 - 1e-9))}씩 빠져요. 밀리시면 반짝이는 거 좋아하는 분 소개해 드려요.`, 'smile'),
  ],
  /** 소개(U-65): 오소리 추심원이 캐피탈을, 캐피탈 너구리가 까마귀를. 연체가 아니다 */
  refer: (o) => o.from === 'shark1' ? [
    L('collector', `${n(o.paid)} 모자라네요. 괜찮아요, 좋은 데 소개해 드릴게요.`, 'smile'),
    L('note', `영수증: 숲속 캐피탈에서 ${n(o.paid)} 빌려 오소리에 냈다.`),
  ] : [
    L('raccoon', `어머, ${n(o.paid)} 밀리셨네요. 반짝이는 거 좋아하는 분 아세요? 소개해 드릴게요.`, 'smile'),
    L('viper', `까악. 서류는 내가 다 했어. 손에 ${n(o.paid)}, 장부엔 ${n(o.signed)}.`, 'smile'),
    L('snake', '사장님 몫은 내가 걷는다. 1분마다.', 'flat'),
    L('note', `영수증: 반짝 전당포에서 ${n(o.signed)} 빌려 캐피탈에 ${n(o.paid)} 냈다.`),
  ],
  /** 까마귀(불법 사채)는 소개로만 안다. 문자는 오지 않는다 */
  viperSms: () => [],
  viperOffer: (o) => [
    L('viper', `까악. 세 봐. 손에 쥐는 건 ${josa(man(o.got), '이야', '야')}.`, 'flat'),
    L('hero', `여기엔 ${josa(man(o.unit), '이라고', '라고')} 적혔는데요.`),
    L('viper', `반짝이 수수료 ${man(o.unit - o.got)} 먼저 떼. 이자는 1분마다 ${o.ratePct}%.`, 'flat'),
    L('snake', '여긴 소개해 줄 데 없다. 한 번 밀리면 내가 간다.', 'flat'),
  ],
  winClaim: (o) => [
    L('collector', o.first, 'smile'),
    L('hero', `+${n(o.pnl)}. 손가락 한 번이었다.`),
    // 라이트에는 금박 도장이 없다(U-62): 남은 오소리 빚을 그대로 말한다. 다 갚았으면 갚는 얘기는 빠진다
    ...(o.momLeft > 0 ? [L('hero', '지금 갚으면 다음번엔 덜 내겠지.'), L('hero', `오소리 빚 ${n(o.momLeft)} 남았다.`)] : []),
  ],
  lossRun: (o) => [
    L('collector', `두 판 손실이 ${won(o.sum, '이네요', '네요')}.`, 'flat'),
    L('hero', o.cash >= o.due ? `${n(o.cash)} 남았다. 이번 정산은 낼 수 있어.` : `${n(o.cash)} 남았다. 이번 정산에 ${n(o.due)} 필요한데.`),
  ],
};

let applied = false;
/** 라이트일 때 한 번: STORY 의 장면 글을 라이트 글로 바꿔 끼운다 */
export function applyLiteText(): void {
  if (applied) return;
  applied = true;
  Object.assign(STORY, LITE_STORY);
  // 라이트의 불법 사채는 까마귀(U-65): 엔진 자리는 shark2 그대로, 이름과 얼굴만 바꾼다. 조합은 라이트에 없다
  PLACE.shark2 = { name: '반짝 전당포', npc: '까마귀 사장' };
  WHO_NAME.viper = '까마귀 사장';
  SPRITES.viper = { src: bCrow, w: CROW_W, h: 420 };
  SPRITES.cViper = { src: bCrow, w: CROW_W, h: 420 };
  // 숲 전광판(단타방, 의뢰판)에서도: 부엉이 지점장은 빠지고, 독사 자리는 까마귀
  for (let i = RIVALS.length - 1; i >= 0; i--) if (RIVALS[i].id === 'owl') RIVALS.splice(i, 1);
  for (let i = QUESTS.length - 1; i >= 0; i--) if (QUESTS[i].who === 'owl') QUESTS.splice(i, 1);
  for (const q of QUESTS) if (q.who === 'viper') q.name = '까마귀 사장';
  const crow = rivalById.viper;
  if (crow) {
    crow.name = '까마귀 사장';
    crow.lines = {
      open: ['까악. 다들 오른다길래 반대로.', '반짝이는 쪽 반대편에 돈이 떨어져 있지.', '100배. 그 아래는 저금이야.'],
      win: ['봤어? 두 배. 반짝반짝.', '이 숲의 반짝이는 건 결국 내 둥지로 와.'],
      liq: ['…아무도 못 봤지? 까악.', '오늘 일은 없던 일이다.'],
      sl: ['까악.'],
      bust: ['전당포 금고를 하나 더 열었다.', '맡긴 반지들 이자를 올렸다. 밑천은 그렇게 생기는 거야.'],
      vsWin: ['다람쥐가 이기는 날도 있군. 사진은 찍어 뒀지.'],
      vsLoss: ['청산 맞았다며? 전당포는 늘 열려 있어.'],
    };
  }
}
/** b_crow.webp 의 가로(높이 420 기준) */
const CROW_W = 426;

// 라이트 모드의 대사(docs/gdd/LITE_MANGA.md). 엄마 이야기는 없다: 다로미는 오소리 사무소 돈 30만으로 날다람쥐코인을 샀다가 반 토막을 맞았다.
// 쳇바퀴, 알바, 족제비, 엄마의 단서는 나오지 않는다. 라이트일 때만 STORY 의 몇 장면을 이 글로 바꿔 끼운다(applyLiteText). 숫자는 엔진 값을 받는다.
import { STORY } from '../text';
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
      L('collector', '그냥 가라고 하시면 연체로 적어요. 두 번이면 끝이고요.', 'flat'),
    ];
  },
  /** 오소리 사무소에서 처음 빌렸다: 폰의 FRX 앱이 열린다 */
  office: (o) => [
    L('boss', `자, ${man(o.lend)}. 세어 보세요.`, 'smile'),
    L('boss', `오늘 이자는 ${won(o.newInterest, '이고요', '고요')}. 문 앞에 추심원이 기다려요.`, 'smile'),
    L('boss', '폰 좀 줘 보세요. 「FRX 숲거래소」 깔아 드릴게요.', 'smile'),
    L('note', '대부가 폰을 두 번 톡톡 치고 돌려준다. 화면에 날다람쥐코인이 오르락내리락한다.'),
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
  capitalSms: (o) => [L('sms', `[숲속 캐피탈] 선물 하시는 분께. ${man(o.unit)} 빌리면 정산마다 이자 ${n(o.perUnit)}. 조합 옆문에서 담보 없이 상담해요.`)],
  capitalIntro: (o) => [
    L('raccoon', `네, ${man(o.amount)} 들어갔어요. 금액 맞는지 한번 봐 주세요.`, 'smile'),
    L('raccoon', `정산 때마다 ${n((o.amount * o.ratePct) / 100)}씩 자동이체로 빠져요. 세 번 밀리면 전액 청구고요.`, 'smile'),
  ],
  winClaim: (o) => [
    L('collector', o.first, 'smile'),
    L('hero', `+${n(o.pnl)}. 1분 이자를 손가락 한 번으로 벌었다.`),
    L('hero', '지금 갚으면 다음번엔 덜 내겠지.'),
    ...(o.stampLeft !== null ? [L('hero', `금박 도장까지 ${n(o.stampLeft)}.`)] : []),
  ],
  lossRun: (o) => [
    L('collector', `두 판 손실이 ${won(o.sum, '이네요', '네요')}.`, 'flat'),
    L('hero', o.cash >= o.claim ? `${n(o.cash)} 남았다. 이번 정산은 낼 수 있어.` : `${n(o.cash)} 남았다. 이번 정산에 ${n(o.claim)} 필요한데.`),
  ],
};

let applied = false;
/** 라이트일 때 한 번: STORY 의 장면 글을 라이트 글로 바꿔 끼운다 */
export function applyLiteText(): void {
  if (applied) return;
  applied = true;
  Object.assign(STORY, LITE_STORY);
}

// 시제품의 사람, 장소 이름과 1막 대사(docs/gdd/SCRIPT_ACT1_REVISED_USER.md 개정 대본을 받아 적용, docs/gdd/SCRIPT_ACT1_APPLY.md). 숫자는 엔진 값을 받아 끼운다.
import type { Line, Who } from './protoStore';
import { T, tips, count, type TipArgs } from './guide';
import { josa } from '../../engine/util';
import { lenderById } from '../../engine/data';

export const COLLECTOR_NAME = '오소리 추심원';
export const BOSS_NAME = '오소리 대부';
export const HOME_WHEEL_NAME = '엄마의 쳇바퀴';

export const WHO_NAME: Record<Who, string> = {
  collector: COLLECTOR_NAME, boss: BOSS_NAME, weasel: '족제비 상인', hero: '칩멍크', sms: '문자', note: '',
  raccoon: '창구 너구리', viper: '독사 대부', owl: '부엉이 지점장', news: '도토리일보',
};

/** 지도에 보이는 장소 이름(엔진 채권처 id → 마을 이름). 데이터의 채권처 이름과 다르게 이야기 쪽 이름을 쓴다. */
export const PLACE: Record<string, { name: string; npc: string }> = {
  shark1: { name: '오소리 사무소', npc: '오소리 대부' },
  capital: { name: '숲속 캐피탈', npc: '창구 너구리' },
  bank: { name: '숲속중앙조합', npc: '부엉이 지점장' },
  shark2: { name: '뒷골목', npc: '독사 대부' },
};

const n = (x: number) => Math.round(x).toLocaleString('ko-KR');
const man = (x: number) => (x % 10000 === 0 ? `${x / 10000}만` : n(x));
const L = (who: Who, text: string, mood?: Line['mood']): Line => ({ who, text, mood });

/** 프롤로그 P3: 열쇠를 받으러 온 추심원과 칩멍크가 주고받는다. 엄마의 빚 30만을 칩멍크가 자기 이름으로 맡는다(개정 대본 장면 3) */
export interface TalkLine { who: 'collector' | 'hero'; text: string }
export const prologueTalk = (o: { debt: number; interest: number }): TalkLine[] => [
  { who: 'collector', text: '오소리 사무소에서 나왔습니다. 짐은 낮에 다 뺐고요.' },
  { who: 'collector', text: '저, 열쇠 좀 받을까요?' },
  { who: 'hero', text: '집까지 비워야 해요? 짐만 가져가는 줄 알았는데.' },
  { who: 'collector', text: `여기 보세요. 어머님이 집을 맡기고 빌려 가신 돈이에요. ${man(o.debt)}.` },
  { who: 'collector', text: '옆에 찍힌 게 어머님 도장이고요.' },
  { who: 'collector', text: '여기 계속 사실 거예요? 그럼 남은 빚을 누가 맡는지 적어야 돼요.' },
  { who: 'collector', text: '이자만 안 밀리면 열쇠는 두고 갈게요.' },
  { who: 'hero', text: '저 문에 남의 자물쇠 달리는 건 싫어요. 내 이름 써요.' },
  { who: 'hero', text: '…저 바퀴, 아직 돌아가죠?' },
  { who: 'collector', text: '돌아가요. 어머님도 저거 밟아서 이자 주셨어요.' },
];
/** 프롤로그 장부 카드 아래 한 줄: 첫 수금까지 남은 시간(M:SS) */
export const ledgerNote = (sec: number): string => `다음 수금까지 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// 이야기 대사(STORY) 사이사이에 설명 줄(T, guide.ts)이 끼어 있다. 설명 줄은 평생 한 번만 나오고, 본 뒤에는 이야기 줄만 남는다.
// 말투(개정 대본): 추심원은 문밖에서 용건부터, 금액은 정확하게. 오소리 대부는 반쯤만 답하고 언성을 높이지 않는다. 족제비는 붙임성 좋게. 독사는 반말로 숫자를 말하고 기다린다.
const won = (x: number, a: string, b: string) => josa(n(x), a, b);
export const STORY = {
  /** 장면 7 첫 정산 직전: 추심원이 왔는데 낼 돈이 모자란다 → 사무소로 가는 길을 그려 준다(지도가 열린다) */
  collectorCome: (o: { interest: number; living?: number; cash: number; lend: number; again: boolean; reborn: boolean }, A: TipArgs): Line[] => {
    const claimed = o.interest + (o.living ?? 0);
    const short = Math.max(1, claimed - Math.floor(o.cash));
    if (o.again) return [
      L('collector', `${n(short)} 모자라요. 지난번에 드린 지도 아직 있어요?`, 'flat'),
      L('collector', '지난번에도 못 받았어요. 오늘도 못 받으면 이 바퀴 싣고 갑니다.', 'flat'),
    ];
    if (o.reborn) return [
      L('collector', `오소리 사무소에서 왔습니다. 이자 ${n(o.interest)}에 생활비 ${n(o.living ?? 0)}이요.`),
      L('collector', `${n(short)} 모자라네요. 사무소가 어디냐면…`, 'flat'),
      L('hero', '개울 건너 첫 집이죠?'),
      L('note', '추심원이 그리려던 연필을 귀 뒤에 다시 꽂는다.'),
    ];
    return [
      L('collector', '저 왔어요. 바퀴 잠깐 세워 보실래요? 얼마나 모였어요?'),
      L('hero', o.cash < 1 ? '…아직 하나도 없어요.' : `${n(o.cash)}. ${count(A.tap)} 알씩 꼬박 밟았는데.`),
      L('collector', `오늘 받을 게 ${n(claimed)}인데… 이걸로는 모자라네요.`, 'flat'),
      L('collector', `사무소 가시면 ${won(o.lend, '은', '는').replace(n(o.lend), man(o.lend))} 바로 내줘요.`, 'smile'),
      L('collector', '오늘 거 내고 남으면 바퀴 맡길 일꾼도 하나 쓰실 수 있고요.'),
      L('collector', '다만 그 돈도 오늘부터 이자가 붙어요. 그냥 가라고 하시면 연체로 적고요.', 'flat'),
      L('note', '반출 목록 뒷면에 추심원이 길을 그린다. 개울 건너 첫 집. 문패 대신 도장이 그려져 있다.'),
    ];
  },
  /** 장면 9 오소리 사무소에서 처음 빌린다: 돈, 중고폰, 족제비 번호, 도토코인 값 */
  office: (o: { lend: number; ratePct: number; oldInterest: number; newInterest: number; debt: number; hadPhone?: boolean }, _A?: TipArgs): Line[] => o.hadPhone ? [
    // 폰을 쥔 채 눈을 뜬 생(거래의 나무 '손에 익은 앱'): 폰을 주는 대사가 없다
    L('boss', `${man(o.lend)}이에요. 오늘 이자가 ${won(o.newInterest, '이고요', '고요')}.`, 'smile'),
    L('boss', '그 폰은 어디서 나셨어요? 아니, 리본이 좀 낯이 익어서.', 'smile'),
  ] : [
    L('boss', `자, ${man(o.lend)}. 세어 보세요.`, 'smile'),
    L('boss', `집에 가시면 이자 ${n(o.newInterest)}부터 떼어 주시고요.`, 'smile'),
    L('hero', '아까 일꾼 얘기를 들었는데, 어디서 구해요?'),
    L('boss', '이거 하나 가져가세요. 족제비 번호 들어 있어요.', 'smile'),
    L('boss', '오늘은 제가 전화해 놓죠.', 'smile'),
    L('note', '칩멍크가 폰을 집어 든다. 화면 한구석에 낯익은 도토코인 그림이 있다.'),
    L('note', '그 옆의 숫자가 한 칸 내려간다.'),
    L('hero', '우리 집 기계에 그려진 거다. 이 숫자가 한 개 값이에요?'),
    L('boss', '네, 하나 팔면 그만큼 받아요. 어머님도 그 값부터 물으셨어요.', 'smile'),
    L('note', '앱 이름은 「FRX 숲거래소」. 도토코인 값이 그 옆에서 쉬지 않고 바뀐다.'),
    L('boss', '사무소 폰이라 내역은 저한테도 와요. 막히면 이 번호로 전화하세요.', 'smile'),
    L('note', '대부가 족제비에게 전화를 거는 동안 칩멍크는 폰 고리에 엄마의 리본을 두 번 묶는다.'),
  ],
  /** 장면 10 빌린 뒤 첫 정산: 오늘 건 다 냈다 */
  firstSettle: (interest: number, A: TipArgs): Line[] => [
    L('collector', `이자 ${n(interest)}, 생활비 ${n(A.living)}. 네, 맞아요. 오늘 건 다 냈어요.`),
    L('note', '칩멍크가 막 받아 온 돈을 다시 센다. 종이 띠 자국이 아직 남아 있다.'),
  ],
  /** 다음 생의 첫 정산 */
  rebornSettle: (interest: number): Line[] => [
    L('collector', `이자 ${n(interest)} 받았습니다. 영수증은… 아, 벌써 손 내밀고 계시네.`),
  ],
  settleWin: (interest: number): Line[] => [L('collector', `이자 ${n(interest)} 받았습니다. 영수증 문 옆에 둘게요.`, 'smile')],
  settleLose: (interest: number): Line[] => [L('collector', `이자 ${n(interest)}, 다시 세 봐도 모자라요.`, 'flat')],
  /** 장면 7b 추심원을 돌려보낸 정산: 모자란 건 원금에, 딱지는 바퀴에 */
  refused: (_interest: number, tagged: boolean, living = 0): Line[] => [
    L('collector', living >= 1 ? `못 낸 이자하고 생활비 ${won(living, '은', '는')} 원금에 보탰어요.` : '모자란 건 원금에 보탰어요.', 'flat'),
    ...(tagged ? [
      L('collector', '여기 붙인 딱지, 떼시면 안 돼요.', 'flat'),
      L('collector', '이 바퀴에서 열 알 벌면 셋은 빚에서 깝니다.', 'flat'),
    ] : []),
  ],
  /** 장면 13 알바를 다 들인 순간 폰이 울린다: 오늘 받은 영수증, 한 정산의 예상 셈, 그 밑의 도토코인 값(거래소는 폰의 앱이다) */
  phoneRing: (o: { paid: number; repaid: number; income: number; wages: number; claim: number; net: number; left: number }): Line[] => [
    L('note', '발은 멈췄는데 방 안은 아까보다 시끄럽다. 주머니의 폰이 울린다.'),
    L('note', `오늘 받은 영수증. 이자와 생활비 낸 돈 ${n(o.paid)}, 갚은 원금 ${n(o.repaid)}.`),
    L('note', `바퀴 예상 수입 ${n(o.income)} − 일당 ${n(o.wages)} − 이자와 생활비 ${n(o.claim)} = ${o.net >= 0 ? '' : '−'}${n(Math.abs(o.net))}`),
    L('hero', o.net <= 0 ? '얘들이 쉬지도 않고 뛰는데, 다음번엔 내 주머니에서 또 꺼내야 돼?'
      : o.repaid > 0 ? `이만큼 뛰어서 남는 게 ${won(o.net, '이야', '야')}? 남은 ${won(o.left, '을', '를')} 언제 다 갚지.`
      : `이만큼 뛰어서 남는 게 ${won(o.net, '이야', '야')}? 이래서 언제 집을 되찾지.`),
    L('note', '알림을 닫자 그 밑에 사무소에서 봤던 도토코인 값이 떠 있다.'),
    L('hero', '아까 팔 때도 이 값이었나?'),
  ],
  /** 장면 14 첫 주문: 가진 돈 전부가 걸려 있다. 칩멍크가 사무소에 전화를 건다 */
  tutIntro: (margin: number, _lev: number, A: TipArgs): Line[] => [
    L('hero', '값이 떨어지면 내가 캔 것도 싸지는데. 여기선 어떻게 번다는 거지?'),
    L('note', `첫 주문 칸에 가진 도토리 ${won(margin, '이', '가')} 전부 적혀 있다. 사무소에 전화를 건다.`),
    L('hero', '잠깐만요. 얼마 걸지 고르는 거 아니에요? 오늘 쓸 돈까지 다 들어갔는데.'),
    L('boss', '아, 금액 칸 누르고 계세요? 첫 판은 그게 안 바뀌어요.', 'smile'),
    L('boss', '손에 있던 돈이 다 들어가요.', 'smile'),
    ...tips('exchange', A),
  ],
  /** 장면 15~16 누른 쪽과 반대로 가서 청산 → 같은 통화에서 다음 수금 → 두 번째 대출 */
  tutLost: (lost: number, lend: number, ratePct: number, A: TipArgs): Line[] => [
    L('note', `강제 청산. 잃은 도토리 ${n(lost)}, 남은 증거금 0.`),
    L('note', '첫 주문용 시세는 롱에는 내리는 값을, 숏에는 오르는 값을 보여 주게 짜여 있었다.'),
    L('hero', '어느 쪽을 눌러도 잃는 거였어요?'),
    L('boss', '첫 판은 그렇게 돼 있어요. 다들 그 얘기부터 하시더라고.', 'smile'),
    L('hero', '…그걸 돈 넣기 전에 얘기했어야죠.'),
    L('note', '통화 너머로 장부 넘기는 소리. 집에서는 햄스터가 여전히 바퀴를 돌린다.'),
    L('boss', `끊기 전에 하나만요. 다음에 내실 게 ${won(A.claim, '인데', '인데')}, 그건 있으세요?`, 'smile'),
    ...(lend > 0 ? [
      L('boss', `${man(lend)} 더 내드릴 순 있어요.`, 'smile'),
      L('boss', `이번 건 이자가 좀 세요. 정산 때마다 ${n((lend * ratePct) / 100)}씩.`, 'smile'),
    ] : [L('boss', '추가 대출 한도는 다 쓰셨어요.', 'smile')]),
  ],
  /** 장면 11 폰을 받은 뒤 첫 정산: 족제비가 햄스터를 데려온다 */
  hamsterHint: (wage: number, A: TipArgs): Line[] => [
    L('weasel', '여기 맞네요. 오소리 아저씨한테 들었어요. 이 친구, 작은 바퀴도 잘 타요.', 'smile'),
    T('ham.what', A),
    L('weasel', `대신 종 칠 때마다 한 마리에 ${won(wage, '이에요', '예요')}.`, 'smile'),
    T('ham.quit', A),
    T('ham.wheel', A),
  ],
  /** 빌린 뒤 이자를 못 낸 첫 정산의 문자. room = 오소리에서 지금 더 빌릴 수 있는 돈(0 이면 그렇다고 말한다) */
  sms: (room = 1): Line[] => [
    L('sms', room > 0 ? `[오소리 사무소] 미납 내역이 있습니다. 추가 대출 가능액 ${n(room)}.` : '[오소리 사무소] 미납 내역이 있습니다. 추가 대출 한도를 모두 쓰셨습니다.'),
  ],
  /** 장면 30 첫 상환 */
  repay: (): Line[] => [
    L('boss', '받았습니다. 이건 꼭 챙겨 가세요. 원금 갚은 영수증이니까.', 'smile'),
    L('note', '도장을 꾹 누르자 벽이 울린다. 액자들이 비뚤어진다. 가운데만 빈 못이다.'),
  ],
  /** 장면 31 엄마 이야기의 단서: 한 번에 하나, 설명 없음. reason = 첫 금박 도장 뒤, mirror = 갚다가 다시 빌린 때, frame = 엄마 빚 줄에 처음 손이 닿은 때 */
  momClue: (k: 'reason' | 'mirror' | 'frame'): Line[] =>
    k === 'reason' ? [L('note', '황금 도토코인 도장 옆에 먹이 번져 있다. 「빌린 까닭」 칸에서 ‘서까래’ 세 글자만 읽힌다.')]
    : k === 'mirror' ? [
      L('note', '대부가 장부를 넘기자 모서리가 해진 차용증이 미끄러져 나온다. 엄마 이름이다.'),
      L('note', '「남은 돈 10만, 추가로 빌린 돈 20만」. 날짜를 보니 눈이 많이 오던 그 겨울이다.'),
    ]
    : [L('note', '대부가 서랍에서 작은 액자를 꺼내 빈 못에 건다. 그림 쪽이 벽을 향한다. 뒷판에 「완납 때 돌려줄 것」.')],
  /** 장면 34 모든 빚 0: 이 생을 닫을지 고른다. 고르는 단추는 watch.ts 가 붙인다 */
  clear: (): Line[] => [
    L('note', '칩멍크는 습관처럼 문을 조금 열어 둔다. 이제 정산 시각에 문간에 올 사람이 없다.'),
    L('hero', '오늘은 이 문, 내가 닫아도 되네.'),
  ],
  /** 장면 36 [계속 산다]를 고른 뒤: 2막의 문턱(족제비의 할부 책자). 2막 자체는 아직 없다 */
  act2Hook: (): Line[] => [
    L('note', '문 아래로 종이 한 귀퉁이가 들어온다. 새 바퀴 그림이 큼직하게 박혀 있다.'),
    L('weasel', '큰 바퀴 구경만 해 보실래요? 마지막 장엔 통나무집도 있어요. 할부 되고요.', 'smile'),
    L('hero', '…이제야 빚을 다 갚았는데, 첫 장부터 할부네.'),
  ],
  // 새 생은 첫 생의 튜토리얼이 끝난 그 저녁에서 시작한다(폰, 쳇바퀴 둘, 알바 둘, 손에 10만, 빚 50만)
  reborn: (): Line[] => [
    L('hero', '주머니에 손을 넣으면… 역시 있다. 매듭 두 개.'),
    L('hero', '리본 끝에 폰, 쳇바퀴 둘, 손에 100,000. 그 저녁이다.'),
  ],

  // ── 세상이 반응한다. 아래 장면은 전부 실제로 일어난 일(엔진 값)에 붙는다 ──
  /** 장면 23 빌린 뒤에 이자를 못 낸 정산: 얼마가 모자라는지, 무엇이 붙었는지, 다음에 무엇을 잃는지 */
  overdue: (o: { interest: number; nth: number; tagged: boolean; seized: boolean; nothingLeft: boolean; living?: number; locked?: number; livingCapital?: number; short?: number }): Line[] => {
    const short = Math.max(1, Math.round(o.short ?? o.interest));
    return [
      L('collector', `다시 세 봐도 ${n(short)} 모자라요.${o.nth > 1 ? ` 이번 생 연체 ${o.nth}회예요.` : ''}`, 'flat'),
      // 돈이 없어서가 아니라 거래에 묶여 있어서 못 낸 정산: 그렇다고 말해 준다
      ...(o.locked && o.locked >= short ? [L('collector', `${won(o.locked, '은', '는')} 아직 거래에 걸려 있잖아요. 그건 지금 받을 수가 없어요.`, 'flat')] : []),
      L('collector', o.living ? `못 받은 이자하고 생활비 ${won(o.living, '은', '는')} 원금에 보탰습니다.` : '못 받은 이자는 원금에 보탰습니다.', 'flat'),
      // 생활비를 숲속 캐피탈이 대신 냈다(그곳과 거래한 적 있는 생): 대납 영수증 한 장
      ...(o.livingCapital ? [L('note', `영수증: 미납 생활비 ${n(o.livingCapital)}, 숲속 캐피탈에 갚을 돈.`)] : []),
      ...(o.tagged && !o.seized ? [L('collector', '딱지는 여기 붙일게요. 이 바퀴에서 버는 돈은 열에 셋씩 원금에서 깝니다.', 'flat')] : []),
      // 이번에 실어 가는 것이 있으면 다음 장면(압류)이 말한다
      ...(o.seized ? [] : [L('collector', o.nothingLeft ? '이젠 실어 갈 것도 없네요. 한 번 더 밀리면 그날로 파산이에요.' : '또 밀리면 바퀴 한 대 가져갑니다. 제일 싼 거부터요.', 'flat')]),
    ];
  },
  /** 장면 24 일당을 못 받은 알바가 나간다 */
  hamstersQuit: (count: number): Line[] => [
    L('weasel', '오늘 품삯이 안 들어왔어요. 얘들아, 내려와. 오늘은 여기까지 하자.', 'flat'),
    L('weasel', `${count}마리 데려갈게요. 다음에 부르실 땐 일당부터 떼어 놔요.`, 'flat'),
  ],
  /** 장면 25 압류: 실려 가는 것의 이름을 부른다 */
  seize: (o: { what: 'wheel' | 'mom' | 'wallet'; off: number; /** 그때 판에 걸려 있던 돈(U-56: 걸어 둔 증거금은 압류되지 않는다) */ locked?: number }): Line[] => [
    ...(o.locked && o.locked > 0 ? [L('collector', `거래에 걸린 ${won(o.locked, '은', '는')} 손 못 대요. 규정이에요. 그래서 바퀴를 가져가는 거고요.`, 'flat')] : []),
    ...(o.what === 'mom' ? [
      L('collector', `${n(o.off)}만큼 원금에서 뺐습니다.`, 'flat'),
      L('collector', '…잠시만요. 이쪽으로 빼는 거 맞아요? 문에 걸리는데.', 'flat'),
      L('hero', '그쪽 말고요. 이쪽으로 기울여야 나가요.'),
      L('note', '바퀴가 지나가자 칩멍크가 문턱에 앉아 리본 매듭을 만진다.'),
    ] : o.what === 'wallet' ? [
      L('collector', `지갑은 안에 든 거까지 ${won(o.off, '이에요', '예요')}. 그만큼 빚에서 뺄게요.`, 'flat'),
    ] : [
      L('collector', `보조 바퀴 싣겠습니다. 이건 경매로 ${n(o.off)} 쳐요. 그만큼 빚에서 뺐어요.`, 'flat'),
    ]),
  ],
  /** 장면 33 위험 고지 확인서(U-47): 50배 위의 칸을 처음 누르면 오소리 대부가 종이를 민다. 막는 문이 아니라 발도장 한 번이다 */
  waiverAsk: (lev: number): Line[] => [
    L('boss', '잠깐만요. 그 배율은 종이 한 장이 더 필요해요.', 'smile'),
    L('note', '오소리 대부가 탁자 너머로 종이를 민다. 「위험 고지 확인서」. 맨 아래에 발바닥 모양 빈칸이 있다.'),
    L('note', `${lev}배는 반대로 약 ${+(100 / lev).toFixed(1)}% 움직이면 넣은 돈을 전부 잃습니다.`),
    L('boss', '여기 발도장 하나면 돼요. 오늘 하루 말고, 이번 생 내내요.', 'smile'),
  ],
  /** 장면 33 확인서에 도장을 찍은 뒤 */
  waiver: (): Line[] => [
    L('note', '발도장 자국이 종이에 번진다. 확인서 아래에 오늘 날짜가 찍힌다.'),
    L('note', '200배 주문 가능. 반대로 약 0.5% 움직이면 증거금을 잃을 수 있습니다.'),
  ],
  /** 마진콜 전화(거래의 나무 B2) */
  marginCall: (o: { name: string; dir: 1 | -1; lev: number; broke: boolean }): Line[] => [
    L('boss', `오소리예요. ${o.name} 켜 보세요.`, 'smile'),
    L('boss', `${o.dir === 1 ? '롱' : '숏'} ${o.lev}배로 거신 거, 조금만 더 밀리면 청산이에요.`, 'smile'),
    L('boss', o.broke ? '아… 지금은 보탤 돈이 없군요. 예, 끊을게요.' : '증거금 보태실래요?', 'smile'),
  ],
  /** 장면 27 금리 인상: 이자가 얼마에서 얼마가 되는지 */
  rateHike: (o: { text: string; from: number; to: number; times: number; fixed?: number }): Line[] => [
    L('news', o.text),
    // 사건은 예고 다음 정산이 끝난 뒤부터 붙는다(engine events.ts decayEffects): 다음 한 번은 그대로다
    L('collector', `이번엔 ${n(o.from)} 그대로 준비하세요. 그다음 ${o.times}번은 ${n(o.to)}씩이에요.`, 'flat'),
    // 엄마 빚은 고정금리다
    ...(o.fixed ? [L('collector', '어머님 건 그대로예요. 처음부터 금리를 정해 둔 거라서요.', 'flat')] : []),
  ],
  // ── FRX 숲거래소 오픈 기념 수수료 무료 ──
  /** 장면 18 진짜 시세로 거래를 시작할 때 오는 문자(생마다 한 번, 새 생은 새 계좌다) */
  feeEventSms: (o: { left: number; reborn: boolean }): Line[] => [
    L('sms', `[FRX 숲거래소] 새 계좌가 열렸어요 ♥ 앞으로 정산 ${o.left}번 동안 거래 수수료 무료.`),
    L('hero', o.reborn ? `이 문자는 또 ${o.left}번을 다 주네.` : '무료라는 글씨가 금액보다 크네.'),
  ],
  /** 장면 20 한 판에 이자와 생활비 한 번 치를 벌었다(이번 생 처음): 추심원 → 칩멍크. 숫자는 전부 그 거래와 지금 살림의 것 */
  winClaim: (o: { first: string; pnl: number; claim: number; spins: number | null; stampLeft: number | null; momLeft: number }): Line[] => [
    L('collector', o.first, 'smile'),
    L('hero', o.spins !== null && o.spins >= 2 ? `+${n(o.pnl)}. 바퀴 한 대로 ${o.spins}번 정산할 돈이다.` : `+${n(o.pnl)}. 이자와 생활비 한 번 치다.`),
    L('hero', '지금 갚으면 다음번엔 덜 내겠지.'),
    ...(o.momLeft > 0 && o.stampLeft !== null ? [L('hero', `황금 도토코인까지 ${n(o.stampLeft)}.`)] : []),
  ],
  /** 장면 29 이자와 생활비 한 번 치를 두 판 연달아 땄다(이번 생에 한 번) */
  winRun: (o: { sum: number; stampPct: number | null }): Line[] => [
    L('boss', `두 판 합쳐 +${won(o.sum, '이네요', '네요')}. 장부 펴 놓을까요?`, 'smile'),
    L('hero', '첫 판 끝났을 땐 갚으려고 했는데.'),
  ],
  /** 장면 29 이자와 생활비 한 번 치를 두 판 연달아 잃었다(이번 생에 한 번) */
  lossRun: (o: { sum: number; spins: number | null; cash: number; claim: number }): Line[] => [
    L('collector', `두 판 손실이 ${won(o.sum, '이네요', '네요')}.`, 'flat'),
    ...(o.spins !== null && o.spins >= 2 ? [L('hero', `저 바퀴가 ${o.spins}번 정산을 채워야 버는 돈인데.`)] : []),
    // claim = 다음 정산에 나갈 돈 전부(이자 + 생활비 + 일당)
    L('hero', o.cash >= o.claim ? `${n(o.cash)} 남았다. 이번 정산은 낼 수 있어.` : `${n(o.cash)} 남았다. 이번 정산에 ${n(o.claim)} 필요한데.`),
  ],
  /** 포지션을 든 채 처음 정산을 넘겼다: 무슨 일이 있었는지 한 줄(1막은 펀딩비가 없다) */
  carried: (o: { paid: number }): string => `현금에서 ${n(o.paid)} 납부. 포지션 유지.`,
  /** 장면 28 오픈 기념이 끝난 정산: 얼마를 아꼈는지, 이제 얼마를 내는지(숫자는 전부 실제 값) */
  feeEventEnd: (o: { ratePct: number; trades: number; saved: number; lev: number }): Line[] => [
    L('sms', `[FRX 숲거래소] 오늘부터 주문 수수료 ${o.ratePct}%.`),
    L('sms', o.trades > 0 ? `무료 기간 이용 ${o.trades}건, 아낀 수수료 ${n(o.saved)}. 이용해 주셔서 고마워요 ♥` : `무료 기간 이용 0건. 다음 주문부터 수수료 ${o.ratePct}%가 적용됩니다 ♥`),
    L('note', `${o.lev}배로 거래하면 수수료는 넣은 돈의 ${+(o.ratePct * o.lev).toFixed(2)}%예요. 들어갈 때와 나올 때 각각 붙어요.`),
  ],
  // ── 장면 36 빚 없는 생을 이어 간다([계속 산다]): 모은 돈의 고비 ──
  savings: (k: number): Line[] => k === 0 ? [
    L('weasel', '책자 보셨어요? 첫 장에 나온 바퀴는 계약금이 딱 10만이에요.', 'smile'),
  ] : k === 1 ? [
    L('hero', '장부에서만 보던 숫자다. 이게 다 내 거라고?'),
  ] : [
    L('note', '문간에서 발소리가 난다. 칩멍크가 일어선다.'),
    L('collector', '아, 일어나지 마세요. 오늘은 가방 두고 나왔어요.', 'smile'),
    L('hero', '차 한 잔 하고 가요. 문 열려 있어요.'),
  ],
  // 장면 22 숲속 캐피탈(창구 너구리)
  capitalSms: (o: { unit: number; perUnit: number }): Line[] => [
    L('sms', `[숲속 캐피탈] 바퀴 굴리며 일하시는 분께. ${man(o.unit)} 빌리면 정산마다 이자 ${n(o.perUnit)}. 숲속중앙조합 옆문에서 집 담보 없이 상담해요.`),
  ],
  capitalIntro: (o: { amount: number; ratePct: number }): Line[] => [
    L('raccoon', `네, ${man(o.amount)} 들어갔어요. 금액 맞는지 한번 봐 주세요.`, 'smile'),
    L('raccoon', `정산 때마다 ${n((o.amount * o.ratePct) / 100)}씩 자동이체로 빠져요. 세 번 밀리면 값나가는 바퀴부터 가져가요.`, 'smile'),
  ],
  // 장면 26 뒷골목(독사 대부)
  viperSms: (): Line[] => [
    // 오소리가 더는 안 빌려주고 연체가 났거나 캐피탈 한도까지 다 쓴 때 온다
    L('sms', '돈 더 쓸 데가 있거든 개울 뒤 골목으로 와. 놋쇠 손잡이 달린 집.'),
    L('hero', '이 폰, 전에 누가 썼던 거지?'),
  ],
  viperOffer: (o: { unit: number; got: number; ratePct: number }): Line[] => [
    L('viper', `세 봐. 지금 가져가는 건 ${josa(man(o.got), '이야', '야')}.`, 'flat'),
    L('hero', `여기엔 ${josa(man(o.unit), '이라고', '라고')} 적혔는데요.`),
    L('viper', `잘 봤네. ${man(o.unit)}에서 이자 ${josa(man(o.unit - o.got), '을', '를')} 먼저 떼.`, 'flat'),
    L('viper', `정산 때 붙는 ${o.ratePct}%도 ${josa(man(o.unit), '으로', '로')} 치고.`, 'flat'),
    L('viper', '두 번 밀리면 그땐 내가 가. 다 읽었으면 말해.', 'flat'),
  ],
  owlRefuse: (): Line[] => [L('owl', '담보로 맡길 본인 명의의 집이 있어야 합니다.', 'flat'), L('owl', '지금 계신 오두막으로는 어렵습니다.', 'flat')],
  // 장면 32 오소리 장부(ledger.ts LedgerBeat): 갚아 나가는 길의 이야기. 완납하면 액자 속 그림과 수리 영수증이 엄마가 다시 빌린 까닭을 말한다
  ledger: (beat: string, o: { cut: number; otherDebt: number; frame?: boolean; momLeft?: number }): Line[] => {
    switch (beat) {
      case 'repeatCleared': return [
        L('boss', `이제 ${Math.round(((lenderById.shark1 as { repeatRate?: number }).repeatRate ?? 0) * 10000) / 100}%짜리는 끝났어요. 비싼 거 하나 털었네요.`, 'smile'),
      ];
      case 'firstCleared': return [
        L('boss', '손님 앞으로 빌린 건 이걸로 끝이에요.', 'smile'),
        L('boss', '어머님 건… 잠깐만요. 앞장에 있어요.', 'smile'),
        L('note', '엄마 이름 옆 작은 도장들이 줄지어 있다. 이자 받은 날마다 하나씩.'),
      ];
      case 'mom20': return [L('boss', o.momLeft ? `남은 게 ${won(o.momLeft, '이에요', '예요')}. 줄 하나 그어 둘게요.` : '여기까지 갚으셨네요. 줄 하나 그어 둘게요.', 'smile')];
      case 'mom10': return [L('boss', '어머님도 십만까지 갚은 적 있어요. 그해 눈이 참 많이 왔죠.', 'smile')];
      default: return [
        L('note', '장부 마지막 줄에 붉은 도장. 「완납」.'),
        L('note', o.frame ? '대부가 벽의 못에서 액자를 떼어 내민다.' : '대부가 서랍에서 액자를 꺼내 내민다.'),
        L('note', '액자 속에는 어릴 적 내가 그린 우리 집이 있다. 지붕만 새빨갛다.'),
        L('note', '뒷판에서 접어 둔 종이가 떨어진다. 「폭설로 꺾인 서까래 교체. 받은 돈 이십만.」'),
        L('hero', '그날 냄비를 죄다 방에 꺼내 놨었지. …그래서 다음 날엔 비가 안 샜구나.'),
        L('boss', '그 그림, 가져가세요.', 'smile'),
        L('boss', '어머님이 두고 가실 때 모서리 접히지 않게 해 달라셨어요.', 'smile'),
        ...(o.otherDebt > 0 ? [L('hero', `그림부터 집에 두고 오자. 다른 데 갚을 돈이 ${won(o.otherDebt, '이', '가')} 남았다.`)] : []),
      ];
    }
  },
};

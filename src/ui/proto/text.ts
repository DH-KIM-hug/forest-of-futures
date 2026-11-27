// 시제품의 사람·장소 이름과 1막 대사(docs/gdd/STORY_ACT1.md v3). 숫자는 엔진 값을 받아 끼운다.
import type { Line, Who } from './protoStore';
import { T, tips, type TipArgs } from './guide';
import { josa } from '../../engine/util';

export const COLLECTOR_NAME = '오소리 추심원';
export const BOSS_NAME = '오소리 대부';
export const HOME_WHEEL_NAME = '엄마의 쳇바퀴';

export const WHO_NAME: Record<Who, string> = {
  collector: COLLECTOR_NAME, boss: BOSS_NAME, weasel: '족제비 상인', hero: '칩멍크 (속마음)', sms: '문자', note: '',
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

/** 프롤로그 P3: 추심원이 이 세계(도토리 = 돈), 물려받은 빚, 이자, 쳇바퀴를 한 줄씩 말한다 */
export const prologueTalk = (o: { debt: number; interest: number }): string[] => [
  '자제분이시죠오? 오소리 대부 추심원이에요오.',
  `어머님이 저희한테 도토리 ${man(o.debt)}을 빌리셨어요오.`,
  '그 빚, 오늘부터 자제분 거예요오.',
  '장부엔 이름만 바꿔 적을게요오. 수금 시각은 그대로고요오.',
  '저 채굴기도 어머님 거예요오. 고물이라 안 가져갔어요오.',
  '어머님도 쳇바퀴 굴려서 저걸로 이자 내셨어요오.',
];
/** 프롤로그 장부 카드 아래 한 줄: 첫 수금까지 남은 시간(U-44: 첫 정산이 짧은 까닭 = 엄마 때 수금 시각 그대로) */
export const ledgerNote = (sec: number): string => `다음 수금 ${sec >= 60 && sec % 60 === 0 ? `${sec / 60}분` : `${sec}초`} 뒤`;

// 이야기 대사(STORY) 사이사이에 설명 줄(T, guide.ts)이 끼어 있다. 설명 줄은 평생 한 번만 나오고, 본 뒤에는 이야기 줄만 남는다.
export const STORY = {
  /** 1-2 첫 정산 직전: 추심원이 이자를 걷으러 왔는데 낼 돈이 없다 → 사무소로 오라고 한다(지도가 열린다) */
  collectorCome: (o: { interest: number; cash: number; lend: number; again: boolean; reborn: boolean }, A: TipArgs): Line[] => [
    L('collector', o.again ? `이자 ${n(o.interest)}, 또 왔어요오.` : o.reborn ? `처음 뵙네요오. 이자 ${n(o.interest)}, 걷으러 왔어요오.` : `이자 ${n(o.interest)}, 걷으러 왔어요오.`),
    L('collector', o.again ? '이번에도 모자라네요오. 한 번 더 밀리면 쳇바퀴 실어 가요오.' : o.cash < 1 ? '…손에 한 푼도 없으시네요오.' : `…손에 ${n(o.cash)}이네요오. 모자라요오.`, 'flat'),
    ...(o.again ? [] : [T('come.why', A)]),
    L('collector', `사무소로 오세요오. ${man(o.lend)} 빌려 드릴게요오. 이자는 거기서 받고요오.`, 'smile'),
    ...(o.again ? [] : [T('come.away', A)]),
    L('note', '추심원이 쪽지를 내민다. 집에서 오소리 사무소까지 연필 선이 그어져 있다.'),
  ],
  /** 1-3 오소리 사무소에서 처음 빌린다: 돈, 중고폰, 거래소 */
  office: (o: { lend: number; ratePct: number; oldInterest: number; newInterest: number; debt: number; hadPhone?: boolean }, A: TipArgs): Line[] => o.hadPhone ? [
    // 폰을 쥔 채 눈을 뜬 생(스킬트리 '손에 익은 앱'): 폰을 주는 대사가 없다
    L('boss', `어머님 일은 유감입니다. ${man(o.lend)}, 여기 있습니다.`, 'smile'),
    L('boss', `새 돈은 ${o.ratePct}%라, 이제 정산마다 ${n(o.newInterest)}입니다.`),
    L('boss', '…그 폰, 어디서 본 것 같은데요. 리본이 눈에 익어서요.', 'smile'),
    L('note', `추심원이 ${n(o.newInterest)} 적힌 수금 전표를 장부에 끼운다.`),
  ] : [
    L('boss', `어머님 일은 유감입니다. ${man(o.lend)}, 여기 있습니다.`, 'smile'),
    L('boss', `어머님 빚 ${n(o.oldInterest)}에 새 돈 ${o.ratePct}%. 정산마다 ${n(o.newInterest)}입니다.`),
    L('note', `추심원이 ${n(o.newInterest)} 적힌 수금 전표를 장부에 끼운다.`),
    L('boss', '이건 저희 수금용 폰입니다. 알바도 이걸로 부르세요.', 'smile'),
    L('boss', 'FRX 앱도 깔아 뒀습니다. 거래 전표는 저희한테도 한 장씩 옵니다.', 'smile'),
    L('note', '중고폰 고리에 엄마의 붉은 리본을 묶었다.'),
  ],
  /** 빌린 뒤 첫 정산 */
  firstSettle: (interest: number, A: TipArgs): Line[] => [
    L('collector', `이자 ${n(interest)}, 전표대로 받았어요오.`),
    T('settle.what', A),
    L('collector', '첫 이자는 빌리신 날 받아요오. 어머님 때도 그랬어요오.'),
  ],
  /** 다음 생의 첫 정산 */
  rebornSettle: (interest: number): Line[] => [
    L('collector', `이자 ${n(interest)}, 수금 완료요오.`),
    L('collector', '장부는 그대로예요오. 이름만 또 바꿔 적었어요오.'),
  ],
  settleWin: (interest: number): Line[] => [L('collector', `이자 ${n(interest)}, 수금 완료요오.`, 'smile')],
  settleLose: (interest: number): Line[] => [L('collector', `이자 ${n(interest)}… 모자라네요오. 연체로 적을게요오.`, 'flat')],
  /** 추심원을 돌려보낸 정산: 연체가 무엇인지 그 자리에서 말해 준다 */
  refused: (interest: number, tagged: boolean, living = 0): Line[] => [
    L('collector', `이자 ${n(interest)}… 모자라네요오. 연체로 적을게요오.`, 'flat'),
    L('collector', living >= 1 ? `못 낸 이자하고 생활비 ${josa(n(living), '은', '는')} 원금에 얹었어요오.` : '못 낸 이자는 원금에 얹었어요오.', 'flat'),
    ...(tagged ? [L('collector', '쳇바퀴엔 딱지 하나 붙여요오. 캐는 것의 3할은 원금에서 빼요오.', 'flat')] : []),
  ],
  /** 튜토리얼 거래(U-31): 거래소가 무엇인지 화면을 짚어 가며 말한 뒤, 한번 걸어 보라고 한다 */
  /** 알바를 다 들인 순간 중고폰이 울린다(U-43): 오소리 대부가 폰의 FRX 앱을 켜 보라고 한다(거래소는 앱이다 — 어디로 가는 곳이 아니다) */
  phoneRing: (repaid = 0): Line[] => [
    L('note', '주머니의 중고폰이 울린다.'),
    L('boss', '일꾼은 구하셨네요. 이제 폰에 깔아 둔 FRX 앱 한번 켜 보세요.', 'smile'),
    // 첫 거래 직전의 까닭(U-44): 알바로 이자는 메워도 원금은 그대로다
    L('hero', repaid > 0 ? '…이번 정산에도 이만큼밖에 못 갚는다.' : '…이자는 낸다. 갚은 돈은 아직 0이다.'),
  ],
  tutIntro: (margin: number, lev: number, A: TipArgs): Line[] => [
    L('boss', '폰은 잘 켜지죠? 그게 FRX 숲거래소 앱입니다.', 'smile'),
    ...tips('exchange', A),
    L('boss', '처음이니까 크게 가 보세요.', 'smile'),
    L('boss', `가진 것 전부 ${n(margin)}, ${lev}배로요. 롱이든 숏이든.`, 'smile'),
  ],
  tutLost: (lost: number, lend: number, ratePct: number, A: TipArgs): Line[] => [
    L('note', `청산. 넣은 ${n(lost)}이 통째로 사라졌다.`),
    L('boss', '아이고, 안타깝네요. 처음엔 다들 그래요.', 'smile'),
    ...tips('liquidated', A),
    // 두 번째 대출의 까닭(U-44): 전재산을 걸었으니 손에 0 이다(약정 조항 같은 것은 없다)
    L('boss', '손에 0이시네요. 다음 수금이 곧인데요.', 'smile'),
    L('boss', `${man(lend)} 더 빌려 가세요. 이번 건 ${ratePct}%입니다.`, 'smile'),
  ],
  /** 폰을 받은 뒤 첫 정산: 족제비가 알바와 쳇바퀴를 판다 */
  hamsterHint: (wage: number, A: TipArgs): Line[] => [
    L('weasel', '오소리 대부님이 보내셨어요~ 알바 햄스터 쓰시죠~', 'smile'),
    L('weasel', `일당은 ${n(wage)}, 정산 때 주시면 돼요~`, 'smile'),
    ...tips('hamster', A),
  ],
  /** 빌린 뒤 이자를 못 낸 첫 정산의 문자. room = 오소리에서 더 빌릴 수 있는 돈(0 이면 그렇다고 말한다, U-44) */
  sms: (room = 1): Line[] => room > 0 ? [
    L('sms', '[오소리 대부] 이자 미납 안내. 추가 대출 당일 승인, 도장 하나면 끝!'),
  ] : [
    L('sms', '[오소리 대부] 이자 미납 안내. 추가 대출 가능액 0. 이용해 주셔서 감사합니다.'),
  ],
  repay: (): Line[] => [
    L('note', '대부가 영수증을 떼는 동안, 액자 사이로 빈 못 하나가 보인다.'),
    L('boss', '어머님보다 빠르시네요.', 'smile'),
  ],
  /** 엄마 이야기의 단서(U-39 ⑫): 한 번에 하나, 지문 한 줄, 설명 없음. reason = 첫 금박 도장 · mirror = 갚다가 다시 빌린 때 · frame = 엄마 빚 줄에 처음 손이 닿은 때 */
  momClue: (k: 'reason' | 'mirror' | 'frame'): Line[] => [L('note',
    k === 'reason' ? '금박 도장 옆, 엄마의 장. 빌린 까닭을 적는 칸이 먹으로 지워져 있다.'
    : k === 'mirror' ? '방금 적은 줄 위에 엄마의 줄이 있다. 10만까지 갚았다가, 다시 30만. 날짜는 한겨울이다.'
    : '오소리 대부가 서랍에서 액자를 꺼내 빈 못에 건다. 뒤집힌 채로.')],
  /** 모든 빚 0: 이 생을 닫을지 고른다(U-39 ⑧). 고르는 단추는 watch.ts 가 붙인다 */
  clear: (): Line[] => [
    L('boss', '깨끗하시네요. 장부에 더 적을 게 없습니다.', 'smile'),
    L('boss', '…그런데 이제 뭘로 사세요?', 'smile'),
  ],
  /** [계속한다]를 고른 뒤: 2막의 문턱(족제비의 할부). 2막 자체는 아직 없다 */
  act2Hook: (): Line[] => [
    L('weasel', '소문 들었어요~ 빚이 하나도 없으시다면서요~', 'smile'),
    L('weasel', '그럼 할부가 되시는 거예요~ 큰 쳇바퀴, 통나무집까지~', 'smile'),
    L('weasel', '카탈로그 챙겨서 올게요~', 'smile'),
    L('hero', '…빚이 없으니까, 빌릴 수 있다.'),
  ],
  reborn: (phone = false): Line[] => [L('hero', phone ? '…다시 그 오두막이다. 손에 리본 묶인 폰이 쥐여 있다.' : '…다시 그 오두막이다. 주머니에 리본이 있다.')],

  // ── U-38: 세상이 반응한다. 아래 장면은 전부 실제로 일어난 일(엔진 값)에 붙는다 ──
  /** 빌린 뒤에 이자를 못 낸 정산: 연체가 무엇을 하는지 그 자리에서 말한다 */
  overdue: (o: { interest: number; nth: number; tagged: boolean; seized: boolean; nothingLeft: boolean; living?: number; locked?: number; livingCapital?: number }): Line[] => [
    L('collector', `이자 ${n(o.interest)}… 모자라네요오. ${o.nth <= 1 ? '연체로 적을게요오.' : `이번 생 ${o.nth}번째 연체예요오.`}`, 'flat'),
    // 돈이 없어서가 아니라 포지션에 묶여 있어서 못 낸 정산: 그렇다고 말해 준다(U-39 ①)
    ...(o.locked && o.locked >= o.interest ? [L('collector', `돈은 있으시네요오. 거래소에 ${josa(n(o.locked), '이', '가')} 묶여 있어요오. 앱 속 돈은 제가 못 꺼내요오.`, 'flat')] : []),
    L('collector', o.living ? `못 낸 이자하고 생활비 ${josa(n(o.living), '은', '는')} 원금에 얹었어요오.` : '못 낸 이자는 원금에 얹었어요오.', 'flat'),
    // 생활비를 숲속 캐피탈이 대신 냈다(그곳과 거래한 적 있는 생): 대납 영수증 한 장(U-44)
    ...(o.livingCapital ? [L('note', `영수증: 생활비 ${n(o.livingCapital)} 미납, 숲속 캐피탈 대납. 갚을 곳은 지도의 숲속 캐피탈.`)] : []),
    ...(o.tagged && !o.seized ? [L('collector', '쳇바퀴엔 딱지 붙였어요오. 캐는 것의 3할은 원금에서 빼요오.', 'flat')] : []),
    // 이번에 실어 가는 것이 있으면 다음 장면(압류)이 말한다
    ...(o.seized ? [] : [L('collector', o.nothingLeft ? '다음에도 밀리면 장부를 닫아요오. 그게 끝이에요오.' : '한 번 더 밀리면 실어 가요오. 싼 것부터요오.', 'flat')]),
  ],
  /** 일당을 못 받은 알바가 나간다 */
  hamstersQuit: (count: number): Line[] => [
    L('weasel', `일당이 밀렸네요~ 햄스터 ${count}마리, 데려갈게요~`, 'smile'),
    L('weasel', '돈 생기시면 또 부르세요~', 'smile'),
  ],
  /** 압류: 실려 가는 것의 이름을 부른다 */
  seize: (o: { what: 'wheel' | 'mom' | 'wallet'; off: number }): Line[] =>
    o.what === 'mom' ? [
      L('collector', '…어머님 쳇바퀴네요오.', 'flat'),
      L('collector', `실어 갈게요오. ${n(o.off)} 쳐서 원금에서 뺐어요오.`, 'flat'),
      L('hero', '…리본은 안 가져갔다.'),
    ] : o.what === 'wallet' ? [
      L('collector', `지갑은 통째로 가져가요오. ${n(o.off)} 쳐 드렸어요오.`, 'flat'),
    ] : [
      L('collector', '보조 쳇바퀴 한 대, 실어 갈게요오.', 'flat'),
      L('collector', `경매 반값 ${n(o.off)}, 원금에서 뺐어요오.`, 'flat'),
    ],
  /** 고위험 거래 확인서에 도장 */
  waiver: (): Line[] => [
    L('note', '「손실은 전부 본인 책임입니다」 아래에 도장을 찍었다. 인주가 번진다.'),
    L('boss', '200배입니다. 0.5%만 반대로 가도 끝이에요.', 'smile'),
    L('boss', '저는 말씀드렸습니다.', 'smile'),
  ],
  /** 마진콜 전화(스킬트리 B2) */
  marginCall: (o: { name: string; dir: 1 | -1; lev: number; broke: boolean }): Line[] => [
    L('boss', `여보세요, 오소리입니다. ${o.name} ${o.dir === 1 ? '롱' : '숏'} ${o.lev}배, 청산이 코앞이에요.`, 'smile'),
    L('boss', o.broke ? '증거금을… 아, 넣을 돈이 없으시네요. 그럼 이만.' : '증거금을 더 넣으시면 청산가는 멀어집니다. 넣어 드릴까요?', 'smile'),
  ],
  /** 금리 인상 속보: 이자가 얼마에서 얼마가 되는지 */
  rateHike: (o: { text: string; from: number; to: number; times: number; fixed?: number }): Line[] => [
    L('news', o.text),
    L('collector', `다음 ${o.times}번은 이자가 ${n(o.from)}에서 ${n(o.to)}이에요오.`, 'flat'),
    // 엄마 빚은 고정금리다: "어머님 때 이자 그대로"(U-39 ⑥)
    ...(o.fixed ? [L('collector', `어머님 빚 이자 ${n(o.fixed)}은 안 올라요오.`, 'flat')] : []),
  ],
  // ── U-40: FRX 숲거래소 오픈 기념 수수료 무료 ──
  /** 진짜 시세로 거래를 시작할 때 오는 문자(생마다 한 번 — 새 생은 새 계좌다) */
  feeEventSms: (o: { left: number; reborn: boolean }): Line[] => [
    L('sms', `[FRX 숲거래소] 오픈 기념! 새 계좌는 정산 ${o.left}번 동안 거래 수수료 0%.`),
    L('hero', o.reborn ? '…이번 생에도 새 계좌다. 공짜는 공짜다.' : '…공짜라는 말은 사무소에서도 들었다.'),
  ],
  /** 이벤트가 끝난 정산: 얼마를 아꼈는지, 이제 얼마를 내는지(숫자는 전부 실제 값) */
  /** 한 판에 이자 한 번 치를 벌었다(U-41, 이번 생 처음): 오소리 대부 → 추심원 → 주인공. 숫자는 전부 그 거래와 지금 살림의 것 */
  winClaim: (o: { boss: string; pnl: number; claim: number; spins: number | null; stampLeft: number | null; momLeft: number }): Line[] => [
    L('boss', o.boss, 'smile'),
    L('collector', `다음 정산 ${n(o.claim)}은 벌써 손에 있네요오.`),
    L('hero', o.spins !== null && o.spins >= 2 ? `…+${n(o.pnl)}. 쳇바퀴 ${o.spins}정산치다.` : `…+${n(o.pnl)}. 한 판에 이자 한 번.`),
    ...(o.momLeft > 0 && o.stampLeft !== null ? [L('hero', `…금박 도장까지 ${n(o.stampLeft)}.`)] : []),
  ],
  /** U-42: 이자 한 번 치를 두 판 연달아 땄다(이번 생에 한 번). 엄마 이야기는 건드리지 않는다 — 빚이 어디서 왔는지는 아직 아무도 말하지 않는다 */
  winRun: (o: { sum: number; stampPct: number | null }): Line[] => [
    L('weasel', '두 판 연달아 버셨다면서요~ 저희 장부엔 벌써 사장님이라고 적어 뒀어요~', 'smile'),
    L('boss', `두 번 합쳐 +${n(o.sum)}. 손님들이 제일 크게 거는 때가 딱 지금이에요.`, 'smile'),
    L('collector', '저는 축하 안 해요오. 세 번째 판을 많이 봐서요오.', 'flat'),
    L('hero', '…두 번 다 맞혔다.'),
  ],
  /** U-42: 이자 한 번 치를 두 판 연달아 잃었다(이번 생에 한 번) */
  lossRun: (o: { sum: number; spins: number | null; cash: number; claim: number }): Line[] => [
    L('collector', `두 판 연달아 잃으셨네요오. 합쳐서 −${n(o.sum)}이에요오.`, 'flat'),
    L('collector', o.spins !== null && o.spins >= 2 ? `쳇바퀴 한 대가 ${o.spins}정산 돌아야 하는 돈이에요오.` : '햄스터는 그냥 돌아요오.', 'flat'),
    L('boss', '쉬어 가셔도 됩니다. 장은 또 열려요. 이자는 그보다 먼저 오고요.', 'smile'),
    L('hero', o.cash >= o.claim ? `…손에 ${n(o.cash)}. 다음 정산은 낼 수 있다.` : `…손에 ${n(o.cash)}. 다음 정산 ${n(o.claim)}에 모자란다.`),
  ],
  /** 포지션을 든 채 처음 정산을 넘겼다(U-41): 무슨 일이 있었는지 한 줄 */
  carried: (o: { paid: number; funding: number }): string => `정산을 넘겼다. 손에서 −${n(o.paid)}, 포지션은 그대로${o.funding >= 1 ? `, 펀딩비 −${n(o.funding)}은 증거금에서` : ''}`,
  feeEventEnd: (o: { ratePct: number; trades: number; saved: number; lev: number }): Line[] => [
    L('sms', `[FRX 숲거래소] 오픈 기념 이벤트가 끝났습니다. 지금부터 거래 수수료 ${o.ratePct}%.`),
    L('sms', o.trades > 0 ? `그동안 수수료 없이 ${o.trades}건. 정가였다면 ${n(o.saved)}을 내셨을 거예요. 감사합니다 ♥` : '그동안 한 건도 안 하셨네요. 저희가 다 아쉬워요 ♥'),
    L('boss', `${o.ratePct}%. 작아 보이죠? ${o.lev}배면 들어갈 때 넣은 돈의 ${+(o.ratePct * o.lev).toFixed(1)}%, 나올 때 또.`, 'smile'),
  ],
  // ── U-40: 빚 없는 생을 이어 간다([계속한다]) — 모은 돈의 고비 ──
  savings: (k: number): Line[] => k === 0 ? [
    L('weasel', '10만 모으셨네요~ 계약금으로 딱이에요~', 'smile'),
  ] : k === 1 ? [
    L('boss', '30만이요. 어머님이 처음 빌려 가신 돈과 같네요.', 'smile'),
    L('boss', '그 돈, 맡기실 데가 없으시면 저한테…', 'smile'),
  ] : [
    L('collector', '…지나가다 들렀어요오. 걷을 것도 없는데요오.', 'flat'),
    L('hero', '…이제 닫아도 된다.'),
  ],
  // 숲속 캐피탈(창구 너구리)
  capitalSms: (): Line[] => [
    L('sms', '[숲속 캐피탈] 고객님~ 무담보 대출 정산당 2%! 숲속중앙조합 옆문이 저희 창구예요~'),
  ],
  capitalIntro: (o: { amount: number; ratePct: number }): Line[] => [
    L('raccoon', `고객님~ ${man(o.amount)} 나갔어요~ 정산마다 ${o.ratePct}%, 오소리 새 돈보다 싸요~`, 'smile'),
    L('raccoon', '이자는 자동이체예요~ 세 번 밀리시면 쳇바퀴를 실어 가요~ 비싼 것부터요~', 'flat'),
  ],
  // 뒷골목(독사 대부)
  viperSms: (): Line[] => [
    L('sms', '낮에 가던 창구가 닫혔나. 급전, 서류 없음. 뒷골목 끝, 잘 닦인 문으로 오게.'),
    L('hero', '…모르는 번호다.'),
  ],
  viperOffer: (o: { unit: number; got: number; ratePct: number }): Line[] => [
    L('viper', '급하신가 보군. 편하게 앉으시게.', 'smile'),
    L('viper', `${man(o.unit)}을 적고, ${man(o.got)}을 드리지. 나머지는 선이자일세.`, 'smile'),
    L('viper', `이자는 장부의 ${man(o.unit)}에 정산마다 ${o.ratePct}%씩 붙지.`, 'smile'),
    L('viper', '두 번 밀리면 받으러 가지. 조용히.', 'flat'),
  ],
  owlRefuse: (): Line[] => [L('owl', '고객님, 압류된 집은 담보로 받지 않습니다.', 'flat')],
  // 오소리 장부(ledger.ts LedgerBeat): 갚아 나가는 길의 이야기
  ledger: (beat: string, o: { cut: number; otherDebt: number; frame?: boolean }): Line[] => {
    switch (beat) {
      case 'repeatCleared': return [
        L('boss', `6% 몫을 지우셨네요. 정산마다 ${n(o.cut)}, 제 몫이 줄었습니다.`, 'smile'),
      ];
      case 'firstCleared': return [
        L('boss', '빌려 드린 돈은 다 갚으셨네요. 이제 어머님 장부만 남았습니다.', 'smile'),
        L('note', '장부 첫 장. 엄마 이름 옆에 날짜가 줄지어 있다. 한 줄도 밀리지 않았다.'),
      ];
      // 엄마 이야기의 단서(지워진 사유 칸 · 10만에서 다시 30만 · 뒤집힌 액자)는 여기서 몰아 보여 주지 않는다 — momClue 가 한 번에 하나씩(U-39 ⑫)
      case 'mom20': return [L('boss', '20만 남았습니다. 장부가 가벼워지네요.', 'smile')];
      case 'mom10': return [L('boss', '10만 남았네요. 어머님도 여기까지는 오셨습니다.', 'smile')];
      default: return [
        L('note', '장부 마지막 줄에 붉은 도장. 「완납」.'),
        L('boss', '어머님 빚, 다 받았습니다. 수고하셨어요.', 'smile'),
        // 액자를 건 것을 본 생에만(단서 frame)
        ...(o.frame ? [L('boss', '벽의 액자요? 그건… 다음에 보시죠.', 'smile')] : []),
        ...(o.otherDebt > 0 ? [L('hero', `…아직 다른 빚 ${n(o.otherDebt)}이 남았다.`)] : []),
      ];
    }
  },
};

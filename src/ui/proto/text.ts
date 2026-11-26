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
export const PLACE: Record<string, { name: string; npc: string; line: string }> = {
  shark1: { name: '오소리 사무소', npc: '오소리 대부', line: '「원금은 직접 오셔서 갚으시면 됩니다.」' },
  capital: { name: '숲속 캐피탈', npc: '창구 너구리', line: '「고객님~ 필요하시면 말씀만 하세요.」' },
  bank: { name: '숲속중앙조합', npc: '부엉이 지점장', line: '「담보 서류부터 보겠습니다.」' },
  shark2: { name: '뒷골목', npc: '독사 대부', line: '「급하신가 보군. 편하게 앉으시게.」' },
};

const n = (x: number) => Math.round(x).toLocaleString('ko-KR');
const man = (x: number) => (x % 10000 === 0 ? `${x / 10000}만` : n(x));
const L = (who: Who, text: string, mood?: Line['mood']): Line => ({ who, text, mood });

/** 프롤로그 P3: 추심원이 이 세계(도토리 = 돈), 물려받은 빚, 이자, 쳇바퀴를 한 줄씩 말한다 */
export const prologueTalk = (o: { debt: number; interest: number }): string[] => [
  '자제분이시죠오? 오소리 대부에서 나온 추심원이에요오.',
  '이 숲 마을에선 도토리가 돈이에요오.',
  `어머님이 저희한테 도토리 ${man(o.debt)}을 빌리셨어요오.`,
  '그 빚이 오늘부터 자제분 거예요오. 상속이라고 해요오.',
  `이자는 정산마다 ${n(o.interest)}. 어머님 때 이자 그대로예요오.`,
  '저 쳇바퀴는 코인 캐는 기계예요오. 굴리면 도토코인이 나와요오.',
  '어머님도 그걸로 이자 내셨어요오.',
];
/** 프롤로그 장부 카드 아래 한 줄 */
export const LEDGER_NOTE = '빚은 갚을 돈이다. 쓸 수 있는 돈은 0. 가진 것은 쳇바퀴 하나.';

// 이야기 대사(STORY) 사이사이에 설명 줄(T, guide.ts)이 끼어 있다. 설명 줄은 평생 한 번만 나오고, 본 뒤에는 이야기 줄만 남는다.
export const STORY = {
  /** 1-2 첫 정산 직전: 추심원이 이자를 걷으러 왔는데 낼 돈이 없다 → 사무소로 오라고 한다(지도가 열린다) */
  collectorCome: (o: { interest: number; cash: number; lend: number; again: boolean; reborn: boolean }, A: TipArgs): Line[] => [
    L('collector', o.again ? `이자 ${n(o.interest)}, 또 왔어요오.` : o.reborn ? `처음 뵙겠습니다아. 이자 ${n(o.interest)}, 걷으러 왔어요오.` : `이자 ${n(o.interest)}, 걷으러 왔어요오.`),
    L('collector', o.again ? '이번에도 모자라네요오. 한 번 더 밀리면 쳇바퀴 실어 가요오.' : o.cash < 1 ? '…한 푼도 없으시네요오.' : `…${n(o.cash)}이네요오. 모자라요오.`, 'flat'),
    ...(o.again ? [] : [T('come.why', A)]),
    L('collector', `사무소로 오세요오. ${man(o.lend)} 빌려 드릴게요오.`, 'smile'),
    L('collector', '오늘 이자는 거기서 뗄게요오.', 'smile'),
    ...(o.again ? [] : [T('come.loan', A), T('come.away', A)]),
    L('note', '문틈에 쪽지가 꽂힌다. 오소리 사무소 가는 길이 그려져 있다. 그는 문 앞에서 기다린다.'),
  ],
  /** 1-3 오소리 사무소에서 처음 빌린다: 돈, 중고폰, 거래소 */
  office: (o: { lend: number; ratePct: number; oldInterest: number; newInterest: number; debt: number; hadPhone?: boolean }, A: TipArgs): Line[] => o.hadPhone ? [
    // 폰을 쥔 채 눈을 뜬 생(스킬트리 '손에 익은 앱'): 폰을 주는 대사가 없다
    L('boss', `어머님 일은 유감입니다. ${man(o.lend)}, 여기 있습니다.`, 'smile'),
    L('boss', `새로 빌리신 돈은 ${o.ratePct}%라, 이제 정산마다 ${n(o.newInterest)}입니다.`),
    L('boss', '…그 폰, 어디서 본 것 같은데요. 리본이 눈에 익어서요.', 'smile'),
    L('note', `빚 ${n(o.debt)} · 정산마다 이자 ${n(o.newInterest)}. 문 앞의 추심원이 오늘 이자부터 떼어 간다.`),
  ] : [
    L('boss', `어머님 일은 유감입니다. ${man(o.lend)}, 여기 있습니다.`, 'smile'),
    L('boss', `어머님 빚은 옛날 이자 그대로 ${n(o.oldInterest)}.`),
    L('boss', `새로 빌리신 돈은 ${o.ratePct}%라, 이제 정산마다 ${n(o.newInterest)}입니다.`),
    T('office.rule', A),
    L('note', `빚 ${n(o.debt)} · 정산마다 이자 ${n(o.newInterest)}. 문 앞의 추심원이 오늘 이자부터 떼어 간다.`),
    L('boss', '그리고 이거, 쓰던 폰입니다. 알바 부를 때 쓰세요.', 'smile'),
    L('boss', '요새 문 연 FRX 숲거래소도 깔아 놨습니다. 쳇바퀴보다 빨라요.', 'smile'),
    L('note', '중고폰을 받았다. 고리에 엄마의 붉은 리본을 묶었다. 폰이 달랑, 한 번 흔들린다.'),
  ],
  /** 빌린 뒤 첫 정산 */
  firstSettle: (interest: number, A: TipArgs): Line[] => [
    L('collector', `이자 ${n(interest)}, 수금 완료요오.`),
    T('settle.what', A),
    L('collector', '…어머님하고 똑같은 날짜네요오.'),
  ],
  /** 다음 생의 첫 정산 */
  rebornSettle: (interest: number): Line[] => [
    L('collector', `이자 ${n(interest)}, 수금 완료요오.`),
    L('collector', '빚은 사람이 아니라 장부에 붙어요.'),
  ],
  settleWin: (interest: number): Line[] => [L('collector', `이자 ${n(interest)}, 수금 완료요오.`, 'smile')],
  settleLose: (interest: number): Line[] => [L('collector', `이자 ${n(interest)}… 모자라네요오. 장부에 적어 둘게요.`, 'flat')],
  /** 추심원을 돌려보낸 정산: 연체가 무엇인지 그 자리에서 말해 준다 */
  refused: (interest: number, tagged: boolean): Line[] => [
    L('collector', `이자 ${n(interest)}… 모자라네요오. 연체로 적을게요오.`, 'flat'),
    L('collector', '못 낸 이자는 원금에 얹었어요오.', 'flat'),
    ...(tagged ? [L('collector', '쳇바퀴엔 딱지 하나 붙이고 갈게요오. 캐는 것의 3할은 저희 거예요오.', 'flat')] : []),
  ],
  /** 튜토리얼 거래(U-31): 거래소가 무엇인지 화면을 짚어 가며 말한 뒤, 한번 걸어 보라고 한다 */
  tutIntro: (margin: number, lev: number, A: TipArgs): Line[] => [
    L('boss', '폰은 잘 켜지죠? 여기가 FRX 숲거래소입니다.', 'smile'),
    ...tips('exchange', A),
    L('boss', `처음이니까 ${man(margin)}만, ${lev}배로요. 롱이든 숏이든 한번 걸어 보세요.`, 'smile'),
    L('boss', '쳇바퀴 백 날 굴리는 것보다 빨라요.', 'smile'),
  ],
  tutLost: (lost: number, lend: number, ratePct: number, A: TipArgs): Line[] => [
    L('note', `청산. 넣은 ${n(lost)}이 통째로 사라졌다.`),
    L('boss', '아이고, 안타깝네요. 처음엔 다들 그래요.', 'smile'),
    ...tips('liquidated', A),
    L('boss', `${man(lend)} 더 빌려 가세요.`, 'smile'),
    L('boss', `이번 건 이자를 조금 더 받겠습니다. ${ratePct}%요.`, 'smile'),
  ],
  /** 폰을 받은 뒤 첫 정산: 족제비가 알바와 쳇바퀴를 판다 */
  hamsterHint: (wage: number, A: TipArgs): Line[] => [
    L('weasel', '폰 생기셨다면서요~ 알바 햄스터, 불러 보세요~', 'smile'),
    L('weasel', `일당은 ${n(wage)}. 정산 때 주시면 돼요~`, 'smile'),
    ...tips('hamster', A),
  ],
  sms: (): Line[] => [
    L('sms', '[오소리 대부] 이자 미납 안내. 추가 대출 당일 승인, 도장 하나면 끝!'),
    L('hero', '…지도에 오소리 사무소가 있지.'),
  ],
  repay: (): Line[] => [
    L('note', '사무소 벽에 액자들. 그 사이 빈 못 하나와 액자 자국.'),
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
    L('note', '빚 0. 이제 문을 두드릴 사람이 없다. 폰에는 FRX 숲거래소가 그대로 깔려 있다.'),
  ],
  /** [계속한다]를 고른 뒤: 2막의 문턱(족제비의 할부). 2막 자체는 아직 없다 */
  act2Hook: (): Line[] => [
    L('weasel', '소문 들었어요~ 빚이 하나도 없으시다면서요~', 'smile'),
    L('weasel', '그럼 할부가 되시는 거예요~ 큰 쳇바퀴, 발전기, 통나무집까지~', 'smile'),
    L('weasel', '카탈로그 챙겨서 다시 올게요~ 도장만 준비해 두세요~', 'smile'),
    L('hero', '…빚이 없으니까, 빌릴 수 있다.'),
  ],
  reborn: (phone = false): Line[] => [L('hero', phone ? '…다시 그 오두막이다. 손에 폰이 쥐여 있다. 리본도 그대로다.' : '…다시 그 오두막이다. 주머니 속 리본이 아직 따뜻하다.')],

  // ── U-38: 세상이 반응한다. 아래 장면은 전부 실제로 일어난 일(엔진 값)에 붙는다 ──
  /** 빌린 뒤에 이자를 못 낸 정산: 연체가 무엇을 하는지 그 자리에서 말한다 */
  overdue: (o: { interest: number; nth: number; tagged: boolean; seized: boolean; nothingLeft: boolean; living?: number; locked?: number }): Line[] => [
    L('collector', `이자 ${n(o.interest)}… 모자라네요오. ${o.nth <= 1 ? '연체로 적을게요오.' : `이번 생 ${o.nth}번째 연체예요오.`}`, 'flat'),
    // 돈이 없어서가 아니라 포지션에 묶여 있어서 못 낸 정산: 그렇다고 말해 준다(U-39 ①)
    ...(o.locked && o.locked >= o.interest ? [L('collector', `돈은 있으시네요오. 거래소에 ${josa(n(o.locked), '이', '가')} 묶여 있어요오. 저는 거긴 못 들어가요오.`, 'flat')] : []),
    L('collector', '못 낸 이자는 원금에 얹었어요오.', 'flat'),
    ...(o.living ? [L('collector', `생활비 ${n(o.living)}도 못 내셨네요오. 그것도 장부에 얹었어요오.`, 'flat')] : []),
    ...(o.tagged && !o.seized ? [L('collector', '쳇바퀴엔 딱지 붙였어요오. 캐는 것의 3할은 저희 거예요오.', 'flat')] : []),
    // 이번에 실어 가는 것이 있으면 다음 장면(압류)이 말한다
    ...(o.seized ? [] : [L('collector', o.nothingLeft ? '다음에도 밀리면 장부를 닫아요오. 그게 끝이에요오.' : '한 번 더 밀리면 실어 가요오. 싼 것부터요오.', 'flat')]),
  ],
  /** 일당을 못 받은 알바가 나간다 */
  hamstersQuit: (count: number): Line[] => [
    L('weasel', `일당이 밀렸네요~ 햄스터 ${count}마리, 데려갈게요~`, 'smile'),
    L('weasel', '원한은 없어요~ 장사니까요~ 돈 생기면 또 부르세요~', 'smile'),
  ],
  /** 압류: 실려 가는 것의 이름을 부른다 */
  seize: (o: { what: 'wheel' | 'mom' | 'wallet'; off: number }): Line[] =>
    o.what === 'mom' ? [
      L('collector', '…어머님 쳇바퀴네요오.', 'flat'),
      L('collector', `실어 갈게요오. ${n(o.off)} 쳐서 원금에서 뺐어요오.`, 'flat'),
      L('hero', '…리본은 폰 고리에 묶여 있다. 그건 안 가져갔다.'),
    ] : o.what === 'wallet' ? [
      L('collector', `지갑은 통째로 가져가요오. ${n(o.off)} 쳐 드렸어요오.`, 'flat'),
    ] : [
      L('collector', '보조 쳇바퀴 한 대, 실어 갈게요오.', 'flat'),
      L('collector', `${n(o.off)} 쳐서 원금에서 뺐어요오. 경매라 반값이에요오.`, 'flat'),
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
    L('boss', o.broke ? '증거금을… 아, 넣을 돈이 없으시네요. 그럼 이만.' : '증거금 더 넣으시겠어요? 넣으면 버티고, 안 넣으면… 아시죠.', 'smile'),
  ],
  /** 금리 인상 속보: 이자가 얼마에서 얼마가 되는지 */
  rateHike: (o: { text: string; from: number; to: number; times: number; fixed?: number }): Line[] => [
    L('news', o.text),
    L('collector', `다음 ${o.times}번은 이자가 ${n(o.from)}에서 ${n(o.to)}이에요오.`, 'flat'),
    // 엄마 빚은 고정금리다: "어머님 때 이자 그대로"(U-39 ⑥)
    ...(o.fixed ? [L('collector', `어머님 빚 이자 ${n(o.fixed)}은 안 올라요오. 어머님 때 이자 그대로라서요오.`, 'flat')] : []),
    L('collector', '위에서 정한 거라서요오. 저도 월급은 그대로예요오.', 'flat'),
  ],
  // ── U-40: FRX 숲거래소 오픈 기념 수수료 무료 ──
  /** 진짜 시세로 거래를 시작할 때 오는 문자(생마다 한 번 — 새 생은 새 계좌다) */
  feeEventSms: (o: { left: number; reborn: boolean }): Line[] => [
    L('sms', `[FRX 숲거래소] 오픈 기념! 새 계좌는 정산 ${o.left}번 동안 거래 수수료 0%.`),
    L('hero', o.reborn ? '…이번 생에도 새 계좌다. 공짜는 공짜다.' : '…공짜라는 말은 오소리 사무소에서도 들었다.'),
  ],
  /** 이벤트가 끝난 정산: 얼마를 아꼈는지, 이제 얼마를 내는지(숫자는 전부 실제 값) */
  feeEventEnd: (o: { ratePct: number; trades: number; saved: number; lev: number }): Line[] => [
    L('sms', `[FRX 숲거래소] 오픈 기념 이벤트가 끝났습니다. 지금부터 거래 수수료 ${o.ratePct}%.`),
    L('sms', o.trades > 0 ? `그동안 수수료 없이 ${o.trades}건. 정가였다면 ${n(o.saved)}을 내셨을 거예요. 감사합니다 ♥` : '그동안 한 건도 안 하셨네요. 저희가 다 아쉬워요 ♥'),
    L('boss', `${o.ratePct}%. 작아 보이죠? ${o.lev}배면 들어갈 때 넣은 돈의 ${+(o.ratePct * o.lev).toFixed(1)}%가 나갑니다. 나올 때 한 번 더요.`, 'smile'),
    L('boss', '공짜가 끝나야 장사가 시작입니다. 저도 첫 이자는… 아, 저는 받았군요.', 'smile'),
  ],
  // ── U-40: 빚 없는 생을 이어 간다([계속한다]) — 모은 돈의 고비 ──
  savings: (k: number): Line[] => k === 0 ? [
    L('weasel', '10만 모으셨네요~ 빚도 없는데~ 계약금으로 딱이에요~', 'smile'),
    L('weasel', '카탈로그는 아직 인쇄 중이에요~ 조금만 더 모으고 계세요~', 'smile'),
  ] : k === 1 ? [
    L('boss', '30만이요. 어머님이 처음 빌려 가신 돈과 같네요.', 'smile'),
    L('boss', '그 돈, 맡기실 데가 없으시면 저한테… 아닙니다. 농담이에요.', 'smile'),
  ] : [
    L('note', '도토리 100만. 오두막 바닥이 조금 내려앉은 것 같다.'),
    L('collector', '…지나가다 들렀어요오. 걷을 게 없는데 발이 이리로 오네요오.', 'flat'),
    L('hero', '…이제 닫아도 된다. 닫을 수 있을까.'),
  ],
  // 숲속 캐피탈(창구 너구리)
  capitalSms: (): Line[] => [
    L('sms', '[숲속 캐피탈] 고객님~ 무담보 신용대출 정산당 2%! 쳇바퀴만 있어도 한도가 나와요~'),
    L('hero', '…지도에 가게가 하나 더 생겼다.'),
  ],
  capitalIntro: (o: { amount: number; ratePct: number }): Line[] => [
    L('raccoon', '고객님~ 어서 오세요~ 숲속 캐피탈 창구 너구리예요~', 'smile'),
    L('raccoon', `${man(o.amount)} 나갔어요~ 이자는 정산마다 ${o.ratePct}%. 오소리보다 싸죠~`, 'smile'),
    L('raccoon', '쳇바퀴를 늘리시면 한도도 늘어요~ 저희는 쳇바퀴를 좋아해요~', 'smile'),
    L('raccoon', '이자는 자동이체예요~ 추심원은 안 보내요~ 잔액만 채워 두세요~', 'smile'),
    L('raccoon', '대신 석 번 밀리시면 쳇바퀴를 실어 가요~ 비싼 것부터요~ 웃으면서요~', 'flat'),
  ],
  // 뒷골목(독사 대부)
  viperSms: (): Line[] => [
    L('sms', '급전. 서류 없음. 뒷골목 끝, 잘 닦인 문.'),
    L('hero', '…모르는 번호다. 내 번호는 어떻게 알았지.'),
  ],
  viperOffer: (o: { unit: number; got: number; ratePct: number }): Line[] => [
    L('viper', '급하신가 보군. 편하게 앉으시게.', 'smile'),
    L('viper', `${man(o.unit)}을 적고, ${man(o.got)}을 드리지. 나머지는 선이자일세.`, 'smile'),
    L('viper', `이자는 정산마다 ${o.ratePct}%. 적은 ${man(o.unit)}에 붙네.`, 'smile'),
    L('viper', '두 번 밀리면 받으러 가지. 조용히.', 'flat'),
  ],
  owlRefuse: (): Line[] => [L('owl', '고객님, 담보가 확인되지 않습니다. 딱지 붙은 집은 담보가 아닙니다.', 'flat')],
  // 오소리 장부(ledger.ts LedgerBeat): 갚아 나가는 길의 이야기
  ledger: (beat: string, o: { cut: number; otherDebt: number; frame?: boolean }): Line[] => {
    switch (beat) {
      case 'repeatCleared': return [
        L('boss', '6% 몫을 지우셨네요. 비싼 것부터. 영리하십니다.', 'smile'),
        L('boss', `정산마다 이자가 ${n(o.cut)} 줄었습니다. 제 몫이 준 거죠. 축하드려요.`, 'smile'),
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

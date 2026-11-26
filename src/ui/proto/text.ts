// 시제품의 사람·장소 이름과 1막 대사(docs/gdd/STORY_ACT1.md v3). 숫자는 엔진 값을 받아 끼운다.
import type { Line, Who } from './protoStore';

export const COLLECTOR_NAME = '오소리 추심원';
export const BOSS_NAME = '오소리 대부';
export const HOME_WHEEL_NAME = '엄마의 쳇바퀴';

export const WHO_NAME: Record<Who, string> = {
  collector: COLLECTOR_NAME, boss: BOSS_NAME, weasel: '족제비 상인', hero: '칩멍크 (속마음)', sms: '문자', note: '',
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

export const STORY = {
  /** 1-2 첫 정산 직전: 추심원이 이자를 걷으러 왔는데 낼 돈이 없다 → 사무소로 오라고 한다(지도가 열린다) */
  collectorCome: (o: { interest: number; cash: number; lend: number; again: boolean; reborn: boolean }): Line[] => [
    L('collector', o.again ? `이자 ${n(o.interest)}, 또 왔어요오.` : o.reborn ? `처음 뵙겠습니다아. 이자 ${n(o.interest)}, 걷으러 왔어요오.` : `이자 ${n(o.interest)}, 걷으러 왔어요오.`),
    L('collector', o.again ? '이번에도 모자라네요오. 한 번 더 밀리면 쳇바퀴 실어 가요오.' : o.cash < 1 ? '…한 푼도 없으시네요오.' : `…${n(o.cash)}이네요오. 모자라요오.`, 'flat'),
    L('collector', `사무소로 오세요오. ${man(o.lend)} 빌려 드릴게요오. 이자는 거기서 뗄게요오.`, 'smile'),
    L('note', '추심원이 접힌 쪽지를 문틈에 꽂는다. 오소리 사무소 가는 길이 그려져 있다. 그는 문 앞에서 기다린다.'),
  ],
  /** 1-3 오소리 사무소에서 처음 빌린다: 돈, 중고폰, 거래소 */
  office: (o: { lend: number; ratePct: number; oldInterest: number; newInterest: number; debt: number }): Line[] => [
    L('boss', `어머님 일은 유감입니다. ${man(o.lend)}, 여기 있습니다.`, 'smile'),
    L('boss', `어머님 빚은 옛날 이자 그대로 ${n(o.oldInterest)}. 새로 빌리신 돈은 ${o.ratePct}%라, 이제 정산마다 ${n(o.newInterest)}입니다.`),
    L('note', `빚 ${n(o.debt)} · 정산마다 이자 ${n(o.newInterest)}. 문 앞의 추심원이 오늘 이자부터 떼어 간다.`),
    L('boss', '그리고 이거, 쓰던 폰입니다. 알바 부를 때 쓰세요. 요새 문 연 FRX 숲거래소도 깔아 놨습니다. 쳇바퀴보다 빨라요.', 'smile'),
    L('note', '중고폰을 받았다. 고리에 엄마의 붉은 리본을 묶었다. 폰이 달랑, 한 번 흔들린다.'),
  ],
  /** 빌린 뒤 첫 정산 */
  firstSettle: (interest: number): Line[] => [
    L('collector', `이자 ${n(interest)}, 수금 완료요오.`),
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
    L('collector', tagged ? '못 낸 이자는 원금에 얹었어요오. 쳇바퀴엔 딱지 하나 붙이고 갈게요오. 캐는 것의 3할은 저희 거예요오.' : '못 낸 이자는 원금에 얹었어요오.', 'flat'),
  ],
  /** 튜토리얼 거래(U-31) */
  tutIntro: (margin: number, lev: number): Line[] => [
    L('boss', '폰은 잘 켜지죠? 한번 걸어 보세요. 오를 것 같으면 롱, 내릴 것 같으면 숏.', 'smile'),
    L('boss', `처음이니까 ${man(margin)}만, ${lev}배로요. 쳇바퀴 백 날 굴리는 것보다 빨라요.`, 'smile'),
  ],
  tutLost: (lost: number, lend: number, ratePct: number): Line[] => [
    L('note', `청산. 넣은 ${n(lost)}이 통째로 사라졌다.`),
    L('boss', '아이고, 안타깝네요. 처음엔 다들 그래요.', 'smile'),
    L('boss', `${man(lend)} 더 빌려 가세요. 이번 건 이자를 조금 더 받겠습니다. ${ratePct}%요.`, 'smile'),
  ],
  hamsterHint: (wage: number): Line[] => [L('weasel', `폰 생기셨다면서요~ 알바 햄스터 부르세요. 일당 ${n(wage)}, 정산 때 주시면 돼요~`, 'smile')],
  sms: (): Line[] => [
    L('sms', '[오소리 대부] 이자 미납 안내. 추가 대출 당일 승인, 도장 하나면 끝!'),
    L('hero', '…지도에 오소리 사무소가 있지.'),
  ],
  repay: (): Line[] => [
    L('note', '사무소 벽에 액자들. 그 사이 빈 못 하나와 액자 자국.'),
    L('boss', '어머님보다 빠르시네요.', 'smile'),
  ],
  clear: (): Line[] => [L('boss', '깨끗하시네요. …그런데 이제 뭘로 사세요?', 'smile')],
  reborn: (): Line[] => [L('hero', '…다시 그 오두막이다. 주머니 속 리본이 아직 따뜻하다.')],
};

// 시제품의 사람·장소 이름과 1막 대사(docs/gdd/STORY_ACT1.md). 숫자는 엔진 값을 받아 끼운다.
import type { Line, Who } from './protoStore';

export const COLLECTOR_NAME = '오소리 추심원';
export const BOSS_NAME = '오소리 대부';

export const WHO_NAME: Record<Who, string> = {
  collector: COLLECTOR_NAME, boss: BOSS_NAME, squirrel: '단짝 다람쥐', bear: '곰 형', weasel: '족제비 상인', raccoon: '창구 너구리',
  hero: '칩멍크 (속마음)', sms: '문자', note: '',
};

/** 지도에 보이는 장소 이름(엔진 채권처 id → 마을 이름). 데이터의 채권처 이름과 다르게 이야기 쪽 이름을 쓴다. */
export const PLACE: Record<string, { name: string; npc: string; line: string }> = {
  shark1: { name: '오소리 사무소', npc: '오소리 대부', line: '「원금은 직접 오셔서 갚으시면 됩니다.」' },
  capital: { name: '숲속 캐피탈', npc: '창구 너구리', line: '「고객님~ 필요하시면 말씀만 하세요.」' },
  bank: { name: '숲속중앙조합', npc: '부엉이 지점장', line: '「담보 서류부터 보겠습니다.」' },
  shark2: { name: '뒷골목', npc: '독사 대부', line: '「급하신가 보군. 편하게 앉으시게.」' },
};

const n = (x: number) => Math.round(x).toLocaleString('ko-KR');
const L = (who: Who, text: string, mood?: Line['mood']): Line => ({ who, text, mood });

export const STORY = {
  /** 1-2·1-3 첫 정산: 추심원이 이자를 걷고, 대부가 지도를 준다 */
  firstSettle: (interest: number): Line[] => [
    L('collector', `이자 ${n(interest)}, 수금 완료요오.`),
    L('collector', '…어머님하고 똑같은 날짜네요.'),
    L('boss', '원금은 사무소로 직접 오셔서 갚으시면 됩니다. 지도 드릴게요.', 'smile'),
    L('note', '추심원이 접힌 쪽지를 텐트 기둥에 꽂고 간다.'),
  ],
  /** 다음 생의 첫 정산 */
  rebornSettle: (interest: number): Line[] => [
    L('collector', `이자 ${n(interest)}, 수금 완료요오.`),
    L('collector', '빚은 사람이 아니라 장부에 붙어요.'),
  ],
  settleWin: (interest: number): Line[] => [L('collector', `이자 ${n(interest)}, 수금 완료요오.`, 'smile')],
  settleLose: (interest: number): Line[] => [L('collector', `이자 ${n(interest)}… 모자라네요오. 장부에 적어 둘게요.`, 'flat')],
  sign: (): Line[] => [L('weasel', '도토코인 쳇바퀴, 요즘 다들 하나씩은 있어요. 돌리면 코인이 나와요~', 'smile')],
  wheel: (): Line[] => [
    L('note', '쳇바퀴가 돈다. 번개가 전선을 타고 콜드월렛으로 간다. 캔 코인은 바로 팔려 도토리가 된다.'),
    L('hero', '…이걸로 30만을?'),
  ],
  friend: (unit: number, max: number): Line[] => [
    L('squirrel', '야… 소식 들었어. 어머님 일은…'),
    L('squirrel', '급하면 말해. 많이는 못 해도.'),
    L('note', `이자 없이 ${n(unit)}씩, ${n(max)}까지 빌려준다고 한다.`),
  ],
  upg: (): Line[] => [L('weasel', '설비가 늘었네요~ 기름칠이랑 운동화도 보고 가세요. 할부도 돼요~', 'smile')],
  bear: (): Line[] => [
    L('bear', '아직도 그거 돌려? 형은 어제 하루에 석 달 치 벌었어.'),
    L('note', '폰 화면을 보여 준다. 초록 숫자가 가득하다.'),
    L('bear', 'FRX 숲거래소. 링크 보내 줄게.', 'smile'),
  ],
  account: (cap: number): Line[] => [
    L('raccoon', `예탁금 확인됐습니다~ 선물 계좌 개설 완료예요. 배율은 ${cap}배까지. …처음엔요.`, 'smile'),
    L('bear', '축하해~ 이제 진짜야. 형이 말했지?', 'smile'),
  ],
  sms: (): Line[] => [
    L('sms', '[오소리 대부] 무직자 OK, 당일 승인, 도장 하나면 끝!'),
    L('hero', '…지도에 오소리 사무소가 있었지.'),
  ],
  repay: (): Line[] => [
    L('note', '사무소 벽에 액자들. 그 사이 빈 못 하나와 액자 자국.'),
    L('boss', '어머님보다 빠르시네요.', 'smile'),
  ],
  clear: (): Line[] => [L('boss', '깨끗하시네요. …그런데 이제 뭘로 사세요?', 'smile')],
  reborn: (): Line[] => [L('hero', '…다시 공터다. 폰 고리의 리본이 아직 따뜻하다.')],
};

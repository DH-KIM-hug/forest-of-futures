// 첫 이름 적기(사용자: "그럼 처음에 이름 정하기도 있어야겠네"). 이름은 오소리 사무소 차용증의 서명이다.
//   - 라이트: 만화(7쪽)를 덮은 바로 뒤, 날다람쥐코인 길잡이 앞. FRX 계좌 개설 신청서 겸 차용증
//   - 본편: 오소리 사무소에서 처음 [빌리기]를 누를 때. 차용증에 발도장을 찍어야 돈이 나온다
//   - 별명 뒤에는 기기마다 같은 장부 번호가 붙는다("몰빵다람쥐 #0417", rankingCore ledgerNo). 저장은 별명만, 보낼 때 붙인다
//   - 이미 이름이 있으면(돌아온 사람) 묻지 않는다. 이름은 전광판과 같은 자리(fof.rank.name)에 남고, 전광판에서 고칠 수 있다
//   - 화면 확인용: &pdev=sign(본편), &pdev=lite_sign(라이트). 확인용 장면은 이름을 저장하지 않는다
import { create } from 'zustand';
import { BASE_NAME_MAX, cleanName } from './rankingCore';
import { savedName, setRankName } from './ranking';
import { pdev } from './config';

/** 확인용 장면: 이름이 있어도 서류를 보인다, 찍어도 저장하지 않는다 */
export const signForced = pdev === 'sign' || pdev === 'lite_sign';
export const NAME_MAX = BASE_NAME_MAX;

/** 고를 수 있는 별명(전부 12글자 안). 앞의 여덟이 처음 보이는 칩, 뒤는 🎲 로 섞어 본다 */
export const SUGGEST = [
  '몰빵다람쥐', '떡상기원', '200배인생', '한방다람쥐', '존버개미', '풀매수개미', '손절못개미', '새벽개미',
  '물타기개미', '영끌개미', '청산개미', '이번엔진짜', '오늘만산다', '볼주머니텅',
];
export const CHIP_COUNT = 6;

/** 처음 보이는 칩: 몰빵다람쥐 셋과 개미 셋 */
export const firstChips = (): string[] => ['몰빵다람쥐', '떡상기원', '200배인생', '존버개미', '풀매수개미', '손절못개미'];
/** 🎲: 별명 칩 n 개를 새로 뽑는다(겹치지 않게, 지금 보이는 것은 되도록 빼고 남은 자리를 채운다) */
export function pickSuggest(n: number, rand: () => number = Math.random, skip: string[] = []): string[] {
  const fresh = SUGGEST.filter((x) => !skip.includes(x));
  const old = SUGGEST.filter((x) => skip.includes(x));
  const out: string[] = [];
  const take = (from: string[]) => { while (out.length < n && from.length) out.push(from.splice(Math.floor(rand() * from.length), 1)[0]); };
  take(fresh); take(old);
  return out;
}

export type NameCheck = { ok: true; name: string } | { ok: false; why: 'empty' | 'long' | 'bad' };
/** 서버 cleanName 과 같은 규칙(1~12글자, 꺾쇠와 제어 문자 안 됨). 꺾쇠는 몰래 지우지 않고 말해 준다 */
export function checkName(raw: string): NameCheck {
  if (/[\u0000-\u001f\u007f<>]/.test(raw)) return { ok: false, why: 'bad' };
  const t = raw.normalize('NFC').trim();
  if (!t) return { ok: false, why: 'empty' };
  if ([...t].length > NAME_MAX) return { ok: false, why: 'long' };
  const n = cleanName(t);
  return n ? { ok: true, name: n } : { ok: false, why: 'bad' };
}
export const NAME_ERR: Record<'empty' | 'long' | 'bad', string> = {
  empty: '서명 칸이 비었어요. 별명 하나면 돼요.',
  long: `${NAME_MAX}글자까지만 적혀요. 장부 칸이 좁거든요.`,
  bad: '꺾쇠(< >)나 줄바꿈은 장부에 안 써져요.',
};

/** 대사(오소리 대부) */
export const SIGN_LINES = {
  ask: '여기 서명만 하시면 돼요. 본명 말고 별명도 받아요. 어차피 장부엔 숫자만 남거든요.',
  oops: '펜이 미끄러졌네요. 다시 한 번만요.',
  done: '발도장 예쁘네요. 이제 이 이름은 제 장부에서 안 지워져요.',
  fine: '※ 서명한 이름은 숲 전광판과 도토리일보 「오늘 망한 자들」에 실릴 수 있습니다.',
  fine2: '※ 별명은 전광판이 열리면 거기서 고칠 수 있습니다. 장부 번호와 빚은 고칠 수 없습니다.',
};

/** 서류를 보여야 하나: 확인용 장면이거나, 장면 건너뛰기가 아니고 아직 이름이 없다 */
export const needsSign = (name: string | null = savedName(), dev: string | null = pdev, forced = signForced): boolean => forced || (!dev && !name);

/** 발도장: 이름을 장부(fof.rank.name)에 적는다. 확인용 장면은 저장하지 않는다 */
export function signName(raw: string, persist = !signForced): NameCheck {
  const c = checkName(raw);
  if (!c.ok) return c;
  if (persist && !setRankName(c.name)) return { ok: false, why: 'bad' };
  return c;
}

// ── 서류 열기(본편: 첫 [빌리기]가 연다. 라이트는 화면 상태로 뜬다, NameSign.tsx) ──
interface SignUi { main: boolean; then: (() => void) | null; signedDev: boolean }
export const useSign = create<SignUi>(() => ({ main: false, then: null, signedDev: false }));
export const openMainSign = (then: () => void): void => useSign.setState({ main: true, then });
/** 찍고 나서(또는 확인용 장면에서 찍은 척) */
export function closeSign(): void {
  const t = useSign.getState().then;
  useSign.setState({ main: false, then: null, signedDev: signForced ? true : useSign.getState().signedDev });
  t?.();
}

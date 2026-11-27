// 1막 시제품(balance.act1) 전용 엔딩 글과 200개 밖의 엔딩(data/endings_act1.json, DECISIONS_LOG U-39).
// 본 게임의 엔딩 200개와 조건은 그대로다. 1막에 없는 것을 말하는 글만 1막의 물건(쳇바퀴·폰·장부)으로 바꿔 보여 준다.
import act1Json from '../../data/endings_act1.json';
import { balance, endingById, endings, type EndingDef } from './data';
import { josa } from './util';

export const act1On = (): boolean => !!(balance as { act1?: unknown }).act1;

const A = act1Json as unknown as { names: [string, string][]; overrides: Record<string, { title?: string; line?: string }>; special: Partial<EndingDef>[] };

/** 200개 밖의 엔딩(은퇴). 도감에는 같이 센다. 조건 표·그림 연출은 없다. */
export const specialEndings: EndingDef[] = A.special.map((e) => ({ direction: {}, illustration: null, textStatus: 'act1', v1Category: '', hiddenCondIndex: null, foreshadow: '', trace: '', base: false, ...e }) as EndingDef);
for (const e of specialEndings) endingById[e.id] = e;
/** 도감의 전체 칸 수(200 + 은퇴 엔딩) */
export const ENDING_TOTAL = endings.length + specialEndings.length;
export const RETIRE_CAUSE = 'RETIRE';

/** 옛 이름을 지도·이야기의 이름으로(오소리 소장 → 오소리 대부, 황금저축·캐피탈 → 숲속 캐피탈, 족제비 대표 → 창구 너구리) */
export function storyNames(text: string): string {
  let t = text;
  for (const [from, to] of A.names) {
    t = t.split(from).join(to);
    // 받침이 바뀌면 뒤의 조사도 맞춘다(U-46: "오소리 소장은" → "오소리 대부은"이 되던 것)
    t = t.replace(new RegExp(`${to}(은|는|이|가|을|를|과|와)(?=[\\s.,!?」』)…]|$)`, 'g'), (_m, p: string) => {
      const pair: Record<string, [string, string]> = { 은: ['은', '는'], 는: ['은', '는'], 이: ['이', '가'], 가: ['이', '가'], 을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'] };
      return josa(to, pair[p][0], pair[p][1]);
    });
  }
  return t;
}
/** 1막에서 보여 줄 제목과 글. 1막이 아니면 원문 그대로. */
export function act1Text(e: EndingDef): { title: string; line: string } {
  if (!act1On()) return { title: e.title, line: e.line };
  const o = A.overrides[e.id];
  return { title: storyNames(o?.title ?? e.title), line: storyNames(o?.line ?? e.line) };
}

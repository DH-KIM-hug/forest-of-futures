// 웅얼거림 목소리(U-36): 대사를 한 글자씩, 우리가 만든 음절 20개(audio/babble.mp3)로 "말하는 소리"를 낸다.
// 여기는 순수 계산만 한다(소리·화면 없음): 한글 한 글자 → 음절 이름, 대사 한 줄 → 언제 어떤 음절을 어떤 높이로 낼지 + 글자가 언제 보일지.
// 원본은 승인받은 시험 클립을 만든 make.py 이다(모음 갈래 + 첫소리 갈래로 음절을 고르고, rate 로 높이·빠르기를 같이 바꾼다).

/** 말하는 사람의 목소리. rate = 재생 빠르기(높이도 같이), blip = 한 음절 길이(초), gap = 음절 사이, pause = 문장 부호에서 쉬는 길이(띄어쓰기는 절반), detune = 음절마다 흔들리는 높이 폭 */
export interface Voice { rate: number; blip: number; gap: number; pause: number; detune: number; gain?: number; /** n 음절마다 하나만 소리 낸다(속마음) */ every?: number }

export const VOICES = {
  /** 오소리 추심원 (승인 클립 collector_A) */
  collector: { rate: 1.45, blip: 0.085, gap: 0.018, pause: 0.22, detune: 0.06 },
  /** 오소리 대부 (collector_B_low) */
  boss: { rate: 1.15, blip: 0.10, gap: 0.025, pause: 0.26, detune: 0.04 },
  /** 족제비 상인 (weasel_high) */
  weasel: { rate: 1.9, blip: 0.07, gap: 0.012, pause: 0.18, detune: 0.10 },
  /** 주인공 속마음: 아주 짧고 작게, 두 음절에 하나만 */
  hero: { rate: 1.6, blip: 0.05, gap: 0.02, pause: 0.14, detune: 0.05, gain: 0.4, every: 2 },
  /** 그 밖에 말하는 사람(새 인물이 생기면 여기로 떨어진다) */
  other: { rate: 1.3, blip: 0.09, gap: 0.02, pause: 0.22, detune: 0.05 },
} satisfies Record<string, Voice>;
/** 소리 없이 글이 한 번에 뜨는 것: 지문, 문자, 알림 카드 */
const SILENT = new Set(['note', 'sms', 'system', 'hint']);
export function voiceOf(who: string): Voice | null {
  if (SILENT.has(who)) return null;
  return (VOICES as Record<string, Voice>)[who] ?? VOICES.other;
}

/** 음절 묶음에 들어 있는 이름(audio/babble.json 과 같아야 한다 — 시험이 확인한다) */
export const SYLLABLES = ['a', 'e', 'i', 'o', 'u', 'ba', 'be', 'bi', 'bo', 'bu', 'ma', 'me', 'mi', 'mo', 'mu', 'na', 'ni', 'ro', 'ru', 'da'];
const HAVE = new Set(SYLLABLES);
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const VCLASS: Record<string, string> = { ㅏ: 'a', ㅑ: 'a', ㅘ: 'a', ㅐ: 'e', ㅒ: 'e', ㅔ: 'e', ㅖ: 'e', ㅙ: 'e', ㅞ: 'e', ㅚ: 'e', ㅓ: 'o', ㅕ: 'o', ㅝ: 'o', ㅗ: 'o', ㅛ: 'o', ㅜ: 'u', ㅠ: 'u', ㅡ: 'u', ㅟ: 'i', ㅢ: 'i', ㅣ: 'i' };
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const CCLASS: Record<string, string> = { ㄴ: 'n', ㄹ: 'r', ㅁ: 'm', ㅂ: 'b', ㅃ: 'b', ㅍ: 'b', ㄷ: 'd', ㄸ: 'd', ㅌ: 'd', ㅇ: '', ㅎ: '' };
/** 숫자는 읽는 소리의 모음에 가깝게(영 일 이 삼 사 오 육 칠 팔 구) */
const DIGIT = ['o', 'i', 'i', 'ma', 'a', 'o', 'u', 'bi', 'ba', 'u'];

export const isHangul = (ch: string): boolean => ch >= '가' && ch <= '힣';
/** 한글 한 글자 → 음절 이름(make.py pick 과 같다). 한글이 아니면 숫자·영문만 소리가 있고 나머지는 null */
export function pickSyllable(ch: string): string | null {
  if (isHangul(ch)) {
    const c = ch.charCodeAt(0) - 0xac00;
    const ci = Math.floor(c / 588);
    const v = VCLASS[JUNG[Math.floor((c % 588) / 28)]];
    const cc = CCLASS[CHO[ci]] ?? (ci % 2 ? 'b' : 'd');
    for (const cand of [cc + v, 'b' + v, v]) if (HAVE.has(cand)) return cand;
    return v;
  }
  if (ch >= '0' && ch <= '9') return DIGIT[+ch];
  if (/[a-z]/i.test(ch)) { const l = ch.toLowerCase(); return 'aeiou'.includes(l) ? l : 'da'; }
  return null;
}

/** 쉬는 부호(문장 부호). 그 밖의 기호(따옴표·괄호·% 등)는 시간 없이 지나간다 */
const PAUSE = '.?!,~…‥。、:;—';
const isDigit = (ch: string | undefined): boolean => !!ch && ch >= '0' && ch <= '9';

export interface Blip { /** 글자 자리 */ i: number; /** 줄 시작부터(초) */ at: number; name: string; rate: number; /** 들리는 길이(초) */ dur: number; gain: number }
export interface Speech { text: string; /** 글자마다 보이기 시작하는 때(초, 늘어나기만 한다) */ at: number[]; blips: Blip[]; /** 마지막 글자가 보이는 때 */ typed: number; /** 끝의 쉼까지 */ total: number }

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/**
 * 대사 한 줄의 시간표. 글자 하나 = 음절 하나(blip + gap), 띄어쓰기 = pause/2, 문장 부호 = pause.
 * make.py 와 다른 점(게임 대사에 맞춤): 숫자·영문도 한 음절로 읽고, 숫자 사이의 쉼표·점과 잇따르는 부호·기호는 쉬지 않는다.
 * 같은 글이면 늘 같은 소리가 난다(글에서 뽑은 씨앗).
 */
export function planSpeech(text: string, v: Voice, seed: number = hash(text)): Speech {
  const rnd = mulberry(seed);
  const at: number[] = [];
  const blips: Blip[] = [];
  let t = 0, n = 0, typed = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    at.push(t);
    typed = t;
    const name = pickSyllable(ch);
    if (name) {
      let rate = v.rate * (1 + v.detune * (rnd() * 2 - 1));
      if ('.?!'.includes(text[i + 1] ?? '')) rate *= 0.9; // 끝음은 살짝 내린다
      if (n % (v.every ?? 1) === 0) blips.push({ i, at: t, name, rate, dur: v.blip, gain: 0.8 * (v.gain ?? 1) });
      n += 1;
      t += v.blip + v.gap;
    } else if (ch === ' ' || ch === '\n') t += v.pause * 0.5;
    else if (PAUSE.includes(ch)) {
      const inNumber = isDigit(text[i - 1]) && isDigit(text[i + 1]);
      const again = i > 0 && PAUSE.includes(text[i - 1]);
      if (!inNumber && !again) t += v.pause;
    }
  }
  return { text, at, blips, typed, total: t };
}

/** 줄이 시작되고 t 초가 지났을 때 보이는 글자 수 */
export function shownAt(sp: Speech, t: number): number {
  let lo = 0, hi = sp.at.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sp.at[m] <= t) lo = m + 1; else hi = m; }
  return t < 0 ? 0 : lo;
}

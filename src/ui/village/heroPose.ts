// 주인공 자세 선택 (순수 함수). 우선순위: 파산 > 위험 > 기쁨 > 일하기 > 평소
export type HeroPose = 'dazed' | 'sweat' | 'joy' | 'work' | 'idle';

export interface HeroPoseInput {
  over: boolean;
  anyOverdue: boolean;
  nearLiq: boolean;
  tick: number;
  tradeFlash: { tick: number; kind: string; amount: number } | null;
  stampFlash: { tick: number } | null;
  workHop: boolean; // 노동 버튼을 누른 직후
}

export const JOY_TICKS = 2; // 약 1.5초

export function heroPose(i: HeroPoseInput): HeroPose {
  if (i.over) return 'dazed';
  if (i.anyOverdue || i.nearLiq) return 'sweat';
  const tf = i.tradeFlash;
  const profit = !!tf && (tf.kind === 'tp' || tf.kind === 'close') && tf.amount > 0 && i.tick - tf.tick < JOY_TICKS;
  const paid = !!i.stampFlash && i.tick - i.stampFlash.tick < JOY_TICKS;
  if (profit || paid) return 'joy';
  if (i.workHop) return 'work';
  return 'idle';
}

export const HERO_POSES: HeroPose[] = ['dazed', 'sweat', 'joy', 'work', 'idle'];

import type { RunState, Ticker } from './types';

export function say(run: RunState, text: string, kind: Ticker['kind'] = 'info'): void {
  run.ticker = { text, tick: run.tick, kind };
  if (run.offline && run.digest && (kind === 'trade' || kind === 'warn') && run.digest.notes.length < 6) run.digest.notes.push(text);
}

export const comma = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const signed = (n: number) => (n >= 0 ? '+' : '-') + comma(Math.abs(n));

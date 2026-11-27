// U-52(회차 11): 알림은 줄을 선다 — 뒤 알림이 앞 알림을 덮어 지우지 않고, 장면이 떠 있는 동안 기다렸다가 걷히면 다시 뜬다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { say, TOAST_MIN_MS, TOAST_KEEP_MS, burstMs } from '../../src/ui/proto/watch';
import { useProto } from '../../src/ui/proto/protoStore';
import { gustWord } from '../../src/ui/proto/flyWind';

beforeEach(() => { vi.useFakeTimers(); (globalThis as { window?: unknown }).window ??= globalThis; useProto.setState({ toast: null, scenes: [], beatUntil: 0 }); });
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); });
const now = () => useProto.getState().toast;

describe('알림 줄', () => {
  it('뒤 알림이 와도 앞 알림은 적어도 잠깐은 보인다', () => {
    say('승급', 5500, true);
    say('반응 한 줄', 4500);
    expect(now()).toBe('승급');
    vi.advanceTimersByTime(TOAST_KEEP_MS - 300);
    expect(now()).toBe('승급');
    vi.advanceTimersByTime(5500);
    expect(now()).toBe('반응 한 줄');
    vi.advanceTimersByTime(5000);
    expect(now()).toBe(null);
  });
  it('보통 알림은 뒤가 밀리면 짧아진다', () => {
    say('하나', 6000); say('둘', 3000);
    vi.advanceTimersByTime(TOAST_MIN_MS + 300);
    expect(now()).toBe('둘');
    vi.advanceTimersByTime(4000);
  });
  it('장면이 덮는 동안 기다렸다가 걷히면 남은 시간만큼', () => {
    say('큰손 승급', 5500, true);
    vi.advanceTimersByTime(1000);
    useProto.setState({ scenes: [{ id: 'x', lines: [] } as never], beatUntil: 0 });
    vi.advanceTimersByTime(300);
    expect(now()).toBe(null);
    vi.advanceTimersByTime(20_000); // 장면을 오래 봐도 알림은 줄에서 기다린다
    useProto.setState({ scenes: [] });
    vi.advanceTimersByTime(300);
    expect(now()).toBe('큰손 승급');
    vi.advanceTimersByTime(6000);
    expect(now()).toBe(null);
  });
  it('숨(beat) 동안은 장면이 줄에 있어도 알림이 보인다', () => {
    useProto.setState({ scenes: [{ id: 'x', lines: [] } as never], beatUntil: Date.now() + 2600 });
    say('승급', 5500, true);
    vi.advanceTimersByTime(500);
    expect(now()).toBe('승급');
    vi.advanceTimersByTime(2500);
    expect(now()).toBe(null);
    useProto.setState({ scenes: [] });
    vi.advanceTimersByTime(7000);
  });
  it('같은 글은 한 번만', () => {
    say('같다', 3000); say('같다', 3000);
    vi.advanceTimersByTime(3300);
    expect(now()).toBe(null);
  });
  it('큰 등급 상자는 숨보다 길다', () => {
    expect(burstMs(3)).toBeGreaterThan(2600);
    expect(burstMs(1)).toBeLessThan(2600);
  });
  it('바람 세기 말', () => {
    expect(gustWord(0.5)).toBe('잔바람'); expect(gustWord(1)).toBe('보통 바람'); expect(gustWord(1.6)).toBe('센바람'); expect(gustWord(2.4)).toBe('돌풍');
  });
});

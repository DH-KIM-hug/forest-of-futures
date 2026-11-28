// 가려진 동안 정산 시계를 멈춘다(U-58, 사용자 결정: "접속 안 했을 때 걷어가면 안 된다").
// 앱을 닫은 동안은 따라잡기(offline.ts catchUp)가 정산을 돌리지 않는다. 이 시계는 그 반쪽: 탭이 가려졌을 때(폰을 내려놓음, 다른 앱).
//   - 가려진 지 FREEZE_GRACE_SEC 초가 지나면 그 뒤의 틱은 frozen(시세와 포지션만 움직이고 정산 시계는 그대로)
//   - 틱이 그 시각의 것인지는 틱 번호(초, 벽시계)로 판다: 숨은 동안 멈춰 있던 타이머가 돌아와서 한꺼번에 뱉는 틱도 가려진 때의 틱이면 멈춘다
//   - 연습 시세처럼 틱 번호가 벽시계가 아니면 지금 가려졌는지(frozenNow)로 판다
// 순수 상태(시각을 받는다). 브라우저 배선은 wireAwayClock.

/** 이만큼(초)은 가려져도 그대로 돈다: 알림을 잠깐 내려 보거나 앱을 휙 바꾸는 정도 */
export const FREEZE_GRACE_SEC = 5;
/** 기억해 둘 가려진 구간 수 */
const KEEP = 8;

export class AwayClock {
  /** 지금 가려져 있으면 가려진 시각(초) */
  hiddenAt: number | null = null;
  /** 지난 가려진 구간 [멈춘 시각, 다시 보인 시각) (초) */
  spans: [number, number][] = [];
  constructor(readonly graceSec = FREEZE_GRACE_SEC) {}

  hide(nowMs: number): void {
    if (this.hiddenAt === null) this.hiddenAt = nowMs / 1000;
  }
  show(nowMs: number): void {
    if (this.hiddenAt === null) return;
    const from = this.hiddenAt + this.graceSec;
    const to = nowMs / 1000;
    this.hiddenAt = null;
    if (to > from) {
      this.spans.push([from, to]);
      if (this.spans.length > KEEP) this.spans.shift();
    }
  }
  /** 지금 가려진 지 유예를 넘겼는가 */
  frozenNow(nowMs: number): boolean {
    return this.hiddenAt !== null && nowMs / 1000 >= this.hiddenAt + this.graceSec;
  }
  /** 벽시계 초 sec 의 틱이 멈춘 구간 안인가 */
  frozenAt(sec: number): boolean {
    if (this.hiddenAt !== null && sec >= Math.floor(this.hiddenAt + this.graceSec)) return true;
    return this.spans.some(([a, b]) => sec >= Math.floor(a) && sec < Math.ceil(b));
  }
}

/** 앱 하나에 하나 */
export const awayClock = new AwayClock();

let wired = false;
/** visibilitychange 를 받아 시계를 움직인다. 처음부터 가려진 채 열렸으면 그때부터 */
export function wireAwayClock(doc: Document = document, now: () => number = () => Date.now()): void {
  if (wired) return;
  wired = true;
  if (doc.hidden) awayClock.hide(now());
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) awayClock.hide(now()); else awayClock.show(now()); });
  window.addEventListener('pagehide', () => awayClock.hide(now()));
  window.addEventListener('pageshow', () => { if (!doc.hidden) awayClock.show(now()); });
}

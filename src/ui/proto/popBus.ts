// 고비 팝 하나를 띄운다(U-49): 거래소에서는 그 종목의 숫자 위, 집 · 지도에서는 세상 위(Juice.tsx). 셋까지 쌓이고 1.9초 뒤 사라진다.
// U-51: 한 틱에 둘 이상 뜨면 서로 덮던 것 — 줄을 세운다. 앞 팝이 뜬 지 POP_GAP 이 지나야 다음 팝이 뜨고(소리도 그때), 새 팝은 아래에서 솟아 앞 팝을 위로 민다.
//   줄이 너무 길어지면(셋 넘게 기다리면) 작은 팝(금빛 · 살았다가 아닌 것)은 건너뛴다 — 지난 고비를 몇 초 늦게 보여 주는 것은 손맛이 아니다.
import { useProto } from './protoStore';

let popK = 0;
export const POP_MS = 1900;
/** 팝 사이의 틈(ms): 한 박자. 둘이 같은 틱에 와도 둘 다 읽힌다 */
export const POP_GAP = 560;
const BIG = new Set(['gold', 'saved', 'half']);
let nextAt = 0;
let waiting = 0;
function show(text: string, cls: string, market: string, snd?: () => void, sub?: string): void {
  const k = ++popK;
  const P = useProto.getState();
  P.patch({ pops: [...P.pops.slice(-2), { k, text, cls, market, sub }] });
  window.setTimeout(() => useProto.getState().patch({ pops: useProto.getState().pops.filter((x) => x.k !== k) }), POP_MS);
  snd?.();
}
/** 다음 팝이 뜰 때(ms, 지금부터). 순수 함수: 시험용 */
export function popDelay(now: number, next: number): number {
  return Math.max(0, next - now);
}
export function pushPop(text: string, cls: string, market: string, snd?: () => void, sub?: string): void {
  const now = Date.now();
  const wait = popDelay(now, nextAt);
  if (wait > 0 && waiting >= 3 && !BIG.has(cls)) return;
  nextAt = now + wait + POP_GAP;
  if (wait <= 0) { show(text, cls, market, snd, sub); return; }
  waiting++;
  window.setTimeout(() => { waiting--; show(text, cls, market, snd, sub); }, wait);
}

let pingK = 0;
/** 나무가 판에 한 일(U-50): 거래소 머리의 「나무」 칩이 반짝인다(id = 노드) */
export function treePing(id: string, text: string): void {
  useProto.getState().patch({ treePing: { k: ++pingK, id, text } });
}

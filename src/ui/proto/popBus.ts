// 고비 팝 하나를 띄운다(U-49): 거래소에서는 그 종목의 숫자 위, 집 · 지도에서는 세상 위(Juice.tsx). 셋까지 쌓이고 1.9초 뒤 사라진다.
import { useProto } from './protoStore';

let popK = 0;
export const POP_MS = 1900;
export function pushPop(text: string, cls: string, market: string, snd?: () => void): void {
  const k = ++popK;
  const P = useProto.getState();
  P.patch({ pops: [...P.pops.slice(-2), { k, text, cls, market }] });
  window.setTimeout(() => useProto.getState().patch({ pops: useProto.getState().pops.filter((x) => x.k !== k) }), POP_MS);
  snd?.();
}

// 코인 로고(U-40): 종목 id → 그림 파일. 기준 그림은 docs/art/v5/golden/coins/, 여기 것은 웹용으로 줄인 사본(docs/art/v5/mkweb_coins.py).
// 실제 로고의 실루엣을 숲 재료로 바꾼 패러디다(도토코인 · 밤더리움 · 삼솔전자 · 멍도토 · 잣스닥).
import DTC from './img/coins/DTC.webp';
import BTH from './img/coins/BTH.webp';
import SMS from './img/coins/SMS.webp';
import MDT from './img/coins/MDT.webp';
import JQQ from './img/coins/JQQ.webp';

export const COIN_LOGO: Record<string, string> = { DTC, BTH, SMS, MDT, JQQ };
/** 그 종목의 로고 파일(없으면 null — 화면이 예전 SVG 동전으로 그린다) */
export const coinLogo = (id: string): string | null => COIN_LOGO[id] ?? null;
/** 날아가는 코인 · 지갑처럼 HTML 문자열로 넣는 자리용 */
export const coinImgHtml = (id: string, size = 16): string | null => {
  const src = coinLogo(id);
  return src ? `<img src="${src}" width="${size}" height="${size}" alt="" draggable="false" style="display:block;border-radius:50%">` : null;
};

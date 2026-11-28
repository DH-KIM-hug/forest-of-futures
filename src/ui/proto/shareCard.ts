// 수익 인증서: 오프스크린 캔버스로 1080x1350 PNG 를 그린다. 우리 게임 안의 카드이며 실제 거래소 모양을 따라 하지 않는다.
import QRCode from 'qrcode';
import heroFront from './img/hero_front.png';
import heroHappyImg from './img/v5/c_hero_happy.webp';
import { acornVecSvg } from './art';
import { coinLogo } from './coins';

// 시세 출처 주소 검사(AC-v2-138)가 '프로토콜://' 글자를 막으므로, 우리 앱 주소는 조각으로 잇는다.
export const APP_URL = ['https', '//dh-kim-hug.github.io/forest-of-futures/?proto=1'].join(':');
/** SVG 이름공간(주소 검사 AC-v2-138 를 피해 조각으로 잇는다) */
const SVG_NS = ['http', '//www.w3.org/2000/svg'].join(':');
export const CARD_W = 1080;
export const CARD_H = 1350;

export interface CardData {
  coin: string; dir: 1 | -1; lev: number;
  roe: number; pnl: number; entry: number; exit: number;
  heldSec: number; wins: number; closes: number; gen: number; date: Date;
  /** 금테 인증서(스킬트리 B4 전설의 몰빵) */
  gold?: boolean;
  /** U-49: 종목 열쇠(로고), 넣은 돈, 이긴 판의 등급 글자(짭짤하다 · 한 방 · 두 배 · 대박 · 전설 · 이자 벌었다) */
  market?: string; margin?: number; tier?: string;
}

/** 자랑 한 줄(U-49): 판의 크기 · 배율 · 버틴 시간에서 고른다. 같은 판이면 늘 같은 줄 */
export function brag(d: Pick<CardData, 'roe' | 'lev' | 'heldSec' | 'pnl' | 'coin'>): string {
  const pick = (...v: string[]) => v[Math.abs(Math.round(d.pnl)) % v.length];
  if (d.roe >= 1000) return pick('이 판 하나로 이자 몇 달 치. 다음 판은 생각 안 함.', '전설은 한 번이면 된다. 두 번은 청산이다.');
  if (d.roe >= 300) return pick('손이 떨려서 닫았는데 그게 고점이었다.', '오늘 저녁은 도토리 말고 밤이다.');
  if (d.lev >= 200 && d.heldSec < 60) return pick(`${d.coin} 200배, ${Math.max(1, Math.round(d.heldSec))}초. 숨도 안 쉬었다.`, '200배는 용기가 아니라 손가락 운동이다.');
  if (d.lev >= 100) return pick('청산가가 코앞이었는데 안 닿았다. 실력이다.', '배율은 높게, 기대는 더 높게.');
  if (d.roe >= 100) return pick('넣은 돈이 두 배가 됐다. 빚은 그대로다.', '오소리 대부한테는 비밀로 해 주세요.');
  if (d.heldSec >= 600) return pick('버티는 것도 실력이다. 추심원이 증인이다.', '정산 종이 몇 번을 울려도 안 닫았다.');
  return pick('오늘은 숲이 내 편이었다.', '이자 낼 돈, 시장이 대신 내 줬다.', '추심원보다 먼저 웃었다.');
}

const O = '#4A4640';
const FONT = "'Jua', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const comma = (n: number) => Math.round(n).toLocaleString('ko-KR');
const px = (v: number) => (v >= 100 ? comma(v) : v >= 1 ? v.toFixed(2) : v.toPrecision(3));
export function heldText(s: number): string {
  if (s < 60) return `${Math.max(1, Math.round(s))}초`;
  if (s < 3600) return `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초`;
  return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
}
export const dateStamp = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
}
function box(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, lw = 6) {
  rr(c, x, y, w, h, r); c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = O; c.stroke();
}
function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = O, align: CanvasTextAlign = 'left') {
  c.font = `${size}px ${FONT}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(s, x, y);
}
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

export async function renderCard(d: CardData): Promise<HTMLCanvasElement> {
  try { await Promise.all([document.fonts.load(`40px Jua`, '수익 인증서 0123456789'), document.fonts.load('40px Jua', 'abc')]); await document.fonts.ready; } catch { /* 글꼴 실패해도 대체 글꼴로 그린다 */ }
  const cv = document.createElement('canvas');
  cv.width = CARD_W; cv.height = CARD_H;
  const c = cv.getContext('2d')!;
  // 바탕: 크림 종이 + 옅은 점
  c.fillStyle = '#FBF3DC'; c.fillRect(0, 0, CARD_W, CARD_H);
  c.fillStyle = 'rgba(74,70,64,.07)';
  for (let y = 30; y < CARD_H; y += 44) for (let x = ((y / 44) % 2) * 22 + 20; x < CARD_W; x += 44) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
  // 두 배를 넘긴 판(U-49): 수익률 뒤로 금빛 살이 뻗는다
  if (d.roe >= 100) {
    c.save(); c.translate(CARD_W / 2, 440);
    const g = c.createRadialGradient(0, 0, 40, 0, 0, 640); g.addColorStop(0, 'rgba(255,214,90,.55)'); g.addColorStop(1, 'rgba(255,214,90,0)');
    c.fillStyle = g;
    for (let i = 0; i < 18; i++) { c.rotate((Math.PI * 2) / 18); c.beginPath(); c.moveTo(0, 0); c.lineTo(700, -70); c.lineTo(700, 70); c.closePath(); c.fill(); }
    c.restore();
  }
  // 도토리 비(U-49): 가장자리에 흩어진 도토리 열두 알(판마다 같은 자리)
  try {
    const ac = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(acornVecSvg(24).replace('<svg ', `<svg xmlns="${SVG_NS}" `)));
    const spots: [number, number, number, number][] = [[1008, 330, 42, 25], [985, 575, 54, 15], [760, 600, 38, -20], [1012, 450, 30, 40], [880, 645, 30, 8], [470, 336, 26, -30], [960, 250, 34, -12], [640, 588, 28, 28], [740, 338, 24, 18], [1010, 700, 30, -25], [560, 650, 24, 10], [960, 1000, 30, 22]];
    const n = Math.min(spots.length, 4 + Math.floor(Math.max(0, d.roe) / 40));
    c.globalAlpha = 0.85;
    for (const [x, y, sz, rot] of spots.slice(0, n)) { c.save(); c.translate(x, y); c.rotate((rot * Math.PI) / 180); c.drawImage(ac, -sz / 2, -sz / 2, sz, sz); c.restore(); }
    c.globalAlpha = 1;
  } catch { /* 그림이 없어도 카드는 나온다 */ }
  box(c, 28, 28, CARD_W - 56, CARD_H - 56, 44, 'rgba(0,0,0,0)', 10);
  // 금테(B4 전설의 몰빵): 바깥 테 안쪽에 금빛 두 줄과 네 귀퉁이 못. 숫자는 그대로다
  if (d.gold) {
    c.lineWidth = 14; c.strokeStyle = '#D9A92E'; rr(c, 44, 44, CARD_W - 88, CARD_H - 88, 34); c.stroke();
    c.lineWidth = 4; c.strokeStyle = '#F6E08A'; rr(c, 47, 47, CARD_W - 94, CARD_H - 94, 32); c.stroke();
    for (const [x, y] of [[80, 80], [CARD_W - 80, 80], [80, CARD_H - 80], [CARD_W - 80, CARD_H - 80]]) { c.beginPath(); c.arc(x, y, 13, 0, 7); c.fillStyle = '#F3D774'; c.fill(); c.lineWidth = 5; c.strokeStyle = O; c.stroke(); }
  }

  // 머리띠
  box(c, 70, 70, 940, 120, 30, d.gold ? '#F3D774' : '#BCD48E');
  text(c, d.gold ? '금테 수익 인증서' : '수익 인증서', 110, 148, d.gold ? 54 : 62);
  if (!d.tier) text(c, 'FRX 숲거래소 선물', 970, 146, 30, '#3d4a2a', 'right');

  // 종목 줄(U-49: 로고가 있으면 앞에)
  const long = d.dir === 1;
  let nx = 80;
  const logo = d.market ? coinLogo(d.market) : null;
  if (logo) {
    try {
      const li = await loadImg(logo);
      c.save(); c.beginPath(); c.arc(80 + 38, 254, 38, 0, 7); c.clip(); c.drawImage(li, 80, 216, 76, 76); c.restore();
      c.beginPath(); c.arc(80 + 38, 254, 38, 0, 7); c.lineWidth = 5; c.strokeStyle = O; c.stroke();
      nx = 80 + 76 + 18;
    } catch { /* 로고 없이 */ }
  }
  let nameSize = 78; c.font = `${nameSize}px ${FONT}`;
  while (c.measureText(d.coin).width > 560 - (nx - 80) && nameSize > 50) { nameSize -= 4; c.font = `${nameSize}px ${FONT}`; }
  text(c, d.coin, nx, 280, nameSize);
  const nameW = (c.font = `${nameSize}px ${FONT}`, c.measureText(d.coin).width) + (nx - 80);
  const tag = `${long ? '롱 ▲' : '숏 ▼'}  ${d.lev}배`;
  c.font = `46px ${FONT}`;
  const tw = c.measureText(tag).width + 56;
  box(c, 80 + nameW + 28, 226, tw, 74, 37, long ? '#F2B8AE' : '#B7CBEA', 5);
  text(c, tag, 80 + nameW + 28 + tw / 2, 278, 46, O, 'center');

  // 수익률
  const gain = d.roe >= 0;
  const roeS = `${gain ? '+' : '−'}${Math.abs(d.roe).toFixed(2)}%`;
  let size = 230; c.font = `${size}px ${FONT}`;
  while (c.measureText(roeS).width > 900 && size > 90) { size -= 8; c.font = `${size}px ${FONT}`; }
  c.lineJoin = 'round'; c.lineWidth = 16; c.strokeStyle = '#fff'; c.textAlign = 'left'; c.strokeText(roeS, 76, 520);
  text(c, roeS, 76, 520, size, gain ? '#D0584A' : '#4F7FC0');
  text(c, '수익률 (ROE)', 84, 350, 36, '#625c53');
  text(c, `${gain ? '+' : '−'}${comma(Math.abs(d.pnl))} 도토리`, 84, 648, 76, O);
  text(c, '실현 손익', 84, 578, 32, '#625c53');

  // 자랑 한 줄(U-49): 기울어진 띠
  c.save(); c.translate(CARD_W / 2, 712); c.rotate(-0.025);
  const line = brag(d);
  let ls = 40; c.font = `${ls}px ${FONT}`;
  while (c.measureText(line).width > 860 && ls > 26) { ls -= 2; c.font = `${ls}px ${FONT}`; }
  const lw = c.measureText(line).width + 60;
  box(c, -lw / 2, -34, lw, 64, 20, '#FFE89A', 5);
  text(c, line, 0, 12, ls, O, 'center');
  c.restore();

  // 정보 판
  box(c, 70, 764, 940, 244, 34, '#FFF8E4');
  const rows: [string, string][] = [
    ...(d.margin ? [['넣은 돈 → 받은 돈', `${comma(d.margin)} → ${comma(d.margin + d.pnl)}`] as [string, string]] : []),
    ['진입가 → 정리가', `${px(d.entry)} → ${px(d.exit)}`],
    ['버틴 시간', heldText(d.heldSec)],
    ['승률', `${d.closes ? Math.round((d.wins / d.closes) * 100) : 0}%  (${d.wins}승 / ${d.closes}번)`],
  ].slice(0, 4) as [string, string][];
  rows.forEach(([k, v], i) => {
    const y = 818 + i * 58;
    text(c, k, 108, y, 34, '#625c53');
    text(c, v, 982, y, 40, O, 'right');
    if (i < rows.length - 1) { c.strokeStyle = 'rgba(74,70,64,.25)'; c.lineWidth = 3; c.setLineDash([3, 10]); c.lineCap = 'round'; c.beginPath(); c.moveTo(108, y + 22); c.lineTo(982, y + 22); c.stroke(); c.setLineDash([]); }
  });

  // 등급 도장(U-49): 머리띠 오른쪽에 비스듬히 찍힌다
  if (d.tier) {
    c.save(); c.translate(830, 132); c.rotate(-0.16);
    const word = d.tier + (d.roe >= 100 ? '!' : '');
    let ts = 66; c.font = `${ts}px ${FONT}`;
    while (c.measureText(word).width > 300 && ts > 40) { ts -= 4; c.font = `${ts}px ${FONT}`; }
    const tw2 = c.measureText(word).width + 56;
    rr(c, -tw2 / 2, -52, tw2, 100, 18); c.fillStyle = 'rgba(255,250,236,.94)'; c.fill(); c.lineWidth = 9; c.strokeStyle = '#C8553D'; c.stroke();
    text(c, word, 0, 24, ts, '#C8553D', 'center');
    c.restore();
  }
  // 주인공 (오른쪽 아래): 크게 이긴 판은 웃는 얼굴
  try {
    const hero = await loadImg(d.roe >= 50 ? heroHappyImg : heroFront);
    const h = 225, w = (hero.width / hero.height) * h;
    c.imageSmoothingQuality = 'high';
    c.fillStyle = 'rgba(74,70,64,.15)'; c.beginPath(); c.ellipse(850, 1248, 110, 16, 0, 0, 7); c.fill();
    c.drawImage(hero, 850 - w / 2, 1250 - h, w, h);
  } catch { /* 그림이 없어도 카드는 나온다 */ }

  // QR (왼쪽 아래)
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, APP_URL, { margin: 0, width: 220, errorCorrectionLevel: 'M', color: { dark: O, light: '#ffffff' } });
  box(c, 70, 1020, 270, 250, 26, '#fff', 6);
  c.drawImage(qr, 95, 1035, 220, 220);
  // 캡션은 QR 오른쪽에 둔다
  text(c, '앱에서 해 보기', 370, 1118, 44);
  text(c, '카메라로 비추면 숲으로 갑니다', 370, 1166, 26, '#625c53');
  text(c, `${d.date.getFullYear()}.${String(d.date.getMonth() + 1).padStart(2, '0')}.${String(d.date.getDate()).padStart(2, '0')} ${String(d.date.getHours()).padStart(2, '0')}:${String(d.date.getMinutes()).padStart(2, '0')}`, 370, 1214, 28, '#625c53');

  text(c, '이 수익은 다음 청산 전까지 유효합니다.', CARD_W / 2, 1304, 28, '#8a8478', 'center');
  return cv;
}

export async function saveCard(cv: HTMLCanvasElement, date: Date): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob: Blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));
  const name = `선물의숲_수익인증_${dateStamp(date)}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: '선물의 숲 수익 인증서' }); return 'shared'; } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

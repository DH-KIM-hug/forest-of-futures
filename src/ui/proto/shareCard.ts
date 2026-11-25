// 수익 인증서: 오프스크린 캔버스로 1080x1350 PNG 를 그린다. 우리 게임 안의 카드이며 실제 거래소 모양을 따라 하지 않는다.
import QRCode from 'qrcode';
import heroFront from './img/hero_front.png';

// 시세 출처 주소 검사(AC-v2-138)가 '프로토콜://' 글자를 막으므로, 우리 앱 주소는 조각으로 잇는다.
export const APP_URL = ['https', '//dh-kim-hug.github.io/forest-of-futures/?proto=1'].join(':');
export const CARD_W = 1080;
export const CARD_H = 1350;

export interface CardData {
  coin: string; dir: 1 | -1; lev: number;
  roe: number; pnl: number; entry: number; exit: number;
  heldSec: number; wins: number; closes: number; gen: number; date: Date;
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
  box(c, 28, 28, CARD_W - 56, CARD_H - 56, 44, 'rgba(0,0,0,0)', 10);

  // 머리띠
  box(c, 70, 70, 940, 120, 30, '#BCD48E');
  text(c, '수익 인증서', 110, 148, 62);
  text(c, 'FRX 숲거래소 · 선물시장', 970, 146, 30, '#3d4a2a', 'right');

  // 종목 줄
  const long = d.dir === 1;
  text(c, d.coin, 80, 280, 78);
  const nameW = (c.font = `78px ${FONT}`, c.measureText(d.coin).width);
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
  text(c, roeS, 76, 520, size, gain ? '#2E6E4C' : '#B8432C');
  text(c, '수익률 (ROE)', 84, 350, 36, '#625c53');
  text(c, `${gain ? '+' : '−'}${comma(Math.abs(d.pnl))} 도토리`, 84, 648, 76, O);
  text(c, '실현 손익', 84, 578, 32, '#625c53');

  // 정보 판
  box(c, 70, 696, 940, 300, 34, '#FFF8E4');
  const rows: [string, string][] = [
    ['진입가 → 정리가', `${px(d.entry)} → ${px(d.exit)}`],
    ['버틴 시간', heldText(d.heldSec)],
    ['이번 생 승률', `${d.closes ? Math.round((d.wins / d.closes) * 100) : 0}%  (${d.wins}승 / ${d.closes}번)`],
    ['몇 번째 생', `${d.gen}번째 생`],
  ];
  rows.forEach(([k, v], i) => {
    const y = 763 + i * 70;
    text(c, k, 108, y, 34, '#625c53');
    text(c, v, 982, y, 40, O, 'right');
    if (i < rows.length - 1) { c.strokeStyle = 'rgba(74,70,64,.25)'; c.lineWidth = 3; c.setLineDash([3, 10]); c.lineCap = 'round'; c.beginPath(); c.moveTo(108, y + 28); c.lineTo(982, y + 28); c.stroke(); c.setLineDash([]); }
  });

  // 주인공 (오른쪽 아래)
  try {
    const hero = await loadImg(heroFront);
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

  text(c, '※ 이 수익은 다음 청산 전까지 유효합니다.', CARD_W / 2, 1304, 28, '#8a8478', 'center');
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

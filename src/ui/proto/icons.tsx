// 그림 아이콘(docs/art/v5/icons/sheet1.png 를 docs/art/v5/mkweb_icons.py 로 오린 것). 목록과 이유는 docs/gdd/LITE_ICONS.md
import './icons.css';
import phone from './img/icons/phone.webp';
import loan from './img/icons/loan.webp';
import board from './img/icons/board.webp';
import book from './img/icons/book.webp';
import news from './img/icons/news.webp';
import soundOn from './img/icons/sound_on.webp';
import soundOff from './img/icons/sound_off.webp';
import acorn from './img/icons/acorn.webp';
import lock from './img/icons/lock.webp';
import unlock from './img/icons/unlock.webp';
import dice from './img/icons/dice.webp';
import fruit from './img/icons/fruit.webp';

export const ICON = { phone, loan, board, book, news, soundOn, soundOff, acorn, lock, unlock, dice, fruit };
export type IconName = keyof typeof ICON;

/** 정사각 상자 안에 그림을 맞춰 넣는다(그림 비율은 그대로) */
export function GIcon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return <img className={'gi' + (className ? ' ' + className : '')} src={ICON[name]} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}

/** innerHTML 로 넣는 자리(날아가는 도토리, 도토리 비, 열매)용 */
export const iconHtml = (name: IconName, size?: number) =>
  `<img class="gi" src="${ICON[name]}" alt="" aria-hidden="true" draggable="false"${size ? ` width="${size}" height="${size}"` : ' style="width:100%;height:100%"'}>`;

// 라이트 나무의 열매(U-62) 그림: 붉은 열매 하나에 잎 하나(U-67 그림 아이콘). 날아가는 그림(flyIcons)용 글도 같이
import { iconHtml } from '../icons';
export const FRUIT_SVG = iconHtml('fruit');
export function FruitIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return <i className={'fruit-ic ' + className} style={{ display: 'inline-block', width: size, height: size, verticalAlign: '-0.2em', fontStyle: 'normal' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: FRUIT_SVG }} />;
}

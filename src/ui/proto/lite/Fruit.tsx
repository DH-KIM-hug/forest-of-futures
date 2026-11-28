// 라이트 나무의 열매(U-62) 그림: 붉은 열매 하나에 잎 하나. 날아가는 그림(flyIcons)용 글도 같이
export const FRUIT_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="M12 6.5c1-2.6 3.2-4 5.6-4-.3 2.6-2.4 4.4-5.6 4z" fill="#5C9A5A" stroke="#1d1b19" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="14.5" r="7.5" fill="#E2553B" stroke="#1d1b19" stroke-width="1.6"/><ellipse cx="9.4" cy="12" rx="2" ry="1.3" fill="#fff" opacity=".7" transform="rotate(-30 9.4 12)"/></svg>';
export function FruitIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return <i className={'fruit-ic ' + className} style={{ display: 'inline-block', width: size, height: size, verticalAlign: '-0.2em', fontStyle: 'normal' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: FRUIT_SVG }} />;
}

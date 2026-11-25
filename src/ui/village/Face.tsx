const COLORS: Record<string, string> = {
  bank: '#b79a72', capital: '#e8a45a', shark1: '#9aa0a6', shark2: '#7fb06f',
  squirrel: '#d9a066', raccoon: '#a7a7a7', rabbit: '#f3e6df', fox: '#f08a4b', bear: '#a97a52',
};
export function Face({ who, gone }: { who: string; gone?: boolean }) {
  return (
    <span className={'face' + (gone ? ' gone' : '')} style={{ ['--fc' as any]: COLORS[who] ?? '#d9b38c' }} aria-hidden="true">
      <i />
    </span>
  );
}

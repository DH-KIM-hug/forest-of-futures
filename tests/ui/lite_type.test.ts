// 글자 체계(docs/gdd/LITE_TYPE.md)를 지키는지 CSS 를 읽어 본다.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const PROTO = join(ROOT, 'src/ui/proto');
const cssFiles = [
  ...readdirSync(PROTO).filter((f) => f.endsWith('.css')).map((f) => join(PROTO, f)),
  ...readdirSync(join(PROTO, 'lite')).filter((f) => f.endsWith('.css')).map((f) => join(PROTO, 'lite', f)),
];
const read = (p: string) => readFileSync(p, 'utf8');

describe('라이트 글자 체계', () => {
  it('글꼴은 두 변수로만 고른다(기기 글꼴을 직접 적지 않는다)', () => {
    const bad: string[] = [];
    for (const f of cssFiles) {
      read(f).split('\n').forEach((line, i) => {
        if (/^\s*--font-(display|body):/.test(line)) return; // 정의하는 줄
        if (/-apple-system|system-ui|['"]Nanum|var\(--body\b/.test(line)) bad.push(`${f.replace(ROOT, '')}:${i + 1}`);
        if (/font:\s*[^;]*\bsans-serif\s*;/.test(line)) bad.push(`${f.replace(ROOT, '')}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('Jua 는 굵기 400 하나라 가짜 굵기를 막는다', () => {
    const proto = read(join(PROTO, 'proto.css'));
    expect(proto).toMatch(/--font-display: 'Jua'/);
    expect(proto).toMatch(/font-synthesis: style;/);
  });

  it('Jua 는 @fontsource 한 곳에서만 부른다', () => {
    expect(read(join(ROOT, 'src/main.tsx'))).toMatch(/@fontsource\/jua\/korean-400\.css/);
    expect(read(join(ROOT, 'src/ui/styles.css'))).not.toMatch(/@font-face/);
    expect(existsSync(join(ROOT, 'public/fonts/Jua-Regular.ttf'))).toBe(false);
  });
});

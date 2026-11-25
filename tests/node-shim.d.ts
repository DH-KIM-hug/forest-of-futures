// @types/node 없이 테스트에서 쓰는 최소 선언 (파일 읽기만).
declare const __dirname: string;
declare module 'node:fs' {
  export function readFileSync(path: string, enc: 'utf8'): string;
  export function readdirSync(path: string): string[];
}
declare module 'node:path' {
  export function join(...p: string[]): string;
}

declare module '*?raw' {
  const content: string;
  export default content;
}
declare module '*.css';
declare module '*.png' {
  const src: string;
  export default src;
}

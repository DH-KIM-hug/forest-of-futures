// 시제품 그림 부품: 와이어프레임 v3.1(wf.html)의 아이소 그림을 React SVG 로 옮겼다. 새 이미지 생성 없음.
// 규칙(§11): 아이소 2:1, 외곽선 #4A4640, 평면 파스텔, 왼쪽 위 빛(윗면 100%, 왼쪽 86%, 오른쪽 72%).
import type { ReactNode } from 'react';

export const O = '#4A4640';
export const C = {
  grass: '#A9C77E', lot: '#BCD48E', forest1: '#6E9E63', forest2: '#7AA86B', dirt: '#D9B98A',
  wall: '#C9955C', floor: '#E3C08D', darkWood: '#9A6B45', stone: '#B9B4A6', cream: '#FBF3DC',
  paper: '#F3E7C6', card: '#FFF8E4', orange: '#F4B56A', red: '#C8553D', teal: '#2F7F86',
  gold: '#E8C24A', fur: '#D98F4E', dtc: '#B9834F', bth: '#8E79B8', mdt: '#E0B84A', sms: '#6C93C4', mint: '#9AD0C2', leaf: '#7FAE6A',
};
export const dk = (hex: string, k = 0.82): string => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${(r * k) | 0},${(g * k) | 0},${(b * k) | 0})`;
};
type Pt = [number, number];
const pts = (p: Pt[]) => p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');

export const Poly = ({ p, fill, sw = 2.5, dash }: { p: Pt[]; fill: string; sw?: number; dash?: string }) => (
  <polygon points={pts(p)} fill={fill} stroke={O} strokeWidth={sw} strokeLinejoin="round" strokeDasharray={dash} strokeLinecap="round" />
);
/** 바닥 마름모. (cx, cy) = 앞 모서리(발밑), hw = 가로 반폭 */
export const Dia = ({ cx, cy, hw, fill, sw = 2.5, dash }: { cx: number; cy: number; hw: number; fill: string; sw?: number; dash?: string }) => (
  <Poly p={[[cx - hw, cy - hw / 2], [cx, cy], [cx + hw, cy - hw / 2], [cx, cy - hw]]} fill={fill} sw={sw} dash={dash} />
);
export const Cube = ({ cx, cy, hw, h, fill }: { cx: number; cy: number; hw: number; h: number; fill: string }) => (
  <g>
    <Poly p={[[cx - hw, cy - hw / 2], [cx, cy], [cx, cy - h], [cx - hw, cy - hw / 2 - h]]} fill={dk(fill, 0.86)} />
    <Poly p={[[cx, cy], [cx + hw, cy - hw / 2], [cx + hw, cy - hw / 2 - h], [cx, cy - h]]} fill={dk(fill, 0.72)} />
    <Poly p={[[cx - hw, cy - hw / 2 - h], [cx, cy - h], [cx + hw, cy - hw / 2 - h], [cx, cy - hw - h]]} fill={fill} />
  </g>
);
/** 지붕을 걷은 단면 집: 뒤쪽 벽 둘 + 바닥 */
export const Room = ({ cx, cy, hw, h, floor = C.floor, wall = C.wall, children }: { cx: number; cy: number; hw: number; h: number; floor?: string; wall?: string; children?: ReactNode }) => (
  <g>
    <Poly p={[[cx - hw, cy - hw / 2], [cx, cy - hw], [cx, cy - hw - h], [cx - hw, cy - hw / 2 - h]]} fill={wall} />
    <Poly p={[[cx, cy - hw], [cx + hw, cy - hw / 2], [cx + hw, cy - hw / 2 - h], [cx, cy - hw - h]]} fill={dk(wall, 0.88)} />
    <Dia cx={cx} cy={cy} hw={hw} fill={floor} />
    {children}
  </g>
);
export const Tent = ({ cx, cy, s = 1 }: { cx: number; cy: number; s?: number }) => (
  <g>
    <Poly p={[[cx - 60 * s, cy - 30 * s], [cx, cy], [cx, cy - 110 * s]]} fill="#D8A46A" />
    <Poly p={[[cx, cy], [cx + 60 * s, cy - 30 * s], [cx, cy - 110 * s]]} fill="#B98552" />
    <Poly p={[[cx - 12 * s, cy - 6 * s], [cx, cy], [cx, cy - 40 * s], [cx - 8 * s, cy - 30 * s]]} fill={dk('#B98552', 0.7)} sw={2} />
  </g>
);
export const Tree = ({ cx, cy, r, h }: { cx: number; cy: number; r: number; h: number }) => (
  <g>
    <rect x={cx - r * 0.16} y={cy - h} width={r * 0.32} height={h} rx={4} fill={C.darkWood} stroke={O} strokeWidth={2.5} />
    <g className="pa-leaves" style={{ transformOrigin: `${cx}px ${cy - h}px` }}>
      <circle cx={cx} cy={cy - h - r * 0.5} r={r} fill={C.leaf} stroke={O} strokeWidth={2.5} />
      <circle cx={cx - r * 0.55} cy={cy - h - r * 0.1} r={r * 0.6} fill={C.leaf} stroke={O} strokeWidth={2.5} />
      <circle cx={cx + r * 0.6} cy={cy - h - r * 0.2} r={r * 0.55} fill={C.leaf} stroke={O} strokeWidth={2.5} />
      <circle cx={cx} cy={cy - h - r * 0.45} r={r * 0.85} fill={C.leaf} />
      <circle cx={cx - r * 0.3} cy={cy - h - r * 0.8} r={r * 0.22} fill="#93BE7C" />
    </g>
  </g>
);
/** 쳇바퀴: 받침 + 두께 + 바퀴 + 안쪽 살 줄무늬(돌면 줄무늬가 흐른다). (cx, cy) = 받침 발밑 */
/** 쳇바퀴가 돌 때 튀는 전기(번개 하나). 쳇바퀴 = 발전 → 채굴 */
export const Zap = ({ cx, cy, s = 1, delay = 0 }: { cx: number; cy: number; s?: number; delay?: number }) => (
  <g className="pa-zap" style={{ animationDelay: `${delay}s`, transformOrigin: `${cx}px ${cy}px` }}>
    <path transform={`translate(${cx} ${cy}) scale(${s})`} d="M2 -12 L-6 1 H0 L-3 12 L7 -2 H1 L4 -12 Z" fill="#F8D648" stroke={O} strokeWidth={2} strokeLinejoin="round" />
  </g>
);
export const Wheel = ({ cx, cy, w, col, spin = false }: { cx: number; cy: number; w: number; col: string; spin?: boolean }) => {
  const y = cy - w * 0.56;
  return (
    <g>
      <Poly p={[[cx - w * 0.3, cy], [cx + w * 0.3, cy], [cx + w * 0.12, cy - w * 0.5], [cx - w * 0.12, cy - w * 0.5]]} fill={C.darkWood} sw={2} />
      <ellipse cx={cx + w * 0.1} cy={y} rx={w * 0.4} ry={w * 0.46} fill={dk(col, 0.75)} stroke={O} strokeWidth={2.5} />
      <ellipse cx={cx} cy={y} rx={w * 0.4} ry={w * 0.46} fill={col} stroke={O} strokeWidth={2.5} />
      <ellipse cx={cx} cy={y} rx={w * 0.28} ry={w * 0.33} fill={C.cream} stroke={O} strokeWidth={2} />
      <ellipse className={spin ? 'pa-spin' : undefined} cx={cx} cy={y} rx={w * 0.34} ry={w * 0.395} fill="none" stroke={O} strokeOpacity={0.55} strokeWidth={w * 0.05} strokeDasharray={`${w * 0.06} ${w * 0.1}`} />
      {spin && <Zap cx={cx + w * 0.42} cy={y - w * 0.42} s={Math.max(0.8, w / 50)} />}
      {spin && <Zap cx={cx - w * 0.44} cy={y - w * 0.2} s={Math.max(0.65, w / 64)} delay={0.45} />}
    </g>
  );
};
export const Hamster = ({ cx, cy, h, run = false }: { cx: number; cy: number; h: number; run?: boolean }) => (
  <g className={run ? 'pa-hop' : undefined} style={{ transformOrigin: `${cx}px ${cy}px` }}>
    <ellipse cx={cx} cy={cy + 1} rx={h * 0.32} ry={h * 0.08} fill="#000" opacity={0.12} />
    <ellipse cx={cx} cy={cy - h * 0.3} rx={h * 0.3} ry={h * 0.32} fill="#E8C27A" stroke={O} strokeWidth={2} />
    <circle cx={cx - h * 0.22} cy={cy - h * 0.95} r={h * 0.1} fill="#E8C27A" stroke={O} strokeWidth={2} />
    <circle cx={cx + h * 0.22} cy={cy - h * 0.95} r={h * 0.1} fill="#E8C27A" stroke={O} strokeWidth={2} />
    <circle cx={cx} cy={cy - h * 0.7} r={h * 0.3} fill="#E8C27A" stroke={O} strokeWidth={2} />
    <ellipse cx={cx} cy={cy - h * 0.6} rx={h * 0.17} ry={h * 0.11} fill="#FBEBCB" />
    <rect x={cx - h * 0.28} y={cy - h * 0.98} width={h * 0.56} height={h * 0.12} rx={3} fill={C.wall} stroke={O} strokeWidth={1.8} />
    <circle cx={cx - h * 0.1} cy={cy - h * 0.7} r={1.6} fill={O} />
    <circle cx={cx + h * 0.1} cy={cy - h * 0.7} r={1.6} fill={O} />
  </g>
);
/** 다람쥐(단짝): 회갈색 몸, 큰 꼬리, 리본 없음 */
export const Squirrel = ({ cx, cy, h, hop = false }: { cx: number; cy: number; h: number; hop?: boolean }) => (
  <g className={hop ? 'pa-hop' : undefined} style={{ transformOrigin: `${cx}px ${cy}px` }}>
    <ellipse cx={cx} cy={cy + 1} rx={h * 0.34} ry={h * 0.08} fill="#000" opacity={0.13} />
    <path d={`M${cx + h * 0.2} ${cy - h * 0.12} q${h * 0.5} ${-h * 0.05} ${h * 0.3} ${-h * 0.62} q${-h * 0.1} ${h * 0.08} ${-h * 0.16} ${h * 0.02} q${h * 0.08} ${h * 0.22} ${-h * 0.14} ${h * 0.4}z`} fill="#A98B6E" stroke={O} strokeWidth={2} strokeLinejoin="round" />
    <ellipse cx={cx} cy={cy - h * 0.3} rx={h * 0.28} ry={h * 0.31} fill="#9C8168" stroke={O} strokeWidth={2} />
    <ellipse cx={cx} cy={cy - h * 0.24} rx={h * 0.16} ry={h * 0.2} fill="#E8DCC6" />
    <path d={`M${cx - h * 0.24} ${cy - h * 0.92} l${h * 0.04} ${-h * 0.14} l${h * 0.12} ${h * 0.1}z M${cx + h * 0.24} ${cy - h * 0.92} l${-h * 0.04} ${-h * 0.14} l${-h * 0.12} ${h * 0.1}z`} fill="#8B7158" stroke={O} strokeWidth={2} strokeLinejoin="round" />
    <circle cx={cx} cy={cy - h * 0.68} r={h * 0.29} fill="#9C8168" stroke={O} strokeWidth={2} />
    <ellipse cx={cx} cy={cy - h * 0.58} rx={h * 0.17} ry={h * 0.11} fill="#E8DCC6" />
    <circle cx={cx - h * 0.1} cy={cy - h * 0.7} r={1.7} fill={O} />
    <circle cx={cx + h * 0.1} cy={cy - h * 0.7} r={1.7} fill={O} />
    <ellipse cx={cx} cy={cy - h * 0.62} rx={h * 0.04} ry={h * 0.028} fill={O} />
  </g>
);
/** 곰(동네 형) 얼굴만: 카드 아이콘용 */
export const BearFace = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => (
  <g>
    <circle cx={cx - r * 0.72} cy={cy - r * 0.72} r={r * 0.32} fill="#8A6445" stroke={O} strokeWidth={2} />
    <circle cx={cx + r * 0.72} cy={cy - r * 0.72} r={r * 0.32} fill="#8A6445" stroke={O} strokeWidth={2} />
    <circle cx={cx} cy={cy} r={r} fill="#A67B55" stroke={O} strokeWidth={2.2} />
    <ellipse cx={cx} cy={cy + r * 0.3} rx={r * 0.44} ry={r * 0.34} fill="#E8D2AC" />
    <ellipse cx={cx} cy={cy + r * 0.12} rx={r * 0.13} ry={r * 0.09} fill={O} />
    <circle cx={cx - r * 0.38} cy={cy - r * 0.15} r={1.8} fill={O} />
    <circle cx={cx + r * 0.38} cy={cy - r * 0.15} r={1.8} fill={O} />
  </g>
);
/** 오소리(추심원·대부): 회색 몸, 흰 얼굴 줄, 짙은 눈 줄 */
export const Badger = ({ cx, cy, h }: { cx: number; cy: number; h: number }) => (
  <g>
    <ellipse cx={cx} cy={cy + 1} rx={h * 0.34} ry={h * 0.08} fill="#000" opacity={0.14} />
    <ellipse cx={cx} cy={cy - h * 0.3} rx={h * 0.3} ry={h * 0.32} fill="#8C8478" stroke={O} strokeWidth={2.2} />
    <path d={`M${cx - h * 0.14} ${cy - h * 0.18} h${h * 0.28}`} stroke="#5d5446" strokeWidth={h * 0.16} strokeLinecap="round" />
    <circle cx={cx - h * 0.2} cy={cy - h * 0.95} r={h * 0.09} fill="#5d5446" stroke={O} strokeWidth={2} />
    <circle cx={cx + h * 0.2} cy={cy - h * 0.95} r={h * 0.09} fill="#5d5446" stroke={O} strokeWidth={2} />
    <circle cx={cx} cy={cy - h * 0.72} r={h * 0.29} fill="#EFE8DA" stroke={O} strokeWidth={2.2} />
    <path d={`M${cx - h * 0.12} ${cy - h * 0.98} L${cx - h * 0.08} ${cy - h * 0.62} M${cx + h * 0.12} ${cy - h * 0.98} L${cx + h * 0.08} ${cy - h * 0.62}`} stroke="#3d3a36" strokeWidth={h * 0.07} strokeLinecap="round" />
    <circle cx={cx - h * 0.1} cy={cy - h * 0.72} r={1.8} fill={O} />
    <circle cx={cx + h * 0.1} cy={cy - h * 0.72} r={1.8} fill={O} />
    <ellipse cx={cx} cy={cy - h * 0.6} rx={h * 0.045} ry={h * 0.03} fill={O} />
    {/* 장부 */}
    <rect x={cx + h * 0.12} y={cy - h * 0.42} width={h * 0.24} height={h * 0.28} rx={2} fill={C.paper} stroke={O} strokeWidth={2} transform={`rotate(-8 ${cx} ${cy})`} />
  </g>
);
/** 가시 말풍선(§7.8): 톱니 테두리, 붉은 글씨. 꼬리는 왼쪽 아래 */
export const Spiky = ({ x, y, w, h, text, tail = 18 }: { x: number; y: number; w: number; h: number; text: string; tail?: number }) => {
  const p: Pt[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) p.push([x + (w * i) / n, y + (i % 2 ? -4 : 2)]);
  for (let i = 0; i <= 4; i++) p.push([x + w + (i % 2 ? 6 : -1), y + (h * i) / 4]);
  for (let i = n; i >= 0; i--) p.push([x + (w * i) / n, y + h + (i % 2 ? 4 : -2)]);
  for (let i = 4; i >= 0; i--) p.push([x + (i % 2 ? -6 : 1), y + (h * i) / 4]);
  return (
    <g className="pa-bubble">
      <Poly p={p} fill="#fff" sw={2.2} />
      <Poly p={[[x + tail, y + h], [x + tail + 16, y + h], [x + tail - 6, y + h + 14]]} fill="#fff" sw={2.2} />
      <rect x={x + tail + 1} y={y + h - 4} width={14} height={5} fill="#fff" />
      <text x={x + w / 2} y={y + h / 2 + 4.5} textAnchor="middle" fontSize={12.5} fontWeight={800} fill="#B8432C" className="pa-t">{text}</text>
    </g>
  );
};
/** 둥근 말풍선(평소) */
export const Round = ({ x, y, w, h, text, tail = 18 }: { x: number; y: number; w: number; h: number; text: string; tail?: number }) => (
  <g className="pa-bubble">
    <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={C.cream} stroke={O} strokeWidth={2.2} />
    <Poly p={[[x + tail, y + h - 1], [x + tail + 14, y + h - 1], [x + tail - 4, y + h + 12]]} fill={C.cream} sw={2.2} />
    <rect x={x + tail + 1} y={y + h - 5} width={12} height={5} fill={C.cream} />
    <text x={x + w / 2} y={y + h / 2 + 4.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={O} className="pa-t">{text}</text>
  </g>
);
/** 콜드월렛 기기(도토리 모양) */
export const Device = ({ x, y, k = 1 }: { x: number; y: number; k?: number }) => (
  <g transform={`translate(${x},${y}) scale(${k})`}>
    <path d="M-11 -6 q11 -13 22 0 z" fill="#6B4A35" stroke={O} strokeWidth={2.2} strokeLinejoin="round" />
    <rect x={-10} y={-6} width={20} height={24} rx={8} fill="#E9D9B4" stroke={O} strokeWidth={2.2} />
    <rect className="pa-blink" x={-6} y={-2} width={12} height={8} rx={2} fill={C.mint} stroke={O} strokeWidth={1.5} />
  </g>
);
export const Acorn = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <ellipse cx="12" cy="14.5" rx="7.5" ry="8" fill={C.dtc} stroke={O} strokeWidth="2.2" />
    <path d="M3.5 10.5 q8.5 -9 17 0 q-8.5 2.5 -17 0z" fill="#6B4A35" stroke={O} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M12 3.2 v-2" stroke={O} strokeWidth="2.2" strokeLinecap="round" />
    <ellipse cx="9" cy="14" rx="1.6" ry="2.6" fill="#D6A877" />
  </svg>
);
export const acornSvg = (size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><ellipse cx="12" cy="14.5" rx="7.5" ry="8" fill="${C.dtc}" stroke="${O}" stroke-width="2.2"/><path d="M3.5 10.5 q8.5 -9 17 0 q-8.5 2.5 -17 0z" fill="#6B4A35" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 3.2 v-2" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/></svg>`;

// ── 줄·카드·탭 아이콘(작은 그림) ─────────────────────────────────────────
const Ico = ({ children, vb = '0 0 50 50', size = 44 }: { children: ReactNode; vb?: string; size?: number }) => (
  <svg width={size} height={size} viewBox={vb} aria-hidden="true">{children}</svg>
);
export function RowIcon({ kind, size = 44 }: { kind: string; size?: number }) {
  switch (kind) {
    case 'pile':
      return <Ico size={size}><Dia cx={25} cy={42} hw={20} fill="#C9A46A" sw={2} /><ellipse cx={19} cy={28} rx={4.5} ry={5.5} fill={C.dtc} stroke={O} strokeWidth={1.8} /><ellipse cx={31} cy={30} rx={4.5} ry={5.5} fill={C.dtc} stroke={O} strokeWidth={1.8} /><ellipse cx={25} cy={22} rx={4.5} ry={5.5} fill={C.dtc} stroke={O} strokeWidth={1.8} /></Ico>;
    case 'wheel':
      return <Ico size={size}><Wheel cx={25} cy={47} w={42} col={C.dtc} /></Ico>;
    case 'wheel2':
      return <Ico size={size}><Wheel cx={20} cy={47} w={34} col={C.dtc} /><Wheel cx={33} cy={47} w={26} col={C.mdt} /></Ico>;
    case 'helper':
      return <Ico size={size}><Hamster cx={25} cy={46} h={38} /></Ico>;
    case 'squirrel':
      return <Ico size={size}><Squirrel cx={24} cy={46} h={40} /></Ico>;
    case 'bear':
      return <Ico size={size}><BearFace cx={25} cy={28} r={16} /></Ico>;
    case 'row':
      return <Ico size={size}><Dia cx={25} cy={46} hw={22} fill={C.dirt} sw={2} /><Wheel cx={14} cy={40} w={20} col={C.dtc} /><Wheel cx={25} cy={44} w={22} col={C.bth} /><Wheel cx={36} cy={40} w={20} col={C.mdt} /></Ico>;
    case 'generator':
      return <Ico size={size}><Cube cx={25} cy={46} hw={16} h={18} fill="#A9A39A" /><path d="M27 12 l-6 10 h6 l-4 9 l9 -12 h-6 l4 -7z" fill={C.mdt} stroke={O} strokeWidth={1.8} strokeLinejoin="round" /></Ico>;
    case 'shed':
      return <Ico size={size}><Room cx={25} cy={47} hw={20} h={14} /></Ico>;
    case 'powerroom':
      return <Ico size={size}><Cube cx={25} cy={47} hw={18} h={22} fill="#8FB8B0" /><path d="M27 9 l-6 10 h6 l-4 9 l9 -12 h-6 l4 -7z" fill={C.mdt} stroke={O} strokeWidth={1.8} strokeLinejoin="round" /></Ico>;
    case 'farm':
      return <Ico size={size}><Room cx={25} cy={47} hw={22} h={18} wall="#B98552" floor={C.dirt} /><Wheel cx={25} cy={40} w={18} col={C.sms} /></Ico>;
    case 'phone':
      return <Ico size={size}><rect x={15} y={6} width={20} height={36} rx={5} fill={C.mint} stroke={O} strokeWidth={2.2} /><rect x={19} y={11} width={12} height={20} rx={2} fill="#E6F4EF" stroke={O} strokeWidth={1.5} /><path d="M33 38 l5 6" stroke={O} strokeWidth={1.6} /><path d="M34 44 l4 -2 l1 4z M38 44 l5 -2 l-1 4z" fill="#C2413B" stroke={O} strokeWidth={1.2} /></Ico>;
    case 'map':
      return <Ico size={size}><Poly p={[[7, 14], [19, 9], [31, 14], [43, 9], [43, 37], [31, 42], [19, 37], [7, 42]]} fill={C.paper} sw={2.2} /><path d="M19 9 v28 M31 14 v28" stroke={O} strokeWidth={1.5} /><path d="M11 30 q8 -10 16 -4 t12 -10" fill="none" stroke={C.red} strokeWidth={2} strokeDasharray="3 3" strokeLinecap="round" /></Ico>;
    case 'people':
      return <Ico size={size}><circle cx={18} cy={28} r={11} fill="#F2C9A0" stroke={O} strokeWidth={2.2} /><circle cx={33} cy={24} r={10} fill="#E8C27A" stroke={O} strokeWidth={2.2} /><circle cx={15} cy={28} r={1.5} fill={O} /><circle cx={21} cy={28} r={1.5} fill={O} /><circle cx={30} cy={24} r={1.5} fill={O} /><circle cx={36} cy={24} r={1.5} fill={O} /></Ico>;
    case 'upg':
      return <Ico size={size}><path d="M25 6 C38 14 40 28 30 40 h-10 C10 28 12 14 25 6z" fill="#9CC77F" stroke={O} strokeWidth={2.2} strokeLinejoin="round" /><path d="M25 36 V16 M18 22 l7 -7 l7 7" fill="none" stroke={O} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></Ico>;
    case 'lot':
      return <Ico size={size}><Dia cx={25} cy={44} hw={22} fill={C.lot} sw={2} /><Poly p={[[10, 33], [20, 38], [20, 16]]} fill="#D8A46A" sw={2} /><Poly p={[[20, 38], [30, 33], [20, 16]]} fill="#B98552" sw={2} /><circle cx={36} cy={22} r={8} fill={C.leaf} stroke={O} strokeWidth={2} /><rect x={34.5} y={29} width={3} height={6} fill={C.darkWood} stroke={O} strokeWidth={1.4} /></Ico>;
    case 'bank': case 'capital': case 'shark1': case 'shark2': {
      const col = kind === 'bank' ? '#8FB8B0' : kind === 'capital' ? C.mdt : kind === 'shark1' ? '#A9A39A' : '#8E79B8';
      return <Ico size={size}><Room cx={25} cy={46} hw={21} h={16} wall={col} floor={C.floor} /><Cube cx={25} cy={40} hw={7} h={8} fill={C.wall} /></Ico>;
    }
    default:
      return <Ico size={size}><Wheel cx={25} cy={47} w={40} col={C.dtc} /></Ico>;
  }
}

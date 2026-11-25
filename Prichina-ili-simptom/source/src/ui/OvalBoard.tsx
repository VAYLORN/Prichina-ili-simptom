// The oval board (the «new» look): a ring of case cells around a dark centre with the card decks,
// sector photos in the outer band. Visible sector blocks share the full ring; one common token
// follows the case order. Hidden blocks consume no space or decorative photo.
import { useId, useMemo } from 'react';
import { sectorById, type SectorId } from '../../shared/types';
import { CARD_ICON, SECTOR_ART, SECTOR_ICON } from './art';
import { SvgIcon, useSteppedPositions } from './Board';
import { GAME_TOKEN, boardBlocks, tint, type BoardPath } from './path';

export const OVAL_W = 1360;
export const OVAL_H = 1000;
const CX = OVAL_W / 2;
const CY = OVAL_H / 2;

type Ellipse = { rx: number; ry: number };
const FRAME: Ellipse = { rx: 640, ry: 470 };
const RING: Ellipse = { rx: 463, ry: 358 };
const OUT: Ellipse = { rx: 450, ry: 345 };
const IN: Ellipse = { rx: 368, ry: 268 };
const MID: Ellipse = { rx: 409, ry: 306.5 };
const CENTER: Ellipse = { rx: 356, ry: 256 };

const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (e: Ellipse, a: number): [number, number] => [CX + e.rx * Math.cos(a), CY + e.ry * Math.sin(a)];
const fmt = ([x, y]: [number, number]) => `${x.toFixed(1)} ${y.toFixed(1)}`;

// Also the subtitle of the round intro on the projector.
export const SUBTITLES: Record<SectorId, string> = {
  supply: 'Надёжные поставки — бесперебойная работа',
  production: 'Эффективное производство — больше возможностей',
  quality: 'Стабильное качество — доверие потребителя',
  people: 'Сильная команда — наш главный ресурс',
};
interface Seg { index: number | null; a0: number; a1: number } // index in path cells; null = connector

// Splits a sector wedge into segments of equal arc length per unit of weight.
function quarterBounds(start: number, span: number, weights: number[]): number[] {
  const steps = 720;
  const lengths = [0];
  for (let i = 1; i <= steps; i++) {
    const [x0, y0] = pt(MID, start + (span * (i - 1)) / steps);
    const [x1, y1] = pt(MID, start + (span * i) / steps);
    lengths.push(lengths[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return [0, ...weights.map(w => (acc += w))].map(w => {
    const i = lengths.findIndex(l => l >= (w / total) * lengths[steps] - 1e-6);
    return start + (span * Math.max(0, i)) / steps;
  });
}

function layout(path: BoardPath) {
  const sides = boardBlocks(path.cells);
  if (!sides.length) sides.push([]);
  const span = rad(360 / sides.length);
  const start = rad(sides.length === 3 ? 150 : sides.length <= 2 ? 90 : 135);
  const starts = sides.map((_, i) => start + i * span);
  const final = path.cells.findIndex(c => c.kind === 'final');
  const segs: Seg[] = [];
  sides.forEach((idxs, q) => {
    const items: { index: number | null; w: number }[] = [];
    items.push(q === 0 ? { index: 0, w: 1.5 } : { index: null, w: 0.55 });
    for (const idx of idxs) items.push({ index: idx, w: 1 });
    items.push(q === sides.length - 1 && final > 0 ? { index: final, w: 1.5 } : { index: null, w: 0.55 });
    const b = quarterBounds(starts[q], span, items.map(i => i.w));
    items.forEach((it, k) => segs.push({ index: it.index, a0: b[k], a1: b[k + 1] }));
  });
  return { sides, segs, starts, span };
}

function segPath(s: Seg) {
  const n = 12;
  const outer = Array.from({ length: n + 1 }, (_, i) => pt(OUT, s.a0 + ((s.a1 - s.a0) * i) / n));
  const inner = Array.from({ length: n + 1 }, (_, i) => pt(IN, s.a1 - ((s.a1 - s.a0) * i) / n));
  return `M ${[...outer, ...inner].map(fmt).join(' L ')} Z`;
}

function arcPath(e: Ellipse, a0: number, a1: number) {
  const n = 40;
  return `M ${Array.from({ length: n + 1 }, (_, i) => fmt(pt(e, a0 + ((a1 - a0) * i) / n))).join(' L ')}`;
}

// Direction of travel at angle a, in degrees, for rotating arrows.
const heading = (a: number) => (Math.atan2(MID.ry * Math.cos(a), -MID.rx * Math.sin(a)) * 180) / Math.PI;

const DECKS = [
  { label: 'Ситуация', pic: CARD_ICON.situation, color: '#2F6BE0', x: -150, y: -150, r: -6 },
  { label: 'Факт', pic: CARD_ICON.fact, color: '#7C4DDB', x: 0, y: -158, r: 0 },
  { label: 'Шум', pic: CARD_ICON.noise, color: '#E04A3A', x: 150, y: -150, r: 6 },
  { label: 'Мнение', pic: CARD_ICON.opinion, color: '#F08A1C', x: -150, y: 150, r: 6 },
  { label: 'Скрытый факт', pic: CARD_ICON.hidden, color: '#3B4252', x: 0, y: 158, r: 0 },
  { label: 'Ловушка', pic: CARD_ICON.trap, color: '#FFD43B', x: 150, y: 150, r: -6 },
];

// A card deck: the picture pops out of a white window, the deck name on the coloured strip below.
function Deck({ d }: { d: (typeof DECKS)[number] }) {
  const dark = d.color === '#FFD43B';
  const words = d.label.split(' ');
  return (
    <g transform={`translate(${CX + d.x} ${CY + d.y}) rotate(${d.r})`}>
      <rect x={-56} y={-44} width={124} height={100} rx={16} fill="#000" opacity={0.35} transform="translate(4 8)" />
      <rect x={-62} y={-50} width={124} height={100} rx={16} fill={d.color} opacity={0.55} transform="translate(5 5)" />
      <rect x={-62} y={-50} width={124} height={100} rx={16} fill={d.color} stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={2.5} />
      <rect x={-54} y={-42} width={108} height={52} rx={10} fill="#F4F7FD" />
      <image href={d.pic} x={-33} y={-53} width={66} height={66} />
      <text y={words.length > 1 ? 27 : 36} textAnchor="middle" fontSize={13} fontWeight={800} fill={dark ? '#15151A' : '#FFFFFF'} letterSpacing={0.8} fontFamily="Unbounded Variable, Unbounded, sans-serif">
        {words.map((w, i) => <tspan key={i} x={0} dy={i === 0 ? 0 : 15}>{w.toUpperCase()}</tspan>)}
      </text>
    </g>
  );
}

function Banner({ sector, block, vertical, x, y, active, filter }: { sector: SectorId; block: number; vertical: boolean; x: number; y: number; active: boolean; filter: string }) {
  const s = sectorById(sector);
  const w = vertical ? 212 : 440;
  const h = vertical ? 150 : 96;
  const title = s.title.toUpperCase();
  const words = SUBTITLES[sector].split(' — ');
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={18} fill="#000" opacity={0.3} transform="translate(0 8)" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={18} fill={s.color} stroke="#FFFFFF" strokeWidth={active ? 7 : 3} />
      <g filter={filter}>
        <rect x={-w / 2 + 14} y={-h / 2 - 15} width={104} height={30} rx={15} fill="#FFFFFF" />
        <text x={-w / 2 + 66} y={-h / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={800} fill={s.color} letterSpacing={1} fontFamily="Unbounded Variable, Unbounded, sans-serif">РАУНД {block}</text>
      </g>
      {vertical ? (
        <>
          <image href={SECTOR_ICON[sector]} x={-30} y={-60} width={60} height={60} />
          <text y={20} textAnchor="middle" fontSize={title.length > 9 ? 16 : 24} fontWeight={800} fill="#FFFFFF" letterSpacing={0.5} fontFamily="Unbounded Variable, Unbounded, sans-serif">{title}</text>
          <text y={42} textAnchor="middle" fontSize={12} fontWeight={700} fill="#FFFFFF" opacity={0.9} fontFamily="Manrope Variable, Manrope, sans-serif">
            <tspan x={0}>{words[0]} —</tspan>
            <tspan x={0} dy={15}>{words[1]}</tspan>
          </text>
        </>
      ) : (
        <>
          <image href={SECTOR_ICON[sector]} x={-w / 2 + 12} y={-38} width={80} height={80} />
          <text x={-w / 2 + 100} y={2} fontSize={title.length > 10 ? 27 : 30} fontWeight={800} fill="#FFFFFF" letterSpacing={0.5} fontFamily="Unbounded Variable, Unbounded, sans-serif">{title}</text>
          <text x={-w / 2 + 101} y={27} fontSize={12.5} fontWeight={700} fill="#FFFFFF" opacity={0.9} fontFamily="Manrope Variable, Manrope, sans-serif">{SUBTITLES[sector]}</text>
        </>
      )}
    </g>
  );
}

export function OvalBoard({ path, className = '', animate = true, onStep }: {
  path: BoardPath;
  className?: string;
  animate?: boolean;
  onStep?: () => void;
}) {
  const p = 'ov' + useId().replace(/[^a-zA-Z0-9]/g, ''); // unique SVG ids per board on the page
  const signature = path.cells.map(c => `${c.kind}${c.sector}${c.block}`).join('|');
  const { sides, segs, starts, span } = useMemo(() => layout(path), [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const stepped = useSteppedPositions({ token: path.token }, onStep);
  const token = animate ? stepped.token ?? path.token : path.token;
  const segOf = (index: number) => segs.find(s => s.index === index) ?? segs[0];
  const activeQuarter = sides.findIndex(idxs => idxs.some(i => path.cells[i].state === 'current'));
  const quarterSector = sides.map(idxs => idxs.length ? path.cells[idxs[0]].sector : null);
  const wedges = starts.map(a => {
    const points = [ [CX, CY], ...Array.from({ length: 81 }, (_, i) => pt({ rx: 1800, ry: 1500 }, a + span * i / 80)) ];
    const edge = Array.from({ length: 81 }, (_, i) => pt(FRAME, a + span * i / 80));
    const xs = [CX, ...edge.map(p => p[0])], ys = [CY, ...edge.map(p => p[1])];
    const x = Math.max(0, Math.min(...xs) - 40), y = Math.max(0, Math.min(...ys) - 40);
    return { points: points.map(p => p.join(',')).join(' '), box: [x, y, Math.min(OVAL_W, Math.max(...xs) + 40) - x, Math.min(OVAL_H, Math.max(...ys) + 40) - y] };
  });
  const tokenSeg = segOf(token);
  const [tx, ty] = pt(MID, (tokenSeg.a0 + tokenSeg.a1) / 2);

  return (
    <div className={`board board-oval ${className}`}>
      <svg viewBox={`0 0 ${OVAL_W} ${OVAL_H}`} role="img" aria-label="Игровое поле">
        <defs>
          {wedges.map((w, q) => <clipPath key={q} id={`${p}-wedge-${q}`}><polygon points={w.points} /></clipPath>)}
          <radialGradient id={`${p}-center`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#24324F" />
            <stop offset="100%" stopColor="#0B1324" />
          </radialGradient>
          <radialGradient id={`${p}-vignette`} cx="50%" cy="50%" r="75%">
            <stop offset="55%" stopColor="#08101F" stopOpacity={0} />
            <stop offset="100%" stopColor="#08101F" stopOpacity={0.7} />
          </radialGradient>
          <pattern id={`${p}-checker`} width="14" height="14" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill="#FFFFFF" />
            <rect width="7" height="7" fill="#15151A" />
            <rect x="7" y="7" width="7" height="7" fill="#15151A" />
          </pattern>
          <filter id={`${p}-mono`}><feColorMatrix type="saturate" values="0" /><feComponentTransfer><feFuncR type="linear" slope="1.15" intercept="-0.04" /><feFuncG type="linear" slope="1.15" intercept="-0.04" /><feFuncB type="linear" slope="1.15" intercept="-0.04" /></feComponentTransfer></filter>
          <filter id={`${p}-glow`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="9" /></filter>
          <filter id={`${p}-shadow`} x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.35" /></filter>
        </defs>

        {/* photo band: each quarter shows the photo of its round's sector */}
        <rect width={OVAL_W} height={OVAL_H} fill="#0E1A33" />
        {wedges.map((w, q) => quarterSector[q] && (
          <g key={q} clipPath={`url(#${p}-wedge-${q})`}>
            {SECTOR_ART[quarterSector[q]!].art ? (
              <image href={SECTOR_ART[quarterSector[q]!].src} x={w.box[0]} y={w.box[1]} width={w.box[2]} height={w.box[3]} preserveAspectRatio="xMidYMid slice" />
            ) : (
              <>
                <image href={SECTOR_ART[quarterSector[q]!].src} x={w.box[0]} y={w.box[1]} width={w.box[2]} height={w.box[3]} preserveAspectRatio="xMidYMid slice" filter={`url(#${p}-mono)`} />
                <rect width={OVAL_W} height={OVAL_H} fill={sectorById(quarterSector[q]!).color} style={{ mixBlendMode: 'multiply' }} />
              </>
            )}
            <rect width={OVAL_W} height={OVAL_H} fill="#08101F" opacity={0.28} />
          </g>
        ))}
        <rect width={OVAL_W} height={OVAL_H} fill={`url(#${p}-vignette)`} />
        <path d={`M0 0 H${OVAL_W} V${OVAL_H} H0 Z ${arcPath(FRAME, 0, rad(360))} Z`} fillRule="evenodd" fill="#08101F" opacity={0.35} />
        {starts.map((a, i) => (
          <line key={i} x1={pt(FRAME, a)[0]} y1={pt(FRAME, a)[1]} x2={pt(RING, a)[0]} y2={pt(RING, a)[1]} stroke="#FFFFFF" strokeWidth={5} opacity={0.85} />
        ))}
        <ellipse cx={CX} cy={CY} rx={FRAME.rx} ry={FRAME.ry} fill="none" stroke="#FFFFFF" strokeWidth={9} />

        {/* coloured rails along each round, a glow on the current one */}
        {sides.map((idxs, q) => {
          if (!idxs.length) return null;
          const a0 = segOf(idxs[0]).a0, a1 = segOf(idxs[idxs.length - 1]).a1;
          const color = sectorById(path.cells[idxs[0]].sector!).color;
          return (
            <g key={q}>
              {q === activeQuarter && <path d={arcPath(MID, a0, a1)} fill="none" stroke={color} strokeWidth={120} opacity={0.6} filter={`url(#${p}-glow)`} />}
              <path d={arcPath(RING, a0, a1)} fill="none" stroke={color} strokeWidth={q === activeQuarter ? 16 : 10} />
            </g>
          );
        })}

        {/* track */}
        <ellipse cx={CX} cy={CY} rx={OUT.rx + 4} ry={OUT.ry + 4} fill="#FFFFFF" />
        {segs.map((s, k) => {
          const mid = (s.a0 + s.a1) / 2;
          const [ix, iy] = pt(MID, mid);
          if (s.index === null) {
            return (
              <g key={`gap${k}`}>
                <path d={segPath(s)} fill="#E9EDF5" stroke="#FFFFFF" strokeWidth={3} />
                <g transform={`translate(${ix} ${iy}) rotate(${heading(mid)})`}><SvgIcon name="ChevronRight" x={0} y={0} size={30} color="#9AA4B8" stroke={3} /></g>
              </g>
            );
          }
          const cell = path.cells[s.index];
          if (cell.kind === 'start' || cell.kind === 'final') {
            const start = cell.kind === 'start';
            const inner = { rx: OUT.rx - 14, ry: OUT.ry - 14 };
            return (
              <g key={s.index}>
                <path d={segPath(s)} fill={start ? '#1E5BD6' : '#16213A'} stroke="#FFFFFF" strokeWidth={3} />
                {start && <path d={`${arcPath(OUT, s.a0, s.a1)} L ${fmt(pt(inner, s.a1))} ${arcPath(inner, s.a1, s.a0).replace('M', 'L')} Z`} fill={`url(#${p}-checker)`} />}
                <SvgIcon name={start ? 'Flag' : 'Trophy'} x={ix} y={iy + 4} size={34} color={start ? '#FFFFFF' : '#F5C451'} />
              </g>
            );
          }
          const color = sectorById(cell.sector!).color;
          const done = cell.state === 'done';
          const now = cell.state === 'current';
          return (
            <g key={s.index}>
              {now && <path d={segPath(s)} fill="#FFFFFF" opacity={0.9} filter={`url(#${p}-glow)`} />}
              <path d={segPath(s)} fill={done ? color : now ? '#FFFFFF' : tint(color, 0.82)} stroke={now ? color : '#FFFFFF'} strokeWidth={now ? 6 : 3} />
              {done && <SvgIcon name="Check" x={ix} y={iy - 22} size={20} color="#FFFFFF" stroke={3} />}
              <text x={ix} y={iy + (done ? 16 : 12)} textAnchor="middle" fontSize={34} fontWeight={800} fill={done ? '#FFFFFF' : color} opacity={done || now ? 1 : 0.8} fontFamily="Unbounded Variable, Unbounded, sans-serif">{cell.label}</text>
            </g>
          );
        })}
        <ellipse cx={CX} cy={CY} rx={OUT.rx} ry={OUT.ry} fill="none" stroke="#16213A" strokeWidth={2} opacity={0.5} />

        {/* centre */}
        <ellipse cx={CX} cy={CY} rx={IN.rx} ry={IN.ry} fill="#FFFFFF" />
        <ellipse cx={CX} cy={CY} rx={CENTER.rx} ry={CENTER.ry} fill={`url(#${p}-center)`} />
        <g opacity={0.08} stroke="#FFFFFF" fill="none" strokeWidth={2}>
          <ellipse cx={CX} cy={CY} rx={120} ry={200} />
          <ellipse cx={CX} cy={CY} rx={60} ry={200} />
          <ellipse cx={CX} cy={CY} rx={200} ry={200} />
          <line x1={CX - 200} y1={CY} x2={CX + 200} y2={CY} />
          <line x1={CX - 180} y1={CY - 90} x2={CX + 180} y2={CY - 90} />
          <line x1={CX - 180} y1={CY + 90} x2={CX + 180} y2={CY + 90} />
        </g>
        {DECKS.map(d => <Deck key={d.label} d={d} />)}
        <text x={CX} y={CY + 6} textAnchor="middle" fontSize={56} fontWeight={900} fill="#FFFFFF" letterSpacing={1} fontFamily="Unbounded Variable, Unbounded, sans-serif">
          ФАКТ <tspan fill="#F5C451">≠</tspan> ПРИЧИНА
        </text>
        <text x={CX} y={CY + 44} textAnchor="middle" fontSize={19} fontWeight={800} fill="#F5C451" letterSpacing={1} fontFamily="Unbounded Variable, Unbounded, sans-serif">
          ПРИЧИНА → ДЕЙСТВИЕ → РЕЗУЛЬТАТ
        </text>
        <text x={CX} y={CY - 52} textAnchor="middle" fontSize={13} fontWeight={800} fill="#FFFFFF" opacity={0.7} letterSpacing={3} fontFamily="Manrope Variable, Manrope, sans-serif">
          АНАЛИЗИРУЙ · ДЕЙСТВУЙ · УЛУЧШАЙ
        </text>

        {/* one banner per round, next to its cases */}
        {sides.map((idxs, q) => {
          if (!idxs.length) return null;
          const angle = starts[q] + span / 2;
          const [bx, by] = pt({ rx: 560, ry: 418 }, angle);
          const vertical = Math.abs(Math.cos(angle)) > 0.6;
          const x = vertical ? (Math.cos(angle) < 0 ? 122 : OVAL_W - 122) : Math.min(Math.max(bx, 330), OVAL_W - 330);
          const y = vertical ? Math.min(Math.max(by, 190), OVAL_H - 190) : Math.min(Math.max(by, 92), OVAL_H - 92);
          const cell = path.cells[idxs[0]];
          return <Banner key={q} sector={cell.sector!} block={cell.block} vertical={vertical} x={x} y={y} active={q === activeQuarter} filter={`url(#${p}-shadow)`} />;
        })}

        {/* start and final badges */}
        {path.cells.map((c, i) => {
          if (c.kind === 'case') return null;
          const s = segOf(i);
          const [bx, by] = pt({ rx: 548, ry: 432 }, (s.a0 + s.a1) / 2);
          const start = c.kind === 'start';
          const text = start ? 'СТАРТ' : 'ФИНАЛ';
          const w = text.length * 12.6 + 40;
          return (
            <g key={i} transform={`translate(${bx + (start ? 0 : -30)} ${by + (start ? -22 : 22)})`} filter={`url(#${p}-shadow)`}>
              <rect x={-w / 2} y={-19} width={w} height={38} rx={19} fill={start ? '#1E5BD6' : '#16213A'} stroke="#FFFFFF" strokeWidth={3} />
              <text y={6} textAnchor="middle" fontSize={14} fontWeight={800} fill={start ? '#FFFFFF' : '#F5C451'} letterSpacing={1} fontFamily="Unbounded Variable, Unbounded, sans-serif">{text}</text>
            </g>
          );
        })}
      </svg>

      <div className="pawns">
        <div className="pawn pawn-token" style={{ left: `${(tx / OVAL_W) * 100}%`, top: `${((ty + 18) / OVAL_H) * 100}%` }}>
          <img src={GAME_TOKEN} alt="Фишка игры" draggable={false} />
        </div>
      </div>
    </div>
  );
}

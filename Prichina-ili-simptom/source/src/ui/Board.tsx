// The square board: the cases of each round along one side, start/final in the bottom-left
// corner, one shared game token. Used on the projector, in the host preview and for the A3 print.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { sectorById } from '../../shared/types';
import { CARD_ICON, SECTOR_ICON } from './art';
import { ICONS } from './icons';
import { GAME_TOKEN, boardSides, tint, type BoardPath } from './path';

const PAPER = '#FBF7EF';
const LINE = '#DDD2BE';
const INK = '#16213A';
const C = 150; // corner size
const SIDE = 1000 - 2 * C;

// Moves the token one cell at a time towards its target, so the audience sees it walk.
// onStep fires once per step (the projector plays a note on it).
export function useSteppedPositions(targets: Record<string, number>, onStep?: () => void) {
  const [shown, setShown] = useState(targets);
  const shownRef = useRef(targets);
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const key = JSON.stringify(targets);
  useEffect(() => {
    const id = setInterval(() => {
      const prev = shownRef.current;
      let moved = false;
      const next: Record<string, number> = {};
      for (const [id, target] of Object.entries(targets)) {
        const current = prev[id] ?? target;
        next[id] = current === target ? current : current + Math.sign(target - current);
        if (next[id] !== current) moved = true;
      }
      const resized = Object.keys(prev).length !== Object.keys(next).length;
      if (!moved && !resized) return;
      shownRef.current = next;
      setShown(next);
      if (moved) stepRef.current?.();
    }, 380);
    return () => clearInterval(id);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return shown;
}

// Team mark for lists and tables: a coloured disc with the team number.
export function TeamBadge({ color, label, size = 40 }: { color: string; label: string | number; size?: number }) {
  return (
    <span className="team-badge" style={{ width: size, height: size, fontSize: size * 0.42, '--c': color } as CSSProperties}>{label}</span>
  );
}

export function SvgIcon({ name, x, y, size, color, stroke = 2 }: { name: string; x: number; y: number; size: number; color: string; stroke?: number }) {
  const Component = ICONS[name] ?? ICONS.Zap;
  return <Component x={x - size / 2} y={y - size / 2} width={size} height={size} color={color} strokeWidth={stroke} />;
}

type Side = 'left' | 'top' | 'right' | 'bottom';
const SIDE_ORDER: Side[] = ['left', 'top', 'right', 'bottom'];

function cellRect(side: Side, k: number, count: number) {
  const len = SIDE / count;
  switch (side) {
    case 'left': return { x: 0, y: 1000 - C - (k + 1) * len, w: C, h: len };
    case 'top': return { x: C + k * len, y: 0, w: len, h: C };
    case 'right': return { x: 1000 - C, y: C + k * len, w: C, h: len };
    case 'bottom': return { x: 1000 - C - (k + 1) * len, y: 1000 - C, w: len, h: C };
  }
}

const CORNER_DECOR = [
  { x: 0, y: 0, icon: 'Lock', pic: CARD_ICON.hidden, label: ['СКРЫТЫЙ', 'ФАКТ'], fill: '#2B2A4C', ink: '#FFFFFF' },
  { x: 1000 - C, y: 0, icon: 'Zap', pic: CARD_ICON.trap, label: ['ЛОВУШКА'], fill: '#FFD43B', ink: '#15151A' },
  { x: 1000 - C, y: 1000 - C, icon: 'Trophy', pic: null, label: ['РЕЙТИНГ'], fill: INK, ink: '#F5C451' },
];

export function Board({ path, className = '', animate = true, onStep }: {
  path: BoardPath;
  className?: string;
  animate?: boolean;
  onStep?: () => void;
}) {
  const stepped = useSteppedPositions({ token: path.token }, onStep);
  const token = animate ? stepped.token ?? path.token : path.token;
  const sides = boardSides(path.cells);

  // Where every path cell sits; start and final share the bottom-left corner.
  const rects = new Map<number, { x: number; y: number; w: number; h: number; side: Side | null }>();
  rects.set(0, { x: 0, y: 1000 - C, w: C, h: C, side: null });
  path.cells.forEach((c, i) => { if (c.kind === 'final') rects.set(i, { x: 0, y: 1000 - C, w: C, h: C, side: null }); });
  sides.forEach((idxs, q) => idxs.forEach((idx, k) => rects.set(idx, { ...cellRect(SIDE_ORDER[q], k, idxs.length), side: SIDE_ORDER[q] })));
  const activeSide = sides.findIndex(idxs => idxs.some(i => path.cells[i].state === 'current'));
  const tokenRect = rects.get(token) ?? rects.get(0)!;

  return (
    <div className={`board ${className}`}>
      <svg viewBox="0 0 1000 1000" role="img" aria-label="Игровое поле">
        <defs>
          <pattern id="sq-hazard" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="16" height="16" fill="#FFD43B" />
            <rect width="8" height="16" fill="#111" />
          </pattern>
          <pattern id="sq-weave" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="22" height="22" fill="#F1E9D9" />
            <rect width="1.2" height="22" fill="#E6DBC5" />
          </pattern>
          <pattern id="sq-checker" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill="#FFFFFF" />
            <rect width="8" height="8" fill="#15151A" />
            <rect x="8" y="8" width="8" height="8" fill="#15151A" />
          </pattern>
          <filter id="sq-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8" /></filter>
        </defs>
        <rect width={1000} height={1000} fill={PAPER} />
        <rect x={C} y={C} width={SIDE} height={SIDE} fill="url(#sq-weave)" />

        {/* cases */}
        {sides.flatMap((idxs, q) => idxs.map(idx => {
          const cell = path.cells[idx];
          const r = rects.get(idx)!;
          const color = sectorById(cell.sector!).color;
          const side = SIDE_ORDER[q];
          const band = {
            left: { x: r.x + r.w - 26, y: r.y, w: 26, h: r.h },
            right: { x: r.x, y: r.y, w: 26, h: r.h },
            top: { x: r.x, y: r.y + r.h - 26, w: r.w, h: 26 },
            bottom: { x: r.x, y: r.y, w: r.w, h: 26 },
          }[side];
          const cx = r.x + r.w / 2 + (side === 'left' ? -13 : side === 'right' ? 13 : 0);
          const cy = r.y + r.h / 2 + (side === 'top' ? -13 : side === 'bottom' ? 13 : 0);
          const done = cell.state === 'done';
          const now = cell.state === 'current';
          return (
            <g key={idx}>
              {now && <rect x={r.x + 6} y={r.y + 6} width={r.w - 12} height={r.h - 12} fill={color} opacity={0.55} filter="url(#sq-glow)" />}
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={done ? color : now ? '#FFFFFF' : tint(color, 0.86)} stroke={now ? color : LINE} strokeWidth={now ? 6 : 1.5} />
              <rect x={band.x} y={band.y} width={band.w} height={band.h} fill={color} />
              {done
                ? <SvgIcon name="CircleCheck" x={cx} y={cy - 32} size={30} color="#FFFFFF" />
                : <image href={SECTOR_ICON[cell.sector!]} x={cx - 21} y={cy - 54} width={42} height={42} />}
              <text x={cx} y={cy + 30} textAnchor="middle" fontSize={50} fontWeight={800} fill={done ? '#FFFFFF' : now ? color : INK} opacity={done || now ? 1 : 0.7} fontFamily="Unbounded Variable, Unbounded, sans-serif">{cell.label}</text>
            </g>
          );
        }))}

        {/* corners */}
        <g>
          <rect x={0} y={1000 - C} width={C} height={C} fill="#1E5BD6" stroke={LINE} strokeWidth={1.5} />
          <rect x={0} y={1000 - C} width={C} height={18} fill="url(#sq-checker)" />
          <SvgIcon name="Flag" x={C / 2} y={1000 - C + 62} size={34} color="#FFFFFF" />
          <text x={C / 2} y={1000 - C + 108} textAnchor="middle" fontSize={16} fontWeight={800} fill="#FFFFFF" letterSpacing={1} fontFamily="Unbounded Variable, Unbounded, sans-serif">СТАРТ</text>
          {path.cells.some(c => c.kind === 'final') && <text x={C / 2} y={1000 - C + 132} textAnchor="middle" fontSize={12} fontWeight={800} fill="#FFFFFF" opacity={0.8} letterSpacing={1} fontFamily="Unbounded Variable, Unbounded, sans-serif">И ФИНАЛ</text>}
        </g>
        {CORNER_DECOR.map(d => (
          <g key={d.icon}>
            <rect x={d.x} y={d.y} width={C} height={C} fill={d.fill} stroke={LINE} strokeWidth={1.5} />
            {d.fill === '#FFD43B' && (
              <>
                <rect x={d.x} y={d.y} width={C} height={16} fill="url(#sq-hazard)" />
                <rect x={d.x} y={d.y + C - 16} width={C} height={16} fill="url(#sq-hazard)" />
              </>
            )}
            {d.pic
              ? <image href={d.pic} x={d.x + C / 2 - 32} y={d.y + 22} width={64} height={64} />
              : <SvgIcon name={d.icon} x={d.x + C / 2} y={d.y + 58} size={34} color={d.ink} />}
            <text x={d.x + C / 2} y={d.y + 104} textAnchor="middle" fontSize={d.label.length > 1 ? 14 : 16} fontWeight={800} fill={d.ink} letterSpacing={0.8} fontFamily="Unbounded Variable, Unbounded, sans-serif">
              {d.label.map((l, i) => <tspan key={l} x={d.x + C / 2} dy={i === 0 ? 0 : 17}>{l}</tspan>)}
            </text>
          </g>
        ))}

        {/* round labels along the inner edge */}
        {sides.map((idxs, q) => {
          if (!idxs.length) return null;
          const cell = path.cells[idxs[0]];
          const s = sectorById(cell.sector!);
          const pos = { left: [C + 48, 500, 90], top: [500, C + 48, 0], right: [1000 - C - 48, 500, -90], bottom: [500, 1000 - C - 48, 0] }[SIDE_ORDER[q]];
          return (
            <text key={q} transform={`translate(${pos[0]} ${pos[1]}) rotate(${pos[2]})`} textAnchor="middle" dominantBaseline="middle" fontSize={20} fontWeight={800} fill={s.color} letterSpacing={3} fontFamily="Unbounded Variable, Unbounded, sans-serif" opacity={q === activeSide || activeSide < 0 ? 1 : 0.55}>
              РАУНД {cell.block} · {s.title.toUpperCase()}
            </text>
          );
        })}

        {/* centre: wordmark and the two decks */}
        <g transform="translate(500 500) rotate(-45)">
          <text y={-10} textAnchor="middle" fontSize={64} fontWeight={900} fill={INK} letterSpacing={2} fontFamily="Unbounded Variable, Unbounded, sans-serif">ПРИЧИНА</text>
          <text y={40} textAnchor="middle" fontSize={32} fontWeight={600} fill={INK} letterSpacing={1} fontFamily="Unbounded Variable, Unbounded, sans-serif">или симптом?</text>
          <rect x={-140} y={64} width={280} height={32} rx={16} fill={INK} />
          <text y={86} textAnchor="middle" fontSize={14} fontWeight={800} fill="#F5C451" letterSpacing={2} fontFamily="Unbounded Variable, Unbounded, sans-serif">ФАКТ ≠ ПРИЧИНА</text>
        </g>
        {[{ x: 330, y: 330, label: 'СКРЫТЫЕ ФАКТЫ', pic: CARD_ICON.hidden, dark: true }, { x: 670, y: 670, label: 'ЛОВУШКИ', pic: CARD_ICON.trap, dark: false }].map(d => (
          <g key={d.label} transform={`translate(${d.x} ${d.y}) rotate(-45)`}>
            <rect x={-84} y={-54} width={168} height={108} rx={12} fill={d.dark ? '#2B2A4C' : '#FFD43B'} stroke={d.dark ? '#2B2A4C' : '#111'} strokeWidth={2} strokeDasharray="7 6" />
            <image href={d.pic} x={-27} y={-48} width={54} height={54} />
            <text y={24} textAnchor="middle" fontSize={13} fontWeight={800} fill={d.dark ? '#FFFFFF' : '#111111'} letterSpacing={1} fontFamily="Unbounded Variable, Unbounded, sans-serif">{d.label}</text>
          </g>
        ))}
        <rect x={1} y={1} width={998} height={998} fill="none" stroke={INK} strokeWidth={2} />
        <rect x={C} y={C} width={SIDE} height={SIDE} fill="none" stroke={INK} strokeWidth={2} />
      </svg>

      <div className="pawns">
        <div className="pawn pawn-token" style={{ left: `${(tokenRect.x + tokenRect.w / 2) / 10}%`, top: `${(tokenRect.y + tokenRect.h / 2 + 30) / 10}%` }}>
          <img src={GAME_TOKEN} alt="Фишка игры" draggable={false} />
        </div>
      </div>
    </div>
  );
}

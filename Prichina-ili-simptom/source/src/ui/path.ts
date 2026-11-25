// The board path: start, one cell per case of the plan, the final. One shared game token walks it.
import { planPlaces } from '../../shared/logic';
import type { Phase, Round, SectorId } from '../../shared/types';

export interface PathCell {
  kind: 'start' | 'case' | 'final';
  sector: SectorId | null;
  label: string; // case number across the game
  block: number; // round number for cases
  state: 'done' | 'current' | 'next';
}

export interface BoardPath {
  cells: PathCell[];
  token: number; // index in cells
}

type PlanRound = Pick<Round, 'kind' | 'sector'> & { phase: Phase; index?: number };

export function boardPath(rounds: PlanRound[], current: number): BoardPath {
  const places = planPlaces(rounds);
  const cells: PathCell[] = [{ kind: 'start', sector: null, label: 'Старт', block: 0, state: current < 0 ? 'current' : 'done' }];
  rounds.forEach((r, i) => {
    cells.push({
      kind: r.kind === 'final' ? 'final' : 'case',
      sector: r.kind === 'final' ? null : r.sector,
      label: r.kind === 'final' ? 'Финал' : String(places[i].caseNumber),
      block: places[i].block,
      state: r.phase === 'done' ? 'done' : (r.index ?? i) === current ? 'current' : 'next',
    });
  });
  const visibleCurrent = rounds.findIndex((r, i) => (r.index ?? i) === current);
  return { cells, token: visibleCurrent < 0 ? 0 : visibleCurrent + 1 };
}

// Every visible sector block gets one wedge on the oval board.
export function boardBlocks(cells: PathCell[]): number[][] {
  const groups: number[][] = [];
  cells.forEach((cell, index) => {
    if (cell.kind !== 'case') return;
    const last = groups[groups.length - 1];
    if (last && cells[last[0]].block === cell.block) last.push(index);
    else groups.push([index]);
  });
  return groups;
}

// The four sides of the square board: keep up to four blocks intact; longer custom routes
// distribute their cases evenly around the perimeter.
export function boardSides(cells: PathCell[]): number[][] {
  const cases = cells.map((c, i) => (c.kind === 'case' ? i : -1)).filter(i => i >= 0);
  const blocks = [...new Set(cases.map(i => cells[i].block))];
  if (blocks.length <= 4) return [...blocks.map(b => cases.filter(i => cells[i].block === b)), ...Array.from({ length: 4 - blocks.length }, () => [] as number[])];
  const sides: number[][] = [[], [], [], []];
  cases.forEach((idx, k) => sides[Math.min(3, Math.floor((k * 4) / Math.max(1, cases.length)))].push(idx));
  return sides;
}

// Sector colour washed towards white, for cells that are still ahead.
export function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

export const GAME_TOKEN = '/tokens/token-game.png';

// Demo path follows the default three-sector scenario.
export const DEMO_PATH: BoardPath = boardPath(
  (['production', 'quality', 'people'] as SectorId[]).flatMap(sector =>
    [0, 1, 2].map(() => ({ kind: 'regular' as const, sector, phase: 'ready' as Phase }))),
  -1,
);

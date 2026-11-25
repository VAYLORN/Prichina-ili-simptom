// Explicit one-time application of the requested defaults to the portable game's saved plan.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameState } from '../shared/types';
const data = resolve(import.meta.dirname, '../../data');
const file = resolve(data, 'game.json');
const backup = resolve(data, 'game-before-controls-2026-11-25.json');
if (existsSync(backup)) throw new Error('Defaults already applied. Preserving later user checkbox choices.');
const game: GameState = JSON.parse(readFileSync(file, 'utf8'));
copyFileSync(file, backup);
game.settings.boardStyle = 'oval';
game.rounds.forEach(r => { r.withTrap = true; });
writeFileSync(file, JSON.stringify(game, null, 2) + '\n');
console.log('All planned auto traps enabled; progress, teams, timers and hidden cases preserved.');

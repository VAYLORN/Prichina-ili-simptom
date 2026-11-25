// Explicit one-time scenario replacement. Never called automatically when the server starts.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { activeRounds, createGame } from '../shared/logic';
import { DEFAULT_SETTINGS, type GameState, type Library } from '../shared/types';

const data = resolve(import.meta.dirname, '../../data');
const file = resolve(data, 'game.json');
const archive = resolve(data, 'game-before-scenario-2026-11-25.json');
if (existsSync(archive)) throw new Error('Scenario was already prepared; the saved archive will not be overwritten.');
const old: GameState = JSON.parse(readFileSync(file, 'utf8'));
const library: Library = JSON.parse(readFileSync(resolve(data, 'library.json'), 'utf8'));
const game = createGame(library, old.title, old.teams.length);
game.teams = old.teams;
game.settings = { ...DEFAULT_SETTINGS, ...old.settings, hiddenSectors: ['supply'], trainingFirstCase: true,
  trainingPrepMinutes: 20, prepMinutes: 10, reportSeconds: 180, casesPerRound: 3 };
const ids = activeRounds(game).map(r => r.caseId);
const expected = ['pr-04','pr-03','pr-02','ka-03','ka-02','ka-01','pe-03','pe-02','pe-01'];
if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error('Required cards missing from library');
copyFileSync(file, archive);
writeFileSync(file, JSON.stringify(game, null, 2) + '\n');
console.log('Prepared 9 cases and 3 reserve cases; previous game archived.');

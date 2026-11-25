// Game data lives in plain JSON files in the data folder; each write goes to a temp file
// first and is then renamed over the old one, so a crash never leaves a half-written file.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes, randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { createGame } from '../shared/logic';
import { TRAPS } from '../shared/content/traps';
import { DEFAULT_SETTINGS, TEAM_COLORS, type CaseCard, type GameState, type Library } from '../shared/types';
import defaultCases from '../shared/content/cases.json' with { type: 'json' };

export const DEFAULT_LIBRARY: Library = { cases: defaultCases as CaseCard[], traps: TRAPS };

export class Store {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = resolve(dir);
    mkdirSync(this.dir, { recursive: true });
  }

  private path(name: string) {
    return resolve(this.dir, name);
  }

  private readJson<T>(name: string): T | null {
    const file = this.path(name);
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as T;
    } catch (error) {
      // Keep the broken file for inspection and start from defaults.
      renameSync(file, `${file}.broken-${Date.now()}`);
      console.error(`Файл ${name} повреждён и переименован:`, error);
      return null;
    }
  }

  private writeJson(name: string, value: unknown) {
    const file = this.path(name);
    writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), 'utf8');
    renameSync(`${file}.tmp`, file);
  }

  loadLibrary(): Library {
    const saved = this.readJson<Library>('library.json');
    if (saved?.cases && saved?.traps) {
      // Version 1 stored emoji as trap icons; icons are now icon names.
      const icons = new Map(TRAPS.map(t => [t.id, t.icon]));
      for (const t of saved.traps) if (!/^[A-Za-z0-9]+$/.test(t.icon)) t.icon = icons.get(t.id) ?? 'Zap';
      return saved;
    }
    this.saveLibrary(DEFAULT_LIBRARY);
    return structuredClone(DEFAULT_LIBRARY);
  }

  saveLibrary(library: Library) {
    this.writeJson('library.json', library);
  }

  loadGame(library: Library): GameState {
    const saved = this.readJson<GameState>('game.json');
    if (saved?.version === 2) {
      // Existing events keep their visible plan and scored status. The new scenario is only
      // a default for new games; loading must not hide played sectors or reset progress.
      saved.settings = {
        ...DEFAULT_SETTINGS,
        ...saved.settings,
        boardStyle: 'oval',
        hiddenSectors: saved.settings.hiddenSectors ?? [],
        trainingFirstCase: saved.settings.trainingFirstCase ?? saved.rounds.every(r => r.phase === 'ready'),
      };
      saved.music ??= saved.view === 'welcome' || saved.view === 'pause';
      saved.setupRequired ??= false;
      for (const round of saved.rounds) {
        if (round.training === undefined && (round.phase !== 'ready' || round.purchases.length || Object.keys(round.results).length)) round.training = false;
        const card = library.cases.find(c => c.id === round.caseId);
        const pool = card ? [...card.hidden, ...card.hiddenExtra] : [];
        round.purchases.forEach((purchase, index) => {
          // Deterministic for old files, even before the next ordinary save. Do not change
          // the issued text when the corresponding library card has been edited later.
          purchase.id ??= `${round.id}:fact:${index}`;
          if (purchase.factIndex === undefined) {
            const match = pool.indexOf(purchase.text);
            if (match >= 0) purchase.factIndex = match;
          }
        });
      }
      // Pawns exist only for the palette colours.
      saved.teams.forEach((t, i) => { if (!TEAM_COLORS.includes(t.color)) t.color = TEAM_COLORS[i % TEAM_COLORS.length]; });
      return saved;
    }
    const game = createGame(library);
    this.saveGame(game);
    return game;
  }

  saveGame(game: GameState) {
    this.writeJson('game.json', game);
  }

  // Operator PIN: from OPERATOR_PIN, else data/operator-pin.txt (created on first start).
  pin(): string {
    if (process.env.OPERATOR_PIN) return process.env.OPERATOR_PIN;
    const file = this.path('operator-pin.txt');
    if (!existsSync(file)) writeFileSync(file, String(randomInt(100000, 1000000)), 'utf8');
    return readFileSync(file, 'utf8').trim();
  }

  // Random secret mixed into the login cookie, so the cookie never contains the PIN itself.
  secret(): string {
    const file = this.path('secret.txt');
    if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'), 'utf8');
    return readFileSync(file, 'utf8').trim();
  }
}

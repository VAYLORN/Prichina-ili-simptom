// Pure game logic. The server applies commands from the host and builds the public view
// for the projector; nothing here touches the network or the disk.
import {
  CRITERIA, DEFAULT_SETTINGS, SECTORS, TEAM_COLORS,
  type CaseCard, type CriterionId, type GameState, type Library, type PlanPlace, type PublicState, type Round,
  type ScoreRow, type ScreenView, type SectorId, type Settings, type Team, type Timer, type TrapCard,
} from './types';

export type Command =
  | { type: 'setTitle'; title: string }
  | { type: 'setTeamCount'; count: number }
  | { type: 'updateTeam'; teamId: string; name?: string; color?: string }
  | { type: 'setSettings'; settings: Partial<Settings> }
  | { type: 'addRound'; kind: Round['kind'] }
  | { type: 'removeRound'; roundId: string }
  | { type: 'updateRound'; roundId: string; sector?: SectorId; caseId?: string | null; withTrap?: boolean; hidden?: boolean }
  | { type: 'moveRound'; roundId: string; dir: -1 | 1 }
  | { type: 'autoPlan' }
  | { type: 'resetProgress' }
  | { type: 'finishSetup' }
  | { type: 'goToRound'; index: number }
  | { type: 'showSituation' }
  | { type: 'startDiscussion' }
  | { type: 'timerToggle' }
  | { type: 'timerAdd'; seconds: number }
  | { type: 'timerFactor'; factor: number }
  | { type: 'fireTrap' }
  | { type: 'redrawTrap' }
  | { type: 'closeTrap' }
  | { type: 'finishDiscussion' }
  | { type: 'startReport'; teamId: string; seconds?: number }
  | { type: 'sellHidden'; teamId: string; factIndex?: number }
  | { type: 'replaceHidden'; purchaseId: string; factIndex: number }
  | { type: 'undoPurchase'; index: number }
  | { type: 'score'; teamId: string; criterion: CriterionId; value: number | null }
  | { type: 'penalty'; teamId: string; value: number }
  | { type: 'toggleStatements' }
  | { type: 'toggleReveal' }
  | { type: 'finishRound' }
  | { type: 'reopenRound' }
  | { type: 'nextRound' }
  | { type: 'setMusic'; on: boolean }
  | { type: 'setView'; view: ScreenView; slide?: number };

export class GameError extends Error {}
function fail(message: string): never {
  throw new GameError(message);
}

export type Rand = () => number;
const randInt = (rand: Rand, min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const newId = () => crypto.randomUUID();

// ---------- timer ----------

export const elapsed = (t: Timer, now: number) => t.elapsedMs + (t.startedAt !== null ? now - t.startedAt : 0);
export const remaining = (t: Timer, now: number) => Math.max(0, t.durationMs - elapsed(t, now));
export const isRunning = (t: Timer) => t.startedAt !== null;

const freshTimer = (label: string, ms: number): Timer => ({ label, durationMs: ms, elapsedMs: 0, startedAt: null });

function pause(t: Timer, now: number) {
  if (t.startedAt === null) return;
  t.elapsedMs = Math.min(t.durationMs, elapsed(t, now));
  t.startedAt = null;
}

function resume(t: Timer, now: number) {
  if (t.startedAt === null && remaining(t, now) > 0) t.startedAt = now;
}

// ---------- setup ----------

export function makeTeams(count: number, existing: Team[] = []): Team[] {
  return Array.from({ length: count }, (_, i) =>
    existing[i] ?? { id: newId(), name: `Команда ${i + 1}`, color: TEAM_COLORS[i % TEAM_COLORS.length] });
}

export function makeRound(kind: Round['kind'], sector: SectorId, caseId: string | null, withTrap: boolean): Round {
  return {
    id: newId(), kind, sector, caseId, withTrap, phase: 'ready', trap: null,
    purchases: [], results: {}, showStatements: false, revealCause: false, reporterId: null, reported: [],
  };
}

// Who reports first moves along by one team each case, so nobody always goes first.
export const reportOrder = <T,>(teams: T[], roundIndex: number): T[] => {
  const k = teams.length ? Math.max(0, roundIndex) % teams.length : 0;
  return [...teams.slice(k), ...teams.slice(0, k)];
};

// The agreed route ends with Personnel. Supply stays in reserve and is hidden by settings.
const DEFAULT_CASES: { sector: SectorId; ids: string[] }[] = [
  { sector: 'production', ids: ['pr-04', 'pr-03', 'pr-02'] },
  { sector: 'quality', ids: ['ka-03', 'ka-02', 'ka-01'] },
  { sector: 'people', ids: ['pe-03', 'pe-02', 'pe-01'] },
  { sector: 'supply', ids: ['po-03', 'po-02', 'po-01'] },
];

export function defaultPlan(library: Library, casesPerRound = DEFAULT_SETTINGS.casesPerRound): Round[] {
  const used = new Set<string>();
  const pick = (sector: SectorId, preferred?: string) => {
    const inSector = library.cases.filter(c => c.sector === sector && !used.has(c.id));
    const found = inSector.find(c => c.id === preferred) ?? inSector.find(c => c.level === 'hard') ?? inSector[0];
    if (found) used.add(found.id);
    return found?.id ?? null;
  };
  return DEFAULT_CASES.flatMap(s => Array.from({ length: casesPerRound }, (_, k) =>
    makeRound('regular', s.sector, pick(s.sector, s.ids[k]), true)));
}

type PlanState = Pick<GameState, 'rounds' | 'settings'>;
export type ActiveRound = Round & { index: number };
export const isRoundHidden = (s: PlanState, r: Round) => !!r.hidden || (s.settings.hiddenSectors ?? []).includes(r.sector);

// Copies add only the original index: UI filtering never changes the index sent to the server.
export const activeRounds = (s: PlanState): ActiveRound[] => s.rounds
  .map((r, index) => ({ ...r, index }))
  .filter(r => !isRoundHidden(s, r));

export function isTrainingRound(s: PlanState, r: Round): boolean {
  if (r.training !== undefined) return r.training;
  if (!s.settings.trainingFirstCase || r.kind !== 'regular' || s.rounds.some(x => x.training === true)) return false;
  return activeRounds(s).find(x => x.kind === 'regular')?.id === r.id;
}

export const discussionMinutes = (s: PlanState, r: Round): number => isTrainingRound(s, r)
  ? s.settings.trainingPrepMinutes
  : r.kind === 'final' ? s.settings.finalPrepMinutes : s.settings.prepMinutes;

function fixTraining(s: GameState, r: Round) {
  r.training ??= isTrainingRound(s, r);
}

function validateVisiblePlan(s: GameState, before: GameState, now: number) {
  const visible = activeRounds(s);
  if (!visible.some(r => r.kind === 'regular')) fail('В игре должен остаться хотя бы один видимый кейс');
  for (const r of before.rounds) {
    if (r.phase === 'ready' || r.phase === 'done' || isRoundHidden(before, r)) continue;
    const next = s.rounds.find(x => x.id === r.id);
    if (!next || isRoundHidden(s, next)) fail('Нельзя скрыть идущий кейс. Сначала завершите его.');
  }
  const current = s.rounds[s.current];
  if (current && isRoundHidden(s, current)) {
    pause(s.timer, now);
    s.introAt = null;
    s.current = visible.filter(r => r.index < s.current).at(-1)?.index ?? -1;
    s.view = 'board';
  }
}

// Rounds are runs of consecutive cases of the same sector.
export function planPlaces(rounds: Pick<Round, 'kind' | 'sector'>[]): PlanPlace[] {
  const regular = rounds.filter(r => r.kind === 'regular').length;
  const places: PlanPlace[] = [];
  let block = 0;
  let caseNumber = 0;
  rounds.forEach((r, i) => {
    if (r.kind === 'final') {
      places.push({ block: 0, caseInBlock: 1, blockSize: 1, caseNumber: 0, caseCount: regular });
      return;
    }
    const prev = rounds[i - 1];
    if (!prev || prev.kind === 'final' || prev.sector !== r.sector) block++;
    caseNumber++;
    const same = places.filter(p => p.block === block);
    places.push({ block, caseInBlock: same.length + 1, blockSize: 0, caseNumber, caseCount: regular });
  });
  for (const p of places) if (p.block) p.blockSize = places.filter(q => q.block === p.block).length;
  return places;
}

export const placeLabel = (p: PlanPlace, sectorTitle: string) =>
  p.block ? `Раунд ${p.block} · ${sectorTitle} · кейс ${p.caseInBlock} из ${p.blockSize}` : 'Финал · Доклад директору';

// Rough length of the plan: discussion, every team's report, ~2 min to score per case,
// plus 10 min of rules and roles at the start and 10 min of debrief at the end.
export function planMinutes(state: Pick<GameState, 'rounds' | 'teams' | 'settings'>) {
  const reports = (state.teams.length * state.settings.reportSeconds) / 60;
  const cases = activeRounds(state).map(r => discussionMinutes(state, r) + reports + 2);
  const perCase = state.settings.prepMinutes + reports + 2;
  return { perCase, total: Math.round(cases.reduce((a, b) => a + b, 0) + 20) };
}

export function createGame(library: Library, title = 'Причина или симптом?', teamCount = 4): GameState {
  return {
    version: 2,
    id: newId(),
    title,
    teams: makeTeams(teamCount),
    settings: structuredClone(DEFAULT_SETTINGS),
    rounds: defaultPlan(library),
    current: -1,
    view: 'welcome',
    music: true,
    slide: 0,
    timer: freshTimer('Тренировочное обсуждение', DEFAULT_SETTINGS.trainingPrepMinutes * 60_000),
    usedTraps: [],
    setupRequired: true,
  };
}

// ---------- helpers ----------

export const currentRound = (s: GameState): Round | null => {
  const r = s.rounds[s.current];
  return r && !isRoundHidden(s, r) ? r : null;
};
export const caseOf = (r: Round | null, library: Library) => (r?.caseId ? library.cases.find(c => c.id === r.caseId) ?? null : null);

const prepMs = (s: GameState, r: Round) => discussionMinutes(s, r) * 60_000;
const prepLabel = (s: GameState, r: Round) => isTrainingRound(s, r) ? 'Тренировочное обсуждение' : r.kind === 'final' ? 'Подготовка доклада' : 'Обсуждение';

function needRound(s: GameState): Round {
  return currentRound(s) ?? fail('Сначала выберите раунд');
}

function pickTrap(s: GameState, library: Library, rand: Rand, except?: string): TrapCard {
  const all = library.traps.filter(t => t.id !== except);
  if (!all.length) fail('Нет карточек-ловушек');
  const fresh = all.filter(t => !s.usedTraps.includes(t.id));
  const pool = fresh.length ? fresh : all;
  const card = pool[Math.floor(rand() * pool.length)];
  s.usedTraps.push(card.id);
  return card;
}

export const trapShown = (r: Round) => !!r.trap && r.trap.firedAt !== null && r.trap.closedAt === null;

function fireTrap(s: GameState, r: Round, library: Library, now: number, rand: Rand) {
  if (!r.trap || r.trap.firedAt !== null) {
    r.trap = { delaySec: 0, cardId: pickTrap(s, library, rand).id, firedAt: null, closedAt: null };
  }
  r.trap.firedAt = now;
  r.trap.resumesTimer = isRunning(s.timer);
  pause(s.timer, now); // HOLD while the host reads the trap
}

function enterRound(s: GameState, index: number, now: number) {
  pause(s.timer, now);
  s.current = index;
  const r = s.rounds[index];
  s.timer = freshTimer(prepLabel(s, r), prepMs(s, r));
}

function showSituation(s: GameState, r: Round) {
  if (!r.caseId) fail('Для раунда не выбрана ситуация. Выберите её в «Подготовке».');
  if (r.phase !== 'ready' && r.phase !== 'situation') fail('Ситуация уже открыта');
  fixTraining(s, r);
  r.phase = 'situation';
  s.music = false;
  s.view = 'round';
  s.timer = freshTimer(prepLabel(s, r), prepMs(s, r));
}

// ---------- commands ----------

// «Дальше» walks the token to the next cell; this long after, the projector opens the intro of
// that case by itself (a new round: «Раунд 2 · Производство»; inside a round: «Кейс 2 из 3»).
export const INTRO_DELAY_MS = 2600;

// Commands that don't change what the players look at, so they keep a pending intro (and the
// server doesn't offer them in «Отменить»: scores and settings are simply edited again).
export const QUIET: Command['type'][] = [
  'setTitle', 'setTeamCount', 'updateTeam', 'setSettings', 'addRound', 'removeRound', 'updateRound', 'moveRound',
  'timerToggle', 'timerAdd', 'timerFactor', 'sellHidden', 'replaceHidden', 'undoPurchase', 'score', 'penalty', 'setMusic',
];

export function apply(state: GameState, cmd: Command, library: Library, now = Date.now(), rand: Rand = Math.random): GameState {
  const s = structuredClone(state);
  if (!QUIET.includes(cmd.type)) s.introAt = null; // the host took the screen elsewhere
  switch (cmd.type) {
    case 'setTitle':
      s.title = cmd.title.trim() || 'Причина или симптом?';
      break;

    case 'setTeamCount': {
      const count = Math.round(cmd.count);
      if (count < 2 || count > 8) fail('Команд может быть от 2 до 8');
      s.teams = makeTeams(count, s.teams);
      const ids = new Set(s.teams.map(t => t.id));
      for (const r of s.rounds) {
        for (const id of Object.keys(r.results)) if (!ids.has(id)) delete r.results[id];
        r.purchases = r.purchases.filter(p => ids.has(p.teamId));
      }
      break;
    }

    case 'updateTeam': {
      const team = s.teams.find(t => t.id === cmd.teamId) ?? fail('Команда не найдена');
      if (cmd.name !== undefined) team.name = cmd.name.slice(0, 40);
      if (cmd.color !== undefined) team.color = cmd.color;
      break;
    }

    case 'setSettings': {
      const next = { ...s.settings, ...cmd.settings, boardStyle: 'oval' as const };
      if (next.trapDelayMin > next.trapDelayMax) next.trapDelayMax = next.trapDelayMin;
      // A new number of cases per round rebuilds the plan, as long as nothing has been played.
      if (next.casesPerRound !== s.settings.casesPerRound && s.rounds.every(r => r.phase === 'ready')) {
        s.rounds = defaultPlan(library, next.casesPerRound);
        s.current = -1;
      }
      s.settings = next;
      validateVisiblePlan(s, state, now);
      const r = currentRound(s);
      const previousRound = r && state.rounds.find(old => old.id === r.id);
      const discussionTimeChanged = r && previousRound && prepMs(s, r) !== prepMs(state, previousRound);
      const reportTimeChanged = s.settings.reportSeconds !== state.settings.reportSeconds;
      const discussionTimer = r && (r.phase === 'ready' || r.phase === 'situation' || r.phase === 'discussion');
      if (r && ((discussionTimer && discussionTimeChanged) || (r.phase === 'reports' && reportTimeChanged))) {
        const spent = elapsed(s.timer, now);
        s.timer.durationMs = discussionTimer ? prepMs(s, r) : s.settings.reportSeconds * 1000;
        if (discussionTimer) s.timer.label = prepLabel(s, r);
        if (spent >= s.timer.durationMs) {
          s.timer.elapsedMs = spent;
          s.timer.startedAt = null;
        }
      }
      break;
    }

    case 'addRound': {
      const regular = s.rounds.filter(r => r.kind === 'regular').length;
      const sector = SECTORS[regular % SECTORS.length].id;
      const round = makeRound(cmd.kind, sector, library.cases.find(c => c.sector === sector)?.id ?? null, true);
      const finalAt = s.rounds.findIndex(r => r.kind === 'final');
      if (cmd.kind === 'regular' && finalAt >= 0) {
        s.rounds.splice(finalAt, 0, round);
        if (s.current >= finalAt) s.current++;
      } else s.rounds.push(round);
      break;
    }

    case 'removeRound': {
      const i = s.rounds.findIndex(r => r.id === cmd.roundId);
      if (i < 0) fail('Раунд не найден');
      if (s.rounds[i].phase !== 'ready' && s.rounds[i].phase !== 'done' && i === s.current) fail('Нельзя удалить идущий раунд');
      s.rounds.splice(i, 1);
      if (s.current > i) s.current--;
      else if (s.current === i) s.current = -1;
      validateVisiblePlan(s, state, now);
      break;
    }

    case 'updateRound': {
      const r = s.rounds.find(x => x.id === cmd.roundId) ?? fail('Раунд не найден');
      if (cmd.sector && cmd.sector !== r.sector) {
        r.sector = cmd.sector;
        if (cmd.caseId === undefined) r.caseId = library.cases.find(c => c.sector === cmd.sector)?.id ?? null;
      }
      if (cmd.caseId !== undefined) r.caseId = cmd.caseId;
      if (cmd.withTrap !== undefined) {
        r.withTrap = cmd.withTrap;
        if (!r.withTrap && r.trap?.firedAt === null) r.trap = null;
        if (r.withTrap && r.phase === 'discussion' && !isTrainingRound(s, r) && !r.trap && r.id === currentRound(s)?.id) {
          r.trap = { delaySec: elapsed(s.timer, now) / 1000 + randInt(rand, s.settings.trapDelayMin, s.settings.trapDelayMax), cardId: pickTrap(s, library, rand).id, firedAt: null, closedAt: null };
        }
      }
      if (cmd.hidden !== undefined) r.hidden = cmd.hidden;
      if (r.caseId && !library.cases.some(c => c.id === r.caseId && c.sector === r.sector)) fail('Ситуация должна относиться к выбранному полю');
      validateVisiblePlan(s, state, now);
      break;
    }

    case 'moveRound': {
      const i = s.rounds.findIndex(r => r.id === cmd.roundId);
      const j = i + cmd.dir;
      if (i < 0 || j < 0 || j >= s.rounds.length) break;
      const currentId = currentRound(s)?.id;
      [s.rounds[i], s.rounds[j]] = [s.rounds[j], s.rounds[i]];
      s.current = currentId ? s.rounds.findIndex(r => r.id === currentId) : -1;
      break;
    }

    case 'autoPlan':
      if (s.rounds.some(r => r.phase !== 'ready')) fail('План можно пересобрать только до начала игры. Сначала нажмите «Начать заново».');
      s.settings.hiddenSectors = [...DEFAULT_SETTINGS.hiddenSectors];
      s.rounds = defaultPlan(library, s.settings.casesPerRound ?? DEFAULT_SETTINGS.casesPerRound);
      s.current = -1;
      validateVisiblePlan(s, state, now);
      break;

    case 'resetProgress':
      s.rounds = s.rounds.map(r => ({ ...makeRound(r.kind, r.sector, r.caseId, r.withTrap), id: r.id, hidden: r.hidden }));
      s.teams = s.teams.map((team, i) => ({ ...team, name: `Команда ${i + 1}` }));
      s.settings.boardStyle = 'oval';
      s.setupRequired = true;
      s.current = -1;
      s.view = 'welcome';
      s.music = true;
      s.slide = 0;
      s.usedTraps = [];
      s.timer = freshTimer('Обсуждение', discussionMinutes(s, activeRounds(s)[0]) * 60_000);
      break;

    case 'finishSetup':
      validateVisiblePlan(s, state, now);
      if (activeRounds(s).some(r => !r.caseId || !library.cases.some(c => c.id === r.caseId && c.sector === r.sector))) fail('Выберите ситуацию для каждого активного кейса');
      s.setupRequired = false;
      break;

    case 'goToRound':
      if (!s.rounds[cmd.index]) fail('Раунд не найден');
      if (isRoundHidden(s, s.rounds[cmd.index])) fail('Сначала восстановите скрытый кейс или поле');
      enterRound(s, cmd.index, now);
      break;

    case 'nextRound': {
      const next = activeRounds(s).find(r => r.index > s.current);
      if (!next) fail('Это был последний кейс');
      enterRound(s, next.index, now);
      s.music = false;
      s.view = 'board'; // the token walks to the next cell…
      s.introAt = now + INTRO_DELAY_MS; // …then the intro opens; the situation is the host's next button
      break;
    }

    case 'showSituation':
      showSituation(s, needRound(s));
      break;

    case 'startDiscussion': {
      const r = needRound(s);
      if (r.phase !== 'situation' && r.phase !== 'ready') fail('Обсуждение уже начато');
      if (r.phase === 'ready') showSituation(s, r);
      r.phase = 'discussion';
      s.music = false;
      s.view = 'round';
      if (r.withTrap && !isTrainingRound(s, r) && !r.trap) {
        r.trap = {
          delaySec: randInt(rand, s.settings.trapDelayMin, s.settings.trapDelayMax),
          cardId: pickTrap(s, library, rand).id,
          firedAt: null,
          closedAt: null,
        };
      }
      resume(s.timer, now);
      break;
    }

    case 'timerToggle':
      if (isRunning(s.timer)) pause(s.timer, now);
      else {
        const r = currentRound(s);
        if (r && trapShown(r)) fail('Сначала закройте ловушку — время продолжится само');
        resume(s.timer, now);
      }
      break;

    case 'timerAdd':
      s.timer.durationMs = Math.max(elapsed(s.timer, now), s.timer.durationMs + cmd.seconds * 1000);
      break;

    case 'timerFactor': {
      const left = remaining(s.timer, now);
      s.timer.durationMs = elapsed(s.timer, now) + Math.round(left * cmd.factor);
      break;
    }

    case 'fireTrap': {
      const r = needRound(s);
      if (trapShown(r)) fail('Ловушка уже на экране');
      if (r.trap?.closedAt) r.trap = null; // a second trap in the same round
      fireTrap(s, r, library, now, rand);
      break;
    }

    case 'redrawTrap': {
      const r = needRound(s);
      if (!r.trap || !trapShown(r)) fail('Ловушки на экране нет');
      r.trap.cardId = pickTrap(s, library, rand, r.trap.cardId).id;
      break;
    }

    case 'closeTrap': {
      const r = needRound(s);
      if (!r.trap || !trapShown(r)) fail('Ловушки на экране нет');
      r.trap.closedAt = now;
      if (r.trap.resumesTimer ?? r.phase === 'discussion') resume(s.timer, now);
      break;
    }

    case 'finishDiscussion': {
      const r = needRound(s);
      fixTraining(s, r);
      if (r.trap && trapShown(r)) r.trap.closedAt = now;
      pause(s.timer, now);
      r.phase = 'reports';
      r.reporterId = null;
      s.timer = freshTimer('Доклад', s.settings.reportSeconds * 1000);
      break;
    }

    case 'startReport': {
      const r = needRound(s);
      fixTraining(s, r);
      const team = s.teams.find(t => t.id === cmd.teamId) ?? fail('Команда не найдена');
      if (r.phase !== 'reports') r.phase = 'reports';
      r.reporterId = team.id;
      s.music = false;
      r.reported = [...new Set([...(r.reported ?? []), team.id])];
      s.view = 'round';
      s.timer = freshTimer(`Доклад: ${team.name}`, (cmd.seconds ?? s.settings.reportSeconds) * 1000);
      resume(s.timer, now);
      break;
    }

    case 'sellHidden': {
      const r = needRound(s);
      fixTraining(s, r);
      const c = caseOf(r, library) ?? fail('У раунда нет ситуации');
      if (!s.teams.some(t => t.id === cmd.teamId)) fail('Команда не найдена');
      const sold = new Set(r.purchases.filter(p => p.teamId === cmd.teamId).map(p => p.text));
      const pool = [...c.hidden, ...c.hiddenExtra];
      const factIndex = cmd.factIndex ?? pool.findIndex(text => !sold.has(text));
      if (!Number.isInteger(factIndex) || factIndex < 0 || factIndex >= pool.length) {
        fail(cmd.factIndex === undefined ? 'Скрытые факты для этой команды закончились' : 'Выберите существующий скрытый факт');
      }
      const text = pool[factIndex];
      if (sold.has(text)) fail('Этот факт уже выдан этой команде');
      r.purchases.push({ id: newId(), teamId: cmd.teamId, factIndex, text, at: now });
      break;
    }

    case 'replaceHidden': {
      const r = needRound(s);
      const purchase = r.purchases.find(p => p.id === cmd.purchaseId) ?? fail('Выдача факта в этом кейсе не найдена');
      const c = caseOf(r, library) ?? fail('У раунда нет ситуации');
      const pool = [...c.hidden, ...c.hiddenExtra];
      if (!Number.isInteger(cmd.factIndex) || cmd.factIndex < 0 || cmd.factIndex >= pool.length) fail('Выберите существующий скрытый факт');
      const text = pool[cmd.factIndex];
      if (r.purchases.some(p => p.id !== purchase.id && p.teamId === purchase.teamId && p.text === text)) fail('Этот факт уже выдан этой команде');
      // Correction changes what the host actually read. The original record/count stays, so
      // there is no second deduction and later library edits cannot rewrite issued history.
      purchase.factIndex = cmd.factIndex;
      purchase.text = text;
      break;
    }

    case 'undoPurchase': {
      const r = needRound(s);
      if (!r.purchases[cmd.index]) fail('Покупка не найдена');
      r.purchases.splice(cmd.index, 1);
      break;
    }

    case 'score': {
      const r = needRound(s);
      fixTraining(s, r);
      const criterion = CRITERIA.find(c => c.id === cmd.criterion) ?? fail('Неизвестный критерий');
      if (!s.teams.some(t => t.id === cmd.teamId)) fail('Команда не найдена');
      const result = (r.results[cmd.teamId] ??= { scores: {}, penalty: 0 });
      if (cmd.value === null) delete result.scores[criterion.id];
      else result.scores[criterion.id] = Math.max(0, Math.min(criterion.max, Math.round(cmd.value)));
      break;
    }

    case 'penalty': {
      const r = needRound(s);
      fixTraining(s, r);
      if (!s.teams.some(t => t.id === cmd.teamId)) fail('Команда не найдена');
      const result = (r.results[cmd.teamId] ??= { scores: {}, penalty: 0 });
      result.penalty = Math.max(0, Math.min(40, Math.round(cmd.value)));
      break;
    }

    case 'toggleStatements': {
      const r = needRound(s);
      r.showStatements = !r.showStatements;
      break;
    }

    case 'toggleReveal': {
      const r = needRound(s);
      r.revealCause = !r.revealCause;
      if (r.revealCause) s.view = 'round';
      break;
    }

    case 'finishRound': {
      const r = needRound(s);
      fixTraining(s, r);
      pause(s.timer, now);
      if (r.trap && trapShown(r)) r.trap.closedAt = now;
      r.phase = 'done';
      r.reporterId = null;
      s.view = 'board'; // pawns move to their new cells
      break;
    }

    case 'reopenRound': {
      const r = needRound(s);
      r.phase = 'reports';
      break;
    }

    case 'setMusic':
      s.music = cmd.on;
      break;

    case 'setView':
      s.view = cmd.view;
      if (cmd.view === 'pause' || (cmd.view === 'welcome' && s.current < 0)) s.music = true;
      if (cmd.slide !== undefined) s.slide = Math.max(0, Math.round(cmd.slide));
      break;
  }
  return s;
}

// Called by the server several times a second: opens a pending intro, fires a planned trap and
// stops an expired timer.
export function tick(state: GameState, library: Library, now = Date.now(), rand: Rand = Math.random): GameState | null {
  const r = currentRound(state);
  const t = state.timer;
  if (state.introAt != null && now >= state.introAt) {
    const s = structuredClone(state);
    s.introAt = null;
    if (s.view === 'board' && r?.phase === 'ready') s.view = 'round';
    return s;
  }
  if (r && r.phase === 'discussion' && r.trap && r.trap.firedAt === null && isRunning(t) && elapsed(t, now) >= r.trap.delaySec * 1000) {
    const s = structuredClone(state);
    fireTrap(s, currentRound(s)!, library, now, rand);
    return s;
  }
  if (isRunning(t) && remaining(t, now) === 0) {
    const s = structuredClone(state);
    pause(s.timer, now);
    return s;
  }
  return null;
}

// ---------- scores ----------

export function roundScore(state: GameState, r: Round, teamId: string): number | null {
  const result = r.results[teamId];
  const bought = r.purchases.filter(p => p.teamId === teamId).length;
  const marks = result ? Object.values(result.scores) : [];
  if (!marks.length && !bought && !result?.penalty) return null;
  const sum = marks.reduce((a, b) => a + (b ?? 0), 0);
  return sum - (result?.penalty ?? 0) - bought * state.settings.hiddenCost;
}

export function scoreTable(state: GameState): ScoreRow[] {
  const rounds = activeRounds(state);
  const rows = state.teams.map(team => {
    const perRound = rounds.map(r => roundScore(state, r, team.id));
    const total = perRound.reduce<number>((sum, score, i) => sum + (isTrainingRound(state, rounds[i]) ? 0 : score ?? 0), 0);
    return { teamId: team.id, perRound, total, place: 0 };
  });
  const totals = [...new Set(rows.map(r => r.total))].sort((a, b) => b - a);
  for (const row of rows) row.place = totals.indexOf(row.total) + 1;
  return rows;
}

// ---------- projector ----------

function seededShuffle<T>(items: T[], seedText: string): T[] {
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let x = Math.imul(seed ^ (seed >>> 15), seed | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Facts, noise and opinions mixed and unlabeled — the same order on the screen and on printed cards.
export const mixedStatements = (c: CaseCard) => seededShuffle([...c.facts, ...c.noise, ...c.opinions], c.id);

export function toPublic(state: GameState, library: Library): PublicState {
  const r = currentRound(state);
  const c = caseOf(r, library);
  const trap = r && trapShown(r) ? library.traps.find(t => t.id === r.trap!.cardId) ?? null : null;
  const purchases: Record<string, number> = {};
  for (const p of r?.purchases ?? []) purchases[p.teamId] = (purchases[p.teamId] ?? 0) + 1;
  const visible = r && r.phase !== 'ready';
  const rounds = activeRounds(state);
  const places = planPlaces(rounds);
  const position = rounds.findIndex(x => x.index === state.current);
  return {
    title: state.title,
    teams: state.teams,
    view: state.view,
    music: state.music ?? false,
    musicVolume: state.settings.musicVolume ?? 60,
    slide: state.slide,
    timer: state.timer,
    round: r
      ? {
          number: position + 1,
          index: state.current,
          training: isTrainingRound(state, r),
          discussionMinutes: discussionMinutes(state, r),
          kind: r.kind,
          sector: r.sector,
          phase: r.phase,
          title: visible && c ? c.title : '',
          symptom: visible && c ? c.symptom : '',
          statements: visible && c && r.showStatements ? mixedStatements(c) : null,
          trap: trap ? { icon: trap.icon, title: trap.title, text: trap.text, group: trap.group } : null,
          rootCause: c && r.revealCause ? c.rootCause : null,
          systemCause: c && r.revealCause && c.systemCause ? c.systemCause : null,
          reporterId: r.reporterId,
          reportOrder: reportOrder(state.teams, position).map(t => t.id),
          reported: r.reported ?? [],
          purchases,
          place: places[position],
        }
      : null,
    rounds: rounds.map((x, i) => ({ number: i + 1, index: x.index, training: isTrainingRound(state, x), kind: x.kind, sector: x.sector, phase: x.phase, ...places[i] })),
    table: scoreTable(state),
    settings: {
      hiddenCost: state.settings.hiddenCost,
      prepMinutes: state.settings.prepMinutes,
      reportSeconds: state.settings.reportSeconds,
      trainingFirstCase: state.settings.trainingFirstCase,
      trainingPrepMinutes: state.settings.trainingPrepMinutes,
      finalPrepMinutes: state.settings.finalPrepMinutes,
    },
    boardStyle: 'oval',
    soundVolume: state.settings.soundVolume ?? 100,
  };
}

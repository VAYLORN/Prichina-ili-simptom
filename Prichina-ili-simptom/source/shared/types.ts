// Shared data model for the operator console, the projector screen and the server.

export type SectorId = 'supply' | 'production' | 'quality' | 'people';

export interface Sector {
  id: SectorId;
  title: string;
  code: string; // printed on cards, e.g. «ПО-3»
  color: string;
  icon: string; // lucide icon name, see src/ui/icons.tsx
}

// Board palette. The scenario order is defined separately in defaultPlan.
export const SECTORS: Sector[] = [
  { id: 'supply', title: 'Поставки', code: 'ПО', color: '#E2483A', icon: 'Truck' },
  { id: 'production', title: 'Производство', code: 'ПР', color: '#2C67DE', icon: 'Factory' },
  { id: 'quality', title: 'Качество', code: 'КА', color: '#22A05A', icon: 'ClipboardCheck' },
  { id: 'people', title: 'Персонал', code: 'ПЕ', color: '#F08A1C', icon: 'Users' },
];

export const sectorById = (id: SectorId): Sector => SECTORS.find(s => s.id === id)!;

export interface CaseCard {
  id: string;
  sector: SectorId;
  level: 'base' | 'hard';
  title: string;
  symptom: string;
  facts: string[];
  noise: string[];
  opinions: string[];
  hidden: string[];
  hiddenExtra: string[]; // «для сильных команд», sold after the regular hidden facts
  wrongAnswers: string[]; // typical wrong versions («ловушки кейса»)
  rootCause: string;
  systemCause: string;
  chain: string[];
  question: string;
  notes: string;
}

export const caseCode = (c: Pick<CaseCard, 'id' | 'sector'>) =>
  `${sectorById(c.sector).code}-${Number(c.id.split('-')[1] ?? 0) || c.id}`;

export type TrapGroup = 'communication' | 'production' | 'thinking' | 'fun';

export const TRAP_GROUPS: Record<TrapGroup, string> = {
  communication: 'Связь',
  production: 'Производство',
  thinking: 'Мышление',
  fun: 'Шуточная',
};

export interface TrapCard {
  id: string;
  group: TrapGroup;
  icon: string; // lucide icon name
  title: string;
  text: string;
  hostHint?: string; // what the host has to do, never shown to players
  timeFactor?: number; // suggested change of the remaining time, e.g. 0.5
}

export interface Role {
  id: string;
  icon: string;
  title: string;
  mission: string;
  duties: string[];
  phrase?: string;
}

export const CRITERIA = [
  { id: 'problem', title: 'Верно выделена проблема', max: 5 },
  { id: 'cause', title: 'Найдена корневая причина', max: 10 },
  { id: 'actions', title: 'Конкретные действия', max: 10 },
  { id: 'clarity', title: 'Краткость и ясность доклада', max: 10 },
  { id: 'facts', title: 'Отделили факт от шума', max: 5 },
] as const;

export type CriterionId = (typeof CRITERIA)[number]['id'];
export const MAX_ROUND_SCORE = CRITERIA.reduce((sum, c) => sum + c.max, 0);

export interface Team {
  id: string;
  name: string;
  color: string;
}

// Each colour has a rendered pawn in public/tokens/token-<hex>.png (tools/render_tokens.py).
export const TEAM_COLORS = ['#E5484D', '#3E63DD', '#30A46C', '#FFB224', '#8E4EC6', '#12A594', '#D6409F', '#F76B15'];

export interface TeamResult {
  scores: Partial<Record<CriterionId, number>>;
  penalty: number; // manual penalty points (e.g. forbidden words)
}

export type Phase = 'ready' | 'situation' | 'discussion' | 'reports' | 'done';

export const PHASES: Record<Phase, string> = {
  ready: 'Не начат',
  situation: 'Ситуация на экране',
  discussion: 'Обсуждение',
  reports: 'Доклады и оценка',
  done: 'Завершён',
};

export interface Purchase {
  id: string; // stable record identity, including after a host corrects the selected fact
  teamId: string;
  factIndex?: number; // index in hidden + hiddenExtra; older unmatched text remains a snapshot
  text: string;
  at: number;
}

export interface RoundTrap {
  delaySec: number; // fires after this much discussion time
  cardId: string;
  firedAt: number | null;
  closedAt: number | null;
  resumesTimer?: boolean; // only resume a clock that was running before this overlay
}

export interface Round {
  id: string;
  kind: 'regular' | 'final';
  sector: SectorId;
  caseId: string | null;
  withTrap: boolean;
  hidden?: boolean; // retained in the plan; can be restored without losing progress
  training?: boolean; // fixed when a case starts; undefined while its role is still automatic
  phase: Phase;
  trap: RoundTrap | null;
  purchases: Purchase[];
  results: Record<string, TeamResult>;
  showStatements: boolean; // show the unlabeled cards on the projector
  revealCause: boolean; // show the root cause on the projector after the reports
  reporterId: string | null;
  reported?: string[]; // teams that have started their report, in order (absent in old saves)
}

export interface Timer {
  label: string;
  durationMs: number;
  elapsedMs: number; // accumulated while running, excludes pauses
  startedAt: number | null; // server time when running, null when stopped
}

export type ScreenView = 'welcome' | 'board' | 'rules' | 'roles' | 'round' | 'scores' | 'debrief' | 'pause';

export const VIEWS: Record<ScreenView, string> = {
  welcome: 'Заставка',
  board: 'Поле',
  rules: 'Правила',
  roles: 'Роли',
  round: 'Раунд',
  scores: 'Табло',
  debrief: 'Итоги',
  pause: 'Перерыв',
};

export type BoardStyle = 'oval' | 'square';

export const BOARD_STYLES: Record<BoardStyle, string> = { oval: 'Овальное поле', square: 'Квадратное поле' };

export interface Settings {
  boardStyle: BoardStyle;
  soundVolume: number; // 0..100, projector sounds
  musicVolume: number;
  hiddenSectors: SectorId[];
  trainingFirstCase: boolean;
  trainingPrepMinutes: number;
  casesPerRound: number; // cases in each sector round of the default plan
  eventMinutes: number; // time available for the whole game, for the plan estimate
  prepMinutes: number;
  finalPrepMinutes: number;
  reportSeconds: number;
  trapDelayMin: number;
  trapDelayMax: number;
  hiddenCost: number;
}

export const DEFAULT_SETTINGS: Settings = {
  boardStyle: 'oval',
  soundVolume: 100,
  musicVolume: 60,
  hiddenSectors: ['supply'],
  trainingFirstCase: true,
  trainingPrepMinutes: 20,
  casesPerRound: 3,
  eventMinutes: 180,
  prepMinutes: 10,
  finalPrepMinutes: 5,
  reportSeconds: 180,
  trapDelayMin: 10,
  trapDelayMax: 15,
  hiddenCost: 1,
};

export interface GameState {
  version: 2;
  id: string;
  title: string;
  teams: Team[];
  settings: Settings;
  rounds: Round[];
  current: number; // index in rounds, -1 before the first round
  view: ScreenView;
  music: boolean;
  slide: number; // rules slide on the projector
  timer: Timer;
  usedTraps: string[];
  introAt?: number | null; // after «Дальше»: when the projector turns from the board to the round intro
  setupRequired?: boolean; // host opens the setup wizard after a new game or explicit reset
}

export interface Library {
  cases: CaseCard[];
  traps: TrapCard[];
}

// What the projector receives: no answers, no hidden facts, no host notes.
export interface PublicRound {
  number: number;
  index: number; // original index in GameState.rounds; number is the visible position
  training: boolean;
  discussionMinutes: number;
  kind: Round['kind'];
  sector: SectorId;
  phase: Phase;
  title: string;
  symptom: string;
  statements: string[] | null;
  trap: Pick<TrapCard, 'icon' | 'title' | 'text' | 'group'> | null;
  rootCause: string | null;
  systemCause: string | null;
  reporterId: string | null;
  reportOrder: string[]; // team ids in the order they report in this case
  reported: string[];
  purchases: Record<string, number>;
  place: PlanPlace;
}

export interface PublicState {
  title: string;
  teams: Team[];
  view: ScreenView;
  music: boolean;
  musicVolume: number;
  slide: number;
  timer: Timer;
  round: PublicRound | null;
  rounds: ({ number: number; index: number; training: boolean; kind: Round['kind']; sector: SectorId; phase: Phase } & PlanPlace)[];
  table: ScoreRow[];
  settings: Pick<Settings, 'hiddenCost' | 'prepMinutes' | 'reportSeconds' | 'trainingFirstCase' | 'trainingPrepMinutes' | 'finalPrepMinutes'>;
  boardStyle: BoardStyle;
  soundVolume: number;
}

// Where a case sits in the plan: rounds are runs of cases of one sector («раунд 2 · кейс 1 из 3»).
export interface PlanPlace {
  block: number; // round number, 1-based; 0 for the final
  caseInBlock: number; // 1-based
  blockSize: number;
  caseNumber: number; // 1-based across the regular cases
  caseCount: number;
}

export interface ScoreRow {
  teamId: string;
  perRound: (number | null)[]; // activeRounds order; training scores are feedback only, excluded from total
  total: number;
  place: number;
}

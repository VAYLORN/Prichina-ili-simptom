import { z } from 'zod';
import { CRITERIA } from '../shared/types';

const sector = z.enum(['supply', 'production', 'quality', 'people']);
const id = z.string().min(1).max(80);
const text = (max = 600) => z.string().trim().max(max);
const lines = z.array(text()).max(40);

export const caseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, 'ID: латиница, цифры и дефис'),
  sector,
  level: z.enum(['base', 'hard']),
  title: text(200).min(1, 'Нужно название'),
  symptom: text(600).min(1, 'Нужен симптом'),
  facts: lines,
  noise: lines,
  opinions: lines,
  hidden: lines,
  hiddenExtra: lines,
  wrongAnswers: lines,
  rootCause: text(600),
  systemCause: text(600),
  chain: lines,
  question: text(600),
  notes: text(3000),
});

export const trapSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  group: z.enum(['communication', 'production', 'thinking', 'fun']),
  icon: z.string().regex(/^[A-Za-z0-9]{1,40}$/, 'Значок: название иконки'),
  title: text(120).min(1),
  text: text(600).min(1),
  hostHint: text(400).optional(),
  timeFactor: z.number().min(0.1).max(2).optional(),
});

const criterion = z.enum(CRITERIA.map(c => c.id) as [string, ...string[]]);
const view = z.enum(['welcome', 'board', 'rules', 'roles', 'round', 'scores', 'debrief', 'pause']);

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setTitle'), title: text(120) }),
  z.object({ type: z.literal('setTeamCount'), count: z.number().int().min(2).max(8) }),
  z.object({ type: z.literal('updateTeam'), teamId: id, name: text(40).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
  z.object({
    type: z.literal('setSettings'),
    settings: z.object({
      boardStyle: z.literal('oval'),
      soundVolume: z.number().int().min(0).max(100),
      musicVolume: z.number().int().min(0).max(100),
      hiddenSectors: z.array(sector).max(4).refine(ids => new Set(ids).size === ids.length, 'Поля не должны повторяться'),
      trainingFirstCase: z.boolean(),
      trainingPrepMinutes: z.number().min(1).max(60),
      casesPerRound: z.number().int().min(1).max(6),
      eventMinutes: z.number().int().min(30).max(600),
      prepMinutes: z.number().min(1).max(30),
      finalPrepMinutes: z.number().min(1).max(30),
      reportSeconds: z.number().int().min(15).max(600),
      trapDelayMin: z.number().int().min(0).max(300),
      trapDelayMax: z.number().int().min(0).max(300),
      hiddenCost: z.number().int().min(0).max(10),
    }).partial(),
  }),
  z.object({ type: z.literal('addRound'), kind: z.enum(['regular', 'final']) }),
  z.object({ type: z.literal('removeRound'), roundId: id }),
  z.object({ type: z.literal('updateRound'), roundId: id, sector: sector.optional(), caseId: id.nullable().optional(), withTrap: z.boolean().optional(), hidden: z.boolean().optional() }),
  z.object({ type: z.literal('moveRound'), roundId: id, dir: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ type: z.literal('autoPlan') }),
  z.object({ type: z.literal('resetProgress') }),
  z.object({ type: z.literal('finishSetup') }),
  z.object({ type: z.literal('goToRound'), index: z.number().int().min(0) }),
  z.object({ type: z.literal('showSituation') }),
  z.object({ type: z.literal('startDiscussion') }),
  z.object({ type: z.literal('timerToggle') }),
  z.object({ type: z.literal('timerAdd'), seconds: z.number().int().min(-1800).max(1800) }),
  z.object({ type: z.literal('timerFactor'), factor: z.number().min(0.1).max(2) }),
  z.object({ type: z.literal('fireTrap') }),
  z.object({ type: z.literal('redrawTrap') }),
  z.object({ type: z.literal('closeTrap') }),
  z.object({ type: z.literal('finishDiscussion') }),
  z.object({ type: z.literal('startReport'), teamId: id, seconds: z.number().int().min(5).max(900).optional() }),
  z.object({ type: z.literal('sellHidden'), teamId: id, factIndex: z.number().int().min(0).max(79).optional() }),
  z.object({ type: z.literal('replaceHidden'), purchaseId: id, factIndex: z.number().int().min(0).max(79) }),
  z.object({ type: z.literal('undoPurchase'), index: z.number().int().min(0) }),
  z.object({ type: z.literal('score'), teamId: id, criterion, value: z.number().int().min(0).max(100).nullable() }),
  z.object({ type: z.literal('penalty'), teamId: id, value: z.number().int().min(0).max(40) }),
  z.object({ type: z.literal('toggleStatements') }),
  z.object({ type: z.literal('toggleReveal') }),
  z.object({ type: z.literal('finishRound') }),
  z.object({ type: z.literal('reopenRound') }),
  z.object({ type: z.literal('nextRound') }),
  z.object({ type: z.literal('setMusic'), on: z.boolean() }),
  z.object({ type: z.literal('setView'), view, slide: z.number().int().min(0).max(50).optional() }),
  // flow: the big button, ← through the rules, «Отменить» (shared/flow.ts, server/index.ts)
  z.object({ type: z.literal('advance'), key: z.string().max(300).optional() }),
  z.object({ type: z.literal('back') }),
  z.object({ type: z.literal('undo') }),
]);

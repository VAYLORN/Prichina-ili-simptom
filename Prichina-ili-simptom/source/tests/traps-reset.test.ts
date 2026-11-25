import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, createGame, elapsed, remaining, tick, toPublic, trapShown } from '../shared/logic';
import { nextStep } from '../shared/flow';
import { DEFAULT_LIBRARY as library } from '../server/store';
import { commandSchema } from '../server/schemas';
import type { Command } from '../shared/logic';
import type { Phase } from '../shared/types';

const T = 1_000_000;
const run = (game: ReturnType<typeof createGame>, cmd: Command, now = T) => apply(game, cmd, library, now, () => 0);

test('ручная ловушка доступна в любом выбранном кейсе и не запускает остановленный таймер', () => {
  for (const phase of ['ready', 'situation', 'discussion', 'reports', 'done'] as Phase[]) {
    let game = run(createGame(library), { type: 'goToRound', index: 0 });
    game.rounds[0].phase = phase;
    game.rounds[0].withTrap = false;
    game.timer.elapsedMs = 1234;
    game.timer.startedAt = null;
    game.view = 'pause';
    game = run(game, { type: 'fireTrap' });
    assert.equal(game.rounds[0].phase, phase);
    assert.equal(game.rounds[0].withTrap, false);
    assert.ok(toPublic(game, library).round!.trap, `${phase}: показывается поверх любого экрана`);
    assert.equal(nextStep(game)!.cmd.type, 'closeTrap');
    assert.throws(() => run(game, { type: 'fireTrap' }), /уже на экране/);
    game = run(game, { type: 'closeTrap' }, T + 15_000);
    assert.equal(game.timer.startedAt, null, `${phase}: не запускать таймер, который был остановлен`);
    assert.equal(game.timer.elapsedMs, 1234);
    assert.equal(game.view, 'pause');
    assert.equal(game.rounds[0].phase, phase);
  }
  assert.throws(() => run(createGame(library), { type: 'fireTrap' }), /выберите раунд/);
});

test('ручная ловушка замораживает доклад и возобновляет его после закрытия без потери времени', () => {
  let game = run(createGame(library), { type: 'goToRound', index: 0 });
  game = run(game, { type: 'startReport', teamId: game.teams[0].id });
  game = run(game, { type: 'fireTrap' }, T + 20_000);
  const oldCard = game.rounds[0].trap!.cardId;
  game = run(game, { type: 'redrawTrap' }, T + 30_000);
  assert.notEqual(game.rounds[0].trap!.cardId, oldCard);
  assert.equal(elapsed(game.timer, T + 50_000), 20_000);
  game = run(game, { type: 'closeTrap' }, T + 60_000);
  assert.equal(game.rounds[0].phase, 'reports');
  assert.equal(game.timer.startedAt, T + 60_000);
  assert.equal(elapsed(game.timer, T + 70_000), 30_000);
});

test('ловушки по умолчанию у всех кейсов; отключение отменяет автоматическую, но оставляет ручную', () => {
  let game = createGame(library);
  assert.ok(game.rounds.every(r => r.withTrap));
  game = run(game, { type: 'addRound', kind: 'regular' });
  assert.equal(game.rounds.at(-1)!.withTrap, true);
  game = run(game, { type: 'goToRound', index: 0 });
  game = run(game, { type: 'startDiscussion' });
  assert.equal(game.rounds[0].trap, null, 'тренировка без автоматической ловушки');
  game = run(game, { type: 'goToRound', index: 1 });
  game = run(game, { type: 'startDiscussion' });
  assert.ok(game.rounds[1].trap);
  game = run(game, { type: 'updateRound', roundId: game.rounds[1].id, withTrap: false });
  assert.equal(tick(game, library, T + 11_000), null);
  game = run(game, { type: 'updateRound', roundId: game.rounds[1].id, withTrap: true }, T + 15_000);
  assert.equal(tick(game, library, T + 20_000), null, 'повторное включение отсчитывает задержку от текущего момента');
  assert.ok(tick(game, library, T + 26_000));
  game = run(game, { type: 'updateRound', roundId: game.rounds[1].id, withTrap: false });
  game = run(game, { type: 'fireTrap' }, T + 30_000);
  assert.ok(trapShown(game.rounds[1]));
});

test('сброс возвращает названия команд и обязательную настройку, сохраняя план и тайминги', () => {
  let game = createGame(library);
  assert.equal(game.setupRequired, true);
  game = run(game, { type: 'finishSetup' });
  game = run(game, { type: 'updateTeam', teamId: game.teams[0].id, name: 'Смена А' });
  game = run(game, { type: 'setSettings', settings: { prepMinutes: 12, reportSeconds: 240 } });
  game = run(game, { type: 'updateRound', roundId: game.rounds[1].id, hidden: true, withTrap: false });
  game = run(game, { type: 'goToRound', index: 0 });
  game = run(game, { type: 'score', teamId: game.teams[0].id, criterion: 'cause', value: 10 });
  const before = structuredClone(game);
  game = run(game, { type: 'resetProgress' });
  assert.equal(game.setupRequired, true);
  assert.deepEqual(game.teams.map(t => t.name), ['Команда 1', 'Команда 2', 'Команда 3', 'Команда 4']);
  assert.deepEqual(game.teams.map(t => [t.id, t.color]), before.teams.map(t => [t.id, t.color]));
  assert.deepEqual(game.rounds.map(r => [r.id, r.caseId, r.hidden, r.withTrap]), before.rounds.map(r => [r.id, r.caseId, r.hidden, r.withTrap]));
  assert.deepEqual(game.settings, before.settings);
  assert.ok(game.rounds.every(r => !Object.keys(r.results).length && !r.purchases.length && r.phase === 'ready'));
  game = run(game, { type: 'updateRound', roundId: game.rounds[0].id, caseId: null });
  assert.throws(() => run(game, { type: 'finishSetup' }), /Выберите ситуацию/);
  game = run(game, { type: 'updateRound', roundId: game.rounds[0].id, caseId: before.rounds[0].caseId });
  game = run(game, { type: 'finishSetup' });
  assert.equal(game.setupRequired, false);
});

test('квадратное поле нельзя включить командой; публичное поле всегда круглое', () => {
  assert.equal(commandSchema.safeParse({ type: 'setSettings', settings: { boardStyle: 'square' } }).success, false);
  const game = createGame(library);
  game.settings.boardStyle = 'square'; // legacy in-memory snapshot
  assert.equal(toPublic(game, library).boardStyle, 'oval');
  assert.equal(run(game, { type: 'setSettings', settings: {} }).settings.boardStyle, 'oval');
});

test('изменение обсуждения во время игры сохраняет прошедшее время и состояние паузы', () => {
  for (const mode of ['training', 'regular', 'final'] as const) {
    let game = createGame(library);
    const index = mode === 'regular' ? 1 : 0;
    if (mode === 'final') game.rounds[index].kind = 'final';
    game = run(game, { type: 'goToRound', index });
    game = run(game, { type: 'startDiscussion' });
    const setting = mode === 'training' ? 'trainingPrepMinutes' : mode === 'final' ? 'finalPrepMinutes' : 'prepMinutes';
    game = run(game, { type: 'setSettings', settings: { [setting]: 25 } }, T + 120_000);
    assert.equal(game.timer.durationMs, 25 * 60_000);
    assert.equal(game.timer.startedAt, T);
    assert.equal(elapsed(game.timer, T + 120_000), 120_000);
    game = run(game, { type: 'timerAdd', seconds: 60 }, T + 120_000);
    const manualDuration = game.timer.durationMs;
    game = run(game, { type: 'setSettings', settings: { soundVolume: 45, [setting]: 25 } }, T + 120_000);
    assert.equal(game.timer.durationMs, manualDuration, 'несвязанные или неизменённые настройки не отменяют добавленное время');
    game = run(game, { type: 'timerToggle' }, T + 120_000);
    game = run(game, { type: 'setSettings', settings: { [setting]: 15 } }, T + 180_000);
    assert.equal(game.timer.startedAt, null);
    assert.equal(elapsed(game.timer, T + 180_000), 120_000);
    assert.equal(remaining(game.timer, T + 180_000), 13 * 60_000);
    game = run(game, { type: 'timerToggle' }, T + 180_000);
    game = run(game, { type: 'setSettings', settings: { [setting]: 1 } }, T + 200_000);
    assert.equal(game.timer.startedAt, null, 'сокращение ниже уже истекшего времени останавливает часы');
    assert.equal(elapsed(game.timer, T + 200_000), 140_000, 'счётчик не перематывается назад');
    assert.equal(remaining(game.timer, T + 200_000), 0);
  }
});

test('изменение доклада под ловушкой сохраняет паузу и возобновляет только ранее запущенный таймер', () => {
  for (const wasRunning of [true, false]) {
    let game = run(createGame(library), { type: 'goToRound', index: 0 });
    game = run(game, { type: 'startReport', teamId: game.teams[0].id });
    if (!wasRunning) game = run(game, { type: 'timerToggle' }, T + 30_000);
    game = run(game, { type: 'fireTrap' }, T + 30_000);
    game = run(game, { type: 'setSettings', settings: { reportSeconds: 240 } }, T + 50_000);
    assert.equal(game.timer.durationMs, 240_000);
    assert.equal(game.timer.elapsedMs, 30_000);
    assert.equal(game.timer.startedAt, null);
    game = run(game, { type: 'closeTrap' }, T + 60_000);
    assert.equal(game.timer.startedAt, wasRunning ? T + 60_000 : null);
    assert.equal(elapsed(game.timer, T + 70_000), wasRunning ? 40_000 : 30_000);
    game = run(game, { type: 'setSettings', settings: { reportSeconds: 15 } }, T + 70_000);
    assert.equal(remaining(game.timer, T + 70_000), 0);
    assert.equal(game.timer.startedAt, null);
  }
});

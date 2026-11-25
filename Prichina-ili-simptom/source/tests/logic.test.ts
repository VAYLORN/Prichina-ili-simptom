import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRAPS } from '../shared/content/traps';
import { INTRO_DELAY_MS, activeRounds, apply, createGame, discussionMinutes, elapsed, isTrainingRound, planMinutes, planPlaces, remaining, scoreTable, tick, toPublic, type Command } from '../shared/logic';
import { SECTORS, type CaseCard, type GameState, type Library } from '../shared/types';
import cases from '../shared/content/cases.json' with { type: 'json' };
import { boardBlocks, boardPath } from '../src/ui/path';

const library: Library = { cases: cases as CaseCard[], traps: TRAPS };
const T0 = 1_000_000;
const fixedRand = () => 0; // always the first option / the minimal delay

const run = (state: GameState, cmds: Command[], now = T0) => cmds.reduce((s, c) => apply(s, c, library, now, fixedRand), state);

test('карточки из документа: 27 ситуаций, у каждой сектор, симптом, факты и ответ', () => {
  assert.equal(library.cases.length, 27);
  const ids = new Set(library.cases.map(c => c.id));
  assert.equal(ids.size, 27, 'ID не повторяются');
  for (const c of library.cases) {
    assert.ok(SECTORS.some(s => s.id === c.sector), `${c.id}: сектор`);
    assert.ok(c.symptom.length > 10, `${c.id}: симптом`);
    assert.ok(c.facts.length >= 5 && c.noise.length >= 4 && c.opinions.length >= 4, `${c.id}: карточки`);
    assert.ok(c.rootCause.length > 10, `${c.id}: корневая причина`);
  }
  for (const s of SECTORS) assert.ok(library.cases.filter(c => c.sector === s.id).length >= 5, `${s.title}: хватает ситуаций`);
});

test('план по умолчанию: заданные девять кейсов и восстанавливаемый резерв поставок', () => {
  const g = createGame(library);
  assert.equal(g.teams.length, 4);
  assert.equal(g.rounds.length, 12);
  assert.deepEqual(activeRounds(g).map(r => r.caseId), ['pr-04', 'pr-03', 'pr-02', 'ka-03', 'ka-02', 'ka-01', 'pe-03', 'pe-02', 'pe-01']);
  assert.deepEqual(g.rounds.slice(9).map(r => r.caseId), ['po-03', 'po-02', 'po-01']);
  assert.ok(g.rounds.every(r => r.withTrap), 'ловушки включены у всех кейсов, включая резерв');
  assert.equal(g.rounds.some(r => r.kind === 'final'), false, 'Персонал завершает основной маршрут');
  assert.equal(new Set(g.rounds.map(r => r.caseId)).size, 12, 'ситуации не повторяются');
  const places = planPlaces(activeRounds(g));
  assert.deepEqual([places[0], places[5], places[8]].map(p => [p.block, p.caseInBlock, p.blockSize, p.caseNumber]), [[1, 1, 3, 1], [2, 3, 3, 6], [3, 3, 3, 9]]);
  assert.deepEqual([g.settings.prepMinutes, g.settings.reportSeconds, g.settings.trainingPrepMinutes], [10, 180, 20]);
});

test('число кейсов в раунде пересобирает план и меняет расчёт времени', () => {
  let g = createGame(library);
  const before = planMinutes(g).total;
  // 4 команды × 3 мин доклада + 10 мин обсуждения + 2 мин оценки = 24 мин на кейс
  assert.equal(planMinutes(g).perCase, 24);
  assert.equal(before, 246, '9 кейсов + 10 дополнительных минут тренировки + 20 минут вводной и итогов');
  g = run(g, [{ type: 'setSettings', settings: { casesPerRound: 2 } }]);
  assert.equal(g.rounds.filter(r => r.kind === 'regular').length, 8);
  assert.ok(planMinutes(g).total < before);
});

test('раунд с ловушкой: выпадает через заданное время и ставит таймер на паузу, после закрытия время идёт дальше', () => {
  let g = createGame(library);
  const ti = g.rounds.findIndex((r, i) => i > 0 && r.withTrap);
  g = run(g, [{ type: 'goToRound', index: ti }, { type: 'startDiscussion' }]);
  const trap = g.rounds[ti].trap!;
  assert.equal(trap.delaySec, 10, 'минимальная задержка при rand=0');
  assert.equal(trap.firedAt, null);

  assert.equal(tick(g, library, T0 + 9_000, fixedRand), null, 'до 10 секунд ничего не происходит');
  g = tick(g, library, T0 + 10_200, fixedRand)!;
  assert.equal(g.rounds[ti].trap!.firedAt, T0 + 10_200);
  assert.equal(g.timer.startedAt, null, 'HOLD');
  assert.equal(toPublic(g, library).round!.trap!.title, TRAPS.find(t => t.id === trap.cardId)!.title);

  const left = remaining(g.timer, T0 + 60_000);
  assert.equal(left, remaining(g.timer, T0 + 10_200), 'на паузе время не убывает');
  assert.throws(() => apply(g, { type: 'timerToggle' }, library, T0 + 60_000), /закройте ловушку/);

  g = apply(g, { type: 'closeTrap' }, library, T0 + 60_000);
  assert.equal(toPublic(g, library).round!.trap, null);
  assert.equal(g.timer.startedAt, T0 + 60_000);
  assert.equal(Math.round(elapsed(g.timer, T0 + 70_000) / 1000), 20, '10 с до ловушки + 10 с после');
});

test('урезание времени ловушкой и окончание таймера', () => {
  let g = run(createGame(library), [{ type: 'nextRound' }, { type: 'startDiscussion' }]);
  g = apply(g, { type: 'timerFactor', factor: 0.5 }, library, T0 + 60_000);
  assert.equal(remaining(g.timer, T0 + 60_000), 570_000, '19 минут тренировки превратились в 9,5');
  const stopped = tick(g, library, T0 + 631_000)!;
  assert.equal(remaining(stopped.timer, T0 + 631_000), 0);
  assert.equal(stopped.timer.startedAt, null);
});

test('скрытые факты продаются по порядку и вычитаются из очков', () => {
  let g = run(createGame(library), [{ type: 'nextRound' }, { type: 'startDiscussion' }]);
  const team = g.teams[0].id;
  const c = library.cases.find(x => x.id === g.rounds[0].caseId)!;
  g = run(g, [{ type: 'sellHidden', teamId: team }, { type: 'sellHidden', teamId: team }]);
  assert.deepEqual(g.rounds[0].purchases.map(p => p.text), c.hidden.slice(0, 2));
  g = run(g, [
    { type: 'finishDiscussion' },
    { type: 'score', teamId: team, criterion: 'problem', value: 5 },
    { type: 'score', teamId: team, criterion: 'cause', value: 99 },
    { type: 'penalty', teamId: team, value: 1 },
  ]);
  assert.equal(g.rounds[0].results[team].scores.cause, 10, 'больше максимума не поставить');
  const row = scoreTable(g).find(r => r.teamId === team)!;
  assert.equal(row.perRound[0], 5 + 10 - 1 - 2);
  assert.equal(row.place, 1);
  assert.equal(scoreTable(g).find(r => r.teamId === g.teams[1].id)!.perRound[0], null, 'неоценённая команда — пусто');
});

test('экран игроков не получает ответы, скрытые факты и подписи карточек', () => {
  let g = run(createGame(library), [{ type: 'nextRound' }, { type: 'startDiscussion' }]);
  g = run(g, [{ type: 'sellHidden', teamId: g.teams[0].id }, { type: 'sellHidden', teamId: g.teams[1].id }]);
  const c = library.cases.find(x => x.id === g.rounds[0].caseId)!;
  let pub = JSON.stringify(toPublic(g, library));
  assert.ok(pub.includes(c.symptom));
  assert.ok(!pub.includes(c.rootCause), 'нет корневой причины');
  for (const h of c.hidden) assert.ok(!pub.includes(h), 'нет скрытых фактов');
  assert.ok(!pub.includes(c.facts[0]), 'карточки не показаны, пока ведущий не включит');

  g = run(g, [{ type: 'toggleStatements' }]);
  const shown = toPublic(g, library).round!.statements!;
  assert.equal(shown.length, c.facts.length + c.noise.length + c.opinions.length);
  assert.notDeepEqual(shown, [...c.facts, ...c.noise, ...c.opinions], 'вперемешку');
  pub = JSON.stringify(toPublic(g, library));
  assert.ok(!pub.includes('"facts"') && !pub.includes('"noise"'), 'без подписей');

  g = run(g, [{ type: 'finishDiscussion' }, { type: 'toggleReveal' }]);
  assert.equal(toPublic(g, library).round!.rootCause, c.rootCause, 'ответ — только по кнопке ведущего');
});

test('«Дальше»: фишка шагает по полю, потом сама открывается заставка, ситуация — отдельной кнопкой', () => {
  let g = createGame(library);
  g = run(g, [{ type: 'nextRound' }]);
  assert.equal(g.current, 0);
  assert.equal(g.view, 'board', 'фишка шагает по полю, ситуация ещё не открыта');
  assert.equal(g.rounds[0].phase, 'ready');
  assert.equal(tick(g, library, T0 + INTRO_DELAY_MS - 100), null, 'пока фишка идёт — поле');
  g = tick(g, library, T0 + INTRO_DELAY_MS)!;
  assert.equal(g.view, 'round', 'заставка раунда');
  assert.equal(g.introAt, null);
  assert.equal(toPublic(g, library).round!.symptom, '', 'игроки пока не видят ситуацию');
  assert.equal(tick(g, library, T0 + 60_000), null, 'заставка висит, пока ведущий не откроет ситуацию');
  g = run(g, [{ type: 'showSituation' }, { type: 'finishDiscussion' }, { type: 'score', teamId: g.teams[0].id, criterion: 'cause', value: 10 }, { type: 'finishRound' }]);
  assert.equal(g.view, 'board', 'после кейса — поле и рейтинг');
  const pub = toPublic(g, library);
  assert.deepEqual([pub.round!.place.block, pub.round!.place.caseInBlock], [1, 1]);
  assert.equal(pub.table.find(r => r.teamId === g.teams[0].id)!.perRound[0], 10, 'тренировочная оценка видна для обратной связи');
  assert.equal(pub.table.find(r => r.teamId === g.teams[0].id)!.total, 0, 'тренировка не влияет на рейтинг');
  assert.throws(() => run(g, [{ type: 'showSituation' }]), /уже открыта/, 'сыгранный кейс не открыть заново с нуля');
});

test('заставка не перебивает ведущего: другой экран или ситуация отменяют её', () => {
  let g = run(createGame(library), [{ type: 'nextRound' }, { type: 'setView', view: 'scores' }]);
  assert.equal(g.introAt, null);
  assert.equal(tick(g, library, T0 + INTRO_DELAY_MS + 1000), null, 'табло остаётся');
  g = run(createGame(library), [{ type: 'nextRound' }, { type: 'setSettings', settings: { soundVolume: 40 } }]);
  assert.equal(tick(g, library, T0 + INTRO_DELAY_MS)!.view, 'round', 'громкость звука заставку не отменяет');
  g = run(createGame(library), [{ type: 'nextRound' }, { type: 'showSituation' }]);
  assert.equal(tick(g, library, T0 + INTRO_DELAY_MS), null, 'ситуация уже на экране');
  assert.equal(g.view, 'round');
});
test('нельзя показать кейс без ситуации; сброс очищает названия, сохраняя состав и план', () => {
  let g = createGame(library);
  g = run(g, [{ type: 'updateRound', roundId: g.rounds[0].id, caseId: null }, { type: 'nextRound' }]);
  assert.throws(() => run(g, [{ type: 'showSituation' }]), /не выбрана ситуация/);
  g = run(createGame(library), [{ type: 'nextRound' }, { type: 'startDiscussion' }]);
  g = run(g, [{ type: 'updateTeam', teamId: g.teams[0].id, name: 'Литейщики' }, { type: 'sellHidden', teamId: g.teams[0].id }]);
  const teamIds = g.teams.map(t => t.id);
  const plan = g.rounds.map(r => r.caseId);
  g = run(g, [{ type: 'resetProgress' }]);
  assert.deepEqual(g.teams.map(t => t.name), ['Команда 1', 'Команда 2', 'Команда 3', 'Команда 4']);
  assert.deepEqual(g.teams.map(t => t.id), teamIds);
  assert.deepEqual(g.rounds.map(r => r.caseId), plan);
  assert.equal(g.current, -1);
  assert.ok(g.rounds.every(r => r.phase === 'ready' && !r.purchases.length));
});

test('поля и кейсы скрываются обратимо; переходы, экран и оценки пропускают скрытое', () => {
  let g = createGame(library);
  const original = g.rounds.map(r => r.id);
  g = run(g, [
    { type: 'updateRound', roundId: g.rounds[0].id, hidden: true },
    { type: 'setSettings', settings: { hiddenSectors: ['supply', 'quality'] } },
    { type: 'nextRound' },
    { type: 'startDiscussion' },
  ]);
  assert.equal(g.current, 1, 'сохранён исходный индекс');
  assert.equal(isTrainingRound(g, g.rounds[1]), true, 'первый доступный кейс — тренировочный');
  assert.equal(g.rounds[1].trap, null, 'автоматическая ловушка не прерывает тренировку');
  let pub = toPublic(g, library);
  assert.deepEqual(pub.rounds.map(r => r.index), [1, 2, 6, 7, 8]);
  assert.deepEqual([pub.round!.number, pub.round!.index, pub.round!.place.caseCount], [1, 1, 5]);
  assert.equal(pub.table[0].perRound.length, 5);
  assert.equal(pub.round!.discussionMinutes, 20);
  g = run(g, [{ type: 'finishRound' }, { type: 'nextRound' }, { type: 'finishRound' }, { type: 'nextRound' }]);
  assert.equal(g.current, 6, 'после Производства пропущено Качество');
  g = run(g, [
    { type: 'updateRound', roundId: g.rounds[0].id, hidden: false },
    { type: 'setSettings', settings: { hiddenSectors: [] } },
  ]);
  assert.deepEqual(g.rounds.map(r => r.id), original);
  assert.equal(activeRounds(g).length, 12);
  assert.equal(g.rounds[1].phase, 'done', 'восстановление не сбрасывает прогресс');
  assert.equal(isTrainingRound(g, g.rounds[0]), false, 'тренировка уже состоялась и не переносится');
  pub = toPublic(g, library);
  assert.equal(pub.rounds.at(-1)!.sector, 'supply', 'поставки доступны после восстановления');
});

test('сервер не разрешает скрыть идущий кейс или оставить пустую игру', () => {
  let g = createGame(library);
  assert.throws(() => run(g, [{ type: 'setSettings', settings: { hiddenSectors: ['production', 'quality', 'people', 'supply'] } }]), /хотя бы один/);
  g = run(g, [{ type: 'nextRound' }, { type: 'startDiscussion' }]);
  assert.throws(() => run(g, [{ type: 'updateRound', roundId: g.rounds[0].id, hidden: true }]), /идущий кейс/);
  assert.throws(() => run(g, [{ type: 'setSettings', settings: { hiddenSectors: ['production', 'supply'] } }]), /идущий кейс/);
  assert.throws(() => run(g, [{ type: 'goToRound', index: 9 }]), /восстановите/);
  g = run(g, [{ type: 'finishRound' }, { type: 'setSettings', settings: { hiddenSectors: ['quality', 'people', 'supply'] } }]);
  g = run(g, [{ type: 'updateRound', roundId: g.rounds[1].id, hidden: true }, { type: 'updateRound', roundId: g.rounds[2].id, hidden: true }]);
  assert.throws(() => run(g, [{ type: 'updateRound', roundId: g.rounds[0].id, hidden: true }]), /хотя бы один/);
  assert.throws(() => run(g, [{ type: 'removeRound', roundId: g.rounds[0].id }]), /хотя бы один/);
});

test('тренировочные сроки настраиваются; обратная связь не влияет на рейтинг и не меняется при скрытии', () => {
  let g = createGame(library);
  g = run(g, [{ type: 'setSettings', settings: { trainingPrepMinutes: 25, prepMinutes: 12, reportSeconds: 240 } }, { type: 'nextRound' }, { type: 'startDiscussion' }]);
  const team = g.teams[0].id;
  assert.equal(g.timer.durationMs, 25 * 60_000);
  assert.equal(discussionMinutes(g, g.rounds[1]), 12);
  g = run(g, [{ type: 'finishDiscussion' }, { type: 'startReport', teamId: team }, { type: 'score', teamId: team, criterion: 'cause', value: 10 }, { type: 'finishRound' }]);
  assert.equal(g.timer.durationMs, 240_000);
  assert.deepEqual([scoreTable(g)[0].perRound[0], scoreTable(g)[0].total], [10, 0]);
  g = run(g, [{ type: 'setSettings', settings: { trainingFirstCase: false } }]);
  assert.equal(scoreTable(g)[0].total, 0, 'настройка не меняет статус уже сыгранного кейса');
  g = run(g, [{ type: 'nextRound' }, { type: 'startDiscussion' }, { type: 'score', teamId: team, criterion: 'cause', value: 7 }, { type: 'finishRound' }]);
  assert.equal(scoreTable(g)[0].total, 7);
  g = run(g, [{ type: 'updateRound', roundId: g.rounds[0].id, hidden: true }]);
  assert.equal(scoreTable(g)[0].total, 7);
  g = run(g, [{ type: 'updateRound', roundId: g.rounds[1].id, hidden: true }]);
  assert.equal(scoreTable(g)[0].total, 0, 'скрытый кейс не входит в видимый рейтинг');
  g = run(g, [{ type: 'updateRound', roundId: g.rounds[1].id, hidden: false }]);
  assert.equal(scoreTable(g)[0].total, 7, 'оценка восстановлена без повторного ввода');
  g = run(g, [{ type: 'resetProgress' }]);
  assert.equal(g.rounds[0].hidden, true);
  assert.equal(g.rounds[1].training, undefined);
  assert.equal(isTrainingRound(g, g.rounds[1]), false, 'режим отключён настройкой');
});

test('восстановление сценария возвращает поставки в резерв, музыка сохраняет поведение v6', () => {
  let g = run(createGame(library), [{ type: 'setSettings', settings: { hiddenSectors: [], prepMinutes: 11 } }, { type: 'autoPlan' }]);
  assert.deepEqual(g.settings.hiddenSectors, ['supply']);
  assert.equal(g.settings.prepMinutes, 11);
  assert.equal(g.music, true);
  g = run(g, [{ type: 'nextRound' }]);
  assert.equal(g.music, false);
  g = run(g, [{ type: 'setView', view: 'pause' }]);
  assert.equal(g.music, true);
  g = run(g, [{ type: 'setMusic', on: false }]);
  assert.equal(toPublic(g, library).music, false);
});

test('поле строится по видимым кейсам; фишка использует исходный индекс после скрытия середины', () => {
  let g = createGame(library);
  let path = boardPath(activeRounds(g), g.current);
  assert.equal(boardBlocks(path.cells).length, 3);
  assert.equal(path.cells.some(c => c.sector === 'supply'), false);
  g = run(g, [{ type: 'updateRound', roundId: g.rounds[1].id, hidden: true }, { type: 'goToRound', index: 2 }]);
  path = boardPath(activeRounds(g), g.current);
  assert.equal(path.token, 2, 'третий исходный кейс — вторая видимая клетка после старта');
  assert.equal(path.cells[2].state, 'current');
  assert.deepEqual(boardBlocks(path.cells).map(block => block.length), [2, 3, 3]);
});

test('открытая заставка ready ещё не фиксирует тренировку: её можно отключить или перенести скрытием', () => {
  let g = run(createGame(library), [{ type: 'nextRound' }]);
  assert.equal(g.rounds[0].phase, 'ready');
  assert.equal(g.rounds[0].training, undefined);
  assert.equal(isTrainingRound(g, g.rounds[0]), true);
  g = run(g, [{ type: 'setSettings', settings: { trainingFirstCase: false } }]);
  assert.equal(isTrainingRound(g, g.rounds[0]), false);
  assert.equal(g.timer.durationMs, 10 * 60_000);

  g = run(createGame(library), [{ type: 'goToRound', index: 0 }]);
  g = run(g, [{ type: 'updateRound', roundId: g.rounds[0].id, hidden: true }, { type: 'nextRound' }]);
  assert.equal(g.current, 1);
  assert.equal(g.rounds[0].training, undefined);
  assert.equal(isTrainingRound(g, g.rounds[1]), true);
  assert.equal(g.timer.durationMs, 20 * 60_000);
  g = run(g, [{ type: 'showSituation' }]);
  assert.equal(g.rounds[1].training, true, 'статус фиксируется только с открытием ситуации');
});

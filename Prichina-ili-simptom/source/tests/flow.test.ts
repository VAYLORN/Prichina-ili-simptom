import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRAPS } from '../shared/content/traps';
import { RULE_SLIDES } from '../shared/content/rules';
import { backStep, nextStep } from '../shared/flow';
import { activeRounds, apply, createGame, scoreTable, toPublic } from '../shared/logic';
import type { CaseCard, GameState, Library } from '../shared/types';
import cases from '../shared/content/cases.json' with { type: 'json' };

const library: Library = { cases: cases as CaseCard[], traps: TRAPS };
const T0 = 1_000_000;
const press = (g: GameState) => {
  const step = nextStep(g, T0);
  assert.ok(step, 'есть следующий шаг');
  return { g: apply(g, step.cmd, library, T0, () => 0), step };
};

test('начало: заставка → правила по слайдам → роли → первый кейс', () => {
  let g = createGame(library);
  assert.equal(nextStep(g, T0)!.label, 'Начать игру: правила');
  g = press(g).g;
  assert.deepEqual([g.view, g.slide], ['rules', 0]);
  for (let i = 1; i < RULE_SLIDES.length; i++) {
    g = press(g).g;
    assert.deepEqual([g.view, g.slide], ['rules', i]);
  }
  assert.equal(nextStep(g, T0)!.label, 'Роли в команде');
  g = press(g).g;
  assert.equal(g.view, 'roles');
  assert.equal(nextStep(g, T0)!.label, 'Первый кейс: Раунд 1 · Производство');
  g = press(g).g;
  assert.deepEqual([g.current, g.view], [0, 'board']);
});

test('← листает правила назад, в остальном «Назад» нет', () => {
  let g = apply(createGame(library), { type: 'setView', view: 'rules', slide: 2 }, library, T0);
  g = apply(g, backStep(g)!, library, T0);
  assert.equal(g.slide, 1);
  g = apply(g, { type: 'setView', view: 'rules', slide: 0 }, library, T0);
  assert.equal(apply(g, backStep(g)!, library, T0).view, 'welcome');
  assert.equal(backStep(apply(g, { type: 'nextRound' }, library, T0)), null);
});

test('кейс одной кнопкой: заставка, ситуация, обсуждение, доклады по очереди, ответ, рейтинг', () => {
  let g = apply(createGame(library), { type: 'nextRound' }, library, T0);
  const labels: string[] = [];
  for (let i = 0; i < 12; i++) {
    const r = press(g);
    labels.push(r.step.label);
    g = r.g;
    if (g.rounds[0].phase === 'done') break;
  }
  assert.deepEqual(labels, [
    'Заставка: Раунд 1 · Производство',
    'Показать ситуацию',
    'Старт тренировки · 20 мин',
    'Закончить обсуждение — к докладам',
    'Доклад: Команда 1',
    'Доклад: Команда 2',
    'Доклад: Команда 3',
    'Доклад: Команда 4',
    'Показать правильный ответ',
    'Завершить тренировку — без баллов в рейтинг',
  ]);
  assert.equal(g.view, 'board');
  assert.equal(nextStep(g, T0)!.label, 'Дальше: Производство · кейс 2 из 3');
});

test('порядок докладов сдвигается от кейса к кейсу, экран знает очередь', () => {
  let g = createGame(library);
  g = apply(g, { type: 'goToRound', index: 1 }, library, T0);
  g = apply(g, { type: 'finishDiscussion' }, library, T0);
  assert.equal(nextStep(g, T0)!.label, 'Доклад: Команда 2', 'второй кейс — со второй команды');
  g = press(g).g;
  const pub = toPublic(g, library).round!;
  assert.deepEqual(pub.reportOrder, [g.teams[1], g.teams[2], g.teams[3], g.teams[0]].map(t => t.id));
  assert.deepEqual(pub.reported, [g.teams[1].id]);
});

test('ловушка на экране: большая кнопка её закрывает', () => {
  let g = createGame(library);
  g = apply(g, { type: 'goToRound', index: 4 }, library, T0);
  g = apply(g, { type: 'startDiscussion' }, library, T0, () => 0);
  g = apply(g, { type: 'fireTrap' }, library, T0 + 5000, () => 0);
  assert.equal(nextStep(g, T0 + 6000)!.label, 'Ловушка прочитана — закрыть');
  g = apply(g, nextStep(g, T0 + 6000)!.cmd, library, T0 + 6000);
  assert.equal(toPublic(g, library).round!.trap, null);
});

test('вся игра проходится одной кнопкой и заканчивается итогами и табло', () => {
  let g = createGame(library);
  const keys = new Set<string>();
  let presses = 0;
  for (; presses < 400 && nextStep(g, T0); presses++) {
    const r = press(g);
    assert.ok(!keys.has(r.step.key + presses), 'шаг меняет момент игры');
    keys.add(r.step.key + presses);
    assert.notEqual(nextStep(r.g, T0)?.key, r.step.key, 'после нажатия — новый момент: повторное нажатие не сработает дважды');
    g = r.g;
  }
  assert.ok(presses < 400);
  assert.ok(activeRounds(g).every(r => r.phase === 'done'));
  assert.ok(g.rounds.filter(r => r.sector === 'supply').every(r => r.phase === 'ready'));
  assert.equal(g.view, 'scores');
  assert.equal(scoreTable(g).length, 4);
});

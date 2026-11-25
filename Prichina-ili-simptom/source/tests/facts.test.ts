import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { apply, createGame, roundScore, toPublic, type Command } from '../shared/logic';
import type { GameState, Library } from '../shared/types';
import { commandSchema } from '../server/schemas';
import { DEFAULT_LIBRARY, Store } from '../server/store';

const library: Library = structuredClone(DEFAULT_LIBRARY);
const card = library.cases.find(c => c.id === 'pr-04')!;
card.hidden = ['Закрытый факт A', 'Закрытый факт B'];
card.hiddenExtra = ['Закрытый факт C'];
const step = (game: GameState, command: Command, now = 1000) => apply(game, command, library, now, () => 0);
const begin = () => step(step(createGame(library), { type: 'nextRound' }), { type: 'showSituation' });

test('ведущий выбирает факт, меняет фактически выданный и платит за одну выдачу один раз', () => {
  let game = begin();
  const teamId = game.teams[0].id;
  game = step(game, { type: 'sellHidden', teamId, factIndex: 2 });
  const initial = game.rounds[0].purchases[0];
  assert.ok(initial.id);
  assert.deepEqual([initial.factIndex, initial.text, initial.at], [2, 'Закрытый факт C', 1000]);
  assert.equal(roundScore(game, game.rounds[0], teamId), -game.settings.hiddenCost);

  game = step(game, { type: 'replaceHidden', purchaseId: initial.id, factIndex: 1 }, 2000);
  assert.deepEqual(game.rounds[0].purchases, [{ ...initial, factIndex: 1, text: 'Закрытый факт B' }]);
  assert.equal(roundScore(game, game.rounds[0], teamId), -game.settings.hiddenCost, 'замена не списывает второй балл');
  game = step(game, { type: 'replaceHidden', purchaseId: initial.id, factIndex: 1 });
  assert.equal(game.rounds[0].purchases.length, 1, 'повторная фиксация того же факта не создаёт покупку');

  game = step(game, { type: 'sellHidden', teamId });
  assert.equal(game.rounds[0].purchases[1].text, 'Закрытый факт A', 'автовыбор пропускает только реально выданные факты');
  game = step(game, { type: 'sellHidden', teamId, factIndex: 2 });
  assert.equal(game.rounds[0].purchases.length, 3, 'заменённый факт доступен для последующей отдельной выдачи');
});

test('невалидные факты, повторная выдача и исправление чужого кейса отклоняются без изменения счёта', () => {
  let game = begin();
  const teamId = game.teams[0].id;
  game = step(game, { type: 'sellHidden', teamId, factIndex: 0 });
  game = step(game, { type: 'sellHidden', teamId, factIndex: 1 });
  const first = game.rounds[0].purchases[0];
  const original = JSON.stringify(game);
  for (const factIndex of [-1, 3, 0.5, NaN]) {
    assert.throws(() => step(game, { type: 'sellHidden', teamId, factIndex }), /существующий/);
    assert.throws(() => step(game, { type: 'replaceHidden', purchaseId: first.id, factIndex }), /существующий/);
  }
  assert.throws(() => step(game, { type: 'sellHidden', teamId, factIndex: 0 }), /уже выдан/);
  assert.throws(() => step(game, { type: 'replaceHidden', purchaseId: first.id, factIndex: 1 }), /уже выдан/);
  assert.throws(() => step(game, { type: 'sellHidden', teamId: 'not-a-team', factIndex: 2 }), /Команда не найдена/);
  assert.equal(JSON.stringify(game), original, 'ошибочная команда не изменяет исходное состояние');

  game = step(game, { type: 'sellHidden', teamId: game.teams[1].id, factIndex: 0 });
  assert.equal(game.rounds[0].purchases.length, 3, 'другой команде можно выдать тот же факт');
  game = step(game, { type: 'goToRound', index: 1 });
  assert.throws(() => step(game, { type: 'replaceHidden', purchaseId: first.id, factIndex: 0 }), /в этом кейсе не найдена/);
  assert.equal(commandSchema.safeParse({ type: 'replaceHidden', purchaseId: first.id, factIndex: -1 }).success, false);
  assert.equal(commandSchema.safeParse({ type: 'sellHidden', teamId, factIndex: 80 }).success, false);
});

test('экран получает только счётчик: выбранный и исправленный факты остаются у ведущего', () => {
  let game = begin();
  const teamId = game.teams[0].id;
  game = step(game, { type: 'sellHidden', teamId, factIndex: 2 });
  const purchaseId = game.rounds[0].purchases[0].id;
  game = step(game, { type: 'replaceHidden', purchaseId, factIndex: 1 });
  const pub = toPublic(game, library);
  assert.deepEqual(pub.round!.purchases, { [teamId]: 1 });
  const payload = JSON.stringify(pub);
  assert.equal(payload.includes('Закрытый факт'), false);
  assert.equal(payload.includes(purchaseId), false);
  assert.equal(payload.includes('factIndex'), false);
});

test('история сохраняется после перезапуска и правки библиотеки; старые выдачи получают стабильные ID', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cause-fact-history-'));
  const file = join(dir, 'game.json');
  t.after(() => { rmSync(file, { force: true }); rmdirSync(dir); });
  const store = new Store(dir);
  let game = begin();
  game = step(game, { type: 'sellHidden', teamId: game.teams[0].id, factIndex: 2 });
  const purchaseId = game.rounds[0].purchases[0].id;
  game = step(game, { type: 'replaceHidden', purchaseId, factIndex: 1 });
  store.saveGame(game);

  const edited = structuredClone(library);
  edited.cases.find(c => c.id === 'pr-04')!.hidden[1] = 'Переписанный текст в библиотеке';
  const loaded = store.loadGame(edited);
  assert.deepEqual(loaded.rounds[0].purchases, game.rounds[0].purchases, 'точно помним прочитанное, а не новую редакцию библиотеки');

  const legacy = JSON.parse(JSON.stringify(game));
  delete legacy.rounds[0].purchases[0].id;
  delete legacy.rounds[0].purchases[0].factIndex;
  store.saveGame(legacy);
  const old1 = store.loadGame(library);
  const old2 = store.loadGame(library);
  assert.equal(old1.rounds[0].purchases[0].id, old2.rounds[0].purchases[0].id, 'стабильный ID даже до следующего сохранения');
  assert.equal(old1.rounds[0].purchases[0].factIndex, 1);
  const unmatched = store.loadGame(edited).rounds[0].purchases[0];
  assert.equal(unmatched.text, 'Закрытый факт B');
  assert.equal(unmatched.factIndex, undefined, 'не приписываем старую выдачу другому тексту');
  game = step(old1, { type: 'replaceHidden', purchaseId: old1.rounds[0].purchases[0].id, factIndex: 2 });
  store.saveGame(game);
  assert.deepEqual(store.loadGame(library).rounds[0].purchases, game.rounds[0].purchases);
});

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { activeRounds, apply, createGame, scoreTable } from '../shared/logic';
import { DEFAULT_LIBRARY, Store } from '../server/store';

test('загрузка старого события сохраняет план, прогресс, таймер и конкурсные баллы', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cause-store-'));
  const file = join(dir, 'game.json');
  t.after(() => { rmSync(file, { force: true }); rmdirSync(dir); });
  let game = createGame(DEFAULT_LIBRARY);
  game = apply(game, { type: 'nextRound' }, DEFAULT_LIBRARY, 1000);
  game = apply(game, { type: 'startDiscussion' }, DEFAULT_LIBRARY, 1000);
  game = apply(game, { type: 'score', teamId: game.teams[0].id, criterion: 'cause', value: 10 }, DEFAULT_LIBRARY, 1000);
  const raw = JSON.parse(JSON.stringify(game));
  for (const key of ['hiddenSectors', 'trainingFirstCase', 'trainingPrepMinutes', 'musicVolume']) delete raw.settings[key];
  for (const round of raw.rounds) delete round.training;
  delete raw.music;
  const original = JSON.stringify(raw);
  writeFileSync(file, original, 'utf8');

  const loaded = new Store(dir).loadGame(DEFAULT_LIBRARY);
  assert.equal(readFileSync(file, 'utf8'), original, 'загрузка не переписывает сохранение');
  assert.deepEqual(loaded.rounds.map(r => r.id), game.rounds.map(r => r.id));
  assert.deepEqual(loaded.timer, game.timer);
  assert.equal(loaded.current, game.current);
  assert.equal(loaded.rounds[0].phase, 'discussion');
  assert.equal(loaded.rounds[0].training, false);
  assert.equal(loaded.settings.trainingFirstCase, false);
  assert.equal(activeRounds(loaded).length, 12, 'загрузка не скрывает ранее видимые поля');
  assert.equal(scoreTable(loaded)[0].total, 10, 'старые конкурсные оценки не становятся тренировочными');
});

test('сохранение и загрузка нового сценария сохраняют скрытие и тренировочную оценку', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cause-store-'));
  const file = join(dir, 'game.json');
  t.after(() => { rmSync(file, { force: true }); rmdirSync(dir); });
  const store = new Store(dir);
  let game = createGame(DEFAULT_LIBRARY);
  game = apply(game, { type: 'nextRound' }, DEFAULT_LIBRARY, 1000);
  game = apply(game, { type: 'startDiscussion' }, DEFAULT_LIBRARY, 1000);
  game = apply(game, { type: 'score', teamId: game.teams[0].id, criterion: 'cause', value: 10 }, DEFAULT_LIBRARY, 1000);
  store.saveGame(game);
  const loaded = store.loadGame(DEFAULT_LIBRARY);
  assert.equal(activeRounds(loaded).length, 9);
  assert.equal(loaded.rounds[0].training, true);
  assert.deepEqual([scoreTable(loaded)[0].perRound[0], scoreTable(loaded)[0].total], [10, 0]);
});

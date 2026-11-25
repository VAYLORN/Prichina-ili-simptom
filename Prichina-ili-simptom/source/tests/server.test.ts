// Starts the real server on a free port with a temporary data folder and plays a bit
// through two sockets: the host console and the projector.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import type { GameState, PublicState } from '../shared/types';

const root = resolve(import.meta.dirname, '..');
const dataDir = mkdtempSync(join(tmpdir(), 'cause-game-'));
let base = '';
let server: ReturnType<typeof spawn>;

const freePort = () => new Promise<number>(res => {
  const s = createServer().listen(0, () => {
    const port = (s.address() as { port: number }).port;
    s.close(() => res(port));
  });
});

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const serverArgs = process.env.TEST_SERVER_ENTRY ? [resolve(process.env.TEST_SERVER_ENTRY)] : ['--import', 'tsx', 'server/index.ts'];
  server = spawn(process.execPath, serverArgs, {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, OPERATOR_PIN: '424242', OPEN_BROWSER: '0', TRUST_PROXY: '1' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

const next = <T>(socket: Socket, event: string, match: (v: T) => boolean) => new Promise<T>(res => {
  const handler = (v: T) => { if (match(v)) { socket.off(event, handler); res(v); } };
  socket.on(event, handler);
});

test('за HTTPS-прокси: cookie с флагом Secure, подбор PIN блокируется', async () => {
  const login = (pin: string, ip: string, proto = 'https') => fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, 'X-Forwarded-Proto': proto },
    body: JSON.stringify({ pin }),
  });
  const secure = await login('424242', '203.0.113.5');
  assert.match(secure.headers.get('set-cookie')!, /; Secure/);
  const plain = await login('424242', '203.0.113.5', 'http');
  assert.doesNotMatch(plain.headers.get('set-cookie')!, /Secure/);

  for (let i = 0; i < 8; i++) assert.equal((await login('000000', '198.51.100.7')).status, 401);
  const locked = await login('424242', '198.51.100.7');
  assert.equal(locked.status, 429, 'даже верный PIN не пускает после 8 ошибок');
  assert.equal((await login('424242', '198.51.100.8')).status, 200, 'другой адрес не заблокирован');
});

test('вход по PIN, команды ведущего и закрытый от игроков экран', async t => {
  assert.equal((await fetch(`${base}/api/library`)).status, 401, 'без входа карточки не отдаются');
  const bad = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '1' }) });
  assert.equal(bad.status, 401);
  const ok = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '424242' }) });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie')!.split(';')[0];

  const library = await (await fetch(`${base}/api/library`, { headers: { cookie } })).json();
  assert.equal(library.cases.length, 27);

  const rejected = io(`${base}/host`, { transports: ['websocket'], reconnection: false });
  const err = await new Promise<Error>(res => rejected.on('connect_error', res));
  assert.match(err.message, /вход/);
  rejected.close();

  const host = io(`${base}/host`, { transports: ['websocket'], extraHeaders: { cookie } });
  const screen = io(`${base}/screen`, { transports: ['websocket'] });
  t.after(() => { host.close(); screen.close(); });
  const first = await next<{ game: GameState }>(host, 'state', () => true);
  const initialScreen = (await next<{ state: PublicState }>(screen, 'state', () => true)).state;
  assert.equal(initialScreen.rounds.length, 9);
  assert.equal(initialScreen.rounds.some(r => r.sector === 'supply'), false);
  assert.deepEqual([first.game.settings.prepMinutes, first.game.settings.reportSeconds], [10, 180]);

  const send = (cmd: object) => new Promise<{ ok?: true; error?: string }>(res => host.emit('cmd', cmd, res));
  assert.match((await send({ type: 'setSettings', settings: { hiddenSectors: ['production', 'quality', 'people', 'supply'] } })).error!, /хотя бы один/);
  assert.match((await send({ type: 'setSettings', settings: { trainingPrepMinutes: 0 } })).error!, /Некорректная/);
  assert.deepEqual(await send({ type: 'nextRound' }), { ok: true });
  assert.match((await send({ type: 'nope' })).error!, /Некорректная/);

  const seen = next<{ state: PublicState }>(screen, 'state', p => p.state.round?.phase === 'discussion');
  assert.deepEqual(await send({ type: 'startDiscussion' }), { ok: true });
  const pub = (await seen).state;
  assert.equal(pub.round!.training, true);
  assert.equal(pub.timer.durationMs, 20 * 60_000);
  assert.match((await send({ type: 'updateRound', roundId: first.game.rounds[0].id, hidden: true })).error!, /идущий кейс/);
  const card = library.cases.find((c: { id: string }) => c.id === first.game.rounds[0].caseId);
  assert.equal(pub.round!.symptom, card.symptom);
  const raw = JSON.stringify(pub);
  assert.ok(!raw.includes(card.rootCause) && !raw.includes(card.hidden[0]), 'проектор не видит ответ и скрытые факты');

  const sold = next<{ game: GameState }>(host, 'state', p => p.game.rounds[0].purchases.length === 1);
  await send({ type: 'sellHidden', teamId: first.game.teams[2].id });
  assert.equal((await sold).game.rounds[0].purchases[0].text, card.hidden[0]);

  // The projector reports its sound state; the host's «проверить звук» reaches the projector.
  const withSound = next<{ screensWithSound: number }>(host, 'state', p => p.screensWithSound === 1);
  screen.emit('audio', true);
  assert.equal((await withSound).screensWithSound, 1);
  const ping = new Promise<string>(res => screen.once('sound', res));
  host.emit('soundTest');
  assert.equal(await ping, 'ready');

  const csv = Buffer.from(await (await fetch(`${base}/api/results.csv`, { headers: { cookie } })).arrayBuffer());
  assert.deepEqual([...csv.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM, чтобы Excel понял кириллицу');
  assert.ok(csv.toString('utf8').includes('"Команда 3"'));
});

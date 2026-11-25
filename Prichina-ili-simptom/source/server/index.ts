import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { COMMAND_LABELS, backStep, nextStep, type HostCommand } from '../shared/flow';
import { activeRounds, isTrainingRound, apply, GameError, QUIET, scoreTable, tick, toPublic, type Command } from '../shared/logic';
import { CRITERIA, sectorById, type CaseCard, type GameState, type Library, type TrapCard } from '../shared/types';
import { caseSchema, commandSchema, trapSchema } from './schemas';
import { DEFAULT_LIBRARY, Store } from './store';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const store = new Store(process.env.DATA_DIR || resolve(root, 'data'));
const pin = store.pin();
const sessionToken = createHash('sha256').update(`${store.secret()}:${pin}`).digest('hex');

let library: Library = store.loadLibrary();
let game: GameState = store.loadGame(library);

// ---------- auth ----------

const cookieToken = (cookie: string | undefined) =>
  cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('host='))?.slice(5) ?? '';

const isHost = (cookie: string | undefined) => {
  const token = cookieToken(cookie);
  return token.length === sessionToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(sessionToken));
};

const sameOrigin = (origin: string | undefined, host: string | undefined) => {
  if (!origin) return true;
  try { return new URL(origin).host === host; } catch { return false; }
};

// ---------- realtime ----------

const app = express();
const http = createServer(app);
const io = new Server(http, {
  serveClient: false, // the client library is bundled by Vite
  maxHttpBufferSize: 200_000,
  allowRequest: (req, cb) => cb(null, sameOrigin(req.headers.origin, req.headers.host)),
});
const hostNS = io.of('/host');
// Sounds the host may preview on the projector (names from src/screen/sound.ts).
const TEST_SOUNDS = new Set(['ready', 'start', 'tick', 'tickFinal', 'timeup', 'trap', 'report', 'step', 'fanfare']);
const screenNS = io.of('/screen');

hostNS.use((socket, next) => (isHost(socket.request.headers.cookie) ? next() : next(new Error('Нужен вход ведущего'))));

const hostPacket = () => ({
  game,
  serverTime: Date.now(),
  screens: screenNS.sockets.size,
  screensWithSound: [...screenNS.sockets.values()].filter(s => s.data.audio).length,
  undo: history.at(-1)?.label ?? null,
});
const screenPacket = () => ({ state: toPublic(game, library), serverTime: Date.now() });

function broadcast() {
  hostNS.emit('state', hostPacket());
  screenNS.emit('state', screenPacket());
}

function broadcastLibrary() {
  hostNS.emit('library', library);
  screenNS.emit('state', screenPacket());
}

function commit(next: GameState) {
  store.saveGame(next);
  game = next;
  broadcast();
}

// «Отменить»: the game before each of the last moves (scores and settings are not moves —
// they are simply edited again). Kept in memory only.
const history: { state: GameState; label: string }[] = [];

function perform(cmd: HostCommand) {
  if (cmd.type === 'undo') {
    const last = history.pop();
    if (!last) throw new GameError('Отменять нечего');
    return commit({ ...last.state, introAt: null });
  }
  let move: Command;
  let label = COMMAND_LABELS[cmd.type] ?? 'действие';
  if (cmd.type === 'advance') {
    const step = nextStep(game);
    if (!step) throw new GameError('Игра окончена — дальше шагов нет');
    if (cmd.key && cmd.key !== step.key) return; // pressed twice: the game has already moved on
    move = step.cmd;
    label = step.label;
  } else if (cmd.type === 'back') {
    const back = backStep(game);
    if (!back) throw new GameError('«Назад» листает правила. Вернуть действие — кнопка «Отменить».');
    move = back;
  } else {
    move = cmd;
  }
  const next = apply(game, move, library);
  if (!QUIET.includes(move.type)) {
    history.push({ state: game, label });
    if (history.length > 60) history.shift();
  }
  commit(next);
}

hostNS.on('connection', (socket: Socket) => {
  socket.emit('library', library);
  socket.emit('state', hostPacket());
  socket.on('soundTest', (name: unknown) => screenNS.emit('sound', typeof name === 'string' && TEST_SOUNDS.has(name) ? name : 'ready'));
  socket.on('cmd', (raw: unknown, ack?: (reply: { ok: true } | { error: string }) => void) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) return reply({ error: 'Некорректная команда' });
    try {
      perform(parsed.data as HostCommand);
      reply({ ok: true });
    } catch (error) {
      reply({ error: error instanceof GameError ? error.message : 'Не удалось выполнить действие' });
      if (!(error instanceof GameError)) console.error(error);
    }
  });
});

screenNS.on('connection', socket => {
  socket.data.audio = false;
  socket.emit('state', screenPacket());
  hostNS.emit('state', hostPacket());
  socket.on('audio', (on: unknown) => {
    socket.data.audio = on === true;
    hostNS.emit('state', hostPacket());
  });
  socket.on('disconnect', () => hostNS.emit('state', hostPacket()));
});

// ---------- http ----------

app.disable('x-powered-by');
// Behind a reverse proxy (Caddy/nginx on a VDS) take the client IP and https from X-Forwarded-*.
const trustProxy = process.env.TRUST_PROXY ?? 'loopback';
app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && !sameOrigin(req.headers.origin, req.headers.host)) return void res.status(403).json({ error: 'Запрос с чужой страницы' });
  next();
});
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, application: 'cause-or-symptom' }));

// 8 wrong PINs from one address lock it out for 15 minutes — enough for typos, too slow for guessing.
const attempts = new Map<string, { count: number; until: number }>();
const cookieFlags = (req: Request) => `HttpOnly; SameSite=Strict; Path=/${req.secure ? '; Secure' : ''}`;
app.post('/api/login', (req, res) => {
  const ip = req.ip ?? 'local';
  const a = attempts.get(ip);
  if (a && a.count >= 8 && a.until > Date.now()) {
    return void res.status(429).json({ error: `Слишком много попыток. Попробуйте через ${Math.ceil((a.until - Date.now()) / 60_000)} мин.` });
  }
  const value = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
  const hash = (s: string) => createHash('sha256').update(s).digest();
  if (!timingSafeEqual(hash(value), hash(pin))) {
    attempts.set(ip, { count: a && a.until > Date.now() ? a.count + 1 : 1, until: Date.now() + 15 * 60_000 });
    return void res.status(401).json({ error: 'Неверный PIN' });
  }
  attempts.delete(ip);
  res.setHeader('Set-Cookie', `host=${sessionToken}; ${cookieFlags(req)}; Max-Age=${60 * 60 * 24}`);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `host=; ${cookieFlags(req)}; Max-Age=0`);
  res.json({ ok: true });
});

// Everything below is for the host only.
app.use('/api', (req, res, next) => (isHost(req.headers.cookie) ? next() : void res.status(401).json({ error: 'Войдите как ведущий' })));

app.get('/api/session', (_req, res) => res.json({ ok: true }));

// A presentation clicker on the projector computer: the screen page posts → and ← here. Works only
// in a browser where the host has signed in (the cookie), so a stray /screen tab can't drive the game.
app.post('/api/step', (req, res) => {
  try {
    perform({ type: req.body?.dir === 'back' ? 'back' : 'advance' });
    res.json({ ok: true });
  } catch (error) {
    if (!(error instanceof GameError)) throw error;
    res.status(409).json({ error: error.message });
  }
});
app.get('/api/library', (_req, res) => res.json(library));
app.get('/api/game', (_req, res) => res.json(game));

function saveLibrary(next: Library) {
  store.saveLibrary(next);
  library = next;
  broadcastLibrary();
}

app.put('/api/cases/:id', (req, res) => {
  const card = caseSchema.parse(req.body) as CaseCard;
  if (card.id !== req.params.id) return void res.status(400).json({ error: 'ID карточки не совпадает' });
  const exists = library.cases.some(c => c.id === card.id);
  saveLibrary({ ...library, cases: exists ? library.cases.map(c => (c.id === card.id ? card : c)) : [...library.cases, card] });
  res.json(card);
});

app.delete('/api/cases/:id', (req, res) => {
  if (game.rounds.some(r => r.caseId === req.params.id)) return void res.status(409).json({ error: 'Карточка стоит в плане раундов. Сначала замените её там.' });
  saveLibrary({ ...library, cases: library.cases.filter(c => c.id !== req.params.id) });
  res.json({ ok: true });
});

app.put('/api/traps/:id', (req, res) => {
  const trap = trapSchema.parse(req.body) as TrapCard;
  if (trap.id !== req.params.id) return void res.status(400).json({ error: 'ID карточки не совпадает' });
  const exists = library.traps.some(t => t.id === trap.id);
  saveLibrary({ ...library, traps: exists ? library.traps.map(t => (t.id === trap.id ? trap : t)) : [...library.traps, trap] });
  res.json(trap);
});

app.delete('/api/traps/:id', (req, res) => {
  saveLibrary({ ...library, traps: library.traps.filter(t => t.id !== req.params.id) });
  res.json({ ok: true });
});

// Import replaces cards with the same ID and adds new ones; the whole file is rejected on any error.
app.post('/api/library/import', (req, res) => {
  const body = z.object({ cases: z.array(caseSchema).max(500).optional(), traps: z.array(trapSchema).max(200).optional() }).parse(req.body);
  const merge = <T extends { id: string }>(old: T[], incoming: T[] = []) => [
    ...old.map(item => incoming.find(n => n.id === item.id) ?? item),
    ...incoming.filter(n => !old.some(item => item.id === n.id)),
  ];
  saveLibrary({ cases: merge(library.cases, body.cases as CaseCard[]), traps: merge(library.traps, body.traps as TrapCard[]) });
  res.json({ cases: body.cases?.length ?? 0, traps: body.traps?.length ?? 0 });
});

app.post('/api/library/restore', (_req, res) => {
  const ids = new Set(DEFAULT_LIBRARY.cases.map(c => c.id));
  saveLibrary({
    cases: [...structuredClone(DEFAULT_LIBRARY.cases), ...library.cases.filter(c => !ids.has(c.id))],
    traps: structuredClone(DEFAULT_LIBRARY.traps),
  });
  res.json({ ok: true });
});

app.get('/api/results.csv', (_req, res) => {
  const cell = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const rows: unknown[][] = [];
  const table = scoreTable(game);
  const visible = activeRounds(game);
  rows.push(['Место', 'Команда', ...visible.map((r, i) => `${r.kind === 'final' ? 'Финал' : `Кейс ${i + 1}`}${isTrainingRound(game, r) ? ' (тренировка, вне зачёта)' : ''}`), 'Итого']);
  for (const row of [...table].sort((a, b) => a.place - b.place)) {
    rows.push([row.place, game.teams.find(t => t.id === row.teamId)?.name, ...row.perRound.map(v => v ?? ''), row.total]);
  }
  rows.push([]);
  rows.push(['Раунд', 'Сектор', 'Команда', ...CRITERIA.map(c => c.title), 'Скрытых фактов', 'Штраф']);
  visible.forEach((r, i) => {
    for (const team of game.teams) {
      const result = r.results[team.id];
      const bought = r.purchases.filter(p => p.teamId === team.id).length;
      if (!result && !bought) continue;
      rows.push([i + 1, sectorById(r.sector).title, team.name, ...CRITERIA.map(c => result?.scores[c.id] ?? ''), bought, result?.penalty ?? 0]);
    }
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="results.csv"');
  res.send('﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n'));
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено' }));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    return void res.status(400).json({ error: 'Проверьте поля: ' + error.issues.map(i => `${i.path.join('.')} — ${i.message}`).join('; ') });
  }
  console.error(error);
  res.status(500).json({ error: 'Ошибка сервера' });
});

if (process.argv.includes('--dev')) {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  // Built assets have content hashes in their names, so they can be cached for good.
  app.use('/assets', express.static(resolve(root, 'dist/assets'), { immutable: true, maxAge: '365d' }));
  app.use(express.static(resolve(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(root, 'dist/index.html')));
}

// Fires planned traps and stops the timer at zero.
const ticker = setInterval(() => {
  const next = tick(game, library);
  if (next) commit(next);
}, 200);

// Without an explicit PORT a busy 3210 (another program on the laptop) moves the game to 3211…3219.
const firstPort = Number(process.env.PORT || 3210);
let port = firstPort;
http.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE' && !process.env.PORT && port < firstPort + 9) return void http.listen(++port, process.env.HOST || '127.0.0.1');
  console.error(error.code === 'EADDRINUSE' ? `\n  Порт ${port} занят другой программой. Закройте её и запустите игру снова.\n` : error);
  process.exit(1);
});
http.on('listening', () => {
  const pinSource = process.env.OPERATOR_PIN ? 'переменная OPERATOR_PIN' : resolve(store.dir, 'operator-pin.txt');
  console.log(`\n  Причина или симптом?\n  Ведущий:  http://localhost:${port}/operator\n  Проектор: http://localhost:${port}/screen\n  PIN:      ${pinSource}\n`);
  if (process.env.OPEN_BROWSER === '1' && process.platform === 'win32') {
    spawn('explorer.exe', [`http://localhost:${port}/operator`], { stdio: 'ignore', windowsHide: true }).on('error', () => {});
  }
});
http.listen(port, process.env.HOST || '127.0.0.1');

function shutdown() {
  clearInterval(ticker);
  io.close();
  http.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

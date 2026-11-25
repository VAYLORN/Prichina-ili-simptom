import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { HostCommand } from '../../shared/flow';
import type { GameState, Library, PublicState } from '../../shared/types';

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const res = await fetch(path, {
    method: options.method ?? (hasBody ? 'POST' : 'GET'),
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Ошибка ${res.status}`), { status: res.status });
  return data as T;
}

// Re-renders every `ms` and returns the server's current time.
export function useNow(offset: number, ms = 250) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return Date.now() + offset;
}

export function useHost() {
  const [game, setGame] = useState<GameState | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [offset, setOffset] = useState(0);
  const [screens, setScreens] = useState(0);
  const [screensWithSound, setScreensWithSound] = useState(0);
  const [connected, setConnected] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const socket = useRef<Socket | null>(null);

  useEffect(() => {
    const s = io('/host', { withCredentials: true });
    socket.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', error => {
      setConnected(false);
      if (error.message.includes('вход')) setUnauthorized(true);
    });
    s.on('state', (p: { game: GameState; serverTime: number; screens: number; screensWithSound: number; undo: string | null }) => {
      setGame(p.game);
      setOffset(p.serverTime - Date.now());
      setScreens(p.screens);
      setScreensWithSound(p.screensWithSound);
      setUndo(p.undo);
    });
    s.on('library', (l: Library) => setLibrary(l));
    return () => void s.disconnect();
  }, []);

  const send = useCallback(
    (cmd: HostCommand) =>
      new Promise<void>((resolve, reject) => {
        const s = socket.current;
        if (!s?.connected) return reject(new Error('Нет связи с сервером игры'));
        s.timeout(5000).emit('cmd', cmd, (err: Error | null, reply: { ok?: true; error?: string }) => {
          if (err) reject(new Error('Сервер не ответил'));
          else if (reply?.error) reject(new Error(reply.error));
          else resolve();
        });
      }),
    [],
  );

  const testSound = useCallback((name = 'ready') => void socket.current?.emit('soundTest', name), []);

  return { game, library, offset, screens, screensWithSound, connected, unauthorized, undo, send, testSound };
}

// The projector: receives the public state, tells the host whether its sound is on and
// plays the test sound the host asks for.
export function useScreen(soundOn: boolean, onSound: (name: string) => void) {
  const [state, setState] = useState<PublicState | null>(null);
  const [offset, setOffset] = useState(0);
  const [connected, setConnected] = useState(false);
  const socket = useRef<Socket | null>(null);
  const soundRef = useRef(onSound);
  soundRef.current = onSound;
  useEffect(() => {
    const s = io('/screen');
    socket.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('state', (p: { state: PublicState; serverTime: number }) => {
      setState(p.state);
      setOffset(p.serverTime - Date.now());
    });
    s.on('sound', (name: string) => soundRef.current(name));
    return () => void s.disconnect();
  }, []);
  useEffect(() => {
    if (connected) socket.current?.emit('audio', soundOn);
  }, [soundOn, connected]);
  return { state, offset, connected };
}

export const clock = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

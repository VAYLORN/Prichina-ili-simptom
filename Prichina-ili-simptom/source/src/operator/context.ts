import { createContext, useContext } from 'react';
import type { HostCommand } from '../../shared/flow';
import type { GameState, Library } from '../../shared/types';

export interface HostCtx {
  game: GameState;
  library: Library;
  now: number;
  run: (cmd: HostCommand) => Promise<boolean>; // false when the server refused; the error is shown as a toast
  notify: (text: string, kind?: 'error' | 'ok') => void;
  screensWithSound: number; // projector tabs with sound unlocked
  testSound: (name?: string) => void; // play a sound on the projector
  undo: string | null; // what «Отменить» would take back, null when there is nothing
}

export const HostContext = createContext<HostCtx | null>(null);

export function useHostCtx(): HostCtx {
  const ctx = useContext(HostContext);
  if (!ctx) throw new Error('HostContext is missing');
  return ctx;
}

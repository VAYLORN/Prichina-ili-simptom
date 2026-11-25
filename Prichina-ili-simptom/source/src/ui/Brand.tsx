import type { CSSProperties } from 'react';
import { remaining } from '../../shared/logic';
import { sectorById, type SectorId, type Timer } from '../../shared/types';
import { clock } from '../lib/net';
import { Icon } from './icons';

export function Logo({ light = false, size = 1 }: { light?: boolean; size?: number }) {
  return (
    <div className={`logo${light ? ' logo-light' : ''}`} style={{ fontSize: `${size}em` }}>
      <span className="logo-mark" aria-hidden>?</span>
      <span className="logo-text">
        <b>Причина</b>
        <span>или симптом?</span>
      </span>
    </div>
  );
}

export function SectorChip({ sector, big = false }: { sector: SectorId; big?: boolean }) {
  const s = sectorById(sector);
  return (
    <span className={`sector-chip${big ? ' sector-chip-big' : ''}`} style={{ '--c': s.color } as CSSProperties}>
      <Icon name={s.icon} size={big ? 34 : 15} /> {s.title}
    </span>
  );
}

export function TimerRing({ timer, now, size = 300, label }: { timer: Timer; now: number; size?: number; label?: string }) {
  const left = remaining(timer, now);
  const share = timer.durationMs > 0 ? left / timer.durationMs : 0;
  const r = 45;
  const length = 2 * Math.PI * r;
  const paused = timer.startedAt === null && timer.elapsedMs > 0;
  const state = left === 0 ? 'over' : left <= 30_000 ? 'low' : paused ? 'paused' : 'run';
  return (
    <div className={`timer-ring timer-${state}`} style={{ width: size, height: size, '--size': `${size}px` } as CSSProperties}>
      <svg viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={r} className="timer-track" />
        <circle cx={50} cy={50} r={r} className="timer-bar" strokeDasharray={length} strokeDashoffset={length * (1 - share)} transform="rotate(-90 50 50)" />
      </svg>
      <div className="timer-text">
        <b>{clock(left)}</b>
        <span>{label ?? (left === 0 ? 'Время вышло' : paused ? 'Пауза' : timer.label)}</span>
      </div>
    </div>
  );
}

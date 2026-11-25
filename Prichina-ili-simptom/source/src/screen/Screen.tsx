import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { remaining } from '../../shared/logic';
import { api, useNow, useScreen } from '../lib/net';
import { Icon } from '../ui/icons';
import { setMusic, useSound, type SoundName } from './sound';
import { Stage } from './Stage';

// Projector adapts to 4:3–21:9; the operator preview retains its 1920×1080 canvas.
export function Scaled({ children, className = '' }: { children: ReactNode; className?: string }) {
  const adaptive = className.includes('screen-fit');
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 0.1, x: 0, y: 0, w: 1920, h: 1080 });
  useLayoutEffect(() => {
    const el = box.current!;
    const update = () => {
      const aspect = adaptive ? Math.min(Math.max(el.clientWidth / Math.max(1, el.clientHeight), 4 / 3), 21 / 9) : 16 / 9;
      const w = Math.max(1920, Math.round(1080 * aspect));
      const h = Math.max(1080, Math.round(1920 / aspect));
      const scale = Math.min(el.clientWidth / w, el.clientHeight / h);
      setFit({ scale, x: (el.clientWidth - w * scale) / 2, y: (el.clientHeight - h * scale) / 2, w, h });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [adaptive]);
  return (
    <div ref={box} className={`scaled ${className}`}>
      <div className="scaled-inner" style={{ transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`, width: fit.w, height: fit.h, '--dx': `${(fit.w - 1920) / 2}px`, '--dy': `${(fit.h - 1080) / 2}px` } as CSSProperties}>{children}</div>
    </div>
  );
}

// Plays a sound when something changes from one value to another (not on the first render).
function useOnChange<T>(value: T, handler: (value: T, prev: T) => void) {
  const prev = useRef<{ v: T } | null>(null);
  useEffect(() => {
    if (prev.current && prev.current.v !== value) handler(value, prev.current.v);
    prev.current = { v: value };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function Screen() {
  const [volume, setVolume] = useState(70);
  const sound = useSound({ volume });
  const { state, offset, connected } = useScreen(sound.enabled, name => sound.play(name as SoundName));
  useEffect(() => { setMusic(!!state?.music && sound.enabled, state?.musicVolume); }, [state?.music, state?.musicVolume, sound.enabled]);
  useEffect(() => () => setMusic(false), []);
  useEffect(() => { if (state) setVolume(state.soundVolume ?? 70); }, [state?.soundVolume]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = useNow(offset, 200);
  const round = state?.round;
  const left = state ? remaining(state.timer, now) : 0;
  const running = !!state && state.timer.startedAt !== null;

  useOnChange(round?.trap?.title ?? null, title => { if (title) sound.play('trap'); });
  useOnChange(round ? `${round.number}:${round.phase}` : '', (key) => { if (key.endsWith(':discussion')) sound.play('start'); });
  useOnChange(round?.reporterId ?? null, id => { if (id) sound.play('report'); });
  useOnChange(state?.rounds.filter(r => r.phase === 'done').length ?? 0, (done, before) => { if (done > before) sound.play('fanfare'); });
  // The last ten seconds tick softly, the last three a little brighter, zero rings a chime.
  useOnChange(Math.ceil(left / 1000), (sec, before) => {
    if (sec === 0 && before > 0) sound.play('timeup');
    else if (running && sec > 0 && sec <= 10 && sec < before) sound.play(sec <= 3 ? 'tickFinal' : 'tick');
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'а') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
      // A presentation clicker on this computer drives the game like the host's big button. The server
      // accepts it only from a browser where the host has signed in; elsewhere the request just fails.
      const forward = e.key === 'ArrowRight' || e.key === 'PageDown';
      if ((forward || e.key === 'ArrowLeft' || e.key === 'PageUp') && !e.repeat) {
        e.preventDefault();
        void api('/api/step', { body: { dir: forward ? 'next' : 'back' } }).catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="screen-page">
      {state ? (
        <Scaled className="screen-fit">
          <Stage state={state} now={now} onStep={() => sound.play('step')} />
        </Scaled>
      ) : (
        <div className="screen-wait">Подключаемся к игре…</div>
      )}
      {!sound.enabled && (
        <button className="sound-hint" onClick={() => void sound.enable()}>
          <Icon name="VolumeX" size={22} /> Звук выключен — кликните по экрану или нажмите любую клавишу
          <small>F — полный экран</small>
        </button>
      )}
      {!connected && state && <div className="screen-offline">Нет связи с компьютером ведущего…</div>}
    </div>
  );
}

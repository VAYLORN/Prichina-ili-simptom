import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HostCommand } from '../../shared/flow';
import { api, useHost, useNow } from '../lib/net';
import { Logo } from '../ui/Brand';
import { Icon } from '../ui/icons';
import { HostContext, type HostCtx } from './context';
import GameTab from './GameTab';
import GuideTab from './GuideTab';
import LibraryTab from './LibraryTab';
import PrintTab from './PrintTab';
import SetupTab from './SetupTab';
import SetupWizard from './SetupWizard';

const TABS = [
  ['game', 'Игра', 'Target'],
  ['setup', 'Подготовка', 'Settings'],
  ['cards', 'Карточки', 'SquareStack'],
  ['print', 'Печать', 'Printer'],
  ['guide', 'Как играть', 'BookOpen'],
] as const;
type Tab = (typeof TABS)[number][0];

const savedTab = (): Tab => {
  try {
    const t = localStorage.getItem('host-tab');
    return TABS.some(([id]) => id === t) ? (t as Tab) : 'game';
  } catch {
    return 'game';
  }
};

export default function HostApp({ onLogout }: { onLogout: () => void }) {
  const host = useHost();
  const now = useNow(host.offset, 250);
  const [tab, setTab] = useState<Tab>(savedTab);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: 'error' | 'ok' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    try { localStorage.setItem('host-tab', tab); } catch { /* private mode */ }
  }, [tab]);
  useEffect(() => { if (host.unauthorized) onLogout(); }, [host.unauthorized, onLogout]);

  const notify = useCallback((text: string, kind: 'error' | 'ok' = 'error') => {
    setToast({ text, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const { send } = host;
  const run = useCallback(async (cmd: HostCommand) => {
    try {
      await send(cmd);
      return true;
    } catch (error) {
      notify((error as Error).message);
      return false;
    }
  }, [send, notify]);

  const { screensWithSound, testSound, undo } = host;
  const ctx = useMemo<HostCtx | null>(
    () => (host.game && host.library ? { game: host.game, library: host.library, now, run, notify, screensWithSound, testSound, undo } : null),
    [host.game, host.library, now, run, notify, screensWithSound, testSound, undo],
  );

  if (!ctx) return <div className="loading">Подключаемся к серверу игры…</div>;
  const showWizard = !!ctx.game.setupRequired || wizardOpen;
  const finishWizard = () => { setWizardOpen(false); setTab('game'); };

  const logout = async () => {
    await api('/api/logout', { body: {} }).catch(() => {});
    onLogout();
  };

  return (
    <HostContext.Provider value={ctx}>
      <div className="host">
        <header className="host-top">
          <Logo />
          <nav className="tabs">
            {TABS.map(([id, label, icon]) => (
              <button key={id} className={(showWizard ? id === 'setup' : tab === id) ? 'is-active' : ''} disabled={!!ctx.game.setupRequired && id !== 'setup'} onClick={() => { setWizardOpen(false); setTab(id); }}>
                <Icon name={icon} size={17} /> {label}
              </button>
            ))}
          </nav>
          <div className="host-top-right">
            <span className={`status-pill ${host.screens ? 'ok' : 'warn'}`}>
              <i /> {host.screens ? 'Проектор подключён' : 'Проектор не открыт'}
            </span>
            {host.screens > 0 && (
              <button
                className={`status-pill sound-pill ${host.screensWithSound ? 'ok' : 'warn'}`}
                title="Проиграть сигнал на экране игроков"
                onClick={() => {
                  host.testSound();
                  if (!host.screensWithSound) notify('Звук на проекторе выключен: кликните мышью по экрану игроков на проекторе.');
                }}
              >
                <Icon name={host.screensWithSound ? 'Volume2' : 'VolumeX'} size={15} />
                {host.screensWithSound ? 'Звук включён · проверить' : 'Звук выключен'}
              </button>
            )}
            <button className={`btn music-btn${ctx.game.music ? ' is-on' : ''}`} title="Фоновая музыка на проекторе" onClick={() => void run({ type: 'setMusic', on: !ctx.game.music })}>
              <Icon name={ctx.game.music ? 'Volume2' : 'VolumeX'} size={17} /> {ctx.game.music ? '♪ Музыка играет' : '♪ Музыка выкл.'}
            </button>
            <label className="music-vol" title="Громкость музыки — отдельно от звуков игры">
              <input key={`music-${ctx.game.settings.musicVolume ?? 60}`} aria-label="Громкость фоновой музыки" type="range" min={0} max={100} step={5} defaultValue={ctx.game.settings.musicVolume ?? 60}
                onPointerUp={e => void run({ type: 'setSettings', settings: { musicVolume: Number(e.currentTarget.value) } })}
                onKeyUp={e => void run({ type: 'setSettings', settings: { musicVolume: Number(e.currentTarget.value) } })}
                onBlur={e => void run({ type: 'setSettings', settings: { musicVolume: Number(e.currentTarget.value) } })} />
              <small>{ctx.game.settings.musicVolume ?? 60}%</small>
            </label>
            <a className="btn" href="/screen" target="_blank" rel="noreferrer"><Icon name="MonitorPlay" size={17} /> Экран игроков</a>
            <button className="btn-icon" onClick={logout} title="Выйти"><Icon name="LogOut" size={17} /></button>
          </div>
        </header>
        {!host.connected && <div className="offline"><Icon name="WifiOff" size={17} /> Нет связи с сервером игры. Проверьте, что чёрное окно сервера открыто.</div>}
        <main className="host-main">
          {showWizard ? <SetupWizard onComplete={finishWizard} /> : <>
            {tab === 'game' && <GameTab />}
            {tab === 'setup' && <SetupTab onOpenWizard={() => setWizardOpen(true)} />}
            {tab === 'cards' && <LibraryTab />}
            {tab === 'print' && <PrintTab />}
            {tab === 'guide' && <GuideTab onGo={() => setTab('game')} />}
          </>}
        </main>
        {toast && (
          <div className={`toast toast-${toast.kind}`} onClick={() => setToast(null)}>
            <Icon name={toast.kind === 'ok' ? 'CircleCheck' : 'TriangleAlert'} size={18} /> {toast.text}
          </div>
        )}
      </div>
    </HostContext.Provider>
  );
}

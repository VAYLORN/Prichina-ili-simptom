import { useState, type FormEvent } from 'react';
import { api } from '../lib/net';
import { OvalBoard } from '../ui/OvalBoard';
import { DEMO_PATH } from '../ui/path';
import { Logo } from '../ui/Brand';
import { Icon } from '../ui/icons';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/login', { body: { pin } });
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-art">
        <Logo light size={1.3} />
        <OvalBoard className="login-board" path={DEMO_PATH} animate={false} />
        <p>Бизнес-игра для руководителей производства</p>
      </div>
      <form className="login-form" onSubmit={submit}>
        <h1>Панель ведущего</h1>
        <p className="muted">Здесь вы управляете игрой и видите ответы. Игроки смотрят на отдельный экран.</p>
        <label>
          PIN ведущего
          <input type="password" autoFocus autoComplete="current-password" value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN или пароль" />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn-primary btn-big" disabled={busy || !pin}>Войти <Icon name="ChevronRight" size={20} /></button>
        <p className="muted small">На компьютере PIN показан в чёрном окне сервера и лежит в <code>data/operator-pin.txt</code>. На сервере в интернете это <code>OPERATOR_PIN</code> из файла <code>.env</code>.</p>
        <a className="link" href="/screen" target="_blank" rel="noreferrer"><Icon name="MonitorPlay" size={17} /> Открыть экран игроков</a>
      </form>
    </div>
  );
}

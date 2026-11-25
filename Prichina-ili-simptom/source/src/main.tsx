import { Component, StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './lib/net';
import HostApp from './operator/HostApp';
import Login from './operator/Login';
import Print from './print/Print';
import Screen from './screen/Screen';
import '@fontsource-variable/manrope';
import '@fontsource-variable/unbounded';
import './styles/base.css';
import './styles/host.css';
import './styles/screen.css';
import './styles/print.css';
import './styles/v6.css';
import './styles/setup-wizard.css';

// The host pages need the PIN cookie; the projector page does not.
function HostGate({ children }: { children: (logout: () => void) => ReactNode }) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
  useEffect(() => {
    api('/api/session').then(() => setState('in')).catch(() => setState('out'));
  }, []);
  if (state === 'checking') return <div className="loading">Подключаемся к серверу игры…</div>;
  if (state === 'out') return <Login onLogin={() => setState('in')} />;
  return <>{children(() => setState('out'))}</>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="loading">
        <h1>Что-то пошло не так</h1>
        <p>{this.state.error}</p>
        <button className="btn-primary" onClick={() => location.reload()}>Обновить страницу</button>
      </div>
    );
  }
}

function App() {
  const path = location.pathname.replace(/\/+$/, '');
  if (path === '/screen') return <Screen />;
  if (path === '/print') return <HostGate>{() => <Print />}</HostGate>;
  if (path !== '/operator') history.replaceState(null, '', '/operator');
  return <HostGate>{logout => <HostApp onLogout={logout} />}</HostGate>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

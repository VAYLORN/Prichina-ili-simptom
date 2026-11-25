import { useEffect, useRef, useState } from 'react';
import type { CaseCard, Round, Team } from '../../shared/types';
import { plural } from '../lib/net';
import { Icon } from '../ui/icons';
import { useHostCtx } from './context';
import '../styles/facts.css';

export function FactDialog({ round, card, team, purchaseId, onSelect, onClose }: {
  round: Round; card: CaseCard; team: Team; purchaseId?: string;
  onSelect: (purchaseId?: string) => void; onClose: () => void;
}) {
  const { game, run, notify } = useHostCtx();
  const pool = [...card.hidden, ...card.hiddenExtra];
  const issued = round.purchases.filter(p => p.teamId === team.id);
  const purchase = issued.find(p => p.id === purchaseId);
  const used = new Set(issued.filter(p => p.id !== purchaseId).map(p => p.text));
  const available = pool.map((text, index) => ({ text, index })).filter(f => !used.has(f.text));
  const [selected, setSelected] = useState(purchase ? pool.indexOf(purchase.text) : available[0]?.index ?? -1);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const canIssue = round.phase !== 'ready' && round.phase !== 'done';
  const preview = selected >= 0 ? pool[selected] : purchase?.text;
  const changed = purchase && preview !== purchase.text;

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  const save = async () => {
    if (busy || selected < 0 || (!purchase && !canIssue)) return;
    setBusy(true);
    const ok = await run(purchase
      ? { type: 'replaceHidden', purchaseId: purchase.id, factIndex: selected }
      : { type: 'sellHidden', teamId: team.id, factIndex: selected });
    setBusy(false);
    if (ok) { notify(purchase ? 'Выданный факт исправлен. Повторного списания нет.' : `Факт записан для команды «${team.name}».`, 'ok'); onClose(); }
  };
  const undo = async () => {
    if (!purchase || busy) return;
    setBusy(true);
    const ok = await run({ type: 'undoPurchase', index: round.purchases.findIndex(p => p.id === purchase.id) });
    setBusy(false);
    if (ok) { notify('Выдача отменена, баллы возвращены.', 'ok'); onClose(); }
  };

  return <div className="fact-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="fact-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="fact-dialog-title" tabIndex={-1}
      onKeyDown={e => {
        if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); }
        if (e.key === 'Tab') {
          const focusable = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [tabindex="0"]')];
          const first = focusable[0], last = focusable.at(-1);
          if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
        e.stopPropagation();
      }}>
      <header className="fact-dialog-head"><div><span><Icon name="EyeOff" size={16} /> Только ведущий</span><h2 id="fact-dialog-title">Факт для команды «{team.name}»</h2></div><button className="btn-icon" aria-label="Закрыть факт" disabled={busy} onClick={onClose}><Icon name="X" size={22} /></button></header>
      <p className="fact-instruction">Прочитайте выбранный факт вслух и запишите, какой именно выдали. На экран игроков этот текст не отправляется.</p>
      <div className="fact-dialog-layout">
        <main>
          <label className="field">Какой факт выдать
            <select aria-label="Какой факт выдать" value={selected} disabled={busy} onChange={e => setSelected(Number(e.target.value))}>
              {selected < 0 && <option value={-1}>{purchase ? 'Ранее выданный текст сохранён в журнале' : 'Нет доступных фактов'}</option>}
              {pool.map((text, index) => <option key={index} value={index} disabled={used.has(text)}>Факт {index + 1}{used.has(text) ? ' · уже выдан' : ''} · {text.slice(0, 95)}</option>)}
            </select>
          </label>
          <div className="fact-reading"><span>{purchase && !changed ? 'Записанный факт' : 'Текст для чтения'}</span><p>{preview ?? 'Все факты этого кейса уже выданы команде.'}</p></div>
          {changed && <div className="fact-previous"><b>Сейчас в журнале:</b><p>{purchase.text}</p></div>}
          <div className="fact-actions">
            <button className="btn" disabled={busy || available.length < 2} onClick={() => {
              const at = available.findIndex(f => f.index === selected);
              setSelected(available[(at + 1) % available.length].index);
            }}><Icon name="Shuffle" size={16} /> Другой факт</button>
            <button className="btn-primary" disabled={busy || selected < 0 || !!used.has(preview ?? '') || (!purchase && !canIssue)} onClick={save}>
              <Icon name="Check" size={16} /> {busy ? 'Сохраняю…' : purchase ? 'Сохранить выданный факт' : 'Выдал этот факт — записать'}
            </button>
          </div>
          <p className="hint">{purchase ? 'Исправление меняет запись в журнале без повторного списания баллов.' : `Запись выдачи спишет ${game.settings.hiddenCost} ${plural(game.settings.hiddenCost, 'балл', 'балла', 'баллов')}. До подтверждения баллы не меняются.`}</p>
          {purchase && <button className="btn-ghost" disabled={busy} onClick={undo}><Icon name="Undo2" size={15} /> Отменить эту выдачу и вернуть баллы</button>}
        </main>
        <aside className="fact-journal"><h3>Уже выдано · {issued.length}</h3>
          {!issued.length && <p className="hint">Здесь появятся факты, которые вы прочитали команде.</p>}
          {issued.map((p, i) => <button key={p.id} className={p.id === purchaseId ? 'is-on' : ''} disabled={busy} onClick={() => onSelect(p.id)}><b>Выдача {i + 1}</b><span>{p.text}</span><small>Открыть и исправить</small></button>)}
          {purchase && canIssue && <button disabled={busy} onClick={() => onSelect()}><Icon name="Plus" size={15} /> Выдать ещё факт</button>}
        </aside>
      </div>
    </div>
  </div>;
}

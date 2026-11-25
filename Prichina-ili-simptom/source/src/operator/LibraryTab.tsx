import { useMemo, useState, type CSSProperties } from 'react';
import { ROLES } from '../../shared/content/roles';
import { SECTORS, TRAP_GROUPS, caseCode, sectorById, type CaseCard, type SectorId, type TrapCard, type TrapGroup } from '../../shared/types';
import { api } from '../lib/net';
import { Icon, TRAP_ICON_CHOICES } from '../ui/icons';
import { useHostCtx } from './context';

type Sub = 'cases' | 'traps' | 'roles';

export default function LibraryTab() {
  const [sub, setSub] = useState<Sub>('cases');
  return (
    <div className="library">
      <div className="seg seg-big">
        <button className={sub === 'cases' ? 'is-on' : ''} onClick={() => setSub('cases')}>Ситуации</button>
        <button className={sub === 'traps' ? 'is-on' : ''} onClick={() => setSub('traps')}>Ловушки</button>
        <button className={sub === 'roles' ? 'is-on' : ''} onClick={() => setSub('roles')}>Роли</button>
      </div>
      {sub === 'cases' && <Cases />}
      {sub === 'traps' && <Traps />}
      {sub === 'roles' && <Roles />}
    </div>
  );
}

const LINE_FIELDS = [
  ['facts', 'Факты'],
  ['noise', 'Шум'],
  ['opinions', 'Мнения'],
  ['hidden', 'Скрытые факты'],
  ['hiddenExtra', 'Скрытые факты для сильных команд'],
  ['wrongAnswers', 'Типичные ошибки команд'],
  ['chain', 'Цепочка причин (по шагам)'],
] as const;

const emptyCase = (sector: SectorId, cases: CaseCard[]): CaseCard => {
  const prefix = { production: 'pr', quality: 'ka', people: 'pe', supply: 'po' }[sector];
  const used = new Set(cases.map(c => c.id));
  let n = 1;
  while (used.has(`${prefix}-${String(n).padStart(2, '0')}`)) n++;
  return {
    id: `${prefix}-${String(n).padStart(2, '0')}`, sector, level: 'base', title: '', symptom: '',
    facts: [], noise: [], opinions: [], hidden: [], hiddenExtra: [], wrongAnswers: [],
    rootCause: '', systemCause: '', chain: [], question: '', notes: '',
  };
};

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

function Cases() {
  const { library, game, notify } = useHostCtx();
  const [filter, setFilter] = useState<SectorId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<CaseCard | null>(null);

  const list = useMemo(() => library.cases.filter(c =>
    (filter === 'all' || c.sector === filter) &&
    (!query || `${c.title} ${c.symptom}`.toLowerCase().includes(query.toLowerCase()))), [library.cases, filter, query]);

  const inPlan = new Set(game.rounds.map(r => r.caseId));

  const save = async (card: CaseCard) => {
    try {
      await api(`/api/cases/${card.id}`, { method: 'PUT', body: card });
      notify('Карточка сохранена', 'ok');
      setEditing(null);
    } catch (e) { notify((e as Error).message); }
  };
  const remove = async (card: CaseCard) => {
    if (!confirm(`Удалить «${card.title}»?`)) return;
    try {
      await api(`/api/cases/${card.id}`, { method: 'DELETE' });
      setEditing(null);
    } catch (e) { notify((e as Error).message); }
  };
  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const body = Array.isArray(data) ? { cases: data } : { cases: data.cases, traps: data.traps };
      const res = await api<{ cases: number; traps: number }>('/api/library/import', { body });
      notify(`Загружено ситуаций: ${res.cases}, ловушек: ${res.traps}`, 'ok');
    } catch (e) { notify(`Не удалось загрузить файл. ${(e as Error).message}`); }
  };

  if (editing) return <CaseEditor initial={editing} isNew={!library.cases.some(c => c.id === editing.id)} onSave={save} onCancel={() => setEditing(null)} onDelete={remove} />;

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="seg">
          <button className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>Все · {library.cases.length}</button>
          {SECTORS.map(s => (
            <button key={s.id} className={filter === s.id ? 'is-on' : ''} onClick={() => setFilter(s.id)}>
              <Icon name={s.icon} size={15} /> {s.title} · {library.cases.filter(c => c.sector === s.id).length}
            </button>
          ))}
        </div>
        <input className="search" placeholder="Поиск" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="case-list">
        {list.map(c => (
          <button key={c.id} className="case-row" style={{ '--c': sectorById(c.sector).color } as CSSProperties} onClick={() => setEditing(structuredClone(c))}>
            <span className="case-code">{caseCode(c)}</span>
            <span className="case-title"><b>{c.title}</b><small>{c.symptom}</small></span>
            <span className="case-tags">
              {c.level === 'hard' && <em>скрытые факты: {c.hidden.length + c.hiddenExtra.length}</em>}
              {inPlan.has(c.id) && <em className="tag-plan">в плане</em>}
            </span>
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="btn-primary" onClick={() => setEditing(emptyCase(filter === 'all' ? 'production' : filter, library.cases))}><Icon name="Plus" size={16} /> Новая ситуация</button>
        <button className="btn" onClick={() => download('cards.json', library)}>Скачать все карточки (JSON)</button>
        <label className="btn">
          Загрузить из файла…
          <input type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        </label>
        <button className="btn-ghost" onClick={async () => {
          if (!confirm('Вернуть исходные карточки из документов? Ваши правки в них пропадут, новые карточки останутся.')) return;
          try { await api('/api/library/restore', { body: {} }); notify('Исходные карточки восстановлены', 'ok'); } catch (e) { notify((e as Error).message); }
        }}>Восстановить исходные</button>
      </div>
    </section>
  );
}

function CaseEditor({ initial, isNew, onSave, onCancel, onDelete }: {
  initial: CaseCard;
  isNew: boolean;
  onSave: (c: CaseCard) => void;
  onCancel: () => void;
  onDelete: (c: CaseCard) => void;
}) {
  const [card, setCard] = useState(initial);
  const [lines, setLines] = useState(() => Object.fromEntries(LINE_FIELDS.map(([k]) => [k, initial[k].join('\n')])) as Record<(typeof LINE_FIELDS)[number][0], string>);
  const set = <K extends keyof CaseCard>(key: K, value: CaseCard[K]) => setCard(c => ({ ...c, [key]: value }));
  const build = (): CaseCard => {
    const out = { ...card };
    for (const [k] of LINE_FIELDS) out[k] = lines[k].split('\n').map(s => s.trim()).filter(Boolean);
    out.level = out.hidden.length + out.hiddenExtra.length > 0 ? 'hard' : 'base';
    return out;
  };

  return (
    <section className="panel editor">
      <div className="panel-head">
        <h3>{isNew ? 'Новая ситуация' : `Ситуация ${caseCode(card)}`}</h3>
        <button className="btn-ghost" onClick={onCancel}>← К списку</button>
      </div>
      <div className="editor-grid">
        <label className="field">Сектор
          <select value={card.sector} disabled={!isNew} onChange={e => set('sector', e.target.value as SectorId)}>
            {SECTORS.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        <label className="field field-wide">Название
          <input value={card.title} onChange={e => set('title', e.target.value)} placeholder="Склад переполнен, но материалов не хватает" />
        </label>
        <label className="field field-full">Ситуация — видят игроки
          <textarea value={card.symptom} onChange={e => set('symptom', e.target.value)} placeholder="Что произошло — одним-двумя предложениями" />
        </label>
        {LINE_FIELDS.map(([key, label]) => (
          <label key={key} className="field">{label} <small>каждый пункт с новой строки</small>
            <textarea rows={6} value={lines[key]} onChange={e => setLines(l => ({ ...l, [key]: e.target.value }))} />
          </label>
        ))}
        <label className="field">Корневая причина
          <textarea value={card.rootCause} onChange={e => set('rootCause', e.target.value)} />
        </label>
        <label className="field">Системная причина
          <textarea value={card.systemCause} onChange={e => set('systemCause', e.target.value)} />
        </label>
        <label className="field">Вопрос для сильных команд
          <textarea value={card.question} onChange={e => set('question', e.target.value)} />
        </label>
        <label className="field">Заметки ведущему
          <textarea value={card.notes} onChange={e => set('notes', e.target.value)} />
        </label>
      </div>
      <div className="actions">
        <button className="btn-primary" onClick={() => onSave(build())}>Сохранить</button>
        <button className="btn" onClick={onCancel}>Отмена</button>
        {!isNew && <button className="btn-danger" onClick={() => onDelete(card)}>Удалить</button>}
      </div>
    </section>
  );
}

function Traps() {
  const { library, notify } = useHostCtx();
  const [editing, setEditing] = useState<TrapCard | null>(null);
  const save = async (t: TrapCard) => {
    try {
      await api(`/api/traps/${t.id}`, { method: 'PUT', body: t });
      setEditing(null);
      notify('Ловушка сохранена', 'ok');
    } catch (e) { notify((e as Error).message); }
  };
  const remove = async (t: TrapCard) => {
    if (!confirm(`Удалить ловушку «${t.title}»?`)) return;
    try { await api(`/api/traps/${t.id}`, { method: 'DELETE' }); setEditing(null); } catch (e) { notify((e as Error).message); }
  };

  if (editing) {
    const t = editing;
    const isNew = !library.traps.some(x => x.id === t.id);
    const set = <K extends keyof TrapCard>(key: K, value: TrapCard[K]) => setEditing({ ...t, [key]: value });
    return (
      <section className="panel editor">
        <div className="panel-head">
          <h3>{isNew ? 'Новая ловушка' : t.title}</h3>
          <button className="btn-ghost" onClick={() => setEditing(null)}>← К списку</button>
        </div>
        <div className="editor-grid">
          <div className="field field-full">Значок<span className="icon-pick">{TRAP_ICON_CHOICES.map(name => <button key={name} type="button" className={t.icon === name ? 'is-on' : ''} onClick={() => set('icon', name)} title={name}><Icon name={name} size={20} /></button>)}</span></div>
          <label className="field">Тип
            <select value={t.group} onChange={e => set('group', e.target.value as TrapGroup)}>
              {(Object.entries(TRAP_GROUPS) as [TrapGroup, string][]).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="field field-wide">Название<input value={t.title} onChange={e => set('title', e.target.value)} /></label>
          <label className="field field-full">Текст — видят игроки<textarea value={t.text} onChange={e => set('text', e.target.value)} /></label>
          <label className="field field-full">Подсказка ведущему (не видна игрокам)<textarea value={t.hostHint ?? ''} onChange={e => set('hostHint', e.target.value || undefined)} /></label>
        </div>
        <div className="actions">
          <button className="btn-primary" disabled={!t.title.trim() || !t.text.trim()} onClick={() => save(t)}>Сохранить</button>
          <button className="btn" onClick={() => setEditing(null)}>Отмена</button>
          {!isNew && <button className="btn-danger" onClick={() => remove(t)}>Удалить</button>}
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <p className="hint">Ловушка выпадает случайно в раундах, отмеченных в плане, через 10–15 секунд после старта. Повторов нет, пока колода не закончится.</p>
      <div className="trap-grid">
        {library.traps.map(t => (
          <button key={t.id} className={`trap-tile group-${t.group}`} onClick={() => setEditing({ ...t })}>
            <span className="trap-tile-icon"><Icon name={t.icon} size={22} /></span>
            <b>{t.title}</b>
            <small>{TRAP_GROUPS[t.group]}</small>
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="btn-primary" onClick={() => setEditing({ id: `trap-${Date.now().toString(36)}`, group: 'fun', icon: 'Zap', title: '', text: '' })}><Icon name="Plus" size={16} /> Новая ловушка</button>
      </div>
    </section>
  );
}

function Roles() {
  return (
    <section className="panel">
      <p className="hint">Шесть ролей. Если в команде меньше шести человек, роли совмещают. Карточки ролей есть во вкладке «Печать».</p>
      <div className="roles-list">
        {ROLES.map(r => (
          <div key={r.id} className="role-item">
            <span className="role-item-icon"><Icon name={r.icon} size={24} /></span>
            <div>
              <b>{r.title}</b>
              <p>{r.mission}</p>
              <ul>{r.duties.map(d => <li key={d}>{d}</li>)}</ul>
              {r.phrase && <p className="muted">{r.phrase}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

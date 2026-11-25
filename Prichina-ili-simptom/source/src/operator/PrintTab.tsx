import { useState } from 'react';
import { activeRounds } from '../../shared/logic';
import { Icon } from '../ui/icons';
import { useHostCtx } from './context';

export const PRINT_ITEMS = [
  { kind: 'poster', icon: 'Flag', title: 'Овальное поле — плакат', size: 'А3, альбомная', text: 'Новое поле с фото секторов, колодами, правилами, зоной команды и зоной директора на одном листе.' },
  { kind: 'cases', icon: 'SquareStack', title: 'Карточки ситуаций', size: 'А4, резать', text: 'Ситуация + факты, шум и мнения вперемешку, без подписей. Печатайте по комплекту на команду.', cases: true },
  { kind: 'hidden', icon: 'Lock', title: 'Скрытые факты', size: 'А4, резать', text: 'Карточки со скрытыми данными. Стоимость берётся из настроек. Хранятся у ведущего.', cases: true },
  { kind: 'traps', icon: 'Zap', title: 'Ловушки', size: 'А4, резать', text: 'Колода ловушек — на случай игры без проектора.' },
  { kind: 'roles', icon: 'Users', title: 'Роли', size: 'А4, резать', text: 'Шесть карточек ролей — по комплекту на команду.' },
  { kind: 'blank', icon: 'NotebookPen', title: 'Бланк команды', size: 'А4, 2 страницы', text: 'Факты и шум, «5 почему», причина, 3 действия, доклад директору.' },
  { kind: 'memo', icon: 'BookOpen', title: 'Памятка команды', size: 'А4', text: 'Ход раунда, роли, запрещённые слова и система очков на одном листе.' },
  { kind: 'score', icon: 'ChartColumn', title: 'Табло очков', size: 'А4, альбомная', text: 'Таблица «раунды × команды» с названиями ваших команд и критериями.' },
  { kind: 'host', icon: 'EyeOff', title: 'Листы ведущего', size: 'А4', text: 'Ответы: факты, шум, скрытые факты, корневая причина. Только для вас.', cases: true },
] as const;

export default function PrintTab() {
  const { game } = useHostCtx();
  const [scope, setScope] = useState<'plan' | 'all'>('plan');
  const planned = activeRounds(game).filter(r => r.caseId).length;
  return (
    <div className="print-tab">
      <section className="panel">
        <div className="panel-head">
          <h3><Icon name="Printer" size={18} /> Материалы для печати</h3>
          <div className="seg">
            <button className={scope === 'plan' ? 'is-on' : ''} onClick={() => setScope('plan')}>Ситуации из плана · {planned}</button>
            <button className={scope === 'all' ? 'is-on' : ''} onClick={() => setScope('all')}>Все ситуации</button>
          </div>
        </div>
        <p className="hint">Страница откроется в новой вкладке. Нажмите Ctrl+P, выберите формат бумаги, отключите «Колонтитулы» и включите «Фон».</p>
        <div className="print-grid">
          {PRINT_ITEMS.map(item => (
            <a key={item.kind} className="print-item" href={`/print?kind=${item.kind}${'cases' in item ? `&cases=${scope}` : ''}`} target="_blank" rel="noreferrer">
              <span className="pi-icon"><Icon name={item.icon} size={22} /></span>
              <b>{item.title}</b>
              <small>{item.size}</small>
              <span>{item.text}</span>
              <em>Открыть для печати <Icon name="ChevronRight" size={16} /></em>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

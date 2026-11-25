// The main host screen during the game. One big button always does the next step of the game
// (shared/flow.ts), and so do → / PageDown / Space and a presentation clicker; ← leafs back through
// the rules; Ctrl+Z or «Отменить» takes the last move back. Around the button: what the players see
// now, what to say and do, the teams (hidden facts, scores), a live preview and the answer card.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { RULE_SLIDES, RULE_SLIDE_TITLES, type RuleSlide } from '../../shared/content/rules';
import { backStep, introName, nextStep, teamTitle, type HostCommand } from '../../shared/flow';
import {
  activeRounds, discussionMinutes, isTrainingRound, caseOf, currentRound, elapsed, isRunning, planPlaces, remaining, reportOrder, roundScore, scoreTable, toPublic, trapShown,
} from '../../shared/logic';
import {
  CRITERIA, MAX_ROUND_SCORE, VIEWS, caseCode, sectorById,
  type CaseCard, type CriterionId, type GameState, type Library, type Phase, type Round, type ScreenView,
} from '../../shared/types';
import { clock, plural } from '../lib/net';
import { Scaled } from '../screen/Screen';
import { Stage } from '../screen/Stage';
import { TeamBadge } from '../ui/Board';
import { SectorChip, TimerRing } from '../ui/Brand';
import { Icon } from '../ui/icons';
import { useHostCtx } from './context';
import { Stepper } from './fields';
import { FactDialog } from './FactDialog';

export default function GameTab() {
  const { game, library } = useHostCtx();
  const round = currentRound(game);
  const card = caseOf(round, library);
  useFlowKeys();
  return (
    <div className="game">
      <RoundStrip />
      <div className="game-grid">
        <div className="game-main">
          <NowCard round={round} card={card} />
          <TeamsCard round={round} card={card} />
        </div>
        <aside className="game-side">
          <PlayersView />
          <AnswerCard round={round} card={card} />
        </aside>
      </div>
    </div>
  );
}

// → / PageDown / Space — the big button; ← / PageUp — back through the rules; Ctrl+Z — «Отменить».
// A presentation clicker sends the same keys. Typing in a field is never taken for a command.
function useFlowKeys() {
  const ctx = useHostCtx();
  const latest = useRef(ctx);
  latest.current = ctx;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : document.body;
      if (e.repeat || e.altKey || e.metaKey || el.closest('input, select, textarea, [contenteditable], [role="dialog"]')) return;
      const { game, now, run, undo } = latest.current;
      if (e.ctrlKey) {
        if (e.code === 'KeyZ' && undo) {
          e.preventDefault();
          void run({ type: 'undo' });
        }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !el.closest('button, a'))) {
        e.preventDefault();
        const step = nextStep(game, now);
        if (step) void run({ type: 'advance', key: step.key });
      } else if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && backStep(game)) {
        e.preventDefault();
        void run({ type: 'back' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// ---------- round strip ----------

const START: { view: ScreenView; label: string }[] = [
  { view: 'welcome', label: 'Заставка' },
  { view: 'rules', label: 'Правила' },
  { view: 'roles', label: 'Роли' },
];

// The opening screens, then the rounds with their cases: one button per case.
function RoundStrip() {
  const { game, run } = useHostCtx();
  const visible = activeRounds(game);
  const visiblePlaces = planPlaces(visible);
  const places = Object.fromEntries(visible.map((r, i) => [r.index, visiblePlaces[i]]));
  const go = (i: number) => {
    if (i === game.current) return;
    if (currentRound(game)?.phase === 'discussion' && !confirm('Сейчас идёт обсуждение. Перейти к другому кейсу?')) return;
    void run({ type: 'goToRound', index: i });
  };
  const groups: { key: string; title: string; icon: string; color: string; items: number[] }[] = [];
  visible.forEach(r => {
    const i = r.index;
    const p = places[i];
    const key = p.block ? `b${p.block}` : 'final';
    let g = groups.find(x => x.key === key);
    if (!g) {
      const s = sectorById(r.sector);
      g = p.block
        ? { key, title: `Раунд ${p.block} · ${s.title}`, icon: s.icon, color: s.color, items: [] }
        : { key, title: 'Финал', icon: 'Trophy', color: '#16213A', items: [] };
      groups.push(g);
    }
    g.items.push(i);
  });
  const started = game.current >= 0;
  const at = started ? START.length : START.findIndex(s => s.view === game.view);
  return (
    <nav className="round-strip">
      <div className={`rs-group${started ? '' : ' is-active'}`} style={{ '--c': '#16213A' } as CSSProperties}>
        <span className="rs-title"><Icon name="Flag" size={15} /> Начало</span>
        <span className="rs-cases">
          <button className={`rs-case rs-word rs-music${game.music ? ' is-on' : ''}`} onClick={() => run({ type: 'setMusic', on: !game.music })}>{game.music ? '♪ Музыка играет' : '♪ Музыка'}</button>
          {START.map((s, i) => (
            <button key={s.view} className={`rs-case rs-word${i < at ? ' phase-done' : ''}${!started && i === at ? ' is-active' : ''}`}
              onClick={() => run({ type: 'setView', view: s.view, ...(s.view === 'rules' ? { slide: 0 } : {}) })}>
              {s.label}
            </button>
          ))}
        </span>
      </div>
      {groups.map(g => (
        <div key={g.key} className={`rs-group${g.items.includes(game.current) ? ' is-active' : ''}`} style={{ '--c': g.color } as CSSProperties}>
          <span className="rs-title"><Icon name={g.icon} size={15} /> {g.title}</span>
          <span className="rs-cases">
            {g.items.map(i => {
              const r = game.rounds[i];
              return (
                <button key={r.id} className={`rs-case rs-word phase-${r.phase}${i === game.current ? ' is-active' : ''}`} onClick={() => go(i)} title={isTrainingRound(game, r) ? 'Тренировка — без зачётных баллов' : r.withTrap ? 'С ловушкой' : undefined}>
                  {r.phase === 'done' && <Icon name="Check" size={15} />}{r.kind === 'final' ? 'Ф' : r.caseId ? caseCode({ id: r.caseId, sector: r.sector }) : places[i].caseNumber}{isTrainingRound(game, r) && ' · Т'}
                  {r.withTrap && r.phase !== 'done' && <i><Icon name="Zap" size={11} /></i>}
                </button>
              );
            })}
          </span>
        </div>
      ))}
      <div className="rs-group rs-pause" style={{ '--c': '#9A6B1F' } as CSSProperties}><span className="rs-title"><Icon name="Coffee" size={15} /> Перерыв</span><button className={`rs-case rs-word${game.view === 'pause' ? ' is-active' : ''}`} onClick={() => run({ type: 'setView', view: 'pause' })}>☕ Перерыв ♪</button></div>
    </nav>
  );
}

// ---------- now: one big button and what to do ----------

const STEPS: { phase: Phase; label: string; icon: string }[] = [
  { phase: 'ready', label: 'Заставка', icon: 'Flag' },
  { phase: 'situation', label: 'Ситуация', icon: 'Presentation' },
  { phase: 'discussion', label: 'Обсуждение', icon: 'Timer' },
  { phase: 'reports', label: 'Доклады', icon: 'Mic' },
  { phase: 'done', label: 'Итоги', icon: 'Trophy' },
];

function PhaseSteps({ phase }: { phase: Phase }) {
  const at = STEPS.findIndex(s => s.phase === phase);
  return (
    <ol className="phase-steps">
      {STEPS.map((s, i) => (
        <li key={s.phase} className={i < at || phase === 'done' ? 'is-done' : i === at ? 'is-now' : ''}>
          <span><Icon name={i < at || phase === 'done' ? 'CircleCheck' : s.icon} size={16} /></span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

const START_STEPS = [
  { view: 'welcome', label: 'Заставка', icon: 'MonitorPlay' },
  { view: 'rules', label: 'Правила', icon: 'BookOpen' },
  { view: 'roles', label: 'Роли', icon: 'Users' },
  { view: 'case', label: 'Кейс 1', icon: 'Play' },
];

function StartSteps({ view }: { view: ScreenView }) {
  const at = START_STEPS.findIndex(s => s.view === view);
  return (
    <ol className="phase-steps">
      {START_STEPS.map((s, i) => (
        <li key={s.view} className={i < at ? 'is-done' : i === at ? 'is-now' : ''}>
          <span><Icon name={i < at ? 'CircleCheck' : s.icon} size={16} /></span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function NowCard({ round, card }: { round: Round | null; card: CaseCard | null }) {
  const { game, now, run, undo } = useHostCtx();
  const step = nextStep(game, now);
  const script = useScript(round, card);
  const timeLeft = remaining(game.timer, now);
  const running = isRunning(game.timer);
  const showTimer = round && (round.phase === 'discussion' || (round.phase === 'reports' && round.reporterId));

  return (
    <section className="panel now" style={{ '--c': round ? sectorById(round.sector).color : '#16213A' } as CSSProperties}>
      <div className="now-top">
        {round ? <SectorChip sector={round.sector} /> : <span className="now-chip"><Icon name="Flag" size={14} /> Начало</span>}
        <span className="now-eyebrow">{script.eyebrow}</span>
        {round ? <PhaseSteps phase={round.phase} /> : <StartSteps view={game.view} />}
      </div>
      <div className="now-body">
        <div className="now-text">
          <h2>{script.title}</h2>
          <p className="now-screen"><Icon name="MonitorPlay" size={16} /> На экране: <b>{script.screen}</b></p>
          <ul className="todo">{script.todo.map((t, i) => <li key={i}>{t}</li>)}</ul>
          {script.warn && <p className="warn-text"><Icon name="Info" size={16} /> {script.warn}</p>}
          <div className="next-row">
            {step ? (
              <button className="btn-primary btn-big btn-next" onClick={() => run({ type: 'advance', key: step.key })}>
                <Icon name={step.icon} size={20} /> {step.label}
              </button>
            ) : <span className="game-over"><Icon name="Trophy" size={20} /> Игра окончена</span>}
            {step && <span className="next-keys"><kbd>→</kbd> <kbd>Пробел</kbd> или кликер</span>}
          </div>
          {(script.actions || undo) && (
            <div className="actions">
              {script.actions}
              {undo && (
                <button className="btn-ghost undo-btn" onClick={() => run({ type: 'undo' })} title="Ctrl+Z">
                  <Icon name="Undo2" size={16} /> Отменить «{undo[0].toUpperCase() + undo.slice(1)}»
                </button>
              )}
            </div>
          )}
        </div>
        {showTimer && (
          <div className="now-timer">
            <TimerRing timer={game.timer} now={now} size={168} label={round.phase === 'reports' ? (timeLeft === 0 ? 'Время вышло' : running ? 'Доклад' : 'Пауза') : undefined} />
            <div className="timer-controls">
              <button className="btn-icon" disabled={trapShown(round)} onClick={() => run({ type: 'timerToggle' })} title={running ? 'Пауза' : 'Продолжить'}>
                <Icon name={running ? 'Pause' : 'Play'} size={18} />
              </button>
              <button className="btn-small" onClick={() => run({ type: 'timerAdd', seconds: -60 })}><Icon name="Minus" size={14} />1 мин</button>
              <button className="btn-small" onClick={() => run({ type: 'timerAdd', seconds: 60 })}><Icon name="Plus" size={14} />1 мин</button>
            </div>
          </div>
        )}
      </div>
      {round && <TrapPanel round={round} />}
    </section>
  );
}

// ---------- what to say and do at each step ----------

interface Script {
  eyebrow: string;
  title: string;
  screen: string; // what the players see now
  todo: ReactNode[];
  warn?: string;
  actions?: ReactNode; // side buttons; the next step itself is the big button
}

const RULE_NOTES: Record<RuleSlide, (g: GameState) => string> = {
  story: () => 'Задайте тон: команды — руководители завода, каждый кейс — проблема на производстве. Побеждает тот, кто находит корневую причину, а не борется с последствиями.',
  round: g => `Порядок кейса: ситуация на экране → карточки → ${g.settings.prepMinutes} мин обсуждения → бланк → доклад директору.${g.settings.trainingFirstCase ? ` Первый кейс — тренировка, ${g.settings.trainingPrepMinutes} минут обсуждения.` : ''}`,
  blank: () => 'Бланк заполняет секретарь: что произошло, причина и три действия — что сделать, к какому сроку, кто отвечает.',
  words: () => 'Расплывчатые слова («усилить контроль», «принять меры») не засчитываются. Действие — это что, кто и к какому сроку.',
  score: g => `До ${MAX_ROUND_SCORE} баллов за кейс. Скрытый факт стоит ${g.settings.hiddenCost} ${plural(g.settings.hiddenCost, 'балл', 'балла', 'баллов')}, штраф — минус балл. ${g.settings.trainingFirstCase ? 'Первый кейс тренировочный: его оценки не входят в рейтинг.' : 'Рейтинг — сумма за все активные кейсы.'}`,
  traps: g => `Ловушка выпадает внезапно, через ${g.settings.trapDelayMin}–${g.settings.trapDelayMax} с обсуждения. Пока вы её читаете, время стоит.`,
  final: g => activeRounds(g).some(r => r.kind === 'final') ? `В конце — финал «Доклад директору»: ${g.settings.finalPrepMinutes} мин на подготовку и два коротких ответа.` : 'После последнего кейса — общий разбор, итоги и награждение команд.',
};

function screenText(game: GameState, library: Library): string {
  const r = currentRound(game);
  if (r && trapShown(r)) return `ловушка «${library.traps.find(t => t.id === r.trap!.cardId)?.title ?? ''}» поверх ситуации`;
  switch (game.view) {
    case 'welcome': return 'заставка игры — название и команды, фоновая музыка';
    case 'pause': return 'перерыв — музыка и рейтинг команд';
    case 'rules': {
      const i = Math.min(game.slide, RULE_SLIDES.length - 1);
      return `правила, слайд ${i + 1} из ${RULE_SLIDES.length} — «${RULE_SLIDE_TITLES[RULE_SLIDES[i]]}»`;
    }
    case 'roles': return 'роли в команде';
    case 'board': return game.introAt ? 'поле — фишка шагает на следующий кейс' : 'поле и рейтинг команд';
    case 'scores': return 'табло — очки по кейсам';
    case 'debrief': return 'итоги игры — призёры и вопросы для разбора';
    case 'round': break;
  }
  if (!r) return 'экран кейса (кейс не выбран)';
  const reporter = game.teams.find(t => t.id === r.reporterId);
  switch (r.phase) {
    case 'ready': return `заставка «${introName(planPlaces(activeRounds(game))[activeRounds(game).findIndex(x => x.index === game.current)], sectorById(r.sector).title)}»`;
    case 'situation': return r.showStatements ? 'ситуация и карточки' : 'ситуация на весь экран';
    case 'discussion': return r.showStatements ? 'ситуация, карточки и таймер' : 'ситуация и таймер обсуждения';
    case 'reports': return [reporter ? `доклад «${teamTitle(reporter)}» и таймер` : 'порядок докладов', r.revealCause && 'правильный ответ'].filter(Boolean).join(' · ');
    case 'done': return r.revealCause ? 'ответ и баллы за кейс' : 'баллы за кейс';
  }
}

function useScript(round: Round | null, card: CaseCard | null): Script {
  const { game, library, run } = useHostCtx();
  const st = game.settings;
  const visible = activeRounds(game);
  const places = planPlaces(visible);
  const at = visible.findIndex(r => r.index === game.current);
  const screen = screenText(game, library);
  const btn = (label: string, icon: string, cmd: HostCommand) => (
    <button className="btn" onClick={() => run(cmd)}><Icon name={icon} size={16} /> {label}</button>
  );

  if (!round) {
    const base = { eyebrow: 'Перед первым кейсом', screen };
    const skip = btn('Сразу к кейсу 1', 'Forward', { type: 'nextRound' });
    if (game.view === 'welcome') {
      return {
        ...base,
        title: 'Добро пожаловать',
        todo: [
          'Поприветствуйте участников. Команды рассаживаются за столы — на экране название игры и список команд.',
          'Проверьте звук проектора: кнопка «Звук» в шапке.',
          'Кнопка «♪ Музыка» управляет фоном; перед ситуацией он стихает. Для паузы между кейсами — «Перерыв».',
          `Дальше — правила: ${RULE_SLIDES.length} коротких слайдов, затем роли и первый кейс.`,
        ],
        actions: skip,
      };
    }
    if (game.view === 'rules') {
      const i = Math.min(game.slide, RULE_SLIDES.length - 1);
      return {
        ...base,
        title: `Правила · ${RULE_SLIDE_TITLES[RULE_SLIDES[i]]}`,
        todo: [RULE_NOTES[RULE_SLIDES[i]](game), 'Следующий слайд — большая кнопка, → или кликер. Назад — ←.'],
        actions: <>{btn('Предыдущий слайд', 'ChevronLeft', { type: 'back' })}{skip}</>,
      };
    }
    if (game.view === 'roles') {
      return {
        ...base,
        title: 'Роли в команде',
        todo: [
          'Попросите команды за 1–2 минуты распределить шесть ролей и раздайте карточки ролей.',
          'Если в команде меньше шести человек — роли совмещают.',
          'Дальше общая фишка встанет на первый кейс, и сама откроется заставка раунда 1.',
        ],
      };
    }
    return { ...base, title: 'Игра ещё не началась', todo: ['Правила и роли — кнопки «Начало» в ленте сверху. Или сразу начните первый кейс большой кнопкой.'] };
  }

  const p = places[at];
  const sector = sectorById(round.sector).title;
  const code = card ? caseCode(card) : '';
  const count = card ? card.facts.length + card.noise.length + card.opinions.length : 0;
  const prep = discussionMinutes(game, round);
  const training = isTrainingRound(game, round);
  const base = {
    eyebrow: `${training ? 'Тренировка · ' : ''}${p.block ? `Раунд ${p.block} · кейс ${p.caseInBlock} из ${p.blockSize} · всего ${p.caseNumber} из ${p.caseCount}` : 'Финал · Доклад директору'}`,
    title: card ? card.title : 'Ситуация не выбрана',
    screen,
  };
  const statementsBtn = btn(round.showStatements ? 'Убрать карточки с экрана' : 'Карточки на экран', 'SquareStack', { type: 'toggleStatements' });
  const revealBtn = btn(round.revealCause ? 'Убрать ответ с экрана' : 'Показать ответ', round.revealCause ? 'EyeOff' : 'Target', { type: 'toggleReveal' });

  switch (round.phase) {
    case 'ready': {
      if (!card) return { ...base, todo: ['Для этого кейса не выбрана ситуация — выберите её во вкладке «Подготовка».'] };
      const announce = !p.block
        ? 'Объявите финал «Доклад директору»: подготовка и два коротких вопроса.'
        : p.caseInBlock === 1
          ? `Объявите раунд ${p.block} — «${sector}»: ${p.blockSize} ${plural(p.blockSize, 'кейс', 'кейса', 'кейсов')} этого сектора.`
          : `Объявите ${p.caseInBlock}-й кейс раунда «${sector}».`;
      return {
        ...base,
        todo: [
          game.introAt ? 'Фишка шагает по полю — через пару секунд сама откроется заставка. Можно не ждать.' : game.view === 'round' ? announce : 'Откройте заставку кейса большой кнопкой.',
          `Приготовьте карточки кейса ${code} — по ${count} шт. на команду. Раздадите после чтения ситуации.`,
          ...(training ? [`Первый кейс — тренировка: ${prep} минут на обсуждение. Пусть каждый выскажется; объясните правила и разберите непонимание. Оценки — только для обратной связи.`] : []),
        ],
      };
    }
    case 'situation':
      return {
        ...base,
        todo: [
          'Прочитайте ситуацию вслух — игроки видят её на экране.',
          `Раздайте командам карточки кейса ${code}: ${count} шт., факты, шум и мнения вперемешку.`,
          `На обсуждение ${prep} мин. Скрытый факт стоит ${st.hiddenCost} ${plural(st.hiddenCost, 'балл', 'балла', 'баллов')}.`,
          round.withTrap ? `В этом кейсе ловушка: выпадет сама через ${st.trapDelayMin}–${st.trapDelayMax} с после старта, время встанет на паузу.` : 'Ловушки в этом кейсе нет.',
        ],
        actions: statementsBtn,
      };
    case 'discussion':
      return {
        ...base,
        todo: trapShown(round)
          ? ['Прочитайте ловушку вслух — текст ниже. Пока она на экране, время стоит.', 'Прочитали — большая кнопка, обсуждение продолжится.']
          : [
              training ? 'Тренировочное обсуждение: дайте высказаться всем, проясните ход анализа и вопросы к правилам. При необходимости добавьте время.' : 'Команды обсуждают. Отвечайте на вопросы по правилам, следите за временем.',
              'Команда просит факт — «+ Факт» в таблице ниже. Выберите текст, прочитайте вслух и нажмите «Выдал этот факт — записать». Исправить выдачу можно в журнале команды.',
              'Когда время выйдет, прозвучит сигнал. Если все готовы раньше — переходите к докладам.',
            ],
        actions: statementsBtn,
      };
    case 'reports': {
      const order = reportOrder(game.teams, at);
      const reported = round.reported ?? [];
      const all = order.every(t => reported.includes(t.id));
      const unscored = game.teams.filter(t => Object.keys(round.results[t.id]?.scores ?? {}).length < CRITERIA.length);
      const todo = !all
        ? [
            `Порядок докладов: ${order.map(teamTitle).join(' → ')}. Первая команда меняется от кейса к кейсу.`,
            `Большая кнопка вызывает следующую команду и запускает таймер на ${clock(st.reportSeconds * 1000)}.`,
            'Оценивайте во время доклада: 5 критериев в таблице ниже, штраф — за запрещённые слова.',
          ]
        : round.revealCause
          ? ['Ответ на экране. Разберите цепочку причин — она в карточке ведущего справа.', training ? 'Обсудите вопросы и недопонимания. Оценки тренировки не входят в рейтинг.' : 'Проверьте оценки и завершите кейс: баллы уйдут в рейтинг.']
          : ['Все команды доложили. Покажите правильный ответ и разберите, кто был ближе.'];
      return {
        ...base,
        todo,
        warn: all && unscored.length ? `Не оценены полностью: ${unscored.map(teamTitle).join(', ')}` : undefined,
        actions: <>
          {(!all || round.revealCause) && revealBtn}
          {!(all && round.revealCause) && btn('Завершить кейс сейчас', 'Flag', { type: 'finishRound' })}
        </>,
      };
    }
    case 'done': {
      const next = visible[at + 1];
      const todo = next
        ? [training ? 'Тренировка завершена. Дайте обратную связь; оценки этого кейса не входят в рейтинг.' : 'Баллы за кейс в рейтинге — он на экране. Объявите лидера.', `Дальше фишка шагнёт по полю, и откроется заставка «${introName(places[at + 1], sectorById(next.sector).title)}».`]
        : game.view === 'debrief'
          ? ['Объявите победителей и проведите разбор по вопросам на экране.', 'Дальше — табло со всеми очками.']
          : game.view === 'scores'
            ? ['Игра окончена — поблагодарите участников!', 'Результаты для отчёта — «Скачать результаты» (откроется в Excel).']
            : ['Все кейсы сыграны! Покажите итоги игры: призёры и вопросы для разбора.'];
      return {
        ...base,
        todo,
        actions: <>
          {btn('Исправить оценки', 'Pencil', { type: 'reopenRound' })}
          {game.view === 'round' && revealBtn}
          {!next && <a className="btn" href="/api/results.csv" download><Icon name="Download" size={16} /> Скачать результаты</a>}
        </>,
      };
    }
  }
}

function TrapPanel({ round }: { round: Round }) {
  const { game, library, now, run } = useHostCtx();
  const trap = round.trap;
  const card = trap ? library.traps.find(t => t.id === trap.cardId) : null;

  if (trap && trapShown(round) && card) {
    return (
      <div className="trap-live">
        <div className="trap-live-head"><Icon name="Zap" size={16} /> Ловушка на экране{trap.resumesTimer ? ' — время на паузе' : ''}</div>
        <div className="trap-live-body">
          <span className="trap-live-icon"><Icon name={card.icon} size={30} /></span>
          <div>
            <b>{card.title}</b>
            <p>{card.text}</p>
            {card.hostHint && <p className="host-hint"><Icon name="Info" size={15} /> {card.hostHint}</p>}
          </div>
        </div>
        <div className="actions">
          {card.timeFactor && (
            <button className="btn" onClick={() => run({ type: 'timerFactor', factor: card.timeFactor! })}>
              <Icon name="Timer" size={16} /> Урезать время на {Math.round((1 - card.timeFactor) * 100)}%
            </button>
          )}
          <button className="btn" onClick={() => run({ type: 'redrawTrap' })}><Icon name="Shuffle" size={16} /> Другая ловушка</button>
          <button className="btn-primary" onClick={() => run({ type: 'closeTrap' })}><Icon name="Check" size={16} /> Закрыть ловушку</button>
        </div>
      </div>
    );
  }
  if (trap && trap.firedAt === null && round.phase === 'discussion') {
    const left = Math.max(0, Math.ceil(trap.delaySec - elapsed(game.timer, now) / 1000));
    return (
      <div className="trap-wait">
        <span><Icon name="Zap" size={17} /> Ловушка выпадет сама через <b>{left} с</b></span>
        <button className="btn-small" onClick={() => run({ type: 'fireTrap' })}>Проиграть ловушку сейчас</button>
      </div>
    );
  }
  return (
    <div className="trap-wait is-muted">
      <span><Icon name="Zap" size={17} /> {trap?.closedAt ? `Ловушка «${card?.title ?? ''}» сыграна.` : isTrainingRound(game, round) ? 'На тренировке ловушки запускает ведущий.' : round.withTrap ? 'Автоловушка включена. Можно запустить вручную.' : 'Автоловушка выключена. Ручной запуск доступен.'}</span>
      <button className="btn-small" onClick={() => run({ type: 'fireTrap' })}>Проиграть ловушку</button>
    </div>
  );
}

// ---------- teams ----------

const SHORT: Record<CriterionId, string> = { problem: 'Проблема', cause: 'Причина', actions: 'Действия', clarity: 'Доклад', facts: 'Факт/шум' };

function TeamsCard({ round, card }: { round: Round | null; card: CaseCard | null }) {
  const { game, run } = useHostCtx();
  const [editor, setEditor] = useState<{ teamId: string; purchaseId?: string } | null>(null);
  useEffect(() => setEditor(null), [round?.id]);
  const table = useMemo(() => scoreTable(game), [game]);
  const scoring = round && (round.phase === 'reports' || round.phase === 'done');
  const selling = round && round.phase !== 'ready' && round.phase !== 'done';
  const reporting = round?.phase === 'reports';
  const cost = game.settings.hiddenCost;
  const pool = card ? [...card.hidden, ...card.hiddenExtra] : [];
  const factTeam = game.teams.find(t => t.id === editor?.teamId);
  // during the reports the rows follow the speaking order of this case
  const teams = reporting ? reportOrder(game.teams, activeRounds(game).findIndex(r => r.index === game.current)) : game.teams;
  const reported = round?.reported ?? [];

  return (
    <section className="panel teams-card">
      <div className="panel-head">
        <h3>{scoring ? round && isTrainingRound(game, round) ? 'Обратная связь · тренировка' : 'Оценка команд' : 'Команды'}</h3>
        <span className="hint">
          {reporting
            ? 'Строки — в порядке докладов. Оценки ставьте во время доклада'
            : selling && pool.length > 0 ? `Скрытый факт — ${cost} ${plural(cost, 'балл', 'балла', 'баллов')}, текст видите только вы` : 'Баллы за кейсы складываются в рейтинг'}
        </span>
      </div>
      {editor && round && card && factTeam && <FactDialog key={`${round.id}:${editor.teamId}:${editor.purchaseId ?? 'new'}`} round={round} card={card} team={factTeam} purchaseId={editor.purchaseId} onClose={() => setEditor(null)} onSelect={purchaseId => setEditor({ teamId: editor.teamId, purchaseId })} />}
      <div className="table-wrap">
        <table className="teams-table">
          <thead>
            <tr>
              {reporting && <th>Доклад</th>}
              <th>Команда</th>
              {!scoring && <th className="num">Всего</th>}
              {scoring && CRITERIA.map(c => <th key={c.id} title={c.title}>{SHORT[c.id]}<small>из {c.max}</small></th>)}
              {round && <th>Скрытые факты</th>}
              {scoring && <th>Штраф</th>}
              {scoring && <th className="num">За кейс</th>}
            </tr>
          </thead>
          <tbody>
            {teams.map((team, pos) => {
              const row = table.find(r => r.teamId === team.id)!;
              const result = round?.results[team.id];
              const bought = round ? round.purchases.filter(p => p.teamId === team.id).length : 0;
              const issued = round?.purchases.filter(p => p.teamId === team.id) ?? [];
              const canSell = selling && pool.some(text => !issued.some(p => p.text === text));
              const speaking = round?.reporterId === team.id;
              return (
                <tr key={team.id} className={speaking ? 'is-reporting' : ''}>
                  {reporting && round && (
                    <td className="report-cell">
                      <button
                        className={`report-btn${speaking ? ' is-on' : reported.includes(team.id) ? ' is-done' : ''}`}
                        title={speaking ? 'Запустить доклад заново' : 'Начать доклад: таймер на экране'}
                        onClick={() => run({ type: 'startReport', teamId: team.id })}
                      >
                        {speaking ? <Icon name="RotateCcw" size={15} /> : reported.includes(team.id) ? <Icon name="Check" size={15} /> : <b>{pos + 1}</b>}
                        <Icon name="Mic" size={15} />
                      </button>
                    </td>
                  )}
                  <td className="team-cell">
                    <TeamBadge color={team.color} label={game.teams.indexOf(team) + 1} size={36} />
                    <span><b>{team.name}</b><small>{row.place}-е место · {row.total} {plural(row.total, 'балл', 'балла', 'баллов')}</small></span>
                  </td>
                  {!scoring && <td className="num total-cell">{row.total}</td>}
                  {scoring && round && CRITERIA.map(c => (
                    <td key={c.id}>
                      <select
                        className={result?.scores[c.id] !== undefined ? 'is-set' : ''}
                        value={result?.scores[c.id] ?? ''}
                        onChange={e => run({ type: 'score', teamId: team.id, criterion: c.id, value: e.target.value === '' ? null : Number(e.target.value) })}
                      >
                        <option value="">—</option>
                        {Array.from({ length: c.max + 1 }, (_, v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                  ))}
                  {round && (
                    <td className="hidden-cell">
                      {bought > 0 && <button className="btn-small facts-issued" onClick={() => setEditor({ teamId: team.id, purchaseId: issued.at(-1)!.id })} title="Посмотреть и исправить выданные факты"><Icon name="BookOpen" size={13} /> Журнал ({bought}) · −{bought * cost}</button>}
                      {canSell && <button className="btn-small" onClick={() => setEditor({ teamId: team.id })}><Icon name="Plus" size={13} /> Факт</button>}
                      {!bought && !canSell && <span className="muted">—</span>}
                    </td>
                  )}
                  {scoring && round && (
                    <td><Stepper value={result?.penalty ?? 0} onChange={v => run({ type: 'penalty', teamId: team.id, value: v })} max={40} /></td>
                  )}
                  {scoring && round && <td className="num round-total">{roundScore(game, round, team.id) ?? '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- side: preview + answers ----------

const VIEW_ICONS: Record<ScreenView, string> = {
  welcome: 'MonitorPlay', board: 'LayoutGrid', rules: 'BookOpen', roles: 'Users', round: 'Target', scores: 'ChartColumn', debrief: 'Trophy', pause: 'Coffee',
};

function PlayersView() {
  const { game, library, now, run } = useHostCtx();
  const pub = useMemo(() => toPublic(game, library), [game, library]);
  const slide = Math.min(game.slide, RULE_SLIDES.length - 1);
  return (
    <section className="panel preview">
      <div className="panel-head">
        <h3><Icon name="MonitorPlay" size={18} /> Экран игроков</h3>
        <span className="hint">видят все</span>
      </div>
      <div className="pv-screen"><Scaled><Stage state={pub} now={now} /></Scaled></div>
      <div className="view-grid">
        {(Object.entries(VIEWS) as [ScreenView, string][]).map(([view, label]) => (
          <button key={view} className={game.view === view ? 'is-on' : ''} onClick={() => run({ type: 'setView', view })}>
            <Icon name={VIEW_ICONS[view]} size={17} />
            {label}
          </button>
        ))}
      </div>
      {game.view === 'rules' && (
        <div className="slide-nav">
          <button className="btn-icon" disabled={slide === 0} onClick={() => run({ type: 'setView', view: 'rules', slide: slide - 1 })}><Icon name="ChevronLeft" size={18} /></button>
          <span>{slide + 1} / {RULE_SLIDES.length} · {RULE_SLIDE_TITLES[RULE_SLIDES[slide]]}</span>
          <button className="btn-icon" disabled={slide === RULE_SLIDES.length - 1} onClick={() => run({ type: 'setView', view: 'rules', slide: slide + 1 })}><Icon name="ChevronRight" size={18} /></button>
        </div>
      )}
    </section>
  );
}

function Block({ title, icon, tone, children }: { title: string; icon: string; tone: string; children: ReactNode }) {
  return (
    <div className={`ac-block tone-${tone}`}>
      <h4><Icon name={icon} size={15} /> {title}</h4>
      {children}
    </div>
  );
}

function AnswerCard({ round, card }: { round: Round | null; card: CaseCard | null }) {
  const { game } = useHostCtx();
  if (!card) {
    return (
      <section className="panel answer-card is-empty">
        <h3><Icon name="Lock" size={18} /> Карточка ведущего</h3>
        <p className="muted">Когда начнётся кейс, здесь будут факты, скрытые факты и правильный ответ. Игроки её не видят.</p>
      </section>
    );
  }
  const sector = sectorById(card.sector);
  const hidden = [...card.hidden, ...card.hiddenExtra];
  const list = (items: string[]) => <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
  return (
    <section className="panel answer-card" style={{ '--c': sector.color } as CSSProperties}>
      <div className="ac-head">
        <span className="ac-code">{caseCode(card)}</span>
        <span className="ac-level">{card.level === 'hard' ? 'Усложнённая' : 'Базовая'}</span>
        <span className="ac-secret"><Icon name="EyeOff" size={14} /> Видите только вы</span>
      </div>
      <h3>{card.title}</h3>
      <div className="ac-answer">
        <h4><Icon name="Target" size={15} /> Корневая причина</h4>
        <p>{card.rootCause}</p>
        {card.systemCause && <><h4>Системная причина</h4><p>{card.systemCause}</p></>}
      </div>
      <Block title="Ситуация — читается вслух" icon="Presentation" tone="plain"><p className="ac-symptom">{card.symptom}</p></Block>
      <Block title="Факты" icon="CircleCheck" tone="fact">{list(card.facts)}</Block>
      <Block title="Шум" icon="Info" tone="noise">{list(card.noise)}</Block>
      <Block title="Мнения" icon="MessagesSquare" tone="opinion">{list(card.opinions)}</Block>
      {hidden.length > 0 && (
        <Block title="Скрытые факты — выбор ведущего" icon="Lock" tone="hidden">
          <ol>
            {hidden.map((h, i) => {
              const buyers = round?.purchases.filter(p => p.text === h).map(p => game.teams.find(t => t.id === p.teamId)).filter(Boolean) ?? [];
              return (
                <li key={i} className={i >= card.hidden.length ? 'is-extra' : ''}>
                  {i === card.hidden.length && <span className="extra-label">Для сильных команд</span>}
                  {h}
                  {buyers.length > 0 && <span className="buyers">{buyers.map(t => <i key={t!.id} title={t!.name} style={{ background: t!.color }} />)}</span>}
                </li>
              );
            })}
          </ol>
        </Block>
      )}
      {card.wrongAnswers.length > 0 && <Block title="Типичные ошибки команд" icon="X" tone="wrong">{list(card.wrongAnswers)}</Block>}
      {card.chain.length > 0 && <Block title="Цепочка причин" icon="ChevronRight" tone="plain"><ol>{card.chain.map((c, i) => <li key={i}>{c}</li>)}</ol></Block>}
      {card.question && <Block title="Вопрос для сильных команд" icon="Lightbulb" tone="plain"><p>{card.question}</p></Block>}
      {card.notes && <Block title="Заметки" icon="NotebookPen" tone="plain"><p className="pre">{card.notes}</p></Block>}
    </section>
  );
}

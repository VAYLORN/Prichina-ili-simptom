// The game as one straight line of steps: welcome → rules → roles → for every case: intro,
// situation, discussion, reports one team after another, the answer, the rating → final → results.
// The host's big button, the → key and a presentation clicker all perform `nextStep`; everything
// else on the host console is a side action.
import { RULE_SLIDES, RULE_SLIDE_TITLES } from './content/rules';
import { activeRounds, currentRound, discussionMinutes, isTrainingRound, planPlaces, remaining, reportOrder, trapShown, type Command } from './logic';
import { sectorById, type GameState, type PlanPlace, type Team } from './types';

export type HostCommand = Command | { type: 'advance'; key?: string } | { type: 'back' } | { type: 'undo' };

export interface Step {
  key: string; // the moment it belongs to: a second press after the game has moved on does nothing
  label: string; // the big button
  icon: string;
  cmd: Command;
}

// Teams are often named just «1», «2»… — in texts that reads as «Команда 1».
export const teamTitle = (team: Pick<Team, 'name'>) => (/^\d+$/.test(team.name.trim()) ? `Команда ${team.name.trim()}` : team.name);

// What the intro of a case says: a new round names the sector, the next cases only their number.
export const introName = (p: PlanPlace, sectorTitle: string) =>
  !p.block ? 'Финал · Доклад директору' : p.caseInBlock === 1 ? `Раунд ${p.block} · ${sectorTitle}` : `${sectorTitle} · кейс ${p.caseInBlock} из ${p.blockSize}`;

const momentKey = (s: GameState) => {
  const r = currentRound(s);
  return [s.current, s.view, s.view === 'rules' ? s.slide : 0, r?.phase, r?.reporterId, r?.reported?.length ?? 0, r?.revealCause, r && trapShown(r)].join('|');
};

export function nextStep(s: GameState, now = Date.now()): Step | null {
  const key = momentKey(s);
  const step = (label: string, icon: string, cmd: Command): Step => ({ key, label, icon, cmd });
  const rounds = activeRounds(s);
  const places = planPlaces(rounds);
  const position = rounds.findIndex(r => r.index === s.current);
  const r = currentRound(s);

  // Manual traps can interrupt any phase; the next click always closes the overlay first.
  if (r && trapShown(r)) return step('Ловушка прочитана — закрыть', 'Play', { type: 'closeTrap' });

  // before the first case: welcome → the rules, slide by slide → roles → case 1
  if (!r) {
    if (!rounds.length) return null;
    if (s.view === 'welcome') return step('Начать игру: правила', 'Play', { type: 'setView', view: 'rules', slide: 0 });
    if (s.view === 'rules') {
      const i = Math.min(s.slide, RULE_SLIDES.length - 1);
      return i < RULE_SLIDES.length - 1
        ? step(`Правила ${i + 2} из ${RULE_SLIDES.length}: ${RULE_SLIDE_TITLES[RULE_SLIDES[i + 1]]}`, 'ChevronRight', { type: 'setView', view: 'rules', slide: i + 1 })
        : step('Роли в команде', 'Users', { type: 'setView', view: 'roles' });
    }
    return step(`Первый кейс: ${introName(places[0], sectorById(rounds[0].sector).title)}`, 'Play', { type: 'nextRound' });
  }

  const p = places[position];
  switch (r.phase) {
    case 'ready':
      return s.view === 'round'
        ? step('Показать ситуацию', 'Presentation', { type: 'showSituation' })
        : step(`Заставка: ${introName(p, sectorById(r.sector).title)}`, 'Flag', { type: 'setView', view: 'round' });
    case 'situation': {
      const min = discussionMinutes(s, r);
      return step(`${isTrainingRound(s, r) ? 'Старт тренировки' : 'Старт обсуждения'} · ${min} мин`, 'Play', { type: 'startDiscussion' });
    }
    case 'discussion':
      if (trapShown(r)) return step('Ловушка прочитана — продолжить обсуждение', 'Play', { type: 'closeTrap' });
      return step(remaining(s.timer, now) === 0 ? 'Время вышло — к докладам' : 'Закончить обсуждение — к докладам', 'Mic', { type: 'finishDiscussion' });
    case 'reports': {
      const next = reportOrder(s.teams, position).find(t => !(r.reported ?? []).includes(t.id));
      if (next) return step(`Доклад: ${teamTitle(next)}`, 'Mic', { type: 'startReport', teamId: next.id });
      if (!r.revealCause) return step('Показать правильный ответ', 'Target', { type: 'toggleReveal' });
      return step(isTrainingRound(s, r) ? 'Завершить тренировку — без баллов в рейтинг' : 'Завершить кейс — баллы в рейтинг', 'Flag', { type: 'finishRound' });
    }
    case 'done': {
      const next = rounds[position + 1];
      if (next) return step(`Дальше: ${introName(places[position + 1], sectorById(next.sector).title)}`, 'Play', { type: 'nextRound' });
      if (s.view === 'debrief') return step('Табло: все очки по кейсам', 'ChartColumn', { type: 'setView', view: 'scores' });
      if (s.view === 'scores') return null; // the game is over
      return step('Итоги игры', 'Trophy', { type: 'setView', view: 'debrief' });
    }
  }
}

// ← on the clicker leafs back through the rules; anything else is undone with «Отменить».
export function backStep(s: GameState): Command | null {
  if (s.view === 'rules') return s.slide > 0 ? { type: 'setView', view: 'rules', slide: s.slide - 1 } : { type: 'setView', view: 'welcome' };
  if (s.view === 'roles' && s.current < 0) return { type: 'setView', view: 'rules', slide: RULE_SLIDES.length - 1 };
  return null;
}

// Names for «Отменить: …» when the action was not the big button.
export const COMMAND_LABELS: Partial<Record<HostCommand['type'], string>> = {
  setMusic: 'фоновая музыка',
  setView: 'смена экрана',
  goToRound: 'переход к кейсу',
  nextRound: 'переход к следующему кейсу',
  showSituation: 'показ ситуации',
  startDiscussion: 'старт обсуждения',
  fireTrap: 'ловушка',
  redrawTrap: 'другая ловушка',
  closeTrap: 'закрытие ловушки',
  finishDiscussion: 'переход к докладам',
  startReport: 'начало доклада',
  toggleStatements: 'карточки на экране',
  toggleReveal: 'показ ответа',
  finishRound: 'завершение кейса',
  reopenRound: 'исправление оценок',
  resetProgress: 'сброс игры',
  finishSetup: 'настройка игры',
  sellHidden: 'выдача скрытого факта',
  replaceHidden: 'уточнение выданного факта',
  autoPlan: 'пересборка плана',
  back: 'назад',
};

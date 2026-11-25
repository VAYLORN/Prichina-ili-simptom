// Texts for players: projector rules slides, the printed memo and the debrief.
// Based on «Презентация Причины и симптомы.pptx» and «Бланк команды.docx».
import type { Settings } from '../types';

export const TAGLINE = 'Найди корень проблемы!';
export const MOTTO = ['ФАКТ ≠ ПРИЧИНА', 'ПРИЧИНА → ДЕЙСТВИЕ → РЕЗУЛЬТАТ'];

export const STORY =
  'Вы — руководители завода. Каждый игровой день на производстве возникают проблемы. ' +
  'Побеждает команда, которая чаще находит корневые причины, а не борется с последствиями.';

type RuleSettings = Pick<Settings, 'prepMinutes' | 'reportSeconds' | 'hiddenCost' | 'trainingFirstCase' | 'trainingPrepMinutes'>;
export const reportTime = (seconds: number) => seconds < 60 ? `${seconds} сек` : `${(seconds / 60).toLocaleString('ru-RU')} мин`;
export const pointsText = (points: number) => `${points} ${points % 10 === 1 && points % 100 !== 11 ? 'балл' : points % 10 >= 2 && points % 10 <= 4 && (points % 100 < 12 || points % 100 > 14) ? 'балла' : 'баллов'}`;

export const roundSteps = (settings: RuleSettings) => [
  { title: 'Ситуация', text: 'Ведущий объявляет проблему. Все команды разбирают одну и ту же ситуацию.' },
  { title: 'Карточки', text: `Факты, шум и мнения вперемешку. Дополнительный скрытый факт — ${pointsText(settings.hiddenCost)}.` },
  { title: 'Обсуждение', text: `${settings.prepMinutes} мин на кейс.${settings.trainingFirstCase ? ` Первый кейс — тренировка: ${settings.trainingPrepMinutes} мин, без зачёта в рейтинг.` : ''}` },
  { title: 'Бланк', text: 'Секретарь записывает: что произошло, причину и 3 действия со сроком и ответственным.' },
  { title: 'Доклад', text: `${reportTime(settings.reportSeconds)} каждой команде. Затем обратная связь и оценки жюри.` },
];

export const BLANK_FIELDS = [
  { title: 'Что произошло?', hint: 'Одним предложением' },
  { title: 'Причина', hint: 'Одной формулировкой' },
  { title: 'Действия', hint: '3 шага: что, срок, ответственный' },
];

export const FORBIDDEN = ['надо разобраться', 'усилить контроль', 'обратить внимание', 'провести работу', 'принять меры', 'повысить ответственность'];

export const GOOD_EXAMPLES = [
  'Провести обучение 12 операторов до 15 ноября',
  'Заменить датчик температуры до конца смены',
  'Восстановить график ТО с 1 декабря',
  'Назначить владельца процесса и еженедельный контроль отчёта',
];

export const TRAP_KINDS = ['сокращают время', 'выводят игрока из игры', 'усложняют задание', 'бывают шуточные'];

export const FINAL_ROUND = {
  title: 'Доклад директору',
  questions: [
    { title: 'Причина?', limit: 'не более 15 слов' },
    { title: 'Что делать?', limit: 'не более 30 слов' },
  ],
};

export const DEBRIEF = [
  'Какая информация чаще всего отвлекала?',
  'Почему люди цепляются за лишние детали?',
  'Что оказалось самым сложным?',
  'Какие ошибки были в докладах?',
  'Что можно применять в ежедневной работе?',
];

export const RULE_SLIDES = ['story', 'round', 'blank', 'words', 'score', 'traps', 'final'] as const;
export type RuleSlide = (typeof RULE_SLIDES)[number];
export const RULE_SLIDE_TITLES: Record<RuleSlide, string> = {
  story: 'Один день директора',
  round: 'Как проходит раунд',
  blank: 'Бланк решения',
  words: 'Говорим конкретно',
  score: 'Как считаем очки',
  traps: 'Ловушки',
  final: 'Финал',
};

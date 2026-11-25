import { useEffect, useState } from 'react';
import { activeRounds, planMinutes } from '../../shared/logic';
import { Icon } from '../ui/icons';
import { useHostCtx } from './context';
import SetupTab from './SetupTab';

const STEPS = [
  { title: 'Команды', icon: 'Users', hint: 'Укажите названия и количество команд.' },
  { title: 'Время', icon: 'Timer', hint: 'Выберите время обсуждения, тренировки и докладов.' },
  { title: 'Кейсы', icon: 'SquareStack', hint: 'Включите нужные сектора, выберите ситуации и автоловушки.' },
];

export default function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { game, run } = useHostCtx();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [step]);
  const rounds = activeRounds(game);
  const missing = rounds.some(r => !r.caseId);
  const started = game.rounds.some(r => r.phase !== 'ready');
  const { total } = planMinutes(game);
  const finish = async () => {
    setBusy(true);
    if (!game.setupRequired || await run({ type: 'finishSetup' })) onComplete();
    setBusy(false);
  };
  return (
    <div className="setup-wizard">
      <header className="wizard-heading">
        <div>
          <span className="wizard-kicker">{started ? 'Корректировка игры' : 'Перед стартом'}</span>
          <h1>{started ? 'Настройки игры' : 'Настроим игру'}</h1>
          <p>Настройки сохраняются сразу. Их можно изменить позже во вкладке «Подготовка», в том числе во время игры.</p>
        </div>
        {!game.setupRequired && <button className="btn-ghost" onClick={onComplete}><Icon name="ArrowLeft" size={16} /> Вернуться к игре</button>}
      </header>
      <nav className="wizard-steps" aria-label="Шаги настройки игры">
        {STEPS.map((s, i) => <button key={s.title} className={`${i === step ? 'is-active' : ''}${i < step ? ' is-done' : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
          <span>{i < step ? <Icon name="Check" size={20} /> : i + 1}</span><b><Icon name={s.icon} size={18} /> {s.title}</b>
        </button>)}
      </nav>
      <p className="wizard-instruction">Шаг {step + 1} из 3. {STEPS[step].hint}</p>
      <SetupTab wizardStep={step} />
      <footer className="wizard-footer">
        <div><b>{game.teams.length} команды · {rounds.length} кейсов · ≈ {Math.round(total)} мин</b><span>Обсуждение {game.settings.prepMinutes} мин · доклад {+(game.settings.reportSeconds / 60).toFixed(1)} мин{game.settings.trainingFirstCase && ` · тренировка ${game.settings.trainingPrepMinutes} мин`}</span></div>
        <div className="actions">
          {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}><Icon name="ChevronLeft" size={17} /> Назад</button>}
          {step < 2 ? <button className="btn-primary" onClick={() => setStep(step + 1)}>Далее: {STEPS[step + 1].title.toLowerCase()} <Icon name="ChevronRight" size={17} /></button>
            : <button className="btn-primary" disabled={busy || missing || rounds.length === 0} onClick={finish}><Icon name="CircleCheck" size={17} /> {busy ? 'Сохраняем…' : started ? 'Готово, вернуться к игре' : 'Готово, к игре'}</button>}
        </div>
        {step === 2 && missing && <p className="warn-text">Выберите ситуацию для каждого включённого кейса.</p>}
      </footer>
    </div>
  );
}

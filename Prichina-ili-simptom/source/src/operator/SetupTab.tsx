import { useEffect, useState, type CSSProperties } from 'react';
import { SOUND_LABELS, useSound, type SoundName } from '../screen/sound';
import { activeRounds, isTrainingRound, planMinutes, planPlaces } from '../../shared/logic';
import { CRITERIA, MAX_ROUND_SCORE, SECTORS, TEAM_COLORS, caseCode, sectorById, type SectorId } from '../../shared/types';
import { plural } from '../lib/net';
import { TeamBadge } from '../ui/Board';
import { Icon } from '../ui/icons';
import { useHostCtx } from './context';
import { NumberField, Stepper, TextField } from './fields';

// Volume and a preview button for every game sound. Plays on the projector when it has sound on,
// otherwise right here.
function SoundPanel() {
  const { game, run, screensWithSound, testSound } = useHostCtx();
  const saved = game.settings.soundVolume ?? 100;
  const savedMusic = game.settings.musicVolume ?? 60;
  const [music, setMusic] = useState(savedMusic);
  useEffect(() => setMusic(savedMusic), [savedMusic]);
  const [volume, setVolume] = useState(saved);
  useEffect(() => setVolume(saved), [saved]);
  const local = useSound({ volume, autoUnlock: false });
  const commit = () => { if (volume !== saved) void run({ type: 'setSettings', settings: { soundVolume: volume } }); };
  const commitMusic = () => { if (music !== savedMusic) void run({ type: 'setSettings', settings: { musicVolume: music } }); };
  const preview = async (name: SoundName) => {
    if (screensWithSound > 0) testSound(name);
    else if (await local.enable(false)) local.play(name);
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <h3><Icon name="Volume2" size={18} /> Звуки</h3>
        <span className="hint">{screensWithSound ? 'Кнопки играют звук на проекторе' : 'Проектор со звуком не открыт — слушаете на этом компьютере'}</span>
      </div>
      <label className="volume">
        <Icon name={volume ? 'Volume2' : 'VolumeX'} size={18} />
        Громкость звуков
        <input type="range" min={0} max={100} step={5} value={volume} onChange={e => setVolume(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
        <b>{volume}%</b>
      </label>
      <label className="volume"><Icon name="Music" size={18} /> Громкость музыки
        <input type="range" min={0} max={100} step={5} value={music} onChange={e => setMusic(Number(e.target.value))} onPointerUp={commitMusic} onKeyUp={commitMusic} onBlur={commitMusic} />
        <b>{music}%</b>
      </label>
      <div className="sound-grid">
        {(Object.entries(SOUND_LABELS) as [SoundName, string][]).map(([name, label]) => (
          <button key={name} className="btn" onClick={() => preview(name)}><Icon name="Play" size={14} /> {label}</button>
        ))}
      </div>
    </section>
  );
}

const hm = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} ч${m ? ` ${m} мин` : ''}` : `${m} мин`;
};

// Does the plan fit into the event? Discussion + every team's report + scoring, per case.
function TimePlan() {
  const { game, run } = useHostCtx();
  const { perCase, total } = planMinutes(game);
  const limit = game.settings.eventMinutes ?? 180;
  const over = total > limit;
  const regular = activeRounds(game).filter(r => r.kind === 'regular').length;
  const fitCases = Math.max(1, Math.floor((limit - (total - regular * perCase)) / perCase));
  return (
    <div className={`time-plan${over ? ' is-over' : ''}`}>
      <div className="tp-head">
        <span><Icon name="Clock" size={18} /> По плану ≈ <b>{hm(total)}</b> из {hm(limit)}</span>
        <label className="tp-limit">Длительность мероприятия
          <NumberField value={limit} min={30} max={600} step={10} onCommit={v => run({ type: 'setSettings', settings: { eventMinutes: v } })} suffix="мин" />
        </label>
      </div>
      <div className="tp-bar"><i style={{ width: `${Math.min(100, (total / limit) * 100)}%` }} /></div>
      <p className="hint">
        Обычный кейс ≈ {hm(perCase)}: обсуждение {game.settings.prepMinutes} мин + доклады {game.teams.length} × {+(game.settings.reportSeconds / 60).toFixed(1)} мин + ~2 мин на оценку. {game.settings.trainingFirstCase && `Первое обсуждение — ${game.settings.trainingPrepMinutes} мин. `}Плюс 20 мин на правила и итоги. Резерв в расчёт не входит.
      </p>
      {over && (
        <p className="warn-text">
          <Icon name="TriangleAlert" size={16} /> Не укладываемся: при таких настройках помещается около {fitCases} {plural(fitCases, 'кейса', 'кейсов', 'кейсов')}. Можно скрыть часть кейсов или увеличить длительность мероприятия.
        </p>
      )}
    </div>
  );
}

export default function SetupTab({ wizardStep, onOpenWizard }: { wizardStep?: number; onOpenWizard?: () => void }) {
  const { game, library, run } = useHostCtx();
  const started = game.rounds.some(r => r.phase !== 'ready');
  const visible = activeRounds(game);
  const traps = visible.filter(r => r.withTrap).length;
  const places = planPlaces(visible);
  const visibleIndex = new Map(visible.map((r, i) => [r.id, i]));
  const blocks = new Set(places.filter(p => p.block).map(p => p.block)).size;
  const regular = visible.filter(r => r.kind === 'regular').length;
  const show = (step: number) => wizardStep === undefined || wizardStep === step;
  const set = (key: keyof typeof game.settings) => (v: number) => run({ type: 'setSettings', settings: { [key]: v } });

  return (
    <div className="setup">
      {wizardStep === undefined && <section className="panel setup-entry">
        <div className="panel-head">
          <div><h3>Подготовка игры</h3><p className="hint">Команды, время и кейсы можно корректировать и во время игры. Текущий таймер меняется кнопками в игре; новые тайминги применяются при следующем запуске обсуждения или доклада.</p></div>
          {onOpenWizard && <button className="btn-primary" onClick={onOpenWizard}><Icon name="Settings" size={16} /> Настроить игру по шагам</button>}
        </div>
      </section>}

      {show(0) && <section className="panel">
        <h3>{wizardStep === undefined ? '1. Мероприятие' : 'Название игры'}</h3>
        <label className="field">
          Название на заставке
          <TextField value={game.title} onCommit={title => run({ type: 'setTitle', title })} placeholder="Причина или симптом?" />
        </label>
      </section>}

      {show(0) && <section className="panel">
        <div className="panel-head">
          <h3>{wizardStep === undefined ? '2. Команды' : 'Команды'}</h3>
          <Stepper value={game.teams.length} min={2} max={8} onChange={count => {
            if (count < game.teams.length && started && !confirm('У последней команды будут удалены её очки. Продолжить?')) return;
            void run({ type: 'setTeamCount', count });
          }} />
        </div>
        <div className="team-list">
          {game.teams.map((team, i) => (
            <div key={team.id} className="team-edit">
              <TeamBadge color={team.color} label={i + 1} size={40} />
              <TextField aria-label={`Название команды ${i + 1}`} value={team.name} onCommit={name => run({ type: 'updateTeam', teamId: team.id, name })} />
              <span className="swatches">
                {TEAM_COLORS.map(color => (
                  <button
                    key={color}
                    className={team.color === color ? 'is-on' : ''}
                    style={{ background: color }}
                    aria-label={`Цвет ${color}`}
                    onClick={() => run({ type: 'updateTeam', teamId: team.id, color })}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>
      </section>}

      {show(2) && <section className="panel">
        <div className="panel-head">
          <h3>{wizardStep === undefined ? '3. План игры' : 'Выберите кейсы для игры'}</h3>
          <span className="hint">Раундов: {blocks} · кейсов: {regular}{visible.some(r => r.kind === 'final') ? ' + финал' : ''} · в резерве: {game.rounds.length - visible.length} · с ловушкой: {traps}</span>
        </div>
        <div className="plan-controls">
          <span className="hint">Производство → Качество → Персонал</span>
          <button className="btn-ghost" disabled={started} onClick={() => confirm('Восстановить сценарий: ПР-4 → ПР-3 → ПР-2, КА-3 → КА-2 → КА-1, ПЕ-3 → ПЕ-2 → ПЕ-1? Поставки останутся в резерве.') && run({ type: 'autoPlan' })}>
            <Icon name="RefreshCw" size={15} /> Восстановить сценарий
          </button>
        </div>
        <div className="sector-visibility">
          {SECTORS.map(s => {
            const hidden = game.settings.hiddenSectors.includes(s.id);
            return <button key={s.id} className={`btn${hidden ? ' is-hidden' : ' is-visible'}`} aria-pressed={!hidden}
              onClick={() => run({ type: 'setSettings', settings: { hiddenSectors: hidden ? game.settings.hiddenSectors.filter(id => id !== s.id) : [...game.settings.hiddenSectors, s.id] } })}>
              <Icon name={hidden ? 'EyeOff' : 'Eye'} size={16} /> {s.title} · {hidden ? 'в резерве' : 'в игре'}
            </button>;
          })}
        </div>
        <p className="hint">Включите нужные сектора и отметьте кейсы в столбце «В игре». Снятая галочка оставляет кейс в резерве. Карточки и оценки сохраняются. Идущий кейс можно скрыть после завершения.</p>
        <TimePlan />
        <div className="table-wrap">
          <table className="plan-table">
            <thead>
              <tr><th>В игре · кейс</th><th>Сектор</th><th>Ситуация</th><th>Автоловушка</th><th /></tr>
            </thead>
            <tbody>
              {game.rounds.flatMap((r, i) => {
                const options = library.cases.filter(c => c.sector === r.sector);
                const vi = visibleIndex.get(r.id);
                const hidden = vi === undefined;
                const p = vi === undefined ? undefined : places[vi];
                const training = !hidden && isTrainingRound(game, r);
                const head = p?.caseInBlock === 1 ? (
                  <tr key={`h${r.id}`} className="plan-block" style={{ '--c': sectorById(r.sector).color } as CSSProperties}>
                    <td colSpan={5}>{p.block ? <><Icon name={sectorById(r.sector).icon} size={16} /> Раунд {p.block} · {sectorById(r.sector).title}</> : <><Icon name="Trophy" size={16} /> Финал · Доклад директору</>}</td>
                  </tr>
                ) : null;
                const row = (
                  <tr key={r.id} className={`${r.phase === 'done' ? 'is-done' : ''}${hidden ? ' plan-hidden' : ''}`}>
                    <td className="plan-no"><label className="plan-enabled"><input type="checkbox" checked={!hidden} disabled={game.settings.hiddenSectors.includes(r.sector)} aria-label={`Кейс ${r.caseId ? caseCode({ id: r.caseId, sector: r.sector }) : i + 1} в игре`} title={game.settings.hiddenSectors.includes(r.sector) ? 'Сначала включите сектор выше' : 'Включить кейс или оставить в резерве'} onChange={e => run({ type: 'updateRound', roundId: r.id, hidden: !e.target.checked })} /><span>{hidden ? 'Резерв' : r.kind === 'final' ? 'Ф' : p?.caseNumber}</span></label>{training && <small className="training-label">Тренировка</small>}</td>
                    <td>
                      <select
                        value={r.sector}
                        style={{ '--c': SECTORS.find(s => s.id === r.sector)!.color } as CSSProperties}
                        className="sector-select"
                        onChange={e => run({ type: 'updateRound', roundId: r.id, sector: e.target.value as SectorId })}
                      >
                        {SECTORS.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={r.caseId ?? ''} onChange={e => run({ type: 'updateRound', roundId: r.id, caseId: e.target.value || null })}>
                        <option value="">— не выбрана —</option>
                        {options.map(c => (
                          <option key={c.id} value={c.id}>
                            {caseCode(c)} · {c.title}{c.level === 'hard' ? ' (со скрытыми фактами)' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="center">
                      <input type="checkbox" checked={r.withTrap} aria-label={`Автоловушка ${r.caseId ? caseCode({ id: r.caseId, sector: r.sector }) : i + 1}`} onChange={e => run({ type: 'updateRound', roundId: r.id, withTrap: e.target.checked })} />
                    </td>
                    <td className="row-actions">
                      <button className="btn-icon" disabled={i === 0} onClick={() => run({ type: 'moveRound', roundId: r.id, dir: -1 })} aria-label="Выше"><Icon name="ChevronLeft" size={16} style={{ rotate: '90deg' }} /></button>
                      <button className="btn-icon" disabled={i === game.rounds.length - 1} onClick={() => run({ type: 'moveRound', roundId: r.id, dir: 1 })} aria-label="Ниже"><Icon name="ChevronRight" size={16} style={{ rotate: '90deg' }} /></button>
                      {wizardStep === undefined && <button className="btn-icon" onClick={() => confirm('Удалить кейс из плана?') && run({ type: 'removeRound', roundId: r.id })} aria-label="Удалить"><Icon name="Trash" size={16} /></button>}
                    </td>
                  </tr>
                );
                return head ? [head, row] : [row];
              })}
            </tbody>
          </table>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => run({ type: 'addRound', kind: 'regular' })}><Icon name="Plus" size={15} /> Кейс</button>
          {!game.rounds.some(r => r.kind === 'final') && <button className="btn" onClick={() => run({ type: 'addRound', kind: 'final' })}><Icon name="Plus" size={15} /> Финал «Доклад директору»</button>}
        </div>
        <p className="hint">Раунд — подряд идущие кейсы одного сектора. Персонал завершает основной сценарий. Резерв можно вернуть для спорной ситуации; библиотека всех карточек доступна во вкладке «Карточки».</p>
        <p className="hint">Автоловушки включены у всех кейсов нового плана: снимите галочки там, где они не нужны. В тренировочном кейсе ловушка запускается только вручную. Кнопка «Проиграть ловушку» доступна в любом выбранном кейсе.</p>
      </section>}

      {show(1) && <section className="panel">
        <h3>{wizardStep === undefined ? '4. Время и очки' : 'Время на обсуждение и доклады'}</h3>
        <label className="training-toggle"><input type="checkbox" checked={game.settings.trainingFirstCase} onChange={e => run({ type: 'setSettings', settings: { trainingFirstCase: e.target.checked } })} /> Первый активный кейс — тренировочный</label>
        <p className="hint">На тренировке дайте каждому высказаться и обсудите вопросы к правилам. Оценки служат обратной связью и не входят в итоговый рейтинг.</p>
        <p className="hint">Время можно менять и во время игры: текущий таймер учитывает уже прошедшее время и не запускается заново.</p>
        <div className="settings-grid">
          <label className="field">Обсуждение на тренировке<NumberField value={game.settings.trainingPrepMinutes} min={1} max={120} onCommit={set('trainingPrepMinutes')} suffix="мин" /></label>
          <label className="field">Обсуждение кейса<NumberField value={game.settings.prepMinutes} min={1} max={30} onCommit={set('prepMinutes')} suffix="мин" /></label>
          <label className="field">Доклад каждой команды<NumberField value={+(game.settings.reportSeconds / 60).toFixed(1)} min={0.5} max={10} step={0.5} onCommit={v => run({ type: 'setSettings', settings: { reportSeconds: Math.round(v * 60) } })} suffix="мин" /></label>
          {visible.some(r => r.kind === 'final') && <label className="field">Подготовка к дополнительному финалу<NumberField value={game.settings.finalPrepMinutes} min={1} max={30} onCommit={set('finalPrepMinutes')} suffix="мин" /></label>}
          <label className="field">Ловушка выпадает через<span className="range">
            <NumberField value={game.settings.trapDelayMin} min={0} max={300} onCommit={set('trapDelayMin')} />
            –
            <NumberField value={game.settings.trapDelayMax} min={0} max={300} onCommit={set('trapDelayMax')} suffix="сек" />
          </span></label>
          <label className="field">Цена скрытого факта<NumberField value={game.settings.hiddenCost} min={0} max={10} onCommit={set('hiddenCost')} suffix="балл" /></label>
        </div>
        <p className="hint">
          Оценка за кейс: {CRITERIA.map(c => `${c.title.toLowerCase()} — ${c.max}`).join(', ')}. Максимум {MAX_ROUND_SCORE}. Скрытые факты и штрафы вычитаются.
        </p>
      </section>}

      {wizardStep === undefined && <SoundPanel />}

      {wizardStep === undefined && <section className="panel panel-danger">
        <h3>Начать игру заново</h3>
        <p className="muted">Сбросит очки, выданные факты, ход игры и названия команд. Откроется настройка новой игры: команды, время и кейсы. Количество и цвета команд, выбранный план и тайминги сохранятся для корректировки.</p>
        <button className="btn-danger" onClick={() => confirm('Сбросить очки, выданные факты, ход игры и названия команд? После сброса откроется настройка новой игры.') && run({ type: 'resetProgress' })}>Начать заново</button>
      </section>}
    </div>
  );
}

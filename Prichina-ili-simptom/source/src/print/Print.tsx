// Printable materials. Card sheets use fixed A4 pages (9 poker-size cards per page) so the
// cut lines always line up; host sheets flow naturally.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ROLES } from '../../shared/content/roles';
import * as RULES from '../../shared/content/rules';
import { activeRounds, isTrainingRound, mixedStatements, planPlaces } from '../../shared/logic';
import {
  CRITERIA, MAX_ROUND_SCORE, SECTORS, TRAP_GROUPS, caseCode, sectorById,
  type CaseCard, type GameState, type Library, type SectorId,
} from '../../shared/types';
import { api, plural } from '../lib/net';
import { CARD_ICON, ROLE_ICON } from '../ui/art';
import { OvalBoard } from '../ui/OvalBoard';
import { boardPath } from '../ui/path';
import { Icon } from '../ui/icons';
import { PRINT_ITEMS } from '../operator/PrintTab';

type Kind = (typeof PRINT_ITEMS)[number]['kind'];

const PAGE_CSS: Record<Kind, string> = {
  poster: '@page { size: A3 landscape; margin: 0 }',
  score: '@page { size: A4 landscape; margin: 0 }',
  host: '@page { size: A4 portrait; margin: 12mm }',
  cases: '@page { size: A4 portrait; margin: 0 }',
  hidden: '@page { size: A4 portrait; margin: 0 }',
  traps: '@page { size: A4 portrait; margin: 0 }',
  roles: '@page { size: A4 portrait; margin: 0 }',
  blank: '@page { size: A4 portrait; margin: 0 }',
  memo: '@page { size: A4 portrait; margin: 0 }',
};

const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
const colorVar = (sector: SectorId) => ({ '--c': sectorById(sector).color }) as CSSProperties;

export default function Print() {
  const params = new URLSearchParams(location.search);
  const kind = (PRINT_ITEMS.some(i => i.kind === params.get('kind')) ? params.get('kind') : 'poster') as Kind;
  const scope = params.get('cases') === 'all' ? 'all' : 'plan';
  const [data, setData] = useState<{ library: Library; game: GameState } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api<Library>('/api/library'), api<GameState>('/api/game')])
      .then(([library, game]) => setData({ library, game }))
      .catch(e => setError((e as Error).message));
  }, []);

  if (error) return <div className="loading">{error}</div>;
  if (!data) return <div className="loading">Готовим страницы…</div>;

  const { library, game } = data;
  const planIds = activeRounds(game).map(r => r.caseId).filter((id): id is string => !!id);
  const cases = scope === 'all' ? library.cases : planIds.map(id => library.cases.find(c => c.id === id)).filter((c): c is CaseCard => !!c);
  const item = PRINT_ITEMS.find(i => i.kind === kind)!;

  return (
    <div className={`print print-${kind}`}>
      <style>{PAGE_CSS[kind]}</style>
      <div className="print-bar">
        <b>{item.title}</b>
        <span>{item.size}{'cases' in item ? ` · ситуаций: ${cases.length}` : ''}</span>
        <button className="btn-primary" onClick={() => window.print()}>Печать</button>
        <span className="muted">Ctrl+P · формат {item.size.split(',')[0]} · без колонтитулов</span>
      </div>
      {kind === 'poster' && <Poster game={game} />}
      {kind === 'cases' && <CaseCards cases={cases} />}
      {kind === 'hidden' && <HiddenCards cases={cases} cost={game.settings.hiddenCost} />}
      {kind === 'traps' && <TrapCards library={library} />}
      {kind === 'roles' && <RoleCards />}
      {kind === 'blank' && <Blank game={game} />}
      {kind === 'memo' && <Memo game={game} />}
      {kind === 'score' && <ScoreSheet game={game} />}
      {kind === 'host' && <HostSheets cases={cases} />}
    </div>
  );
}

function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`page ${className}`}>{children}</section>;
}

// ---------- A3 board ----------

const HOW_TO_PLAY = [
  'Ведущий объявляет ситуацию — она на экране.',
  'Разберите карточки: факты, шум и мнения.',
  'Найдите корневую причину. Нужны данные — купите скрытый факт.',
  'Предложите 3 конкретных действия: срок и ответственный.',
  'Доложите директору — коротко и по делу.',
  'Получите баллы — команды соревнуются в рейтинге.',
];

const CARD_TYPES = [
  { pic: CARD_ICON.situation, title: 'Ситуация', text: 'основная проблема' },
  { pic: CARD_ICON.fact, title: 'Факт', text: 'что точно известно' },
  { pic: CARD_ICON.noise, title: 'Шум', text: 'не влияет на решение' },
  { pic: CARD_ICON.opinion, title: 'Мнение', text: 'чья-то версия, не факт' },
  { pic: CARD_ICON.hidden, title: 'Скрытый факт', text: 'дополнительные данные' },
  { pic: CARD_ICON.trap, title: 'Ловушка', text: 'выпадает внезапно' },
];

const TIPS = [
  'Отделяйте факты от мнений.',
  'Фокусируйтесь на корневой причине, а не на симптоме.',
  'Предлагайте конкретные и реалистичные действия.',
  'Думайте о влиянии на людей, качество, безопасность и результат.',
];

// The oval board as a full A3 poster: board, rules column, team and director zones.
function Poster({ game }: { game: GameState }) {
  const path = boardPath(activeRounds(game).map(r => ({ ...r, phase: 'ready' as const })), -1);
  return (
    <Page className="a3l poster">
      <div className="poster-board"><OvalBoard path={path} animate={false} /></div>
      <aside className="poster-side">
        <div className="poster-title">
          <b>Причина<br />или симптом<em>?</em></b>
          <span>Найди корневую причину. Предложи действие. Получи результат.</span>
        </div>
        <section className="poster-card">
          <h4><Icon name="Trophy" size={15} /> Цель игры</h4>
          <p>Решайте реальные ситуации с производства: находите корневую причину, предлагайте конкретные действия и получайте результат.</p>
          <p className="muted">Развиваем системное мышление, командную работу и управленческие навыки.</p>
        </section>
        <section className="poster-card">
          <h4><Icon name="Dice5" size={15} /> Как играть</h4>
          <ol>{HOW_TO_PLAY.map(s => <li key={s}>{s}</li>)}</ol>
          <p className="muted">Обсуждение — {game.settings.prepMinutes} мин, доклад — {RULES.reportTime(game.settings.reportSeconds)}.{game.settings.trainingFirstCase && ` Первый кейс — тренировка: ${game.settings.trainingPrepMinutes} мин, без зачёта в рейтинг.`}</p>
        </section>
        <section className="poster-card">
          <h4><Icon name="SquareStack" size={15} /> Типы карточек</h4>
          <div className="poster-types">
            {CARD_TYPES.map(t => (
              <div key={t.title}>
                <img src={t.pic} alt="" />
                <p><b>{t.title}</b><small>{t.pic === CARD_ICON.hidden ? `цена: ${RULES.pointsText(game.settings.hiddenCost)}` : t.text}</small></p>
              </div>
            ))}
          </div>
        </section>
        <section className="poster-card">
          <h4><Icon name="Lightbulb" size={15} /> Подсказки</h4>
          <ul>{TIPS.map(t => <li key={t}>{t}</li>)}</ul>
        </section>
      </aside>
      <section className="poster-zone zone-team">
        <h4><Icon name="Users" size={16} /> Зона команды</h4>
        <div className="zone-cols">
          {[['Факты', '', 3], ['Шум', 'не относится к делу', 2], ['Корневая причина', 'одним предложением', 2], ['План действий', 'что, срок, кто', 3]].map(([title, hint, n], i) => (
            <div key={title as string}>
              <b><em>{i + 1}</em>{title}{hint && <small> {hint}</small>}</b>
              {Array.from({ length: n as number }, (_, k) => <i key={k}>{(n as number) > 2 || i === 1 ? k + 1 : ''}</i>)}
            </div>
          ))}
        </div>
      </section>
      <section className="poster-zone zone-director">
        <h4><Icon name="Mic" size={16} /> Зона директора <span><Icon name="Timer" size={15} /> {RULES.reportTime(game.settings.reportSeconds)}</span></h4>
        <div className="zone-lines">
          <b>Причина:</b><i />
          <b>Действия:</b><i className="n1" /><span /><i className="n2" />
        </div>
      </section>
    </Page>
  );
}

// ---------- cards ----------

function CaseCards({ cases }: { cases: CaseCard[] }) {
  return (
    <>
      {cases.map(c => {
        const cards: ReactNode[] = [
          <div key="s" className="card card-situation" style={colorVar(c.sector)}>
            <div className="card-top"><span><Icon name={sectorById(c.sector).icon} size={12} /> Ситуация</span><span>{caseCode(c)}</span></div>
            <div className="card-main"><b>{c.title}</b><p>{c.symptom}</p></div>
            <div className="card-foot">Найди корневую причину</div>
          </div>,
          ...mixedStatements(c).map((text, i) => (
            <div key={i} className="card card-statement" style={colorVar(c.sector)}>
              <div className="card-top"><span>{caseCode(c)}</span><span>{i + 1}</span></div>
              <div className="card-main"><p>{text}</p></div>
            </div>
          )),
        ];
        return chunk(cards, 9).map((page, i) => <Page key={`${c.id}-${i}`} className="a4 card-page">{page}</Page>);
      })}
    </>
  );
}

function HiddenCards({ cases, cost }: { cases: CaseCard[]; cost: number }) {
  const withHidden = cases.filter(c => c.hidden.length + c.hiddenExtra.length > 0);
  if (!withHidden.length) return <div className="loading">В выбранных ситуациях нет скрытых фактов.</div>;
  return (
    <>
      {withHidden.map(c => {
        const cards = [...c.hidden, ...c.hiddenExtra].map((text, i) => (
          <div key={i} className="card card-hidden" style={colorVar(c.sector)}>
            <div className="card-top"><span><Icon name="Lock" size={12} /> Скрытый факт</span><span>{caseCode(c)}</span></div>
            <div className="card-main"><p>{text}</p></div>
            <div className="card-foot">{i >= c.hidden.length ? 'Для сильных команд · ' : ''}стоит {cost} {plural(cost, 'балл', 'балла', 'баллов')}</div>
          </div>
        ));
        return chunk(cards, 9).map((page, i) => <Page key={`${c.id}-${i}`} className="a4 card-page">{page}</Page>);
      })}
    </>
  );
}

function TrapCards({ library }: { library: Library }) {
  const cards = library.traps.map(t => (
    <div key={t.id} className="card card-trap">
      <div className="card-top"><span><Icon name="Zap" size={12} /> Ловушка</span><span>{TRAP_GROUPS[t.group]}</span></div>
      <div className="card-main"><span className="trap-big"><Icon name={t.icon} size={34} /></span><b>{t.title}</b><p>{t.text}</p></div>
    </div>
  ));
  return <>{chunk(cards, 9).map((page, i) => <Page key={i} className="a4 card-page">{page}</Page>)}</>;
}

function RoleCards() {
  const cards = ROLES.map(r => (
    <div key={r.id} className="role-print">
      <div className="role-print-icon">{ROLE_ICON[r.id] ? <img src={ROLE_ICON[r.id]} alt="" /> : <Icon name={r.icon} size={30} />}</div>
      <b>{r.title}</b>
      <p className="role-print-mission">{r.mission}</p>
      <ul>{r.duties.map(d => <li key={d}>{d}</li>)}</ul>
      {r.phrase && <p className="role-print-phrase">{r.phrase}</p>}
    </div>
  ));
  return <>{chunk(cards, 4).map((page, i) => <Page key={i} className="a4 role-page">{page}</Page>)}</>;
}

// ---------- documents ----------

const Lines = ({ n }: { n: number }) => <div className="lines">{Array.from({ length: n }, (_, i) => <i key={i} />)}</div>;

function Blank({ game }: { game: GameState }) {
  return (
    <>
      <Page className="a4 doc">
        <header className="doc-head">
          <div><b>БЛАНК КОМАНДЫ</b><span>«Причина или симптом?»</span></div>
          <div className="doc-fields">
            <span>Команда: <i /></span>
            <span>Раунд №: <i className="short" /></span>
          </div>
          <div className="doc-sectors">Сектор: {SECTORS.filter(s => activeRounds(game).some(r => r.sector === s.id)).map(s => <span key={s.id}>☐ {s.title}</span>)}</div>
        </header>
        <h3><em>1</em> Что произошло? <small>одним предложением</small></h3>
        <Lines n={2} />
        <h3><em>2</em> Отделите факты от шума</h3>
        <div className="two">
          <div><h4>Факты — что точно известно</h4><Lines n={6} /></div>
          <div><h4>Шум и мнения — не влияют на решение</h4><Lines n={6} /></div>
        </div>
        <h3><em>3</em> Симптомы <small>что является следствием проблемы?</small></h3>
        <Lines n={2} />
        <h3><em>4</em> Метод «5 почему»</h3>
        <div className="why">{Array.from({ length: 5 }, (_, i) => <div key={i}><span>Почему?</span><i /></div>)}</div>
      </Page>
      <Page className="a4 doc">
        <h3><em>5</em> Корневая причина <small>одной формулировкой</small></h3>
        <Lines n={2} />
        <p className="doc-hint"><Icon name="Check" size={13} /> объясняет, почему возникла проблема <Icon name="Check" size={13} /> подтверждается фактами <Icon name="X" size={13} /> без предположений</p>
        <h3><em>6</em> План действий</h3>
        <table className="doc-table">
          <thead><tr><th>№</th><th>Действие — конкретное и измеримое</th><th>Срок</th><th>Ответственный</th></tr></thead>
          <tbody>{[1, 2, 3].map(n => <tr key={n}><td>{n}</td><td /><td /><td /></tr>)}</tbody>
        </table>
        <div className="checks">
          {['Мы использовали только факты', 'Мы нашли причину, а не симптом', 'Каждое действие конкретное', 'У каждого действия есть срок и ответственный'].map(t => <span key={t}>☐ {t}</span>)}
        </div>
        <h3><em>7</em> Доклад директору</h3>
        <div className="report-box">
          <div><b>Что произошло?</b><Lines n={1} /></div>
          <div><b>Почему?</b><Lines n={1} /></div>
          <div><b>Что делаем?</b><Lines n={2} /></div>
        </div>
        <div className="doc-bottom">
          <table className="doc-table jury">
            <thead><tr><th>Оценка жюри</th><th>Баллы</th></tr></thead>
            <tbody>
              {CRITERIA.map(c => <tr key={c.id}><td>{c.title}</td><td>/ {c.max}</td></tr>)}
              <tr><td>Скрытые факты и штрафы</td><td>−</td></tr>
              <tr className="sum"><td>Итого</td><td>/ {MAX_ROUND_SCORE}</td></tr>
            </tbody>
          </table>
          <div className="forbidden">
            <b>Запрещённые фразы</b>
            {RULES.FORBIDDEN.map(w => <span key={w}><Icon name="X" size={13} /> {w}</span>)}
          </div>
        </div>
      </Page>
    </>
  );
}

function Memo({ game }: { game: GameState }) {
  const rounds = activeRounds(game);
  const hasFinal = rounds.some(r => r.kind === 'final');
  const lastSector = rounds.filter(r => r.kind === 'regular').at(-1)?.sector;
  return (
    <Page className="a4 doc memo">
      <header className="memo-head">
        <b>ПРИЧИНА ИЛИ СИМПТОМ?</b>
        <span>Памятка команды · {RULES.MOTTO.join(' · ')}</span>
      </header>
      <h3>Как проходит раунд</h3>
      <ol className="memo-steps">{RULES.roundSteps(game.settings).map(s => <li key={s.title}><b>{s.title}.</b> {s.text}</li>)}</ol>
      <div className="two">
        <div>
          <h3>Бланк решения</h3>
          {RULES.BLANK_FIELDS.map(f => <p key={f.title}><b>{f.title}</b> — {f.hint.toLowerCase()}</p>)}
          <h3>Запрещено</h3>
          <p>{RULES.FORBIDDEN.join(' · ')}</p>
          <h3>Хорошо</h3>
          {RULES.GOOD_EXAMPLES.slice(0, 3).map(g => <p key={g} className="good"><Icon name="Check" size={14} /> {g}</p>)}
        </div>
        <div>
          <h3>Очки за раунд</h3>
          {CRITERIA.map(c => <p key={c.id} className="row"><span>{c.title}</span><b>{c.max}</b></p>)}
          <p className="row"><span>Скрытый факт</span><b>−{game.settings.hiddenCost}</b></p>
          <p className="row"><span>Штраф</span><b>−1</b></p>
          <h3>Ловушки</h3>
          <p>Выпадают внезапно: {RULES.TRAP_KINDS.join(', ')}. Пока ведущий читает — время стоит.</p>
          <h3>{hasFinal ? 'Финал «Доклад директору»' : 'Завершение игры'}</h3>
          {hasFinal ? <p>Подготовка — {game.settings.finalPrepMinutes} мин. {RULES.FINAL_ROUND.questions.map(q => `${q.title} — ${q.limit}`).join('; ')}.</p> : <p>{lastSector ? `Последний сектор — «${sectorById(lastSector).title}». ` : ''}После последнего кейса — общий рейтинг и разбор решений.{rounds.some(r => isTrainingRound(game, r)) && ' Тренировка не входит в итог.'}</p>}
        </div>
      </div>
      <h3>Роли</h3>
      <div className="memo-roles">{ROLES.map(r => <p key={r.id}><Icon name={r.icon} size={14} /> <b>{r.title}</b> — {r.mission}</p>)}</div>
    </Page>
  );
}

function ScoreSheet({ game }: { game: GameState }) {
  const rounds = activeRounds(game);
  const places = planPlaces(rounds);
  return (
    <Page className="a4l doc score-sheet">
      <header className="memo-head">
        <b>ТАБЛО · ПОДСЧЁТ ОЧКОВ</b>
        <span>{game.title}</span>
      </header>
      <table className="doc-table score-grid">
        <thead>
          <tr>
            <th>Команда</th>
            {rounds.map((r, i) => (
              <th key={r.id} style={colorVar(r.sector)}>{isTrainingRound(game, r) ? 'Трен.' : r.kind === 'final' ? 'Финал' : `Р${places[i].block}·${places[i].caseInBlock}`}<small>{r.kind === 'final' ? 'доклад' : sectorById(r.sector).title}</small></th>
            ))}
            <th>Итого</th>
          </tr>
        </thead>
        <tbody>
          {game.teams.map(t => (
            <tr key={t.id}><td><i style={{ background: t.color }} />{t.name}</td>{rounds.map(r => <td key={r.id} />)}<td /></tr>
          ))}
        </tbody>
      </table>
      <div className="score-legend">
        {CRITERIA.map(c => <span key={c.id}>{c.title} — <b>{c.max}</b></span>)}
        <span>Скрытый факт — <b>−{game.settings.hiddenCost}</b></span>
        <span>Штраф — <b>−1</b></span>
        {rounds.some(r => isTrainingRound(game, r)) && <span>Тренировка не входит в итог</span>}
      </div>
    </Page>
  );
}

function HostSheets({ cases }: { cases: CaseCard[] }) {
  return (
    <div className="host-sheets">
      {cases.map(c => (
        <section key={c.id} className="host-sheet" style={colorVar(c.sector)}>
          <header>
            <span className="hs-code">{caseCode(c)}</span>
            <span>{sectorById(c.sector).title}</span>
            <span className="hs-secret">Лист ведущего — не показывать игрокам</span>
          </header>
          <h2>{c.title}</h2>
          <p className="hs-symptom">{c.symptom}</p>
          <div className="three">
            <div><h4><Icon name="CircleCheck" size={13} /> Факты</h4><ul>{c.facts.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
            <div><h4><Icon name="Info" size={13} /> Шум</h4><ul>{c.noise.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
            <div><h4><Icon name="MessagesSquare" size={13} /> Мнения</h4><ul>{c.opinions.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
          </div>
          {c.hidden.length + c.hiddenExtra.length > 0 && (
            <>
              <h4><Icon name="Lock" size={13} /> Скрытые факты</h4>
              <ol>{c.hidden.map((t, i) => <li key={i}>{t}</li>)}</ol>
              {c.hiddenExtra.length > 0 && <><h5>Для сильных команд</h5><ol>{c.hiddenExtra.map((t, i) => <li key={i}>{t}</li>)}</ol></>}
            </>
          )}
          {c.wrongAnswers.length > 0 && <><h4><Icon name="X" size={13} /> Типичные ошибки</h4><p>{c.wrongAnswers.join(' · ')}</p></>}
          <div className="hs-answer">
            <h4><Icon name="Target" size={13} /> Корневая причина</h4>
            <p>{c.rootCause}</p>
            {c.systemCause && <><h4>Системная причина</h4><p>{c.systemCause}</p></>}
          </div>
          {c.chain.length > 0 && <><h4>Цепочка</h4><p>{c.chain.join(' → ')}</p></>}
          {c.question && <><h4><Icon name="Lightbulb" size={13} /> Вопрос для сильных команд</h4><p>{c.question}</p></>}
          {c.notes && <><h4>Заметки</h4><p className="pre">{c.notes}</p></>}
        </section>
      ))}
    </div>
  );
}

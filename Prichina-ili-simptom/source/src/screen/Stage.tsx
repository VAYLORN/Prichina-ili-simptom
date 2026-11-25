// Everything the players see, drawn on a fixed 1920×1080 stage. Used by the projector page
// and, scaled down, as the «Экран игроков» preview in the host console.
import type { CSSProperties, ReactNode } from 'react';
import { teamTitle } from '../../shared/flow';
import { remaining } from '../../shared/logic';
import { ROLES } from '../../shared/content/roles';
import * as RULES from '../../shared/content/rules';
import { CRITERIA, MAX_ROUND_SCORE, TRAP_GROUPS, sectorById, type PlanPlace, type PublicRound, type PublicState, type Team, type Timer } from '../../shared/types';
import { clock, plural } from '../lib/net';
import { CARD_ICON, FINAL_ART, ROLE_ICON, SECTOR_ART, SECTOR_ICON } from '../ui/art';
import { TeamBadge } from '../ui/Board';
import { Logo } from '../ui/Brand';
import { Fit } from '../ui/Fit';
import { OvalBoard, SUBTITLES } from '../ui/OvalBoard';
import { Icon } from '../ui/icons';
import { boardPath } from '../ui/path';

const GOLD = '#F5C451';

const teamOf = (state: PublicState, id: string | null) => state.teams.find(t => t.id === id);

const teamName = teamTitle;

function Badge({ state, team, size = 56 }: { state: PublicState; team: Team; size?: number }) {
  return <TeamBadge color={team.color} label={state.teams.indexOf(team) + 1} size={size} />;
}

export const placeText = (p: PlanPlace) => (p.block ? `Раунд ${p.block} · кейс ${p.caseInBlock} из ${p.blockSize}` : 'Финал · Доклад директору');

const accentOf = (r: PublicRound | null) => (!r || r.kind === 'final' ? GOLD : sectorById(r.sector).color);

function GameBoard({ state, onStep }: { state: PublicState; onStep?: () => void }) {
  const path = boardPath(state.rounds, state.round?.index ?? -1);
  return <OvalBoard className="stage-board" path={path} onStep={onStep} />;
}

export function Stage({ state, now, onStep }: { state: PublicState; now: number; onStep?: () => void }) {
  const r = state.round;
  const withBoard = state.view === 'board';
  const splash = state.view === 'welcome' || state.view === 'pause';
  const sectors = [...new Set(state.rounds.filter(r => r.kind === 'regular').map(r => r.sector))].map(sectorById);
  const onCase = state.view === 'round' && r;
  return (
    <div className={`stage view-${state.view} style-oval`} style={{ '--sc': accentOf(r), '--on-sc': !r || r.kind === 'final' ? '#1B1405' : '#fff' } as CSSProperties}>
      <div className="stage-bg" />
      {splash ? (
        <div className={`splash${state.view === 'pause' ? ' is-pause' : ''}`}>
          {state.view === 'pause' ? <Pause state={state} /> : <Welcome state={state} />}
          <div className="splash-photos" style={{ '--sector-count': sectors.length } as CSSProperties}>
            {sectors.map((s, i) => <div key={s.id} className="splash-photo" style={{ '--c': s.color, '--i': i } as CSSProperties}>
              <i style={{ backgroundImage: `url(/theme/hero-${s.id}.jpg)` }} />
              <span><img src={`/theme/icons/sector-${s.id}.webp`} alt="" />{s.title}</span>
            </div>)}
          </div>
        </div>
      ) : withBoard ? (
        <>
          <GameBoard state={state} onStep={onStep} />
          <aside className="stage-side">
            <Standings state={state} />
          </aside>
        </>
      ) : (
        <div className="frame">
          {onCase && <Backdrop round={r} full={r.phase === 'ready'} />}
          <TopBar state={state} />
          <div className="frame-body" key={`${state.view}:${r?.number}:${r?.phase}:${!!r?.statements}:${state.slide}`}>
            {state.view === 'round' && <CaseView state={state} now={now} />}
            {state.view === 'rules' && <Rules state={state} />}
            {state.view === 'roles' && <Roles />}
            {state.view === 'scores' && <ScoreTable state={state} />}
            {state.view === 'debrief' && <Debrief state={state} />}
          </div>
        </div>
      )}
      {r?.trap && <TrapOverlay trap={r.trap} />}
    </div>
  );
}

// The picture of the round behind the case, or across the whole screen for the round intro.
// The cards view fills the screen with text, so it gets a plain glow instead.
function Backdrop({ round, full }: { round: PublicRound; full: boolean }) {
  if (round.statements) return <div className={`backdrop backdrop-glow${full ? ' is-full' : ''}`} />;
  const pic = round.kind === 'final' ? FINAL_ART : SECTOR_ART[round.sector];
  return (
    <div className={`backdrop${full ? ' is-full' : ''}${pic.art ? ' is-art' : ''}`}>
      <img src={pic.src} alt="" style={{ objectPosition: pic.at }} />
      {!pic.art && <i className="backdrop-tint" />}
    </div>
  );
}

function TopBar({ state }: { state: PublicState }) {
  const r = state.view === 'round' ? state.round : null;
  return (
    <header className="topbar">
      <Logo light size={0.86} />
      <Route state={state} />
      <div className="topbar-count">
        {r && (r.kind === 'final' ? <b>Финал</b> : <>Кейс <b>{r.place.caseNumber}</b> из {r.place.caseCount}</>)}
      </div>
    </header>
  );
}

// The game route in miniature: a segment per case, grouped by round, then the final.
function Route({ state }: { state: PublicState }) {
  const blocks = [...new Set(state.rounds.filter(r => r.block).map(r => r.block))];
  const current = state.round?.number;
  const final = state.rounds.find(r => r.kind === 'final');
  return (
    <div className="route">
      {blocks.map(b => {
        const cases = state.rounds.filter(r => r.block === b);
        const s = sectorById(cases[0].sector);
        const active = cases.some(c => c.number === current);
        return (
          <div key={b} className={`route-block${active ? ' is-active' : ''}`} style={{ '--c': s.color } as CSSProperties}>
            <img src={SECTOR_ICON[s.id]} alt="" draggable={false} />
            <span className="route-cells">
              {cases.map(c => <i key={c.number} className={c.phase === 'done' ? 'is-done' : c.number === current ? 'is-now' : ''} />)}
            </span>
          </div>
        );
      })}
      {final && (
        <div className={`route-final${final.number === current ? ' is-active' : ''}${final.phase === 'done' ? ' is-done' : ''}`}>
          <Icon name="Trophy" size={20} />
        </div>
      )}
    </div>
  );
}

// ---------- board layouts ----------

function Welcome({ state }: { state: PublicState }) {
  const custom = state.title !== 'Причина или симптом?';
  const blocks = new Set(state.rounds.filter(r => r.block).map(r => r.block)).size;
  const cases = state.rounds.filter(r => r.kind !== 'final').length;
  return (
    <div className="welcome">
      <span className="kicker">{custom ? state.title : 'Бизнес-игра для руководителей'}</span>
      <h1>
        Причина
        <span>или симптом?</span>
      </h1>
      <p className="tagline">{RULES.TAGLINE}</p>
      <div className="motto">
        {RULES.MOTTO.map(m => <span key={m}>{m}</span>)}
      </div>
      <div className="welcome-facts">
        <div><b>{blocks}</b><span>{plural(blocks, 'раунд', 'раунда', 'раундов')}</span></div>
        <div><b>{cases}</b><span>{plural(cases, 'кейс', 'кейса', 'кейсов')}</span></div>
        {state.rounds.some(r => r.kind === 'final') && <div><b><Icon name="Trophy" size={40} /></b><span>финал</span></div>}
      </div>
      <div className="welcome-teams">
        <span className="kicker kicker-dim">Команды</span>
        {state.teams.map(t => (
          <div key={t.id} className="welcome-team" style={{ '--c': t.color } as CSSProperties}>
            <Badge state={state} team={t} size={48} />
            <b>{teamName(t)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pause({ state }: { state: PublicState }) {
  const done = state.rounds.filter(r => r.phase === 'done').length;
  const rows = [...state.table].sort((a, b) => a.place - b.place || b.total - a.total);
  return <div className="welcome">
    <span className="kicker">Причина или симптом?</span>
    <h1>Перерыв<span>скоро продолжим</span></h1>
    <p className="tagline">{done ? `Сыграно ${done} из ${state.rounds.length} кейсов` : 'Игра скоро начнётся'}</p>
    <div className="welcome-teams">
      {rows.map(row => {
        const team = teamOf(state, row.teamId)!;
        return <div key={team.id} className="welcome-team" style={{ '--c': team.color } as CSSProperties}>
          <Badge state={state} team={team} size={48} /><b>{teamName(team)}</b>{done > 0 && <span className="pause-pts">{row.total}</span>}
        </div>;
      })}
    </div>
  </div>;
}

function Standings({ state }: { state: PublicState }) {
  const done = state.rounds.filter(r => r.phase === 'done');
  const last = done.length ? done[done.length - 1] : null;
  const next = state.round && state.round.phase !== 'done' ? state.rounds[state.round.number - 1] : state.rounds.find(r => r.phase !== 'done');
  const rows = [...state.table].sort((a, b) => a.place - b.place || b.total - a.total);
  const best = Math.max(1, ...rows.map(r => r.total));
  return (
    <div className="standings">
      <Route state={state} />
      <div className="standings-head">
        <span className="kicker">{last ? (last.kind === 'final' ? 'После финала' : `После кейса ${last.caseNumber} из ${last.caseCount}`) : 'Перед стартом'}</span>
        <h2>Рейтинг команд</h2>
      </div>
      <div className={`standings-list rows-${Math.min(rows.length, 8)}`}>
        {rows.map(row => {
          const team = teamOf(state, row.teamId)!;
          const delta = last && !last.training ? row.perRound[last.number - 1] : null;
          return (
            <div key={row.teamId} className={`rank-row${row.place === 1 && row.total > 0 ? ' is-leader' : ''}`} style={{ '--c': team.color } as CSSProperties}>
              <span className="rank-place">{row.place}</span>
              <Badge state={state} team={team} size={50} />
              <div className="rank-main">
                <b>{teamName(team)}</b>
                <span className="rank-bar"><i style={{ width: `${(Math.max(0, row.total) / best) * 100}%` }} /></span>
              </div>
              <div className="rank-score">
                <b>{row.total}</b>
                {delta !== null && delta !== undefined && <span>{delta >= 0 ? '+' : ''}{delta}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {next && <NextUp round={next} />}
    </div>
  );
}

function NextUp({ round }: { round: PublicState['rounds'][number] }) {
  const s = sectorById(round.sector);
  const final = round.kind === 'final';
  const pic = final ? FINAL_ART : SECTOR_ART[round.sector];
  return (
    <div className="next-up" style={{ '--c': final ? GOLD : s.color } as CSSProperties}>
      <div className={`next-thumb${pic.art ? ' is-art' : ''}`}>
        <img src={pic.src} alt="" style={{ objectPosition: final ? '75% 30%' : pic.at }} />
      </div>
      <div>
        <span className="kicker">Дальше</span>
        <b>{final ? 'Финал' : `Раунд ${round.block} · ${s.title}`}</b>
        <span>{round.training ? 'Тренировочный кейс' : final ? 'Доклад директору' : `Кейс ${round.caseInBlock} из ${round.blockSize}`}</span>
      </div>
    </div>
  );
}

// ---------- the case, full screen ----------

function Eyebrow({ round }: { round: PublicRound }) {
  const s = sectorById(round.sector);
  return (
    <div className="eyebrow">
      {round.kind === 'final'
        ? <span className="sector-tag is-final"><Icon name="Trophy" size={28} /> Финал</span>
        : <span className="sector-tag"><img src={SECTOR_ICON[s.id]} alt="" draggable={false} /> {s.title}</span>}
      <span className="eyebrow-text">{round.training ? 'Тренировка · без зачёта в рейтинг' : round.kind === 'final' ? 'Доклад директору' : `Раунд ${round.place.block} · кейс ${round.place.caseInBlock} из ${round.place.blockSize}`}</span>
    </div>
  );
}

// Stopwatch dial: minute ticks around a progress ring, big digits inside.
function Clock({ timer, now, size }: { timer: Timer; now: number; size: number }) {
  const left = remaining(timer, now);
  const share = timer.durationMs > 0 ? left / timer.durationMs : 0;
  const paused = timer.startedAt === null && timer.elapsedMs > 0;
  const idle = timer.startedAt === null && timer.elapsedMs === 0;
  const mode = left === 0 ? 'over' : left <= 30_000 ? 'low' : paused ? 'paused' : 'run';
  const status = left === 0 ? 'Время вышло' : paused ? 'Пауза' : idle ? 'Ждём старта' : 'Осталось';
  const r = 78;
  const length = 2 * Math.PI * r;
  return (
    <div className={`clock clock-${mode}`} style={{ width: size, height: size, '--size': `${size}px` } as CSSProperties}>
      <svg viewBox="0 0 200 200">
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * 2 * Math.PI;
          const major = i % 5 === 0;
          const r1 = major ? 88 : 91;
          return (
            <line key={i} className={i / 60 < share ? 'tick is-on' : 'tick'}
              x1={100 + Math.sin(a) * r1} y1={100 - Math.cos(a) * r1} x2={100 + Math.sin(a) * 97} y2={100 - Math.cos(a) * 97}
              strokeWidth={major ? 2.4 : 1.4} />
          );
        })}
        <circle cx={100} cy={100} r={r} className="clock-track" />
        <circle cx={100} cy={100} r={r} className="clock-bar" strokeDasharray={length} strokeDashoffset={length * (1 - share)} transform="rotate(-90 100 100)" />
      </svg>
      <div className="clock-text">
        <b>{clock(left)}</b>
        <span>{paused ? <><Icon name="Pause" size={18} /> {status}</> : status}</span>
      </div>
    </div>
  );
}

function SideStack({ children }: { children: ReactNode }) {
  return <aside className="case-right">{children}</aside>;
}

function CaseView({ state, now }: { state: PublicState; now: number }) {
  const r = state.round;
  if (!r) return <div className="case-empty"><h2>Скоро начнём</h2></div>;
  if (r.phase === 'ready') return <Intro round={r} />;
  if ((r.phase === 'situation' || r.phase === 'discussion') && r.statements) return <StatementsView state={state} now={now} />;

  if (r.phase === 'situation' || r.phase === 'discussion') {
    return (
      <div className="case">
        <section className="case-left">
          <Eyebrow round={r} />
          <Fit className="case-fit" watch={`${r.number}${r.title}${r.symptom}`}>
            <span className="kicker">Ситуация</span>
            <h1 className="case-title">{r.title}</h1>
            <div className="case-symptom">
              <span>Симптом</span>
              <p>{r.symptom}</p>
            </div>
          </Fit>
          {r.kind === 'final' ? (
            <div className="tiles tiles-2">
              {RULES.FINAL_ROUND.questions.map((q, i) => (
                <div key={q.title} className="tile"><em>{i + 1}</em><div><b>{q.title}</b><span>{q.limit}</span></div></div>
              ))}
            </div>
          ) : (
            <div className="tiles">
              {['Отделите факты от шума', 'Найдите корневую причину', 'Три действия: срок и ответственный'].map((t, i) => (
                <div key={t} className="tile"><em>{i + 1}</em><b>{t}</b></div>
              ))}
            </div>
          )}
        </section>
        <SideStack>
          <span className="clock-label">{state.timer.label}</span>
          <Clock timer={state.timer} now={now} size={470} />
          <Purchases state={state} round={r} />
        </SideStack>
      </div>
    );
  }

  if (r.phase === 'reports') {
    const reporter = teamOf(state, r.reporterId);
    return (
      <div className="case">
        <section className="case-left">
          <Eyebrow round={r} />
          <Fit className="case-fit" watch={`${r.number}${r.title}${r.rootCause}`}>
            <span className="kicker">{r.rootCause ? 'Разбор' : 'Доклад директору'}</span>
            <h1 className="case-title is-small">{r.title}</h1>
            {r.rootCause ? <Answer round={r} /> : (
              <div className="plan">
                {(r.kind === 'final'
                  ? RULES.FINAL_ROUND.questions.map(q => [q.title, q.limit])
                  : RULES.BLANK_FIELDS.map(f => [f.title, f.hint.toLowerCase()])
                ).map(([t, h], i) => <div key={t} className="plan-row"><em>{i + 1}</em><b>{t}</b><span>{h}</span></div>)}
              </div>
            )}
          </Fit>
        </section>
        <SideStack>
          {reporter ? (
            <>
              <div className="reporter" style={{ '--c': reporter.color } as CSSProperties}>
                <Badge state={state} team={reporter} size={112} />
                <div className="reporter-name">
                  <span className="kicker kicker-light">Докладывает</span>
                  <b>{teamName(reporter)}</b>
                </div>
              </div>
              <Clock timer={state.timer} now={now} size={400} />
            </>
          ) : <ReportQueue state={state} round={r} />}
        </SideStack>
      </div>
    );
  }

  // done
  const rows = state.table
    .map(row => ({ team: teamOf(state, row.teamId)!, value: row.perRound[r.number - 1] }))
    .sort((a, b) => (b.value ?? -99) - (a.value ?? -99));
  return (
    <div className="case">
      <section className="case-left">
        <Eyebrow round={r} />
        <Fit className="case-fit" watch={`${r.number}${r.title}${r.rootCause}`}>
          <span className="kicker">Кейс завершён</span>
          <h1 className="case-title is-small">{r.title}</h1>
          {r.rootCause ? <Answer round={r} /> : <div className="case-symptom"><span>Симптом</span><p>{r.symptom}</p></div>}
        </Fit>
      </section>
      <SideStack>
        <div className="glass case-scores">
          <span className="kicker kicker-light">{r.training ? 'Обратная связь · вне рейтинга' : 'Баллы за кейс'}</span>
          {rows.map(({ team, value }) => (
            <div key={team.id} className="score-row" style={{ '--c': team.color } as CSSProperties}>
              <Badge state={state} team={team} size={50} />
              <div className="rank-main">
                <b>{teamName(team)}</b>
                <span className="rank-bar"><i style={{ width: `${(Math.max(0, value ?? 0) / MAX_ROUND_SCORE) * 100}%` }} /></span>
              </div>
              <strong>{value ?? '—'}</strong>
            </div>
          ))}
        </div>
      </SideStack>
    </div>
  );
}

// Round intro over the full-screen photo, shown while the host gets ready.
function Intro({ round }: { round: PublicRound }) {
  const s = sectorById(round.sector);
  if (round.kind === 'final') {
    return (
      <div className="intro">
        <span className="intro-kicker"><Icon name="Trophy" size={30} /> Финал</span>
        <h1 className="intro-title is-final">Доклад директору</h1>
        <p className="intro-sub">Подготовка ответа — {round.discussionMinutes} мин. Два вопроса — и коротко.</p>
      </div>
    );
  }
  // The first case of a round introduces the sector; the next ones only the case number.
  const p = round.place;
  const first = p.caseInBlock === 1;
  const title = first ? s.title : `Кейс ${p.caseInBlock}`;
  return (
    <div className="intro">
      <span className="intro-kicker">{round.training ? 'Тренировочный кейс · без зачёта в рейтинг' : first ? `Раунд ${p.block}` : `Раунд ${p.block} · ${s.title}`}</span>
      <div className="intro-head">
        <img className="intro-pic" src={SECTOR_ICON[s.id]} alt="" draggable={false} />
        <div>
          {/* long sector names («Производство») get a smaller size so they stay on the screen */}
          <h1 className="intro-title" style={{ fontSize: Math.min(168, Math.floor(1340 / (title.length * 0.92))) }}>{title}</h1>
          <p className="intro-sub">{round.training ? `${round.discussionMinutes} минут на обсуждение: каждый может высказаться и задать вопросы` : first ? SUBTITLES[s.id] : `из ${p.blockSize} · всего кейс ${p.caseNumber} из ${p.caseCount}`}</p>
        </div>
      </div>
      <div className="intro-cases">
        {Array.from({ length: p.blockSize }, (_, i) => (
          <span key={i} className={i + 1 === p.caseInBlock ? 'is-now' : i + 1 < p.caseInBlock ? 'is-done' : ''}>Кейс {i + 1}</span>
        ))}
      </div>
    </div>
  );
}

// Before the first report and between reports: who speaks, in this case's order.
function ReportQueue({ state, round }: { state: PublicState; round: PublicRound }) {
  const next = round.reportOrder.find(id => !round.reported.includes(id));
  return (
    <div className="glass queue">
      <span className="kicker kicker-light">{next ? 'Порядок докладов' : 'Все команды доложили'}</span>
      {round.reportOrder.map(id => {
        const t = teamOf(state, id);
        if (!t) return null;
        const done = round.reported.includes(id);
        return (
          <div key={id} className={`queue-row${done ? ' is-done' : id === next ? ' is-next' : ''}`}>
            <Badge state={state} team={t} size={46} />
            <b>{teamName(t)}</b>
            {done ? <Icon name="Check" size={30} /> : id === next && <span className="queue-next">следующие</span>}
          </div>
        );
      })}
    </div>
  );
}

function Answer({ round }: { round: PublicRound }) {
  return (
    <div className="answer">
      <span><Icon name="Target" size={26} /> Корневая причина</span>
      <p>{round.rootCause}</p>
      {round.systemCause && <small>Системная причина: {round.systemCause}</small>}
    </div>
  );
}

function Purchases({ state, round }: { state: PublicState; round: PublicRound }) {
  const bought = state.teams.filter(t => round.purchases[t.id]);
  if (!bought.length) return <div className="purchases" />;
  return (
    <div className="purchases">
      <span><img src={CARD_ICON.hidden} alt="" draggable={false} /> Скрытый факт</span>
      <div>
        {bought.map(t => (
          <span key={t.id} className="purchase">
            <Badge state={state} team={t} size={44} />
            {round.purchases[t.id] > 1 && <small>×{round.purchases[t.id]}</small>}
          </span>
        ))}
      </div>
    </div>
  );
}

function TrapOverlay({ trap }: { trap: NonNullable<PublicRound['trap']> }) {
  return (
    <div className="trap-overlay">
      <div className="trap-card">
        <div className="trap-flag"><span><img src={CARD_ICON.trap} alt="" draggable={false} />Ловушка</span></div>
        <div className="trap-body">
          <div className="trap-icon"><Icon name={trap.icon} size={96} strokeWidth={1.6} /></div>
          <span className="trap-group">{TRAP_GROUPS[trap.group]}</span>
          <h2>{trap.title}</h2>
          <p>{trap.text}</p>
        </div>
        <div className="trap-hold"><Icon name="Pause" size={24} /> Время остановлено, пока ведущий читает карточку</div>
      </div>
    </div>
  );
}

// ---------- full-screen layouts ----------

function StatementsView({ state, now }: { state: PublicState; now: number }) {
  const r = state.round!;
  return (
    <div className="statements-view">
      <div className="statements-head">
        <div className="statements-text">
          <Eyebrow round={r} />
          <h2>{r.title}</h2>
          <p>{r.symptom}</p>
        </div>
        <Clock timer={state.timer} now={now} size={230} />
      </div>
      <Fit className="statements-fit" watch={`${r.number}${r.statements!.length}`}>
        <div className="statements">
          {r.statements!.map((s, i) => <div key={i} className="statement"><em>{i + 1}</em><span>{s}</span></div>)}
        </div>
      </Fit>
    </div>
  );
}

function SlideTop({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="slide-top">
      <span className="kicker">{kicker}</span>
      <h2>{title}</h2>
    </div>
  );
}

function Rules({ state }: { state: PublicState }) {
  const index = state.slide % RULES.RULE_SLIDES.length;
  const id = RULES.RULE_SLIDES[index];
  const hasFinal = state.rounds.some(r => r.kind === 'final');
  const lastSector = state.rounds.filter(r => r.kind === 'regular').at(-1)?.sector;
  return (
    <div className="slide">
      <SlideTop kicker={`Правила · ${index + 1} из ${RULES.RULE_SLIDES.length}`} title={id === 'final' && !hasFinal ? 'Завершение игры' : RULES.RULE_SLIDE_TITLES[id]} />
      {id === 'story' && (
        <div className="slide-story">
          <p className="lead">{RULES.STORY}</p>
          <div className="chain">
            {['Факт', 'Анализ', 'Причина', 'Действие', 'Результат'].map((step, i) => (
              <span key={step}>{i > 0 && <Icon name="ChevronRight" size={44} />}<b className={i === 2 ? 'is-key' : ''}>{step}</b></span>
            ))}
          </div>
          <p className="note">Проблема формулируется одним предложением.</p>
        </div>
      )}
      {id === 'round' && (
        <ol className="steps">
          {RULES.roundSteps(state.settings).map((s, i) => (
            <li key={s.title}>
              <span className="icon-tile"><Icon name={['Presentation', 'SquareStack', 'Timer', 'NotebookPen', 'Mic'][i]} size={40} /></span>
              <em>{i + 1}</em>
              <b>{s.title}</b>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      )}
      {id === 'blank' && (
        <>
          <div className="fields">
            {RULES.BLANK_FIELDS.map((f, i) => (
              <div key={f.title} className="card"><em>{i + 1}</em><b>{f.title}</b><span>{f.hint}</span></div>
            ))}
          </div>
          <p className="note">Бланк заполняет секретарь. Каждое действие — конкретное и измеримое.</p>
        </>
      )}
      {id === 'words' && (
        <div className="two-cols">
          <div className="col-bad">
            <h3><Icon name="X" size={40} /> Запрещено</h3>
            {RULES.FORBIDDEN.map(w => <p key={w}><s>{w}</s></p>)}
          </div>
          <div className="col-good">
            <h3><Icon name="CircleCheck" size={40} /> Так — хорошо</h3>
            {RULES.GOOD_EXAMPLES.map(w => <p key={w}>{w}</p>)}
          </div>
        </div>
      )}
      {id === 'score' && (
        <div className="score-rules">
          <div className="score-list">
            {CRITERIA.map(c => (
              <div key={c.id}><span>{c.title}</span><b>{c.max}</b></div>
            ))}
            <div className="sum"><span>Максимум за кейс</span><b>{MAX_ROUND_SCORE}</b></div>
          </div>
          <div className="minus">
            <div><img src={CARD_ICON.hidden} alt="" draggable={false} /><b>−{state.settings.hiddenCost}</b><span>скрытый факт</span></div>
            <div><Icon name="Ban" size={44} /><b>−1</b><span>штраф</span></div>
            <div><Icon name="Trophy" size={44} /><b>Σ</b><span>{state.rounds.some(r => r.training) ? 'рейтинг — по сумме баллов без тренировочного кейса' : 'рейтинг — по сумме баллов за все кейсы'}</span></div>
          </div>
        </div>
      )}
      {id === 'traps' && (
        <>
          <div className="fields">
            {RULES.TRAP_KINDS.map((k, i) => (
              <div key={k} className="card trap-kind"><span className="icon-tile is-warn"><Icon name={['Timer', 'MicOff', 'Puzzle', 'Drama'][i]} size={48} /></span><b>{k[0].toUpperCase() + k.slice(1)}</b></div>
            ))}
          </div>
          <p className="note">Ловушка выпадает внезапно во время обсуждения. Пока ведущий её читает, время стоит.</p>
        </>
      )}
      {id === 'final' && (hasFinal ? (
        <>
          <p className="lead">«{RULES.FINAL_ROUND.title}». Подготовка — {state.settings.finalPrepMinutes} мин, доклад — {RULES.reportTime(state.settings.reportSeconds)}. Ответьте на два вопроса:</p>
          <div className="fields">
            {RULES.FINAL_ROUND.questions.map((q, i) => <div key={q.title} className="card"><em>{i + 1}</em><b>{q.title}</b><span>{q.limit}</span></div>)}
          </div>
        </>
      ) : (
        <>
          <p className="lead">{lastSector ? `Завершаем кейсы сектора «${sectorById(lastSector).title}», подводим итоги и обсуждаем решения.` : 'Подводим итоги и обсуждаем решения.'}</p>
          <div className="fields">
            <div className="card"><em>1</em><b>Последний кейс</b><span>Обсуждение и доклады по обычным правилам</span></div>
            <div className="card"><em>2</em><b>Общий рейтинг</b><span>{state.rounds.some(r => r.training) ? 'Тренировка не входит в итог' : 'Сумма баллов за сыгранные кейсы'}</span></div>
            <div className="card"><em>3</em><b>Общий разбор</b><span>Что применим в ежедневной работе?</span></div>
          </div>
        </>
      ))}
    </div>
  );
}

function Roles() {
  return (
    <div className="slide">
      <SlideTop kicker="Команда" title="Роли в команде" />
      <div className="roles-grid">
        {ROLES.map(r => (
          <div key={r.id} className="card role-card">
            {ROLE_ICON[r.id]
              ? <img className="role-pic" src={ROLE_ICON[r.id]} alt="" draggable={false} />
              : <span className="icon-tile"><Icon name={r.icon} size={42} /></span>}
            <b>{r.title}</b>
            <span>{r.mission}</span>
          </div>
        ))}
      </div>
      <p className="note">Если людей меньше шести — роли можно совмещать.</p>
    </div>
  );
}

function ScoreTable({ state }: { state: PublicState }) {
  const rows = [...state.table].sort((a, b) => a.place - b.place || b.total - a.total);
  const lastDone = Math.max(-1, ...state.rounds.filter(r => r.phase === 'done').map(r => r.number - 1));
  return (
    <div className="slide">
      <SlideTop kicker="Табло" title="Очки по кейсам" />
      <table className="score-table">
        <thead>
          <tr className="score-blocks">
            <th rowSpan={2} />
            <th rowSpan={2} className="team-col">Команда</th>
            {state.rounds.filter(r => r.kind === 'final' || r.caseInBlock === 1).map(r => (
              r.kind === 'final'
                ? <th key="final" rowSpan={2} className="final-col"><Icon name="Trophy" size={26} /><span>Финал</span></th>
                : (
                  <th key={r.block} colSpan={r.blockSize} style={{ '--c': sectorById(r.sector).color } as CSSProperties}>
                    <img src={SECTOR_ICON[r.sector]} alt="" draggable={false} /> Раунд {r.block}
                  </th>
                )
            ))}
            <th rowSpan={2}>Итого</th>
          </tr>
          <tr>
            {state.rounds.filter(r => r.kind !== 'final').map(r => (
              <th key={r.number} className={`cell${r.number - 1 === lastDone ? ' is-last' : ''}`} style={{ '--c': sectorById(r.sector).color } as CSSProperties}>{r.training ? 'Т' : r.caseNumber}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const team = teamOf(state, row.teamId)!;
            return (
              <tr key={row.teamId} className={row.place === 1 && row.total > 0 ? 'is-leader' : ''}>
                <td className="place">{row.place}</td>
                <td className="team-col"><span><Badge state={state} team={team} size={46} />{teamName(team)}</span></td>
                {row.perRound.map((v, i) => <td key={i} className={`${state.rounds[i]?.kind === 'final' ? 'final-col' : 'cell'}${i === lastDone ? ' is-last' : ''}${v === null ? ' is-empty' : ''}`}>{v ?? '·'}</td>)}
                <td className="total">{row.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {state.rounds.some(r => r.training) && <p className="training-score-note">Т — тренировочный кейс. Оценки помогают разобрать ответ и не входят в итог.</p>}
    </div>
  );
}

function Debrief({ state }: { state: PublicState }) {
  const podium = [...state.table].sort((a, b) => a.place - b.place).slice(0, 3);
  return (
    <div className="debrief">
      <div className="podium">
        <SlideTop kicker="Итоги игры" title="Победители" />
        {podium.map(row => {
          const team = teamOf(state, row.teamId)!;
          return (
            <div key={row.teamId} className={`podium-row place-${row.place}`} style={{ '--c': team.color } as CSSProperties}>
              <em>{row.place === 1 ? <Icon name="Trophy" size={52} /> : row.place}</em>
              <Badge state={state} team={team} size={80} />
              <b>{teamName(team)}</b>
              <span>{row.total}</span>
            </div>
          );
        })}
      </div>
      <div className="questions">
        <SlideTop kicker="Разбор" title="Обсудим" />
        {RULES.DEBRIEF.map((q, i) => <p key={q}><em>{i + 1}</em>{q}</p>)}
      </div>
    </div>
  );
}

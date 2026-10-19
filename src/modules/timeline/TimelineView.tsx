import React, { useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import {
  CalendarEra,
  CalendarMonth,
  MoonCycle,
  TimelineEventCategory,
} from '../../types/worldify';
import {
  dateComponentsToTick,
  formatTickDuration,
  formatTickToDate,
  getTotalDaysPerYear,
} from '../../utils/calendarEngine';
import { resolveEntityTemporalStatus } from '../../utils/spatioTemporalResolver';
import {
  Clock,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  MapPin,
  BookOpen,
  Sparkles,
  Moon,
  Sun,
  Compass,
} from 'lucide-react';

const EVENT_CATEGORY_STYLES: Record<
  TimelineEventCategory,
  { label: string; color: string; bg: string }
> = {
  war_battle: { label: 'War & Battle', color: '#ef4444', bg: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  political_treaty: { label: 'Political & Treaty', color: '#f59e0b', bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  cataclysm: { label: 'Cataclysm & Rift', color: '#a855f7', bg: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  discovery_magic: { label: 'Arcane & Discovery', color: '#38bdf8', bg: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  birth_death: { label: 'Birth / Coronation', color: '#10b981', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  journey: { label: 'Expedition & March', color: '#eab308', bg: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
  story_scene: { label: 'Story Scene', color: '#ec4899', bg: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
};

export const TimelineView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    setCurrentTick,
    addTimelineEvent,
    deleteTimelineEvent,
    updateCalendar,
    selectEntity,
    selectMap,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const [activeTab, setActiveTab] = useState<'timeline' | 'calendar_builder'>('timeline');
  const [categoryFilter, setCategoryFilter] = useState<TimelineEventCategory | 'all'>('all');

  // New Event Modal State
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [evtTitle, setEvtTitle] = useState('');
  const [evtSummary, setEvtSummary] = useState('');
  const [evtCategory, setEvtCategory] = useState<TimelineEventCategory>('political_treaty');
  const [evtImportance, setEvtImportance] = useState<1 | 2 | 3>(2);
  const [evtYear, setEvtYear] = useState<number>(300);
  const [evtMonthIdx, setEvtMonthIdx] = useState<number>(0);
  const [evtDay, setEvtDay] = useState<number>(1);
  const [evtDurationDays, setEvtDurationDays] = useState<number>(1);
  const [evtEntityId, setEvtEntityId] = useState<string>('');
  const [evtMapId, setEvtMapId] = useState<string>('');
  const [evtMapX, setEvtMapX] = useState<number>(500);
  const [evtMapY, setEvtMapY] = useState<number>(500);

  // Calendar Builder Forms
  const [newMonthName, setNewMonthName] = useState('');
  const [newMonthDays, setNewMonthDays] = useState(45);
  const [newMonthSeason, setNewMonthSeason] = useState<CalendarMonth['season']>('Spring');
  const [newMonthIntercalary, setNewMonthIntercalary] = useState(false);

  const [newEraName, setNewEraName] = useState('');
  const [newEraAbbr, setNewEraAbbr] = useState('');
  const [newEraStartYr, setNewEraStartYr] = useState(300);
  const [newEraDesc, setNewEraDesc] = useState('');

  const [newMoonName, setNewMoonName] = useState('');
  const [newMoonPeriod, setNewMoonPeriod] = useState(30);
  const [newMoonColor, setNewMoonColor] = useState('#38bdf8');

  if (!project) return null;
  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];
  if (!calendar) return null;

  const formattedNow = formatTickToDate(calendar, project.currentTick);
  const daysPerYear = getTotalDaysPerYear(calendar);

  const sortedEvents = project.timelineEvents
    .filter((ev) => categoryFilter === 'all' || ev.category === categoryFilter)
    .slice()
    .sort((a, b) => a.startTick - b.startTick);

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!evtTitle.trim()) return;
    const computedStartTick = dateComponentsToTick(
      calendar,
      evtYear,
      evtMonthIdx,
      evtDay
    );
    addTimelineEvent({
      worldId: project.activeWorldId,
      title: evtTitle.trim(),
      summary: evtSummary.trim() || 'Historical milestone.',
      category: evtCategory,
      importance: evtImportance,
      startTick: computedStartTick,
      endTick: evtDurationDays > 1 ? computedStartTick + evtDurationDays : undefined,
      linkedEntityIds: evtEntityId ? [evtEntityId] : [],
      mapId: evtMapId || undefined,
      mapX: evtMapId ? evtMapX : undefined,
      mapY: evtMapId ? evtMapY : undefined,
    });
    setCurrentTick(computedStartTick);
    setEvtTitle('');
    setEvtSummary('');
    setShowAddEvent(false);
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
      {/* Top Sub-Header */}
      <div className="px-6 py-3.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'timeline'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Traversable Chronicle & State Inspector
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('calendar_builder')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'calendar_builder'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              Custom Calendar Designer ({calendar.name})
            </button>
          </div>
        </div>

        {activeTab === 'timeline' && (
          <div className="flex items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as TimelineEventCategory | 'all')
              }
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="all">All Event Categories ({project.timelineEvents.length})</option>
              {Object.entries(EVENT_CATEGORY_STYLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setEvtYear(formattedNow.year);
                setEvtMonthIdx(formattedNow.monthIndex);
                setEvtDay(formattedNow.dayOfMonth);
                setShowAddEvent(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Historical Event
            </button>
          </div>
        )}
      </div>

      {activeTab === 'timeline' ? (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left / Center: Traversable Visual Chronicle & Era Bands */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Era Overview Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {calendar.eras.map((era) => {
                const isCurrentEra = formattedNow.era.id === era.id;
                return (
                  <div
                    key={era.id}
                    onClick={() => setCurrentTick(era.startYear * daysPerYear)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isCurrentEra
                        ? 'bg-slate-900 border-amber-500/60 shadow-lg'
                        : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-xs font-bold"
                        style={{ color: era.color }}
                      >
                        {era.name} [{era.abbreviation}]
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Yr {era.startYear} – {era.endYear ?? 'Present'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {era.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Interactive Timeline Spine */}
            <div className="relative pl-6 border-l-2 border-slate-800 space-y-4">
              {sortedEvents.map((ev) => {
                const evDate = formatTickToDate(calendar, ev.startTick);
                const isAtCursor =
                  Math.abs(project.currentTick - ev.startTick) <= 20 ||
                  (ev.endTick !== undefined &&
                    project.currentTick >= ev.startTick &&
                    project.currentTick <= ev.endTick);

                const catStyle =
                  EVENT_CATEGORY_STYLES[ev.category] ||
                  EVENT_CATEGORY_STYLES.political_treaty;

                const deltaFromCursor = ev.startTick - project.currentTick;

                return (
                  <div
                    key={ev.id}
                    onClick={() => setCurrentTick(ev.startTick)}
                    className={`relative p-4 rounded-xl border transition-all cursor-pointer ${
                      isAtCursor
                        ? 'bg-slate-900 border-amber-500 shadow-xl ring-1 ring-amber-500/30'
                        : 'bg-slate-900/70 border-slate-800/90 hover:border-slate-700'
                    }`}
                  >
                    {/* Timeline Node Dot */}
                    <span
                      className={`absolute -left-[31px] top-5 w-3.5 h-3.5 rounded-full border-2 ${
                        isAtCursor
                          ? 'bg-amber-400 border-slate-950 scale-125'
                          : 'bg-slate-900 border-slate-600'
                      }`}
                    />

                    <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-semibold text-amber-300">
                          {evDate.displayShort}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded border uppercase font-medium ${catStyle.bg}`}
                        >
                          {catStyle.label}
                        </span>
                        {ev.endTick && ev.endTick > ev.startTick && (
                          <span className="text-[10px] text-slate-400">
                            Duration: {formatTickDuration(calendar, ev.endTick - ev.startTick)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-500">
                          {deltaFromCursor === 0
                            ? 'Active Now'
                            : deltaFromCursor > 0
                              ? `In ${formatTickDuration(calendar, deltaFromCursor)}`
                              : `${formatTickDuration(calendar, deltaFromCursor)} ago`}
                        </span>
                        {ev.mapId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentTick(ev.startTick);
                              selectMap(ev.mapId!, true);
                            }}
                            className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[10px] flex items-center gap-1 cursor-pointer"
                          >
                            <MapPin className="w-3 h-3" />
                            View on Map
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTimelineEvent(ev.id);
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-sm font-display font-bold text-slate-100 mb-1">
                      {ev.title}
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed mb-3">
                      {ev.summary}
                    </p>

                    {/* Involved Entities Pills */}
                    {ev.linkedEntityIds.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ev.linkedEntityIds.map((eid) => {
                          const ent = project.entities.find((x) => x.id === eid);
                          if (!ent) return null;
                          return (
                            <button
                              key={eid}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                selectEntity(ent.id, true);
                              }}
                              className="px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-800 text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              <BookOpen className="w-2.5 h-2.5" />
                              {ent.title}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Live World State at Current Timeline Cursor */}
          <aside className="w-full lg:w-96 bg-slate-900 border-l border-slate-800 p-5 overflow-y-auto space-y-5 shrink-0">
            <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  World Cursor State
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  Tick {project.currentTick}
                </span>
              </div>
              <div className="text-sm font-display font-bold text-slate-100">
                {formattedNow.displayFull}
              </div>

              {/* Moon Phases at Current Cursor */}
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2">
                {formattedNow.moonPhases.map((mp) => (
                  <div
                    key={mp.moon.id}
                    className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center gap-2"
                  >
                    <span className="text-lg">{mp.phaseIcon}</span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-200 truncate">
                        {mp.moon.name.split(' ')[0]}
                      </div>
                      <div className="text-[10px] text-slate-400">{mp.phaseName}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Entity Lifespans & Active Positions at Current Cursor */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-display font-semibold uppercase tracking-wider text-slate-200">
                  Entity States at This Date
                </h3>
                <button
                  type="button"
                  onClick={() => selectMap(project.maps[0]?.id || null, true)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <Compass className="w-3 h-3" />
                  See on Map
                </button>
              </div>

              <div className="space-y-2">
                {project.entities.map((ent) => {
                  const status = resolveEntityTemporalStatus(
                    ent,
                    project.currentTick,
                    calendar
                  );
                  return (
                    <div
                      key={ent.id}
                      onClick={() => selectEntity(ent.id, true)}
                      className="p-2.5 rounded-lg bg-slate-950/80 hover:bg-slate-800/70 border border-slate-800 text-xs cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-semibold text-slate-100">
                          {status.activeTitle}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            status.lifecycleState === 'active'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : status.lifecycleState === 'unborn'
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {status.ageYears !== undefined
                            ? `${status.ageYears} yrs`
                            : status.lifecycleState}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {status.activeStatus}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        /* TAB 2: CUSTOM CALENDAR DESIGNER */
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-6xl mx-auto w-full text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div>
              <label className="block text-slate-400 mb-1">Calendar Name</label>
              <input
                type="text"
                value={calendar.name}
                onChange={(e) => updateCalendar(calendar.id, { name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 font-semibold"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Epoch (Year 0) Event</label>
              <input
                type="text"
                value={calendar.epochName}
                onChange={(e) =>
                  updateCalendar(calendar.id, { epochName: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                Weekdays (Comma-separated • {calendar.weekdays.length} days/week)
              </label>
              <input
                type="text"
                value={calendar.weekdays.join(', ')}
                onChange={(e) =>
                  updateCalendar(calendar.id, {
                    weekdays: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Months & Intercalary Festivals */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-display font-semibold text-slate-100 flex items-center gap-1.5">
                  <Sun className="w-4 h-4 text-amber-400" />
                  Months & Festivals ({daysPerYear} days/yr)
                </h3>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {calendar.months.map((m, idx) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">
                        {idx + 1}. {m.name}{' '}
                        {m.intercalary && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 ml-1">
                            Intercalary
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {m.days} days • Season: {m.season}
                      </div>
                    </div>
                    {calendar.months.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          updateCalendar(calendar.id, {
                            months: calendar.months.filter((x) => x.id !== m.id),
                          })
                        }
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newMonthName.trim()) return;
                  const nextMonth: CalendarMonth = {
                    id: `m-${Date.now()}`,
                    name: newMonthName.trim(),
                    days: Math.max(1, newMonthDays),
                    season: newMonthSeason,
                    intercalary: newMonthIntercalary,
                  };
                  updateCalendar(calendar.id, {
                    months: [...calendar.months, nextMonth],
                  });
                  setNewMonthName('');
                }}
                className="pt-3 border-t border-slate-800 space-y-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={newMonthName}
                    onChange={(e) => setNewMonthName(e.target.value)}
                    placeholder="Month / Festival name"
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={newMonthDays}
                    onChange={(e) => setNewMonthDays(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={newMonthSeason}
                    onChange={(e) =>
                      setNewMonthSeason(e.target.value as CalendarMonth['season'])
                    }
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
                  >
                    <option value="Spring">Spring</option>
                    <option value="Summer">Summer</option>
                    <option value="Autumn">Autumn</option>
                    <option value="Winter">Winter</option>
                    <option value="Eclipse">Eclipse</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newMonthIntercalary}
                      onChange={(e) => setNewMonthIntercalary(e.target.checked)}
                      className="accent-amber-500"
                    />
                    Intercalary
                  </label>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold cursor-pointer"
                  >
                    + Add
                  </button>
                </div>
              </form>
            </div>

            {/* Historical Eras */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-display font-semibold text-slate-100 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-sky-400" />
                Historical Eras ({calendar.eras.length})
              </h3>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {calendar.eras.map((era) => (
                  <div
                    key={era.id}
                    className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold" style={{ color: era.color }}>
                        {era.name} ({era.abbreviation})
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Start Yr: {era.startYear}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{era.description}</p>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newEraName.trim() || !newEraAbbr.trim()) return;
                  const nextEra: CalendarEra = {
                    id: `era-${Date.now()}`,
                    name: newEraName.trim(),
                    abbreviation: newEraAbbr.trim(),
                    startYear: newEraStartYr,
                    color: '#38bdf8',
                    description: newEraDesc.trim() || 'New historical epoch.',
                  };
                  updateCalendar(calendar.id, {
                    eras: [...calendar.eras, nextEra],
                  });
                  setNewEraName('');
                  setNewEraAbbr('');
                  setNewEraDesc('');
                }}
                className="pt-3 border-t border-slate-800 space-y-2"
              >
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    value={newEraName}
                    onChange={(e) => setNewEraName(e.target.value)}
                    placeholder="Era Name"
                    className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                  <input
                    type="text"
                    required
                    value={newEraAbbr}
                    onChange={(e) => setNewEraAbbr(e.target.value)}
                    placeholder="Abbr (4A)"
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    value={newEraStartYr}
                    onChange={(e) => setNewEraStartYr(Number(e.target.value))}
                    placeholder="Start Yr"
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                  <input
                    type="text"
                    value={newEraDesc}
                    onChange={(e) => setNewEraDesc(e.target.value)}
                    placeholder="Description..."
                    className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-1.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 font-semibold cursor-pointer"
                >
                  + Add Historical Era
                </button>
              </form>
            </div>

            {/* Celestial Moons & Orbital Cycles */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-display font-semibold text-slate-100 flex items-center gap-1.5">
                <Moon className="w-4 h-4 text-purple-400" />
                Celestial Moons ({calendar.moons.length})
              </h3>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {formattedNow.moonPhases.map(({ moon, phaseName, phaseIcon }) => (
                  <div
                    key={moon.id}
                    className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{phaseIcon}</span>
                      <div>
                        <div className="font-semibold text-slate-200">{moon.name}</div>
                        <div className="text-[10px] text-slate-400">
                          Cycle: {moon.periodDays} days • Now: {phaseName}
                        </div>
                      </div>
                    </div>
                    {calendar.moons.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          updateCalendar(calendar.id, {
                            moons: calendar.moons.filter((m) => m.id !== moon.id),
                          })
                        }
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newMoonName.trim()) return;
                  const nextMoon: MoonCycle = {
                    id: `moon-${Date.now()}`,
                    name: newMoonName.trim(),
                    periodDays: Math.max(2, newMoonPeriod),
                    phaseOffsetDays: 0,
                    color: newMoonColor,
                  };
                  updateCalendar(calendar.id, {
                    moons: [...calendar.moons, nextMoon],
                  });
                  setNewMoonName('');
                }}
                className="pt-3 border-t border-slate-800 space-y-2"
              >
                <input
                  type="text"
                  required
                  value={newMoonName}
                  onChange={(e) => setNewMoonName(e.target.value)}
                  placeholder="Moon Name (e.g., Lunaris)"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      Orbital Period (Days)
                    </label>
                    <input
                      type="number"
                      min={2}
                      value={newMoonPeriod}
                      onChange={(e) => setNewMoonPeriod(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      Color
                    </label>
                    <input
                      type="color"
                      value={newMoonColor}
                      onChange={(e) => setNewMoonColor(e.target.value)}
                      className="w-full h-8 bg-slate-950 border border-slate-700 rounded p-0.5"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 font-semibold cursor-pointer"
                >
                  + Add Celestial Moon
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Timeline Event Modal */}
      {showAddEvent && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateEvent}
            className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-base font-display font-semibold text-slate-100">
              Record Canonical Timeline Event
            </h3>
            <div>
              <label className="block text-slate-300 mb-1">Event Title *</label>
              <input
                type="text"
                required
                value={evtTitle}
                onChange={(e) => setEvtTitle(e.target.value)}
                placeholder="e.g., The Siege of Sun-Spire"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-slate-300 mb-1">Epoch Year</label>
                <input
                  type="number"
                  value={evtYear}
                  onChange={(e) => setEvtYear(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Custom Month</label>
                <select
                  value={evtMonthIdx}
                  onChange={(e) => setEvtMonthIdx(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                >
                  {calendar.months.map((m, idx) => (
                    <option key={m.id} value={idx}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Day of Month</label>
                <input
                  type="number"
                  min={1}
                  max={calendar.months[evtMonthIdx]?.days || 45}
                  value={evtDay}
                  onChange={(e) => setEvtDay(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-slate-300 mb-1">Category</label>
                <select
                  value={evtCategory}
                  onChange={(e) =>
                    setEvtCategory(e.target.value as TimelineEventCategory)
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                >
                  {Object.entries(EVENT_CATEGORY_STYLES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Duration (Days)</label>
                <input
                  type="number"
                  min={1}
                  value={evtDurationDays}
                  onChange={(e) => setEvtDurationDays(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Primary Entity</label>
                <select
                  value={evtEntityId}
                  onChange={(e) => setEvtEntityId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                >
                  <option value="">— Optional —</option>
                  {project.entities.map((en) => (
                    <option key={en.id} value={en.id}>
                      {en.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-slate-300 mb-1">Pin to Map</label>
                <select
                  value={evtMapId}
                  onChange={(e) => setEvtMapId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                >
                  <option value="">— No Map Pin —</option>
                  {project.maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Map X (0-1000)</label>
                <input
                  type="number"
                  disabled={!evtMapId}
                  value={evtMapX}
                  onChange={(e) => setEvtMapX(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100 disabled:opacity-40"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Map Y (0-1000)</label>
                <input
                  type="number"
                  disabled={!evtMapId}
                  value={evtMapY}
                  onChange={(e) => setEvtMapY(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100 disabled:opacity-40"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Historical Summary</label>
              <textarea
                rows={3}
                value={evtSummary}
                onChange={(e) => setEvtSummary(e.target.value)}
                placeholder="Describe what transpired and its consequences..."
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddEvent(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold cursor-pointer"
              >
                Add to Timeline
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

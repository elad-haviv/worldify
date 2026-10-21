import React, { useEffect, useState } from 'react';
import { useWorldifyStore } from '../store/useWorldifyStore';
import { formatTickToDate, getTotalDaysPerYear } from '../utils/calendarEngine';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Calendar,
  Sparkles,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

export const GlobalTimelineBar: React.FC = () => {
  const {
    projects,
    activeProjectId,
    setCurrentTick,
    stepCurrentTick,
    setActiveModule,
    setActiveCalendar,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedDaysPerStep, setSpeedDaysPerStep] = useState<number>(3);
  const [showCalendarMenu, setShowCalendarMenu] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      stepCurrentTick(speedDaysPerStep);
    }, 120);
    return () => clearInterval(timer);
  }, [isPlaying, speedDaysPerStep, stepCurrentTick]);

  if (!project) return null;
  const calendar = project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];
  if (!calendar) return null;

  const formatted = formatTickToDate(calendar, project.currentTick);
  const daysPerYear = getTotalDaysPerYear(calendar);

  // Determine slider bounds from project events & keyframes
  const eventTicks = project.timelineEvents.map((e) => e.startTick);
  const minEventTick = eventTicks.length > 0 ? Math.min(...eventTicks) - daysPerYear * 2 : project.currentTick - daysPerYear * 10;
  const maxEventTick = eventTicks.length > 0 ? Math.max(...eventTicks) + daysPerYear * 2 : project.currentTick + daysPerYear * 10;

  const sliderMin = Math.min(minEventTick, project.currentTick - daysPerYear);
  const sliderMax = Math.max(maxEventTick, project.currentTick + daysPerYear);

  // Find active or nearest event at currentTick
  const activeEvent = project.timelineEvents.find(
    (ev) =>
      project.currentTick >= ev.startTick - 15 &&
      project.currentTick <= (ev.endTick ?? ev.startTick) + 15
  );

  return (
    <div className="h-14 shrink-0 bg-slate-900 border-t border-slate-800 px-5 flex items-center justify-between gap-5 select-none z-30">
      {/* Left: Current Custom Calendar Date & Era + Calendar Switcher */}
      <div className="relative flex items-center gap-2 min-w-0 shrink-0">
        <button
          type="button"
          onClick={() => setActiveModule('timeline')}
          className="flex items-center gap-2 px-3 h-9 rounded-lg text-amber-200 hover:bg-slate-800 transition-colors cursor-pointer"
          title={`Open timeline — ${calendar.name}`}
        >
          <Calendar className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold">{formatted.displayShort}</span>
        </button>

        {project.calendars.length > 1 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCalendarMenu((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-300 hover:text-amber-300 hover:border-slate-700 cursor-pointer"
              title="Switch calendar / view comparative dates"
            >
              <span className="max-w-[90px] truncate">{calendar.name}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showCalendarMenu && (
              <div
                className="absolute bottom-11 left-0 w-72 bg-slate-900 border border-slate-700 rounded-xl p-2 shadow-2xl z-50 space-y-1.5"
                onMouseLeave={() => setShowCalendarMenu(false)}
              >
                <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Project Calendars ({project.calendars.length})
                </div>
                {project.calendars.map((cal) => {
                  const isSelected = cal.id === calendar.id;
                  const calFormatted = formatTickToDate(cal, project.currentTick);
                  return (
                    <button
                      key={cal.id}
                      type="button"
                      onClick={() => {
                        setActiveCalendar(cal.id);
                        setShowCalendarMenu(false);
                      }}
                      className={`w-full text-left p-2 rounded-lg transition-all cursor-pointer flex flex-col gap-0.5 ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate">{cal.name}</span>
                        {isSelected && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-bold">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-normal truncate">
                        {calFormatted.displayShort}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="hidden 2xl:flex items-center gap-2 text-sm text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: formatted.era.color }} />
            {formatted.era.name}
          </span>
          <span>•</span>
          <span>{formatted.month.season}</span>
        </div>
      </div>

      {/* Center: Transport Controls + Interactive Scrubber */}
      <div className="flex-1 min-w-[280px] flex items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1">
          <button
            type="button"
            onClick={() => stepCurrentTick(-daysPerYear)}
            title="Step Back 1 Year"
            className="px-1.5 py-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 text-xs font-medium cursor-pointer"
          >
            -1Y
          </button>
          <button
            type="button"
            onClick={() => stepCurrentTick(-10)}
            title="Step Back 10 Days"
            className="px-1.5 py-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 cursor-pointer"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Pause World Clock' : 'Animate World Clock (Moves Entities & Borders on Map)'}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              isPlaying
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-amber-400 hover:bg-slate-800'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => stepCurrentTick(10)}
            title="Step Forward 10 Days"
            className="px-1.5 py-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 cursor-pointer"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => stepCurrentTick(daysPerYear)}
            title="Step Forward 1 Year"
            className="px-1.5 py-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 text-xs font-medium cursor-pointer"
          >
            +1Y
          </button>
          <select
            value={speedDaysPerStep}
            onChange={(e) => setSpeedDaysPerStep(Number(e.target.value))}
            className="bg-transparent text-xs text-slate-400 px-1 py-0.5 focus:outline-none cursor-pointer"
            title="Simulation Speed"
          >
            <option value={1} className="bg-slate-900">1x (Daily)</option>
            <option value={3} className="bg-slate-900">3x (Envoy)</option>
            <option value={15} className="bg-slate-900">15x (Monthly)</option>
            <option value={90} className="bg-slate-900">90x (Seasonal)</option>
          </select>
        </div>

        {/* Scrubber Track with Event Pips */}
        <div className="relative flex-1 flex items-center">
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            value={project.currentTick}
            onChange={(e) => setCurrentTick(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          {/* Event markers along slider */}
          <div className="pointer-events-none absolute inset-x-0 -top-1.5 flex items-center">
            {project.timelineEvents.map((ev) => {
              const pct = ((ev.startTick - sliderMin) / Math.max(1, sliderMax - sliderMin)) * 100;
              if (pct < 0 || pct > 100) return null;
              return (
                <div
                  key={ev.id}
                  style={{ left: `${pct}%` }}
                  className="absolute w-1.5 h-1.5 rounded-full bg-slate-400 ring-2 ring-slate-900"
                  title={ev.title}
                />
              );
            })}
          </div>
        </div>

        {/* Active Event Pill */}
        {activeEvent && (
          <button
            type="button"
            onClick={() => setActiveModule('timeline')}
            className="hidden xl:flex items-center gap-1.5 px-3 h-8 rounded-lg text-slate-200 text-sm truncate max-w-[260px] cursor-pointer hover:bg-slate-800"
            title={activeEvent.summary}
          >
            <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="truncate">{activeEvent.title}</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-slate-500" />
          </button>
        )}
      </div>

      {/* Right: Celestial Moons & Tick Counter */}
      <div className="flex items-center gap-3">
        <div className="hidden 2xl:flex items-center gap-3">
          {formatted.moonPhases.map((mp) => (
            <div
              key={mp.moon.id}
              className="flex items-center gap-1.5 text-sm"
              title={`${mp.moon.name}: ${mp.phaseName} (${mp.moon.periodDays}-day cycle)`}
            >
              <span>{mp.phaseIcon}</span>
              <span className="text-sm text-slate-400">
                {mp.moon.name.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

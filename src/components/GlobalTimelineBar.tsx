import React, { useEffect, useState } from 'react';
import { useWorldifyStore } from '../store/useWorldifyStore';
import { formatTickToDate, getTotalDaysPerYear } from '../utils/calendarEngine';
import {
  Clock,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Calendar,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

export const GlobalTimelineBar: React.FC = () => {
  const {
    projects,
    activeProjectId,
    setCurrentTick,
    stepCurrentTick,
    setActiveModule,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedDaysPerStep, setSpeedDaysPerStep] = useState<number>(3);

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
    <div className="h-12 bg-slate-900/95 border-t border-slate-800 px-4 flex items-center justify-between gap-4 select-none z-30">
      {/* Left: Current Custom Calendar Date & Era */}
      <div className="flex items-center gap-3 min-w-[290px]">
        <button
          type="button"
          onClick={() => setActiveModule('timeline')}
          className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
          title="Open Full Traversable Timeline & Custom Calendar Studio"
        >
          <Calendar className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-semibold">{formatted.displayShort}</span>
        </button>

        <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-400">
          <span
            className="px-1.5 py-0.5 rounded font-medium text-xs"
            style={{
              backgroundColor: `${formatted.era.color}22`,
              color: formatted.era.color,
              border: `1px solid ${formatted.era.color}55`,
            }}
          >
            {formatted.era.name}
          </span>
          <span>•</span>
          <span>{formatted.month.season}</span>
        </div>
      </div>

      {/* Center: Transport Controls + Interactive Scrubber */}
      <div className="flex-1 max-w-2xl flex items-center gap-2.5">
        <div className="flex items-center gap-1 bg-slate-950/90 border border-slate-800 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => stepCurrentTick(-daysPerYear)}
            title="Step Back 1 Year"
            className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 text-xs font-mono cursor-pointer"
          >
            -1Y
          </button>
          <button
            type="button"
            onClick={() => stepCurrentTick(-10)}
            title="Step Back 10 Days"
            className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 cursor-pointer"
          >
            <SkipBack className="w-3.5 h-3.5" />
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
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => stepCurrentTick(10)}
            title="Step Forward 10 Days"
            className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 cursor-pointer"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => stepCurrentTick(daysPerYear)}
            title="Step Forward 1 Year"
            className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 text-xs font-mono cursor-pointer"
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
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
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
                  className="absolute w-1.5 h-1.5 rounded-full bg-sky-400 ring-2 ring-slate-950"
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
            className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/40 text-sky-300 text-xs truncate max-w-[210px] cursor-pointer hover:bg-sky-500/25"
            title={activeEvent.summary}
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="truncate">{activeEvent.title}</span>
            <ChevronRight className="w-3 h-3 shrink-0" />
          </button>
        )}
      </div>

      {/* Right: Celestial Moons & Tick Counter */}
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2.5">
          {formatted.moonPhases.map((mp) => (
            <div
              key={mp.moon.id}
              className="flex items-center gap-1 text-xs bg-slate-950/80 border border-slate-800 px-2 py-0.5 rounded"
              title={`${mp.moon.name}: ${mp.phaseName} (${mp.moon.periodDays}-day cycle)`}
            >
              <span>{mp.phaseIcon}</span>
              <span className="text-xs text-slate-300 font-medium">
                {mp.moon.name.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs font-mono text-slate-500">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>T:{project.currentTick}</span>
        </div>
      </div>
    </div>
  );
};

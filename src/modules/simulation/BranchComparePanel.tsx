import React, { useMemo, useState } from 'react';
import {
  BranchOverlayRecord,
  Project,
  SimBranch,
  TimelineEvent,
} from '../../types/worldify';
import {
  buildBranchWorldView,
  detectCanonContradictionsForMerge,
  resolveEntityTemporalStatus,
} from '../../utils/spatioTemporalResolver';
import { formatTickToDate } from '../../utils/calendarEngine';
import {
  GitCompare,
  GitMerge,
  AlertTriangle,
  CheckSquare,
  Square,
  CheckCircle2,
  Sparkles,
  ArrowLeftRight,
} from 'lucide-react';

interface BranchComparePanelProps {
  canonProject: Project;
  activeBranch: SimBranch;
  branches: SimBranch[];
  allBranchEvents: TimelineEvent[];
  allBranchOverlays: BranchOverlayRecord[];
  onMergeEventsToCanon: (eventsToMerge: TimelineEvent[], markBranchMerged?: boolean) => Promise<void>;
}

export const BranchComparePanel: React.FC<BranchComparePanelProps> = ({
  canonProject,
  activeBranch,
  branches,
  allBranchEvents,
  allBranchOverlays,
  onMergeEventsToCanon,
}) => {
  const [leftSourceId, setLeftSourceId] = useState<string>(activeBranch.id);
  const [rightSourceId, setRightSourceId] = useState<string>('canon');
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [isMerging, setIsMerging] = useState(false);

  const calendar =
    canonProject.calendars.find((c) => c.id === canonProject.activeCalendarId) ||
    canonProject.calendars[0];

  const leftBranch = branches.find((b) => b.id === leftSourceId) || activeBranch;
  const rightBranch =
    rightSourceId === 'canon' ? null : branches.find((b) => b.id === rightSourceId) || null;

  const leftEvents = useMemo(() => {
    if (!leftBranch) {
      return canonProject.timelineEvents.filter((e) => !e.branchId);
    }
    return allBranchEvents
      .filter((e) => e.branchId === leftBranch.id)
      .sort((a, b) => a.startTick - b.startTick);
  }, [leftBranch, allBranchEvents, canonProject.timelineEvents]);

  const rightEvents = useMemo(() => {
    if (!rightBranch) {
      return canonProject.timelineEvents
        .filter((e) => !e.branchId && e.startTick >= (leftBranch?.forkedAtTick ?? 0))
        .sort((a, b) => a.startTick - b.startTick);
    }
    return allBranchEvents
      .filter((e) => e.branchId === rightBranch.id)
      .sort((a, b) => a.startTick - b.startTick);
  }, [rightBranch, leftBranch, allBranchEvents, canonProject.timelineEvents]);

  // Compute character fate diffs between Left and Right views
  const characterFateDiffs = useMemo(() => {
    const leftView = buildBranchWorldView(
      canonProject,
      leftBranch,
      branches,
      allBranchEvents,
      allBranchOverlays
    );
    const rightView = buildBranchWorldView(
      canonProject,
      rightBranch,
      branches,
      allBranchEvents,
      allBranchOverlays
    );
    const compareTick = Math.max(
      leftBranch?.currentTick ?? canonProject.currentTick,
      rightBranch?.currentTick ?? canonProject.currentTick
    );

    const diffs: Array<{
      entityId: string;
      title: string;
      leftStatus: string;
      rightStatus: string;
    }> = [];

    for (const ent of canonProject.entities.filter((e) => e.category === 'character')) {
      const lEnt = leftView.entities.find((e) => e.id === ent.id) || ent;
      const rEnt = rightView.entities.find((e) => e.id === ent.id) || ent;
      const lSt = resolveEntityTemporalStatus(lEnt, compareTick, calendar);
      const rSt = resolveEntityTemporalStatus(rEnt, compareTick, calendar);

      if (lSt.activeStatus !== rSt.activeStatus || lSt.activeTitle !== rSt.activeTitle) {
        diffs.push({
          entityId: ent.id,
          title: ent.title,
          leftStatus: `${lSt.activeTitle} — ${lSt.activeStatus}`,
          rightStatus: `${rSt.activeTitle} — ${rSt.activeStatus}`,
        });
      }
    }
    return diffs;
  }, [canonProject, leftBranch, rightBranch, branches, allBranchEvents, allBranchOverlays, calendar]);

  const toggleSelectEvent = (id: string) => {
    const next = new Set(selectedEventIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEventIds(next);
  };

  const selectAllLeftEvents = () => {
    if (selectedEventIds.size === leftEvents.length) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(leftEvents.map((e) => e.id)));
    }
  };

  const handlePartialMerge = async () => {
    const toMerge = leftEvents.filter((e) => selectedEventIds.has(e.id));
    if (toMerge.length === 0) return;
    setIsMerging(true);
    try {
      await onMergeEventsToCanon(toMerge, false);
      setSelectedEventIds(new Set());
    } finally {
      setIsMerging(false);
    }
  };

  const handleFullBranchMerge = async () => {
    if (leftEvents.length === 0) return;
    setIsMerging(true);
    try {
      await onMergeEventsToCanon(leftEvents, true);
      setSelectedEventIds(new Set());
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div dir="ltr" className="flex-1 min-h-0 flex flex-col bg-slate-950 overflow-hidden">
      {/* Top Comparison Controls & Merge Bar */}
      <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <GitCompare className="w-5 h-5" />
            <span>Branch Comparison &amp; Canon Merge</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <span className="text-slate-400">Source branch (left):</span>
            <select
              value={leftSourceId}
              onChange={(e) => {
                setLeftSourceId(e.target.value);
                setSelectedEventIds(new Set());
              }}
              className="bg-transparent text-emerald-300 font-bold focus:outline-none cursor-pointer"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id} className="bg-slate-900 text-slate-100">
                  {b.name} (Tick {b.currentTick})
                </option>
              ))}
            </select>

            <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500 mx-1" />

            <span className="text-slate-400">Against (right):</span>
            <select
              value={rightSourceId}
              onChange={(e) => setRightSourceId(e.target.value)}
              className="bg-transparent text-amber-300 font-bold focus:outline-none cursor-pointer"
            >
              <option value="canon" className="bg-slate-900 text-amber-300">
                ★ Main Canon (Canon)
              </option>
              {branches
                .filter((b) => b.id !== leftSourceId)
                .map((b) => (
                  <option key={b.id} value={b.id} className="bg-slate-900 text-slate-100">
                    {b.name} (Tick {b.currentTick})
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Merge Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={selectAllLeftEvents}
            className="px-3 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 cursor-pointer"
          >
            {selectedEventIds.size === leftEvents.length && leftEvents.length > 0
              ? 'Deselect all'
              : `Select all (${leftEvents.length})`}
          </button>

          <button
            type="button"
            disabled={selectedEventIds.size === 0 || isMerging}
            onClick={handlePartialMerge}
            className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <GitMerge className="w-4 h-4" />
            <span>Merge selected ({selectedEventIds.size}) into canon</span>
          </button>

          <button
            type="button"
            disabled={leftEvents.length === 0 || isMerging}
            onClick={handleFullBranchMerge}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Merge entire branch into canon</span>
          </button>
        </div>
      </div>

      {/* Character State Diffs Banner */}
      {characterFateDiffs.length > 0 && (
        <div className="px-6 py-3 bg-slate-900/60 border-b border-slate-800 flex items-center gap-3 overflow-x-auto">
          <span className="text-xs font-bold text-amber-300 shrink-0">
            Character state differences between the two branches ({characterFateDiffs.length}):
          </span>
          <div className="flex items-center gap-2">
            {characterFateDiffs.map((d) => (
              <div
                key={d.entityId}
                className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs flex items-center gap-2 shrink-0"
              >
                <strong className="text-slate-100">{d.title}:</strong>
                <span className="text-emerald-300">{d.leftStatus}</span>
                <span className="text-slate-600">≠</span>
                <span className="text-amber-300">{d.rightStatus}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parallel Timelines Columns */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-800 overflow-hidden">
        {/* Right Column (in RTL): Source Branch Events with Checkboxes & Canon Contradiction Alerts */}
        <div className="flex flex-col h-full min-h-0 bg-slate-950">
          <div className="px-5 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <h3 className="text-sm font-bold text-slate-100">
                Branch events: {leftBranch?.name} ({leftEvents.length} events)
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              Forked at tick {leftBranch?.forkedAtTick} · now at tick {leftBranch?.currentTick}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {leftEvents.length === 0 ? (
              <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                No events created in this branch yet. Click "Run Tick" to advance the world.
              </div>
            ) : (
              leftEvents.map((ev) => {
                const isSelected = selectedEventIds.has(ev.id);
                const contradictions = detectCanonContradictionsForMerge(canonProject, ev);
                const dateStr = calendar
                  ? formatTickToDate(calendar, ev.startTick).displayShort
                  : `Tick ${ev.startTick}`;

                return (
                  <div
                    key={ev.id}
                    onClick={() => toggleSelectEvent(ev.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                      contradictions.length > 0
                        ? 'bg-rose-950/25 border-rose-500/50 hover:border-rose-400'
                        : isSelected
                          ? 'bg-emerald-950/30 border-emerald-500/60'
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 shrink-0" />
                        )}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-emerald-400">{dateStr}</span>
                            <span className="text-sm font-bold text-slate-100">{ev.title}</span>
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-amber-300 shrink-0">
                        Importance {ev.importance}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed pr-6">{ev.summary}</p>

                    {/* Red Contradiction Alert if merging this event conflicts with Canon! */}
                    {contradictions.length > 0 && (
                      <div className="mr-6 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Canon contradiction warning (merge checks for conflicts):</span>
                        </div>
                        {contradictions.map((c, idx) => (
                          <p key={idx} className="text-xs text-rose-200/90 pr-5">
                            • {c}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Left Column (in RTL): Comparison Target (Canon or Branch B) */}
        <div className="flex flex-col h-full min-h-0 bg-slate-950/60">
          <div className="px-5 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <h3 className="text-sm font-bold text-slate-100">
                {rightBranch ? `Parallel branch: ${rightBranch.name}` : '★ Worldify Main Canon'} (
                {rightEvents.length} events in range)
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              {rightBranch ? `Tick ${rightBranch.currentTick}` : 'The canonical source of truth'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {rightEvents.length === 0 ? (
              <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                No documented events on the parallel timeline within this tick range.
              </div>
            ) : (
              rightEvents.map((ev) => {
                const dateStr = calendar
                  ? formatTickToDate(calendar, ev.startTick).displayShort
                  : `Tick ${ev.startTick}`;
                return (
                  <div
                    key={ev.id}
                    className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/90 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-xs font-mono text-amber-300">{dateStr}</span>
                        <span className="text-sm font-bold text-slate-100">{ev.title}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300">
                        {rightBranch ? rightBranch.name : 'Canon'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed pr-6">{ev.summary}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

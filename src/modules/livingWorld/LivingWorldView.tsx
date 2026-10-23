import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Play, Undo2, GitBranch, Plus, Trash2, Check, X, Wallet, Brain, ScrollText,
  Sparkles, ChevronDown, AlertTriangle, Users, RotateCcw, Layers,
} from 'lucide-react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import { formatTickToDate } from '../../utils/calendarEngine';
import { TICK_INTERVALS, TickIntervalPreset, TickProgress, CharacterMind, CharacterMemory, SimBranch, SimEvent, SimIntent } from './types';
import * as simStore from './simStore';
import { runTick, selectHeroEntities } from './tickEngine';
import { findConflicts, effectKindLabel } from './merge';

const importanceColor = (i: number) =>
  i >= 3 ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : i === 2 ? 'text-amber-200 border-amber-500/40 bg-amber-500/10' : 'text-slate-300 border-slate-700 bg-slate-800/40';

export const LivingWorldView: React.FC = () => {
  const {
    projects, activeProjectId, aiSettings, addTimelineEvent, updateEntity,
    openCharacterChat, setCurrentTick,
  } = useWorldifyStore();
  const project = projects.find((p) => p.id === activeProjectId) || projects[0];
  const calendar = project?.calendars.find((c) => c.id === project.activeCalendarId) || project?.calendars[0];

  const [branches, setBranches] = useState<SimBranch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [intents, setIntents] = useState<SimIntent[]>([]);
  const [minds, setMinds] = useState<CharacterMind[]>([]);
  const [spend, setSpend] = useState(0);
  const [progress, setProgress] = useState<TickProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTick, setSelectedTick] = useState<number | null>(null);
  const [characterPanelId, setCharacterPanelId] = useState<string | null>(null);
  const [characterMemories, setCharacterMemories] = useState<CharacterMemory[]>([]);
  const [goalDraft, setGoalDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const branch = branches.find((b) => b.id === activeBranchId) || null;
  const fmtTick = useCallback((t: number) => (calendar ? formatTickToDate(calendar, t).displayShort : `Tick ${t}`), [calendar]);

  // ── data loading ──
  const reload = useCallback(async (projId: string, preferBranchId?: string | null) => {
    const all = await simStore.listBranches(projId);
    let active = all.find((b) => b.id === preferBranchId) || all.find((b) => b.status === 'active') || null;
    if (!active) {
      const proj = projects.find((p) => p.id === projId);
      active = {
        id: simStore.newId(),
        projectId: projId,
        parentBranchId: null,
        forkedAtTick: proj?.currentTick ?? 0,
        name: 'Main continuation',
        status: 'active',
        createdAt: new Date().toISOString(),
        budgetUsd: 2,
        tickInterval: 'month',
        currentTick: proj?.currentTick ?? 0,
      };
      await simStore.putBranch(active);
      all.push(active);
    }
    setBranches(all);
    setActiveBranchId(active.id);
    const [ev, sp] = await Promise.all([simStore.listEvents(active.id), simStore.branchSpend(active.id)]);
    setEvents(ev);
    setSpend(sp);
    setMinds(await simStore.listMinds(active.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (project) void reload(project.id, activeBranchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const heroes = useMemo(() => (project && branch ? selectHeroEntities(project, branch) : []), [project, branch]);

  const groupedByTick = useMemo(() => {
    const map = new Map<number, SimEvent[]>();
    for (const e of events) {
      if (!map.has(e.tick)) map.set(e.tick, []);
      map.get(e.tick)!.push(e);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [events]);

  const pendingProposals = useMemo(
    () => events.filter((e) => e.importance >= 2).slice(-12).reverse(),
    [events]
  );
  const conflicts = useMemo(
    () => (project ? findConflicts(project, events) : []),
    [project, events]
  );
  const overBudget = branch ? spend >= branch.budgetUsd * 0.9 : false;

  // ── actions ──
  const doTick = async () => {
    if (!project || !branch || busy) return;
    setBusy(true);
    setError(null);
    setProgress({ phase: 'prepare', detail: 'Starting…', done: 0, total: 5 });
    try {
      const result = await runTick({
        project, branch, settings: aiSettings,
        onProgress: (p) => setProgress(p),
      });
      await reload(project.id, branch.id);
      setIntents(result.intents);
      setSelectedTick(branch.currentTick);
      setCurrentTick(branch.currentTick);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const doUndo = async () => {
    if (!project || !branch || busy) return;
    const interval = TICK_INTERVALS[branch.tickInterval].ticks;
    const lastTick = groupedByTick[0]?.[0];
    if (lastTick === undefined) return;
    setBusy(true);
    try {
      const doomed = events.filter((e) => e.tick === lastTick).map((e) => e.id);
      await simStore.deleteEvents(doomed);
      await simStore.deleteProposalsByEventIds(branch.id, doomed);
      await simStore.deleteMemoriesOfTick(branch.id, lastTick);
      await simStore.putBranch({ ...branch, currentTick: Math.max(branch.forkedAtTick, branch.currentTick - interval) });
      await reload(project.id, branch.id);
    } finally {
      setBusy(false);
    }
  };

  const doFork = async () => {
    if (!project || !branch) return;
    const name = window.prompt('Branch name — "what if…"', `What if… (from ${fmtTick(branch.currentTick)})`);
    if (!name) return;
    const nb: SimBranch = {
      ...branch,
      id: simStore.newId(),
      parentBranchId: branch.id,
      name,
      forkedAtTick: branch.currentTick,
      currentTick: branch.currentTick,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    await simStore.putBranch(nb);
    await reload(project.id, nb.id);
  };

  const doDiscard = async () => {
    if (!project || !branch || branch.name === 'Main continuation') return;
    if (!window.confirm(`Discard branch "${branch.name}"? Its events stay archived (marked discarded), not deleted.`)) return;
    await simStore.putBranch({ ...branch, status: 'discarded' });
    await reload(project.id, null);
  };

  const doMerge = async (ev: SimEvent, applyEffects: boolean) => {
    if (!project || !branch) return;
    addTimelineEvent({
      worldId: project.activeWorldId,
      title: ev.title,
      summary: ev.summary.replace(/\[\[|\]\]/g, ''),
      category: ev.category,
      startTick: ev.tick,
      importance: ev.importance,
      linkedEntityIds: ev.entityIds,
    });
    if (applyEffects) {
      const byTitle = new Map(project.entities.map((e) => [e.title.toLowerCase(), e] as const));
      for (const eff of ev.effects) {
        const ent = byTitle.get(String(eff.entityId).toLowerCase());
        if (!ent) continue;
        const p = eff.payload as Record<string, string>;
        if (eff.kind === 'death') {
          updateEntity(ent.id, {
            lifecycleEndTick: ev.tick,
            temporalStates: [...(ent.temporalStates || []), { id: simStore.newId(), fromTick: ev.tick, status: 'Dead', notes: p.note || ev.title }],
          });
        } else if (eff.kind === 'temporal_state') {
          updateEntity(ent.id, {
            temporalStates: [...(ent.temporalStates || []), { id: simStore.newId(), fromTick: ev.tick, status: String(p.status || ''), notes: String(p.note || '') }],
          });
        }
      }
    }
    await reload(project.id, branch.id);
  };

  const openCharacterPanel = async (entityId: string) => {
    setCharacterPanelId(entityId === characterPanelId ? null : entityId);
    setCharacterMemories([]);
    if (branch && entityId !== characterPanelId) {
      setCharacterMemories(await simStore.listMemories(branch.id, entityId));
      const mind = minds.find((m) => m.id === entityId);
      setGoalDraft(mind ? mind.goals.join('\n') : '');
    }
  };

  const saveGoals = async (entityId: string) => {
    if (!project || !branch) return;
    const goals = goalDraft.split('\n').map((g) => g.trim()).filter(Boolean);
    await simStore.putMind({ id: entityId, projectId: project.id, branchId: branch.id, tier: 'hero', goals, updatedAt: new Date().toISOString() });
    setMinds(await simStore.listMinds(branch.id));
  };

  const tickInterval = branch ? TICK_INTERVALS[branch.tickInterval] : null;

  if (!project || !branch) return <div className="p-8 text-slate-400">Loading living world…</div>;

  return (
    <div className="h-full flex flex-col">
      {/* ── Command bar ── */}
      <div className="shrink-0 border-b border-slate-800 bg-slate-900/60 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-amber-400" />
          <select
            value={branch.id}
            onChange={(e) => void reload(project.id, e.target.value)}
            className="appearance-none bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer max-w-[220px] truncate"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.status === 'discarded' ? '⚠ ' : ''}{b.name} · {fmtTick(b.currentTick)}
              </option>
            ))}
          </select>
          <button onClick={doFork} title="Fork a new branch from here" className="h-8 px-2 rounded-lg border border-slate-800 text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer">
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={doDiscard} title="Discard this branch (kept as archive)" className="h-8 px-2 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-300 hover:bg-slate-800 cursor-pointer">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="h-6 w-px bg-slate-800" />

        {/* Interval picker */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Tick covers</label>
          <select
            value={branch.tickInterval}
            onChange={(e) => {
              const nb = { ...branch, tickInterval: e.target.value as TickIntervalPreset };
              void simStore.putBranch(nb);
              setBranches(branches.map((b) => (b.id === nb.id ? nb : b)));
            }}
            className="appearance-none bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            {Object.entries(TICK_INTERVALS).map(([k, v]) => (
              <option key={k} value={k}>{v.label} — {v.detail}</option>
            ))}
          </select>
        </div>

        <button
          onClick={doTick}
          disabled={busy || overBudget}
          className="h-9 px-4 rounded-lg bg-amber-500 text-slate-950 font-semibold text-sm flex items-center gap-2 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Play className="w-4 h-4" />
          {busy ? progress?.detail || 'Ticking…' : 'Run tick'}
        </button>
        <button
          onClick={doUndo}
          disabled={busy || groupedByTick.length === 0}
          title="Roll the branch back one tick"
          className="h-9 px-3 rounded-lg border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer flex items-center gap-2 text-sm"
        >
          <Undo2 className="w-4 h-4" /> Undo
        </button>

        {/* Budget meter */}
        <div className="ml-auto flex items-center gap-2 text-xs" title={`Estimated spend $${spend.toFixed(2)} of $${branch.budgetUsd.toFixed(2)} budget`}>
          <Wallet className={`w-4 h-4 ${overBudget ? 'text-rose-400' : 'text-slate-500'}`} />
          <div className="w-28 h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full ${overBudget ? 'bg-rose-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.min(100, (spend / branch.budgetUsd) * 100)}%` }}
            />
          </div>
          <span className={overBudget ? 'text-rose-300' : 'text-slate-400'}>
            ${spend.toFixed(2)} / ${branch.budgetUsd.toFixed(2)}
          </span>
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-4 py-2 bg-rose-950/40 border-b border-rose-900 text-sm text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {overBudget && !busy && (
        <div className="shrink-0 px-4 py-2 bg-amber-950/40 border-b border-amber-900 text-sm text-amber-200 flex items-center gap-2">
          <Wallet className="w-4 h-4 shrink-0" /> Branch budget nearly spent — raise the budget or start a fresh branch to keep ticking.
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Event chronicle */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display font-semibold text-slate-200 flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-amber-400" /> Chronicle of {branch.name}
            </h2>
            <span className="text-xs text-slate-500">
              Branch clock: {fmtTick(branch.currentTick)} (tick {branch.currentTick}) · forked at {fmtTick(branch.forkedAtTick)}
            </span>
          </div>

          {groupedByTick.length === 0 && !busy && (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-slate-500">
              <p className="mb-2">This world has not been lived in yet on this branch.</p>
              <p className="text-sm">Pick how much time a tick covers, then press <strong className="text-amber-300">Run tick</strong>. Characters will declare their intents, the world narrator decides what actually happens, and everything lands here — nothing enters the canon until you approve it.</p>
            </div>
          )}

          {groupedByTick.map(([tick, evs]) => (
            <div key={tick} className="relative">
              <button
                onClick={() => setSelectedTick(selectedTick === tick ? null : tick)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-3 cursor-pointer ${selectedTick === tick ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-900/60 text-slate-500 hover:bg-slate-900'}`}
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${selectedTick === tick ? '' : '-rotate-90'}`} />
                {fmtTick(tick)}
                <span className="text-slate-600">· {evs.length} events</span>
              </button>
              {(selectedTick === null || selectedTick === tick) && (
                <div className="mt-2 space-y-2">
                  {evs.map((ev) => {
                    const conflict = conflicts.find((c) => c.eventId === ev.id);
                    const tickIntents = intents.filter((i) => i.tick === tick);
                    return (
                      <div key={ev.id} className={`rounded-xl border p-3 ${importanceColor(ev.importance)}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{ev.title}</div>
                            <p className="text-sm text-slate-300/90 mt-1 whitespace-pre-line">{ev.summary}</p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1">
                            <button
                              onClick={() => void doMerge(ev, true)}
                              title="Merge into canon (event + effects)"
                              className="h-7 px-2 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" /> Merge
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span className="rounded bg-slate-950/60 px-1.5 py-0.5">{ev.category.replace(/_/g, ' ')}</span>
                          {ev.entityIds.map((id) => {
                            const e = project.entities.find((x) => x.id === id);
                            return e ? (
                              <button key={id} onClick={() => void openCharacterPanel(id)} className="rounded bg-slate-950/60 px-1.5 py-0.5 hover:text-amber-300 cursor-pointer">
                                [[{e.title}]]
                              </button>
                            ) : null;
                          })}
                          {ev.roll && (
                            <span className={`rounded px-1.5 py-0.5 ${ev.roll.succeeded ? 'text-emerald-300' : 'text-rose-300'}`} title={`seed ${ev.roll.seed}`}>
                              roll {Math.round(ev.roll.roll * 100)}% vs {Math.round(ev.roll.chance * 100)}% — {ev.roll.succeeded ? 'succeeded' : 'failed'}
                            </span>
                          )}
                          {ev.effects.map((f, i) => (
                            <span key={i} className="rounded bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5">
                              {effectKindLabel(f.kind)}: {f.entityId}
                            </span>
                          ))}
                        </div>
                        {conflict && (
                          <div className="mt-2 text-xs text-rose-300 flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Canon conflict: {conflict.reason}
                          </div>
                        )}
                        {tickIntents.length > 0 && selectedTick === tick && (
                          <div className="mt-2 pt-2 border-t border-slate-700/50 space-y-1.5">
                            {tickIntents.filter((i) => ev.entityIds.includes(i.entityId)).map((i) => {
                              const ent = project.entities.find((x) => x.id === i.entityId);
                              return (
                                <div key={i.id} className="text-xs text-slate-400">
                                  <span className="text-slate-300">{ent?.title || 'Character'}</span> intended to {i.intent}
                                  {i.inner_note && <em className="block text-slate-500">inner note: “{i.inner_note}”</em>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right rail: proposals + cast + branches */}
        <div className="w-[340px] shrink-0 border-l border-slate-800 overflow-y-auto bg-slate-950/40 p-4 space-y-6">
          {/* Pending approval */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Awaiting your approval
            </h3>
            {pendingProposals.length === 0 ? (
              <p className="text-xs text-slate-600">Nothing pending. Important events (importance 2+) wait here before they touch the canon.</p>
            ) : (
              <div className="space-y-2">
                {pendingProposals.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                    <div className="text-sm font-medium text-amber-200">{ev.title}</div>
                    <div className="text-[11px] text-slate-500">{fmtTick(ev.tick)}</div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-3">{ev.summary.replace(/\[\[|\]\]/g, '')}</p>
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={() => void doMerge(ev, true)} className="flex-1 h-7 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs cursor-pointer">Merge to canon</button>
                      <button onClick={() => void doMerge(ev, false)} title="Merge the event text only, skip world effects" className="h-7 px-2 rounded-md border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer">Text only</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Cast */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-amber-400" /> Hero characters ({heroes.length})
            </h3>
            <p className="text-[11px] text-slate-600 mb-2">Heroes get a full agent every tick. Everyone else moves by world rules. Click a name to set goals and read their memory bank.</p>
            <div className="space-y-1">
              {heroes.map((h) => (
                <div key={h.id}>
                  <button
                    onClick={() => void openCharacterPanel(h.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm cursor-pointer ${characterPanelId === h.id ? 'bg-amber-500/10 text-amber-200' : 'text-slate-300 hover:bg-slate-800/60'}`}
                  >
                    <span className="truncate">{h.title}</span>
                    <span className="text-[10px] text-slate-500 shrink-0 ml-2">
                      {minds.find((m) => m.id === h.id)?.goals.length || 0} goals
                    </span>
                  </button>
                  {characterPanelId === h.id && (
                    <div className="mt-1 mb-2 rounded-lg border border-slate-800 bg-slate-900 p-2.5 space-y-2">
                      <div>
                        <label className="text-[11px] text-slate-500">Active goals (one per line)</label>
                        <textarea
                          value={goalDraft}
                          onChange={(e) => setGoalDraft(e.target.value)}
                          rows={3}
                          placeholder="Seize the northern mine before winter…"
                          className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                        <button onClick={() => void saveGoals(h.id)} className="mt-1 h-6 px-2 rounded bg-amber-600/80 hover:bg-amber-500 text-white text-[11px] cursor-pointer">Save goals</button>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500 mb-1 flex items-center gap-1.5"><Brain className="w-3 h-3" /> Memory bank ({characterMemories.length})</div>
                        <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                          {characterMemories.slice(0, 20).map((m) => (
                            <div key={m.id} className="text-[11px] text-slate-400 border-l-2 border-slate-800 pl-2">
                              <span className="text-slate-600 font-mono">{fmtTick(m.tick)}</span> — {m.text}
                            </div>
                          ))}
                          {characterMemories.length === 0 && <p className="text-[11px] text-slate-600">No memories yet.</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => { openCharacterChat(h.id); }}
                        className="w-full h-7 rounded-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" /> Talk to them
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Cost ledger */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5 text-amber-400" /> This branch spent ${spend.toFixed(2)}
            </h3>
            <p className="text-[11px] text-slate-600">
              {tickInterval ? `Each tick advances ${tickInterval.label.toLowerCase()} at ${tickInterval.detail} resolution. ` : ''}
              Set the budget per branch when you fork it. Every model call is logged as an AgentRun in IndexedDB.
            </p>
          </section>

          {/* Branch tree */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-amber-400" /> Branches
            </h3>
            <div className="space-y-1">
              {branches.map((b) => (
                <div key={b.id} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs ${b.id === branch.id ? 'bg-amber-500/10 text-amber-200' : 'text-slate-400'}`}>
                  <span className="truncate">
                    {b.parentBranchId ? '↳ ' : '● '}{b.name}
                    {b.status !== 'active' && <em className="ml-1 text-slate-600">({b.status})</em>}
                  </span>
                  <span className="font-mono text-[10px] text-slate-600 shrink-0 ml-2">{fmtTick(b.currentTick)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="text-[11px] text-slate-600 border-t border-slate-800 pt-3">
            <p className="flex items-start gap-1.5">
              <RotateCcw className="w-3 h-3 mt-0.5 shrink-0" />
              Ticks are reproducible: dice are rolled in code from a saved seed, and every model call is recorded. Undo rolls the branch back exactly one tick because each tick is written atomically.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

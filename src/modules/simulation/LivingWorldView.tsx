import React, { useEffect, useMemo, useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import {
  BranchOverlayRecord,
  CharacterMemory,
  CharacterMind,
  Entity,
  SimBranch,
  SimLanguageMode,
  SimProposal,
  SimResolutionLevel,
  SimScopeMode,
  SimTickInterval,
  TimelineEvent,
  WorldRuleEntry,
} from '../../types/worldify';
import {
  commitTickBundleAtomically,
  deleteSimRecord,
  ensureInitialSimulationState,
  forkSimulationBranch,
  loadProjectSimulationData,
  ProjectSimulationSnapshot,
  putSimRecord,
  rollbackBranchLastTick,
} from '../../utils/simulationStore';
import {
  executeSimulationTick,
  resolveTickIntervalInfo,
} from '../../services/simulationEngine';
import {
  buildBranchWorldView,
  resolveEntityTemporalStatus,
} from '../../utils/spatioTemporalResolver';
import { formatTickToDate, getTotalDaysPerYear } from '../../utils/calendarEngine';
import { LivingWorldMapCanvas } from './LivingWorldMapCanvas';
import { ExtendedCharacterModal } from './ExtendedCharacterModal';
import { BranchComparePanel } from './BranchComparePanel';
import {
  Play,
  RotateCcw,
  GitBranch,
  GitCompare,
  Sparkles,
  Zap,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  Check,
  X,
  Users,
  Map as MapIcon,
  ScrollText,
  DollarSign,
  Dices,
  Brain,
  Feather,
  Plus,
  Trash2,
  Eye,
  Clock,
} from 'lucide-react';

type SubViewMode = 'map_live' | 'cast_minds' | 'compare_merge' | 'world_rules';

export const LivingWorldView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    aiSettings,
    selectEntity,
    addTimelineEvent,
    updateEntity,
    addEntitySpatialKeyframe,
    addRelation,
    createEntity,
    setCurrentTick,
  } = useWorldifyStore();

  const canonProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  const [snapshot, setSnapshot] = useState<ProjectSimulationSnapshot | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [subView, setSubView] = useState<SubViewMode>('map_live');
  const [inspectedEntityId, setInspectedEntityId] = useState<string | null>(null);

  // Tick execution state
  const [isRunningTick, setIsRunningTick] = useState(false);
  const [tickProgressLabel, setTickProgressLabel] = useState<string>('');
  const [tickProgressStep, setTickProgressStep] = useState<number>(0);
  const [tickError, setTickError] = useState<string | null>(null);

  // Modals / Popovers
  const [showScopeSettings, setShowScopeSettings] = useState(false);
  const [showInterventionModal, setShowInterventionModal] = useState(false);
  const [interventionText, setInterventionText] = useState('');
  const [showForkModal, setShowForkModal] = useState(false);
  const [forkName, setForkName] = useState('');
  const [forkDesc, setForkDesc] = useState('');
  const [showBudgetPopover, setShowBudgetPopover] = useState(false);

  // World Rules form state
  const [newRuleTitle, setNewRuleTitle] = useState('');
  const [newRuleText, setNewRuleText] = useState('');
  const [newRuleEnforcement, setNewRuleEnforcement] = useState<'hard' | 'soft'>('hard');
  const [newRuleCategory, setNewRuleCategory] =
    useState<WorldRuleEntry['category']>('magic');

  // Load or initialize IndexedDB simulation state when project changes
  useEffect(() => {
    if (!canonProject) return;
    let cancelled = false;
    ensureInitialSimulationState(canonProject).then((snap) => {
      if (cancelled) return;
      setSnapshot(snap);
      setActiveBranchId((prev) =>
        prev && snap.branches.some((b) => b.id === prev)
          ? prev
          : snap.branches[0]?.id || null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [canonProject?.id]);

  const reloadSnapshot = async () => {
    if (!canonProject) return;
    const fresh = await loadProjectSimulationData(canonProject.id);
    setSnapshot(fresh);
  };

  const activeBranch = useMemo(() => {
    if (!snapshot || !activeBranchId) return snapshot?.branches[0] || null;
    return (
      snapshot.branches.find((b) => b.id === activeBranchId) ||
      snapshot.branches[0] ||
      null
    );
  }, [snapshot, activeBranchId]);

  const branchWorldView = useMemo(() => {
    if (!canonProject || !snapshot || !activeBranch) return canonProject;
    return buildBranchWorldView(
      canonProject,
      activeBranch,
      snapshot.branches,
      snapshot.events,
      snapshot.overlays
    );
  }, [canonProject, snapshot, activeBranch]);

  const calendar = useMemo(() => {
    if (!branchWorldView) return undefined;
    return (
      branchWorldView.calendars.find(
        (c) => c.id === branchWorldView.activeCalendarId
      ) || branchWorldView.calendars[0]
    );
  }, [branchWorldView]);

  const formattedBranchDate = useMemo(() => {
    if (!calendar || !activeBranch) return null;
    return formatTickToDate(calendar, activeBranch.currentTick);
  }, [calendar, activeBranch?.currentTick]);

  const activeMap = useMemo(() => {
    if (!branchWorldView) return null;
    return (
      branchWorldView.maps.find((m) => m.id === activeBranch?.focusMapId) ||
      branchWorldView.maps[0] ||
      null
    );
  }, [branchWorldView, activeBranch?.focusMapId]);

  const activeBranchMinds = useMemo(() => {
    if (!snapshot || !activeBranch) return [];
    return snapshot.minds.filter((m) => m.branchId === activeBranch.id);
  }, [snapshot, activeBranch?.id]);

  const activeBranchEvents = useMemo(() => {
    if (!snapshot || !activeBranch) return [];
    return snapshot.events
      .filter((e) => e.branchId === activeBranch.id)
      .sort((a, b) => b.startTick - a.startTick);
  }, [snapshot, activeBranch?.id]);

  const pendingProposals = useMemo(() => {
    if (!snapshot || !activeBranch) return [];
    return snapshot.proposals.filter(
      (p) => p.branchId === activeBranch.id && p.status === 'pending'
    );
  }, [snapshot, activeBranch?.id]);

  const inspectedEntity = useMemo(() => {
    if (!inspectedEntityId || !branchWorldView) return null;
    return branchWorldView.entities.find((e) => e.id === inspectedEntityId) || null;
  }, [inspectedEntityId, branchWorldView]);

  const inspectedMind = useMemo(() => {
    if (!inspectedEntityId || !activeBranchMinds.length) return null;
    return activeBranchMinds.find((m) => m.entityId === inspectedEntityId) || null;
  }, [inspectedEntityId, activeBranchMinds]);

  const inspectedMemories = useMemo(() => {
    if (!inspectedEntityId || !snapshot || !activeBranch) return [];
    return snapshot.memories.filter(
      (m) => m.branchId === activeBranch.id && m.entityId === inspectedEntityId
    );
  }, [inspectedEntityId, snapshot, activeBranch?.id]);

  // Update Branch Settings helper
  const updateActiveBranch = async (patch: Partial<SimBranch>) => {
    if (!activeBranch) return;
    const updated: SimBranch = {
      ...activeBranch,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await putSimRecord('branches', updated);
    await reloadSnapshot();
  };

  // Run a Simulation Tick!
  const handleRunTick = async (options?: {
    customSeed?: number;
    intervention?: string;
  }) => {
    if (!canonProject || !activeBranch || !snapshot || isRunningTick) return;
    setIsRunningTick(true);
    setTickError(null);
    setTickProgressStep(1);
    setTickProgressLabel('מתחיל מחזור טיק...');

    try {
      const result = await executeSimulationTick(
        canonProject,
        activeBranch,
        snapshot,
        aiSettings,
        {
          seed: options?.customSeed,
          interventionPrompt: options?.intervention,
          onStepProgress: (label, step) => {
            setTickProgressLabel(label);
            setTickProgressStep(step);
          },
        }
      );

      await commitTickBundleAtomically(result.commitBundle);
      await reloadSnapshot();
    } catch (err: unknown) {
      setTickError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunningTick(false);
      setTickProgressLabel('');
      setTickProgressStep(0);
    }
  };

  // Re-roll last tick with a new seed ("שחזור: מריצים את אותו טיק עם seed אחר")
  const handleRerollLastTickWithNewSeed = async () => {
    if (!activeBranch || !snapshot || activeBranch.tickHistory.length <= 1 || isRunningTick)
      return;
    const rolledBack = await rollbackBranchLastTick(activeBranch, snapshot);
    if (!rolledBack) return;
    const freshSnap = await loadProjectSimulationData(canonProject.id);
    setSnapshot(freshSnap);

    // Now run tick with a fresh random seed
    setIsRunningTick(true);
    setTickError(null);
    try {
      const result = await executeSimulationTick(
        canonProject,
        rolledBack,
        freshSnap,
        aiSettings,
        {
          seed: Math.floor(Math.random() * 900_000_000) + 100_000_000,
          onStepProgress: (label, step) => {
            setTickProgressLabel(`שחזור ב-Seed חדש · ${label}`);
            setTickProgressStep(step);
          },
        }
      );
      await commitTickBundleAtomically(result.commitBundle);
      await reloadSnapshot();
    } catch (err: unknown) {
      setTickError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunningTick(false);
      setTickProgressLabel('');
      setTickProgressStep(0);
    }
  };

  // Undo last tick ("בטל טיק")
  const handleUndoLastTick = async () => {
    if (!activeBranch || !snapshot || activeBranch.tickHistory.length <= 1 || isRunningTick)
      return;
    await rollbackBranchLastTick(activeBranch, snapshot);
    await reloadSnapshot();
  };

  // Fork a new branch ("פיצול ענף")
  const handleForkBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canonProject || !snapshot || !forkName.trim()) return;
    const newBranch = await forkSimulationBranch(
      canonProject,
      activeBranch,
      activeBranch ? activeBranch.currentTick : canonProject.currentTick,
      forkName.trim(),
      forkDesc.trim() || 'פיצול מהעולם החי',
      snapshot
    );
    await reloadSnapshot();
    setActiveBranchId(newBranch.id);
    setShowForkModal(false);
    setForkName('');
    setForkDesc('');
  };

  // Merge selected branch events into Canon ("מיזוג = הסרת branchId")
  const handleMergeEventsToCanon = async (
    eventsToMerge: TimelineEvent[],
    markBranchMerged: boolean = false
  ) => {
    if (!canonProject || !snapshot || !activeBranch) return;

    for (const ev of eventsToMerge) {
      // 1. Add canonical TimelineEvent (without branchId) to Project JSON
      addTimelineEvent({
        worldId: ev.worldId,
        calendarId: ev.calendarId,
        title: ev.title,
        summary: ev.summary,
        category: ev.category,
        startTick: ev.startTick,
        endTick: ev.endTick,
        importance: ev.importance,
        linkedEntityIds: ev.linkedEntityIds,
        mapId: ev.mapId,
        mapX: ev.mapX,
        mapY: ev.mapY,
        source: ev.source,
        effects: ev.effects,
        seed: ev.seed,
        luckRoll: ev.luckRoll,
        dialogues: ev.dialogues,
      });

      // 2. Promote associated overlays at this event's tick into Canon
      const overlaysAtTick = snapshot.overlays.filter(
        (o) => o.branchId === ev.branchId && o.tick === ev.startTick
      );
      for (const ov of overlaysAtTick) {
        if (ov.kind === 'spatial_keyframe' && ov.entityId && ov.spatialKeyframe) {
          addEntitySpatialKeyframe(ov.entityId, {
            tick: ov.spatialKeyframe.tick,
            endTick: ov.spatialKeyframe.endTick,
            mapId: ov.spatialKeyframe.mapId,
            x: ov.spatialKeyframe.x,
            y: ov.spatialKeyframe.y,
            endX: ov.spatialKeyframe.endX,
            endY: ov.spatialKeyframe.endY,
            pathId: ov.spatialKeyframe.pathId,
            statusNote: ov.spatialKeyframe.statusNote,
          });
        } else if (ov.kind === 'temporal_state' && ov.entityId && ov.temporalState) {
          const ent = canonProject.entities.find((e) => e.id === ov.entityId);
          if (ent) {
            updateEntity(ent.id, {
              temporalStates: [
                ...(ent.temporalStates || []),
                {
                  id: ov.temporalState.id,
                  fromTick: ov.temporalState.fromTick,
                  toTick: ov.temporalState.toTick,
                  titleOverride: ov.temporalState.titleOverride,
                  status: ov.temporalState.status,
                  allegianceEntityId: ov.temporalState.allegianceEntityId,
                  notes: ov.temporalState.notes,
                },
              ],
            });
          }
        } else if (ov.kind === 'relation' && ov.relation) {
          addRelation({
            sourceEntityId: ov.relation.sourceEntityId,
            targetEntityId: ov.relation.targetEntityId,
            type: ov.relation.type,
            label: ov.relation.label,
            validFromTick: ov.relation.validFromTick,
            validToTick: ov.relation.validToTick,
          });
        }
      }

      // Mark any pending proposal for this event as approved
      const matchingProposal = snapshot.proposals.find((p) => p.eventId === ev.id);
      if (matchingProposal) {
        await putSimRecord('proposals', { ...matchingProposal, status: 'approved' });
      }
    }

    if (markBranchMerged && activeBranch) {
      setCurrentTick(activeBranch.currentTick);
      await putSimRecord('branches', {
        ...activeBranch,
        status: 'merged',
        updatedAt: new Date().toISOString(),
      });
    }

    await reloadSnapshot();
  };

  // Handle approving or rejecting a single SimProposal card
  const handleProposalDecision = async (
    proposal: SimProposal,
    decision: 'approved' | 'rejected'
  ) => {
    if (!canonProject || !snapshot) return;

    if (decision === 'approved') {
      if (proposal.kind === 'major_event' && proposal.eventId) {
        const ev = snapshot.events.find((e) => e.id === proposal.eventId);
        if (ev) {
          await handleMergeEventsToCanon([ev], false);
          return;
        }
      } else if (proposal.kind === 'character_evolution' && proposal.entityId) {
        const ent = canonProject.entities.find((e) => e.id === proposal.entityId);
        const appendMd = String(proposal.payload?.markdownAppend || `\n\n${proposal.description}`);
        if (ent) {
          updateEntity(ent.id, {
            contentMd: `${ent.contentMd}${appendMd}`,
          });
        }
      } else if (proposal.kind === 'new_entity_draft') {
        createEntity({
          title: String(proposal.payload?.title || proposal.title),
          category: (proposal.payload?.category as any) || 'location',
          summary: String(proposal.payload?.summary || proposal.description),
        });
      }
    }

    await putSimRecord('proposals', {
      ...proposal,
      status: decision,
    });
    await reloadSnapshot();
  };

  // Trigger manual reflection for a character
  const handleManualReflection = async (entity: Entity, mind: CharacterMind) => {
    if (!canonProject || !activeBranch || !snapshot) return;
    const charMems = snapshot.memories
      .filter((m) => m.branchId === activeBranch.id && m.entityId === entity.id)
      .slice(-10);

    const conclusion =
      charMems.length > 0
        ? `רפלקציה בטיק ${activeBranch.currentTick}: מתוך האירועים האחרונים (${charMems[charMems.length - 1].content.slice(0, 70)}...), הבנתי שעליי לפעול בנחישות רבה יותר ולהיזהר מהבטחות סרק.`
        : `רפלקציה בטיק ${activeBranch.currentTick}: עליי לבצר את מעמדי לקראת הבאות.`;

    const reflMem: CharacterMemory = {
      id: `mem-refl-${activeBranch.id}-${Date.now()}`,
      projectId: canonProject.id,
      branchId: activeBranch.id,
      entityId: entity.id,
      tick: activeBranch.currentTick,
      participantIds: [entity.id],
      content: conclusion,
      importance: 5,
      isReflection: true,
      createdAt: new Date().toISOString(),
    };

    const updatedMind: CharacterMind = {
      ...mind,
      beliefs: [...mind.beliefs.slice(-4), conclusion],
      lastReflectedAtTick: activeBranch.currentTick,
      ticksSinceReflection: 0,
      updatedAt: new Date().toISOString(),
    };

    const evolProposal: SimProposal = {
      id: `prop-evol-${activeBranch.id}-${Date.now()}`,
      projectId: canonProject.id,
      branchId: activeBranch.id,
      tick: activeBranch.currentTick,
      entityId: entity.id,
      kind: 'character_evolution',
      title: `שינוי אופי מוצע מרפלקציה: ${entity.title}`,
      description: conclusion,
      status: 'pending',
      payload: {
        entityId: entity.id,
        markdownAppend: `\n\n### תובנת רפלקציה (טיק ${activeBranch.currentTick})\n${conclusion}`,
      },
      createdAt: new Date().toISOString(),
    };

    await putSimRecord('memories', reflMem);
    await putSimRecord('minds', updatedMind);
    await putSimRecord('proposals', evolProposal);
    await reloadSnapshot();
  };

  if (!canonProject || !snapshot || !activeBranch) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 text-slate-400">
        טוען את מנוע העולם החי מ-IndexedDB...
      </div>
    );
  }

  const daysPerYear = calendar ? getTotalDaysPerYear(calendar) : 360;
  const currentIntervalInfo = resolveTickIntervalInfo(activeBranch.tickSize, daysPerYear);

  return (
    <div dir="rtl" className="flex-1 min-h-0 flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* ═══════════════════════════════════════════════════════════════
          1. TOP CONTROL BAR: Branch, Clock, Tick Engine, Interval, Scope/Resolution & Budget
         ═══════════════════════════════════════════════════════════════ */}
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 z-30">
        {/* Right Group: Branch Selector & World Date */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
            <GitBranch className="w-4 h-4 text-emerald-400 shrink-0" />
            <select
              value={activeBranch.id}
              onChange={(e) => setActiveBranchId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-100 focus:outline-none cursor-pointer max-w-[190px] truncate"
            >
              {snapshot.branches.map((b) => (
                <option key={b.id} value={b.id} className="bg-slate-900 text-slate-100">
                  {b.name} {b.status === 'merged' ? '(מוזג)' : b.status === 'discarded' ? '(נזרק)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setForkName(`ענף מתפצל מטיק ${activeBranch.currentTick}`);
                setShowForkModal(true);
              }}
              className="text-[11px] text-amber-400 hover:text-amber-300 border-r border-slate-800 pr-2 mr-1 font-medium cursor-pointer"
              title="פצל ענף חדש מנקודה זו"
            >
              + פיצול
            </button>
          </div>

          {/* World Date Pill */}
          <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold text-amber-200">
              {formattedBranchDate ? formattedBranchDate.displayFull : `טיק ${activeBranch.currentTick}`}
            </span>
            <span className="text-slate-500 font-mono text-[11px]">
              (טיק {activeBranch.currentTick} · {activeBranch.tickCount} הרצות)
            </span>
          </div>
        </div>

        {/* Center Group: Tick Execution Controls, Interval Picker, Scope/Resolution, Undo & Re-roll */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Interval Picker ("גודל טיק משתנה: מיום ועד עשור") */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5 text-xs">
            {(
              [
                { id: '1d', label: 'יום' },
                { id: '7d', label: 'שבוע' },
                { id: '30d', label: 'חודש' },
                { id: '1y', label: 'שנה' },
                { id: '10y', label: 'עשור' },
              ] as const
            ).map((iv) => (
              <button
                key={iv.id}
                type="button"
                onClick={() => updateActiveBranch({ tickSize: iv.id })}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeBranch.tickSize === iv.id
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>

          {/* Primary Run Tick Button */}
          <button
            type="button"
            disabled={isRunningTick}
            onClick={() => handleRunTick()}
            className="h-9 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>
              {isRunningTick
                ? `מריץ (${tickProgressStep}/7)...`
                : `הרץ טיק (+${currentIntervalInfo.hebrewLabel})`}
            </span>
          </button>

          {/* Intervene Button ("התערבות: מזריק אירוע וממשיכים לרוץ") */}
          <button
            type="button"
            disabled={isRunningTick}
            onClick={() => setShowInterventionModal(true)}
            className="h-9 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            title="התערבות: הזרק אירוע דרמטי לעולם והרץ טיק"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>התערבות</span>
          </button>

          {/* Re-roll with new Seed ("שחזור עם seed אחר") */}
          <button
            type="button"
            disabled={isRunningTick || activeBranch.tickHistory.length <= 1}
            onClick={handleRerollLastTickWithNewSeed}
            className="h-9 px-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-slate-300 text-xs flex items-center gap-1.5 cursor-pointer"
            title="שחזור: הרץ מחדש את הטיק האחרון עם Seed הגרלה אחר"
          >
            <Dices className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">שחזור Seed</span>
          </button>

          {/* Undo 1 Tick ("בטל טיק") */}
          <button
            type="button"
            disabled={isRunningTick || activeBranch.tickHistory.length <= 1}
            onClick={handleUndoLastTick}
            className="h-9 px-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-slate-300 text-xs flex items-center gap-1.5 cursor-pointer"
            title="בטל: גלגל את הענף טיק אחד אחורה"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">בטל</span>
          </button>

          {/* Scope & Resolution Settings Popover Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowScopeSettings(!showScopeSettings)}
              className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                showScopeSettings
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'border-slate-800 hover:bg-slate-800 text-slate-300'
              }`}
              title="הגדרות היקף (Scope) ורזולוציית אירועים (Resolution)"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>היקף ורזולוציה</span>
            </button>

            {showScopeSettings && (
              <div className="absolute left-0 top-11 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 space-y-4 z-50 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-slate-100">היקף (Scope) ורזולוציית טיק</span>
                  <button
                    type="button"
                    onClick={() => setShowScopeSettings(false)}
                    className="text-slate-400 hover:text-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-300">
                    1. היקף גיאוגרפי וסיפורי (Scope):
                  </label>
                  <select
                    value={activeBranch.scopeMode}
                    onChange={(e) =>
                      updateActiveBranch({ scopeMode: e.target.value as SimScopeMode })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100"
                  >
                    <option value="local">מקומי — ממוקד במפה/זירה אחת</option>
                    <option value="regional">אזורי — גיבורים וסיעות באזור הפעיל</option>
                    <option value="global">עולמי — כלל העולם והממלכות</option>
                    <option value="custom_cast">קאסט מותאם אישית בלבד</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-300">
                    2. רזולוציה וצפיפות אירועים לטיק (Resolution):
                  </label>
                  <select
                    value={activeBranch.resolutionLevel}
                    onChange={(e) =>
                      updateActiveBranch({
                        resolutionLevel: e.target.value as SimResolutionLevel,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100"
                  >
                    <option value="focused">ממוקד (1–2 אירועי שיא בלבד)</option>
                    <option value="balanced">מאוזן (2–4 אירועים משמעותיים + דיאלוג)</option>
                    <option value="detailed">מפורט (4–6 אירועים, תנועות ודיאלוגים)</option>
                    <option value="chronicle">כרוניקה היסטורית (3–7 תמורות מקרו)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-300">
                    3. סף חשיבות לתור האישורים:
                  </label>
                  <select
                    value={activeBranch.minImportanceThreshold ?? 2}
                    onChange={(e) =>
                      updateActiveBranch({
                        minImportanceThreshold: Number(e.target.value) as 1 | 2 | 3,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100"
                  >
                    <option value={1}>כל האירועים (חשיבות 1 ומעלה)</option>
                    <option value={2}>אירועים בולטים (חשיבות 2 ומעלה — מומלץ)</option>
                    <option value={3}>אירועים מכונני-עידן בלבד (חשיבות 3)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-300">
                    4. שפת כתיבת העולם:
                  </label>
                  <select
                    value={activeBranch.languageMode}
                    onChange={(e) =>
                      updateActiveBranch({
                        languageMode: e.target.value as SimLanguageMode,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100"
                  >
                    <option value="he">עברית תמיד (ברירת מחדל)</option>
                    <option value="entity_match">לפי שפת דף ה-Wiki של הדמות</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Left Group: View Mode Tabs & Budget Meter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5 text-xs">
            {(
              [
                { id: 'map_live', label: 'מפה חיה', icon: MapIcon },
                { id: 'cast_minds', label: 'סוכני דמויות', icon: Users },
                { id: 'compare_merge', label: 'השוואה ומיזוג', icon: GitCompare },
                { id: 'world_rules', label: 'חוקי עולם', icon: ShieldCheck },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubView(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    subView === tab.id
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Budget Meter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowBudgetPopover(!showBudgetPopover)}
              className="h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs flex items-center gap-1.5 cursor-pointer"
              title="מד תקציב ענף ומעקב קריאות מודל (AgentRun)"
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono text-slate-200">
                ${activeBranch.spentUsd.toFixed(3)} / ${activeBranch.budgetUsd.toFixed(2)}
              </span>
            </button>

            {showBudgetPopover && (
              <div className="absolute left-0 top-11 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 space-y-3 z-50 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-slate-100">בקרת תקציב וקריאות (AgentRun)</span>
                  <button
                    type="button"
                    onClick={() => setShowBudgetPopover(false)}
                    className="text-slate-400 hover:text-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-300">תקרת תקציב לענף ($ USD):</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={activeBranch.budgetUsd}
                    onChange={(e) =>
                      updateActiveBranch({ budgetUsd: Math.max(0.5, Number(e.target.value)) })
                    }
                    className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-left font-mono text-slate-100"
                  />
                </div>
                <div className="space-y-1 max-h-44 overflow-y-auto pt-1">
                  <div className="text-[11px] text-slate-400 font-semibold">
                    קריאות אחרונות בענף ({snapshot.agentRuns.filter((r) => r.branchId === activeBranch.id).length}):
                  </div>
                  {snapshot.agentRuns
                    .filter((r) => r.branchId === activeBranch.id)
                    .slice(0, 8)
                    .map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between bg-slate-950 px-2.5 py-1.5 rounded-lg text-[11px]"
                      >
                        <span className="text-slate-300 truncate max-w-[150px]">
                          [טיק {r.tick}] {r.role}
                        </span>
                        <span className="font-mono text-emerald-400">
                          {r.tokensIn + r.tokensOut} tok · ${r.costUsd.toFixed(4)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Progress / Error Banner */}
      {(isRunningTick || tickError) && (
        <div
          className={`px-5 py-2 border-b text-xs flex items-center justify-between ${
            tickError
              ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
              : 'bg-emerald-950/50 border-emerald-500/30 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isRunningTick ? (
              <>
                <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
                <span className="font-medium">{tickProgressLabel}</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>{tickError}</span>
              </>
            )}
          </div>
          {tickError && (
            <button
              type="button"
              onClick={() => setTickError(null)}
              className="text-rose-300 hover:text-white cursor-pointer"
            >
              סגור
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          2. MAIN WORKSPACE AREA (Map / Cast Minds / Compare / World Rules + Right Feed)
         ═══════════════════════════════════════════════════════════════ */}
      {subView === 'compare_merge' ? (
        <BranchComparePanel
          canonProject={canonProject}
          activeBranch={activeBranch}
          branches={snapshot.branches}
          allBranchEvents={snapshot.events}
          allBranchOverlays={snapshot.overlays}
          onMergeEventsToCanon={handleMergeEventsToCanon}
        />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-800 overflow-hidden">
          {/* Center Area (Map, Cast Minds, or World Rules) */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
            {subView === 'map_live' && (
              <LivingWorldMapCanvas
                projectView={branchWorldView}
                activeBranch={activeBranch}
                activeMap={activeMap}
                maps={branchWorldView.maps}
                minds={activeBranchMinds}
                recentBranchEvents={activeBranchEvents}
                onSelectMap={(mapId) => updateActiveBranch({ focusMapId: mapId })}
                onInspectCharacter={(entity) => setInspectedEntityId(entity.id)}
              />
            )}

            {subView === 'cast_minds' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-950">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-100">
                      סוכני הדמויות והיומנים הפנימיים בענף ({activeBranchMinds.length})
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      רק דמויות בשכבת "גיבור" מקבלות מודל שפה וזיכרון אישי בכל טיק. לחץ על כל דמות לפתיחת הכרטיס הדו-שכבתי או לשיחה איתה.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {activeBranchMinds.map((mind) => {
                    const ent = branchWorldView.entities.find((e) => e.id === mind.entityId);
                    if (!ent) return null;
                    const st = resolveEntityTemporalStatus(
                      ent,
                      activeBranch.currentTick,
                      calendar
                    );
                    const charMems = snapshot.memories.filter(
                      (m) => m.branchId === activeBranch.id && m.entityId === ent.id
                    );

                    return (
                      <div
                        key={mind.id}
                        onClick={() => setInspectedEntityId(ent.id)}
                        className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                                  mind.tier === 'protagonist'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {ent.title.slice(0, 2)}
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-slate-100">
                                  {st.activeTitle}
                                </h3>
                                <span className="text-[11px] text-slate-400">
                                  {st.activeStatus}
                                </span>
                              </div>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                mind.tier === 'protagonist'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : mind.tier === 'secondary'
                                    ? 'bg-amber-500/15 text-amber-300'
                                    : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {mind.tier === 'protagonist'
                                ? 'גיבור (סוכן מלא)'
                                : mind.tier === 'secondary'
                                  ? 'משנית'
                                  : 'רקע'}
                            </span>
                          </div>

                          {/* Active Goal */}
                          {mind.goals[0] && (
                            <div className="text-xs text-slate-300 bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/80">
                              <span className="text-[10px] text-amber-400 font-bold block mb-0.5">
                                מטרה מובילה:
                              </span>
                              {mind.goals[0].description}
                            </div>
                          )}

                          {/* Latest Intent & Secret Inner Note */}
                          {mind.latestIntent && (
                            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1">
                              <div className="text-[11px] text-slate-200 font-medium">
                                <strong>כוונה:</strong> "{mind.latestIntent.intent}"
                              </div>
                              {mind.latestIntent.inner_note && (
                                <div className="text-[11px] text-amber-200/90 italic">
                                  💭 יומן פנימי: "{mind.latestIntent.inner_note}"
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                          <span>{charMems.length} זיכרונות בבנק</span>
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" />
                            <span>פתח כרטיס ושיחה</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {subView === 'world_rules' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-950">
                <div className="max-w-3xl space-y-2">
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-400" />
                    <span>חוקי העולם כנתונים (קשיחים ורכים)</span>
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    חוקים <strong>קשיחים</strong> נאכפים בקוד על ידי בודק הקונפליקטים אחרי כל טיק (אירוע שמפר אותם נפסל או נשלח לתיקון). חוקים <strong>רכים</strong> מוזרקים כהנחיות מחייבות לסוכני הדמויות ולמספר.
                  </p>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newRuleTitle.trim() || !newRuleText.trim()) return;
                    const rule: WorldRuleEntry = {
                      id: `wrule-${canonProject.id}-${Date.now()}`,
                      projectId: canonProject.id,
                      title: newRuleTitle.trim(),
                      ruleText: newRuleText.trim(),
                      enforcement: newRuleEnforcement,
                      category: newRuleCategory,
                    };
                    await putSimRecord('worldRules', rule);
                    setNewRuleTitle('');
                    setNewRuleText('');
                    await reloadSnapshot();
                  }}
                  className="max-w-3xl p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
                >
                  <div className="text-xs font-bold text-slate-200">הוספת חוק עולם חדש</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={newRuleTitle}
                      onChange={(e) => setNewRuleTitle(e.target.value)}
                      placeholder="שם החוק (למשל: מגבלת קסם דם)"
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                    />
                    <select
                      value={newRuleEnforcement}
                      onChange={(e) =>
                        setNewRuleEnforcement(e.target.value as 'hard' | 'soft')
                      }
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                    >
                      <option value="hard">חוק קשיח (נאכף בקוד ובבודק הקונפליקטים)</option>
                      <option value="soft">חוק רך (הנחיה למספר ולדמויות)</option>
                    </select>
                    <select
                      value={newRuleCategory}
                      onChange={(e) =>
                        setNewRuleCategory(e.target.value as WorldRuleEntry['category'])
                      }
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                    >
                      <option value="magic">קסם ומטאפיזיקה</option>
                      <option value="physics">פיזיקה וטבע</option>
                      <option value="mortality">מוות ותוחלת חיים</option>
                      <option value="travel">מסע ומרחקים</option>
                      <option value="politics">פוליטיקה וחברה</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRuleText}
                      onChange={(e) => setNewRuleText(e.target.value)}
                      placeholder='נסח את החוק (למשל: "אסור: תחיית מתים" או "כל הטלת לחש דורשת אבן תהודה")...'
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>הוסף חוק</span>
                    </button>
                  </div>
                </form>

                <div className="max-w-3xl space-y-2.5">
                  {snapshot.worldRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              rule.enforcement === 'hard'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            }`}
                          >
                            {rule.enforcement === 'hard' ? 'קשיח (נאכף בקוד)' : 'רך (הנחיית מודל)'}
                          </span>
                          <span className="text-sm font-bold text-slate-100">{rule.title}</span>
                        </div>
                        <p className="text-xs text-slate-300">{rule.ruleText}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteSimRecord('worldRules', rule.id);
                          await reloadSnapshot();
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                        title="מחק חוק"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              RIGHT PANEL: Approval Queue (`SimProposal`) + Live Event Feed
             ═══════════════════════════════════════════════════════════════ */}
          <aside className="w-full lg:w-[410px] xl:w-[450px] shrink-0 h-full min-h-0 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden">
            {/* Section 1: Pending Approval Cards (`SimProposal`) */}
            {pendingProposals.length > 0 && (
              <div className="p-4 bg-amber-950/20 border-b border-amber-500/30 space-y-2.5 max-h-[42%] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Sparkles className="w-4 h-4" />
                    <span>ממתין לאישורך לקנון ({pendingProposals.length})</span>
                  </div>
                  <span className="text-[10px] text-amber-200/70">
                    אישור מסיר branchId וממזג לקנון
                  </span>
                </div>

                {pendingProposals.map((prop) => (
                  <div
                    key={prop.id}
                    className="p-3 rounded-xl bg-slate-950/90 border border-amber-500/40 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 ml-1.5">
                          {prop.kind === 'major_event'
                            ? 'אירוע מרכזי'
                            : prop.kind === 'character_evolution'
                              ? 'שינוי אופי מרפלקציה'
                              : 'טיוטת ישות חדשה'}
                        </span>
                        <span className="text-xs font-bold text-slate-100">{prop.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        טיק {prop.tick}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{prop.description}</p>

                    {prop.contradictsCanon && prop.contradictsCanon.length > 0 && (
                      <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-[11px] text-rose-200 space-y-0.5">
                        <div className="font-bold text-rose-300 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>סתירה אפשרית מול הקנון:</span>
                        </div>
                        {prop.contradictsCanon.map((c, i) => (
                          <div key={i}>• {c}</div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleProposalDecision(prop, 'rejected')}
                        className="px-2.5 py-1 rounded-lg border border-slate-800 hover:bg-slate-800 text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>דחה</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleProposalDecision(prop, 'approved')}
                        className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>אשר ומזג לקנון</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Section 2: Live Branch Event Log & Character Intents */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-100">
                  יומן אירועים חי בענף ({activeBranchEvents.length})
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">{activeBranch.name}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeBranchEvents.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center space-y-2">
                  <Sparkles className="w-8 h-8 text-amber-400/50 mx-auto" />
                  <p className="text-xs font-bold text-slate-200">
                    העולם עומד בטיק {activeBranch.currentTick} וממתין לך
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    בחר מרווח זמן בסרגל העליון (יום, שבוע, חודש, שנה או עשור) ולחץ על <strong>"הרץ טיק"</strong> כדי שסוכני הדמויות יצהירו על כוונותיהם ומנוע העולם יכריע מה התרחש.
                  </p>
                </div>
              ) : (
                activeBranchEvents.map((ev) => {
                  const dateLabel = calendar
                    ? formatTickToDate(calendar, ev.startTick).displayShort
                    : `טיק ${ev.startTick}`;

                  return (
                    <div
                      key={ev.id}
                      className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800/90 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-mono text-emerald-400">
                              {dateLabel}
                            </span>
                            {ev.source === 'intervention' && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                                ⚡ התערבות
                              </span>
                            )}
                            <span className="text-xs font-bold text-slate-100">
                              {ev.title}
                            </span>
                          </div>
                        </div>
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-amber-300 shrink-0">
                          חשיבות {ev.importance}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{ev.summary}</p>

                      {/* Seeded Luck Roll Badge */}
                      {ev.luckRoll && (
                        <div className="flex items-center gap-2 text-[11px] bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1">
                          <Dices className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-slate-300">
                            הגרלת מזל (Seed {ev.seed}): {ev.luckRoll.difficultyLabel} (
                            {ev.luckRoll.chancePercent}%) · הוגרל{' '}
                            <strong>{ev.luckRoll.rolledValue}</strong> ⬅{' '}
                            <strong
                              className={
                                ev.luckRoll.succeeded ? 'text-emerald-400' : 'text-rose-400'
                              }
                            >
                              {ev.luckRoll.succeeded ? 'הצלחה' : 'סיבוך / כישלון'}
                            </strong>
                          </span>
                        </div>
                      )}

                      {/* In-Tick Dialogues */}
                      {ev.dialogues && ev.dialogues.length > 0 && (
                        <div className="space-y-1 border-r-2 border-emerald-500/40 pr-2.5 py-0.5">
                          {ev.dialogues.map((d, di) => (
                            <div key={di} className="text-[11px] text-slate-300">
                              <strong className="text-emerald-300">{d.speakerName}:</strong>{' '}
                              <span className="italic">{d.line}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Linked Character chips (click to open Extended Character Card) */}
                      {ev.linkedEntityIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {ev.linkedEntityIds.map((id) => {
                            const ent = branchWorldView.entities.find((e) => e.id === id);
                            if (!ent) return null;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setInspectedEntityId(ent.id)}
                                className="px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-amber-300 cursor-pointer"
                              >
                                [[{ent.title}]]
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          3. BOTTOM BAR: Interactive Branch Tree ("עץ הענפים עם סמן של הטיק הנוכחי")
         ═══════════════════════════════════════════════════════════════ */}
      <div className="h-14 shrink-0 bg-slate-900 border-t border-slate-800 px-4 flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <GitBranch className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-200">עץ הענפים (מולטיורס):</span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
            ★ קנון (טיק {canonProject.currentTick})
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {snapshot.branches.map((b) => {
            const isActive = b.id === activeBranch.id;
            return (
              <div
                key={b.id}
                onClick={() => setActiveBranchId(b.id)}
                className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 cursor-pointer shrink-0 transition-all ${
                  isActive
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200 font-bold'
                    : b.status === 'discarded'
                      ? 'bg-slate-950/50 border-slate-800/60 text-slate-500'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    b.status === 'merged'
                      ? 'bg-amber-400'
                      : b.status === 'discarded'
                        ? 'bg-slate-600'
                        : 'bg-emerald-400'
                  }`}
                />
                <span>{b.name}</span>
                <span className="text-[10px] font-mono text-slate-400">
                  [{b.forkedAtTick} ⬅ {b.currentTick}]
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeBranch.status !== 'discarded' && snapshot.branches.length > 1 && (
            <button
              type="button"
              onClick={() => updateActiveBranch({ status: 'discarded' })}
              className="text-[11px] text-slate-400 hover:text-rose-300 px-2.5 py-1 rounded-lg border border-slate-800 cursor-pointer"
              title="ענף שנזרק מסומן ככזה ולא נמחק — נשמר כחומר למולטיורס"
            >
              סמן ענף כנזרק (ארכיון מולטיורס)
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODALS: Extended Character Card, Intervention Modal, Fork Modal
         ═══════════════════════════════════════════════════════════════ */}
      {inspectedEntity && inspectedMind && (
        <ExtendedCharacterModal
          entity={inspectedEntity}
          mind={inspectedMind}
          memories={inspectedMemories}
          branchProjectView={branchWorldView}
          activeBranch={activeBranch}
          aiSettings={aiSettings}
          onClose={() => setInspectedEntityId(null)}
          onOpenInWiki={(entityId) => {
            setInspectedEntityId(null);
            selectEntity(entityId, true);
          }}
          onUpdateMind={async (updated) => {
            await putSimRecord('minds', updated);
            await reloadSnapshot();
          }}
          onAddMemory={async (newMem) => {
            await putSimRecord('memories', newMem);
            await reloadSnapshot();
          }}
          onTriggerManualReflection={handleManualReflection}
        />
      )}

      {/* Intervention Modal ("התערבות: מזריק אירוע וממשיכים לרוץ") */}
      {showInterventionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!interventionText.trim()) return;
              const text = interventionText.trim();
              setShowInterventionModal(false);
              setInterventionText('');
              await handleRunTick({ intervention: text });
            }}
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-base">
                <Zap className="w-5 h-5" />
                <span>התערבות יזומה בעולם והרצת טיק</span>
              </div>
              <button
                type="button"
                onClick={() => setShowInterventionModal(false)}
                className="text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              הזרק אירוע חיצוני, אסון טבע, תגלית או שינוי פתאומי (למשל: <em>"רעידת אדמה מחריבה את השער הצפוני"</em> או <em>"מתגלה מכתב בגידה במועצה"</em>). הדמויות ומנוע העולם יגיבו אליו מיד בטיק הנוכחי.
            </p>
            <textarea
              rows={3}
              value={interventionText}
              onChange={(e) => setInterventionText(e.target.value)}
              placeholder="תאר את ההתערבות או האירוע שאתה מזריק לעולם..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-rose-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowInterventionModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                ביטול
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                הזרק והרץ טיק
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fork Branch Modal ("פיצול: מה היה קורה אם...") */}
      {showForkModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleForkBranch}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                <GitBranch className="w-5 h-5" />
                <span>פיצול ענף סימולציה חדש ("מה היה קורה אם...")</span>
              </div>
              <button
                type="button"
                onClick={() => setShowForkModal(false)}
                className="text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              הענף החדש יתפצל מ-<strong>{activeBranch.name}</strong> בטיק{' '}
              <strong>{activeBranch.currentTick}</strong> וישכפל את מצב התודעה והזיכרונות של כל הדמויות עד לנקודה זו.
            </p>
            <div className="space-y-2">
              <label className="block text-xs text-slate-300 font-semibold">שם הענף החדש:</label>
              <input
                type="text"
                value={forkName}
                onChange={(e) => setForkName(e.target.value)}
                placeholder="למשל: מה אם השערים נסגרו בזמן?"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-slate-300 font-semibold">תיאור (אופציונלי):</label>
              <input
                type="text"
                value={forkDesc}
                onChange={(e) => setForkDesc(e.target.value)}
                placeholder="תיאור קצר של ההיפותזה בענף זה..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForkModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                ביטול
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                צור ענף חדש
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

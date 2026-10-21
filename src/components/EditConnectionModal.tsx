import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Network,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  Trash2,
  Check,
  Clock,
  Sparkles,
  Search,
  Info,
} from 'lucide-react';
import { Entity, EntityRelation, Project, RelationType } from '../types/worldify';
import { CategoryIcon } from './CategoryBadge';
import { categoryColor, categoryLabel } from '../utils/categories';
import { formatTickToDate } from '../utils/calendarEngine';

export interface EditConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  activeEntity: Entity;
  relation?: EntityRelation | null;
  onSave: (
    relData: {
      sourceEntityId: string;
      targetEntityId: string;
      type: RelationType;
      label: string;
      bidirectional?: boolean;
      validFromTick?: number;
      validToTick?: number;
    },
    existingId?: string
  ) => void;
  onDelete?: (relId: string) => void;
}

const RELATION_TYPE_PRESETS: Array<{
  type: RelationType;
  label: string;
  defaultLabel: string;
  suggestions: string[];
}> = [
  {
    type: 'allied_with',
    label: 'Allied With',
    defaultLabel: 'allied with',
    suggestions: ['Allied with', 'Protector of', 'Sworn vassal of', 'Trade partner', 'Pact bound'],
  },
  {
    type: 'rival_of',
    label: 'Rival / Enemy Of',
    defaultLabel: 'rival of',
    suggestions: ['Arch-enemy of', 'At war with', 'Feuding with', 'Nemesis of', 'Rival school'],
  },
  {
    type: 'located_in',
    label: 'Located In',
    defaultLabel: 'located in',
    suggestions: ['Located in', 'Capital of', 'Stationed in', 'Native to', 'Buried in'],
  },
  {
    type: 'ruled_by',
    label: 'Ruled / Governed By',
    defaultLabel: 'ruled by',
    suggestions: ['Ruled by', 'Governed by', 'Commanded by', 'Vassal to', 'High Council of'],
  },
  {
    type: 'member_of',
    label: 'Member Of',
    defaultLabel: 'member of',
    suggestions: ['Member of', 'Founding member of', 'High Knight of', 'Commander in', 'Initiate of'],
  },
  {
    type: 'wields',
    label: 'Wields / Holds',
    defaultLabel: 'wields',
    suggestions: ['Wields', 'Bearer of', 'Keeper of', 'Attuned to', 'Guardian of'],
  },
  {
    type: 'created_by',
    label: 'Created / Forged By',
    defaultLabel: 'created by',
    suggestions: ['Created by', 'Forged by', 'Authored by', 'Founded by', 'Bred by'],
  },
  {
    type: 'parent_of',
    label: 'Parent / Predecessor Of',
    defaultLabel: 'parent of',
    suggestions: ['Parent of', 'Predecessor to', 'Founder of', 'Ancestor of', 'Mentor to'],
  },
  {
    type: 'connected_portal',
    label: 'Portal / Tether Connection',
    defaultLabel: 'connected to',
    suggestions: ['Planar rift to', 'Astral sea route to', 'Gateway to', 'Orbital tether to'],
  },
  {
    type: 'mention',
    label: 'Lore Mention',
    defaultLabel: 'mentions in lore',
    suggestions: ['Mentions in lore', 'References', 'Prophesied with', 'Historical footnote'],
  },
  {
    type: 'property_ref',
    label: 'Property Reference',
    defaultLabel: 'referenced in property',
    suggestions: ['Referenced in property', 'Associated with', 'Affiliated with'],
  },
];

export const EditConnectionModal: React.FC<EditConnectionModalProps> = ({
  isOpen,
  onClose,
  project,
  activeEntity,
  relation,
  onSave,
  onDelete,
}) => {
  const isEditing = !!relation;
  const isAuto = relation ? relation.id.startsWith('auto-') : false;

  // Determine other entity
  const initialOtherId = useMemo(() => {
    if (!relation) {
      const firstOther = project.entities.find((e) => e.id !== activeEntity.id);
      return firstOther ? firstOther.id : '';
    }
    return relation.sourceEntityId === activeEntity.id
      ? relation.targetEntityId
      : relation.sourceEntityId;
  }, [relation, project.entities, activeEntity.id]);

  // Determine direction
  // 'outgoing': active -> target
  // 'incoming': target -> active
  // 'bidirectional': mutual
  const initialDirection = useMemo<'outgoing' | 'incoming' | 'bidirectional'>(() => {
    if (!relation) return 'outgoing';
    if (relation.bidirectional) return 'bidirectional';
    return relation.sourceEntityId === activeEntity.id ? 'outgoing' : 'incoming';
  }, [relation, activeEntity.id]);

  const [targetId, setTargetId] = useState(initialOtherId);
  const [direction, setDirection] = useState<'outgoing' | 'incoming' | 'bidirectional'>(
    initialDirection
  );
  const [relType, setRelType] = useState<RelationType>(
    relation?.type || 'allied_with'
  );
  const [label, setLabel] = useState(relation?.label || '');
  const [isTimeBound, setIsTimeBound] = useState(
    relation?.validFromTick !== undefined || relation?.validToTick !== undefined
  );
  const [fromTick, setFromTick] = useState<string>(
    relation?.validFromTick !== undefined ? String(relation.validFromTick) : ''
  );
  const [toTick, setToTick] = useState<string>(
    relation?.validToTick !== undefined ? String(relation.validToTick) : ''
  );
  const [searchTarget, setSearchTarget] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync state whenever relation or isOpen changes
  useEffect(() => {
    if (isOpen) {
      setTargetId(initialOtherId);
      setDirection(initialDirection);
      setRelType(relation?.type || 'allied_with');
      setLabel(relation?.label || '');
      setIsTimeBound(
        relation?.validFromTick !== undefined || relation?.validToTick !== undefined
      );
      setFromTick(
        relation?.validFromTick !== undefined ? String(relation.validFromTick) : ''
      );
      setToTick(
        relation?.validToTick !== undefined ? String(relation.validToTick) : ''
      );
      setSearchTarget('');
      setConfirmDelete(false);
    }
  }, [isOpen, relation, initialOtherId, initialDirection]);

  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];

  const candidateEntities = useMemo(() => {
    const list = project.entities.filter((e) => e.id !== activeEntity.id);
    if (!searchTarget.trim()) return list;
    const q = searchTarget.toLowerCase();
    return list.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [project.entities, activeEntity.id, searchTarget]);

  const selectedTargetEntity = useMemo(
    () => project.entities.find((e) => e.id === targetId),
    [project.entities, targetId]
  );

  const currentPreset = useMemo(
    () => RELATION_TYPE_PRESETS.find((p) => p.type === relType) || RELATION_TYPE_PRESETS[0],
    [relType]
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId || targetId === activeEntity.id) return;

    let sourceId: string;
    let destId: string;
    let isBidi = false;

    if (direction === 'bidirectional') {
      sourceId = activeEntity.id;
      destId = targetId;
      isBidi = true;
    } else if (direction === 'incoming') {
      sourceId = targetId;
      destId = activeEntity.id;
    } else {
      sourceId = activeEntity.id;
      destId = targetId;
    }

    const trimmedLabel = label.trim() || currentPreset.defaultLabel;

    const parsedFromTick = isTimeBound && fromTick.trim() !== '' ? Number(fromTick) : undefined;
    const parsedToTick = isTimeBound && toTick.trim() !== '' ? Number(toTick) : undefined;

    onSave(
      {
        sourceEntityId: sourceId,
        targetEntityId: destId,
        type: relType,
        label: trimmedLabel,
        bidirectional: isBidi,
        validFromTick: Number.isNaN(parsedFromTick) ? undefined : parsedFromTick,
        validToTick: Number.isNaN(parsedToTick) ? undefined : parsedToTick,
      },
      isAuto ? undefined : relation?.id
    );

    onClose();
  };

  const handleDelete = () => {
    if (!relation || isAuto) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (onDelete) {
      onDelete(relation.id);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                {isEditing
                  ? isAuto
                    ? 'Customize Auto Connection'
                    : 'Edit Connection'
                  : 'Add New Connection'}
              </h2>
              <p className="text-xs text-slate-400">
                Wiki entry: <span className="text-slate-200 font-medium">{activeEntity.title}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Auto-detected notification banner */}
          {isAuto && (
            <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-800/60 flex items-start gap-2.5 text-sky-200">
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sky-300">Auto-detected connection</p>
                <p className="text-xs text-sky-200/80 mt-0.5">
                  This connection was inferred from lore references or property links. Saving your changes will convert it into an explicit semantic relation.
                </p>
              </div>
            </div>
          )}

          {/* Connected Entity Selection */}
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-300">
              Connected Entry <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter entries by name or category..."
                value={searchTarget}
                onChange={(e) => setSearchTarget(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 mb-1.5"
              />
            </div>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
              required
            >
              {candidateEntities.length === 0 ? (
                <option value="" disabled>
                  No matching entries found
                </option>
              ) : (
                candidateEntities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.title} ({categoryLabel(ent.category)})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Direction Selector */}
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-300">Direction & Hierarchy</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDirection('outgoing')}
                className={`px-3 py-2 rounded-lg border text-left flex flex-col gap-1 transition-colors cursor-pointer ${
                  direction === 'outgoing'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                  <span>Outgoing</span>
                </div>
                <span className="text-[10px] text-slate-400 truncate">
                  {activeEntity.title} → {selectedTargetEntity?.title || 'Target'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDirection('incoming')}
                className={`px-3 py-2 rounded-lg border text-left flex flex-col gap-1 transition-colors cursor-pointer ${
                  direction === 'incoming'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <ArrowLeft className="w-3.5 h-3.5 text-sky-400" />
                  <span>Incoming</span>
                </div>
                <span className="text-[10px] text-slate-400 truncate">
                  {selectedTargetEntity?.title || 'Target'} → {activeEntity.title}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDirection('bidirectional')}
                className={`px-3 py-2 rounded-lg border text-left flex flex-col gap-1 transition-colors cursor-pointer ${
                  direction === 'bidirectional'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mutual</span>
                </div>
                <span className="text-[10px] text-slate-400 truncate">
                  {activeEntity.title} ↔ {selectedTargetEntity?.title || 'Target'}
                </span>
              </button>
            </div>
          </div>

          {/* Relationship Type */}
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-300">Relationship Type</label>
            <select
              value={relType}
              onChange={(e) => {
                const nextType = e.target.value as RelationType;
                setRelType(nextType);
                const nextPreset = RELATION_TYPE_PRESETS.find((p) => p.type === nextType);
                if (nextPreset && (!label || label === currentPreset.defaultLabel)) {
                  setLabel(nextPreset.defaultLabel);
                }
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
            >
              {RELATION_TYPE_PRESETS.map((preset) => (
                <option key={preset.type} value={preset.type}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {/* Relationship Label / Custom phrasing */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block font-medium text-slate-300">Custom Label / Phrasing</label>
              <span className="text-[10px] text-slate-500">e.g. &ldquo;Arch-nemesis&rdquo;, &ldquo;Capital city of&rdquo;</span>
            </div>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={currentPreset.defaultLabel}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
            />
            {/* Quick Suggestions */}
            {currentPreset.suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500">Suggestions:</span>
                {currentPreset.suggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setLabel(sug.toLowerCase())}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Timeline & Era Scope (Time-bound connections) */}
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isTimeBound}
                onChange={(e) => setIsTimeBound(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0"
              />
              <span className="font-medium text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Time-Bound Connection (Valid during specific Era / Ticks)
              </span>
            </label>

            {isTimeBound && (
              <div className="pt-2 space-y-2 border-t border-slate-800/80">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Valid From Tick
                    </label>
                    <input
                      type="number"
                      value={fromTick}
                      onChange={(e) => setFromTick(e.target.value)}
                      placeholder="Start Tick (e.g. 0)"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                    />
                    {fromTick.trim() !== '' && !Number.isNaN(Number(fromTick)) && calendar && (
                      <span className="block text-[10px] text-amber-400/80 mt-1 truncate">
                        {formatTickToDate(calendar, Number(fromTick)).displayShort}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Valid To Tick (Optional)
                    </label>
                    <input
                      type="number"
                      value={toTick}
                      onChange={(e) => setToTick(e.target.value)}
                      placeholder="End Tick (optional)"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                    />
                    {toTick.trim() !== '' && !Number.isNaN(Number(toTick)) && calendar && (
                      <span className="block text-[10px] text-amber-400/80 mt-1 truncate">
                        {formatTickToDate(calendar, Number(toTick)).displayShort}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFromTick(String(project.currentTick));
                  }}
                  className="text-[10px] text-amber-400 hover:text-amber-300 underline cursor-pointer"
                >
                  Set &ldquo;Valid From&rdquo; to current project tick ({project.currentTick})
                </button>
              </div>
            )}
          </div>

          {/* Live Preview Sentence */}
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1.5">
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Live Relationship Preview
            </span>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span
                className="px-2 py-0.5 rounded font-medium text-slate-100 flex items-center gap-1.5"
                style={{
                  backgroundColor: `${categoryColor(activeEntity.category)}25`,
                  border: `1px solid ${categoryColor(activeEntity.category)}50`,
                }}
              >
                <CategoryIcon category={activeEntity.category} size="sm" />
                {activeEntity.title}
              </span>

              {direction === 'bidirectional' ? (
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  ↔ {label.trim() || currentPreset.defaultLabel} ↔
                </span>
              ) : direction === 'incoming' ? (
                <span className="text-sky-400 font-medium flex items-center gap-1">
                  ← {label.trim() || currentPreset.defaultLabel} (from) ──
                </span>
              ) : (
                <span className="text-amber-400 font-medium flex items-center gap-1">
                  ── {label.trim() || currentPreset.defaultLabel} →
                </span>
              )}

              {selectedTargetEntity ? (
                <span
                  className="px-2 py-0.5 rounded font-medium text-slate-100 flex items-center gap-1.5"
                  style={{
                    backgroundColor: `${categoryColor(selectedTargetEntity.category)}25`,
                    border: `1px solid ${categoryColor(selectedTargetEntity.category)}50`,
                  }}
                >
                  <CategoryIcon category={selectedTargetEntity.category} size="sm" />
                  {selectedTargetEntity.title}
                </span>
              ) : (
                <span className="text-slate-500 italic">[Select an entry]</span>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            {isEditing && !isAuto ? (
              <div>
                {confirmDelete ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-2.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs cursor-pointer"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2 py-1.5 rounded text-slate-400 hover:text-slate-200 cursor-pointer text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="px-2.5 py-1.5 rounded text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 flex items-center gap-1 text-xs cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Connection
                  </button>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!targetId || targetId === activeEntity.id}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:hover:bg-amber-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                {isEditing ? (isAuto ? 'Convert & Save' : 'Save Changes') : 'Create Connection'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

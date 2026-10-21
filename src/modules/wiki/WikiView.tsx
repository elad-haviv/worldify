import React, { useRef, useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import {
  CustomProperty,
  EntityCategory,
  EntityRelation,
  RelationType,
} from '../../types/worldify';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { computeAllProjectRelations } from '../../utils/wikiParser';
import { resolveEntityTemporalStatus } from '../../utils/spatioTemporalResolver';
import { formatTickToDate } from '../../utils/calendarEngine';
import { runInlineWikiAI } from '../../services/aiService';
import {
  BookOpen,
  Plus,
  Search,
  Tag,
  Sparkles,
  Eye,
  Edit3,
  Columns,
  Trash2,
  Link2,
  MapPin,
  Clock,
  Wand2,
  Network,
  Layers,
  Check,
  Globe2,
  ChevronDown,
  Download,
  MessageSquare,
} from 'lucide-react';
import { ExportModal } from '../../components/ExportModal';
import { EditConnectionModal } from '../../components/EditConnectionModal';
import { SidePanel } from '../../components/SidePanel';
import { CategoryTree } from '../../components/CategoryTree';
import { CategoryPicker } from '../../components/CategoryPicker';
import { CategoryIcon } from '../../components/CategoryBadge';
import { MarkdownToolbar, MarkdownToolbarHandle } from '../../components/MarkdownToolbar';
import { MarkdownEditor, MarkdownEditorHandle } from '../../components/MarkdownEditor';
import { collectProjectImages, saveImageAsset } from '../../utils/assetStore';
import { AIToolsMenu } from '../../components/AIToolsMenu';
import {
  categoryColor,
  categoryLabel,
  getEntitySubcategory,
} from '../../utils/categories';
import { resolveCategoryIcon } from '../../utils/categoryIcons';

export const WikiView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedEntityId,
    selectEntity,
    createEntity,
    updateEntity,
    deleteEntity,
    addRelation,
    updateRelation,
    deleteRelation,
    addEntitySpatialKeyframe,
    deleteEntitySpatialKeyframe,
    selectMap,
    setCurrentTick,
    setActiveModule,
    aiSettings,
    openCharacterChat,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<EntityCategory | 'all'>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [worldFilter, setWorldFilter] = useState<string>('all');
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [editorMode, setEditorMode] = useState<'split' | 'edit' | 'preview'>('preview');
  const [isAiBusy, setIsAiBusy] = useState(false);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const toolbarRef = useRef<MarkdownToolbarHandle>(null);

  // New Entry Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCat, setNewCat] = useState<EntityCategory>('character');
  const [newSubcat, setNewSubcat] = useState<string>('');
  const [newTplId, setNewTplId] = useState('');
  const [newSummary, setNewSummary] = useState('');

  // Custom Property Form
  const [newPropLabel, setNewPropLabel] = useState('');
  const [newPropVal, setNewPropVal] = useState('');
  const [newPropType, setNewPropType] = useState<CustomProperty['type']>('text');

  // New Relation Form
  const [relTargetId, setRelTargetId] = useState('');
  const [relType, setRelType] = useState<RelationType>('allied_with');
  const [relLabel, setRelLabel] = useState('');
  const [editingRelation, setEditingRelation] = useState<EntityRelation | null | undefined>(undefined);

  // New Spatial Keyframe Form
  const [kfMapId, setKfMapId] = useState('');
  const [kfTick, setKfTick] = useState<number>(0);
  const [kfX, setKfX] = useState<number>(500);
  const [kfY, setKfY] = useState<number>(500);
  const [kfPathId, setKfPathId] = useState<string>('');
  const [kfNote, setKfNote] = useState('');

  // New Tag Input
  const [tagInput, setTagInput] = useState('');

  if (!project) return null;

  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];

  // Collect all unique tags across project
  const allTags = Array.from(
    new Set(project.entities.flatMap((e) => e.tags))
  ).sort();

  const filteredEntities = project.entities.filter((ent) => {
    if (selectedCategory !== 'all' && ent.category !== selectedCategory) return false;
    if (selectedTag && !ent.tags.includes(selectedTag)) return false;
    if (worldFilter !== 'all' && ent.worldId !== worldFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        ent.title.toLowerCase().includes(q) ||
        ent.summary.toLowerCase().includes(q) ||
        ent.tags.some((t) => t.toLowerCase().includes(q)) ||
        ent.contentMd.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeEntity =
    project.entities.find((e) => e.id === selectedEntityId) || filteredEntities[0] || null;

  const categoryCounts: Partial<Record<EntityCategory, number>> = {};
  project.entities.forEach((e) => (categoryCounts[e.category] = (categoryCounts[e.category] ?? 0) + 1));

  const activeTemplate = activeEntity
    ? project.templates.find((t) => t.id === activeEntity.templateId)
    : undefined;
  const activeSubcategory = activeEntity
    ? getEntitySubcategory(activeEntity, project)
    : undefined;

  const allRelations = computeAllProjectRelations(project);
  const entityRelations = activeEntity
    ? allRelations.filter(
        (r) => r.sourceEntityId === activeEntity.id || r.targetEntityId === activeEntity.id
      )
    : [];

  // Only show a dated status for entries that actually have dates.
  const hasTimeline =
    !!activeEntity &&
    (activeEntity.lifecycleStartTick !== undefined ||
      activeEntity.lifecycleEndTick !== undefined ||
      activeEntity.temporalStates.length > 0);
  const temporalStatus =
    activeEntity && hasTimeline ? resolveEntityTemporalStatus(activeEntity, project.currentTick, calendar) : null;

  const handleCreateEntity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createEntity({
      title: newTitle.trim(),
      category: newCat,
      subcategory: newSubcat || undefined,
      templateId: newTplId || undefined,
      summary: newSummary.trim() || undefined,
    });
    setNewTitle('');
    setNewSummary('');
    setNewSubcat('');
    setShowNewModal(false);
  };

  const handleInlineAI = async (action: 'expand' | 'sensory' | 'hooks' | 'autolink') => {
    if (!activeEntity || isAiBusy) return;
    setIsAiBusy(true);
    try {
      const updatedMd = await runInlineWikiAI(project, activeEntity, action, aiSettings);
      updateEntity(activeEntity.id, { contentMd: updatedMd });
    } finally {
      setIsAiBusy(false);
    }
  };

  const handleAddCustomProperty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEntity || !newPropLabel.trim() || !newPropVal.trim()) return;
    const key = newPropLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const updatedProps: CustomProperty[] = [
      ...(activeEntity.customProperties || []),
      {
        key,
        label: newPropLabel.trim(),
        value: newPropVal.trim(),
        type: newPropType,
      },
    ];
    updateEntity(activeEntity.id, { customProperties: updatedProps });
    setNewPropLabel('');
    setNewPropVal('');
  };

  const handleAddRelation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEntity) return;
    const targetId =
      relTargetId || project.entities.find((en) => en.id !== activeEntity.id)?.id;
    if (!targetId || targetId === activeEntity.id) return;
    addRelation({
      sourceEntityId: activeEntity.id,
      targetEntityId: targetId,
      type: relType,
      label: relLabel.trim() || relType.replace(/_/g, ' '),
    });
    setRelLabel('');
  };

  const handleAddKeyframe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEntity) return;
    const mapId = kfMapId || project.maps[0]?.id;
    if (!mapId) return;
    addEntitySpatialKeyframe(activeEntity.id, {
      mapId,
      tick: kfTick || project.currentTick,
      x: kfX,
      y: kfY,
      pathId: kfPathId || undefined,
      statusNote: kfNote.trim() || `Stationed at (${kfX}, ${kfY})`,
    });
    setKfNote('');
  };

  const insertWikiLinkAtEnd = (targetEntityTitle: string) => {
    if (!activeEntity) return;
    updateEntity(activeEntity.id, {
      contentMd: `${activeEntity.contentMd} [[${targetEntityTitle}]]`,
    });
  };

  return (
    <div className="h-full flex bg-slate-950 overflow-hidden">
      {/* Left Sidebar: Categories, Tags, Search & Entry List */}
      <SidePanel side="left" panelId="wiki-entries" label="Entries" width="w-72 lg:w-80" defaultOpen={true} className="flex flex-col">
        <div className="p-3.5 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              Entries
            </h2>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Entry
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter entries or markdown..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* World filter */}
          {project.worlds.length > 1 && (
            <div className="relative">
              <Globe2 className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={worldFilter}
                onChange={(e) => setWorldFilter(e.target.value)}
                className="w-full appearance-none bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="all">All worlds</option>
                {project.worlds.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* Tag Filter Pills */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className={`shrink-0 px-2 py-0.5 rounded-full text-xs border cursor-pointer ${
                  selectedTag === null
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                All Tags
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`shrink-0 px-2 py-0.5 rounded-full text-xs border cursor-pointer ${
                    selectedTag === tag
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Entries, grouped by category */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden pt-2">
          <CategoryTree
            projectId={project.id}
            entities={filteredEntities}
            templates={project.templates}
            activeId={activeEntity?.id ?? null}
            onSelect={(id) => selectEntity(id)}
            onRequestNewEntry={(cat, subId) => {
              setNewCat(cat);
              setNewSubcat(subId || '');
              setShowNewModal(true);
            }}
            forceOpen={!!searchQuery.trim() || !!selectedTag}
          />
        </div>
      </SidePanel>

      {/* Center: Hybrid Markdown Editor, AI Toolbar & Live Preview */}
      {activeEntity ? (
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Entry Header Bar */}
          <div className="px-8 pt-6 pb-4 border-b border-slate-800 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 flex-1 min-w-[260px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                <span className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCatPicker(!showCatPicker)}
                    title="Change category or subcategory"
                    className="flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-md hover:bg-slate-800 cursor-pointer"
                  >
                    <CategoryIcon category={activeEntity.category} size="sm" />
                    <span
                      className="font-medium"
                      style={{ color: categoryColor(activeEntity.category, project) }}
                    >
                      {categoryLabel(activeEntity.category, project)}
                    </span>
                    {activeSubcategory && (
                      <>
                        <span className="text-slate-600">/</span>
                        <span className="flex items-center gap-1.5 text-slate-200">
                          {(() => {
                            const SubIcon = resolveCategoryIcon(activeSubcategory.icon || 'Folder');
                            return (
                              <span
                                className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                                style={{
                                  backgroundColor: `${activeSubcategory.color}22`,
                                  color: activeSubcategory.color,
                                  boxShadow: `inset 0 0 0 1px ${activeSubcategory.color}40`,
                                }}
                              >
                                <SubIcon className="w-2.5 h-2.5" />
                              </span>
                            );
                          })()}
                          {activeSubcategory.name}
                        </span>
                      </>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                  {showCatPicker && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowCatPicker(false)} />
                      <div className="absolute left-0 top-full mt-1 z-40 w-[28rem] p-3.5 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-slate-300">
                            Category & Subcategory
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowCatPicker(false)}
                            className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                        <CategoryPicker
                          value={activeEntity.category}
                          subcategoryValue={activeSubcategory?.id ?? ''}
                          counts={categoryCounts}
                          onChange={(c) => {
                            updateEntity(activeEntity.id, { category: c, subcategory: '' });
                          }}
                          onSubcategoryChange={(subId) => {
                            updateEntity(activeEntity.id, { subcategory: subId });
                          }}
                        />
                      </div>
                    </>
                  )}
                </span>
                {activeTemplate && (
                  <button
                    type="button"
                    onClick={() => setActiveModule('templates')}
                    className="hover:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                    title="Edit this template"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    {activeTemplate.name}
                  </button>
                )}
                {temporalStatus && (
                  <span className="flex items-center gap-1.5" title="Status at the current world date">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        temporalStatus.lifecycleState === 'active'
                          ? 'bg-emerald-400'
                          : temporalStatus.lifecycleState === 'unborn'
                            ? 'bg-slate-500'
                            : 'bg-rose-400'
                      }`}
                    />
                    {temporalStatus.activeStatus}
                    {temporalStatus.ageYears !== undefined
                      ? ` (${temporalStatus.ageYears} yrs old)`
                      : ''}
                  </span>
                )}
              </div>

              <input
                type="text"
                value={activeEntity.title}
                onChange={(e) => updateEntity(activeEntity.id, { title: e.target.value })}
                className="w-full text-3xl font-display font-bold text-slate-50 bg-transparent focus:outline-none pt-1"
              />
              <input
                type="text"
                value={activeEntity.subtitle || ''}
                onChange={(e) => updateEntity(activeEntity.id, { subtitle: e.target.value })}
                placeholder="Add subtitle or epithet..."
                className="w-full text-base text-slate-400 italic bg-transparent focus:outline-none"
              />
            </div>

            {/* Editor Mode & AI Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <AIToolsMenu
                busy={isAiBusy}
                onRun={handleInlineAI}
                items={[
                  { action: 'expand', icon: Wand2, title: 'Expand lore', hint: 'Write more detail for this entry' },
                  { action: 'sensory', icon: Sparkles, title: 'Add atmosphere', hint: 'Sights, sounds and smells' },
                  { action: 'hooks', icon: Plus, title: 'Plot hooks', hint: 'Story ideas involving this entry' },
                  { action: 'autolink', icon: Link2, title: 'Auto-link mentions', hint: 'Turn names into wiki links' },
                ]}
              />

              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setEditorMode('edit')}
                  className={`p-1.5 rounded-md cursor-pointer ${
                    editorMode === 'edit'
                      ? 'bg-slate-800 text-amber-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Edit"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('split')}
                  className={`p-1.5 rounded-md cursor-pointer ${
                    editorMode === 'split'
                      ? 'bg-slate-800 text-amber-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Edit with preview side by side"
                >
                  <Columns className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('preview')}
                  className={`p-1.5 rounded-md cursor-pointer ${
                    editorMode === 'preview'
                      ? 'bg-slate-800 text-amber-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Read"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>

              {/* In-World Character Chat Action */}
              {(activeEntity.category === 'character' ||
                activeEntity.category === 'deity' ||
                activeEntity.category === 'species') && (
                <button
                  type="button"
                  onClick={() => openCharacterChat(activeEntity.id)}
                  className="h-9 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm shadow-amber-500/10"
                  title={`Initiate an AI dialogue with ${activeEntity.title}`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat with {activeEntity.title}</span>
                </button>
              )}

              {/* Connections Action */}
              <button
                type="button"
                onClick={() => setEditingRelation(null)}
                className="h-9 px-3 rounded-lg border border-slate-800 hover:border-amber-500/50 hover:bg-slate-800 text-slate-300 hover:text-amber-300 text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Manage and add connections for this entry"
              >
                <Network className="w-3.5 h-3.5 text-amber-400" />
                <span>Connections ({entityRelations.length})</span>
              </button>

              {/* Export Page Action */}
              <button
                type="button"
                onClick={() => setShowExportModal(true)}
                className="h-9 px-3 rounded-lg border border-slate-800 hover:border-amber-500/50 hover:bg-slate-800 text-slate-300 hover:text-amber-300 text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Export page to PDF, Word (.docx), or Markdown (.md)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>

              <button
                type="button"
                onClick={() => deleteEntity(activeEntity.id)}
                className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/15 hover:text-rose-400 cursor-pointer"
                title="Delete entry"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Split / Edit / Preview Area */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {(editorMode === 'edit' || editorMode === 'split') && (
              <div
                className={`flex-1 flex flex-col h-full ${
                  editorMode === 'split' ? 'border-r border-slate-800' : ''
                }`}
              >
                <MarkdownToolbar
                  ref={toolbarRef}
                  editorRef={editorRef}
                  entities={project.entities.filter((e) => e.id !== activeEntity.id)}
                  status={`${activeEntity.contentMd.trim().split(/\s+/).filter(Boolean).length} words`}
                  getImages={() => collectProjectImages(project)}
                  onUploadImage={(file) => saveImageAsset(file, file.name, project.id)}
                />
                <div className="flex-1 min-h-0">
                  <MarkdownEditor
                    ref={editorRef}
                    docKey={activeEntity.id}
                    value={activeEntity.contentMd}
                    onChange={(v) => updateEntity(activeEntity.id, { contentMd: v })}
                    entities={project.entities}
                    placeholder="Write your wiki entry… type [[ to link another entry"
                    onRequestLink={() => toolbarRef.current?.openLinkPicker()}
                    getImages={() => collectProjectImages(project)}
                    onUploadImage={(file) => saveImageAsset(file, file.name, project.id)}
                  />
                </div>
              </div>
            )}

            {(editorMode === 'preview' || editorMode === 'split') && (
              <div className="flex-1 h-full overflow-y-auto">
               <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
                {/* Summary */}
                <div className="pl-4 border-l-2 border-amber-500/50">
                  <label className="block text-xs text-slate-500 mb-1">
                    Summary
                  </label>
                  <input
                    type="text"
                    value={activeEntity.summary}
                    onChange={(e) =>
                      updateEntity(activeEntity.id, { summary: e.target.value })
                    }
                    className="w-full bg-transparent text-base text-slate-200 focus:outline-none"
                  />
                </div>

                {/* Rendered Markdown with Interactive [[WikiLinks]] */}
                <MarkdownRenderer
                  content={activeEntity.contentMd}
                  project={project}
                  onSelectEntity={(id) => selectEntity(id)}
                  onCreateStubEntity={(title) =>
                    createEntity({ title, category: 'character' })
                  }
                />

                {/* Backlinks & Graph Connections Section */}
                <div className="pt-6 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                      <Network className="w-4 h-4 text-slate-400" />
                      Connections ({entityRelations.length})
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingRelation(null)}
                        className="px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Connection</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveModule('graph')}
                        className="text-xs text-slate-400 hover:text-amber-300 cursor-pointer"
                      >
                        Open in graph →
                      </button>
                    </div>
                  </div>

                  {entityRelations.length === 0 ? (
                    <div className="p-4 rounded-lg bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-2">
                      <p className="text-xs text-slate-500">No connections linked to this entry yet.</p>
                      <button
                        type="button"
                        onClick={() => setEditingRelation(null)}
                        className="text-xs text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Link to another entry</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {entityRelations.map((rel) => {
                        const isOutgoing = rel.sourceEntityId === activeEntity.id;
                        const otherId = isOutgoing ? rel.targetEntityId : rel.sourceEntityId;
                        const other = project.entities.find((e) => e.id === otherId);
                        if (!other) return null;
                        const isAuto = rel.id.startsWith('auto-');

                        return (
                          <div
                            key={rel.id}
                            className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors flex items-center justify-between gap-2 text-xs group/card"
                          >
                            <button
                              type="button"
                              onClick={() => selectEntity(other.id)}
                              className="text-left min-w-0 flex-1 cursor-pointer group"
                            >
                              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                                {rel.bidirectional ? (
                                  <span className="text-emerald-400 font-medium">↔ {rel.label}</span>
                                ) : isOutgoing ? (
                                  <span className="text-amber-400 font-medium">→ {rel.label}</span>
                                ) : (
                                  <span className="text-sky-400 font-medium">← {rel.label} (from)</span>
                                )}
                                {isAuto && (
                                  <span
                                    className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-400 border border-slate-700/60"
                                    title="Auto-extracted from wiki mentions or properties"
                                  >
                                    Auto
                                  </span>
                                )}
                              </div>
                              <div className="font-semibold text-slate-200 group-hover:text-amber-300 truncate mt-0.5 flex items-center gap-1.5">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: categoryColor(other.category) }}
                                />
                                {other.title}
                              </div>
                            </button>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditingRelation(rel)}
                                className="p-1.5 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer transition-colors"
                                title={isAuto ? 'Customize connection' : 'Edit connection'}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {!isAuto && (
                                <button
                                  type="button"
                                  onClick={() => deleteRelation(rel.id)}
                                  className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                                  title="Remove connection"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
               </div>
              </div>
            )}
          </div>
        </main>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
          Select or create a Wiki Entry to begin editing.
        </div>
      )}

      {/* Right Inspector: Template Fields, Custom Properties, Tags & Spatio-Temporal Keyframes */}
      {activeEntity && (
        <SidePanel side="right" panelId="wiki-properties" label="Properties" width="w-80" defaultOpen={false} className="overflow-y-auto p-4 space-y-5 text-sm">
          {/* Tags Section */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {activeEntity.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-xs text-slate-300 whitespace-nowrap"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() =>
                      updateEntity(activeEntity.id, {
                        tags: activeEntity.tags.filter((x) => x !== t),
                      })
                    }
                    className="text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cleaned = tagInput.trim().toLowerCase().replace(/^#/, '');
                if (!cleaned || activeEntity.tags.includes(cleaned)) return;
                updateEntity(activeEntity.id, {
                  tags: [...activeEntity.tags, cleaned],
                });
                setTagInput('');
              }}
              className="flex gap-1.5"
            >
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              />
              <button
                type="submit"
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                +
              </button>
            </form>
          </div>

          {/* Template Schema Properties */}
          {activeTemplate && (
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  {activeTemplate.name} Fields
                </span>
                <button
                  type="button"
                  onClick={() => setActiveModule('templates')}
                  className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Edit Schema
                </button>
              </div>

              {activeTemplate.fields.map((field) => {
                const val = activeEntity.templateValues[field.key] ?? '';
                return (
                  <div key={field.key} className="space-y-1">
                    <label className="block text-xs text-slate-400">{field.label}</label>
                    {field.type === 'entity_ref' ? (
                      <div className="flex gap-1">
                        <select
                          value={String(val)}
                          onChange={(e) =>
                            updateEntity(activeEntity.id, {
                              templateValues: {
                                ...activeEntity.templateValues,
                                [field.key]: e.target.value,
                              },
                            })
                          }
                          className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
                        >
                          <option value="">— None —</option>
                          {project.entities
                            .filter((e) => e.id !== activeEntity.id)
                            .map((peer) => (
                              <option key={peer.id} value={peer.id}>
                                {peer.title} ({categoryLabel(peer.category)})
                              </option>
                            ))}
                        </select>
                        {val && (
                          <button
                            type="button"
                            onClick={() => selectEntity(String(val))}
                            className="px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs cursor-pointer"
                            title="Jump to linked entity"
                          >
                            Go
                          </button>
                        )}
                      </div>
                    ) : field.type === 'select' ? (
                      <select
                        value={String(val)}
                        onChange={(e) =>
                          updateEntity(activeEntity.id, {
                            templateValues: {
                              ...activeEntity.templateValues,
                              [field.key]: e.target.value,
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
                      >
                        <option value="">— Select —</option>
                        {(field.options || []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={String(val)}
                        onChange={(e) =>
                          updateEntity(activeEntity.id, {
                            templateValues: {
                              ...activeEntity.templateValues,
                              [field.key]:
                                field.type === 'number'
                                  ? Number(e.target.value)
                                  : e.target.value,
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Ad-Hoc Custom Properties */}
          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <span className="block text-sm font-semibold text-slate-300">
              Custom Ad-Hoc Properties
            </span>

            <div className="space-y-1.5">
              {(activeEntity.customProperties || []).map((prop, idx) => (
                <div
                  key={`${prop.key}-${idx}`}
                  className="flex items-center justify-between gap-2 p-2 rounded bg-slate-950 border border-slate-800"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400">{prop.label}</div>
                    <div className="text-xs font-medium text-slate-200 truncate">
                      {prop.value}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateEntity(activeEntity.id, {
                        customProperties: activeEntity.customProperties.filter(
                          (_, i) => i !== idx
                        ),
                      })
                    }
                    className="text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddCustomProperty} className="space-y-1.5 pt-1">
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={newPropLabel}
                  onChange={(e) => setNewPropLabel(e.target.value)}
                  placeholder="Property label"
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                />
                <select
                  value={newPropType}
                  onChange={(e) =>
                    setNewPropType(e.target.value as CustomProperty['type'])
                  }
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="entity_ref">Entity Ref</option>
                </select>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newPropVal}
                  onChange={(e) => setNewPropVal(e.target.value)}
                  placeholder="Value..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs cursor-pointer"
                >
                  Add
                </button>
              </div>
            </form>
          </div>

          {/* Lifespan & Spatio-Temporal Map Keyframes */}
          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              Map & Timeline Integration
            </span>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-0.5">
                  Birth / Founding Tick
                </label>
                <input
                  type="number"
                  value={activeEntity.lifecycleStartTick ?? ''}
                  placeholder="e.g. 98640"
                  onChange={(e) =>
                    updateEntity(activeEntity.id, {
                      lifecycleStartTick: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-0.5">
                  Death / Fall Tick
                </label>
                <input
                  type="number"
                  value={activeEntity.lifecycleEndTick ?? ''}
                  placeholder="Optional"
                  onChange={(e) =>
                    updateEntity(activeEntity.id, {
                      lifecycleEndTick: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>

            {/* Existing Spatial Keyframes */}
            <div className="space-y-1.5">
              {(activeEntity.spatialKeyframes || []).map((kf) => {
                const mapObj = project.maps.find((m) => m.id === kf.mapId);
                const dateLabel = calendar
                  ? formatTickToDate(calendar, kf.tick).displayShort
                  : `Tick ${kf.tick}`;
                return (
                  <div
                    key={kf.id}
                    className="p-2 rounded bg-slate-950 border border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {dateLabel}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentTick(kf.tick);
                            selectMap(kf.mapId, true);
                          }}
                          className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-xs cursor-pointer whitespace-nowrap"
                          title="Jump to Map & Time"
                        >
                          Map
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            deleteEntitySpatialKeyframe(activeEntity.id, kf.id)
                          }
                          className="text-slate-500 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-slate-300">
                      {mapObj?.name || 'Map'} at ({kf.x}, {kf.y})
                    </div>
                    {kf.statusNote && (
                      <div className="text-xs text-slate-400 italic">
                        "{kf.statusNote}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Spatial Keyframe Form */}
            <form
              onSubmit={handleAddKeyframe}
              className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-2"
            >
              <div className="text-xs font-semibold text-slate-300">
                + Add Map Location at Current/Custom Tick
              </div>
              <select
                value={kfMapId || project.maps[0]?.id || ''}
                onChange={(e) => setKfMapId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              >
                {project.maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  type="number"
                  value={kfTick || project.currentTick}
                  onChange={(e) => setKfTick(Number(e.target.value))}
                  placeholder="Tick"
                  title="Calendar Tick"
                  className="bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-xs text-slate-200 font-mono"
                />
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={kfX}
                  onChange={(e) => setKfX(Number(e.target.value))}
                  placeholder="X"
                  title="Map X (0-1000)"
                  className="bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-xs text-slate-200 font-mono"
                />
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={kfY}
                  onChange={(e) => setKfY(Number(e.target.value))}
                  placeholder="Y"
                  title="Map Y (0-1000)"
                  className="bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
              <input
                type="text"
                value={kfNote}
                onChange={(e) => setKfNote(e.target.value)}
                placeholder="Status note (e.g., Encamped at river)..."
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              />
              <button
                type="submit"
                className="w-full py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-medium text-xs cursor-pointer"
              >
                Pin Entity to Map & Timeline
              </button>
            </form>
          </div>

          {/* Connections Section in SidePanel */}
          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-amber-400" />
                Connections ({entityRelations.length})
              </span>
              <button
                type="button"
                onClick={() => setEditingRelation(null)}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>

            {/* Existing connections in inspector */}
            {entityRelations.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                {entityRelations.map((rel) => {
                  const isOutgoing = rel.sourceEntityId === activeEntity.id;
                  const otherId = isOutgoing ? rel.targetEntityId : rel.sourceEntityId;
                  const other = project.entities.find((e) => e.id === otherId);
                  if (!other) return null;
                  const isAuto = rel.id.startsWith('auto-');

                  return (
                    <div
                      key={rel.id}
                      className="px-2 py-1.5 rounded bg-slate-950/80 border border-slate-800/80 flex items-center justify-between gap-1.5 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => selectEntity(other.id)}
                        className="text-left min-w-0 flex-1 cursor-pointer truncate"
                        title={other.title}
                      >
                        <div className="text-[10px] text-slate-400 truncate">
                          {rel.bidirectional ? `↔ ${rel.label}` : isOutgoing ? `→ ${rel.label}` : `← ${rel.label}`}
                        </div>
                        <div className="font-medium text-slate-200 truncate text-[11px] flex items-center gap-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: categoryColor(other.category) }}
                          />
                          {other.title}
                        </div>
                      </button>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingRelation(rel)}
                          className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer transition-colors"
                          title={isAuto ? 'Customize connection' : 'Edit connection'}
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        {!isAuto && (
                          <button
                            type="button"
                            onClick={() => deleteRelation(rel.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                            title="Remove connection"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Connect Form */}
            <form onSubmit={handleAddRelation} className="space-y-1.5 pt-1">
              <span className="block text-[11px] text-slate-400 font-medium">Quick Link:</span>
              <select
                value={relType}
                onChange={(e) => setRelType(e.target.value as RelationType)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              >
                <option value="allied_with">Allied With</option>
                <option value="rival_of">Rival / Enemy Of</option>
                <option value="located_in">Located In</option>
                <option value="ruled_by">Ruled By</option>
                <option value="member_of">Member Of</option>
                <option value="wields">Wields / Holds</option>
                <option value="created_by">Created / Forged By</option>
                <option value="parent_of">Parent / Predecessor Of</option>
                <option value="connected_portal">Connected Portal</option>
              </select>
              <select
                value={
                  relTargetId ||
                  project.entities.find((e) => e.id !== activeEntity.id)?.id ||
                  ''
                }
                onChange={(e) => setRelTargetId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              >
                {project.entities
                  .filter((e) => e.id !== activeEntity.id)
                  .map((peer) => (
                    <option key={peer.id} value={peer.id}>
                      {peer.title}
                    </option>
                  ))}
              </select>
              <input
                type="text"
                value={relLabel}
                onChange={(e) => setRelLabel(e.target.value)}
                placeholder="Edge description (optional)..."
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              />
              <button
                type="submit"
                className="w-full py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 font-medium text-xs cursor-pointer flex items-center justify-center gap-1"
              >
                <Check className="w-3 h-3" />
                Connect in Graph
              </button>
            </form>
          </div>
        </SidePanel>
      )}

      {/* New Wiki Entry Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateEntity}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-lg font-semibold text-slate-100">
              Create New Wiki Entry
            </h3>
            <div>
              <label className="block text-slate-300 mb-1">Entry Title *</label>
              <input
                type="text"
                required
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Grand Inquisitor Thorne"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1.5">Category & Subcategory</label>
              <CategoryPicker
                value={newCat}
                onChange={setNewCat}
                subcategoryValue={newSubcat}
                onSubcategoryChange={setNewSubcat}
                counts={categoryCounts}
              />
            </div>
            <div>
              <div>
                <label className="block text-slate-300 mb-1">Template Schema</label>
                <select
                  value={newTplId}
                  onChange={(e) => setNewTplId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-slate-100"
                >
                  <option value="">Auto-Match Category</option>
                  {project.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-slate-300 mb-1">One-Line Summary</label>
              <input
                type="text"
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                placeholder="Brief canonical description..."
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold cursor-pointer"
              >
                Create Entry
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Export Page & Project Modal */}
      {project && (
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          project={project}
          activeEntity={activeEntity}
          initialTab="page"
        />
      )}

      {/* Edit / Add Connection Modal */}
      {editingRelation !== undefined && activeEntity && project && (
        <EditConnectionModal
          isOpen={true}
          onClose={() => setEditingRelation(undefined)}
          project={project}
          activeEntity={activeEntity}
          relation={editingRelation}
          onSave={(relData, existingId) => {
            if (existingId && !existingId.startsWith('auto-')) {
              updateRelation(existingId, relData);
            } else {
              addRelation(relData);
            }
          }}
          onDelete={(relId) => {
            deleteRelation(relId);
          }}
        />
      )}
    </div>
  );
};

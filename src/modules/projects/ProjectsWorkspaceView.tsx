import React, { useMemo, useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import { Project } from '../../types/worldify';
import { formatTickToDate } from '../../utils/calendarEngine';
import { computeAllProjectRelations } from '../../utils/wikiParser';
import { fetchBundledProject } from '../../utils/bundledVaults';
import { ExportModal } from '../../components/ExportModal';
import {
  FolderKanban,
  Plus,
  Settings,
  Trash2,
  Copy,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  BookOpen,
  Map as MapIcon,
  Globe2,
  Feather,
  Clock,
  Network,
  Search,
  Edit3,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  Check,
  X,
} from 'lucide-react';

export const ProjectsWorkspaceView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    setActiveProject,
    setActiveModule,
    createProject,
    updateProject,
    deleteProject,
    duplicateProject,
    updateWorld,
    importProjectVault,
    resetVaultToDemo,
    vaultUpdates,
  } = useWorldifyStore();

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  const [searchQuery, setSearchQuery] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string>(
    activeProject?.id || ''
  );

  // Settings form state for the selected project in the Settings Inspector
  const inspectedProject =
    projects.find((p) => p.id === editingProjectId) || activeProject;

  const [editName, setEditName] = useState(inspectedProject?.name || '');
  const [editGenre, setEditGenre] = useState(inspectedProject?.genre || '');
  const [editTagline, setEditTagline] = useState(inspectedProject?.tagline || '');
  const [editDesc, setEditDesc] = useState(inspectedProject?.description || '');
  const [editTick, setEditTick] = useState<number>(
    inspectedProject?.currentTick ?? 0
  );
  const [editWorldId, setEditWorldId] = useState(
    inspectedProject?.activeWorldId || ''
  );
  const [editCalId, setEditCalId] = useState(
    inspectedProject?.activeCalendarId || ''
  );
  const [savedToast, setSavedToast] = useState(false);

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjGenre, setNewProjGenre] = useState(
    'High Fantasy / Planar Cosmology'
  );
  const [newProjTagline, setNewProjTagline] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [exportTarget, setExportTarget] = useState<Project | null>(null);
  const [inlineRenameId, setInlineRenameId] = useState<string | null>(null);
  const [inlineRenameValue, setInlineRenameValue] = useState('');

  const selectProjectForSettings = (proj: Project) => {
    setEditingProjectId(proj.id);
    setEditName(proj.name);
    setEditGenre(proj.genre);
    setEditTagline(proj.tagline);
    setEditDesc(proj.description);
    setEditTick(proj.currentTick);
    setEditWorldId(proj.activeWorldId);
    setEditCalId(proj.activeCalendarId);
    setSavedToast(false);
  };

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.genre.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedProject || !editName.trim()) return;
    updateProject(inspectedProject.id, {
      name: editName.trim(),
      genre: editGenre.trim() || 'Speculative Fiction',
      tagline: editTagline.trim(),
      description: editDesc.trim(),
      currentTick: Number(editTick) || 0,
      activeWorldId: editWorldId || inspectedProject.activeWorldId,
      activeCalendarId: editCalId || inspectedProject.activeCalendarId,
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    createProject(
      newProjName.trim(),
      newProjGenre.trim() || 'Speculative Fiction',
      newProjTagline.trim() || 'A newly forged universe.',
      newProjDesc.trim() || 'Explore and expand your world.'
    );
    setNewProjName('');
    setNewProjTagline('');
    setNewProjDesc('');
    setShowNewModal(false);
  };

  const handleImportVaultFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result));
        if (Array.isArray(parsed)) importProjectVault(parsed);
        else if (parsed && typeof parsed === 'object' && 'entities' in parsed) {
          importProjectVault([parsed]);
        }
      } catch (err) {
        alert('Invalid Worldify JSON Vault file: ' + String(err));
      }
    };
    reader.readAsText(file);
  };

  const handleExportAllVaults = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(projects, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `worldify-all-projects-backup.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-8 pb-24 space-y-8">
        {/* ── Workspace Header ───────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <FolderKanban className="w-4 h-4" />
              <span>Studio Projects & Universe Manager</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-50">
              Projects Workspace
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Switch between universes, rename and edit project metadata, duplicate worlds for experiments, or manage backups and exports.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>

            <label className="h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium flex items-center gap-2 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>Import JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportVaultFile}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleExportAllVaults}
              className="h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium flex items-center gap-2 cursor-pointer"
              title="Download lossless JSON backup of all projects"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Backup All ({projects.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Reset built-in demo worlds to their factory state? Imported Obsidian vaults will be kept.'
                  )
                ) {
                  resetVaultToDemo();
                }
              }}
              className="h-9 px-3 rounded-xl bg-slate-900 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 text-xs flex items-center gap-1.5 cursor-pointer"
              title="Reset built-in demo worlds"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demos</span>
            </button>
          </div>
        </div>

        {/* ── Main Two-Column Layout: Projects List (7 cols) + Project Settings Inspector (5 cols) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: All Projects Cards */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Your Projects ({filteredProjects.length})
              </h2>
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter projects..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="space-y-3.5">
              {filteredProjects.map((proj) => {
                const isActive = proj.id === activeProjectId;
                const isInspected = proj.id === inspectedProject?.id;
                const cal =
                  proj.calendars.find((c) => c.id === proj.activeCalendarId) ||
                  proj.calendars[0];
                const dateStr = cal
                  ? formatTickToDate(cal, proj.currentTick).displayShort
                  : `Tick ${proj.currentTick}`;
                const relCount = computeAllProjectRelations(proj).length;

                return (
                  <div
                    key={proj.id}
                    onClick={() => selectProjectForSettings(proj)}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-4 ${
                      isActive
                        ? 'bg-slate-900/95 border-amber-500/60 shadow-lg shadow-amber-500/5'
                        : isInspected
                          ? 'bg-slate-900/80 border-slate-600'
                          : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Card Top Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {isActive && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              ACTIVE
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] font-medium">
                            {proj.genre}
                          </span>
                          {proj.importedFrom && (
                            <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px]">
                              Obsidian Vault ({proj.importedFrom.source})
                            </span>
                          )}
                        </div>

                        {/* Inline Rename vs Title */}
                        {inlineRenameId === proj.id ? (
                          <div
                            className="flex items-center gap-2 mt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              autoFocus
                              value={inlineRenameValue}
                              onChange={(e) => setInlineRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && inlineRenameValue.trim()) {
                                  updateProject(proj.id, {
                                    name: inlineRenameValue.trim(),
                                  });
                                  if (inspectedProject?.id === proj.id) {
                                    setEditName(inlineRenameValue.trim());
                                  }
                                  setInlineRenameId(null);
                                } else if (e.key === 'Escape') {
                                  setInlineRenameId(null);
                                }
                              }}
                              className="bg-slate-950 border border-amber-500 rounded-lg px-2.5 py-1 text-base font-bold text-slate-100 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (inlineRenameValue.trim()) {
                                  updateProject(proj.id, {
                                    name: inlineRenameValue.trim(),
                                  });
                                  if (inspectedProject?.id === proj.id) {
                                    setEditName(inlineRenameValue.trim());
                                  }
                                }
                                setInlineRenameId(null);
                              }}
                              className="p-1.5 rounded-lg bg-emerald-500 text-slate-950 cursor-pointer"
                              title="Save name"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setInlineRenameId(null)}
                              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group">
                            <h3 className="text-lg font-display font-bold text-slate-50 truncate">
                              {proj.name}
                            </h3>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInlineRenameId(proj.id);
                                setInlineRenameValue(proj.name);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition-opacity cursor-pointer"
                              title="Quick rename"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {proj.tagline && (
                          <p className="text-xs text-amber-200/80 mt-0.5">
                            {proj.tagline}
                          </p>
                        )}
                      </div>

                      {/* Switch / Enter Button */}
                      <div
                        className="flex items-center gap-2 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!isActive ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveProject(proj.id);
                              selectProjectForSettings(proj);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>Switch to Project</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveModule('dashboard')}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>Open Overview</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {proj.description}
                    </p>

                    {/* Project Stats Pills */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-300">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                        <strong>{proj.entities.length}</strong> entries
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5">
                        <Network className="w-3.5 h-3.5 text-sky-400" />
                        <strong>{relCount}</strong> links
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5">
                        <MapIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <strong>{proj.maps.length}</strong> maps
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5">
                        <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
                        <strong>{proj.worlds.length}</strong> worlds
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5">
                        <Feather className="w-3.5 h-3.5 text-pink-400" />
                        <strong>{proj.stories.length}</strong> stories
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-purple-400" />
                        <span>{dateStr}</span>
                      </span>
                    </div>

                    {/* Action Bar */}
                    <div
                      className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => selectProjectForSettings(proj)}
                          className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 cursor-pointer ${
                            isInspected
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                              : 'border-slate-800 hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <Settings className="w-3.5 h-3.5" />
                          <span>Edit Settings</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setInlineRenameId(proj.id);
                            setInlineRenameValue(proj.name);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Rename</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const cloned = duplicateProject(
                              proj.id,
                              `${proj.name} (Copy)`
                            );
                            if (cloned) selectProjectForSettings(cloned);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300 flex items-center gap-1.5 cursor-pointer"
                          title="Clone this entire project"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Duplicate</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setExportTarget(proj)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {vaultUpdates[proj.id] && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  'Replace this project with the latest import from the vault?'
                                )
                              )
                                return;
                              const fresh = await fetchBundledProject(
                                vaultUpdates[proj.id]
                              );
                              if (fresh) importProjectVault([fresh]);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 font-medium cursor-pointer"
                          >
                            Update Vault
                          </button>
                        )}

                        {projects.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(proj)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-rose-500/40 hover:bg-rose-500/10 text-slate-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                            title="Delete project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT COLUMN: Project Settings & Metadata Editor */}
          <div className="lg:col-span-5 lg:sticky lg:top-6">
            {inspectedProject && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Settings className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-100">
                        Project Settings
                      </h2>
                      <p className="text-xs text-slate-400 truncate max-w-[240px]">
                        Editing: {inspectedProject.name}
                      </p>
                    </div>
                  </div>

                  {savedToast && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Saved
                    </span>
                  )}
                </div>

                <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Project Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-100 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Genre / Setting Classification
                    </label>
                    <input
                      type="text"
                      value={editGenre}
                      onChange={(e) => setEditGenre(e.target.value)}
                      placeholder="e.g., High Fantasy, Dark Sci-Fi, Mythic History"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-slate-100 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Tagline / Hook
                    </label>
                    <input
                      type="text"
                      value={editTagline}
                      onChange={(e) => setEditTagline(e.target.value)}
                      placeholder="A short evocative subtitle..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-slate-100 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Universe Synopsis & Core Premise
                    </label>
                    <textarea
                      rows={4}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-slate-100 leading-relaxed focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        Default Active World
                      </label>
                      <select
                        value={editWorldId}
                        onChange={(e) => setEditWorldId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                      >
                        {inspectedProject.worlds.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        Default Calendar
                      </label>
                      <select
                        value={editCalId}
                        onChange={(e) => setEditCalId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                      >
                        {inspectedProject.calendars.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Canonical World Clock Cursor (Tick)
                    </label>
                    <input
                      type="number"
                      value={editTick}
                      onChange={(e) => setEditTick(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>

                  {/* Primary World Laws Quick Editor */}
                  {inspectedProject.worlds[0] && (
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        Primary World Laws & Magic/Physics Rules (
                        {
                          (
                            inspectedProject.worlds.find(
                              (w) => w.id === editWorldId
                            ) || inspectedProject.worlds[0]
                          ).name
                        }
                        )
                      </label>
                      <textarea
                        rows={3}
                        value={
                          (
                            inspectedProject.worlds.find(
                              (w) => w.id === editWorldId
                            ) || inspectedProject.worlds[0]
                          ).magicOrPhysicsRules
                        }
                        onChange={(e) => {
                          const targetWorld =
                            inspectedProject.worlds.find(
                              (w) => w.id === editWorldId
                            ) || inspectedProject.worlds[0];
                          if (inspectedProject.id !== activeProjectId) {
                            setActiveProject(inspectedProject.id);
                          }
                          updateWorld(targetWorld.id, {
                            magicOrPhysicsRules: e.target.value,
                          });
                        }}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between gap-3">
                    {projects.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(inspectedProject)}
                        className="px-3 py-2 rounded-xl border border-rose-500/30 hover:bg-rose-500/15 text-rose-300 font-medium flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Project</span>
                      </button>
                    ) : (
                      <div />
                    )}

                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Save Project Settings</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Create New Project Modal ───────────────────────────────── */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateProject}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Create New Worldbuilding Project</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  required
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="e.g., Chronicles of Myr"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Genre / Setting
                </label>
                <input
                  type="text"
                  value={newProjGenre}
                  onChange={(e) => setNewProjGenre(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Tagline
                </label>
                <input
                  type="text"
                  value={newProjTagline}
                  onChange={(e) => setNewProjTagline(e.target.value)}
                  placeholder="A short evocative hook..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  placeholder="Core premise, themes, and cosmology..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Forge Project
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Delete Confirmation Modal ──────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-400 font-bold text-base">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Delete Project "{deleteTarget.name}"?</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will permanently remove <strong>{deleteTarget.name}</strong> (
              {deleteTarget.entities.length} wiki entries, {deleteTarget.maps.length} maps, and{' '}
              {deleteTarget.stories.length} stories) from your browser vault. Consider exporting a backup first.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const deletedId = deleteTarget.id;
                  deleteProject(deletedId);
                  setDeleteTarget(null);
                  const remaining = projects.filter((p) => p.id !== deletedId);
                  if (remaining[0]) {
                    selectProjectForSettings(remaining[0]);
                  }
                }}
                className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Yes, Delete Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export Modal ───────────────────────────────────────────── */}
      {exportTarget && (
        <ExportModal
          isOpen={Boolean(exportTarget)}
          onClose={() => setExportTarget(null)}
          project={exportTarget}
          initialTab="project"
        />
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import { formatTickToDate } from '../../utils/calendarEngine';
import { computeAllProjectRelations } from '../../utils/wikiParser';
import {
  Globe2,
  BookOpen,
  Network,
  Map as MapIcon,
  Clock,
  Feather,
  Sparkles,
  Plus,
  Download,
  Upload,
  RotateCcw,
  Layers,
  ArrowRight,
  Compass,
  FolderArchive,
  Printer,
  FileText,
} from 'lucide-react';
import { CATEGORY_META, categoryLabel, categoryColor } from '../../utils/categories';
import { fetchBundledProject } from '../../utils/bundledVaults';
import { ExportModal } from '../../components/ExportModal';
import {
  exportProjectToObsidianVaultZip,
  exportProjectToBookWord,
  exportProjectToBookPdf,
} from '../../utils/exportService';

export const ProjectDashboardView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    setActiveProject,
    setActiveModule,
    setActiveWorld,
    selectEntity,
    selectMap,
    selectStoryScene,
    createProject,
    toggleAICopilot,
    importProjectVault,
    resetVaultToDemo,
    vaultUpdates,
  } = useWorldifyStore();

  const [showNewProjModal, setShowNewProjModal] = useState(false);
  const [showVaultMenu, setShowVaultMenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjGenre, setNewProjGenre] = useState('High Fantasy / Planar Cosmology');
  const [newProjTagline, setNewProjTagline] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');

  const project = projects.find((p) => p.id === activeProjectId) || projects[0];
  if (!project) return null;

  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];
  const formattedDate = calendar ? formatTickToDate(calendar, project.currentTick) : null;
  const allRelations = computeAllProjectRelations(project);

  const handleExportVault = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(projects, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `${project.name.toLowerCase().replace(/\s+/g, '-')}-worldify-vault.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportMarkdownBundle = () => {
    const mdParts = project.entities.map((ent) => {
      const frontmatter = [
        '---',
        `id: ${ent.id}`,
        `title: "${ent.title}"`,
        `category: ${ent.category}`,
        `tags: [${ent.tags.join(', ')}]`,
        `summary: "${ent.summary.replace(/"/g, '\\"')}"`,
        ...Object.entries(ent.templateValues).map(([k, v]) => `${k}: ${JSON.stringify(v)}`),
        '---',
        '',
        `# ${ent.title}`,
        ent.subtitle ? `*${ent.subtitle}*\n` : '',
        ent.contentMd,
      ].join('\n');
      return frontmatter;
    });

    const bundle = `# ${project.name} — Markdown Wiki Export\n\n> ${project.description}\n\n${mdParts.join(
      '\n\n---\n\n'
    )}`;
    const dataStr = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(bundle);
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute(
      'download',
      `${project.name.toLowerCase().replace(/\s+/g, '-')}-wiki.md`
    );
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleImportVaultFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result));
        if (Array.isArray(parsed)) importProjectVault(parsed);
        else if (parsed && typeof parsed === 'object' && 'entities' in parsed) importProjectVault([parsed]);
      } catch (err) {
        alert('Invalid Worldify JSON Vault file: ' + String(err));
      }
    };
    reader.readAsText(file);
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
    setShowNewProjModal(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
     <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
      {/* Project header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2">
        <div className="space-y-3 max-w-3xl">
          <div className="text-sm text-slate-400">
            {project.genre} · {project.worlds.length} worlds
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-slate-50">{project.name}</h1>
          <p className="text-lg text-amber-200/90">{project.tagline}</p>
          <p className="text-base text-slate-400 leading-relaxed">{project.description}</p>
          {project.importedFrom && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-400 pt-1">
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4 text-slate-500" />
                Imported from {project.importedFrom.source} on{' '}
                {new Date(project.importedFrom.importedAt).toLocaleDateString()}. Edits made here are not written back.
              </span>
              {vaultUpdates[project.id] && (
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        'Replace this project with the latest import from the vault? Changes you made to it inside Worldify will be lost.'
                      )
                    )
                      return;
                    const fresh = await fetchBundledProject(vaultUpdates[project.id]);
                    if (fresh) importProjectVault([fresh]);
                  }}
                  className="h-8 px-3 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 text-sm cursor-pointer"
                >
                  Newer import available — update
                </button>
              )}
            </div>
          )}
        </div>

        {/* Project actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="h-9 px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export Project
          </button>
          <button
            type="button"
            onClick={() => setShowNewProjModal(true)}
            className="h-9 px-3 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-200 text-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New project
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowVaultMenu(!showVaultMenu)}
              className="h-9 px-3 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300 text-sm flex items-center gap-2 cursor-pointer"
            >
              <span>More</span>
            </button>
            {showVaultMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowVaultMenu(false)} />
                <div className="absolute right-0 mt-1 w-72 z-40 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-1.5 text-xs space-y-0.5">
                  <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Publish & Export
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVaultMenu(false);
                      exportProjectToObsidianVaultZip(project);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-amber-500/10 hover:text-amber-300 flex items-center gap-2.5 text-slate-200 cursor-pointer"
                  >
                    <FolderArchive className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="font-semibold">Obsidian Vault Archive (.zip)</div>
                      <div className="text-[10px] text-slate-400">Full Avalymia-style folder structure</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVaultMenu(false);
                      exportProjectToBookPdf(project);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-rose-400" />
                    <div>
                      <div className="font-semibold">World Book (PDF)</div>
                      <div className="text-[10px] text-slate-400">Printable cover, table of contents & volumes</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVaultMenu(false);
                      exportProjectToBookWord(project);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4 text-blue-400" />
                    <div>
                      <div className="font-semibold">World Encyclopedia (.docx)</div>
                      <div className="text-[10px] text-slate-400">Complete book in Microsoft Word format</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVaultMenu(false);
                      handleExportMarkdownBundle();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-purple-400" />
                    <div>
                      <div className="font-semibold">Concatenated Wiki (.md)</div>
                      <div className="text-[10px] text-slate-400">Single aggregated markdown file</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVaultMenu(false);
                      handleExportVault();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 cursor-pointer"
                  >
                    <Layers className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="font-semibold">Studio Vault (.json)</div>
                      <div className="text-[10px] text-slate-400">Lossless full database backup</div>
                    </div>
                  </button>

                  <div className="my-1 border-t border-slate-800" />
                  <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Vault Management
                  </div>

                  <label className="w-full px-2.5 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 cursor-pointer">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="font-semibold">Import JSON Vault…</div>
                      <div className="text-[10px] text-slate-400">Restore or add projects from file</div>
                    </div>
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        setShowVaultMenu(false);
                        handleImportVaultFile(e);
                      }}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVaultMenu(false);
                      resetVaultToDemo();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-rose-500/10 flex items-center gap-2.5 text-rose-300 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <div>
                      <div className="font-semibold">Reset to demo data</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setActiveModule('wiki')}
          className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 text-left transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <BookOpen className="w-4 h-4 text-slate-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300" />
          </div>
          <div className="text-xl font-bold text-slate-100">{project.entities.length}</div>
          <div className="text-xs text-slate-400">Wiki Entries & Entities</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveModule('graph')}
          className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-sky-500/50 text-left transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <Network className="w-4 h-4 text-slate-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300" />
          </div>
          <div className="text-xl font-bold text-slate-100">{allRelations.length}</div>
          <div className="text-xs text-slate-400">Graph Connections</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveModule('maps')}
          className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 text-left transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <MapIcon className="w-4 h-4 text-slate-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300" />
          </div>
          <div className="text-xl font-bold text-slate-100">{project.maps.length}</div>
          <div className="text-xs text-slate-400">Interactive Maps</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveModule('timeline')}
          className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-purple-500/50 text-left transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300" />
          </div>
          <div className="text-xl font-bold text-slate-100">{project.timelineEvents.length}</div>
          <div className="text-xs text-slate-400">Timeline Events</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveModule('cosmology')}
          className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 text-left transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <Globe2 className="w-4 h-4 text-slate-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300" />
          </div>
          <div className="text-xl font-bold text-slate-100">{project.worlds.length}</div>
          <div className="text-xs text-slate-400">Connected Worlds</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveModule('stories')}
          className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-pink-500/50 text-left transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <Feather className="w-4 h-4 text-slate-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300" />
          </div>
          <div className="text-xl font-bold text-slate-100">
            {project.stories.reduce(
              (acc, s) => acc + s.chapters.reduce((cAcc, c) => cAcc + c.scenes.length, 0),
              0
            )}
          </div>
          <div className="text-xs text-slate-400">Story Scenes</div>
        </button>
      </div>

      {/* Connected Worlds & Cosmology + Featured Maps */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connected Worlds within Project */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-slate-400" />
              Worlds & planes
            </h2>
            <button
              type="button"
              onClick={() => setActiveModule('cosmology')}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
            >
              Open Orrery →
            </button>
          </div>

          <div className="space-y-2.5">
            {project.worlds.map((w) => {
              const isSelected = w.id === project.activeWorldId;
              return (
                <div
                  key={w.id}
                  onClick={() => setActiveWorld(w.id)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800/90 border-amber-500/50'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: w.color }}
                      />
                      <span className="text-xs font-semibold text-slate-100">{w.name}</span>
                    </div>
                    <span className="text-xs capitalize px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 whitespace-nowrap">
                      {w.type.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2">{w.summary}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Featured Wiki Entries */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-400" />
              Wiki entries
            </h2>
            <button
              type="button"
              onClick={() => setActiveModule('wiki')}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
            >
              Browse All →
            </button>
          </div>

          <div className="space-y-2 max-h-[310px] overflow-y-auto pr-1">
            {project.entities.slice(0, 7).map((ent) => (
              <button
                key={ent.id}
                type="button"
                onClick={() => selectEntity(ent.id, true)}
                className="w-full p-2.5 rounded-lg bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 text-left transition-colors cursor-pointer flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {ent.title}
                  </div>
                  <div className="text-xs text-slate-400 line-clamp-1">{ent.summary}</div>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-900 text-amber-300/90 border border-slate-800 capitalize shrink-0 whitespace-nowrap">
                  {categoryLabel(ent.category)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Cartography, Stories & AI Studio */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Compass className="w-4 h-4 text-slate-400" />
              Maps & stories
            </h2>
            <button
              type="button"
              onClick={() => toggleAICopilot(true)}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Copilot
            </button>
          </div>

          <div className="space-y-2.5">
            {project.maps.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMap(m.id, true)}
                className="w-full p-3 rounded-lg bg-slate-950/60 hover:bg-slate-800/90 border border-slate-800 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                    <MapIcon className="w-3.5 h-3.5" />
                    {m.name}
                  </span>
                  <span className="text-xs capitalize px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                    {m.mode}
                  </span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2">{m.summary}</p>
              </button>
            ))}

            {project.stories.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() =>
                  selectStoryScene(
                    st.id,
                    st.chapters[0]?.scenes[0]?.id || ''
                  )
                }
                className="w-full p-3 rounded-lg bg-slate-950/60 hover:bg-slate-800/90 border border-slate-800 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                    <Feather className="w-3.5 h-3.5" />
                    Story: {st.title}
                  </span>
                  <span className="text-xs capitalize px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                    {st.chapters.length} Chapters
                  </span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2">{st.synopsis}</p>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setActiveModule('templates')}
              className="w-full p-2.5 rounded-lg bg-slate-950/60 hover:bg-slate-800/90 border border-slate-800 text-left transition-colors cursor-pointer flex items-center justify-between"
            >
              <span className="text-xs font-medium text-slate-200 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Manage Entity Templates & Custom Schemas ({project.templates.length})
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Create New Project Modal */}
     </div>
      {showNewProjModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateProject}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-slate-100">
              Create New Worldbuilding Project
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="e.g., Chronicles of Myr"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Genre / Setting</label>
                <input
                  type="text"
                  value={newProjGenre}
                  onChange={(e) => setNewProjGenre(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Tagline</label>
                <input
                  type="text"
                  value={newProjTagline}
                  onChange={(e) => setNewProjTagline(e.target.value)}
                  placeholder="A short evocative hook..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  placeholder="Core premise, themes, and cosmology..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewProjModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                Forge Project
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Project Export Modal */}
      {project && (
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          project={project}
          initialTab="project"
        />
      )}
    </div>
  );
};

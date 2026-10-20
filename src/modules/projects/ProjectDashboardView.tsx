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
} from 'lucide-react';

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
  } = useWorldifyStore();

  const [showNewProjModal, setShowNewProjModal] = useState(false);
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
        if (Array.isArray(parsed)) {
          importProjectVault(parsed);
        }
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
    <div className="h-full overflow-y-auto p-6 space-y-6 bg-slate-950">
      {/* Top Hero Banner */}
      <div className="relative rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border border-slate-800 p-6 shadow-xl overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {project.genre}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300 border border-slate-700">
                {project.worlds.length} Connected Worlds
              </span>
              {formattedDate && (
                <span className="px-2.5 py-0.5 rounded-full text-xs bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  World Clock: {formattedDate.displayShort}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-100 tracking-tight">
              {project.name}
            </h1>
            <p className="text-sm text-amber-200/80 font-medium">{project.tagline}</p>
            <p className="text-xs text-slate-400 leading-relaxed">{project.description}</p>
          </div>

          {/* Project Switcher & Vault Controls */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <select
                value={project.id}
                onChange={(e) => setActiveProject(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    Project: {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewProjModal(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Project
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportVault}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center gap-1 cursor-pointer"
                title="Export full JSON Vault"
              >
                <Download className="w-3 h-3 text-amber-400" />
                JSON Vault
              </button>
              <button
                type="button"
                onClick={handleExportMarkdownBundle}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center gap-1 cursor-pointer"
                title="Export all Wiki entries with YAML frontmatter as Markdown"
              >
                <Download className="w-3 h-3 text-sky-400" />
                Markdown
              </button>
              <label className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center gap-1 cursor-pointer">
                <Upload className="w-3 h-3 text-emerald-400" />
                Import
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportVaultFile}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={resetVaultToDemo}
                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs border border-slate-800 flex items-center gap-1 cursor-pointer"
                title="Reset to default sample worlds"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Demo
              </button>
            </div>
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
            <BookOpen className="w-4 h-4 text-amber-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-amber-400" />
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
            <Network className="w-4 h-4 text-sky-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-sky-400" />
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
            <MapIcon className="w-4 h-4 text-emerald-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400" />
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
            <Clock className="w-4 h-4 text-purple-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-purple-400" />
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
            <Globe2 className="w-4 h-4 text-cyan-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400" />
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
            <Feather className="w-4 h-4 text-pink-400" />
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-pink-400" />
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
              <Globe2 className="w-4 h-4 text-cyan-400" />
              Connected Worlds & Planes
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
                    <span className="text-xs capitalize px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
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
              <BookOpen className="w-4 h-4 text-amber-400" />
              Canonical Wiki Entries
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
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-900 text-amber-300/90 border border-slate-800 capitalize shrink-0">
                  {ent.category}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Cartography, Stories & AI Studio */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-400" />
              Maps, Stories & AI Studio
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
                  <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                    <MapIcon className="w-3.5 h-3.5" />
                    {m.name}
                  </span>
                  <span className="text-xs capitalize px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
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
                  <span className="text-xs font-semibold text-pink-300 flex items-center gap-1.5">
                    <Feather className="w-3.5 h-3.5" />
                    Story: {st.title}
                  </span>
                  <span className="text-xs capitalize px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-300 border border-pink-500/30">
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
    </div>
  );
};

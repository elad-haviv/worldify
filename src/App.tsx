import React from 'react';
import { useWorldifyStore } from './store/useWorldifyStore';
import { ActiveModule } from './types/worldify';
import { ProjectDashboardView } from './modules/projects/ProjectDashboardView';
import { CosmologyWorldsView } from './modules/projects/CosmologyWorldsView';
import { WikiView } from './modules/wiki/WikiView';
import { TemplatesView } from './modules/wiki/TemplatesView';
import { KnowledgeGraphView } from './modules/graph/KnowledgeGraphView';
import { MapView } from './modules/maps/MapView';
import { TimelineView } from './modules/timeline/TimelineView';
import { StoryStudioView } from './modules/stories/StoryStudioView';
import { GlobalTimelineBar } from './components/GlobalTimelineBar';
import { AICopilotDrawer } from './components/AICopilotDrawer';
import { QuickSearchModal } from './components/QuickSearchModal';
import {
  Compass,
  BookOpen,
  Network,
  Map as MapIcon,
  Clock,
  Feather,
  Globe2,
  Layers,
  Search,
  Sparkles,
} from 'lucide-react';

const NAV_ITEMS: Array<{
  id: ActiveModule;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Overview', icon: Compass },
  { id: 'wiki', label: 'Lore Wiki', icon: BookOpen },
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'maps', label: 'Atlas & Maps', icon: MapIcon },
  { id: 'timeline', label: 'Timelines', icon: Clock },
  { id: 'stories', label: 'Stories', icon: Feather },
  { id: 'cosmology', label: 'Worlds', icon: Globe2 },
  { id: 'templates', label: 'Templates', icon: Layers },
];

export const App: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeModule,
    isAICopilotOpen,
    setActiveModule,
    setActiveProject,
    setActiveWorld,
    toggleAICopilot,
    toggleQuickSearch,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId) || projects[0];

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Global Workspace Header */}
      <header className="h-13 bg-slate-900/95 border-b border-slate-800 px-4 flex items-center justify-between gap-3 shrink-0 z-30">
        {/* Brand & Project / World Selectors */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveModule('dashboard')}
            className="flex items-center gap-2 text-left group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-display font-bold text-base shadow-md">
              W
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-display font-bold tracking-wider text-slate-100 group-hover:text-amber-300 transition-colors">
                WORLDIFY
              </div>
              <div className="text-[10px] text-slate-400 -mt-0.5">
                Spatio-Temporal Lore Studio
              </div>
            </div>
          </button>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

          {/* Project Selector */}
          {project && (
            <div className="flex items-center gap-2">
              <select
                value={project.id}
                onChange={(e) => setActiveProject(e.target.value)}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer max-w-[200px] truncate"
                title="Switch Active Project"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {/* Active Connected World Selector */}
              <select
                value={project.activeWorldId}
                onChange={(e) => setActiveWorld(e.target.value)}
                className="hidden md:block bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-cyan-300 focus:outline-none focus:border-amber-500 cursor-pointer max-w-[180px] truncate"
                title="Switch Active Connected World / Plane"
              >
                {project.worlds.map((w) => (
                  <option key={w.id} value={w.id}>
                    🌐 {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Center Module Navigation Tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto py-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveModule(item.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Quick Search (Ctrl+K) & AI Lore Copilot Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => toggleQuickSearch(true)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs flex items-center gap-2 transition-colors cursor-pointer"
            title="Search Wiki, Maps, Events & Worlds (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden lg:inline">Quick Search</span>
            <kbd className="hidden sm:inline px-1.5 py-0.5 text-[10px] font-mono bg-slate-900 text-slate-400 rounded border border-slate-800">
              Ctrl K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => toggleAICopilot()}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isAICopilotOpen
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Copilot</span>
          </button>
        </div>
      </header>

      {/* Main Content Area + Right AI Copilot Drawer */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          {activeModule === 'dashboard' && <ProjectDashboardView />}
          {activeModule === 'wiki' && <WikiView />}
          {activeModule === 'graph' && <KnowledgeGraphView />}
          {activeModule === 'maps' && <MapView />}
          {activeModule === 'timeline' && <TimelineView />}
          {activeModule === 'stories' && <StoryStudioView />}
          {activeModule === 'cosmology' && <CosmologyWorldsView />}
          {activeModule === 'templates' && <TemplatesView />}
        </div>

        <AICopilotDrawer />
      </div>

      {/* Bottom Spatio-Temporal Timeline Scrubber Bar */}
      <GlobalTimelineBar />

      {/* Ctrl+K Quick Search Modal */}
      <QuickSearchModal />
    </div>
  );
};

export default App;

import React, { useEffect, useState } from 'react';
import { useWorldifyStore } from './store/useWorldifyStore';
import { ActiveModule } from './types/worldify';
import { formatTickToDate } from './utils/calendarEngine';
import { syncBundledVaults } from './utils/bundledVaults';
import { ProjectDashboardView } from './modules/projects/ProjectDashboardView';
import { CosmologyWorldsView } from './modules/projects/CosmologyWorldsView';
import { WikiView } from './modules/wiki/WikiView';
import { TemplatesView } from './modules/wiki/TemplatesView';
import { KnowledgeGraphView } from './modules/graph/KnowledgeGraphView';
import { MapView } from './modules/maps/MapView';
import { TimelineView } from './modules/timeline/TimelineView';
import { StoryStudioView } from './modules/stories/StoryStudioView';
import { WorldTravelView } from './modules/travel/WorldTravelView';
import { LivingWorldView } from './modules/livingWorld/LivingWorldView';
import { GlobalTimelineBar } from './components/GlobalTimelineBar';
import { AICopilotDrawer } from './components/AICopilotDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
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
  Footprints,
  HeartPulse,
  Search,
  Sparkles,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Download,
} from 'lucide-react';
import { ExportModal } from './components/ExportModal';

type NavItem = {
  id: ActiveModule;
  label: string;
  icon: React.FC<{ className?: string }>;
};

const NAV_GROUPS: Array<{ label: string | null; items: NavItem[] }> = [
  { label: null, items: [{ id: 'dashboard', label: 'Overview', icon: Compass }] },
  {
    label: 'Write',
    items: [
      { id: 'wiki', label: 'Wiki', icon: BookOpen },
      { id: 'stories', label: 'Stories', icon: Feather },
    ],
  },
  {
    label: 'Explore',
    items: [
      { id: 'travel', label: 'Travel', icon: Footprints },
      { id: 'maps', label: 'Maps', icon: MapIcon },
      { id: 'timeline', label: 'Timeline', icon: Clock },
      { id: 'graph', label: 'Graph', icon: Network },
      { id: 'cosmology', label: 'Worlds', icon: Globe2 },
    ],
  },
  {
    label: 'Live',
    items: [{ id: 'living_world', label: 'Living World', icon: HeartPulse }],
  },
  {
    label: 'Setup',
    items: [{ id: 'templates', label: 'Templates', icon: Layers }],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** Screens where the world clock directly changes what you see. */
const TIME_AWARE_MODULES = new Set<ActiveModule>(['travel', 'maps', 'timeline', 'graph', 'cosmology', 'living_world']);

const SIDEBAR_KEY = 'worldify_sidebar_collapsed';

function readSidebarPref(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored !== null) return stored === '1';
  } catch {
    // storage unavailable
  }
  // Default: collapsed on narrow screens so content gets the room.
  return typeof window !== 'undefined' && window.innerWidth < 1280;
}

export const App: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedEntityId,
    activeModule,
    isAICopilotOpen,
    setActiveModule,
    setActiveProject,
    setActiveWorld,
    toggleAICopilot,
    toggleQuickSearch,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId) || projects[0];
  const activeEntity = project?.entities.find((e) => e.id === selectedEntityId) || null;
  const [collapsed, setCollapsed] = useState<boolean>(readSidebarPref);
  const [showGlobalExportModal, setShowGlobalExportModal] = useState(false);
  // null = follow the screen's default; true/false = user choice for this screen
  const [timelineOverride, setTimelineOverride] = useState<boolean | null>(null);

  useEffect(() => {
    syncBundledVaults();
  }, []);

  useEffect(() => {
    setTimelineOverride(null);
  }, [activeModule]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    } catch {
      // storage unavailable – ignore
    }
  }, [collapsed]);

  const showTimeline = timelineOverride ?? TIME_AWARE_MODULES.has(activeModule);
  const calendar = project?.calendars.find((c) => c.id === project.activeCalendarId) || project?.calendars[0];
  const dateLabel = project && calendar ? formatTickToDate(calendar, project.currentTick).displayShort : null;
  const activeLabel = ALL_ITEMS.find((i) => i.id === activeModule)?.label ?? '';

  return (
    <div className="h-screen w-screen flex bg-slate-950 text-slate-100 overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={`${
          collapsed ? 'w-[68px]' : 'w-60'
        } shrink-0 h-full bg-slate-900 border-r border-slate-800 flex flex-col transition-[width] duration-200 z-30`}
      >
        {/* Brand */}
        <div className={`h-16 flex items-center gap-3 ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
          <button
            type="button"
            onClick={() => setActiveModule('dashboard')}
            className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-display font-bold text-lg shrink-0 cursor-pointer"
            title="Overview"
          >
            W
          </button>
          {!collapsed && (
            <span className="font-display font-bold text-lg text-slate-100 tracking-wide">Worldify</span>
          )}
        </div>

        {/* Project switcher */}
        {project && !collapsed && (
          <div className="px-3 pb-3">
            <label className="block px-2 pb-1 text-xs text-slate-500">Project</label>
            <div className="relative">
              <select
                value={project.id}
                onChange={(e) => setActiveProject(e.target.value)}
                className="w-full appearance-none bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm font-medium text-slate-100 focus:outline-none focus:border-amber-500 cursor-pointer truncate"
                title={project.name}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.label && !collapsed && (
                <div className="px-3 pb-1.5 text-xs font-medium text-slate-500">{group.label}</div>
              )}
              {group.label && collapsed && <div className="mx-3 mb-2 border-t border-slate-800" />}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setActiveModule(item.id)}
                        title={collapsed ? item.label : undefined}
                        className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          collapsed ? 'justify-center h-10' : 'px-3 h-10'
                        } ${
                          isActive
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                        }`}
                      >
                        <Icon className="w-[18px] h-[18px] shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="p-3 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={`w-full h-9 flex items-center gap-3 rounded-lg text-sm text-slate-500 hover:text-slate-200 hover:bg-slate-800/70 cursor-pointer ${
              collapsed ? 'justify-center' : 'px-3'
            }`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="h-14 shrink-0 border-b border-slate-800 bg-slate-950 px-5 flex items-center gap-4 z-20">
          <h1 className="text-base font-semibold text-slate-100 shrink-0">{activeLabel}</h1>

          {project && project.worlds.length > 1 && (
            <div className="relative hidden md:block">
              <select
                value={project.activeWorldId}
                onChange={(e) => setActiveWorld(e.target.value)}
                className="appearance-none bg-transparent hover:bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-8 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer max-w-[260px] truncate"
                title="Active world"
              >
                {project.worlds.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          <div className="flex-1" />

          {dateLabel && (
            <button
              type="button"
              onClick={() => setTimelineOverride(!showTimeline)}
              className={`h-9 px-3 rounded-lg text-sm flex items-center gap-2 border transition-colors cursor-pointer ${
                showTimeline
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                  : 'border-slate-800 text-slate-300 hover:bg-slate-900'
              }`}
              title={showTimeline ? 'Hide world clock' : 'Show world clock'}
            >
              <CalendarDays className="w-4 h-4" />
              <span className="hidden lg:inline">{dateLabel}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => toggleQuickSearch(true)}
            className="h-9 px-3 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900 text-sm flex items-center gap-2 transition-colors cursor-pointer"
            title="Search (Ctrl+K)"
          >
            <Search className="w-4 h-4" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden lg:inline px-1.5 text-xs font-mono text-slate-500 rounded border border-slate-800">
              Ctrl K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setShowGlobalExportModal(true)}
            className="h-9 px-3 rounded-lg border border-slate-800 text-slate-300 hover:text-amber-300 hover:bg-slate-900 text-sm flex items-center gap-2 transition-colors cursor-pointer"
            title="Export page or project (PDF, Word, Markdown, Obsidian Vault)"
          >
            <Download className="w-4 h-4" />
            <span className="hidden lg:inline">Export</span>
          </button>

          <button
            type="button"
            onClick={() => toggleAICopilot()}
            className={`h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer ${
              isAICopilotOpen
                ? 'bg-amber-500 text-slate-950'
                : 'border border-slate-800 text-amber-300 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">AI</span>
          </button>
        </header>

        {/* Content + AI drawer */}
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          <main className="flex-1 min-w-0 h-full overflow-hidden">
            {activeModule === 'dashboard' && <ProjectDashboardView />}
            {activeModule === 'travel' && <WorldTravelView />}
            {activeModule === 'living_world' && <LivingWorldView />}
            {activeModule === 'wiki' && <WikiView />}
            {activeModule === 'graph' && <KnowledgeGraphView />}
            {activeModule === 'maps' && <MapView />}
            {activeModule === 'timeline' && <TimelineView />}
            {activeModule === 'stories' && <StoryStudioView />}
            {activeModule === 'cosmology' && <CosmologyWorldsView />}
            {activeModule === 'templates' && <TemplatesView />}
          </main>

          <ErrorBoundary fallbackTitle="Worldify AI Intelligence encountered a render issue">
            <AICopilotDrawer />
          </ErrorBoundary>
        </div>

        {/* World clock – only where it matters, or when the user opens it */}
        {showTimeline && <GlobalTimelineBar />}
      </div>

      <QuickSearchModal />
      {project && (
        <ExportModal
          isOpen={showGlobalExportModal}
          onClose={() => setShowGlobalExportModal(false)}
          project={project}
          activeEntity={activeModule === 'wiki' ? activeEntity : null}
          initialTab={activeModule === 'wiki' && activeEntity ? 'page' : 'project'}
        />
      )}
    </div>
  );
};

export default App;

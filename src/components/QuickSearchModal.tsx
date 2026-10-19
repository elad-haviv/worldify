import React, { useEffect, useState } from 'react';
import { useWorldifyStore } from '../store/useWorldifyStore';
import {
  Search,
  BookOpen,
  Map as MapIcon,
  Clock,
  Feather,
  Globe2,
  X,
  ArrowRight,
} from 'lucide-react';

export const QuickSearchModal: React.FC = () => {
  const {
    projects,
    activeProjectId,
    isQuickSearchOpen,
    toggleQuickSearch,
    selectEntity,
    selectMap,
    selectStoryScene,
    setCurrentTick,
    setActiveModule,
    setActiveWorld,
  } = useWorldifyStore();

  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleQuickSearch();
      } else if (e.key === 'Escape' && isQuickSearchOpen) {
        toggleQuickSearch(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isQuickSearchOpen, toggleQuickSearch]);

  if (!isQuickSearchOpen) return null;

  const project = projects.find((p) => p.id === activeProjectId);
  if (!project) return null;

  const q = query.trim().toLowerCase();

  const matchedEntities = project.entities.filter(
    (e) =>
      !q ||
      e.title.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)) ||
      e.summary.toLowerCase().includes(q)
  );

  const matchedMaps = project.maps.filter(
    (m) => !q || m.name.toLowerCase().includes(q) || m.mode.toLowerCase().includes(q)
  );

  const matchedEvents = project.timelineEvents.filter(
    (ev) => !q || ev.title.toLowerCase().includes(q) || ev.summary.toLowerCase().includes(q)
  );

  const matchedWorlds = project.worlds.filter(
    (w) => !q || w.name.toLowerCase().includes(q)
  );

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-start justify-center pt-20 z-50 px-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <Search className="w-4 h-4 text-amber-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search wiki entries, tags (#sun-forged), maps, timeline events, or worlds..."
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => toggleQuickSearch(false)}
            className="p-1 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-3 space-y-4">
          {/* Wiki Entities */}
          {matchedEntities.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 mb-1.5">
                Wiki Entries & Entities ({matchedEntities.length})
              </div>
              <div className="space-y-1">
                {matchedEntities.slice(0, 6).map((ent) => (
                  <button
                    key={ent.id}
                    type="button"
                    onClick={() => {
                      selectEntity(ent.id, true);
                      toggleQuickSearch(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/90 text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="truncate">
                        <div className="text-xs font-semibold text-slate-100 group-hover:text-amber-300">
                          {ent.title}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {ent.summary}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                        {ent.category}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Maps */}
          {matchedMaps.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 mb-1.5">
                Interactive Maps ({matchedMaps.length})
              </div>
              <div className="space-y-1">
                {matchedMaps.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      selectMap(m.id, true);
                      toggleQuickSearch(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/90 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <MapIcon className="w-4 h-4 text-emerald-400" />
                      <div>
                        <div className="text-xs font-semibold text-slate-100">{m.name}</div>
                        <div className="text-[11px] text-slate-400">{m.summary}</div>
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 uppercase">
                      {m.mode}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Timeline Events */}
          {matchedEvents.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 mb-1.5">
                Timeline Events ({matchedEvents.length})
              </div>
              <div className="space-y-1">
                {matchedEvents.slice(0, 4).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      setCurrentTick(ev.startTick);
                      setActiveModule('timeline');
                      toggleQuickSearch(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/90 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Clock className="w-4 h-4 text-sky-400" />
                      <div>
                        <div className="text-xs font-semibold text-slate-100">{ev.title}</div>
                        <div className="text-[11px] text-slate-400">{ev.summary}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-sky-300">
                      Jump to Tick {ev.startTick}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Worlds */}
          {matchedWorlds.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 mb-1.5">
                Connected Worlds & Planes ({matchedWorlds.length})
              </div>
              <div className="space-y-1">
                {matchedWorlds.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setActiveWorld(w.id);
                      setActiveModule('cosmology');
                      toggleQuickSearch(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/90 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Globe2 className="w-4 h-4 text-purple-400" />
                      <div>
                        <div className="text-xs font-semibold text-slate-100">{w.name}</div>
                        <div className="text-[11px] text-slate-400">{w.summary}</div>
                      </div>
                    </div>
                    <span className="text-[10px] uppercase text-slate-400">{w.type}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stories */}
          {project.stories.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 mb-1.5">
                Stories & Manuscripts
              </div>
              {project.stories.map((st) =>
                st.chapters.flatMap((ch) =>
                  ch.scenes
                    .filter((sc) => !q || sc.title.toLowerCase().includes(q))
                    .map((sc) => (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => {
                          selectStoryScene(st.id, sc.id);
                          toggleQuickSearch(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/90 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <Feather className="w-4 h-4 text-pink-400" />
                          <div>
                            <div className="text-xs font-semibold text-slate-100">
                              {st.title} — {sc.title}
                            </div>
                            <div className="text-[11px] text-slate-400">{sc.summary}</div>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400">{sc.status}</span>
                      </button>
                    ))
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

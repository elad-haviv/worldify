import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import { EntityCategory, EntityRelation } from '../../types/worldify';
import {
  computeAllProjectRelations,
  findShortestLorePath,
} from '../../utils/wikiParser';
import { resolveEntityTemporalStatus } from '../../utils/spatioTemporalResolver';
import {
  Network,
  Route,
  RefreshCw,
  BookOpen,
  Clock,
  Filter,
  ZoomIn,
  ZoomOut,
  Plus,
  Edit3,
  Trash2,
} from 'lucide-react';
import { SidePanel } from '../../components/SidePanel';
import { EditConnectionModal } from '../../components/EditConnectionModal';
import { SigmaGraph, SigmaGraphHandle, GraphNodeInput, GraphEdgeInput } from '../../components/SigmaGraph';
import { categoryLabel, categoryColor, getProjectCategories } from '../../utils/categories';

export const KnowledgeGraphView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedEntityId,
    selectEntity,
    addRelation,
    updateRelation,
    deleteRelation,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId);

  const [categoryFilter, setCategoryFilter] = useState<EntityCategory | 'all'>('all');
  const [worldFilter, setWorldFilter] = useState<string>('all');
  const [edgeFilter, setEdgeFilter] = useState<'all' | 'semantic' | 'mention' | 'property_ref'>('all');
  const [temporalFilterActive, setTemporalFilterActive] = useState<boolean>(false);
  const [neighborhoodOnly, setNeighborhoodOnly] = useState<boolean>(false);

  // Shortest-path state
  const [pathStartId, setPathStartId] = useState<string>('');
  const [pathEndId, setPathEndId] = useState<string>('');

  // Quick Add Edge state
  const [newEdgeTargetId, setNewEdgeTargetId] = useState<string>('');
  const [newEdgeLabel, setNewEdgeLabel] = useState<string>('');
  const [editingRelation, setEditingRelation] = useState<EntityRelation | null | undefined>(undefined);

  const [layoutVersion, setLayoutVersion] = useState<number>(0);
  const graphApi = useRef<SigmaGraphHandle>(null);

  const allRelations = useMemo(
    () => (project ? computeAllProjectRelations(project) : []),
    [project]
  );

  // Filtered Nodes & Edges
  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (!project) return { visibleNodes: [], visibleEdges: [] };
    const calendar = project.calendars.find((c) => c.id === project.activeCalendarId);

    let nodes = project.entities.filter((ent) => {
      if (categoryFilter !== 'all' && ent.category !== categoryFilter) return false;
      if (worldFilter !== 'all' && ent.worldId !== worldFilter) return false;
      if (temporalFilterActive) {
        const st = resolveEntityTemporalStatus(ent, project.currentTick, calendar);
        if (st.lifecycleState !== 'active') return false;
      }
      return true;
    });

    const nodeSet = new Set(nodes.map((n) => n.id));

    let edges = allRelations.filter((rel) => {
      if (!nodeSet.has(rel.sourceEntityId) || !nodeSet.has(rel.targetEntityId)) return false;
      if (edgeFilter === 'semantic' && (rel.type === 'mention' || rel.type === 'property_ref'))
        return false;
      if (edgeFilter === 'mention' && rel.type !== 'mention') return false;
      if (edgeFilter === 'property_ref' && rel.type !== 'property_ref') return false;
      if (temporalFilterActive) {
        if (rel.validFromTick !== undefined && project.currentTick < rel.validFromTick)
          return false;
        if (rel.validToTick !== undefined && project.currentTick > rel.validToTick)
          return false;
      }
      return true;
    });

    if (neighborhoodOnly && selectedEntityId && nodeSet.has(selectedEntityId)) {
      const keepIds = new Set<string>([selectedEntityId]);
      edges.forEach((e) => {
        if (e.sourceEntityId === selectedEntityId) keepIds.add(e.targetEntityId);
        if (e.targetEntityId === selectedEntityId) keepIds.add(e.sourceEntityId);
      });
      nodes = nodes.filter((n) => keepIds.has(n.id));
      edges = edges.filter(
        (e) => keepIds.has(e.sourceEntityId) && keepIds.has(e.targetEntityId)
      );
    }

    return { visibleNodes: nodes, visibleEdges: edges };
  }, [
    project,
    allRelations,
    categoryFilter,
    worldFilter,
    edgeFilter,
    temporalFilterActive,
    neighborhoodOnly,
    selectedEntityId,
  ]);

  if (!project) return null;

  // Shortest path calculation
  const shortestPath = useMemo(() => {
    if (!pathStartId || !pathEndId) return null;
    return findShortestLorePath(visibleEdges, pathStartId, pathEndId);
  }, [visibleEdges, pathStartId, pathEndId]);

  const pathNodeSet = useMemo(() => new Set(shortestPath?.entityIds || []), [shortestPath]);
  const pathEdgeSet = useMemo(() => new Set(shortestPath?.relationIds || []), [shortestPath]);

  // Degree count per node
  const degreeMap = new Map<string, number>();
  visibleEdges.forEach((e) => {
    degreeMap.set(e.sourceEntityId, (degreeMap.get(e.sourceEntityId) || 0) + 1);
    degreeMap.set(e.targetEntityId, (degreeMap.get(e.targetEntityId) || 0) + 1);
  });

  const activeEntity = project.entities.find((e) => e.id === selectedEntityId);
  const projectCategories = getProjectCategories(project);

  const graphNodes: GraphNodeInput[] = useMemo(() => visibleNodes.map((n) => ({
    id: n.id,
    label: n.title,
    color: categoryColor(n.category, project),
    size: Math.min(16, 3 + Math.sqrt(degreeMap.get(n.id) || 0) * 1.8),
  })), [visibleNodes, visibleEdges, project]); // eslint-disable-line react-hooks/exhaustive-deps
  const graphEdges: GraphEdgeInput[] = useMemo(() => visibleEdges.map((e) => ({
    id: e.id,
    source: e.sourceEntityId,
    target: e.targetEntityId,
    color: e.type === 'mention' ? '#273449' : e.type === 'property_ref' ? '#0c4a6e' : '#78350f',
    label: e.type === 'mention' ? undefined : e.label,
  })), [visibleEdges]);

  return (
    <div className="h-full flex bg-slate-950 overflow-hidden">
      {/* Left Filter & Shortest-Path Panel */}
      <SidePanel side="left" panelId="graph-filters" label="Filters" width="w-72" defaultOpen={true} className="p-4 flex flex-col gap-4 overflow-y-auto text-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
            <Network className="w-4 h-4 text-sky-400" />
            Knowledge Graph
          </h2>
          <button
            type="button"
            onClick={() => setLayoutVersion((v) => v + 1)}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-xs cursor-pointer"
            title="Re-arrange the graph"
          >
            <RefreshCw className="w-3 h-3 text-amber-400" />
            Layout
          </button>
        </div>

        {/* Graph Filters */}
        <div className="space-y-2.5 pt-2 border-t border-slate-800">
          <div className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
            <Filter className="w-3 h-3 text-amber-400" />
            Graph Filters
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">World Filter</label>
            <select
              value={worldFilter}
              onChange={(e) => setWorldFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200"
            >
              <option value="all">All Connected Worlds</option>
              {project.worlds.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Entity Category</label>
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as EntityCategory | 'all')
              }
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200"
            >
              <option value="all">All Categories ({project.entities.length})</option>
              {projectCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.plural}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Connection Type</label>
            <select
              value={edgeFilter}
              onChange={(e) => setEdgeFilter(e.target.value as typeof edgeFilter)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200"
            >
              <option value="all">All Connections ({allRelations.length})</option>
              <option value="semantic">Explicit Semantic Edges Only</option>
              <option value="mention">Markdown [[WikiLinks]] Only</option>
              <option value="property_ref">Template Property Links Only</option>
            </select>
          </div>

          <label className="flex items-center gap-2 pt-1 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={temporalFilterActive}
              onChange={(e) => setTemporalFilterActive(e.target.checked)}
              className="accent-amber-500"
            />
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>Filter by Current Timeline Tick</span>
          </label>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={neighborhoodOnly}
              onChange={(e) => setNeighborhoodOnly(e.target.checked)}
              className="accent-amber-500"
            />
            <span>1-Hop Local Neighborhood Only</span>
          </label>
        </div>

        {/* Shortest Lore Path Finder */}
        <div className="space-y-2.5 pt-3 border-t border-slate-800">
          <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Route className="w-3.5 h-3.5" />
            Find a connection
          </div>
          <p className="text-xs text-slate-400">
            Discover how any two entities in your project are connected across the wiki graph.
          </p>

          <select
            value={pathStartId}
            onChange={(e) => setPathStartId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200"
          >
            <option value="">— Start Entity —</option>
            {visibleNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>

          <select
            value={pathEndId}
            onChange={(e) => setPathEndId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200"
          >
            <option value="">— Target Entity —</option>
            {visibleNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>

          {pathStartId && pathEndId && (
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              {shortestPath ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-emerald-400">
                    Connected in {shortestPath.entityIds.length - 1} hop(s):
                  </div>
                  <div className="text-xs text-slate-300 leading-relaxed">
                    {shortestPath.entityIds
                      .map((id) => project.entities.find((e) => e.id === id)?.title)
                      .join(' → ')}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-rose-400">
                  No direct path found under current filters.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Category Color Legend */}
        <div className="pt-3 border-t border-slate-800 space-y-1.5">
          <div className="text-xs capitalize text-slate-500 font-semibold">
            Category Legend
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {projectCategories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-1.5 text-xs text-slate-300">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="truncate">{cat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </SidePanel>

      {/* Center: Interactive Force-Directed Graph Canvas */}
      <div className="flex-1 relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black overflow-hidden">
        {/* Zoom Controls Overlay */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1 shadow-lg">
          <button
            type="button"
            onClick={() => graphApi.current?.zoomIn()}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => graphApi.current?.zoomOut()}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => graphApi.current?.fit()}
            className="px-2 py-1 rounded hover:bg-slate-800 text-xs text-slate-300 cursor-pointer"
          >
            Reset
          </button>
        </div>

        <SigmaGraph
          ref={graphApi}
          nodes={graphNodes}
          edges={graphEdges}
          selectedId={selectedEntityId}
          pathNodeIds={pathNodeSet}
          pathEdgeIds={pathEdgeSet}
          layoutVersion={layoutVersion}
          onSelect={(id) => selectEntity(id)}
        />
        <div className="absolute bottom-3 left-3 z-10 text-xs text-slate-500 pointer-events-none">
          Hover to highlight connections · click to select · drag nodes · scroll to zoom
        </div>
      </div>

      {/* Right Selected Node Inspector */}
      {activeEntity && (
        <SidePanel side="right" panelId="graph-details" label="Details" width="w-80" defaultOpen={true} className="p-4 overflow-y-auto space-y-4 text-sm">
          <div>
            <span className="text-xs capitalize px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">
              {categoryLabel(activeEntity.category, project)}
            </span>
            <h3 className="text-lg font-semibold text-slate-100 mt-1.5">
              {activeEntity.title}
            </h3>
            {activeEntity.subtitle && (
              <p className="text-xs text-amber-200/80 italic">{activeEntity.subtitle}</p>
            )}
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              {activeEntity.summary}
            </p>
          </div>

          <button
            type="button"
            onClick={() => selectEntity(activeEntity.id, true)}
            className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Open in Wiki
          </button>

          {/* Quick Connect Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const target =
                newEdgeTargetId ||
                project.entities.find((en) => en.id !== activeEntity.id)?.id;
              if (!target) return;
              addRelation({
                sourceEntityId: activeEntity.id,
                targetEntityId: target,
                type: 'allied_with',
                label: newEdgeLabel.trim() || 'connected to',
              });
              setNewEdgeLabel('');
            }}
            className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2"
          >
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              Link to another entry
            </div>
            <select
              value={
                newEdgeTargetId ||
                project.entities.find((en) => en.id !== activeEntity.id)?.id ||
                ''
              }
              onChange={(e) => setNewEdgeTargetId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200"
            >
              {project.entities
                .filter((en) => en.id !== activeEntity.id)
                .map((peer) => (
                  <option key={peer.id} value={peer.id}>
                    {peer.title}
                  </option>
                ))}
            </select>
            <input
              type="text"
              value={newEdgeLabel}
              onChange={(e) => setNewEdgeLabel(e.target.value)}
              placeholder="Relationship label (e.g., sworn vassal of)"
              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200"
            />
            <button
              type="submit"
              className="w-full py-1.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 font-medium cursor-pointer"
            >
              Add Connection
            </button>
          </form>

          {/* Direct Neighbors List */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-300">
                Connections (
                {
                  visibleEdges.filter(
                    (e) =>
                      e.sourceEntityId === activeEntity.id ||
                      e.targetEntityId === activeEntity.id
                  ).length
                }
                )
              </div>
              <button
                type="button"
                onClick={() => setEditingRelation(null)}
                className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {visibleEdges
                .filter(
                  (e) =>
                    e.sourceEntityId === activeEntity.id ||
                    e.targetEntityId === activeEntity.id
                )
                .map((rel) => {
                  const isOut = rel.sourceEntityId === activeEntity.id;
                  const otherId = isOut ? rel.targetEntityId : rel.sourceEntityId;
                  const other = project.entities.find((en) => en.id === otherId);
                  if (!other) return null;
                  const isAuto = rel.id.startsWith('auto-');
                  return (
                    <div
                      key={rel.id}
                      className="w-full p-2 rounded bg-slate-950 hover:bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => selectEntity(other.id)}
                        className="text-left flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="truncate">
                          <div className="text-[11px] text-slate-400 flex items-center gap-1">
                            {rel.bidirectional ? (
                              <span className="text-emerald-400">↔ {rel.label}</span>
                            ) : isOut ? (
                              <span className="text-amber-400">→ {rel.label}</span>
                            ) : (
                              <span className="text-sky-400">← {rel.label}</span>
                            )}
                            {isAuto && (
                              <span className="px-1 py-0.2 rounded bg-slate-800 text-[9px] text-slate-400">
                                auto
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-slate-200 truncate text-xs flex items-center gap-1.5 mt-0.5">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: categoryColor(other.category) }}
                            />
                            {other.title}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingRelation(rel)}
                          className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer transition-colors"
                          title={isAuto ? 'Customize connection' : 'Edit connection'}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {!isAuto && (
                          <button
                            type="button"
                            onClick={() => deleteRelation(rel.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
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
          </div>
        </SidePanel>
      )}

      {/* Edit Connection Modal */}
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

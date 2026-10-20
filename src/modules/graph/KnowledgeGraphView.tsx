import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import { EntityCategory } from '../../types/worldify';
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
} from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  character: '#f59e0b',
  settlement: '#38bdf8',
  faction: '#10b981',
  item: '#ec4899',
  deity: '#a855f7',
  location: '#6366f1',
  species: '#14b8a6',
  magic_tech: '#eab308',
};

interface NodeLayout {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export const KnowledgeGraphView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedEntityId,
    selectEntity,
    addRelation,
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

  // Pan / Zoom / Drag
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [positions, setPositions] = useState<Record<string, NodeLayout>>({});

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

  // Run Force-Directed Layout whenever project or node list changes
  const runForceLayout = () => {
    if (!project) return;
    const n = project.entities.length;
    if (n === 0) return;

    const layoutMap: Record<string, NodeLayout> = {};
    project.entities.forEach((ent, idx) => {
      const angle = (idx / n) * Math.PI * 2;
      const radius = 240 + (idx % 3) * 65;
      layoutMap[ent.id] = {
        id: ent.id,
        x: 500 + Math.cos(angle) * radius,
        y: 500 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });

    // 90 iterations of Fruchterman-Reingold / spring-repulsion simulation
    const ids = Object.keys(layoutMap);
    for (let iter = 0; iter < 220; iter++) {
      // Repulsion
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = layoutMap[ids[i]];
          const b = layoutMap[ids[j]];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = Math.max(400, dx * dx + dy * dy);
          const dist = Math.sqrt(distSq);
          const force = 140000 / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      // Attraction along edges
      for (const edge of allRelations) {
        const a = layoutMap[edge.sourceEntityId];
        const b = layoutMap[edge.targetEntityId];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const desired = 240;
        const force = (dist - desired) * 0.012;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Center gravity + update
      for (const id of ids) {
        const node = layoutMap[id];
        node.vx += (500 - node.x) * 0.006;
        node.vy += (500 - node.y) * 0.006;
        node.x = Math.max(70, Math.min(930, node.x + node.vx * 0.35));
        node.y = Math.max(70, Math.min(930, node.y + node.vy * 0.35));
        node.vx *= 0.5;
        node.vy *= 0.5;
      }
    }

    setPositions(layoutMap);
  };

  useEffect(() => {
    runForceLayout();
  }, [activeProjectId, project?.entities.length]);

  if (!project) return null;

  // Shortest path calculation
  const shortestPath = useMemo(() => {
    if (!pathStartId || !pathEndId) return null;
    return findShortestLorePath(visibleEdges, pathStartId, pathEndId);
  }, [visibleEdges, pathStartId, pathEndId]);

  const pathNodeSet = new Set(shortestPath?.entityIds || []);
  const pathEdgeSet = new Set(shortestPath?.relationIds || []);

  // Degree count per node
  const degreeMap = new Map<string, number>();
  visibleEdges.forEach((e) => {
    degreeMap.set(e.sourceEntityId, (degreeMap.get(e.sourceEntityId) || 0) + 1);
    degreeMap.set(e.targetEntityId, (degreeMap.get(e.targetEntityId) || 0) + 1);
  });

  const activeEntity = project.entities.find((e) => e.id === selectedEntityId);

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingNodeId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const rawX = ((e.clientX - rect.left) / rect.width) * 1000;
      const rawY = ((e.clientY - rect.top) / rect.height) * 1000;
      const x = (rawX - 500 - pan.x) / zoom + 500;
      const y = (rawY - 500 - pan.y) / zoom + 500;
      setPositions((prev) => ({
        ...prev,
        [draggingNodeId]: {
          ...(prev[draggingNodeId] || { id: draggingNodeId, vx: 0, vy: 0 }),
          x: Math.max(50, Math.min(950, x)),
          y: Math.max(50, Math.min(950, y)),
        },
      }));
    } else if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
  };

  return (
    <div className="h-full flex bg-slate-950 overflow-hidden">
      {/* Left Filter & Shortest-Path Panel */}
      <aside className="w-72 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto shrink-0 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
            <Network className="w-4 h-4 text-sky-400" />
            Knowledge Graph
          </h2>
          <button
            type="button"
            onClick={runForceLayout}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-xs cursor-pointer"
            title="Re-run Force Layout Simulation"
          >
            <RefreshCw className="w-3 h-3 text-amber-400" />
            Layout
          </button>
        </div>

        {/* Graph Filters */}
        <div className="space-y-2.5 pt-2 border-t border-slate-800">
          <div className="text-xs font-semibold capitalize text-slate-400 flex items-center gap-1.5">
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
              <option value="character">Characters</option>
              <option value="settlement">Settlements</option>
              <option value="faction">Factions</option>
              <option value="item">Relics & Items</option>
              <option value="deity">Deities</option>
              <option value="location">Locations</option>
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
          <div className="text-xs font-semibold capitalize text-amber-400 flex items-center gap-1.5">
            <Route className="w-3.5 h-3.5" />
            Degrees of Lore Pathfiding
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
            {Object.entries(CATEGORY_COLORS).map(([cat, col]) => (
              <div key={cat} className="flex items-center gap-1.5 text-xs text-slate-300">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: col }}
                />
                <span className="capitalize">{cat.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Center: Interactive Force-Directed Graph Canvas */}
      <div className="flex-1 relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black overflow-hidden">
        {/* Zoom Controls Overlay */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1 shadow-lg">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-400 px-1.5">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.45, z - 0.2))}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="px-2 py-1 rounded hover:bg-slate-800 text-xs text-slate-300 cursor-pointer"
          >
            Reset
          </button>
        </div>

        <svg
          viewBox="0 0 1000 1000"
          className="w-full h-full select-none cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setIsPanning(true);
              panStartRef.current = { x: e.clientX, y: e.clientY };
            }
          }}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={() => {
            setDraggingNodeId(null);
            setIsPanning(false);
          }}
          onMouseLeave={() => {
            setDraggingNodeId(null);
            setIsPanning(false);
          }}
        >
          <g
            transform={`translate(${500 + pan.x}, ${500 + pan.y}) scale(${zoom}) translate(-500, -500)`}
          >
            {/* Edges */}
            {visibleEdges.map((edge) => {
              const sPos = positions[edge.sourceEntityId];
              const tPos = positions[edge.targetEntityId];
              if (!sPos || !tPos) return null;

              const isHighlighted =
                pathEdgeSet.has(edge.id) ||
                edge.sourceEntityId === selectedEntityId ||
                edge.targetEntityId === selectedEntityId;

              const midX = (sPos.x + tPos.x) / 2;
              const midY = (sPos.y + tPos.y) / 2;

              const strokeColor = pathEdgeSet.has(edge.id)
                ? '#10b981'
                : edge.type === 'mention'
                  ? '#475569'
                  : edge.type === 'property_ref'
                    ? '#38bdf8'
                    : '#f59e0b';

              return (
                <g key={edge.id} opacity={isHighlighted ? 1 : selectedEntityId ? 0.12 : 0.4}>
                  <line
                    x1={sPos.x}
                    y1={sPos.y}
                    x2={tPos.x}
                    y2={tPos.y}
                    stroke={strokeColor}
                    strokeWidth={pathEdgeSet.has(edge.id) ? 3.5 : isHighlighted ? 2.2 : 1.3}
                    strokeDasharray={edge.type === 'mention' ? '5 4' : undefined}
                  />
                  {isHighlighted && edge.type !== 'mention' && (
                    <text
                      x={midX}
                      y={midY - 6}
                      textAnchor="middle"
                      fill="#cbd5e1"
                      fontSize={12}
                      paintOrder="stroke"
                      stroke="#020617"
                      strokeWidth={4}
                      className="pointer-events-none"
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {visibleNodes.map((node) => {
              const pos = positions[node.id] || { x: 500, y: 500 };
              const deg = degreeMap.get(node.id) || 1;
              const radius = Math.min(30, 14 + deg * 2.2);
              const color = CATEGORY_COLORS[node.category] || '#f59e0b';
              const isSelected = node.id === selectedEntityId;
              const isOnPath = pathNodeSet.has(node.id);

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="cursor-pointer"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    selectEntity(node.id);
                    setDraggingNodeId(node.id);
                  }}
                >
                  {(isSelected || isOnPath) && (
                    <circle
                      r={radius + 9}
                      fill={isOnPath ? '#10b981' : color}
                      fillOpacity={0.22}
                      stroke={isOnPath ? '#10b981' : '#fbbf24'}
                      strokeWidth={2}
                    />
                  )}
                  <circle
                    r={radius}
                    fill="#0f172a"
                    stroke={color}
                    strokeWidth={isSelected ? 3.5 : 2.2}
                  />
                  <circle r={radius - 5} fill={color} fillOpacity={0.35} />
                  <text
                    y={radius + 16}
                    textAnchor="middle"
                    fill={isSelected ? '#fbbf24' : '#f1f5f9'}
                    fontSize={13}
                    paintOrder="stroke"
                    stroke="#020617"
                    strokeWidth={4}
                    fontWeight={isSelected ? 700 : 600}
                    className="pointer-events-none"
                  >
                    {node.title}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Right Selected Node Inspector */}
      {activeEntity && (
        <aside className="w-80 bg-slate-900 border-l border-slate-800 p-4 overflow-y-auto space-y-4 shrink-0 text-xs">
          <div>
            <span className="text-xs capitalize px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {activeEntity.category}
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
            Open Full Entry in Wiki
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
              Quick Link to Entity
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
            <div className="text-xs font-semibold capitalize text-slate-400">
              Direct Graph Edges (
              {
                visibleEdges.filter(
                  (e) =>
                    e.sourceEntityId === activeEntity.id ||
                    e.targetEntityId === activeEntity.id
                ).length
              }
              )
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
                  return (
                    <button
                      key={rel.id}
                      type="button"
                      onClick={() => selectEntity(other.id)}
                      className="w-full p-2 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left flex items-center justify-between cursor-pointer"
                    >
                      <div className="truncate">
                        <div className="text-xs text-slate-400">
                          {isOut ? `→ ${rel.label}` : `← ${rel.label}`}
                        </div>
                        <div className="font-semibold text-slate-200 truncate">
                          {other.title}
                        </div>
                      </div>
                      <span className="text-xs capitalize px-1.5 py-0.5 rounded bg-slate-900 text-slate-400">
                        {rel.type.replace('_', ' ')}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CharacterMind,
  Entity,
  Project,
  SimBranch,
  TimelineEvent,
  WorldMap,
} from '../../types/worldify';
import {
  resolveEntityMapPositionsAtTick,
  resolveZoneAtTick,
} from '../../utils/spatioTemporalResolver';
import { Compass, Eye, Navigation, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface LivingWorldMapCanvasProps {
  projectView: Project;
  activeBranch: SimBranch;
  activeMap: WorldMap | null;
  maps: WorldMap[];
  minds: CharacterMind[];
  recentBranchEvents: TimelineEvent[];
  onSelectMap: (mapId: string) => void;
  onInspectCharacter: (entity: Entity) => void;
}

const BIOME_COLORS: Record<string, string> = {
  deep_ocean: '#091526',
  coastal_sea: '#0f253e',
  ice_sheet: '#cbd5e1',
  tundra: '#64748b',
  taiga: '#1e3a2f',
  temperate_forest: '#1f472a',
  grassland: '#365314',
  savanna: '#713f12',
  desert: '#9a6b26',
  tropical_rainforest: '#14532d',
  wetland: '#134e4a',
  alpine_peak: '#475569',
  volcanic_wastes: '#451a1a',
};

export const LivingWorldMapCanvas: React.FC<LivingWorldMapCanvasProps> = ({
  projectView,
  activeBranch,
  activeMap,
  maps,
  minds,
  recentBranchEvents,
  onSelectMap,
  onInspectCharacter,
}) => {
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [showEventRipples, setShowEventRipples] = useState<boolean>(true);

  // Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dynamic aspect ratio calculation for raster maps (matching MapView.tsx)
  const [rasterNaturalSize, setRasterNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (activeMap?.rasterImageUrl) {
      const img = new Image();
      img.onload = () => {
        setRasterNaturalSize({
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
      };
      img.src = activeMap.rasterImageUrl;
      if (img.complete && (img.naturalWidth || img.width)) {
        setRasterNaturalSize({
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
      }
    } else {
      setRasterNaturalSize(null);
    }
  }, [activeMap?.id, activeMap?.mode, activeMap?.rasterImageUrl]);

  const canvasHeight = useMemo(() => {
    if (!activeMap || (activeMap.mode === 'procedural' && !activeMap.rasterImageUrl)) {
      return 1000;
    }
    if (
      rasterNaturalSize &&
      rasterNaturalSize.width > 0 &&
      rasterNaturalSize.height > 0
    ) {
      return Math.max(
        200,
        Math.min(
          2000,
          Math.round((1000 * rasterNaturalSize.height) / rasterNaturalSize.width)
        )
      );
    }
    return 1000;
  }, [activeMap, rasterNaturalSize]);

  const toCanvasY = (normY: number) => (normY / 1000) * canvasHeight;

  const entityPositions = useMemo(() => {
    if (!activeMap) return [];
    return resolveEntityMapPositionsAtTick(
      projectView,
      activeMap,
      activeBranch.currentTick
    );
  }, [projectView, activeMap, activeBranch.currentTick]);

  const mindByEntityId = useMemo(() => {
    const map = new Map<string, CharacterMind>();
    for (const m of minds) {
      if (m.branchId === activeBranch.id) {
        map.set(m.entityId, m);
      }
    }
    return map;
  }, [minds, activeBranch.id]);

  const latestTickEventsOnMap = useMemo(() => {
    if (!activeMap) return [];
    return recentBranchEvents
      .filter(
        (ev) =>
          (!ev.mapId || ev.mapId === activeMap.id) &&
          ev.mapX !== undefined &&
          ev.mapY !== undefined &&
          Math.abs(ev.startTick - activeBranch.currentTick) <= 3600
      )
      .slice(-6);
  }, [recentBranchEvents, activeMap, activeBranch.currentTick]);

  if (!activeMap) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-8 text-center">
        <Compass className="w-12 h-12 text-amber-500/50 mb-3" />
        <p className="text-base font-medium text-slate-200">No active map in project</p>
        <p className="text-xs text-slate-500 mt-1">
          The living world can run without a map, but adding one in the Maps module lets you see character movement and their route trails.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 w-full h-full bg-slate-950 overflow-hidden flex flex-col select-none">
      {/* Map Overlay Header Controls */}
      <div className="absolute top-3 right-3 left-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-1.5 shadow-lg pointer-events-auto">
          <Navigation className="w-4 h-4 text-amber-400" />
          <select
            value={activeMap.id}
            onChange={(e) => onSelectMap(e.target.value)}
            className="bg-transparent text-xs font-medium text-slate-100 focus:outline-none cursor-pointer"
          >
            {maps.map((m) => (
              <option key={m.id} value={m.id} className="bg-slate-900 text-slate-100">
                {m.name} ({m.totalWidthUnits} {m.scaleUnit})
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-400 border-l border-slate-700 pl-2 ml-1">
            {entityPositions.length} entities on map
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-1 shadow-lg pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowTrails(!showTrails)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              showTrails
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Movement trails
          </button>
          <button
            type="button"
            onClick={() => setShowEventRipples(!showEventRipples)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              showEventRipples
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Event hotspots
          </button>

          <div className="h-4 border-l border-slate-700 mx-0.5" />

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, z * 1.25))}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1 rounded-lg text-amber-400 hover:bg-slate-800 cursor-pointer"
              title="Reset map view"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main SVG Map Canvas with natural aspect ratio (1000 x canvasHeight) */}
      <svg
        viewBox={`0 0 1000 ${canvasHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className={`w-full h-full bg-[#07111e] ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          setIsPanning(true);
          panStartRef.current = { x: e.clientX, y: e.clientY };
        }}
        onMouseMove={(e) => {
          if (!isPanning) return;
          const svg = e.currentTarget;
          const rect = svg.getBoundingClientRect();
          const unit = 1000 / Math.max(1, rect.width);
          const dx = (e.clientX - panStartRef.current.x) * unit;
          const dy = (e.clientY - panStartRef.current.y) * unit;
          panStartRef.current = { x: e.clientX, y: e.clientY };
          setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        }}
        onMouseUp={() => setIsPanning(false)}
        onMouseLeave={() => setIsPanning(false)}
        onWheel={(e) => {
          const svg = e.currentTarget;
          const ctm = svg.getScreenCTM();
          if (!ctm) return;
          const pt = svg.createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;
          const v = pt.matrixTransform(ctm.inverse());
          const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          const next = Math.min(4, Math.max(0.5, zoom * factor));
          const centerY = canvasHeight / 2;
          const wx = (v.x - 500 - pan.x) / zoom + 500;
          const wy = (v.y - centerY - pan.y) / zoom + centerY;
          setZoom(next);
          setPan({
            x: v.x - 500 - (wx - 500) * next,
            y: v.y - centerY - (wy - centerY) * next,
          });
        }}
      >
        <defs>
          <radialGradient id="simEventGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
            <stop offset="70%" stopColor="#f59e0b" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g
          transform={`translate(${500 + pan.x}, ${
            canvasHeight / 2 + pan.y
          }) scale(${zoom}) translate(-500, -${canvasHeight / 2})`}
        >
          {/* 1. Raster Image or Procedural Voronoi Cells */}
          {activeMap.rasterImageUrl ? (
            <image
              href={activeMap.rasterImageUrl}
              x={0}
              y={0}
              width={1000}
              height={canvasHeight}
              preserveAspectRatio="none"
            />
          ) : activeMap.proceduralData ? (
            <g>
              {activeMap.proceduralData.cells.map((cell) => (
                <polygon
                  key={cell.id}
                  points={cell.polygon.map((p) => `${p[0]},${p[1]}`).join(' ')}
                  fill={BIOME_COLORS[cell.biome] || '#1e293b'}
                  stroke={
                    cell.elevation >= activeMap.proceduralData!.seaLevel
                      ? '#1e293b'
                      : 'none'
                  }
                  strokeWidth={0.4}
                />
              ))}
              {activeMap.proceduralData.rivers.map((river) => (
                <polyline
                  key={river.id}
                  points={river.points.map((p) => `${p[0]},${p[1]}`).join(' ')}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={Math.max(1, river.width * 0.8)}
                  strokeLinecap="round"
                  opacity={0.65}
                />
              ))}
            </g>
          ) : (
            <rect x={0} y={0} width={1000} height={canvasHeight} fill="#0b1526" />
          )}

          {/* Subtle Coordinate Grid */}
          <g stroke="#334155" strokeWidth={0.5} opacity={0.2}>
            {[200, 400, 600, 800].map((pos) => (
              <React.Fragment key={pos}>
                <line x1={pos} y1={0} x2={pos} y2={canvasHeight} />
                <line
                  x1={0}
                  y1={toCanvasY(pos)}
                  x2={1000}
                  y2={toCanvasY(pos)}
                />
              </React.Fragment>
            ))}
          </g>

          {/* 2. Territorial Zones at Current Branch Tick */}
          {activeMap.zones.map((zone) => {
            const resolved = resolveZoneAtTick(zone, activeBranch.currentTick);
            if (!resolved.active || resolved.points.length < 3) return null;
            return (
              <g key={zone.id}>
                <polygon
                  points={resolved.points
                    .map((p) => `${p[0]},${toCanvasY(p[1])}`)
                    .join(' ')}
                  fill={zone.color}
                  fillOpacity={zone.opacity ?? 0.2}
                  stroke={zone.color}
                  strokeWidth={2}
                  strokeDasharray={
                    zone.borderStyle === 'dashed'
                      ? '8 4'
                      : zone.borderStyle === 'dotted'
                        ? '3 3'
                        : undefined
                  }
                />
              </g>
            );
          })}

          {/* 3. Map Paths */}
          {activeMap.paths.map((path) => (
            <polyline
              key={path.id}
              points={path.points
                .map((p) => `${p[0]},${toCanvasY(p[1])}`)
                .join(' ')}
              fill="none"
              stroke={path.color || '#94a3b8'}
              strokeWidth={2}
              strokeDasharray={path.dashed ? '6 4' : undefined}
              opacity={0.6}
            />
          ))}

          {/* 4. Procedural Burgs & Static Markers */}
          {activeMap.proceduralData?.burgs.map((burg) => (
            <g
              key={burg.id}
              transform={`translate(${burg.x}, ${toCanvasY(burg.y)})`}
            >
              <circle
                r={burg.isCapital ? 5.5 : 3.5}
                fill={burg.isCapital ? '#fbbf24' : '#e2e8f0'}
                stroke="#0f172a"
                strokeWidth={1.5}
              />
              <text
                y={-8}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize={burg.isCapital ? 11 : 9}
                fontWeight={burg.isCapital ? 'bold' : 'normal'}
                style={{ textShadow: '0 1px 3px #000' }}
              >
                {burg.name}
              </text>
            </g>
          ))}

          {activeMap.markers.map((marker) => (
            <g
              key={marker.id}
              transform={`translate(${marker.x}, ${toCanvasY(marker.y)})`}
            >
              <circle
                r={5}
                fill={marker.color || '#f59e0b'}
                stroke="#0f172a"
                strokeWidth={1.5}
              />
              <text
                y={-8}
                textAnchor="middle"
                fill="#f8fafc"
                fontSize={10}
                fontWeight="600"
                style={{ textShadow: '0 1px 3px #000' }}
              >
                {marker.name}
              </text>
            </g>
          ))}

          {/* 5. Recent Simulation Event Ripples */}
          {showEventRipples &&
            latestTickEventsOnMap.map((ev) => (
              <g
                key={ev.id}
                transform={`translate(${ev.mapX!}, ${toCanvasY(ev.mapY!)})`}
              >
                <circle r={42} fill="url(#simEventGlow)" />
                <circle
                  r={18}
                  fill="none"
                  stroke={ev.source === 'intervention' ? '#f43f5e' : '#f59e0b'}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <text
                  y={28}
                  textAnchor="middle"
                  fill="#fde68a"
                  fontSize={9.5}
                  fontWeight="600"
                  style={{ textShadow: '0 1px 4px #000' }}
                >
                  ⚡ {ev.title.slice(0, 26)}
                </text>
              </g>
            ))}

          {/* 6. Character Trajectory Trails (Canon + Branch Keyframes) */}
          {showTrails &&
            entityPositions.map((pos) => {
              if (!pos.trailPoints || pos.trailPoints.length < 2) return null;
              const mind = mindByEntityId.get(pos.entity.id);
              const isProtagonist = mind?.tier === 'protagonist';
              return (
                <g key={`trail-${pos.entity.id}`}>
                  <polyline
                    points={pos.trailPoints
                      .map((pt) => `${pt.x},${toCanvasY(pt.y)}`)
                      .join(' ')}
                    fill="none"
                    stroke={isProtagonist ? '#10b981' : '#38bdf8'}
                    strokeWidth={isProtagonist ? 3 : 2}
                    strokeDasharray="5 4"
                    opacity={0.8}
                  />
                  {pos.trailPoints.slice(0, -1).map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={toCanvasY(pt.y)}
                      r={3}
                      fill={pt.isBranch ? '#10b981' : '#94a3b8'}
                      opacity={0.7}
                    />
                  ))}
                </g>
              );
            })}

          {/* 7. Live Entity / Character Tokens */}
          {entityPositions.map((pos) => {
            const mind = mindByEntityId.get(pos.entity.id);
            const isProtagonist = mind?.tier === 'protagonist';
            const isDeceased = pos.lifecycleState === 'ended';
            const isHovered = hoveredEntityId === pos.entity.id;

            const strokeColor = isDeceased
              ? '#ef4444'
              : isProtagonist
                ? '#10b981'
                : '#f59e0b';

            return (
              <g
                key={pos.entity.id}
                transform={`translate(${pos.x}, ${toCanvasY(pos.y)})`}
                className="cursor-pointer transition-transform duration-300"
                onMouseEnter={() => setHoveredEntityId(pos.entity.id)}
                onMouseLeave={() => setHoveredEntityId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onInspectCharacter(pos.entity);
                }}
              >
                {isProtagonist && !isDeceased && (
                  <circle
                    r={isHovered ? 20 : 15}
                    fill={strokeColor}
                    opacity={0.2}
                  />
                )}
                <circle
                  r={isProtagonist ? 10 : 7.5}
                  fill="#0f172a"
                  stroke={strokeColor}
                  strokeWidth={isHovered ? 3.5 : 2.5}
                />
                <text
                  y={3.5}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize={isProtagonist ? 9.5 : 8}
                  fontWeight="bold"
                >
                  {pos.entity.title.slice(0, 2)}
                </text>
                <text
                  y={-14}
                  textAnchor="middle"
                  fill={isProtagonist ? '#6ee7b7' : '#fde68a'}
                  fontSize={isHovered ? 12 : 10.5}
                  fontWeight="bold"
                  style={{ textShadow: '0 2px 4px #000, 0 0 6px #000' }}
                >
                  {pos.activeTitle}
                </text>
                {(isHovered || isProtagonist) && mind?.latestIntent && (
                  <text
                    y={22}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize={8.5}
                    style={{ textShadow: '0 1px 3px #000' }}
                  >
                    💭 {mind.latestIntent.intent.replace(/\[\[|\]\]/g, '').slice(0, 32)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Bottom Legend Bar */}
      <div className="h-9 shrink-0 bg-slate-900/95 border-t border-slate-800 px-4 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            Active hero agent (click to open extended character card)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            Secondary character / entity
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-emerald-400 inline-block" />
            Branch route trail
          </span>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          <Eye className="w-3.5 h-3.5" />
          <span>Click any character on the map to view their inner journal and chat with them</span>
        </div>
      </div>
    </div>
  );
};

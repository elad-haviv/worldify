import React, { useMemo, useRef, useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import {
  MapLayerVisibility,
  MapMarker,
  MapMode,
  MapPath,
  ProceduralBurg,
  ProceduralTemplateType,
  VoronoiCellData,
} from '../../types/worldify';
import { BIOME_METADATA } from '../../utils/proceduralMapGenerator';
import {
  resolveEntityMapPositionsAtTick,
  resolveZoneAtTick,
} from '../../utils/spatioTemporalResolver';
import { formatTickToDate } from '../../utils/calendarEngine';
import {
  Map as MapIcon,
  Layers,
  MapPin,
  Route,
  Hexagon,
  Type,
  Ruler,
  MousePointer,
  Plus,
  RefreshCw,
  BookOpen,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
  Clock,
  Upload,
} from 'lucide-react';
import { SidePanel } from '../../components/SidePanel';
import { CATEGORY_META, categoryLabel, categoryColor } from '../../utils/categories';

type MapTool = 'select' | 'add_marker' | 'draw_path' | 'draw_zone' | 'add_label' | 'ruler';

export const MapView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedMapId,
    selectMap,
    selectEntity,
    setCurrentTick,
    createMap,
    regenerateProceduralMap,
    promoteBurgToEntity,
    promoteStateToEntity,
    addMapMarker,
    deleteMapMarker,
    addMapPath,
    deleteMapPath,
    addMapZone,
    deleteMapZone,
    addMapLabel,
    deleteMapLabel,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const [activeTool, setActiveTool] = useState<MapTool>('select');

  const [layers, setLayers] = useState<MapLayerVisibility>({
    biomes: true,
    elevation: false,
    rivers: true,
    politicalStates: true,
    zones: true,
    paths: true,
    markers: true,
    burgs: true,
    entityPositions: true,
    labels: true,
    grid: false,
  });

  // Viewport Pan & Zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Selection states
  const [selectedCell, setSelectedCell] = useState<VoronoiCellData | null>(null);
  const [selectedBurg, setSelectedBurg] = useState<ProceduralBurg | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);

  // Drawing states (Path, Zone, Ruler)
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState('#f59e0b');
  const [draftPathStyle, setDraftPathStyle] = useState<MapPath['style']>('trade_route');
  const [draftLinkedEntityId, setDraftLinkedEntityId] = useState('');
  const [draftValidFromTick, setDraftValidFromTick] = useState<string>('');

  // Marker placement modal state
  const [pendingCoord, setPendingCoord] = useState<[number, number] | null>(null);
  const [markerName, setMarkerName] = useState('');
  const [markerIcon, setMarkerIcon] = useState<MapMarker['icon']>('castle');
  const [markerColor, setMarkerColor] = useState('#f59e0b');
  const [markerEntityId, setMarkerEntityId] = useState('');

  // Procedural Generator Settings
  const [procSeed, setProcSeed] = useState<number>(7742);
  const [procTemplate, setProcTemplate] = useState<ProceduralTemplateType>('continents');
  const [procStateCount, setProcStateCount] = useState<number>(6);
  const [procSeaLevel, setProcSeaLevel] = useState<number>(30);

  // Create Map Modal
  const [showNewMapModal, setShowNewMapModal] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [newMapMode, setNewMapMode] = useState<MapMode>('procedural');
  const [newMapScaleUnit, setNewMapScaleUnit] = useState('miles');
  const [newMapWidthUnits, setNewMapWidthUnits] = useState(2400);
  const [newMapRasterUrl, setNewMapRasterUrl] = useState('');

  if (!project) return null;

  const activeMap =
    project.maps.find((m) => m.id === selectedMapId) || project.maps[0] || null;
  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];

  const formattedDate = calendar ? formatTickToDate(calendar, project.currentTick) : null;

  // Spatio-Temporal Entity Positions at Current Tick
  const liveEntityPositions = useMemo(() => {
    if (!activeMap) return [];
    return resolveEntityMapPositionsAtTick(project, activeMap, project.currentTick);
  }, [project, activeMap, project.currentTick]);

  if (!activeMap) return null;

  const svgPointFromEvent = (e: React.MouseEvent<SVGSVGElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * 1000;
    const rawY = ((e.clientY - rect.top) / rect.height) * 1000;
    const x = Math.round((rawX - 500 - pan.x) / zoom + 500);
    const y = Math.round((rawY - 500 - pan.y) / zoom + 500);
    return [Math.max(0, Math.min(1000, x)), Math.max(0, Math.min(1000, y))];
  };

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'select') return;
    const pt = svgPointFromEvent(e);

    if (activeTool === 'add_marker' || activeTool === 'add_label') {
      setPendingCoord(pt);
    } else if (
      activeTool === 'draw_path' ||
      activeTool === 'draw_zone' ||
      activeTool === 'ruler'
    ) {
      if (activeTool === 'ruler' && draftPoints.length >= 2) {
        setDraftPoints([pt]);
      } else {
        setDraftPoints((prev) => [...prev, pt]);
      }
    }
  };

  const handleCommitPath = () => {
    if (draftPoints.length < 2) return;
    addMapPath(activeMap.id, {
      name: draftName.trim() || 'New Route',
      style: draftPathStyle,
      color: draftColor,
      points: draftPoints,
      dashed: true,
      animated: true,
      linkedEntityId: draftLinkedEntityId || undefined,
      validFromTick: draftValidFromTick ? Number(draftValidFromTick) : undefined,
    });
    setDraftPoints([]);
    setDraftName('');
    setActiveTool('select');
  };

  const handleCommitZone = () => {
    if (draftPoints.length < 3) return;
    addMapZone(activeMap.id, {
      name: draftName.trim() || 'New Territorial Zone',
      color: draftColor,
      opacity: 0.25,
      borderStyle: 'solid',
      points: draftPoints,
      linkedEntityId: draftLinkedEntityId || undefined,
      validFromTick: draftValidFromTick ? Number(draftValidFromTick) : undefined,
    });
    setDraftPoints([]);
    setDraftName('');
    setActiveTool('select');
  };

  // Ruler Distance Calculation
  const rulerStats = useMemo(() => {
    if (draftPoints.length < 2) return null;
    let totalNorm = 0;
    for (let i = 0; i < draftPoints.length - 1; i++) {
      totalNorm += Math.hypot(
        draftPoints[i + 1][0] - draftPoints[i][0],
        draftPoints[i + 1][1] - draftPoints[i][1]
      );
    }
    const distance = Math.round((totalNorm / 1000) * activeMap.totalWidthUnits);
    return {
      distance,
      unit: activeMap.scaleUnit,
      footDays: (distance / 20).toFixed(1),
      cavalryDays: (distance / 45).toFixed(1),
      shipDays: (distance / 95).toFixed(1),
      airshipDays: (distance / 180).toFixed(1),
    };
  }, [draftPoints, activeMap.totalWidthUnits, activeMap.scaleUnit]);

  const handleRasterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setNewMapRasterUrl(String(ev.target?.result || ''));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="h-full flex bg-slate-950 overflow-hidden">
      {/* Left Sidebar: Map Switcher, Layer Stack & Procedural Generator Controls */}
      <SidePanel side="left" panelId="maps-tools" label="Map tools" width="w-72" defaultOpen={true} className="p-4 flex flex-col gap-4 overflow-y-auto text-sm">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <MapIcon className="w-4 h-4 text-emerald-400" />
              Maps
            </h2>
            <button
              type="button"
              onClick={() => setShowNewMapModal(true)}
              className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              New Map
            </button>
          </div>

          <select
            value={activeMap.id}
            onChange={(e) => selectMap(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100 font-medium"
          >
            {project.maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.mode})
              </option>
            ))}
          </select>
        </div>

        {/* Spatio-Temporal Historical Presets */}
        <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-300 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Jump to an event
            </span>
          </div>
          <div className="text-xs text-slate-300 font-medium">
            {formattedDate?.displayShort || `Tick ${project.currentTick}`}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Jump between eras or scrub the bottom timeline to watch kingdom borders morph and characters march along paths:
          </p>
          <div className="grid grid-cols-1 gap-1 pt-1">
            {project.timelineEvents.slice(0, 4).map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => setCurrentTick(ev.startTick)}
                className={`px-2 py-1 rounded text-left text-xs truncate border cursor-pointer ${
                  Math.abs(project.currentTick - ev.startTick) < 25
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                }`}
              >
                • {ev.title}
              </button>
            ))}
          </div>
        </div>

        {/* Layer Visibility Toggles */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            Layers
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {(
              [
                ['entityPositions', 'Live Entity Positions (Temporal)'],
                ['zones', 'Political & Temporal Zones'],
                ['paths', 'Trade Routes & Journey Paths'],
                ['markers', 'Locations & Citadel Markers'],
                ['biomes', 'Biomes & Terrain Polygons'],
                ['elevation', 'Elevation Heightmap Shading'],
                ['rivers', 'Hydrology & River Networks'],
                ['politicalStates', 'Procedural State Borders'],
                ['burgs', 'Procedural Burgs & Capitals'],
                ['labels', 'Region & Ocean Typography'],
                ['grid', 'Cartographic Hex/Coord Grid'],
              ] as Array<[keyof MapLayerVisibility, string]>
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-slate-100"
              >
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={(e) =>
                    setLayers((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  className="accent-amber-500"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Azgaar-style Procedural Map Generator Controls */}
        {activeMap.mode === 'procedural' && (
          <div className="space-y-2.5 pt-3 border-t border-slate-800">
            <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Generate terrain
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-0.5">World Seed</label>
                <input
                  type="number"
                  value={procSeed}
                  onChange={(e) => setProcSeed(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-0.5">States / Realms</label>
                <input
                  type="number"
                  min={2}
                  max={8}
                  value={procStateCount}
                  onChange={(e) => setProcStateCount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-0.5">
                Continental Template
              </label>
              <select
                value={procTemplate}
                onChange={(e) =>
                  setProcTemplate(e.target.value as ProceduralTemplateType)
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200"
              >
                <option value="continents">Twin Continents</option>
                <option value="pangaea">Supercontinent Pangaea</option>
                <option value="archipelago">Volcanic Archipelago</option>
                <option value="shattered_sea">Shattered Sea & Ridges</option>
                <option value="inland_sea">Inner Ring Sea</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-0.5">
                Sea Level Threshold ({procSeaLevel}m)
              </label>
              <input
                type="range"
                min={18}
                max={45}
                value={procSeaLevel}
                onChange={(e) => setProcSeaLevel(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() =>
                  regenerateProceduralMap(
                    activeMap.id,
                    procSeed,
                    procTemplate,
                    900,
                    procStateCount,
                    procSeaLevel
                  )
                }
                className="flex-1 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Generate
              </button>
              <button
                type="button"
                onClick={() => {
                  const randomSeed = Math.floor(Math.random() * 90000) + 1000;
                  setProcSeed(randomSeed);
                  regenerateProceduralMap(
                    activeMap.id,
                    randomSeed,
                    procTemplate,
                    900,
                    procStateCount,
                    procSeaLevel
                  );
                }}
                className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs cursor-pointer"
                title="Random Seed"
              >
                🎲 Random
              </button>
            </div>
          </div>
        )}
      </SidePanel>

      {/* Center: Interactive Map Viewport + Top Cartography Toolset */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-slate-950">
        {/* Top Interactive Drawing Toolbar */}
        <div className="px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 z-10">
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'select', label: 'Inspect', icon: MousePointer },
                { id: 'add_marker', label: '+ Marker', icon: MapPin },
                { id: 'draw_path', label: '+ Path / Route', icon: Route },
                { id: 'draw_zone', label: '+ Zone / Border', icon: Hexagon },
                { id: 'add_label', label: '+ Label', icon: Type },
                { id: 'ruler', label: 'Distance Ruler', icon: Ruler },
              ] as Array<{ id: MapTool; label: string; icon: React.FC<{ className?: string }> }>
            ).map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    setActiveTool(tool.id);
                    setDraftPoints([]);
                    setPendingCoord(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-amber-500/10 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tool.label}</span>
                </button>
              );
            })}
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3.0, z + 0.25))}
              className="p-1 text-slate-300 hover:text-amber-400 cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-slate-400 px-1.5">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              className="p-1 text-slate-300 hover:text-amber-400 cursor-pointer"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="px-2 py-0.5 text-xs text-slate-300 hover:text-amber-400 cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Active Drawing / Ruler Banner */}
        {(activeTool === 'draw_path' || activeTool === 'draw_zone') && (
          <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/40 flex flex-wrap items-center justify-between gap-2 text-xs z-10">
            <div className="flex items-center gap-2 text-amber-200">
              <span>
                Click points on the map ({draftPoints.length} placed).
              </span>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={
                  activeTool === 'draw_path' ? 'Route Name...' : 'Territory Name...'
                }
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
              />
              <input
                type="color"
                value={draftColor}
                onChange={(e) => setDraftColor(e.target.value)}
                className="w-6 h-6 rounded bg-transparent cursor-pointer"
              />
              {activeTool === 'draw_path' && (
                <select
                  value={draftPathStyle}
                  onChange={(e) =>
                    setDraftPathStyle(e.target.value as MapPath['style'])
                  }
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
                >
                  <option value="trade_route">Trade Route</option>
                  <option value="imperial_road">Imperial Road</option>
                  <option value="army_march">Army March</option>
                  <option value="character_journey">Character Journey</option>
                  <option value="sea_lane">Sea Lane</option>
                </select>
              )}
              <select
                value={draftLinkedEntityId}
                onChange={(e) => setDraftLinkedEntityId(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
              >
                <option value="">— Link Entity (Optional) —</option>
                {project.entities.map((en) => (
                  <option key={en.id} value={en.id}>
                    {en.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={
                  activeTool === 'draw_path' ? handleCommitPath : handleCommitZone
                }
                className="px-3 py-1 rounded bg-amber-500 text-slate-950 font-semibold cursor-pointer"
              >
                Save {activeTool === 'draw_path' ? 'Path' : 'Zone'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftPoints([]);
                  setActiveTool('select');
                }}
                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {activeTool === 'ruler' && (
          <div className="px-4 py-2 bg-sky-500/15 border-b border-sky-500/40 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-200 z-10">
            <span>
              Click any two points on the map to measure distance and travel times:
            </span>
            {rulerStats ? (
              <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                <strong className="text-amber-300">
                  Distance: {rulerStats.distance.toLocaleString()} {rulerStats.unit}
                </strong>
                <span>Foot: {rulerStats.footDays}d</span>
                <span>Cavalry: {rulerStats.cavalryDays}d</span>
                <span>Ship: {rulerStats.shipDays}d</span>
                <span>Sky-Ship/Griffin: {rulerStats.airshipDays}d</span>
              </div>
            ) : (
              <span className="text-slate-400">Click start and end points...</span>
            )}
          </div>
        )}

        {/* Main SVG Map Canvas */}
        <div className="flex-1 relative overflow-hidden bg-[#081b33]">
          <svg
            viewBox="0 0 1000 1000"
            className={`w-full h-full select-none ${
              activeTool === 'select'
                ? 'cursor-grab active:cursor-grabbing'
                : 'cursor-crosshair'
            }`}
            onClick={handleCanvasClick}
            onMouseDown={(e) => {
              if (activeTool === 'select' && e.button === 0) {
                setIsPanning(true);
                panStartRef.current = { x: e.clientX, y: e.clientY };
              }
            }}
            onMouseMove={(e) => {
              if (!isPanning) return;
              const dx = e.clientX - panStartRef.current.x;
              const dy = e.clientY - panStartRef.current.y;
              panStartRef.current = { x: e.clientX, y: e.clientY };
              setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
            }}
            onMouseUp={() => setIsPanning(false)}
            onMouseLeave={() => setIsPanning(false)}
          >
            <g
              transform={`translate(${500 + pan.x}, ${500 + pan.y}) scale(${zoom}) translate(-500, -500)`}
            >
              {/* MODE 1: PROCEDURAL VORONOI FANTASY MAP */}
              {activeMap.mode === 'procedural' && activeMap.proceduralData && (
                <g>
                  {/* Voronoi Cells Layer */}
                  {activeMap.proceduralData.cells.map((cell) => {
                    if (cell.polygon.length < 3) return null;
                    const pointsAttr = cell.polygon.map((p) => `${p[0]},${p[1]}`).join(' ');
                    const biomeMeta = BIOME_METADATA[cell.biome] || BIOME_METADATA.grassland;

                    let fill = biomeMeta.color;
                    let stroke = biomeMeta.stroke;

                    if (layers.elevation) {
                      const isWater = cell.elevation < activeMap.proceduralData!.seaLevel;
                      if (isWater) {
                        fill = cell.elevation < 18 ? '#0a1e38' : '#153a64';
                      } else {
                        const lum = Math.min(85, 22 + cell.elevation * 0.62);
                        fill = `hsl(42, 35%, ${lum}%)`;
                      }
                    } else if (!layers.biomes) {
                      fill =
                        cell.elevation < activeMap.proceduralData!.seaLevel
                          ? '#0c2340'
                          : '#1e293b';
                    }

                    // Political State Tinting
                    const stateObj =
                      layers.politicalStates && cell.stateId
                        ? activeMap.proceduralData!.states.find((s) => s.id === cell.stateId)
                        : undefined;

                    return (
                      <g
                        key={cell.id}
                        onClick={(e) => {
                          if (activeTool !== 'select') return;
                          e.stopPropagation();
                          setSelectedCell(cell);
                          setSelectedBurg(null);
                          setSelectedMarker(null);
                        }}
                      >
                        <polygon
                          points={pointsAttr}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={0.6}
                        />
                        {stateObj && (
                          <polygon
                            points={pointsAttr}
                            fill={stateObj.color}
                            fillOpacity={0.22}
                            stroke={stateObj.color}
                            strokeOpacity={0.35}
                            strokeWidth={0.8}
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* Rivers Layer */}
                  {layers.rivers &&
                    activeMap.proceduralData.rivers.map((river) => {
                      const d = river.points
                        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt[0]} ${pt[1]}`)
                        .join(' ');
                      return (
                        <path
                          key={river.id}
                          d={d}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth={river.width}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.85}
                        />
                      );
                    })}

                  {/* Procedural Burgs (Capitals & Cities) */}
                  {layers.burgs &&
                    activeMap.proceduralData.burgs.map((burg) => {
                      const st = activeMap.proceduralData!.states.find(
                        (s) => s.id === burg.stateId
                      );
                      return (
                        <g
                          key={burg.id}
                          transform={`translate(${burg.x}, ${burg.y})`}
                          className="cursor-pointer"
                          onClick={(e) => {
                            if (activeTool !== 'select') return;
                            e.stopPropagation();
                            setSelectedBurg(burg);
                            setSelectedCell(
                              activeMap.proceduralData!.cells[burg.cellId] || null
                            );
                            setSelectedMarker(null);
                          }}
                        >
                          <circle
                            r={burg.isCapital ? 6.5 : 4}
                            fill={burg.isCapital ? '#fbbf24' : '#f8fafc'}
                            stroke="#0f172a"
                            strokeWidth={2}
                          />
                          {burg.isCapital && (
                            <circle
                              r={10}
                              fill="none"
                              stroke={st?.color || '#fbbf24'}
                              strokeWidth={1.5}
                            />
                          )}
                          <text
                            y={-9}
                            textAnchor="middle"
                            fill="#f8fafc"
                            stroke="#020617"
                            strokeWidth={2.5}
                            paintOrder="stroke"
                            fontSize={burg.isCapital ? 11 : 9.5}
                            fontWeight={burg.isCapital ? 700 : 500}
                          >
                            {burg.name}
                          </text>
                        </g>
                      );
                    })}
                </g>
              )}

              {/* MODE 2: RASTER / ARCHITECTURAL BLUEPRINT MAP */}
              {activeMap.mode === 'raster' && (
                <g>
                  <rect x={0} y={0} width={1000} height={1000} fill="#0f172a" />
                  {activeMap.rasterImageUrl ? (
                    <image
                      href={activeMap.rasterImageUrl}
                      x={0}
                      y={0}
                      width={1000}
                      height={1000}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  ) : (
                    /* Built-in Stylized Citadel & Harbor Blueprint */
                    <g>
                      {/* Water Basin */}
                      <path
                        d="M 0 550 Q 320 520 420 680 L 420 1000 L 0 1000 Z"
                        fill="#0c2d48"
                        stroke="#38bdf8"
                        strokeWidth={2}
                      />
                      {/* Concentric Solar Terraces */}
                      {[340, 260, 180, 100].map((r, i) => (
                        <circle
                          key={r}
                          cx={520}
                          cy={430}
                          r={r}
                          fill={i % 2 === 0 ? '#1e293b' : '#172033'}
                          stroke="#f59e0b"
                          strokeOpacity={0.45}
                          strokeWidth={2}
                        />
                      ))}
                      {/* Radial Aqueducts */}
                      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                        const rad = (deg * Math.PI) / 180;
                        return (
                          <line
                            key={deg}
                            x1={520}
                            y1={430}
                            x2={520 + Math.cos(rad) * 350}
                            y2={430 + Math.sin(rad) * 350}
                            stroke="#fbbf24"
                            strokeOpacity={0.25}
                            strokeWidth={2}
                          />
                        );
                      })}
                    </g>
                  )}
                </g>
              )}

              {/* MODE 3: COSMOLOGICAL ORRERY MAP */}
              {activeMap.mode === 'cosmological' && (
                <g>
                  <rect x={0} y={0} width={1000} height={1000} fill="#020617" />
                  {[160, 280, 390].map((r) => (
                    <circle
                      key={r}
                      cx={500}
                      cy={500}
                      r={r}
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth={1.5}
                      strokeDasharray="6 6"
                    />
                  ))}
                  {project.worlds.map((w) => (
                    <g key={w.id} transform={`translate(${w.cosmologyX}, ${w.cosmologyY})`}>
                      <circle r={38} fill={w.color} fillOpacity={0.25} stroke={w.color} strokeWidth={2.5} />
                      <text y={5} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700}>
                        {w.name}
                      </text>
                    </g>
                  ))}
                </g>
              )}

              {/* OPTIONAL CARTOGRAPHIC GRID OVERLAY */}
              {layers.grid && (
                <g opacity={0.18} className="pointer-events-none">
                  {Array.from({ length: 10 }, (_, i) => (i + 1) * 100).map((coord) => (
                    <React.Fragment key={coord}>
                      <line x1={coord} y1={0} x2={coord} y2={1000} stroke="#94a3b8" strokeWidth={1} />
                      <line x1={0} y1={coord} x2={1000} y2={coord} stroke="#94a3b8" strokeWidth={1} />
                    </React.Fragment>
                  ))}
                </g>
              )}

              {/* TEMPORAL & POLITICAL ZONES LAYER (Morphs with Timeline Cursor!) */}
              {layers.zones &&
                activeMap.zones.map((zone) => {
                  const resolved = resolveZoneAtTick(zone, project.currentTick);
                  if (!resolved.active || resolved.points.length < 3) return null;

                  const ptsStr = resolved.points.map((p) => `${p[0]},${p[1]}`).join(' ');
                  const cx =
                    resolved.points.reduce((acc, p) => acc + p[0], 0) /
                    resolved.points.length;
                  const cy =
                    resolved.points.reduce((acc, p) => acc + p[1], 0) /
                    resolved.points.length;

                  return (
                    <g key={zone.id}>
                      <polygon
                        points={ptsStr}
                        fill={zone.color}
                        fillOpacity={zone.opacity}
                        stroke={zone.color}
                        strokeWidth={2.5}
                        strokeDasharray={
                          zone.borderStyle === 'dashed'
                            ? '8 5'
                            : zone.borderStyle === 'dotted'
                              ? '3 3'
                              : undefined
                        }
                      />
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        fill="#f8fafc"
                        stroke="#020617"
                        strokeWidth={3}
                        paintOrder="stroke"
                        fontSize={13}
                        fontWeight={700}
                        className="uppercase tracking-widest pointer-events-none"
                      >
                        {resolved.name}
                      </text>
                    </g>
                  );
                })}

              {/* VECTOR PATHS / ROUTES LAYER */}
              {layers.paths &&
                activeMap.paths.map((pathObj) => {
                  if (
                    pathObj.validFromTick !== undefined &&
                    project.currentTick < pathObj.validFromTick
                  )
                    return null;
                  if (
                    pathObj.validToTick !== undefined &&
                    project.currentTick > pathObj.validToTick
                  )
                    return null;
                  if (pathObj.points.length < 2) return null;

                  const d = pathObj.points
                    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt[0]} ${pt[1]}`)
                    .join(' ');

                  return (
                    <g key={pathObj.id}>
                      <path
                        d={d}
                        fill="none"
                        stroke={pathObj.color}
                        strokeWidth={3}
                        strokeDasharray={pathObj.dashed ? '7 5' : undefined}
                        strokeLinecap="round"
                      />
                    </g>
                  );
                })}

              {/* CUSTOM LABELS LAYER */}
              {layers.labels &&
                activeMap.labels.map((lbl) => (
                  <text
                    key={lbl.id}
                    x={lbl.x}
                    y={lbl.y}
                    textAnchor="middle"
                    fill={lbl.color}
                    stroke="#020617"
                    strokeWidth={3}
                    paintOrder="stroke"
                    fontSize={lbl.fontSize}
                    fontWeight={700}
                    letterSpacing={2}
                    className="font-display pointer-events-none"
                  >
                    {lbl.text}
                  </text>
                ))}

              {/* STATIC & TEMPORAL LOCATION MARKERS */}
              {layers.markers &&
                activeMap.markers.map((mkr) => {
                  if (
                    mkr.validFromTick !== undefined &&
                    project.currentTick < mkr.validFromTick
                  )
                    return null;
                  if (
                    mkr.validToTick !== undefined &&
                    project.currentTick > mkr.validToTick
                  )
                    return null;

                  return (
                    <g
                      key={mkr.id}
                      transform={`translate(${mkr.x}, ${mkr.y})`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMarker(mkr);
                        setSelectedBurg(null);
                        setSelectedCell(null);
                      }}
                    >
                      <circle
                        r={9}
                        fill="#0f172a"
                        stroke={mkr.color}
                        strokeWidth={2.5}
                      />
                      <circle r={4} fill={mkr.color} />
                      <text
                        y={-13}
                        textAnchor="middle"
                        fill="#fde68a"
                        stroke="#020617"
                        strokeWidth={3}
                        paintOrder="stroke"
                        fontSize={11.5}
                        fontWeight={700}
                      >
                        {mkr.name}
                      </text>
                    </g>
                  );
                })}

              {/* LIVE SPATIO-TEMPORAL ENTITY POSITIONS (Animated by Timeline Cursor!) */}
              {layers.entityPositions &&
                liveEntityPositions.map((pos) => (
                  <g
                    key={pos.entity.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectEntity(pos.entity.id, true);
                    }}
                  >
                    {/* Pulsing Aura */}
                    <circle
                      r={16}
                      fill={pos.isMoving ? '#f59e0b' : '#38bdf8'}
                      fillOpacity={0.28}
                      stroke={pos.isMoving ? '#fbbf24' : '#38bdf8'}
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                    />
                    <circle
                      r={10}
                      fill="#020617"
                      stroke={pos.isMoving ? '#f59e0b' : '#38bdf8'}
                      strokeWidth={2.5}
                    />
                    <text
                      y={3.5}
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize={9}
                      fontWeight={700}
                    >
                      {pos.entity.title.slice(0, 2).toUpperCase()}
                    </text>
                    <rect
                      x={-75}
                      y={13}
                      width={150}
                      height={18}
                      rx={4}
                      fill="#020617"
                      fillOpacity={0.85}
                      stroke={pos.isMoving ? '#f59e0b' : '#38bdf8'}
                      strokeWidth={1}
                    />
                    <text
                      y={25}
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize={9.5}
                      fontWeight={600}
                    >
                      {pos.activeTitle} {pos.isMoving ? '⚡' : ''}
                    </text>
                  </g>
                ))}

              {/* DRAFT POINTS OVERLAY (For Path, Zone, or Ruler) */}
              {draftPoints.length > 0 && (
                <g>
                  <polyline
                    points={draftPoints.map((p) => `${p[0]},${p[1]}`).join(' ')}
                    fill={activeTool === 'draw_zone' ? draftColor : 'none'}
                    fillOpacity={activeTool === 'draw_zone' ? 0.2 : 0}
                    stroke={activeTool === 'ruler' ? '#38bdf8' : draftColor}
                    strokeWidth={3}
                    strokeDasharray="6 4"
                  />
                  {draftPoints.map((pt, idx) => (
                    <circle
                      key={idx}
                      cx={pt[0]}
                      cy={pt[1]}
                      r={5}
                      fill="#fbbf24"
                      stroke="#020617"
                      strokeWidth={2}
                    />
                  ))}
                </g>
              )}
            </g>
          </svg>
        </div>
      </div>

      {/* Right Inspector: Selected Burg / Cell / Marker / Active Entities on Map */}
      <SidePanel side="right" panelId="maps-contents" label="On this map" width="w-80" defaultOpen={false} className="p-4 overflow-y-auto space-y-5 text-sm">
        {/* Selected Procedural Burg Inspector */}
        {selectedBurg && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs capitalize px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 whitespace-nowrap">
                {selectedBurg.isCapital ? 'Procedural Capital' : 'Procedural Burg'}
              </span>
              {selectedBurg.port && (
                <span className="text-xs text-sky-400">⚓ Maritime Port</span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-slate-100">
              {selectedBurg.name}
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div>
                <span className="text-slate-500 block text-xs">Population</span>
                {selectedBurg.population.toLocaleString()}
              </div>
              <div>
                <span className="text-slate-500 block text-xs">Culture</span>
                {selectedBurg.culture}
              </div>
            </div>

            {selectedBurg.linkedEntityId ? (
              <button
                type="button"
                onClick={() => selectEntity(selectedBurg.linkedEntityId!, true)}
                className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Open Linked Wiki Entry
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const ent = promoteBurgToEntity(activeMap.id, selectedBurg);
                  setSelectedBurg({ ...selectedBurg, linkedEntityId: ent.id });
                }}
                className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Promote Burg to Wiki Entity
              </button>
            )}
          </div>
        )}

        {/* Selected Voronoi Cell & State Inspector */}
        {selectedCell && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <div className="text-xs capitalize text-slate-400 font-semibold">
              Cell #{selectedCell.id} Geography
            </div>
            <div className="text-sm font-bold text-slate-100">
              {BIOME_METADATA[selectedCell.biome]?.label || selectedCell.biome}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded bg-slate-900">
                <span className="block text-xs text-slate-500">Elevation</span>
                <span className="font-mono text-slate-200">{selectedCell.elevation}m</span>
              </div>
              <div className="p-2 rounded bg-slate-900">
                <span className="block text-xs text-slate-500">Temp</span>
                <span className="font-mono text-slate-200">{selectedCell.temperature}°C</span>
              </div>
              <div className="p-2 rounded bg-slate-900">
                <span className="block text-xs text-slate-500">Moisture</span>
                <span className="font-mono text-slate-200">{selectedCell.moisture}%</span>
              </div>
            </div>

            {selectedCell.stateId && activeMap.proceduralData && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                {(() => {
                  const st = activeMap.proceduralData!.states.find(
                    (s) => s.id === selectedCell.stateId
                  );
                  if (!st) return null;
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold" style={{ color: st.color }}>
                          {st.name}
                        </span>
                        <span className="text-xs text-slate-400">{st.culture}</span>
                      </div>
                      {st.linkedEntityId ? (
                        <button
                          type="button"
                          onClick={() => selectEntity(st.linkedEntityId!, true)}
                          className="w-full py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs cursor-pointer"
                        >
                          Open Realm in Wiki →
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => promoteStateToEntity(activeMap.id, st)}
                          className="w-full py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-medium cursor-pointer"
                        >
                          + Promote "{st.name}" to Faction Wiki
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Selected Custom Marker Inspector */}
        {selectedMarker && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs capitalize text-amber-400 font-semibold">
                Map Marker ({selectedMarker.icon})
              </span>
              <button
                type="button"
                onClick={() => {
                  deleteMapMarker(activeMap.id, selectedMarker.id);
                  setSelectedMarker(null);
                }}
                className="text-slate-500 hover:text-rose-400 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-sm font-bold text-slate-100">{selectedMarker.name}</div>
            {selectedMarker.notes && (
              <p className="text-xs text-slate-400">{selectedMarker.notes}</p>
            )}
            {selectedMarker.linkedEntityId && (
              <button
                type="button"
                onClick={() => selectEntity(selectedMarker.linkedEntityId!, true)}
                className="w-full py-1.5 rounded bg-amber-500 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Open Linked Wiki Entry
              </button>
            )}
          </div>
        )}

        {/* Live Entities on Map at Current Tick */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300">
            On the map right now ({liveEntityPositions.length})
          </div>
          {liveEntityPositions.map((pos) => (
            <div
              key={pos.entity.id}
              onClick={() => selectEntity(pos.entity.id, true)}
              className="p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 cursor-pointer space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-100">{pos.activeTitle}</span>
                <span className="font-mono text-xs text-emerald-400">
                  ({Math.round(pos.x)}, {Math.round(pos.y)})
                </span>
              </div>
              {pos.statusNote && (
                <p className="text-xs text-slate-400 italic">"{pos.statusNote}"</p>
              )}
            </div>
          ))}
        </div>

        {/* Zones, Paths & Labels List with Delete */}
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="text-sm font-semibold text-slate-300">
            Zones ({activeMap.zones.length}) & Paths ({activeMap.paths.length})
          </div>
          {activeMap.zones.map((z) => (
            <div
              key={z.id}
              className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800"
            >
              <span className="truncate font-medium" style={{ color: z.color }}>
                ⬡ {z.name}
              </span>
              <button
                type="button"
                onClick={() => deleteMapZone(activeMap.id, z.id)}
                className="text-slate-500 hover:text-rose-400 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {activeMap.paths.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800"
            >
              <span className="truncate font-medium" style={{ color: p.color }}>
                ↝ {p.name}
              </span>
              <button
                type="button"
                onClick={() => deleteMapPath(activeMap.id, p.id)}
                className="text-slate-500 hover:text-rose-400 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {activeMap.labels.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800"
            >
              <span className="truncate text-slate-300">T: {l.text}</span>
              <button
                type="button"
                onClick={() => deleteMapLabel(activeMap.id, l.id)}
                className="text-slate-500 hover:text-rose-400 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </SidePanel>

      {/* Modal for Placing Marker or Label */}
      {pendingCoord && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!markerName.trim()) return;
              if (activeTool === 'add_marker') {
                addMapMarker(activeMap.id, {
                  name: markerName.trim(),
                  icon: markerIcon,
                  color: markerColor,
                  x: pendingCoord[0],
                  y: pendingCoord[1],
                  linkedEntityId: markerEntityId || undefined,
                });
              } else if (activeTool === 'add_label') {
                addMapLabel(activeMap.id, {
                  text: markerName.trim().toUpperCase(),
                  x: pendingCoord[0],
                  y: pendingCoord[1],
                  fontSize: 16,
                  style: 'region',
                  color: markerColor,
                });
              }
              setMarkerName('');
              setPendingCoord(null);
              setActiveTool('select');
            }}
            className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-base font-semibold text-slate-100">
              {activeTool === 'add_marker' ? 'Place Map Marker' : 'Place Map Label'} at (
              {pendingCoord[0]}, {pendingCoord[1]})
            </h3>
            <div>
              <label className="block text-slate-300 mb-1">Name / Text *</label>
              <input
                type="text"
                required
                autoFocus
                value={markerName}
                onChange={(e) => setMarkerName(e.target.value)}
                placeholder="e.g., Sun-Spire Outpost"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            {activeTool === 'add_marker' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 mb-1">Icon</label>
                    <select
                      value={markerIcon}
                      onChange={(e) =>
                        setMarkerIcon(e.target.value as MapMarker['icon'])
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                    >
                      <option value="castle">Castle / Citadel</option>
                      <option value="city">City / Settlement</option>
                      <option value="port">Maritime Port</option>
                      <option value="temple">Sanctum / Temple</option>
                      <option value="portal">Planar Rift / Portal</option>
                      <option value="battle">Battlefield</option>
                      <option value="ruin">Ancient Ruin</option>
                      <option value="artifact">Relic Vault</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Color</label>
                    <input
                      type="color"
                      value={markerColor}
                      onChange={(e) => setMarkerColor(e.target.value)}
                      className="w-full h-8 bg-slate-950 border border-slate-700 rounded p-0.5"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">
                    Link to Wiki Entity (Optional)
                  </label>
                  <select
                    value={markerEntityId}
                    onChange={(e) => setMarkerEntityId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                  >
                    <option value="">— None —</option>
                    {project.entities.map((en) => (
                      <option key={en.id} value={en.id}>
                        {en.title} ({categoryLabel(en.category)})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingCoord(null)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold cursor-pointer"
              >
                Place on Map
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create New Map Modal */}
      {showNewMapModal && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newMapName.trim()) return;
              createMap({
                name: newMapName.trim(),
                worldId: project.activeWorldId,
                mode: newMapMode,
                summary: `${newMapMode} map in ${project.name}`,
                scaleUnit: newMapScaleUnit,
                totalWidthUnits: newMapWidthUnits,
                rasterImageUrl: newMapRasterUrl || undefined,
              });
              setNewMapName('');
              setNewMapRasterUrl('');
              setShowNewMapModal(false);
            }}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-lg font-semibold text-slate-100">
              Create New Interactive Map
            </h3>
            <div>
              <label className="block text-slate-300 mb-1">Map Title *</label>
              <input
                type="text"
                required
                value={newMapName}
                onChange={(e) => setNewMapName(e.target.value)}
                placeholder="e.g., Northern Marches Regional Map"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Cartography Mode</label>
              <select
                value={newMapMode}
                onChange={(e) => setNewMapMode(e.target.value as MapMode)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-slate-100"
              >
                <option value="procedural">
                  Procedural (generated terrain)
                </option>
                <option value="raster">
                  Raster / Tactical Image Map (Upload Image or Blueprint)
                </option>
                <option value="cosmological">
                  Cosmological / Planar Orrery Map
                </option>
              </select>
            </div>
            {newMapMode === 'raster' && (
              <div className="space-y-2">
                <label className="block text-slate-300">
                  Upload Custom Map Image (PNG/JPG/SVG) or Leave Blank for Blueprint
                </label>
                <label className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-slate-700 bg-slate-950 hover:border-amber-500 text-slate-300 cursor-pointer">
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>
                    {newMapRasterUrl ? 'Custom Image Loaded ✓' : 'Choose Image File...'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleRasterUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1">Total Map Width</label>
                <input
                  type="number"
                  value={newMapWidthUnits}
                  onChange={(e) => setNewMapWidthUnits(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Distance Unit</label>
                <input
                  type="text"
                  value={newMapScaleUnit}
                  onChange={(e) => setNewMapScaleUnit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewMapModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold cursor-pointer"
              >
                Create Map
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

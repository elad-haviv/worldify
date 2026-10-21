import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import {
  MapLayer,
  MapLayerVisibility,
  MapMarker,
  MapMode,
  MapPath,
  MapZone,
  MapLabel,
  ProceduralBurg,
  ProceduralTemplateType,
  VoronoiCellData,
} from '../../types/worldify';
import { BIOME_METADATA, renderProceduralMapToDataUrl } from '../../utils/proceduralMapGenerator';
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
  Globe,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Sliders,
  Edit2,
  ChevronDown,
  ChevronRight,
  MoveUp,
  MoveDown,
  Crosshair,
  CheckCircle2,
  FolderPlus,
  MoreVertical,
  X,
  Palette,
  Check,
} from 'lucide-react';
import { SidePanel } from '../../components/SidePanel';
import { CATEGORY_META, categoryLabel, categoryColor } from '../../utils/categories';
import { MapReprojectorView } from '../../components/reprojector/MapReprojectorView';
import {
  MARKER_SETS,
  getMarkerSet,
  getMarkerIcon,
  getMarkerIconDef,
  getMarkerGlyph,
  MarkerIconDef,
} from '../../utils/markerIcons';

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
    updateMap,
    regenerateProceduralMap,
    promoteBurgToEntity,
    promoteStateToEntity,
    addMapMarker,
    updateMapMarker,
    deleteMapMarker,
    addMapPath,
    updateMapPath,
    deleteMapPath,
    addMapZone,
    updateMapZone,
    deleteMapZone,
    addMapLabel,
    updateMapLabel,
    deleteMapLabel,
    addMapLayer,
    updateMapLayer,
    deleteMapLayer,
    reorderMapLayers,
    moveMapObjectToLayer,
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
  const mapContentRef = useRef<SVGGElement>(null);

  // Selection states
  const [selectedCell, setSelectedCell] = useState<VoronoiCellData | null>(null);
  const [selectedBurg, setSelectedBurg] = useState<ProceduralBurg | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const [selectedPath, setSelectedPath] = useState<MapPath | null>(null);
  const [selectedZone, setSelectedZone] = useState<MapZone | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<MapLabel | null>(null);

  // Drawing states (Path, Zone, Ruler)
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState('#f59e0b');
  const [draftPathStyle, setDraftPathStyle] = useState<MapPath['style']>('trade_route');
  const [draftLinkedEntityId, setDraftLinkedEntityId] = useState('');
  const [draftValidFromTick, setDraftValidFromTick] = useState<string>('');
  const [draftLayerId, setDraftLayerId] = useState<string>('layer-routes');

  // Marker placement modal state
  const [pendingCoord, setPendingCoord] = useState<[number, number] | null>(null);
  const [markerName, setMarkerName] = useState('');
  const [markerIcon, setMarkerIcon] = useState<string>('castle');
  const [markerColor, setMarkerColor] = useState('#f59e0b');
  const [markerEntityId, setMarkerEntityId] = useState('');
  const [markerModalSetId, setMarkerModalSetId] = useState<string>('fantasy');
  const [markerLayerId, setMarkerLayerId] = useState<string>('layer-poi');

  // Label placement state
  const [labelLayerId, setLabelLayerId] = useState<string>('layer-annotations');

  // Custom Map Layers UI state
  const [showLayersDrawer, setShowLayersDrawer] = useState(false);
  const [activePlacementLayerId, setActivePlacementLayerId] = useState<string>('layer-default');
  const [expandedLayerIds, setExpandedLayerIds] = useState<Set<string>>(
    () => new Set(['layer-poi', 'layer-routes', 'layer-borders', 'layer-annotations', 'layer-default'])
  );
  const [showNewLayerModal, setShowNewLayerModal] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerColor, setNewLayerColor] = useState('#3b82f6');
  const [newLayerOpacity, setNewLayerOpacity] = useState(1);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState('');
  const [editingLayerColor, setEditingLayerColor] = useState('#3b82f6');
  const [editingLayerOpacity, setEditingLayerOpacity] = useState(1);

  // Procedural Generator Settings
  const [procSeed, setProcSeed] = useState<number>(7742);
  const [procTemplate, setProcTemplate] = useState<ProceduralTemplateType>('continents');
  const [procStateCount, setProcStateCount] = useState<number>(6);
  const [procSeaLevel, setProcSeaLevel] = useState<number>(30);

  // Create Map Modal
  const [showNewMapModal, setShowNewMapModal] = useState(false);
  const [showReprojector, setShowReprojector] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [newMapMode, setNewMapMode] = useState<MapMode>('procedural');
  const [newMapScaleUnit, setNewMapScaleUnit] = useState('miles');
  const [newMapWidthUnits, setNewMapWidthUnits] = useState(2400);
  const [newMapRasterUrl, setNewMapRasterUrl] = useState('');
  const [newMapMarkerIconSet, setNewMapMarkerIconSet] = useState<string>('fantasy');

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

  // Procedural texture for Globe & Projections view
  const proceduralMapTexture = useMemo(() => {
    if (activeMap?.mode === 'procedural' && activeMap.proceduralData) {
      return renderProceduralMapToDataUrl(activeMap.proceduralData, 1000, 1000);
    }
    return undefined;
  }, [activeMap]);

  // Dynamic aspect ratio calculation for raster maps
  const [rasterNaturalSize, setRasterNaturalSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (activeMap?.mode === 'raster' && activeMap.rasterImageUrl) {
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
    if (!activeMap || activeMap.mode === 'procedural') return 1000;
    if (rasterNaturalSize && rasterNaturalSize.width > 0 && rasterNaturalSize.height > 0) {
      return Math.max(200, Math.min(2000, Math.round((1000 * rasterNaturalSize.height) / rasterNaturalSize.width)));
    }
    return 1000;
  }, [activeMap, rasterNaturalSize]);

  const toCanvasY = (normY: number) => (normY / 1000) * canvasHeight;
  const fromCanvasY = (canvY: number) =>
    Math.max(0, Math.min(1000, Math.round((canvY / canvasHeight) * 1000)));

  if (!activeMap) return null;

  const svgPointFromEvent = (e: React.MouseEvent<SVGSVGElement>): [number, number] => {
    const group = mapContentRef.current;
    if (group) {
      const gCtm = group.getScreenCTM();
      if (gCtm) {
        const svg = group.ownerSVGElement || (e.currentTarget as unknown as SVGSVGElement);
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const localPt = pt.matrixTransform(gCtm.inverse());
        return [
          Math.max(0, Math.min(1000, Math.round(localPt.x))),
          fromCanvasY(localPt.y),
        ];
      }
    }
    const svg = (e.currentTarget.tagName?.toLowerCase() === 'svg'
      ? e.currentTarget
      : e.currentTarget.ownerSVGElement) as SVGSVGElement;
    const ctm = svg?.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const v = pt.matrixTransform(ctm.inverse());
      const x = Math.round((v.x - 500 - pan.x) / zoom + 500);
      const localY = (v.y - canvasHeight / 2 - pan.y) / zoom + canvasHeight / 2;
      return [Math.max(0, Math.min(1000, x)), fromCanvasY(localY)];
    }
    return [500, 500];
  };

  const defaultLayers = useMemo<MapLayer[]>(
    () => [
      { id: 'layer-default', name: 'Base Layer', color: '#f59e0b', visible: true, locked: false, opacity: 1, order: 0, isDefault: true },
      { id: 'layer-poi', name: 'Points of Interest', color: '#10b981', visible: true, locked: false, opacity: 1, order: 1 },
      { id: 'layer-routes', name: 'Trade Routes & Paths', color: '#38bdf8', visible: true, locked: false, opacity: 1, order: 2 },
      { id: 'layer-borders', name: 'Territories & Realms', color: '#a855f7', visible: true, locked: false, opacity: 0.85, order: 3 },
      { id: 'layer-annotations', name: 'Labels & Annotations', color: '#f43f5e', visible: true, locked: false, opacity: 1, order: 4 },
    ],
    []
  );

  const customLayers = useMemo<MapLayer[]>(() => {
    if (activeMap?.customLayers && activeMap.customLayers.length > 0) {
      return [...activeMap.customLayers].sort((a, b) => a.order - b.order);
    }
    return defaultLayers;
  }, [activeMap?.customLayers, defaultLayers]);

  const ensureCustomLayers = (): MapLayer[] => {
    if (activeMap.customLayers && activeMap.customLayers.length > 0) {
      return activeMap.customLayers;
    }
    updateMap(activeMap.id, { customLayers: defaultLayers });
    return defaultLayers;
  };

  const getObjectLayer = (layerId?: string, fallbackId = 'layer-default'): MapLayer => {
    if (layerId) {
      const found = customLayers.find((l) => l.id === layerId);
      if (found) return found;
    }
    const fallback = customLayers.find((l) => l.id === fallbackId) || customLayers[0] || defaultLayers[0];
    return fallback;
  };

  const getLayerObjects = (layerId: string) => {
    const isDefault = layerId === 'layer-default';
    const isPoi = layerId === 'layer-poi';
    const isRoutes = layerId === 'layer-routes';
    const isBorders = layerId === 'layer-borders';
    const isAnnotations = layerId === 'layer-annotations';

    const markers = (activeMap.markers || []).filter((m) =>
      m.layerId ? m.layerId === layerId : (isPoi || isDefault)
    );
    const paths = (activeMap.paths || []).filter((p) =>
      p.layerId ? p.layerId === layerId : (isRoutes || isDefault)
    );
    const zones = (activeMap.zones || []).filter((z) =>
      z.layerId ? z.layerId === layerId : (isBorders || isDefault)
    );
    const labels = (activeMap.labels || []).filter((l) =>
      l.layerId ? l.layerId === layerId : (isAnnotations || isDefault)
    );

    return {
      markers,
      paths,
      zones,
      labels,
      totalCount: markers.length + paths.length + zones.length + labels.length,
    };
  };

  // Toggle Layer Visibility
  const handleToggleLayerVisibility = (layerId: string) => {
    ensureCustomLayers();
    const lay = customLayers.find((l) => l.id === layerId);
    if (!lay) return;
    updateMapLayer(activeMap.id, layerId, { visible: !lay.visible });
  };

  // Toggle Layer Lock
  const handleToggleLayerLock = (layerId: string) => {
    ensureCustomLayers();
    const lay = customLayers.find((l) => l.id === layerId);
    if (!lay) return;
    updateMapLayer(activeMap.id, layerId, { locked: !lay.locked });
  };

  // Create New Layer
  const handleCreateNewLayer = () => {
    if (!newLayerName.trim()) return;
    ensureCustomLayers();
    const created = addMapLayer(activeMap.id, {
      name: newLayerName.trim(),
      color: newLayerColor,
      opacity: newLayerOpacity,
      visible: true,
      locked: false,
      order: customLayers.length,
    });
    setActivePlacementLayerId(created.id);
    setNewLayerName('');
    setShowNewLayerModal(false);
  };

  // Delete Layer
  const handleDeleteLayer = (layerId: string) => {
    ensureCustomLayers();
    if (customLayers.length <= 1) return;
    const fallbackId = customLayers.find((l) => l.id !== layerId)?.id || 'layer-default';
    deleteMapLayer(activeMap.id, layerId, fallbackId);
    if (activePlacementLayerId === layerId) {
      setActivePlacementLayerId(fallbackId);
    }
  };

  // Reorder Layer Up/Down
  const handleReorderLayer = (layerId: string, direction: 'up' | 'down') => {
    ensureCustomLayers();
    const idx = customLayers.findIndex((l) => l.id === layerId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= customLayers.length) return;

    const newOrder = [...customLayers];
    const temp = newOrder[idx];
    newOrder[idx] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;

    reorderMapLayers(
      activeMap.id,
      newOrder.map((l) => l.id)
    );
  };

  // Show All / Hide All
  const handleSetAllLayersVisibility = (visible: boolean) => {
    ensureCustomLayers();
    customLayers.forEach((l) => {
      updateMapLayer(activeMap.id, l.id, { visible });
    });
  };

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'select') {
      setSelectedMarker(null);
      setSelectedPath(null);
      setSelectedZone(null);
      setSelectedLabel(null);
      setSelectedCell(null);
      setSelectedBurg(null);
      return;
    }
    const pt = svgPointFromEvent(e);

    if (activeTool === 'add_marker' || activeTool === 'add_label') {
      if (activeTool === 'add_marker') {
        const currentSetId = activeMap.markerIconSet || 'fantasy';
        setMarkerModalSetId(currentSetId);
        const iconDef = getMarkerSet(currentSetId).icons[0];
        setMarkerIcon(iconDef.key);
        setMarkerColor(iconDef.defaultColor);
        setMarkerLayerId(activePlacementLayerId || 'layer-poi');
      } else {
        setLabelLayerId(activePlacementLayerId || 'layer-annotations');
      }
      setPendingCoord(pt);
    } else if (
      activeTool === 'draw_path' ||
      activeTool === 'draw_zone' ||
      activeTool === 'ruler'
    ) {
      if (activeTool === 'draw_path') {
        setDraftLayerId(activePlacementLayerId || 'layer-routes');
      } else if (activeTool === 'draw_zone') {
        setDraftLayerId(activePlacementLayerId || 'layer-borders');
      }
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
      layerId: draftLayerId || activePlacementLayerId || 'layer-routes',
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
      layerId: draftLayerId || activePlacementLayerId || 'layer-borders',
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
      const p1 = draftPoints[i];
      const p2 = draftPoints[i + 1];
      const dx = p2[0] - p1[0];
      const dy = toCanvasY(p2[1]) - toCanvasY(p1[1]);
      totalNorm += Math.hypot(dx, dy);
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
  }, [draftPoints, activeMap.totalWidthUnits, activeMap.scaleUnit, canvasHeight]);

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

        {/* Map Marker Icon Set */}
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              Marker Icon Set
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
              {getMarkerSet(activeMap.markerIconSet).name.split(' ')[0]}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Active themed icon collection for markers on this map:
          </p>
          <select
            value={activeMap.markerIconSet || 'fantasy'}
            onChange={(e) => updateMap(activeMap.id, { markerIconSet: e.target.value })}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-medium focus:border-amber-500 focus:outline-none cursor-pointer"
          >
            {MARKER_SETS.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
            {getMarkerSet(activeMap.markerIconSet).icons.map((ic) => {
              const IcComp = ic.icon;
              return (
                <div
                  key={ic.key}
                  title={ic.label}
                  className="w-6 h-6 rounded bg-slate-900 border border-slate-800 flex items-center justify-center flex-shrink-0 text-slate-300 hover:text-amber-400 hover:border-amber-500/50"
                >
                  <IcComp className="w-3.5 h-3.5" />
                </div>
              );
            })}
          </div>
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
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Map Layers
            </div>
            <button
              type="button"
              onClick={() => setShowLayersDrawer(true)}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
            >
              Manage ({customLayers.length})
            </button>
          </div>

          {/* Quick Custom Layers List with Eye Toggles */}
          <div className="space-y-1 bg-slate-950 p-2 rounded-lg border border-slate-800">
            {customLayers.map((lay) => {
              const objs = getLayerObjects(lay.id);
              return (
                <div
                  key={lay.id}
                  className="flex items-center justify-between gap-1.5 text-xs py-1 px-1.5 rounded hover:bg-slate-900 transition-colors"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: lay.color || '#3b82f6' }}
                    />
                    <span
                      className={`truncate text-[11px] ${
                        lay.visible ? 'text-slate-200 font-medium' : 'text-slate-500 line-through'
                      }`}
                    >
                      {lay.name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({objs.totalCount})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleLayerVisibility(lay.id)}
                      className={`p-1 rounded cursor-pointer transition-colors ${
                        lay.visible
                          ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                          : 'text-slate-600 hover:text-slate-400'
                      }`}
                      title={lay.visible ? 'Hide Layer' : 'Show Layer'}
                    >
                      {lay.visible ? (
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setShowNewLayerModal(true)}
              className="w-full mt-1 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-dashed border-slate-700 text-amber-300 text-[11px] flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              New Layer
            </button>
          </div>

          <div className="text-[11px] font-semibold text-slate-400 pt-2">
            Base Overlays & Shading
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

          {/* Toolbar Actions: Layers & Projections & Zoom */}
          <div className="flex items-center gap-2">
            {/* Layers Toggle Button */}
            <button
              type="button"
              onClick={() => setShowLayersDrawer(!showLayersDrawer)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                showLayersDrawer
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
              title="Organise Objects in Layers (Show/Hide, Lock, Edit)"
            >
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Layers</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-amber-300 font-mono">
                {customLayers.filter((l) => l.visible).length}/{customLayers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowReprojector(!showReprojector)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                showReprojector
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                  : 'bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
              title="3D Globe & Map Projections (Orthographic, Robinson, Mercator...)"
            >
              <Globe className="w-4 h-4 text-blue-400" />
              <span>Globe & Projections</span>
            </button>

            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(4, z * 1.25))}
                className="p-1 text-slate-300 hover:text-amber-400 cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-slate-400 px-1.5">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}
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
                value={draftLayerId || (activeTool === 'draw_path' ? 'layer-routes' : 'layer-borders')}
                onChange={(e) => setDraftLayerId(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
                title="Target Layer"
              >
                {customLayers.map((lay) => (
                  <option key={lay.id} value={lay.id}>
                    Layer: {lay.name}
                  </option>
                ))}
              </select>
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

        {/* Main SVG Map Canvas or 3D Globe Reprojector */}
        <div className="flex-1 min-h-0 relative overflow-hidden bg-[#081b33]">
          {showReprojector ? (
            <MapReprojectorView
              initialImageUrl={activeMap.rasterImageUrl || proceduralMapTexture}
              mapTitle={activeMap.name}
              markers={activeMap.markers}
              paths={activeMap.paths}
              zones={activeMap.zones}
              labels={activeMap.labels}
              entities={liveEntityPositions.map((p) => ({
                id: p.entity.id,
                title: p.activeTitle || p.entity.title,
                x: p.x,
                y: p.y,
                category: p.entity.category,
                statusNote: p.statusNote,
              }))}
              allowUpload={false}
              onClose={() => setShowReprojector(false)}
            />
          ) : (
            <svg
              viewBox={`0 0 1000 ${canvasHeight}`}
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
                // Convert screen pixels to map units so the map follows the cursor exactly.
                const ctm = e.currentTarget.getScreenCTM();
                const unit = ctm ? 1 / ctm.a : 1;
                const dx = (e.clientX - panStartRef.current.x) * unit;
                const dy = (e.clientY - panStartRef.current.y) * unit;
                panStartRef.current = { x: e.clientX, y: e.clientY };
                setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
              }}
              onWheel={(e) => {
                // Zoom around the cursor.
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
              onMouseUp={() => setIsPanning(false)}
              onMouseLeave={() => setIsPanning(false)}
            >
              <g
                ref={mapContentRef}
                transform={`translate(${500 + pan.x}, ${canvasHeight / 2 + pan.y}) scale(${zoom}) translate(-500, -${canvasHeight / 2})`}
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
                  <rect x={0} y={0} width={1000} height={canvasHeight} fill="#0f172a" />
                  {activeMap.rasterImageUrl ? (
                    <image
                      href={activeMap.rasterImageUrl}
                      x={0}
                      y={0}
                      width={1000}
                      height={canvasHeight}
                      preserveAspectRatio="none"
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
                    <line key={`v-${coord}`} x1={coord} y1={0} x2={coord} y2={canvasHeight} stroke="#94a3b8" strokeWidth={1} />
                  ))}
                  {Array.from({ length: Math.floor(canvasHeight / 100) }, (_, i) => (i + 1) * 100).map((coord) => (
                    <line key={`h-${coord}`} x1={0} y1={coord} x2={1000} y2={coord} stroke="#94a3b8" strokeWidth={1} />
                  ))}
                </g>
              )}

              {/* TEMPORAL & POLITICAL ZONES LAYER (Morphs with Timeline Cursor!) */}
              {layers.zones &&
                activeMap.zones.map((zone) => {
                  const zoneLayer = getObjectLayer(zone.layerId, 'layer-borders');
                  if (!zoneLayer.visible) return null;

                  const resolved = resolveZoneAtTick(zone, project.currentTick);
                  if (!resolved.active || resolved.points.length < 3) return null;

                  const ptsStr = resolved.points.map((p) => `${p[0]},${toCanvasY(p[1])}`).join(' ');
                  const cx =
                    resolved.points.reduce((acc, p) => acc + p[0], 0) /
                    resolved.points.length;
                  const cy =
                    resolved.points.reduce((acc, p) => acc + toCanvasY(p[1]), 0) /
                    resolved.points.length;
                  const isSelected = selectedZone?.id === zone.id;
                  const finalOpacity = (zone.opacity ?? 0.25) * (zoneLayer.opacity ?? 1);

                  return (
                    <g
                      key={zone.id}
                      className={activeTool === 'select' ? 'cursor-pointer group' : undefined}
                      onClick={(e) => {
                        if (activeTool !== 'select') return;
                        e.stopPropagation();
                        setSelectedZone(zone);
                        setSelectedPath(null);
                        setSelectedMarker(null);
                        setSelectedLabel(null);
                        setSelectedBurg(null);
                        setSelectedCell(null);
                      }}
                    >
                      <polygon
                        points={ptsStr}
                        fill={zone.color}
                        fillOpacity={finalOpacity}
                        stroke={isSelected ? '#38bdf8' : zone.color}
                        strokeWidth={isSelected ? 3.5 : 2.5}
                        strokeDasharray={
                          isSelected
                            ? '6 3'
                            : zone.borderStyle === 'dashed'
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
                        className="uppercase tracking-widest pointer-events-none select-none"
                      >
                        {resolved.name}
                      </text>
                    </g>
                  );
                })}

              {/* VECTOR PATHS / ROUTES LAYER */}
              {layers.paths &&
                activeMap.paths.map((pathObj) => {
                  const pathLayer = getObjectLayer(pathObj.layerId, 'layer-routes');
                  if (!pathLayer.visible) return null;

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
                    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt[0]} ${toCanvasY(pt[1])}`)
                    .join(' ');
                  const isSelected = selectedPath?.id === pathObj.id;
                  const opacity = pathLayer.opacity ?? 1;

                  return (
                    <g
                      key={pathObj.id}
                      opacity={opacity}
                      onClick={(e) => {
                        if (activeTool !== 'select') return;
                        e.stopPropagation();
                        setSelectedPath(pathObj);
                        setSelectedZone(null);
                        setSelectedMarker(null);
                        setSelectedLabel(null);
                        setSelectedBurg(null);
                        setSelectedCell(null);
                      }}
                    >
                      {/* Invisible wider hit-target line for easy clicking */}
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={16}
                        className={activeTool === 'select' ? 'cursor-pointer' : undefined}
                      />
                      {/* Selection glow if selected */}
                      {isSelected && (
                        <path
                          d={d}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth={6}
                          strokeOpacity={0.7}
                          strokeLinecap="round"
                          className="pointer-events-none"
                        />
                      )}
                      <path
                        d={d}
                        fill="none"
                        stroke={pathObj.color}
                        strokeWidth={isSelected ? 3.5 : 3}
                        strokeDasharray={pathObj.dashed ? '7 5' : undefined}
                        strokeLinecap="round"
                        className={activeTool === 'select' ? 'cursor-pointer' : 'pointer-events-none'}
                      />
                    </g>
                  );
                })}

              {/* CUSTOM LABELS LAYER */}
              {layers.labels &&
                activeMap.labels.map((lbl) => {
                  const labelLayer = getObjectLayer(lbl.layerId, 'layer-annotations');
                  if (!labelLayer.visible) return null;
                  const isSelected = selectedLabel?.id === lbl.id;
                  const opacity = labelLayer.opacity ?? 1;

                  return (
                    <g
                      key={lbl.id}
                      opacity={opacity}
                      onClick={(e) => {
                        if (activeTool !== 'select') return;
                        e.stopPropagation();
                        setSelectedLabel(lbl);
                        setSelectedPath(null);
                        setSelectedZone(null);
                        setSelectedMarker(null);
                        setSelectedBurg(null);
                        setSelectedCell(null);
                      }}
                      className={activeTool === 'select' ? 'cursor-pointer group' : undefined}
                    >
                      {isSelected && (
                        <rect
                          x={lbl.x - (lbl.text.length * (lbl.fontSize * 0.45))}
                          y={toCanvasY(lbl.y) - lbl.fontSize}
                          width={lbl.text.length * (lbl.fontSize * 0.9)}
                          height={lbl.fontSize * 1.4}
                          fill="rgba(56, 189, 248, 0.15)"
                          stroke="#38bdf8"
                          strokeWidth={1.5}
                          strokeDasharray="4 2"
                          rx={3}
                        />
                      )}
                      <text
                        x={lbl.x}
                        y={toCanvasY(lbl.y)}
                        textAnchor="middle"
                        fill={lbl.color}
                        stroke="#020617"
                        strokeWidth={3}
                        paintOrder="stroke"
                        fontSize={lbl.fontSize}
                        fontWeight={700}
                        letterSpacing={2}
                        className="font-display select-none"
                      >
                        {lbl.text}
                      </text>
                    </g>
                  );
                })}

              {/* STATIC & TEMPORAL LOCATION MARKERS */}
              {layers.markers &&
                activeMap.markers.map((mkr) => {
                  const markerLayer = getObjectLayer(mkr.layerId, 'layer-poi');
                  if (!markerLayer.visible) return null;

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

                  const IconComp = getMarkerIcon(mkr.icon);
                  const isSelected = selectedMarker?.id === mkr.id;
                  const opacity = markerLayer.opacity ?? 1;

                  return (
                    <g
                      key={mkr.id}
                      opacity={opacity}
                      transform={`translate(${mkr.x}, ${toCanvasY(mkr.y)})`}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        if (activeTool !== 'select') return;
                        e.stopPropagation();
                        setSelectedMarker(mkr);
                        setSelectedPath(null);
                        setSelectedZone(null);
                        setSelectedLabel(null);
                        setSelectedBurg(null);
                        setSelectedCell(null);
                      }}
                    >
                      {/* Selection halo */}
                      {isSelected && (
                        <circle
                          r={17}
                          fill="none"
                          stroke="#fbbf24"
                          strokeWidth={2}
                          strokeDasharray="4 2"
                        />
                      )}
                      {/* Pin ambient aura */}
                      <circle
                        r={13}
                        fill={mkr.color || '#f59e0b'}
                        fillOpacity={0.25}
                        className="group-hover:fill-opacity-50 transition-all"
                      />
                      {/* Pin badge base */}
                      <circle
                        r={10.5}
                        fill="#090d16"
                        stroke={mkr.color || '#f59e0b'}
                        strokeWidth={2}
                      />
                      {/* Vector Icon */}
                      <g
                        transform="translate(-6, -6)"
                        style={{ color: mkr.color || '#f59e0b', pointerEvents: 'none' }}
                      >
                        <IconComp size={12} strokeWidth={2.3} />
                      </g>
                      {/* Marker Name Label */}
                      <text
                        y={-14}
                        textAnchor="middle"
                        fill="#fde68a"
                        stroke="#020617"
                        strokeWidth={3}
                        paintOrder="stroke"
                        fontSize={11.5}
                        fontWeight={700}
                        className="select-none pointer-events-none"
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
                    transform={`translate(${pos.x}, ${toCanvasY(pos.y)})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      if (activeTool !== 'select') return;
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
                    points={draftPoints.map((p) => `${p[0]},${toCanvasY(p[1])}`).join(' ')}
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
                      cy={toCanvasY(pt[1])}
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
        )}
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
          <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-400 font-semibold flex items-center gap-1.5">
                {(() => {
                  const SelIcon = getMarkerIcon(selectedMarker.icon);
                  return <SelIcon className="w-4 h-4 text-amber-400" />;
                })()}
                <span>Marker ({getMarkerIconDef(selectedMarker.icon).label})</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  deleteMapMarker(activeMap.id, selectedMarker.id);
                  setSelectedMarker(null);
                }}
                className="text-slate-500 hover:text-rose-400 cursor-pointer"
                title="Delete Marker"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 block">Name</label>
              <input
                type="text"
                value={selectedMarker.name}
                onChange={(e) => {
                  const updatedName = e.target.value;
                  setSelectedMarker({ ...selectedMarker, name: updatedName });
                  updateMapMarker(activeMap.id, selectedMarker.id, { name: updatedName });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={selectedMarker.color}
                    onChange={(e) => {
                      const updatedColor = e.target.value;
                      setSelectedMarker({ ...selectedMarker, color: updatedColor });
                      updateMapMarker(activeMap.id, selectedMarker.id, { color: updatedColor });
                    }}
                    className="w-7 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer p-0.5"
                  />
                  <span className="font-mono text-slate-300 text-[11px]">{selectedMarker.color}</span>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Position</label>
                <div className="font-mono text-xs text-emerald-400 pt-1">
                  ({Math.round(selectedMarker.x)}, {Math.round(selectedMarker.y)})
                </div>
              </div>
            </div>

            {/* Quick Icon Selector for Selected Marker */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 block">
                Change Icon (Set: {getMarkerSet(activeMap.markerIconSet).name.split(' ')[0]})
              </label>
              <div className="grid grid-cols-6 gap-1 max-h-24 overflow-y-auto p-1 bg-slate-900 rounded border border-slate-800">
                {getMarkerSet(activeMap.markerIconSet).icons.map((ic) => {
                  const IcComponent = ic.icon;
                  const isCurrent = selectedMarker.icon === ic.key;
                  return (
                    <button
                      key={ic.key}
                      type="button"
                      title={ic.label}
                      onClick={() => {
                        setSelectedMarker({ ...selectedMarker, icon: ic.key });
                        updateMapMarker(activeMap.id, selectedMarker.id, { icon: ic.key });
                      }}
                      className={`h-7 rounded flex items-center justify-center cursor-pointer transition-all ${
                        isCurrent
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-xs'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800 border border-transparent'
                      }`}
                    >
                      <IcComponent className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assigned Layer for Marker */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 block">Assigned Layer</label>
              <select
                value={selectedMarker.layerId || 'layer-poi'}
                onChange={(e) => {
                  const newLayId = e.target.value;
                  moveMapObjectToLayer(activeMap.id, 'marker', selectedMarker.id, newLayId);
                  setSelectedMarker({ ...selectedMarker, layerId: newLayId });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
              >
                {customLayers.map((lay) => (
                  <option key={lay.id} value={lay.id}>
                    {lay.name} {lay.id === (selectedMarker.layerId || 'layer-poi') ? '✓' : ''}
                  </option>
                ))}
              </select>
            </div>

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

        {/* Selected Path Inspector */}
        {selectedPath && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-sky-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-sky-400 font-semibold flex items-center gap-1.5">
                <Route className="w-4 h-4 text-sky-400" />
                <span>Route / Path</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  deleteMapPath(activeMap.id, selectedPath.id);
                  setSelectedPath(null);
                }}
                className="text-slate-500 hover:text-rose-400 cursor-pointer"
                title="Delete Path"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 block">Path Name</label>
              <input
                type="text"
                value={selectedPath.name}
                onChange={(e) => {
                  const updatedName = e.target.value;
                  setSelectedPath({ ...selectedPath, name: updatedName });
                  updateMapPath(activeMap.id, selectedPath.id, { name: updatedName });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={selectedPath.color}
                    onChange={(e) => {
                      const updatedColor = e.target.value;
                      setSelectedPath({ ...selectedPath, color: updatedColor });
                      updateMapPath(activeMap.id, selectedPath.id, { color: updatedColor });
                    }}
                    className="w-7 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer p-0.5"
                  />
                  <span className="font-mono text-slate-300 text-[11px]">{selectedPath.color}</span>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Style</label>
                <select
                  value={selectedPath.style}
                  onChange={(e) => {
                    const st = e.target.value as MapPath['style'];
                    setSelectedPath({ ...selectedPath, style: st });
                    updateMapPath(activeMap.id, selectedPath.id, { style: st });
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                >
                  <option value="trade_route">Trade Route</option>
                  <option value="imperial_road">Imperial Road</option>
                  <option value="army_march">Army March</option>
                  <option value="character_journey">Character Journey</option>
                  <option value="sea_lane">Sea Lane</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-300">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPath.dashed}
                  onChange={(e) => {
                    const d = e.target.checked;
                    setSelectedPath({ ...selectedPath, dashed: d });
                    updateMapPath(activeMap.id, selectedPath.id, { dashed: d });
                  }}
                  className="accent-amber-500"
                />
                <span>Dashed Line</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPath.animated}
                  onChange={(e) => {
                    const a = e.target.checked;
                    setSelectedPath({ ...selectedPath, animated: a });
                    updateMapPath(activeMap.id, selectedPath.id, { animated: a });
                  }}
                  className="accent-amber-500"
                />
                <span>Animated</span>
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 block">Assigned Layer</label>
              <select
                value={selectedPath.layerId || 'layer-routes'}
                onChange={(e) => {
                  const newLayId = e.target.value;
                  moveMapObjectToLayer(activeMap.id, 'path', selectedPath.id, newLayId);
                  setSelectedPath({ ...selectedPath, layerId: newLayId });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
              >
                {customLayers.map((lay) => (
                  <option key={lay.id} value={lay.id}>
                    {lay.name} {lay.id === (selectedPath.layerId || 'layer-routes') ? '✓' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-[11px] text-slate-400">
              Waypoints: <span className="text-slate-200 font-mono">{selectedPath.points.length} nodes</span>
            </div>

            {selectedPath.linkedEntityId && (
              <button
                type="button"
                onClick={() => selectEntity(selectedPath.linkedEntityId!, true)}
                className="w-full py-1.5 rounded bg-sky-500 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Open Linked Wiki Entry
              </button>
            )}
          </div>
        )}

        {/* Selected Zone Inspector */}
        {selectedZone && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-purple-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-purple-400 font-semibold flex items-center gap-1.5">
                <Hexagon className="w-4 h-4 text-purple-400" />
                <span>Territory / Zone</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  deleteMapZone(activeMap.id, selectedZone.id);
                  setSelectedZone(null);
                }}
                className="text-slate-500 hover:text-rose-400 cursor-pointer"
                title="Delete Zone"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 block">Zone Name</label>
              <input
                type="text"
                value={selectedZone.name}
                onChange={(e) => {
                  const updatedName = e.target.value;
                  setSelectedZone({ ...selectedZone, name: updatedName });
                  updateMapZone(activeMap.id, selectedZone.id, { name: updatedName });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={selectedZone.color}
                    onChange={(e) => {
                      const updatedColor = e.target.value;
                      setSelectedZone({ ...selectedZone, color: updatedColor });
                      updateMapZone(activeMap.id, selectedZone.id, { color: updatedColor });
                    }}
                    className="w-7 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer p-0.5"
                  />
                  <span className="font-mono text-slate-300 text-[11px]">{selectedZone.color}</span>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Border</label>
                <select
                  value={selectedZone.borderStyle || 'solid'}
                  onChange={(e) => {
                    const bs = e.target.value as MapZone['borderStyle'];
                    setSelectedZone({ ...selectedZone, borderStyle: bs });
                    updateMapZone(activeMap.id, selectedZone.id, { borderStyle: bs });
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Opacity</span>
                <span className="font-mono text-slate-200">{Math.round((selectedZone.opacity ?? 0.25) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={selectedZone.opacity ?? 0.25}
                onChange={(e) => {
                  const op = parseFloat(e.target.value);
                  setSelectedZone({ ...selectedZone, opacity: op });
                  updateMapZone(activeMap.id, selectedZone.id, { opacity: op });
                }}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 block">Assigned Layer</label>
              <select
                value={selectedZone.layerId || 'layer-borders'}
                onChange={(e) => {
                  const newLayId = e.target.value;
                  moveMapObjectToLayer(activeMap.id, 'zone', selectedZone.id, newLayId);
                  setSelectedZone({ ...selectedZone, layerId: newLayId });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
              >
                {customLayers.map((lay) => (
                  <option key={lay.id} value={lay.id}>
                    {lay.name} {lay.id === (selectedZone.layerId || 'layer-borders') ? '✓' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-[11px] text-slate-400">
              Vertices: <span className="text-slate-200 font-mono">{selectedZone.points.length} points</span>
            </div>

            {selectedZone.linkedEntityId && (
              <button
                type="button"
                onClick={() => selectEntity(selectedZone.linkedEntityId!, true)}
                className="w-full py-1.5 rounded bg-purple-500 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Open Linked Wiki Entry
              </button>
            )}
          </div>
        )}

        {/* Selected Label Inspector */}
        {selectedLabel && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-rose-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-rose-400 font-semibold flex items-center gap-1.5">
                <Type className="w-4 h-4 text-rose-400" />
                <span>Text Label</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  deleteMapLabel(activeMap.id, selectedLabel.id);
                  setSelectedLabel(null);
                }}
                className="text-slate-500 hover:text-rose-400 cursor-pointer"
                title="Delete Label"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 block">Text</label>
              <input
                type="text"
                value={selectedLabel.text}
                onChange={(e) => {
                  const updatedText = e.target.value;
                  setSelectedLabel({ ...selectedLabel, text: updatedText });
                  updateMapLabel(activeMap.id, selectedLabel.id, { text: updatedText });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={selectedLabel.color}
                    onChange={(e) => {
                      const updatedColor = e.target.value;
                      setSelectedLabel({ ...selectedLabel, color: updatedColor });
                      updateMapLabel(activeMap.id, selectedLabel.id, { color: updatedColor });
                    }}
                    className="w-7 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer p-0.5"
                  />
                  <span className="font-mono text-slate-300 text-[11px]">{selectedLabel.color}</span>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Font Size</label>
                <input
                  type="number"
                  min="8"
                  max="72"
                  value={selectedLabel.fontSize}
                  onChange={(e) => {
                    const fs = parseInt(e.target.value) || 16;
                    setSelectedLabel({ ...selectedLabel, fontSize: fs });
                    updateMapLabel(activeMap.id, selectedLabel.id, { fontSize: fs });
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 block">Assigned Layer</label>
              <select
                value={selectedLabel.layerId || 'layer-annotations'}
                onChange={(e) => {
                  const newLayId = e.target.value;
                  moveMapObjectToLayer(activeMap.id, 'label', selectedLabel.id, newLayId);
                  setSelectedLabel({ ...selectedLabel, layerId: newLayId });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
              >
                {customLayers.map((lay) => (
                  <option key={lay.id} value={lay.id}>
                    {lay.name} {lay.id === (selectedLabel.layerId || 'layer-annotations') ? '✓' : ''}
                  </option>
                ))}
              </select>
            </div>
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

        {/* Zones, Paths & Labels List with Selection & Delete */}
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="text-sm font-semibold text-slate-300">
            Map Objects ({activeMap.zones.length + activeMap.paths.length + activeMap.labels.length})
          </div>
          {activeMap.zones.map((z) => (
            <div
              key={z.id}
              onClick={() => {
                setSelectedZone(z);
                setSelectedPath(null);
                setSelectedMarker(null);
                setSelectedLabel(null);
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded border cursor-pointer transition-all ${
                selectedZone?.id === z.id
                  ? 'bg-purple-950/40 border-purple-500/60 shadow-xs'
                  : 'bg-slate-950 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                <span className="truncate font-medium text-xs text-slate-200">
                  ⬡ {z.name}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMapZone(activeMap.id, z.id);
                  if (selectedZone?.id === z.id) setSelectedZone(null);
                }}
                className="text-slate-500 hover:text-rose-400 cursor-pointer ml-2 p-0.5"
                title="Delete Zone"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {activeMap.paths.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                setSelectedPath(p);
                setSelectedZone(null);
                setSelectedMarker(null);
                setSelectedLabel(null);
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded border cursor-pointer transition-all ${
                selectedPath?.id === p.id
                  ? 'bg-sky-950/40 border-sky-500/60 shadow-xs'
                  : 'bg-slate-950 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="truncate font-medium text-xs text-slate-200">
                  ↝ {p.name}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMapPath(activeMap.id, p.id);
                  if (selectedPath?.id === p.id) setSelectedPath(null);
                }}
                className="text-slate-500 hover:text-rose-400 cursor-pointer ml-2 p-0.5"
                title="Delete Path"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {activeMap.labels.map((l) => (
            <div
              key={l.id}
              onClick={() => {
                setSelectedLabel(l);
                setSelectedZone(null);
                setSelectedPath(null);
                setSelectedMarker(null);
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded border cursor-pointer transition-all ${
                selectedLabel?.id === l.id
                  ? 'bg-rose-950/40 border-rose-500/60 shadow-xs'
                  : 'bg-slate-950 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="truncate text-xs text-slate-300">
                  T: {l.text}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMapLabel(activeMap.id, l.id);
                  if (selectedLabel?.id === l.id) setSelectedLabel(null);
                }}
                className="text-slate-500 hover:text-rose-400 cursor-pointer ml-2 p-0.5"
                title="Delete Label"
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
                  layerId: markerLayerId || activePlacementLayerId || 'layer-poi',
                });
              } else if (activeTool === 'add_label') {
                addMapLabel(activeMap.id, {
                  text: markerName.trim().toUpperCase(),
                  x: pendingCoord[0],
                  y: pendingCoord[1],
                  fontSize: 16,
                  style: 'region',
                  color: markerColor,
                  layerId: labelLayerId || activePlacementLayerId || 'layer-annotations',
                });
              }
              setMarkerName('');
              setPendingCoord(null);
              setActiveTool('select');
            }}
            className={`w-full ${
              activeTool === 'add_marker' ? 'max-w-lg' : 'max-w-sm'
            } bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl text-xs`}
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
                {/* Marker Icon Set Switcher */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-medium">Icon Set</label>
                    <span className="text-[10px] text-slate-400">
                      Map Default: {getMarkerSet(activeMap.markerIconSet).name}
                    </span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {MARKER_SETS.map((set) => {
                      const isActive = markerModalSetId === set.id;
                      return (
                        <button
                          key={set.id}
                          type="button"
                          onClick={() => {
                            setMarkerModalSetId(set.id);
                            if (!set.icons.some((i) => i.key === markerIcon)) {
                              setMarkerIcon(set.icons[0].key);
                              setMarkerColor(set.icons[0].defaultColor);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all ${
                            isActive
                              ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                              : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                          }`}
                        >
                          {set.name.split(' ')[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Visual Icon Grid for Selected Set */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium block">
                    Choose Icon ({getMarkerIconDef(markerIcon).label})
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-44 overflow-y-auto p-1.5 bg-slate-950 rounded-lg border border-slate-800">
                    {getMarkerSet(markerModalSetId).icons.map((ic) => {
                      const IconComp = ic.icon;
                      const isSelected = markerIcon === ic.key;
                      return (
                        <button
                          key={ic.key}
                          type="button"
                          onClick={() => {
                            setMarkerIcon(ic.key);
                            setMarkerColor(ic.defaultColor);
                          }}
                          className={`flex flex-col items-center justify-center p-2 rounded-lg gap-1 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-300 shadow-md scale-95'
                              : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                          }`}
                        >
                          <IconComp className="w-5 h-5" />
                          <span className="text-[10px] leading-tight text-center line-clamp-1 w-full">
                            {ic.label.split(' / ')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Selection & Swatches */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium block">Marker Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={markerColor}
                      onChange={(e) => setMarkerColor(e.target.value)}
                      className="w-9 h-8 bg-slate-950 border border-slate-700 rounded p-0.5 cursor-pointer"
                    />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {['#f59e0b', '#ef4444', '#38bdf8', '#10b981', '#a855f7', '#ec4899', '#06b6d4', '#e2e8f0'].map(
                        (hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setMarkerColor(hex)}
                            className={`w-6 h-6 rounded-full border cursor-pointer transition-all ${
                              markerColor.toLowerCase() === hex.toLowerCase()
                                ? 'border-white scale-110 shadow-sm'
                                : 'border-slate-800 hover:scale-105'
                            }`}
                            style={{ backgroundColor: hex }}
                          />
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">
                    Link to Wiki Entity (Optional)
                  </label>
                  <select
                    value={markerEntityId}
                    onChange={(e) => setMarkerEntityId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
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
            <div>
              <label className="block text-slate-300 mb-1">Target Map Layer</label>
              <select
                value={activeTool === 'add_marker' ? markerLayerId : labelLayerId}
                onChange={(e) => {
                  if (activeTool === 'add_marker') {
                    setMarkerLayerId(e.target.value);
                  } else {
                    setLabelLayerId(e.target.value);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              >
                {customLayers.map((lay) => (
                  <option key={lay.id} value={lay.id}>
                    {lay.name}
                  </option>
                ))}
              </select>
            </div>

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
                markerIconSet: newMapMarkerIconSet,
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
            <div>
              <label className="block text-slate-300 mb-1">Marker Icon Set</label>
              <select
                value={newMapMarkerIconSet}
                onChange={(e) => setNewMapMarkerIconSet(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-slate-100 font-medium"
              >
                {MARKER_SETS.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name} — {set.description}
                  </option>
                ))}
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
      {/* Map Layers Manager Drawer / Slide-Over */}
      {showLayersDrawer && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-end backdrop-blur-xs">
          <div className="w-full max-w-lg h-full bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-100">Map Layers Manager</h3>
                  <p className="text-xs text-slate-400">
                    {customLayers.length} layers &middot; {activeMap.markers.length + activeMap.paths.length + activeMap.zones.length + activeMap.labels.length} total objects
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLayersDrawer(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action Bar */}
            <div className="p-3 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSetAllLayersVisibility(true)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  Show All
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllLayersVisibility(false)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 cursor-pointer"
                >
                  Hide All
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowNewLayerModal(true)}
                className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Layer
              </button>
            </div>

            {/* Placement Layer Selector Bar */}
            <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-400">Default Target Layer for new objects:</span>
              <select
                value={activePlacementLayerId}
                onChange={(e) => setActivePlacementLayerId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
              >
                {customLayers.map((lay) => (
                  <option key={lay.id} value={lay.id}>
                    {lay.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Scrollable Layers List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {customLayers.map((lay, idx) => {
                const objs = getLayerObjects(lay.id);
                const isExpanded = expandedLayerIds.has(lay.id);
                const isEditing = editingLayerId === lay.id;

                return (
                  <div
                    key={lay.id}
                    className={`rounded-xl border transition-all ${
                      lay.visible
                        ? 'bg-slate-950 border-slate-800 shadow-xs'
                        : 'bg-slate-950/50 border-slate-900 opacity-60'
                    }`}
                  >
                    {/* Layer Header Row */}
                    <div className="p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Reorder Buttons */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleReorderLayer(lay.id, 'up')}
                            className="p-0.5 rounded text-slate-500 hover:text-slate-200 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                            title="Move layer up"
                          >
                            <MoveUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === customLayers.length - 1}
                            onClick={() => handleReorderLayer(lay.id, 'down')}
                            className="p-0.5 rounded text-slate-500 hover:text-slate-200 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                            title="Move layer down"
                          >
                            <MoveDown className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Visibility Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleLayerVisibility(lay.id)}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            lay.visible
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-slate-900 border-slate-800 text-slate-600'
                          }`}
                          title={lay.visible ? 'Hide layer' : 'Show layer'}
                        >
                          {lay.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>

                        {/* Lock Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleLayerLock(lay.id)}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            lay.locked
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                              : 'bg-slate-900 border-slate-800 text-slate-600'
                          }`}
                          title={lay.locked ? 'Unlock layer' : 'Lock layer'}
                        >
                          {lay.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </button>

                        {/* Color Picker Swatch */}
                        <input
                          type="color"
                          value={lay.color || '#3b82f6'}
                          onChange={(e) => {
                            ensureCustomLayers();
                            updateMapLayer(activeMap.id, lay.id, { color: e.target.value });
                          }}
                          className="w-6 h-6 rounded bg-transparent border border-slate-700 cursor-pointer p-0 shrink-0"
                          title="Layer Color"
                        />

                        {/* Layer Name / Renaming */}
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <input
                              type="text"
                              value={editingLayerName}
                              onChange={(e) => setEditingLayerName(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editingLayerName.trim()) {
                                    updateMapLayer(activeMap.id, lay.id, { name: editingLayerName.trim() });
                                    setEditingLayerId(null);
                                  }
                                } else if (e.key === 'Escape') {
                                  setEditingLayerId(null);
                                }
                              }}
                              className="bg-slate-900 border border-amber-500/50 rounded px-2 py-0.5 text-xs text-slate-100 flex-1 font-semibold"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (editingLayerName.trim()) {
                                  updateMapLayer(activeMap.id, lay.id, { name: editingLayerName.trim() });
                                  setEditingLayerId(null);
                                }
                              }}
                              className="p-1 rounded bg-amber-500 text-slate-950 cursor-pointer"
                              title="Save Name"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingLayerId(null)}
                              className="p-1 rounded bg-slate-800 text-slate-400 cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="font-semibold text-xs text-slate-200 truncate">
                              {lay.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLayerId(lay.id);
                                setEditingLayerName(lay.name);
                              }}
                              className="text-slate-600 hover:text-slate-300 p-0.5 cursor-pointer"
                              title="Rename layer"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Right Controls: Delete */}
                      <div className="flex items-center gap-1">
                        {customLayers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteLayer(lay.id)}
                            className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-900 cursor-pointer"
                            title="Delete Layer (Migrates objects to another layer)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Layer Controls: Opacity & Summary */}
                    <div className="px-3 pb-3 pt-1 border-t border-slate-900 space-y-2">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Sliders className="w-3 h-3 text-slate-500" />
                          Opacity
                        </span>
                        <div className="flex items-center gap-2 flex-1 max-w-[160px]">
                          <input
                            type="range"
                            min="0.05"
                            max="1"
                            step="0.05"
                            value={lay.opacity ?? 1}
                            onChange={(e) => {
                              ensureCustomLayers();
                              updateMapLayer(activeMap.id, lay.id, {
                                opacity: parseFloat(e.target.value),
                              });
                            }}
                            className="w-full accent-amber-500 cursor-pointer"
                          />
                          <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
                            {Math.round((lay.opacity ?? 1) * 100)}%
                          </span>
                        </div>
                      </div>

                      {/* Objects Summary & Tree Expand Toggle */}
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-[11px] text-slate-400">
                          {objs.totalCount === 0 ? (
                            '0 objects'
                          ) : (
                            <>
                              {objs.totalCount} objects &middot;{' '}
                              <span className="text-slate-500">
                                {[
                                  objs.markers.length > 0 ? `${objs.markers.length} pins` : null,
                                  objs.paths.length > 0 ? `${objs.paths.length} routes` : null,
                                  objs.zones.length > 0 ? `${objs.zones.length} zones` : null,
                                  objs.labels.length > 0 ? `${objs.labels.length} labels` : null,
                                ]
                                  .filter(Boolean)
                                  .join(', ')}
                              </span>
                            </>
                          )}
                        </span>
                        {objs.totalCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedLayerIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(lay.id)) next.delete(lay.id);
                                else next.add(lay.id);
                                return next;
                              });
                            }}
                            className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>{isExpanded ? 'Collapse' : 'Inspect Objects'}</span>
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Expanded Objects List */}
                      {isExpanded && objs.totalCount > 0 && (
                        <div className="pt-2 border-t border-slate-900 space-y-1.5 max-h-48 overflow-y-auto">
                          {objs.markers.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/60 text-xs"
                            >
                              <div
                                className="flex items-center gap-1.5 truncate cursor-pointer hover:text-amber-300"
                                onClick={() => {
                                  setSelectedMarker(m);
                                  setSelectedPath(null);
                                  setSelectedZone(null);
                                  setSelectedLabel(null);
                                  setShowLayersDrawer(false);
                                }}
                              >
                                <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="truncate text-slate-200">{m.name}</span>
                              </div>
                              <select
                                value={m.layerId || lay.id}
                                onChange={(e) =>
                                  moveMapObjectToLayer(activeMap.id, 'marker', m.id, e.target.value)
                                }
                                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-300 ml-2"
                                title="Move to layer"
                              >
                                {customLayers.map((targetLay) => (
                                  <option key={targetLay.id} value={targetLay.id}>
                                    → {targetLay.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                          {objs.paths.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/60 text-xs"
                            >
                              <div
                                className="flex items-center gap-1.5 truncate cursor-pointer hover:text-sky-300"
                                onClick={() => {
                                  setSelectedPath(p);
                                  setSelectedMarker(null);
                                  setSelectedZone(null);
                                  setSelectedLabel(null);
                                  setShowLayersDrawer(false);
                                }}
                              >
                                <Route className="w-3 h-3 text-sky-400 shrink-0" />
                                <span className="truncate text-slate-200">{p.name}</span>
                              </div>
                              <select
                                value={p.layerId || lay.id}
                                onChange={(e) =>
                                  moveMapObjectToLayer(activeMap.id, 'path', p.id, e.target.value)
                                }
                                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-300 ml-2"
                                title="Move to layer"
                              >
                                {customLayers.map((targetLay) => (
                                  <option key={targetLay.id} value={targetLay.id}>
                                    → {targetLay.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                          {objs.zones.map((z) => (
                            <div
                              key={z.id}
                              className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/60 text-xs"
                            >
                              <div
                                className="flex items-center gap-1.5 truncate cursor-pointer hover:text-purple-300"
                                onClick={() => {
                                  setSelectedZone(z);
                                  setSelectedMarker(null);
                                  setSelectedPath(null);
                                  setSelectedLabel(null);
                                  setShowLayersDrawer(false);
                                }}
                              >
                                <Hexagon className="w-3 h-3 text-purple-400 shrink-0" />
                                <span className="truncate text-slate-200">{z.name}</span>
                              </div>
                              <select
                                value={z.layerId || lay.id}
                                onChange={(e) =>
                                  moveMapObjectToLayer(activeMap.id, 'zone', z.id, e.target.value)
                                }
                                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-300 ml-2"
                                title="Move to layer"
                              >
                                {customLayers.map((targetLay) => (
                                  <option key={targetLay.id} value={targetLay.id}>
                                    → {targetLay.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                          {objs.labels.map((l) => (
                            <div
                              key={l.id}
                              className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/60 text-xs"
                            >
                              <div
                                className="flex items-center gap-1.5 truncate cursor-pointer hover:text-rose-300"
                                onClick={() => {
                                  setSelectedLabel(l);
                                  setSelectedMarker(null);
                                  setSelectedPath(null);
                                  setSelectedZone(null);
                                  setShowLayersDrawer(false);
                                }}
                              >
                                <Type className="w-3 h-3 text-rose-400 shrink-0" />
                                <span className="truncate text-slate-200">{l.text}</span>
                              </div>
                              <select
                                value={l.layerId || lay.id}
                                onChange={(e) =>
                                  moveMapObjectToLayer(activeMap.id, 'label', l.id, e.target.value)
                                }
                                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-300 ml-2"
                                title="Move to layer"
                              >
                                {customLayers.map((targetLay) => (
                                  <option key={targetLay.id} value={targetLay.id}>
                                    → {targetLay.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Create New Layer Modal */}
      {showNewLayerModal && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateNewLayer();
            }}
            className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-amber-400" />
                Create New Map Layer
              </h3>
              <button
                type="button"
                onClick={() => setShowNewLayerModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Layer Name *</label>
              <input
                type="text"
                required
                autoFocus
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                placeholder="e.g., Hidden Dungeons, Trade Routes, Faction Outposts"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-300">Layer Color & Accent</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newLayerColor}
                  onChange={(e) => setNewLayerColor(e.target.value)}
                  className="w-8 h-8 rounded bg-slate-950 border border-slate-700 p-0.5 cursor-pointer"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#e2e8f0'].map(
                    (hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setNewLayerColor(hex)}
                        className={`w-5 h-5 rounded-full border cursor-pointer transition-all ${
                          newLayerColor.toLowerCase() === hex.toLowerCase()
                            ? 'border-white scale-110 shadow-sm'
                            : 'border-slate-800 hover:scale-105'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-slate-300">
                <span>Default Opacity</span>
                <span className="font-mono text-slate-400">{Math.round(newLayerOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={newLayerOpacity}
                onChange={(e) => setNewLayerOpacity(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewLayerModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold cursor-pointer"
              >
                Create Layer
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

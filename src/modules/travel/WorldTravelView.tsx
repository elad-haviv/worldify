import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import {
  Compass,
  MapPin,
  Footprints,
  Sparkles,
  Eye,
  Users,
  Send,
  Navigation,
  ExternalLink,
  MessageSquare,
  Clock,
  Calendar,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  RotateCcw,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatTickToDate } from '../../utils/calendarEngine';
import { CATEGORY_META, categoryColor, categoryLabel } from '../../utils/categories';
import { generateWorldTravelExploration } from '../../services/aiService';
import { EntityCategory, WorldTravelLogEntry } from '../../types/worldify';

export const WorldTravelView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedMapId,
    selectMap,
    selectEntity,
    travelerState,
    setTravelerPosition,
    addTravelLogEntry,
    markDiscoveryInserted,
    markEncounterNPCInserted,
    clearTravelLog,
    createEntity,
    addEntitySpatialKeyframe,
    openCharacterChat,
    stepCurrentTick,
    aiSettings,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId) || projects[0];
  const activeMap =
    project?.maps.find((m) => m.id === (travelerState.mapId || selectedMapId)) ||
    project?.maps[0] ||
    null;

  const calendar =
    project?.calendars.find((c) => c.id === project.activeCalendarId) ||
    project?.calendars[0];

  const formattedDate = useMemo(() => {
    if (!calendar || !project) return null;
    return formatTickToDate(calendar, project.currentTick);
  }, [calendar, project?.currentTick]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [customActionText, setCustomActionText] = useState('');
  const [advanceTimeOnMove, setAdvanceTimeOnMove] = useState(true);
  const [daysPerStep, setDaysPerStep] = useState(1);
  const [expandedLoreMap, setExpandedLoreMap] = useState<Record<string, boolean>>({});
  const [selectedDestinationLandmark, setSelectedDestinationLandmark] = useState<string>('');

  const mapSvgRef = useRef<SVGSVGElement | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize traveler mapId if not set
  useEffect(() => {
    if (activeMap && travelerState.mapId !== activeMap.id) {
      setTravelerPosition(activeMap.id, travelerState.x || 500, travelerState.y || 500);
    }
  }, [activeMap?.id]);

  // Extract landmarks on active map
  const landmarks = useMemo(() => {
    if (!activeMap || !project) return [];
    const list: Array<{ id: string; name: string; x: number; y: number; kind: string; entityId?: string }> = [];

    // Map markers
    for (const m of activeMap.markers || []) {
      list.push({ id: m.id, name: m.name, x: m.x, y: m.y, kind: m.icon || 'landmark' });
    }
    // Procedural burgs
    if (activeMap.proceduralData?.burgs) {
      for (const b of activeMap.proceduralData.burgs) {
        list.push({ id: `burg-${b.id}`, name: b.name, x: b.x, y: b.y, kind: 'settlement' });
      }
    }
    // Entities with keyframes on this map
    for (const ent of project.entities) {
      const kf = ent.spatialKeyframes?.find((k) => k.mapId === activeMap.id);
      if (kf) {
        list.push({ id: ent.id, name: ent.title, x: kf.x, y: kf.y, kind: ent.category, entityId: ent.id });
      }
    }
    return list;
  }, [activeMap, project]);

  // Nearest landmark to traveler
  // Dynamic aspect ratio for raster maps (same approach as LivingWorldMapCanvas):
  // the SVG canvas height follows the raster's natural proportions so the image
  // is never stretched (all y-coordinates stay 0-1000 normalized and are scaled
  // by canvasHeight at render time).
  const [rasterNaturalSize, setRasterNaturalSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (activeMap?.rasterImageUrl) {
      const img = new Image();
      img.onload = () => {
        setRasterNaturalSize({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      };
      img.src = activeMap.rasterImageUrl;
      if (img.complete && (img.naturalWidth || img.width)) {
        setRasterNaturalSize({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      }
    } else {
      setRasterNaturalSize(null);
    }
  }, [activeMap?.id, activeMap?.rasterImageUrl]);

  const canvasHeight = useMemo(() => {
    if (!activeMap?.rasterImageUrl) return 750;
    if (rasterNaturalSize && rasterNaturalSize.width > 0 && rasterNaturalSize.height > 0) {
      return Math.max(200, Math.min(2000, Math.round((750 * rasterNaturalSize.height) / rasterNaturalSize.width)));
    }
    return 750;
  }, [activeMap, rasterNaturalSize]);

  const nearestLandmark = useMemo(() => {
    if (!landmarks.length) return null;
    let closest = landmarks[0];
    let minD = Math.hypot(closest.x - travelerState.x, closest.y - travelerState.y);
    for (let i = 1; i < landmarks.length; i++) {
      const d = Math.hypot(landmarks[i].x - travelerState.x, landmarks[i].y - travelerState.y);
      if (d < minD) {
        minD = d;
        closest = landmarks[i];
      }
    }
    return { ...closest, distance: Math.round(minD) };
  }, [landmarks, travelerState.x, travelerState.y]);

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!mapSvgRef.current || !activeMap) return;
    const svg = mapSvgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const x = Math.max(20, Math.min(980, Math.round(local.x)));
    const y = Math.max(20, Math.min(980, Math.round((local.y / canvasHeight) * 1000)));

    setTravelerPosition(activeMap.id, x, y);
  };

  const handleMoveDirection = (dx: number, dy: number) => {
    if (!activeMap) return;
    const nextX = Math.max(30, Math.min(970, travelerState.x + dx));
    const nextY = Math.max(30, Math.min(970, travelerState.y + dy));
    setTravelerPosition(activeMap.id, nextX, nextY);

    if (advanceTimeOnMove) {
      stepCurrentTick(daysPerStep);
    }
  };

  const executeTravelAction = async (
    actionType: 'travel_step' | 'scout' | 'encounter' | 'custom',
    customPrompt?: string
  ) => {
    if (!project || !activeMap || isGenerating) return;
    setIsGenerating(true);

    try {
      if (advanceTimeOnMove && actionType !== 'scout') {
        stepCurrentTick(daysPerStep);
      }

      const logEntry = await generateWorldTravelExploration(
        {
          mapId: activeMap.id,
          coordinates: { x: travelerState.x, y: travelerState.y },
          actionType,
          customPrompt: customPrompt || customActionText,
          travelDestination: selectedDestinationLandmark || nearestLandmark?.name,
        },
        project,
        aiSettings
      );

      addTravelLogEntry(logEntry);
      if (actionType === 'custom') {
        setCustomActionText('');
      }

      // Scroll to new entry
      setTimeout(() => {
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } catch (err) {
      console.error('Failed to generate travel event:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsertDiscovery = (entry: WorldTravelLogEntry) => {
    if (!entry.discovery || !project || !activeMap) return;
    const disc = entry.discovery;
    const title = disc.title || disc.name || 'Discovered Site';
    const lore = disc.contentMd || disc.loreDetails || '';

    // Create the entity
    const created = createEntity({
      title,
      category: disc.category,
      summary: disc.summary,
      contentMd: `${lore}\n\n## Geographical Context\nDiscovered at coordinates (${Math.round(
        entry.x
      )}, ${Math.round(entry.y)}) on [[${activeMap.name}]] during Timeline Tick ${entry.tick}.`,
      tags: [...disc.tags, 'ai-discovery', 'world-travel'],
    });

    // Pin on map at exact coordinates
    addEntitySpatialKeyframe(created.id, {
      mapId: activeMap.id,
      x: entry.x,
      y: entry.y,
      tick: entry.tick,
      statusNote: `Discovery: ${title}`,
    });

    markDiscoveryInserted(entry.id, created.id);
  };

  const handleInsertEncounterNPC = (entry: WorldTravelLogEntry): string | null => {
    if (!entry.encounter || !project || !activeMap) return null;
    const enc = entry.encounter;
    const npcName = enc.npcName || enc.npc?.name || 'Wandering Traveler';
    const npcRole = enc.npcRole || enc.npc?.role || 'Wanderer';
    const locName = entry.locationName || `Wilds of ${activeMap.name}`;
    const quote = enc.dialogueQuote || enc.npc?.greeting || '"Safe journeys, traveler."';
    const context = enc.dialogueContext || enc.summary || 'Encountered along the road.';
    const disp = enc.disposition || enc.npc?.personality || 'neutral';

    const created = createEntity({
      title: npcName,
      category: 'character',
      summary: `${npcRole}${
        enc.npcFactionOrAffiliation ? ` (${enc.npcFactionOrAffiliation})` : ''
      } met in ${locName}.`,
      contentMd: `## Biography & Role\n**${npcName}** is a ${npcRole} encountered in **${locName}** on [[${activeMap.name}]].\n\n## Encounter Context\n${context}\n\n## Spoken Words\n*Disposition*: **${disp}**\n\n> "${quote}"\n\n## Affiliation\n${enc.npcFactionOrAffiliation || 'Independent traveler.'}`,
      tags: ['travel-encounter', 'npc', disp, 'ai-discovered'],
    });

    addEntitySpatialKeyframe(created.id, {
      mapId: activeMap.id,
      x: entry.x,
      y: entry.y,
      tick: entry.tick,
      statusNote: `Met: ${npcName}`,
    });

    markEncounterNPCInserted(entry.id, created.id);
    return created.id;
  };

  const handleConverseWithEncounterNPC = (entry: WorldTravelLogEntry) => {
    if (!entry.encounter) return;
    let npcEntityId = entry.encounter.insertedEntityId;
    if (!npcEntityId) {
      npcEntityId = handleInsertEncounterNPC(entry) || undefined;
    }
    if (npcEntityId) {
      openCharacterChat(npcEntityId);
    }
  };

  const renderWikiLinks = (text: string) => {
    const parts = text.split(/(\[\[.*?\]\])/g);
    return parts.map((part, i) => {
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const title = part.slice(2, -2).trim();
        const matched = project?.entities.find(
          (e) => e.title.toLowerCase() === title.toLowerCase()
        );
        return (
          <button
            key={i}
            type="button"
            onClick={() => matched && selectEntity(matched.id, true)}
            className={`inline-flex items-center gap-0.5 px-1 py-0.2 font-medium rounded transition-colors ${
              matched
                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 underline decoration-amber-500/40 cursor-pointer'
                : 'text-amber-300/80 italic'
            }`}
            title={matched ? `Open ${matched.title} in Wiki` : `Unlinked Lore: ${title}`}
          >
            {title}
            {matched && <ExternalLink className="w-2.5 h-2.5 opacity-60 ml-0.5" />}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Travel Bar */}
      <div className="flex-shrink-0 border-b border-slate-800 bg-slate-900/90 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Compass className="w-5 h-5 animate-[spin_10s_linear_infinite]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-100">World Travel & Exploration</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                Live AI
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Traverse cartography, discover lore-friendly entities, and converse with inhabitants
            </p>
          </div>
        </div>

        {/* Map & Anchor Controls */}
        <div className="flex items-center gap-2">
          {/* Active Map Picker */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={activeMap?.id || ''}
              onChange={(e) => {
                const mapId = e.target.value;
                selectMap(mapId);
                setTravelerPosition(mapId, travelerState.x || 500, travelerState.y || 500);
              }}
              className="bg-transparent text-slate-200 outline-none cursor-pointer pr-1"
            >
              {project?.maps.map((m) => (
                <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Temporal Cursor Indicator */}
          {formattedDate && (
            <div className="hidden md:flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-300 font-medium">{formattedDate.displayShort}</span>
              <span className="text-slate-500">|</span>
              <span className="text-amber-300/90">{formattedDate.month.season}</span>
              {formattedDate.moonPhases[0] && (
                <span className="text-slate-400 text-xs" title={formattedDate.moonPhases[0].moon.name}>
                  {formattedDate.moonPhases[0].phaseIcon}
                </span>
              )}
            </div>
          )}

          {/* Clear Log */}
          {travelerState.travelLog.length > 0 && (
            <button
              type="button"
              onClick={clearTravelLog}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-900 transition-colors cursor-pointer flex items-center gap-1"
              title="Clear travel expedition log"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Reset Log</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace: Split Map & Expedition Feed */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left Column: Interactive Map & Travel Controls */}
        <div className="w-full lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/40 min-h-0 overflow-hidden">
          {/* Map Viewport */}
          <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden select-none">
            {activeMap ? (
              <svg
                ref={mapSvgRef}
                viewBox={`0 0 1000 ${canvasHeight}`}
                onClick={handleMapClick}
                className="w-full h-full object-contain cursor-crosshair max-h-[55vh] lg:max-h-full"
              >
                {/* Background Grid & Terrain */}
                <defs>
                  <pattern id="travelGrid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path
                      d="M 50 0 L 0 0 0 50"
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth="0.8"
                      strokeOpacity="0.5"
                    />
                  </pattern>
                </defs>
                <rect width="1000" height={canvasHeight} fill="#090d16" />
                <rect width="1000" height={canvasHeight} fill="url(#travelGrid)" />

                {/* Raster Background if any */}
                {activeMap.rasterImageUrl && (
                  <image
                    href={activeMap.rasterImageUrl}
                    width="1000"
                    height={canvasHeight}
                    preserveAspectRatio="none"
                    opacity="0.75"
                  />
                )}

                {/* Map Paths */}
                {activeMap.paths?.map((p) => {
                  const dStr = p.points.reduce(
                    (acc, pt, idx) =>
                      idx === 0
                        ? `M ${pt[0]} ${(pt[1] / 1000) * canvasHeight}`
                        : `${acc} L ${pt[0]} ${(pt[1] / 1000) * canvasHeight}`,
                    ''
                  );
                  return (
                    <path
                      key={p.id}
                      d={dStr}
                      fill="none"
                      stroke={p.color || '#f59e0b'}
                      strokeWidth="2.5"
                      strokeDasharray={p.style === 'trade_route' ? '5,5' : 'none'}
                      opacity="0.6"
                    />
                  );
                })}

                {/* Known Landmarks & Burgs */}
                {landmarks.map((lm) => {
                  const cy = (lm.y / 1000) * canvasHeight;
                  return (
                    <g key={lm.id} transform={`translate(${lm.x}, ${cy})`}>
                      <circle
                        r="6"
                        fill="#334155"
                        stroke="#94a3b8"
                        strokeWidth="1.5"
                        opacity="0.8"
                      />
                      <text
                        x="9"
                        y="4"
                        fill="#cbd5e1"
                        fontSize="11"
                        fontFamily="sans-serif"
                        className="pointer-events-none drop-shadow"
                      >
                        {lm.name}
                      </text>
                    </g>
                  );
                })}

                {/* Traveler Token */}
                <g
                  transform={`translate(${travelerState.x}, ${(travelerState.y / 1000) * canvasHeight})`}
                  className="transition-all duration-300"
                >
                  {/* Ping Animation */}
                  <circle r="22" fill="#f59e0b" className="animate-ping opacity-30" />
                  {/* Compass Ring */}
                  <circle r="14" fill="#0f172a" stroke="#f59e0b" strokeWidth="2.5" />
                  <circle r="5" fill="#f59e0b" />
                  <path
                    d="M 0 -11 L 3 -3 L 0 5 L -3 -3 Z"
                    fill="#ef4444"
                    stroke="#fff"
                    strokeWidth="0.5"
                  />
                  {/* Floating Coordinates Badge */}
                  <rect
                    x="-45"
                    y="-30"
                    width="90"
                    height="16"
                    rx="4"
                    fill="#020617"
                    stroke="#f59e0b"
                    strokeWidth="1"
                    opacity="0.9"
                  />
                  <text
                    x="0"
                    y="-18"
                    textAnchor="middle"
                    fill="#fde68a"
                    fontSize="9.5"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    ({travelerState.x}, {travelerState.y})
                  </text>
                </g>
              </svg>
            ) : (
              <div className="p-8 text-center text-slate-500">
                <Navigation className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>No map available. Create a map in the Maps module to begin traveling.</p>
              </div>
            )}

            {/* In-Map Floating Legend / Coordinate Overlay */}
            <div className="absolute top-3 left-3 bg-slate-950/85 backdrop-blur border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 flex flex-col gap-1 shadow-lg pointer-events-none">
              <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                <MapPin className="w-3.5 h-3.5" />
                <span>Traveler Location</span>
              </div>
              <div className="font-mono text-slate-400">
                X: {travelerState.x} | Y: {travelerState.y}
              </div>
              {nearestLandmark && (
                <div className="text-[11px] text-slate-400">
                  Nearest: <span className="text-slate-200 font-semibold">{nearestLandmark.name}</span> (~{nearestLandmark.distance} units)
                </div>
              )}
            </div>

            {/* Click-to-Travel Prompt */}
            <div className="absolute bottom-3 left-3 text-[11px] text-slate-500 bg-slate-950/80 px-2 py-1 rounded border border-slate-800/80 pointer-events-none">
              Click anywhere on map to reposition your traveler
            </div>
          </div>

          {/* Travel Controls & Action Pad */}
          <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-col gap-3">
            {/* Navpad & Destination Controls */}
            <div className="flex items-center justify-between gap-2">
              {/* Directional Compass D-Pad */}
              <div className="flex items-center gap-1 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => handleMoveDirection(-60, 0)}
                  disabled={isGenerating}
                  className="w-7 h-7 rounded flex items-center justify-center bg-slate-800/60 hover:bg-slate-700 text-slate-300 disabled:opacity-50 transition-colors"
                  title="March West (-X)"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => handleMoveDirection(0, -60)}
                    disabled={isGenerating}
                    className="w-7 h-7 rounded flex items-center justify-center bg-slate-800/60 hover:bg-slate-700 text-slate-300 disabled:opacity-50 transition-colors"
                    title="March North (-Y)"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDirection(0, 60)}
                    disabled={isGenerating}
                    className="w-7 h-7 rounded flex items-center justify-center bg-slate-800/60 hover:bg-slate-700 text-slate-300 disabled:opacity-50 transition-colors"
                    title="March South (+Y)"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleMoveDirection(60, 0)}
                  disabled={isGenerating}
                  className="w-7 h-7 rounded flex items-center justify-center bg-slate-800/60 hover:bg-slate-700 text-slate-300 disabled:opacity-50 transition-colors"
                  title="March East (+X)"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Destination Landmark Picker */}
              <div className="flex-1 min-w-0">
                <label className="text-[11px] text-slate-400 block mb-0.5">
                  Marching Towards / Exploration Target:
                </label>
                <select
                  value={selectedDestinationLandmark}
                  onChange={(e) => setSelectedDestinationLandmark(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none"
                >
                  <option value="">
                    {nearestLandmark ? `Nearest Landmark (${nearestLandmark.name})` : 'Wild Frontier'}
                  </option>
                  {landmarks.map((lm) => (
                    <option key={lm.id} value={lm.name}>
                      {lm.name} ({lm.kind})
                    </option>
                  ))}
                </select>
              </div>

              {/* Time advancement switch */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={advanceTimeOnMove}
                    onChange={(e) => setAdvanceTimeOnMove(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  <span>+1 Day</span>
                </label>
              </div>
            </div>

            {/* Quick Exploration Triggers */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => executeTravelAction('scout')}
                disabled={isGenerating}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-950/40 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-500 text-xs font-medium transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Scout Vicinity</span>
              </button>

              <button
                type="button"
                onClick={() => executeTravelAction('travel_step')}
                disabled={isGenerating}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-amber-950/40 border border-amber-600/40 text-amber-300 hover:bg-amber-900/50 hover:border-amber-500 text-xs font-medium transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Footprints className="w-3.5 h-3.5" />
                <span>March & Discover</span>
              </button>

              <button
                type="button"
                onClick={() => executeTravelAction('encounter')}
                disabled={isGenerating}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-sky-950/40 border border-sky-600/40 text-sky-300 hover:bg-sky-900/50 hover:border-sky-500 text-xs font-medium transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Random Encounter</span>
              </button>
            </div>

            {/* Custom Intent Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (customActionText.trim()) {
                  executeTravelAction('custom', customActionText.trim());
                }
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="What do you do? (e.g. 'Investigate the strange smoke rising beyond the ridge...')"
                value={customActionText}
                onChange={(e) => setCustomActionText(e.target.value)}
                disabled={isGenerating}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-amber-500 transition-colors"
              />
              <button
                type="submit"
                disabled={isGenerating || !customActionText.trim()}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-medium text-xs flex items-center gap-1 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>Act</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Expedition Journal Feed & Insertable Discoveries */}
        <div className="w-full lg:w-1/2 flex flex-col min-h-0 bg-slate-950">
          {/* Feed Header */}
          <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Expedition Journal & Discoveries</span>
              <span className="text-[11px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                {travelerState.travelLog.length} entries
              </span>
            </div>
            {isGenerating && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400 animate-pulse">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>Exploring world...</span>
              </div>
            )}
          </div>

          {/* Feed Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {travelerState.travelLog.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mb-3">
                  <Compass className="w-6 h-6 text-amber-400/70" />
                </div>
                <h3 className="text-sm font-semibold text-slate-300 mb-1">Your Journal is Empty</h3>
                <p className="text-xs max-w-sm text-slate-400 leading-relaxed mb-4">
                  Select a destination or click on the map, then use <strong>Scout</strong>, <strong>March</strong>, or <strong>Encounter</strong> to experience the world through AI.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => executeTravelAction('scout')}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-medium transition-colors cursor-pointer"
                  >
                    🔭 Scout Starting Location
                  </button>
                </div>
              </div>
            ) : (
              travelerState.travelLog.map((entry) => {
                const isLoreExpanded = Boolean(expandedLoreMap[entry.id]);
                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 shadow-md"
                  >
                    {/* Header: Location, Coordinates, Action & Date */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            entry.actionType === 'scout'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                              : entry.actionType === 'encounter'
                              ? 'bg-sky-950 text-sky-300 border border-sky-700/50'
                              : entry.actionType === 'travel_step'
                              ? 'bg-amber-950 text-amber-300 border border-amber-700/50'
                              : 'bg-purple-950 text-purple-300 border border-purple-700/50'
                          }`}
                        >
                          {entry.actionType === 'travel_step'
                            ? 'March'
                            : entry.actionType === 'scout'
                            ? 'Scout'
                            : entry.actionType === 'encounter'
                            ? 'Encounter'
                            : 'Exploration'}
                        </span>
                        <h4 className="text-xs font-semibold text-slate-200">
                          {entry.locationName || `Wilds of ${activeMap?.name || 'the Realm'}`}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                        <span title="Coordinates">
                          ({entry.x}, {entry.y})
                        </span>
                        <span>•</span>
                        {calendar && (
                          <span title="World Date">
                            {formatTickToDate(calendar, entry.tick).displayShort}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Atmospheric Travel Narrative */}
                    <div className="text-xs text-slate-300 leading-relaxed space-y-2 whitespace-pre-line font-sans">
                      {renderWikiLinks(entry.narrative)}
                    </div>

                    {/* Discovery Card (if present) */}
                    {entry.discovery && (
                      <div className="rounded-lg border border-amber-600/30 bg-amber-950/20 p-3 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span
                                className="text-[10px] font-semibold px-2 py-0.2 rounded uppercase"
                                style={{
                                  backgroundColor: `${categoryColor(entry.discovery.category)}20`,
                                  color: categoryColor(entry.discovery.category),
                                  border: `1px solid ${categoryColor(entry.discovery.category)}50`,
                                }}
                              >
                                {categoryLabel(entry.discovery.category)} Discovery
                              </span>
                              {entry.discovery.tags.map((t) => (
                                <span
                                  key={t}
                                  className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.2 rounded"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                            <h5 className="text-xs font-bold text-amber-200">
                              {entry.discovery.title || entry.discovery.name}
                            </h5>
                            <p className="text-xs text-slate-300 mt-0.5">
                              {entry.discovery.summary}
                            </p>
                          </div>

                          {/* Insert / View in Wiki Button */}
                          <div>
                            {entry.discovery.insertedEntityId ? (
                              <button
                                type="button"
                                onClick={() =>
                                  selectEntity(entry.discovery!.insertedEntityId!, true)
                                }
                                className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-600/60 text-emerald-300 hover:bg-emerald-900 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                                <span>In Wiki</span>
                                <ExternalLink className="w-2.5 h-2.5 opacity-60 ml-0.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleInsertDiscovery(entry)}
                                className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                                title="Canonicalize this discovery into your Wiki, map pins, and knowledge graph"
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>✨ Insert into World</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Collapsible Lore Details */}
                        {(entry.discovery.contentMd || entry.discovery.loreDetails) && (
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLoreMap((prev) => ({
                                  ...prev,
                                  [entry.id]: !prev[entry.id],
                                }))
                              }
                              className="text-[11px] text-amber-400/80 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-medium"
                            >
                              {isLoreExpanded ? (
                                <>
                                  <ChevronUp className="w-3 h-3" />
                                  <span>Hide Lore Codex</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3 h-3" />
                                  <span>Read Extended Lore & Details</span>
                                </>
                              )}
                            </button>
                            {isLoreExpanded && (
                              <div className="mt-2 text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded border border-slate-800/80 whitespace-pre-line leading-relaxed">
                                {renderWikiLinks(entry.discovery.contentMd || entry.discovery.loreDetails || '')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Encounter Card (if present) */}
                    {entry.encounter && (() => {
                      const enc = entry.encounter;
                      const npcName = enc.npcName || enc.npc?.name || 'Wandering Traveler';
                      const npcRole = enc.npcRole || enc.npc?.role || 'Wanderer';
                      const disp = enc.disposition || enc.npc?.personality || 'neutral';
                      const quote = enc.dialogueQuote || enc.npc?.greeting || '"Safe journeys, traveler."';
                      const context = enc.dialogueContext || enc.summary || 'They pause along the trail.';

                      return (
                        <div className="rounded-lg border border-sky-600/30 bg-sky-950/20 p-3 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[10px] font-semibold px-2 py-0.2 rounded uppercase bg-sky-950 text-sky-300 border border-sky-700/50">
                                  NPC Encounter
                                </span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                                    disp === 'friendly'
                                      ? 'bg-emerald-950/60 text-emerald-400'
                                      : disp === 'hostile'
                                      ? 'bg-rose-950/60 text-rose-400'
                                      : disp === 'fearful'
                                      ? 'bg-amber-950/60 text-amber-400'
                                      : 'bg-slate-800 text-slate-300'
                                  }`}
                                >
                                  {disp}
                                </span>
                              </div>
                              <h5 className="text-xs font-bold text-sky-200">
                                {npcName} —{' '}
                                <span className="font-normal text-slate-300">
                                  {npcRole}
                                </span>
                              </h5>
                              {enc.npcFactionOrAffiliation && (
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  Affiliation: {enc.npcFactionOrAffiliation}
                                </p>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1.5">
                              {!enc.insertedEntityId && (
                                <button
                                  type="button"
                                  onClick={() => handleInsertEncounterNPC(entry)}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
                                  title="Add as Character Entity in Wiki"
                                >
                                  <span>✨ Insert NPC</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleConverseWithEncounterNPC(entry)}
                                className="px-2.5 py-1 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                                title="Start AI Character dialogue with this NPC"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>💬 Converse</span>
                              </button>
                            </div>
                          </div>

                          {/* Dialogue Quote Callout */}
                          <div className="border-l-2 border-sky-400/60 pl-2.5 py-0.5 italic text-xs text-sky-100 bg-sky-950/40 rounded-r">
                            {renderWikiLinks(quote)}
                          </div>

                          <p className="text-xs text-slate-400">
                            {context}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            )}
            <div ref={feedEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

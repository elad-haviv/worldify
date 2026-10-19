export type EntityCategory =
  | 'character'
  | 'settlement'
  | 'faction'
  | 'item'
  | 'deity'
  | 'species'
  | 'location'
  | 'event_lore'
  | 'magic_tech'
  | 'cosmology';

export type TemplateFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'date_tick'
  | 'entity_ref'
  | 'multi_entity_ref'
  | 'coordinates'
  | 'stat_block';

export interface TemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
  options?: string[]; // for 'select'
  defaultValue?: string | number;
  description?: string;
}

export interface Template {
  id: string;
  projectId: string;
  name: string;
  category: EntityCategory;
  icon: string;
  color: string;
  fields: TemplateField[];
  defaultMarkdown: string;
}

export interface CustomProperty {
  key: string;
  label: string;
  value: string;
  type: 'text' | 'number' | 'entity_ref' | 'tag';
}

export interface EntitySpatialKeyframe {
  id: string;
  tick: number; // AbsoluteTick (typically days since Epoch, can have fractional hours)
  endTick?: number; // If traveling along a path or stationed for a duration
  mapId: string;
  x: number; // 0-1000 normalized canvas coordinate
  y: number; // 0-1000 normalized canvas coordinate
  endX?: number;
  endY?: number;
  pathId?: string; // Optional MapPath ID to interpolate along from tick -> endTick
  statusNote?: string; // e.g., "Leading the Siege of Vaelor", "Forged in the Star-Kiln"
}

export interface EntityTemporalState {
  id: string;
  fromTick: number;
  toTick?: number;
  titleOverride?: string;
  status?: string; // e.g., "Alive", "Corrupted", "Crowned Emperor", "Shattered"
  allegianceEntityId?: string;
  notes?: string;
}

export interface Entity {
  id: string;
  projectId: string;
  worldId: string | null; // null if cosmic/multi-world
  templateId: string;
  category: EntityCategory;
  slug: string;
  title: string;
  subtitle?: string;
  summary: string;
  tags: string[];
  contentMd: string;
  templateValues: Record<string, string | number | string[]>;
  customProperties: CustomProperty[];
  lifecycleStartTick?: number; // Birth / Founding / Creation tick
  lifecycleEndTick?: number; // Death / Fall / Destruction tick
  spatialKeyframes: EntitySpatialKeyframe[];
  temporalStates: EntityTemporalState[];
  updatedAt: string;
}

export type RelationType =
  | 'mention' // Auto-extracted from [[WikiLinks]]
  | 'property_ref' // Auto-extracted from template/custom properties
  | 'allied_with'
  | 'rival_of'
  | 'located_in'
  | 'ruled_by'
  | 'member_of'
  | 'wields'
  | 'created_by'
  | 'parent_of'
  | 'connected_portal';

export interface EntityRelation {
  id: string;
  projectId: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationType;
  label: string;
  validFromTick?: number;
  validToTick?: number;
  bidirectional?: boolean;
}

export type WorldType = 'planet' | 'continent' | 'plane' | 'moon' | 'pocket_dimension' | 'star_system';

export interface World {
  id: string;
  projectId: string;
  parentWorldId?: string | null;
  name: string;
  type: WorldType;
  summary: string;
  color: string;
  cosmologyX: number; // 0-1000 position on Cosmological Map
  cosmologyY: number; // 0-1000 position on Cosmological Map
  orbitRadius?: number;
  magicOrPhysicsRules: string;
}

export interface WorldConnection {
  id: string;
  projectId: string;
  sourceWorldId: string;
  targetWorldId: string;
  type: 'planar_rift' | 'orbital_tether' | 'astral_sea_route' | 'world_tree_root' | 'wormhole';
  label: string;
  color: string;
  validFromTick?: number;
  validToTick?: number;
}

// ==========================================
// CUSTOM CALENDAR & TIMELINE ENGINE TYPES
// ==========================================

export interface CalendarEra {
  id: string;
  name: string;
  abbreviation: string; // e.g., "1A", "BS", "AE"
  startYear: number; // Relative to epoch year 0
  endYear?: number; // Undefined if current/open-ended era
  color: string;
  description: string;
}

export interface CalendarMonth {
  id: string;
  name: string;
  days: number;
  season: 'Spring' | 'Summer' | 'Autumn' | 'Winter' | 'Eclipse' | 'Monsoon';
  intercalary?: boolean; // Festival days between months
}

export interface MoonCycle {
  id: string;
  name: string;
  color: string;
  periodDays: number; // e.g., 28 days or 72 days
  phaseOffsetDays: number;
}

export interface CustomCalendar {
  id: string;
  projectId: string;
  name: string;
  hoursPerDay: number;
  weekdays: string[];
  months: CalendarMonth[];
  eras: CalendarEra[];
  moons: MoonCycle[];
  epochName: string; // Tick 0 event name
}

export interface FormattedCalendarDate {
  tick: number;
  year: number;
  era: CalendarEra;
  eraYear: number;
  monthIndex: number;
  month: CalendarMonth;
  dayOfMonth: number;
  weekdayName: string;
  displayShort: string;
  displayFull: string;
  moonPhases: Array<{
    moon: MoonCycle;
    phaseRatio: number; // 0 to 1 (0=New, 0.5=Full)
    phaseName: string;
    phaseIcon: string;
  }>;
}

export type TimelineEventCategory =
  | 'war_battle'
  | 'political_treaty'
  | 'cataclysm'
  | 'discovery_magic'
  | 'birth_death'
  | 'journey'
  | 'story_scene';

export interface TimelineEvent {
  id: string;
  projectId: string;
  worldId: string | null;
  calendarId: string;
  title: string;
  summary: string;
  category: TimelineEventCategory;
  startTick: number;
  endTick?: number;
  importance: 1 | 2 | 3; // 3 = Era-defining
  linkedEntityIds: string[];
  mapId?: string;
  mapX?: number;
  mapY?: number;
  wikiEntityId?: string; // Optional link to full wiki entry
}

// ==========================================
// CARTOGRAPHY & PROCEDURAL MAP ENGINE TYPES
// ==========================================

export type MapMode = 'procedural' | 'raster' | 'cosmological';

export type ProceduralTemplateType =
  | 'continents'
  | 'archipelago'
  | 'pangaea'
  | 'shattered_sea'
  | 'inland_sea';

export type BiomeType =
  | 'deep_ocean'
  | 'coastal_sea'
  | 'ice_sheet'
  | 'tundra'
  | 'taiga'
  | 'temperate_forest'
  | 'grassland'
  | 'savanna'
  | 'desert'
  | 'tropical_rainforest'
  | 'wetland'
  | 'alpine_peak'
  | 'volcanic_wastes';

export interface VoronoiCellData {
  id: number;
  x: number;
  y: number;
  polygon: [number, number][];
  neighbors: number[];
  elevation: number; // 0..100 (< 28 is water)
  moisture: number; // 0..100
  temperature: number; // -20..40 C
  biome: BiomeType;
  stateId?: string;
  riverId?: string;
}

export interface ProceduralRiver {
  id: string;
  name: string;
  points: [number, number][];
  width: number;
  linkedEntityId?: string;
}

export interface ProceduralBurg {
  id: string;
  name: string;
  cellId: number;
  x: number;
  y: number;
  isCapital: boolean;
  population: number;
  stateId: string;
  culture: string;
  port: boolean;
  linkedEntityId?: string;
}

export interface ProceduralState {
  id: string;
  name: string;
  color: string;
  capitalBurgId: string;
  culture: string;
  linkedEntityId?: string;
}

export interface ProceduralMapData {
  seed: number;
  template: ProceduralTemplateType;
  cellCount: number;
  seaLevel: number;
  cells: VoronoiCellData[];
  rivers: ProceduralRiver[];
  burgs: ProceduralBurg[];
  states: ProceduralState[];
}

export interface MapMarker {
  id: string;
  name: string;
  icon: 'castle' | 'city' | 'ruin' | 'battle' | 'portal' | 'mountain' | 'character' | 'artifact' | 'temple' | 'port';
  color: string;
  x: number; // 0-1000
  y: number; // 0-1000
  linkedEntityId?: string;
  validFromTick?: number;
  validToTick?: number;
  notes?: string;
}

export interface MapPath {
  id: string;
  name: string;
  style: 'trade_route' | 'imperial_road' | 'army_march' | 'character_journey' | 'sea_lane' | 'ley_line';
  color: string;
  points: [number, number][]; // Array of [x, y] in 0-1000 space
  dashed?: boolean;
  animated?: boolean;
  linkedEntityId?: string;
  validFromTick?: number;
  validToTick?: number;
}

export interface MapZoneTemporalSnapshot {
  fromTick: number;
  toTick?: number;
  points: [number, number][];
  labelOverride?: string;
}

export interface MapZone {
  id: string;
  name: string;
  color: string;
  opacity: number;
  borderStyle: 'solid' | 'dashed' | 'dotted';
  points: [number, number][]; // Default polygon vertices in 0-1000 space
  temporalSnapshots?: MapZoneTemporalSnapshot[]; // Allows empire borders to shift over time!
  linkedEntityId?: string;
  validFromTick?: number;
  validToTick?: number;
}

export interface MapLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  rotation?: number;
  style: 'empire' | 'region' | 'ocean' | 'mountain_range' | 'note';
  color: string;
}

export interface MapLayerVisibility {
  biomes: boolean;
  elevation: boolean;
  rivers: boolean;
  politicalStates: boolean;
  zones: boolean;
  paths: boolean;
  markers: boolean;
  burgs: boolean;
  entityPositions: boolean;
  labels: boolean;
  grid: boolean;
}

export interface WorldMap {
  id: string;
  projectId: string;
  worldId: string;
  name: string;
  mode: MapMode;
  summary: string;
  scaleUnit: string; // e.g., "miles", "km", "lightyears"
  totalWidthUnits: number; // e.g. 1000px = 2500 miles
  rasterImageUrl?: string; // Custom data URL or preset SVG/canvas style
  proceduralData?: ProceduralMapData;
  markers: MapMarker[];
  paths: MapPath[];
  zones: MapZone[];
  labels: MapLabel[];
}

// ==========================================
// STORY STUDIO TYPES
// ==========================================

export interface StoryScene {
  id: string;
  chapterId: string;
  title: string;
  order: number;
  summary: string;
  contentMd: string;
  status: 'outline' | 'draft' | 'revised' | 'final';
  povEntityId?: string;
  participatingEntityIds: string[]; // Characters, items, factions in scene
  startTick: number;
  endTick?: number;
  mapId?: string;
  locationX?: number;
  locationY?: number;
  locationEntityId?: string;
  wordCountGoal?: number;
}

export interface StoryChapter {
  id: string;
  storyId: string;
  title: string;
  order: number;
  synopsis: string;
  scenes: StoryScene[];
}

export interface Story {
  id: string;
  projectId: string;
  worldId: string | null;
  title: string;
  subtitle: string;
  synopsis: string;
  status: 'planning' | 'drafting' | 'editing' | 'complete';
  protagonistEntityIds: string[];
  chapters: StoryChapter[];
  updatedAt: string;
}

// ==========================================
// AI COPILOT & BYOK TYPES
// ==========================================

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'local_synthesizer';

export interface AISettings {
  activeProvider: AIProvider;
  geminiApiKey: string;
  geminiModel: string;
  openaiApiKey: string;
  openaiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  includeGraphNeighbors: boolean;
  includeTemporalContext: boolean;
  includeSpatialContext: boolean;
}

export interface AIProposedAction {
  id: string;
  type: 'create_entity' | 'update_entity' | 'create_timeline_event' | 'create_story_scene';
  title: string;
  description: string;
  payload: Record<string, unknown>;
  applied?: boolean;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  contextSummary?: string[];
  proposals?: AIProposedAction[];
}

// ==========================================
// PROJECT CONTAINER
// ==========================================

export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  genre: string;
  activeWorldId: string;
  activeCalendarId: string;
  currentTick: number; // The live Spatio-Temporal Timeline Cursor!
  worlds: World[];
  worldConnections: WorldConnection[];
  calendars: CustomCalendar[];
  templates: Template[];
  entities: Entity[];
  relations: EntityRelation[];
  timelineEvents: TimelineEvent[];
  maps: WorldMap[];
  stories: Story[];
  updatedAt: string;
}

export type ActiveModule =
  | 'dashboard'
  | 'wiki'
  | 'graph'
  | 'maps'
  | 'timeline'
  | 'stories'
  | 'cosmology'
  | 'templates';

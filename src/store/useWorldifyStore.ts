import { create } from 'zustand';
import {
  ActiveModule,
  AIMessage,
  AIProposedAction,
  AISettings,
  CustomCalendar,
  Entity,
  EntityCategory,
  EntityRelation,
  EntitySpatialKeyframe,
  MapLabel,
  MapMarker,
  MapPath,
  MapZone,
  ProceduralBurg,
  ProceduralState,
  ProceduralTemplateType,
  Project,
  Story,
  StoryChapter,
  StoryScene,
  Template,
  TimelineEvent,
  World,
  WorldConnection,
  WorldMap,
  BundledVault,
} from '../types/worldify';
import { createSeedProjects } from '../data/seedProjects';
import { generateProceduralMap } from '../utils/proceduralMapGenerator';

const STORAGE_KEY = 'worldify_vault_v1';
const AI_SETTINGS_KEY = 'worldify_ai_settings_v1';
const ACTIVE_PROJECT_KEY = 'worldify_active_project_v1';

function readActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
}

function saveActiveProjectId(id: string) {
  try {
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  } catch {
    // ignore
  }
}

const DEFAULT_AI_SETTINGS: AISettings = {
  activeProvider: 'local_synthesizer',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  anthropicApiKey: '',
  anthropicModel: 'claude-3-5-sonnet-latest',
  includeGraphNeighbors: true,
  includeTemporalContext: true,
  includeSpatialContext: true,
};

function loadInitialProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load Worldify vault from localStorage, falling back to seed:', e);
  }
  const seeded = createSeedProjects();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  } catch {
    // ignore quota errors
  }
  return seeded;
}

function loadInitialAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_AI_SETTINGS;
}

function saveProjectsToStorage(projects: Project[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn('Could not persist projects to localStorage:', e);
  }
}

export interface WorldifyStoreState {
  projects: Project[];
  activeProjectId: string;
  activeModule: ActiveModule;
  selectedEntityId: string | null;
  selectedMapId: string | null;
  selectedStoryId: string | null;
  selectedSceneId: string | null;
  isAICopilotOpen: boolean;
  isQuickSearchOpen: boolean;
  aiSettings: AISettings;
  aiMessages: AIMessage[];

  // Navigation & UI actions
  setActiveModule: (module: ActiveModule) => void;
  setActiveProject: (projectId: string) => void;
  setActiveWorld: (worldId: string) => void;
  selectEntity: (entityId: string | null, switchToWiki?: boolean) => void;
  selectMap: (mapId: string | null, switchToMaps?: boolean) => void;
  selectStoryScene: (storyId: string, sceneId: string) => void;
  toggleAICopilot: (open?: boolean) => void;
  toggleQuickSearch: (open?: boolean) => void;

  // Spatio-Temporal Cursor
  setCurrentTick: (tick: number) => void;
  stepCurrentTick: (deltaDays: number) => void;

  // Project & World CRUD
  createProject: (name: string, genre: string, tagline: string, description: string) => void;
  addWorld: (world: Omit<World, 'id' | 'projectId'>) => void;
  updateWorld: (worldId: string, patch: Partial<World>) => void;
  addWorldConnection: (conn: Omit<WorldConnection, 'id' | 'projectId'>) => void;
  deleteWorldConnection: (connId: string) => void;

  // Wiki Entity, Template & Relation CRUD
  createEntity: (partial: {
    title: string;
    category: EntityCategory;
    templateId?: string;
    worldId?: string | null;
    summary?: string;
    contentMd?: string;
    tags?: string[];
    templateValues?: Record<string, string | number | string[]>;
    lifecycleStartTick?: number;
    lifecycleEndTick?: number;
  }) => Entity;
  updateEntity: (entityId: string, patch: Partial<Entity>) => void;
  deleteEntity: (entityId: string) => void;
  addEntitySpatialKeyframe: (entityId: string, kf: Omit<EntitySpatialKeyframe, 'id'>) => void;
  deleteEntitySpatialKeyframe: (entityId: string, keyframeId: string) => void;
  addRelation: (rel: Omit<EntityRelation, 'id' | 'projectId'>) => void;
  deleteRelation: (relId: string) => void;
  createTemplate: (tpl: Omit<Template, 'id' | 'projectId'>) => void;
  updateTemplate: (templateId: string, patch: Partial<Template>) => void;

  // Map & Cartography Actions
  createMap: (partial: {
    name: string;
    worldId: string;
    mode: WorldMap['mode'];
    summary: string;
    scaleUnit: string;
    totalWidthUnits: number;
    seed?: number;
    template?: ProceduralTemplateType;
    rasterImageUrl?: string;
  }) => WorldMap;
  regenerateProceduralMap: (
    mapId: string,
    seed: number,
    template: ProceduralTemplateType,
    cellCount?: number,
    stateCount?: number,
    seaLevel?: number
  ) => void;
  promoteBurgToEntity: (mapId: string, burg: ProceduralBurg) => Entity;
  promoteStateToEntity: (mapId: string, state: ProceduralState) => Entity;
  addMapMarker: (mapId: string, marker: Omit<MapMarker, 'id'>) => void;
  updateMapMarker: (mapId: string, markerId: string, patch: Partial<MapMarker>) => void;
  deleteMapMarker: (mapId: string, markerId: string) => void;
  addMapPath: (mapId: string, path: Omit<MapPath, 'id'>) => void;
  deleteMapPath: (mapId: string, pathId: string) => void;
  addMapZone: (mapId: string, zone: Omit<MapZone, 'id'>) => void;
  deleteMapZone: (mapId: string, zoneId: string) => void;
  addMapLabel: (mapId: string, label: Omit<MapLabel, 'id'>) => void;
  deleteMapLabel: (mapId: string, labelId: string) => void;

  // Calendar & Timeline Actions
  updateCalendar: (calendarId: string, patch: Partial<CustomCalendar>) => void;
  addTimelineEvent: (evt: Omit<TimelineEvent, 'id' | 'projectId' | 'calendarId'>) => TimelineEvent;
  updateTimelineEvent: (eventId: string, patch: Partial<TimelineEvent>) => void;
  deleteTimelineEvent: (eventId: string) => void;

  // Story Studio Actions
  createStory: (title: string, subtitle: string, synopsis: string) => Story;
  addStoryChapter: (storyId: string, title: string, synopsis: string) => StoryChapter;
  addStoryScene: (
    storyId: string,
    chapterId: string,
    partial: Partial<StoryScene> & { title: string }
  ) => StoryScene;
  updateStoryScene: (storyId: string, chapterId: string, sceneId: string, patch: Partial<StoryScene>) => void;
  deleteStoryScene: (storyId: string, chapterId: string, sceneId: string) => void;

  // AI Actions
  updateAISettings: (patch: Partial<AISettings>) => void;
  addAIMessage: (msg: Omit<AIMessage, 'id' | 'timestamp'>) => void;
  applyAIProposal: (messageId: string, proposalId: string) => void;
  clearAIChat: () => void;

  // Vault Import/Export
  /** Adds the given projects, replacing any with the same id. Other projects are kept. */
  importProjectVault: (projects: Project[]) => void;
  /** Newer imports of bundled vaults that the user can apply, keyed by project id. */
  vaultUpdates: Record<string, BundledVault>;
  setVaultUpdates: (updates: Record<string, BundledVault>) => void;
  resetVaultToDemo: () => void;
}

export const useWorldifyStore = create<WorldifyStoreState>((set, get) => {
  const initialProjects = loadInitialProjects();
  const savedActiveId = readActiveProjectId();
  const firstProj = initialProjects.find((p) => p.id === savedActiveId) || initialProjects[0];

  return {
    projects: initialProjects,
    activeProjectId: firstProj.id,
    activeModule: 'dashboard',
    selectedEntityId: firstProj.entities[0]?.id || null,
    selectedMapId: firstProj.maps[0]?.id || null,
    selectedStoryId: firstProj.stories[0]?.id || null,
    selectedSceneId: firstProj.stories[0]?.chapters[0]?.scenes[0]?.id || null,
    isAICopilotOpen: false,
    isQuickSearchOpen: false,
    aiSettings: loadInitialAISettings(),
    aiMessages: [
      {
        id: 'ai-welcome',
        role: 'assistant',
        content:
          'Welcome to **Worldify AI Lore Copilot**! I have full context over your active project, Knowledge Graph connections, Custom Calendar timestamps, and Map geography.\n\nAsk me to brainstorm lore, audit story continuity, expand wiki entries, or generate new characters, factions, and timeline events.',
        timestamp: new Date().toISOString(),
      },
    ],

    setActiveModule: (module) => set({ activeModule: module }),

    setActiveProject: (projectId) => {
      const proj = get().projects.find((p) => p.id === projectId);
      if (!proj) return;
      saveActiveProjectId(projectId);
      set({
        activeProjectId: projectId,
        selectedEntityId: proj.entities[0]?.id || null,
        selectedMapId: proj.maps[0]?.id || null,
        selectedStoryId: proj.stories[0]?.id || null,
        selectedSceneId: proj.stories[0]?.chapters[0]?.scenes[0]?.id || null,
      });
    },

    setActiveWorld: (worldId) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId ? { ...p, activeWorldId: worldId } : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    selectEntity: (entityId, switchToWiki = false) =>
      set((state) => ({
        selectedEntityId: entityId,
        activeModule: switchToWiki ? 'wiki' : state.activeModule,
      })),

    selectMap: (mapId, switchToMaps = false) =>
      set((state) => ({
        selectedMapId: mapId,
        activeModule: switchToMaps ? 'maps' : state.activeModule,
      })),

    selectStoryScene: (storyId, sceneId) =>
      set({
        selectedStoryId: storyId,
        selectedSceneId: sceneId,
        activeModule: 'stories',
      }),

    toggleAICopilot: (open) =>
      set((state) => ({
        isAICopilotOpen: open !== undefined ? open : !state.isAICopilotOpen,
      })),

    toggleQuickSearch: (open) =>
      set((state) => ({
        isQuickSearchOpen: open !== undefined ? open : !state.isQuickSearchOpen,
      })),

    setCurrentTick: (tick) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId ? { ...p, currentTick: Math.round(tick) } : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    stepCurrentTick: (deltaDays) => {
      const state = get();
      const proj = state.projects.find((p) => p.id === state.activeProjectId);
      if (!proj) return;
      state.setCurrentTick(proj.currentTick + deltaDays);
    },

    createProject: (name, genre, tagline, description) => {
      const projId = `proj-${Date.now()}`;
      const worldId = `world-${Date.now()}`;
      const calId = `cal-${Date.now()}`;
      const mapId = `map-${Date.now()}`;
      const seedProjects = createSeedProjects();
      const defaultTemplates = seedProjects[0].templates.map((t) => ({
        ...t,
        id: `${t.id}-${Date.now()}`,
        projectId: projId,
      }));

      const newProj: Project = {
        id: projId,
        name,
        genre,
        tagline,
        description,
        activeWorldId: worldId,
        activeCalendarId: calId,
        currentTick: 36000,
        updatedAt: new Date().toISOString(),
        worlds: [
          {
            id: worldId,
            projectId: projId,
            parentWorldId: null,
            name: `${name} Prime`,
            type: 'planet',
            summary: `Primary world of ${name}.`,
            color: '#f59e0b',
            cosmologyX: 500,
            cosmologyY: 500,
            orbitRadius: 0,
            magicOrPhysicsRules: 'Standard physical and arcane laws.',
          },
        ],
        worldConnections: [],
        calendars: [
          {
            ...seedProjects[0].calendars[0],
            id: calId,
            projectId: projId,
            name: `${name} Standard Reckoning`,
          },
        ],
        templates: defaultTemplates,
        entities: [],
        relations: [],
        timelineEvents: [],
        maps: [
          {
            id: mapId,
            projectId: projId,
            worldId,
            name: `World Atlas of ${name}`,
            mode: 'procedural',
            summary: 'Procedurally generated continental survey.',
            scaleUnit: 'miles',
            totalWidthUnits: 2500,
            proceduralData: generateProceduralMap(Math.floor(Math.random() * 9000) + 1000, 'continents'),
            markers: [],
            paths: [],
            zones: [],
            labels: [],
          },
        ],
        stories: [],
      };

      set((state) => {
        const projects = [...state.projects, newProj];
        saveProjectsToStorage(projects);
        return {
          projects,
          activeProjectId: projId,
          selectedEntityId: null,
          selectedMapId: mapId,
          selectedStoryId: null,
          selectedSceneId: null,
        };
      });
    },

    addWorld: (worldData) =>
      set((state) => {
        const newWorld: World = {
          ...worldData,
          id: `world-${Date.now()}`,
          projectId: state.activeProjectId,
        };
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? { ...p, worlds: [...p.worlds, newWorld], activeWorldId: newWorld.id }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    updateWorld: (worldId, patch) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                worlds: p.worlds.map((w) => (w.id === worldId ? { ...w, ...patch } : w)),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    addWorldConnection: (conn) =>
      set((state) => {
        const newConn: WorldConnection = {
          ...conn,
          id: `wconn-${Date.now()}`,
          projectId: state.activeProjectId,
        };
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? { ...p, worldConnections: [...p.worldConnections, newConn] }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    deleteWorldConnection: (connId) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? { ...p, worldConnections: p.worldConnections.filter((c) => c.id !== connId) }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    createEntity: (partial) => {
      const state = get();
      const proj = state.projects.find((p) => p.id === state.activeProjectId)!;
      const matchedTemplate =
        proj.templates.find((t) => t.id === partial.templateId) ||
        proj.templates.find((t) => t.category === partial.category) ||
        proj.templates[0];

      const slug = partial.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const defaultValues: Record<string, string | number | string[]> = {};
      if (matchedTemplate) {
        for (const f of matchedTemplate.fields) {
          if (f.defaultValue !== undefined) {
            defaultValues[f.key] = f.defaultValue;
          }
        }
      }

      const newEntity: Entity = {
        id: `ent-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        projectId: proj.id,
        worldId: partial.worldId !== undefined ? partial.worldId : proj.activeWorldId,
        templateId: matchedTemplate?.id || 'tpl-character',
        category: partial.category,
        slug: slug || `entry-${Date.now()}`,
        title: partial.title,
        subtitle: '',
        summary: partial.summary || `Canonical entry for ${partial.title}.`,
        tags: partial.tags || [partial.category],
        contentMd: partial.contentMd || matchedTemplate?.defaultMarkdown || `## Overview\n\nWrite about **${partial.title}** here.`,
        templateValues: { ...defaultValues, ...(partial.templateValues || {}) },
        customProperties: [],
        lifecycleStartTick: partial.lifecycleStartTick,
        lifecycleEndTick: partial.lifecycleEndTick,
        spatialKeyframes: [],
        temporalStates: [],
        updatedAt: new Date().toISOString(),
      };

      set((s) => {
        const projects = s.projects.map((p) =>
          p.id === s.activeProjectId ? { ...p, entities: [newEntity, ...p.entities] } : p
        );
        saveProjectsToStorage(projects);
        return { projects, selectedEntityId: newEntity.id };
      });

      return newEntity;
    },

    updateEntity: (entityId, patch) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                entities: p.entities.map((e) =>
                  e.id === entityId ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    deleteEntity: (entityId) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                entities: p.entities.filter((e) => e.id !== entityId),
                relations: p.relations.filter(
                  (r) => r.sourceEntityId !== entityId && r.targetEntityId !== entityId
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        const remaining = projects.find((p) => p.id === state.activeProjectId)?.entities || [];
        return {
          projects,
          selectedEntityId:
            state.selectedEntityId === entityId ? remaining[0]?.id || null : state.selectedEntityId,
        };
      }),

    addEntitySpatialKeyframe: (entityId, kf) =>
      set((state) => {
        const newKf: EntitySpatialKeyframe = { ...kf, id: `kf-${Date.now()}` };
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                entities: p.entities.map((e) =>
                  e.id === entityId
                    ? { ...e, spatialKeyframes: [...(e.spatialKeyframes || []), newKf] }
                    : e
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    deleteEntitySpatialKeyframe: (entityId, keyframeId) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                entities: p.entities.map((e) =>
                  e.id === entityId
                    ? {
                        ...e,
                        spatialKeyframes: (e.spatialKeyframes || []).filter(
                          (k) => k.id !== keyframeId
                        ),
                      }
                    : e
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    addRelation: (rel) =>
      set((state) => {
        const newRel: EntityRelation = {
          ...rel,
          id: `rel-${Date.now()}`,
          projectId: state.activeProjectId,
        };
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId ? { ...p, relations: [...p.relations, newRel] } : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    deleteRelation: (relId) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? { ...p, relations: p.relations.filter((r) => r.id !== relId) }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    createTemplate: (tpl) =>
      set((state) => {
        const newTpl: Template = {
          ...tpl,
          id: `tpl-${Date.now()}`,
          projectId: state.activeProjectId,
        };
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId ? { ...p, templates: [...p.templates, newTpl] } : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    updateTemplate: (templateId, patch) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                templates: p.templates.map((t) => (t.id === templateId ? { ...t, ...patch } : t)),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    createMap: (partial) => {
      const state = get();
      const mapId = `map-${Date.now()}`;
      const proceduralData =
        partial.mode === 'procedural'
          ? generateProceduralMap(
              partial.seed || Math.floor(Math.random() * 9000) + 1000,
              partial.template || 'continents'
            )
          : undefined;

      const newMap: WorldMap = {
        id: mapId,
        projectId: state.activeProjectId,
        worldId: partial.worldId,
        name: partial.name,
        mode: partial.mode,
        summary: partial.summary,
        scaleUnit: partial.scaleUnit,
        totalWidthUnits: partial.totalWidthUnits,
        rasterImageUrl: partial.rasterImageUrl,
        proceduralData,
        markers: [],
        paths: [],
        zones: [],
        labels: [],
      };

      set((s) => {
        const projects = s.projects.map((p) =>
          p.id === s.activeProjectId ? { ...p, maps: [...p.maps, newMap] } : p
        );
        saveProjectsToStorage(projects);
        return { projects, selectedMapId: mapId };
      });

      return newMap;
    },

    regenerateProceduralMap: (
      mapId,
      seed,
      template,
      cellCount = 900,
      stateCount = 6,
      seaLevel = 30
    ) =>
      set((state) => {
        const newData = generateProceduralMap(seed, template, cellCount, stateCount, seaLevel);
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) =>
                  m.id === mapId ? { ...m, proceduralData: newData } : m
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    promoteBurgToEntity: (mapId, burg) => {
      const state = get();
      const proj = state.projects.find((p) => p.id === state.activeProjectId)!;
      const map = proj.maps.find((m) => m.id === mapId);
      const cell = map?.proceduralData?.cells[burg.cellId];
      const parentState = map?.proceduralData?.states.find((st) => st.id === burg.stateId);

      const created = state.createEntity({
        title: burg.name,
        category: 'settlement',
        worldId: map?.worldId || proj.activeWorldId,
        summary: `${burg.isCapital ? 'Sovereign Capital' : 'Regional Settlement'} of ${parentState?.name || 'the realm'} (${burg.culture} culture), population ~${burg.population.toLocaleString()}.`,
        tags: ['procedural-burg', burg.isCapital ? 'capital' : 'town', burg.port ? 'port' : 'inland'],
        templateValues: {
          settlement_type: burg.isCapital ? 'Imperial Capital' : burg.port ? 'Free Port' : 'Fortress Citadel',
          population: burg.population,
          primary_export: burg.port ? 'Maritime Trade & Fish' : 'Ore, Timber & Grain',
          defense_rating: burg.isCapital ? 88 : 62,
        },
        contentMd: `## Overview\n\n**${burg.name}** is a ${burg.isCapital ? 'grand capital city' : 'thriving settlement'} located in the ${cell?.biome.replace('_', ' ') || 'heartlands'} (Elevation: ${cell?.elevation || 45}m, Temperature: ${cell?.temperature ?? 16}°C).\n\n- **Culture**: ${burg.culture}\n- **Political Realm**: ${parentState ? `[[${parentState.name}]]` : 'Independent'}\n- **Harbor Access**: ${burg.port ? 'Deep-water Maritime Port' : 'Overland Caravan Hub'}\n\n## Architecture & Local Lore\n\nPromoted directly from the Procedural Cartography Engine. Use the **AI Lore Copilot** to expand its districts, guilds, and current political intrigues!`,
      });

      // Link the burg and add a map marker
      set((s) => {
        const projects = s.projects.map((p) =>
          p.id === s.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) => {
                  if (m.id !== mapId) return m;
                  const updatedProc = m.proceduralData
                    ? {
                        ...m.proceduralData,
                        burgs: m.proceduralData.burgs.map((b) =>
                          b.id === burg.id ? { ...b, linkedEntityId: created.id } : b
                        ),
                      }
                    : undefined;
                  const newMarker: MapMarker = {
                    id: `mkr-burg-${Date.now()}`,
                    name: burg.name,
                    icon: burg.isCapital ? 'castle' : burg.port ? 'port' : 'city',
                    color: parentState?.color || '#f59e0b',
                    x: burg.x,
                    y: burg.y,
                    linkedEntityId: created.id,
                    notes: `Population: ${burg.population.toLocaleString()}`,
                  };
                  return {
                    ...m,
                    proceduralData: updatedProc,
                    markers: [...m.markers, newMarker],
                  };
                }),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      });

      return created;
    },

    promoteStateToEntity: (mapId, procState) => {
      const state = get();
      const proj = state.projects.find((p) => p.id === state.activeProjectId)!;
      const map = proj.maps.find((m) => m.id === mapId);
      const capBurg = map?.proceduralData?.burgs.find((b) => b.id === procState.capitalBurgId);

      const created = state.createEntity({
        title: procState.name,
        category: 'faction',
        worldId: map?.worldId || proj.activeWorldId,
        summary: `Sovereign realm of the ${procState.culture} culture, governed from ${capBurg?.name || 'its royal seat'}.`,
        tags: ['procedural-state', 'realm', procState.culture.toLowerCase().replace(/\s+/g, '-')],
        templateValues: {
          government_type: 'Solar Monarchy',
          motto: 'Unity Through Crown and Hearth',
          military_strength: 24000,
        },
        contentMd: `## Overview\n\n**${procState.name}** is a major territorial power of the **${procState.culture}** culture. Its seat of governance stands at ${capBurg ? `[[${capBurg.name}]]` : 'its capital citadel'}.\n\n## Geopolitics & History\n\nGenerated via the Procedural Cartography Engine.`,
      });

      set((s) => {
        const projects = s.projects.map((p) =>
          p.id === s.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) =>
                  m.id === mapId && m.proceduralData
                    ? {
                        ...m,
                        proceduralData: {
                          ...m.proceduralData,
                          states: m.proceduralData.states.map((st) =>
                            st.id === procState.id ? { ...st, linkedEntityId: created.id } : st
                          ),
                        },
                      }
                    : m
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      });

      return created;
    },

    addMapMarker: (mapId, marker) =>
      set((state) => {
        const newMarker: MapMarker = { ...marker, id: `mkr-${Date.now()}` };
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) =>
                  m.id === mapId ? { ...m, markers: [...m.markers, newMarker] } : m
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    updateMapMarker: (mapId, markerId, patch) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) =>
                  m.id === mapId
                    ? {
                        ...m,
                        markers: m.markers.map((mk) =>
                          mk.id === markerId ? { ...mk, ...patch } : mk
                        ),
                      }
                    : m
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    deleteMapMarker: (mapId, markerId) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) =>
                  m.id === mapId
                    ? { ...m, markers: m.markers.filter((mk) => mk.id !== markerId) }
                    : m
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    addMapPath: (mapId, path) =>
      set((state) => {
        const newPath: MapPath = { ...path, id: `path-${Date.now()}` };
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) =>
                  m.id === mapId ? { ...m, paths: [...m.paths, newPath] } : m
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    deleteMapPath: (mapId, pathId) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) =>
                  m.id === mapId ? { ...m, paths: m.paths.filter((pt) => pt.id !== pathId) } : m
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    addMapZone: (mapId, zone) =>
      set((state) => {
        const newZone: MapZone = { ...zone, id: `zone-${Date.now()}` };
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) =>
                  m.id === mapId ? { ...m, zones: [...m.zones, newZone] } : m
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    deleteMapZone: (mapId, zoneId) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) =>
                  m.id === mapId ? { ...m, zones: m.zones.filter((z) => z.id !== zoneId) } : m
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    addMapLabel: (mapId, label) =>
      set((state) => {
        const newLabel: MapLabel = { ...label, id: `lbl-${Date.now()}` };
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) =>
                  m.id === mapId ? { ...m, labels: [...m.labels, newLabel] } : m
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    deleteMapLabel: (mapId, labelId) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                maps: p.maps.map((m) =>
                  m.id === mapId ? { ...m, labels: m.labels.filter((l) => l.id !== labelId) } : m
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    updateCalendar: (calendarId, patch) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                calendars: p.calendars.map((c) => (c.id === calendarId ? { ...c, ...patch } : c)),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    addTimelineEvent: (evt) => {
      const state = get();
      const proj = state.projects.find((p) => p.id === state.activeProjectId)!;
      const newEvt: TimelineEvent = {
        ...evt,
        id: `evt-${Date.now()}`,
        projectId: proj.id,
        calendarId: proj.activeCalendarId,
      };
      set((s) => {
        const projects = s.projects.map((p) =>
          p.id === s.activeProjectId
            ? {
                ...p,
                timelineEvents: [...p.timelineEvents, newEvt].sort(
                  (a, b) => a.startTick - b.startTick
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      });
      return newEvt;
    },

    updateTimelineEvent: (eventId, patch) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                timelineEvents: p.timelineEvents.map((e) =>
                  e.id === eventId ? { ...e, ...patch } : e
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    deleteTimelineEvent: (eventId) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? { ...p, timelineEvents: p.timelineEvents.filter((e) => e.id !== eventId) }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    createStory: (title, subtitle, synopsis) => {
      const state = get();
      const proj = state.projects.find((p) => p.id === state.activeProjectId)!;
      const storyId = `story-${Date.now()}`;
      const chapId = `chap-${Date.now()}`;
      const sceneId = `scn-${Date.now()}`;

      const newStory: Story = {
        id: storyId,
        projectId: proj.id,
        worldId: proj.activeWorldId,
        title,
        subtitle,
        synopsis,
        status: 'drafting',
        protagonistEntityIds: [],
        updatedAt: new Date().toISOString(),
        chapters: [
          {
            id: chapId,
            storyId,
            title: 'Chapter I: Opening Gambit',
            order: 1,
            synopsis: 'Opening chapter.',
            scenes: [
              {
                id: sceneId,
                chapterId: chapId,
                title: 'Scene 1: The Awakening',
                order: 1,
                summary: 'Opening scene set in the world.',
                contentMd: `Write your scene here. Link any entity using \`[[Entity Name]]\`.`,
                status: 'draft',
                participatingEntityIds: [],
                startTick: proj.currentTick,
                mapId: proj.maps[0]?.id,
                locationX: 500,
                locationY: 500,
                wordCountGoal: 1500,
              },
            ],
          },
        ],
      };

      set((s) => {
        const projects = s.projects.map((p) =>
          p.id === s.activeProjectId ? { ...p, stories: [...p.stories, newStory] } : p
        );
        saveProjectsToStorage(projects);
        return {
          projects,
          selectedStoryId: storyId,
          selectedSceneId: sceneId,
        };
      });

      return newStory;
    },

    addStoryChapter: (storyId, title, synopsis) => {
      const chapId = `chap-${Date.now()}`;
      const newChapter: StoryChapter = {
        id: chapId,
        storyId,
        title,
        order: 99,
        synopsis,
        scenes: [],
      };
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                stories: p.stories.map((st) =>
                  st.id === storyId
                    ? {
                        ...st,
                        chapters: [
                          ...st.chapters,
                          { ...newChapter, order: st.chapters.length + 1 },
                        ],
                      }
                    : st
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      });
      return newChapter;
    },

    addStoryScene: (storyId, chapterId, partial) => {
      const state = get();
      const proj = state.projects.find((p) => p.id === state.activeProjectId)!;
      const newScene: StoryScene = {
        id: `scn-${Date.now()}`,
        chapterId,
        title: partial.title,
        order: partial.order || 1,
        summary: partial.summary || 'Scene summary...',
        contentMd: partial.contentMd || `Begin writing **${partial.title}**...`,
        status: partial.status || 'draft',
        povEntityId: partial.povEntityId,
        participatingEntityIds: partial.participatingEntityIds || [],
        startTick: partial.startTick ?? proj.currentTick,
        endTick: partial.endTick,
        mapId: partial.mapId || proj.maps[0]?.id,
        locationX: partial.locationX ?? 500,
        locationY: partial.locationY ?? 500,
        locationEntityId: partial.locationEntityId,
        wordCountGoal: partial.wordCountGoal || 1500,
      };

      set((s) => {
        const projects = s.projects.map((p) =>
          p.id === s.activeProjectId
            ? {
                ...p,
                stories: p.stories.map((st) =>
                  st.id === storyId
                    ? {
                        ...st,
                        chapters: st.chapters.map((ch) =>
                          ch.id === chapterId
                            ? {
                                ...ch,
                                scenes: [
                                  ...ch.scenes,
                                  { ...newScene, order: ch.scenes.length + 1 },
                                ],
                              }
                            : ch
                        ),
                      }
                    : st
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return {
          projects,
          selectedStoryId: storyId,
          selectedSceneId: newScene.id,
        };
      });

      return newScene;
    },

    updateStoryScene: (storyId, chapterId, sceneId, patch) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                stories: p.stories.map((st) =>
                  st.id === storyId
                    ? {
                        ...st,
                        chapters: st.chapters.map((ch) =>
                          ch.id === chapterId
                            ? {
                                ...ch,
                                scenes: ch.scenes.map((sc) =>
                                  sc.id === sceneId ? { ...sc, ...patch } : sc
                                ),
                              }
                            : ch
                        ),
                      }
                    : st
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    deleteStoryScene: (storyId, chapterId, sceneId) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === state.activeProjectId
            ? {
                ...p,
                stories: p.stories.map((st) =>
                  st.id === storyId
                    ? {
                        ...st,
                        chapters: st.chapters.map((ch) =>
                          ch.id === chapterId
                            ? { ...ch, scenes: ch.scenes.filter((sc) => sc.id !== sceneId) }
                            : ch
                        ),
                      }
                    : st
                ),
              }
            : p
        );
        saveProjectsToStorage(projects);
        return { projects };
      }),

    updateAISettings: (patch) =>
      set((state) => {
        const next = { ...state.aiSettings, ...patch };
        try {
          localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return { aiSettings: next };
      }),

    addAIMessage: (msg) =>
      set((state) => ({
        aiMessages: [
          ...state.aiMessages,
          {
            ...msg,
            id: `aimsg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: new Date().toISOString(),
          },
        ],
      })),

    applyAIProposal: (messageId, proposalId) => {
      const state = get();
      const msg = state.aiMessages.find((m) => m.id === messageId);
      const proposal = msg?.proposals?.find((p) => p.id === proposalId);
      if (!proposal || proposal.applied) return;

      if (proposal.type === 'create_entity') {
        const p = proposal.payload as {
          title: string;
          category: EntityCategory;
          summary: string;
          contentMd: string;
          tags?: string[];
        };
        state.createEntity({
          title: p.title,
          category: p.category || 'character',
          summary: p.summary,
          contentMd: p.contentMd,
          tags: p.tags || ['ai-generated'],
        });
      } else if (proposal.type === 'update_entity') {
        const p = proposal.payload as { entityId: string; contentMd: string; summary?: string };
        state.updateEntity(p.entityId, {
          contentMd: p.contentMd,
          ...(p.summary ? { summary: p.summary } : {}),
        });
      } else if (proposal.type === 'create_timeline_event') {
        const p = proposal.payload as {
          title: string;
          summary: string;
          category: TimelineEvent['category'];
          startTick: number;
          importance: 1 | 2 | 3;
          linkedEntityIds: string[];
        };
        state.addTimelineEvent({
          worldId: null,
          title: p.title,
          summary: p.summary,
          category: p.category || 'political_treaty',
          startTick: p.startTick,
          importance: p.importance || 2,
          linkedEntityIds: p.linkedEntityIds || [],
        });
      }

      set((s) => ({
        aiMessages: s.aiMessages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                proposals: m.proposals?.map((pr) =>
                  pr.id === proposalId ? { ...pr, applied: true } : pr
                ),
              }
            : m
        ),
      }));
    },

    clearAIChat: () =>
      set({
        aiMessages: [
          {
            id: `ai-reset-${Date.now()}`,
            role: 'assistant',
            content: 'Lore Copilot context refreshed. How can I help shape your world?',
            timestamp: new Date().toISOString(),
          },
        ],
      }),

    importProjectVault: (incoming) => {
      if (!Array.isArray(incoming) || incoming.length === 0) return;
      const incomingIds = new Set(incoming.map((p) => p.id));
      const kept = get().projects.filter((p) => !incomingIds.has(p.id));
      const projects = [...kept, ...incoming];
      saveProjectsToStorage(projects);
      const first = incoming[0];
      saveActiveProjectId(first.id);
      const updates = { ...get().vaultUpdates };
      incoming.forEach((p) => delete updates[p.id]);
      set({
        projects,
        vaultUpdates: updates,
        activeProjectId: first.id,
        selectedEntityId: first.entities[0]?.id || null,
        selectedMapId: first.maps[0]?.id || null,
        selectedStoryId: first.stories[0]?.id || null,
        selectedSceneId: first.stories[0]?.chapters[0]?.scenes[0]?.id || null,
      });
    },

    vaultUpdates: {},
    setVaultUpdates: (updates) => set({ vaultUpdates: updates }),

    resetVaultToDemo: () => {
      // Keep projects imported from external vaults; only the demo worlds are reset.
      const imported = get().projects.filter((p) => p.importedFrom);
      const seeded = [...createSeedProjects(), ...imported];
      saveProjectsToStorage(seeded);
      const first = seeded[0];
      set({
        projects: seeded,
        activeProjectId: first.id,
        selectedEntityId: first.entities[0]?.id || null,
        selectedMapId: first.maps[0]?.id || null,
        selectedStoryId: first.stories[0]?.id || null,
        selectedSceneId: first.stories[0]?.chapters[0]?.scenes[0]?.id || null,
      });
    },
  };
});

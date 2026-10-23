/**
 * IndexedDB Storage Engine for Worldify Living World.
 *
 * Keeps all simulation branches, events, spatial/temporal overlays, character minds,
 * subjective memory banks, proposals, and LLM agent telemetry in IndexedDB so the
 * canonical project JSON in localStorage stays lean. Only canonized (merged) records
 * are written back to the project JSON.
 */
import {
  AgentRun,
  BranchOverlayRecord,
  CharacterGoal,
  CharacterInternalRelation,
  CharacterMemory,
  CharacterMind,
  CharacterTier,
  Entity,
  Project,
  SimBranch,
  SimProposal,
  TimelineEvent,
  WorldRuleEntry,
} from '../types/worldify';

const DB_NAME = 'worldify-living-world-v1';
const DB_VERSION = 1;

const STORES = {
  branches: 'branches',
  minds: 'minds',
  memories: 'memories',
  events: 'events',
  overlays: 'overlays',
  proposals: 'proposals',
  agentRuns: 'agentRuns',
  worldRules: 'worldRules',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openSimDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const storeName of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            store.createIndex('projectId', 'projectId', { unique: false });
            if (storeName !== STORES.branches && storeName !== STORES.worldRules) {
              store.createIndex('branchId', 'branchId', { unique: false });
            }
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function getAllByIndex<T>(
  storeName: string,
  indexName: string,
  key: string
): Promise<T[]> {
  try {
    const db = await openSimDb();
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const idx = tx.objectStore(storeName).index(indexName);
      const req = idx.getAll(key);
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn(`IndexedDB read failed on ${storeName}:`, e);
    return [];
  }
}

export async function putSimRecord<T extends { id: string }>(
  storeName: keyof typeof STORES,
  record: T
): Promise<void> {
  const db = await openSimDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES[storeName], 'readwrite');
    tx.objectStore(STORES[storeName]).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteSimRecord(
  storeName: keyof typeof STORES,
  id: string
): Promise<void> {
  const db = await openSimDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES[storeName], 'readwrite');
    tx.objectStore(STORES[storeName]).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface ProjectSimulationSnapshot {
  branches: SimBranch[];
  minds: CharacterMind[];
  memories: CharacterMemory[];
  events: TimelineEvent[];
  overlays: BranchOverlayRecord[];
  proposals: SimProposal[];
  agentRuns: AgentRun[];
  worldRules: WorldRuleEntry[];
}

export async function loadProjectSimulationData(
  projectId: string
): Promise<ProjectSimulationSnapshot> {
  const [branches, minds, memories, events, overlays, proposals, agentRuns, worldRules] =
    await Promise.all([
      getAllByIndex<SimBranch>(STORES.branches, 'projectId', projectId),
      getAllByIndex<CharacterMind>(STORES.minds, 'projectId', projectId),
      getAllByIndex<CharacterMemory>(STORES.memories, 'projectId', projectId),
      getAllByIndex<TimelineEvent>(STORES.events, 'projectId', projectId),
      getAllByIndex<BranchOverlayRecord>(STORES.overlays, 'projectId', projectId),
      getAllByIndex<SimProposal>(STORES.proposals, 'projectId', projectId),
      getAllByIndex<AgentRun>(STORES.agentRuns, 'projectId', projectId),
      getAllByIndex<WorldRuleEntry>(STORES.worldRules, 'projectId', projectId),
    ]);

  return {
    branches: branches.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    minds,
    memories: memories.sort((a, b) => a.tick - b.tick),
    events: events.sort((a, b) => a.startTick - b.startTick),
    overlays,
    proposals: proposals.sort((a, b) => b.tick - a.tick),
    agentRuns: agentRuns.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    worldRules,
  };
}

/**
 * Extracts initial goals and beliefs from a character's canonical wiki entry.
 */
export function buildInitialCharacterMind(
  character: Entity,
  project: Project,
  branchId: string,
  tier: CharacterTier
): CharacterMind {
  // Extract Relations for this character
  const internalRelations: CharacterInternalRelation[] = [];
  for (const r of project.relations) {
    if (r.sourceEntityId === character.id || r.targetEntityId === character.id) {
      const otherId = r.sourceEntityId === character.id ? r.targetEntityId : r.sourceEntityId;
      const other = project.entities.find((e) => e.id === otherId);
      if (!other || other.category !== 'character') continue;
      if (internalRelations.some((ir) => ir.targetEntityId === other.id)) continue;

      let trust = 20;
      let hostility = 10;
      if (r.type === 'allied_with' || r.type === 'parent_of' || r.type === 'member_of') {
        trust = 70;
        hostility = 5;
      } else if (r.type === 'rival_of') {
        trust = -65;
        hostility = 75;
      }

      internalRelations.push({
        targetEntityId: other.id,
        targetName: other.title,
        trust,
        hostility,
        debtOrBond: r.label || r.type.replace(/_/g, ' '),
      });
    }
  }

  // Build 2 initial goals based on summary / role / relations
  const rival = internalRelations.find((r) => r.hostility >= 50);
  const ally = internalRelations.find((r) => r.trust >= 50);

  const goals: CharacterGoal[] = [
    {
      id: `goal-${character.id}-1`,
      description: `Advance ${character.title}'s core ambition: ${character.subtitle || character.summary.slice(0, 70)}`,
      priority: 1,
      status: 'active',
      createdAtTick: project.currentTick,
    },
  ];

  if (rival) {
    goals.push({
      id: `goal-${character.id}-2`,
      description: `Counter the moves of rival [[${rival.targetName}]] and safeguard key interests`,
      priority: 2,
      status: 'active',
      createdAtTick: project.currentTick,
    });
  } else if (ally) {
    goals.push({
      id: `goal-${character.id}-2`,
      description: `Strengthen the alliance with [[${ally.targetName}]] against emerging threats`,
      priority: 2,
      status: 'active',
      createdAtTick: project.currentTick,
    });
  } else {
    goals.push({
      id: `goal-${character.id}-2`,
      description: `Gather intelligence and secure leverage in the current region`,
      priority: 2,
      status: 'active',
      createdAtTick: project.currentTick,
    });
  }

  const beliefs: string[] = [
    `${character.summary || character.title}`,
  ];

  return {
    id: `${branchId}:${character.id}`,
    projectId: project.id,
    branchId,
    entityId: character.id,
    tier,
    goals,
    beliefs,
    internalRelations,
    memoryBankId: `membank:${branchId}:${character.id}`,
    lastReflectedAtTick: project.currentTick,
    ticksSinceReflection: 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Parses `World.magicOrPhysicsRules` and any "World Rules / חוקי העולם" wiki page into structured rules.
 */
export function buildInitialWorldRules(project: Project): WorldRuleEntry[] {
  const rules: WorldRuleEntry[] = [];
  const primaryWorld =
    project.worlds.find((w) => w.id === project.activeWorldId) || project.worlds[0];

  if (primaryWorld?.magicOrPhysicsRules) {
    const sentences = primaryWorld.magicOrPhysicsRules
      .split(/(?<=[.!?;\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8);

    sentences.forEach((s, idx) => {
      const isHard =
        /never|cannot|impossible|forbidden|אסור|בלתי אפשרי|לעולם לא|חוק ברזל/i.test(s);
      rules.push({
        id: `wrule-${project.id}-${idx}`,
        projectId: project.id,
        title: isHard ? `Hard law #${idx + 1}` : `World principle #${idx + 1}`,
        ruleText: s,
        enforcement: isHard ? 'hard' : 'soft',
        category: /magic|קסם|spell|mana|resonance|ley/i.test(s) ? 'magic' : 'physics',
      });
    });
  }

  // Always add core mortality & spatial continuity hard rules
  rules.push(
    {
      id: `wrule-${project.id}-mortality`,
      projectId: project.id,
      title: 'Final death (no resurrection without approval)',
      ruleText: 'Characters who have died cannot speak, move, or act in later events.',
      enforcement: 'hard',
      category: 'mortality',
    },
    {
      id: `wrule-${project.id}-spatial`,
      projectId: project.id,
      title: 'Spatial continuity and travel speed',
      ruleText: 'A character cannot be in two distant places in the same tick, or cross a continent in a single day, without an explicit magic gate.',
      enforcement: 'hard',
      category: 'travel',
    }
  );

  return rules;
}

/**
 * Ensures a project has at least one active simulation branch, seeded CharacterMinds, and WorldRules.
 */
export async function ensureInitialSimulationState(
  project: Project
): Promise<ProjectSimulationSnapshot> {
  const existing = await loadProjectSimulationData(project.id);
  if (existing.branches.length > 0) {
    return existing;
  }

  const now = new Date().toISOString();
  const branchId = `branch-${project.id}-main`;

  const protagonistStoryIds = new Set(
    project.stories.flatMap((s) => s.protagonistEntityIds || [])
  );
  const characters = project.entities.filter((e) => e.category === 'character');

  // Sort characters by protagonist status + relation count + content length
  const rankedCharacters = [...characters].sort((a, b) => {
    const aProt = protagonistStoryIds.has(a.id) ? 100 : 0;
    const bProt = protagonistStoryIds.has(b.id) ? 100 : 0;
    const aRels = project.relations.filter(
      (r) => r.sourceEntityId === a.id || r.targetEntityId === a.id
    ).length;
    const bRels = project.relations.filter(
      (r) => r.sourceEntityId === b.id || r.targetEntityId === b.id
    ).length;
    return bProt + bRels * 5 + a.contentMd.length / 200 - (aProt + aRels * 5 + b.contentMd.length / 200);
  });

  const initialBranch: SimBranch = {
    id: branchId,
    projectId: project.id,
    name: 'Main branch · Alternative 1',
    description: 'The first simulation branch forked from the canon',
    parentBranchId: null,
    forkedAtTick: project.currentTick,
    currentTick: project.currentTick,
    status: 'active',
    budgetUsd: 5.0,
    spentUsd: 0,
    tickSize: '7d',
    scopeMode: 'regional',
    focusMapId: project.maps[0]?.id || null,
    focusCharacterIds: rankedCharacters.slice(0, 6).map((c) => c.id),
    resolutionLevel: 'balanced',
    minImportanceThreshold: 1,
    languageMode: 'he',
    tickCount: 0,
    tickHistory: [project.currentTick],
    createdAt: now,
    updatedAt: now,
  };

  const minds: CharacterMind[] = rankedCharacters.map((char, index) => {
    const tier: CharacterTier =
      index < 6 ? 'protagonist' : index < 18 ? 'secondary' : 'background';
    return buildInitialCharacterMind(char, project, branchId, tier);
  });

  const worldRules = buildInitialWorldRules(project);

  // Persist initial records atomically
  const db = await openSimDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      [STORES.branches, STORES.minds, STORES.worldRules],
      'readwrite'
    );
    tx.objectStore(STORES.branches).put(initialBranch);
    for (const m of minds) tx.objectStore(STORES.minds).put(m);
    for (const r of worldRules) tx.objectStore(STORES.worldRules).put(r);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return {
    branches: [initialBranch],
    minds,
    memories: [],
    events: [],
    overlays: [],
    proposals: [],
    agentRuns: [],
    worldRules,
  };
}

export interface AtomicTickCommitBundle {
  branch: SimBranch;
  newEvents: TimelineEvent[];
  newOverlays: BranchOverlayRecord[];
  updatedMinds: CharacterMind[];
  newMemories: CharacterMemory[];
  newProposals: SimProposal[];
  newAgentRuns: AgentRun[];
}

/**
 * Commits an entire tick's output atomically to IndexedDB.
 * Either all records of the tick are written, or none are.
 */
export async function commitTickBundleAtomically(
  bundle: AtomicTickCommitBundle
): Promise<void> {
  const db = await openSimDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      [
        STORES.branches,
        STORES.events,
        STORES.overlays,
        STORES.minds,
        STORES.memories,
        STORES.proposals,
        STORES.agentRuns,
      ],
      'readwrite'
    );

    tx.objectStore(STORES.branches).put(bundle.branch);
    for (const ev of bundle.newEvents) tx.objectStore(STORES.events).put(ev);
    for (const ov of bundle.newOverlays) tx.objectStore(STORES.overlays).put(ov);
    for (const m of bundle.updatedMinds) tx.objectStore(STORES.minds).put(m);
    for (const mem of bundle.newMemories) tx.objectStore(STORES.memories).put(mem);
    for (const prop of bundle.newProposals) tx.objectStore(STORES.proposals).put(prop);
    for (const run of bundle.newAgentRuns) tx.objectStore(STORES.agentRuns).put(run);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Rolls back a branch by one tick ("Undo tick"), removing all events, overlays, memories,
 * and proposals created after the previous tick in `branch.tickHistory`.
 */
export async function rollbackBranchLastTick(
  branch: SimBranch,
  snapshot: ProjectSimulationSnapshot
): Promise<SimBranch | null> {
  if (branch.tickHistory.length <= 1) return null;

  const newHistory = branch.tickHistory.slice(0, -1);
  const targetTick = newHistory[newHistory.length - 1];

  const eventsToRemove = snapshot.events.filter(
    (e) => e.branchId === branch.id && e.startTick > targetTick
  );
  const overlaysToRemove = snapshot.overlays.filter(
    (o) => o.branchId === branch.id && o.tick > targetTick
  );
  const memoriesToRemove = snapshot.memories.filter(
    (m) => m.branchId === branch.id && m.tick > targetTick
  );
  const proposalsToRemove = snapshot.proposals.filter(
    (p) => p.branchId === branch.id && p.tick > targetTick
  );

  const updatedBranch: SimBranch = {
    ...branch,
    currentTick: targetTick,
    tickCount: Math.max(0, branch.tickCount - 1),
    tickHistory: newHistory,
    updatedAt: new Date().toISOString(),
  };

  const db = await openSimDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      [
        STORES.branches,
        STORES.events,
        STORES.overlays,
        STORES.memories,
        STORES.proposals,
      ],
      'readwrite'
    );

    tx.objectStore(STORES.branches).put(updatedBranch);
    for (const e of eventsToRemove) tx.objectStore(STORES.events).delete(e.id);
    for (const o of overlaysToRemove) tx.objectStore(STORES.overlays).delete(o.id);
    for (const m of memoriesToRemove) tx.objectStore(STORES.memories).delete(m.id);
    for (const p of proposalsToRemove) tx.objectStore(STORES.proposals).delete(p.id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return updatedBranch;
}

/**
 * Forks a new SimBranch from either Canon (`parentBranch === null`) or an existing branch at `forkTick`,
 * cloning the CharacterMinds and Memories up to `forkTick`.
 */
export async function forkSimulationBranch(
  project: Project,
  parentBranch: SimBranch | null,
  forkTick: number,
  name: string,
  description: string,
  snapshot: ProjectSimulationSnapshot
): Promise<SimBranch> {
  const now = new Date().toISOString();
  const newBranchId = `branch-${project.id}-${Date.now().toString(36)}`;

  const newBranch: SimBranch = {
    id: newBranchId,
    projectId: project.id,
    name,
    description,
    parentBranchId: parentBranch ? parentBranch.id : null,
    forkedAtTick: forkTick,
    currentTick: forkTick,
    status: 'active',
    budgetUsd: parentBranch ? parentBranch.budgetUsd : 5.0,
    spentUsd: 0,
    tickSize: parentBranch ? parentBranch.tickSize : '7d',
    scopeMode: parentBranch ? parentBranch.scopeMode : 'regional',
    focusMapId: parentBranch ? parentBranch.focusMapId : project.maps[0]?.id || null,
    focusLocationEntityId: parentBranch?.focusLocationEntityId || null,
    focusCharacterIds: parentBranch?.focusCharacterIds || [],
    resolutionLevel: parentBranch ? parentBranch.resolutionLevel : 'balanced',
    minImportanceThreshold: parentBranch?.minImportanceThreshold ?? 1,
    languageMode: parentBranch ? parentBranch.languageMode : 'he',
    tickCount: 0,
    tickHistory: [forkTick],
    createdAt: now,
    updatedAt: now,
  };

  // Clone minds from parent branch (or build fresh from Canon)
  const sourceMinds = parentBranch
    ? snapshot.minds.filter((m) => m.branchId === parentBranch.id)
    : [];

  const clonedMinds: CharacterMind[] =
    sourceMinds.length > 0
      ? sourceMinds.map((m) => ({
          ...m,
          id: `${newBranchId}:${m.entityId}`,
          branchId: newBranchId,
          memoryBankId: `membank:${newBranchId}:${m.entityId}`,
          updatedAt: now,
        }))
      : project.entities
          .filter((e) => e.category === 'character')
          .map((c, idx) =>
            buildInitialCharacterMind(
              c,
              project,
              newBranchId,
              idx < 6 ? 'protagonist' : idx < 18 ? 'secondary' : 'background'
            )
          );

  // Clone memories from parent branch up to forkTick
  const clonedMemories: CharacterMemory[] = parentBranch
    ? snapshot.memories
        .filter((mem) => mem.branchId === parentBranch.id && mem.tick <= forkTick)
        .map((mem) => ({
          ...mem,
          id: `mem-${newBranchId}-${Math.random().toString(36).slice(2, 9)}`,
          branchId: newBranchId,
        }))
    : [];

  const db = await openSimDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      [STORES.branches, STORES.minds, STORES.memories],
      'readwrite'
    );
    tx.objectStore(STORES.branches).put(newBranch);
    for (const m of clonedMinds) tx.objectStore(STORES.minds).put(m);
    for (const mem of clonedMemories) tx.objectStore(STORES.memories).put(mem);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return newBranch;
}

/**
 * Generative Agents-style Memory Retrieval:
 * Scores memories by Recency + Importance + Relevance (shared participants, location, goal keywords).
 */
export function retrieveRelevantMemories(
  allCharacterMemories: CharacterMemory[],
  currentTick: number,
  currentLocationName: string | undefined,
  nearbyEntityIds: string[],
  activeGoals: CharacterGoal[],
  limit: number = 8
): CharacterMemory[] {
  if (allCharacterMemories.length === 0) return [];

  const goalKeywords = activeGoals
    .flatMap((g) => g.description.toLowerCase().split(/\s+/))
    .filter((w) => w.length >= 3);

  const nearbySet = new Set(nearbyEntityIds);

  const scored = allCharacterMemories.map((mem) => {
    // 1. Recency (exponential decay over ticks)
    const elapsed = Math.max(0, currentTick - mem.tick);
    const recencyScore = Math.exp(-elapsed / 180); // Half-life ~125 days

    // 2. Importance (normalized 0.2 .. 1.0, reflections & creator whispers get a boost)
    const importanceScore =
      mem.importance / 5 +
      (mem.isReflection ? 0.35 : 0) +
      (mem.isWhisperFromCreator ? 0.5 : 0);

    // 3. Relevance (location match, participant overlap, goal keyword overlap)
    let relevanceScore = 0;
    if (
      currentLocationName &&
      mem.locationName &&
      (mem.locationName.includes(currentLocationName) ||
        currentLocationName.includes(mem.locationName))
    ) {
      relevanceScore += 0.4;
    }
    for (const pid of mem.participantIds) {
      if (nearbySet.has(pid)) relevanceScore += 0.35;
    }
    const contentLower = mem.content.toLowerCase();
    for (const kw of goalKeywords) {
      if (contentLower.includes(kw)) relevanceScore += 0.15;
    }

    const totalScore = recencyScore * 0.3 + importanceScore * 0.4 + Math.min(1, relevanceScore) * 0.3;
    return { mem, totalScore };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);
  return scored
    .slice(0, limit)
    .map((s) => s.mem)
    .sort((a, b) => a.tick - b.tick);
}

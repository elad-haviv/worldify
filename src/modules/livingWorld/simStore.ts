/**
 * Living World persistent store — IndexedDB, one database per app,
 * one object store per project so projects never see each other's sims.
 *
 * Canon stays in the project JSON (localStorage) exactly as before;
 * everything with a branchId (branches, events, intents, memories, runs,
 * proposals) lives here and can hold hundreds of MB.
 */
import {
  AgentRun,
  CharacterMemory,
  CharacterMind,
  SimBranch,
  SimEvent,
  SimIntent,
  SimProposal,
} from './types';

const DB_NAME = 'worldify-living-world';
const DB_VERSION = 1;

export type LWStoreName =
  | 'branches'
  | 'events'
  | 'intents'
  | 'minds'
  | 'memories'
  | 'runs'
  | 'proposals';

const ALL_STORES: LWStoreName[] = ['branches', 'events', 'intents', 'minds', 'memories', 'runs', 'proposals'];

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const name of ALL_STORES) {
          if (!d.objectStoreNames.contains(name)) {
            const store = d.createObjectStore(name, { keyPath: 'id' });
            store.createIndex('projectId', 'projectId');
            store.createIndex('branchId', 'branchId');
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: LWStoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

const byProject = (projectId: string) => IDBKeyRange.only(projectId);
const byBranch = (branchId: string) => IDBKeyRange.only(branchId);

async function getAllByIndex<T>(store: LWStoreName, index: 'projectId' | 'branchId', value: string): Promise<T[]> {
  try {
    return (await tx<T[]>(store, 'readonly', (s) => s.index(index).getAll(value))) as T[];
  } catch {
    return [];
  }
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;

// ── Branches ───────────────────────────────────────────────

export async function listBranches(projectId: string): Promise<SimBranch[]> {
  const rows = await getAllByIndex<SimBranch>('branches', 'projectId', projectId);
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function putBranch(branch: SimBranch): Promise<void> {
  await tx('branches', 'readwrite', (s) => s.put(branch) as unknown as IDBRequest<void>);
}

export async function deleteBranch(branchId: string): Promise<void> {
  // Also cascade-delete everything that belongs to the branch.
  for (const store of ['events', 'intents', 'minds', 'memories', 'runs', 'proposals'] as LWStoreName[]) {
    const rows = await getAllByIndex<{ id: string; branchId: string }>(store, 'branchId', branchId);
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      rows.forEach((r) => s.delete(r.id));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }
  await tx('branches', 'readwrite', (s) => s.delete(branchId) as unknown as IDBRequest<void>);
}

// ── Events / intents / proposals ───────────────────────────

export async function listEvents(branchId: string): Promise<SimEvent[]> {
  const rows = await getAllByIndex<SimEvent>('events', 'branchId', branchId);
  return rows.sort((a, b) => a.tick - b.tick || a.createdAt.localeCompare(b.createdAt));
}

export async function putEvents(events: SimEvent[]): Promise<void> {
  if (events.length === 0) return;
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction('events', 'readwrite');
    const s = t.objectStore('events');
    events.forEach((e) => s.put(e));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function deleteEvents(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction('events', 'readwrite');
    const s = t.objectStore('events');
    ids.forEach((id) => s.delete(id));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function putIntents(intents: SimIntent[]): Promise<void> {
  if (intents.length === 0) return;
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction('intents', 'readwrite');
    const s = t.objectStore('intents');
    intents.forEach((i) => s.put(i));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function listIntents(branchId: string, tick: number): Promise<SimIntent[]> {
  const rows = await getAllByIndex<SimIntent>('intents', 'branchId', branchId);
  return rows.filter((i) => i.tick === tick);
}

export async function putProposals(proposals: SimProposal[]): Promise<void> {
  if (proposals.length === 0) return;
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction('proposals', 'readwrite');
    const s = t.objectStore('proposals');
    proposals.forEach((p) => s.put(p));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function listProposals(branchId: string): Promise<SimProposal[]> {
  const rows = await getAllByIndex<SimProposal>('proposals', 'branchId', branchId);
  return rows.sort((a, b) => b.tick - a.tick || b.createdAt.localeCompare(a.createdAt));
}

export async function putProposal(p: SimProposal): Promise<void> {
  await tx('proposals', 'readwrite', (s) => s.put(p) as unknown as IDBRequest<void>);
}

// ── Minds & memories ───────────────────────────────────────

export async function listMinds(branchId: string): Promise<CharacterMind[]> {
  return getAllByIndex<CharacterMind>('minds', 'branchId', branchId);
}

export async function putMind(mind: CharacterMind): Promise<void> {
  await tx('minds', 'readwrite', (s) => s.put(mind) as unknown as IDBRequest<void>);
}

export async function deleteMind(mindId: string): Promise<void> {
  await tx('minds', 'readwrite', (s) => s.delete(mindId) as unknown as IDBRequest<void>);
}

export async function listMemories(branchId: string, entityId?: string): Promise<CharacterMemory[]> {
  const rows = await getAllByIndex<CharacterMemory>('memories', 'branchId', branchId);
  const filtered = entityId ? rows.filter((m) => m.entityId === entityId) : rows;
  return filtered.sort((a, b) => b.tick - a.tick);
}

export async function deleteMemoriesOfTick(branchId: string, tick: number): Promise<void> {
  const rows = await getAllByIndex<CharacterMemory>('memories', 'branchId', branchId);
  const doomed = rows.filter((m) => m.tick === tick).map((m) => m.id);
  if (doomed.length === 0) return;
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction('memories', 'readwrite');
    const s = t.objectStore('memories');
    doomed.forEach((id) => s.delete(id));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function deleteProposalsByEventIds(branchId: string, eventIds: string[]): Promise<void> {
  const rows = await getAllByIndex<SimProposal>('proposals', 'branchId', branchId);
  const doomed = rows.filter((p) => eventIds.includes(p.eventId)).map((p) => p.id);
  if (doomed.length === 0) return;
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction('proposals', 'readwrite');
    const s = t.objectStore('proposals');
    doomed.forEach((id) => s.delete(id));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function putMemories(memories: CharacterMemory[]): Promise<void> {
  if (memories.length === 0) return;
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction('memories', 'readwrite');
    const s = t.objectStore('memories');
    memories.forEach((m) => s.put(m));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/**
 * Retrieval scoring à la Generative Agents: relevance (keyword overlap with
 * the query) × recency (exponential decay by ticks) × importance.
 */
export function scoreMemories(
  memories: CharacterMemory[],
  query: { place?: string; participants?: string[]; goals?: string[]; nowTick: number },
  limit: number
): CharacterMemory[] {
  const qWords = new Set(
    [...(query.goals || []), query.place || '']
      .join(' ')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );
  const qPeople = new Set(query.participants || []);
  const scored = memories.map((m) => {
    const ageTicks = Math.max(0, query.nowTick - m.tick);
    const recency = Math.pow(0.995, ageTicks); // ~half-life ≈ 140 ticks
    const relevance =
      (m.place && query.place && m.place === query.place ? 1 : 0) +
      m.participants.filter((p) => qPeople.has(p)).length * 0.8 +
      [...m.text.toLowerCase().matchAll(/\w+/g)].filter((w) => qWords.has(w[0])).length * 0.15;
    const importance = m.importance;
    return { m, score: relevance * 1.5 + recency * 1.0 + importance * 0.6 };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.m);
}

// ── Agent runs (cost tracking + resumability) ──────────────

export async function listRuns(branchId: string, tick?: number): Promise<AgentRun[]> {
  const rows = await getAllByIndex<AgentRun>('runs', 'branchId', branchId);
  return tick === undefined ? rows : rows.filter((r) => r.tick === tick);
}

export async function putRun(run: AgentRun): Promise<void> {
  await tx('runs', 'readwrite', (s) => s.put(run) as unknown as IDBRequest<void>);
}

/** Sum of every successful run's cost for a branch. */
export async function branchSpend(branchId: string): Promise<number> {
  const runs = await listRuns(branchId);
  return runs.reduce((sum, r) => sum + (r.ok ? r.costUsd : 0), 0);
}

export const newId = uid;

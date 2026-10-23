import { AISettings, Project, TimelineEventCategory } from '../../types/worldify';

// ==========================================
// LIVING WORLD — simulation data model
// Canon = everything WITHOUT a branchId.
// A record carrying branchId belongs to a simulation branch only.
// ==========================================

export type TickIntervalPreset = 'day' | 'week' | 'month' | 'year' | 'decade' | 'era';

export const TICK_INTERVALS: Record<TickIntervalPreset, { label: string; ticks: number; detail: 'scene' | 'chapter' | 'chronicle' }> = {
  day: { label: '1 day', ticks: 1, detail: 'scene' },
  week: { label: '1 week', ticks: 7, detail: 'scene' },
  month: { label: '1 month', ticks: 30, detail: 'chapter' },
  year: { label: '1 year', ticks: 365, detail: 'chapter' },
  decade: { label: '10 years', ticks: 3650, detail: 'chronicle' },
  era: { label: '100 years', ticks: 36500, detail: 'chronicle' },
};

export interface SimBranch {
  id: string;
  projectId: string;
  parentBranchId?: string | null;
  forkedAtTick: number;
  name: string;
  status: 'active' | 'merged' | 'discarded';
  createdAt: string;
  /** Soft cap in USD; when estimated spend approaches it, ticking is paused. */
  budgetUsd: number;
  /** Currently selected interval size, remembered per branch. */
  tickInterval: TickIntervalPreset;
  /** Tick the branch cursor is at (its own clock). */
  currentTick: number;
}

/** Structured intent a character agent returns each tick. */
export interface SimIntent {
  id: string;
  branchId: string;
  tick: number;
  entityId: string;
  intent: string;
  action: 'move' | 'speak' | 'act' | 'plot' | 'rest' | 'fight' | 'search' | 'other';
  targets: string[];
  reasoning: string;
  /** Private diary line — never affects the world, shown only to the author. */
  inner_note: string;
  confidence?: number; // 0..1 — self-reported chance of success
}

export type SimAgentRole = 'character' | 'narrator' | 'checker' | 'reflection' | 'historian';

export interface AgentRun {
  id: string;
  projectId: string;
  branchId: string;
  tick: number;
  phase: 'intents' | 'narrator' | 'checker' | 'reflection';
  role: SimAgentRole;
  entityId?: string;
  model: string;
  promptChars: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  ok: boolean;
  error?: string;
  createdAt: string;
}

export interface CharacterMind {
  id: string; // = entityId
  projectId: string;
  branchId: string;
  tier: 'hero' | 'support';
  goals: string[];
  updatedAt: string;
}

export interface CharacterMemory {
  id: string;
  projectId: string;
  branchId: string;
  entityId: string;
  tick: number;
  /** Free text, written from the character's own point of view. */
  text: string;
  /** Who else was present — used for retrieval by people. */
  participants: string[];
  /** Where it happened (entity id, marker name or free text). */
  place?: string;
  importance: 1 | 2 | 3;
  kind: 'experience' | 'hearsay' | 'conclusion';
  createdAt: string;
}

/** A simulation event, stored on a branch until the author merges it into canon. */
export interface SimEvent {
  id: string;
  projectId: string;
  branchId: string;
  tick: number;
  title: string;
  summary: string;
  category: TimelineEventCategory;
  importance: 1 | 2 | 3;
  entityIds: string[];
  /** Structured side effects the engine applied on the branch. */
  effects: SimEffect[];
  /** The roll that decided the outcome, for reproducibility. */
  roll?: { chance: number; roll: number; succeeded: boolean; seed: number };
  /** Wiki entries the narrator suggested creating — drafts awaiting approval. */
  proposedEntities?: Array<{ name: string; category: string; summary: string }>;
  createdAt: string;
}

export interface SimEffect {
  kind: 'temporal_state' | 'keyframe' | 'relation_start' | 'relation_end' | 'death' | 'birth';
  entityId: string;
  /** Filled-in payload matching the matching canon record shape. */
  payload: Record<string, unknown>;
  note?: string;
}

/** An important event waiting for the author's decision. */
export interface SimProposal {
  id: string;
  projectId: string;
  branchId: string;
  tick: number;
  eventId: string;
  title: string;
  status: 'pending' | 'merged' | 'rejected';
  createdAt: string;
}

export const categoryToEventCategory = (cat: string): TimelineEventCategory => {
  switch (cat) {
    case 'war_battle': return 'war_battle';
    case 'political_treaty': return 'political_treaty';
    case 'cataclysm': return 'cataclysm';
    case 'discovery_magic': return 'discovery_magic';
    case 'birth_death': return 'birth_death';
    case 'journey': return 'journey';
    default: return 'story_scene';
  }
};

export interface TickProgress {
  phase: TickProgressPhase;
  detail: string;
  done: number;
  total: number;
}
export type TickProgressPhase = 'idle' | 'prepare' | 'intents' | 'narrator' | 'checker' | 'commit' | 'done' | 'error';

export interface TickResult {
  events: SimEvent[];
  intents: SimIntent[];
  runs: AgentRun[];
  costUsd: number;
}

export interface LivingWorldDeps {
  project: Project;
  settings: AISettings;
  onProgress?: (p: TickProgress) => void;
}

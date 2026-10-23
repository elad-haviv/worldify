/**
 * Living World tick engine.
 *
 * A tick is an async browser function: the world stands still between ticks,
 * there is no server and no scheduler. Phases:
 *   prepare  → compute hard facts (lifecycles, canon events in range)
 *   intents  → hero characters declare intents in parallel (they can't see each other)
 *   narrator → one agent sees all intents together and decides what really happened
 *   checker  → small continuity pass; violations bounce back to the narrator once
 *   commit   → atomically write all events + effects onto the branch
 *
 * Every phase writes an AgentRun, so a tick interrupted by a closed tab or an
 * API error can resume from where it stopped. Dice are rolled in code with a
 * saved seed — a tick is reproducible.
 */
import { Project, Entity, EntitySpatialKeyframe, EntityRelation, EntityTemporalState } from '../../types/worldify';
import { resolveEntityTemporalStatus } from '../../utils/spatioTemporalResolver';
import {
  AgentRun,
  CharacterMemory,
  CharacterMind,
  SimBranch,
  SimEffect,
  SimEvent,
  SimIntent,
  SimProposal,
  TICK_INTERVALS,
  TickProgress,
  TickResult,
  categoryToEventCategory,
} from './types';
import { buildCharacterIntentPrompt, buildCheckerPrompt, buildNarratorPrompt, buildTickObservations, CharacterContext } from './prompts';
import { callLLMJSON, extractJSON } from './llm';
import * as store from './simStore';

const uid = store.newId;

// ── Deterministic dice ─────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HONEST_SYSTEM = 'You are part of a world-simulation pipeline. Output ONLY valid JSON, no prose, no markdown fences.';

// ── Hero selection ─────────────────────────────────────────
const HERO_LIMIT = 12;

export function selectHeroEntities(project: Project, branch: SimBranch): Entity[] {
  const characters = project.entities.filter((e) => e.category === 'character');
  // Heroes: explicit priority — characters referenced by canon timeline events near the branch cursor,
  // then those with rich wiki pages, then oldest created.
  const canonMentions = new Map<string, number>();
  for (const ev of project.timelineEvents) {
    if (ev.startTick <= branch.currentTick && ev.startTick > branch.currentTick - 3650) {
      ev.linkedEntityIds.forEach((id, i) => canonMentions.set(id, (canonMentions.get(id) || 0) + (3 - i) * (ev.importance + 1)));
    }
  }
  const scored = characters
    .filter((e) => e.worldId === null || e.worldId === project.activeWorldId)
    .map((e) => ({
      e,
      score: (canonMentions.get(e.id) || 0) * 10 + e.contentMd.length / 400 + (e.temporalStates?.length || 0) * 2,
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, HERO_LIMIT).map((s) => s.e);
}

// ── Hard facts: lifecycles & canon events inside the interval ──
function computeHardFacts(project: Project, fromTick: number, toTick: number): string[] {
  const facts: string[] = [];
  for (const e of project.entities) {
    if (e.lifecycleStartTick !== undefined && e.lifecycleStartTick > fromTick && e.lifecycleStartTick <= toTick) {
      facts.push(`${e.title} is born/created during this period (tick ${e.lifecycleStartTick}).`);
    }
    if (e.lifecycleEndTick !== undefined && e.lifecycleEndTick > fromTick && e.lifecycleEndTick <= toTick) {
      facts.push(`${e.title} dies / is destroyed during this period (tick ${e.lifecycleEndTick}) — this MUST happen and cannot be undone.`);
    }
  }
  for (const ev of project.timelineEvents) {
    if (ev.startTick > fromTick && ev.startTick <= toTick) {
      facts.push(`Canonical event already fixed in history: "${ev.title}" (${ev.summary}).`);
    }
  }
  return facts;
}



// ── Character context assembly ─────────────────────────────
interface ResolvedContext {
  ctx: CharacterContext;
  place?: string;
}

async function buildContext(
  project: Project,
  branch: SimBranch,
  entity: Entity,
  mind: CharacterMind | undefined,
  nowTick: number,
  heroIds: Set<string>
): Promise<ResolvedContext> {
  const temporal = resolveEntityTemporalStatus(entity, nowTick, project.calendars.find((c) => c.id === project.activeCalendarId));
  const kf = entity.spatialKeyframes
    ?.filter((k) => k.tick <= nowTick)
    ?.sort((a, b) => b.tick - a.tick)?.[0];
  const map = kf ? project.maps.find((m) => m.id === kf.mapId) : null;
  const nearbyMarker = map && kf
    ? map.markers
        .map((mk) => ({ mk, d: Math.hypot(mk.x - kf.x, mk.y - kf.y) }))
        .sort((a, b) => a.d - b.d)[0]
    : null;
  const place =
    nearbyMarker && nearbyMarker.d < 60
      ? `${nearbyMarker.mk.name}${map ? ` on ${map.name}` : ''}`
      : map && kf
        ? `${map.name} region (${Math.round(kf.x)}, ${Math.round(kf.y)})`
        : undefined;

  const rels = project.relations
    .filter((r) => r.sourceEntityId === entity.id || r.targetEntityId === entity.id)
    .map((r) => {
      const otherId = r.sourceEntityId === entity.id ? r.targetEntityId : r.sourceEntityId;
      const other = project.entities.find((e) => e.id === otherId);
      return other ? { to: other.title, type: r.type, label: r.label || 'canon' } : null;
    })
    .filter(Boolean) as Array<{ to: string; type: string; label: string }>;

  const allMemories = await store.listMemories(branch.id, entity.id);
  const memories = store.scoreMemories(
    allMemories,
    { place, goals: mind?.goals, nowTick },
    8
  );

  return {
    place,
    ctx: {
      entityId: entity.id,
      title: entity.title,
      subtitle: entity.subtitle,
      category: entity.category,
      personaMd: entity.contentMd.slice(0, 4000) || entity.summary,
      currentState: temporal.activeStatus,
      currentTitle: temporal.activeTitle,
      place,
      ageYears: temporal.ageYears,
      goals: mind?.goals || [],
      relations: rels.slice(0, 10),
      memories,
      lifecycleNote:
        entity.lifecycleStartTick !== undefined && entity.lifecycleStartTick > nowTick
          ? `${entity.title} will be born at tick ${entity.lifecycleStartTick} — after this period.`
          : undefined,
    },
  };
}

// ── Effect application (used at merge time, onto canon) ────
export function applyEffects(
  project: Project,
  effects: SimEffect[],
  entityByTitle: Map<string, Entity>
): { keyframes: Array<{ entity: Entity; kf: EntitySpatialKeyframe }>; states: Array<{ entity: Entity; st: EntityTemporalState }>; rels: Array<Partial<EntityRelation> & { sourceEntityId: string; targetEntityId: string }>; deaths: string[] } {
  const keyframes: Array<{ entity: Entity; kf: EntitySpatialKeyframe }> = [];
  const states: Array<{ entity: Entity; st: EntityTemporalState }> = [];
  const rels: Array<Partial<EntityRelation> & { sourceEntityId: string; targetEntityId: string }> = [];
  const deaths: string[] = [];
  for (const eff of effects) {
    const entity = entityByTitle.get(String(eff.entityId));
    if (!entity) continue;
    const p = eff.payload as Record<string, string>;
    switch (eff.kind) {
      case 'temporal_state':
        states.push({
          entity,
          st: { id: uid(), fromTick: 0, status: p.status || p.title, notes: p.note, titleOverride: p.title },
        });
        break;
      case 'death':
        deaths.push(entity.id);
        states.push({ entity, st: { id: uid(), fromTick: 0, status: 'Dead', notes: p.note || p.summary } });
        break;
      case 'keyframe':
        keyframes.push({
          entity,
          kf: {
            id: uid(),
            tick: 0,
            mapId: project.maps[0]?.id || '',
            x: Number(p.x) || 500,
            y: Number(p.y) || 500,
            statusNote: p.note,
          },
        });
        break;
      case 'relation_start': {
        const other = entityByTitle.get(String(p.to));
        if (other) {
          rels.push({
            sourceEntityId: entity.id,
            targetEntityId: other.id,
            type: 'allied_with',
            label: p.note || p.status || 'formed during simulation',
            validFromTick: 0,
          });
        }
        break;
      }
      case 'relation_end': {
        const other = entityByTitle.get(String(p.to));
        if (other) {
          rels.push({
            sourceEntityId: entity.id,
            targetEntityId: other.id,
            type: 'rival_of',
            label: p.note || p.status || 'broken during simulation',
          });
        }
        break;
      }
      case 'birth':
        // Births create new canon candidates only after merge — draft here.
        break;
    }
  }
  return { keyframes, states, rels, deaths };
}

// ── Style library (anti-drift) ─────────────────────────────
function styleLibrary(project: Project): string {
  const samples = project.entities
    .slice(0, 6)
    .map((e) => `"${e.title}" — ${e.summary.slice(0, 100)}`)
    .join('\n');
  return `Voice rules: write in the language of the project ("${project.name}", genre "${project.genre}"). Keep names, titles and tone consistent with the wiki. Never invent generic fantasy placeholders when an existing entity fits.\nSample canon pages:\n${samples}`;
}

// ── THE TICK ───────────────────────────────────────────────
export interface TickOptions {
  project: Project;
  branch: SimBranch;
  settings: import('../../types/worldify').AISettings;
  onProgress?: (p: TickProgress) => void;
}

export async function runTick(opts: TickOptions): Promise<TickResult> {
  const { project, branch, settings, onProgress } = opts;
  const interval = TICK_INTERVALS[branch.tickInterval].ticks;
  const fromTick = branch.currentTick;
  const toTick = fromTick + interval;
  const runs: AgentRun[] = [];
  const intents: SimIntent[] = [];
  const seed = (fromTick * 2654435761 + toTick) >>> 0;
  const rng = mulberry32(seed);
  const events: SimEvent[] = [];
  const proposals: SimProposal[] = [];
  const memoriesToWrite: CharacterMemory[] = [];
  let costUsd = 0;

  const recordRun = async (r: Omit<AgentRun, 'id' | 'createdAt'>) => {
    const run: AgentRun = { ...r, id: uid(), createdAt: new Date().toISOString() };
    runs.push(run);
    costUsd += run.ok ? run.costUsd : 0;
    await store.putRun(run);
  };

  try {
    // ── Phase 1: prepare ──
    onProgress?.({ phase: 'prepare', detail: 'Computing hard facts', done: 0, total: 5 });
    const heroEntities = selectHeroEntities(project, branch);
    const heroIds = new Set(heroEntities.map((e) => e.id));
    const hardFacts = computeHardFacts(project, fromTick, toTick);
    const entityByTitle = new Map(project.entities.map((e) => [e.title.toLowerCase(), e] as const));

    // Load or default minds
    const minds = await store.listMinds(branch.id);
    const mindById = new Map(minds.map((m) => [m.id, m] as const));

    // ── Phase 2: intents (parallel, blind to each other) ──
    onProgress?.({ phase: 'intents', detail: `${heroEntities.length} characters declaring intents`, done: 1, total: 5 });

    const contextPairs = await Promise.all(heroEntities.map((e) => buildContext(project, branch, e, mindById.get(e.id), fromTick, heroIds)));

    const intentResults = await Promise.allSettled(
      contextPairs.map(async ({ ctx, place }) => {
        const existingCanonEvents = project.timelineEvents
          .filter((ev) => ev.startTick > fromTick && ev.startTick <= toTick && ev.linkedEntityIds.includes(ctx.entityId))
          .slice(0, 3)
          .map((ev) => `KNOWN FACT this period: ${ev.title} — ${ev.summary}`);
        const prompt = buildCharacterIntentPrompt(project, branch, ctx, fromTick, toTick).replace(
          '{{OBSERVATIONS}}',
          buildTickObservations({ place, hardFacts: hardFacts.filter((f) => f.includes(ctx.title)).concat(existingCanonEvents), rumors: [] })
        );
        let raw: Awaited<ReturnType<typeof callLLMJSON>>;
        try {
          raw = await callLLMJSON(settings, HONEST_SYSTEM, prompt, 'character');
        } catch (err) {
          await recordRun({
            projectId: project.id, branchId: branch.id, tick: fromTick, phase: 'intents', role: 'character',
            entityId: ctx.entityId, model: 'unknown', promptChars: prompt.length, tokensIn: 0, tokensOut: 0, costUsd: 0,
            ok: false, error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
        await recordRun({
          projectId: project.id, branchId: branch.id, tick: fromTick, phase: 'intents', role: 'character',
          entityId: ctx.entityId, model: raw.model, promptChars: prompt.length,
          tokensIn: raw.tokensIn, tokensOut: raw.tokensOut, costUsd: raw.costUsd, ok: true,
        });
        try {
          const parsed = extractJSON<Partial<SimIntent>>(raw.text);
          return { ctx, place, parsed, raw };
        } catch (err) {
          await recordRun({
            projectId: project.id, branchId: branch.id, tick: fromTick, phase: 'intents', role: 'character',
            entityId: ctx.entityId, model: raw.model, promptChars: prompt.length, tokensIn: raw.tokensIn, tokensOut: raw.tokensOut,
            costUsd: raw.costUsd, ok: false, error: `bad JSON: ${err instanceof Error ? err.message : err}`,
          });
          return null;
        }
      })
    );

    for (const r of intentResults) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const { ctx, place, parsed } = r.value;
      if (!parsed) continue;
      const intent: SimIntent = {
        id: uid(),
        branchId: branch.id,
        tick: fromTick,
        entityId: ctx.entityId,
        intent: parsed.intent || 'Continue as before',
        action: (parsed.action as SimIntent['action']) || 'act',
        targets: parsed.targets || [],
        reasoning: parsed.reasoning || '',
        inner_note: parsed.inner_note || '',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
      };
      intents.push(intent);
      // Private inner notes go straight to the memory bank as the character's diary.
      if (intent.inner_note) {
        memoriesToWrite.push({
          id: uid(), projectId: project.id, branchId: branch.id, entityId: ctx.entityId,
          tick: fromTick, text: `(inner thought) ${intent.inner_note}`,
          participants: [], place, importance: 1, kind: 'experience', createdAt: new Date().toISOString(),
        });
      }
    }
    await store.putIntents(intents);
    onProgress?.({ phase: 'intents', detail: `${intents.length} intents collected`, done: 2, total: 5 });

    // ── Quiet tick shortcut: no intents → only code-level drift, skip the narrator ──
    if (intents.length === 0) {
      branch.currentTick = toTick;
      await store.putBranch(branch);
      onProgress?.({ phase: 'done', detail: 'Quiet tick — nothing worth narrating', done: 5, total: 5 });
      return { events, intents, runs, costUsd };
    }

    // ── Phase 3: narrator ──
    onProgress?.({ phase: 'narrator', detail: 'World narrator resolving the period', done: 3, total: 5 });
    const narratorInput = intents.map((i) => {
      const e = project.entities.find((x) => x.id === i.entityId);
      return {
        title: e?.title || 'Unknown',
        intent: i.intent,
        action: i.action,
        targets: i.targets,
        confidence: i.confidence,
        place: contextPairs.find((c) => c.ctx.entityId === i.entityId)?.place,
      };
    });

    let narratorOut: {
      events: Array<{
        title: string; summary: string; category?: string; importance?: number;
        entity_ids?: string[]; effects?: Array<{ kind: string; entity: string; payload?: Record<string, string> }>;
        chance?: number; outcome?: string;
      }>;
      proposed_entities?: Array<{ name: string; category: string; summary: string }>;
      inner_notes?: Record<string, string>;
    };
    {
      const prompt = buildNarratorPrompt(project, branch, narratorInput, hardFacts, fromTick, toTick, styleLibrary(project));
      const raw = await callLLMJSON(settings, HONEST_SYSTEM, prompt, 'narrator');
      await recordRun({
        projectId: project.id, branchId: branch.id, tick: fromTick, phase: 'narrator', role: 'narrator',
        model: raw.model, promptChars: prompt.length, tokensIn: raw.tokensIn, tokensOut: raw.tokensOut,
        costUsd: raw.costUsd, ok: true,
      });
      narratorOut = extractJSON<typeof narratorOut>(raw.text);
    }

    // ── Phase 4: checker (one retry, then drop) ──
    onProgress?.({ phase: 'checker', detail: 'Checking continuity', done: 4, total: 5 });
    let candidateEvents = narratorOut.events || [];
    const checkPrompt = buildCheckerPrompt(
      project, branch,
      candidateEvents.map((e) => ({ title: e.title, summary: e.summary, entityIds: e.entity_ids || [] })),
      fromTick, toTick
    );
    try {
      const raw = await callLLMJSON(settings, HONEST_SYSTEM, checkPrompt, 'checker');
      await recordRun({
        projectId: project.id, branchId: branch.id, tick: fromTick, phase: 'checker', role: 'checker',
        model: raw.model, promptChars: checkPrompt.length, tokensIn: raw.tokensIn, tokensOut: raw.tokensOut,
        costUsd: raw.costUsd, ok: true,
      });
      const verdict = extractJSON<{ violations: Array<{ index: number; reason: string; fix?: string }> }>(raw.text);
      for (const v of verdict.violations || []) {
        const idx = v.index - 1;
        if (idx >= 0 && idx < candidateEvents.length) {
          if (v.fix && v.fix.trim()) candidateEvents[idx].summary = v.fix;
          else candidateEvents = candidateEvents.filter((_, i) => i !== idx);
        }
      }
    } catch {
      // Checker failure is non-fatal: events stand as the narrator wrote them.
    }

    // ── Phase 5: roll dice in code, build branch events ──
    for (const ev of candidateEvents.slice(0, 8)) {
      const chance = typeof ev.chance === 'number' ? Math.min(1, Math.max(0.02, ev.chance)) : undefined;
      const roll = chance !== undefined ? { chance, roll: rng(), succeeded: false, seed } : undefined;
      if (roll) roll.succeeded = roll.roll <= roll.chance;
      const entityIds = (ev.entity_ids || [])
        .map((t) => entityByTitle.get(String(t).toLowerCase())?.id)
        .filter(Boolean) as string[];
      const event: SimEvent = {
        id: uid(),
        projectId: project.id,
        branchId: branch.id,
        tick: fromTick,
        title: ev.title,
        summary: ev.summary,
        category: categoryToEventCategory(ev.category || 'story_scene'),
        importance: ((ev.importance || 1) as 1 | 2 | 3),
        entityIds,
        effects: (ev.effects || []).map((e) => ({ kind: e.kind as SimEffect['kind'], entityId: e.entity, payload: e.payload || {} })),
        roll,
        proposedEntities: narratorOut.proposed_entities || [],
        createdAt: new Date().toISOString(),
      };
      events.push(event);
      // Important events become approval proposals.
      if (event.importance >= 2) {
        proposals.push({
          id: uid(), projectId: project.id, branchId: branch.id, tick: fromTick,
          eventId: event.id, title: event.title, status: 'pending', createdAt: new Date().toISOString(),
        });
      }
      // Every participating hero writes the event to their memory bank, from their POV.
      const participantIds = new Set(event.entityIds);
      for (const intent of intents) {
        if (participantIds.has(intent.entityId)) {
          memoriesToWrite.push({
            id: uid(), projectId: project.id, branchId: branch.id, entityId: intent.entityId,
            tick: fromTick,
            text: event.summary.replace(/\[\[|\]\]/g, ''),
            participants: event.entityIds.filter((id) => id !== intent.entityId),
            place: contextPairs.find((c) => c.ctx.entityId === intent.entityId)?.place,
            importance: event.importance, kind: 'experience', createdAt: new Date().toISOString(),
          });
        }
      }
      // Named secondary participants who are not heroes remember it as hearsay.
      for (const t of (ev.entity_ids || [])) {
        const ent = entityByTitle.get(String(t).toLowerCase());
        if (ent && !heroIds.has(ent.id) && !participantIds.has(ent.id)) {
          memoriesToWrite.push({
            id: uid(), projectId: project.id, branchId: branch.id, entityId: ent.id,
            tick: fromTick, text: `I heard that: ${event.summary.replace(/\[\[|\]\]/g, '')}`,
            participants: [], importance: 1, kind: 'hearsay', createdAt: new Date().toISOString(),
          });
        }
      }
    }

    // Narrator inner notes → character memories
    if (narratorOut.inner_notes) {
      for (const [title, note] of Object.entries(narratorOut.inner_notes)) {
        const ent = entityByTitle.get(title.toLowerCase());
        if (ent) {
          memoriesToWrite.push({
            id: uid(), projectId: project.id, branchId: branch.id, entityId: ent.id,
            tick: fromTick, text: `(inner thought) ${note}`, participants: [],
            importance: 2, kind: 'experience', createdAt: new Date().toISOString(),
          });
        }
      }
    }

    // ── Phase 6: commit — atomic-ish write to the branch ──
    onProgress?.({ phase: 'commit', detail: `Writing ${events.length} events to the branch`, done: 4, total: 5 });
    await store.putEvents(events);
    await store.putProposals(proposals);
    await store.putMemories(memoriesToWrite);
    branch.currentTick = toTick;
    await store.putBranch(branch);

    onProgress?.({ phase: 'done', detail: `${events.length} events, ${intents.length} intents`, done: 5, total: 5 });
    return { events, intents, runs, costUsd };
  } catch (err) {
    onProgress?.({ phase: 'error', detail: err instanceof Error ? err.message : String(err), done: 0, total: 5 });
    throw err;
  }
}

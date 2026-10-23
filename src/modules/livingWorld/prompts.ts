/**
 * Living World prompts — three agents built on Worldify's existing
 * prompt craft (buildCharacterRoleplayPrompt's persona + "Should I know
 * this?" horizon, and auditStoryContinuity's hard facts).
 */
import { Project } from '../../types/worldify';
import { formatTickToDate } from '../../utils/calendarEngine';
import { CharacterMemory, SimBranch, TICK_INTERVALS, TickIntervalPreset } from './types';

export interface CharacterContext {
  entityId: string;
  title: string;
  subtitle?: string;
  category: string;
  personaMd: string; // canon wiki content — the fixed layer
  currentState?: string;
  currentTitle?: string;
  place?: string;
  ageYears?: number;
  goals: string[];
  relations: Array<{ to: string; type: string; label: string }>;
  memories: CharacterMemory[];
  lifecycleNote?: string; // "Born 20 ticks ago" etc.
}

const intervalPhrase = (preset: TickIntervalPreset): string => {
  const map: Record<TickIntervalPreset, string> = {
    day: 'a single day',
    week: 'one week',
    month: 'about a month',
    year: 'about a year',
    decade: 'about a decade',
    era: 'roughly a century',
  };
  return map[preset];
};

export function buildWorldPreamble(project: Project, branch: SimBranch, fromTick: number, toTick: number): string {
  const calendar = project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];
  const world = project.worlds.find((w) => w.id === project.activeWorldId) || project.worlds[0];
  const fmt = (t: number) => (calendar ? formatTickToDate(calendar, t).displayFull : `Tick ${t}`);
  const preset = TICK_INTERVALS[branch.tickInterval];
  return `# WORLD: ${project.name} (${project.genre})
${project.description}
${world ? `\n## WORLD & LAWS (${world.name})\n${world.summary}\nLaws / magic / physics:\n${world.magicOrPhysicsRules}` : ''}

## TIME
- The tick now being written covers ${intervalPhrase(branch.tickInterval)}: from ${fmt(fromTick)} to ${fmt(toTick)} (tick ${fromTick} → ${toTick}).
- Detail level: ${preset.detail}. A ${preset.detail} spans ${
    preset.detail === 'scene'
      ? 'concrete moments, dialogue and exact movements.'
      : preset.detail === 'chapter'
        ? 'major turning points, not moment-by-moment action.'
        : 'wars, dynasties, borders and epochs — individuals only when history bends around them.'
  }
- ${toTick - fromTick} ticks pass between ${fmt(fromTick)} and ${fmt(toTick)}. Characters MUST behave as if that much time actually passed.`;
}

/** Part 5 of the character prompt: what the world engine told the character. */
export function buildTickObservations(obs: { place?: string; hardFacts: string[]; rumors: string[] }): string {
  const lines: string[] = [];
  if (obs.place) lines.push(`- You are at: ${obs.place}`);
  if (obs.hardFacts.length) lines.push(...obs.hardFacts.map((f) => `- KNOWN FACT this period: ${f}`));
  if (obs.rumors.length) lines.push(...obs.rumors.map((f) => `- You have HEARD (unverified): ${f}`));
  return lines.join('\n') || '- A quiet period. Nothing remarkable reached you.';
}

export function buildCharacterIntentPrompt(
  project: Project,
  branch: SimBranch,
  ctx: CharacterContext,
  fromTick: number,
  toTick: number
): string {
  const calendar = project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];
  const date = calendar ? formatTickToDate(calendar, fromTick).displayFull : `Tick ${fromTick}`;
  const memoriesBlock = ctx.memories.length
    ? ctx.memories.map((m) => `- [tick ${m.tick}, ${m.kind}] ${m.text}`).join('\n')
    : '- (No memories yet.)';
  const relationsBlock = ctx.relations.length
    ? ctx.relations.map((r) => `- ${r.type.replace(/_/g, ' ')} → ${r.to}: ${r.label}`).join('\n')
    : '- No notable relationships recorded.';

  return `${buildWorldPreamble(project, branch, fromTick, toTick)}

## WHO YOU ARE
${ctx.title}${ctx.subtitle ? ` — ${ctx.subtitle}` : ''} (${ctx.category})
${ctx.lifecycleNote ? `- ${ctx.lifecycleNote}` : ''}
${ctx.currentTitle ? `- Current status: ${ctx.currentTitle}${ctx.currentState ? ` (${ctx.currentState})` : ''}` : ''}
${ctx.place ? `- Current location: ${ctx.place}` : ''}
${ctx.ageYears !== undefined ? `- Age: ${ctx.ageYears} years` : ''}

## YOUR CANONICAL SELF (fixed identity — obey it)
${ctx.personaMd}

## YOUR RELATIONSHIPS
${relationsBlock}

## YOUR ACTIVE GOALS (in priority order)
${ctx.goals.length ? ctx.goals.map((g, i) => `${i + 1}. ${g}`).join('\n') : '1. (No explicit goals yet — act from your canonical persona and situation.)'}

## WHAT YOU REMEMBER
${memoriesBlock}

## WHAT REACHED YOU THIS PERIOD
{{OBSERVATIONS}}

## YOUR TASK
It is ${date}. Decide what ${ctx.title} does during the period from tick ${fromTick} to tick ${toTick}.
Live inside the world's date — do not know anything dated after it. Judge what someone of your station could realistically know ("Should I know this?"). Stay strictly within the world's laws above. Ground your intent in your goals and memories, not in generic heroism.

Return ONLY a JSON object, no prose:
{
  "intent": "one sentence — what you try to accomplish this period",
  "action": "move|speak|act|plot|rest|fight|search",
  "targets": ["entity titles of who/what this involves"],
  "reasoning": "why, from your own perspective",
  "inner_note": "one private line — your honest inner diary entry, even doubts or wrong beliefs",
  "confidence": 0.0-1.0
}`;
}

export function buildNarratorPrompt(
  project: Project,
  branch: SimBranch,
  intents: Array<{ title: string; intent: string; action: string; targets: string[]; confidence?: number; place?: string }>,
  hardFacts: string[],
  fromTick: number,
  toTick: number,
  styleLibrary: string
): string {
  const intentBlock = intents
    .map(
      (i, idx) =>
        `${idx + 1}. **${i.title}**${i.place ? ` (at ${i.place})` : ''} — ${i.action}: ${i.intent}${
          i.targets.length ? ` [targets: ${i.targets.join(', ')}]` : ''
        }${i.confidence !== undefined ? ` (self-estimated odds: ${Math.round(i.confidence * 100)}%)` : ''}`
    )
    .join('\n');

  return `${buildWorldPreamble(project, branch, fromTick, toTick)}

## ROLE: WORLD NARRATOR
You are the unseen chronicler and referee. All characters declared their intentions WITHOUT seeing each other's. Only you see them all. Your job:
1. Resolve the period: who succeeds, who fails, what clashes, what the world itself does (weather, seasons, politics, magic limits).
2. Enforce the world's LAWS above. Nothing may violate them.
3. Judge outcomes using the self-reported odds as a starting point, but factor in power, position and preparation. Make the world feel real: not everyone succeeds, not everyone fails.
4. Write ${TICK_INTERVALS[branch.tickInterval].detail}-level history. 2–6 events per period; cap importance 3 events at 0–1 per period.
5. Use ONLY existing names (entities listed below). If a new person or place is unavoidable, put it in "proposed_entities" as a DRAFT — it does not exist until the author approves.

## DECLARED INTENTS
${intentBlock}

## HARD FACTS THAT MUST BE RESPECTED THIS PERIOD
${hardFacts.length ? hardFacts.map((f) => `- ${f}`).join('\n') : '- None.'}

## STYLE LIBRARY
${styleLibrary}

## EXISTING ENTITIES (use these names)
${project.entities.slice(0, 120).map((e) => `- [[${e.title}]] (${e.category})${e.summary ? `: ${e.summary.slice(0, 120)}` : ''}`).join('\n')}

## OUTPUT
Return ONLY JSON:
{
  "events": [
    {
      "title": "short event title",
      "summary": "2-4 vivid sentences of what happened and why it matters, using [[Entity Name]] links",
      "category": "war_battle|political_treaty|cataclysm|discovery_magic|birth_death|journey|story_scene",
      "importance": 1|2|3,
      "entity_ids": ["titles of participating entities as listed above"],
      "effects": [
        {"kind": "temporal_state|keyframe|relation_start|relation_end|death|birth", "entity": "entity title", "payload": {"status": "...", "title": "...", "note": "...", "to": "other entity title"}}
      ],
      "chance": 0.0-1.0,
      "outcome": "success|failure|partial"
    }
  ],
  "proposed_entities": [{"name": "...", "category": "character|settlement|location|faction", "summary": "one line"}],
  "inner_notes": {"Entity Title": "what that character privately realized or felt this period"}
}`;
}

export function buildCheckerPrompt(
  project: Project,
  branch: SimBranch,
  events: Array<{ title: string; summary: string; entityIds: string[] }>,
  fromTick: number,
  toTick: number
): string {
  const world = project.worlds.find((w) => w.id === project.activeWorldId) || project.worlds[0];
  const dead = project.entities
    .filter((e) => e.lifecycleEndTick !== undefined && e.lifecycleEndTick <= toTick)
    .map((e) => e.title);
  const eventBlock = events.map((e, i) => `${i + 1}. ${e.title}: ${e.summary} [${e.entityIds.join(', ')}]`).join('\n');
  return `# CONTINUITY CHECKER — ${project.name}
Period: tick ${fromTick} → ${toTick} (branch "${branch.name}").
World laws:
${world?.magicOrPhysicsRules || '(none recorded)'}

Entities known to be DEAD or destroyed before or during this period:
${dead.length ? dead.join(', ') : '(none)'}

## EVENTS TO CHECK
${eventBlock}

Reject an event ONLY for hard violations:
- a dead or destroyed entity acting, speaking or being present;
- one entity in two distant places in the same scene;
- an action that breaks the world's laws above;
- an entity that does not exist (not in the entity list) being treated as established canon.

Return ONLY JSON:
{"violations": [{"index": <event number>, "reason": "one sentence", "fix": "one-sentence corrected summary, or empty to drop"}]}`;
}

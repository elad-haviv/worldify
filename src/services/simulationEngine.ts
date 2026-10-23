/**
 * Worldify Living World Simulation Engine ("Living World Engine").
 *
 * Implements the 7-stage tick cycle:
 * 1. Clock advancement, mandatory canonical lifecycle/event facts, & deterministic map code.
 * 2. Cast selection by Scope & Tier + Budget estimation.
 * 3. Parallel Character Agent intent generation (5-part prompt with epistemic horizon).
 * 4. Co-located encounters (Scene mode) & Macro Historian (Decade/Chronicle mode or every 10 ticks).
 * 5. Narrator adjudication with deterministic seeded PRNG luck rolls ("luck in code, not in the model") & Avalymia style guide.
 * 6. Conflict & Continuity Checker (with 1x retry on hard-rule/mortality violations).
 * 7. Subjective memory writing, automatic tier promotion, and periodic Reflection Agent (every 20 ticks).
 */
import {
  AgentRun,
  AISettings,
  BranchOverlayRecord,
  CharacterChatMessage,
  CharacterIntentOutput,
  CharacterMemory,
  CharacterMind,
  Entity,
  Project,
  SimBranch,
  SimEventEffect,
  SimProposal,
  SimResolutionLevel,
  SimTickInterval,
  TimelineEvent,
  TimelineEventCategory,
  WorldRuleEntry,
} from '../types/worldify';
import { formatTickToDate, getTotalDaysPerYear } from '../utils/calendarEngine';
import {
  auditBranchEventsContinuity,
  buildBranchWorldView,
  detectCanonContradictionsForMerge,
  resolveEntityMapPositionsAtTick,
  resolveEntityTemporalStatus,
} from '../utils/spatioTemporalResolver';
import {
  AtomicTickCommitBundle,
  ProjectSimulationSnapshot,
  retrieveRelevantMemories,
} from '../utils/simulationStore';
import { getActiveModel } from './aiProviders';

/**
 * Deterministic Seeded PRNG (Mulberry32) so every tick and luck roll is 100% reproducible.
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Converts a SimTickInterval ('1d' | '7d' | '30d' | '1y' | '10y') to days and a Hebrew/English label.
 */
export function resolveTickIntervalInfo(
  interval: SimTickInterval,
  daysPerYear: number = 360
): {
  deltaTicks: number;
  mode: 'scene' | 'chapter' | 'chronicle';
  hebrewLabel: string;
  hebrewElapsedPhrase: string;
  englishElapsedPhrase: string;
} {
  switch (interval) {
    case '1d':
      return {
        deltaTicks: 1,
        mode: 'scene',
        hebrewLabel: 'One day (scene)',
        hebrewElapsedPhrase: 'One day has passed since the previous tick',
        englishElapsedPhrase: 'One day has passed since the previous tick',
      };
    case '7d':
      return {
        deltaTicks: 7,
        mode: 'scene',
        hebrewLabel: 'One week (scene)',
        hebrewElapsedPhrase: 'One week (7 days) has passed since the previous tick',
        englishElapsedPhrase: 'One week (7 days) has passed since the previous tick',
      };
    case '30d':
      return {
        deltaTicks: 30,
        mode: 'chapter',
        hebrewLabel: 'One month (chapter)',
        hebrewElapsedPhrase: 'One full month (30 days) has passed since the previous tick',
        englishElapsedPhrase: 'One month (30 days) has passed since the previous tick',
      };
    case '1y':
      return {
        deltaTicks: daysPerYear,
        mode: 'chapter',
        hebrewLabel: 'One year (chapter)',
        hebrewElapsedPhrase: `One full year (${daysPerYear} days) has passed since the previous tick`,
        englishElapsedPhrase: `One full year (${daysPerYear} days) has passed since the previous tick`,
      };
    case '10y':
      return {
        deltaTicks: daysPerYear * 10,
        mode: 'chronicle',
        hebrewLabel: 'One decade (chronicle)',
        hebrewElapsedPhrase: `A full decade (10 years / ${daysPerYear * 10} days) has passed since the previous tick`,
        englishElapsedPhrase: `A full decade (10 years) has passed since the previous tick`,
      };
  }
}

/**
 * Determines event count bounds based on the user's chosen Resolution Level.
 */
export function getResolutionTargetCounts(resolution: SimResolutionLevel): {
  minEvents: number;
  maxEvents: number;
  includeMinorDialogues: boolean;
  labelHe: string;
} {
  switch (resolution) {
    case 'focused':
      return {
        minEvents: 1,
        maxEvents: 2,
        includeMinorDialogues: false,
        labelHe: 'Focused (1–2 peak events only)',
      };
    case 'balanced':
      return {
        minEvents: 2,
        maxEvents: 4,
        includeMinorDialogues: true,
        labelHe: 'Balanced (2–4 significant events)',
      };
    case 'detailed':
      return {
        minEvents: 4,
        maxEvents: 6,
        includeMinorDialogues: true,
        labelHe: 'Detailed (4–6 events and dialogues)',
      };
    case 'chronicle':
      return {
        minEvents: 3,
        maxEvents: 7,
        includeMinorDialogues: false,
        labelHe: 'Broad historical chronicle (3–7 transformations)',
      };
  }
}

/**
 * Extracts a compact style & terminology guide from the project's canonical entities and stories
 * to prevent generic LLM fantasy drift ("anti-generic-drift").
 */
export function extractProjectStyleGuide(project: Project): string {
  const sampleTitles = project.entities
    .slice(0, 18)
    .map((e) => `[[${e.title}]] (${e.category})`);
  const sampleExcerpts = project.entities
    .filter((e) => e.contentMd && e.contentMd.trim().length > 40)
    .slice(0, 3)
    .map((e) => {
      const clean = e.contentMd.replace(/#+\s*/g, '').slice(0, 180).trim();
      return `- From [[${e.title}]]: "${clean}..."`;
    });

  return [
    `### Canonical style & terminology library of "${project.name}" (${project.genre}):`,
    `- **Entities and terms existing in the world**: ${sampleTitles.join(', ')}`,
    ...(sampleExcerpts.length > 0
      ? [`- **Tone and style examples from the canon**:`, ...sampleExcerpts]
      : []),
    `- **Anti-generic-drift rule**: Strictly preserve the names, terms, and atmosphere of ${project.name}. Do not invent generic English names or foreign fantasy clichés. If a new place or character is needed, mark it as a draft only.`
  ].join('\n');
}

function cleanJsonText(raw: string): string {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

/**
 * Estimates token count and USD cost for an LLM call.
 */
function estimateCallTelemetry(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  outputText: string,
  isOffline: boolean
): { tokensIn: number; tokensOut: number; costUsd: number } {
  if (isOffline) {
    return { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  }
  const tokensIn = Math.ceil((systemPrompt.length + userPrompt.length) / 3.8);
  const tokensOut = Math.ceil(outputText.length / 3.8);

  // Approximate per-1M token rates
  let rateInPerM = 1.0;
  let rateOutPerM = 3.0;
  const m = model.toLowerCase();
  if (m.includes('flash') || m.includes('mini') || m.includes('haiku') || m.includes('deepseek')) {
    rateInPerM = 0.25;
    rateOutPerM = 1.0;
  } else if (m.includes('sonnet') || m.includes('gpt-4o') || m.includes('pro')) {
    rateInPerM = 2.5;
    rateOutPerM = 10.0;
  }

  const costUsd = Number(
    ((tokensIn / 1_000_000) * rateInPerM + (tokensOut / 1_000_000) * rateOutPerM).toFixed(5)
  );
  return { tokensIn, tokensOut, costUsd };
}

/**
 * Executes a structured JSON LLM call against the user's configured BYOK provider,
 * returning null if offline/local synthesizer is selected or if the API call fails.
 */
async function callStructuredLLM(
  systemPrompt: string,
  userPrompt: string,
  settings: AISettings,
  maxTokens: number = 1400
): Promise<{ text: string; model: string } | null> {
  if (settings.activeProvider === 'local_synthesizer') {
    return null;
  }
  const activeModel = getActiveModel(settings);
  const temperature = settings.temperature ?? 0.7;

  try {
    // 1. OPENROUTER
    if (settings.activeProvider === 'openrouter' && settings.openrouterApiKey.trim()) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openrouterApiKey.trim()}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://worldify.app',
          'X-Title': 'Worldify Living World Engine',
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return { text, model: activeModel };
      }
    }

    // 2. GEMINI
    if (settings.activeProvider === 'gemini' && settings.geminiApiKey.trim()) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${encodeURIComponent(
          settings.geminiApiKey.trim()
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              responseMimeType: 'application/json',
            },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return { text, model: activeModel };
      }
    }

    // 3. ANTHROPIC
    if (settings.activeProvider === 'anthropic' && settings.anthropicApiKey.trim()) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.anthropicApiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: activeModel,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: maxTokens,
          temperature,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.content?.[0]?.text;
        if (text) return { text, model: activeModel };
      }
    }

    // 4. OPENAI
    if (settings.activeProvider === 'openai' && settings.openaiApiKey.trim()) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openaiApiKey.trim()}`,
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return { text, model: activeModel };
      }
    }

    // 5. CUSTOM OPENAI
    if (settings.activeProvider === 'custom_openai') {
      let endpoint = (settings.customOpenAiBaseUrl || 'http://localhost:11434/v1')
        .trim()
        .replace(/\/+$/, '');
      if (!endpoint.endsWith('/chat/completions')) {
        endpoint = `${endpoint}/chat/completions`;
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.customOpenAiApiKey?.trim()) {
        headers['Authorization'] = `Bearer ${settings.customOpenAiApiKey.trim()}`;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return { text, model: activeModel };
      }
    }
  } catch (err) {
    console.warn('Living World LLM call failed, using deterministic synthesizer fallback:', err);
  }

  return null;
}

/**
 * Builds the 5-part Character Agent Prompt in the exact order specified by the design:
 * 1. Constant Persona (from Wiki) + World Rules — placed first for prompt caching!
 * 2. Current State (location, status, who is nearby, date).
 * 3. Goals & Internal Relations (from CharacterMind).
 * 4. Relevant Memories (retrieved from personal memory bank, respecting epistemic horizon).
 * 5. Tick Observations & Elapsed Interval.
 */
export function buildCharacterAgentFivePartPrompt(
  character: Entity,
  mind: CharacterMind,
  branchProjectView: Project,
  branch: SimBranch,
  memories: CharacterMemory[],
  recentObservations: string[],
  intervalInfo: ReturnType<typeof resolveTickIntervalInfo>,
  worldRules: WorldRuleEntry[]
): { systemPrompt: string; userPrompt: string } {
  const calendar =
    branchProjectView.calendars.find((c) => c.id === branchProjectView.activeCalendarId) ||
    branchProjectView.calendars[0];
  const dateFormatted = calendar
    ? formatTickToDate(calendar, branch.currentTick).displayFull
    : `Tick ${branch.currentTick}`;

  const statusInfo = resolveEntityTemporalStatus(character, branch.currentTick, calendar);
  const map =
    branchProjectView.maps.find((m) => m.id === branch.focusMapId) ||
    branchProjectView.maps[0];
  const allPositions = map
    ? resolveEntityMapPositionsAtTick(branchProjectView, map, branch.currentTick)
    : [];
  const myPos = allPositions.find((p) => p.entity.id === character.id);

  // Find nearby entities within 160 normalized units on the map
  const nearbyEntities = myPos
    ? allPositions
        .filter(
          (p) =>
            p.entity.id !== character.id &&
            Math.hypot(p.x - myPos.x, p.y - myPos.y) <= 160
        )
        .map((p) => p.entity)
    : [];

  // Retrieve relevant memories from this character's personal memory bank
  const relevantMemories = retrieveRelevantMemories(
    memories,
    branch.currentTick,
    myPos?.statusNote || map?.name,
    nearbyEntities.map((e) => e.id),
    mind.goals.filter((g) => g.status === 'active'),
    7
  );

  const useHebrew =
    branch.languageMode === 'he' ||
    (branch.languageMode === 'entity_match' &&
      /[\u0590-\u05FF]/.test(`${character.title} ${character.summary} ${character.contentMd}`));

  // PART 1: Constant Persona + World Rules (Cacheable System Prefix)
  const systemPrompt = `You are the character agent of **${character.title}** in the living world of **${branchProjectView.name}** (${branchProjectView.genre}).
Your role is to think and decide solely from the point of view, character, fears, and values of ${character.title}.

## 1. Fixed persona and canonical biography (fixed — from the Wiki):
- **Name and title**: ${character.title} ${character.subtitle ? `(${character.subtitle})` : ''}
- **Summary**: ${character.summary}
- **Tags and traits**: ${character.tags.join(', ') || 'none'}
- **Wiki page of the character**:
${character.contentMd}

## World rules and epistemic limits ("Should I know this?"):
${worldRules.map((r) => `- [${r.enforcement === 'hard' ? 'hard rule' : 'soft rule'}] ${r.title}: ${r.ruleText}`).join('\n')}
- **Strict epistemic horizon**: You know only what you have experienced, heard, or what is recorded in your memories and within the reach of your station. You have no access to the full Wiki and no knowledge of the future beyond the current date.`;

  // PARTS 2, 3, 4, 5: Dynamic State, Goals, Memories, and Tick Observations
  const activeGoalsText =
    mind.goals
      .filter((g) => g.status === 'active')
      .map((g) => `- [Priority ${g.priority}] ${g.description}`)
      .join('\n') || '- Survive and advance my standing';

  const relationsText =
    mind.internalRelations
      .map(
        (rel) =>
          `- **[[${rel.targetName}]]**: Trust ${rel.trust}/100, Hostility ${rel.hostility}/100 (${rel.debtOrBond})`
      )
      .join('\n') || '- No special personal relations';

  const memoriesText =
    relevantMemories.length > 0
      ? relevantMemories
          .map(
            (m) =>
              `- [Tick ${m.tick}${m.isReflection ? ' · Reflection insight' : ''}${m.isWhisperFromCreator ? ' · Deep inner feeling' : ''}]: ${m.content}`
          )
          .join('\n')
      : '- No personal memories recorded in this branch yet.';

  const userPrompt = `## 2. Current state in the world:
- **In-world date**: ${dateFormatted} (tick ${branch.currentTick})
- **Current time interval**: **${intervalInfo.hebrewElapsedPhrase}** (detail level: ${intervalInfo.hebrewLabel})
- **Current status and title**: ${statusInfo.activeTitle} — ${statusInfo.activeStatus}
- **Current location**: ${myPos ? `${map?.name || 'map'} (${Math.round(myPos.x)}, ${Math.round(myPos.y)}) ${myPos.statusNote ? `— ${myPos.statusNote}` : ''}` : 'in the open reaches of the world'}
- **Characters and entities in your immediate vicinity**: ${nearbyEntities.length > 0 ? nearbyEntities.map((e) => `[[${e.title}]]`).join(', ') : 'No major figure is currently close to you'}

## 3. Active goals and internal relations (CharacterMind):
### Goals:
${activeGoalsText}
### Beliefs and conclusions:
${mind.beliefs.map((b) => `- ${b}`).join('\n')}
### Stance toward known figures:
${relationsText}

## 4. Relevant memories from your personal memory bank:
${memoriesText}

## 5. Tick observations (what happened around you recently):
${recentObservations.length > 0 ? recentObservations.map((o) => `- ${o}`).join('\n') : '- The area is relatively quiet, but tension is palpable.'}

---
Directive: ${intervalInfo.hebrewElapsedPhrase}. You must decide your intent and action for this tick, in ${useHebrew ? 'Hebrew' : 'English'}.
Return **only valid JSON** in the exact following structure (no surrounding text):
{
  "intent": "A concise description of what you attempt to do this tick",
  "action": "speak" | "move" | "scheme" | "investigate" | "fight" | "build" | "ritual" | "wait",
  "targets": ["Name or id of the target character/place"],
  "targetDestination": "Place name if the action is move",
  "reasoning": "Your internal justification for this choice based on what you know",
  "inner_note": "A hidden personal thought for your inner journal (doubts, fears, a secret you would not say aloud)"
}`;

  return { systemPrompt, userPrompt };
}

/**
 * Deterministic fallback intent generator when running offline or without an API key.
 */
function synthesizeLocalCharacterIntent(
  character: Entity,
  mind: CharacterMind,
  branchProjectView: Project,
  branch: SimBranch,
  rng: () => number
): CharacterIntentOutput {
  const useHebrew =
    branch.languageMode === 'he' ||
    (branch.languageMode === 'entity_match' &&
      /[\u0590-\u05FF]/.test(`${character.title} ${character.summary}`));

  const topGoal = mind.goals.find((g) => g.status === 'active') || mind.goals[0];
  const rivalRel = mind.internalRelations.find((r) => r.hostility >= 45);
  const allyRel = mind.internalRelations.find((r) => r.trust >= 45);
  const anyRel = mind.internalRelations[0];

  const actions: CharacterIntentOutput['action'][] = [
    'speak',
    'scheme',
    'investigate',
    'move',
    'ritual',
  ];
  const chosenAction = actions[Math.floor(rng() * actions.length)];

  const targetName =
    rivalRel?.targetName ||
    allyRel?.targetName ||
    anyRel?.targetName ||
    branchProjectView.entities.find(
      (e) => e.id !== character.id && (e.category === 'settlement' || e.category === 'faction')
    )?.title ||
    branchProjectView.name;

  if (useHebrew) {
    const intentsByAction: Record<CharacterIntentOutput['action'], string> = {
      speak: `Approach [[${targetName}]] to demand a resolution and advance the goal: ${topGoal?.description || 'securing my standing'}`,
      scheme: `Weave a covert move behind the scenes against [[${targetName}]] and probe the loyalty of those around`,
      investigate: `Investigate the rumors and unusual movements around [[${targetName}]] before taking open action`,
      move: `Move toward [[${targetName}]] to establish a direct presence at the heart of events`,
      fight: `Present a forceful ultimatum to [[${targetName}]] and curb their expansion`,
      build: `Gather resources and loyal supporters to strengthen the position of ${character.title}`,
      ritual: `Perform an examination or ritual connected to the powers at work in [[${targetName}]]`,
      wait: `Wait quietly and observe [[${targetName}]]'s moves from the shadows`,
    };

    const innerNotes = [
      `I project confidence outward, but I must not misjudge ${targetName}'s strength.`,
      `If the rumors are true, our time is running out; I must act before the gates close.`,
      `No one around me knows how far I am willing to go to achieve this goal.`,
      `I harbor a piercing doubt about the loyalty of my allies if the moment of testing arrives.`,
    ];

    return {
      intent: intentsByAction[chosenAction],
      action: chosenAction,
      targets: [targetName],
      targetDestination: chosenAction === 'move' ? targetName : undefined,
      reasoning: `In line with my active goal (${topGoal?.description || 'preserving my power'}) and my relations with ${targetName}.`,
      inner_note: innerNotes[Math.floor(rng() * innerNotes.length)],
    };
  }

  return {
    intent: `Engage [[${targetName}]] to advance goal: ${topGoal?.description || 'secure influence'}`,
    action: chosenAction,
    targets: [targetName],
    targetDestination: chosenAction === 'move' ? targetName : undefined,
    reasoning: `Driven by my primary objective and current stance toward ${targetName}.`,
    inner_note: `I cannot afford to show hesitation, even though the true cost of moving against ${targetName} remains uncertain.`,
  };
}

export interface NarratorCandidateEvent {
  title: string;
  summary: string;
  category: TimelineEventCategory;
  importance: 1 | 2 | 3;
  linkedEntityTitlesOrIds: string[];
  locationName?: string;
  mapX?: number;
  mapY?: number;
  difficultyLabel: string;
  chancePercent: number;
  effects: SimEventEffect[];
  dialogues?: Array<{ speakerName: string; line: string }>;
  subjectiveMemories?: Record<string, string>;
}

/**
 * Finds mandatory canonical births, deaths, and canonical events falling within `(fromTick, toTick]`.
 * Rule 2: "A long interval must not skip hard facts. The code first computes which births and deaths and which canon events fall within the interval."
 */
export function collectMandatoryCanonicalFactsInInterval(
  canonProject: Project,
  fromTick: number,
  toTick: number
): {
  births: Entity[];
  deaths: Entity[];
  canonEvents: TimelineEvent[];
  summaryLinesHe: string[];
} {
  const births = canonProject.entities.filter(
    (e) =>
      e.lifecycleStartTick !== undefined &&
      e.lifecycleStartTick > fromTick &&
      e.lifecycleStartTick <= toTick
  );
  const deaths = canonProject.entities.filter(
    (e) =>
      e.lifecycleEndTick !== undefined &&
      e.lifecycleEndTick > fromTick &&
      e.lifecycleEndTick <= toTick
  );
  const canonEvents = canonProject.timelineEvents.filter(
    (ev) => !ev.branchId && ev.startTick > fromTick && ev.startTick <= toTick
  );

  const summaryLinesHe: string[] = [];
  for (const b of births) {
    summaryLinesHe.push(
      `- Mandatory canonical fact: birth/founding of [[${b.title}]] at tick ${b.lifecycleStartTick}.`
    );
  }
  for (const d of deaths) {
    summaryLinesHe.push(
      `- Mandatory canonical fact: death/fall of [[${d.title}]] at tick ${d.lifecycleEndTick}.`
    );
  }
  for (const ce of canonEvents) {
    summaryLinesHe.push(
      `- Canon event falling in the interval (tick ${ce.startTick}): "${ce.title}" — ${ce.summary}`
    );
  }

  return { births, deaths, canonEvents, summaryLinesHe };
}

export interface TickExecutionOptions {
  seed?: number;
  interventionPrompt?: string; // Optional user intervention ("intervention: an earthquake, the death of a king...")
  onStepProgress?: (stepLabel: string, stepIndex: number, totalSteps: number) => void;
}

export interface TickExecutionResult {
  commitBundle: AtomicTickCommitBundle;
  continuityIssues: ReturnType<typeof auditBranchEventsContinuity>;
  seedUsed: number;
}

/**
 * Runs a full 7-step Simulation Tick on the active branch.
 */
export async function executeSimulationTick(
  canonProject: Project,
  branch: SimBranch,
  snapshot: ProjectSimulationSnapshot,
  settings: AISettings,
  options: TickExecutionOptions = {}
): Promise<TickExecutionResult> {
  const seed = options.seed ?? Math.floor(Date.now() % 1_000_000_000);
  const rng = createSeededRng(seed);

  const calendar =
    canonProject.calendars.find((c) => c.id === canonProject.activeCalendarId) ||
    canonProject.calendars[0];
  const daysPerYear = calendar ? getTotalDaysPerYear(calendar) : 360;
  const intervalInfo = resolveTickIntervalInfo(branch.tickSize, daysPerYear);
  const resolutionCfg = getResolutionTargetCounts(branch.resolutionLevel);

  const fromTick = branch.currentTick;
  const toTick = fromTick + intervalInfo.deltaTicks;

  // Check budget cap before starting
  if (branch.budgetUsd > 0 && branch.spentUsd >= branch.budgetUsd) {
    throw new Error(
      `Branch budget exhausted ($${branch.spentUsd.toFixed(3)} of $${branch.budgetUsd.toFixed(2)}). Increase the budget cap in the top bar to keep running ticks.`
    );
  }

  // ── STEP 1: Clock Advancement, Mandatory Facts & Composite Branch World View ──
  options.onStepProgress?.('Step 1/7: Advancing the world clock and checking canon facts in the interval...', 1, 7);

  const branchWorldView = buildBranchWorldView(
    canonProject,
    branch,
    snapshot.branches,
    snapshot.events,
    snapshot.overlays
  );

  const mandatoryFacts = collectMandatoryCanonicalFactsInInterval(
    canonProject,
    fromTick,
    toTick
  );

  const activeMap =
    branchWorldView.maps.find((m) => m.id === branch.focusMapId) ||
    branchWorldView.maps[0] ||
    null;

  // ── STEP 2: Scope & Cast Selection ──
  options.onStepProgress?.('Step 2/7: Selecting active characters by Scope and tier...', 2, 7);

  const branchMinds = snapshot.minds.filter((m) => m.branchId === branch.id);
  const aliveProtagonistMinds = branchMinds.filter((m) => {
    if (m.tier !== 'protagonist') return false;
    const ent = branchWorldView.entities.find((e) => e.id === m.entityId);
    if (!ent) return false;
    const st = resolveEntityTemporalStatus(ent, fromTick, calendar);
    if (st.lifecycleState !== 'active') return false;

    // Filter by scopeMode if custom_cast
    if (
      branch.scopeMode === 'custom_cast' &&
      branch.focusCharacterIds &&
      branch.focusCharacterIds.length > 0
    ) {
      return branch.focusCharacterIds.includes(ent.id);
    }
    return true;
  });

  // Recent observations from the last tick in this branch
  const recentBranchEvents = branchWorldView.timelineEvents
    .filter((e) => e.startTick <= fromTick && e.startTick >= fromTick - intervalInfo.deltaTicks * 2)
    .slice(-5);
  const recentObservations = recentBranchEvents.map(
    (e) => `[Tick ${e.startTick}] ${e.title}: ${e.summary}`
  );
  if (options.interventionPrompt?.trim()) {
    recentObservations.push(
      `⚡ Supreme intervention / sudden world event: ${options.interventionPrompt.trim()}`
    );
  }

  const newAgentRuns: AgentRun[] = [];
  let tickCostUsd = 0;

  // ── STEP 3: Parallel Character Agent Intents ──
  options.onStepProgress?.(
    `Step 3/7: ${aliveProtagonistMinds.length} character agents thinking in parallel...`,
    3,
    7
  );

  const characterIntents = new Map<
    string,
    { entity: Entity; mind: CharacterMind; intent: CharacterIntentOutput }
  >();

  // In Chronicle (10y) mode, only top 3 protagonists declare personal plans; in Scene/Chapter mode up to 8
  const maxActiveAgents = intervalInfo.mode === 'chronicle' ? 3 : 8;
  const selectedMinds = aliveProtagonistMinds.slice(0, maxActiveAgents);

  await Promise.all(
    selectedMinds.map(async (mind) => {
      const entity = branchWorldView.entities.find((e) => e.id === mind.entityId);
      if (!entity) return;

      const charMemories = snapshot.memories.filter(
        (mem) => mem.branchId === branch.id && mem.entityId === entity.id
      );

      const { systemPrompt, userPrompt } = buildCharacterAgentFivePartPrompt(
        entity,
        mind,
        branchWorldView,
        branch,
        charMemories,
        recentObservations,
        intervalInfo,
        snapshot.worldRules
      );

      const llmRes = await callStructuredLLM(systemPrompt, userPrompt, settings, 600);
      let parsedIntent: CharacterIntentOutput | null = null;

      if (llmRes) {
        try {
          const rawObj = JSON.parse(cleanJsonText(llmRes.text));
          if (rawObj && typeof rawObj.intent === 'string') {
            parsedIntent = {
              intent: rawObj.intent,
              action: rawObj.action || 'speak',
              targets: Array.isArray(rawObj.targets) ? rawObj.targets.map(String) : [],
              targetDestination: rawObj.targetDestination,
              reasoning: rawObj.reasoning || '',
              inner_note: rawObj.inner_note || '',
            };
          }
        } catch {
          // fallback below
        }
      }

      if (!parsedIntent) {
        parsedIntent = synthesizeLocalCharacterIntent(
          entity,
          mind,
          branchWorldView,
          branch,
          rng
        );
      }

      const telemetry = estimateCallTelemetry(
        llmRes?.model || 'local_synthesizer',
        systemPrompt,
        userPrompt,
        llmRes?.text || JSON.stringify(parsedIntent),
        !llmRes
      );
      tickCostUsd += telemetry.costUsd;

      newAgentRuns.push({
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        projectId: canonProject.id,
        branchId: branch.id,
        tick: toTick,
        step: 'intent',
        role: `character:${entity.title}`,
        model: llmRes?.model || 'local_synthesizer',
        tokensIn: telemetry.tokensIn,
        tokensOut: telemetry.tokensOut,
        costUsd: telemetry.costUsd,
        seed,
        outputJson: JSON.stringify(parsedIntent),
        createdAt: new Date().toISOString(),
      });

      characterIntents.set(entity.id, { entity, mind, intent: parsedIntent });
    })
  );

  // ── STEP 4: Co-located Encounters (Scene) OR Macro Historian (Chronicle / Every 10 ticks) ──
  const shouldRunHistorian =
    intervalInfo.mode === 'chronicle' || (branch.tickCount + 1) % 10 === 0;
  let historianSummary = '';

  if (shouldRunHistorian) {
    options.onStepProgress?.('Step 4/7: Macro historian agent analyzing trends of kingdoms and factions...', 4, 7);
    const factionsAndSettlements = branchWorldView.entities
      .filter((e) => e.category === 'faction' || e.category === 'settlement')
      .slice(0, 8)
      .map((e) => `- [[${e.title}]] (${e.category}): ${e.summary}`)
      .join('\n');

    historianSummary = `Macro trend for the period (${intervalInfo.hebrewLabel}): power shifts among the key factions and settlements:\n${factionsAndSettlements}`;
  } else {
    options.onStepProgress?.('Step 4/7: Mapping encounters and conflicts between character intents...', 4, 7);
  }

  // ── STEP 5: Narrator Adjudication + Deterministic Seeded Luck Rolls ──
  options.onStepProgress?.(
    'Step 5/7: Narrator agent adjudicating conflicts and performing deterministic luck rolls...',
    5,
    7
  );

  // Perform seeded luck rolls for each character intent BEFORE calling the Narrator
  // ("Luck in code, not in the model. The narrator estimates a chance, the code rolls with a saved seed, and the narrator describes the outcome.")
  const intentOutcomes = Array.from(characterIntents.values()).map(({ entity, mind, intent }) => {
    // Base chance depends on action risk
    const baseChanceByAction: Record<CharacterIntentOutput['action'], number> = {
      wait: 90,
      speak: 72,
      investigate: 68,
      move: 82,
      build: 70,
      scheme: 55,
      ritual: 50,
      fight: 48,
    };
    const chancePercent = baseChanceByAction[intent.action] ?? 65;
    const rolledValue = Math.floor(rng() * 100) + 1; // 1..100
    const succeeded = rolledValue <= chancePercent;
    const difficultyLabel =
      chancePercent >= 75 ? 'moderate' : chancePercent >= 55 ? 'challenging' : 'hard and risky';

    return {
      entity,
      mind,
      intent,
      luckRoll: {
        difficultyLabel,
        chancePercent,
        rolledValue,
        succeeded,
      },
    };
  });

  const styleGuide = extractProjectStyleGuide(canonProject);
  const candidateEvents = await generateNarratorEvents(
    branchWorldView,
    branch,
    fromTick,
    toTick,
    intervalInfo,
    resolutionCfg,
    intentOutcomes,
    mandatoryFacts,
    historianSummary,
    styleGuide,
    snapshot.worldRules,
    options.interventionPrompt,
    settings,
    seed,
    rng,
    newAgentRuns
  );

  for (const r of newAgentRuns.filter((run) => run.step === 'narrator')) {
    tickCostUsd += r.costUsd;
  }

  // ── STEP 6: Conflict & Continuity Checker (with 1x Retry if violated) ──
  options.onStepProgress?.('Step 6/7: Checking conflicts, verifying world rules and continuity...', 6, 7);

  let continuityIssues = auditBranchEventsContinuity(
    branchWorldView,
    candidateEvents,
    snapshot.worldRules
  );
  const hardErrors = continuityIssues.filter((i) => i.severity === 'error');

  let validatedEvents = candidateEvents;
  if (hardErrors.length > 0) {
    // Filter out or fix any event with a hard error (e.g. dead character speaking)
    const invalidEventIds = new Set(hardErrors.map((e) => e.sceneId));
    validatedEvents = candidateEvents.filter((ev) => !invalidEventIds.has(ev.id));
    if (validatedEvents.length === 0 && candidateEvents.length > 0) {
      // Repair the first event by removing any deceased/unborn entity from its linkedEntityIds and dialogues
      const repaired = { ...candidateEvents[0] };
      const offendingEntityIds = new Set(
        hardErrors.map((e) => e.entityId).filter(Boolean) as string[]
      );
      repaired.linkedEntityIds = repaired.linkedEntityIds.filter(
        (id) => !offendingEntityIds.has(id)
      );
      repaired.dialogues = repaired.dialogues?.filter(
        (d) => !offendingEntityIds.has(d.speakerId)
      );
      validatedEvents = [repaired];
      continuityIssues = auditBranchEventsContinuity(
        branchWorldView,
        validatedEvents,
        snapshot.worldRules
      );
    }
  }

  // ── STEP 7: Build Overlays, Subjective Memories, Tier Promotions, Proposals & Periodic Reflection ──
  options.onStepProgress?.('Step 7/7: Atomic commit to the branch, updating memories and reflection...', 7, 7);

  const newOverlays: BranchOverlayRecord[] = [];
  const newMemories: CharacterMemory[] = [];
  const newProposals: SimProposal[] = [];
  const updatedMindsMap = new Map<string, CharacterMind>(
    branchMinds.map((m) => [m.entityId, { ...m, ticksSinceReflection: m.ticksSinceReflection + 1 }])
  );

  // Record each character's latestIntent & inner_note into their mind and memory bank
  for (const { entity, intent, luckRoll } of intentOutcomes) {
    const existingMind = updatedMindsMap.get(entity.id);
    if (existingMind) {
      updatedMindsMap.set(entity.id, {
        ...existingMind,
        latestIntent: intent,
        updatedAt: new Date().toISOString(),
      });
    }

    // Write subjective intent + inner_note memory
    newMemories.push({
      id: `mem-${branch.id}-${toTick}-${entity.id}-intent`,
      projectId: canonProject.id,
      branchId: branch.id,
      entityId: entity.id,
      tick: toTick,
      locationName: activeMap?.name,
      participantIds: [entity.id],
      content: `I attempted: "${intent.intent}" (${luckRoll.succeeded ? 'the move succeeded' : 'I hit an obstacle'}). Reasoning: ${intent.reasoning}`,
      innerNote: intent.inner_note,
      importance: luckRoll.succeeded ? 3 : 4,
      createdAt: new Date().toISOString(),
    });
  }

  // Process effects & memories for each validated event
  for (const ev of validatedEvents) {
    // Check if any secondary character is involved in an importance >= 3 event -> promote to protagonist!
    if (ev.importance >= 3) {
      for (const linkedId of ev.linkedEntityIds) {
        const m = updatedMindsMap.get(linkedId);
        if (m && m.tier === 'secondary') {
          updatedMindsMap.set(linkedId, {
            ...m,
            tier: 'protagonist',
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    // Create subjective memories for each participant in the event
    for (const linkedId of ev.linkedEntityIds) {
      const ent = branchWorldView.entities.find((e) => e.id === linkedId);
      if (!ent) continue;

      newMemories.push({
        id: `mem-${branch.id}-${toTick}-${linkedId}-${ev.id}`,
        projectId: canonProject.id,
        branchId: branch.id,
        entityId: linkedId,
        tick: toTick,
        locationName: activeMap?.name,
        participantIds: ev.linkedEntityIds,
        content: `I was involved in the event "${ev.title}": ${ev.summary}`,
        importance: ev.importance === 3 ? 5 : ev.importance === 2 ? 4 : 3,
        createdAt: new Date().toISOString(),
      });
    }

    // Convert event effects into BranchOverlayRecords (spatialKeyframes, temporalStates, relations)
    for (const eff of ev.effects || []) {
      if (eff.type === 'move_entity' && eff.entityId && activeMap) {
        const targetX = eff.x ?? ev.mapX ?? 500;
        const targetY = eff.y ?? ev.mapY ?? 500;
        newOverlays.push({
          id: `ov-kf-${branch.id}-${toTick}-${eff.entityId}-${Math.random().toString(36).slice(2, 6)}`,
          projectId: canonProject.id,
          branchId: branch.id,
          tick: toTick,
          kind: 'spatial_keyframe',
          entityId: eff.entityId,
          mapId: eff.mapId || activeMap.id,
          spatialKeyframe: {
            id: `kf-${branch.id}-${toTick}-${eff.entityId}`,
            tick: toTick,
            mapId: eff.mapId || activeMap.id,
            x: Math.max(20, Math.min(980, targetX)),
            y: Math.max(20, Math.min(980, targetY)),
            statusNote: eff.description || ev.title,
            branchId: branch.id,
          },
        });
      } else if (eff.type === 'update_status' && eff.entityId) {
        newOverlays.push({
          id: `ov-st-${branch.id}-${toTick}-${eff.entityId}-${Math.random().toString(36).slice(2, 6)}`,
          projectId: canonProject.id,
          branchId: branch.id,
          tick: toTick,
          kind: 'temporal_state',
          entityId: eff.entityId,
          temporalState: {
            id: `st-${branch.id}-${toTick}-${eff.entityId}`,
            fromTick: toTick,
            status: eff.status || 'Active',
            titleOverride: eff.titleOverride,
            allegianceEntityId: eff.allegianceEntityId,
            notes: eff.description || ev.title,
            branchId: branch.id,
          },
        });
      } else if (eff.type === 'add_relation' && eff.entityId && eff.targetEntityId) {
        newOverlays.push({
          id: `ov-rel-${branch.id}-${toTick}-${eff.entityId}-${eff.targetEntityId}`,
          projectId: canonProject.id,
          branchId: branch.id,
          tick: toTick,
          kind: 'relation',
          entityId: eff.entityId,
          relation: {
            id: `rel-${branch.id}-${toTick}-${eff.entityId}-${eff.targetEntityId}`,
            projectId: canonProject.id,
            sourceEntityId: eff.entityId,
            targetEntityId: eff.targetEntityId,
            type: eff.relationType || 'allied_with',
            label: eff.relationLabel || eff.description || ev.title,
            validFromTick: toTick,
            branchId: branch.id,
          },
        });
      } else if (eff.type === 'draft_entity' && eff.draftEntityTitle) {
        // New places/characters are only created as drafts awaiting approval!
        newProposals.push({
          id: `prop-draft-${branch.id}-${toTick}-${Math.random().toString(36).slice(2, 6)}`,
          projectId: canonProject.id,
          branchId: branch.id,
          tick: toTick,
          eventId: ev.id,
          kind: 'new_entity_draft',
          title: `New entity draft: ${eff.draftEntityTitle}`,
          description:
            eff.draftEntitySummary ||
            `The narrator proposed a new ${eff.draftEntityCategory || 'location'} entity during the event "${ev.title}".`,
          status: 'pending',
          payload: {
            title: eff.draftEntityTitle,
            category: eff.draftEntityCategory || 'location',
            summary: eff.draftEntitySummary || eff.description,
          },
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Create Approval Proposal for important events (importance >= 2)
    if (ev.importance >= (branch.minImportanceThreshold ?? 2)) {
      const contradictions = detectCanonContradictionsForMerge(canonProject, ev);
      newProposals.push({
        id: `prop-ev-${ev.id}`,
        projectId: canonProject.id,
        branchId: branch.id,
        tick: toTick,
        eventId: ev.id,
        kind: 'major_event',
        title: ev.title,
        description: ev.summary,
        status: 'pending',
        payload: { event: ev },
        contradictsCanon: contradictions.length > 0 ? contradictions : undefined,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Periodic Reflection Agent (every 20 ticks, or when ticksSinceReflection >= 20)
  for (const [entityId, mind] of updatedMindsMap.entries()) {
    if (mind.tier === 'protagonist' && mind.ticksSinceReflection >= 20) {
      const ent = branchWorldView.entities.find((e) => e.id === entityId);
      if (!ent) continue;

      const charMems = [
        ...snapshot.memories.filter((m) => m.branchId === branch.id && m.entityId === entityId),
        ...newMemories.filter((m) => m.entityId === entityId),
      ].slice(-15);

      const reflectionNote =
        charMems.length > 0
          ? `After ${mind.ticksSinceReflection} ticks of events, I have concluded that I must change my approach toward those around me and rely only on those who have proven loyalty in the field.`
          : `The passage of time sharpens my commitment to my goals.`;

      newMemories.push({
        id: `mem-refl-${branch.id}-${toTick}-${entityId}`,
        projectId: canonProject.id,
        branchId: branch.id,
        entityId,
        tick: toTick,
        participantIds: [entityId],
        content: reflectionNote,
        importance: 5,
        isReflection: true,
        createdAt: new Date().toISOString(),
      });

      updatedMindsMap.set(entityId, {
        ...mind,
        beliefs: [...mind.beliefs.slice(-4), reflectionNote],
        lastReflectedAtTick: toTick,
        ticksSinceReflection: 0,
      });

      // Propose character evolution card for creator approval ("accumulated reflection conclusions are offered to you as a character change for approval")
      newProposals.push({
        id: `prop-evol-${branch.id}-${toTick}-${entityId}`,
        projectId: canonProject.id,
        branchId: branch.id,
        tick: toTick,
        entityId,
        kind: 'character_evolution',
        title: `Proposed character evolution: ${ent.title}`,
        description: `Reflection insight after 20 ticks: "${reflectionNote}"`,
        status: 'pending',
        payload: {
          entityId,
          markdownAppend: `\n\n### Character evolution (tick ${toTick})\n${reflectionNote}`,
        },
        createdAt: new Date().toISOString(),
      });
    }
  }

  const updatedBranch: SimBranch = {
    ...branch,
    currentTick: toTick,
    spentUsd: Number((branch.spentUsd + tickCostUsd).toFixed(5)),
    tickCount: branch.tickCount + 1,
    tickHistory: [...branch.tickHistory, toTick],
    updatedAt: new Date().toISOString(),
  };

  return {
    commitBundle: {
      branch: updatedBranch,
      newEvents: validatedEvents,
      newOverlays,
      updatedMinds: Array.from(updatedMindsMap.values()),
      newMemories,
      newProposals,
      newAgentRuns,
    },
    continuityIssues,
    seedUsed: seed,
  };
}

/**
 * Narrator Agent: Synthesizes all character intents, seeded luck rolls, world rules,
 * mandatory canonical facts, and style guide into TimelineEvents with structured effects.
 */
async function generateNarratorEvents(
  branchWorldView: Project,
  branch: SimBranch,
  fromTick: number,
  toTick: number,
  intervalInfo: ReturnType<typeof resolveTickIntervalInfo>,
  resolutionCfg: ReturnType<typeof getResolutionTargetCounts>,
  intentOutcomes: Array<{
    entity: Entity;
    mind: CharacterMind;
    intent: CharacterIntentOutput;
    luckRoll: {
      difficultyLabel: string;
      chancePercent: number;
      rolledValue: number;
      succeeded: boolean;
    };
  }>,
  mandatoryFacts: ReturnType<typeof collectMandatoryCanonicalFactsInInterval>,
  historianSummary: string,
  styleGuide: string,
  worldRules: WorldRuleEntry[],
  interventionPrompt: string | undefined,
  settings: AISettings,
  seed: number,
  rng: () => number,
  agentRunsOut: AgentRun[]
): Promise<TimelineEvent[]> {
  const calendar =
    branchWorldView.calendars.find((c) => c.id === branchWorldView.activeCalendarId) ||
    branchWorldView.calendars[0];
  const dateFormatted = calendar
    ? formatTickToDate(calendar, toTick).displayFull
    : `Tick ${toTick}`;
  const map =
    branchWorldView.maps.find((m) => m.id === branch.focusMapId) ||
    branchWorldView.maps[0];

  const intentsBlock = intentOutcomes
    .map(
      ({ entity, intent, luckRoll }) =>
        `- **[[${entity.title}]]** (action: ${intent.action}, targets: ${intent.targets.join(', ') || 'none'}):\n` +
        `  Intent: "${intent.intent}"\n` +
        `  Reasoning: "${intent.reasoning}"\n` +
        `  🎲 Luck roll in code (Seed ${seed}): difficulty ${luckRoll.difficultyLabel} (${luckRoll.chancePercent}%), rolled ${luckRoll.rolledValue}/100 ⬅ **${luckRoll.succeeded ? 'success' : 'failure / complication'}**`
    )
    .join('\n');

  const systemPrompt = `You are the "Narrator Agent" (Narrator & World Engine) of **${branchWorldView.name}** (${branchWorldView.genre}).
Your role is to receive all character intents for the current tick together with the luck-roll results already rolled in code, identify conflicts and collisions among them, and decide what actually happened in the world.

${styleGuide}

## World rules:
${worldRules.map((r) => `- [${r.enforcement === 'hard' ? 'hard rule — must enforce' : 'soft rule'}] ${r.title}: ${r.ruleText}`).join('\n')}

## Mandatory adjudication rules:
1. **Time interval**: ${intervalInfo.hebrewElapsedPhrase}. Scale the events to the detail level **${intervalInfo.hebrewLabel}**.
2. **Quantity and resolution**: Produce between **${resolutionCfg.minEvents} and ${resolutionCfg.maxEvents} events** (${resolutionCfg.labelHe}).
3. **Respect the luck rolls**: The code has already rolled for each character whether their action succeeded or got entangled. Do not turn a failure into an easy success — describe the complication, the cost, or the collision.
4. **Hard facts in the interval**: If there are births, deaths, or canon events falling in the interval, incorporate them into the adjudication.`;

  const userPrompt = `## Current tick state:
- **Target date**: ${dateFormatted} (tick ${fromTick} ⬅ ${toTick})
- **Active map**: ${map ? `${map.name} (width: ${map.totalWidthUnits} ${map.scaleUnit})` : 'the world'}
${interventionPrompt ? `- ⚡ **Deliberate intervention by the editor-in-chief**: "${interventionPrompt}" (you must incorporate it and show how the world and the characters react!)` : ''}
${historianSummary ? `\n## Macro trends (historian agent):\n${historianSummary}` : ''}
${mandatoryFacts.summaryLinesHe.length > 0 ? `\n## Mandatory canon facts falling within the time interval:\n${mandatoryFacts.summaryLinesHe.join('\n')}` : ''}

## Character intents and in-code luck roll results:
${intentsBlock || '- No protagonist intents this tick; describe a regional transformation in the world.'}

Return **only valid JSON** in the following structure:
{
  "events": [
    {
      "title": "Event title",
      "summary": "A rich, focused description (2-4 sentences) of what actually happened, with [[entity name]] links",
      "category": "war_battle" | "political_treaty" | "cataclysm" | "discovery_magic" | "birth_death" | "journey" | "story_scene",
      "importance": 1 | 2 | 3,
      "linkedEntityNames": ["Name of an involved character or place"],
      "mapX": 500,
      "mapY": 500,
      "dialogues": [
        { "speakerName": "Character name", "line": "A short, authentic line spoken in the encounter" }
      ],
      "effects": [
        {
          "type": "move_entity" | "update_status" | "add_relation" | "draft_entity",
          "entityName": "Entity name",
          "targetEntityName": "Target name if relevant",
          "x": 520,
          "y": 480,
          "status": "New status if changed",
          "description": "Short description of the effect"
        }
      ]
    }
  ]
}`;

  const llmRes = await callStructuredLLM(systemPrompt, userPrompt, settings, 1800);
  const telemetry = estimateCallTelemetry(
    llmRes?.model || 'local_synthesizer',
    systemPrompt,
    userPrompt,
    llmRes?.text || '',
    !llmRes
  );

  agentRunsOut.push({
    id: `run-narrator-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectId: branchWorldView.id,
    branchId: branch.id,
    tick: toTick,
    step: 'narrator',
    role: 'narrator',
    model: llmRes?.model || 'local_synthesizer',
    tokensIn: telemetry.tokensIn,
    tokensOut: telemetry.tokensOut,
    costUsd: telemetry.costUsd,
    seed,
    outputJson: llmRes?.text,
    createdAt: new Date().toISOString(),
  });

  const findEntityByNameOrId = (nameOrId: string | undefined): Entity | undefined => {
    if (!nameOrId) return undefined;
    const cleaned = nameOrId.replace(/^\[\[|\]\]$/g, '').trim().toLowerCase();
    return branchWorldView.entities.find(
      (e) =>
        e.id.toLowerCase() === cleaned ||
        e.title.toLowerCase() === cleaned ||
        e.title.toLowerCase().includes(cleaned) ||
        cleaned.includes(e.title.toLowerCase())
    );
  };

  if (llmRes) {
    try {
      const parsed = JSON.parse(cleanJsonText(llmRes.text));
      if (parsed && Array.isArray(parsed.events) && parsed.events.length > 0) {
        return parsed.events.slice(0, resolutionCfg.maxEvents).map((rawEv: any, idx: number) => {
          const linkedEntities: Entity[] = (Array.isArray(rawEv.linkedEntityNames) ? rawEv.linkedEntityNames : [])
            .map((n: string) => findEntityByNameOrId(String(n)))
            .filter((e: Entity | undefined): e is Entity => Boolean(e));

          const primaryOutcome =
            intentOutcomes.find((io) => linkedEntities.some((le: Entity) => le.id === io.entity.id)) ||
            intentOutcomes[idx % Math.max(1, intentOutcomes.length)];

          const effects: SimEventEffect[] = (Array.isArray(rawEv.effects) ? rawEv.effects : []).map(
            (ef: any) => {
              const ent = findEntityByNameOrId(ef.entityName);
              const tgt = findEntityByNameOrId(ef.targetEntityName);
              return {
                type: ef.type || 'update_status',
                entityId: ent?.id,
                targetEntityId: tgt?.id,
                mapId: map?.id,
                x: typeof ef.x === 'number' ? ef.x : undefined,
                y: typeof ef.y === 'number' ? ef.y : undefined,
                status: ef.status,
                draftEntityTitle: ef.type === 'draft_entity' ? ef.entityName : undefined,
                draftEntityCategory: ef.category || 'location',
                draftEntitySummary: ef.description,
                description: ef.description || rawEv.title,
              };
            }
          );

          return {
            id: `simev-${branch.id}-${toTick}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            projectId: branchWorldView.id,
            worldId: branchWorldView.activeWorldId,
            calendarId: branchWorldView.activeCalendarId,
            title: rawEv.title || `Event at tick ${toTick}`,
            summary: rawEv.summary || '',
            category: rawEv.category || 'story_scene',
            startTick: toTick,
            importance: (rawEv.importance === 3 || rawEv.importance === 2 || rawEv.importance === 1
              ? rawEv.importance
              : 2) as 1 | 2 | 3,
            linkedEntityIds:
              linkedEntities.length > 0
                ? linkedEntities.map((e: Entity) => e.id)
                : primaryOutcome
                  ? [primaryOutcome.entity.id]
                  : [],
            mapId: map?.id,
            mapX: typeof rawEv.mapX === 'number' ? rawEv.mapX : 450 + Math.round(rng() * 150),
            mapY: typeof rawEv.mapY === 'number' ? rawEv.mapY : 450 + Math.round(rng() * 150),
            branchId: branch.id,
            source: interventionPrompt ? 'intervention' : 'simulation',
            effects,
            seed,
            luckRoll: primaryOutcome?.luckRoll,
            dialogues: Array.isArray(rawEv.dialogues)
              ? rawEv.dialogues.map((d: any) => {
                  const sp = findEntityByNameOrId(d.speakerName);
                  return {
                    speakerId: sp?.id || '',
                    speakerName: sp?.title || d.speakerName || 'character',
                    line: String(d.line || ''),
                  };
                })
              : undefined,
          };
        });
      }
    } catch (e) {
      console.warn('Narrator JSON parse failed, using deterministic synthesis:', e);
    }
  }

  // Deterministic Local Narrator Synthesis (Offline / No API Key Fallback)
  const synthesizedEvents: TimelineEvent[] = [];

  // 1. If user injected an intervention, create a high-importance event first
  if (interventionPrompt?.trim()) {
    const affectedChars = intentOutcomes.slice(0, 2).map((io) => io.entity);
    synthesizedEvents.push({
      id: `simev-${branch.id}-${toTick}-intervention`,
      projectId: branchWorldView.id,
      worldId: branchWorldView.activeWorldId,
      calendarId: branchWorldView.activeCalendarId,
      title: `Intervention in the world: ${interventionPrompt.trim().slice(0, 48)}`,
      summary: `Following "${interventionPrompt.trim()}", the existing order in ${branchWorldView.name} is destabilized. ${
        affectedChars.length > 0
          ? `${affectedChars.map((c) => `[[${c.title}]]`).join(' and ')} are forced to respond immediately to the new reality.`
          : 'The powers at work in the region regroup.'
      }`,
      category: 'cataclysm',
      startTick: toTick,
      importance: 3,
      linkedEntityIds: affectedChars.map((c) => c.id),
      mapId: map?.id,
      mapX: 500,
      mapY: 480,
      branchId: branch.id,
      source: 'intervention',
      seed,
      effects: affectedChars.map((c) => ({
        type: 'update_status',
        entityId: c.id,
        status: 'Forming a response to the crisis',
        description: `Responding to ${interventionPrompt.trim()}`,
      })),
    });
  }

  // 2. Include mandatory canonical facts if any fell in this interval
  for (const d of mandatoryFacts.deaths) {
    synthesizedEvents.push({
      id: `simev-${branch.id}-${toTick}-death-${d.id}`,
      projectId: branchWorldView.id,
      worldId: branchWorldView.activeWorldId,
      calendarId: branchWorldView.activeCalendarId,
      title: `The fall of [[${d.title}]]`,
      summary: `Per the canonical timeline, the active period of [[${d.title}]] comes to its end at tick ${d.lifecycleEndTick}, creating a political void in ${branchWorldView.name}.`,
      category: 'birth_death',
      startTick: d.lifecycleEndTick || toTick,
      importance: 3,
      linkedEntityIds: [d.id],
      mapId: map?.id,
      mapX: 520,
      mapY: 510,
      branchId: branch.id,
      source: 'simulation',
      seed,
      effects: [
        {
          type: 'update_status',
          entityId: d.id,
          status: 'Deceased / Ended',
          description: `Lifecycle ended at tick ${d.lifecycleEndTick}`,
        },
      ],
    });
  }

  // 3. Adjudicate character intents into rich events
  const targetEventCount = Math.min(
    resolutionCfg.maxEvents,
    Math.max(resolutionCfg.minEvents, Math.ceil(intentOutcomes.length / 2))
  );

  for (let i = 0; i < Math.min(targetEventCount, intentOutcomes.length); i++) {
    const primary = intentOutcomes[i];
    const secondary =
      intentOutcomes.length > 1 ? intentOutcomes[(i + 1) % intentOutcomes.length] : undefined;

    const targetEntity =
      findEntityByNameOrId(primary.intent.targets[0]) || secondary?.entity;

    const currPos = map
      ? resolveEntityMapPositionsAtTick(branchWorldView, map, fromTick).find(
          (p) => p.entity.id === primary.entity.id
        )
      : undefined;

    const baseX = currPos ? currPos.x : 400 + (i * 95) % 300;
    const baseY = currPos ? currPos.y : 380 + (i * 85) % 300;
    const newX = Math.max(60, Math.min(940, Math.round(baseX + (rng() - 0.48) * 90)));
    const newY = Math.max(60, Math.min(940, Math.round(baseY + (rng() - 0.48) * 90)));

    const succeeded = primary.luckRoll.succeeded;
    const linkedIds = [primary.entity.id];
    if (targetEntity && targetEntity.id !== primary.entity.id) {
      linkedIds.push(targetEntity.id);
    }

    const title = succeeded
      ? `Move by ${primary.entity.title}: ${primary.intent.intent.replace(/\[\[|\]\]/g, '').slice(0, 52)}`
      : `Complication and clash around the move of ${primary.entity.title}`;

    const summary = succeeded
      ? `${intervalInfo.hebrewElapsedPhrase}. [[${primary.entity.title}]] succeeds in carrying out their intent (${primary.intent.intent})${
          targetEntity ? ` against [[${targetEntity.title}]]` : ''
        }. The move shifts the local balance of power and sends ripples across ${map ? map.name : branchWorldView.name}.`
      : `${intervalInfo.hebrewElapsedPhrase}. [[${primary.entity.title}]] attempted ${primary.intent.intent}, but met stubborn resistance${
          targetEntity ? ` from [[${targetEntity.title}]]` : ''
        } (luck roll: ${primary.luckRoll.rolledValue}/${primary.luckRoll.chancePercent}%). The tension between them deepens and forces a regrouping.`;

    const dialogues =
      resolutionCfg.includeMinorDialogues && targetEntity && targetEntity.category === 'character'
        ? [
            {
              speakerId: primary.entity.id,
              speakerName: primary.entity.title,
              line: succeeded
                ? `"The hour has come, ${targetEntity.title}. We can postpone this decision no longer."`
                : `"You thought you could block my path, ${targetEntity.title}? This is only the first step."`,
            },
            {
              speakerId: targetEntity.id,
              speakerName: targetEntity.title,
              line: succeeded
                ? `"Your words were heard, ${primary.entity.title} — but remember that every alliance in ${branchWorldView.name} has a price."`
                : `"I warned you that these gates would not open so easily."`,
            },
          ]
        : undefined;

    const effects: SimEventEffect[] = [
      {
        type: 'move_entity',
        entityId: primary.entity.id,
        mapId: map?.id,
        x: newX,
        y: newY,
        description: `${primary.entity.title} acts in the area (${newX}, ${newY})`,
      },
      {
        type: 'update_status',
        entityId: primary.entity.id,
        status: succeeded ? 'in a position of advantage' : 'in tension with rivals',
        description: title,
      },
    ];

    synthesizedEvents.push({
      id: `simev-${branch.id}-${toTick}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      projectId: branchWorldView.id,
      worldId: branchWorldView.activeWorldId,
      calendarId: branchWorldView.activeCalendarId,
      title,
      summary,
      category:
        primary.intent.action === 'fight'
          ? 'war_battle'
          : primary.intent.action === 'move'
            ? 'journey'
            : primary.intent.action === 'ritual'
              ? 'discovery_magic'
              : 'political_treaty',
      startTick: toTick,
      importance: (!succeeded || i === 0 ? 3 : 2) as 1 | 2 | 3,
      linkedEntityIds: linkedIds,
      mapId: map?.id,
      mapX: newX,
      mapY: newY,
      branchId: branch.id,
      source: 'simulation',
      effects,
      seed,
      luckRoll: primary.luckRoll,
      dialogues,
    });
  }

  return synthesizedEvents;
}

/**
 * Generates an in-character conversation response for the Extended Character Card ("talk to them"),
 * grounded in both the character's canonical Wiki page AND their branch-specific CharacterMind & Memories.
 */
export async function generateLivingCharacterChat(
  character: Entity,
  mind: CharacterMind,
  memories: CharacterMemory[],
  userMessage: string,
  history: CharacterChatMessage[],
  branchProjectView: Project,
  branch: SimBranch,
  settings: AISettings
): Promise<string> {
  const calendar =
    branchProjectView.calendars.find((c) => c.id === branchProjectView.activeCalendarId) ||
    branchProjectView.calendars[0];
  const currentDate = calendar
    ? formatTickToDate(calendar, branch.currentTick).displayFull
    : `Tick ${branch.currentTick}`;

  const relevantMems = retrieveRelevantMemories(
    memories,
    branch.currentTick,
    undefined,
    [],
    mind.goals,
    8
  );

  const systemPrompt = `You embody the character of **${character.title}** in the living world of **${branchProjectView.name}**, in the simulation branch "${branch.name}" on **${currentDate}** (tick ${branch.currentTick}).

## 1. Your canonical identity (from the Wiki):
- **Name and title**: ${character.title} ${character.subtitle ? `(${character.subtitle})` : ''}
- **Summary**: ${character.summary}
- **Canonical biography**:
${character.contentMd}

## 2. Your inner state in the current simulation branch (CharacterMind):
### Active goals:
${mind.goals.map((g) => `- [Priority ${g.priority}] ${g.description}`).join('\n')}
### Beliefs and reflection conclusions:
${mind.beliefs.map((b) => `- ${b}`).join('\n')}
### Internal relations:
${mind.internalRelations.map((r) => `- [[${r.targetName}]]: Trust ${r.trust}, Hostility ${r.hostility} (${r.debtOrBond})`).join('\n')}
${mind.latestIntent ? `### Your latest intent this tick:\n"${mind.latestIntent.intent}" (hidden inner thought: "${mind.latestIntent.inner_note}")` : ''}

## 3. Personal memories you experienced in this branch:
${relevantMems.map((m) => `- [Tick ${m.tick}]: ${m.content}${m.innerNote ? ` (in your heart you thought: "${m.innerNote}")` : ''}`).join('\n') || '- No notable memories recorded yet.'}

## Role-play rules and epistemic horizon ("Should I know this?"):
1. Speak in first person as ${character.title}, in their voice, style, and personality.
2. You know only what you have experienced up to tick ${branch.currentTick}.
3. Keep answers focused, vivid, and authentic (1–2 short paragraphs). Include [[entity name]] links when mentioning characters or places.`;

  const historyText = history
    .slice(-6)
    .map((h) => `${h.speakerName}: ${h.content}`)
    .join('\n');

  const userPrompt = `${historyText ? `Conversation history:\n${historyText}\n\n` : ''}A new message to you: "${userMessage}"\n\nReply in character as ${character.title} (direct text only, no JSON):`;

  const llmRes = await callStructuredLLM(systemPrompt, userPrompt, settings, 500);
  if (llmRes && llmRes.text.trim()) {
    return llmRes.text.trim();
  }

  // Offline / Local synthesizer fallback
  const topGoal = mind.goals[0]?.description || 'safeguarding my standing';
  const lastMem = relevantMems[relevantMems.length - 1];
  const innerThought = mind.latestIntent?.inner_note;

  return `*Looks at you warily within the reality of ${currentDate}*\n\n"You ask piercing questions while the winds over **${branchProjectView.name}** rage. Right now all my focus is given to ${topGoal}.${
    lastMem ? ` I still dwell on what happened recently — ${lastMem.content}.` : ''
  }${innerThought ? `\n\n*(in a lower voice)* ${innerThought}` : ''}"`;
}

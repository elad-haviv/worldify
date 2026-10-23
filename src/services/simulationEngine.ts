/**
 * Worldify Living World Simulation Engine ("מנוע עולם חי").
 *
 * Implements the 7-stage tick cycle:
 * 1. Clock advancement, mandatory canonical lifecycle/event facts, & deterministic map code.
 * 2. Cast selection by Scope & Tier + Budget estimation.
 * 3. Parallel Character Agent intent generation (5-part prompt with epistemic horizon).
 * 4. Co-located encounters (Scene mode) & Macro Historian (Decade/Chronicle mode or every 10 ticks).
 * 5. Narrator adjudication with deterministic seeded PRNG luck rolls ("מזל בקוד, לא במודל") & Avalymia style guide.
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
        hebrewLabel: 'יום אחד (סצנה)',
        hebrewElapsedPhrase: 'עבר יום אחד מאז הטיק הקודם',
        englishElapsedPhrase: 'One day has passed since the previous tick',
      };
    case '7d':
      return {
        deltaTicks: 7,
        mode: 'scene',
        hebrewLabel: 'שבוע (סצנה)',
        hebrewElapsedPhrase: 'עבר שבוע אחד (7 ימים) מאז הטיק הקודם',
        englishElapsedPhrase: 'One week (7 days) has passed since the previous tick',
      };
    case '30d':
      return {
        deltaTicks: 30,
        mode: 'chapter',
        hebrewLabel: 'חודש (פרק)',
        hebrewElapsedPhrase: 'עבר חודש שלם (30 ימים) מאז הטיק הקודם',
        englishElapsedPhrase: 'One month (30 days) has passed since the previous tick',
      };
    case '1y':
      return {
        deltaTicks: daysPerYear,
        mode: 'chapter',
        hebrewLabel: 'שנה (פרק)',
        hebrewElapsedPhrase: `עברה שנה שלמה (${daysPerYear} ימים) מאז הטיק הקודם`,
        englishElapsedPhrase: `One full year (${daysPerYear} days) has passed since the previous tick`,
      };
    case '10y':
      return {
        deltaTicks: daysPerYear * 10,
        mode: 'chronicle',
        hebrewLabel: 'עשור (כרוניקה)',
        hebrewElapsedPhrase: `עבר עשור שלם (10 שנים / ${daysPerYear * 10} ימים) מאז הטיק הקודם`,
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
        labelHe: 'ממוקד (1–2 אירועי שיא בלבד)',
      };
    case 'balanced':
      return {
        minEvents: 2,
        maxEvents: 4,
        includeMinorDialogues: true,
        labelHe: 'מאוזן (2–4 אירועים משמעותיים)',
      };
    case 'detailed':
      return {
        minEvents: 4,
        maxEvents: 6,
        includeMinorDialogues: true,
        labelHe: 'מפורט (4–6 אירועים ודיאלוגים)',
      };
    case 'chronicle':
      return {
        minEvents: 3,
        maxEvents: 7,
        includeMinorDialogues: false,
        labelHe: 'כרוניקה היסטורית רחבה (3–7 תמורות)',
      };
  }
}

/**
 * Extracts a compact style & terminology guide from the project's canonical entities and stories
 * to prevent generic LLM fantasy drift ("נגד סחף לגנריות").
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
      return `- מתוך [[${e.title}]]: "${clean}..."`;
    });

  return [
    `### ספריית סגנון ומונחים קנוניים של "${project.name}" (${project.genre}):`,
    `- **ישויות ומונחים קיימים בעולם**: ${sampleTitles.join(', ')}`,
    ...(sampleExcerpts.length > 0
      ? [`- **דוגמאות טון וסגנון מהקנון**:`, ...sampleExcerpts]
      : []),
    `- **כלל נגד סחף לגנריות**: שמור בקפדנות על השמות, המונחים והאווירה של ${project.name}. אל תמציא שמות גנריים באנגלית או קלישאות פנטזיה זרות. אם נוצר צורך במקום או דמות חדשים, סמן אותם כטיוטה בלבד.`,
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
  const systemPrompt = `אתה סוכן הדמות של **${character.title}** בעולם החי של **${branchProjectView.name}** (${branchProjectView.genre}).
תפקידך לחשוב ולהחליט מתוך נקודת המבט, האופי, הפחדים והערכים של ${character.title} בלבד.

## 1. אופי קבוע וביוגרפיה קנונית (קבוע — מתוך ה-Wiki):
- **שם ותואר**: ${character.title} ${character.subtitle ? `(${character.subtitle})` : ''}
- **תקציר**: ${character.summary}
- **תגיות ומאפיינים**: ${character.tags.join(', ') || 'ללא'}
- **דף הדמות ב-Wiki**:
${character.contentMd}

## חוקי העולם וגבולות ידיעה ("Should I know this?"):
${worldRules.map((r) => `- [${r.enforcement === 'hard' ? 'חוק קשיח' : 'חוק רך'}] ${r.title}: ${r.ruleText}`).join('\n')}
- **אופק ידיעה קפדני**: אתה יודע אך ורק מה שחוית, שמעת או שמתועד בזיכרונותיך ובתחום מעמדך. אין לך גישה ל-Wiki המלא ואין לך ידיעה על העתיד מעבר לתאריך הנוכחי.`;

  // PARTS 2, 3, 4, 5: Dynamic State, Goals, Memories, and Tick Observations
  const activeGoalsText =
    mind.goals
      .filter((g) => g.status === 'active')
      .map((g) => `- [עדיפות ${g.priority}] ${g.description}`)
      .join('\n') || '- לשרוד ולקדם את מעמדי';

  const relationsText =
    mind.internalRelations
      .map(
        (rel) =>
          `- **[[${rel.targetName}]]**: אמון ${rel.trust}/100, עוינות ${rel.hostility}/100 (${rel.debtOrBond})`
      )
      .join('\n') || '- אין יחסים אישיים מיוחדים';

  const memoriesText =
    relevantMemories.length > 0
      ? relevantMemories
          .map(
            (m) =>
              `- [טיק ${m.tick}${m.isReflection ? ' · מסקנת רפלקציה' : ''}${m.isWhisperFromCreator ? ' · תחושה פנימית עמוקה' : ''}]: ${m.content}`
          )
          .join('\n')
      : '- טרם נצברו זיכרונות אישיים בענף זה.';

  const userPrompt = `## 2. מצב עכשווי בעולם:
- **תאריך בעולם**: ${dateFormatted} (טיק ${branch.currentTick})
- **מרווח הזמן הנוכחי**: **${intervalInfo.hebrewElapsedPhrase}** (רמת פירוט: ${intervalInfo.hebrewLabel})
- **סטטוס ותואר נוכחי**: ${statusInfo.activeTitle} — ${statusInfo.activeStatus}
- **מיקום נוכחי**: ${myPos ? `${map?.name || 'מפה'} (${Math.round(myPos.x)}, ${Math.round(myPos.y)}) ${myPos.statusNote ? `— ${myPos.statusNote}` : ''}` : 'במרחבי העולם'}
- **דמויות וישויות בסביבתך הקרובה**: ${nearbyEntities.length > 0 ? nearbyEntities.map((e) => `[[${e.title}]]`).join(', ') : 'אף דמות מרכזית אינה צמודה אליך כרגע'}

## 3. מטרות פעילות ויחסים פנימיים (CharacterMind):
### מטרות:
${activeGoalsText}
### אמונות ומסקנות:
${mind.beliefs.map((b) => `- ${b}`).join('\n')}
### יחס לדמויות מוכרות:
${relationsText}

## 4. זיכרונות רלוונטיים מבנק הזיכרון האישי שלך:
${memoriesText}

## 5. תצפיות הטיק (מה קרה סביבך לאחרונה):
${recentObservations.length > 0 ? recentObservations.map((o) => `- ${o}`).join('\n') : '- השטח שקט יחסית, אך המתח באזור מורגש.'}

---
הנחיה: ${intervalInfo.hebrewElapsedPhrase}. עליך להחליט מהי כוונתך ופעולתך בטיק זה, בשפה ${useHebrew ? 'עברית' : 'English'}.
החזר **אך ורק JSON תקין** במבנה המדויק הבא (ללא טקסט עוטף):
{
  "intent": "תיאור תמציתי של מה שאתה מנסה לעשות בטיק הזה",
  "action": "speak" | "move" | "scheme" | "investigate" | "fight" | "build" | "ritual" | "wait",
  "targets": ["שם או מזהה של דמות/מקום יעד"],
  "targetDestination": "שם מקום אם הפעולה היא move",
  "reasoning": "הנימוק הפנימי שלך לבחירה הזו לפי מה שידוע לך",
  "inner_note": "מחשבה אישית חבויה ליומן הפנימי שלך (ספקות, פחדים, סוד שלא תאמר בקול)"
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
      speak: `לפנות אל [[${targetName}]] כדי לדרוש הכרעה ולקדם את המטרה: ${topGoal?.description || 'ביצור מעמדי'}`,
      scheme: `לרקום מהלך חשאי מאחורי הקלעים מול [[${targetName}]] ולבחון את נאמנות הסובבים`,
      investigate: `לחקור את השמועות והתנועות החריגות סביב [[${targetName}]] לפני נקיטת פעולה גלויה`,
      move: `לנוע לעבר [[${targetName}]] כדי לבסס נוכחות ישירה במוקד ההתרחשויות`,
      fight: `להציב אולטימטום כוחני מול [[${targetName}]] ולבלום את התפשטותם`,
      build: `לגייס משאבים ותומכים נאמנים לחיזוק מעמדה של ${character.title}`,
      ritual: `לערוך בדיקה או טקס הקשור לכוחות הפועלים ב-[[${targetName}]]`,
      wait: `להמתין בשקט ולצפות במהלכי [[${targetName}]] מהצללים`,
    };

    const innerNotes = [
      `אני מפגינה ביטחון כלפי חוץ, אבל אסור לי לטעות בהערכת הכוח של ${targetName}.`,
      `אם השמועות נכונות, הזמן שלנו הולך ואוזל; עליי לפעול לפני שהשעריםייסגרו.`,
      `אף אחד סביבי לא יודע עד כמה אני מוכנה להרחיק לכת כדי להשיג את המטרה הזו.`,
      `יש לי ספק מנקר לגבי הנאמנות של בעלי הברית שלי אם יגיע רגע המבחן.`,
    ];

    return {
      intent: intentsByAction[chosenAction],
      action: chosenAction,
      targets: [targetName],
      targetDestination: chosenAction === 'move' ? targetName : undefined,
      reasoning: `בהתאם למטרה הפעילה שלי (${topGoal?.description || 'שמירה על כוחי'}) והיחסים מול ${targetName}.`,
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
 * Rule 2: "מרווח ארוך לא מדלג על עובדות קשות. הקוד מחשב קודם אילו לידות ומותות ואילו אירועי קנון נופלים בתוך המרווח."
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
      `- עובדה קנונית מחייבת: לידה/ייסוד של [[${b.title}]] בטיק ${b.lifecycleStartTick}.`
    );
  }
  for (const d of deaths) {
    summaryLinesHe.push(
      `- עובדה קנונית מחייבת: מוות/נפילה של [[${d.title}]] בטיק ${d.lifecycleEndTick}.`
    );
  }
  for (const ce of canonEvents) {
    summaryLinesHe.push(
      `- אירוע קנון שנופל במרווח (טיק ${ce.startTick}): "${ce.title}" — ${ce.summary}`
    );
  }

  return { births, deaths, canonEvents, summaryLinesHe };
}

export interface TickExecutionOptions {
  seed?: number;
  interventionPrompt?: string; // Optional user intervention ("התערבות: רעידת אדמה, מות של מלך...")
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
      `תקציב הענף מוצה ($${branch.spentUsd.toFixed(3)} מתוך $${branch.budgetUsd.toFixed(2)}). הגדל את תקרת התקציב בסרגל העליון כדי להמשיך להריץ טיקים.`
    );
  }

  // ── STEP 1: Clock Advancement, Mandatory Facts & Composite Branch World View ──
  options.onStepProgress?.('שלב 1/7: קידום שעון העולם ובדיקת עובדות קנון במרווח...', 1, 7);

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
  options.onStepProgress?.('שלב 2/7: בחירת דמויות פעילות לפי Scope ושכבה...', 2, 7);

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
    (e) => `[טיק ${e.startTick}] ${e.title}: ${e.summary}`
  );
  if (options.interventionPrompt?.trim()) {
    recentObservations.push(
      `⚡ התערבות עליונה / אירוע פתאומי בעולם: ${options.interventionPrompt.trim()}`
    );
  }

  const newAgentRuns: AgentRun[] = [];
  let tickCostUsd = 0;

  // ── STEP 3: Parallel Character Agent Intents ──
  options.onStepProgress?.(
    `שלב 3/7: ${aliveProtagonistMinds.length} סוכני דמויות חושבים במקביל...`,
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
    options.onStepProgress?.('שלב 4/7: סוכן היסטוריון מקרו מנתח מגמות ממלכות וסיעות...', 4, 7);
    const factionsAndSettlements = branchWorldView.entities
      .filter((e) => e.category === 'faction' || e.category === 'settlement')
      .slice(0, 8)
      .map((e) => `- [[${e.title}]] (${e.category}): ${e.summary}`)
      .join('\n');

    historianSummary = `מגמת מקרו לתקופה (${intervalInfo.hebrewLabel}): תזוזות כוח בין הסיעות והיישובים המרכזיים:\n${factionsAndSettlements}`;
  } else {
    options.onStepProgress?.('שלב 4/7: מיפוי מפגשים וקונפליקטים בין כוונות הדמויות...', 4, 7);
  }

  // ── STEP 5: Narrator Adjudication + Deterministic Seeded Luck Rolls ──
  options.onStepProgress?.(
    'שלב 5/7: סוכן המספר מכריע קונפליקטים ומבצע הגרלות מזל דטרמיניסטיות...',
    5,
    7
  );

  // Perform seeded luck rolls for each character intent BEFORE calling the Narrator
  // ("מזל בקוד, לא במודל. המספר מעריך סיכוי, הקוד מגרל עם seed שנשמר, והמספר מתאר את התוצאה.")
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
      chancePercent >= 75 ? 'סביר' : chancePercent >= 55 ? 'מאתגר' : 'קשה ומסוכן';

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
  options.onStepProgress?.('שלב 6/7: בודק קונפליקטים מוודא עמידה בחוקי העולם ורציפות...', 6, 7);

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
  options.onStepProgress?.('שלב 7/7: כתיבה אטומית לענף, עדכון זיכרונות ורפלקציה...', 7, 7);

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
      content: `ניסיתי: "${intent.intent}" (${luckRoll.succeeded ? 'המהלך צלח' : 'נתקלתי במכשול'}). נימוק: ${intent.reasoning}`,
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
        content: `הייתי מעורב/ת באירוע "${ev.title}": ${ev.summary}`,
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
          title: `טיוטת ישות חדשה: ${eff.draftEntityTitle}`,
          description:
            eff.draftEntitySummary ||
            `המספר הציע ישות חדשה מסוג ${eff.draftEntityCategory || 'location'} במהלך האירוע "${ev.title}".`,
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
          ? `לאחר ${mind.ticksSinceReflection} טיקים של אירועים, הגעתי למסקנה שעליי לשנות גישה כלפי הסובבים אותי ולהסתמך רק על מי שהוכיח נאמנות בשטח.`
          : `הזמן החולף מחדד את מחויבותי למטרותיי.`;

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

      // Propose character evolution card for creator approval ("מסקנות הרפלקציה שמצטברות מוצעות לך כשינוי אופי לאישור")
      newProposals.push({
        id: `prop-evol-${branch.id}-${toTick}-${entityId}`,
        projectId: canonProject.id,
        branchId: branch.id,
        tick: toTick,
        entityId,
        kind: 'character_evolution',
        title: `התפתחות אופי מוצעת: ${ent.title}`,
        description: `מסקנת רפלקציה לאחר 20 טיקים: "${reflectionNote}"`,
        status: 'pending',
        payload: {
          entityId,
          markdownAppend: `\n\n### התפתחות אופי (טיק ${toTick})\n${reflectionNote}`,
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
        `- **[[${entity.title}]]** (פעולה: ${intent.action}, יעדים: ${intent.targets.join(', ') || 'ללא'}):\n` +
        `  כוונה: "${intent.intent}"\n` +
        `  נימוק: "${intent.reasoning}"\n` +
        `  🎲 הגרלת מזל בקוד (Seed ${seed}): רמת קושי ${luckRoll.difficultyLabel} (${luckRoll.chancePercent}%), יצא ${luckRoll.rolledValue}/100 ⬅ **${luckRoll.succeeded ? 'הצלחה' : 'כישלון / סיבוך'}**`
    )
    .join('\n');

  const systemPrompt = `אתה "סוכן המספר" (Narrator & World Engine) של **${branchWorldView.name}** (${branchWorldView.genre}).
תפקידך לקבל את כל הכוונות של הדמויות בטיק הנוכחי יחד עם תוצאות הגרלות המזל שכבר הוגרלו בקוד, לזהות קונפליקטים והתנגשויות ביניהן, ולהכריע מה באמת קרה בעולם.

${styleGuide}

## חוקי העולם:
${worldRules.map((r) => `- [${r.enforcement === 'hard' ? 'חוק קשיח — חובה לאכוף' : 'חוק רך'}] ${r.title}: ${r.ruleText}`).join('\n')}

## כללי הכרעה מחייבים:
1. **מרווח הזמן**: ${intervalInfo.hebrewElapsedPhrase}. התאם את קנה המידה של האירועים לרמת הפירוט **${intervalInfo.hebrewLabel}**.
2. **כמות ורזולוציה**: ייצר בין **${resolutionCfg.minEvents} ל-${resolutionCfg.maxEvents} אירועים** (${resolutionCfg.labelHe}).
3. **כיבוד הגרלות המזל**: הקוד כבר הגריל עבור כל דמות האם פעולתה צלחה או הסתבכה. אל תהפוך כישלון להצלחה קלה — תאר את הסיבוך, המחיר או ההתנגשות.
4. **עובדות קשות במרווח**: אם יש לידות, מיתות או אירועי קנון שנופלים במרווח, שלב אותם בהכרעה.`;

  const userPrompt = `## מצב הטיק הנוכחי:
- **תאריך יעד**: ${dateFormatted} (טיק ${fromTick} ⬅ ${toTick})
- **מפה פעילה**: ${map ? `${map.name} (רוחב: ${map.totalWidthUnits} ${map.scaleUnit})` : 'העולם'}
${interventionPrompt ? `- ⚡ **התערבות יזומה של העורך הראשי**: "${interventionPrompt}" (חובה לשלב ולהראות איך העולם והדמויות מגיבים!)` : ''}
${historianSummary ? `\n## מגמות מקרו (סוכן היסטוריון):\n${historianSummary}` : ''}
${mandatoryFacts.summaryLinesHe.length > 0 ? `\n## עובדות קנון מחייבות שנופלות במרווח הזמן:\n${mandatoryFacts.summaryLinesHe.join('\n')}` : ''}

## כוונות הדמויות ותוצאות הגרלת המזל בקוד:
${intentsBlock || '- אין כוונות גיבורים בטיק זה; תאר תמורה אזורית בעולם.'}

החזר **אך ורק JSON תקין** במבנה הבא:
{
  "events": [
    {
      "title": "כותרת האירוע בעברית",
      "summary": "תיאור עשיר וממוקד (2-4 משפטים) של מה שקרה בפועל, עם קישורי [[שם ישות]]",
      "category": "war_battle" | "political_treaty" | "cataclysm" | "discovery_magic" | "birth_death" | "journey" | "story_scene",
      "importance": 1 | 2 | 3,
      "linkedEntityNames": ["שם דמות או מקום מעורב"],
      "mapX": 500,
      "mapY": 500,
      "dialogues": [
        { "speakerName": "שם הדמות", "line": "משפט קצר ואותנטי שנאמר במפגש" }
      ],
      "effects": [
        {
          "type": "move_entity" | "update_status" | "add_relation" | "draft_entity",
          "entityName": "שם הישות",
          "targetEntityName": "שם יעד אם רלוונטי",
          "x": 520,
          "y": 480,
          "status": "סטטוס חדש אם השתנה",
          "description": "תיאור קצר של ההשפעה"
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
            title: rawEv.title || `אירוע בטיק ${toTick}`,
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
                    speakerName: sp?.title || d.speakerName || 'דמות',
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
      title: `התערבות בעולם: ${interventionPrompt.trim().slice(0, 48)}`,
      summary: `בעקבות "${interventionPrompt.trim()}", הסדר הקיים ב-${branchWorldView.name} מתערער. ${
        affectedChars.length > 0
          ? `${affectedChars.map((c) => `[[${c.title}]]`).join(' ו-')} נאלצים להגיב מיידית למציאות החדשה.`
          : 'הכוחות הפועלים באזור נערכים מחדש.'
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
        status: 'גיבוש תגובה למשבר',
        description: `מגיב/ה ל-${interventionPrompt.trim()}`,
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
      title: `נפילת [[${d.title}]]`,
      summary: `בהתאם לציר הזמן הקנוני, תקופת פעילותה של [[${d.title}]] מגיעה לקיצה בטיק ${d.lifecycleEndTick}, ויוצרת חלל פוליטי ב-${branchWorldView.name}.`,
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
          description: `סיום מחזור חיים בטיק ${d.lifecycleEndTick}`,
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
      ? `מהלך של ${primary.entity.title}: ${primary.intent.intent.replace(/\[\[|\]\]/g, '').slice(0, 52)}`
      : `סיבוך והתנגשות סביב מהלכה של ${primary.entity.title}`;

    const summary = succeeded
      ? `${intervalInfo.hebrewElapsedPhrase}. [[${primary.entity.title}]] מצליחה להוציא אל הפועל את כוונתה (${primary.intent.intent})${
          targetEntity ? ` מול [[${targetEntity.title}]]` : ''
        }. המהלך משנה את מאזן הכוחות המקומי ומעורר הדים ברחבי ${map ? map.name : branchWorldView.name}.`
      : `${intervalInfo.hebrewElapsedPhrase}. [[${primary.entity.title}]] ניסתה ${primary.intent.intent}, אך נתקלה בהתנגדות עיקשת${
          targetEntity ? ` מצד [[${targetEntity.title}]]` : ''
        } (הגרלת מזל: ${primary.luckRoll.rolledValue}/${primary.luckRoll.chancePercent}%). המתיחות ביניהם מחריפה ומאלצת היערכות מחדש.`;

    const dialogues =
      resolutionCfg.includeMinorDialogues && targetEntity && targetEntity.category === 'character'
        ? [
            {
              speakerId: primary.entity.id,
              speakerName: primary.entity.title,
              line: succeeded
                ? `"השעה הגיעה, ${targetEntity.title}. לא נוכל עוד לדחות את ההכרעה הזו."`
                : `"חשבת שתוכל לחסום את דרכי, ${targetEntity.title}? זהו רק הצעד הראשון."`,
            },
            {
              speakerId: targetEntity.id,
              speakerName: targetEntity.title,
              line: succeeded
                ? `"דבריך נשמעו, ${primary.entity.title} — אך זכור כי לכל ברית ב-${branchWorldView.name} יש מחיר."`
                : `"הזהרתי אותך שהשערים הללו לא ייפתחו בקלות כזו."`,
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
        description: `${primary.entity.title} פועלת באזור (${newX}, ${newY})`,
      },
      {
        type: 'update_status',
        entityId: primary.entity.id,
        status: succeeded ? 'בעמדת יתרון' : 'במתיחות מול יריבים',
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
 * Generates an in-character conversation response for the Extended Character Card ("דבר איתה"),
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

  const systemPrompt = `אתה מגלם את דמותה של **${character.title}** בעולם החי של **${branchProjectView.name}**, בענף הסימולציה "${branch.name}" בתאריך **${currentDate}** (טיק ${branch.currentTick}).

## 1. זהותך הקנונית (מתוך ה-Wiki):
- **שם ותואר**: ${character.title} ${character.subtitle ? `(${character.subtitle})` : ''}
- **תקציר**: ${character.summary}
- **ביוגרפיה קנונית**:
${character.contentMd}

## 2. המצב הפנימי שלך בענף הסימולציה הנוכחי (CharacterMind):
### מטרות פעילות:
${mind.goals.map((g) => `- [עדיפות ${g.priority}] ${g.description}`).join('\n')}
### אמונות ומסקנות רפלקציה:
${mind.beliefs.map((b) => `- ${b}`).join('\n')}
### יחסים פנימיים:
${mind.internalRelations.map((r) => `- [[${r.targetName}]]: אמון ${r.trust}, עוינות ${r.hostility} (${r.debtOrBond})`).join('\n')}
${mind.latestIntent ? `### כוונתך האחרונה בטיק הנוכחי:\n"${mind.latestIntent.intent}" (מחשבה פנימית חבויה: "${mind.latestIntent.inner_note}")` : ''}

## 3. זיכרונות אישיים שחווית בענף זה:
${relevantMems.map((m) => `- [טיק ${m.tick}]: ${m.content}${m.innerNote ? ` (בלבך חשבת: "${m.innerNote}")` : ''}`).join('\n') || '- טרם נצברו זיכרונות חריגים.'}

## כללי משחק תפקידים ואופק ידיעה ("Should I know this?"):
1. דבר בגוף ראשון כ-${character.title}, בקול, בסגנון ובאישיות שלה.
2. אתה יודע רק מה שחוית עד טיק ${branch.currentTick}.
3. שמור על תשובות ממוקדות, חיות ואותנטיות (1–2 פסקאות קצרות). שלב קישורי [[שם ישות]] כשאתה מזכיר דמויות או מקומות.`;

  const historyText = history
    .slice(-6)
    .map((h) => `${h.speakerName}: ${h.content}`)
    .join('\n');

  const userPrompt = `${historyText ? `היסטוריית השיחה:\n${historyText}\n\n` : ''}פנייה חדשה אליך: "${userMessage}"\n\nענה בדמותה של ${character.title} (טקסט ישיר בלבד, ללא JSON):`;

  const llmRes = await callStructuredLLM(systemPrompt, userPrompt, settings, 500);
  if (llmRes && llmRes.text.trim()) {
    return llmRes.text.trim();
  }

  // Offline / Local synthesizer fallback in Hebrew
  const topGoal = mind.goals[0]?.description || 'שמירה על מעמדי';
  const lastMem = relevantMems[relevantMems.length - 1];
  const innerThought = mind.latestIntent?.inner_note;

  return `*מביט/ה בך בדריכות מתוך המציאות של ${currentDate}*\n\n"אתה שואל שאלות נוקבות בזמן שהרוחות ב-**${branchProjectView.name}** סוערות. כרגע כל מעייניי נתונים ל-${topGoal}.${
    lastMem ? ` עודני מהרהר/ת במה שהתרחש לאחרונה — ${lastMem.content}.` : ''
  }${innerThought ? `\n\n*(בקול נמוך יותר)* ${innerThought}` : ''}"`;
}

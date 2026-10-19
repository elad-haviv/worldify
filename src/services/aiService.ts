import {
  AIProposedAction,
  AISettings,
  Entity,
  Project,
  Story,
  StoryScene,
} from '../types/worldify';
import { formatTickToDate } from '../utils/calendarEngine';
import { computeAllProjectRelations } from '../utils/wikiParser';
import { auditStoryContinuity, resolveEntityTemporalStatus } from '../utils/spatioTemporalResolver';

export interface AssembledLoreContext {
  summaryBadges: string[];
  systemContextBlock: string;
  activeEntity?: Entity;
  neighborEntities: Entity[];
}

/**
 * Assembles Hybrid Graph + Temporal + Spatial RAG context for AI requests.
 */
export function assembleRAGContext(
  project: Project,
  selectedEntityId: string | null,
  selectedMapId: string | null,
  settings: AISettings
): AssembledLoreContext {
  const summaryBadges: string[] = [`Project: ${project.name}`];
  const calendar = project.calendars.find((c) => c.id === project.activeCalendarId);
  const activeWorld = project.worlds.find((w) => w.id === project.activeWorldId);
  const activeEntity = project.entities.find((e) => e.id === selectedEntityId);
  const activeMap = project.maps.find((m) => m.id === selectedMapId);

  const lines: string[] = [
    `# CANONICAL WORLD CONTEXT: "${project.name}" (${project.genre})`,
    `Synopsis: ${project.description}`,
  ];

  if (activeWorld) {
    summaryBadges.push(`World: ${activeWorld.name}`);
    lines.push(
      `\n## Active World: ${activeWorld.name} (${activeWorld.type})`,
      `Summary: ${activeWorld.summary}`,
      `Laws / Magic / Physics: ${activeWorld.magicOrPhysicsRules}`
    );
  }

  if (settings.includeTemporalContext && calendar) {
    const formattedDate = formatTickToDate(calendar, project.currentTick);
    summaryBadges.push(`Date: ${formattedDate.displayShort}`);
    const moonsText = formattedDate.moonPhases
      .map((mp) => `${mp.moon.name}: ${mp.phaseName} ${mp.phaseIcon}`)
      .join(', ');
    lines.push(
      `\n## Current Temporal Cursor`,
      `Date: ${formattedDate.displayFull} (Tick ${project.currentTick})`,
      `Era: ${formattedDate.era.name} — ${formattedDate.era.description}`,
      `Celestial Moons: ${moonsText}`
    );

    const nearbyEvents = project.timelineEvents
      .filter((e) => Math.abs(e.startTick - project.currentTick) <= 720)
      .slice(0, 5);
    if (nearbyEvents.length > 0) {
      lines.push(`Recent/Contemporary Events:`);
      for (const ev of nearbyEvents) {
        const d = formatTickToDate(calendar, ev.startTick).displayShort;
        lines.push(`- [${d}] ${ev.title}: ${ev.summary}`);
      }
    }
  }

  const neighborEntities: Entity[] = [];
  if (activeEntity) {
    summaryBadges.push(`Focus: ${activeEntity.title}`);
    const temporalStatus = resolveEntityTemporalStatus(
      activeEntity,
      project.currentTick,
      calendar
    );
    lines.push(
      `\n## Focused Wiki Entity: [[${activeEntity.title}]] (${activeEntity.category})`,
      `Current Temporal Status: ${temporalStatus.activeTitle} — ${temporalStatus.activeStatus}${
        temporalStatus.ageYears !== undefined ? ` (Age: ${temporalStatus.ageYears} yrs)` : ''
      }`,
      `Summary: ${activeEntity.summary}`,
      `Markdown Content:\n${activeEntity.contentMd}`
    );

    if (settings.includeGraphNeighbors) {
      const allRels = computeAllProjectRelations(project);
      const connectedIds = new Set<string>();
      for (const r of allRels) {
        if (r.sourceEntityId === activeEntity.id) connectedIds.add(r.targetEntityId);
        if (r.targetEntityId === activeEntity.id) connectedIds.add(r.sourceEntityId);
      }
      for (const cid of connectedIds) {
        const neighbor = project.entities.find((e) => e.id === cid);
        if (neighbor) neighborEntities.push(neighbor);
      }
      if (neighborEntities.length > 0) {
        summaryBadges.push(`${neighborEntities.length} Graph Neighbors`);
        lines.push(`\n## 1-Hop Knowledge Graph Neighbors:`);
        for (const nb of neighborEntities.slice(0, 8)) {
          lines.push(`- **[[${nb.title}]]** (${nb.category}): ${nb.summary}`);
        }
      }
    }
  }

  if (settings.includeSpatialContext && activeMap) {
    summaryBadges.push(`Map: ${activeMap.name}`);
    lines.push(
      `\n## Active Cartography Context: ${activeMap.name} (${activeMap.mode} mode)`,
      `Scale: ${activeMap.totalWidthUnits} ${activeMap.scaleUnit} across.`,
      `Notable Markers: ${activeMap.markers.map((m) => m.name).join(', ')}`,
      `Territorial Zones: ${activeMap.zones.map((z) => z.name).join(', ')}`
    );
  }

  lines.push(
    `\n## Formatting Rule:`,
    `Always wrap known entity names in double-brackets like [[Entity Title]] so Worldify automatically links them into the Knowledge Graph.`
  );

  return {
    summaryBadges,
    systemContextBlock: lines.join('\n'),
    activeEntity,
    neighborEntities,
  };
}

/**
 * Calls the configured BYOK LLM provider (Gemini, OpenAI, Anthropic) or falls back
 * to the built-in Context-Grounded Lore Synthesizer.
 */
export async function generateAICopilotResponse(
  userPrompt: string,
  project: Project,
  selectedEntityId: string | null,
  selectedMapId: string | null,
  settings: AISettings
): Promise<{
  content: string;
  contextSummary: string[];
  proposals: AIProposedAction[];
}> {
  const ctx = assembleRAGContext(project, selectedEntityId, selectedMapId, settings);

  // Try external BYOK API if selected and key is present
  try {
    if (settings.activeProvider === 'gemini' && settings.geminiApiKey.trim()) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel}:generateContent?key=${encodeURIComponent(
          settings.geminiApiKey.trim()
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: ctx.systemContextBlock }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: userPrompt }],
              },
            ],
          }),
        }
      );
      if (!response.ok) {
        throw new Error(`Gemini API returned ${response.status}`);
      }
      const data = await response.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        'No text returned from Gemini.';
      const proposals = buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity);
      return {
        content: text,
        contextSummary: [...ctx.summaryBadges, `Model: ${settings.geminiModel}`],
        proposals,
      };
    }

    if (settings.activeProvider === 'openai' && settings.openaiApiKey.trim()) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openaiApiKey.trim()}`,
        },
        body: JSON.stringify({
          model: settings.openaiModel,
          messages: [
            { role: 'system', content: ctx.systemContextBlock },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`OpenAI API returned ${response.status}`);
      }
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || 'No response from OpenAI.';
      const proposals = buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity);
      return {
        content: text,
        contextSummary: [...ctx.summaryBadges, `Model: ${settings.openaiModel}`],
        proposals,
      };
    }

    if (settings.activeProvider === 'anthropic' && settings.anthropicApiKey.trim()) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.anthropicApiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: settings.anthropicModel,
          max_tokens: 1500,
          system: ctx.systemContextBlock,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!response.ok) {
        throw new Error(`Anthropic API returned ${response.status}`);
      }
      const data = await response.json();
      const text = data?.content?.[0]?.text || 'No response from Anthropic.';
      const proposals = buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity);
      return {
        content: text,
        contextSummary: [...ctx.summaryBadges, `Model: ${settings.anthropicModel}`],
        proposals,
      };
    }
  } catch (err) {
    console.warn('External LLM call failed, falling back to Local Context Synthesizer:', err);
  }

  // Built-in Local Context-Grounded Lore Synthesizer
  return synthesizeLocalLoreResponse(userPrompt, project, ctx);
}

function buildSmartProposalsForPrompt(
  prompt: string,
  project: Project,
  activeEntity?: Entity
): AIProposedAction[] {
  const lower = prompt.toLowerCase();
  const calendar = project.calendars.find((c) => c.id === project.activeCalendarId);
  const dateStr = calendar
    ? formatTickToDate(calendar, project.currentTick).displayShort
    : `Tick ${project.currentTick}`;

  const proposals: AIProposedAction[] = [];
  const leadEntity = activeEntity || project.entities[0];
  const secondEntity = project.entities.find((e) => e.id !== leadEntity?.id) || leadEntity;

  if (lower.includes('character') || lower.includes('npc') || lower.includes('agent') || lower.includes('create')) {
    proposals.push({
      id: `prop-char-${Date.now()}`,
      type: 'create_entity',
      title: 'Create Character: Seraphina Vael, Envoy of the Star-Loom',
      description: `Adds a new interconnected Character wiki entry linked to [[${leadEntity?.title || 'Solhaven Citadel'}]].`,
      payload: {
        title: 'Seraphina Vael',
        category: 'character',
        summary: `Clandestine astromancer and diplomatic envoy operating between [[${leadEntity?.title || 'Solhaven Citadel'}]] and [[${secondEntity?.title || 'Frostwatch Hold'}]].`,
        tags: ['envoy', 'astromancer', 'ai-synthesized'],
        contentMd: `## Biography & Origins\n\n**Seraphina Vael** emerged into prominence around **${dateStr}** as an intermediary between [[${leadEntity?.title || 'Solhaven Citadel'}]] and [[${secondEntity?.title || 'Frostwatch Hold'}]].\n\n## Role in Current Events\n\nCarrying ciphered star-charts across the frontier, she investigates resonances left in the wake of [[The Crown of Starlight]].\n\n## Plot Hooks\n- Holds a sealed astronomical directive signed prior to the Cataclysm.\n- Secretly tracks agents of [[The Umbral Covenant]].`,
      },
    });
  }

  if (lower.includes('event') || lower.includes('timeline') || lower.includes('consequence') || lower.includes('history')) {
    proposals.push({
      id: `prop-evt-${Date.now() + 1}`,
      type: 'create_timeline_event',
      title: `Add Timeline Event at ${dateStr}: "The Astral Concordat of ${leadEntity?.title || 'Aethelgard'}"`,
      description: 'Adds a canonical historical event at the current Timeline Cursor.',
      payload: {
        title: `The Astral Concordat of ${leadEntity?.title || 'the Frontier'}`,
        summary: `Emergency convocation held on ${dateStr} involving ${leadEntity?.title || 'the major powers'} to counter planar instability.`,
        category: 'political_treaty',
        startTick: project.currentTick,
        importance: 2,
        linkedEntityIds: [leadEntity?.id, secondEntity?.id].filter(Boolean),
      },
    });
  }

  if (activeEntity) {
    proposals.push({
      id: `prop-upd-${Date.now() + 2}`,
      type: 'update_entity',
      title: `Append AI Lore Section to "${activeEntity.title}"`,
      description: 'Appends new conflict hooks, sensory details, and graph links to the currently open wiki entry.',
      payload: {
        entityId: activeEntity.id,
        contentMd: `${activeEntity.contentMd}\n\n## Chronicles & Arcane Echoes (${dateStr})\n\nAt this juncture in the timeline (**${dateStr}**), **[[${activeEntity.title}]]** stands at a crossroads involving [[${secondEntity?.title || 'The Star-Spire Sanctum'}]]. Whispers across the realm suggest that ancient oaths forged in the First Age are awakening once more.`,
      },
    });
  }

  return proposals;
}

function synthesizeLocalLoreResponse(
  userPrompt: string,
  project: Project,
  ctx: AssembledLoreContext
): {
  content: string;
  contextSummary: string[];
  proposals: AIProposedAction[];
} {
  const calendar = project.calendars.find((c) => c.id === project.activeCalendarId);
  const formattedDate = calendar
    ? formatTickToDate(calendar, project.currentTick)
    : null;
  const focus = ctx.activeEntity || project.entities[0];
  const neighbors =
    ctx.neighborEntities.length > 0
      ? ctx.neighborEntities
      : project.entities.filter((e) => e.id !== focus?.id).slice(0, 4);

  const lower = userPrompt.toLowerCase();
  const proposals = buildSmartProposalsForPrompt(userPrompt, project, focus);

  if (lower.includes('audit') || lower.includes('continuity') || lower.includes('consistency') || lower.includes('advice')) {
    const story = project.stories[0];
    const issues = story ? auditStoryContinuity(project, story) : [];
    const issueLines =
      issues.length > 0
        ? issues.map((i) => `- **${i.severity.toUpperCase()} (${i.sceneTitle})**: ${i.message} — *${i.detail}*`).join('\n')
        : `- All active story scenes in **${story?.title || project.name}** pass temporal birth/death bounds and map travel-speed thresholds.`;

    return {
      content: `### Canon & Spatio-Temporal Continuity Report\n\nI analyzed **${project.name}** at **${formattedDate?.displayShort || `Tick ${project.currentTick}`}**:\n\n#### 1. Knowledge Graph Connectivity\n- **Total Canonical Entities**: ${project.entities.length}\n- **Active Focus**: [[${focus?.title || 'None'}]] (connected to ${neighbors.map((n) => `[[${n.title}]]`).join(', ')})\n\n#### 2. Spatio-Temporal & Narrative Audit\n${issueLines}\n\n#### 3. Worldbuilding Advice\n- Consider adding a mid-point supply outpost along long map paths so character travel speeds remain grounded.\n- Link unreferenced procedural burgs on your map to faction trade networks to deepen economic realism.`,
      contextSummary: [...ctx.summaryBadges, 'Engine: Local Lore Synthesizer'],
      proposals,
    };
  }

  const moonLine = formattedDate?.moonPhases
    .map((m) => `**${m.moon.name}** is in *${m.phaseName}* (${m.phaseIcon})`)
    .join(' and ');

  const content = `### Lore Synthesis for **${project.name}**\n\nGrounded in your world state at **${
    formattedDate?.displayFull || `Tick ${project.currentTick}`
  }**${moonLine ? ` while ${moonLine}` : ''}:\n\n1. **Focal Nexus — [[${
    focus?.title || project.name
  }]]**:\n   Drawing from its connections to ${
    neighbors.map((n) => `[[${n.title}]]`).join(', ') || 'the surrounding realm'
  }, the tension around *${userPrompt.slice(0, 70)}* directly impacts the balance of power in **${
    project.worlds.find((w) => w.id === project.activeWorldId)?.name || 'the realm'
  }**.\n\n2. **Dramatic & Political Ramifications**:\n   - **Immediate Ripple**: Agents aligned with [[${
    neighbors[0]?.title || focus?.title || 'the Crown'
  }]] can leverage the current celestial alignment to press their territorial claims.\n   - **Hidden Secret**: An unrecorded vault beneath [[${
    neighbors[1]?.title || focus?.title || 'the Citadel'
  }]] preserves artifacts dating back to *${
    calendar?.eras[0]?.name || 'the First Era'
  }*.\n\nYou can apply any of the **staged actions** below with one click to commit these additions directly into your Wiki or Timeline.`;

  return {
    content,
    contextSummary: [...ctx.summaryBadges, 'Engine: Local Lore Synthesizer'],
    proposals,
  };
}

/**
 * Inline AI helper for the Wiki Editor (Expand, Sensory Polish, Plot Hooks, Auto-Link).
 */
export async function runInlineWikiAI(
  project: Project,
  entity: Entity,
  action: 'expand' | 'sensory' | 'hooks' | 'autolink',
  settings: AISettings
): Promise<string> {
  if (action === 'autolink') {
    // Automatically wrap unlinked mentions of existing entity titles in [[Title]]
    let updated = entity.contentMd;
    const otherEntities = project.entities
      .filter((e) => e.id !== entity.id && e.title.length >= 4)
      .sort((a, b) => b.title.length - a.title.length);

    for (const target of otherEntities) {
      const escaped = target.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match whole word not already inside [[...]]
      const regex = new RegExp(`(?<!\\[\\[)\\b(${escaped})\\b(?!\\]\\])`, 'g');
      let replacedFirst = false;
      updated = updated.replace(regex, (match) => {
        if (!replacedFirst) {
          replacedFirst = true;
          return `[[${match}]]`;
        }
        return match;
      });
    }
    return updated;
  }

  const calendar = project.calendars.find((c) => c.id === project.activeCalendarId);
  const dateLabel = calendar
    ? formatTickToDate(calendar, project.currentTick).displayShort
    : `Tick ${project.currentTick}`;

  const peers = project.entities
    .filter((e) => e.id !== entity.id)
    .slice(0, 3)
    .map((e) => `[[${e.title}]]`);

  // If external API key is configured, call it
  if (settings.activeProvider !== 'local_synthesizer') {
    const promptMap = {
      expand: `Write a rich, canonical Markdown section expanding the history and cultural significance of [[${entity.title}]], referencing ${peers.join(', ')} where appropriate. Output only Markdown.`,
      sensory: `Write an evocative "Atmosphere, Sights & Sounds" Markdown section for [[${entity.title}]]. Output only Markdown.`,
      hooks: `Write 3 compelling narrative plot hooks and secrets involving [[${entity.title}]] set around ${dateLabel}. Use [[WikiLinks]] for existing entities. Output only Markdown.`,
    };
    const res = await generateAICopilotResponse(
      promptMap[action],
      project,
      entity.id,
      project.maps[0]?.id || null,
      settings
    );
    return `${entity.contentMd}\n\n${res.content}`;
  }

  if (action === 'expand') {
    return `${entity.contentMd}\n\n## Historical Resonance & Legacy (${dateLabel})\n\nThroughout the annals of **${project.name}**, **[[${entity.title}]]** has played a pivotal role in shaping relations with ${peers.join(' and ')}. Chroniclers note that during **${dateLabel}**, shifting alignments across the ley-lines brought renewed strategic scrutiny to its domain.`;
  }

  if (action === 'sensory') {
    return `${entity.contentMd}\n\n## Sensory Atmosphere & Presence\n\n> [!NOTE]\n> **Sights**: Gilded reliefs catching the oblique light of the twin moons, worn stone etched with First-Age sigils.\n> **Sounds**: The low harmonic thrum of resonance conduits mingling with distant wind-chimes.\n> **Atmosphere**: Charged with ozone, ancient parchment, and the quiet tension of an approaching turning point.`;
  }

  return `${entity.contentMd}\n\n## Narrative Hooks & Rumors\n\n- **The Ciphered Ledger**: An envoy from ${peers[0] || 'a rival faction'} recently arrived bearing evidence that **[[${entity.title}]]** conceals a dormant shard of First-Age origin.\n- **Omen of the Eclipse**: As **${dateLabel}** unfolds, a long-sealed oath binding [[${entity.title}]] to ${peers[1] || 'the ancient throne'} threatens to come due.\n- **Shadow in the Court**: Whispers suggest a saboteur loyal to ${peers[2] || 'an external power'} is operating within the inner circle.`;
}

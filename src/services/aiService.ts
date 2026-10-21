import {
  AIProposedAction,
  AISettings,
  CharacterChatMessage,
  Entity,
  EntityCategory,
  Project,
  Story,
  StoryScene,
  WorldTravelDiscovery,
  WorldTravelEncounter,
  WorldTravelLogEntry,
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

import { AI_PROVIDERS, getActiveModel } from './aiProviders';

/**
 * Calls the configured BYOK LLM provider (OpenRouter, Gemini, Anthropic, OpenAI, Custom/Local)
 * or falls back to the built-in Context-Grounded Lore Synthesizer.
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
  const activeModel = getActiveModel(settings);
  const temperature = settings.temperature ?? 0.7;

  // 1. OPENROUTER (Universal Gateway)
  if (settings.activeProvider === 'openrouter') {
    if (!settings.openrouterApiKey.trim()) {
      return {
        content: `> ⚠️ **OpenRouter API Key Missing**\n> Please open AI Settings (⚙️) above and enter your OpenRouter API key, or switch to the **Local Lore Synthesizer** (offline).\n\n---\n\n${(synthesizeLocalLoreResponse(userPrompt, project, ctx)).content}`,
        contextSummary: [...ctx.summaryBadges, 'OpenRouter (Key Needed)'],
        proposals: buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity),
      };
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openrouterApiKey.trim()}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://worldify.app',
          'X-Title': 'Worldify Studio',
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: ctx.systemContextBlock },
            { role: 'user', content: userPrompt },
          ],
          temperature,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || 'No response returned from OpenRouter.';
      const proposals = buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity);

      return {
        content: text,
        contextSummary: [...ctx.summaryBadges, `OpenRouter: ${activeModel}`],
        proposals,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('OpenRouter call failed:', errMsg);
      const fallback = synthesizeLocalLoreResponse(userPrompt, project, ctx);
      return {
        content: `> ⚠️ **OpenRouter Error (${activeModel})**: ${errMsg}\n> *Falling back to Local Lore Synthesizer:*\n\n---\n\n${fallback.content}`,
        contextSummary: [...ctx.summaryBadges, 'OpenRouter (Fallback)'],
        proposals: fallback.proposals,
      };
    }
  }

  // 2. GOOGLE GEMINI
  if (settings.activeProvider === 'gemini') {
    if (!settings.geminiApiKey.trim()) {
      return {
        content: `> ⚠️ **Gemini API Key Missing**\n> Please open AI Settings (⚙️) above and enter your Google Gemini API key from Google AI Studio.\n\n---\n\n${(synthesizeLocalLoreResponse(userPrompt, project, ctx)).content}`,
        contextSummary: [...ctx.summaryBadges, 'Gemini (Key Needed)'],
        proposals: buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity),
      };
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${encodeURIComponent(
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
            generationConfig: {
              temperature,
            },
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        'No text returned from Gemini.';
      const proposals = buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity);

      return {
        content: text,
        contextSummary: [...ctx.summaryBadges, `Gemini: ${activeModel}`],
        proposals,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('Gemini API call failed:', errMsg);
      const fallback = synthesizeLocalLoreResponse(userPrompt, project, ctx);
      return {
        content: `> ⚠️ **Google Gemini Error (${activeModel})**: ${errMsg}\n> *Falling back to Local Lore Synthesizer:*\n\n---\n\n${fallback.content}`,
        contextSummary: [...ctx.summaryBadges, 'Gemini (Fallback)'],
        proposals: fallback.proposals,
      };
    }
  }

  // 3. ANTHROPIC CLAUDE
  if (settings.activeProvider === 'anthropic') {
    if (!settings.anthropicApiKey.trim()) {
      return {
        content: `> ⚠️ **Anthropic API Key Missing**\n> Please open AI Settings (⚙️) above and enter your Claude API key.\n\n---\n\n${(synthesizeLocalLoreResponse(userPrompt, project, ctx)).content}`,
        contextSummary: [...ctx.summaryBadges, 'Claude (Key Needed)'],
        proposals: buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity),
      };
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.anthropicApiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: activeModel,
          max_tokens: 2048,
          system: ctx.systemContextBlock,
          messages: [{ role: 'user', content: userPrompt }],
          temperature,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const text = data?.content?.[0]?.text || 'No response from Anthropic Claude.';
      const proposals = buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity);

      return {
        content: text,
        contextSummary: [...ctx.summaryBadges, `Claude: ${activeModel}`],
        proposals,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('Anthropic API call failed:', errMsg);
      const fallback = synthesizeLocalLoreResponse(userPrompt, project, ctx);
      return {
        content: `> ⚠️ **Anthropic Claude Error (${activeModel})**: ${errMsg}\n> *Falling back to Local Lore Synthesizer:*\n\n---\n\n${fallback.content}`,
        contextSummary: [...ctx.summaryBadges, 'Claude (Fallback)'],
        proposals: fallback.proposals,
      };
    }
  }

  // 4. OPENAI GPT
  if (settings.activeProvider === 'openai') {
    if (!settings.openaiApiKey.trim()) {
      return {
        content: `> ⚠️ **OpenAI API Key Missing**\n> Please open AI Settings (⚙️) above and enter your OpenAI API key.\n\n---\n\n${(synthesizeLocalLoreResponse(userPrompt, project, ctx)).content}`,
        contextSummary: [...ctx.summaryBadges, 'OpenAI (Key Needed)'],
        proposals: buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity),
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openaiApiKey.trim()}`,
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: ctx.systemContextBlock },
            { role: 'user', content: userPrompt },
          ],
          temperature,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || 'No response from OpenAI.';
      const proposals = buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity);

      return {
        content: text,
        contextSummary: [...ctx.summaryBadges, `OpenAI: ${activeModel}`],
        proposals,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('OpenAI API call failed:', errMsg);
      const fallback = synthesizeLocalLoreResponse(userPrompt, project, ctx);
      return {
        content: `> ⚠️ **OpenAI Error (${activeModel})**: ${errMsg}\n> *Falling back to Local Lore Synthesizer:*\n\n---\n\n${fallback.content}`,
        contextSummary: [...ctx.summaryBadges, 'OpenAI (Fallback)'],
        proposals: fallback.proposals,
      };
    }
  }

  // 5. CUSTOM OPENAI-COMPATIBLE (Ollama, LM Studio, Groq, etc.)
  if (settings.activeProvider === 'custom_openai') {
    try {
      let endpoint = (settings.customOpenAiBaseUrl || 'http://localhost:11434/v1').trim().replace(/\/+$/, '');
      if (!endpoint.endsWith('/chat/completions')) {
        endpoint = `${endpoint}/chat/completions`;
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.customOpenAiApiKey?.trim()) {
        headers['Authorization'] = `Bearer ${settings.customOpenAiApiKey.trim()}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: ctx.systemContextBlock },
            { role: 'user', content: userPrompt },
          ],
          temperature,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || 'No response from custom endpoint.';
      const proposals = buildSmartProposalsForPrompt(userPrompt, project, ctx.activeEntity);

      return {
        content: text,
        contextSummary: [...ctx.summaryBadges, `Custom: ${activeModel}`],
        proposals,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('Custom endpoint call failed:', errMsg);
      const fallback = synthesizeLocalLoreResponse(userPrompt, project, ctx);
      return {
        content: `> ⚠️ **Custom Endpoint Error (${activeModel})**: ${errMsg}\n> *Ensure local server (Ollama/LM Studio) is running with CORS enabled.*\n\n---\n\n${fallback.content}`,
        contextSummary: [...ctx.summaryBadges, 'Custom Endpoint (Fallback)'],
        proposals: fallback.proposals,
      };
    }
  }

  // 6. BUILT-IN LOCAL CONTEXT-GROUNDED LORE SYNTHESIZER (Offline & Free)
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

// ==========================================
// CHARACTER AI ROLEPLAY & DIALOGUE
// ==========================================

/**
 * Assembles a comprehensive, lore-grounded roleplay system instruction
 * directing the LLM to strictly embody the character's persona, knowledge boundaries,
 * vocabulary, emotional tone, and worldview within the active world timeline.
 */
export function buildCharacterRoleplayPrompt(
  character: Entity,
  project: Project,
  userPersona: string = 'A stranger',
  otherParticipants: Entity[] = [],
  steeringDirective?: string
): string {
  const world = project.worlds.find((w) => w.id === character.worldId);
  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) ||
    project.calendars[0];
  const currentDate = calendar
    ? formatTickToDate(calendar, project.currentTick).displayFull
    : `Tick ${project.currentTick}`;

  // Active temporal state at current tick
  const activeTemporal = character.temporalStates?.find(
    (s) =>
      s.fromTick <= project.currentTick &&
      (s.toTick === undefined || s.toTick >= project.currentTick)
  );

  // Spatio-temporal map location at current tick
  const latestLocation = character.spatialKeyframes
    ?.filter((k) => k.tick <= project.currentTick)
    ?.sort((a, b) => b.tick - a.tick)?.[0];
  const currentMap = latestLocation
    ? project.maps.find((m) => m.id === latestLocation.mapId)
    : null;

  // Connected relations from Knowledge Graph
  const outgoing = project.relations.filter((r) => r.sourceEntityId === character.id);
  const incoming = project.relations.filter((r) => r.targetEntityId === character.id);

  const relationsSummary = [
    ...outgoing.map((r) => {
      const tgt = project.entities.find((e) => e.id === r.targetEntityId);
      return tgt
        ? `- ${r.type.replace(/_/g, ' ')} → [[${tgt.title}]] (${tgt.category}): ${r.label || 'Canonical relationship'}`
        : '';
    }),
    ...incoming.map((r) => {
      const src = project.entities.find((e) => e.id === r.sourceEntityId);
      return src
        ? `- is ${r.type.replace(/_/g, ' ')} of [[${src.title}]] (${src.category}): ${r.label || 'Canonical relationship'}`
        : '';
    }),
  ]
    .filter(Boolean)
    .join('\n');

  // Custom properties / traits
  const propertiesSummary = character.customProperties
    ?.map((p) => `- **${p.label}**: ${p.value}`)
    .join('\n');

  const otherParticipantsSummary = otherParticipants.length > 0
    ? `\n## OTHER CHARACTERS PRESENT IN THIS CONVERSATION:\nYou are part of an ongoing scene/group discussion. The following inhabitants are present with you:\n${otherParticipants
        .map((other) => {
          const rel = project.relations.find(
            (r) =>
              (r.sourceEntityId === character.id && r.targetEntityId === other.id) ||
              (r.targetEntityId === character.id && r.sourceEntityId === other.id)
          );
          return `- **${other.title}** (${other.category}): ${other.subtitle || other.summary || ''}${rel ? ` [Relationship: ${rel.label || rel.type}]` : ''}`;
        })
        .join('\n')}\nYou may react to, address, argue with, or converse directly with these other characters as well as ${userPersona}.\n`
    : '';

  const steeringSection = steeringDirective && steeringDirective.trim()
    ? `\n## SCENE STEERING / DIRECTOR INSTRUCTION:\n*The scene director has issued this narrative direction or event for your next response:*\n"${steeringDirective.trim()}"\nIncorporate this steering directive naturally into your tone, reaction, or words while staying strictly in-character.\n`
    : '';

  return `You are roleplaying as **${character.title}**, an authentic in-world inhabitant of **${project.name}** (${project.genre}).

## YOUR IDENTITY & CANONICAL PERSONA:
- **Name / Title**: ${character.title}
${character.subtitle ? `- **Role / Epithet**: ${character.subtitle}` : ''}
${character.summary ? `- **Core Summary**: ${character.summary}` : ''}
- **Category**: ${character.category} ${character.subcategory ? `(${character.subcategory})` : ''}
${world ? `- **Home Realm / Plane**: ${world.name}` : ''}
${character.tags.length > 0 ? `- **Traits & Tags**: ${character.tags.join(', ')}` : ''}

${propertiesSummary ? `## YOUR TRAITS & STATS:\n${propertiesSummary}\n` : ''}

## CURRENT WORLD TIMELINE & LOCATION:
- **Current Global Date**: ${currentDate}
${activeTemporal ? `- **Current State / Title**: ${activeTemporal.status || 'Active'} (${activeTemporal.notes || ''})` : ''}
${currentMap && latestLocation ? `- **Current Physical Location**: Coordinates (${Math.round(latestLocation.x)}, ${Math.round(latestLocation.y)}) on ${currentMap.name}${latestLocation.statusNote ? ` — ${latestLocation.statusNote}` : ''}` : ''}

## CANONICAL CODEX & BIOGRAPHY:
${character.contentMd}

## YOUR ALLIANCES, RIVALS & CONNECTIONS:
${relationsSummary || '- No explicit personal rivals or alliances noted in immediate records.'}
${otherParticipantsSummary}
## THE PERSON CONVERSING WITH YOU:
- **Speaking Persona**: ${userPersona}
- **CRITICAL**: Treat them strictly as **${userPersona}** (a stranger and outsider who has approached you). DO NOT assume they are a chronicler, scholar, historian, deity, world creator, or author unless they explicitly state so in dialogue. Respond with the natural skepticism, courtesy, distance, or guardedness appropriate when speaking to a stranger.
${steeringSection}
## MANDATORY PRE-RESPONSE REFLECTION — ASK YOURSELF: "SHOULD I KNOW THIS?":
Before formulating your reply, you must internally review what **${character.title}** would realistically know, perceive, and be willing to disclose to **${userPersona}**:

1. **Station & Reach ("Could I realistically know this?")**:
   - Assess your social rank, occupation, and physical realm. A soldier, scout, merchant, or local magistrate does NOT know classified imperial council cabals, deep cosmological anomalies, or foreign planar secrets.
   - If asked about faraway lands you have never visited, obscure magic outside your purview, or events where you were not present, **ADMIT IGNORANCE**, express genuine skepticism, or share only superstitious tavern gossip rather than factual certainty:
     *(e.g., "You ask of matters far beyond my station; such tales belong to wandering bards, not a practical soldier.")*

2. **Chronological Horizon ("Does this happen in my future?")**:
   - The current world date is strictly: **${currentDate}** (Timeline Tick ${project.currentTick}).
   - You have **ZERO knowledge** of events, battles, treaties, or deaths dated AFTER ${currentDate}.
   - Even if text in your background codex mentions your future demise or later wars, you are living in the PRESENT moment of ${currentDate}. You cannot foresee or speak of your future.

3. **Trust & Self-Preservation ("Would I actually reveal this to ${userPersona}?")**:
   - You are speaking with an outsider: **${userPersona}**.
   - If an inquiry touches upon your private crimes, concealed loyalties, secret bloodlines, or vulnerable ambitions, **DO NOT blurt them out**.
   - Guard your secrets with appropriate suspicion, misdirection, deflection, or outright denial as fits your temperament.

4. **Living Mortal vs. Encyclopedia**:
   - Never speak like Wikipedia or a helpful AI search engine. Speak with personal bias, flawed memory, cultural prejudices, and personal stakes.

## ROLEPLAY GUIDELINES:
1. **Never break character**: Speak strictly in the first-person ("I", "my", "we"). Embody ${character.title}'s voice, cadence, philosophy, fears, and temperament.
2. **In-World Awareness**: You have NO knowledge of modern AI, LLMs, or real-world concepts. Do not break the fourth wall.
3. **Double-Bracket Linking**: Always wrap known people, factions, places, and relics in double brackets (e.g. [[City of Vaelor]]) so Worldify links them into the Knowledge Graph.
4. **Mannerisms & Nuance**: Feel free to include brief italicized mannerisms or actions (e.g. *leans forward*, *lowers their voice*, *touches the ancient crest*) to give the conversation presence.
5. **Conversational Length & Punchiness**: Keep responses concise and conversational (typically 1 to 2 short paragraphs or a few lines of spoken dialogue, rarely more than 2-4 sentences total unless specifically pressed for an elaborate history). Spoken exchanges should feel immediate, punchy, and alive—never an essay or long monologue.`;
}

function sanitizeClaudeMessages(
  msgs: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (msgs.length === 0) return [{ role: 'user', content: '...' }];
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of msgs) {
    if (result.length > 0 && result[result.length - 1].role === m.role) {
      result[result.length - 1].content += `\n\n${m.content}`;
    } else {
      result.push({ ...m });
    }
  }
  if (result.length > 0 && result[0].role !== 'user') {
    result.unshift({ role: 'user', content: 'Continue the dialogue in-character.' });
  }
  return result;
}

/**
 * Generates an in-character AI response across the active LLM provider (OpenRouter, Gemini, Claude, OpenAI, Custom/Local)
 * with multi-turn conversation memory, multi-character presence, narrative steering, and local fallback.
 */
export async function generateCharacterDialogueResponse(
  character: Entity,
  userMessage: string,
  history: CharacterChatMessage[],
  userPersona: string = 'A stranger',
  project: Project,
  settings: AISettings,
  otherParticipants: Entity[] = [],
  steeringDirective?: string
): Promise<string> {
  const systemPrompt = buildCharacterRoleplayPrompt(
    character,
    project,
    userPersona,
    otherParticipants,
    steeringDirective
  );
  const activeModel = getActiveModel(settings);
  const temperature = settings.temperature ?? 0.75;
  const recentHistory = history.slice(-10);

  // Format turns so this character's previous turns are assistant, and all other speakers are user
  const formattedHistory = recentHistory.map((h) => {
    if (h.role === 'character' && h.characterId === character.id) {
      return { role: 'assistant' as const, content: h.content };
    } else if (h.role === 'system') {
      return { role: 'user' as const, content: `[Scene Event / Director Note]: ${h.content}` };
    } else {
      return { role: 'user' as const, content: `${h.speakerName}: ${h.content}` };
    }
  });

  const lastHistoryContent = recentHistory[recentHistory.length - 1]?.content;
  const hasUserMessage = userMessage.trim().length > 0;
  const shouldAppendMessage =
    hasUserMessage && userMessage.trim() !== lastHistoryContent?.trim();

  // 1. OPENROUTER
  if (settings.activeProvider === 'openrouter' && settings.openrouterApiKey.trim()) {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...formattedHistory,
        ...(shouldAppendMessage ? [{ role: 'user', content: userMessage.trim() }] : []),
      ];

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openrouterApiKey.trim()}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://worldify.app',
          'X-Title': 'Worldify Studio',
        },
        body: JSON.stringify({
          model: activeModel,
          messages,
          temperature,
          max_tokens: 450,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return text.trim();
      }
    } catch (e) {
      console.warn('OpenRouter character chat error, falling back:', e);
    }
  }

  // 2. GOOGLE GEMINI
  if (settings.activeProvider === 'gemini' && settings.geminiApiKey.trim()) {
    try {
      const contents = [
        ...formattedHistory.map((h) => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content }],
        })),
        ...(shouldAppendMessage ? [{ role: 'user', parts: [{ text: userMessage.trim() }] }] : []),
      ];

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${encodeURIComponent(
          settings.geminiApiKey.trim()
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: {
              temperature,
              maxOutputTokens: 450,
            },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      }
    } catch (e) {
      console.warn('Gemini character chat error, falling back:', e);
    }
  }

  // 3. ANTHROPIC CLAUDE
  if (settings.activeProvider === 'anthropic' && settings.anthropicApiKey.trim()) {
    try {
      const rawClaudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        ...formattedHistory,
        ...(shouldAppendMessage ? [{ role: 'user' as const, content: userMessage.trim() }] : []),
      ];
      const messages = sanitizeClaudeMessages(rawClaudeMessages);

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
          max_tokens: 450,
          system: systemPrompt,
          messages,
          temperature,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.content?.[0]?.text;
        if (text) return text.trim();
      }
    } catch (e) {
      console.warn('Anthropic character chat error, falling back:', e);
    }
  }

  // 4. OPENAI
  if (settings.activeProvider === 'openai' && settings.openaiApiKey.trim()) {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...formattedHistory,
        ...(shouldAppendMessage ? [{ role: 'user', content: userMessage.trim() }] : []),
      ];

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openaiApiKey.trim()}`,
        },
        body: JSON.stringify({
          model: activeModel,
          messages,
          temperature,
          max_tokens: 450,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return text.trim();
      }
    } catch (e) {
      console.warn('OpenAI character chat error, falling back:', e);
    }
  }

  // 5. CUSTOM OPENAI-COMPATIBLE (Ollama, LM Studio, etc.)
  if (settings.activeProvider === 'custom_openai') {
    try {
      let endpoint = (settings.customOpenAiBaseUrl || 'http://localhost:11434/v1').trim().replace(/\/+$/, '');
      if (!endpoint.endsWith('/chat/completions')) {
        endpoint = `${endpoint}/chat/completions`;
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.customOpenAiApiKey?.trim()) {
        headers['Authorization'] = `Bearer ${settings.customOpenAiApiKey.trim()}`;
      }
      const messages = [
        { role: 'system', content: systemPrompt },
        ...formattedHistory,
        ...(shouldAppendMessage ? [{ role: 'user', content: userMessage.trim() }] : []),
      ];

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: activeModel,
          messages,
          temperature,
          max_tokens: 450,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return text.trim();
      }
    } catch (e) {
      console.warn('Custom endpoint character chat error, falling back:', e);
    }
  }

  // 6. LOCAL DETERMINISTIC ROLEPLAY ENGINE (Offline fallback)
  return synthesizeLocalCharacterDialogue(
    character,
    userMessage,
    userPersona,
    project,
    otherParticipants,
    steeringDirective
  );
}

/**
 * Generates an autonomous dialogue turn between two or more characters in a scene,
 * honoring active timeline state, relationships, and optional director steering.
 */
export async function generateCharacterToCharacterExchange(
  speaker: Entity,
  allParticipants: Entity[],
  history: CharacterChatMessage[],
  userPersona: string = 'A stranger',
  steeringDirective: string | undefined,
  project: Project,
  settings: AISettings
): Promise<string> {
  const otherParticipants = allParticipants.filter((p) => p.id !== speaker.id);
  const prompt = steeringDirective && steeringDirective.trim()
    ? `Respond in-character to the ongoing conversation, taking into account this director steering directive: "${steeringDirective.trim()}". Keep your response punchy and conversational.`
    : `Respond in-character to the ongoing conversation with ${otherParticipants.map((p) => p.title).join(', ')}. Keep your response punchy and conversational.`;

  return generateCharacterDialogueResponse(
    speaker,
    prompt,
    history,
    userPersona,
    project,
    settings,
    otherParticipants,
    steeringDirective
  );
}

/**
 * Synthesizes an initial greeting for when you first approach a character
 */
export async function generateInitialCharacterGreeting(
  character: Entity,
  userPersona: string,
  project: Project,
  settings: AISettings,
  otherParticipants: Entity[] = []
): Promise<string> {
  const prompt = `Give a brief, evocative in-character opening greeting (1 to 2 sentences) addressing ${userPersona} who has just approached you${otherParticipants.length > 0 ? ` alongside ${otherParticipants.map(o => o.title).join(', ')}` : ''}. Keep it concise.`;
  return generateCharacterDialogueResponse(
    character,
    prompt,
    [],
    userPersona,
    project,
    settings,
    otherParticipants
  );
}

/**
 * Built-in local roleplay synthesizer when offline or without API keys
 */
function synthesizeLocalCharacterDialogue(
  character: Entity,
  userMessage: string,
  userPersona: string,
  project: Project,
  otherParticipants: Entity[] = [],
  steeringDirective?: string
): string {
  const lower = (userMessage + ' ' + (steeringDirective || '')).toLowerCase();
  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) ||
    project.calendars[0];
  const dateStr = calendar
    ? formatTickToDate(calendar, project.currentTick).displayShort
    : `Tick ${project.currentTick}`;

  // Find peer relationships
  const related = project.relations
    .filter((r) => r.sourceEntityId === character.id || r.targetEntityId === character.id)
    .map((r) => {
      const otherId = r.sourceEntityId === character.id ? r.targetEntityId : r.sourceEntityId;
      return project.entities.find((e) => e.id === otherId);
    })
    .filter((e): e is Entity => Boolean(e));

  const peerMention = otherParticipants[0]
    ? `[[${otherParticipants[0].title}]]`
    : related[0]
    ? `[[${related[0].title}]]`
    : 'our borders';

  if (steeringDirective && steeringDirective.trim()) {
    return `*reacts with sharp wariness to the sudden shift in the room*\n\n"You steer into treacherous waters. Concerning ${steeringDirective.trim()}... I say what must be said: our people will not be caught unprepared."`;
  }

  if (otherParticipants.length > 0) {
    const peer = otherParticipants[0];
    return `*turns their gaze toward [[${peer.title}]] before speaking*\n\n"We have debated this in silence long enough, ${peer.title}. The winds in **${project.name}** are turning, and neither of us can afford hesitation."`;
  }

  if (lower.includes('who are you') || lower.includes('your name') || lower.includes('background') || lower.includes('tell me about yourself')) {
    return `*regards you with measured scrutiny*\n\n"I am **${character.title}**${character.subtitle ? `, known as ${character.subtitle}` : ''}. We do not often see a stranger around these quarters in **${dateStr}**. What brings you to me?"`;
  }

  if (lower.includes('where are we') || lower.includes('location') || lower.includes('map') || lower.includes('here')) {
    const kf = character.spatialKeyframes?.[0];
    const map = kf ? project.maps.find((m) => m.id === kf.mapId) : project.maps[0];
    return `*gestures toward the road ahead*\n\n"We stand in **${map ? map.name : 'these lands'}**. In these times, a stranger does well to keep both eyes open."`;
  }

  if (lower.includes('friend') || lower.includes('ally') || lower.includes('rival') || lower.includes('enemy')) {
    return `*a subtle shadow crosses their expression*\n\n"Alliances here are written in water. If you speak of ${peerMention}, choose your words with care."`;
  }

  if (lower.includes('secret') || lower.includes('confess') || lower.includes('plot') || lower.includes('conspiracy') || lower.includes('hidden')) {
    return `*their expression hardens, gaze narrowing*\n\n"You ask of things too deep for a passing stranger. In **${project.name}**, curiosity without caution is a dangerous habit."`;
  }

  return `*observes you attentively, keeping their voice low*\n\n"You speak directly, stranger. In **${project.name}**, such boldness carries weight. If you wish to know more, watch how things unfold with ${peerMention}."`;
}

export interface WorldTravelRequest {
  mapId: string;
  coordinates: { x: number; y: number };
  actionType: 'travel_step' | 'scout' | 'encounter' | 'custom';
  customPrompt?: string;
  travelDestination?: string;
}

function cleanJsonResponseText(raw: string): string {
  let cleaned = raw.trim();
  // Remove markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * Procedural local travel synthesis engine.
 * Generates context-grounded, seasonally aware, lore-friendly travel logs, discoveries, and encounters offline.
 */
export function synthesizeLocalTravelExploration(
  request: WorldTravelRequest,
  project: Project
): WorldTravelLogEntry {
  const map = project.maps.find((m) => m.id === request.mapId) || project.maps[0];
  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) ||
    project.calendars[0];
  const formattedDate = calendar
    ? formatTickToDate(calendar, project.currentTick)
    : null;
  const season = formattedDate?.month.season.toLowerCase() || 'autumn';

  // Gather landmarks on this map
  interface Landmark {
    name: string;
    dist: number;
    kind: string;
  }
  const landmarks: Landmark[] = [];

  if (map) {
    for (const m of map.markers || []) {
      landmarks.push({
        name: m.name,
        dist: Math.hypot(m.x - request.coordinates.x, m.y - request.coordinates.y),
        kind: m.icon || 'landmark',
      });
    }
    if (map.proceduralData?.burgs) {
      for (const b of map.proceduralData.burgs) {
        landmarks.push({
          name: b.name,
          dist: Math.hypot(b.x - request.coordinates.x, b.y - request.coordinates.y),
          kind: 'settlement',
        });
      }
    }
    for (const e of project.entities) {
      const kf = e.spatialKeyframes?.find((k) => k.mapId === map.id);
      if (kf) {
        landmarks.push({
          name: e.title,
          dist: Math.hypot(kf.x - request.coordinates.x, kf.y - request.coordinates.y),
          kind: e.category,
        });
      }
    }
  }

  landmarks.sort((a, b) => a.dist - b.dist);
  const closest = landmarks[0];
  const secondClosest = landmarks[1] || landmarks[0];
  const leadEntity = project.entities[0];

  // Determine regional name
  let locationName = '';
  if (closest && closest.dist < 60) {
    locationName = `Outskirts of ${closest.name}`;
  } else if (closest && closest.dist < 180) {
    locationName = `Wilds between ${closest.name} and ${secondClosest?.name || 'the Frontier'}`;
  } else {
    const lat = request.coordinates.y < 350 ? 'Northern' : request.coordinates.y > 650 ? 'Southern' : 'Central';
    const lon = request.coordinates.x < 350 ? 'Western' : request.coordinates.x > 650 ? 'Eastern' : 'Midland';
    locationName = `${lat} ${lon} Reaches of ${map ? map.name : project.name}`;
  }

  // Seasonal atmosphere snippet
  let weatherAtmosphere = 'A brisk overland breeze cuts across the terrain.';
  if (season.includes('winter') || season.includes('frost') || season.includes('snow')) {
    weatherAtmosphere = 'Rime frost silvers the ridge stones, and your breath plumes in pale clouds amidst the biting air.';
  } else if (season.includes('spring') || season.includes('bloom') || season.includes('thaw')) {
    weatherAtmosphere = 'Thawing streams carve through damp moss, filled with the pungent scent of petrichor and budding alpine flora.';
  } else if (season.includes('summer') || season.includes('sun') || season.includes('heat')) {
    weatherAtmosphere = 'Heat shimmers above the exposed bedrock as dry grass rustles under a bright, high sun.';
  } else {
    weatherAtmosphere = 'Auburn leaves drift along winding game trails under a quiet, contemplative grey sky.';
  }

  const dateLabel = formattedDate ? formattedDate.displayFull : `Timeline Tick ${project.currentTick}`;
  const moonPhrase = formattedDate?.moonPhases?.[0]
    ? ` Overhead, **${formattedDate.moonPhases[0].moon.name}** lingers in its *${formattedDate.moonPhases[0].phaseName}* phase.`
    : '';

  // Generate narrative based on actionType
  let narrative = '';
  let discovery: WorldTravelDiscovery | undefined;
  let encounter: WorldTravelEncounter | undefined;

  const seed = (Math.round(request.coordinates.x) * 31 + Math.round(request.coordinates.y) * 17 + project.currentTick) % 1000;

  if (request.actionType === 'travel_step') {
    const dest = request.travelDestination || closest?.name || 'the uncharted horizon';
    narrative = `You press onward through **${locationName}**, heading toward **${dest}**. ${weatherAtmosphere}${moonPhrase}\n\nAlong the rugged trail, the geology shifts noticeably, revealing weathering patterns shaped during *${formattedDate?.era.name || 'ages past'}*. Signs of passing caravans and native wildlife suggest that [[${closest?.name || leadEntity?.title || 'the realm'}]] keeps an observant eye on these transit routes.`;

    // 60% chance of discovery while traveling
    if (seed % 2 === 0) {
      discovery = buildProceduralDiscovery(seed, request.coordinates, locationName, closest?.name || leadEntity?.title || 'the realm', project);
    }
  } else if (request.actionType === 'scout') {
    narrative = `Taking vantage from an elevated ridge within **${locationName}**, you scout the surrounding territory with careful attention. ${weatherAtmosphere}\n\nThe expanse reveals old boundaries, geomantic ridges, and faint trails worn into the soil. Beyond a cluster of ancient windbreaks, an anomaly catches your eye—something not recorded on standard cartographic surveys of ${map ? map.name : 'this region'}.`;

    discovery = buildProceduralDiscovery(seed + 13, request.coordinates, locationName, closest?.name || leadEntity?.title || 'the realm', project);
  } else if (request.actionType === 'encounter') {
    narrative = `As you navigate the contours of **${locationName}**, footsteps and the metallic clink of traveler's gear alert you to another presence. ${weatherAtmosphere}\n\nEmerging through the terrain, an inhabitant pauses, hand instinctively resting near their satchel as their eyes meet yours across the trail.`;

    encounter = buildProceduralEncounter(seed + 27, locationName, closest?.name || leadEntity?.title || 'the realm', project);
  } else {
    // Custom action
    const customPrompt = request.customPrompt || 'You explore the vicinity.';
    narrative = `Responding to your intent ("*${customPrompt}*"), you search across **${locationName}**. ${weatherAtmosphere}${moonPhrase}\n\nThe frontier yields unexpected secrets to those who look beyond the obvious paths. Echoes of historical events tied to [[${closest?.name || leadEntity?.title || project.name}]] surface in subtle clues scattered across the landscape.`;

    if (seed % 2 === 0) {
      discovery = buildProceduralDiscovery(seed + 41, request.coordinates, locationName, closest?.name || leadEntity?.title || 'the realm', project);
    } else {
      encounter = buildProceduralEncounter(seed + 59, locationName, closest?.name || leadEntity?.title || 'the realm', project);
    }
  }

  return {
    id: `travel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    tick: project.currentTick,
    mapId: request.mapId,
    x: request.coordinates.x,
    y: request.coordinates.y,
    actionPrompt: request.customPrompt || request.actionType,
    actionType: request.actionType,
    locationName,
    narrative,
    discovery,
    encounter,
  };
}

function buildProceduralDiscovery(
  seed: number,
  coordinates: { x: number; y: number },
  locationName: string,
  anchorEntityName: string,
  project: Project
): WorldTravelDiscovery {
  const categories: EntityCategory[] = ['location', 'species', 'item', 'magic_tech', 'event_lore'];
  const cat = categories[seed % categories.length];

  const discoveryTemplates: Partial<Record<
    EntityCategory,
    Array<{ name: string; summary: string; lore: string; tags: string[] }>
  >> = {
    location: [
      {
        name: `Sunken Basalt Shrine of ${anchorEntityName}`,
        summary: `A semi-submerged ceremonial shrine half-buried in the soil, etched with pre-cataclysmic sigils.`,
        lore: `### Architectural Features\nConstructed from interlocking hexagonal basalt pillars, this site retains a mild residual harmonic resonance.\n\n### Historical Ties\nBelieved to date back to early pilgrimages tied to [[${anchorEntityName}]]. Ancient wanderers placed votive tokens here to pray for safe passage across the wild frontiers of **${project.name}**.\n\n### Discovery Coordinates\nLocated at Map Coordinates (${Math.round(coordinates.x)}, ${Math.round(coordinates.y)}).`,
        tags: ['ruins', 'shrine', 'basalt', 'discovery'],
      },
      {
        name: `Wayfarer's Watch Hollow`,
        summary: `A naturally concealed subterranean cavern used by frontier rangers and outcasts.`,
        lore: `### Hidden Refuge\nNaturally shielded beneath a copse of gnarled roots, this shelter contains petrified hearthstones and cached trail markers.\n\n### Tactical Value\nOffers an unobstructed vantage over the approaches to [[${anchorEntityName}]], making it an invaluable waystation for clandestine couriers.`,
        tags: ['cavern', 'shelter', 'waystation', 'discovery'],
      },
    ],
    species: [
      {
        name: `Silver-Veined Moss-Stalker`,
        summary: `An elusive quadruped beast whose coat mimics mineral deposits and ancient lichen.`,
        lore: `### Ecology & Habitat\nNative to the rocky highlands surrounding **${locationName}**, this creature feeds on mineral-rich bryophytes and nocturnal insects.\n\n### Lore & Behavior\nLocal folklore claims that spotting a Moss-Stalker indicates the proximity of subterranean veins linked to [[${anchorEntityName}]]. When startled, it releases a shimmering cloud of reflective spores.`,
        tags: ['fauna', 'creature', 'beast', 'discovery'],
      },
      {
        name: `Astral Dune-Scarab`,
        summary: `A bioluminescent insect whose shell phosphoresces in response to celestial moon phases.`,
        lore: `### Unique Biology\nIts hardened elytra absorb ambient stellar radiation during clear nights, glowing with a soft sapphire phosphorescence.\n\n### Usage in Alchemy\nCrushed carapaces are prized by scholars connected to [[${anchorEntityName}]] as a binding agent for long-lasting navigational inks.`,
        tags: ['fauna', 'insect', 'alchemical', 'discovery'],
      },
    ],
    item: [
      {
        name: `Weathered Astrolabe of the First Way`,
        summary: `A brass-alloy navigational ring inscribed with dual coordinate markers and star-charts.`,
        lore: `### Description & Craftsmanship\nThough tarnished with soil patina, the gears of this handheld astrolabe still rotate smoothly on counter-weighted sapphire pins.\n\n### Cryptic Inscription\nA faded maker's seal matches archives found in [[${anchorEntityName}]], marking it as the lost instrument of a frontier surveyor.`,
        tags: ['relic', 'instrument', 'astrolabe', 'discovery'],
      },
      {
        name: `Petrified Ember-Root Talisman`,
        summary: `A smoothed piece of calcified root that still emits a faint, comforting warmth to the touch.`,
        lore: `### Origins\nHarvested from deep root systems before the Great Burning, these amulets never fully surrender their latent thermal charge.\n\n### Properties\nKeeps its bearer's hands nimble in freezing blizzards and wards off minor frost-spiders native to **${project.name}**.`,
        tags: ['curio', 'talisman', 'warmth', 'discovery'],
      },
    ],
    magic_tech: [
      {
        name: `Resonant Harmonic Boundary Pillar`,
        summary: `A spire of dark stone humming faintly at an infrasonic frequency, marking an arcane territory border.`,
        lore: `### Arcane Mechanics\nThe monolith channels ambient ley-lines through vertical crystalline seams, maintaining a perimeter ward established decades ago.\n\n### Current State\nOne quadrant is fractured, causing localized weather anomalies and electrical sparks whenever storms sweep through **${locationName}**. Tied directly to defenses around [[${anchorEntityName}]].`,
        tags: ['ward', 'monolith', 'leyline', 'discovery'],
      },
    ],
    event_lore: [
      {
        name: `Site of the Broken Parley`,
        summary: `A grassy plateau marked by shattered standard-poles and scorched earth where an ancient truce collapsed.`,
        lore: `### Historical Incident\nCenturies ago, envoys from [[${anchorEntityName}]] met with frontier dissidents here to negotiate safe trade corridors. The parley disintegrated when an unpredicted magical surge ignited the delegates' pavilion.\n\n### Lingering Memorials\nTravelers still lay grey river-pebbles upon the scorched stones in memory of the fallen ambassadors.`,
        tags: ['battlefield', 'history', 'treaty', 'discovery'],
      },
    ],
    character: [
      {
        name: `The Hermit of the High Cairn`,
        summary: `A reclusive chronicler who has watched the skies and borders from this ridge for forty seasons.`,
        lore: `### Background\nHaving renounced allegiance to [[${anchorEntityName}]], this solitary figure keeps extensive vellum scrolls documenting the migrations and political shifts across **${project.name}**.\n\n### Secret Knowledge\nPossesses unmapped shortcuts through the ravines and knows the exact seasonal movements of local patrols.`,
        tags: ['hermit', 'chronicler', 'recluse', 'discovery'],
      },
    ],
  };

  const pool = discoveryTemplates[cat] || discoveryTemplates.location!;
  const picked = pool[seed % pool.length];

  return {
    id: `disc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: picked.name,
    name: picked.name,
    category: cat,
    summary: picked.summary,
    contentMd: picked.lore,
    loreDetails: picked.lore,
    tags: picked.tags,
    mapId: 'map',
    x: coordinates.x,
    y: coordinates.y,
    tick: project.currentTick,
  };
}

function buildProceduralEncounter(
  seed: number,
  locationName: string,
  anchorEntityName: string,
  project: Project
): WorldTravelEncounter {
  const encounterTemplates = [
    {
      title: 'A Solitary Outrider on the Ridge',
      npcName: 'Kaelen Thorne',
      npcRole: 'Frontier Outrider',
      npcFaction: `Wardens of ${anchorEntityName}`,
      disposition: 'mysterious' as const,
      quote: `"Keep your blade sheathed, stranger. The paths near [[${anchorEntityName}]] are watchful, and few travel this deep without a covert cause."`,
      context: `Seated atop a sturdy pack-mount, Kaelen adjusts a worn leather cloak while scanning the surrounding trails for irregular movement.`,
    },
    {
      title: 'A Traveling Alchemical Peddler',
      npcName: 'Elora Finch',
      npcRole: 'Itinerant Herbalist & Peddler',
      npcFaction: 'Guild of Wandering Apothecaries',
      disposition: 'friendly' as const,
      quote: `"Hail, wanderer! Have you any dried star-thistle? The harvest in **${project.name}** has been scarce this season, and [[${anchorEntityName}]] will pay handsomely for fresh tincture."`,
      context: `Elora is tending to a two-wheeled cart packed with wicker baskets, amber glass phials, and bundles of fragrant drying sage.`,
    },
    {
      title: 'A Disillusioned Deserter',
      npcName: 'Branoc of the Iron Gate',
      npcRole: 'Ex-Garrison Guard',
      npcFaction: 'Unbound Deserters',
      disposition: 'fearful' as const,
      quote: `"If you're an agent from [[${anchorEntityName}]], tell them I'm already dead. I have no more blood to spill for decrees written by kings in golden halls."`,
      context: `Huddled beside a smokeless juniper fire in a shallow ditch, Branoc nervously sharpens a notched shortsword while eyeing your footsteps.`,
    },
    {
      title: 'An Astromancer in Pilgrimage',
      npcName: 'Vesperis the Silent',
      npcRole: 'Wandering Celestial Scholar',
      npcFaction: 'Order of the Horizon',
      disposition: 'neutral' as const,
      quote: `"Look to the zenith, traveler. The celestial conjunction above **${locationName}** aligns precisely with the prophecies recorded in the First Age."`,
      context: `Vesperis stands motionless with a polished brass sextant resting against an eye, making precise notations in a silver-edged ledger.`,
    },
  ];

  const picked = encounterTemplates[seed % encounterTemplates.length];

  return {
    id: `enc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: picked.title,
    summary: picked.context,
    npcName: picked.npcName,
    npcRole: picked.npcRole,
    npcFactionOrAffiliation: picked.npcFaction,
    disposition: picked.disposition,
    dialogueQuote: picked.quote,
    dialogueContext: picked.context,
    dangerLevel:
      picked.disposition === 'mysterious'
        ? 'mysterious'
        : picked.disposition === 'fearful'
        ? 'curious'
        : 'peaceful',
    npc: {
      name: picked.npcName,
      category: 'character',
      role: picked.npcRole,
      personality: picked.disposition,
      greeting: picked.quote,
    },
  };
}

/**
 * Main AI World Travel Engine.
 * Supports BYOK providers (OpenRouter, Gemini, Anthropic, OpenAI, Custom) with graceful fallback to local synthesis.
 */
export async function generateWorldTravelExploration(
  request: WorldTravelRequest,
  project: Project,
  settings: AISettings
): Promise<WorldTravelLogEntry> {
  const map = project.maps.find((m) => m.id === request.mapId) || project.maps[0];
  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) ||
    project.calendars[0];
  const formattedDate = calendar
    ? formatTickToDate(calendar, project.currentTick)
    : null;

  // If local synthesizer is selected, generate immediately
  if (settings.activeProvider === 'local_synthesizer') {
    return synthesizeLocalTravelExploration(request, project);
  }

  // Assemble spatiotemporal RAG context for prompt
  const activeWorld = project.worlds.find((w) => w.id === project.activeWorldId);
  const dateStr = formattedDate ? formattedDate.displayFull : `Timeline Tick ${project.currentTick}`;
  const seasonStr = formattedDate ? formattedDate.month.season : 'Unknown Season';
  const eraStr = formattedDate ? `${formattedDate.era.name} (${formattedDate.era.description})` : 'Unknown Era';

  // Find landmarks and entities within map radius
  const mapLandmarks: string[] = [];
  if (map) {
    for (const m of map.markers.slice(0, 8)) {
      mapLandmarks.push(`- Marker: ${m.name} (${m.icon || 'landmark'}, at x:${Math.round(m.x)}, y:${Math.round(m.y)})`);
    }
    if (map.proceduralData?.burgs) {
      for (const b of map.proceduralData.burgs.slice(0, 8)) {
        mapLandmarks.push(`- Burg/Settlement: ${b.name} (population: ${b.population || 'rural'}, at x:${Math.round(b.x)}, y:${Math.round(b.y)})`);
      }
    }
  }

  const prominentEntities = project.entities.slice(0, 10).map((e) => `- [[${e.title}]] (${e.category}): ${e.summary}`);

  const systemPrompt = `You are the Immersive World Travel & Spatio-Temporal Exploration Engine for Worldify.
You generate vivid, lore-grounded, atmospheric travel logs, random discoveries, and encounters.

CANONICAL WORLD STATE:
Project: "${project.name}" (Genre: ${project.genre})
Overview: ${project.description}
Active World: ${activeWorld ? `${activeWorld.name} (${activeWorld.magicOrPhysicsRules})` : 'Primary World'}
Current Temporal Position: ${dateStr} (Era: ${eraStr}, Season: ${seasonStr})
Active Map: "${map ? map.name : 'The Realm'}"
Traveler Current Coordinates: x=${Math.round(request.coordinates.x)}, y=${Math.round(request.coordinates.y)} (normalized 0-1000)

NEARBY KNOWN CARTOGRAPHIC LANDMARKS:
${mapLandmarks.join('\n') || 'Open uncharted wilderness'}

PROMINENT LORE ENTITIES IN THIS REALM:
${prominentEntities.join('\n')}

USER TRAVEL ACTION:
Action: ${request.actionType}
${request.travelDestination ? `Traveling Towards: ${request.travelDestination}` : ''}
${request.customPrompt ? `Player Directive: ${request.customPrompt}` : ''}

INSTRUCTIONS:
1. Ground the environment in the CURRENT SEASON (${seasonStr}), weather, time of day, and terrain of this region.
2. Weave existing factions, places, or relics into the travel narration using double brackets: [[Entity Name]].
3. Return STRICT VALID JSON matching this exact structure:
{
  "locationName": "Evocative regional or local name (e.g. 'Outskirts of ...' or 'Mist-Veiled Crags of ...')",
  "narrative": "1-3 atmospheric paragraphs describing sensory details, terrain, historical traces, and immediate sights.",
  "discovery": {
    "name": "Unique name of discovery",
    "category": "location" | "species" | "item" | "magic_tech" | "event_lore" | "character",
    "summary": "1-2 sentence summary for wiki cataloging",
    "loreDetails": "Rich markdown with sections (## History, ## Properties or Ecology, etc.), linking to [[Entities]].",
    "tags": ["tag1", "tag2"]
  },
  "encounter": {
    "title": "Short title describing the encounter (e.g. 'The Outrider at the Ford')",
    "npcName": "Full name of the encountered person or figure",
    "npcRole": "Their role or profession",
    "npcFactionOrAffiliation": "Faction or group they belong to",
    "disposition": "friendly" | "neutral" | "hostile" | "mysterious" | "fearful",
    "dialogueQuote": "An evocative direct quote spoken by the NPC",
    "dialogueContext": "Brief context on how they appear and what they are doing"
  }
}
If action is 'travel_step' or 'scout', discovery should be populated.
If action is 'encounter', encounter should be populated.
Return JSON ONLY, with no surrounding commentary or explanation.`;

  const activeModel = getActiveModel(settings);

  try {
    let jsonText = '';

    // 1. OPENROUTER
    if (settings.activeProvider === 'openrouter' && settings.openrouterApiKey.trim()) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openrouterApiKey.trim()}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://worldify.app',
          'X-Title': 'Worldify Travel Engine',
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Generate the travel exploration JSON for this location and action.' },
          ],
          temperature: settings.temperature ?? 0.75,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        jsonText = data?.choices?.[0]?.message?.content || '';
      }
    }

    // 2. GEMINI
    else if (settings.activeProvider === 'gemini' && settings.geminiApiKey.trim()) {
      const modelName = settings.geminiModel || 'gemini-2.5-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${settings.geminiApiKey.trim()}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nGenerate the travel exploration JSON.` }] }],
          generationConfig: {
            temperature: settings.temperature ?? 0.75,
            responseMimeType: 'application/json',
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    }

    // 3. ANTHROPIC CLAUDE
    else if (settings.activeProvider === 'anthropic' && settings.anthropicApiKey.trim()) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.anthropicApiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: settings.anthropicModel || 'claude-3-5-sonnet-latest',
          system: systemPrompt,
          messages: [{ role: 'user', content: 'Generate the travel exploration JSON.' }],
          max_tokens: 1500,
          temperature: settings.temperature ?? 0.75,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        jsonText = data?.content?.[0]?.text || '';
      }
    }

    // 4. OPENAI
    else if (settings.activeProvider === 'openai' && settings.openaiApiKey.trim()) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openaiApiKey.trim()}`,
        },
        body: JSON.stringify({
          model: settings.openaiModel || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Generate the travel exploration JSON.' },
          ],
          response_format: { type: 'json_object' },
          temperature: settings.temperature ?? 0.75,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        jsonText = data?.choices?.[0]?.message?.content || '';
      }
    }

    // 5. CUSTOM OPENAI-COMPATIBLE
    else if (settings.activeProvider === 'custom_openai') {
      const baseUrl = settings.customOpenAiBaseUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.customOpenAiApiKey.trim()) {
        headers['Authorization'] = `Bearer ${settings.customOpenAiApiKey.trim()}`;
      }
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: settings.customOpenAiModel || 'llama3',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Generate the travel exploration JSON.' },
          ],
          temperature: settings.temperature ?? 0.75,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        jsonText = data?.choices?.[0]?.message?.content || '';
      }
    }

    // Parse returned JSON
    if (jsonText.trim()) {
      const parsed = JSON.parse(cleanJsonResponseText(jsonText));
      return {
        id: `travel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        tick: project.currentTick,
        mapId: request.mapId,
        x: request.coordinates.x,
        y: request.coordinates.y,
        actionPrompt: request.customPrompt || request.actionType,
        actionType: request.actionType,
        locationName: parsed.locationName || `Wilds of ${map ? map.name : project.name}`,
        narrative: parsed.narrative || 'You explore the surrounding frontier.',
        discovery: parsed.discovery
          ? {
              id: `disc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: parsed.discovery.name || 'Mysterious Landmark',
              name: parsed.discovery.name || 'Mysterious Landmark',
              category: parsed.discovery.category || 'location',
              summary: parsed.discovery.summary || 'An uncharted discovery on the frontier.',
              contentMd: parsed.discovery.loreDetails || '',
              loreDetails: parsed.discovery.loreDetails || '',
              tags: Array.isArray(parsed.discovery.tags) ? parsed.discovery.tags : ['travel-discovery'],
              mapId: request.mapId,
              x: request.coordinates.x,
              y: request.coordinates.y,
              tick: project.currentTick,
            }
          : undefined,
        encounter: parsed.encounter
          ? {
              id: `enc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: parsed.encounter.title || 'An Encounter on the Trail',
              summary: parsed.encounter.dialogueContext || 'An encounter along the path.',
              npcName: parsed.encounter.npcName || 'Wandering Traveler',
              npcRole: parsed.encounter.npcRole || 'Wanderer',
              npcFactionOrAffiliation: parsed.encounter.npcFactionOrAffiliation,
              disposition: parsed.encounter.disposition || 'neutral',
              dialogueQuote: parsed.encounter.dialogueQuote || '"Safe journeys, traveler."',
              dialogueContext: parsed.encounter.dialogueContext || 'They pause along the trail.',
              dangerLevel:
                parsed.encounter.disposition === 'hostile'
                  ? 'perilous'
                  : parsed.encounter.disposition === 'fearful'
                  ? 'curious'
                  : 'peaceful',
              npc: {
                name: parsed.encounter.npcName || 'Wandering Traveler',
                category: 'character',
                role: parsed.encounter.npcRole || 'Wanderer',
                personality: parsed.encounter.disposition || 'neutral',
                greeting: parsed.encounter.dialogueQuote || '"Safe journeys, traveler."',
              },
            }
          : undefined,
      };
    }
  } catch (err) {
    console.warn('AI travel generation failed, falling back to local synthesizer:', err);
  }

  // Graceful fallback to procedural generator
  return synthesizeLocalTravelExploration(request, project);
}

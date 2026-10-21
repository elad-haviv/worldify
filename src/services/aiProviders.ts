import { AIProvider, AISettings } from '../types/worldify';

export interface AIModelPreset {
  id: string;
  name: string;
  description: string;
  badge?: 'Recommended' | 'Fast' | 'Reasoning' | 'Popular' | 'Free' | 'Offline';
  contextLength?: string;
}

export interface AIProviderInfo {
  id: AIProvider;
  name: string;
  shortName: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  docsUrl: string;
  keyPlaceholder: string;
  defaultModel: string;
  models: AIModelPreset[];
  requiresApiKey: boolean;
}

export const AI_PROVIDERS: Record<AIProvider, AIProviderInfo> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter (Universal)',
    shortName: 'OpenRouter',
    description: 'Unified gateway to 200+ models from Anthropic, OpenAI, Google, DeepSeek, Meta, and Mistral.',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    docsUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-v1-...',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    requiresApiKey: true,
    models: [
      {
        id: 'anthropic/claude-3.7-sonnet',
        name: 'Claude 3.7 Sonnet',
        description: 'Flagship hybrid reasoning and creative mastery for deep world lore.',
        badge: 'Recommended',
        contextLength: '200k',
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        description: 'Industry-standard literary & worldbuilding prose with rich tone control.',
        badge: 'Popular',
        contextLength: '200k',
      },
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        description: 'Flagship smart model for creative reasoning & multiverse architecture.',
        contextLength: '128k',
      },
      {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Fast, responsive, and highly cost-efficient brainstorming partner.',
        badge: 'Fast',
        contextLength: '128k',
      },
      {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Next-gen Google model with massive context and rapid generation.',
        badge: 'Fast',
        contextLength: '1M',
      },
      {
        id: 'google/gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'High-intelligence reasoning for complex timeline & knowledge graph audits.',
        badge: 'Reasoning',
        contextLength: '2M',
      },
      {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek R1',
        description: 'Open reasoning model for intricate magical laws, conspiracies & logic.',
        badge: 'Reasoning',
        contextLength: '64k',
      },
      {
        id: 'deepseek/deepseek-chat',
        name: 'DeepSeek V3',
        description: 'High-capability open architecture model with exceptional fluency.',
        contextLength: '64k',
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        name: 'Llama 3.3 70B',
        description: 'Meta flagship open model for dialogue, character backstories & quests.',
        contextLength: '128k',
      },
      {
        id: 'mistralai/mistral-large-2411',
        name: 'Mistral Large 2',
        description: 'Top-tier European multilingual & creative worldbuilding intelligence.',
        contextLength: '128k',
      },
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    description: 'Direct Google AI Studio integration with expansive context windows.',
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/10',
    borderColor: 'border-sky-500/30',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIzaSy...',
    defaultModel: 'gemini-2.5-flash',
    requiresApiKey: true,
    models: [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Recommended: Adaptive speed, vast context, and balanced reasoning.',
        badge: 'Recommended',
        contextLength: '1M',
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Deep cognitive reasoning for large knowledge bases & complex cosmologies.',
        badge: 'Reasoning',
        contextLength: '2M',
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        description: 'Ultra-fast low-latency responses for rapid scene drafting.',
        badge: 'Fast',
        contextLength: '1M',
      },
      {
        id: 'gemini-2.0-flash-lite',
        name: 'Gemini 2.0 Flash Lite',
        description: 'Ultra-economical workhorse for quick names & traits.',
        badge: 'Fast',
        contextLength: '1M',
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        description: 'Long-standing 2M token context window champion.',
        contextLength: '2M',
      },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    shortName: 'Claude',
    description: 'Direct Claude API with renowned narrative depth and prose quality.',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-...',
    defaultModel: 'claude-3-5-sonnet-latest',
    requiresApiKey: true,
    models: [
      {
        id: 'claude-3-7-sonnet-latest',
        name: 'Claude 3.7 Sonnet',
        description: 'Latest hybrid thinking & creative prose for intricate worldbuilding.',
        badge: 'Recommended',
        contextLength: '200k',
      },
      {
        id: 'claude-3-5-sonnet-latest',
        name: 'Claude 3.5 Sonnet',
        description: 'Industry benchmark for nuanced character voices & descriptions.',
        badge: 'Popular',
        contextLength: '200k',
      },
      {
        id: 'claude-3-5-haiku-latest',
        name: 'Claude 3.5 Haiku',
        description: 'Fast, responsive creative assistant.',
        badge: 'Fast',
        contextLength: '200k',
      },
      {
        id: 'claude-3-opus-latest',
        name: 'Claude 3 Opus',
        description: 'Deep philosophical reasoning and complex narrative synthesis.',
        contextLength: '200k',
      },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI GPT',
    shortName: 'OpenAI',
    description: 'Direct OpenAI API powering GPT-4o and o-series reasoning models.',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-...',
    defaultModel: 'gpt-4o-mini',
    requiresApiKey: true,
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'Flagship model for nuanced creative reasoning and lore generation.',
        badge: 'Recommended',
        contextLength: '128k',
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Fast, lightweight workhorse for quick queries and wiki stubs.',
        badge: 'Fast',
        contextLength: '128k',
      },
      {
        id: 'o3-mini',
        name: 'o3-mini',
        description: 'High-speed reasoning model tailored for logic, puzzles & math.',
        badge: 'Reasoning',
        contextLength: '128k',
      },
      {
        id: 'o1',
        name: 'o1',
        description: 'Advanced reasoning champion for deep cosmological consistency.',
        badge: 'Reasoning',
        contextLength: '128k',
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'High capability with 128k context.',
        contextLength: '128k',
      },
    ],
  },
  custom_openai: {
    id: 'custom_openai',
    name: 'Custom / Local (Ollama, LM Studio, Groq)',
    shortName: 'Custom/Local',
    description: 'Connect to any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, Groq, Mistral, Together).',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
    docsUrl: 'https://ollama.com/',
    keyPlaceholder: 'Optional (e.g. gsk_... for Groq, or leave empty for Ollama)',
    defaultModel: 'llama3',
    requiresApiKey: false,
    models: [
      {
        id: 'llama3',
        name: 'Llama 3 (Default Local)',
        description: 'Standard local model on Ollama (ollama run llama3).',
        badge: 'Offline',
      },
      {
        id: 'mistral',
        name: 'Mistral 7B (Local)',
        description: 'Lightweight local model with fast tokens per second.',
        badge: 'Offline',
      },
      {
        id: 'deepseek-r1',
        name: 'DeepSeek R1 (Local)',
        description: 'Local reasoning model on Ollama / LM Studio.',
        badge: 'Reasoning',
      },
      {
        id: 'qwen2.5',
        name: 'Qwen 2.5 (Local)',
        description: 'Strong open-weights multilingual and creative model.',
        badge: 'Offline',
      },
    ],
  },
  local_synthesizer: {
    id: 'local_synthesizer',
    name: 'Local Lore Synthesizer',
    shortName: 'Offline Engine',
    description: '100% offline, zero-key deterministic RAG synthesizer built into Worldify.',
    color: 'text-amber-300',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    docsUrl: '',
    keyPlaceholder: '',
    defaultModel: 'built-in-rag',
    requiresApiKey: false,
    models: [
      {
        id: 'built-in-rag',
        name: 'Deterministic RAG Engine',
        description: 'Assembles your wiki, spatial coordinates, timelines, and moon phases with zero network requests.',
        badge: 'Free',
      },
    ],
  },
};

/**
 * Returns the currently active model string based on activeProvider
 */
export function getActiveModel(settings: AISettings): string {
  switch (settings.activeProvider) {
    case 'openrouter':
      return settings.openrouterModel || AI_PROVIDERS.openrouter.defaultModel;
    case 'gemini':
      return settings.geminiModel || AI_PROVIDERS.gemini.defaultModel;
    case 'anthropic':
      return settings.anthropicModel || AI_PROVIDERS.anthropic.defaultModel;
    case 'openai':
      return settings.openaiModel || AI_PROVIDERS.openai.defaultModel;
    case 'custom_openai':
      return settings.customOpenAiModel || AI_PROVIDERS.custom_openai.defaultModel;
    case 'local_synthesizer':
    default:
      return 'built-in-rag';
  }
}

/**
 * Returns a patch to update the model for the given provider
 */
export function setModelForProvider(
  provider: AIProvider,
  model: string
): Partial<AISettings> {
  switch (provider) {
    case 'openrouter':
      return { openrouterModel: model };
    case 'gemini':
      return { geminiModel: model };
    case 'anthropic':
      return { anthropicModel: model };
    case 'openai':
      return { openaiModel: model };
    case 'custom_openai':
      return { customOpenAiModel: model };
    default:
      return {};
  }
}

/**
 * Returns whether an API key is set for the provider
 */
export function isProviderConfigured(provider: AIProvider, settings: AISettings): boolean {
  switch (provider) {
    case 'openrouter':
      return Boolean(settings.openrouterApiKey?.trim());
    case 'gemini':
      return Boolean(settings.geminiApiKey?.trim());
    case 'anthropic':
      return Boolean(settings.anthropicApiKey?.trim());
    case 'openai':
      return Boolean(settings.openaiApiKey?.trim());
    case 'custom_openai':
      return Boolean(settings.customOpenAiBaseUrl?.trim());
    case 'local_synthesizer':
      return true;
  }
}

/**
 * Quick ping test to verify the user's API key and model work
 */
export async function testProviderConnection(
  provider: AIProvider,
  settings: AISettings
): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const start = performance.now();

  try {
    if (provider === 'local_synthesizer') {
      return {
        success: true,
        message: 'Built-in Lore Synthesizer is operational (runs offline in browser).',
        latencyMs: 0,
      };
    }

    if (provider === 'openrouter') {
      if (!settings.openrouterApiKey.trim()) {
        throw new Error('Please enter an OpenRouter API key first.');
      }
      const model = settings.openrouterModel || AI_PROVIDERS.openrouter.defaultModel;
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openrouterApiKey.trim()}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://worldify.app',
          'X-Title': 'Worldify Studio',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "OK" in 1 word.' }],
          max_tokens: 10,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: true,
        message: `Successfully connected to ${model} on OpenRouter!`,
        latencyMs,
      };
    }

    if (provider === 'gemini') {
      if (!settings.geminiApiKey.trim()) {
        throw new Error('Please enter a Google Gemini API key first.');
      }
      const model = settings.geminiModel || AI_PROVIDERS.gemini.defaultModel;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          settings.geminiApiKey.trim()
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "OK" in 1 word.' }] }],
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: true,
        message: `Successfully connected to ${model} on Google AI Studio!`,
        latencyMs,
      };
    }

    if (provider === 'anthropic') {
      if (!settings.anthropicApiKey.trim()) {
        throw new Error('Please enter an Anthropic API key first.');
      }
      const model = settings.anthropicModel || AI_PROVIDERS.anthropic.defaultModel;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.anthropicApiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "OK" in 1 word.' }],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: true,
        message: `Successfully connected to ${model} on Anthropic!`,
        latencyMs,
      };
    }

    if (provider === 'openai') {
      if (!settings.openaiApiKey.trim()) {
        throw new Error('Please enter an OpenAI API key first.');
      }
      const model = settings.openaiModel || AI_PROVIDERS.openai.defaultModel;
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openaiApiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "OK" in 1 word.' }],
          max_tokens: 10,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: true,
        message: `Successfully connected to ${model} on OpenAI!`,
        latencyMs,
      };
    }

    if (provider === 'custom_openai') {
      let endpoint = (settings.customOpenAiBaseUrl || 'http://localhost:11434/v1').trim().replace(/\/+$/, '');
      if (!endpoint.endsWith('/chat/completions')) {
        endpoint = `${endpoint}/chat/completions`;
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.customOpenAiApiKey?.trim()) {
        headers['Authorization'] = `Bearer ${settings.customOpenAiApiKey.trim()}`;
      }
      const model = settings.customOpenAiModel || 'llama3';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "OK" in 1 word.' }],
          max_tokens: 10,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: true,
        message: `Successfully connected to ${model} on custom endpoint!`,
        latencyMs,
      };
    }

    return { success: false, message: 'Unknown provider', latencyMs: 0 };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg, latencyMs };
  }
}

/**
 * Fetch live available models directly from OpenRouter API
 */
export async function fetchLiveOpenRouterModels(
  apiKey?: string
): Promise<Array<{ id: string; name: string; contextLength?: number; description?: string }>> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return list
      .map((m: { id: string; name?: string; context_length?: number; description?: string }) => ({
        id: m.id,
        name: m.name || m.id,
        contextLength: m.context_length,
        description: m.description,
      }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
  } catch (e) {
    console.warn('Failed to fetch OpenRouter models:', e);
    return [];
  }
}

/**
 * Living World LLM plumbing — one JSON-mode call across the same BYOK
 * providers the rest of Worldify uses. Kept separate from aiService so the
 * simulation never falls back to prose synthesizers: a tick either gets a
 * real model or runs on code rules only.
 */
import { AISettings } from '../../types/worldify';
import { getActiveModel } from '../../services/aiProviders';

export interface LLMCallResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model: string;
}

/** Rough cost table for budget accounting (USD per 1M tokens). Precise per-model pricing lives on the provider side; this is a conservative estimate. */
const roughCost = (model: string, tin: number, tout: number): number => {
  const m = model.toLowerCase();
  let inPrice = 0.5;
  let outPrice = 1.5;
  if (m.includes('opus')) { inPrice = 15; outPrice = 75; }
  else if (m.includes('sonnet') || m.includes('gpt-4')) { inPrice = 3; outPrice = 15; }
  else if (m.includes('haiku') || m.includes('mini') || m.includes('flash') || m.includes('free')) { inPrice = 0.3; outPrice = 1.2; }
  return (tin / 1e6) * inPrice + (tout / 1e6) * outPrice;
};

const MAX_TOKENS_BY_ROLE: Record<string, number> = {
  character: 350,
  narrator: 1600,
  checker: 500,
  reflection: 400,
  historian: 900,
};

export async function callLLMJSON(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string,
  role: keyof typeof MAX_TOKENS_BY_ROLE
): Promise<LLMCallResult> {
  const model = getActiveModel(settings);
  const temperature = role === 'character' ? 0.8 : 0.4;
  const maxTokens = MAX_TOKENS_BY_ROLE[role] || 600;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let text = '';
  let tokensIn = 0;
  let tokensOut = 0;

  if (settings.activeProvider === 'openrouter' && settings.openrouterApiKey.trim()) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.openrouterApiKey.trim()}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://worldify.app',
        'X-Title': 'Worldify Studio — Living World',
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `OpenRouter HTTP ${res.status}`);
    }
    const data = await res.json();
    text = data?.choices?.[0]?.message?.content || '';
    tokensIn = data?.usage?.prompt_tokens ?? Math.ceil(systemPrompt.length / 4);
    tokensOut = data?.usage?.completion_tokens ?? Math.ceil(text.length / 4);
  } else if (settings.activeProvider === 'gemini' && settings.geminiApiKey.trim()) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(settings.geminiApiKey.trim())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    tokensIn = data?.usageMetadata?.promptTokenCount ?? Math.ceil(systemPrompt.length / 4);
    tokensOut = data?.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4);
  } else if (settings.activeProvider === 'anthropic' && settings.anthropicApiKey.trim()) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.anthropicApiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages, temperature }),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
    const data = await res.json();
    text = (data?.content || []).map((c: { text?: string }) => c.text || '').join('');
    tokensIn = data?.usage?.input_tokens ?? Math.ceil(systemPrompt.length / 4);
    tokensOut = data?.usage?.output_tokens ?? Math.ceil(text.length / 4);
  } else if (settings.activeProvider === 'openai' && settings.openaiApiKey.trim()) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.openaiApiKey.trim()}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, response_format: { type: 'json_object' } }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const data = await res.json();
    text = data?.choices?.[0]?.message?.content || '';
    tokensIn = data?.usage?.prompt_tokens ?? Math.ceil(systemPrompt.length / 4);
    tokensOut = data?.usage?.completion_tokens ?? Math.ceil(text.length / 4);
  } else if (settings.activeProvider === 'custom_openai') {
    let endpoint = (settings.customOpenAiBaseUrl || 'http://localhost:11434/v1').trim().replace(/\/+$/, '');
    if (!endpoint.endsWith('/chat/completions')) endpoint = `${endpoint}/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.customOpenAiApiKey?.trim()) headers.Authorization = `Bearer ${settings.customOpenAiApiKey.trim()}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    });
    if (!res.ok) throw new Error(`Custom endpoint HTTP ${res.status}`);
    const data = await res.json();
    text = data?.choices?.[0]?.message?.content || '';
    tokensIn = Math.ceil(systemPrompt.length / 4);
    tokensOut = Math.ceil(text.length / 4);
  } else {
    throw new Error('No AI provider configured for the Living World. Add an API key in AI Settings.');
  }

  return { text, tokensIn, tokensOut, costUsd: roughCost(model, tokensIn, tokensOut), model };
}

/** Tolerant JSON extraction: models like to wrap JSON in ``` fences or chatter. */
export function extractJSON<T>(raw: string): T {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : trimmed;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error('No JSON found in model response');
  const slice = candidate.slice(start);
  try {
    return JSON.parse(slice) as T;
  } catch {
    // Try trimming trailing prose after the last closing bracket.
    const lastCurly = slice.lastIndexOf('}');
    const lastSquare = slice.lastIndexOf(']');
    const end = Math.max(lastCurly, lastSquare);
    if (end > 0) return JSON.parse(slice.slice(0, end + 1)) as T;
    throw new Error('Model returned unparseable JSON');
  }
}

import React, { useState } from 'react';
import { useWorldifyStore } from '../store/useWorldifyStore';
import { generateAICopilotResponse } from '../services/aiService';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  Sparkles,
  X,
  Send,
  Settings,
  CheckCircle2,
  PlusCircle,
  Trash2,
  Network,
  Clock,
  MapPin,
  KeyRound,
  Wand2,
} from 'lucide-react';

export const AICopilotDrawer: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedEntityId,
    selectedMapId,
    isAICopilotOpen,
    toggleAICopilot,
    aiSettings,
    updateAISettings,
    aiMessages,
    addAIMessage,
    applyAIProposal,
    clearAIChat,
    selectEntity,
    createEntity,
  } = useWorldifyStore();

  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  if (!isAICopilotOpen) return null;

  const project = projects.find((p) => p.id === activeProjectId);
  if (!project) return null;

  const activeEntity = project.entities.find((e) => e.id === selectedEntityId);

  const handleSend = async (customPrompt?: string) => {
    const text = (customPrompt ?? prompt).trim();
    if (!text || isLoading) return;

    if (!customPrompt) setPrompt('');
    addAIMessage({
      role: 'user',
      content: text,
    });

    setIsLoading(true);
    try {
      const response = await generateAICopilotResponse(
        text,
        project,
        selectedEntityId,
        selectedMapId,
        aiSettings
      );
      addAIMessage({
        role: 'assistant',
        content: response.content,
        contextSummary: response.contextSummary,
        proposals: response.proposals,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="absolute right-0 top-0 bottom-0 w-[420px] max-w-full bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl shadow-black/60 z-40">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              AI Lore Copilot
            </h3>
            <p className="text-xs text-slate-400">
              Knows your wiki, map and timeline
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              showSettings
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Configure BYOK API Keys & RAG Context"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={clearAIChat}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
            title="Clear Chat History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => toggleAICopilot(false)}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
            title="Close Copilot"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* BYOK & RAG Settings Panel */}
      {showSettings && (
        <div className="p-3.5 bg-slate-950 border-b border-slate-800 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-amber-400 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              BYOK Provider & Model
            </span>
            <span className="text-xs text-slate-500">Stored locally in browser</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Active Engine</label>
              <select
                value={aiSettings.activeProvider}
                onChange={(e) =>
                  updateAISettings({
                    activeProvider: e.target.value as typeof aiSettings.activeProvider,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="local_synthesizer">Local Lore Synthesizer (Built-in)</option>
                <option value="gemini">Google Gemini (BYOK)</option>
                <option value="openai">OpenAI GPT (BYOK)</option>
                <option value="anthropic">Anthropic Claude (BYOK)</option>
              </select>
            </div>

            {aiSettings.activeProvider === 'gemini' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Gemini Model</label>
                <input
                  type="text"
                  value={aiSettings.geminiModel}
                  onChange={(e) => updateAISettings({ geminiModel: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
              </div>
            )}
            {aiSettings.activeProvider === 'openai' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">OpenAI Model</label>
                <input
                  type="text"
                  value={aiSettings.openaiModel}
                  onChange={(e) => updateAISettings({ openaiModel: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
              </div>
            )}
            {aiSettings.activeProvider === 'anthropic' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Claude Model</label>
                <input
                  type="text"
                  value={aiSettings.anthropicModel}
                  onChange={(e) => updateAISettings({ anthropicModel: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
              </div>
            )}
          </div>

          {aiSettings.activeProvider === 'gemini' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Google Gemini API Key</label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={aiSettings.geminiApiKey}
                onChange={(e) => updateAISettings({ geminiApiKey: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          )}

          {aiSettings.activeProvider === 'openai' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">OpenAI API Key</label>
              <input
                type="password"
                placeholder="sk-..."
                value={aiSettings.openaiApiKey}
                onChange={(e) => updateAISettings({ openaiApiKey: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          )}

          {aiSettings.activeProvider === 'anthropic' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Anthropic API Key</label>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={aiSettings.anthropicApiKey}
                onChange={(e) => updateAISettings({ anthropicApiKey: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          )}

          <div className="pt-1 border-t border-slate-800 space-y-1.5">
            <div className="text-xs font-medium text-slate-300">Automatic RAG Context Injection:</div>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiSettings.includeGraphNeighbors}
                  onChange={(e) => updateAISettings({ includeGraphNeighbors: e.target.checked })}
                  className="accent-amber-500"
                />
                <Network className="w-3 h-3 text-amber-400" />
                Graph Neighbors
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiSettings.includeTemporalContext}
                  onChange={(e) => updateAISettings({ includeTemporalContext: e.target.checked })}
                  className="accent-amber-500"
                />
                <Clock className="w-3 h-3 text-sky-400" />
                Calendar & Timeline
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiSettings.includeSpatialContext}
                  onChange={(e) => updateAISettings({ includeSpatialContext: e.target.checked })}
                  className="accent-amber-500"
                />
                <MapPin className="w-3 h-3 text-emerald-400" />
                Map Geography
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Prompts */}
      <div className="px-3 py-2 bg-slate-950/40 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() =>
            handleSend(
              `Create a compelling new character connected to ${
                activeEntity?.title || project.name
              } and propose adding them to the wiki.`
            )
          }
          className="shrink-0 px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center gap-1 cursor-pointer"
        >
          <Wand2 className="w-3 h-3 text-amber-400" />
          <span>+ Character</span>
        </button>
        <button
          type="button"
          onClick={() =>
            handleSend(
              `Propose a dramatic historical timeline event occurring at the current date involving ${
                activeEntity?.title || 'the major factions'
              }.`
            )
          }
          className="shrink-0 px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center gap-1 cursor-pointer"
        >
          <Clock className="w-3 h-3 text-sky-400" />
          <span>+ Timeline Event</span>
        </button>
        <button
          type="button"
          onClick={() =>
            handleSend(
              `Run a full continuity & worldbuilding audit across our stories, timeline, and knowledge graph.`
            )
          }
          className="shrink-0 px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center gap-1 cursor-pointer"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>Audit Continuity</span>
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {aiMessages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-xl p-3 text-xs ${
              msg.role === 'user'
                ? 'bg-amber-500/15 border border-amber-500/30 text-slate-100 ml-6'
                : 'bg-slate-950/90 border border-slate-800 text-slate-200 mr-2'
            }`}
          >
            {msg.contextSummary && msg.contextSummary.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2 pb-2 border-b border-slate-800/80">
                {msg.contextSummary.map((badge, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-xs text-slate-400 whitespace-nowrap"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}

            <MarkdownRenderer
              content={msg.content}
              project={project}
              onSelectEntity={(id) => selectEntity(id, true)}
              onCreateStubEntity={(title) =>
                createEntity({ title, category: 'character' })
              }
            />

            {/* Staged Proposals */}
            {msg.proposals && msg.proposals.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-2">
                <div className="text-sm font-semibold text-slate-300">
                  Staged Canon Proposals ({msg.proposals.length})
                </div>
                {msg.proposals.map((prop) => (
                  <div
                    key={prop.id}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-700/80 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-100 text-xs">
                        {prop.title}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 shrink-0 whitespace-nowrap">
                        {prop.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {prop.description}
                    </p>
                    <div className="pt-1">
                      {prop.applied ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Committed to Project Canon
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => applyAIProposal(msg.id, prop.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          Apply to Canon
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
            <span>Synthesizing lore across Knowledge Graph & Timeline...</span>
          </div>
        )}
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 border-t border-slate-800 bg-slate-950/80"
      >
        {activeEntity && (
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Active Focus:{' '}
              <strong className="text-amber-300">{activeEntity.title}</strong>
            </span>
            <span className="text-xs text-slate-500">RAG Grounded</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask for lore, plot hooks, maps, or continuity advice..."
            className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isLoading}
            className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </aside>
  );
};

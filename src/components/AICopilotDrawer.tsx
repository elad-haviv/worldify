import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useWorldifyStore } from '../store/useWorldifyStore';
import {
  generateAICopilotResponse,
  generateCharacterDialogueResponse,
  generateCharacterToCharacterExchange,
  generateInitialCharacterGreeting,
} from '../services/aiService';
import {
  AI_PROVIDERS,
  getActiveModel,
  setModelForProvider,
  isProviderConfigured,
  testProviderConnection,
  fetchLiveOpenRouterModels,
  AIProviderInfo,
  AIModelPreset,
} from '../services/aiProviders';
import { AIProvider, Entity, CharacterChatMessage } from '../types/worldify';
import { MarkdownRenderer } from './MarkdownRenderer';
import { categoryColor, categoryLabel } from '../utils/categories';
import { resolveImageSrc } from '../utils/assetStore';
import { formatTickToDate } from '../utils/calendarEngine';
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
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Activity,
  Cpu,
  Layers,
  Search,
  RefreshCw,
  AlertCircle,
  Sliders,
  Check,
  MessageSquare,
  User,
  Users,
  Copy,
  BookOpen,
  ArrowRightLeft,
  Quote,
  MessageCircle,
  Play,
  UserPlus,
  Maximize2,
  Minimize2,
  Minus,
  Columns,
  Globe,
} from 'lucide-react';

export const AICopilotDrawer: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedEntityId,
    selectedMapId,
    selectedStoryId,
    selectedSceneId,
    updateStoryScene,
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
    copilotTab,
    setCopilotTab,
    activeChatCharacterId,
    setActiveChatCharacterId,
    chatParticipantIds,
    setChatParticipantIds,
    addChatParticipant,
    removeChatParticipant,
    userChatPersona,
    setUserChatPersona,
    characterChatHistories,
    addCharacterChatMessage,
    clearCharacterChat,
  } = useWorldifyStore();

  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [customModelText, setCustomModelText] = useState('');

  // Character Chat specific state
  const [characterInput, setCharacterInput] = useState('');
  const [isCharacterReplying, setIsCharacterReplying] = useState(false);
  const [replyingSpeakerName, setReplyingSpeakerName] = useState<string | null>(null);
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);
  const [characterSearch, setCharacterSearch] = useState('');
  const [isEditingPersona, setIsEditingPersona] = useState(false);
  const [customPersonaText, setCustomPersonaText] = useState(userChatPersona);
  const [characterResolvedAvatar, setCharacterResolvedAvatar] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  // Drawer expansion & presentation mode ('sidebar' | 'fullscreen' | 'minimized')
  const [drawerMode, setDrawerMode] = useState<'sidebar' | 'fullscreen' | 'minimized'>(() => {
    try {
      const saved = localStorage.getItem('worldify_ai_drawer_mode');
      if (saved === 'fullscreen' || saved === 'sidebar' || saved === 'minimized') {
        return saved;
      }
    } catch {
      // fallback
    }
    return 'sidebar';
  });

  const handleSetDrawerMode = (mode: 'sidebar' | 'fullscreen' | 'minimized') => {
    setDrawerMode(mode);
    try {
      localStorage.setItem('worldify_ai_drawer_mode', mode);
    } catch {
      // ignore
    }
  };

  // Multi-character scene steering state
  const [selectedNextSpeakerId, setSelectedNextSpeakerId] = useState<string>('');
  const [showSteeringBar, setShowSteeringBar] = useState(false);
  const [steeringDirective, setSteeringDirective] = useState('');
  const [userTargetSpeakerId, setUserTargetSpeakerId] = useState<string>('all');

  // Live OpenRouter models
  const [liveModels, setLiveModels] = useState<
    Array<{ id: string; name: string; contextLength?: number }>
  >([]);
  const [isLoadingLiveModels, setIsLoadingLiveModels] = useState(false);
  const [liveModelSearch, setLiveModelSearch] = useState('');

  // Connection testing
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeProvider = aiSettings.activeProvider || 'local_synthesizer';
  const activeProviderInfo: AIProviderInfo =
    AI_PROVIDERS[activeProvider] || AI_PROVIDERS.local_synthesizer;
  const currentModelId = getActiveModel(aiSettings);
  const isConfigured = isProviderConfigured(activeProvider, aiSettings);

  // Find readable model label
  const matchedPreset = activeProviderInfo.models.find(
    (m) => m.id === currentModelId
  );
  const displayModelName =
    matchedPreset?.name || currentModelId.split('/').pop() || currentModelId;

  // Active Project & Focused Entity (fallback to first project if active ID is not set)
  const project = projects.find((p) => p.id === activeProjectId) || projects[0];
  const activeEntity = project?.entities?.find((e) => e.id === selectedEntityId);

  // Character Candidates: characters, deities, sapient species, or with character tags
  const characterCandidates = (project?.entities || []).filter(
    (e) =>
      e.category === 'character' ||
      e.category === 'deity' ||
      e.category === 'species' ||
      (e.tags || []).includes('character') ||
      (e.tags || []).includes('npc')
  );

  // Active Participants in current session
  const activeParticipants: Entity[] = useMemo(() => {
    if (!project) return [];
    const valid = (chatParticipantIds || [])
      .map((id) => (project.entities || []).find((e) => e.id === id))
      .filter((e): e is Entity => Boolean(e));
    if (valid.length > 0) return valid;
    if (activeChatCharacterId) {
      const single = (project.entities || []).find((e) => e.id === activeChatCharacterId);
      if (single) return [single];
    }
    return characterCandidates[0] ? [characterCandidates[0]] : [];
  }, [project, chatParticipantIds, activeChatCharacterId, characterCandidates]);

  const activeChatCharacter = activeParticipants[0] || null;
  const isMultiCharacter = activeParticipants.length > 1;

  // Active dialogue key:
  // If 1 character: character.id (retains 1-on-1 history)
  // If 2+ characters: `group-${activeParticipants.map(p => p.id).sort().join('_')}`
  const activeChatKey = useMemo(() => {
    if (activeParticipants.length === 0) return 'none';
    if (activeParticipants.length === 1) return activeParticipants[0].id;
    return `group-${activeParticipants.map((p) => p.id).sort().join('_')}`;
  }, [activeParticipants]);

  // Current dialogue history for active character / group
  const currentChatHistory = (characterChatHistories || {})[activeChatKey] || [];

  // Determine who should speak next if auto-advancing
  const defaultNextSpeaker = useMemo(() => {
    if (activeParticipants.length === 0) return null;
    if (activeParticipants.length === 1) return activeParticipants[0];

    const lastCharTurn = [...currentChatHistory]
      .reverse()
      .find((t) => t.role === 'character');

    if (!lastCharTurn) return activeParticipants[0];

    const lastIdx = activeParticipants.findIndex(
      (p) => p.id === lastCharTurn.characterId || p.title === lastCharTurn.speakerName
    );
    if (lastIdx === -1) return activeParticipants[0];

    return activeParticipants[(lastIdx + 1) % activeParticipants.length];
  }, [activeParticipants, currentChatHistory]);

  // Sync custom model state
  useEffect(() => {
    const isPreset = activeProviderInfo.models.some((m) => m.id === currentModelId);
    if (!isPreset && activeProvider !== 'local_synthesizer') {
      setIsCustomModel(true);
      setCustomModelText(currentModelId);
    } else {
      setIsCustomModel(false);
    }
  }, [activeProvider, currentModelId]);

  // Resolve active character's avatar if they have an image in contentMd
  useEffect(() => {
    if (!activeChatCharacter || !activeChatCharacter.contentMd) {
      setCharacterResolvedAvatar(null);
      return;
    }
    const match = (activeChatCharacter.contentMd || '').match(
      /!\[.*?\]\((.*?)\)|!\[\[(.*?)\]\]/
    );
    const rawSrc = match ? match[1] || match[2] : null;
    if (rawSrc) {
      resolveImageSrc(rawSrc).then((url) => setCharacterResolvedAvatar(url || rawSrc));
    } else {
      setCharacterResolvedAvatar(null);
    }
  }, [activeChatCharacter]);

  // If drawer is opened from closed, ensure it is not stuck in minimized mode
  useEffect(() => {
    if (isAICopilotOpen && drawerMode === 'minimized') {
      handleSetDrawerMode('sidebar');
    }
  }, [isAICopilotOpen]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, currentChatHistory, isCharacterReplying, isLoading]);

  // Keyboard shortcut to exit fullscreen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerMode === 'fullscreen') {
        handleSetDrawerMode('sidebar');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerMode]);

  const isFullScreen = drawerMode === 'fullscreen';

  if (!isAICopilotOpen || !project) return null;

  // Minimized floating dock widget
  if (drawerMode === 'minimized') {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 bg-slate-900/95 border border-amber-500/50 rounded-xl px-3.5 py-2 shadow-2xl backdrop-blur text-slate-100 animate-in fade-in slide-in-from-bottom-2">
        <button
          type="button"
          onClick={() => handleSetDrawerMode('fullscreen')}
          className="flex items-center gap-2.5 text-left group cursor-pointer"
          title="Click to expand to Fullscreen"
        >
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                Worldify AI
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-400 font-mono font-medium">
                {activeProviderInfo.shortName}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate max-w-[170px]">
              {copilotTab === 'copilot'
                ? `${aiMessages.length} lore turns`
                : `${currentChatHistory.length} turns • ${activeChatCharacter?.title || 'Character Chat'}`}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
          <button
            type="button"
            onClick={() => handleSetDrawerMode('sidebar')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer transition-colors"
            title="Restore as Sidebar"
          >
            <Columns className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleSetDrawerMode('fullscreen')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer transition-colors"
            title="Expand to Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => toggleAICopilot(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer transition-colors"
            title="Close AI"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Notification Toast Helper
  const showToast = (msg: string) => {
    setToastNotice(msg);
    setTimeout(() => setToastNotice(null), 3000);
  };

  // 1. Lore Copilot Send
  const handleSendCopilot = async (customPrompt?: string) => {
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

  // 2. Character Dialogue Send (User speaks)
  const handleSendCharacterMessage = async (customMessage?: string, targetSpeakerId?: string) => {
    const text = (customMessage ?? characterInput).trim();
    if (!text || isCharacterReplying || activeParticipants.length === 0 || !project) return;

    if (!customMessage) setCharacterInput('');

    // Add user message to conversation history
    addCharacterChatMessage(activeChatKey, {
      role: 'user',
      speakerName: userChatPersona,
      content: text,
      characterId: 'user',
    });

    // Pick responder: specific target, or dropdown selection, or default alternating next speaker
    const responder =
      (targetSpeakerId && targetSpeakerId !== 'all'
        ? activeParticipants.find((p) => p.id === targetSpeakerId)
        : null) ||
      (userTargetSpeakerId && userTargetSpeakerId !== 'all'
        ? activeParticipants.find((p) => p.id === userTargetSpeakerId)
        : null) ||
      (selectedNextSpeakerId
        ? activeParticipants.find((p) => p.id === selectedNextSpeakerId)
        : null) ||
      defaultNextSpeaker ||
      activeParticipants[0];

    if (!responder) return;

    setIsCharacterReplying(true);
    setReplyingSpeakerName(responder.title);

    try {
      const historyWithCurrent: CharacterChatMessage[] = [
        ...currentChatHistory,
        {
          id: 'temp',
          characterId: 'user',
          role: 'user' as const,
          speakerName: userChatPersona,
          content: text,
          timestamp: new Date().toISOString(),
        },
      ];

      const otherParticipants = activeParticipants.filter((p) => p.id !== responder.id);

      const replyText = await generateCharacterDialogueResponse(
        responder,
        text,
        historyWithCurrent,
        userChatPersona,
        project,
        aiSettings,
        otherParticipants,
        steeringDirective || undefined
      );

      addCharacterChatMessage(activeChatKey, {
        role: 'character',
        characterId: responder.id,
        speakerName: responder.title,
        content: replyText,
      });

      if (steeringDirective) {
        setSteeringDirective('');
      }
    } catch (err: unknown) {
      console.warn('Character chat dialogue failed:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      addCharacterChatMessage(activeChatKey, {
        role: 'character',
        characterId: responder.id,
        speakerName: responder.title,
        content: `*A sudden silence falls across the chamber as words fail to carry.* (Connection error: ${errMsg})`,
      });
    } finally {
      setIsCharacterReplying(false);
      setReplyingSpeakerName(null);
    }
  };

  // 3. Initiate first in-character greeting
  const handleInitiateGreeting = async () => {
    if (activeParticipants.length === 0 || isCharacterReplying || !project) return;
    const speaker = activeParticipants[0];
    setIsCharacterReplying(true);
    setReplyingSpeakerName(speaker.title);
    try {
      const otherParticipants = activeParticipants.filter((p) => p.id !== speaker.id);
      const greeting = await generateInitialCharacterGreeting(
        speaker,
        userChatPersona,
        project,
        aiSettings,
        otherParticipants
      );
      addCharacterChatMessage(activeChatKey, {
        role: 'character',
        characterId: speaker.id,
        speakerName: speaker.title,
        content: greeting,
      });
    } catch (e: unknown) {
      console.warn('Failed to initiate greeting:', e);
    } finally {
      setIsCharacterReplying(false);
      setReplyingSpeakerName(null);
    }
  };

  // 4. Autonomous Next Turn / Steered Turn between characters
  const handleAdvanceScene = async (targetSpeakerId?: string, directiveOverride?: string) => {
    if (isCharacterReplying || activeParticipants.length === 0 || !project) return;

    const speaker =
      (targetSpeakerId
        ? activeParticipants.find((p) => p.id === targetSpeakerId)
        : null) ||
      defaultNextSpeaker ||
      activeParticipants[0];

    if (!speaker) return;

    const directive = (directiveOverride ?? steeringDirective).trim();

    if (directive) {
      addCharacterChatMessage(activeChatKey, {
        role: 'system',
        characterId: 'system',
        speakerName: 'Director',
        content: directive,
      });
      setSteeringDirective('');
    }

    setIsCharacterReplying(true);
    setReplyingSpeakerName(speaker.title);

    try {
      const historyWithDirective: CharacterChatMessage[] = directive
        ? [
            ...currentChatHistory,
            {
              id: `dir-${Date.now()}`,
              characterId: 'system',
              role: 'system' as const,
              speakerName: 'Director',
              content: directive,
              timestamp: new Date().toISOString(),
            },
          ]
        : currentChatHistory;

      const replyText = await generateCharacterToCharacterExchange(
        speaker,
        activeParticipants,
        historyWithDirective,
        userChatPersona,
        directive || undefined,
        project,
        aiSettings
      );

      addCharacterChatMessage(activeChatKey, {
        role: 'character',
        characterId: speaker.id,
        speakerName: speaker.title,
        content: replyText,
      });
    } catch (err: unknown) {
      console.warn('Advance scene failed:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      addCharacterChatMessage(activeChatKey, {
        role: 'character',
        characterId: speaker.id,
        speakerName: speaker.title,
        content: `*A hesitation ripples through the air.* (Connection error: ${errMsg})`,
      });
    } finally {
      setIsCharacterReplying(false);
      setReplyingSpeakerName(null);
    }
  };

  // 5. Send dialogue quote to Story Scene
  const handleTransferToStory = (dialogueText: string, speakerTitle?: string) => {
    const speakerLabel = speakerTitle || activeChatCharacter?.title || 'Character';
    if (selectedStoryId && selectedSceneId && project) {
      const story = project.stories.find((s) => s.id === selectedStoryId);
      if (story) {
        for (const ch of story.chapters) {
          const sc = ch.scenes.find((s) => s.id === selectedSceneId);
          if (sc) {
            const formattedDialogue = `\n\n> **${speakerLabel}**: "${dialogueText.replace(/^[*\s]+|[*\s]+$/g, '')}"\n`;
            updateStoryScene(story.id, ch.id, sc.id, {
              contentMd: `${sc.contentMd}${formattedDialogue}`,
            });
            showToast(`Transferred line to Scene "${sc.title}"!`);
            return;
          }
        }
      }
    }
    // Fallback: Copy to clipboard
    navigator.clipboard.writeText(`"${dialogueText}"`);
    showToast('Copied dialogue line to clipboard!');
  };

  const handleSelectProvider = (provId: AIProvider) => {
    updateAISettings({ activeProvider: provId });
    setTestResult(null);
  };

  const handleSelectModel = (modelId: string) => {
    const patch = setModelForProvider(activeProvider, modelId);
    updateAISettings(patch);
    setShowModelPicker(false);
    setIsCustomModel(false);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testProviderConnection(activeProvider, aiSettings);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  const handleLoadLiveOpenRouterModels = async () => {
    setIsLoadingLiveModels(true);
    try {
      const list = await fetchLiveOpenRouterModels(aiSettings.openrouterApiKey);
      setLiveModels(list);
    } finally {
      setIsLoadingLiveModels(false);
    }
  };

  const renderLoreContextLeftPane = () => {
    const calendar =
      project?.calendars?.find((c) => c.id === project.activeCalendarId) ||
      project?.calendars?.[0];
    const dateLabel = calendar
      ? formatTickToDate(calendar, project?.currentTick ?? 0).displayShort
      : `Tick ${project?.currentTick ?? 0}`;
    const activeWorld = project?.worlds?.find((w) => w.id === project.activeWorldId);

    return (
      <div className="h-full flex flex-col p-3.5 space-y-3.5 overflow-y-auto text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            World Context (RAG)
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Live Canon</span>
        </div>

        {/* Project & World */}
        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            Active Realm
          </div>
          <div className="font-bold text-slate-100">{project?.name || 'Realm'}</div>
          <div className="text-[11px] text-slate-400">
            {project?.genre || 'World'} • {activeWorld ? activeWorld.name : 'Primary World'}
          </div>
        </div>

        {/* Temporal Anchor */}
        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-400" />
            Timeline Cursor
          </div>
          <div className="font-medium text-slate-200">{dateLabel}</div>
          <div className="text-[10px] text-slate-500 font-mono">Tick {project?.currentTick ?? 0}</div>
        </div>

        {/* Focused Wiki Entity */}
        {activeEntity && (
          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-1">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1">
              <BookOpen className="w-3 h-3 text-emerald-400" />
              Active Focus Entity
            </div>
            <button
              type="button"
              onClick={() => selectEntity(activeEntity.id, true)}
              className="font-bold text-amber-300 hover:underline text-left block"
            >
              [[{activeEntity.title}]]
            </button>
            <div className="text-[11px] text-slate-400 line-clamp-2">
              {activeEntity.summary}
            </div>
          </div>
        )}

        {/* Quick Prompts */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Quick Brainstorm
          </div>
          <button
            type="button"
            onClick={() =>
              handleSendCopilot(
                `Generate 3 unexpected plot hooks connecting ${
                  activeEntity?.title || project.name
                } to other factions in the world.`
              )
            }
            className="w-full text-left p-2 rounded-lg bg-slate-950/60 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 transition-colors cursor-pointer"
          >
            ⚡ Brainstorm Plot Hooks
          </button>
          <button
            type="button"
            onClick={() =>
              handleSendCopilot(
                `Create a new ancient faction or secret order tied to ${
                  activeEntity?.title || project.name
                } and stage it into the wiki.`
              )
            }
            className="w-full text-left p-2 rounded-lg bg-slate-950/60 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 transition-colors cursor-pointer"
          >
            🏛️ Forge New Faction / Order
          </button>
          <button
            type="button"
            onClick={() =>
              handleSendCopilot(
                `Audit our story scenes and character timelines against the world calendar and map paths for continuity errors.`
              )
            }
            className="w-full text-left p-2 rounded-lg bg-slate-950/60 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 transition-colors cursor-pointer"
          >
            🔍 Spatiotemporal Audit
          </button>
        </div>
      </div>
    );
  };

  const renderCharacterRosterLeftPane = () => {
    const filtered = characterCandidates.filter(
      (c) =>
        c.title.toLowerCase().includes(characterSearch.toLowerCase()) ||
        (c.subtitle || '').toLowerCase().includes(characterSearch.toLowerCase())
    );

    return (
      <div className="h-full flex flex-col p-3.5 space-y-3 overflow-hidden text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            Character Roster ({characterCandidates.length})
          </span>
        </div>

        {/* Search */}
        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
          <input
            type="text"
            placeholder="Search characters..."
            value={characterSearch}
            onChange={(e) => setCharacterSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
          />
        </div>

        {/* Character List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {filtered.map((char) => {
            const isSelected = activeChatCharacterId === char.id;
            const isParticipant = chatParticipantIds.includes(char.id);
            return (
              <div
                key={char.id}
                className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500/15 border-amber-500/50 text-slate-100 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-850 text-slate-300'
                }`}
                onClick={() => {
                  setActiveChatCharacterId(char.id);
                  if (!chatParticipantIds.includes(char.id)) {
                    setChatParticipantIds([char.id]);
                  }
                }}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10.5px] text-white shrink-0 shadow-sm"
                    style={{
                      backgroundColor: categoryColor(char.category) || '#f59e0b',
                    }}
                  >
                    {char.title.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate text-xs text-slate-200">
                      {char.title}
                    </div>
                    {char.subtitle && (
                      <div className="text-[10px] text-slate-400 truncate">
                        {char.subtitle}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isParticipant) {
                      removeChatParticipant(char.id);
                    } else {
                      addChatParticipant(char.id);
                    }
                  }}
                  className={`p-1 rounded text-[10px] font-medium shrink-0 transition-colors ${
                    isParticipant
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                  }`}
                  title={isParticipant ? 'In scene (click to remove)' : 'Add to scene'}
                >
                  {isParticipant ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <UserPlus className="w-3 h-3" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* User Persona footer */}
        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 shrink-0 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Your Persona:</span>
            <button
              type="button"
              onClick={() => setIsEditingPersona(!isEditingPersona)}
              className="text-amber-400 hover:underline cursor-pointer"
            >
              {isEditingPersona ? 'Done' : 'Change'}
            </button>
          </div>
          {isEditingPersona ? (
            <input
              type="text"
              value={customPersonaText}
              onChange={(e) => {
                setCustomPersonaText(e.target.value);
                setUserChatPersona(e.target.value);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 outline-none"
            />
          ) : (
            <div className="font-semibold text-slate-200 text-xs truncate">
              {userChatPersona || 'A stranger'}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSettingsPanel = (isSidePanel: boolean) => (
    <div
      className={
        isSidePanel
          ? 'w-[420px] bg-slate-950 border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto p-4 space-y-4 text-xs shadow-2xl z-20'
          : 'p-3.5 bg-slate-950 border-b border-slate-800 space-y-3.5 text-xs max-h-[75vh] overflow-y-auto shadow-inner shrink-0'
      }
    >
      <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
        <span className="font-semibold text-amber-400 flex items-center gap-1.5 text-xs">
          <KeyRound className="w-3.5 h-3.5" />
          AI Provider & Preferences
        </span>
        <button
          type="button"
          onClick={() => setShowSettings(false)}
          className="text-slate-500 hover:text-slate-300 cursor-pointer p-1 rounded hover:bg-slate-900"
          title="Close Preferences"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 1. Choose Provider Grid */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
          Choose AI Provider:
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(AI_PROVIDERS) as AIProvider[]).map((provKey) => {
            const info = AI_PROVIDERS[provKey];
            const isSelected = activeProvider === provKey;
            return (
              <button
                key={provKey}
                type="button"
                onClick={() => handleSelectProvider(provKey)}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? `${info.bgColor} ${info.borderColor} border shadow-sm`
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-semibold text-xs ${info.color}`}>
                    {info.shortName}
                  </span>
                  {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </div>
                <span className="text-[10px] text-slate-400 line-clamp-1 mt-1">
                  {provKey === 'openrouter'
                    ? '200+ models in one'
                    : provKey === 'local_synthesizer'
                      ? 'Offline & free'
                      : provKey === 'custom_openai'
                        ? 'Ollama / LM Studio'
                        : `${info.models.length} curated models`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Provider Overview & External Key Link */}
      <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800 space-y-1">
        <div className="text-[11px] text-slate-300 leading-relaxed">
          {activeProviderInfo.description}
        </div>
        {activeProviderInfo.docsUrl && (
          <a
            href={activeProviderInfo.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-medium"
          >
            <span>Get {activeProviderInfo.shortName} API Key</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* 2. API Key Configuration for active provider */}
      {activeProvider === 'openrouter' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-slate-300">
              OpenRouter API Key
            </label>
            {aiSettings.openrouterApiKey?.trim() ? (
              <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Key saved
              </span>
            ) : (
              <span className="text-[10px] text-amber-400">Required</span>
            )}
          </div>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder="sk-or-v1-..."
              value={aiSettings.openrouterApiKey}
              onChange={(e) =>
                updateAISettings({ openrouterApiKey: e.target.value })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 pr-8 text-xs text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {activeProvider === 'gemini' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-slate-300">
              Google Gemini API Key
            </label>
            {aiSettings.geminiApiKey?.trim() ? (
              <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Key saved
              </span>
            ) : (
              <span className="text-[10px] text-amber-400">Required</span>
            )}
          </div>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder="AIzaSy..."
              value={aiSettings.geminiApiKey}
              onChange={(e) =>
                updateAISettings({ geminiApiKey: e.target.value })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 pr-8 text-xs text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {activeProvider === 'anthropic' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-slate-300">
              Anthropic Claude API Key
            </label>
            {aiSettings.anthropicApiKey?.trim() ? (
              <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Key saved
              </span>
            ) : (
              <span className="text-[10px] text-amber-400">Required</span>
            )}
          </div>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder="sk-ant-..."
              value={aiSettings.anthropicApiKey}
              onChange={(e) =>
                updateAISettings({ anthropicApiKey: e.target.value })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 pr-8 text-xs text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {activeProvider === 'openai' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-slate-300">
              OpenAI API Key
            </label>
            {aiSettings.openaiApiKey?.trim() ? (
              <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Key saved
              </span>
            ) : (
              <span className="text-[10px] text-amber-400">Required</span>
            )}
          </div>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={aiSettings.openaiApiKey}
              onChange={(e) =>
                updateAISettings({ openaiApiKey: e.target.value })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 pr-8 text-xs text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {activeProvider === 'custom_openai' && (
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Endpoint Base URL
            </label>
            <input
              type="text"
              placeholder="http://localhost:11434/v1"
              value={aiSettings.customOpenAiBaseUrl}
              onChange={(e) =>
                updateAISettings({ customOpenAiBaseUrl: e.target.value })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              API Key (Optional)
            </label>
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder="Optional"
              value={aiSettings.customOpenAiApiKey}
              onChange={(e) =>
                updateAISettings({ customOpenAiApiKey: e.target.value })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* 3. Model Selector */}
      {activeProvider !== 'local_synthesizer' && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-300">
            Model:
          </label>
          {!isCustomModel ? (
            <select
              value={currentModelId}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setIsCustomModel(true);
                } else {
                  handleSelectModel(e.target.value);
                }
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none cursor-pointer"
            >
              <optgroup label="Curated Models">
                {activeProviderInfo.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.badge ? `(${m.badge})` : ''} — {m.id}
                  </option>
                ))}
              </optgroup>
              <option value="__custom__">+ Enter Custom Model Identifier...</option>
            </select>
          ) : (
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="e.g. meta-llama/llama-3.3-70b-instruct"
                value={customModelText}
                onChange={(e) => {
                  setCustomModelText(e.target.value);
                  const patch = setModelForProvider(activeProvider, e.target.value);
                  updateAISettings(patch);
                }}
                className="flex-1 bg-slate-900 border border-amber-500/50 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setIsCustomModel(false);
                  const defaultM = activeProviderInfo.defaultModel;
                  const patch = setModelForProvider(activeProvider, defaultM);
                  updateAISettings(patch);
                }}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer"
              >
                Presets
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. Temperature / Creativity */}
      <div className="space-y-1 pt-1 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
            <Sliders className="w-3 h-3 text-amber-400" />
            Creative Temperature
          </label>
          <span className="text-[11px] text-amber-400 font-mono font-semibold">
            {aiSettings.temperature ?? 0.7}
          </span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.05"
          value={aiSettings.temperature ?? 0.7}
          onChange={(e) =>
            updateAISettings({ temperature: parseFloat(e.target.value) })
          }
          className="w-full accent-amber-500 cursor-pointer"
        />
      </div>

      {/* 5. RAG World Grounding Context */}
      <div className="space-y-1.5 pt-2 border-t border-slate-800">
        <label className="text-[11px] font-semibold text-slate-300 block">
          RAG Context Grounding:
        </label>
        <div className="space-y-1.5 text-slate-300 text-[11px]">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={aiSettings.includeGraphNeighbors}
              onChange={(e) =>
                updateAISettings({ includeGraphNeighbors: e.target.checked })
              }
              className="rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
            />
            <span>Include Knowledge Graph Connections</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={aiSettings.includeTemporalContext}
              onChange={(e) =>
                updateAISettings({ includeTemporalContext: e.target.checked })
              }
              className="rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
            />
            <span>Include Calendar Era & Timeline Events</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={aiSettings.includeSpatialContext}
              onChange={(e) =>
                updateAISettings({ includeSpatialContext: e.target.checked })
              }
              className="rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
            />
            <span>Include Map Geography & Coordinates</span>
          </label>
        </div>
      </div>

      {/* 6. Test Connection Button */}
      <div className="pt-2 border-t border-slate-800 space-y-2">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={isTesting}
          className="w-full py-1.5 px-3 rounded-lg bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Activity
            className={`w-3.5 h-3.5 text-amber-400 ${isTesting ? 'animate-pulse' : ''}`}
          />
          <span>
            {isTesting
              ? 'Pinging Model...'
              : `Test Connection (${activeProviderInfo.shortName})`}
          </span>
        </button>

        {testResult && (
          <div
            className={`p-2 rounded-lg border text-[11px] flex items-start gap-1.5 ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-semibold">
                {testResult.success ? 'Connection Verified' : 'Connection Failed'}
              </div>
              <div>{testResult.message}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <aside
      className={
        isFullScreen
          ? 'fixed inset-0 w-full h-full bg-slate-950 flex flex-col z-50 shadow-2xl overflow-hidden'
          : 'absolute right-0 top-0 bottom-0 w-[540px] max-w-full bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl shadow-black/80 z-40'
      }
    >
      {/* Top Header */}
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-sm shadow-amber-500/20 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100 truncate">
                Worldify AI Intelligence
              </h3>
              {isFullScreen && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                  Full Screen
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              Grounded in active lore, graph & timeline
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Preferences button */}
          <button
            type="button"
            onClick={() => {
              setShowSettings(!showSettings);
              setShowModelPicker(false);
              setShowCharacterPicker(false);
            }}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              showSettings
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
            title="Configure BYOK Providers, API Keys & Preferences"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Preferences</span>
          </button>

          <button
            type="button"
            onClick={() =>
              copilotTab === 'copilot'
                ? clearAIChat()
                : activeChatKey && clearCharacterChat(activeChatKey)
            }
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer transition-colors"
            title="Clear Chat History"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Minimize button */}
          <button
            type="button"
            onClick={() => handleSetDrawerMode('minimized')}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer transition-colors"
            title="Minimize to Floating Dock"
          >
            <Minus className="w-4 h-4" />
          </button>

          {/* Expand to Full Screen / Restore to Sidebar button */}
          <button
            type="button"
            onClick={() => handleSetDrawerMode(isFullScreen ? 'sidebar' : 'fullscreen')}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              isFullScreen
                ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={isFullScreen ? 'Restore to Sidebar' : 'Expand to Fullscreen'}
          >
            {isFullScreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={() => toggleAICopilot(false)}
            className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer transition-colors"
            title="Close Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs: Lore Copilot vs. Character Roleplay */}
      <div className="flex border-b border-slate-800 bg-slate-950/90 px-3 pt-1.5 gap-1.5">
        <button
          type="button"
          onClick={() => {
            setCopilotTab('copilot');
            setShowCharacterPicker(false);
          }}
          className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer flex items-center gap-1.5 border-t border-x ${
            copilotTab === 'copilot'
              ? 'bg-slate-900 border-slate-700 text-amber-300 shadow-sm'
              : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Lore Copilot</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCopilotTab('character_chat');
            if (!activeChatCharacterId && characterCandidates[0]) {
              setActiveChatCharacterId(characterCandidates[0].id);
            }
          }}
          className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer flex items-center gap-1.5 border-t border-x ${
            copilotTab === 'character_chat'
              ? 'bg-slate-900 border-slate-700 text-amber-300 shadow-sm'
              : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span>Character Chat</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono">
            {characterCandidates.length}
          </span>
        </button>
      </div>

      {/* Interactive Model Quick Switcher Bar (Available for both modes!) */}
      <div className="px-3.5 py-1.5 border-b border-slate-800/90 bg-slate-950/50 flex items-center justify-between gap-2 text-xs relative">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => {
              setShowModelPicker(!showModelPicker);
              setShowSettings(false);
              setShowCharacterPicker(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 transition-colors cursor-pointer min-w-0 max-w-[270px]"
            title="Switch AI engine or model"
          >
            <span
              className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold uppercase tracking-wider ${activeProviderInfo.bgColor} ${activeProviderInfo.color} border ${activeProviderInfo.borderColor} shrink-0`}
            >
              {activeProviderInfo.shortName}
            </span>
            <span className="font-medium truncate text-slate-200 text-xs">
              {displayModelName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {!isConfigured && activeProviderInfo.requiresApiKey && (
            <button
              type="button"
              onClick={() => {
                setShowSettings(true);
                setShowModelPicker(false);
              }}
              className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-semibold flex items-center gap-1 shrink-0 animate-pulse hover:bg-amber-500/25 cursor-pointer"
              title="API key missing - click to configure"
            >
              <KeyRound className="w-2.5 h-2.5" />
              Key needed
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setShowSettings(!showSettings);
            setShowModelPicker(false);
            setShowCharacterPicker(false);
          }}
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${
            showSettings
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
          title="Configure BYOK Providers, API Keys & Parameters"
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium hidden sm:inline">Settings</span>
        </button>
      </div>

      {/* Model Quick Switcher Dropdown Popover */}
      {showModelPicker && (
        <div className="p-3 bg-slate-950 border-b border-slate-800 space-y-2.5 text-xs z-30 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              Select Active Engine & Model
            </span>
            <button
              type="button"
              onClick={() => setShowModelPicker(false)}
              className="text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Provider Pill Switcher */}
          <div className="flex flex-wrap gap-1 border-b border-slate-800 pb-2">
            {(Object.keys(AI_PROVIDERS) as AIProvider[]).map((pKey) => {
              const pInfo = AI_PROVIDERS[pKey];
              const isSelected = activeProvider === pKey;
              return (
                <button
                  key={pKey}
                  type="button"
                  onClick={() => handleSelectProvider(pKey)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    isSelected
                      ? `${pInfo.bgColor} ${pInfo.color} border ${pInfo.borderColor} font-semibold`
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <span>{pInfo.shortName}</span>
                </button>
              );
            })}
          </div>

          {/* Models list for selected provider */}
          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {activeProviderInfo.models.map((model) => {
              const isCurrent = currentModelId === model.id && !isCustomModel;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleSelectModel(model.id)}
                  className={`w-full text-left p-2 rounded-lg border transition-all cursor-pointer flex items-start justify-between gap-2 ${
                    isCurrent
                      ? 'bg-amber-500/15 border-amber-500/50 text-slate-100'
                      : 'bg-slate-900/90 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      <span className="text-slate-100">{model.name}</span>
                      {model.badge && (
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                            model.badge === 'Recommended'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : model.badge === 'Fast'
                                ? 'bg-sky-500/20 text-sky-300'
                                : model.badge === 'Reasoning'
                                  ? 'bg-purple-500/20 text-purple-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {model.badge}
                        </span>
                      )}
                      {model.contextLength && (
                        <span className="text-[10px] text-slate-500">
                          {model.contextLength}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                      {model.description}
                    </div>
                  </div>
                  {isCurrent && (
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}

            {/* Custom Model Option */}
            {activeProvider !== 'local_synthesizer' && (
              <button
                type="button"
                onClick={() => {
                  setIsCustomModel(true);
                  setShowModelPicker(false);
                  setShowSettings(true);
                }}
                className={`w-full text-left p-2 rounded-lg border border-dashed transition-all cursor-pointer flex items-center justify-between text-xs ${
                  isCustomModel
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : 'border-slate-700 hover:border-slate-600 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>+ Custom Model ID...</span>
                <Sliders className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Fullscreen Left Pane (Context / Characters) */}
        {isFullScreen && (
          <div className="w-80 border-r border-slate-800 bg-slate-900/40 flex flex-col shrink-0 overflow-hidden">
            {copilotTab === 'character_chat'
              ? renderCharacterRosterLeftPane()
              : renderLoreContextLeftPane()}
          </div>
        )}

        {/* Center Column: Active Chat Stream & Input */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-900/60 overflow-hidden relative">
          {/* In sidebar mode, settings collapses down from top */}
          {!isFullScreen && showSettings && renderSettingsPanel(false)}

      {/* Toast Notification */}
      {toastNotice && (
        <div className="mx-3 mt-2 p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 animate-in fade-in duration-200 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastNotice}</span>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODE 1: LORE COPILOT (Brainstorming & Staging Canon) */}
      {/* ==================================================== */}
      {copilotTab === 'copilot' && (
        <>
          {/* Quick Action Prompts */}
          <div className="px-3 py-2 bg-slate-950/40 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() =>
                handleSendCopilot(
                  `Create a compelling new character connected to ${
                    activeEntity?.title || project.name
                  } and propose adding them to the wiki.`
                )
              }
              className="shrink-0 px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Wand2 className="w-3 h-3 text-amber-400" />
              <span>+ Character</span>
            </button>
            <button
              type="button"
              onClick={() =>
                handleSendCopilot(
                  `Propose a dramatic historical timeline event occurring at the current date involving ${
                    activeEntity?.title || 'the major factions'
                  }.`
                )
              }
              className="shrink-0 px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Clock className="w-3 h-3 text-sky-400" />
              <span>+ Timeline Event</span>
            </button>
            <button
              type="button"
              onClick={() =>
                handleSendCopilot(
                  `Run a full continuity & worldbuilding audit across our stories, timeline, and knowledge graph.`
                )
              }
              className="shrink-0 px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Audit Continuity</span>
            </button>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            {aiMessages.length === 0 ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div className="max-w-md space-y-1">
                  <h4 className="text-sm font-semibold text-slate-200">
                    Worldify AI Intelligence
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Brainstorm lore, forge connected characters, audit timeline continuity, or stage new entries directly to your canon wiki.
                  </p>
                </div>

                <div className="w-full max-w-md grid grid-cols-1 gap-2 pt-2 text-left">
                  <button
                    type="button"
                    onClick={() =>
                      handleSendCopilot(
                        `Create a compelling new character connected to ${
                          activeEntity?.title || project?.name || 'this realm'
                        } and propose adding them to the wiki.`
                      )
                    }
                    className="p-2.5 rounded-xl bg-slate-950/70 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 text-xs text-slate-300 transition-all flex items-start gap-2.5 group cursor-pointer"
                  >
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-105 transition-transform mt-0.5 shrink-0">
                      <Wand2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200 group-hover:text-amber-300">
                        Forge a Connected Character
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Generate a character tied to active lore with staged wiki import.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleSendCopilot(
                        `Propose 3 unexpected plot twists or secret conflicts between the major factions in ${project?.name || 'this realm'}.`
                      )
                    }
                    className="p-2.5 rounded-xl bg-slate-950/70 hover:bg-slate-850 border border-slate-800 hover:border-sky-500/40 text-xs text-slate-300 transition-all flex items-start gap-2.5 group cursor-pointer"
                  >
                    <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 group-hover:scale-105 transition-transform mt-0.5 shrink-0">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200 group-hover:text-sky-300">
                        Brainstorm Plot Twists & Conflicts
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Explore dynamic story tensions and hidden conspiracies.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleSendCopilot(
                        `Run a full continuity and worldbuilding audit across our timeline, maps, and story scenes.`
                      )
                    }
                    className="p-2.5 rounded-xl bg-slate-950/70 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/40 text-xs text-slate-300 transition-all flex items-start gap-2.5 group cursor-pointer"
                  >
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition-transform mt-0.5 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200 group-hover:text-emerald-300">
                        Audit World & Timeline Continuity
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Detect spatio-temporal plot holes and geographic inconsistencies.
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              aiMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-xl p-3 text-xs leading-relaxed ${
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
                          className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 whitespace-nowrap"
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
              ))
            )}

            {isLoading && (
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                <span>
                  Synthesizing lore with{' '}
                  <strong className="text-amber-300">{displayModelName}</strong>...
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendCopilot();
            }}
            className="p-3 border-t border-slate-800 bg-slate-950/90"
          >
            {activeEntity && (
              <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400 px-1">
                <span>
                  Active Focus:{' '}
                  <strong className="text-amber-300">{activeEntity.title}</strong>
                </span>
                <span className="text-[10px] text-slate-500">RAG Grounded</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={`Ask ${displayModelName} for lore, plots, or history...`}
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
        </>
      )}

      {/* ==================================================== */}
      {/* MODE 2: CHARACTER ROLEPLAY & IN-WORLD DIALOGUE       */}
      {/* ==================================================== */}
      {copilotTab === 'character_chat' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Active Characters Banner */}
          {activeParticipants.length > 0 ? (
            <div className="p-3 bg-slate-950/80 border-b border-slate-800 space-y-2">
              {!isMultiCharacter ? (
                /* Single Character Profile Banner */
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {characterResolvedAvatar ? (
                      <img
                        src={characterResolvedAvatar}
                        alt={activeChatCharacter?.title}
                        className="w-9 h-9 rounded-full object-cover border-2 border-amber-500/50 shadow-sm shrink-0"
                      />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm"
                        style={{
                          backgroundColor:
                            categoryColor(activeChatCharacter?.category || 'character') || '#f59e0b',
                        }}
                      >
                        {activeChatCharacter?.title.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-100 text-sm truncate">
                          {activeChatCharacter?.title}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                          {categoryLabel(activeChatCharacter?.category || 'character')}
                        </span>
                      </div>
                      {activeChatCharacter?.subtitle && (
                        <div className="text-[11px] text-slate-400 truncate italic">
                          {activeChatCharacter.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowCharacterPicker(true)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold border border-amber-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Add a second character to converse together or start a multi-character scene"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>+ Add Character</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCharacterPicker(true)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer transition-colors"
                      title="Switch to another character"
                    >
                      <ArrowRightLeft className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Multi-Character Ensemble Scene Header */
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                      <Users className="w-4 h-4 text-amber-400" />
                      <span>Multi-Character Scene ({activeParticipants.length})</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowCharacterPicker(true)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Add another participant"
                      >
                        <UserPlus className="w-3 h-3 text-amber-400" />
                        <span>Add</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatParticipantIds([activeParticipants[0].id])}
                        className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[11px] border border-slate-800 cursor-pointer transition-colors"
                        title="Return to 1-on-1 solo chat with first character"
                      >
                        Solo Mode
                      </button>
                    </div>
                  </div>

                  {/* Character participant chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeParticipants.map((char) => {
                      const isNext = (selectedNextSpeakerId || defaultNextSpeaker?.id) === char.id;
                      return (
                        <div
                          key={char.id}
                          className={`px-2 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition-colors ${
                            isNext
                              ? 'bg-amber-500/15 border-amber-500/40 text-slate-100'
                              : 'bg-slate-900/90 border-slate-800 text-slate-300'
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: categoryColor(char.category) }}
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedNextSpeakerId(char.id)}
                            className="font-medium hover:text-amber-300 cursor-pointer truncate max-w-[120px]"
                            title={`Click to set ${char.title} as next speaker`}
                          >
                            {char.title}
                          </button>
                          {isNext && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/25 text-amber-300 font-semibold uppercase tracking-wider">
                              Next
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeChatParticipant(char.id)}
                            className="text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer"
                            title={`Remove ${char.title} from this scene`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Persona Pill ("Speaking as") */}
              <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-800/80">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <User className="w-3 h-3 text-sky-400" />
                  <span>Speaking as:</span>
                  {!isEditingPersona ? (
                    <span className="font-semibold text-slate-200">
                      {userChatPersona}
                    </span>
                  ) : (
                    <input
                      type="text"
                      value={customPersonaText}
                      onChange={(e) => setCustomPersonaText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setUserChatPersona(customPersonaText.trim() || 'A stranger');
                          setIsEditingPersona(false);
                        }
                      }}
                      className="bg-slate-900 border border-amber-500/60 rounded px-1.5 py-0.5 text-slate-100 text-[11px] focus:outline-none"
                      autoFocus
                    />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {userChatPersona !== 'A stranger' && !isEditingPersona && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserChatPersona('A stranger');
                        setCustomPersonaText('A stranger');
                      }}
                      className="text-slate-400 hover:text-slate-200 text-[10px] cursor-pointer"
                      title="Reset to default 'A stranger' persona"
                    >
                      Reset to Stranger
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditingPersona) {
                        setUserChatPersona(customPersonaText.trim() || 'A stranger');
                      }
                      setIsEditingPersona(!isEditingPersona);
                    }}
                    className="text-amber-400 hover:text-amber-300 underline font-medium cursor-pointer"
                  >
                    {isEditingPersona ? 'Save' : 'Change Persona'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-400 bg-slate-950/60 border-b border-slate-800">
              No characters found in project. Add one via the Wiki!
            </div>
          )}

          {/* Character Switcher & Multi-Add Popover Panel */}
          {showCharacterPicker && (
            <div className="p-3 bg-slate-950 border-b border-slate-800 space-y-2 text-xs z-30 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    Select Inhabitants for Dialogue & Scenes
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Add multiple characters to converse together, simulate council debates, or steer character-to-character exchanges.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCharacterPicker(false)}
                  className="text-slate-500 hover:text-slate-300 cursor-pointer p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search characters by name, role, tags..."
                  value={characterSearch}
                  onChange={(e) => setCharacterSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 pl-8 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {characterCandidates
                  .filter((c) =>
                    c.title.toLowerCase().includes(characterSearch.toLowerCase()) ||
                    (c.subtitle && c.subtitle.toLowerCase().includes(characterSearch.toLowerCase())) ||
                    (c.tags || []).some((t) => t.toLowerCase().includes(characterSearch.toLowerCase()))
                  )
                  .map((char) => {
                    const isInScene = activeParticipants.some((p) => p.id === char.id);
                    return (
                      <div
                        key={char.id}
                        className={`w-full p-2 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                          isInScene
                            ? 'bg-amber-500/10 border-amber-500/40 text-slate-100'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-100">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: categoryColor(char.category) }}
                            />
                            <span>{char.title}</span>
                            <span className="text-[9.5px] px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                              {categoryLabel(char.category)}
                            </span>
                          </div>
                          {char.subtitle && (
                            <div className="text-[10px] text-slate-400 truncate italic mt-0.5">
                              {char.subtitle}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isInScene ? (
                            <button
                              type="button"
                              onClick={() => removeChatParticipant(char.id)}
                              className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[10.5px] font-medium cursor-pointer"
                            >
                              Remove
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  addChatParticipant(char.id);
                                }}
                                className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[10.5px] font-semibold cursor-pointer"
                              >
                                + Add to Scene
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setChatParticipantIds([char.id]);
                                  setShowCharacterPicker(false);
                                }}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10.5px] cursor-pointer"
                              >
                                Solo
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Conversation Stream */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 min-h-0">
            {currentChatHistory.length === 0 ? (
              /* Empty state: Character intro card & icebreakers */
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 text-center space-y-3 my-4">
                <div className="flex items-center justify-center -space-x-2">
                  {activeParticipants.slice(0, 3).map((p) => (
                    <div
                      key={p.id}
                      className="w-10 h-10 rounded-full border-2 border-slate-900 flex items-center justify-center text-xs font-bold text-white shadow-md"
                      style={{ backgroundColor: categoryColor(p.category) || '#f59e0b' }}
                    >
                      {p.title.slice(0, 2).toUpperCase()}
                    </div>
                  ))}
                </div>

                <div>
                  <h4 className="font-bold text-slate-100 text-sm">
                    {isMultiCharacter
                      ? `Ensemble Dialogue: ${activeParticipants.map((p) => p.title).join(' & ')}`
                      : `Approach ${activeChatCharacter?.title}`}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xs mx-auto">
                    {isMultiCharacter
                      ? 'Simulate a live conversation between these characters, steer their reactions, or address them together as a stranger.'
                      : (activeChatCharacter?.summary ||
                        'An authentic inhabitant of your world, grounded in canonical lore, relationships, and current timeline events.')}
                  </p>
                </div>

                <div className="pt-2 flex flex-col gap-1.5 max-w-xs mx-auto text-left">
                  <div className="text-[11px] font-semibold text-slate-400 mb-0.5">
                    {isMultiCharacter ? 'Suggested Scene Starters:' : 'Suggested Icebreaker Inquiries:'}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleSendCharacterMessage(
                        isMultiCharacter
                          ? `Greetings. What brings the both of you together here in these uncertain times?`
                          : `Greetings, ${activeChatCharacter?.title}. Tell me of your origins and what brought you to your present station.`
                      )
                    }
                    className="p-2 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Quote className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="line-clamp-1">
                      {isMultiCharacter
                        ? 'Ask what brings them together'
                        : 'Inquire about their origins & station'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSendCharacterMessage(
                        isMultiCharacter
                          ? `There are troubling whispers across the realm. Where do your allegiances truly stand with one another?`
                          : `How do you view the recent shifts across the realm, and where do your allegiances truly lie?`
                      )
                    }
                    className="p-2 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Quote className="w-3 h-3 text-sky-400 shrink-0" />
                    <span className="line-clamp-1">Ask where their allegiances lie</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSendCharacterMessage(
                        `What perilous rumors or secrets have you heard regarding the ancient relics of this age?`
                      )
                    }
                    className="p-2 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Quote className="w-3 h-3 text-purple-400 shrink-0" />
                    <span className="line-clamp-1">Ask about rumors & ancient relics</span>
                  </button>
                </div>

                <div className="pt-2">
                  {isMultiCharacter ? (
                    <button
                      type="button"
                      onClick={() => handleAdvanceScene(activeParticipants[0]?.id)}
                      disabled={isCharacterReplying}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Start Scene (Let {activeParticipants[0]?.title} Speak First)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleInitiateGreeting}
                      disabled={isCharacterReplying}
                      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Have {activeChatCharacter?.title} Speak First</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Dialogue Turn Stream */
              currentChatHistory.map((turn) => {
                // 1. Scene Steering / System Directives
                if (turn.role === 'system') {
                  return (
                    <div
                      key={turn.id}
                      className="my-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-center text-xs text-amber-300/90 italic flex items-center justify-center gap-2 shadow-xs"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Scene Directive: &ldquo;{turn.content}&rdquo;</span>
                    </div>
                  );
                }

                // 2. Character Turns
                const isCharacter = turn.role === 'character';
                const speakerEntity = isCharacter
                  ? project?.entities.find(
                      (e) => e.id === turn.characterId || e.title === turn.speakerName
                    )
                  : null;
                const speakerColor = speakerEntity
                  ? categoryColor(speakerEntity.category)
                  : '#f59e0b';

                return (
                  <div
                    key={turn.id}
                    className={`rounded-xl p-3 text-xs leading-relaxed transition-all ${
                      isCharacter
                        ? 'bg-slate-950/90 border border-slate-800 text-slate-200 mr-2 shadow-sm'
                        : 'bg-amber-500/15 border border-amber-500/30 text-slate-100 ml-6 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-800/60">
                      <div className="flex items-center gap-1.5 font-bold text-[11px]">
                        {isCharacter ? (
                          <>
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: speakerColor }}
                            />
                            <span className="text-amber-400">
                              {turn.speakerName}
                            </span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-300 font-normal">
                              In-Character
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-sky-300 font-medium">
                              {turn.speakerName}
                            </span>
                            <span className="text-[9px] text-slate-500 font-normal">
                              (You)
                            </span>
                          </>
                        )}
                      </div>

                      {isCharacter && (
                        <div className="flex items-center gap-1 text-slate-500">
                          {isMultiCharacter && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextChar = activeParticipants.find(
                                  (p) => p.id !== turn.characterId && p.title !== turn.speakerName
                                );
                                if (nextChar) {
                                  handleAdvanceScene(nextChar.id);
                                }
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-amber-300 hover:bg-slate-850 cursor-pointer transition-colors flex items-center gap-1"
                              title="Prompt another character to react directly to this turn"
                            >
                              <Play className="w-2.5 h-2.5" />
                              <span>Reply</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleTransferToStory(turn.content, turn.speakerName)}
                            className="p-1 hover:text-amber-300 hover:bg-slate-850 rounded cursor-pointer transition-colors"
                            title="Transfer this quote to active Story Scene"
                          >
                            <BookOpen className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(turn.content);
                              showToast('Copied to clipboard!');
                            }}
                            className="p-1 hover:text-slate-300 hover:bg-slate-850 rounded cursor-pointer transition-colors"
                            title="Copy dialogue"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <MarkdownRenderer
                      content={turn.content}
                      project={project}
                      onSelectEntity={(id) => selectEntity(id, true)}
                      onCreateStubEntity={(title) =>
                        createEntity({ title, category: 'character' })
                      }
                    />
                  </div>
                );
              })
            )}

            {isCharacterReplying && (
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                <span>
                  <strong>{replyingSpeakerName || activeChatCharacter?.title || 'Character'}</strong> is speaking in character...
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Character-to-Character Scene Steering Controls (when 2+ characters present) */}
          {isMultiCharacter && (
            <div className="p-2.5 bg-slate-950 border-t border-slate-800/90 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                  <span className="text-[11px] text-slate-500 font-medium">Next speaker:</span>
                  <select
                    value={selectedNextSpeakerId || defaultNextSpeaker?.id || ''}
                    onChange={(e) => setSelectedNextSpeakerId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-amber-300 font-semibold focus:outline-none"
                  >
                    {activeParticipants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSteeringBar(!showSteeringBar)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 cursor-pointer transition-colors ${
                      showSteeringBar || steeringDirective.trim()
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                        : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:border-slate-600'
                    }`}
                    title="Direct or steer what happens next in the conversation"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Steer Scene</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAdvanceScene(selectedNextSpeakerId || defaultNextSpeaker?.id)}
                    disabled={isCharacterReplying}
                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                    title="Generate the next character turn in the conversation"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Next Turn</span>
                  </button>
                </div>
              </div>

              {/* Expandable Steering Directive Bar */}
              {showSteeringBar && (
                <div className="p-2 rounded-lg bg-slate-900/90 border border-amber-500/30 space-y-1.5 animate-in fade-in duration-100">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={steeringDirective}
                      onChange={(e) => setSteeringDirective(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAdvanceScene(selectedNextSpeakerId || defaultNextSpeaker?.id);
                        }
                      }}
                      placeholder="Steer the conversation (e.g. 'Accuse them of treason', 'A guard interrupts')..."
                      className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleAdvanceScene(selectedNextSpeakerId || defaultNextSpeaker?.id)}
                      disabled={!steeringDirective.trim() || isCharacterReplying}
                      className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Apply & Speak</span>
                    </button>
                  </div>

                  {/* Quick Steering Suggestions */}
                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                    <span className="text-[10px] text-slate-500 mr-1">Quick steers:</span>
                    {[
                      'Escalate tension',
                      'Propose secret alliance',
                      'Question their loyalty',
                      'Accuse of treachery',
                      'A sudden noise outside',
                      'Demand an oath',
                    ].map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => {
                          setSteeringDirective(sug);
                          handleAdvanceScene(selectedNextSpeakerId || defaultNextSpeaker?.id, sug);
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 cursor-pointer transition-colors"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Character Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendCharacterMessage();
            }}
            className="p-3 border-t border-slate-800 bg-slate-950/95 space-y-2"
          >
            {isMultiCharacter && (
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
                <span className="flex items-center gap-1">
                  <span>Speak as:</span>
                  <strong className="text-slate-200">{userChatPersona}</strong>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Address:</span>
                  <select
                    value={userTargetSpeakerId}
                    onChange={(e) => setUserTargetSpeakerId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none"
                  >
                    <option value="all">Everyone in Scene</option>
                    {activeParticipants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={characterInput}
                onChange={(e) => setCharacterInput(e.target.value)}
                placeholder={
                  isMultiCharacter
                    ? `Speak to the scene as ${userChatPersona}...`
                    : activeChatCharacter
                    ? `Speak with ${activeChatCharacter.title} as ${userChatPersona}...`
                    : 'Select a character to begin speaking...'
                }
                disabled={activeParticipants.length === 0 || isCharacterReplying}
                className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!characterInput.trim() || isCharacterReplying || activeParticipants.length === 0}
                className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold transition-colors cursor-pointer"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

        </div>

        {/* Fullscreen Right Pane: Preferences Side-by-Side! */}
        {isFullScreen && showSettings && renderSettingsPanel(true)}
      </div>
    </aside>
  );
};

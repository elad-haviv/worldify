import React, { useState } from 'react';
import {
  AISettings,
  CharacterChatMessage,
  CharacterGoal,
  CharacterMemory,
  CharacterMind,
  CharacterTier,
  Entity,
  Project,
  SimBranch,
} from '../../types/worldify';
import { generateLivingCharacterChat } from '../../services/simulationEngine';
import { resolveEntityTemporalStatus } from '../../utils/spatioTemporalResolver';
import {
  X,
  BookOpen,
  Brain,
  MessageSquare,
  Sparkles,
  Target,
  HeartHandshake,
  ScrollText,
  Plus,
  Send,
  ShieldAlert,
  ExternalLink,
  CheckCircle2,
  Feather,
} from 'lucide-react';

interface ExtendedCharacterModalProps {
  entity: Entity;
  mind: CharacterMind;
  memories: CharacterMemory[];
  branchProjectView: Project;
  activeBranch: SimBranch;
  aiSettings: AISettings;
  onClose: () => void;
  onOpenInWiki: (entityId: string) => void;
  onUpdateMind: (updatedMind: CharacterMind) => Promise<void>;
  onAddMemory: (newMemory: CharacterMemory) => Promise<void>;
  onTriggerManualReflection: (entity: Entity, mind: CharacterMind) => Promise<void>;
}

export const ExtendedCharacterModal: React.FC<ExtendedCharacterModalProps> = ({
  entity,
  mind,
  memories,
  branchProjectView,
  activeBranch,
  aiSettings,
  onClose,
  onOpenInWiki,
  onUpdateMind,
  onAddMemory,
  onTriggerManualReflection,
}) => {
  const [activeTab, setActiveTab] = useState<'dual' | 'chat'>('dual');
  const [newGoalText, setNewGoalText] = useState('');
  const [newGoalPriority, setNewGoalPriority] = useState<1 | 2 | 3>(1);

  // Chat state ("דבר איתה")
  const [chatHistory, setChatHistory] = useState<CharacterChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [injectIntoBranchMemory, setInjectIntoBranchMemory] = useState<boolean>(true);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isReflecting, setIsReflecting] = useState(false);

  const calendar =
    branchProjectView.calendars.find((c) => c.id === branchProjectView.activeCalendarId) ||
    branchProjectView.calendars[0];
  const temporalStatus = resolveEntityTemporalStatus(
    entity,
    activeBranch.currentTick,
    calendar
  );

  const innerDiaryEntries = memories.filter((m) => m.innerNote && m.innerNote.trim().length > 0);

  const handleTierChange = async (tier: CharacterTier) => {
    await onUpdateMind({
      ...mind,
      tier,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalText.trim()) return;
    const goal: CharacterGoal = {
      id: `goal-${Date.now()}`,
      description: newGoalText.trim(),
      priority: newGoalPriority,
      status: 'active',
      createdAtTick: activeBranch.currentTick,
    };
    await onUpdateMind({
      ...mind,
      goals: [goal, ...mind.goals],
      updatedAt: new Date().toISOString(),
    });
    setNewGoalText('');
  };

  const handleToggleGoalStatus = async (goalId: string) => {
    const nextGoals = mind.goals.map((g) =>
      g.id === goalId
        ? { ...g, status: (g.status === 'active' ? 'achieved' : 'active') as CharacterGoal['status'] }
        : g
    );
    await onUpdateMind({
      ...mind,
      goals: nextGoals,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isSendingChat) return;

    const userText = chatInput.trim();
    setChatInput('');
    setIsSendingChat(true);

    const userMsg: CharacterChatMessage = {
      id: `msg-u-${Date.now()}`,
      characterId: entity.id,
      role: 'user',
      speakerName: 'העורך הראשי',
      content: userText,
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...chatHistory, userMsg];
    setChatHistory(nextHistory);

    try {
      const reply = await generateLivingCharacterChat(
        entity,
        mind,
        memories,
        userText,
        nextHistory,
        branchProjectView,
        activeBranch,
        aiSettings
      );

      const charMsg: CharacterChatMessage = {
        id: `msg-c-${Date.now()}`,
        characterId: entity.id,
        role: 'character',
        speakerName: entity.title,
        content: reply,
        timestamp: new Date().toISOString(),
      };

      setChatHistory([...nextHistory, charMsg]);

      // If user chose to inject this conversation into the character's branch memory bank
      if (injectIntoBranchMemory) {
        await onAddMemory({
          id: `mem-whisper-${activeBranch.id}-${Date.now()}`,
          projectId: branchProjectView.id,
          branchId: activeBranch.id,
          entityId: entity.id,
          tick: activeBranch.currentTick,
          participantIds: [entity.id],
          content: `שיחה/לחישה שהותירה בי רושם עמוק: נשאלתי "${userText}" והשבתי: "${reply.slice(0, 140)}"`,
          innerNote: `בעקבות השיחה הזו עליי לשקול מחדש את צעדיי הקרובים.`,
          importance: 5,
          isWhisperFromCreator: true,
          createdAt: new Date().toISOString(),
        });
      }
    } finally {
      setIsSendingChat(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        dir="rtl"
        className="w-full max-w-6xl h-[88vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold text-lg shrink-0">
              {entity.title.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-slate-100 truncate">
                  {temporalStatus.activeTitle}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {temporalStatus.activeStatus}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs text-slate-400 bg-slate-800">
                  ענף: {activeBranch.name} (טיק {activeBranch.currentTick})
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {entity.subtitle || entity.summary}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Tier Selector */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
              {(
                [
                  { id: 'protagonist', label: 'גיבור (סוכן מלא)' },
                  { id: 'secondary', label: 'משנית' },
                  { id: 'background', label: 'רקע (קוד)' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTierChange(t.id)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    mind.tier === t.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Mode Switcher: Dual View vs Talk to Her */}
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'chat' ? 'dual' : 'chat')}
              className={`h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>{activeTab === 'chat' ? 'חזרה לכרטיס הדו-שכבתי' : 'דבר איתה (סוכן זיכרון חי)'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl border border-slate-800 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        {activeTab === 'dual' ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-800 overflow-hidden">
            {/* RIGHT COLUMN (5 cols): Canonical Wiki Layer (קבוע) */}
            <div className="lg:col-span-5 flex flex-col h-full min-h-0 bg-slate-950/50">
              <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-slate-100">
                    שכבה 1: אופי קבוע וקנון (דף ה-Wiki)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenInWiki(entity.id)}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                >
                  <span>פתח בעורך ה-Wiki</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm text-slate-300">
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                  <div className="text-xs font-semibold text-slate-400 mb-1">תקציר קנוני</div>
                  <p className="text-slate-200 leading-relaxed">{entity.summary}</p>
                  {entity.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {entity.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inner Diary Highlight ("זהב לכתיבה") */}
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                    <Feather className="w-4 h-4" />
                    <span>היומן הפנימי בענף (`inner_note` · זהב לכתיבה)</span>
                  </div>
                  {mind.latestIntent?.inner_note ? (
                    <blockquote className="text-xs text-amber-100/90 italic border-r-2 border-amber-400 pr-3 py-0.5">
                      "{mind.latestIntent.inner_note}"
                    </blockquote>
                  ) : null}
                  {innerDiaryEntries.length > 0 ? (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
                      {innerDiaryEntries.slice(-5).reverse().map((entry) => (
                        <div
                          key={entry.id}
                          className="text-xs text-amber-200/80 bg-slate-950/60 rounded-lg px-2.5 py-1.5"
                        >
                          <span className="text-[10px] text-amber-400/80 font-mono ml-1.5">
                            [טיק {entry.tick}]
                          </span>
                          "{entry.innerNote}"
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-200/60">
                      הרץ טיק כדי שהדמות תכתוב מחשבות פנימיות וספקות חבויים ביומנה.
                    </p>
                  )}
                </div>

                {/* Full Wiki Markdown */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-400">
                    תוכן דף ה-Wiki הקנוני (הסימולציה שואבת ממנו אופי ולא משנה אותו ללא אישור):
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 whitespace-pre-wrap text-xs leading-relaxed text-slate-300 font-sans">
                    {entity.contentMd || 'אין תוכן מפורט בדף ה-Wiki.'}
                  </div>
                </div>
              </div>
            </div>

            {/* LEFT COLUMN (7 cols): Branch Mind, Goals, Relations & Memory Bank */}
            <div className="lg:col-span-7 flex flex-col h-full min-h-0 bg-slate-900">
              <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-slate-100">
                    שכבה 2: תודעת הדמות בענף (`CharacterMind` ובנק זיכרונות)
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={isReflecting}
                  onClick={async () => {
                    setIsReflecting(true);
                    try {
                      await onTriggerManualReflection(entity, mind);
                    } finally {
                      setIsReflecting(false);
                    }
                  }}
                  className="px-3 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isReflecting ? 'מבצע רפלקציה...' : 'בצע רפלקציה עכשיו'}</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Latest Intent Card */}
                {mind.latestIntent && (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-300">
                        כוונה אחרונה בטיק ({mind.latestIntent.action})
                      </span>
                      <span className="text-[11px] text-emerald-400/80">
                        יעדים: {mind.latestIntent.targets.join(', ') || 'ללא'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-100">
                      "{mind.latestIntent.intent}"
                    </p>
                    <p className="text-xs text-slate-300">
                      <strong className="text-slate-400">נימוק:</strong> {mind.latestIntent.reasoning}
                    </p>
                  </div>
                )}

                {/* Goals Section */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                    <Target className="w-4 h-4 text-amber-400" />
                    <span>מטרות פעילות בענף (1–3 מטרות שמנחות את הסוכן)</span>
                  </div>

                  <div className="space-y-2">
                    {mind.goals.map((g) => (
                      <div
                        key={g.id}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                          g.status === 'achieved'
                            ? 'bg-slate-950/40 border-slate-800/60 opacity-60 line-through'
                            : 'bg-slate-950/80 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              g.priority === 1
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : g.priority === 2
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            עדיפות {g.priority}
                          </span>
                          <span className="text-xs text-slate-200 truncate">{g.description}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleGoalStatus(g.id)}
                          className="text-xs text-slate-400 hover:text-emerald-400 shrink-0 cursor-pointer"
                          title="סמן כהושגה / פעילה"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleAddGoal} className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newGoalText}
                      onChange={(e) => setNewGoalText(e.target.value)}
                      placeholder="הוסף מטרה חדשה לדמות בענף זה..."
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                    <select
                      value={newGoalPriority}
                      onChange={(e) => setNewGoalPriority(Number(e.target.value) as 1 | 2 | 3)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value={1}>עדיפות 1</option>
                      <option value={2}>עדיפות 2</option>
                      <option value={3}>עדיפות 3</option>
                    </select>
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>הוסף</span>
                    </button>
                  </form>
                </div>

                {/* Internal Relations Section */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                    <HeartHandshake className="w-4 h-4 text-sky-400" />
                    <span>יחסים פנימיים (אמון, עוינות וחוב)</span>
                  </div>
                  {mind.internalRelations.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {mind.internalRelations.map((rel) => (
                        <div
                          key={rel.targetEntityId}
                          className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200">
                              {rel.targetName}
                            </span>
                            <span className="text-[10px] text-slate-400">{rel.debtOrBond}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px]">
                            <span className="text-emerald-400">אמון: {rel.trust}</span>
                            <span className="text-rose-400">עוינות: {rel.hostility}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">אין יחסים פנימיים רשומים.</p>
                  )}
                </div>

                {/* Personal Memory Bank */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      <ScrollText className="w-4 h-4 text-purple-400" />
                      <span>בנק זיכרונות אישי ({memories.length} זיכרונות מנקודת מבטה)</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      נשלף לפי רלוונטיות, טריות וחשיבות
                    </span>
                  </div>

                  {memories.length > 0 ? (
                    <div className="space-y-2">
                      {memories
                        .slice()
                        .reverse()
                        .map((mem) => (
                          <div
                            key={mem.id}
                            className={`p-3 rounded-xl border text-xs space-y-1 ${
                              mem.isReflection
                                ? 'bg-purple-500/10 border-purple-500/30 text-purple-100'
                                : mem.isWhisperFromCreator
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-100'
                                  : 'bg-slate-950/80 border-slate-800 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span className="font-mono">
                                טיק {mem.tick} {mem.locationName ? `· ${mem.locationName}` : ''}
                              </span>
                              <div className="flex items-center gap-2">
                                {mem.isReflection && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px]">
                                    מסקנת רפלקציה
                                  </span>
                                )}
                                {mem.isWhisperFromCreator && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                                    הוזרק בשיחה
                                  </span>
                                )}
                                <span className="text-amber-400">
                                  {'★'.repeat(mem.importance)}
                                </span>
                              </div>
                            </div>
                            <p className="leading-relaxed">{mem.content}</p>
                            {mem.innerNote && (
                              <p className="text-[11px] text-amber-300/90 italic pt-0.5">
                                💭 יומן פנימי: "{mem.innerNote}"
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                      בנק הזיכרונות של {entity.title} בענף זה עדיין ריק. הרץ טיק או דבר איתה כדי ליצור זיכרונות.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* CHAT TAB ("דבר איתה") */
          <div className="flex-1 min-h-0 flex flex-col bg-slate-950">
            <div className="px-6 py-3 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <ShieldAlert className="w-4 h-4 text-emerald-400" />
                <span>
                  שיחה ישירה עם סוכן הדמות של <strong>{entity.title}</strong>, משולבת בזיכרונות הענף ובאופק הידיעה שלה בטיק {activeBranch.currentTick}.
                </span>
              </div>

              <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg">
                <input
                  type="checkbox"
                  checked={injectIntoBranchMemory}
                  onChange={(e) => setInjectIntoBranchMemory(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                <span>שמור שיחה זו כזיכרון חי של הדמות בענף (ישפיע על הטיק הבא)</span>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatHistory.length === 0 && (
                <div className="max-w-lg mx-auto my-12 text-center space-y-2">
                  <MessageSquare className="w-10 h-10 text-emerald-400/50 mx-auto" />
                  <p className="text-sm font-semibold text-slate-200">
                    פתח שיחה עם {entity.title}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    שאל אותה על כוונותיה בטיק הנוכחי, על ספקותיה ביומן הפנימי, או לחש לה שמועה שתשנה את החלטתה בטיק הבא.
                  </p>
                </div>
              )}

              {chatHistory.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-slate-800 text-slate-100'
                        : 'bg-emerald-950/70 border border-emerald-500/30 text-emerald-100'
                    }`}
                  >
                    <div className="text-[11px] font-bold mb-1 text-slate-400">
                      {msg.speakerName}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleSendChat}
              className="p-4 bg-slate-900 border-t border-slate-800 flex items-center gap-3"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={`דבר אל ${entity.title} (למשל: "מדוע אינך סומכת על המועצה?" או "שמעתי שהצבא מהצפון כבר חצה את הנהר")...`}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={isSendingChat || !chatInput.trim()}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{isSendingChat ? 'חושבת...' : 'שלח'}</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

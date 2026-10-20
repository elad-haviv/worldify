import React, { useMemo, useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { formatTickToDate } from '../../utils/calendarEngine';
import {
  auditStoryContinuity,
  resolveEntityTemporalStatus,
} from '../../utils/spatioTemporalResolver';
import { generateAICopilotResponse } from '../../services/aiService';
import {
  Feather,
  Plus,
  Clock,
  MapPin,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Wand2,
  Sparkles,
  Trash2,
  Eye,
  Edit3,
  Columns,
  Map as MapIcon,
} from 'lucide-react';

export const StoryStudioView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedStoryId,
    selectedSceneId,
    selectStoryScene,
    selectEntity,
    selectMap,
    setCurrentTick,
    createStory,
    addStoryChapter,
    addStoryScene,
    updateStoryScene,
    deleteStoryScene,
    createEntity,
    aiSettings,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const [subView, setSubView] = useState<'manuscript' | 'story_timeline' | 'story_map'>('manuscript');
  const [editorMode, setEditorMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [isAiBusy, setIsAiBusy] = useState(false);

  // Modals
  const [showNewStory, setShowNewStory] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState('');
  const [newStorySubtitle, setNewStorySubtitle] = useState('');
  const [newStorySynopsis, setNewStorySynopsis] = useState('');

  const [showNewChap, setShowNewChap] = useState(false);
  const [newChapTitle, setNewChapTitle] = useState('');
  const [newChapSynopsis, setNewChapSynopsis] = useState('');

  if (!project) return null;

  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];

  const activeStory =
    project.stories.find((s) => s.id === selectedStoryId) || project.stories[0] || null;

  const allChapters = activeStory?.chapters || [];
  let activeScene = null;
  let activeChapter = null;

  for (const ch of allChapters) {
    for (const sc of ch.scenes) {
      if (sc.id === selectedSceneId) {
        activeScene = sc;
        activeChapter = ch;
      }
    }
  }
  if (!activeScene && allChapters[0]?.scenes[0]) {
    activeScene = allChapters[0].scenes[0];
    activeChapter = allChapters[0];
  }

  // Run Live Continuity Audit across activeStory
  const continuityIssues = useMemo(() => {
    if (!activeStory) return [];
    return auditStoryContinuity(project, activeStory);
  }, [project, activeStory]);

  const sceneFormattedDate =
    activeScene && calendar ? formatTickToDate(calendar, activeScene.startTick) : null;

  const wordCount = activeScene
    ? activeScene.contentMd
        .trim()
        .split(/\s+/)
        .filter(Boolean).length
    : 0;

  const handleSceneAI = async (mode: 'continue' | 'sensory' | 'advice') => {
    if (!activeStory || !activeChapter || !activeScene || isAiBusy) return;
    setIsAiBusy(true);
    try {
      const pov = project.entities.find((e) => e.id === activeScene.povEntityId);
      const cast = activeScene.participatingEntityIds
        .map((id) => project.entities.find((e) => e.id === id)?.title)
        .filter(Boolean);

      if (aiSettings.activeProvider !== 'local_synthesizer') {
        const prompt =
          mode === 'continue'
            ? `Continue writing the next 2 paragraphs of Scene "${activeScene.title}" from the POV of [[${pov?.title || 'the protagonist'}]], featuring ${cast.map((c) => `[[${c}]]`).join(', ')}. Use [[WikiLinks]] for entities.`
            : mode === 'sensory'
              ? `Write a vivid sensory paragraph grounding "${activeScene.title}" in its date (${sceneFormattedDate?.displayFull}) and moon phases.`
              : `Give narrative pacing and continuity advice for "${activeScene.title}".`;

        const res = await generateAICopilotResponse(
          prompt,
          project,
          activeScene.povEntityId || null,
          activeScene.mapId || null,
          aiSettings
        );
        updateStoryScene(activeStory.id, activeChapter.id, activeScene.id, {
          contentMd: `${activeScene.contentMd}\n\n${res.content}`,
        });
      } else {
        const moonDesc = sceneFormattedDate?.moonPhases
          .map((m) => `${m.moon.name} (${m.phaseName} ${m.phaseIcon})`)
          .join(' and ');

        const addition =
          mode === 'continue'
            ? `\n\nBeneath the watchful light of ${moonDesc || 'the stars'}, [[${
                pov?.title || cast[0] || 'Empress Lyra Vaelor'
              }]] weighed the stakes of the unfolding convergence. Every league separating them from their objective seemed to hum with the ancient resonance of **${
                project.name
              }**.`
            : mode === 'sensory'
              ? `\n\n> [!TIP]\n> **Scene Atmosphere (${
                  sceneFormattedDate?.displayShort || 'Current Date'
                })**: Crisp ${
                  sceneFormattedDate?.month.season || 'seasonal'
                } air carries the scent of cold iron and ozone while ${
                  moonDesc || 'the celestial bodies'
                } cast long shadows across the stone.`
              : `\n\n> [!NOTE]\n> **AI Narrative Note**: Consider emphasizing the emotional contrast between [[${
                  pov?.title || 'the POV character'
                }]]'s duty and the ticking clock toward the next historical milestone on the timeline.`;

        updateStoryScene(activeStory.id, activeChapter.id, activeScene.id, {
          contentMd: `${activeScene.contentMd}${addition}`,
        });
      }
    } finally {
      setIsAiBusy(false);
    }
  };

  return (
    <div className="h-full flex bg-slate-950 overflow-hidden">
      {/* Left Sidebar: Story Selector, Chapters & Scenes Outliner */}
      <aside className="w-72 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-3 shrink-0 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
            <Feather className="w-4 h-4 text-pink-400" />
            Story Studio
          </h2>
          <button
            type="button"
            onClick={() => setShowNewStory(true)}
            className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            New Story
          </button>
        </div>

        {project.stories.length > 0 && (
          <select
            value={activeStory?.id || ''}
            onChange={(e) => {
              const st = project.stories.find((s) => s.id === e.target.value);
              if (st) {
                selectStoryScene(st.id, st.chapters[0]?.scenes[0]?.id || '');
              }
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100 font-medium"
          >
            {project.stories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}

        {activeStory ? (
          <>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs capitalize text-slate-400 font-semibold">
                Manuscript Structure
              </span>
              <button
                type="button"
                onClick={() => setShowNewChap(true)}
                className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                + Chapter
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {activeStory.chapters.map((chap) => (
                <div
                  key={chap.id}
                  className="rounded-lg bg-slate-950/70 border border-slate-800/90 p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 truncate">
                      {chap.title}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        addStoryScene(activeStory.id, chap.id, {
                          title: `Scene ${chap.scenes.length + 1}`,
                        })
                      }
                      className="text-xs px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 cursor-pointer"
                      title="Add Scene to Chapter"
                    >
                      + Scene
                    </button>
                  </div>

                  <div className="space-y-1">
                    {chap.scenes.map((sc) => {
                      const isSel = sc.id === activeScene?.id;
                      const scDate = calendar
                        ? formatTickToDate(calendar, sc.startTick).displayShort
                        : `T:${sc.startTick}`;
                      return (
                        <button
                          key={sc.id}
                          type="button"
                          onClick={() => {
                            selectStoryScene(activeStory.id, sc.id);
                            setCurrentTick(sc.startTick);
                          }}
                          className={`w-full p-2 rounded text-left transition-colors cursor-pointer border ${
                            isSel
                              ? 'bg-pink-500/15 border-pink-500/40 text-slate-100'
                              : 'bg-slate-900/60 border-transparent hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="font-medium truncate">{sc.title}</div>
                          <div className="flex items-center justify-between text-xs text-slate-400 mt-0.5">
                            <span>{scDate}</span>
                            <span className="capitalize">{sc.status}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-slate-500 space-y-2">
            <Feather className="w-8 h-8 text-slate-700" />
            <p>No stories in this project yet. Click "+ New Story" to begin a manuscript!</p>
          </div>
        )}
      </aside>

      {/* Center: Manuscript Editor / Dedicated Story Timeline / Dedicated Story Map */}
      {activeStory && activeScene && activeChapter ? (
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Sub-Navigation & AI Toolbar */}
          <div className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setSubView('manuscript')}
                className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  subView === 'manuscript'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-slate-100'
                }`}
              >
                <Feather className="w-3.5 h-3.5" />
                Scene Manuscript
              </button>
              <button
                type="button"
                onClick={() => setSubView('story_timeline')}
                className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  subView === 'story_timeline'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-slate-100'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Story Timeline
              </button>
              <button
                type="button"
                onClick={() => setSubView('story_map')}
                className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  subView === 'story_map'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-slate-100'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                Story Journey Map
              </button>
            </div>

            {subView === 'manuscript' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
                  <button
                    type="button"
                    disabled={isAiBusy}
                    onClick={() => handleSceneAI('continue')}
                    className="px-2 py-1 rounded text-amber-300 hover:bg-amber-500/15 flex items-center gap-1 cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" />
                    Continue Scene
                  </button>
                  <button
                    type="button"
                    disabled={isAiBusy}
                    onClick={() => handleSceneAI('sensory')}
                    className="px-2 py-1 rounded text-sky-300 hover:bg-sky-500/15 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    Sensory & Moon Detail
                  </button>
                  <button
                    type="button"
                    disabled={isAiBusy}
                    onClick={() => handleSceneAI('advice')}
                    className="px-2 py-1 rounded text-emerald-300 hover:bg-emerald-500/15 flex items-center gap-1 cursor-pointer"
                  >
                    Pacing Advice
                  </button>
                </div>

                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setEditorMode('edit')}
                    className={`p-1.5 rounded cursor-pointer ${
                      editorMode === 'edit' ? 'bg-slate-800 text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('split')}
                    className={`p-1.5 rounded cursor-pointer ${
                      editorMode === 'split' ? 'bg-slate-800 text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    <Columns className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('preview')}
                    className={`p-1.5 rounded cursor-pointer ${
                      editorMode === 'preview' ? 'bg-slate-800 text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SUBVIEW 1: MANUSCRIPT EDITOR */}
          {subView === 'manuscript' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="px-6 py-3 bg-slate-900/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <input
                  type="text"
                  value={activeScene.title}
                  onChange={(e) =>
                    updateStoryScene(activeStory.id, activeChapter.id, activeScene.id, {
                      title: e.target.value,
                    })
                  }
                  className="text-xl font-display font-bold text-slate-100 bg-transparent focus:outline-none flex-1"
                />
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="font-mono">
                    {wordCount} / {activeScene.wordCountGoal || 1500} words
                  </span>
                  <select
                    value={activeScene.status}
                    onChange={(e) =>
                      updateStoryScene(activeStory.id, activeChapter.id, activeScene.id, {
                        status: e.target.value as typeof activeScene.status,
                      })
                    }
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 capitalize text-xs"
                  >
                    <option value="outline">Outline</option>
                    <option value="draft">Draft</option>
                    <option value="revised">Revised</option>
                    <option value="final">Final</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      deleteStoryScene(activeStory.id, activeChapter.id, activeScene.id)
                    }
                    className="text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex min-h-0 overflow-hidden">
                {(editorMode === 'edit' || editorMode === 'split') && (
                  <textarea
                    value={activeScene.contentMd}
                    onChange={(e) =>
                      updateStoryScene(activeStory.id, activeChapter.id, activeScene.id, {
                        contentMd: e.target.value,
                      })
                    }
                    placeholder="Write your scene prose using [[Entity Name]] to link characters, relics, and locations..."
                    className={`flex-1 h-full bg-slate-950 p-6 text-sm font-mono text-slate-200 leading-relaxed focus:outline-none resize-none ${
                      editorMode === 'split' ? 'border-r border-slate-800' : ''
                    }`}
                  />
                )}
                {(editorMode === 'preview' || editorMode === 'split') && (
                  <div className="flex-1 h-full overflow-y-auto p-6 bg-slate-950/50 space-y-4">
                    <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-300 italic">
                      {activeScene.summary}
                    </div>
                    <MarkdownRenderer
                      content={activeScene.contentMd}
                      project={project}
                      onSelectEntity={(id) => selectEntity(id, true)}
                      onCreateStubEntity={(title) =>
                        createEntity({ title, category: 'character' })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SUBVIEW 2: DEDICATED STORY TIMELINE */}
          {subView === 'story_timeline' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <h3 className="text-lg font-semibold text-slate-100">
                Chronological Scene Sequence — {activeStory.title}
              </h3>
              <div className="relative pl-6 border-l-2 border-pink-500/40 space-y-4">
                {activeStory.chapters
                  .flatMap((ch) =>
                    ch.scenes.map((sc) => ({ chapterTitle: ch.title, scene: sc }))
                  )
                  .sort((a, b) => a.scene.startTick - b.scene.startTick)
                  .map(({ chapterTitle, scene }) => {
                    const d = calendar
                      ? formatTickToDate(calendar, scene.startTick)
                      : null;
                    const pov = project.entities.find(
                      (e) => e.id === scene.povEntityId
                    );
                    return (
                      <div
                        key={scene.id}
                        onClick={() => {
                          selectStoryScene(activeStory.id, scene.id);
                          setCurrentTick(scene.startTick);
                          setSubView('manuscript');
                        }}
                        className="relative p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-pink-500/50 cursor-pointer space-y-1.5"
                      >
                        <span className="absolute -left-[31px] top-5 w-3.5 h-3.5 rounded-full bg-pink-500 border-2 border-slate-950" />
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-pink-300 font-semibold">
                            {d?.displayFull || `Tick ${scene.startTick}`}
                          </span>
                          <span className="text-xs text-slate-400">
                            {chapterTitle}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-slate-100">
                          {scene.title}
                        </div>
                        <p className="text-xs text-slate-300">{scene.summary}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          {pov && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              POV: {pov.title}
                            </span>
                          )}
                          {d?.moonPhases.map((mp) => (
                            <span key={mp.moon.id} className="text-slate-400">
                              {mp.phaseIcon} {mp.moon.name.split(' ')[0]}: {mp.phaseName}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* SUBVIEW 3: DEDICATED STORY JOURNEY MAP */}
          {subView === 'story_map' && (
            <div className="flex-1 flex flex-col p-6 space-y-3 overflow-hidden">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">
                  Visualizing scene locations & narrative journey path. Click anywhere on the map to move the active scene's location (`{activeScene.title}`).
                </span>
                <span className="font-mono text-amber-300">
                  Active Scene Coords: ({activeScene.locationX ?? 500},{' '}
                  {activeScene.locationY ?? 500})
                </span>
              </div>

              <div className="flex-1 rounded-xl border border-slate-800 bg-[#081b33] overflow-hidden relative">
                {(() => {
                  const storyScenesWithCoords = activeStory.chapters
                    .flatMap((ch) => ch.scenes)
                    .filter(
                      (sc) => sc.locationX !== undefined && sc.locationY !== undefined
                    );
                  const pathD = storyScenesWithCoords
                    .map(
                      (sc, i) =>
                        `${i === 0 ? 'M' : 'L'} ${sc.locationX} ${sc.locationY}`
                    )
                    .join(' ');
                  const mapObj =
                    project.maps.find((m) => m.id === activeScene.mapId) ||
                    project.maps[0];

                  return (
                    <svg
                      viewBox="0 0 1000 1000"
                      className="w-full h-full cursor-crosshair select-none"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = Math.round(
                          ((e.clientX - rect.left) / rect.width) * 1000
                        );
                        const y = Math.round(
                          ((e.clientY - rect.top) / rect.height) * 1000
                        );
                        updateStoryScene(
                          activeStory.id,
                          activeChapter.id,
                          activeScene.id,
                          {
                            mapId: mapObj?.id,
                            locationX: x,
                            locationY: y,
                          }
                        );
                      }}
                    >
                      {/* Render Background Procedural Cells if available */}
                      {mapObj?.proceduralData?.cells.map((cell) => (
                        <polygon
                          key={cell.id}
                          points={cell.polygon.map((p) => `${p[0]},${p[1]}`).join(' ')}
                          fill={
                            cell.elevation < mapObj.proceduralData!.seaLevel
                              ? '#0c2340'
                              : '#1e293b'
                          }
                          stroke="#0f172a"
                          strokeWidth={0.5}
                        />
                      ))}

                      {/* Story Scene Route Line */}
                      {storyScenesWithCoords.length >= 2 && (
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#ec4899"
                          strokeWidth={3.5}
                          strokeDasharray="8 5"
                        />
                      )}

                      {/* Scene Nodes */}
                      {storyScenesWithCoords.map((sc, idx) => {
                        const isCur = sc.id === activeScene.id;
                        return (
                          <g
                            key={sc.id}
                            transform={`translate(${sc.locationX}, ${sc.locationY})`}
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectStoryScene(activeStory.id, sc.id);
                            }}
                          >
                            <circle
                              r={isCur ? 14 : 9}
                              fill={isCur ? '#ec4899' : '#0f172a'}
                              stroke="#f472b6"
                              strokeWidth={2.5}
                            />
                            <text
                              y={4}
                              textAnchor="middle"
                              fill="#fff"
                              fontSize={10}
                              fontWeight={700}
                            >
                              {idx + 1}
                            </text>
                            <text
                              y={-16}
                              textAnchor="middle"
                              fill={isCur ? '#fbcfe8' : '#cbd5e1'}
                              stroke="#020617"
                              strokeWidth={3}
                              paintOrder="stroke"
                              fontSize={12}
                              fontWeight={700}
                            >
                              {sc.title}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
            </div>
          )}
        </main>
      ) : null}

      {/* Right Sidebar: Scene Metadata Bindings & Live Spatio-Temporal Continuity Auditor */}
      {activeStory && activeScene && activeChapter && (
        <aside className="w-80 bg-slate-900 border-l border-slate-800 p-4 overflow-y-auto space-y-5 shrink-0 text-xs">
          {/* Scene Spatio-Temporal Bindings */}
          <div className="space-y-3">
            <div className="text-xs font-semibold capitalize text-amber-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Scene Spatio-Temporal Anchor
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="text-slate-200 font-semibold">
                {sceneFormattedDate?.displayFull || `Tick ${activeScene.startTick}`}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                {sceneFormattedDate?.moonPhases.map((mp) => (
                  <span key={mp.moon.id}>
                    {mp.phaseIcon} {mp.moon.name.split(' ')[0]}: {mp.phaseName}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-0.5">
                  Scene Start Tick
                </label>
                <input
                  type="number"
                  value={activeScene.startTick}
                  onChange={(e) => {
                    const nextTick = Number(e.target.value);
                    updateStoryScene(
                      activeStory.id,
                      activeChapter.id,
                      activeScene.id,
                      { startTick: nextTick }
                    );
                    setCurrentTick(nextTick);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-0.5">
                  POV Character
                </label>
                <select
                  value={activeScene.povEntityId || ''}
                  onChange={(e) =>
                    updateStoryScene(
                      activeStory.id,
                      activeChapter.id,
                      activeScene.id,
                      { povEntityId: e.target.value || undefined }
                    )
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
                >
                  <option value="">— Select POV —</option>
                  {project.entities
                    .filter((en) => en.category === 'character')
                    .map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {activeScene.mapId && (
              <button
                type="button"
                onClick={() => {
                  setCurrentTick(activeScene.startTick);
                  selectMap(activeScene.mapId!, true);
                }}
                className="w-full py-1.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" />
                Inspect Scene Location on World Map
              </button>
            )}
          </div>

          {/* Participating Cast & Entities in Scene */}
          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <div className="text-xs font-semibold capitalize text-slate-300 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              Cast, Relics & Locations in Scene
            </div>

            <div className="space-y-1.5">
              {activeScene.participatingEntityIds.map((eid) => {
                const ent = project.entities.find((x) => x.id === eid);
                if (!ent) return null;
                const status = resolveEntityTemporalStatus(
                  ent,
                  activeScene.startTick,
                  calendar
                );
                return (
                  <div
                    key={eid}
                    className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => selectEntity(ent.id, true)}
                      className="text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="font-semibold text-slate-200 truncate">
                        {status.activeTitle}
                      </div>
                      <div className="text-xs text-slate-400">
                        {status.activeStatus}{' '}
                        {status.ageYears !== undefined
                          ? `• Age ${status.ageYears}`
                          : ''}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateStoryScene(
                          activeStory.id,
                          activeChapter.id,
                          activeScene.id,
                          {
                            participatingEntityIds:
                              activeScene.participatingEntityIds.filter(
                                (id) => id !== eid
                              ),
                          }
                        )
                      }
                      className="text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id || activeScene.participatingEntityIds.includes(id)) return;
                updateStoryScene(activeStory.id, activeChapter.id, activeScene.id, {
                  participatingEntityIds: [...activeScene.participatingEntityIds, id],
                });
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-300"
            >
              <option value="">+ Add Entity to Scene Cast...</option>
              {project.entities.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.title} ({en.category})
                </option>
              ))}
            </select>
          </div>

          {/* Live Spatio-Temporal Continuity Auditor */}
          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <div className="text-xs font-semibold capitalize text-slate-300 flex items-center justify-between">
              <span>Spatio-Temporal Continuity</span>
              {continuityIssues.length === 0 ? (
                <span className="text-emerald-400 flex items-center gap-1 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5" /> {continuityIssues.length} Alert(s)
                </span>
              )}
            </div>

            {continuityIssues.length === 0 ? (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 leading-relaxed">
                All participating entities exist at their scene timestamps and travel speeds between scenes are consistent with map scale.
              </div>
            ) : (
              <div className="space-y-2">
                {continuityIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                      issue.severity === 'error'
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                        : 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                    }`}
                  >
                    <div className="font-semibold">{issue.message}</div>
                    <p className="text-xs opacity-85 leading-relaxed">
                      {issue.detail}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* New Story Modal */}
      {showNewStory && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newStoryTitle.trim()) return;
              createStory(
                newStoryTitle.trim(),
                newStorySubtitle.trim(),
                newStorySynopsis.trim() || 'A new narrative set in the world.'
              );
              setNewStoryTitle('');
              setNewStorySubtitle('');
              setNewStorySynopsis('');
              setShowNewStory(false);
            }}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-lg font-semibold text-slate-100">
              Create New Story / Campaign
            </h3>
            <div>
              <label className="block text-slate-300 mb-1">Story Title *</label>
              <input
                type="text"
                required
                value={newStoryTitle}
                onChange={(e) => setNewStoryTitle(e.target.value)}
                placeholder="e.g., Ashes of the Star-Spire"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Subtitle</label>
              <input
                type="text"
                value={newStorySubtitle}
                onChange={(e) => setNewStorySubtitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Synopsis</label>
              <textarea
                rows={3}
                value={newStorySynopsis}
                onChange={(e) => setNewStorySynopsis(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewStory(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold cursor-pointer"
              >
                Create Story
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Chapter Modal */}
      {showNewChap && activeStory && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newChapTitle.trim()) return;
              addStoryChapter(
                activeStory.id,
                newChapTitle.trim(),
                newChapSynopsis.trim()
              );
              setNewChapTitle('');
              setNewChapSynopsis('');
              setShowNewChap(false);
            }}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-lg font-semibold text-slate-100">
              Add Chapter to {activeStory.title}
            </h3>
            <div>
              <label className="block text-slate-300 mb-1">Chapter Title *</label>
              <input
                type="text"
                required
                value={newChapTitle}
                onChange={(e) => setNewChapTitle(e.target.value)}
                placeholder="e.g., Chapter III: The Eclipse Convergence"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Synopsis</label>
              <textarea
                rows={2}
                value={newChapSynopsis}
                onChange={(e) => setNewChapSynopsis(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewChap(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold cursor-pointer"
              >
                Add Chapter
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

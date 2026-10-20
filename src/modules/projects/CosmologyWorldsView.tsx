import React, { useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import { World, WorldConnection, WorldType } from '../../types/worldify';
import {
  Globe2,
  Plus,
  Link2,
  Trash2,
  Map as MapIcon,
  BookOpen,
  Sparkles,
  Orbit,
} from 'lucide-react';
import { SidePanel } from '../../components/SidePanel';

export const CosmologyWorldsView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    setActiveWorld,
    addWorld,
    updateWorld,
    addWorldConnection,
    deleteWorldConnection,
    selectMap,
    selectEntity,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const [draggingWorldId, setDraggingWorldId] = useState<string | null>(null);
  const [showAddWorld, setShowAddWorld] = useState(false);
  const [showAddConn, setShowAddConn] = useState(false);

  // New World Form
  const [wName, setWName] = useState('');
  const [wType, setWType] = useState<WorldType>('plane');
  const [wColor, setWColor] = useState('#38bdf8');
  const [wSummary, setWSummary] = useState('');
  const [wRules, setWRules] = useState('');

  // New Connection Form
  const [srcWorldId, setSrcWorldId] = useState('');
  const [tgtWorldId, setTgtWorldId] = useState('');
  const [connType, setConnType] = useState<WorldConnection['type']>('planar_rift');
  const [connLabel, setConnLabel] = useState('');

  if (!project) return null;

  const activeWorld =
    project.worlds.find((w) => w.id === project.activeWorldId) || project.worlds[0];

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggingWorldId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);
    updateWorld(draggingWorldId, {
      cosmologyX: Math.max(60, Math.min(940, x)),
      cosmologyY: Math.max(60, Math.min(940, y)),
    });
  };

  const handleCreateWorld = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wName.trim()) return;
    addWorld({
      name: wName.trim(),
      type: wType,
      color: wColor,
      summary: wSummary.trim() || `Connected ${wType} in ${project.name}.`,
      magicOrPhysicsRules: wRules.trim() || 'Standard cosmological laws.',
      cosmologyX: Math.round(250 + Math.random() * 500),
      cosmologyY: Math.round(250 + Math.random() * 500),
      orbitRadius: 240,
    });
    setWName('');
    setWSummary('');
    setWRules('');
    setShowAddWorld(false);
  };

  const handleCreateConn = (e: React.FormEvent) => {
    e.preventDefault();
    const s = srcWorldId || project.worlds[0]?.id;
    const t = tgtWorldId || project.worlds[1]?.id;
    if (!s || !t || s === t) return;
    addWorldConnection({
      sourceWorldId: s,
      targetWorldId: t,
      type: connType,
      label: connLabel.trim() || connType.replace(/_/g, ' '),
      color: '#f59e0b',
    });
    setConnLabel('');
    setShowAddConn(false);
  };

  const worldEntities = project.entities.filter((e) => e.worldId === activeWorld?.id);
  const worldMaps = project.maps.filter((m) => m.worldId === activeWorld?.id);

  return (
    <div className="h-full flex flex-col lg:flex-row bg-slate-950 overflow-hidden">
      {/* Left / Center: Interactive Planar & Orbital Cosmology Orrery Canvas */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Top Toolbar */}
        <div className="px-6 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 z-10">
          <div className="flex items-center gap-2">
            <Orbit className="w-4 h-4 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Orrery
            </h2>
            <span className="text-xs text-slate-400 hidden sm:inline">
              Drag worlds to rearrange them
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddConn(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Link2 className="w-4 h-4" />
              Connect worlds
            </button>
            <button
              type="button"
              onClick={() => setShowAddWorld(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add world
            </button>
          </div>
        </div>

        {/* Interactive SVG Orrery */}
        <div className="flex-1 relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
          <svg
            viewBox="0 0 1000 1000"
            className="w-full h-full select-none"
            onMouseMove={handleSvgMouseMove}
            onMouseUp={() => setDraggingWorldId(null)}
            onMouseLeave={() => setDraggingWorldId(null)}
          >
            <defs>
              <radialGradient id="cosmosGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.18" />
                <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Background Astral Grid & Concentric Orbital Rings */}
            <circle cx={500} cy={500} r={420} fill="url(#cosmosGlow)" />
            {[160, 280, 390].map((r) => (
              <circle
                key={r}
                cx={500}
                cy={500}
                r={r}
                fill="none"
                stroke="#1e293b"
                strokeWidth={1.5}
                strokeDasharray="6 6"
              />
            ))}

            {/* World Connections (Portals, Tethers, Wormholes) */}
            {project.worldConnections.map((conn) => {
              const s = project.worlds.find((w) => w.id === conn.sourceWorldId);
              const t = project.worlds.find((w) => w.id === conn.targetWorldId);
              if (!s || !t) return null;

              const isTemporallyActive =
                (conn.validFromTick === undefined || project.currentTick >= conn.validFromTick) &&
                (conn.validToTick === undefined || project.currentTick <= conn.validToTick);

              const midX = (s.cosmologyX + t.cosmologyX) / 2;
              const midY = (s.cosmologyY + t.cosmologyY) / 2;

              return (
                <g key={conn.id} opacity={isTemporallyActive ? 1 : 0.25}>
                  <line
                    x1={s.cosmologyX}
                    y1={s.cosmologyY}
                    x2={t.cosmologyX}
                    y2={t.cosmologyY}
                    stroke={conn.color || '#38bdf8'}
                    strokeWidth={isTemporallyActive ? 3 : 1.5}
                    strokeDasharray={conn.type === 'planar_rift' ? '8 5' : undefined}
                  />
                  <rect
                    x={midX - 95}
                    y={midY - 13}
                    width={190}
                    height={24}
                    rx={6}
                    fill="#0f172a"
                    stroke={conn.color || '#38bdf8'}
                    strokeWidth={1}
                  />
                  <text
                    x={midX}
                    y={midY + 3}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize={11}
                    fontWeight={500}
                  >
                    {conn.label} {!isTemporallyActive ? '(Dormant at Tick)' : ''}
                  </text>
                </g>
              );
            })}

            {/* Worlds / Planes Nodes */}
            {project.worlds.map((world: World) => {
              const isSelected = world.id === activeWorld?.id;
              const radius = world.parentWorldId ? 34 : 46;

              return (
                <g
                  key={world.id}
                  transform={`translate(${world.cosmologyX}, ${world.cosmologyY})`}
                  className="cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setActiveWorld(world.id);
                    setDraggingWorldId(world.id);
                  }}
                >
                  {/* Outer Halo */}
                  <circle
                    r={radius + 12}
                    fill={world.color}
                    fillOpacity={isSelected ? 0.25 : 0.08}
                    stroke={isSelected ? world.color : 'transparent'}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                  {/* Planet/Plane Sphere */}
                  <circle
                    r={radius}
                    fill="#0f172a"
                    stroke={world.color}
                    strokeWidth={isSelected ? 4 : 2.5}
                  />
                  <circle r={radius - 8} fill={world.color} fillOpacity={0.28} />

                  {/* Type Label inside sphere */}
                  <text
                    y={4}
                    textAnchor="middle"
                    fill="#f8fafc"
                    fontSize={10}
                    fontWeight={700}
                    className="uppercase tracking-wider pointer-events-none"
                  >
                    {world.type.replace('_', ' ')}
                  </text>

                  {/* World Title Banner below */}
                  <text
                    y={radius + 26}
                    textAnchor="middle"
                    fill={isSelected ? '#fbbf24' : '#f1f5f9'}
                    fontSize={14}
                    fontWeight={700}
                    className="pointer-events-none"
                  >
                    {world.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Right Inspector: Selected World Details, Laws of Magic/Physics, Connections & Surface Maps */}
      {activeWorld && (
        <SidePanel side="right" panelId="worlds-details" label="World details" width="w-[22rem]" defaultOpen={true} className="p-5 overflow-y-auto space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs capitalize px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                {activeWorld.type.replace('_', ' ')}
              </span>
              <input
                type="color"
                value={activeWorld.color}
                onChange={(e) => updateWorld(activeWorld.id, { color: e.target.value })}
                className="w-6 h-6 rounded bg-transparent cursor-pointer"
                title="Change World Aura Color"
              />
            </div>
            <input
              type="text"
              value={activeWorld.name}
              onChange={(e) => updateWorld(activeWorld.id, { name: e.target.value })}
              className="w-full text-lg font-display font-bold text-slate-100 bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none py-0.5"
            />
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">
                World Summary
              </label>
              <textarea
                rows={3}
                value={activeWorld.summary}
                onChange={(e) => updateWorld(activeWorld.id, { summary: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Laws of Magic, Resonance & Physics
              </label>
              <textarea
                rows={3}
                value={activeWorld.magicOrPhysicsRules}
                onChange={(e) =>
                  updateWorld(activeWorld.id, { magicOrPhysicsRules: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Surface Maps of this World */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <MapIcon className="w-3.5 h-3.5 text-emerald-400" />
              Maps of {activeWorld.name.split(' ')[0]} ({worldMaps.length})
            </div>
            {worldMaps.length === 0 ? (
              <p className="text-xs text-slate-500">
                No surface maps bound to this world yet. Create one in the Maps module!
              </p>
            ) : (
              worldMaps.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMap(m.id, true)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left flex items-center justify-between text-xs text-slate-200 cursor-pointer"
                >
                  <span>{m.name}</span>
                  <span className="text-xs capitalize text-emerald-400">{m.mode}</span>
                </button>
              ))
            )}
          </div>

          {/* Entities Native to this World */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              Wiki Entities in this World ({worldEntities.length})
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {worldEntities.map((ent) => (
                <button
                  key={ent.id}
                  type="button"
                  onClick={() => selectEntity(ent.id, true)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-left flex items-center justify-between text-xs text-slate-300 cursor-pointer"
                >
                  <span className="truncate">{ent.title}</span>
                  <span className="text-xs text-slate-500 capitalize">{ent.category}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Planar Connections List */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
              Planar Portals & Connections
            </div>
            <div className="space-y-1.5">
              {project.worldConnections.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs"
                >
                  <div className="truncate">
                    <div className="font-medium text-slate-200">{c.label}</div>
                    <div className="text-xs text-slate-500 capitalize">
                      {c.type.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteWorldConnection(c.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </SidePanel>
      )}

      {/* Add World Modal */}
      {showAddWorld && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateWorld}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-lg font-semibold text-slate-100">
              Add Connected World or Plane
            </h3>
            <div>
              <label className="block text-slate-300 mb-1">World Name *</label>
              <input
                type="text"
                required
                value={wName}
                onChange={(e) => setWName(e.target.value)}
                placeholder="e.g., The Astral Citadel of Kor"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1">Cosmological Type</label>
                <select
                  value={wType}
                  onChange={(e) => setWType(e.target.value as WorldType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-slate-100"
                >
                  <option value="planet">Terrestrial Planet</option>
                  <option value="continent">Continent / Realm</option>
                  <option value="plane">Elemental / Astral Plane</option>
                  <option value="moon">Moon / Orbital Body</option>
                  <option value="pocket_dimension">Pocket Dimension</option>
                  <option value="star_system">Star System</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Orbital Aura Color</label>
                <input
                  type="color"
                  value={wColor}
                  onChange={(e) => setWColor(e.target.value)}
                  className="w-full h-9 bg-slate-950 border border-slate-700 rounded p-1 cursor-pointer"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Summary</label>
              <textarea
                rows={2}
                value={wSummary}
                onChange={(e) => setWSummary(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Magic / Physics Rules</label>
              <textarea
                rows={2}
                value={wRules}
                onChange={(e) => setWRules(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddWorld(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold cursor-pointer"
              >
                Create World
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Connection Modal */}
      {showAddConn && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateConn}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-lg font-semibold text-slate-100">
              Create Planar Portal / World Connection
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1">Source World</label>
                <select
                  value={srcWorldId || project.worlds[0]?.id}
                  onChange={(e) => setSrcWorldId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-slate-100"
                >
                  {project.worlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Target World</label>
                <select
                  value={tgtWorldId || project.worlds[1]?.id || project.worlds[0]?.id}
                  onChange={(e) => setTgtWorldId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-slate-100"
                >
                  {project.worlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Connection Type</label>
              <select
                value={connType}
                onChange={(e) => setConnType(e.target.value as WorldConnection['type'])}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-slate-100"
              >
                <option value="planar_rift">Planar Rift / Breach</option>
                <option value="orbital_tether">Orbital Tether / Sky-Spire</option>
                <option value="astral_sea_route">Astral Sea Conduit</option>
                <option value="world_tree_root">World-Tree Rootway</option>
                <option value="wormhole">Relativistic Wormhole</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Label / Name</label>
              <input
                type="text"
                value={connLabel}
                onChange={(e) => setConnLabel(e.target.value)}
                placeholder="e.g., The Crimson Bifrost"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddConn(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold cursor-pointer"
              >
                Connect worlds
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

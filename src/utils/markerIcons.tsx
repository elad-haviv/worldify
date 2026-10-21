import React from 'react';
import {
  Castle,
  Building2,
  TowerControl,
  Church,
  Hourglass,
  Swords,
  Orbit,
  Key,
  Beer,
  Anchor,
  Trees,
  Mountain,
  Crown,
  Rocket,
  Satellite,
  Globe,
  Zap,
  Radio,
  Cpu,
  Antenna,
  Pickaxe,
  AlertTriangle,
  Shield,
  Skull,
  Flame,
  Eye,
  Ghost,
  Box,
  Infinity as InfinityIcon,
  Moon,
  FlaskConical,
  Flag,
  ShieldAlert,
  Binoculars,
  Crosshair,
  Plane,
  Radar,
  ShieldCheck,
  MountainSnow,
  Tent,
  Droplet,
  Footprints,
  Compass,
  Ship,
  type LucideIcon,
} from 'lucide-react';

export interface MarkerIconDef {
  key: string;
  label: string;
  icon: LucideIcon;
  glyph: string;
  defaultColor: string;
}

export interface MarkerIconSet {
  id: string;
  name: string;
  description: string;
  icons: MarkerIconDef[];
}

export const MARKER_SETS: MarkerIconSet[] = [
  {
    id: 'fantasy',
    name: 'Fantasy & Medieval',
    description: 'Castles, ruins, temples, arcane portals and rustic settlements',
    icons: [
      { key: 'castle', label: 'Castle / Citadel', icon: Castle, glyph: '🏰', defaultColor: '#f59e0b' },
      { key: 'city', label: 'City / Settlement', icon: Building2, glyph: '🏙️', defaultColor: '#38bdf8' },
      { key: 'tower', label: 'Spire / Mage Tower', icon: TowerControl, glyph: '🗼', defaultColor: '#818cf8' },
      { key: 'temple', label: 'Sanctum / Temple', icon: Church, glyph: '🏛️', defaultColor: '#fbbf24' },
      { key: 'ruin', label: 'Ancient Ruin', icon: Hourglass, glyph: '⏳', defaultColor: '#a8a29e' },
      { key: 'battle', label: 'Battlefield', icon: Swords, glyph: '⚔️', defaultColor: '#ef4444' },
      { key: 'portal', label: 'Planar Rift / Portal', icon: Orbit, glyph: '🌀', defaultColor: '#c084fc' },
      { key: 'dungeon', label: 'Dungeon / Crypt', icon: Key, glyph: '🗝️', defaultColor: '#94a3b8' },
      { key: 'tavern', label: 'Tavern / Outpost', icon: Beer, glyph: '🍺', defaultColor: '#f97316' },
      { key: 'port', label: 'Maritime Port', icon: Anchor, glyph: '⚓', defaultColor: '#06b6d4' },
      { key: 'tree', label: 'Sacred Grove', icon: Trees, glyph: '🌳', defaultColor: '#22c55e' },
      { key: 'mountain', label: 'High Peak', icon: Mountain, glyph: '⛰️', defaultColor: '#cbd5e1' },
      { key: 'artifact', label: 'Relic Vault', icon: Crown, glyph: '👑', defaultColor: '#eab308' },
    ],
  },
  {
    id: 'scifi',
    name: 'Sci-Fi & Cyberpunk',
    description: 'Spaceports, orbital stations, reactors, labs and planetary colonies',
    icons: [
      { key: 'spaceport', label: 'Orbital Spaceport', icon: Rocket, glyph: '🚀', defaultColor: '#38bdf8' },
      { key: 'orbital', label: 'Space Station', icon: Satellite, glyph: '🛰️', defaultColor: '#818cf8' },
      { key: 'dome', label: 'Colony Biosphere', icon: Globe, glyph: '🌐', defaultColor: '#34d399' },
      { key: 'energy', label: 'Plasma Reactor / Core', icon: Zap, glyph: '⚡', defaultColor: '#facc15' },
      { key: 'jumpgate', label: 'Sub-Space Jumpgate', icon: Radio, glyph: '📡', defaultColor: '#a855f7' },
      { key: 'lab', label: 'Research Complex', icon: Cpu, glyph: '🔬', defaultColor: '#06b6d4' },
      { key: 'beacon', label: 'Deep-Space Beacon', icon: Antenna, glyph: '🗼', defaultColor: '#f43f5e' },
      { key: 'mine', label: 'Asteroid / Deep Mine', icon: Pickaxe, glyph: '⛏️', defaultColor: '#fb923c' },
      { key: 'hazard', label: 'Hazard / Exclusion Zone', icon: AlertTriangle, glyph: '⚠️', defaultColor: '#eab308' },
      { key: 'bunker', label: 'Cyber Vault / Bunker', icon: Shield, glyph: '🛡️', defaultColor: '#64748b' },
    ],
  },
  {
    id: 'eldritch',
    name: 'Eldritch & Dark Gothic',
    description: 'Necropolises, blood altars, watchers, voids and haunted ruins',
    icons: [
      { key: 'skull', label: 'Necropolis / Ossuary', icon: Skull, glyph: '💀', defaultColor: '#e2e8f0' },
      { key: 'altar', label: 'Blood Altar / Ritual', icon: Flame, glyph: '🩸', defaultColor: '#dc2626' },
      { key: 'eye', label: 'Forbidden Eye / Watcher', icon: Eye, glyph: '👁️', defaultColor: '#a855f7' },
      { key: 'ghost', label: 'Spectral Haunt', icon: Ghost, glyph: '👻', defaultColor: '#67e8f9' },
      { key: 'monolith', label: 'Void Monolith / Pylon', icon: Box, glyph: '🗿', defaultColor: '#475569' },
      { key: 'chaos', label: 'Chaos Rift / Singularity', icon: InfinityIcon, glyph: '♾️', defaultColor: '#c026d3' },
      { key: 'grave', label: 'Forgotten Barrow', icon: Moon, glyph: '🪦', defaultColor: '#71717a' },
      { key: 'cauldron', label: 'Witch Coven / Mire', icon: FlaskConical, glyph: '🧪', defaultColor: '#10b981' },
    ],
  },
  {
    id: 'tactical',
    name: 'Tactical & Military',
    description: 'HQs, forward outposts, airfields, radar arrays and checkpoints',
    icons: [
      { key: 'hq', label: 'Command HQ', icon: Flag, glyph: '🚩', defaultColor: '#3b82f6' },
      { key: 'bunker_mil', label: 'Fortified Bunker', icon: ShieldAlert, glyph: '🛡️', defaultColor: '#64748b' },
      { key: 'outpost', label: 'Forward Outpost', icon: Binoculars, glyph: '🔭', defaultColor: '#10b981' },
      { key: 'target', label: 'Strategic Target', icon: Crosshair, glyph: '🎯', defaultColor: '#ef4444' },
      { key: 'airfield', label: 'Airstrip / Airfield', icon: Plane, glyph: '✈️', defaultColor: '#0ea5e9' },
      { key: 'radar', label: 'Radar Array', icon: Radar, glyph: '📡', defaultColor: '#8b5cf6' },
      { key: 'naval', label: 'Naval Anchorage', icon: Anchor, glyph: '⚓', defaultColor: '#0284c7' },
      { key: 'checkpoint', label: 'Garrison / Checkpoint', icon: ShieldCheck, glyph: '🛑', defaultColor: '#f59e0b' },
    ],
  },
  {
    id: 'exploration',
    name: 'Exploration & Nature',
    description: 'Summits, caverns, primal forests, springs and expedition camps',
    icons: [
      { key: 'peak', label: 'Alpine Summit', icon: MountainSnow, glyph: '🏔️', defaultColor: '#94a3b8' },
      { key: 'cave', label: 'Deep Cavern', icon: Tent, glyph: '⛺', defaultColor: '#d97706' },
      { key: 'forest', label: 'Ancient Forest', icon: Trees, glyph: '🌲', defaultColor: '#16a34a' },
      { key: 'oasis', label: 'Oasis / Spring', icon: Droplet, glyph: '💧', defaultColor: '#06b6d4' },
      { key: 'volcano', label: 'Active Volcano', icon: Flame, glyph: '🌋', defaultColor: '#ea580c' },
      { key: 'cairn', label: 'Trail Cairn / Route', icon: Footprints, glyph: '👣', defaultColor: '#a3a3a3' },
      { key: 'compass', label: 'Expedition Camp', icon: Compass, glyph: '🧭', defaultColor: '#f59e0b' },
      { key: 'shipwreck', label: 'Sunken Shipwreck', icon: Ship, glyph: '🚢', defaultColor: '#64748b' },
    ],
  },
];

// Flat lookup map of all icons across all sets
const ALL_ICONS_MAP = new Map<string, MarkerIconDef>();
MARKER_SETS.forEach((set) => {
  set.icons.forEach((def) => {
    if (!ALL_ICONS_MAP.has(def.key)) {
      ALL_ICONS_MAP.set(def.key, def);
    }
  });
});

// Backwards compatibility aliases
const LEGACY_ALIASES: Record<string, string> = {
  character: 'cairn',
};

export function getMarkerSet(setId?: string): MarkerIconSet {
  const found = MARKER_SETS.find((s) => s.id === setId);
  return found || MARKER_SETS[0];
}

export function getMarkerIconDef(iconKey?: string): MarkerIconDef {
  if (!iconKey) return MARKER_SETS[0].icons[0];
  const resolvedKey = LEGACY_ALIASES[iconKey] || iconKey;
  const def = ALL_ICONS_MAP.get(resolvedKey);
  if (def) return def;

  // Fallback icon definition
  return {
    key: iconKey,
    label: iconKey.charAt(0).toUpperCase() + iconKey.slice(1),
    icon: Castle,
    glyph: '📍',
    defaultColor: '#f59e0b',
  };
}

export function getMarkerIcon(iconKey?: string): LucideIcon {
  return getMarkerIconDef(iconKey).icon;
}

export function getMarkerGlyph(iconKey?: string): string {
  return getMarkerIconDef(iconKey).glyph;
}

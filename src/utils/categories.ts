import { EntityCategory } from '../types/worldify';

/** Single source of truth for how each entity category is named and coloured. */
export const CATEGORY_META: Record<EntityCategory, { label: string; plural: string; color: string }> = {
  character: { label: 'Character', plural: 'Characters', color: '#f59e0b' },
  deity: { label: 'Deity', plural: 'Deities', color: '#a855f7' },
  species: { label: 'Species', plural: 'Species & Creatures', color: '#14b8a6' },
  faction: { label: 'Faction', plural: 'Factions & Orders', color: '#10b981' },
  location: { label: 'Location', plural: 'Locations', color: '#6366f1' },
  settlement: { label: 'Settlement', plural: 'Settlements', color: '#38bdf8' },
  item: { label: 'Item', plural: 'Items & Materials', color: '#ec4899' },
  magic_tech: { label: 'Magic', plural: 'Magic & Mechanics', color: '#eab308' },
  cosmology: { label: 'Cosmology', plural: 'Cosmology & Concepts', color: '#94a3b8' },
  event_lore: { label: 'Lore', plural: 'History, Culture & Lore', color: '#f97316' },
};

export const categoryLabel = (c: string): string =>
  (CATEGORY_META as Record<string, { label: string }>)[c]?.label ?? c;

export const categoryColor = (c: string): string =>
  (CATEGORY_META as Record<string, { color: string }>)[c]?.color ?? '#f59e0b';

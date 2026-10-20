import { Castle, Gem, MapPin, Orbit, PawPrint, ScrollText, Shield, Sparkles, Sun, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EntityCategory } from '../types/worldify';

export const CATEGORY_ICONS: Record<EntityCategory, LucideIcon> = {
  character: User,
  deity: Sun,
  species: PawPrint,
  faction: Shield,
  location: MapPin,
  settlement: Castle,
  item: Gem,
  magic_tech: Sparkles,
  cosmology: Orbit,
  event_lore: ScrollText,
};

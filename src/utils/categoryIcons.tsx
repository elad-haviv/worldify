import {
  Anchor,
  Atom,
  Axe,
  Bird,
  Book,
  BookOpen,
  Bug,
  Castle,
  Coins,
  Compass,
  Cpu,
  Crosshair,
  Crown,
  Dna,
  Droplets,
  Eye,
  Feather,
  Fish,
  Flag,
  Flame,
  FlaskConical,
  Flower2,
  Folder,
  Gem,
  Ghost,
  Globe2,
  Hammer,
  Hourglass,
  Key,
  Landmark,
  Languages,
  Map,
  MapPin,
  Moon,
  Mountain,
  Music,
  Orbit,
  Palette,
  PawPrint,
  Radio,
  Rocket,
  Scale,
  Scroll,
  ScrollText,
  Shapes,
  Shield,
  Skull,
  Sparkles,
  Sun,
  Sword,
  Swords,
  Target,
  Tent,
  Trees,
  User,
  Users,
  Wand2,
  Wrench,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BuiltinEntityCategory } from '../types/worldify';

export const CATEGORY_ICONS: Record<BuiltinEntityCategory, LucideIcon> = {
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

export interface IconOption {
  key: string;
  label: string;
  group: 'People & Groups' | 'Creatures & Nature' | 'Places & Realm' | 'Magic & Tech' | 'Items & Relics' | 'Lore & Society';
  keywords?: string[];
  Icon: LucideIcon;
}

export const ICON_OPTIONS: IconOption[] = [
  // People & Groups
  { key: 'User', label: 'Person / Individual', group: 'People & Groups', keywords: ['human', 'hero', 'npc', 'character'], Icon: User },
  { key: 'Users', label: 'Group / Guild', group: 'People & Groups', keywords: ['team', 'crowd', 'party', 'clan'], Icon: Users },
  { key: 'Crown', label: 'Monarch / Royalty', group: 'People & Groups', keywords: ['king', 'queen', 'ruler', 'noble', 'leader'], Icon: Crown },
  { key: 'Shield', label: 'Faction / Order', group: 'People & Groups', keywords: ['guard', 'defense', 'army', 'knights'], Icon: Shield },
  { key: 'Swords', label: 'Military / Warfare', group: 'People & Groups', keywords: ['battle', 'soldiers', 'warriors', 'combat'], Icon: Swords },
  { key: 'Sword', label: 'Champion / Duelist', group: 'People & Groups', keywords: ['blade', 'fighter', 'weapon'], Icon: Sword },
  { key: 'Skull', label: 'Villain / Undead', group: 'People & Groups', keywords: ['death', 'danger', 'necromancer', 'monster'], Icon: Skull },
  { key: 'Ghost', label: 'Spirit / Phantom', group: 'People & Groups', keywords: ['specter', 'wraith', 'soul', 'haunt'], Icon: Ghost },

  // Creatures & Nature
  { key: 'PawPrint', label: 'Beast / Creature', group: 'Creatures & Nature', keywords: ['animal', 'monster', 'monster', 'paw'], Icon: PawPrint },
  { key: 'Bird', label: 'Winged / Avian', group: 'Creatures & Nature', keywords: ['flying', 'eagle', 'raven', 'dragon'], Icon: Bird },
  { key: 'Fish', label: 'Aquatic / Marine', group: 'Creatures & Nature', keywords: ['sea', 'ocean', 'water', 'lake'], Icon: Fish },
  { key: 'Bug', label: 'Insect / Swarm', group: 'Creatures & Nature', keywords: ['spider', 'hive', 'creep'], Icon: Bug },
  { key: 'Trees', label: 'Forest / Wilderness', group: 'Creatures & Nature', keywords: ['woods', 'nature', 'plants', 'biome'], Icon: Trees },
  { key: 'Mountain', label: 'Mountains / Peaks', group: 'Creatures & Nature', keywords: ['range', 'heights', 'highlands', 'cliffs'], Icon: Mountain },
  { key: 'Flower2', label: 'Flora / Herbs', group: 'Creatures & Nature', keywords: ['botany', 'garden', 'bloom', 'alchemy'], Icon: Flower2 },
  { key: 'Droplets', label: 'Water / Rain', group: 'Creatures & Nature', keywords: ['river', 'fluid', 'tears', 'elemental'], Icon: Droplets },
  { key: 'Flame', label: 'Fire / Hazard', group: 'Creatures & Nature', keywords: ['inferno', 'heat', 'burning', 'pyro'], Icon: Flame },

  // Places & Realm
  { key: 'MapPin', label: 'Location / Landmark', group: 'Places & Realm', keywords: ['point', 'place', 'site', 'coordinate'], Icon: MapPin },
  { key: 'Castle', label: 'Settlement / Fortress', group: 'Places & Realm', keywords: ['keep', 'city', 'town', 'stronghold'], Icon: Castle },
  { key: 'Landmark', label: 'Temple / Monument', group: 'Places & Realm', keywords: ['shrine', 'sanctuary', 'ruins', 'pantheon'], Icon: Landmark },
  { key: 'Tent', label: 'Camp / Outpost', group: 'Places & Realm', keywords: ['bivouac', 'nomads', 'caravan', 'expedition'], Icon: Tent },
  { key: 'Compass', label: 'Region / Territory', group: 'Places & Realm', keywords: ['navigation', 'direction', 'zone', 'frontier'], Icon: Compass },
  { key: 'Globe2', label: 'World / Plane', group: 'Places & Realm', keywords: ['planet', 'multiverse', 'realm', 'dimension'], Icon: Globe2 },
  { key: 'Map', label: 'Cartography / Province', group: 'Places & Realm', keywords: ['atlas', 'uncharted', 'survey'], Icon: Map },
  { key: 'Anchor', label: 'Port / Harbor', group: 'Places & Realm', keywords: ['dock', 'naval', 'shipping', 'coastal'], Icon: Anchor },

  // Magic & Tech
  { key: 'Sparkles', label: 'Magic / Spells', group: 'Magic & Tech', keywords: ['sorcery', 'enchantment', 'arcane', 'mystic'], Icon: Sparkles },
  { key: 'Wand2', label: 'Spellcasting / Focus', group: 'Magic & Tech', keywords: ['rod', 'wizardry', 'casting', 'mage'], Icon: Wand2 },
  { key: 'Orbit', label: 'Cosmology / Celestial', group: 'Magic & Tech', keywords: ['stars', 'space', 'astronomy', 'gravity'], Icon: Orbit },
  { key: 'Sun', label: 'Deity / Divine', group: 'Magic & Tech', keywords: ['solar', 'god', 'radiance', 'holy', 'light'], Icon: Sun },
  { key: 'Moon', label: 'Lunar / Night', group: 'Magic & Tech', keywords: ['tides', 'darkness', 'mystic', 'eclipse'], Icon: Moon },
  { key: 'Zap', label: 'Energy / Lightning', group: 'Magic & Tech', keywords: ['electricity', 'shock', 'power', 'storm'], Icon: Zap },
  { key: 'Atom', label: 'Science / Alchemy', group: 'Magic & Tech', keywords: ['physics', 'chemistry', 'molecule', 'elements'], Icon: Atom },
  { key: 'FlaskConical', label: 'Potion / Elixir', group: 'Magic & Tech', keywords: ['brew', 'concoction', 'laboratory', 'poison'], Icon: FlaskConical },
  { key: 'Dna', label: 'Genetics / Lineage', group: 'Magic & Tech', keywords: ['mutation', 'biology', 'ancestry', 'evolution'], Icon: Dna },
  { key: 'Radio', label: 'Signal / Frequency', group: 'Magic & Tech', keywords: ['comm', 'telepathy', 'waves', 'transmission'], Icon: Radio },
  { key: 'Cpu', label: 'Technology / Automata', group: 'Magic & Tech', keywords: ['construct', 'clockwork', 'machine', 'cyber'], Icon: Cpu },
  { key: 'Rocket', label: 'Astral / Voidcraft', group: 'Magic & Tech', keywords: ['vessel', 'travel', 'exploration'], Icon: Rocket },

  // Items & Relics
  { key: 'Gem', label: 'Gem / Relic', group: 'Items & Relics', keywords: ['jewel', 'crystal', 'artifact', 'treasure'], Icon: Gem },
  { key: 'Coins', label: 'Currency / Economy', group: 'Items & Relics', keywords: ['gold', 'wealth', 'treasury', 'trade'], Icon: Coins },
  { key: 'Key', label: 'Secret / Access', group: 'Items & Relics', keywords: ['lock', 'door', 'vault', 'mystery'], Icon: Key },
  { key: 'Axe', label: 'Tool / Heavy Weapon', group: 'Items & Relics', keywords: ['woodcutter', 'battleaxe', 'chop'], Icon: Axe },
  { key: 'Hammer', label: 'Crafting / Smithing', group: 'Items & Relics', keywords: ['forge', 'anvil', 'building', 'weapon'], Icon: Hammer },
  { key: 'Wrench', label: 'Mechanics / Tools', group: 'Items & Relics', keywords: ['repair', 'engineering', 'hardware'], Icon: Wrench },
  { key: 'Crosshair', label: 'Target / Ranged', group: 'Items & Relics', keywords: ['bow', 'aim', 'focus', 'hunting'], Icon: Crosshair },
  { key: 'Hourglass', label: 'Time / Era', group: 'Items & Relics', keywords: ['chronology', 'clock', 'duration', 'patience'], Icon: Hourglass },

  // Lore & Society
  { key: 'ScrollText', label: 'Lore / Myth', group: 'Lore & Society', keywords: ['history', 'parchment', 'script', 'story'], Icon: ScrollText },
  { key: 'Scroll', label: 'Treaty / Edict', group: 'Lore & Society', keywords: ['document', 'charter', 'decree', 'law'], Icon: Scroll },
  { key: 'BookOpen', label: 'Codex / Tome', group: 'Lore & Society', keywords: ['grimoire', 'book', 'record', 'chronicle'], Icon: BookOpen },
  { key: 'Book', label: 'Scripture / Novel', group: 'Lore & Society', keywords: ['text', 'anthology', 'knowledge'], Icon: Book },
  { key: 'Languages', label: 'Language / Dialect', group: 'Lore & Society', keywords: ['speech', 'alphabet', 'runes', 'linguistics'], Icon: Languages },
  { key: 'Feather', label: 'Quill / Chronicle', group: 'Lore & Society', keywords: ['writing', 'author', 'poetry', 'ink'], Icon: Feather },
  { key: 'Flag', label: 'Banner / Nation', group: 'Lore & Society', keywords: ['heraldry', 'state', 'kingdom', 'emblem'], Icon: Flag },
  { key: 'Scale', label: 'Justice / Law', group: 'Lore & Society', keywords: ['court', 'balance', 'verdict', 'judiciary'], Icon: Scale },
  { key: 'Eye', label: 'Vision / Prophecy', group: 'Lore & Society', keywords: ['sight', 'oracle', 'insight', 'espionage'], Icon: Eye },
  { key: 'Palette', label: 'Art / Culture', group: 'Lore & Society', keywords: ['painting', 'design', 'craft', 'theatre'], Icon: Palette },
  { key: 'Music', label: 'Music / Song', group: 'Lore & Society', keywords: ['bard', 'melody', 'chant', 'hymn'], Icon: Music },
  { key: 'Target', label: 'Quest / Objective', group: 'Lore & Society', keywords: ['mission', 'goal', 'bounty'], Icon: Target },
  { key: 'Shapes', label: 'Concept / Abstract', group: 'Lore & Society', keywords: ['philosophy', 'geometry', 'theory'], Icon: Shapes },
  { key: 'Folder', label: 'General / Folder', group: 'Lore & Society', keywords: ['archive', 'misc', 'category'], Icon: Folder },
];

export const ICON_BY_NAME: Record<string, LucideIcon> = {
  ...Object.fromEntries(ICON_OPTIONS.map((opt) => [opt.key, opt.Icon])),
  ...CATEGORY_ICONS,
};

export function resolveCategoryIcon(iconKey?: string, categoryId?: string): LucideIcon {
  if (iconKey && ICON_BY_NAME[iconKey]) return ICON_BY_NAME[iconKey];
  if (categoryId && ICON_BY_NAME[categoryId]) return ICON_BY_NAME[categoryId];
  return Folder;
}

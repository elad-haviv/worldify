import { BuiltinEntityCategory, CategoryDef, Entity, Project, SubcategoryDef } from '../types/worldify';

/** Built-in defaults for how each standard entity category is named, coloured, and iconified. */
export const CATEGORY_META: Record<
  BuiltinEntityCategory,
  { label: string; plural: string; color: string; icon: string }
> = {
  character: { label: 'Character', plural: 'Characters', color: '#f59e0b', icon: 'User' },
  deity: { label: 'Deity', plural: 'Deities', color: '#a855f7', icon: 'Sun' },
  species: { label: 'Species', plural: 'Species & Creatures', color: '#14b8a6', icon: 'PawPrint' },
  faction: { label: 'Faction', plural: 'Factions & Orders', color: '#10b981', icon: 'Shield' },
  location: { label: 'Location', plural: 'Locations', color: '#6366f1', icon: 'MapPin' },
  settlement: { label: 'Settlement', plural: 'Settlements', color: '#38bdf8', icon: 'Castle' },
  item: { label: 'Item', plural: 'Items & Materials', color: '#ec4899', icon: 'Gem' },
  magic_tech: { label: 'Magic', plural: 'Magic & Mechanics', color: '#eab308', icon: 'Sparkles' },
  cosmology: { label: 'Cosmology', plural: 'Cosmology & Concepts', color: '#94a3b8', icon: 'Orbit' },
  event_lore: { label: 'Lore', plural: 'History, Culture & Lore', color: '#f97316', icon: 'ScrollText' },
};

export const DEFAULT_CATEGORIES: CategoryDef[] = (
  Object.keys(CATEGORY_META) as BuiltinEntityCategory[]
).map((id) => ({
  id,
  label: CATEGORY_META[id].label,
  plural: CATEGORY_META[id].plural,
  color: CATEGORY_META[id].color,
  icon: CATEGORY_META[id].icon,
  subcategories: [],
}));

/**
 * Returns the full CategoryDef[] for a project.
 * If the project hasn't customized `project.categories` yet, initializes from DEFAULT_CATEGORIES
 * and seeds subcategories from categories that have multiple templates (e.g. imported Obsidian vaults).
 */
export function getProjectCategories(project?: Pick<Project, 'categories' | 'templates' | 'entities'> | null): CategoryDef[] {
  if (!project) return DEFAULT_CATEGORIES;

  if (project.categories && project.categories.length > 0) {
    return project.categories;
  }

  const tplById = new Map((project.templates ?? []).map((t) => [t.id, t]));
  return DEFAULT_CATEGORIES.map((base) => {
    const entsInCat = (project.entities ?? []).filter((e) => e.category === base.id);
    const tplIds = [...new Set(entsInCat.map((e) => e.templateId).filter(Boolean))];
    const subcategories: SubcategoryDef[] =
      tplIds.length > 1
        ? tplIds
            .map((id) => {
              const tpl = tplById.get(id);
              return {
                id,
                name: tpl?.name ?? 'Other',
                color: tpl?.color ?? base.color,
                icon: tpl?.icon || 'Folder',
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];
    return {
      ...base,
      subcategories,
    };
  });
}

export function getCategoryDef(
  categoryId: string,
  project?: Pick<Project, 'categories' | 'templates' | 'entities'> | null
): CategoryDef {
  const list = getProjectCategories(project);
  const found = list.find((c) => c.id === categoryId);
  if (found) return found;
  const builtin = (CATEGORY_META as Record<string, { label: string; plural: string; color: string; icon: string }>)[
    categoryId
  ];
  if (builtin) {
    return {
      id: categoryId,
      label: builtin.label,
      plural: builtin.plural,
      color: builtin.color,
      icon: builtin.icon,
      subcategories: [],
    };
  }
  const pretty = categoryId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  return {
    id: categoryId,
    label: pretty || 'Category',
    plural: pretty ? `${pretty}s` : 'Categories',
    color: '#f59e0b',
    icon: 'Folder',
    subcategories: [],
  };
}

export const categoryLabel = (
  c: string,
  project?: Pick<Project, 'categories' | 'templates' | 'entities'> | null
): string => getCategoryDef(c, project).label;

export const categoryPlural = (
  c: string,
  project?: Pick<Project, 'categories' | 'templates' | 'entities'> | null
): string => getCategoryDef(c, project).plural;

export const categoryColor = (
  c: string,
  project?: Pick<Project, 'categories' | 'templates' | 'entities'> | null
): string => getCategoryDef(c, project).color;

/**
 * Resolves the effective subcategory ID of an entity within its category.
 * - Explicit `entity.subcategory === ''` means the user placed it at the root of the category (no subcategory).
 * - Explicit `entity.subcategory` string takes precedence.
 * - Otherwise falls back to `entity.templateId` if that ID is a registered subcategory on the category.
 */
export function getEntitySubcategoryId(entity: Entity, catDef?: CategoryDef): string | undefined {
  if (entity.subcategory !== undefined) {
    return entity.subcategory || undefined;
  }
  if (catDef && entity.templateId && catDef.subcategories.some((s) => s.id === entity.templateId)) {
    return entity.templateId;
  }
  return undefined;
}

export function getEntitySubcategory(
  entity: Entity,
  project?: Pick<Project, 'categories' | 'templates' | 'entities'> | null
): SubcategoryDef | undefined {
  const catDef = getCategoryDef(entity.category, project);
  const subId = getEntitySubcategoryId(entity, catDef);
  if (!subId) return undefined;
  return catDef.subcategories.find((s) => s.id === subId);
}

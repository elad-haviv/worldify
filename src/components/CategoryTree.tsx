import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Edit2,
  FolderPlus,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { CategoryDef, Entity, EntityCategory, SubcategoryDef, Template } from '../types/worldify';
import {
  DEFAULT_CATEGORIES,
  getEntitySubcategoryId,
  getProjectCategories,
} from '../utils/categories';
import { resolveCategoryIcon } from '../utils/categoryIcons';
import { CategoryIcon } from './CategoryBadge';
import { IconPicker } from './IconPicker';
import { useWorldifyStore } from '../store/useWorldifyStore';

const BUILTIN_IDS = new Set(DEFAULT_CATEGORIES.map((c) => c.id));

const PRESET_COLORS = [
  '#f59e0b',
  '#a855f7',
  '#14b8a6',
  '#10b981',
  '#6366f1',
  '#38bdf8',
  '#ec4899',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#84cc16',
  '#94a3b8',
];

interface CategoryTreeProps {
  projectId: string;
  entities: Entity[];
  templates: Template[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRequestNewEntry?: (category: EntityCategory, subcategoryId?: string) => void;
  /** While filtering, every group with matches is opened. */
  forceOpen?: boolean;
}

interface SubgroupView {
  key: string;
  sub: SubcategoryDef;
  entities: Entity[];
}

interface GroupView {
  key: string;
  cat: CategoryDef;
  entities: Entity[];
  subgroups: SubgroupView[];
  unfiledEntities: Entity[];
}

const storageKey = (projectId: string) => `worldify_wiki_tree_${projectId}`;

function readOpen(projectId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set();
}

const byTitle = (a: Entity, b: Entity) => a.title.localeCompare(b.title);

export const CategoryTree: React.FC<CategoryTreeProps> = ({
  projectId,
  entities,
  activeId,
  onSelect,
  onRequestNewEntry,
  forceOpen,
}) => {
  const {
    projects,
    addCategory,
    updateCategory,
    deleteCategory,
    addSubcategory,
    updateSubcategory,
    deleteSubcategory,
  } = useWorldifyStore();

  const project = projects.find((p) => p.id === projectId);
  const categories = useMemo(() => getProjectCategories(project), [project]);

  const [open, setOpen] = useState<Set<string>>(() => readOpen(projectId));
  const [manageMode, setManageMode] = useState(false);

  // Category Modal (Create or Edit)
  const [categoryModal, setCategoryModal] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; cat: CategoryDef }
    | null
  >(null);
  const [catLabel, setCatLabel] = useState('');
  const [catPlural, setCatPlural] = useState('');
  const [catColor, setCatColor] = useState('#f59e0b');
  const [catIcon, setCatIcon] = useState('Folder');

  // Subcategory Modal (Create or Edit)
  const [subcategoryModal, setSubcategoryModal] = useState<
    | { mode: 'create'; cat: CategoryDef }
    | { mode: 'edit'; cat: CategoryDef; sub: SubcategoryDef }
    | null
  >(null);
  const [subName, setSubName] = useState('');
  const [subColor, setSubColor] = useState('#f59e0b');
  const [subIcon, setSubIcon] = useState('Folder');

  useEffect(() => setOpen(readOpen(projectId)), [projectId]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(projectId), JSON.stringify([...open]));
    } catch {
      /* ignore */
    }
  }, [open, projectId]);

  const groups: GroupView[] = useMemo(() => {
    return categories
      .map((cat) => {
        const list = entities.filter((e) => e.category === cat.id).sort(byTitle);
        const subgroups: SubgroupView[] = cat.subcategories
          .map((sub) => ({
            key: `sub:${cat.id}:${sub.id}`,
            sub,
            entities: list.filter((e) => getEntitySubcategoryId(e, cat) === sub.id),
          }))
          .filter((sg) => !forceOpen || sg.entities.length > 0);

        const assignedIds = new Set(subgroups.flatMap((sg) => sg.entities.map((e) => e.id)));
        const unfiledEntities = list.filter((e) => !assignedIds.has(e.id));

        return {
          key: `cat:${cat.id}`,
          cat,
          entities: list,
          subgroups,
          unfiledEntities,
        };
      })
      .filter((g) => {
        if (forceOpen) return g.entities.length > 0;
        if (manageMode) return true;
        return (
          g.entities.length > 0 ||
          g.cat.subcategories.length > 0 ||
          !BUILTIN_IDS.has(g.cat.id)
        );
      });
  }, [categories, entities, forceOpen, manageMode]);

  // Open the active entry's group(s) so it's always visible.
  useEffect(() => {
    const active = entities.find((e) => e.id === activeId);
    if (!active) return;
    const cat = categories.find((c) => c.id === active.category);
    const subId = getEntitySubcategoryId(active, cat);
    const keys = [`cat:${active.category}`];
    if (subId) keys.push(`sub:${active.category}:${subId}`);
    setOpen((prev) => (keys.every((k) => prev.has(k)) ? prev : new Set([...prev, ...keys])));
  }, [activeId, entities, categories]);

  const isOpen = (key: string) => forceOpen || open.has(key);
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allKeys = groups.flatMap((g) => [g.key, ...g.subgroups.map((s) => s.key)]);
  const anyOpen = groups.some((g) => open.has(g.key));

  const openCreateCategory = () => {
    setCatLabel('');
    setCatPlural('');
    setCatColor('#f59e0b');
    setCatIcon('Folder');
    setCategoryModal({ mode: 'create' });
  };

  const openEditCategory = (cat: CategoryDef) => {
    setCatLabel(cat.label);
    setCatPlural(cat.plural);
    setCatColor(cat.color);
    setCatIcon(cat.icon);
    setCategoryModal({ mode: 'edit', cat });
  };

  const saveCategoryModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catLabel.trim() || !categoryModal) return;

    if (categoryModal.mode === 'create') {
      const created = addCategory({
        label: catLabel.trim(),
        plural: catPlural.trim() || `${catLabel.trim()}s`,
        color: catColor,
        icon: catIcon,
      });
      setOpen((prev) => new Set([...prev, `cat:${created.id}`]));
    } else {
      updateCategory(categoryModal.cat.id, {
        label: catLabel.trim(),
        plural: catPlural.trim() || `${catLabel.trim()}s`,
        color: catColor,
        icon: catIcon,
      });
    }
    setCategoryModal(null);
  };

  const openCreateSubcategory = (cat: CategoryDef) => {
    setSubName('');
    setSubColor(cat.color);
    setSubIcon('Folder');
    setSubcategoryModal({ mode: 'create', cat });
  };

  const openEditSubcategory = (cat: CategoryDef, sub: SubcategoryDef) => {
    setSubName(sub.name);
    setSubColor(sub.color);
    setSubIcon(sub.icon || 'Folder');
    setSubcategoryModal({ mode: 'edit', cat, sub });
  };

  const saveSubcategoryModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim() || !subcategoryModal) return;

    if (subcategoryModal.mode === 'create') {
      const created = addSubcategory(subcategoryModal.cat.id, {
        name: subName.trim(),
        color: subColor,
        icon: subIcon || 'Folder',
      });
      setOpen(
        (prev) =>
          new Set([...prev, `cat:${subcategoryModal.cat.id}`, `sub:${subcategoryModal.cat.id}:${created.id}`])
      );
    } else {
      updateSubcategory(subcategoryModal.cat.id, subcategoryModal.sub.id, {
        name: subName.trim(),
        color: subColor,
        icon: subIcon || 'Folder',
      });
    }
    setSubcategoryModal(null);
  };

  const EntryRow: React.FC<{ e: Entity; indent: number }> = ({ e, indent }) => {
    const active = e.id === activeId;
    return (
      <button
        type="button"
        onClick={() => onSelect(e.id)}
        title={e.summary}
        style={{ paddingLeft: indent }}
        className={`w-full h-8 pr-2 flex items-center gap-2 rounded-md text-left text-sm truncate cursor-pointer ${
          active
            ? 'bg-amber-500/15 text-amber-200'
            : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
        }`}
      >
        <span className="truncate">{e.title}</span>
      </button>
    );
  };

  const ModalIcon = resolveCategoryIcon(catIcon);

  return (
    <div className="px-2 pb-4">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between px-1 pb-1.5 gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openCreateCategory}
            className="h-7 px-2 flex items-center gap-1 rounded-md text-xs text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer"
            title="Add a new category"
          >
            <Plus className="w-3.5 h-3.5" />
            Category
          </button>
          <button
            type="button"
            onClick={() => setManageMode(!manageMode)}
            className={`h-7 px-2 flex items-center gap-1 rounded-md text-xs cursor-pointer transition-colors ${
              manageMode
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Show edit and delete controls"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {manageMode ? 'Done' : 'Edit'}
          </button>
        </div>

        {!forceOpen && groups.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(anyOpen ? new Set() : new Set(allKeys))}
            className="h-7 px-2 flex items-center gap-1 rounded-md text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            {anyOpen ? (
              <ChevronsDownUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronsUpDown className="w-3.5 h-3.5" />
            )}
            {anyOpen ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>

      {groups.length === 0 && (
        <div className="px-4 py-8 text-sm text-slate-500 text-center">No entries match</div>
      )}

      {groups.map((g) => {
        const gOpen = isOpen(g.key);
        const color = g.cat.color;

        return (
          <div key={g.key} className="mb-0.5">
            <div className="group/cat w-full h-10 px-1.5 flex items-center gap-1.5 rounded-lg hover:bg-slate-800/60">
              <button
                type="button"
                onClick={() => toggle(g.key)}
                className="flex-1 min-w-0 flex items-center gap-2 h-full text-left cursor-pointer"
              >
                <ChevronRight
                  className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${
                    gOpen ? 'rotate-90' : ''
                  }`}
                />
                <CategoryIcon category={g.cat.id} color={g.cat.color} iconKey={g.cat.icon} />
                <span className="flex-1 text-sm font-semibold text-slate-100 truncate">
                  {g.cat.plural}
                </span>
              </button>

              {/* Quick hover / manage actions on Category */}
              <div
                className={`flex items-center gap-0.5 ${
                  manageMode ? 'opacity-100' : 'opacity-0 group-hover/cat:opacity-100'
                } transition-opacity`}
              >
                <button
                  type="button"
                  onClick={() => openCreateSubcategory(g.cat)}
                  className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-700/60 cursor-pointer"
                  title="Add subcategory"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => openEditCategory(g.cat)}
                  className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 cursor-pointer"
                  title="Edit category"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <span
                className="min-w-7 h-5 px-1.5 rounded-full text-xs tabular-nums flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${color}1f`, color }}
              >
                {g.entities.length}
              </span>
            </div>

            {gOpen && (
              <div className="relative ml-[1.15rem] pl-2 border-l border-slate-800">
                {g.subgroups.map((s) => {
                  const sOpen = isOpen(s.key);
                  const SubIcon = resolveCategoryIcon(s.sub.icon || 'Folder');

                  return (
                    <div key={s.key}>
                      <div className="group/sub w-full h-8 px-1.5 flex items-center gap-1.5 rounded-md hover:bg-slate-800/60">
                        <button
                          type="button"
                          onClick={() => toggle(s.key)}
                          className="flex-1 min-w-0 flex items-center gap-2 h-full text-left cursor-pointer"
                        >
                          <ChevronRight
                            className={`w-3 h-3 text-slate-500 shrink-0 transition-transform ${
                              sOpen ? 'rotate-90' : ''
                            }`}
                          />
                          <span
                            className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: `${s.sub.color}22`,
                              color: s.sub.color,
                              boxShadow: `inset 0 0 0 1px ${s.sub.color}40`,
                            }}
                          >
                            <SubIcon className="w-2.5 h-2.5" />
                          </span>
                          <span className="flex-1 text-sm text-slate-300 truncate">
                            {s.sub.name}
                          </span>
                        </button>

                        <div
                          className={`flex items-center gap-0.5 ${
                            manageMode ? 'opacity-100' : 'opacity-0 group-hover/sub:opacity-100'
                          } transition-opacity`}
                        >
                          {onRequestNewEntry && (
                            <button
                              type="button"
                              onClick={() => onRequestNewEntry(g.cat.id, s.sub.id)}
                              className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-700/60 cursor-pointer"
                              title={`New entry in ${s.sub.name}`}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditSubcategory(g.cat, s.sub)}
                            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 cursor-pointer"
                            title="Edit subcategory"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>

                        <span className="text-xs text-slate-500 tabular-nums shrink-0">
                          {s.entities.length}
                        </span>
                      </div>

                      {sOpen && (
                        <div className="ml-[0.6rem] pl-2 border-l border-slate-800/70">
                          {s.entities.map((e) => (
                            <EntryRow key={e.id} e={e} indent={10} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Unfiled entries */}
                {g.unfiledEntities.map((e) => (
                  <EntryRow key={e.id} e={e} indent={10} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Category Modal Dialog (Fixed Over Canvas, Never Clipped) ── */}
      {categoryModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form
            onSubmit={saveCategoryModal}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center shadow-inner"
                  style={{
                    backgroundColor: `${catColor}22`,
                    color: catColor,
                    boxShadow: `inset 0 0 0 1px ${catColor}40`,
                  }}
                >
                  <ModalIcon className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    {categoryModal.mode === 'create' ? 'New Category' : 'Edit Category'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Organize your worldbuilding entries and customize appearance.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCategoryModal(null)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Singular Name *</label>
                <input
                  type="text"
                  required
                  value={catLabel}
                  onChange={(e) => setCatLabel(e.target.value)}
                  placeholder="e.g. Language, Relic"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500 text-xs"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Group Title (Plural)</label>
                <input
                  type="text"
                  value={catPlural}
                  onChange={(e) => setCatPlural(e.target.value)}
                  placeholder="e.g. Languages & Scripts"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>
            </div>

            {/* Colour Palette */}
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Theme Colour</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PRESET_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setCatColor(col)}
                    className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                      catColor === col
                        ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
                <label className="flex items-center gap-1 text-[11px] text-slate-400 ml-1 cursor-pointer">
                  <span>Custom:</span>
                  <input
                    type="color"
                    value={catColor}
                    onChange={(e) => setCatColor(e.target.value)}
                    className="w-6 h-6 rounded bg-transparent cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Visual Icon Picker */}
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Category Icon</label>
              <IconPicker value={catIcon} onChange={setCatIcon} color={catColor} />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              {categoryModal.mode === 'edit' && categories.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    deleteCategory(categoryModal.cat.id);
                    setCategoryModal(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 flex items-center gap-1.5 cursor-pointer font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Category
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCategoryModal(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  {categoryModal.mode === 'create' ? 'Create Category' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Subcategory Modal Dialog (Fixed Over Canvas, Never Clipped) ── */}
      {subcategoryModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form
            onSubmit={saveSubcategoryModal}
            className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                {(() => {
                  const SubModalIcon = resolveCategoryIcon(subIcon || 'Folder');
                  return (
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shadow-inner shrink-0"
                      style={{
                        backgroundColor: `${subColor}22`,
                        color: subColor,
                        boxShadow: `inset 0 0 0 1px ${subColor}40`,
                      }}
                    >
                      <SubModalIcon className="w-4 h-4" />
                    </span>
                  );
                })()}
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    {subcategoryModal.mode === 'create'
                      ? `New Subcategory in ${subcategoryModal.cat.label}`
                      : `Edit Subcategory`}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Folder subgroup within {subcategoryModal.cat.plural}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubcategoryModal(null)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Subcategory Name *</label>
              <input
                type="text"
                required
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="e.g. Archdemon, Guild, Relic Type"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500 text-xs"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Badge Colour</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PRESET_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setSubColor(col)}
                    className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                      subColor === col
                        ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
                <input
                  type="color"
                  value={subColor}
                  onChange={(e) => setSubColor(e.target.value)}
                  className="w-5 h-5 rounded bg-transparent cursor-pointer ml-1"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Subcategory Icon</label>
              <IconPicker value={subIcon} onChange={setSubIcon} color={subColor} />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              {subcategoryModal.mode === 'edit' ? (
                <button
                  type="button"
                  onClick={() => {
                    deleteSubcategory(subcategoryModal.cat.id, subcategoryModal.sub.id);
                    setSubcategoryModal(null);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSubcategoryModal(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  {subcategoryModal.mode === 'create' ? 'Add Subcategory' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

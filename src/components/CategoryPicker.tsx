import React, { useState } from 'react';
import { Check, FolderPlus, Plus, X } from 'lucide-react';
import { EntityCategory } from '../types/worldify';
import { getProjectCategories } from '../utils/categories';
import { resolveCategoryIcon } from '../utils/categoryIcons';
import { CategoryIcon } from './CategoryBadge';
import { IconPicker } from './IconPicker';
import { useWorldifyStore } from '../store/useWorldifyStore';

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

/** Grid of category tiles, with optional subcategory selector and inline creation. */
export const CategoryPicker: React.FC<{
  value: EntityCategory;
  onChange: (c: EntityCategory) => void;
  subcategoryValue?: string;
  onSubcategoryChange?: (subId: string) => void;
  counts?: Partial<Record<EntityCategory, number>>;
  columns?: 2 | 3;
}> = ({
  value,
  onChange,
  subcategoryValue,
  onSubcategoryChange,
  counts,
  columns = 2,
}) => {
  const { projects, activeProjectId, addCategory, addSubcategory } = useWorldifyStore();
  const project = projects.find((p) => p.id === activeProjectId);
  const categories = getProjectCategories(project);
  const activeCat = categories.find((c) => c.id === value) ?? categories[0];

  const [addingCat, setAddingCat] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatPlural, setNewCatPlural] = useState('');
  const [newCatColor, setNewCatColor] = useState('#f59e0b');
  const [newCatIcon, setNewCatIcon] = useState('Folder');

  const [addingSub, setAddingSub] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubColor, setNewSubColor] = useState(activeCat?.color || '#f59e0b');
  const [newSubIcon, setNewSubIcon] = useState('Folder');

  const handleCreateCat = () => {
    if (!newCatLabel.trim()) return;
    const created = addCategory({
      label: newCatLabel.trim(),
      plural: newCatPlural.trim() || `${newCatLabel.trim()}s`,
      color: newCatColor,
      icon: newCatIcon,
    });
    onChange(created.id);
    if (onSubcategoryChange) onSubcategoryChange('');
    setNewCatLabel('');
    setNewCatPlural('');
    setAddingCat(false);
  };

  const handleCreateSub = () => {
    if (!activeCat || !newSubName.trim()) return;
    const created = addSubcategory(activeCat.id, {
      name: newSubName.trim(),
      color: newSubColor || activeCat.color,
      icon: newSubIcon || 'Folder',
    });
    if (onSubcategoryChange) onSubcategoryChange(created.id);
    setNewSubName('');
    setNewSubIcon('Folder');
    setAddingSub(false);
  };

  return (
    <div className="space-y-3">
      <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {categories.map((c) => {
          const active = c.id === value;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c.id);
                if (onSubcategoryChange && c.id !== value) {
                  onSubcategoryChange('');
                }
              }}
              className={`flex items-center gap-2.5 p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                active
                  ? 'bg-slate-800'
                  : 'border-slate-800 hover:border-slate-600 hover:bg-slate-800/50'
              }`}
              style={
                active
                  ? { borderColor: c.color, boxShadow: `0 0 0 1px ${c.color}` }
                  : undefined
              }
            >
              <CategoryIcon category={c.id} color={c.color} iconKey={c.icon} />
              <span className="min-w-0">
                <span
                  className={`block text-sm font-medium truncate ${
                    active ? 'text-slate-50' : 'text-slate-200'
                  }`}
                >
                  {c.label}
                </span>
                {counts && (
                  <span className="block text-xs text-slate-500">
                    {counts[c.id] ?? 0} entries
                  </span>
                )}
              </span>
            </button>
          );
        })}

        {!addingCat && (
          <button
            type="button"
            onClick={() => setAddingCat(true)}
            className="flex items-center justify-center gap-1.5 p-2 rounded-lg border border-dashed border-slate-700 hover:border-amber-500/60 hover:bg-slate-800/40 text-xs font-medium text-slate-400 hover:text-amber-300 transition-colors cursor-pointer min-h-[46px]"
          >
            <Plus className="w-3.5 h-3.5" />
            New Category
          </button>
        )}
      </div>

      {/* Inline New Category Form */}
      {addingCat && (
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-700 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">New Category</span>
            <button
              type="button"
              onClick={() => setAddingCat(false)}
              className="text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={newCatLabel}
              onChange={(e) => setNewCatLabel(e.target.value)}
              placeholder="Singular (e.g. Language)"
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              autoFocus
            />
            <input
              type="text"
              value={newCatPlural}
              onChange={(e) => setNewCatPlural(e.target.value)}
              placeholder="Group title (e.g. Languages)"
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESET_COLORS.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => setNewCatColor(col)}
                className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                  newCatColor === col ? 'scale-110 ring-2 ring-white' : ' opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: col }}
              />
            ))}
            <input
              type="color"
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
              className="w-6 h-6 rounded bg-transparent cursor-pointer ml-1"
              title="Custom colour"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Icon</label>
            <IconPicker
              value={newCatIcon}
              onChange={setNewCatIcon}
              color={newCatColor}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddingCat(false)}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCat}
              className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Add Category
            </button>
          </div>
        </div>
      )}

      {/* Subcategory Section (when onSubcategoryChange is provided) */}
      {onSubcategoryChange && activeCat && (
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Subcategory in <strong className="text-slate-200">{activeCat.plural}</strong>
            </span>
            {!addingSub && (
              <button
                type="button"
                onClick={() => {
                  setNewSubColor(activeCat.color);
                  setAddingSub(true);
                }}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
              >
                <FolderPlus className="w-3 h-3" />
                + New Subcategory
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onSubcategoryChange('')}
              className={`px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${
                !subcategoryValue
                  ? 'bg-slate-800 border-amber-500/60 text-slate-100 font-medium'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              None (Root)
            </button>
            {activeCat.subcategories.map((sub) => {
              const isSelected = subcategoryValue === sub.id;
              const SubIcon = resolveCategoryIcon(sub.icon || 'Folder');
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => onSubcategoryChange(sub.id)}
                  className={`px-2.5 py-1 rounded-md text-xs border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800 text-slate-50 font-medium'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                  style={
                    isSelected
                      ? { borderColor: sub.color, boxShadow: `0 0 0 1px ${sub.color}` }
                      : undefined
                  }
                >
                  <SubIcon className="w-3 h-3 shrink-0" style={{ color: sub.color }} />
                  {sub.name}
                </button>
              );
            })}
          </div>

          {addingSub && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="color"
                value={newSubColor}
                onChange={(e) => setNewSubColor(e.target.value)}
                className="w-6 h-6 rounded bg-transparent cursor-pointer shrink-0"
                title="Subcategory colour"
              />
              <div className="w-28 shrink-0">
                <IconPicker
                  value={newSubIcon}
                  onChange={setNewSubIcon}
                  color={newSubColor}
                />
              </div>
              <input
                type="text"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateSub();
                  }
                }}
                placeholder="Subcategory name (e.g. Archdemon, Guild)..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100"
                autoFocus
              />
              <button
                type="button"
                onClick={handleCreateSub}
                className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setAddingSub(false)}
                className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

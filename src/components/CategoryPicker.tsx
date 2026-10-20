import React from 'react';
import { EntityCategory } from '../types/worldify';
import { CATEGORY_META } from '../utils/categories';
import { CategoryIcon } from './CategoryBadge';

/** Grid of category tiles. */
export const CategoryPicker: React.FC<{
  value: EntityCategory;
  onChange: (c: EntityCategory) => void;
  counts?: Partial<Record<EntityCategory, number>>;
  columns?: 2 | 3;
}> = ({ value, onChange, counts, columns = 2 }) => (
  <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
    {(Object.keys(CATEGORY_META) as EntityCategory[]).map((c) => {
      const meta = CATEGORY_META[c];
      const active = c === value;
      return (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`flex items-center gap-2.5 p-2 rounded-lg border text-left transition-colors cursor-pointer ${
            active ? 'bg-slate-800' : 'border-slate-800 hover:border-slate-600 hover:bg-slate-800/50'
          }`}
          style={active ? { borderColor: meta.color, boxShadow: `0 0 0 1px ${meta.color}` } : undefined}
        >
          <CategoryIcon category={c} />
          <span className="min-w-0">
            <span className={`block text-sm font-medium truncate ${active ? 'text-slate-50' : 'text-slate-200'}`}>{meta.label}</span>
            {counts && <span className="block text-xs text-slate-500">{counts[c] ?? 0} entries</span>}
          </span>
        </button>
      );
    })}
  </div>
);

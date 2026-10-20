import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { Entity, EntityCategory, Template } from '../types/worldify';
import { CATEGORY_META } from '../utils/categories';
import { CategoryIcon } from './CategoryBadge';

/**
 * Wiki sidebar tree: Category → (template sub-group, when a category has several) → entries.
 * Collapsible like a file explorer; remembers what's open per project.
 */

interface CategoryTreeProps {
  projectId: string;
  entities: Entity[];
  templates: Template[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** While filtering, every group with matches is opened. */
  forceOpen?: boolean;
}

interface Group {
  key: string;
  category: EntityCategory;
  label: string;
  entities: Entity[];
  subgroups: Array<{ key: string; label: string; color: string; entities: Entity[] }> | null;
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
  templates,
  activeId,
  onSelect,
  forceOpen,
}) => {
  const [open, setOpen] = useState<Set<string>>(() => readOpen(projectId));

  useEffect(() => setOpen(readOpen(projectId)), [projectId]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(projectId), JSON.stringify([...open]));
    } catch {
      /* ignore */
    }
  }, [open, projectId]);

  const groups: Group[] = useMemo(() => {
    const tplById = new Map(templates.map((t) => [t.id, t]));
    return (Object.keys(CATEGORY_META) as EntityCategory[])
      .map((category) => {
        const list = entities.filter((e) => e.category === category).sort(byTitle);
        const tplIds = [...new Set(list.map((e) => e.templateId))];
        const subgroups =
          tplIds.length > 1
            ? tplIds
                .map((id) => {
                  const tpl = tplById.get(id);
                  return {
                    key: `tpl:${category}:${id}`,
                    label: tpl?.name ?? 'Other',
                    color: tpl?.color ?? CATEGORY_META[category].color,
                    entities: list.filter((e) => e.templateId === id),
                  };
                })
                .sort((a, b) => a.label.localeCompare(b.label))
            : null;
        return { key: `cat:${category}`, category, label: CATEGORY_META[category].plural, entities: list, subgroups };
      })
      .filter((g) => g.entities.length > 0);
  }, [entities, templates]);

  // Open the active entry's group(s) so it's always visible.
  useEffect(() => {
    const active = entities.find((e) => e.id === activeId);
    if (!active) return;
    const keys = [`cat:${active.category}`, `tpl:${active.category}:${active.templateId}`];
    setOpen((prev) => (keys.every((k) => prev.has(k)) ? prev : new Set([...prev, ...keys])));
  }, [activeId, entities]);

  const isOpen = (key: string) => forceOpen || open.has(key);
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allKeys = groups.flatMap((g) => [g.key, ...(g.subgroups?.map((s) => s.key) ?? [])]);
  const anyOpen = groups.some((g) => open.has(g.key));

  const EntryRow: React.FC<{ e: Entity; indent: number }> = ({ e, indent }) => {
    const active = e.id === activeId;
    return (
      <button
        type="button"
        onClick={() => onSelect(e.id)}
        title={e.summary}
        style={{ paddingLeft: indent }}
        className={`w-full h-8 pr-2 flex items-center gap-2 rounded-md text-left text-sm truncate cursor-pointer ${
          active ? 'bg-amber-500/15 text-amber-200' : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
        }`}
      >
        <span className="truncate">{e.title}</span>
      </button>
    );
  };

  if (groups.length === 0) {
    return <div className="px-4 py-8 text-sm text-slate-500 text-center">No entries match</div>;
  }

  return (
    <div className="px-2 pb-4">
      {!forceOpen && (
        <div className="flex justify-end px-1 pb-1">
          <button
            type="button"
            onClick={() => setOpen(anyOpen ? new Set() : new Set(allKeys))}
            className="h-7 px-2 flex items-center gap-1.5 rounded-md text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            {anyOpen ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
            {anyOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}

      {groups.map((g) => {
        const gOpen = isOpen(g.key);
        const color = CATEGORY_META[g.category].color;
        return (
          <div key={g.key} className="mb-0.5">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              className="w-full h-10 px-1.5 flex items-center gap-2 rounded-lg hover:bg-slate-800/60 cursor-pointer"
            >
              <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform ${gOpen ? 'rotate-90' : ''}`} />
              <CategoryIcon category={g.category} />
              <span className="flex-1 text-left text-sm font-semibold text-slate-100 truncate">{g.label}</span>
              <span
                className="min-w-7 h-5 px-1.5 rounded-full text-xs tabular-nums flex items-center justify-center"
                style={{ backgroundColor: `${color}1f`, color }}
              >
                {g.entities.length}
              </span>
            </button>

            {gOpen && (
              <div className="relative ml-[1.15rem] pl-2 border-l border-slate-800">
                {g.subgroups
                  ? g.subgroups.map((s) => {
                      const sOpen = isOpen(s.key);
                      return (
                        <div key={s.key}>
                          <button
                            type="button"
                            onClick={() => toggle(s.key)}
                            className="w-full h-8 px-1.5 flex items-center gap-2 rounded-md hover:bg-slate-800/60 cursor-pointer"
                          >
                            <ChevronRight className={`w-3 h-3 text-slate-500 transition-transform ${sOpen ? 'rotate-90' : ''}`} />
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                            <span className="flex-1 text-left text-sm text-slate-300 truncate">{s.label}</span>
                            <span className="text-xs text-slate-500 tabular-nums">{s.entities.length}</span>
                          </button>
                          {sOpen && (
                            <div className="ml-[0.6rem] pl-2 border-l border-slate-800/70">
                              {s.entities.map((e) => (
                                <EntryRow key={e.id} e={e} indent={10} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  : g.entities.map((e) => <EntryRow key={e.id} e={e} indent={10} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

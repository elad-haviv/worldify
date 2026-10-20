import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Code,
  Heading,
  ChevronDown,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link2,
  Search,
  Table,
} from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import { Entity } from '../types/worldify';
import { categoryLabel } from '../utils/categories';
import {
  MarkdownEditorHandle,
  insertBlock,
  insertLink,
  insertTable,
  prefixLines,
  setHeading,
  wrapSelection,
} from './MarkdownEditor';

export interface MarkdownToolbarHandle {
  openLinkPicker: () => void;
}

interface MarkdownToolbarProps {
  editorRef: React.RefObject<MarkdownEditorHandle | null>;
  /** Entries offered by the "Link entry" picker. */
  entities: Entity[];
  /** Optional text shown on the right (e.g. word count). */
  status?: React.ReactNode;
}

const HEADINGS = [
  { level: 0, label: 'Normal text', className: 'text-sm text-slate-300' },
  { level: 1, label: 'Heading 1', className: 'text-xl font-bold text-slate-50' },
  { level: 2, label: 'Heading 2', className: 'text-lg font-semibold text-slate-50' },
  { level: 3, label: 'Heading 3', className: 'text-base font-semibold text-slate-100' },
  { level: 4, label: 'Heading 4', className: 'text-sm font-semibold text-slate-100' },
];

const GRID = 6;

const ToolButton: React.FC<{ title: string; onClick: () => void; active?: boolean; children: React.ReactNode }> = ({
  title,
  onClick,
  active,
  children,
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
    onClick={onClick}
    className={`h-8 min-w-8 px-1.5 flex items-center justify-center gap-1 rounded-md cursor-pointer ${
      active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
    }`}
  >
    {children}
  </button>
);

const Sep = () => <span className="w-px h-5 bg-slate-800 mx-1" />;

export const MarkdownToolbar = forwardRef<MarkdownToolbarHandle, MarkdownToolbarProps>(function MarkdownToolbar(
  { editorRef, entities, status },
  ref
) {
  const [menu, setMenu] = useState<null | 'heading' | 'table' | 'link'>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [gridHover, setGridHover] = useState<[number, number]>([2, 2]);
  const searchRef = useRef<HTMLInputElement>(null);

  const run = (fn: (view: EditorView) => void) => {
    const view = editorRef.current?.view;
    if (view) fn(view);
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? entities.filter((e) => e.title.toLowerCase().includes(q) || e.subtitle?.toLowerCase().includes(q))
      : entities;
    return [...list].sort((a, b) => a.title.localeCompare(b.title)).slice(0, 40);
  }, [entities, query]);

  const openLinkPicker = () => {
    setQuery('');
    setActive(0);
    setMenu('link');
  };
  useImperativeHandle(ref, () => ({ openLinkPicker }));

  useEffect(() => {
    if (menu === 'link') setTimeout(() => searchRef.current?.focus(), 0);
  }, [menu]);

  const close = () => setMenu(null);
  const pick = (title: string) => {
    close();
    run((v) => insertLink(v, title));
  };

  return (
    <div className="relative px-4 py-1.5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-0.5 flex-wrap">
      {/* Heading menu */}
      <ToolButton title="Heading" active={menu === 'heading'} onClick={() => setMenu(menu === 'heading' ? null : 'heading')}>
        <Heading className="w-4 h-4" />
        <ChevronDown className="w-3 h-3" />
      </ToolButton>
      <Sep />
      <ToolButton title="Bold (Ctrl+B)" onClick={() => run((v) => wrapSelection(v, '**', '**', 'bold text'))}>
        <Bold className="w-4 h-4" />
      </ToolButton>
      <ToolButton title="Italic (Ctrl+I)" onClick={() => run((v) => wrapSelection(v, '*', '*', 'italic text'))}>
        <Italic className="w-4 h-4" />
      </ToolButton>
      <ToolButton title="Inline code" onClick={() => run((v) => wrapSelection(v, '`', '`', 'code'))}>
        <Code className="w-4 h-4" />
      </ToolButton>
      <Sep />
      <ToolButton title="Bulleted list" onClick={() => run((v) => prefixLines(v, () => '- ', /^[-*]\s/))}>
        <List className="w-4 h-4" />
      </ToolButton>
      <ToolButton title="Numbered list" onClick={() => run((v) => prefixLines(v, (i) => `${i + 1}. `, /^\d+\.\s/))}>
        <ListOrdered className="w-4 h-4" />
      </ToolButton>
      <ToolButton title="Quote" onClick={() => run((v) => prefixLines(v, () => '> ', /^>\s?/))}>
        <Quote className="w-4 h-4" />
      </ToolButton>
      <ToolButton title="Table" active={menu === 'table'} onClick={() => setMenu(menu === 'table' ? null : 'table')}>
        <Table className="w-4 h-4" />
      </ToolButton>
      <ToolButton title="Divider" onClick={() => run((v) => insertBlock(v, '---'))}>
        <Minus className="w-4 h-4" />
      </ToolButton>
      <Sep />
      <button
        type="button"
        title="Link to an entry (Ctrl+K) — or type [["
        onMouseDown={(e) => e.preventDefault()}
        onClick={openLinkPicker}
        className="h-8 px-2.5 flex items-center gap-1.5 rounded-md text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
      >
        <Link2 className="w-4 h-4 text-amber-400" />
        Link entry
      </button>

      {status && <div className="ml-auto text-xs text-slate-500 tabular-nums">{status}</div>}

      {menu && <div className="fixed inset-0 z-30" onClick={close} />}

      {menu === 'heading' && (
        <div className="absolute left-4 top-full mt-1 w-52 z-40 rounded-lg border border-slate-700 bg-slate-900 shadow-xl p-1">
          {HEADINGS.map((h) => (
            <button
              key={h.level}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                close();
                run((v) => setHeading(v, h.level));
              }}
              className="w-full text-left px-3 py-1.5 rounded-md hover:bg-slate-800 flex items-center justify-between cursor-pointer"
            >
              <span className={h.className}>{h.label}</span>
              {h.level > 0 && <span className="text-xs text-slate-500 font-mono">{'#'.repeat(h.level)}</span>}
            </button>
          ))}
        </div>
      )}

      {menu === 'table' && (
        <div className="absolute left-48 top-full mt-1 z-40 rounded-lg border border-slate-700 bg-slate-900 shadow-xl p-3">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${GRID}, 1.25rem)` }}>
            {Array.from({ length: GRID * GRID }, (_, i) => {
              const r = Math.floor(i / GRID) + 1;
              const c = (i % GRID) + 1;
              const on = r <= gridHover[0] && c <= gridHover[1];
              return (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={() => setGridHover([r, c])}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    close();
                    run((v) => insertTable(v, r, c));
                  }}
                  className={`w-5 h-5 rounded-sm border cursor-pointer ${
                    on ? 'bg-amber-500/30 border-amber-500/70' : 'bg-slate-800 border-slate-700'
                  }`}
                  aria-label={`${r} rows by ${c} columns`}
                />
              );
            })}
          </div>
          <div className="mt-2 text-xs text-slate-400 text-center tabular-nums">
            {gridHover[0]} rows × {gridHover[1]} columns
          </div>
        </div>
      )}

      {menu === 'link' && (
        <div className="absolute left-4 top-full mt-1 w-80 z-40 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          <div className="flex items-center gap-2 px-3 border-b border-slate-800">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, results.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (results[active]) pick(results[active].title);
                } else if (e.key === 'Escape') {
                  close();
                  editorRef.current?.focus();
                }
              }}
              placeholder="Find an entry to link…"
              className="flex-1 bg-transparent py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto p-1">
            {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching entries</li>}
            {results.map((e, i) => (
              <li key={e.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(e.title)}
                  className={`w-full text-left px-3 py-1.5 rounded-md flex items-center justify-between gap-3 cursor-pointer ${
                    i === active ? 'bg-slate-800' : ''
                  }`}
                >
                  <span className="text-sm text-slate-100 truncate">{e.title}</span>
                  <span className="text-xs text-slate-500 shrink-0">{categoryLabel(e.category)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

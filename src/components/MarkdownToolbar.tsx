import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Code,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link2,
  Search,
} from 'lucide-react';
import { Entity } from '../types/worldify';
import { categoryLabel } from '../utils/categories';

/**
 * Formatting toolbar for a Markdown <textarea>.
 * Edits go through the browser's own text insertion so Ctrl+Z / Ctrl+Y keep working.
 */

type Ref = React.RefObject<HTMLTextAreaElement | null>;

/** Replace [start, end) with text, keeping native undo, then select [selStart, selEnd). */
function replaceRange(ta: HTMLTextAreaElement, start: number, end: number, text: string, selStart: number, selEnd: number) {
  ta.focus();
  ta.setSelectionRange(start, end);
  // execCommand keeps the undo stack intact; fall back if a browser refuses it.
  const ok = document.execCommand && document.execCommand('insertText', false, text);
  if (!ok) {
    ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  ta.setSelectionRange(selStart, selEnd);
}

/** Wrap the selection (or a placeholder) with before/after, or unwrap if already wrapped. */
function wrap(ta: HTMLTextAreaElement, before: string, after: string, placeholder: string) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const selected = value.slice(s, e);
  if (value.slice(s - before.length, s) === before && value.slice(e, e + after.length) === after) {
    replaceRange(ta, s - before.length, e + after.length, selected, s - before.length, e - before.length);
    return;
  }
  const inner = selected || placeholder;
  const start = s + before.length;
  replaceRange(ta, s, e, before + inner + after, start, start + inner.length);
}

/** Apply (or toggle off) a prefix on every line touched by the selection. */
function prefixLines(ta: HTMLTextAreaElement, prefix: (i: number) => string, matcher: RegExp) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const nextBreak = value.indexOf('\n', e);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const allHave = lines.every((l) => matcher.test(l));
  const out = lines
    .map((l, i) => {
      const stripped = l.replace(/^(#{1,6}\s+|[-*]\s+|\d+\.\s+|>\s?)/, '');
      return allHave ? stripped : prefix(i) + stripped;
    })
    .join('\n');
  replaceRange(ta, lineStart, lineEnd, out, lineStart, lineStart + out.length);
}

function insertBlock(ta: HTMLTextAreaElement, block: string) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const needsBreakBefore = s > 0 && value[s - 1] !== '\n' ? '\n\n' : '';
  const text = `${needsBreakBefore}${block}\n`;
  replaceRange(ta, s, e, text, s + text.length, s + text.length);
}

function insertLink(ta: HTMLTextAreaElement, title: string) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const selected = value.slice(s, e).trim();
  const text = selected && selected !== title ? `[[${title}|${selected}]]` : `[[${title}]]`;
  replaceRange(ta, s, e, text, s + text.length, s + text.length);
}

interface MarkdownToolbarProps {
  textareaRef: Ref;
  /** Entries offered by the "Link entry" picker. */
  entities: Entity[];
  /** Optional text shown on the right (e.g. word count). */
  status?: React.ReactNode;
}

export const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({ textareaRef, entities, status }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? entities.filter((e) => e.title.toLowerCase().includes(q) || e.subtitle?.toLowerCase().includes(q))
      : entities;
    return [...list].sort((a, b) => a.title.localeCompare(b.title)).slice(0, 40);
  }, [entities, query]);

  const run = (fn: (ta: HTMLTextAreaElement) => void) => {
    const ta = textareaRef.current;
    if (ta) fn(ta);
  };

  // Selected text becomes the link's label; the search starts empty.
  const openPicker = () => {
    setQuery('');
    setActive(0);
    setPickerOpen(true);
  };

  const pick = (title: string) => {
    setPickerOpen(false);
    run((ta) => insertLink(ta, title));
  };

  useEffect(() => {
    if (pickerOpen) setTimeout(() => searchRef.current?.focus(), 0);
  }, [pickerOpen]);

  // Keyboard shortcuts inside the textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'b') {
        e.preventDefault();
        wrap(ta, '**', '**', 'bold text');
      } else if (k === 'i') {
        e.preventDefault();
        wrap(ta, '*', '*', 'italic text');
      } else if (k === 'k') {
        // In the editor, Ctrl+K links an entry instead of opening global search.
        e.preventDefault();
        e.stopPropagation();
        openPicker();
      }
    };
    ta.addEventListener('keydown', onKey);
    return () => ta.removeEventListener('keydown', onKey);
  });

  const Btn: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()} // keep the textarea's selection
      onClick={onClick}
      className="h-8 min-w-8 px-1.5 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
    >
      {children}
    </button>
  );
  const Sep = () => <span className="w-px h-5 bg-slate-800 mx-1" />;

  return (
    <div className="relative px-4 py-1.5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-0.5 flex-wrap">
      <Btn title="Heading" onClick={() => run((ta) => prefixLines(ta, () => '## ', /^##\s/))}>
        <Heading2 className="w-4 h-4" />
      </Btn>
      <Btn title="Sub-heading" onClick={() => run((ta) => prefixLines(ta, () => '### ', /^###\s/))}>
        <Heading3 className="w-4 h-4" />
      </Btn>
      <Sep />
      <Btn title="Bold (Ctrl+B)" onClick={() => run((ta) => wrap(ta, '**', '**', 'bold text'))}>
        <Bold className="w-4 h-4" />
      </Btn>
      <Btn title="Italic (Ctrl+I)" onClick={() => run((ta) => wrap(ta, '*', '*', 'italic text'))}>
        <Italic className="w-4 h-4" />
      </Btn>
      <Btn title="Inline code" onClick={() => run((ta) => wrap(ta, '`', '`', 'code'))}>
        <Code className="w-4 h-4" />
      </Btn>
      <Sep />
      <Btn title="Bulleted list" onClick={() => run((ta) => prefixLines(ta, () => '- ', /^[-*]\s/))}>
        <List className="w-4 h-4" />
      </Btn>
      <Btn title="Numbered list" onClick={() => run((ta) => prefixLines(ta, (i) => `${i + 1}. `, /^\d+\.\s/))}>
        <ListOrdered className="w-4 h-4" />
      </Btn>
      <Btn title="Quote" onClick={() => run((ta) => prefixLines(ta, () => '> ', /^>\s?/))}>
        <Quote className="w-4 h-4" />
      </Btn>
      <Btn title="Divider" onClick={() => run((ta) => insertBlock(ta, '---'))}>
        <Minus className="w-4 h-4" />
      </Btn>
      <Sep />
      <button
        type="button"
        title="Link to an entry (Ctrl+K)"
        onMouseDown={(e) => e.preventDefault()}
        onClick={openPicker}
        className="h-8 px-2.5 flex items-center gap-1.5 rounded-md text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
      >
        <Link2 className="w-4 h-4 text-amber-400" />
        Link entry
      </button>

      {status && <div className="ml-auto text-xs text-slate-500 tabular-nums">{status}</div>}

      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
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
                    setPickerOpen(false);
                    textareaRef.current?.focus();
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
        </>
      )}
    </div>
  );
};

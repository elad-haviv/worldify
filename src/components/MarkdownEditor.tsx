import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState, Prec, RangeSetBuilder, StateEffect } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  keymap,
  placeholder as placeholderExt,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  autocompletion,
  Completion,
  CompletionContext,
  CompletionResult,
  completionKeymap,
} from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';
import { Entity } from '../types/worldify';
import { categoryLabel } from '../utils/categories';

/**
 * Markdown editor built on CodeMirror 6 (MIT) — the same editor engine Obsidian uses.
 *  - "[[" opens entry suggestions (titles and aliases), Obsidian-style
 *  - [[links]] and images are coloured: accent when they resolve, darker when they don't
 *  - light Markdown styling while you type; native undo/redo
 */

export interface MarkdownEditorHandle {
  view: EditorView | null;
  focus: () => void;
}

interface MarkdownEditorProps {
  /** Changes when a different document is opened (resets undo history). */
  docKey: string;
  value: string;
  onChange: (value: string) => void;
  entities: Entity[];
  placeholder?: string;
  /** Ctrl+K inside the editor. */
  onRequestLink?: () => void;
}

// ───────────────────────── link / image index ─────────────────────────

interface LinkIndex {
  names: Set<string>; // lower-cased titles + aliases
  images: Map<string, 'ok' | 'missing' | 'pending'>;
}

const refreshEffect = StateEffect.define<null>();

const aliasesOf = (e: Entity): string[] => {
  const prop = e.customProperties.find((p) => p.key === 'aliases');
  return prop ? prop.value.split(',').map((a) => a.trim()).filter(Boolean) : [];
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const WIKI_RE = /(!?)\[\[([^\]\n]+?)\]\]/g;
const MD_IMG_RE = /!\[[^\]\n]*\]\(([^)\s]+)\)/g;

const linkDeco = Decoration.mark({ class: 'cm-wikilink' });
const linkMissingDeco = Decoration.mark({ class: 'cm-wikilink-missing' });
const imageDeco = Decoration.mark({ class: 'cm-image' });
const imageMissingDeco = Decoration.mark({ class: 'cm-image-missing' });

function linkHighlighter(index: LinkIndex) {
  const checkImage = (url: string, view: EditorView) => {
    if (index.images.has(url)) return;
    index.images.set(url, 'pending');
    const img = new Image();
    const refresh = () => {
      try {
        view.dispatch({ effects: refreshEffect.of(null) });
      } catch {
        /* editor already closed */
      }
    };
    img.onload = () => {
      index.images.set(url, 'ok');
      refresh();
    };
    img.onerror = () => {
      index.images.set(url, 'missing');
      refresh();
    };
    img.src = url;
  };

  const build = (view: EditorView): DecorationSet => {
    const found: Array<{ from: number; to: number; deco: Decoration }> = [];
    const text = view.state.doc.toString();

    for (const m of text.matchAll(WIKI_RE)) {
      const [whole, bang, inner] = m;
      const from = m.index!;
      const target = inner.split('|')[0].split('#')[0].trim().split('/').pop() ?? '';
      if (bang && IMAGE_EXT.test(target)) {
        // Obsidian image embed — Worldify can't load these, so mark as unavailable.
        found.push({ from, to: from + whole.length, deco: imageMissingDeco });
      } else {
        const ok = index.names.has(target.replace(/\.md$/i, '').toLowerCase());
        found.push({ from, to: from + whole.length, deco: ok ? linkDeco : linkMissingDeco });
      }
    }
    for (const m of text.matchAll(MD_IMG_RE)) {
      const url = m[1];
      checkImage(url, view);
      const status = index.images.get(url);
      found.push({ from: m.index!, to: m.index! + m[0].length, deco: status === 'missing' ? imageMissingDeco : imageDeco });
    }

    found.sort((a, b) => a.from - b.from);
    const builder = new RangeSetBuilder<Decoration>();
    let last = -1;
    for (const f of found) {
      if (f.from < last) continue; // skip overlaps
      builder.add(f.from, f.to, f.deco);
      last = f.to;
    }
    return builder.finish();
  };

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshEffect)))) {
          this.decorations = build(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}

// Table rows use a monospaced font so the columns line up while editing.
const tableLine = Decoration.line({ class: 'cm-table-line' });
const tableLines = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
          const line = view.state.doc.lineAt(pos);
          if (line.text.trimStart().startsWith('|')) builder.add(line.from, line.from, tableLine);
          pos = line.to + 1;
        }
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);

// ───────────────────────── "[[" autocomplete ─────────────────────────

function wikiCompletions(getEntities: () => Entity[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\[\[[^[\]|#\n]*$/);
    if (!m) return null;
    const from = m.from + 2;

    const insert = (title: string, alias?: string) => (view: EditorView, _c: Completion, f: number, to: number) => {
      const closed = view.state.sliceDoc(to, to + 2) === ']]';
      const body = alias ? `${title}|${alias}` : title;
      const text = closed ? body : `${body}]]`;
      view.dispatch({
        changes: { from: f, to, insert: text },
        selection: { anchor: f + body.length + 2 },
        userEvent: 'input.complete',
      });
    };

    const options: Completion[] = [];
    for (const e of getEntities()) {
      options.push({ label: e.title, detail: categoryLabel(e.category), apply: insert(e.title), type: 'text' });
      for (const a of aliasesOf(e)) {
        if (a.toLowerCase() !== e.title.toLowerCase()) {
          options.push({ label: a, detail: `→ ${e.title}`, apply: insert(e.title, a), boost: -1, type: 'text' });
        }
      }
    }
    return { from, options, validFor: /^[^[\]|#\n]*$/ };
  };
}

// ───────────────────────── editing commands (used by the toolbar) ─────────────────────────

export function wrapSelection(view: EditorView, before: string, after: string, placeholder: string) {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const selected = doc.sliceString(from, to);
  if (doc.sliceString(from - before.length, from) === before && doc.sliceString(to, to + after.length) === after) {
    view.dispatch({
      changes: [
        { from: from - before.length, to: from, insert: '' },
        { from: to, to: to + after.length, insert: '' },
      ],
      selection: { anchor: from - before.length, head: to - before.length },
    });
  } else {
    const inner = selected || placeholder;
    view.dispatch({
      changes: { from, to, insert: before + inner + after },
      selection: { anchor: from + before.length, head: from + before.length + inner.length },
    });
  }
  view.focus();
}

const LINE_PREFIX = /^(#{1,6}\s+|[-*]\s+|\d+\.\s+|>\s?)/;

export function prefixLines(view: EditorView, prefix: (i: number) => string, matcher: RegExp) {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const first = doc.lineAt(from);
  const last = doc.lineAt(to);
  const lines: string[] = [];
  for (let n = first.number; n <= last.number; n++) lines.push(doc.line(n).text);
  const allHave = lines.every((l) => matcher.test(l));
  const out = lines.map((l, i) => (allHave ? l.replace(LINE_PREFIX, '') : prefix(i) + l.replace(LINE_PREFIX, ''))).join('\n');
  view.dispatch({
    changes: { from: first.from, to: last.to, insert: out },
    selection: { anchor: first.from + out.length },
  });
  view.focus();
}

/** level 0 = normal text */
export function setHeading(view: EditorView, level: number) {
  if (level === 0) {
    // Normal text: remove heading marks only.
    const { from, to } = view.state.selection.main;
    const doc = view.state.doc;
    const first = doc.lineAt(from);
    const last = doc.lineAt(to);
    const changes = [];
    for (let n = first.number; n <= last.number; n++) {
      const line = doc.line(n);
      const m = line.text.match(/^#{1,6}\s+/);
      if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: '' });
    }
    if (changes.length) view.dispatch({ changes });
    view.focus();
    return;
  }
  prefixLines(view, () => `${'#'.repeat(level)} `, new RegExp(`^#{${level}}\\s`));
}

export function insertBlock(view: EditorView, block: string, selectFrom?: number, selectTo?: number) {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const lineBefore = doc.lineAt(from);
  const needsBreak = from > 0 && lineBefore.text.trim() !== '' ? '\n\n' : '';
  const text = `${needsBreak}${block}\n`;
  const base = from + needsBreak.length;
  view.dispatch({
    changes: { from, to, insert: text },
    selection:
      selectFrom !== undefined
        ? { anchor: base + selectFrom, head: base + (selectTo ?? selectFrom) }
        : { anchor: from + text.length },
  });
  view.focus();
}

export function insertTable(view: EditorView, rows: number, cols: number) {
  const names = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
  const header = `| ${names.join(' | ')} |`;
  const sep = `| ${names.map((n) => '-'.repeat(n.length)).join(' | ')} |`;
  const blank = `| ${names.map((n) => ' '.repeat(n.length)).join(' | ')} |`;
  const body = Array.from({ length: Math.max(1, rows - 1) }, () => blank);
  insertBlock(view, [header, sep, ...body].join('\n'), 2, 2 + 'Column 1'.length);
}

export function insertLink(view: EditorView, title: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to).trim();
  const text = selected && selected !== title ? `[[${title}|${selected}]]` : `[[${title}]]`;
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
  view.focus();
}

// ───────────────────────── look & feel ─────────────────────────

const ACCENT = '#fbbf24';
const ACCENT_DARK = '#8a6a2e';

const editorTheme = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '16px', color: '#e2e8f0', backgroundColor: 'transparent' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'Inter, system-ui, sans-serif', lineHeight: '1.75', padding: '24px 0 40vh' },
    '.cm-content': { maxWidth: '48rem', margin: '0 auto', padding: '0 32px', caretColor: ACCENT },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: ACCENT, borderLeftWidth: '2px' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: 'rgba(245, 158, 11, 0.22) !important' },
    '.cm-placeholder': { color: '#64748b' },
    '.cm-table-line': { fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: '14px', color: '#cbd5e1' },
    '.cm-wikilink, .cm-wikilink span': { color: `${ACCENT} !important` },
    '.cm-wikilink-missing, .cm-wikilink-missing span': {
      color: `${ACCENT_DARK} !important`,
      textDecoration: 'underline dotted',
      textUnderlineOffset: '3px',
    },
    '.cm-image, .cm-image span': { color: `${ACCENT} !important` },
    '.cm-image-missing, .cm-image-missing span': { color: `${ACCENT_DARK} !important`, textDecoration: 'line-through' },
    // Autocomplete popup
    '.cm-tooltip': { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'Inter, system-ui, sans-serif', maxHeight: '18rem', padding: '4px' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
      padding: '5px 10px',
      borderRadius: '6px',
      color: '#e2e8f0',
      fontSize: '14px',
      lineHeight: '1.5',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#1e293b', color: '#f8fafc' },
    '.cm-completionDetail': { color: '#64748b', fontStyle: 'normal', marginLeft: '12px', fontSize: '12px' },
    '.cm-completionMatchedText': { textDecoration: 'none', color: ACCENT },
  },
  { dark: true }
);

const markdownStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.6em', fontWeight: '700', color: '#f8fafc' },
  { tag: t.heading2, fontSize: '1.35em', fontWeight: '650', color: '#f8fafc' },
  { tag: t.heading3, fontSize: '1.15em', fontWeight: '600', color: '#f1f5f9' },
  { tag: [t.heading4, t.heading5, t.heading6], fontSize: '1.05em', fontWeight: '600', color: '#f1f5f9' },
  { tag: t.strong, fontWeight: '700', color: '#f8fafc' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.quote, color: '#cbd5e1', fontStyle: 'italic' },
  { tag: t.monospace, fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: '0.9em', color: '#fda4af' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: '#64748b' },
  { tag: [t.url, t.link], color: '#7dd3fc' },
]);

// ───────────────────────── component ─────────────────────────

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(
  { docKey, value, onChange, entities, placeholder, onRequestLink },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const indexRef = useRef<LinkIndex>({ names: new Set(), images: new Map() });
  const entitiesRef = useRef(entities);
  const onChangeRef = useRef(onChange);
  const onRequestLinkRef = useRef(onRequestLink);
  entitiesRef.current = entities;
  onChangeRef.current = onChange;
  onRequestLinkRef.current = onRequestLink;

  const makeState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        history(),
        Prec.high(
          keymap.of([
            { key: 'Mod-b', run: (v) => (wrapSelection(v, '**', '**', 'bold text'), true) },
            { key: 'Mod-i', run: (v) => (wrapSelection(v, '*', '*', 'italic text'), true) },
            {
              key: 'Mod-k',
              run: () => {
                onRequestLinkRef.current?.();
                return true;
              },
            },
          ])
        ),
        keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(markdownStyle),
        EditorView.lineWrapping,
        editorTheme,
        placeholderExt(placeholder ?? 'Start writing… type [[ to link an entry'),
        autocompletion({
          override: [wikiCompletions(() => entitiesRef.current)],
          icons: false,
          maxRenderedOptions: 60,
        }),
        linkHighlighter(indexRef.current),
        tableLines,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });

  // Create the view once
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({ state: makeState(value), parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New document → fresh state (and fresh undo history)
  const lastKey = useRef(docKey);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (docKey !== lastKey.current) {
      lastKey.current = docKey;
      view.setState(makeState(value));
      return;
    }
    // Same document changed from outside (e.g. AI tools): merge in, keeping undo.
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, value]);

  // Keep the link index in sync with the project's entries
  useEffect(() => {
    const names = new Set<string>();
    for (const e of entities) {
      names.add(e.title.toLowerCase());
      names.add(e.slug.toLowerCase());
      aliasesOf(e).forEach((a) => names.add(a.toLowerCase()));
    }
    indexRef.current.names = names;
    viewRef.current?.dispatch({ effects: refreshEffect.of(null) });
  }, [entities]);

  useImperativeHandle(ref, () => ({
    get view() {
      return viewRef.current;
    },
    focus: () => viewRef.current?.focus(),
  }));

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" />;
});

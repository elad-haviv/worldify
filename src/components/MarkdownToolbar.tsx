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
  Image as ImageIcon,
  Upload,
  Maximize2,
  Minimize2,
  X,
  Globe,
  Loader2,
} from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import { Entity } from '../types/worldify';
import { categoryLabel } from '../utils/categories';
import { ImageOption } from '../utils/assetStore';
import { ResolvedImage } from './ResolvedImage';
import {
  MarkdownEditorHandle,
  imageMarkdown,
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
  /** Images to offer in the gallery. */
  getImages?: () => Promise<ImageOption[]>;
  /** Store an uploaded image and return how to reference it. */
  onUploadImage?: (file: File) => Promise<ImageOption>;
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
  { editorRef, entities, status, getImages, onUploadImage },
  ref
) {
  const [menu, setMenu] = useState<null | 'heading' | 'table' | 'link' | 'image'>(null);
  const [images, setImages] = useState<ImageOption[]>([]);
  const [imageQuery, setImageQuery] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageWide, setImageWide] = useState(false);
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlNote, setUrlNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
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
    if (menu === 'image') {
      setImageQuery('');
      setImageUrl('');
      setUrlNote('');
      getImages?.().then(setImages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  const insertImages = (imgs: ImageOption[]) => {
    close();
    run((v) => insertBlock(v, imgs.map(imageMarkdown).join('\n')));
  };
  const uploadFiles = async (files: FileList | null) => {
    if (!files || !onUploadImage) return;
    const picked = [...files].filter((f) => f.type.startsWith('image/'));
    if (picked.length) insertImages(await Promise.all(picked.map(onUploadImage)));
  };
  /** Download the picture and keep a copy in the gallery; fall back to linking it. */
  const addFromUrl = async () => {
    const url = imageUrl.trim();
    if (!url) return;
    const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'image').replace(/\.[^.]+$/, '') || 'image';
    if (!onUploadImage) {
      insertImages([{ src: url, name }]);
      return;
    }
    setUrlBusy(true);
    setUrlNote('');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error('not an image');
      const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const saved = await onUploadImage(new File([blob], `${name}.${ext}`, { type: blob.type }));
      insertImages([saved]);
    } catch {
      // Many sites block downloads from other pages; link to the picture instead.
      setUrlNote("That site doesn't allow saving a copy, so the image was inserted as a link instead.");
      run((v) => insertBlock(v, imageMarkdown({ src: url, name })));
      setImageUrl('');
    } finally {
      setUrlBusy(false);
    }
  };

  const shownImages = images.filter((i) => i.name.toLowerCase().includes(imageQuery.trim().toLowerCase()));

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
      <ToolButton title="Image — or type ![[, paste or drop a picture" active={menu === 'image'} onClick={() => setMenu(menu === 'image' ? null : 'image')}>
        <ImageIcon className="w-4 h-4" />
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

      {menu && (
        <div
          className={`fixed inset-0 z-30 ${menu === 'image' && imageWide ? 'bg-slate-950/70 backdrop-blur-sm' : ''}`}
          onClick={close}
        />
      )}

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

      {menu === 'image' && (
        <div
          className={
            imageWide
              ? 'fixed inset-6 sm:inset-10 z-40 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col'
              : 'absolute left-4 sm:left-56 top-full mt-1 w-[26rem] max-w-[calc(100vw-2rem)] z-40 rounded-lg border border-slate-700 bg-slate-900 shadow-xl flex flex-col'
          }
        >
          <div className="flex items-center justify-between px-3 pt-2.5">
            <span className="text-sm font-semibold text-slate-200">Insert image</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setImageWide(!imageWide)}
                title={imageWide ? 'Make smaller' : 'Enlarge'}
                aria-label={imageWide ? 'Make smaller' : 'Enlarge'}
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
              >
                {imageWide ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={close}
                title="Close"
                aria-label="Close"
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className={`p-3 border-b border-slate-800 ${imageWide ? 'flex flex-wrap items-center gap-2' : 'space-y-2'}`}>
            {onUploadImage && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full sm:w-auto sm:px-4 h-9 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  Upload from computer
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => uploadFiles(e.target.files)}
                />
              </>
            )}
            <form
              className="flex gap-2 flex-1 min-w-[16rem]"
              onSubmit={(e) => {
                e.preventDefault();
                addFromUrl();
              }}
            >
              <div className="flex-1 relative">
                <Globe className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Add from URL (saves a copy to the gallery)"
                  className="w-full h-9 bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                type="submit"
                disabled={urlBusy || !imageUrl.trim()}
                className="h-9 px-3 rounded-lg border border-slate-700 text-sm text-slate-200 hover:bg-slate-800 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {urlBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Add
              </button>
            </form>
            {urlNote && <p className="w-full text-xs text-amber-300/90">{urlNote}</p>}
          </div>
          <div className={`p-3 flex flex-col min-h-0 ${imageWide ? 'flex-1' : ''}`}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-xs text-slate-400">Images in this project ({images.length})</span>
              <input
                value={imageQuery}
                onChange={(e) => setImageQuery(e.target.value)}
                placeholder="Filter…"
                className={`${imageWide ? 'w-64' : 'w-36'} h-7 bg-slate-950 border border-slate-800 rounded-md px-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500`}
              />
            </div>
            {shownImages.length === 0 ? (
              <div className="text-sm text-slate-500 py-6 text-center">No images yet</div>
            ) : (
              <div
                className={
                  imageWide
                    ? 'grid gap-3 flex-1 min-h-0 overflow-y-auto pr-1 content-start auto-rows-max grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]'
                    : 'grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1'
                }
              >
                {shownImages.map((img) => (
                  <button
                    key={img.src}
                    type="button"
                    title={img.name}
                    onClick={() => insertImages([img])}
                    className="group text-left rounded-md overflow-hidden border border-slate-800 hover:border-amber-500/60 cursor-pointer"
                  >
                    <ResolvedImage src={img.src} alt={img.name} className={`w-full ${imageWide ? 'h-36' : 'h-20'} object-cover bg-slate-950`} />
                    <span className="block px-1.5 py-1 text-xs text-slate-400 group-hover:text-slate-100 truncate">{img.name}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">Tip: type ![[ in the editor, or paste / drop a picture.</p>
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

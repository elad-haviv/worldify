import React from 'react';
import { Entity, Project } from '../types/worldify';
import { Sparkles, ExternalLink, PlusCircle } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  project: Project;
  onSelectEntity: (entityId: string) => void;
  onCreateStubEntity?: (title: string) => void;
}

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  character: 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25',
  settlement: 'bg-sky-500/15 text-sky-300 border-sky-500/40 hover:bg-sky-500/25',
  faction: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25',
  item: 'bg-pink-500/15 text-pink-300 border-pink-500/40 hover:bg-pink-500/25',
  deity: 'bg-purple-500/15 text-purple-300 border-purple-500/40 hover:bg-purple-500/25',
  location: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/25',
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  project,
  onSelectEntity,
  onCreateStubEntity,
}) => {
  const renderInlineTokens = (line: string, keyPrefix: string) => {
    // Tokenize [[WikiLinks]], **bold**, *italic*, `code`
    const tokenRegex = /(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    const parts = line.split(tokenRegex);

    return parts.map((part, idx) => {
      if (!part) return null;

      if (part.startsWith('[[') && part.endsWith(']]')) {
        const inner = part.slice(2, -2);
        const [rawTarget, rawLabel] = inner.split('|');
        const targetQuery = rawTarget.trim();
        const label = (rawLabel || rawTarget).trim();

        const resolved: Entity | undefined = project.entities.find(
          (e) =>
            e.title.toLowerCase() === targetQuery.toLowerCase() ||
            e.slug.toLowerCase() === targetQuery.toLowerCase() ||
            e.id === targetQuery
        );

        if (resolved) {
          const colorCls =
            CATEGORY_BADGE_COLORS[resolved.category] ||
            'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25';

          return (
            <span key={`${keyPrefix}-${idx}`} className="relative inline-block group">
              <button
                type="button"
                onClick={() => onSelectEntity(resolved.id)}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium border transition-colors cursor-pointer ${colorCls}`}
              >
                <Sparkles className="w-3 h-3 opacity-80" />
                <span>{label}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
              </button>
              {/* Hover Preview Card */}
              <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full left-0 mb-1.5 w-64 p-2.5 rounded-lg bg-slate-900/95 border border-slate-700 shadow-2xl z-50 text-left block">
                <span className="flex items-center justify-between text-xs capitalize text-slate-400 mb-1">
                  <span>{resolved.category}</span>
                  <span className="text-amber-400">Click to open</span>
                </span>
                <span className="block text-xs font-semibold text-slate-100 mb-1">
                  {resolved.title}
                </span>
                <span className="block text-xs text-slate-300 line-clamp-3 leading-relaxed">
                  {resolved.summary}
                </span>
              </span>
            </span>
          );
        } else {
          // Uncreated Red-Link Stub
          return (
            <button
              key={`${keyPrefix}-${idx}`}
              type="button"
              onClick={() => onCreateStubEntity && onCreateStubEntity(targetQuery)}
              title={`Missing entry "${targetQuery}" — Click to create wiki stub`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium border border-dashed border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3 h-3" />
              <span>{label}</span>
            </button>
          );
        }
      }

      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={`${keyPrefix}-${idx}`} className="font-semibold text-slate-100">
            {part.slice(2, -2)}
          </strong>
        );
      }

      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <em key={`${keyPrefix}-${idx}`} className="italic text-slate-200">
            {part.slice(1, -1)}
          </em>
        );
      }

      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={`${keyPrefix}-${idx}`}
            className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-xs"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      return <React.Fragment key={`${keyPrefix}-${idx}`}>{part}</React.Fragment>;
    });
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      elements.push(<div key={`sp-${i}`} className="h-2.5" />);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3
          key={`h3-${i}`}
          className="text-sm font-semibold text-amber-300/90 mt-4 mb-1.5 capitalize"
        >
          {renderInlineTokens(trimmed.slice(4), `h3-${i}`)}
        </h3>
      );
      continue;
    }

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2
          key={`h2-${i}`}
          className="text-lg font-semibold text-slate-100 mt-5 mb-2 pb-1 border-b border-slate-800"
        >
          {renderInlineTokens(trimmed.slice(3), `h2-${i}`)}
        </h2>
      );
      continue;
    }

    if (trimmed.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-xl font-display font-bold text-amber-400 mt-4 mb-2">
          {renderInlineTokens(trimmed.slice(2), `h1-${i}`)}
        </h1>
      );
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.slice(2).replace(/^\[![A-Z]+\]\s*/, '');
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="my-2 pl-3 py-1.5 pr-3 border-l-2 border-amber-500/70 bg-amber-500/5 rounded-r text-xs text-slate-300 leading-relaxed"
        >
          {renderInlineTokens(quoteText, `bq-${i}`)}
        </blockquote>
      );
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={`li-${i}`} className="flex items-start gap-2 pl-2 my-1 text-sm text-slate-300">
          <span className="text-amber-400 mt-1.5 text-xs">●</span>
          <span className="leading-relaxed">{renderInlineTokens(trimmed.slice(2), `li-${i}`)}</span>
        </div>
      );
      continue;
    }

    elements.push(
      <p key={`p-${i}`} className="text-sm text-slate-300 leading-relaxed my-1.5">
        {renderInlineTokens(rawLine, `p-${i}`)}
      </p>
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
};

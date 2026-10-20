import React from 'react';
import { Entity, Project } from '../types/worldify';

interface MarkdownRendererProps {
  content: string;
  project: Project;
  onSelectEntity: (entityId: string) => void;
  onCreateStubEntity?: (title: string) => void;
}

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
          return (
            <span key={`${keyPrefix}-${idx}`} className="relative inline group">
              <button
                type="button"
                onClick={() => onSelectEntity(resolved.id)}
                className="inline text-amber-300 font-medium underline decoration-amber-500/40 decoration-1 underline-offset-[3px] hover:decoration-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
              >
                {label}
              </button>
              {/* Hover preview card */}
              <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-200 absolute bottom-full left-0 mb-2 w-72 p-3 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl z-50 text-left block">
                <span className="block text-xs capitalize text-slate-500 mb-0.5">{resolved.category}</span>
                <span className="block text-sm font-semibold text-slate-100 mb-1">{resolved.title}</span>
                <span className="block text-sm text-slate-300 line-clamp-3 leading-snug">{resolved.summary}</span>
              </span>
            </span>
          );
        } else {
          // Missing entry – click to create it
          return (
            <button
              key={`${keyPrefix}-${idx}`}
              type="button"
              onClick={() => onCreateStubEntity && onCreateStubEntity(targetQuery)}
              title={`"${targetQuery}" doesn't exist yet — click to create it`}
              className="inline text-rose-300 underline decoration-dashed decoration-rose-400/60 underline-offset-[3px] hover:text-rose-200 cursor-pointer"
            >
              {label}
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
            className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[0.9em] whitespace-nowrap"
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
      elements.push(<div key={`sp-${i}`} className="h-3" />);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3
          key={`h3-${i}`}
          className="text-base font-semibold text-slate-100 mt-5 mb-2"
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
          className="text-xl font-semibold text-slate-50 mt-8 mb-3"
        >
          {renderInlineTokens(trimmed.slice(3), `h2-${i}`)}
        </h2>
      );
      continue;
    }

    if (trimmed.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-2xl font-display font-bold text-slate-50 mt-6 mb-3">
          {renderInlineTokens(trimmed.slice(2), `h1-${i}`)}
        </h1>
      );
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.slice(2).replace(/^\[![A-Z]+\]\s*/, '');
      if (!quoteText) continue; // bare callout marker like "> [!IMPORTANT]"
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="my-3 pl-4 py-2 pr-4 border-l-2 border-amber-500/60 bg-slate-900 rounded-r-lg text-base text-slate-300 leading-7"
        >
          {renderInlineTokens(quoteText, `bq-${i}`)}
        </blockquote>
      );
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={`li-${i}`} className="flex items-start gap-3 pl-1 my-1.5 text-base text-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 mt-[0.7rem] shrink-0" />
          <span className="leading-7">{renderInlineTokens(trimmed.slice(2), `li-${i}`)}</span>
        </div>
      );
      continue;
    }

    elements.push(
      <p key={`p-${i}`} className="text-base text-slate-300 leading-7 my-1">
        {renderInlineTokens(rawLine, `p-${i}`)}
      </p>
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
};

import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

export interface AIToolsMenuItem<T extends string> {
  action: T;
  icon: React.FC<{ className?: string }>;
  title: string;
  hint: string;
}

interface AIToolsMenuProps<T extends string> {
  items: AIToolsMenuItem<T>[];
  busy?: boolean;
  onRun: (action: T) => void;
}

/** A single "AI tools" button that opens a small menu of actions. */
export function AIToolsMenu<T extends string>({ items, busy, onRun }: AIToolsMenuProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(!open)}
        className="h-9 px-3 rounded-lg border border-slate-800 text-sm text-slate-300 hover:bg-slate-800 flex items-center gap-2 cursor-pointer disabled:opacity-50"
      >
        <Sparkles className="w-4 h-4 text-amber-400" />
        {busy ? 'Working…' : 'AI tools'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-64 z-40 rounded-lg border border-slate-700 bg-slate-900 shadow-xl p-1">
            {items.map(({ action, icon: Icon, title, hint }) => (
              <button
                key={action}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRun(action);
                }}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-800 flex items-start gap-3 cursor-pointer"
              >
                <Icon className="w-4 h-4 mt-1 text-slate-400 shrink-0" />
                <span>
                  <span className="block text-sm text-slate-100">{title}</span>
                  <span className="block text-xs text-slate-500">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

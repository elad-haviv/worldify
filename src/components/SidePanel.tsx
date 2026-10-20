import React, { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';

interface SidePanelProps {
  /** Which edge of the screen the panel sits on. */
  side: 'left' | 'right';
  /** Unique key so each panel remembers whether it was collapsed. */
  panelId: string;
  /** Short name shown on the collapsed rail and in tooltips. */
  label: string;
  /** Tailwind width class for the expanded panel, e.g. "w-80". */
  width?: string;
  /** Whether the panel starts open the very first time it is shown. */
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}

const keyFor = (id: string) => `worldify_panel_${id}`;

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(keyFor(id));
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    // storage unavailable
  }
  return fallback;
}

/**
 * A side panel that can be folded away to a slim rail, so the main canvas
 * (map, graph, editor…) can take the full width when the user wants focus.
 */
export const SidePanel: React.FC<SidePanelProps> = ({
  side,
  panelId,
  label,
  width = 'w-80',
  defaultOpen = true,
  className = '',
  children,
}) => {
  const [open, setOpen] = useState<boolean>(() => readOpen(panelId, defaultOpen));

  useEffect(() => {
    try {
      localStorage.setItem(keyFor(panelId), open ? '1' : '0');
    } catch {
      // ignore
    }
  }, [open, panelId]);

  const border = side === 'left' ? 'border-r' : 'border-l';
  const CloseIcon = side === 'left' ? PanelLeftClose : PanelRightClose;
  const OpenIcon = side === 'left' ? PanelLeftOpen : PanelRightOpen;

  if (!open) {
    return (
      <div
        className={`w-11 shrink-0 h-full bg-slate-900 ${border} border-slate-800 flex flex-col items-center pt-3 gap-3`}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
          title={`Show ${label}`}
          aria-label={`Show ${label}`}
        >
          <OpenIcon className="w-[18px] h-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer [writing-mode:vertical-rl] rotate-180 whitespace-nowrap"
        >
          {label}
        </button>
      </div>
    );
  }

  return (
    <div className="relative shrink-0 h-full flex group/panel">
      <aside className={`${width} h-full bg-slate-900 ${border} border-slate-800 ${className}`}>{children}</aside>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className={`absolute top-1/2 -translate-y-1/2 ${
          side === 'left' ? '-right-3' : '-left-3'
        } z-20 w-6 h-12 flex items-center justify-center rounded-md bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-700 cursor-pointer opacity-60 hover:opacity-100 group-hover/panel:opacity-100 transition-opacity`}
        title={`Hide ${label}`}
        aria-label={`Hide ${label}`}
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  );
};

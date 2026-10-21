import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { ICON_OPTIONS, IconOption, resolveCategoryIcon } from '../utils/categoryIcons';

interface IconPickerProps {
  value: string;
  onChange: (iconKey: string) => void;
  color?: string;
  className?: string;
}

const GROUPS = [
  'All',
  'People & Groups',
  'Creatures & Nature',
  'Places & Realm',
  'Magic & Tech',
  'Items & Relics',
  'Lore & Society',
] as const;

export const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onChange,
  color = '#f59e0b',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const popoverRef = useRef<HTMLDivElement>(null);

  const CurrentIcon = resolveCategoryIcon(value);
  const currentOption = ICON_OPTIONS.find((o) => o.key === value);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ICON_OPTIONS.filter((opt) => {
      if (selectedGroup !== 'All' && opt.group !== selectedGroup) return false;
      if (!q) return true;
      return (
        opt.label.toLowerCase().includes(q) ||
        opt.key.toLowerCase().includes(q) ||
        opt.keywords?.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [search, selectedGroup]);

  return (
    <div className={`relative ${className}`} ref={popoverRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 hover:border-slate-500 transition-colors text-left cursor-pointer group"
        title="Choose icon"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-6 h-6 rounded flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
            style={{
              backgroundColor: `${color}25`,
              color,
              boxShadow: `inset 0 0 0 1px ${color}45`,
            }}
          >
            <CurrentIcon className="w-3.5 h-3.5" />
          </span>
          <span className="text-xs font-medium text-slate-200 truncate">
            {currentOption?.label ?? value ?? 'Select Icon'}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-amber-400' : ''
          }`}
        />
      </button>

      {/* Visual Popover Modal */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-full min-w-[280px] sm:min-w-[320px] max-w-sm p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-1 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-200">Select Category Icon</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search icons (e.g. sword, deity, beast, tome)..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Group Filter Chips */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] no-scrollbar">
            {GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGroup(g)}
                className={`shrink-0 px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                  selectedGroup === g
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-medium'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Visual Icon Grid */}
          <div className="grid grid-cols-6 gap-1.5 max-h-52 overflow-y-auto pr-0.5 pt-1">
            {filteredIcons.map(({ key, label, Icon }: IconOption) => {
              const isSelected = value === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onChange(key);
                    setIsOpen(false);
                  }}
                  title={label}
                  className={`relative aspect-square flex flex-col items-center justify-center rounded-lg transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-slate-800 ring-2'
                      : 'hover:bg-slate-800/80 bg-slate-950/70 border border-slate-800/80 hover:border-slate-700'
                  }`}
                  style={
                    isSelected
                      ? {
                          borderColor: color,
                          boxShadow: `0 0 0 2px ${color}`,
                          backgroundColor: `${color}18`,
                        }
                      : undefined
                  }
                >
                  <Icon
                    className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                      isSelected ? '' : 'text-slate-300 group-hover:text-slate-100'
                    }`}
                    style={isSelected ? { color } : undefined}
                  />
                  {isSelected && (
                    <span
                      className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {filteredIcons.length === 0 && (
            <div className="py-6 text-center text-xs text-slate-500">
              No matching icons found.
            </div>
          )}

          {/* Selected preview footer */}
          {currentOption && (
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5 truncate">
                <CurrentIcon className="w-3.5 h-3.5" style={{ color }} />
                <strong className="text-slate-200 font-normal">{currentOption.label}</strong>
              </span>
              <span className="text-slate-500 text-[10px] shrink-0">{currentOption.group}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

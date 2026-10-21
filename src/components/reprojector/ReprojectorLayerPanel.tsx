import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FileJson,
  Palette,
  Type,
} from 'lucide-react';
import type { VectorGroup, VectorFeature } from './types';

interface LayerPanelProps {
  root: VectorGroup;
  hiddenIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string, isGroup: boolean) => void;
  onUpdateProperties: (id: string, updates: any) => void;
}

const TreeNode: React.FC<{
  item: VectorGroup | VectorFeature;
  depth: number;
  hiddenIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string, isGroup: boolean) => void;
  onUpdateProperties: (id: string, updates: any) => void;
}> = ({
  item,
  depth,
  hiddenIds,
  selectedId,
  onSelect,
  onToggleVisibility,
  onUpdateProperties,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [showStyles, setShowStyles] = useState(false);

  const isHidden = hiddenIds.has(item.id);
  const isSelected = selectedId === item.id;
  const isGroup = 'children' in item;

  const handleNameChange = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onUpdateProperties(item.id, { name: e.currentTarget.value });
      setIsEditingName(false);
    }
    if (e.key === 'Escape') setIsEditingName(false);
  };

  return (
    <div className="flex flex-col">
      <div
        className={`flex items-center gap-2 py-1.5 px-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors group ${
          isHidden ? 'opacity-40' : 'opacity-100'
        } ${isSelected ? 'bg-blue-500/20 border-l-2 border-blue-500' : 'border-l-2 border-transparent'}`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        onClick={() => onSelect(item.id)}
      >
        <div
          className="flex items-center gap-1.5 flex-1 min-w-0"
          onClick={(e) => {
            if (isGroup) {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }
          }}
        >
          {isGroup ? (
            <>
              {isOpen ? (
                <ChevronDown size={13} className="text-white/40" />
              ) : (
                <ChevronRight size={13} className="text-white/40" />
              )}
              <Folder size={13} className="text-blue-400/80" />
            </>
          ) : (
            <FileJson size={13} className="text-blue-400/60" />
          )}

          {isEditingName ? (
            <input
              autoFocus
              className="bg-blue-500/20 text-white text-xs border-none outline-none rounded px-1 w-full"
              defaultValue={item.name || item.id}
              onKeyDown={handleNameChange}
              onBlur={() => setIsEditingName(false)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className={`text-xs truncate font-medium flex-1 ${
                isSelected ? 'text-blue-400' : 'text-slate-300'
              }`}
            >
              {item.name || item.id}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingName(true);
            }}
            className="p-1 hover:bg-white/10 rounded transition-colors text-white/40 hover:text-white/80 cursor-pointer"
            title="Rename"
          >
            <Type size={12} />
          </button>
          {!isGroup && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowStyles(!showStyles);
              }}
              className={`p-1 hover:bg-white/10 rounded transition-colors cursor-pointer ${
                showStyles ? 'text-blue-400' : 'text-white/40'
              }`}
              title="Styles"
            >
              <Palette size={12} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(item.id, isGroup);
            }}
            className="p-1 hover:bg-white/10 rounded transition-colors text-white/40 hover:text-white/80 cursor-pointer"
          >
            {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>

      {/* Style Popout for Leaf Nodes */}
      {!isGroup && showStyles && (
        <div className="ml-8 my-1 p-2 bg-slate-950/80 border border-slate-800 rounded-lg flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Stroke</span>
            <input
              type="color"
              value={(item as VectorFeature).properties.stroke || '#3b82f6'}
              onChange={(e) => onUpdateProperties(item.id, { stroke: e.target.value })}
              className="w-5 h-5 rounded bg-transparent cursor-pointer"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Width</span>
            <input
              type="number"
              min="0.5"
              max="10"
              step="0.5"
              value={(item as VectorFeature).properties.strokeWidth || 1}
              onChange={(e) =>
                onUpdateProperties(item.id, { strokeWidth: parseFloat(e.target.value) })
              }
              className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right text-slate-100"
            />
          </div>
        </div>
      )}

      {/* Children */}
      {isGroup && isOpen && item.children && (
        <div className="flex flex-col">
          {item.children.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              depth={depth + 1}
              hiddenIds={hiddenIds}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggleVisibility={onToggleVisibility}
              onUpdateProperties={onUpdateProperties}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ReprojectorLayerPanel: React.FC<LayerPanelProps> = ({
  root,
  hiddenIds,
  selectedId,
  onSelect,
  onToggleVisibility,
  onUpdateProperties,
}) => {
  return (
    <div className="flex flex-col h-full bg-slate-900/95 border border-slate-800 backdrop-blur-2xl rounded-2xl shadow-2xl overflow-hidden">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">
          Vector Layers
        </h3>
        <span className="text-[11px] text-slate-500">
          Click to center
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <TreeNode
          item={root}
          depth={0}
          hiddenIds={hiddenIds}
          selectedId={selectedId}
          onSelect={onSelect}
          onToggleVisibility={onToggleVisibility}
          onUpdateProperties={onUpdateProperties}
        />
      </div>
    </div>
  );
};

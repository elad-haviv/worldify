import React, { useState } from 'react';

interface ControlPanelProps {
  rotation: [number, number, number];
  onRotationChange: (rotation: [number, number, number]) => void;
  projectionId: string;
  onProjectionChange: (id: string) => void;
  projections: { id: string; name: string }[];
  minimal?: boolean;
}

const EditableNumber: React.FC<{
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
}> = ({ value, min, max, onChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value.toFixed(1));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const num = parseFloat(tempValue);
      if (!isNaN(num)) {
        onChange(Math.max(min, Math.min(max, num)));
      }
      setIsEditing(false);
    }
    if (e.key === 'Escape') {
      setTempValue(value.toFixed(1));
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        autoFocus
        type="text"
        className="w-16 bg-blue-500/20 text-white text-xs font-mono font-bold border border-blue-500/40 outline-none rounded text-right px-1"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          const num = parseFloat(tempValue);
          if (!isNaN(num)) onChange(Math.max(min, Math.min(max, num)));
          setIsEditing(false);
        }}
      />
    );
  }

  return (
    <span
      className="text-xs font-mono font-bold text-white/90 cursor-pointer hover:text-blue-400 transition-colors"
      onClick={() => {
        setTempValue(value.toFixed(1));
        setIsEditing(true);
      }}
      title="Click to edit angle"
    >
      {value.toFixed(1)}°
    </span>
  );
};

export const ReprojectorControlPanel: React.FC<ControlPanelProps> = ({
  rotation,
  onRotationChange,
  projectionId,
  onProjectionChange,
  projections,
  minimal = false,
}) => {
  const handleChange = (index: number, value: string | number) => {
    const newRotation = [...rotation] as [number, number, number];
    newRotation[index] = typeof value === 'string' ? parseFloat(value) : value;
    onRotationChange(newRotation);
  };

  return (
    <div
      className={`flex flex-col gap-5 ${
        !minimal
          ? 'p-5 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl'
          : ''
      }`}
    >
      {!minimal && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
            Projection System
          </label>
          <select
            value={projectionId}
            onChange={(e) => onProjectionChange(e.target.value)}
            className="bg-slate-950 text-slate-200 rounded-xl px-3 py-2 border border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer text-xs"
          >
            {projections.map((p) => (
              <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-4">
        {/* Lambda / Yaw */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Longitude (Yaw)</span>
            <EditableNumber
              value={rotation[0]}
              min={-180}
              max={180}
              onChange={(val) => handleChange(0, val)}
            />
          </div>
          <input
            type="range"
            min={-180}
            max={180}
            step={0.5}
            value={rotation[0]}
            onChange={(e) => handleChange(0, e.target.value)}
            className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Phi / Pitch */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Latitude (Pitch)</span>
            <EditableNumber
              value={rotation[1]}
              min={-90}
              max={90}
              onChange={(val) => handleChange(1, val)}
            />
          </div>
          <input
            type="range"
            min={-90}
            max={90}
            step={0.5}
            value={rotation[1]}
            onChange={(e) => handleChange(1, e.target.value)}
            className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Gamma / Roll */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Axial Tilt (Roll)</span>
            <EditableNumber
              value={rotation[2]}
              min={-180}
              max={180}
              onChange={(val) => handleChange(2, val)}
            />
          </div>
          <input
            type="range"
            min={-180}
            max={180}
            step={0.5}
            value={rotation[2]}
            onChange={(e) => handleChange(2, e.target.value)}
            className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>
      </div>
    </div>
  );
};

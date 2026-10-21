import React, { useCallback } from 'react';
import { Upload } from 'lucide-react';

interface UploadZoneProps {
  onImageUploaded: (img: HTMLImageElement) => void;
  onVectorUploaded?: (svg: string) => void;
}

export const ReprojectorUploadZone: React.FC<UploadZoneProps> = ({
  onImageUploaded,
  onVectorUploaded,
}) => {
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const isSVG = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
        if (isSVG && onVectorUploaded) {
          const reader = new FileReader();
          reader.onload = (event) => {
            onVectorUploaded(event.target?.result as string);
          };
          reader.readAsText(file);
        } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => onImageUploaded(img);
            img.src = event.target?.result as string;
          };
          reader.readAsDataURL(file);
        }
      }
    },
    [onImageUploaded, onVectorUploaded]
  );

  return (
    <div className="w-full">
      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 hover:border-blue-500/60 rounded-xl cursor-pointer bg-slate-900/60 hover:bg-slate-800/60 transition-colors group">
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <Upload className="w-7 h-7 mb-3 text-slate-400 group-hover:text-blue-400 transition-colors" />
          <p className="mb-1 text-xs text-slate-300">
            <span className="font-semibold text-blue-400">Click to upload</span> or drag and drop
          </p>
          <p className="text-[11px] text-slate-500">Raster (PNG, JPG, WebP) or Vector (SVG)</p>
        </div>
        <input type="file" className="hidden" accept="image/*,.svg" onChange={handleFileChange} />
      </label>
    </div>
  );
};

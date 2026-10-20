import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { resolveImageSrc } from '../utils/assetStore';

/** <img> that understands asset:<id> sources (uploaded images) as well as normal URLs. */
export const ResolvedImage: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className }) => {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    resolveImageSrc(src).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [src]);

  if (url === null || failed) {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-700 text-sm text-slate-500">
        <ImageOff className="w-4 h-4" /> Image not found: {alt || src}
      </span>
    );
  }
  if (url === undefined) return <span className={`block bg-slate-900 animate-pulse ${className ?? ''}`} style={{ minHeight: 120 }} />;
  return <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />;
};

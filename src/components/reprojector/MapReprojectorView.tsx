import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as d3Geo from 'd3-geo';
import * as d3GeoProj from 'd3-geo-projection';
import { interpolate as d3Interpolate } from 'd3-interpolate';
import { easeCubicOut } from 'd3-ease';
import {
  Download,
  Globe,
  Grid3X3,
  Layers,
  Maximize2,
  Menu,
  Moon,
  Move,
  Sun,
  Target,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { MapReprojectorCanvas } from './MapReprojectorCanvas';
import type { MapCanvasHandle, VectorGeometry, VectorGroup, VectorFeature } from './types';
import { parseSVGToGeometry } from './SVGParser';
import { ReprojectorControlPanel } from './ReprojectorControlPanel';
import { ReprojectorLayerPanel } from './ReprojectorLayerPanel';
import { ReprojectorUploadZone } from './ReprojectorUploadZone';
import { MapLabel, MapMarker, MapPath, MapZone } from '../../types/worldify';

export const REPROJECTOR_PROJECTIONS = [
  { id: 'orthographic', name: 'Orthographic (3D Globe)', creator: () => d3Geo.geoOrthographic() },
  { id: 'mercator', name: 'Mercator', creator: () => d3Geo.geoMercator() },
  { id: 'equirectangular', name: 'Equirectangular', creator: () => d3Geo.geoEquirectangular() },
  { id: 'robinson', name: 'Robinson', creator: () => d3GeoProj.geoRobinson() },
  { id: 'mollweide', name: 'Mollweide', creator: () => d3GeoProj.geoMollweide() },
  { id: 'winkel3', name: 'Winkel Tripel', creator: () => d3GeoProj.geoWinkel3() },
  { id: 'fahey', name: 'Fahey', creator: () => d3GeoProj.geoFahey() },
  { id: 'naturalEarth', name: 'Natural Earth', creator: () => d3Geo.geoNaturalEarth1() },
];

interface MapReprojectorViewProps {
  initialImageUrl?: string;
  mapTitle?: string;
  onClose?: () => void;
  allowUpload?: boolean;
  markers?: MapMarker[];
  paths?: MapPath[];
  zones?: MapZone[];
  labels?: MapLabel[];
  entities?: Array<{ id: string; title: string; x: number; y: number; category?: string; statusNote?: string }>;
}

export const MapReprojectorView: React.FC<MapReprojectorViewProps> = ({
  initialImageUrl,
  mapTitle = 'Geographic Map',
  onClose,
  allowUpload = false,
  markers = [],
  paths = [],
  zones = [],
  labels = [],
  entities = [],
}) => {
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [vectorData, setVectorData] = useState<VectorGeometry | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [zoom, setZoom] = useState(1);
  const [projectionId, setProjectionId] = useState('orthographic');
  const [showGrid, setShowGrid] = useState(true);
  const [showCenterIndicator, setShowCenterIndicator] = useState(false);
  const [styleMode, setStyleMode] = useState<'default' | 'blueprint'>('default');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  const mapCanvasRef = useRef<MapCanvasHandle>(null);
  const animationRef = useRef<number | null>(null);

  // Resize observer for container
  useEffect(() => {
    const updateDims = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || window.innerWidth,
          height: containerRef.current.clientHeight || window.innerHeight,
        });
      }
    };
    updateDims();
    window.addEventListener('resize', updateDims);
    return () => window.removeEventListener('resize', updateDims);
  }, []);

  // Auto-load initial image URL if provided
  useEffect(() => {
    if (initialImageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => setSourceImage(img);
      img.src = initialImageUrl;
    }
  }, [initialImageUrl]);

  const projection = useMemo(() => {
    const pInfo =
      REPROJECTOR_PROJECTIONS.find((p) => p.id === projectionId) || REPROJECTOR_PROJECTIONS[0];
    const p = pInfo.creator();

    const initialScale =
      projectionId === 'orthographic'
        ? Math.min(dimensions.width, dimensions.height) / 3.2
        : Math.min(dimensions.width, dimensions.height) / 3.8;
    p.scale(initialScale * zoom);
    p.translate([dimensions.width / 2, dimensions.height / 2]);
    p.rotate(rotation);
    return p;
  }, [projectionId, rotation, zoom, dimensions]);

  const handleInteraction = (newRotation: [number, number, number], newZoom: number) => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setRotation(newRotation);
    setZoom(newZoom);
  };

  const handleVectorUpload = (svgString: string) => {
    const geometry = parseSVGToGeometry(svgString);
    setVectorData(geometry);
    setHiddenIds(new Set());
    setSelectedId(null);
    setIsLayerPanelOpen(true);
  };

  const toggleVisibility = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      const isCurrentlyHidden = next.has(id);

      const toggleRecursive = (item: VectorGroup | VectorFeature, force?: boolean) => {
        const shouldHide = force !== undefined ? force : !isCurrentlyHidden;
        if (shouldHide) next.add(item.id);
        else next.delete(item.id);
        if ('children' in item) {
          item.children.forEach((child) => toggleRecursive(child, shouldHide));
        }
      };

      const findAndToggle = (items: (VectorGroup | VectorFeature)[]) => {
        for (const item of items) {
          if (item.id === id) {
            toggleRecursive(item);
            return true;
          }
          if ('children' in item && findAndToggle(item.children)) return true;
        }
        return false;
      };

      if (vectorData) findAndToggle([vectorData.root]);
      return next;
    });
  };

  const selectAndCenter = (id: string) => {
    setSelectedId(id);
    if (!vectorData) return;

    const findItem = (
      items: (VectorGroup | VectorFeature)[]
    ): VectorGroup | VectorFeature | null => {
      for (const item of items) {
        if (item.id === id) return item;
        if ('children' in item) {
          const found = findItem(item.children);
          if (found) return found;
        }
      }
      return null;
    };

    const collectCoords = (item: VectorGroup | VectorFeature, acc: [number, number][]) => {
      if ('children' in item) {
        item.children.forEach((child) => collectCoords(child, acc));
      } else {
        acc.push(...item.geometry.coordinates);
      }
    };

    const item = findItem([vectorData.root]);
    if (item) {
      const coords: [number, number][] = [];
      collectCoords(item, coords);

      if (coords.length > 0) {
        let sumLon = 0;
        let sumLat = 0;
        coords.forEach(([lon, lat]) => {
          sumLon += lon;
          sumLat += lat;
        });
        const centerLon = sumLon / coords.length;
        const centerLat = sumLat / coords.length;

        const targetRotation: [number, number, number] = [-centerLon, -centerLat, rotation[2]];

        if (animationRef.current) cancelAnimationFrame(animationRef.current);

        const startRotation = [...rotation];
        let startLon = startRotation[0];
        let endLon = targetRotation[0];
        const diff = endLon - startLon;
        if (diff > 180) startLon += 360;
        else if (diff < -180) startLon -= 360;

        const interpolator = d3Interpolate(
          [startLon, startRotation[1], startRotation[2]],
          [endLon, targetRotation[1], targetRotation[2]]
        );

        const duration = 750;
        const startTime = performance.now();

        const animate = (time: number) => {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = easeCubicOut(progress);
          const nextRotation = interpolator(easedProgress) as [number, number, number];
          setRotation(nextRotation);
          if (progress < 1) {
            animationRef.current = requestAnimationFrame(animate);
          } else {
            animationRef.current = null;
          }
        };
        animationRef.current = requestAnimationFrame(animate);
      }
    }
  };

  const updateVectorProperties = (id: string, updates: any) => {
    if (!vectorData) return;

    setVectorData((prev) => {
      if (!prev) return null;
      const next = { ...prev };

      const updateRecursive = (items: (VectorGroup | VectorFeature)[]) => {
        for (const item of items) {
          if (item.id === id) {
            if (updates.name !== undefined) item.name = updates.name;
            if ('properties' in item) {
              item.properties = { ...item.properties, ...updates };
            }
            return true;
          }
          if ('children' in item && updateRecursive(item.children)) return true;
        }
        return false;
      };

      updateRecursive([next.root]);
      next.features = next.features.map((f) => {
        if (f.id === id) {
          return { ...f, properties: { ...f.properties, ...updates } };
        }
        return f;
      });

      return next;
    });
  };

  const hasData = Boolean(sourceImage || vectorData);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden select-none font-sans text-slate-100"
    >
      {/* Canvas */}
      <div className="absolute inset-0 z-0">
        {!hasData ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-500 gap-6">
            <div className="relative">
              <Globe className="w-20 h-20 text-blue-500/20 animate-pulse" />
              <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full" />
            </div>
            <div className="text-center space-y-2 max-w-md px-6">
              <h2 className="text-xl font-semibold text-slate-200">Equirectangular Reprojection</h2>
              <p className="text-xs text-slate-400">
                Upload a planetary or world map (raster PNG/JPG/WebP or vector SVG) to reproject
                onto a 3D globe or world map projections.
              </p>
              <div className="pt-3">
                <ReprojectorUploadZone
                  onImageUploaded={setSourceImage}
                  onVectorUploaded={handleVectorUpload}
                />
              </div>
            </div>
          </div>
        ) : (
          <MapReprojectorCanvas
            ref={mapCanvasRef}
            sourceImage={sourceImage}
            vectorData={vectorData}
            hiddenIds={hiddenIds}
            selectedId={selectedId}
            showGrid={showGrid}
            showCenterIndicator={showCenterIndicator}
            styleMode={styleMode}
            projection={projection}
            projectionId={projectionId}
            width={dimensions.width}
            height={dimensions.height}
            rotation={rotation}
            zoom={zoom}
            onInteraction={handleInteraction}
            onSelect={selectAndCenter}
            markers={markers}
            paths={paths}
            zones={zones}
            labels={labels}
            entities={entities}
          />
        )}
      </div>

      {/* Top Header Bar */}
      <header className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 hover:bg-slate-800 text-slate-200 shadow-xl cursor-pointer"
            title="Toggle Control Panel"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-xl flex items-center gap-2 text-xs">
            <Globe className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-slate-100">{mapTitle}</span>
            <span className="text-slate-500">•</span>
            <span className="text-blue-300 font-mono">
              {REPROJECTOR_PROJECTIONS.find((p) => p.id === projectionId)?.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {vectorData && (
            <button
              type="button"
              onClick={() => setIsLayerPanelOpen(!isLayerPanelOpen)}
              className={`p-2.5 rounded-xl border shadow-xl cursor-pointer transition-colors ${
                isLayerPanelOpen
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : 'bg-slate-900/90 border-slate-700/80 hover:bg-slate-800 text-slate-300'
              }`}
              title="Vector Layers"
            >
              <Layers className="w-4 h-4" />
            </button>
          )}

          {hasData && (
            <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 rounded-xl p-1 shadow-xl">
              <button
                type="button"
                onClick={() => mapCanvasRef.current?.exportImage()}
                className="px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                title="Export PNG"
              >
                <Download className="w-3.5 h-3.5" />
                PNG
              </button>
              {vectorData && (
                <button
                  type="button"
                  onClick={() => mapCanvasRef.current?.exportSVG()}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                  title="Export SVG"
                >
                  <Download className="w-3.5 h-3.5" />
                  SVG
                </button>
              )}
            </div>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 hover:bg-slate-800 text-slate-400 hover:text-slate-100 shadow-xl cursor-pointer"
              title="Back to Map View"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Floating Bottom Toolbar (Zoom, Grid, Center, Theme, Reset) */}
      <footer className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-2xl shadow-2xl">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(z * 1.25, 8))}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(z * 0.8, 0.4))}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setRotation([0, 0, 0]);
            setZoom(1);
          }}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
          title="Reset View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-700/80 mx-1" />

        <button
          type="button"
          onClick={() => setShowGrid(!showGrid)}
          className={`p-2 rounded-xl cursor-pointer transition-colors ${
            showGrid ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:bg-slate-800'
          }`}
          title="Toggle Graticule Grid"
        >
          <Grid3X3 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setShowCenterIndicator(!showCenterIndicator)}
          className={`p-2 rounded-xl cursor-pointer transition-colors ${
            showCenterIndicator ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:bg-slate-800'
          }`}
          title="Toggle Center Crosshair"
        >
          <Target className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setStyleMode(styleMode === 'default' ? 'blueprint' : 'default')}
          className={`p-2 rounded-xl cursor-pointer transition-colors ${
            styleMode === 'blueprint'
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
          title={`Style Mode: ${styleMode}`}
        >
          {styleMode === 'blueprint' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
      </footer>

      {/* Left Control Panel */}
      {isSidebarOpen && (
        <aside className="absolute left-4 top-20 bottom-20 z-20 w-72 flex flex-col gap-4 pointer-events-auto">
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <ReprojectorControlPanel
              rotation={rotation}
              onRotationChange={setRotation}
              projectionId={projectionId}
              onProjectionChange={setProjectionId}
              projections={REPROJECTOR_PROJECTIONS}
            />

            {allowUpload && (
              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl space-y-2">
                <h4 className="text-xs font-semibold text-slate-300">Replace or Add Map</h4>
                <ReprojectorUploadZone
                  onImageUploaded={(img) => {
                    setSourceImage(img);
                  }}
                  onVectorUploaded={handleVectorUpload}
                />
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Right Vector Layer Panel */}
      {isLayerPanelOpen && vectorData && (
        <aside className="absolute right-4 top-20 bottom-20 z-20 w-72 flex flex-col pointer-events-auto">
          <ReprojectorLayerPanel
            root={vectorData.root}
            hiddenIds={hiddenIds}
            selectedId={selectedId}
            onSelect={selectAndCenter}
            onToggleVisibility={toggleVisibility}
            onUpdateProperties={updateVectorProperties}
          />
        </aside>
      )}

      {/* Drag & Rotate Helper Hint */}
      <div className="absolute bottom-4 left-4 z-10 text-[11px] text-slate-500 pointer-events-none">
        Click & drag to rotate globe • Scroll to zoom
      </div>
    </div>
  );
};

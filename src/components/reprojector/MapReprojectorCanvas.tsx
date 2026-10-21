import { useRef, useEffect, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import * as d3Geo from 'd3-geo';
import { select } from 'd3-selection';
import { drag as d3Drag } from 'd3-drag';

import type { MapCanvasHandle, VectorGeometry, VectorGroup, VectorFeature } from './types';
import { MapLabel, MapMarker, MapPath, MapZone } from '../../types/worldify';
import { getMarkerGlyph } from '../../utils/markerIcons';

interface MapReprojectorCanvasProps {
  sourceImage: HTMLImageElement | null;
  vectorData: VectorGeometry | null;
  hiddenIds: Set<string>;
  selectedId: string | null;
  showGrid: boolean;
  showCenterIndicator: boolean;
  styleMode: 'default' | 'blueprint';
  projection: d3Geo.GeoProjection;
  projectionId: string;
  width: number;
  height: number;
  rotation: [number, number, number];
  zoom: number;
  onInteraction: (rotation: [number, number, number], zoom: number) => void;
  onSelect: (id: string) => void;
  // Worldify custom map layers
  markers?: MapMarker[];
  paths?: MapPath[];
  zones?: MapZone[];
  labels?: MapLabel[];
  entities?: Array<{ id: string; title: string; x: number; y: number; category?: string; statusNote?: string }>;
}

export const MapReprojectorCanvas = forwardRef<MapCanvasHandle, MapReprojectorCanvasProps>(
  (
    {
      sourceImage,
      vectorData,
      hiddenIds,
      selectedId,
      showGrid,
      showCenterIndicator,
      styleMode,
      projection,
      projectionId,
      width,
      height,
      rotation,
      zoom,
      onInteraction,
      onSelect,
      markers = [],
      paths = [],
      zones = [],
      labels = [],
      entities = [],
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef<number>(0);
    const isRenderingRef = useRef<boolean>(false);
    const pendingRequestRef = useRef<boolean>(false);
    const rafScheduledRef = useRef<boolean>(false);
    const mutableRotationRef = useRef<[number, number, number]>(rotation);

    const [isInteracting, setIsInteracting] = useState(false);
    const [lastRasterData, setLastRasterData] = useState<ImageData | null>(null);

    useEffect(() => {
      if (!isInteracting) mutableRotationRef.current = [...rotation];
    }, [rotation, isInteracting]);

    const [sourceData, setSourceData] = useState<{
      data: Uint8ClampedArray;
      width: number;
      height: number;
    } | null>(null);

    const selectedSet = useMemo(() => {
      const set = new Set<string>();
      if (!selectedId || !vectorData) return set;

      const findItem = (
        items: (VectorGroup | VectorFeature)[]
      ): VectorGroup | VectorFeature | null => {
        for (const item of items) {
          if (item.id === selectedId) return item;
          if ('children' in item) {
            const found = findItem(item.children);
            if (found) return found;
          }
        }
        return null;
      };

      const collectIds = (item: VectorGroup | VectorFeature) => {
        set.add(item.id);
        if ('children' in item) {
          item.children.forEach((child) => collectIds(child));
        }
      };

      const item = findItem([vectorData.root]);
      if (item) collectIds(item);
      return set;
    }, [selectedId, vectorData]);

    useImperativeHandle(ref, () => ({
      exportImage: () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);

        if (styleMode === 'default' && lastRasterData) {
          if (lastRasterData.width !== width) {
            const off = document.createElement('canvas');
            off.width = lastRasterData.width;
            off.height = lastRasterData.height;
            off.getContext('2d')?.putImageData(lastRasterData, 0, 0);
            ctx.drawImage(off, 0, 0, width, height);
          } else {
            ctx.putImageData(lastRasterData, 0, 0);
          }
        }

        if (vectorData) {
          const path = d3Geo.geoPath(projection, ctx);
          vectorData.features
            .filter((f) => !hiddenIds.has(f.id))
            .forEach((f) => {
              if (styleMode === 'blueprint') {
                ctx.fillStyle = 'white';
                ctx.beginPath();
                path(f as any);
                ctx.fill();
              } else {
                ctx.strokeStyle = f.properties.stroke;
                ctx.lineWidth = f.properties.strokeWidth;
                ctx.beginPath();
                path(f as any);
                ctx.stroke();
              }
            });
        }

        const link = document.createElement('a');
        link.download = `reprojection-${projectionId}-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
      },
      exportSVG: () => {
        if (!vectorData) return;
        const path = d3Geo.geoPath(projection);
        const visibleFeatures = vectorData.features.filter((f) => !hiddenIds.has(f.id));
        const pathsD = visibleFeatures
          .map((f) => {
            const d = path(f as any);
            if (!d) return '';
            if (styleMode === 'blueprint') {
              return `<path d="${d}" fill="white" stroke="none" />`;
            }
            return `<path d="${d}" fill="none" stroke="${f.properties.stroke}" stroke-width="${f.properties.strokeWidth}" />`;
          })
          .join('\n');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background-color: black;">${pathsD}</svg>`;
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `reprojection-${projectionId}-${Date.now()}.svg`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      },
    }));

    const executeRenderRequest = () => {
      if (!workerRef.current || !sourceData) return;
      if (isRenderingRef.current) {
        pendingRequestRef.current = true;
        return;
      }
      isRenderingRef.current = true;
      pendingRequestRef.current = false;
      const requestId = ++requestIdRef.current;

      // FAST interactive resolution during drag (< 4ms), full resolution on rest
      const maxW = isInteracting ? 460 : Math.min(1600, width);
      const maxH = isInteracting ? 280 : Math.min(1000, height);
      const aspect = width / height;

      let renderWidth = maxW;
      let renderHeight = Math.round(maxW / aspect);
      if (renderHeight > maxH) {
        renderHeight = maxH;
        renderWidth = Math.round(maxH * aspect);
      }

      const scaleFactor = renderWidth / width;
      workerRef.current.postMessage({
        type: 'render',
        targetWidth: renderWidth,
        targetHeight: renderHeight,
        requestId,
        highQuality: !isInteracting,
        projectionConfig: {
          id: projectionId,
          rotation: mutableRotationRef.current,
          scale: projection.scale() * scaleFactor,
          translate: [
            projection.translate()[0] * scaleFactor,
            projection.translate()[1] * scaleFactor,
          ],
        },
      });
    };

    const scheduleRender = () => {
      if (rafScheduledRef.current) return;
      rafScheduledRef.current = true;
      requestAnimationFrame(() => {
        rafScheduledRef.current = false;
        executeRenderRequest();
      });
    };

    // Initialize Web Worker
    useEffect(() => {
      const worker = new Worker(new URL('./reprojection.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { targetData, requestId, cancelled, error, targetWidth, targetHeight } = e.data;
        isRenderingRef.current = false;
        if (!cancelled && !error && requestId === requestIdRef.current) {
          setLastRasterData(new ImageData(targetData, targetWidth, targetHeight));
        }
        if (pendingRequestRef.current) {
          executeRenderRequest();
        }
      };

      // If sourceData was already parsed, upload it to the worker
      if (sourceData) {
        worker.postMessage({
          type: 'set_source',
          sourceData: sourceData.data,
          sourceWidth: sourceData.width,
          sourceHeight: sourceData.height,
        });
      }

      return () => worker.terminate();
    }, [width, height]);

    // Send sourceData to worker once when image loads
    useEffect(() => {
      if (workerRef.current && sourceData) {
        workerRef.current.postMessage({
          type: 'set_source',
          sourceData: sourceData.data,
          sourceWidth: sourceData.width,
          sourceHeight: sourceData.height,
        });
        executeRenderRequest();
      }
    }, [sourceData]);

    // Trigger render when projection parameters change
    useEffect(() => {
      if (sourceData && styleMode === 'default') {
        scheduleRender();
      } else {
        setLastRasterData(null);
      }
    }, [projectionId, rotation, zoom, isInteracting, styleMode]);

    // Helper: Map 0-1000 normalized map canvas point to [lon, lat]
    const mapToLonLat = (x: number, y: number): [number, number] => [
      (x / 1000) * 360 - 180,
      90 - (y / 1000) * 180,
    ];

    // Helper: Is coordinate on visible side of Orthographic globe?
    const isVisibleOnGlobe = (lonLat: [number, number]): boolean => {
      if (projectionId !== 'orthographic') return true;
      const centerLon = -rotation[0];
      const centerLat = -rotation[1];
      const dist = d3Geo.geoDistance(lonLat, [centerLon, centerLat]);
      return dist <= Math.PI / 2;
    };

    // Main 2D Canvas Drawing
    useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, width, height);

      // Fill Background
      ctx.fillStyle = styleMode === 'blueprint' ? '#091e3a' : 'black';
      ctx.fillRect(0, 0, width, height);

      // 1. Draw Raster Map
      if (styleMode === 'default' && lastRasterData) {
        if (lastRasterData.width !== width || lastRasterData.height !== height) {
          const off = document.createElement('canvas');
          off.width = lastRasterData.width;
          off.height = lastRasterData.height;
          off.getContext('2d')?.putImageData(lastRasterData, 0, 0);
          ctx.imageSmoothingEnabled = !isInteracting;
          ctx.drawImage(off, 0, 0, width, height);
        } else {
          ctx.putImageData(lastRasterData, 0, 0);
        }
      }

      const pathGenerator = d3Geo.geoPath(projection, ctx);

      // 2. Draw SVG Vector Data if present
      if (vectorData) {
        vectorData.features
          .filter((f) => !hiddenIds.has(f.id))
          .forEach((f) => {
            const isSelected = selectedSet.has(f.id);

            if (styleMode === 'blueprint') {
              ctx.fillStyle = isSelected ? '#60a5fa' : 'white';
              ctx.beginPath();
              pathGenerator(f as any);
              ctx.fill();
            } else {
              ctx.strokeStyle = isSelected ? '#60a5fa' : f.properties.stroke;
              ctx.lineWidth = isSelected
                ? f.properties.strokeWidth + 2
                : isInteracting
                ? 0.75
                : f.properties.strokeWidth;
              if (isSelected && !isInteracting) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#3b82f6';
              }
              ctx.beginPath();
              pathGenerator(f as any);
              ctx.stroke();
              ctx.shadowBlur = 0;
            }
          });
      }

      // 3. Draw Worldify Zones (Territory Borders & Faction Regions)
      zones.forEach((zone) => {
        if (zone.points.length < 3) return;
        const lonLats = zone.points.map((p) => mapToLonLat(p[0], p[1]));
        const geoJsonPolygon = {
          type: 'Polygon',
          coordinates: [[...lonLats, lonLats[0]]],
        };
        const alpha = Math.round((zone.opacity || 0.2) * 255).toString(16).padStart(2, '0');
        ctx.fillStyle = `${zone.color}${alpha}`;
        ctx.strokeStyle = zone.color;
        ctx.lineWidth = isInteracting ? 1 : 2;
        ctx.setLineDash(
          zone.borderStyle === 'dashed' ? [6, 4] : zone.borderStyle === 'dotted' ? [2, 3] : []
        );
        ctx.beginPath();
        pathGenerator(geoJsonPolygon as any);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // 4. Draw Worldify Paths (Trade Routes, Rivers, Roads)
      paths.forEach((p) => {
        if (p.points.length < 2) return;
        const lonLats = p.points.map((pt) => mapToLonLat(pt[0], pt[1]));
        const geoJsonLine = {
          type: 'LineString',
          coordinates: lonLats,
        };
        ctx.strokeStyle = p.color || '#f59e0b';
        ctx.lineWidth = isInteracting ? 1.5 : 2.5;
        ctx.setLineDash(p.dashed || p.style === 'army_march' ? [6, 4] : []);
        ctx.beginPath();
        pathGenerator(geoJsonLine as any);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // 5. Draw Coordinate Graticule Grid
      if (showGrid) {
        ctx.strokeStyle =
          styleMode === 'blueprint' ? 'rgba(147, 197, 253, 0.25)' : 'rgba(59, 130, 246, 0.2)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        pathGenerator(d3Geo.geoGraticule()());
        ctx.stroke();
      }

      // 6. Draw Outline Sphere
      ctx.strokeStyle =
        styleMode === 'blueprint' ? 'rgba(147, 197, 253, 0.6)' : 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pathGenerator({ type: 'Sphere' } as any);
      ctx.stroke();

      // 7. Draw Worldify Labels
      labels.forEach((lbl) => {
        const coord = mapToLonLat(lbl.x, lbl.y);
        if (!isVisibleOnGlobe(coord)) return;
        const projected = projection(coord);
        if (!projected) return;
        const [px, py] = projected;

        ctx.font = `600 ${Math.max(10, Math.min(22, lbl.fontSize || 14))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = lbl.color || '#f8fafc';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(lbl.text, px, py);
        ctx.shadowBlur = 0;
      });

      // 8. Draw Worldify Markers (Burgs, Cities, Temples, Relics)
      markers.forEach((m) => {
        const coord = mapToLonLat(m.x, m.y);
        if (!isVisibleOnGlobe(coord)) return;
        const projected = projection(coord);
        if (!projected) return;
        const [px, py] = projected;

        const glyph = getMarkerGlyph(m.icon);
        const radius = isInteracting ? 4 : 6.5;

        // Outer glow
        ctx.fillStyle = m.color || '#f59e0b';
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.arc(px, py, radius + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Pin badge base
        ctx.fillStyle = '#090d16';
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = m.color || '#f59e0b';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Glyph inside badge
        if (!isInteracting && glyph) {
          ctx.font = '9px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(glyph, px, py + 0.5);
        }

        // Label
        if (!isInteracting && m.name) {
          ctx.font = '600 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = '#fde68a';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
          ctx.shadowBlur = 4;
          ctx.fillText(m.name, px, py - (radius + 3));
          ctx.shadowBlur = 0;
        }
      });

      // 9. Draw Live Spatio-Temporal Characters / Armies
      entities.forEach((ent) => {
        const coord = mapToLonLat(ent.x, ent.y);
        if (!isVisibleOnGlobe(coord)) return;
        const projected = projection(coord);
        if (!projected) return;
        const [px, py] = projected;

        // Pulsing entity indicator
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(px, py, isInteracting ? 4.5 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (!isInteracting) {
          ctx.font = '600 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#38bdf8';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 4;
          ctx.fillText(ent.title, px, py + 7);
          ctx.shadowBlur = 0;
        }
      });

      // 10. Center Indicator
      if (showCenterIndicator) {
        const [cx, cy] = projection.translate();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy);
        ctx.lineTo(cx + 15, cy);
        ctx.moveTo(cx, cy - 15);
        ctx.lineTo(cx, cy + 15);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }, [
      lastRasterData,
      vectorData,
      hiddenIds,
      selectedSet,
      projection,
      width,
      height,
      isInteracting,
      showGrid,
      showCenterIndicator,
      styleMode,
      markers,
      paths,
      zones,
      labels,
      entities,
      rotation,
    ]);

    // Parse image when sourceImage element is created
    useEffect(() => {
      if (sourceImage) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sourceImage.width;
        tempCanvas.height = sourceImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.drawImage(sourceImage, 0, 0);
          const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          setSourceData({
            data: imageData.data,
            width: tempCanvas.width,
            height: tempCanvas.height,
          });
        }
      } else {
        setSourceData(null);
      }
    }, [sourceImage]);

    // Setup mouse drag & wheel interactions
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const selection = select(canvas);
      const dragHandler = d3Drag<HTMLCanvasElement, unknown>()
        .on('start', () => setIsInteracting(true))
        .on('drag', (event) => {
          const sensitivity = 65 / projection.scale();
          const nextRotation: [number, number, number] = [
            mutableRotationRef.current[0] + event.dx * sensitivity,
            Math.max(-90, Math.min(90, mutableRotationRef.current[1] - event.dy * sensitivity)),
            mutableRotationRef.current[2],
          ];
          mutableRotationRef.current = nextRotation;
          onInteraction(nextRotation, zoom);
        })
        .on('end', () => {
          setIsInteracting(false);
          scheduleRender();
        });
      selection.call(dragHandler as any);

      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        onInteraction(mutableRotationRef.current, zoom * delta);
      };
      canvas.addEventListener('wheel', handleWheel, { passive: false });

      const handleDblClick = (e: MouseEvent) => {
        if (!vectorData) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        let minDist = Infinity;
        let closestId: string | null = null;
        const distSq = (v: [number, number], w: [number, number]) =>
          (v[0] - w[0]) ** 2 + (v[1] - w[1]) ** 2;
        const distToSegment = (
          p: [number, number],
          v: [number, number],
          w: [number, number]
        ) => {
          const l2 = distSq(v, w);
          if (l2 === 0) return Math.sqrt(distSq(p, v));
          let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
          t = Math.max(0, Math.min(1, t));
          return Math.sqrt(distSq(p, [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])]));
        };
        vectorData.features.forEach((f) => {
          if (hiddenIds.has(f.id)) return;
          const points = f.geometry.coordinates.map(
            (p) => projection(p) as [number, number] | null
          );
          for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            if (!p1 || !p2) continue;
            const d = distToSegment([mx, my], p1, p2);
            if (d < minDist) {
              minDist = d;
              closestId = f.id;
            }
          }
        });
        if (closestId && minDist < 10) onSelect(closestId);
      };
      canvas.addEventListener('dblclick', handleDblClick);

      return () => {
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('dblclick', handleDblClick);
      };
    }, [projection, onInteraction, zoom, vectorData, hiddenIds, onSelect]);

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="cursor-move w-full h-full block"
      />
    );
  }
);

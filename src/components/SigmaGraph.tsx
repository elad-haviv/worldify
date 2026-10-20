import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';
import type { NodeDisplayData, PartialButFor } from 'sigma/types';
import type { Settings } from 'sigma/settings';

/**
 * WebGL knowledge-graph view built on Sigma.js + Graphology (both MIT-licensed).
 *  - ForceAtlas2 layout (the Gephi algorithm)
 *  - hover or select a node to highlight its neighbourhood
 *  - drag nodes, scroll to zoom, drag background to pan
 *  - labels are thinned automatically so they never pile up
 */

export interface GraphNodeInput {
  id: string;
  label: string;
  color: string;
  size: number;
}

export interface GraphEdgeInput {
  id: string;
  source: string;
  target: string;
  color: string;
  /** Shown only while the edge is highlighted. */
  label?: string;
}

export interface SigmaGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  focusNode: (id: string) => void;
}

interface SigmaGraphProps {
  nodes: GraphNodeInput[];
  edges: GraphEdgeInput[];
  selectedId: string | null;
  /** Nodes / edges on a highlighted path (e.g. "Find a connection"). */
  pathNodeIds?: Set<string>;
  pathEdgeIds?: Set<string>;
  /** Change this number to force a fresh layout. */
  layoutVersion?: number;
  onSelect: (id: string) => void;
}

const DIM_NODE = '#1e293b';
const DIM_EDGE = '#111827';
const PATH_COLOR = '#10b981';

/** Dark hover label (Sigma's default is a white box, which glares on a dark theme). */
function drawDarkHover(
  context: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, 'x' | 'y' | 'size' | 'label' | 'color'>,
  settings: Settings
) {
  const size = settings.labelSize;
  const font = settings.labelFont;
  const weight = settings.labelWeight;
  context.font = `${weight} ${size}px ${font}`;
  const label = data.label ?? '';
  const textWidth = context.measureText(label).width;
  const pad = 6;
  const x = data.x + data.size + 4;
  const y = data.y - size / 2 - pad;
  const w = textWidth + pad * 2;
  const h = size + pad * 2;

  context.beginPath();
  context.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
  context.fillStyle = '#f8fafc';
  context.fill();

  if (label) {
    context.fillStyle = '#0f172a';
    context.strokeStyle = '#334155';
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(x, y, w, h, 6);
    context.fill();
    context.stroke();
    context.fillStyle = '#f8fafc';
    context.fillText(label, x + pad, data.y + size / 3);
  }
}

export const SigmaGraph = forwardRef<SigmaGraphHandle, SigmaGraphProps>(function SigmaGraph(
  { nodes, edges, selectedId, pathNodeIds, pathEdgeIds, layoutVersion = 0, onSelect },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph>(new Graph({ multi: true, type: 'mixed' }));
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastLayoutVersion = useRef<number>(-1);

  // Interaction state lives in refs so the reducers always see the latest values.
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(selectedId);
  const pathNodesRef = useRef<Set<string>>(new Set());
  const pathEdgesRef = useRef<Set<string>>(new Set());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // ── Create Sigma once ────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const graph = graphRef.current;

    // Hovering dims everything outside the hovered node's neighbourhood.
    // Selection only highlights (so a selected loner doesn't blank the graph).
    const focusSet = (): Set<string> | null => {
      const focus = hoveredRef.current;
      if (!focus || !graph.hasNode(focus)) return null;
      return new Set([focus, ...graph.neighbors(focus)]);
    };

    const sigma = new Sigma(graph, container, {
      renderEdgeLabels: true,
      allowInvalidContainer: true,
      zIndex: true,
      defaultEdgeType: 'line',
      labelFont: 'Inter, system-ui, sans-serif',
      labelSize: 13,
      labelWeight: '500',
      labelColor: { color: '#e2e8f0' },
      labelDensity: 0.6,
      labelGridCellSize: 80,
      labelRenderedSizeThreshold: 7,
      edgeLabelFont: 'Inter, system-ui, sans-serif',
      edgeLabelSize: 11,
      edgeLabelColor: { color: '#94a3b8' },
      minCameraRatio: 0.03,
      // Keep nodes the same size on screen while zooming.
      zoomToSizeRatioFunction: () => 1,
      maxCameraRatio: 4,
      defaultDrawNodeHover: drawDarkHover,
      nodeReducer: (node, data) => {
        const res: Partial<NodeDisplayData> = { ...data };
        const focus = focusSet();
        const onPath = pathNodesRef.current.has(node);
        if (onPath) {
          res.highlighted = true;
          res.forceLabel = true;
          res.zIndex = 2;
        }
        if (focus) {
          if (focus.has(node)) {
            res.forceLabel = true;
            res.zIndex = 1;
            if (node === hoveredRef.current) res.highlighted = true;
          } else if (!onPath) {
            res.color = DIM_NODE;
            res.label = '';
            res.zIndex = 0;
          }
        } else if (pathNodesRef.current.size > 0 && !onPath) {
          res.color = DIM_NODE;
          res.label = '';
        }
        if (node === selectedRef.current) {
          res.highlighted = true;
          res.forceLabel = true;
          res.zIndex = 3;
        }
        return res;
      },
      edgeReducer: (edge, data) => {
        const res = { ...data };
        const focus = hoveredRef.current;
        const sel = selectedRef.current;
        const [s, t] = graph.extremities(edge);
        if (pathEdgesRef.current.has(edge)) {
          res.color = PATH_COLOR;
          res.size = 3;
          res.zIndex = 2;
          return res;
        }
        const touches = focus && (s === focus || t === focus);
        if (focus && graph.hasNode(focus)) {
          if (touches) {
            res.size = 2;
            res.zIndex = 1;
          } else {
            res.color = DIM_EDGE;
            res.label = '';
          }
        } else if (sel && (s === sel || t === sel)) {
          res.color = '#b45309';
          res.size = 1.4;
          res.zIndex = 1;
          res.label = '';
        } else {
          res.label = ''; // edge labels only while hovering a node
        }
        if (pathNodesRef.current.size > 0 && !touches) res.color = DIM_EDGE;
        return res;
      },
    });
    sigmaRef.current = sigma;

    // Hover / click
    sigma.on('enterNode', ({ node }) => {
      hoveredRef.current = node;
      container.style.cursor = 'pointer';
      sigma.refresh({ skipIndexation: true });
    });
    sigma.on('leaveNode', () => {
      hoveredRef.current = null;
      container.style.cursor = '';
      sigma.refresh({ skipIndexation: true });
    });
    sigma.on('clickNode', ({ node }) => onSelectRef.current(node));

    // Drag nodes
    let dragged: string | null = null;
    let moved = false;
    sigma.on('downNode', ({ node }) => {
      dragged = node;
      moved = false;
      if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox());
    });
    const captor = sigma.getMouseCaptor();
    captor.on('mousemovebody', (e) => {
      if (!dragged) return;
      moved = true;
      const pos = sigma.viewportToGraph(e);
      graph.setNodeAttribute(dragged, 'x', pos.x);
      graph.setNodeAttribute(dragged, 'y', pos.y);
      positionsRef.current.set(dragged, pos);
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });
    captor.on('mouseup', () => {
      if (dragged && moved) sigma.refresh();
      dragged = null;
    });

    // Keep the canvas sized to its container (side panels can fold away).
    const ro = new ResizeObserver(() => sigma.resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      sigma.kill();
      sigmaRef.current = null;
    };
  }, []);

  // ── Sync data + layout ───────────────────────────────────────────
  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    const known = positionsRef.current;

    graph.clear();
    let unplaced = 0;
    nodes.forEach((n, i) => {
      let pos = known.get(n.id);
      if (!pos) {
        unplaced++;
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
        const r = 100 + Math.random() * 100;
        pos = { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
      }
      graph.addNode(n.id, { label: n.label, color: n.color, size: n.size, x: pos.x, y: pos.y });
    });
    edges.forEach((e) => {
      if (graph.hasNode(e.source) && graph.hasNode(e.target) && e.source !== e.target) {
        graph.addEdgeWithKey(e.id, e.source, e.target, { color: e.color, size: 1, label: e.label ?? '' });
      }
    });

    const needsLayout = unplaced > 0 || layoutVersion !== lastLayoutVersion.current;
    if (needsLayout && graph.order > 0) {
      if (layoutVersion !== lastLayoutVersion.current) {
        // Fresh layout: scatter everything again.
        graph.forEachNode((id) => {
          graph.setNodeAttribute(id, 'x', (Math.random() - 0.5) * 200);
          graph.setNodeAttribute(id, 'y', (Math.random() - 0.5) * 200);
        });
      }
      const inferred = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, {
        iterations: graph.order > 400 ? 200 : 350,
        settings: {
          ...inferred,
          barnesHutOptimize: graph.order > 150,
          gravity: 1.2,
          scalingRatio: 12,
          slowDown: 4,
          adjustSizes: true,
        },
      });
      lastLayoutVersion.current = layoutVersion;
    }
    graph.forEachNode((id, attr) => known.set(id, { x: attr.x, y: attr.y }));

    if (sigma) {
      sigma.setCustomBBox(null);
      sigma.refresh();
      if (needsLayout) sigma.getCamera().animatedReset({ duration: 300 });
    }
  }, [nodes, edges, layoutVersion]);

  // ── Selection / path highlighting ────────────────────────────────
  useEffect(() => {
    selectedRef.current = selectedId;
    pathNodesRef.current = pathNodeIds ?? new Set();
    pathEdgesRef.current = pathEdgeIds ?? new Set();
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, [selectedId, pathNodeIds, pathEdgeIds]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => sigmaRef.current?.getCamera().animatedZoom({ duration: 200 }),
    zoomOut: () => sigmaRef.current?.getCamera().animatedUnzoom({ duration: 200 }),
    fit: () => sigmaRef.current?.getCamera().animatedReset({ duration: 300 }),
    focusNode: (id: string) => {
      const sigma = sigmaRef.current;
      const d = sigma?.getNodeDisplayData(id);
      if (sigma && d) sigma.getCamera().animate({ x: d.x, y: d.y, ratio: 0.35 }, { duration: 400 });
    },
  }));

  return <div ref={containerRef} className="absolute inset-0" />;
});

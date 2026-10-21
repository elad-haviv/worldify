import { Delaunay } from 'd3-delaunay';
import {
  BiomeType,
  ProceduralBurg,
  ProceduralMapData,
  ProceduralRiver,
  ProceduralState,
  ProceduralTemplateType,
  VoronoiCellData,
} from '../types/worldify';

export const BIOME_METADATA: Record<
  BiomeType,
  { label: string; color: string; stroke: string; habitability: number }
> = {
  deep_ocean: { label: 'Abyssal Ocean', color: '#0c2340', stroke: '#0a1d35', habitability: 0 },
  coastal_sea: { label: 'Continental Shelf', color: '#163c66', stroke: '#133357', habitability: 0 },
  ice_sheet: { label: 'Polar Ice Sheet', color: '#d8ecf8', stroke: '#c5dfef', habitability: 2 },
  tundra: { label: 'Permafrost Tundra', color: '#8ea29e', stroke: '#7b8f8b', habitability: 12 },
  taiga: { label: 'Boreal Taiga', color: '#3b604e', stroke: '#325242', habitability: 35 },
  temperate_forest: { label: 'Temperate Woodland', color: '#477b4f', stroke: '#3d6944', habitability: 85 },
  grassland: { label: 'Verdant Plains', color: '#789e57', stroke: '#688a4b', habitability: 95 },
  savanna: { label: 'Golden Savanna', color: '#a89f53', stroke: '#938b47', habitability: 60 },
  desert: { label: 'Arid Dune Sea', color: '#c8a86b', stroke: '#b3955d', habitability: 15 },
  tropical_rainforest: { label: 'Emerald Jungle', color: '#2b6b3f', stroke: '#235934', habitability: 55 },
  wetland: { label: 'Mire & Fenlands', color: '#456b64', stroke: '#3a5b55', habitability: 30 },
  alpine_peak: { label: 'Snow-Crowned Peaks', color: '#78716c', stroke: '#57534e', habitability: 8 },
  volcanic_wastes: { label: 'Obsidian Ashlands', color: '#443235', stroke: '#352528', habitability: 5 },
};

// Seeded Mulberry32 PRNG
function createRng(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fast 2D Gradient / Value Noise with FBM
function createNoise2D(seed: number) {
  const rng = createRng(seed);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  function fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function lerp(a: number, b: number, t: number) {
    return a + t * (b - a);
  }
  function grad(hash: number, x: number, y: number) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) !== 0 ? -u : u) + ((h & 2) !== 0 ? -2.0 * v : 2.0 * v);
  }

  function noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];

    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v) * 0.45; // approximately [-1, 1]
  }

  return function fbm(x: number, y: number, octaves = 5): number {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * noise(x * frequency, y * frequency);
      maxAmp += amplitude;
      amplitude *= 0.5;
      frequency *= 2.05;
    }
    return value / maxAmp; // [-1, 1]
  };
}

const PREFIXES = [
  'Aethel', 'Vael', 'Kael', 'Thal', 'Oakh', 'Sol', 'Dusk', 'Iron', 'Myth', 'Eld',
  'Drak', 'Sylv', 'Frost', 'Cinder', 'Aur', 'Val', 'Rav', 'Gild', 'Storm', 'Neth',
];
const SUFFIXES_BURG = [
  'gard', 'haven', 'watch', 'spire', 'ford', 'hold', 'port', 'crest', 'vale', 'reach',
  'gate', 'hearth', 'brook', 'wick', 'throne', 'keep', 'crown', 'fall',
];
const SUFFIXES_STATE = [
  'Dominion', 'Sovereignty', 'Kingdom', 'Principality', 'Covenant', 'Empire',
  'Commonwealth', 'Marches', 'League', 'Dynasty',
];
const CULTURES = [
  'High Aethelian', 'Vaelorian Sun-Forged', 'Frost-Kin of Thalor', 'Sylvan Weavers',
  'Ashen Pact', 'Sea-Lords of Kor', 'Obsidian Synod', 'Golden Steppe',
];
const STATE_COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#ef4444', '#06b6d4', '#eab308',
];

function classifyBiome(
  elevation: number,
  seaLevel: number,
  temperature: number,
  moisture: number,
  seedOffset: number
): BiomeType {
  if (elevation < seaLevel - 10) return 'deep_ocean';
  if (elevation < seaLevel) return 'coastal_sea';

  if (elevation > 82) {
    return temperature > 18 && seedOffset > 0.6 ? 'volcanic_wastes' : 'alpine_peak';
  }
  if (temperature < -6) return 'ice_sheet';
  if (temperature < 2) return 'tundra';
  if (temperature < 9) return moisture > 40 ? 'taiga' : 'grassland';

  if (temperature > 24) {
    if (moisture < 28) return 'desert';
    if (moisture < 58) return 'savanna';
    return 'tropical_rainforest';
  }

  // Temperate band
  if (moisture < 24) return 'desert';
  if (moisture < 50) return 'grassland';
  if (moisture > 82 && elevation < seaLevel + 12) return 'wetland';
  return 'temperate_forest';
}

/**
 * Generates an Azgaar-style procedural Voronoi fantasy map on a 1000x1000 coordinate plane.
 */
export function generateProceduralMap(
  seed = 4201,
  template: ProceduralTemplateType = 'continents',
  cellCount = 950,
  stateCount = 6,
  seaLevel = 30
): ProceduralMapData {
  const rng = createRng(seed);
  const fbm = createNoise2D(seed + 17);
  const moistureFbm = createNoise2D(seed + 99);

  const width = 1000;
  const height = 1000;

  // 1. Generate initial points & run 2 iterations of Lloyd relaxation for smooth organic cells
  let points: [number, number][] = Array.from({ length: cellCount }, () => [
    rng() * width,
    rng() * height,
  ]);

  for (let iter = 0; iter < 2; iter++) {
    const delaunay = Delaunay.from(points);
    const voronoi = delaunay.voronoi([0, 0, width, height]);
    points = points.map((pt, i) => {
      const poly = voronoi.cellPolygon(i);
      if (!poly || poly.length < 3) return pt;
      let cx = 0;
      let cy = 0;
      const n = poly.length - 1;
      for (let j = 0; j < n; j++) {
        cx += poly[j][0];
        cy += poly[j][1];
      }
      return [cx / n, cy / n];
    });
  }

  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  // 2. Build VoronoiCellData with Elevation, Temperature, Moisture & Biomes
  const cells: VoronoiCellData[] = points.map(([x, y], id) => {
    const rawPoly = voronoi.cellPolygon(id) || [];
    const polygon: [number, number][] = rawPoly.map((p) => [
      Math.round(p[0] * 10) / 10,
      Math.round(p[1] * 10) / 10,
    ]);
    const neighbors = Array.from(voronoi.neighbors(id));

    const nx = x / width;
    const ny = y / height;
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    const distFromCenter = Math.hypot(dx, dy) * 2; // 0 at center, ~1.4 at corner

    const nVal = fbm(nx * 3.6, ny * 3.6, 5); // [-1, 1]
    const detailVal = fbm(nx * 9.0, ny * 9.0, 3) * 0.25;

    let baseElev = 50 + (nVal + detailVal) * 52;

    if (template === 'continents') {
      // Two major continental masses
      const d1 = Math.hypot(nx - 0.33, ny - 0.46) * 2.2;
      const d2 = Math.hypot(nx - 0.72, ny - 0.56) * 2.3;
      const islandFactor = Math.min(d1, d2);
      baseElev = baseElev - islandFactor * 36 + 14;
    } else if (template === 'pangaea') {
      baseElev = baseElev - Math.pow(distFromCenter, 1.45) * 58 + 22;
    } else if (template === 'archipelago') {
      baseElev = baseElev - Math.pow(distFromCenter, 1.2) * 32 - 6 + Math.sin(nx * 18) * 10;
    } else if (template === 'inland_sea') {
      // Ring continent surrounding an inner sea
      const ringDist = Math.abs(distFromCenter - 0.55);
      baseElev = baseElev - ringDist * 65 + 16;
    } else if (template === 'shattered_sea') {
      const ridge = Math.abs(fbm(nx * 5.2, ny * 5.2, 4));
      baseElev = 24 + ridge * 85 - Math.pow(distFromCenter, 1.6) * 30;
    }

    // Clamp border cells to ocean so continents have clean coastlines
    const edgeDist = Math.min(nx, 1 - nx, ny, 1 - ny);
    if (edgeDist < 0.05) {
      baseElev *= edgeDist / 0.05;
    }

    const elevation = Math.max(2, Math.min(98, Math.round(baseElev)));

    // Latitude-based temperature (-15C at poles, +32C near equator, cooled by altitude)
    const latFactor = 1 - Math.abs(ny - 0.5) * 1.85;
    const altCooling = Math.max(0, elevation - seaLevel) * 0.32;
    const temperature = Math.round(-12 + latFactor * 42 - altCooling);

    // Moisture from second FBM + coastal boost
    const mVal = moistureFbm(nx * 4.0, ny * 4.0, 4);
    const moisture = Math.max(5, Math.min(98, Math.round(52 + mVal * 48)));

    const biome = classifyBiome(elevation, seaLevel, temperature, moisture, rng());

    return {
      id,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      polygon,
      neighbors,
      elevation,
      moisture,
      temperature,
      biome,
    };
  });

  // 3. Downhill Hydrology & Rivers
  const rivers: ProceduralRiver[] = [];
  const highCells = cells
    .filter((c) => c.elevation >= 68 && c.moisture >= 38)
    .sort((a, b) => b.elevation - a.elevation);

  const usedRiverSources = new Set<number>();
  const maxRivers = 12;

  for (const source of highCells) {
    if (rivers.length >= maxRivers) break;
    if (usedRiverSources.has(source.id)) continue;

    const pathCells: VoronoiCellData[] = [source];
    const visited = new Set<number>([source.id]);
    let curr = source;

    while (curr.elevation >= seaLevel && pathCells.length < 35) {
      const validNeighbors = curr.neighbors
        .map((nid) => cells[nid])
        .filter((n) => n && !visited.has(n.id));
      if (validNeighbors.length === 0) break;

      validNeighbors.sort((a, b) => a.elevation - b.elevation);
      const lowest = validNeighbors[0];
      pathCells.push(lowest);
      visited.add(lowest.id);
      curr = lowest;
      if (curr.elevation < seaLevel) break;
    }

    if (pathCells.length >= 4 && curr.elevation < seaLevel) {
      const riverId = `river-${rivers.length + 1}`;
      pathCells.forEach((c) => {
        usedRiverSources.add(c.id);
        c.riverId = riverId;
        c.moisture = Math.min(100, c.moisture + 15);
      });
      const prefix = PREFIXES[Math.floor(rng() * PREFIXES.length)];
      rivers.push({
        id: riverId,
        name: `River ${prefix}water`,
        points: pathCells.map((c) => [c.x, c.y]),
        width: Math.min(4.5, 1.4 + pathCells.length * 0.25),
      });
    }
  }

  // 4. Place Capitals & Burgs based on Habitability + River/Coast bonuses
  const landCells = cells.filter((c) => c.elevation >= seaLevel && c.elevation < 80);
  const scoredCells = landCells
    .map((cell) => {
      const baseHab = BIOME_METADATA[cell.biome].habitability;
      const riverBonus = cell.riverId ? 35 : 0;
      const isCoastal = cell.neighbors.some((nid) => cells[nid] && cells[nid].elevation < seaLevel);
      const coastBonus = isCoastal ? 28 : 0;
      return {
        cell,
        isCoastal,
        score: baseHab + riverBonus + coastBonus + rng() * 20,
      };
    })
    .sort((a, b) => b.score - a.score);

  const burgs: ProceduralBurg[] = [];
  const states: ProceduralState[] = [];
  const usedNames = new Set<string>();

  function pickUniqueBurgName(): string {
    for (let attempt = 0; attempt < 40; attempt++) {
      const p = PREFIXES[Math.floor(rng() * PREFIXES.length)];
      const s = SUFFIXES_BURG[Math.floor(rng() * SUFFIXES_BURG.length)];
      const name = `${p}${s}`;
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
    return `Citadel-${burgs.length + 1}`;
  }

  // Place State Capitals first (well spaced apart)
  for (const candidate of scoredCells) {
    if (states.length >= stateCount) break;
    const tooClose = burgs.some(
      (b) => Math.hypot(b.x - candidate.cell.x, b.y - candidate.cell.y) < 175
    );
    if (tooClose) continue;

    const stateIdx = states.length;
    const stateId = `state-${stateIdx + 1}`;
    const burgId = `burg-cap-${stateIdx + 1}`;
    const burgName = pickUniqueBurgName();
    const statePrefix = PREFIXES[Math.floor(rng() * PREFIXES.length)];
    const stateSuffix = SUFFIXES_STATE[stateIdx % SUFFIXES_STATE.length];
    const culture = CULTURES[stateIdx % CULTURES.length];

    const burg: ProceduralBurg = {
      id: burgId,
      name: burgName,
      cellId: candidate.cell.id,
      x: candidate.cell.x,
      y: candidate.cell.y,
      isCapital: true,
      population: Math.round(35000 + rng() * 65000),
      stateId,
      culture,
      port: candidate.isCoastal,
    };

    const state: ProceduralState = {
      id: stateId,
      name: `${statePrefix}ian ${stateSuffix}`,
      color: STATE_COLORS[stateIdx % STATE_COLORS.length],
      capitalBurgId: burgId,
      culture,
    };

    burgs.push(burg);
    states.push(state);
    candidate.cell.stateId = stateId;
  }

  // 5. Expand Political States across Land Cells (Best-first cost expansion from capitals)
  interface QueueItem {
    cellId: number;
    stateId: string;
    cost: number;
  }
  const queue: QueueItem[] = burgs.map((b) => ({
    cellId: b.cellId,
    stateId: b.stateId,
    cost: 0,
  }));
  const bestCost = new Map<number, number>();
  burgs.forEach((b) => bestCost.set(b.cellId, 0));

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    const currentCell = cells[current.cellId];
    if (!currentCell) continue;

    for (const nid of currentCell.neighbors) {
      const neighbor = cells[nid];
      if (!neighbor || neighbor.elevation < seaLevel) continue; // Stop at water
      const slopePenalty = Math.max(0, neighbor.elevation - 55) * 1.4;
      const biomePenalty = neighbor.biome === 'alpine_peak' || neighbor.biome === 'desert' ? 35 : 8;
      const stepCost = 10 + slopePenalty + biomePenalty;
      const newCost = current.cost + stepCost;

      if (newCost < 380 && (!bestCost.has(nid) || newCost < bestCost.get(nid)!)) {
        bestCost.set(nid, newCost);
        neighbor.stateId = current.stateId;
        queue.push({ cellId: nid, stateId: current.stateId, cost: newCost });
      }
    }
  }

  // 6. Place secondary Towns & Ports
  const maxSecondaryBurgs = 14;
  let secondaryCount = 0;
  for (const candidate of scoredCells) {
    if (secondaryCount >= maxSecondaryBurgs) break;
    const tooClose = burgs.some(
      (b) => Math.hypot(b.x - candidate.cell.x, b.y - candidate.cell.y) < 85
    );
    if (tooClose) continue;

    const stateId = candidate.cell.stateId || states[0]?.id || 'state-1';
    const parentState = states.find((s) => s.id === stateId);
    burgs.push({
      id: `burg-town-${secondaryCount + 1}`,
      name: pickUniqueBurgName(),
      cellId: candidate.cell.id,
      x: candidate.cell.x,
      y: candidate.cell.y,
      isCapital: false,
      population: Math.round(4500 + rng() * 19000),
      stateId,
      culture: parentState?.culture || CULTURES[0],
      port: candidate.isCoastal,
    });
    secondaryCount++;
  }

  return {
    seed,
    template,
    cellCount,
    seaLevel,
    cells,
    rivers,
    burgs,
    states,
  };
}

/**
 * Renders a ProceduralMapData object onto an offscreen canvas at standard resolution
 * and exports a clean PNG data URL for texture reprojections (globe, maps, reprojectors).
 */
export function renderProceduralMapToDataUrl(
  data: ProceduralMapData,
  width = 1000,
  height = 1000
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const scaleX = width / 1000;
  const scaleY = height / 1000;

  // Ocean background
  ctx.fillStyle = '#0a1e38';
  ctx.fillRect(0, 0, width, height);

  // Draw cells
  for (const cell of data.cells) {
    if (cell.polygon.length < 3) continue;
    const biomeMeta = BIOME_METADATA[cell.biome] || BIOME_METADATA.grassland;

    ctx.fillStyle = biomeMeta.color;
    ctx.strokeStyle = biomeMeta.stroke;
    ctx.lineWidth = 0.5 * scaleX;

    ctx.beginPath();
    ctx.moveTo(cell.polygon[0][0] * scaleX, cell.polygon[0][1] * scaleY);
    for (let i = 1; i < cell.polygon.length; i++) {
      ctx.lineTo(cell.polygon[i][0] * scaleX, cell.polygon[i][1] * scaleY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Political state tinting
    if (cell.stateId) {
      const stateObj = data.states.find((s) => s.id === cell.stateId);
      if (stateObj) {
        ctx.fillStyle = stateObj.color;
        ctx.globalAlpha = 0.22;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    }
  }

  // Draw rivers
  ctx.strokeStyle = '#38bdf8';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const river of data.rivers) {
    if (river.points.length < 2) continue;
    ctx.lineWidth = (river.width || 2) * scaleX;
    ctx.beginPath();
    ctx.moveTo(river.points[0][0] * scaleX, river.points[0][1] * scaleY);
    for (let i = 1; i < river.points.length; i++) {
      ctx.lineTo(river.points[i][0] * scaleX, river.points[i][1] * scaleY);
    }
    ctx.stroke();
  }

  // Draw burgs
  for (const burg of data.burgs) {
    const bx = burg.x * scaleX;
    const by = burg.y * scaleY;
    ctx.fillStyle = burg.isCapital ? '#fbbf24' : '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bx, by, burg.isCapital ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (burg.isCapital) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx, by, 7.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  return canvas.toDataURL('image/png');
}

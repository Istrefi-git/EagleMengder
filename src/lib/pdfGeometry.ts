// Geometry Layer – fase 2.
//
// Trekker ut PDF-ens EGEN vektorgeometri som et usynlig lag, atskilt fra det
// rasterbildet som vises på lerretet. Laget er datagrunnlaget snappingen i
// fase 3/4 skal bruke; det tegnes ikke, og påvirker ingenting i dagens UI.
//
// Tre valg preger implementasjonen, alle drevet av at ekte arkitekttegninger
// er store (titusener til hundretusener av segmenter):
//
//  1. Koordinater ligger i én flat Float64Array, ikke ett objekt per segment.
//     200 000 segmenter blir da ~6 MB i stedet for 200 000 JS-objekter.
//  2. Oppslag går via en uniform grid-indeks i CSR-form (to typed arrays),
//     ikke lineær skanning. Uten det ville snapping på mousemove vært ubrukelig.
//  3. Kryssingspunkter beregnes LOKALT ved forespørsel, aldri på forhånd.
//     Alle par av n segmenter er O(n²) – på 100 000 segmenter er det 5
//     milliarder tester. Ved markøren er det derimot en håndfull kandidater.

import { walkPageOperators } from './pdfOperatorWalk';
import type { PdfDoc } from './pdf';

// ── Tak ─────────────────────────────────────────────────────────────────

/** Over dette slutter vi å samle segmenter og setter `truncated`. */
export const MAX_SEGMENTS = 400_000;

/** Ønsket gjennomsnittlig antall segmenter per celle i indeksen. */
const TARGET_PER_CELL = 4;
const MIN_CELL_SIZE = 8;
const MAX_CELL_SIZE = 512;

/** Segmenter kortere enn dette forkastes – de gir bare støy i snappingen. */
const MIN_SEGMENT_LENGTH = 0.05;

/** Punkter nærmere hverandre enn dette regnes som samme punkt. */
export const POINT_EPSILON = 0.01;

// ── Typer ───────────────────────────────────────────────────────────────

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Uniform rutenett i CSR-form: `cellStart[i]..cellStart[i+1]` peker inn i
 * `cellItems` og gir segmentindeksene som overlapper celle `i`.
 */
export interface SpatialGrid {
  cellSize: number;
  cols: number;
  rows: number;
  minX: number;
  minY: number;
  cellStart: Int32Array;
  cellItems: Int32Array;
}

export interface GeometryLayer {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  /** 4 tall per segment: x1, y1, x2, y2 – i bilde-pikselrom. */
  coords: Float64Array;
  segmentCount: number;
  /** 2 tall per punkt: deduperte endepunkter fra alle segmenter. */
  endpoints: Float64Array;
  endpointCount: number;
  bbox: BBox | null;
  grid: SpatialGrid;
  truncated: boolean;
  stats: {
    rawSegments: number;
    droppedDegenerate: number;
    clipPathsSkipped: number;
    curves: number;
    operatorCount: number;
    maxFormDepth: number;
    markedContentSections: number;
  };
  durationMs: number;
}

export type SnapKind = 'endpoint' | 'midpoint' | 'intersection' | 'nearest' | 'perpendicular';

export interface SnapCandidate {
  x: number;
  y: number;
  kind: SnapKind;
  /** Avstand fra forespurt punkt, i bilde-piksler. */
  distance: number;
  /** Segmentindeks kandidaten stammer fra (-1 for kryss mellom to). */
  segmentIndex: number;
  segmentIndex2?: number;
}

export interface ExtractOptions {
  curveTolerancePx?: number;
  maxSegments?: number;
  shouldCancel?: () => boolean;
}

// ── Uttrekk ─────────────────────────────────────────────────────────────

/**
 * Bygger Geometry Layer for én side.
 *
 * Kurver flates ut her (i motsetning til analysen i fase 1, som bare teller
 * dem), fordi snapping trenger faktiske punkter å feste seg i.
 */
export async function extractGeometry(
  doc: PdfDoc,
  pageNumber: number,
  opts: ExtractOptions = {},
): Promise<GeometryLayer> {
  const started = performance.now();
  const maxSegments = opts.maxSegments ?? MAX_SEGMENTS;

  // Vokser dynamisk; unngår å allokere 400k plasser for en enkel side.
  let coords = new Float64Array(4096);
  let count = 0;
  let rawSegments = 0;
  let droppedDegenerate = 0;
  let clipPathsSkipped = 0;
  let curves = 0;
  let truncated = false;
  let bbox: BBox | null = null;

  function push(x1: number, y1: number, x2: number, y2: number) {
    if (count >= maxSegments) {
      truncated = true;
      return;
    }
    if (count * 4 + 4 > coords.length) {
      const next = new Float64Array(Math.min(coords.length * 2, maxSegments * 4));
      next.set(coords);
      coords = next;
    }
    const o = count * 4;
    coords[o] = x1;
    coords[o + 1] = y1;
    coords[o + 2] = x2;
    coords[o + 3] = y2;
    count++;

    const nx = Math.min(x1, x2);
    const xx = Math.max(x1, x2);
    const ny = Math.min(y1, y2);
    const xy = Math.max(y1, y2);
    if (!bbox) bbox = { minX: nx, minY: ny, maxX: xx, maxY: xy };
    else {
      if (nx < bbox.minX) bbox.minX = nx;
      if (ny < bbox.minY) bbox.minY = ny;
      if (xx > bbox.maxX) bbox.maxX = xx;
      if (xy > bbox.maxY) bbox.maxY = xy;
    }
  }

  const walk = await walkPageOperators(
    doc,
    pageNumber,
    {
      onPath(p) {
        curves += p.curves;
        // Klippebaner er ikke tegnet geometri – de avgrenser bare hva som
        // vises. Å snappe mot dem ville gitt usynlige, uforklarlige punkter,
        // typisk et rektangel rundt hele arket.
        if (p.paint === 'clip') {
          clipPathsSkipped++;
          return;
        }
        for (const s of p.segments) {
          rawSegments++;
          const dx = s.x2 - s.x1;
          const dy = s.y2 - s.y1;
          if (dx * dx + dy * dy < MIN_SEGMENT_LENGTH * MIN_SEGMENT_LENGTH) {
            droppedDegenerate++;
            continue;
          }
          push(s.x1, s.y1, s.x2, s.y2);
        }
      },
    },
    {
      flattenCurves: true,
      curveTolerancePx: opts.curveTolerancePx,
      shouldCancel: opts.shouldCancel,
    },
  );

  const finalCoords = coords.subarray(0, count * 4);
  const { endpoints, endpointCount } = buildEndpoints(finalCoords, count);
  const grid = buildGrid(finalCoords, count, walk.widthPx, walk.heightPx, bbox);

  return {
    pageNumber,
    widthPx: walk.widthPx,
    heightPx: walk.heightPx,
    coords: finalCoords,
    segmentCount: count,
    endpoints,
    endpointCount,
    bbox,
    grid,
    truncated: truncated || walk.truncated,
    stats: {
      rawSegments,
      droppedDegenerate,
      clipPathsSkipped,
      curves,
      operatorCount: walk.operatorCount,
      maxFormDepth: walk.maxFormDepth,
      markedContentSections: walk.markedContentSections,
    },
    durationMs: performance.now() - started,
  };
}

/** Deduperer alle segment-endepunkter til en flat punktliste. */
function buildEndpoints(
  coords: Float64Array,
  count: number,
): { endpoints: Float64Array; endpointCount: number } {
  const seen = new Map<string, number>();
  const out: number[] = [];
  const q = 1 / POINT_EPSILON;

  for (let i = 0; i < count; i++) {
    const o = i * 4;
    for (const [x, y] of [
      [coords[o], coords[o + 1]],
      [coords[o + 2], coords[o + 3]],
    ]) {
      const key = `${Math.round(x * q)},${Math.round(y * q)}`;
      if (seen.has(key)) continue;
      seen.set(key, out.length / 2);
      out.push(x, y);
    }
  }
  return { endpoints: Float64Array.from(out), endpointCount: out.length / 2 };
}

/**
 * Bygger CSR-rutenettet i to pass: først telles hvor mange segmenter hver
 * celle får, så fylles de inn. To pass unngår å allokere tusenvis av
 * mellomliggende arrays.
 *
 * Et segment legges i alle celler dets omsluttende rektangel dekker. For lange
 * diagonaler er det litt sløsing, men arkitekttegninger er overveiende
 * aksejusterte, der bboxen praktisk talt ER linjen.
 */
function buildGrid(
  coords: Float64Array,
  count: number,
  widthPx: number,
  heightPx: number,
  bbox: BBox | null,
): SpatialGrid {
  const minX = bbox ? bbox.minX : 0;
  const minY = bbox ? bbox.minY : 0;
  const spanX = bbox ? Math.max(1, bbox.maxX - bbox.minX) : Math.max(1, widthPx);
  const spanY = bbox ? Math.max(1, bbox.maxY - bbox.minY) : Math.max(1, heightPx);

  let cellSize = MIN_CELL_SIZE;
  if (count > 0) {
    cellSize = Math.sqrt((spanX * spanY * TARGET_PER_CELL) / count);
  }
  cellSize = Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, cellSize));

  const cols = Math.max(1, Math.ceil(spanX / cellSize));
  const rows = Math.max(1, Math.ceil(spanY / cellSize));
  const cellCount = cols * rows;

  const counts = new Int32Array(cellCount + 1);

  const cellRange = (i: number) => {
    const o = i * 4;
    const x0 = Math.min(coords[o], coords[o + 2]);
    const x1 = Math.max(coords[o], coords[o + 2]);
    const y0 = Math.min(coords[o + 1], coords[o + 3]);
    const y1 = Math.max(coords[o + 1], coords[o + 3]);
    return {
      c0: clamp(Math.floor((x0 - minX) / cellSize), 0, cols - 1),
      c1: clamp(Math.floor((x1 - minX) / cellSize), 0, cols - 1),
      r0: clamp(Math.floor((y0 - minY) / cellSize), 0, rows - 1),
      r1: clamp(Math.floor((y1 - minY) / cellSize), 0, rows - 1),
    };
  };

  for (let i = 0; i < count; i++) {
    const { c0, c1, r0, r1 } = cellRange(i);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) counts[r * cols + c + 1]++;
    }
  }
  for (let i = 0; i < cellCount; i++) counts[i + 1] += counts[i];

  const cellItems = new Int32Array(counts[cellCount]);
  const cursor = counts.slice(0, cellCount);
  for (let i = 0; i < count; i++) {
    const { c0, c1, r0, r1 } = cellRange(i);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) cellItems[cursor[r * cols + c]++] = i;
    }
  }

  return { cellSize, cols, rows, minX, minY, cellStart: counts, cellItems };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── Oppslag ─────────────────────────────────────────────────────────────

/** Segmentindekser som kan ligge innenfor `radius` av (x, y). */
export function querySegmentsNear(
  layer: GeometryLayer,
  x: number,
  y: number,
  radius: number,
): number[] {
  const g = layer.grid;
  const c0 = clamp(Math.floor((x - radius - g.minX) / g.cellSize), 0, g.cols - 1);
  const c1 = clamp(Math.floor((x + radius - g.minX) / g.cellSize), 0, g.cols - 1);
  const r0 = clamp(Math.floor((y - radius - g.minY) / g.cellSize), 0, g.rows - 1);
  const r1 = clamp(Math.floor((y + radius - g.minY) / g.cellSize), 0, g.rows - 1);

  const seen = new Set<number>();
  const out: number[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cell = r * g.cols + c;
      for (let k = g.cellStart[cell]; k < g.cellStart[cell + 1]; k++) {
        const idx = g.cellItems[k];
        if (seen.has(idx)) continue;
        seen.add(idx);
        out.push(idx);
      }
    }
  }
  return out;
}

export function getSegment(
  layer: GeometryLayer,
  i: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const o = i * 4;
  return {
    x1: layer.coords[o],
    y1: layer.coords[o + 1],
    x2: layer.coords[o + 2],
    y2: layer.coords[o + 3],
  };
}

/** Nærmeste punkt på et segment (begrenset til segmentet, ikke linjen). */
export function closestPointOnSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  px: number,
  py: number,
): { x: number; y: number; t: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return { x: x1, y: y1, t: 0 };
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: x1 + t * dx, y: y1 + t * dy, t };
}

/**
 * Kryssingspunkt mellom to SEGMENTER (ikke uendelige linjer).
 *
 * Skillet er viktig: `lineIntersect` i geometry.ts skjærer uendelige linjer,
 * som er riktig der den brukes (bend-geometri), men ville gitt fantom-punkter
 * her – to vegger som først ville krysset langt utenfor tegningen skal ikke
 * gi et snappepunkt.
 */
export function segmentIntersection(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number,
): { x: number; y: number } | null {
  const d1x = ax2 - ax1;
  const d1y = ay2 - ay1;
  const d2x = bx2 - bx1;
  const d2y = by2 - by1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null; // parallelle eller degenererte

  const t = ((bx1 - ax1) * d2y - (by1 - ay1) * d2x) / denom;
  const u = ((bx1 - ax1) * d1y - (by1 - ay1) * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return { x: ax1 + t * d1x, y: ay1 + t * d1y };
}

export interface SnapQueryOptions {
  kinds?: SnapKind[];
  /** Referansepunkt for vinkelrett-snapping (forrige klikkpunkt). */
  from?: { x: number; y: number };
  /** Maks antall kandidater som returneres. */
  limit?: number;
}

const DEFAULT_KINDS: SnapKind[] = ['endpoint', 'intersection', 'midpoint', 'perpendicular', 'nearest'];

/** Prioritet ved lik avstand – lavere tall vinner. */
const KIND_PRIORITY: Record<SnapKind, number> = {
  endpoint: 0,
  intersection: 1,
  midpoint: 2,
  perpendicular: 3,
  nearest: 4,
};

/**
 * Finner snappekandidater rundt (x, y) innenfor `radius` bilde-piksler.
 *
 * Kryssingspunkter regnes ut her og nå, kun mellom segmentene som faktisk
 * ligger i nærheten. Det er forskjellen på en håndfull tester og O(n²) over
 * hele tegningen, og er grunnen til at kryss-snapping i det hele tatt er
 * gjennomførbart på en ekte plantegning.
 */
export function findSnapCandidates(
  layer: GeometryLayer,
  x: number,
  y: number,
  radius: number,
  opts: SnapQueryOptions = {},
): SnapCandidate[] {
  const kinds = new Set(opts.kinds ?? DEFAULT_KINDS);
  const near = querySegmentsNear(layer, x, y, radius);
  const out: SnapCandidate[] = [];
  const r2 = radius * radius;

  const consider = (
    cx: number,
    cy: number,
    kind: SnapKind,
    segmentIndex: number,
    segmentIndex2?: number,
  ) => {
    const dx = cx - x;
    const dy = cy - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) return;
    out.push({ x: cx, y: cy, kind, distance: Math.sqrt(d2), segmentIndex, segmentIndex2 });
  };

  for (const i of near) {
    const s = getSegment(layer, i);

    if (kinds.has('endpoint')) {
      consider(s.x1, s.y1, 'endpoint', i);
      consider(s.x2, s.y2, 'endpoint', i);
    }
    if (kinds.has('midpoint')) {
      consider((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, 'midpoint', i);
    }
    if (kinds.has('nearest')) {
      const cp = closestPointOnSegment(s.x1, s.y1, s.x2, s.y2, x, y);
      consider(cp.x, cp.y, 'nearest', i);
    }
    if (kinds.has('perpendicular') && opts.from) {
      // Foten til normalen fra referansepunktet – gir «mål vinkelrett på veggen».
      const cp = closestPointOnSegment(s.x1, s.y1, s.x2, s.y2, opts.from.x, opts.from.y);
      consider(cp.x, cp.y, 'perpendicular', i);
    }
  }

  if (kinds.has('intersection')) {
    for (let a = 0; a < near.length; a++) {
      const sa = getSegment(layer, near[a]);
      for (let b = a + 1; b < near.length; b++) {
        const sb = getSegment(layer, near[b]);
        const hit = segmentIntersection(
          sa.x1, sa.y1, sa.x2, sa.y2,
          sb.x1, sb.y1, sb.x2, sb.y2,
        );
        if (hit) consider(hit.x, hit.y, 'intersection', near[a], near[b]);
      }
    }
  }

  out.sort((p, q) => {
    const dp = KIND_PRIORITY[p.kind] - KIND_PRIORITY[q.kind];
    if (dp !== 0) return dp;
    return p.distance - q.distance;
  });

  // Fjern duplikater som havner på praktisk talt samme punkt med samme type.
  const deduped: SnapCandidate[] = [];
  for (const c of out) {
    if (
      deduped.some(
        (d) =>
          d.kind === c.kind &&
          Math.abs(d.x - c.x) < POINT_EPSILON &&
          Math.abs(d.y - c.y) < POINT_EPSILON,
      )
    ) {
      continue;
    }
    deduped.push(c);
    if (opts.limit && deduped.length >= opts.limit) break;
  }
  return deduped;
}

/** Beste enkeltkandidat, eller null. */
export function findBestSnap(
  layer: GeometryLayer,
  x: number,
  y: number,
  radius: number,
  opts: SnapQueryOptions = {},
): SnapCandidate | null {
  const all = findSnapCandidates(layer, x, y, radius, { ...opts, limit: 1 });
  return all[0] ?? null;
}

// ── Cache ───────────────────────────────────────────────────────────────
//
// Samme mønster som analysen: nøkkelen er dokumentproxyen, så laget dør med
// dokumentet og trenger ingen invalidering.

const cache = new WeakMap<PdfDoc, Map<number, GeometryLayer>>();

export async function getGeometryLayer(
  doc: PdfDoc,
  pageNumber: number,
  opts: ExtractOptions = {},
): Promise<GeometryLayer> {
  let perDoc = cache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    cache.set(doc, perDoc);
  }
  const hit = perDoc.get(pageNumber);
  if (hit) return hit;

  const layer = await extractGeometry(doc, pageNumber, opts);
  perDoc.set(pageNumber, layer);
  return layer;
}

export function getCachedGeometryLayer(doc: PdfDoc, pageNumber: number): GeometryLayer | null {
  return cache.get(doc)?.get(pageNumber) ?? null;
}

// Geometriske hjelpefunksjoner – alt i bildets pikselrom

import type { LineEntity } from '../types';

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Total lengde i piksler av en polylinje gitt som [x0,y0,x1,y1,...] */
export function polylineLength(points: number[]): number {
  let total = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    total += distance(points[i], points[i + 1], points[i + 2], points[i + 3]);
  }
  return total;
}

/** Areal (i px²) av en lukket polygon gitt som [x0,y0,x1,y1,...] – shoelace-formelen.
 * Polygonet trenger ikke være eksplisitt lukket (siste punkt ≠ første); det antas lukket. */
export function polygonArea(points: number[]): number {
  let sum = 0;
  const n = points.length / 2;
  for (let i = 0; i < n; i++) {
    const x1 = points[i * 2];
    const y1 = points[i * 2 + 1];
    const j = (i + 1) % n;
    const x2 = points[j * 2];
    const y2 = points[j * 2 + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Tyngdepunkt (enkel gjennomsnitt av hjørnene, ikke arealvektet) for plassering av
 * arealetiketten midt i romfiguren. */
export function polygonCentroid(points: number[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  const n = points.length / 2;
  for (let i = 0; i < n; i++) {
    sx += points[i * 2];
    sy += points[i * 2 + 1];
  }
  return { x: sx / n, y: sy / n };
}

// ── Bend-vinkler ─────────────────────────────────────────────────────────

export interface BendPoint {
  x: number;
  y: number;
  /** Retningsendring (bend) i grader, 0–180 */
  angleDeg: number;
}

/** Normaliserer en gradverdi til intervallet (-180, 180] */
function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Finner bend (retningsendringer) ved hvert interne knekkpunkt i en
 * polylinje. Bend-vinkelen er avviket fra rett frem – en 90°-bend svinger
 * altså strømningsretningen 90°, akkurat som en fysisk vinkelrørdel.
 */
export function polylineBendAngles(points: number[]): BendPoint[] {
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i += 2) verts.push({ x: points[i], y: points[i + 1] });

  const bends: BendPoint[] = [];
  for (let k = 1; k < verts.length - 1; k++) {
    const prev = verts[k - 1];
    const cur = verts[k];
    const next = verts[k + 1];
    const a1 = Math.atan2(cur.y - prev.y, cur.x - prev.x);
    const a2 = Math.atan2(next.y - cur.y, next.x - cur.x);
    const turnDeg = normalizeDeg(((a2 - a1) * 180) / Math.PI);
    if (Math.abs(turnDeg) < 0.5) continue; // praktisk talt rett frem
    bends.push({ x: cur.x, y: cur.y, angleDeg: Math.round(Math.abs(turnDeg)) });
  }
  return bends;
}

/**
 * Klassifiserer en målt bend-vinkel mot standardsettet (15/30/45/60/90) for
 * visning/telling i mengdelisten. Brukes uavhengig av materialets
 * Shift-snap-begrensning, siden frihåndstegnede bend bare måles geometrisk.
 */
export function classifyBendAngle(rawDeg: number): number {
  let best = rawDeg;
  let bestDiff = Infinity;
  for (const a of [15, 30, 45, 60, 90]) {
    const diff = Math.abs(rawDeg - a);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = a;
    }
  }
  return bestDiff <= 7 ? best : Math.round(rawDeg);
}

/** Snapper en rå turn-vinkel (grader) til nærmeste tillatte vinkel (inkl. 0 = rett frem og begge svingretninger). */
export function snapTurnAngleDeg(rawTurnDeg: number, allowedDeg: number[]): number {
  const candidates = [0, ...allowedDeg, ...allowedDeg.map((d) => -d)];
  let best = 0;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const diff = Math.abs(normalizeDeg(rawTurnDeg - c));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

/** Snapper det aller første segmentet i en ny polylinje (ingen forrige segment å måle
 * turn-vinkel mot) til nærmeste 45°-multiplum i absolutt retning, slik at man kan
 * holde Shift for å tegne en rett (vannrett/loddrett/45°) linje fra tegnestart. */
export function snapFirstPoint(
  start: { x: number; y: number },
  raw: { x: number; y: number },
): { x: number; y: number } {
  const dist = distance(start.x, start.y, raw.x, raw.y);
  if (dist < 0.0001) return raw;
  const rawAngle = (Math.atan2(raw.y - start.y, raw.x - start.x) * 180) / Math.PI;
  const snappedAngle = Math.round(rawAngle / 45) * 45;
  const rad = (snappedAngle * Math.PI) / 180;
  return { x: start.x + dist * Math.cos(rad), y: start.y + dist * Math.sin(rad) };
}

export interface ClosestPointResult {
  x: number;
  y: number;
  distance: number;
  segIndex: number;
  angleDeg: number;
}

/** Finner nærmeste punkt på en polylinje til et gitt punkt, inkl. avstand, hvilket
 * segment det ligger på og segmentets retning (grader) – brukes til å snappe nye
 * linjer/utstyr inn på et allerede tegnet rør/kanal. */
export function closestPointOnPolyline(
  points: number[],
  p: { x: number; y: number },
): ClosestPointResult | null {
  let best: ClosestPointResult | null = null;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const x0 = points[i];
    const y0 = points[i + 1];
    const x1 = points[i + 2];
    const y1 = points[i + 3];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((p.x - x0) * dx + (p.y - y0) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    const d = distance(p.x, p.y, x, y);
    if (!best || d < best.distance) {
      best = { x, y, distance: d, segIndex: i / 2, angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI };
    }
  }
  return best;
}

/**
 * Beregner et snappet punkt for neste segment i en polylinje under tegning,
 * slik at turn-vinkelen fra forrige segment låses til nærmeste tillatte
 * bend-vinkel. Avstanden fra forrige knekkpunkt bevares.
 */
export function snapNextPoint(
  points: number[],
  raw: { x: number; y: number },
  allowedTurnsDeg: number[],
): { x: number; y: number } {
  const n = points.length;
  if (n < 4) return raw; // ingen forrige segment å måle vinkel mot

  const prev = { x: points[n - 4], y: points[n - 3] };
  const cur = { x: points[n - 2], y: points[n - 1] };
  const prevAngle = Math.atan2(cur.y - prev.y, cur.x - prev.x);
  const rawAngle = Math.atan2(raw.y - cur.y, raw.x - cur.x);
  const turnDeg = normalizeDeg(((rawAngle - prevAngle) * 180) / Math.PI);
  const snappedTurnDeg = snapTurnAngleDeg(turnDeg, allowedTurnsDeg);
  const snappedAngle = prevAngle + (snappedTurnDeg * Math.PI) / 180;
  const dist = distance(cur.x, cur.y, raw.x, raw.y);
  return {
    x: cur.x + dist * Math.cos(snappedAngle),
    y: cur.y + dist * Math.sin(snappedAngle),
  };
}

// ── Sammenhengende kanal-strekninger («runs») ───────────────────────────────
//
// Hvert rett strekk lagres som sin egen 2-punkts LineEntity (à la Revit), men
// for at kanalens veggstreker skal se ut som ÉN sammenhengende kanal på
// tegningen (ikke separate biter med hakk ved hvert bend/overgang), grupperes
// tilstøtende segmenter av SAMME underkategori+materiale til én «run» her,
// utelukkende via delte endepunkt-koordinater. Kun rene topunkts-skjøter (der
// nøyaktig to segmenter møtes) kobles sammen – avgreiningspunkter (der tre+
// segmenter møtes) er bevisst utelatt, siden en avgreining alt har sitt eget
// T-/Y-symbol og ikke skal glattes ut.

/** Nøkkel for punkt-gruppering (avrundet for å tåle ørsmå flyttall-avvik). */
function pointKey(x: number, y: number): string {
  return `${Math.round(x * 100)}:${Math.round(y * 100)}`;
}

function lineEndpoints(l: LineEntity): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const n = l.points.length;
  return {
    start: { x: l.points[0], y: l.points[1] },
    end: { x: l.points[n - 2], y: l.points[n - 1] },
  };
}

/** Grupperer et sett med linjer (typisk alle kanaler på gjeldende side) til
 * sammenhengende strekninger for rendering – se forklaring over. */
export function groupDuctRuns(lines: LineEntity[]): LineEntity[][] {
  const pointMap = new Map<string, { lineId: string; end: 'start' | 'end' }[]>();
  const addToMap = (k: string, entry: { lineId: string; end: 'start' | 'end' }) => {
    const list = pointMap.get(k);
    if (list) list.push(entry);
    else pointMap.set(k, [entry]);
  };
  for (const l of lines) {
    const { start, end } = lineEndpoints(l);
    addToMap(pointKey(start.x, start.y), { lineId: l.id, end: 'start' });
    addToMap(pointKey(end.x, end.y), { lineId: l.id, end: 'end' });
  }
  const byId = new Map(lines.map((l) => [l.id, l]));

  function neighborAt(
    line: LineEntity,
    whichEnd: 'start' | 'end',
  ): { lineId: string; end: 'start' | 'end' } | null {
    const { start, end } = lineEndpoints(line);
    const p = whichEnd === 'start' ? start : end;
    const entries = pointMap.get(pointKey(p.x, p.y)) ?? [];
    if (entries.length !== 2) return null; // avgreining eller løs ende – ikke en ren skjøt
    const other = entries.find((e) => e.lineId !== line.id);
    if (!other) return null;
    const otherLine = byId.get(other.lineId);
    if (!otherLine || otherLine.subId !== line.subId || otherLine.material !== line.material) return null;
    return other;
  }

  const visited = new Set<string>();
  const runs: LineEntity[][] = [];

  for (const start of lines) {
    if (visited.has(start.id)) continue;
    const run: LineEntity[] = [start];
    visited.add(start.id);

    // Bakover fra startens "start"-ende
    let cur = start;
    let curEnd: 'start' | 'end' = 'start';
    for (;;) {
      const nb = neighborAt(cur, curEnd);
      if (!nb) break;
      const nextLine = byId.get(nb.lineId)!;
      if (visited.has(nextLine.id)) break; // unngå uendelig løkke ved en lukket sløyfe
      run.unshift(nextLine);
      visited.add(nextLine.id);
      cur = nextLine;
      curEnd = nb.end === 'start' ? 'end' : 'start';
    }

    // Forover fra startens "end"-ende
    cur = start;
    curEnd = 'end';
    for (;;) {
      const nb = neighborAt(cur, curEnd);
      if (!nb) break;
      const nextLine = byId.get(nb.lineId)!;
      if (visited.has(nextLine.id)) break;
      run.push(nextLine);
      visited.add(nextLine.id);
      cur = nextLine;
      curEnd = nb.end === 'start' ? 'end' : 'start';
    }

    runs.push(run);
  }
  return runs;
}

/** Flater en ordnet kjede av linjer til én sammenhengende punkt-liste (vertekser)
 * pluss dimensjonen for hvert segment mellom to verteksene. Selvkorrigerende: for
 * hver linje i kjeden brukes den enden som IKKE matcher forrige vertex, uavhengig
 * av hvordan groupDuctRuns ordnet/orienterte linjene. */
export function flattenDuctRun(run: LineEntity[]): { vertices: { x: number; y: number }[]; dims: string[] } {
  const first = lineEndpoints(run[0]);
  const vertices: { x: number; y: number }[] = [first.start, first.end];
  const dims: string[] = [run[0].dimension];
  for (let i = 1; i < run.length; i++) {
    const { start, end } = lineEndpoints(run[i]);
    const last = vertices[vertices.length - 1];
    const startMatches = Math.abs(start.x - last.x) < 0.5 && Math.abs(start.y - last.y) < 0.5;
    vertices.push(startMatches ? end : start);
    dims.push(run[i].dimension);
  }
  return { vertices, dims };
}

export interface DuctRunWalls {
  outer: number[];
  inner: number[];
  centerline: number[];
}

/** Finner skjæringspunktet mellom to uendelige linjer p1+t*d1 og p2+s*d2 (null hvis parallelle). */
export function lineIntersect(
  p1: { x: number; y: number },
  d1: { x: number; y: number },
  p2: { x: number; y: number },
  d2: { x: number; y: number },
): { x: number; y: number } | null {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

/** Bygger én av veggkonturene (ytre/indre/senterlinje, styrt av `sign`: +1/-1/0) for
 * en hel kanal-strekning – med en avrundet fillet ved bend og en rett innsnevring
 * (taper) ved dimensjonsendring, slik at streken blir sammenhengende uten hakk,
 * i stedet for at hvert segment tegnes med butte, uavhengige endepunkter. */
function buildOffsetPath(vertices: { x: number; y: number }[], halfWidths: number[], sign: number): number[] {
  const n = vertices.length;
  if (n < 2) return [];
  const dirOf = (i: number) => {
    const a = vertices[i];
    const b = vertices[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len, len };
  };
  const normalOf = (d: { x: number; y: number }) => ({ x: -d.y, y: d.x });
  const offset = (p: { x: number; y: number }, norm: { x: number; y: number }, amount: number) => ({
    x: p.x + norm.x * amount,
    y: p.y + norm.y * amount,
  });

  const out: number[] = [];
  const push = (p: { x: number; y: number }) => out.push(p.x, p.y);

  const dir0 = dirOf(0);
  push(offset(vertices[0], normalOf(dir0), halfWidths[0] * sign));

  for (let i = 1; i < n - 1; i++) {
    const dirIn = dirOf(i - 1);
    const dirOut = dirOf(i);
    const normIn = normalOf(dirIn);
    const normOut = normalOf(dirOut);
    const halfIn = halfWidths[i - 1];
    const halfOut = halfWidths[i];
    const v = vertices[i];

    const cross = dirIn.x * dirOut.y - dirIn.y * dirOut.x;
    const dot = dirIn.x * dirOut.x + dirIn.y * dirOut.y;
    const angleDiff = Math.atan2(Math.abs(cross), dot);
    const isBend = angleDiff > 0.02; // ~1°
    const widthChanged = Math.abs(halfIn - halfOut) > 0.01;

    if (!isBend && !widthChanged) {
      push(offset(v, normIn, halfIn * sign));
      continue;
    }

    const filletRadius = Math.max(halfIn, halfOut) * 1.2;
    const taperHalfLen = Math.max(halfIn, halfOut) * 1.5;
    const reach = isBend ? filletRadius : taperHalfLen;
    const clipIn = Math.min(reach, dirIn.len * 0.4);
    const clipOut = Math.min(reach, dirOut.len * 0.4);

    const pIn = { x: v.x - dirIn.x * clipIn, y: v.y - dirIn.y * clipIn };
    const pOut = { x: v.x + dirOut.x * clipOut, y: v.y + dirOut.y * clipOut };
    const offIn = offset(pIn, normIn, halfIn * sign);
    const offOut = offset(pOut, normOut, halfOut * sign);

    push(offIn);
    if (isBend) {
      const ctrl = lineIntersect(offIn, dirIn, offOut, dirOut) ?? offset(v, normIn, halfIn * sign);
      const steps = 8;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const x = (1 - t) * (1 - t) * offIn.x + 2 * (1 - t) * t * ctrl.x + t * t * offOut.x;
        const y = (1 - t) * (1 - t) * offIn.y + 2 * (1 - t) * t * ctrl.y + t * t * offOut.y;
        out.push(x, y);
      }
    }
    push(offOut);
  }

  const dirLast = dirOf(n - 2);
  push(offset(vertices[n - 1], normalOf(dirLast), halfWidths[n - 2] * sign));

  return out;
}

/** Bygger de tre konturene (ytre vegg / indre vegg / senterlinje) for én hel
 * kanal-strekning, gitt verteksene og pikselbredden (halv diameter) for hvert
 * segment mellom dem. */
export function buildDuctRunWalls(vertices: { x: number; y: number }[], halfWidths: number[]): DuctRunWalls {
  return {
    outer: buildOffsetPath(vertices, halfWidths, 1),
    inner: buildOffsetPath(vertices, halfWidths, -1),
    centerline: buildOffsetPath(vertices, halfWidths, 0),
  };
}

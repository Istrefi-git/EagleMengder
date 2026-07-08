// Geometriske hjelpefunksjoner – alt i bildets pikselrom

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

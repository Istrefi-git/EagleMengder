// Delt treff-toleranse og nærmeste-linje-søk for rør/kanal.
//
// Formelen under ble tidligere utledet på nytt et halvt dusin steder i
// PdfCanvas.tsx (avgreining, fortsettelse, klammer-plassering, tag-plassering,
// Del-verktøyet, Trim/Forleng). Én kopi her betyr at alle disse funksjonene
// alltid er enige om hva «nær nok» betyr, uansett zoomnivå.

import { categoryOf } from '../types';
import type { LineEntity } from '../types';
import { closestPointOnPolyline, distance } from './geometry';
import { dimensionDiameterMm } from './dimension';
import { mmToPx } from './scale';

/** Fast 16 skjermpiksler (16 * invScale), eller rørets/kanalens egen fysiske
 * halvbredde i bildepiksler ved gjeldende målestokk – den STØRSTE av de to. Tykke
 * kanaler får dermed en treffsone som følger deres faktiske bredde, mens tynne rør
 * fortsatt er lette å treffe uansett zoom. */
export function lineHitTolerance(dimension: string, mpp: number | null, invScale: number): number {
  return Math.max(mmToPx(dimensionDiameterMm(dimension), mpp), 16 * invScale);
}

export interface NearestLineHit {
  line: LineEntity;
  x: number;
  y: number;
  distance: number;
  angleDeg: number;
}

/** Nærmeste linje (valgfritt begrenset til `kind`) innenfor toleranse, blant en
 * FERDIG FILTRERT kandidatliste – kalleren avgjør selv hvilke linjer som er
 * aktuelle (typisk «denne siden»), slik at f.eks. `connectLandedEndpoints` kan
 * ekskludere linjer som nettopp ble flyttet/kopiert (ellers avgreiner en
 * strekning på sin egen nabo). */
export function findNearestLine(
  candidates: LineEntity[],
  point: { x: number; y: number },
  mpp: number | null,
  invScale: number,
  kind?: 'pipe' | 'duct',
): NearestLineHit | null {
  let best: NearestLineHit | null = null;
  for (const line of candidates) {
    if (kind && categoryOf(line.subId)?.kind !== kind) continue;
    const cp = closestPointOnPolyline(line.points, point);
    if (!cp) continue;
    const tol = lineHitTolerance(line.dimension, mpp, invScale);
    if (cp.distance <= tol && (!best || cp.distance < best.distance)) {
      best = { line, x: cp.x, y: cp.y, distance: cp.distance, angleDeg: cp.angleDeg };
    }
  }
  return best;
}

/** Ligger (x,y) innenfor `tol` av linjens eget start- eller sluttpunkt? Brukes til å
 * avgjøre om et treff er en fortsettelse/skjøt (på et endepunkt) eller en
 * avgreining (midt på kroppen). */
export function endpointHitOf(line: LineEntity, x: number, y: number, tol: number): 'start' | 'end' | null {
  const n = line.points.length;
  if (distance(x, y, line.points[0], line.points[1]) <= tol) return 'start';
  if (distance(x, y, line.points[n - 2], line.points[n - 1]) <= tol) return 'end';
  return null;
}

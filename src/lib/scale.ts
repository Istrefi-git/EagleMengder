// Målestokk-matematikk og lengdeformatering.
//
// PDF-siden rendres til en canvas med en gitt RENDER_SCALE. Ett PDF-punkt (pt)
// er 1/72 tomme = 0,352778 mm på papiret. Etter rendering gjelder:
//   1 piksel = (1 / RENDER_SCALE) pt = (0,352778 / RENDER_SCALE) mm papir
// Ved målestokk 1:S blir reell lengde = papirlengde * S.

import type { ScaleState } from '../types';

export const RENDER_SCALE = 2;

const MM_PER_POINT = 25.4 / 72; // 0,352777...
const M_PER_POINT = MM_PER_POINT / 1000;

/** Reelle meter per piksel for en manuell målestokk 1:denominator. */
export function metersPerPixelFromScale(denominator: number): number {
  return (M_PER_POINT * denominator) / RENDER_SCALE;
}

/** Lager ScaleState fra en manuell 1:S-angivelse. */
export function manualScale(denominator: number): ScaleState {
  return {
    metersPerPixel: metersPerPixelFromScale(denominator),
    label: `1:${denominator}`,
    source: 'manual',
  };
}

/**
 * Kalibrering: bruker har klikket to punkter (pikselavstand) og oppgitt reell
 * avstand i millimeter.
 */
export function calibratedScale(pixelDistance: number, realMm: number): ScaleState {
  const metersPerPixel = realMm / 1000 / pixelDistance;
  return {
    metersPerPixel,
    label: 'Kalibrert',
    source: 'calibrated',
  };
}

const numberFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });

/** Formaterer en pikselavstand som millimeter med tusenskille. */
export function formatLengthMm(pixels: number, metersPerPixel: number | null): string {
  if (metersPerPixel == null) return '– mm';
  const mm = pixels * metersPerPixel * 1000;
  return `${numberFormat.format(mm)} mm`;
}

/** Returnerer ren mm-verdi (tall) for en pikselavstand. */
export function lengthMm(pixels: number, metersPerPixel: number | null): number {
  if (metersPerPixel == null) return 0;
  return pixels * metersPerPixel * 1000;
}

/** Konverterer en reell millimeter-avstand til piksler i PDF-bildets koordinatrom
 * (samme rom som målestokk gjelder for, slik at rørtykkelse skaleres riktig med zoom). */
export function mmToPx(mm: number, metersPerPixel: number | null): number {
  if (!metersPerPixel) return 0;
  return mm / 1000 / metersPerPixel;
}

/** Formaterer et rått mm-tall. */
export function formatMm(mm: number): string {
  return `${numberFormat.format(mm)} mm`;
}

const areaFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** Formaterer et pikselareal (f.eks. fra polygonArea) som m². */
export function formatAreaM2(pixelArea: number, metersPerPixel: number | null): string {
  if (metersPerPixel == null) return '– m²';
  const m2 = pixelArea * metersPerPixel * metersPerPixel;
  return `${areaFormat.format(m2)} m²`;
}

// Syntetiske test-PDF-er for å VERIFISERE at PDF-analysen er korrekt.
//
// Kun for utvikling. Fila nås utelukkende via en dynamisk import bak
// `import.meta.env.DEV` (se PdfAnalysisDialog), slik at Rollup fjerner den fra
// produksjonsbygget. Samme mønster som dev-hooken i src/main.tsx.
//
// Hvorfor håndskrevet PDF i stedet for et bibliotek: vi trenger en fil der
// HVERT eneste tall er kjent på forhånd, slik at forventningene under kan
// utledes for hånd. Da beviser en bestått test at CTM-stakken, markør-
// aritmetikken i constructPath og koordinatavbildningen faktisk stemmer –
// ikke bare at koden kjører uten å kaste.
//
// Fila holdes bevisst REN ASCII, slik at `string.length === byteLength` og
// xref-offsetene blir trivielt korrekte. Norske tegn skrives som oktale
// escapes i PDF-strenger (/WinAnsiEncoding), f.eks. `\262` = «²». Det tester
// samtidig tekstdekodingen som romnavn-uttrekket senere avhenger av.

export type SyntheticVariant = 'sparse' | 'dense' | 'raster' | 'mixed';

/** 250 vannrette streker – nok til å passere LINEWORK_FLOOR. */
const DENSE_LINE_COUNT = 250;

function denseLines(): string {
  const out: string[] = [];
  for (let i = 0; i < DENSE_LINE_COUNT; i++) {
    const y = 20 + i * 3;
    out.push(`50 ${y} m 550 ${y} l S`);
  }
  return out.join('\n');
}

/** Tekstblokken som gjenbrukes av alle varianter. */
const TEXT_BLOCK = [
  'BT /F1 12 Tf 150 660 Td (101) Tj ET',
  'BT /F1 12 Tf 150 640 Td (KONTOR) Tj ET',
  'BT /F1 10 Tf 150 620 Td (14,2 m\\262) Tj ET',
  'BT /F1 10 Tf 400 100 Td (M\\305LESTOKK 1:100) Tj ET',
].join('\n');

/** Geometrien med eksakt kjente koordinater – grunnlaget for assertene. */
const SPARSE_GEOMETRY = [
  '1 w',
  '100 600 200 150 re S', // rektangel -> 4 kanter
  '100 500 m 300 500 l 300 400 l S', // polylinje -> 2 segmenter
  '350 600 m 500 600 l S', // enkeltsegment
  '100 300 m 150 380 250 380 300 300 c S', // Bezier -> kun telt
].join('\n');

/** Helsidedekkende 2x2 inline-bilde, ASCIIHex slik at fila forblir ASCII. */
const FULL_PAGE_IMAGE = [
  'q 595 0 0 842 0 0 cm',
  'BI /W 2 /H 2 /CS /RGB /BPC 8 /F /AHx ID ff000000ff000000ffffffff> EI',
  'Q',
].join('\n');

function contentFor(variant: SyntheticVariant): string {
  switch (variant) {
    case 'sparse':
      return `${SPARSE_GEOMETRY}\n${TEXT_BLOCK}\n`;
    case 'dense':
      return `${SPARSE_GEOMETRY}\n${denseLines()}\n${TEXT_BLOCK}\n`;
    case 'raster':
      return `${FULL_PAGE_IMAGE}\n${TEXT_BLOCK}\n`;
    case 'mixed':
      return `${FULL_PAGE_IMAGE}\n${SPARSE_GEOMETRY}\n${denseLines()}\n${TEXT_BLOCK}\n`;
  }
}

/**
 * Bygger en komplett, gyldig én-sides PDF med korrekt xref-tabell.
 *
 * Offsetene beregnes fra en løpende byte-teller mens objektene settes sammen,
 * i stedet for å gjettes – det er hele grunnen til ASCII-begrensningen.
 */
export function buildSyntheticPdf(variant: SyntheticVariant): Uint8Array {
  const content = contentFor(variant);

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 5 0 R >> /ProcSet [/PDF /Text /ImageC] >> ' +
      '/Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  const size = objects.length + 1;

  // Hver xref-oppføring MÅ være nøyaktig 20 byte: 10 siffer, mellomrom,
  // 5 siffer, mellomrom, type, mellomrom, linjeskift.
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }

  pdf += xref;
  pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  // Ren ASCII inn, så TextEncoder gir 1 byte per tegn og offsetene stemmer.
  return new TextEncoder().encode(pdf);
}

// ── Forventede verdier ──────────────────────────────────────────────────
//
// Utledet for hånd fra innholdsstrømmen over og viewport-matrisen ved
// RENDER_SCALE = 2 for en 595x842-side:
//
//   viewport.transform = [2, 0, 0, -2, 0, 1684]
//   =>  x' = 2x        y' = 1684 - 2y
//
// Eksempel, rektangelets nedre venstre hjørne (100, 600):
//   x' = 200,  y' = 1684 - 1200 = 484

export interface SyntheticExpectation {
  label: string;
  /** Undefined = ikke assertert for denne varianten. */
  contentType?: 'vector' | 'raster' | 'mixed' | 'empty';
  widthPx?: number;
  heightPx?: number;
  subpaths?: number;
  segments?: number;
  lineSegments?: number;
  rectangles?: number;
  rectEdgeSegments?: number;
  curves?: number;
  strokedPaths?: number;
  clipPaths?: number;
  imageCount?: number;
  minLargestCoverage?: number;
  /** Eksakte segmenter, i pdf.js sin emitteringsrekkefølge. */
  segmentCoords?: [number, number, number, number][];
  /** Tekst som må finnes, med eksakt posisjon i bilde-pikselrom. */
  textAt?: { text: string; x: number; y: number; fontSizePx: number }[];
  /** Tekst som må finnes ordrett – beviser WinAnsi-dekoding. */
  textContains?: string[];
}

export const SYNTHETIC_EXPECTATIONS: Record<SyntheticVariant, SyntheticExpectation> = {
  sparse: {
    label: 'Sparse – eksakt geometri og koordinater',
    // 7 segmenter + 1 kurve = 8 primitiver, altså under DECOR_FLOOR (20).
    // At dette gir «tom» er RIKTIG og med vilje: en side med 8 primitiver er
    // dekorasjon, ikke en plantegning. Terskelen dokumenteres av denne asserten.
    contentType: 'empty',
    widthPx: 1190,
    heightPx: 1684,
    subpaths: 4,
    segments: 7,
    lineSegments: 3,
    rectangles: 1,
    rectEdgeSegments: 4,
    curves: 1,
    strokedPaths: 4,
    clipPaths: 0,
    imageCount: 0,
    segmentCoords: [
      // Rektangelkanter, i pdf.js sin rekkefølge
      [200, 484, 600, 484],
      [600, 484, 600, 184],
      [600, 184, 200, 184],
      [200, 184, 200, 484],
      // Polylinje
      [200, 684, 600, 684],
      [600, 684, 600, 884],
      // Enkeltsegment
      [700, 484, 1000, 484],
    ],
    textAt: [{ text: '101', x: 300, y: 364, fontSizePx: 24 }],
    textContains: ['14,2 m²', 'MÅLESTOKK 1:100'],
  },

  dense: {
    label: 'Dense – nok linjeverk til a klassifiseres som vektor',
    contentType: 'vector',
    rectangles: 1,
    curves: 1,
    imageCount: 0,
    // 4 rektangelkanter + 2 + 1 + 250 tette linjer
    segments: 257,
    subpaths: 254,
    strokedPaths: 254,
  },

  raster: {
    label: 'Raster – helsidedekkende bilde uten linjeverk',
    contentType: 'raster',
    imageCount: 1,
    minLargestCoverage: 0.99,
    segments: 0,
  },

  mixed: {
    label: 'Mixed – helsidebilde OG tett vektorlinjeverk',
    contentType: 'mixed',
    imageCount: 1,
    minLargestCoverage: 0.99,
    segments: 257,
  },
};

export const SYNTHETIC_VARIANTS: SyntheticVariant[] = ['sparse', 'dense', 'raster', 'mixed'];
